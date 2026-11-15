-- Pedidos públicos por QR de mesa, aislados por empresa.
-- Aplicar después de migration_catalogo_qr_carrito.sql.
-- Los pedidos siguen siendo solicitudes: no cobran ni descuentan stock.

CREATE TABLE IF NOT EXISTS public.catalogos_qr_mesas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  catalogo_id uuid NOT NULL REFERENCES public.catalogos_qr(id) ON DELETE CASCADE,
  nombre text NOT NULL CHECK (length(btrim(nombre)) BETWEEN 1 AND 60),
  public_token uuid NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  activo boolean NOT NULL DEFAULT true,
  creado_en timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT catalogos_qr_mesas_catalogo_nombre_unico UNIQUE (catalogo_id, nombre)
);

CREATE INDEX IF NOT EXISTS catalogos_qr_mesas_empresa_idx
  ON public.catalogos_qr_mesas (empresa_id, catalogo_id);
ALTER TABLE public.catalogos_qr_mesas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS catalogos_qr_mesas_empresa_select ON public.catalogos_qr_mesas;
CREATE POLICY catalogos_qr_mesas_empresa_select ON public.catalogos_qr_mesas
  FOR SELECT TO authenticated USING (EXISTS (
    SELECT 1 FROM public.usuarios u WHERE u.auth_user_id = auth.uid()
      AND u.empresa_id = catalogos_qr_mesas.empresa_id
      AND u.activo IS NOT FALSE AND u.permitir_acceso IS NOT FALSE
  ));
DROP POLICY IF EXISTS catalogos_qr_mesas_empresa_write ON public.catalogos_qr_mesas;
CREATE POLICY catalogos_qr_mesas_empresa_write ON public.catalogos_qr_mesas
  FOR ALL TO authenticated USING (EXISTS (
    SELECT 1 FROM public.usuarios u JOIN public.empresas e ON e.id = u.empresa_id
    WHERE u.auth_user_id = auth.uid() AND u.empresa_id = catalogos_qr_mesas.empresa_id
      AND u.activo IS NOT FALSE AND u.permitir_acceso IS NOT FALSE
      AND EXISTS (SELECT 1 FROM public.catalogos_qr c WHERE c.id=catalogos_qr_mesas.catalogo_id AND c.empresa_id=catalogos_qr_mesas.empresa_id)
      AND coalesce((e.configuracion->'ajustes'->>'enable_table_qr_orders')::boolean, false)
  )) WITH CHECK (EXISTS (
    SELECT 1 FROM public.usuarios u JOIN public.empresas e ON e.id = u.empresa_id
    WHERE u.auth_user_id = auth.uid() AND u.empresa_id = catalogos_qr_mesas.empresa_id
      AND u.activo IS NOT FALSE AND u.permitir_acceso IS NOT FALSE
      AND EXISTS (SELECT 1 FROM public.catalogos_qr c WHERE c.id=catalogos_qr_mesas.catalogo_id AND c.empresa_id=catalogos_qr_mesas.empresa_id)
      AND coalesce((e.configuracion->'ajustes'->>'enable_table_qr_orders')::boolean, false)
  ));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.catalogos_qr_mesas TO authenticated;

ALTER TABLE public.pedidos ADD COLUMN IF NOT EXISTS mesa_id uuid;
ALTER TABLE public.pedidos ADD COLUMN IF NOT EXISTS mesa_nombre text;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.pedidos'::regclass AND conname='pedidos_mesa_id_fkey') THEN
    ALTER TABLE public.pedidos ADD CONSTRAINT pedidos_mesa_id_fkey
      FOREIGN KEY (mesa_id) REFERENCES public.catalogos_qr_mesas(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.obtener_mesa_qr_publica(p_token uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE m public.catalogos_qr_mesas%rowtype; c public.catalogos_qr%rowtype; v jsonb;
BEGIN
  SELECT * INTO m FROM public.catalogos_qr_mesas WHERE public_token=p_token AND activo;
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT * INTO c FROM public.catalogos_qr WHERE id=m.catalogo_id AND empresa_id=m.empresa_id AND estado='Activo';
  IF NOT FOUND OR (c.expira_el IS NOT NULL AND c.expira_el < current_date)
    OR NOT EXISTS (SELECT 1 FROM public.empresas e WHERE e.id=m.empresa_id
      AND coalesce((e.configuracion->'ajustes'->>'enable_table_qr_orders')::boolean,false)) THEN RETURN NULL; END IF;
  v := public.obtener_catalogo_qr_publico(c.public_token);
  IF v IS NULL THEN RETURN NULL; END IF;
  RETURN v || jsonb_build_object('mesa', jsonb_build_object('id',m.id,'nombre',m.nombre));
END $$;

CREATE OR REPLACE FUNCTION public.crear_pedido_mesa_qr_publico(
  p_token uuid, p_items jsonb, p_nota text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE m public.catalogos_qr_mesas%rowtype; c public.catalogos_qr%rowtype; r jsonb; pid uuid;
BEGIN
  SELECT * INTO m FROM public.catalogos_qr_mesas WHERE public_token=p_token AND activo;
  IF NOT FOUND THEN RAISE EXCEPTION 'MESA_QR_NO_DISPONIBLE'; END IF;
  SELECT * INTO c FROM public.catalogos_qr WHERE id=m.catalogo_id AND empresa_id=m.empresa_id AND estado='Activo';
  IF NOT FOUND OR (c.expira_el IS NOT NULL AND c.expira_el < current_date)
    OR NOT EXISTS (SELECT 1 FROM public.empresas e WHERE e.id=m.empresa_id
      AND coalesce((e.configuracion->'ajustes'->>'enable_table_qr_orders')::boolean,false)) THEN
    RAISE EXCEPTION 'PEDIDOS_QR_MESA_DESACTIVADOS';
  END IF;
  -- Reutiliza las validaciones actuales de catálogo, productos y stock.
  r := public.crear_pedido_catalogo_qr_publico(c.public_token, 'Mesa ' || m.nombre, '00000000', p_items, p_nota);
  pid := (r->>'id')::uuid;
  UPDATE public.pedidos SET mesa_id=m.id, mesa_nombre=m.nombre,
    cliente_nombre=m.nombre, cliente_telefono=NULL, origen='catalogo_qr_mesa'
  WHERE id=pid AND empresa_id=m.empresa_id;
  RETURN r || jsonb_build_object('mesa', m.nombre);
END $$;

REVOKE ALL ON FUNCTION public.obtener_mesa_qr_publica(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.obtener_mesa_qr_publica(uuid) TO anon, authenticated;
REVOKE ALL ON FUNCTION public.crear_pedido_mesa_qr_publico(uuid,jsonb,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.crear_pedido_mesa_qr_publico(uuid,jsonb,text) TO anon, authenticated;
