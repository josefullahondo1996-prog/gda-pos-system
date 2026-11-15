-- Agrupa en una cuenta los pedidos QR no cobrados de una misma mesa.
-- Aplicar después de migration_pedidos_qr_mesa.sql,
-- migration_cobro_pedidos_qr.sql y la migración activa de registrar_venta.
-- registrar_venta sigue siendo la única responsable de ventas, caja y stock.

ALTER TABLE public.pedidos
  ADD COLUMN IF NOT EXISTS cancelado_en timestamptz,
  ADD COLUMN IF NOT EXISTS cancelado_por uuid,
  ADD COLUMN IF NOT EXISTS cancelado_motivo text;

ALTER TABLE public.pedidos_qr_ventas
  DROP CONSTRAINT IF EXISTS pedidos_qr_ventas_venta_id_key;
DROP INDEX IF EXISTS public.pedidos_qr_ventas_venta_id_key;
CREATE INDEX IF NOT EXISTS pedidos_qr_ventas_venta_idx
  ON public.pedidos_qr_ventas (venta_id);

CREATE OR REPLACE FUNCTION public.registrar_venta_pedidos_qr(
  p_pedido_ids uuid[],
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
  v_mesa_id uuid;
  v_ubicacion_id uuid;
  v_total numeric := 0;
  v_count integer;
  v_items_pedidos jsonb;
  v_items_venta_normalizados jsonb;
  v_items_pedido_normalizados jsonb;
  v_venta_id text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Se requiere una sesión autenticada'; END IF;
  IF p_pedido_ids IS NULL OR cardinality(p_pedido_ids) = 0
     OR array_position(p_pedido_ids, NULL) IS NOT NULL
     OR p_venta IS NULL OR p_items IS NULL THEN
    RAISE EXCEPTION 'PEDIDO_QR_DATOS_INVALIDOS';
  END IF;
  IF cardinality(p_pedido_ids) <> (SELECT count(DISTINCT pedido_id) FROM unnest(p_pedido_ids) AS ids(pedido_id)) THEN
    RAISE EXCEPTION 'PEDIDO_QR_DATOS_INVALIDOS';
  END IF;
  IF jsonb_typeof(p_items) IS DISTINCT FROM 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'PEDIDO_QR_DATOS_INVALIDOS';
  END IF;

  -- Bloquea todas las filas en un orden estable para evitar cobros simultáneos.
  PERFORM 1 FROM public.pedidos p
  WHERE p.id = ANY(p_pedido_ids)
  ORDER BY p.id
  FOR UPDATE;
  SELECT count(*) INTO v_count FROM public.pedidos p WHERE p.id = ANY(p_pedido_ids);
  IF v_count <> cardinality(p_pedido_ids) THEN RAISE EXCEPTION 'PEDIDO_QR_NO_ENCONTRADO'; END IF;

  SELECT (array_agg(p.empresa_id ORDER BY p.creado_en))[1],
         (array_agg(p.mesa_id ORDER BY p.creado_en))[1],
         (array_agg(p.ubicacion_id ORDER BY p.creado_en))[1],
         coalesce(jsonb_agg(item.value ORDER BY p.creado_en, item.ordinality), '[]'::jsonb)
    INTO v_empresa_id, v_mesa_id, v_ubicacion_id, v_items_pedidos
  FROM public.pedidos p
  CROSS JOIN LATERAL jsonb_array_elements(p.items) WITH ORDINALITY AS item(value, ordinality)
  WHERE p.id = ANY(p_pedido_ids);
  SELECT sum(p.total) INTO v_total FROM public.pedidos p WHERE p.id = ANY(p_pedido_ids);

  IF v_mesa_id IS NULL OR EXISTS (
    SELECT 1 FROM public.pedidos p
    WHERE p.id = ANY(p_pedido_ids)
      AND (p.empresa_id IS DISTINCT FROM v_empresa_id OR p.mesa_id IS DISTINCT FROM v_mesa_id
        OR p.ubicacion_id IS DISTINCT FROM v_ubicacion_id OR p.origen <> 'catalogo_qr_mesa'
        OR p.estado <> 'completado')
  ) THEN RAISE EXCEPTION 'PEDIDO_QR_CUENTA_NO_LISTA'; END IF;
  -- Serializa el cierre de cuenta con nuevos envíos del QR de la misma mesa.
  PERFORM 1 FROM public.catalogos_qr_mesas m WHERE m.id = v_mesa_id FOR UPDATE;
  IF EXISTS (
    SELECT 1 FROM public.pedidos p
    WHERE p.mesa_id = v_mesa_id AND p.origen = 'catalogo_qr_mesa'
      AND p.estado IN ('pendiente','en_preparacion','completado')
      AND NOT (p.id = ANY(p_pedido_ids))
      AND NOT EXISTS (SELECT 1 FROM public.pedidos_qr_ventas pv WHERE pv.pedido_id = p.id)
  ) THEN RAISE EXCEPTION 'PEDIDO_QR_CUENTA_CAMBIO'; END IF;
  IF EXISTS (SELECT 1 FROM public.pedidos_qr_ventas pv WHERE pv.pedido_id = ANY(p_pedido_ids)) THEN
    RAISE EXCEPTION 'PEDIDO_QR_YA_FACTURADO';
  END IF;
  IF p_venta->>'empresa_id' IS DISTINCT FROM v_empresa_id::text THEN
    RAISE EXCEPTION 'PEDIDO_QR_EMPRESA_NO_COINCIDE';
  END IF;
  IF coalesce(p_venta->>'estado_pago', '') NOT IN ('Pagado', 'Credito', 'Pago Parcial') THEN
    RAISE EXCEPTION 'PEDIDO_QR_TIPO_OPERACION_INVALIDO';
  END IF;
  IF v_ubicacion_id IS NOT NULL AND p_ubicacion_id IS DISTINCT FROM v_ubicacion_id THEN
    RAISE EXCEPTION 'PEDIDO_QR_SUCURSAL_NO_COINCIDE';
  END IF;
  IF coalesce((p_venta->>'descuento')::numeric, 0) <> 0
     OR coalesce((p_venta->>'cargo_embalaje')::numeric, 0) <> 0
     OR p_venta->>'total' IS NULL
     OR abs((p_venta->>'total')::numeric - v_total) > 0.01 THEN
    RAISE EXCEPTION 'PEDIDO_QR_TOTAL_MODIFICADO';
  END IF;

  -- Compara cantidades y valor de cada producto contra todas las comandas de la mesa.
  SELECT coalesce(jsonb_agg(jsonb_build_object('producto_id', q.producto_id,
    'cantidad', q.cantidad, 'importe', q.importe) ORDER BY q.producto_id), '[]'::jsonb)
  INTO v_items_venta_normalizados
  FROM (
    SELECT item->>'producto_id' AS producto_id,
           sum((item->>'cantidad')::numeric) AS cantidad,
           sum(coalesce((item->>'subtotal')::numeric,
             (item->>'cantidad')::numeric * (item->>'precio_unitario')::numeric)) AS importe
    FROM jsonb_array_elements(p_items) AS elements(item)
    GROUP BY item->>'producto_id'
  ) q;
  SELECT coalesce(jsonb_agg(jsonb_build_object('producto_id', q.producto_id,
    'cantidad', q.cantidad, 'importe', q.importe) ORDER BY q.producto_id), '[]'::jsonb)
  INTO v_items_pedido_normalizados
  FROM (
    SELECT item->>'producto_id' AS producto_id,
           sum((item->>'cantidad')::numeric) AS cantidad,
           sum(coalesce((item->>'subtotal')::numeric,
             (item->>'cantidad')::numeric * (item->>'precio_unitario')::numeric)) AS importe
    FROM jsonb_array_elements(v_items_pedidos) AS elements(item)
    GROUP BY item->>'producto_id'
  ) q;
  IF v_items_venta_normalizados IS DISTINCT FROM v_items_pedido_normalizados THEN
    RAISE EXCEPTION 'PEDIDO_QR_ITEMS_MODIFICADOS';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.usuarios u
    WHERE u.auth_user_id = auth.uid() AND u.empresa_id = v_empresa_id
      AND u.activo IS TRUE AND u.permitir_acceso IS TRUE
  ) THEN RAISE EXCEPTION 'USUARIO_SIN_ACCESO_A_PEDIDO_QR'; END IF;

  v_venta_id := public.registrar_venta(p_venta, p_items, p_ubicacion_id)::text;
  INSERT INTO public.pedidos_qr_ventas (pedido_id, empresa_id, venta_id, estado_pago)
  SELECT p.id, v_empresa_id, v_venta_id, p_venta->>'estado_pago'
  FROM public.pedidos p WHERE p.id = ANY(p_pedido_ids);
  RETURN v_venta_id;
