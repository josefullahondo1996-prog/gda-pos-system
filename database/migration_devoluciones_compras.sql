-- Documentos de devolución de compra con rebaja atómica de stock.
-- Cada línea debe corresponder a un detalle de la compra original; el total
-- queda como crédito a favor con el proveedor y no altera caja/pagos.
CREATE TABLE IF NOT EXISTS public.devoluciones_compras (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  empresa_id uuid NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  compra_id integer NOT NULL REFERENCES public.compras(id),
  proveedor_nombre text NOT NULL,
  referencia text NOT NULL,
  motivo text NOT NULL,
  fecha timestamptz NOT NULL DEFAULT now(),
  total numeric(14,2) NOT NULL CHECK (total >= 0),
  credito_proveedor numeric(14,2) NOT NULL CHECK (credito_proveedor >= 0),
  creado_por uuid,
  creado_en timestamptz NOT NULL DEFAULT now(),
  UNIQUE (empresa_id, referencia)
);

CREATE TABLE IF NOT EXISTS public.detalle_devoluciones_compras (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  empresa_id uuid NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  devolucion_id bigint NOT NULL REFERENCES public.devoluciones_compras(id) ON DELETE CASCADE,
  compra_detalle_id integer NOT NULL REFERENCES public.detalle_compras(id),
  producto_id integer,
  nombre_producto text NOT NULL,
  cantidad numeric(14,3) NOT NULL CHECK (cantidad > 0),
  costo_unitario numeric(14,2) NOT NULL CHECK (costo_unitario >= 0),
  subtotal numeric(14,2) NOT NULL CHECK (subtotal >= 0)
);

CREATE INDEX IF NOT EXISTS devoluciones_compras_empresa_fecha_idx
  ON public.devoluciones_compras (empresa_id, fecha DESC);
CREATE INDEX IF NOT EXISTS devoluciones_compras_compra_idx
  ON public.devoluciones_compras (empresa_id, compra_id);
CREATE INDEX IF NOT EXISTS detalle_devoluciones_compras_linea_idx
  ON public.detalle_devoluciones_compras (empresa_id, compra_detalle_id);

ALTER TABLE public.devoluciones_compras ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.detalle_devoluciones_compras ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS devoluciones_compras_select_empresa ON public.devoluciones_compras;
CREATE POLICY devoluciones_compras_select_empresa ON public.devoluciones_compras
  FOR SELECT TO authenticated USING (empresa_id = public.mi_empresa_id());
DROP POLICY IF EXISTS detalle_devoluciones_compras_select_empresa ON public.detalle_devoluciones_compras;
CREATE POLICY detalle_devoluciones_compras_select_empresa ON public.detalle_devoluciones_compras
  FOR SELECT TO authenticated USING (empresa_id = public.mi_empresa_id());

GRANT SELECT ON public.devoluciones_compras, public.detalle_devoluciones_compras TO authenticated;
REVOKE ALL ON public.devoluciones_compras, public.detalle_devoluciones_compras FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.devoluciones_compras, public.detalle_devoluciones_compras FROM authenticated;

