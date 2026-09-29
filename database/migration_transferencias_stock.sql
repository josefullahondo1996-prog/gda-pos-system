-- Transferencias atómicas de existencias entre ubicaciones.
-- No cambia productos.stock_actual: el movimiento conserva el total global.
CREATE TABLE IF NOT EXISTS public.transferencias_stock (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  origen_ubicacion_id uuid NOT NULL,
  destino_ubicacion_id uuid NOT NULL,
  usuario_id text,
  items jsonb NOT NULL CHECK (jsonb_typeof(items) = 'array'),
  notas text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT transferencias_stock_ubicaciones_distintas
    CHECK (origen_ubicacion_id <> destino_ubicacion_id)
);

CREATE INDEX IF NOT EXISTS transferencias_stock_empresa_fecha_idx
  ON public.transferencias_stock (empresa_id, created_at DESC);

ALTER TABLE public.transferencias_stock ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS transferencias_stock_ver_empresa ON public.transferencias_stock;
CREATE POLICY transferencias_stock_ver_empresa
  ON public.transferencias_stock
  FOR SELECT TO authenticated
  USING (
    empresa_id IN (
      SELECT u.empresa_id
      FROM public.usuarios AS u
      WHERE u.auth_user_id = auth.uid()
        AND u.activo = true
        AND u.permitir_acceso = true
        AND (
          COALESCE(u.todas_localizaciones, false) = true
          OR u.ubicacion_id = transferencias_stock.origen_ubicacion_id
          OR u.ubicacion_id = transferencias_stock.destino_ubicacion_id
        )
    )
  );

