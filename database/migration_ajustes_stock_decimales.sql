-- Habilita conteos fraccionarios sin cambiar la actualización atómica del stock por sucursal y global.
CREATE OR REPLACE FUNCTION public.ajustar_stock(
  p_ubicacion_id uuid,
  p_items jsonb,
  p_motivo text
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
  v_ajuste_id uuid;
  v_item jsonb;
  v_producto_id integer;
  v_stock_nuevo numeric;
  v_stock_anterior numeric;
  v_stock_global numeric;
  v_diferencia numeric;
  v_fila_stock uuid;
  v_nombre_producto text;
  v_items_registrados jsonb := '[]'::jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Debes iniciar sesión para ajustar existencias';
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
     AND COALESCE(v_permisos #>> '{productos,Ajustar stock}', 'false') <> 'true' THEN
    RAISE EXCEPTION 'Tu rol no tiene permiso para ajustar existencias';
  END IF;

  IF p_ubicacion_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.ubicaciones_comerciales AS l
    WHERE l.id = p_ubicacion_id AND l.empresa_id = v_empresa_id AND l.activo = true
  ) THEN
    RAISE EXCEPTION 'Selecciona una ubicación activa de tu empresa';
  END IF;

  IF NOT COALESCE(v_todas_localizaciones, false) AND p_ubicacion_id <> v_ubicacion_usuario_id THEN
    RAISE EXCEPTION 'Tu usuario no tiene acceso a esta ubicación';
  END IF;

  IF p_motivo IS NULL OR length(btrim(p_motivo)) < 3 OR length(p_motivo) > 500 THEN
    RAISE EXCEPTION 'Especifica un motivo de entre 3 y 500 caracteres';
  END IF;
  IF p_items IS NULL OR jsonb_typeof(p_items) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Agrega al menos un producto al ajuste';
  END IF;
  IF jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'Agrega al menos un producto al ajuste';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_items) AS item(value)
    GROUP BY NULLIF(item.value->>'producto_id', '')
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Cada producto debe aparecer una sola vez en el ajuste';
  END IF;

  FOR v_item IN
    SELECT value
    FROM jsonb_array_elements(p_items)
    ORDER BY NULLIF(value->>'producto_id', '')::integer
  LOOP
    v_producto_id := NULLIF(v_item->>'producto_id', '')::integer;
    v_stock_nuevo := COALESCE(NULLIF(v_item->>'stock_nuevo', '')::numeric, -1);

    IF v_producto_id IS NULL OR v_stock_nuevo < 0
       OR v_stock_nuevo::text IN ('NaN', 'Infinity', '-Infinity') THEN
      RAISE EXCEPTION 'Producto o cantidad contada inválida';
    END IF;
    -- Las cantidades son numeric: se permiten fracciones para peso, longitud y otras unidades.

    SELECT p.nombre, p.stock_actual
      INTO v_nombre_producto, v_stock_global
    FROM public.productos AS p
    WHERE p.id = v_producto_id
      AND p.empresa_id = v_empresa_id
      AND COALESCE(p.activo, true) = true
      AND COALESCE(p.administra_stock, true) = true
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'El producto % no está activo, no pertenece a tu empresa o no controla stock', v_producto_id;
    END IF;

    SELECT s.id, s.cantidad
      INTO v_fila_stock, v_stock_anterior
    FROM public.producto_stock_ubicacion AS s
    WHERE s.empresa_id = v_empresa_id
      AND s.producto_id = v_producto_id
      AND s.ubicacion_id = p_ubicacion_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'El producto "%" no tiene saldo inicial en esta sucursal; registra primero su apertura de stock', v_nombre_producto;
    END IF;

    IF v_stock_anterior IS NULL OR v_stock_global IS NULL
       OR v_stock_anterior::text IN ('NaN', 'Infinity', '-Infinity')
       OR v_stock_global::text IN ('NaN', 'Infinity', '-Infinity') THEN
      RAISE EXCEPTION 'El stock de "%" no es válido; revisa ese producto antes de ajustarlo', v_nombre_producto;
    END IF;

    v_diferencia := v_stock_nuevo - v_stock_anterior;
    IF v_stock_global + v_diferencia < 0 THEN
      RAISE EXCEPTION 'El ajuste de "%" dejaría el stock global por debajo de cero', v_nombre_producto;
    END IF;

    UPDATE public.producto_stock_ubicacion
      SET cantidad = v_stock_nuevo, actualizado_en = now()
    WHERE id = v_fila_stock;

    UPDATE public.productos
      SET stock_actual = v_stock_global + v_diferencia
    WHERE id = v_producto_id AND empresa_id = v_empresa_id;

    v_items_registrados := v_items_registrados || jsonb_build_array(
      jsonb_build_object(
        'producto_id', v_producto_id,
        'nombre', v_nombre_producto,
        'stock_anterior', v_stock_anterior,
        'stock_nuevo', v_stock_nuevo,
        'diferencia', v_diferencia
      )
    );
  END LOOP;

  INSERT INTO public.ajustes_stock (empresa_id, ubicacion_id, usuario_id, motivo, items)
  VALUES (v_empresa_id, p_ubicacion_id, v_user_id, btrim(p_motivo), v_items_registrados)
  RETURNING id INTO v_ajuste_id;

  RETURN v_ajuste_id;
END;
$$;

REVOKE ALL ON FUNCTION public.ajustar_stock(uuid, jsonb, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ajustar_stock(uuid, jsonb, text) TO authenticated;

