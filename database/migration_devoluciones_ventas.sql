-- Devolución completa de ventas con trazabilidad y crédito pendiente al cliente.
-- Reutiliza devolver_venta para restaurar stock; no realiza pagos ni altera caja.
BEGIN;

CREATE TABLE IF NOT EXISTS public.devoluciones_ventas (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  empresa_id uuid NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  venta_id integer NOT NULL REFERENCES public.ventas(id),
  cliente text,
  referencia text NOT NULL,
  motivo text NOT NULL CHECK (length(btrim(motivo)) BETWEEN 3 AND 500),
  fecha timestamptz NOT NULL DEFAULT now(),
  total numeric(14,2) NOT NULL CHECK (total >= 0),
  credito_cliente numeric(14,2) NOT NULL CHECK (credito_cliente >= 0),
  saldo_reversado numeric(14,2) NOT NULL CHECK (saldo_reversado >= 0),
  creado_por uuid,
  creado_en timestamptz NOT NULL DEFAULT now(),
  UNIQUE (empresa_id, venta_id),
  UNIQUE (empresa_id, referencia)
);

CREATE TABLE IF NOT EXISTS public.detalle_devoluciones_ventas (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  empresa_id uuid NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  devolucion_id bigint NOT NULL REFERENCES public.devoluciones_ventas(id) ON DELETE CASCADE,
  venta_detalle_id integer NOT NULL REFERENCES public.detalle_ventas(id),
  producto_id integer,
  nombre_producto text NOT NULL,
  cantidad numeric(14,3) NOT NULL CHECK (cantidad > 0),
  precio_unitario numeric(14,2) NOT NULL CHECK (precio_unitario >= 0),
  subtotal numeric(14,2) NOT NULL CHECK (subtotal >= 0)
);

CREATE INDEX IF NOT EXISTS devoluciones_ventas_empresa_fecha_idx
  ON public.devoluciones_ventas (empresa_id, fecha DESC);
CREATE INDEX IF NOT EXISTS detalle_devoluciones_ventas_linea_idx
  ON public.detalle_devoluciones_ventas (empresa_id, venta_detalle_id);

ALTER TABLE public.devoluciones_ventas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.detalle_devoluciones_ventas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS devoluciones_ventas_select_empresa ON public.devoluciones_ventas;
CREATE POLICY devoluciones_ventas_select_empresa ON public.devoluciones_ventas
  FOR SELECT TO authenticated USING (empresa_id = public.mi_empresa_id());
DROP POLICY IF EXISTS detalle_devoluciones_ventas_select_empresa ON public.detalle_devoluciones_ventas;
CREATE POLICY detalle_devoluciones_ventas_select_empresa ON public.detalle_devoluciones_ventas
  FOR SELECT TO authenticated USING (empresa_id = public.mi_empresa_id());
GRANT SELECT ON public.devoluciones_ventas, public.detalle_devoluciones_ventas TO authenticated;
REVOKE ALL ON public.devoluciones_ventas, public.detalle_devoluciones_ventas FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.devoluciones_ventas, public.detalle_devoluciones_ventas FROM authenticated;

CREATE OR REPLACE FUNCTION public.registrar_devolucion_venta(p_venta_id integer, p_motivo text)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'auth'
AS $function$
DECLARE
  v_empresa_id uuid := public.mi_empresa_id();
  v_venta public.ventas%ROWTYPE;
  v_detalle public.detalle_ventas%ROWTYPE;
  v_ubicacion_usuario uuid;
  v_todas_localizaciones boolean;
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

  SELECT * INTO v_venta FROM public.ventas
  WHERE id = p_venta_id AND empresa_id = v_empresa_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Venta no encontrada en esta empresa'; END IF;
  IF v_venta.estado_pago IN ('Anulada', 'Devuelta', 'Cotizacion', 'Cotización')
     OR lower(COALESCE(v_venta.estado, '')) IN ('cotizacion','cotización','pendiente') THEN
    RAISE EXCEPTION 'La venta no admite una devolución en su estado actual';
  END IF;
  IF EXISTS (SELECT 1 FROM public.devoluciones_ventas WHERE empresa_id = v_empresa_id AND venta_id = p_venta_id) THEN
    RAISE EXCEPTION 'La venta ya tiene una devolución registrada';
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
  IF NOT EXISTS (SELECT 1 FROM public.detalle_ventas WHERE empresa_id = v_empresa_id AND venta_id = p_venta_id) THEN
    RAISE EXCEPTION 'La venta no contiene artículos que puedan devolverse';
  END IF;

  -- La RPC existente bloquea stock/venta y reestablece también componentes
  -- de combos. Cualquier fallo posterior revierte toda esta transacción SQL.
  PERFORM public.devolver_venta(p_venta_id, v_empresa_id);
  UPDATE public.ventas SET saldo_pendiente = 0
  WHERE id = p_venta_id AND empresa_id = v_empresa_id;

  v_referencia := 'DV-' || to_char(clock_timestamp(), 'YYYYMMDD-HH24MISS-MS') || '-' || substr(gen_random_uuid()::text, 1, 6);
  INSERT INTO public.devoluciones_ventas
    (empresa_id, venta_id, cliente, referencia, motivo, total, credito_cliente, saldo_reversado, creado_por)
  VALUES
    (v_empresa_id, p_venta_id, COALESCE(v_venta.cliente, v_venta.cliente_nombre), v_referencia,
     btrim(p_motivo), COALESCE(v_venta.total, 0), COALESCE(v_venta.monto_pagado, 0),
     COALESCE(v_venta.saldo_pendiente, 0), auth.uid())
  RETURNING id INTO v_devolucion_id;

  FOR v_detalle IN
    SELECT * FROM public.detalle_ventas WHERE empresa_id = v_empresa_id AND venta_id = p_venta_id ORDER BY id
  LOOP
    INSERT INTO public.detalle_devoluciones_ventas
      (empresa_id, devolucion_id, venta_detalle_id, producto_id, nombre_producto, cantidad, precio_unitario, subtotal)
    VALUES
      (v_empresa_id, v_devolucion_id, v_detalle.id, v_detalle.producto_id,
       COALESCE(v_detalle.nombre_producto, 'Artículo'), v_detalle.cantidad,
       v_detalle.precio_unitario, COALESCE(v_detalle.subtotal, v_detalle.cantidad * v_detalle.precio_unitario));
  END LOOP;
  RETURN v_devolucion_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.registrar_devolucion_venta(integer, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.registrar_devolucion_venta(integer, text) TO authenticated;
COMMIT;