GRANT SELECT ON public.transferencias_stock TO authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.transferencias_stock FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.transferir_stock(
  p_origen_ubicacion_id uuid,
  p_destino_ubicacion_id uuid,
  p_items jsonb,
  p_notas text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $$
DECLARE
  v_user_id text;
  v_empresa_id uuid;
  v_rol_id text;
  v_todas_localizaciones boolean;
  v_ubicacion_usuario_id uuid;
  v_permisos jsonb;
  v_nombre_rol text;
  v_transferencia_id uuid;
  v_item jsonb;
  v_producto_id integer;
  v_cantidad numeric;
  v_stock_origen numeric;
  v_stock_destino numeric;
  v_fila_origen uuid;
  v_fila_destino uuid;
  v_nombre_producto text;
  v_items_registrados jsonb := '[]'::jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Debes iniciar sesión para transferir existencias';
  END IF;

  SELECT u.id::text, u.empresa_id, u.rol_id::text, u.todas_localizaciones, u.ubicacion_id
    INTO v_user_id, v_empresa_id, v_rol_id, v_todas_localizaciones, v_ubicacion_usuario_id
  FROM public.usuarios AS u
  WHERE u.auth_user_id = auth.uid()
    AND u.activo = true
    AND u.permitir_acceso = true
  ORDER BY u.id
  LIMIT 1;

  IF v_user_id IS NULL OR v_empresa_id IS NULL THEN
    RAISE EXCEPTION 'No se encontró un usuario activo asociado a esta empresa';
  END IF;

  SELECT r.nombre, r.permisos INTO v_nombre_rol, v_permisos
  FROM public.roles AS r
  WHERE r.id::text = v_rol_id;

  IF COALESCE(v_nombre_rol, '') NOT ILIKE '%admin%'
     AND v_permisos IS NOT NULL
     AND COALESCE(v_permisos #>> '{productos,Transferir stock}', 'false') <> 'true' THEN
    RAISE EXCEPTION 'Tu rol no tiene permiso para transferir existencias';
  END IF;

  IF p_origen_ubicacion_id IS NULL OR p_destino_ubicacion_id IS NULL
     OR p_origen_ubicacion_id = p_destino_ubicacion_id THEN
    RAISE EXCEPTION 'Selecciona dos ubicaciones diferentes';
  END IF;

  IF NOT EXISTS (
      SELECT 1 FROM public.ubicaciones_comerciales AS l
      WHERE l.id = p_origen_ubicacion_id AND l.empresa_id = v_empresa_id AND l.activo = true
    ) OR NOT EXISTS (
      SELECT 1 FROM public.ubicaciones_comerciales AS l
      WHERE l.id = p_destino_ubicacion_id AND l.empresa_id = v_empresa_id AND l.activo = true
    ) THEN
    RAISE EXCEPTION 'Una de las ubicaciones no está activa o no pertenece a tu empresa';
  END IF;

  IF NOT COALESCE(v_todas_localizaciones, false)
     AND (p_origen_ubicacion_id <> v_ubicacion_usuario_id OR p_destino_ubicacion_id <> v_ubicacion_usuario_id) THEN
    RAISE EXCEPTION 'Tu usuario no tiene acceso a ambas ubicaciones';
  END IF;

  IF p_items IS NULL OR jsonb_typeof(p_items) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Agrega al menos un producto a la transferencia';
  END IF;
  IF jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'Agrega al menos un producto a la transferencia';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_items) AS item(value)
    GROUP BY NULLIF(item.value->>'producto_id', '')
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Cada producto debe aparecer una sola vez en la transferencia';
  END IF;

  -- El bloqueo del producto serializa transferencias con ventas y compras,
  -- cuyas RPC también bloquean la fila de productos antes de tocar sus sucursales.
  FOR v_item IN
    SELECT value
    FROM jsonb_array_elements(p_items)
    ORDER BY NULLIF(value->>'producto_id', '')::integer
  LOOP
    v_producto_id := NULLIF(v_item->>'producto_id', '')::integer;
    v_cantidad := COALESCE(NULLIF(v_item->>'cantidad', '')::numeric, 0);

    IF v_producto_id IS NULL OR v_cantidad <= 0
       OR v_cantidad::text IN ('NaN', 'Infinity', '-Infinity') THEN
      RAISE EXCEPTION 'Producto o cantidad inválida en la transferencia';
    END IF;

    SELECT p.nombre INTO v_nombre_producto
    FROM public.productos AS p
    WHERE p.id = v_producto_id
      AND p.empresa_id = v_empresa_id
      AND COALESCE(p.activo, true) = true
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'El producto % no está activo o no pertenece a tu empresa', v_producto_id;
    END IF;

    SELECT s.id, s.cantidad INTO v_fila_origen, v_stock_origen
    FROM public.producto_stock_ubicacion AS s
    WHERE s.empresa_id = v_empresa_id
      AND s.producto_id = v_producto_id
      AND s.ubicacion_id = p_origen_ubicacion_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'El producto "%" no tiene saldo registrado en la ubicación de origen', v_nombre_producto;
    END IF;

    IF COALESCE(v_stock_origen, 0) < v_cantidad THEN
      RAISE EXCEPTION 'Stock insuficiente de "%": disponible %, solicitado %', v_nombre_producto, COALESCE(v_stock_origen, 0), v_cantidad;
    END IF;

    UPDATE public.producto_stock_ubicacion
      SET cantidad = v_stock_origen - v_cantidad, actualizado_en = now()
    WHERE id = v_fila_origen;

    SELECT s.id, s.cantidad INTO v_fila_destino, v_stock_destino
    FROM public.producto_stock_ubicacion AS s
    WHERE s.empresa_id = v_empresa_id
      AND s.producto_id = v_producto_id
      AND s.ubicacion_id = p_destino_ubicacion_id
    FOR UPDATE;

    IF FOUND THEN
      UPDATE public.producto_stock_ubicacion
        SET cantidad = COALESCE(v_stock_destino, 0) + v_cantidad, actualizado_en = now()
      WHERE id = v_fila_destino;
    ELSE
      INSERT INTO public.producto_stock_ubicacion
        (empresa_id, producto_id, ubicacion_id, cantidad, actualizado_en)
      VALUES
        (v_empresa_id, v_producto_id, p_destino_ubicacion_id, v_cantidad, now());
    END IF;

    v_items_registrados := v_items_registrados || jsonb_build_array(
      jsonb_build_object(
        'producto_id', v_producto_id,
        'nombre', v_nombre_producto,
        'cantidad', v_cantidad
      )
    );
  END LOOP;

  INSERT INTO public.transferencias_stock
    (empresa_id, origen_ubicacion_id, destino_ubicacion_id, usuario_id, items, notas)
  VALUES
    (v_empresa_id, p_origen_ubicacion_id, p_destino_ubicacion_id, v_user_id, v_items_registrados, NULLIF(btrim(p_notas), ''))
  RETURNING id INTO v_transferencia_id;

  RETURN v_transferencia_id;
END;
$$;

REVOKE ALL ON FUNCTION public.transferir_stock(uuid, uuid, jsonb, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.transferir_stock(uuid, uuid, jsonb, text) TO authenticated;