END;
$$;

REVOKE ALL ON FUNCTION public.registrar_venta_pedidos_qr(uuid[],jsonb,jsonb,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.registrar_venta_pedidos_qr(uuid[],jsonb,jsonb,uuid) TO authenticated;

-- Compatibilidad para clientes anteriores que cobran un único pedido.
CREATE OR REPLACE FUNCTION public.registrar_venta_pedido_qr(
  p_pedido_id uuid, p_venta jsonb, p_items jsonb, p_ubicacion_id uuid DEFAULT NULL
)
RETURNS text
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT public.registrar_venta_pedidos_qr(ARRAY[p_pedido_id], p_venta, p_items, p_ubicacion_id)
$$;
REVOKE ALL ON FUNCTION public.registrar_venta_pedido_qr(uuid,jsonb,jsonb,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.registrar_venta_pedido_qr(uuid,jsonb,jsonb,uuid) TO authenticated;

-- Evita que un envío QR concurrente se inserte entre la lectura y el cobro de una cuenta.
CREATE OR REPLACE FUNCTION public.crear_pedido_mesa_qr_publico(
  p_token uuid, p_items jsonb, p_nota text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE m public.catalogos_qr_mesas%rowtype; c public.catalogos_qr%rowtype; r jsonb; pid uuid;
BEGIN
  SELECT * INTO m FROM public.catalogos_qr_mesas WHERE public_token=p_token AND activo FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'MESA_QR_NO_DISPONIBLE'; END IF;
  SELECT * INTO c FROM public.catalogos_qr WHERE id=m.catalogo_id AND empresa_id=m.empresa_id AND estado='Activo';
  IF NOT FOUND OR (c.expira_el IS NOT NULL AND c.expira_el < current_date)
    OR NOT EXISTS (SELECT 1 FROM public.empresas e WHERE e.id=m.empresa_id
      AND coalesce((e.configuracion->'ajustes'->>'enable_table_qr_orders')::boolean,false)) THEN
    RAISE EXCEPTION 'PEDIDOS_QR_MESA_DESACTIVADOS';
  END IF;
  r := public.crear_pedido_catalogo_qr_publico(c.public_token, 'Mesa ' || m.nombre, '00000000', p_items, p_nota);
  pid := (r->>'id')::uuid;
  UPDATE public.pedidos SET mesa_id=m.id, mesa_nombre=m.nombre,
    cliente_nombre=m.nombre, cliente_telefono=NULL, origen='catalogo_qr_mesa'
  WHERE id=pid AND empresa_id=m.empresa_id;
  RETURN r || jsonb_build_object('mesa', m.nombre);
END;
$$;

CREATE OR REPLACE FUNCTION public.cancelar_pedidos_qr_mesa(p_pedido_ids uuid[], p_motivo text)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE v_empresa_id uuid; v_mesa_id uuid; v_count integer;
BEGIN
  IF auth.uid() IS NULL OR p_pedido_ids IS NULL OR cardinality(p_pedido_ids) = 0
     OR length(btrim(coalesce(p_motivo, ''))) < 3 OR length(p_motivo) > 500 THEN
    RAISE EXCEPTION 'PEDIDO_QR_CANCELACION_INVALIDA';
  END IF;
  PERFORM 1 FROM public.pedidos p WHERE p.id = ANY(p_pedido_ids) ORDER BY p.id FOR UPDATE;
  SELECT count(*) INTO v_count FROM public.pedidos p WHERE p.id = ANY(p_pedido_ids);
  IF v_count <> cardinality(p_pedido_ids) THEN RAISE EXCEPTION 'PEDIDO_QR_NO_ENCONTRADO'; END IF;
  SELECT (array_agg(p.empresa_id))[1], (array_agg(p.mesa_id))[1]
    INTO v_empresa_id, v_mesa_id FROM public.pedidos p WHERE p.id = ANY(p_pedido_ids);
  IF EXISTS (SELECT 1 FROM public.pedidos p WHERE p.id = ANY(p_pedido_ids)
      AND (p.empresa_id IS DISTINCT FROM v_empresa_id OR p.mesa_id IS DISTINCT FROM v_mesa_id OR p.origen <> 'catalogo_qr_mesa'
        OR p.estado NOT IN ('pendiente','en_preparacion','completado')))
     OR EXISTS (SELECT 1 FROM public.pedidos_qr_ventas pv WHERE pv.pedido_id = ANY(p_pedido_ids)) THEN
    RAISE EXCEPTION 'PEDIDO_QR_NO_CANCELABLE';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.usuarios u WHERE u.auth_user_id = auth.uid()
      AND u.empresa_id = v_empresa_id AND u.activo IS TRUE AND u.permitir_acceso IS TRUE) THEN
    RAISE EXCEPTION 'USUARIO_SIN_ACCESO_A_PEDIDO_QR';
  END IF;
  UPDATE public.pedidos p SET estado='cancelado', actualizado_en=now(),
    cancelado_en=now(), cancelado_por=auth.uid(), cancelado_motivo=btrim(p_motivo)
  WHERE p.id = ANY(p_pedido_ids);
  RETURN v_count;
END;
$$;
REVOKE ALL ON FUNCTION public.cancelar_pedidos_qr_mesa(uuid[],text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cancelar_pedidos_qr_mesa(uuid[],text) TO authenticated;
