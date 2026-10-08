-- Habilita devoluciones parciales o múltiples por venta, con límites de
-- cantidad, actualización de deuda y stock en una sola transacción.
BEGIN;

ALTER TABLE public.devoluciones_ventas
  DROP CONSTRAINT IF EXISTS devoluciones_ventas_empresa_id_venta_id_key;
CREATE INDEX IF NOT EXISTS devoluciones_ventas_venta_idx
  ON public.devoluciones_ventas (empresa_id, venta_id, fecha DESC);

DROP FUNCTION IF EXISTS public.registrar_devolucion_venta(integer, text);

CREATE OR REPLACE FUNCTION public.registrar_devolucion_venta(
  p_venta_id integer,
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
  v_venta public.ventas%ROWTYPE;
  v_detalle public.detalle_ventas%ROWTYPE;
  v_producto public.productos%ROWTYPE;
  v_item jsonb;
  v_cantidad numeric;
  v_cantidad_devuelta numeric;
  v_bruto_linea numeric;
  v_factor_descuento numeric := 1;
  v_bruto_venta numeric := 0;
  v_subtotal numeric;
  v_total numeric := 0;
  v_saldo_reversado numeric := 0;
  v_credito_cliente numeric := 0;
  v_saldo_nuevo numeric := 0;
  v_ubicacion_usuario uuid;
  v_todas_localizaciones boolean;
  v_devolucion_completa boolean := false;
  v_hay_detalles_pendientes boolean;
  v_devolucion_id bigint;
  v_referencia text;
BEGIN
  IF auth.uid() IS NULL OR v_empresa_id IS NULL THEN
    RAISE EXCEPTION 'Se requiere una sesión autenticada con empresa';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.usuarios u
    WHERE u.auth_user_id = auth.uid() AND u.empresa_id = v_empresa_id
      AND u.activo = true AND u.permitir_acceso = true
  ) THEN RAISE EXCEPTION 'Usuario inactivo o sin permiso de acceso'; END IF;
  IF NOT public.tiene_permiso('ventas_pos', 'Devolver venta') AND NOT EXISTS (
    SELECT 1 FROM public.usuarios u JOIN public.roles r ON r.id = u.rol_id
    WHERE u.auth_user_id = auth.uid() AND u.empresa_id = v_empresa_id
      AND lower(r.nombre) LIKE '%admin%'
  ) THEN RAISE EXCEPTION 'No tenés permiso para devolver ventas'; END IF;
  IF p_motivo IS NULL OR length(btrim(p_motivo)) < 3 OR length(p_motivo) > 500 THEN
    RAISE EXCEPTION 'Especifica un motivo de entre 3 y 500 caracteres';
  END IF;
  IF p_items IS NULL OR jsonb_typeof(p_items) IS DISTINCT FROM 'array'
     OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'Agrega al menos un artículo para devolver';
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_items) AS x(value)
    GROUP BY NULLIF(x.value->>'venta_detalle_id', '') HAVING count(*) > 1
  ) THEN RAISE EXCEPTION 'No repitas líneas de la venta'; END IF;

  SELECT * INTO v_venta FROM public.ventas
  WHERE id = p_venta_id AND empresa_id = v_empresa_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Venta no encontrada en esta empresa'; END IF;
  IF lower(COALESCE(v_venta.estado_pago, '')) IN ('anulada','anulado','devuelta','cotizacion','cotización')
     OR lower(COALESCE(v_venta.estado, '')) IN ('pendiente','cotizacion','cotización') THEN
    RAISE EXCEPTION 'La venta no admite una devolución en su estado actual';
  END IF;

  SELECT u.ubicacion_id, COALESCE(u.todas_localizaciones, false)
    INTO v_ubicacion_usuario, v_todas_localizaciones
  FROM public.usuarios u
  WHERE u.auth_user_id = auth.uid() AND u.empresa_id = v_empresa_id
    AND u.activo = true AND u.permitir_acceso = true
  ORDER BY u.id LIMIT 1;
  IF v_venta.ubicacion_id IS NOT NULL AND NOT v_todas_localizaciones
     AND v_venta.ubicacion_id IS DISTINCT FROM v_ubicacion_usuario THEN
    RAISE EXCEPTION 'No tienes acceso a la sucursal de esta venta';
  END IF;

  SELECT COALESCE(sum(COALESCE(d.subtotal, d.cantidad * d.precio_unitario)), 0)
    INTO v_bruto_venta
  FROM public.detalle_ventas d
  WHERE d.empresa_id = v_empresa_id AND d.venta_id = p_venta_id;
  IF v_bruto_venta <= 0 THEN
    v_factor_descuento := 1;
  ELSE
    v_factor_descuento := GREATEST(0, (v_bruto_venta - LEAST(COALESCE(v_venta.descuento, 0), v_bruto_venta)) / v_bruto_venta);
  END IF;

  -- Validar cada línea y reservar su stock bajo el bloqueo de la venta.
  FOR v_item IN SELECT value FROM jsonb_array_elements(p_items)
  LOOP
    SELECT * INTO v_detalle FROM public.detalle_ventas
    WHERE id = NULLIF(v_item->>'venta_detalle_id', '')::integer
      AND venta_id = p_venta_id AND empresa_id = v_empresa_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Una línea no pertenece a esta venta'; END IF;
    v_cantidad := COALESCE(NULLIF(v_item->>'cantidad', '')::numeric, 0);
    IF v_cantidad <= 0 OR v_cantidad::text IN ('NaN','Infinity','-Infinity')
       OR v_cantidad <> trunc(v_cantidad) THEN
      RAISE EXCEPTION 'La cantidad devuelta debe ser un entero mayor que cero';
    END IF;
    SELECT COALESCE(sum(d.cantidad), 0) INTO v_cantidad_devuelta
    FROM public.detalle_devoluciones_ventas d
    WHERE d.empresa_id = v_empresa_id AND d.venta_detalle_id = v_detalle.id;
    IF v_cantidad_devuelta + v_cantidad > v_detalle.cantidad THEN
      RAISE EXCEPTION 'La cantidad supera lo pendiente de devolver para %', v_detalle.nombre_producto;
    END IF;
    IF v_detalle.cantidad <= 0 THEN RAISE EXCEPTION 'La línea original tiene una cantidad inválida'; END IF;

    v_bruto_linea := COALESCE(v_detalle.subtotal, v_detalle.cantidad * v_detalle.precio_unitario)
      * v_cantidad / v_detalle.cantidad;
    v_subtotal := round(v_bruto_linea * v_factor_descuento, 2);
    v_total := v_total + v_subtotal;

    IF v_detalle.producto_id IS NOT NULL THEN
      SELECT * INTO v_producto FROM public.productos
      WHERE id = v_detalle.producto_id AND empresa_id = v_empresa_id FOR UPDATE;
      IF NOT FOUND THEN RAISE EXCEPTION 'Producto de la venta no encontrado'; END IF;
      IF v_producto.stock_actual IS NOT NULL THEN
        UPDATE public.productos SET stock_actual = stock_actual + v_cantidad
        WHERE id = v_detalle.producto_id AND empresa_id = v_empresa_id;
      END IF;
    END IF;
  END LOOP;

  -- Determinar si ya se devolvieron todas las cantidades. Al completar la
  -- venta se incluye el total original (incluye embalaje/envío no desglosado).
  SELECT EXISTS (
    SELECT 1 FROM public.detalle_ventas d
    WHERE d.empresa_id = v_empresa_id AND d.venta_id = p_venta_id
      AND COALESCE((SELECT sum(r.cantidad) FROM public.detalle_devoluciones_ventas r
        WHERE r.empresa_id = v_empresa_id AND r.venta_detalle_id = d.id), 0)
        + COALESCE((SELECT sum((x.value->>'cantidad')::numeric)
          FROM jsonb_array_elements(p_items) x(value)
          WHERE NULLIF(x.value->>'venta_detalle_id','')::integer = d.id), 0) < d.cantidad
  ) INTO v_hay_detalles_pendientes;
  v_devolucion_completa := NOT v_hay_detalles_pendientes;
  IF v_devolucion_completa THEN
    v_total := GREATEST(0, COALESCE(v_venta.total, v_total) - COALESCE((
      SELECT sum(d.total) FROM public.devoluciones_ventas d
      WHERE d.empresa_id = v_empresa_id AND d.venta_id = p_venta_id
    ), 0));
  END IF;

  v_saldo_reversado := LEAST(GREATEST(0, COALESCE(v_venta.saldo_pendiente, 0)), v_total);
  v_credito_cliente := GREATEST(0, v_total - v_saldo_reversado);
  v_saldo_nuevo := GREATEST(0, COALESCE(v_venta.saldo_pendiente, 0) - v_saldo_reversado);

  v_referencia := 'DV-' || to_char(clock_timestamp(), 'YYYYMMDD-HH24MISS-MS') || '-' || substr(gen_random_uuid()::text, 1, 6);
  INSERT INTO public.devoluciones_ventas
    (empresa_id, venta_id, cliente, referencia, motivo, total, credito_cliente, saldo_reversado, creado_por)
  VALUES
    (v_empresa_id, p_venta_id, COALESCE(v_venta.cliente, v_venta.cliente_nombre), v_referencia,
     btrim(p_motivo), v_total, v_credito_cliente, v_saldo_reversado, auth.uid())
  RETURNING id INTO v_devolucion_id;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_items)
  LOOP
    SELECT * INTO v_detalle FROM public.detalle_ventas
    WHERE id = NULLIF(v_item->>'venta_detalle_id', '')::integer
      AND venta_id = p_venta_id AND empresa_id = v_empresa_id;
    v_cantidad := (v_item->>'cantidad')::numeric;
    v_bruto_linea := COALESCE(v_detalle.subtotal, v_detalle.cantidad * v_detalle.precio_unitario)
      * v_cantidad / v_detalle.cantidad;
    v_subtotal := round(v_bruto_linea * v_factor_descuento, 2);
    INSERT INTO public.detalle_devoluciones_ventas
      (empresa_id, devolucion_id, venta_detalle_id, producto_id, nombre_producto, cantidad, precio_unitario, subtotal)
    VALUES
      (v_empresa_id, v_devolucion_id, v_detalle.id, v_detalle.producto_id,
       COALESCE(v_detalle.nombre_producto, 'Artículo'), v_cantidad,
       v_detalle.precio_unitario, v_subtotal);
  END LOOP;

  UPDATE public.ventas
  SET saldo_pendiente = v_saldo_nuevo,
      estado_pago = CASE WHEN v_devolucion_completa THEN 'Devuelta' ELSE estado_pago END
  WHERE id = p_venta_id AND empresa_id = v_empresa_id;
  RETURN v_devolucion_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.registrar_devolucion_venta(integer, jsonb, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.registrar_devolucion_venta(integer, jsonb, text) TO authenticated;
COMMIT;
