-- Registra efectivo/vuelto al entregar y convierte el pedido delivery en venta
-- usando la RPC atomica registrar_venta (caja y stock permanecen centralizados).
-- Aplicar despues de migration_restaurante_delivery_operacion_segura.sql,
-- migration_cobro_pedidos_qr.sql y la version activa de registrar_venta.

ALTER TABLE public.pedidos
  ADD COLUMN IF NOT EXISTS delivery_efectivo_recibido numeric(14,2)
    CHECK (delivery_efectivo_recibido IS NULL OR delivery_efectivo_recibido >= 0),
  ADD COLUMN IF NOT EXISTS delivery_vuelto numeric(14,2)
    CHECK (delivery_vuelto IS NULL OR delivery_vuelto >= 0),
  ADD COLUMN IF NOT EXISTS delivery_facturada_en timestamptz;

-- El RPC anterior queda limitado a iniciar el viaje. El repartidor debe usar
-- finalizar_entrega_pedido_delivery_repartidor para declarar efectivo recibido.
CREATE OR REPLACE FUNCTION public.actualizar_estado_pedido_delivery_repartidor(
  p_pedido_id uuid,
  p_estado_nuevo text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE v_pedido public.pedidos%rowtype;
BEGIN
  IF auth.uid() IS NULL OR p_pedido_id IS NULL OR p_estado_nuevo IS DISTINCT FROM 'en_camino' THEN
    RAISE EXCEPTION 'ESTADO_INVALIDO_USE_FINALIZAR_ENTREGA_PARA_ENTREGAR';
  END IF;
  SELECT p.* INTO v_pedido
  FROM public.pedidos p
  JOIN public.delivery_repartidores d ON d.empresa_id=p.empresa_id
    AND d.usuario_auth_id=auth.uid() AND d.activo IS TRUE
  JOIN public.usuarios u ON u.empresa_id=p.empresa_id
    AND u.auth_user_id=auth.uid() AND u.activo IS TRUE AND u.permitir_acceso IS TRUE
  WHERE p.id=p_pedido_id AND p.delivery_tipo='delivery'
    AND p.delivery_repartidor_id=auth.uid()
  FOR UPDATE OF p;
  IF NOT FOUND THEN RAISE EXCEPTION 'PEDIDO_DELIVERY_NO_ASIGNADO'; END IF;
  IF v_pedido.estado <> 'completado' OR v_pedido.delivery_estado NOT IN ('asignado','listo') THEN
    RAISE EXCEPTION 'PEDIDO_DELIVERY_NO_LISTO_PARA_SALIR';
  END IF;
  UPDATE public.pedidos SET delivery_estado='en_camino', delivery_actualizado_en=now()
    WHERE id=v_pedido.id AND empresa_id=v_pedido.empresa_id;
  RETURN jsonb_build_object('id',v_pedido.id,'numero_pedido',v_pedido.numero_pedido,'delivery_estado','en_camino');
END;
$$;
REVOKE ALL ON FUNCTION public.actualizar_estado_pedido_delivery_repartidor(uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.actualizar_estado_pedido_delivery_repartidor(uuid,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.finalizar_entrega_pedido_delivery_repartidor(
  p_pedido_id uuid,
  p_monto_efectivo numeric
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE v_pedido public.pedidos%rowtype; v_vuelto numeric;
BEGIN
  IF auth.uid() IS NULL OR p_pedido_id IS NULL OR p_monto_efectivo IS NULL
    OR p_monto_efectivo < 0 OR p_monto_efectivo > 999999999999 THEN
    RAISE EXCEPTION 'MONTO_EFECTIVO_INVALIDO';
  END IF;
  SELECT p.* INTO v_pedido
  FROM public.pedidos p
  JOIN public.delivery_repartidores d ON d.empresa_id=p.empresa_id
    AND d.usuario_auth_id=auth.uid() AND d.activo IS TRUE
  JOIN public.usuarios u ON u.empresa_id=p.empresa_id
    AND u.auth_user_id=auth.uid() AND u.activo IS TRUE AND u.permitir_acceso IS TRUE
  WHERE p.id=p_pedido_id AND p.delivery_tipo='delivery'
    AND p.delivery_repartidor_id=auth.uid()
  FOR UPDATE OF p;
  IF NOT FOUND THEN RAISE EXCEPTION 'PEDIDO_DELIVERY_NO_ASIGNADO'; END IF;
  IF v_pedido.estado <> 'completado' OR v_pedido.delivery_estado <> 'en_camino' THEN
    RAISE EXCEPTION 'PEDIDO_DELIVERY_NO_ESTA_EN_CAMINO';
  END IF;
  IF p_monto_efectivo < v_pedido.total THEN RAISE EXCEPTION 'EFECTIVO_INSUFICIENTE'; END IF;
  v_vuelto := p_monto_efectivo - v_pedido.total;
  UPDATE public.pedidos
  SET delivery_estado='entregado', delivery_efectivo_recibido=p_monto_efectivo,
      delivery_vuelto=v_vuelto, delivery_actualizado_en=now()
  WHERE id=v_pedido.id AND empresa_id=v_pedido.empresa_id;
  RETURN jsonb_build_object('id',v_pedido.id,'numero_pedido',v_pedido.numero_pedido,
    'delivery_estado','entregado','total',v_pedido.total,
    'efectivo_recibido',p_monto_efectivo,'vuelto',v_vuelto);
END;
$$;
REVOKE ALL ON FUNCTION public.finalizar_entrega_pedido_delivery_repartidor(uuid,numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.finalizar_entrega_pedido_delivery_repartidor(uuid,numeric) TO authenticated;

-- Crea la venta y enlaza el pedido dentro de la misma transaccion. La fuente
-- del catalogo QR se vuelve a comprobar en servidor para evitar cambios del carrito.
CREATE OR REPLACE FUNCTION public.registrar_venta_pedido_delivery(
  p_pedido_id uuid,
  p_venta jsonb,
  p_items jsonb,
  p_ubicacion_id uuid DEFAULT NULL
) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_pedido public.pedidos%rowtype;
  v_items_venta jsonb;
  v_items_pedido jsonb;
  v_venta_id text;
BEGIN
  IF auth.uid() IS NULL OR p_pedido_id IS NULL OR p_venta IS NULL OR p_items IS NULL THEN
    RAISE EXCEPTION 'PEDIDO_DELIVERY_DATOS_INVALIDOS';
  END IF;
  IF jsonb_typeof(p_items) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'PEDIDO_DELIVERY_DATOS_INVALIDOS';
  END IF;
  IF jsonb_array_length(p_items)=0 THEN RAISE EXCEPTION 'PEDIDO_DELIVERY_DATOS_INVALIDOS'; END IF;
  SELECT p.* INTO v_pedido FROM public.pedidos p WHERE p.id=p_pedido_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'PEDIDO_DELIVERY_NO_ENCONTRADO'; END IF;
  IF v_pedido.delivery_tipo <> 'delivery' OR v_pedido.estado <> 'completado'
    OR v_pedido.delivery_estado <> 'entregado'
    OR v_pedido.delivery_efectivo_recibido IS NULL THEN
    RAISE EXCEPTION 'PEDIDO_DELIVERY_NO_ENTREGADO_O_SIN_COBRO';
  END IF;
  IF EXISTS (SELECT 1 FROM public.pedidos_qr_ventas pv WHERE pv.pedido_id=p_pedido_id)
    OR v_pedido.delivery_facturada_en IS NOT NULL THEN
    RAISE EXCEPTION 'PEDIDO_DELIVERY_YA_FACTURADO';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.usuarios u WHERE u.auth_user_id=auth.uid()
    AND u.empresa_id=v_pedido.empresa_id AND u.activo IS TRUE AND u.permitir_acceso IS TRUE) THEN
    RAISE EXCEPTION 'USUARIO_SIN_ACCESO_A_PEDIDO_DELIVERY';
  END IF;
  IF p_venta->>'empresa_id' IS DISTINCT FROM v_pedido.empresa_id::text THEN
    RAISE EXCEPTION 'PEDIDO_DELIVERY_EMPRESA_NO_COINCIDE';
  END IF;
  IF v_pedido.ubicacion_id IS NOT NULL AND p_ubicacion_id IS DISTINCT FROM v_pedido.ubicacion_id THEN
    RAISE EXCEPTION 'PEDIDO_DELIVERY_SUCURSAL_NO_COINCIDE';
  END IF;
  IF coalesce(p_venta->>'estado_pago','') <> 'Pagado'
    OR coalesce(p_venta->>'metodo_pago','') <> 'Efectivo'
    OR coalesce((p_venta->>'descuento')::numeric,0) <> 0
    OR abs(coalesce((p_venta->>'cargo_embalaje')::numeric,0)-v_pedido.delivery_costo) > 0.01
    OR abs(coalesce((p_venta->>'total')::numeric,0)-v_pedido.total) > 0.01
    OR abs(coalesce((p_venta->>'monto_pagado')::numeric,0)-v_pedido.total) > 0.01 THEN
    RAISE EXCEPTION 'PEDIDO_DELIVERY_TOTAL_O_COBRO_MODIFICADO';
  END IF;

  SELECT coalesce(jsonb_agg(jsonb_build_object('producto_id',i->>'producto_id',
    'cantidad',(i->>'cantidad')::numeric,'precio_unitario',(i->>'precio_unitario')::numeric)
    ORDER BY i->>'producto_id', (i->>'cantidad')::numeric, (i->>'precio_unitario')::numeric),'[]'::jsonb)
  INTO v_items_venta FROM jsonb_array_elements(p_items) AS x(i);
  SELECT coalesce(jsonb_agg(jsonb_build_object('producto_id',i->>'producto_id',
    'cantidad',(i->>'cantidad')::numeric,'precio_unitario',(i->>'precio_unitario')::numeric)
    ORDER BY i->>'producto_id', (i->>'cantidad')::numeric, (i->>'precio_unitario')::numeric),'[]'::jsonb)
  INTO v_items_pedido FROM jsonb_array_elements(v_pedido.items) AS x(i);
  IF v_items_venta IS DISTINCT FROM v_items_pedido THEN
    RAISE EXCEPTION 'PEDIDO_DELIVERY_ITEMS_MODIFICADOS';
  END IF;

  v_venta_id := public.registrar_venta(p_venta,p_items,p_ubicacion_id)::text;
  INSERT INTO public.pedidos_qr_ventas(pedido_id,empresa_id,venta_id,estado_pago)
    VALUES (p_pedido_id,v_pedido.empresa_id,v_venta_id,'Pagado');
  UPDATE public.pedidos SET delivery_facturada_en=now()
    WHERE id=p_pedido_id AND empresa_id=v_pedido.empresa_id;
  RETURN v_venta_id;
END;
$$;
REVOKE ALL ON FUNCTION public.registrar_venta_pedido_delivery(uuid,jsonb,jsonb,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.registrar_venta_pedido_delivery(uuid,jsonb,jsonb,uuid) TO authenticated;
