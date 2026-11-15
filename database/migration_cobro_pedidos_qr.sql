-- Permite convertir un pedido QR de mesa en una venta una sola vez.
-- Aplicar después de migration_pedidos_qr_mesa.sql y de la migración que
-- instala la versión activa de public.registrar_venta(jsonb,jsonb,uuid).
-- registrar_venta sigue siendo la única responsable de venta, caja y stock.

CREATE TABLE IF NOT EXISTS public.pedidos_qr_ventas (
  pedido_id uuid PRIMARY KEY REFERENCES public.pedidos(id) ON DELETE RESTRICT,
  empresa_id uuid NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  venta_id text NOT NULL UNIQUE,
  estado_pago text,
  creado_en timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS pedidos_qr_ventas_empresa_idx
  ON public.pedidos_qr_ventas (empresa_id, creado_en DESC);

ALTER TABLE public.pedidos_qr_ventas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS pedidos_qr_ventas_select_empresa ON public.pedidos_qr_ventas;
CREATE POLICY pedidos_qr_ventas_select_empresa ON public.pedidos_qr_ventas
  FOR SELECT TO authenticated USING (EXISTS (
    SELECT 1 FROM public.usuarios u
    WHERE u.auth_user_id = auth.uid()
      AND u.empresa_id = pedidos_qr_ventas.empresa_id
      AND u.activo IS TRUE
      AND u.permitir_acceso IS TRUE
  ));
GRANT SELECT ON public.pedidos_qr_ventas TO authenticated;

CREATE OR REPLACE FUNCTION public.registrar_venta_pedido_qr(
  p_pedido_id uuid,
  p_venta jsonb,
  p_items jsonb,
  p_ubicacion_id uuid DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_empresa_id uuid;
  v_estado text;
  v_origen text;
  v_items_pedido jsonb;
  v_total_pedido numeric;
  v_ubicacion_pedido uuid;
  v_items_venta_normalizados jsonb;
  v_items_pedido_normalizados jsonb;
  v_venta_id text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Se requiere una sesión autenticada';
  END IF;
  IF p_pedido_id IS NULL OR p_venta IS NULL OR p_items IS NULL
     OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'PEDIDO_QR_DATOS_INVALIDOS';
  END IF;

  -- El bloqueo serializa dos intentos simultáneos de cobrar la misma mesa.
  SELECT p.empresa_id, p.estado, p.origen, p.items, p.total, p.ubicacion_id
    INTO v_empresa_id, v_estado, v_origen, v_items_pedido, v_total_pedido, v_ubicacion_pedido
  FROM public.pedidos p
  WHERE p.id = p_pedido_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'PEDIDO_QR_NO_ENCONTRADO'; END IF;
  IF v_origen <> 'catalogo_qr_mesa' THEN RAISE EXCEPTION 'NO_ES_PEDIDO_QR_DE_MESA'; END IF;
  IF v_estado = 'cancelado' THEN RAISE EXCEPTION 'PEDIDO_QR_CANCELADO'; END IF;
  IF v_estado <> 'completado' THEN RAISE EXCEPTION 'PEDIDO_QR_NO_LISTO_PARA_COBRAR'; END IF;
  IF EXISTS (SELECT 1 FROM public.pedidos_qr_ventas WHERE pedido_id = p_pedido_id) THEN
    RAISE EXCEPTION 'PEDIDO_QR_YA_FACTURADO';
  END IF;
  IF p_venta->>'empresa_id' IS DISTINCT FROM v_empresa_id::text THEN
    RAISE EXCEPTION 'PEDIDO_QR_EMPRESA_NO_COINCIDE';
  END IF;
  IF coalesce(p_venta->>'estado_pago', '') NOT IN ('Pagado', 'Credito', 'Pago Parcial') THEN
    RAISE EXCEPTION 'PEDIDO_QR_TIPO_OPERACION_INVALIDO';
  END IF;
  IF p_ubicacion_id IS DISTINCT FROM v_ubicacion_pedido THEN
    RAISE EXCEPTION 'PEDIDO_QR_SUCURSAL_NO_COINCIDE';
  END IF;
  IF coalesce((p_venta->>'descuento')::numeric, 0) <> 0
     OR coalesce((p_venta->>'cargo_embalaje')::numeric, 0) <> 0
     OR p_venta->>'total' IS NULL
     OR abs((p_venta->>'total')::numeric - v_total_pedido) > 0.01 THEN
    RAISE EXCEPTION 'PEDIDO_QR_TOTAL_MODIFICADO';
  END IF;

  -- El POS envía su carrito, pero el pedido original es la fuente de verdad.
  -- Se exige coincidencia completa para evitar cantidades o precios distintos.
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'producto_id', item->>'producto_id',
    'cantidad', (item->>'cantidad')::numeric,
    'precio_unitario', (item->>'precio_unitario')::numeric
  ) ORDER BY item->>'producto_id'), '[]'::jsonb)
  INTO v_items_venta_normalizados
  FROM jsonb_array_elements(p_items) AS elements(item);
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'producto_id', item->>'producto_id',
    'cantidad', (item->>'cantidad')::numeric,
    'precio_unitario', (item->>'precio_unitario')::numeric
  ) ORDER BY item->>'producto_id'), '[]'::jsonb)
  INTO v_items_pedido_normalizados
  FROM jsonb_array_elements(v_items_pedido) AS elements(item);
  IF v_items_venta_normalizados IS DISTINCT FROM v_items_pedido_normalizados THEN
    RAISE EXCEPTION 'PEDIDO_QR_ITEMS_MODIFICADOS';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.usuarios u
    WHERE u.auth_user_id = auth.uid()
      AND u.empresa_id = v_empresa_id
      AND u.activo IS TRUE
      AND u.permitir_acceso IS TRUE
  ) THEN
    RAISE EXCEPTION 'USUARIO_SIN_ACCESO_A_PEDIDO_QR';
  END IF;

  -- Una sola transacción Postgres: si la venta, stock o enlace falla, se revierte todo.
  v_venta_id := public.registrar_venta(p_venta, p_items, p_ubicacion_id)::text;
  INSERT INTO public.pedidos_qr_ventas (pedido_id, empresa_id, venta_id, estado_pago)
  VALUES (p_pedido_id, v_empresa_id, v_venta_id, p_venta->>'estado_pago');

  RETURN v_venta_id;
END;
$$;

REVOKE ALL ON FUNCTION public.registrar_venta_pedido_qr(uuid,jsonb,jsonb,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.registrar_venta_pedido_qr(uuid,jsonb,jsonb,uuid) TO authenticated;

-- Notifica en vivo a los paneles de restaurante al finalizar un cobro.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime')
     AND NOT EXISTS (
       SELECT 1 FROM pg_publication_tables
       WHERE pubname = 'supabase_realtime'
         AND schemaname = 'public'
         AND tablename = 'pedidos_qr_ventas'
     ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.pedidos_qr_ventas;
  END IF;
END;
$$;
