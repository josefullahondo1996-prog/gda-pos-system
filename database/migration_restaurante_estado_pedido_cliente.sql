-- Seguimiento publico y limitado del estado de pedidos QR de mesa.
-- Aplicar despues de migration_restaurante_cuentas_qr.sql.

ALTER TABLE public.pedidos
  ADD COLUMN IF NOT EXISTS seguimiento_token uuid NOT NULL DEFAULT gen_random_uuid();
CREATE UNIQUE INDEX IF NOT EXISTS pedidos_seguimiento_token_uidx
  ON public.pedidos (seguimiento_token);

CREATE OR REPLACE FUNCTION public.crear_pedido_mesa_qr_publico(
  p_token uuid, p_items jsonb, p_nota text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  m public.catalogos_qr_mesas%rowtype;
  c public.catalogos_qr%rowtype;
  r jsonb;
  pid uuid;
  v_seguimiento_token uuid;
BEGIN
  SELECT * INTO m FROM public.catalogos_qr_mesas
    WHERE public_token=p_token AND activo FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'MESA_QR_NO_DISPONIBLE'; END IF;
  SELECT * INTO c FROM public.catalogos_qr
    WHERE id=m.catalogo_id AND empresa_id=m.empresa_id AND estado='Activo';
  IF NOT FOUND OR (c.expira_el IS NOT NULL AND c.expira_el < current_date)
    OR NOT EXISTS (SELECT 1 FROM public.empresas e WHERE e.id=m.empresa_id
      AND coalesce((e.configuracion->'ajustes'->>'enable_table_qr_orders')::boolean,false)) THEN
    RAISE EXCEPTION 'PEDIDOS_QR_MESA_DESACTIVADOS';
  END IF;

  r := public.crear_pedido_catalogo_qr_publico(
    c.public_token, 'Mesa ' || m.nombre, '00000000', p_items, p_nota
  );
  pid := (r->>'id')::uuid;
  UPDATE public.pedidos SET mesa_id=m.id, mesa_nombre=m.nombre,
    cliente_nombre=m.nombre, cliente_telefono=NULL, origen='catalogo_qr_mesa'
  WHERE id=pid AND empresa_id=m.empresa_id
  RETURNING seguimiento_token INTO v_seguimiento_token;
  IF v_seguimiento_token IS NULL THEN RAISE EXCEPTION 'PEDIDO_QR_SEGUIMIENTO_NO_DISPONIBLE'; END IF;
  RETURN r || jsonb_build_object(
    'mesa',m.nombre,
    'seguimiento_token',v_seguimiento_token
  );
END;
$$;
REVOKE ALL ON FUNCTION public.crear_pedido_mesa_qr_publico(uuid,jsonb,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.crear_pedido_mesa_qr_publico(uuid,jsonb,text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.obtener_estado_pedido_qr_publico(p_token uuid)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT jsonb_build_object(
    'numero_pedido',p.numero_pedido,
    'mesa',p.mesa_nombre,
    'estado',p.estado,
    'creado_en',p.creado_en,
    'actualizado_en',p.actualizado_en
  )
  FROM public.pedidos p
  WHERE p.seguimiento_token=p_token
    AND p.origen='catalogo_qr_mesa'
    AND p.mesa_id IS NOT NULL
$$;
REVOKE ALL ON FUNCTION public.obtener_estado_pedido_qr_publico(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.obtener_estado_pedido_qr_publico(uuid) TO anon, authenticated;