CREATE OR REPLACE FUNCTION public.registrar_devolucion_compra(
  p_compra_id bigint,
  p_items jsonb,
  p_motivo text
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'auth'
AS $function$
DECLARE
  v_empresa_id uuid := public.mi_empresa_id();
  v_compra public.compras%ROWTYPE;
  v_item jsonb;
  v_detalle public.detalle_compras%ROWTYPE;
  v_producto public.productos%ROWTYPE;
  v_cantidad numeric;
  v_cantidad_devolvida numeric;
  v_subtotal numeric;
  v_total numeric := 0;
  v_referencia text;
  v_devolucion_id bigint;
  v_stock_ubicacion numeric;
  v_usuario_ubicacion uuid;
  v_usuario_todas boolean;
  v_saldo_nuevo numeric;
BEGIN
  IF auth.uid() IS NULL OR v_empresa_id IS NULL THEN
    RAISE EXCEPTION 'Se requiere un usuario autenticado con empresa';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.usuarios u
    WHERE u.auth_user_id = auth.uid() AND u.empresa_id = v_empresa_id
      AND u.activo = true AND u.permitir_acceso = true
  ) THEN RAISE EXCEPTION 'Usuario inactivo o sin permiso de acceso'; END IF;
  IF NOT public.tiene_permiso('compras', 'Agregar compra') AND NOT EXISTS (
    SELECT 1 FROM public.usuarios u JOIN public.roles r ON r.id = u.rol_id
    WHERE u.auth_user_id = auth.uid() AND u.empresa_id = v_empresa_id
      AND lower(r.nombre) LIKE '%admin%'
  ) THEN RAISE EXCEPTION 'Tu rol no tiene permiso para registrar devoluciones de compra'; END IF;
  IF p_motivo IS NULL OR length(btrim(p_motivo)) < 3 OR length(p_motivo) > 500 THEN
    RAISE EXCEPTION 'Especifica un motivo de entre 3 y 500 caracteres';
  END IF;
  IF p_items IS NULL OR jsonb_typeof(p_items) IS DISTINCT FROM 'array'
     OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'Agrega al menos un artículo de la compra';
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_items) AS x(value)
    GROUP BY NULLIF(x.value->>'compra_detalle_id', '') HAVING count(*) > 1
  ) THEN RAISE EXCEPTION 'No repitas líneas de la compra'; END IF;

  SELECT * INTO v_compra FROM public.compras
  WHERE id = p_compra_id AND empresa_id = v_empresa_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Compra no encontrada en esta empresa'; END IF;
  IF upper(btrim(COALESCE(v_compra.estado_compra, 'Recibido'))) <> 'RECIBIDO' THEN
    RAISE EXCEPTION 'Solo se pueden devolver productos de compras recibidas';
  END IF;
  SELECT u.ubicacion_id, COALESCE(u.todas_localizaciones, false)
    INTO v_usuario_ubicacion, v_usuario_todas
  FROM public.usuarios u
  WHERE u.auth_user_id = auth.uid() AND u.empresa_id = v_empresa_id
    AND u.activo = true AND u.permitir_acceso = true
  ORDER BY u.id LIMIT 1;
  IF v_compra.ubicacion_id IS NOT NULL AND NOT v_usuario_todas
     AND v_compra.ubicacion_id IS DISTINCT FROM v_usuario_ubicacion THEN
    RAISE EXCEPTION 'No tienes acceso a la sucursal de esta compra';
  END IF;

  -- Validar todo antes de crear el documento; cualquier error revierte también
  -- los cambios de inventario por estar dentro de la misma transacción SQL.
  FOR v_item IN SELECT value FROM jsonb_array_elements(p_items)
  LOOP
    SELECT * INTO v_detalle FROM public.detalle_compras
    WHERE id = NULLIF(v_item->>'compra_detalle_id', '')::integer
      AND compra_id = v_compra.id AND empresa_id = v_empresa_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Una línea no pertenece a la compra seleccionada'; END IF;
    v_cantidad := COALESCE(NULLIF(v_item->>'cantidad', '')::numeric, 0);
    IF v_cantidad <= 0 OR v_cantidad::text IN ('NaN','Infinity','-Infinity') THEN
      RAISE EXCEPTION 'La cantidad devuelta debe ser mayor que cero';
    END IF;
    IF v_detalle.producto_id IS NOT NULL AND v_cantidad <> trunc(v_cantidad) THEN
      RAISE EXCEPTION 'El stock global trabaja con unidades enteras para %', v_detalle.nombre_producto;
    END IF;
    SELECT COALESCE(sum(d.cantidad), 0) INTO v_cantidad_devolvida
    FROM public.detalle_devoluciones_compras d
    WHERE d.empresa_id = v_empresa_id AND d.compra_detalle_id = v_detalle.id;
    IF v_cantidad_devolvida + v_cantidad > v_detalle.cantidad THEN
      RAISE EXCEPTION 'La cantidad supera lo comprado disponible para devolver de %', v_detalle.nombre_producto;
    END IF;
    v_subtotal := round(v_cantidad * v_detalle.costo_unitario, 2);
    v_total := v_total + v_subtotal;
    IF v_detalle.producto_id IS NOT NULL THEN
      SELECT * INTO v_producto FROM public.productos
      WHERE id = v_detalle.producto_id AND empresa_id = v_empresa_id FOR UPDATE;
      IF NOT FOUND THEN RAISE EXCEPTION 'Producto original no encontrado'; END IF;
      IF COALESCE(v_producto.stock_actual, 0) < v_cantidad THEN
        RAISE EXCEPTION 'Stock global insuficiente para devolver % (disponible %, solicitado %)',
          v_detalle.nombre_producto, COALESCE(v_producto.stock_actual, 0), v_cantidad;
      END IF;
      IF v_compra.ubicacion_id IS NOT NULL THEN
        SELECT cantidad INTO v_stock_ubicacion FROM public.producto_stock_ubicacion
        WHERE empresa_id = v_empresa_id AND producto_id = v_detalle.producto_id
          AND ubicacion_id = v_compra.ubicacion_id FOR UPDATE;
        IF NOT FOUND OR COALESCE(v_stock_ubicacion, 0) < v_cantidad THEN
          RAISE EXCEPTION 'Stock insuficiente en la sucursal para devolver %', v_detalle.nombre_producto;
        END IF;
      END IF;
    END IF;
  END LOOP;

  v_referencia := 'DC-' || to_char(clock_timestamp(), 'YYYYMMDD-HH24MISS-MS') || '-' || substr(gen_random_uuid()::text, 1, 6);
  INSERT INTO public.devoluciones_compras
    (empresa_id, compra_id, proveedor_nombre, referencia, motivo, total, credito_proveedor, creado_por)
  VALUES
    (v_empresa_id, v_compra.id, COALESCE(v_compra.proveedor_nombre, 'Proveedor'), v_referencia,
     btrim(p_motivo), v_total, v_total, auth.uid())
  RETURNING id INTO v_devolucion_id;

  -- El retorno primero reduce la deuda de la factura original. Si supera el
  -- saldo pendiente, el excedente queda como crédito a favor del proveedor.
  v_saldo_nuevo := GREATEST(0, COALESCE(v_compra.saldo_pendiente, 0) - v_total);
  UPDATE public.compras
  SET saldo_pendiente = v_saldo_nuevo,
      estado = CASE WHEN v_saldo_nuevo = 0 THEN 'pagado' ELSE 'pendiente' END
  WHERE id = v_compra.id AND empresa_id = v_empresa_id;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_items)
  LOOP
    SELECT * INTO v_detalle FROM public.detalle_compras
    WHERE id = NULLIF(v_item->>'compra_detalle_id', '')::integer
      AND compra_id = v_compra.id AND empresa_id = v_empresa_id;
    v_cantidad := (v_item->>'cantidad')::numeric;
    v_subtotal := round(v_cantidad * v_detalle.costo_unitario, 2);
    INSERT INTO public.detalle_devoluciones_compras
      (empresa_id, devolucion_id, compra_detalle_id, producto_id, nombre_producto, cantidad, costo_unitario, subtotal)
    VALUES
      (v_empresa_id, v_devolucion_id, v_detalle.id, v_detalle.producto_id,
       v_detalle.nombre_producto, v_cantidad, v_detalle.costo_unitario, v_subtotal);
    IF v_detalle.producto_id IS NOT NULL THEN
      UPDATE public.productos SET stock_actual = stock_actual - v_cantidad
      WHERE id = v_detalle.producto_id AND empresa_id = v_empresa_id;
      IF v_compra.ubicacion_id IS NOT NULL THEN
        UPDATE public.producto_stock_ubicacion
        SET cantidad = cantidad - v_cantidad, actualizado_en = now()
        WHERE empresa_id = v_empresa_id AND producto_id = v_detalle.producto_id
          AND ubicacion_id = v_compra.ubicacion_id;
      END IF;
    END IF;
  END LOOP;
  RETURN v_devolucion_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.registrar_devolucion_compra(bigint, jsonb, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.registrar_devolucion_compra(bigint, jsonb, text) TO authenticated;
