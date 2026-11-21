-- Delivery conectado con cocina, seguimiento, auditoria y acceso por repartidor.
-- Aplicar despues de migration_restaurante_delivery.sql y
-- migration_restaurante_estado_pedido_cliente.sql.

ALTER TABLE public.pedidos
  ADD COLUMN IF NOT EXISTS delivery_cancelado_motivo text;
ALTER TABLE public.pedidos ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.delivery_usuario_puede_administrar(p_empresa_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.usuarios u
    LEFT JOIN public.roles r ON r.id = u.rol_id AND r.empresa_id = u.empresa_id
    WHERE u.auth_user_id = auth.uid()
      AND u.empresa_id = p_empresa_id
      AND u.activo IS TRUE
      AND u.permitir_acceso IS TRUE
      AND (
        lower(coalesce(r.nombre, '')) LIKE '%admin%'
        OR coalesce(r.permisos #>> '{ventas_pos,Acceder al Punto de Venta}', 'false') = 'true'
      )
  );
$$;
REVOKE ALL ON FUNCTION public.delivery_usuario_puede_administrar(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delivery_usuario_puede_administrar(uuid) TO authenticated;

-- Los empleados autorizados de Restaurante administran zonas y asignaciones.
-- Un repartidor solo puede consultar su propia asignacion.
DROP POLICY IF EXISTS delivery_zonas_empresa ON public.delivery_zonas;
DROP POLICY IF EXISTS delivery_zonas_admin_select ON public.delivery_zonas;
DROP POLICY IF EXISTS delivery_zonas_admin_insert ON public.delivery_zonas;
DROP POLICY IF EXISTS delivery_zonas_admin_update ON public.delivery_zonas;
DROP POLICY IF EXISTS delivery_zonas_admin_delete ON public.delivery_zonas;
CREATE POLICY delivery_zonas_admin_select ON public.delivery_zonas
  FOR SELECT TO authenticated
  USING (public.delivery_usuario_puede_administrar(empresa_id));
CREATE POLICY delivery_zonas_admin_insert ON public.delivery_zonas
  FOR INSERT TO authenticated
  WITH CHECK (public.delivery_usuario_puede_administrar(empresa_id));
CREATE POLICY delivery_zonas_admin_update ON public.delivery_zonas
  FOR UPDATE TO authenticated
  USING (public.delivery_usuario_puede_administrar(empresa_id))
  WITH CHECK (public.delivery_usuario_puede_administrar(empresa_id));
CREATE POLICY delivery_zonas_admin_delete ON public.delivery_zonas
  FOR DELETE TO authenticated
  USING (public.delivery_usuario_puede_administrar(empresa_id));

DROP POLICY IF EXISTS delivery_repartidores_empresa ON public.delivery_repartidores;
DROP POLICY IF EXISTS delivery_repartidores_select_own_or_admin ON public.delivery_repartidores;
DROP POLICY IF EXISTS delivery_repartidores_admin_insert ON public.delivery_repartidores;
DROP POLICY IF EXISTS delivery_repartidores_admin_update ON public.delivery_repartidores;
DROP POLICY IF EXISTS delivery_repartidores_admin_delete ON public.delivery_repartidores;
CREATE POLICY delivery_repartidores_select_own_or_admin ON public.delivery_repartidores
  FOR SELECT TO authenticated
  USING (
    public.delivery_usuario_puede_administrar(empresa_id)
    OR (usuario_auth_id = auth.uid() AND EXISTS (
      SELECT 1 FROM public.usuarios u
      WHERE u.auth_user_id = auth.uid() AND u.empresa_id = delivery_repartidores.empresa_id
        AND u.activo IS TRUE AND u.permitir_acceso IS TRUE
    ))
  );
CREATE POLICY delivery_repartidores_admin_insert ON public.delivery_repartidores
  FOR INSERT TO authenticated
  WITH CHECK (
    public.delivery_usuario_puede_administrar(empresa_id)
    AND EXISTS (SELECT 1 FROM public.usuarios u WHERE u.auth_user_id=usuario_auth_id
      AND u.empresa_id=delivery_repartidores.empresa_id AND u.activo IS TRUE AND u.permitir_acceso IS TRUE)
  );
CREATE POLICY delivery_repartidores_admin_update ON public.delivery_repartidores
  FOR UPDATE TO authenticated
  USING (public.delivery_usuario_puede_administrar(empresa_id))
  WITH CHECK (
    public.delivery_usuario_puede_administrar(empresa_id)
    AND EXISTS (SELECT 1 FROM public.usuarios u WHERE u.auth_user_id=usuario_auth_id
      AND u.empresa_id=delivery_repartidores.empresa_id AND u.activo IS TRUE AND u.permitir_acceso IS TRUE)
  );
CREATE POLICY delivery_repartidores_admin_delete ON public.delivery_repartidores
  FOR DELETE TO authenticated
  USING (public.delivery_usuario_puede_administrar(empresa_id));

-- Las politicas existentes siguen protegiendo la empresa. Estas politicas restrictivas
-- agregan el limite por repartidor sin cambiar el acceso de otros tipos de pedidos.
DROP POLICY IF EXISTS pedidos_delivery_select_scope ON public.pedidos;
CREATE POLICY pedidos_delivery_select_scope ON public.pedidos
  AS RESTRICTIVE FOR SELECT TO authenticated
  USING (
    delivery_tipo <> 'delivery'
    OR public.delivery_usuario_puede_administrar(empresa_id)
  OR EXISTS (
      SELECT 1 FROM public.delivery_repartidores d
      WHERE d.empresa_id = pedidos.empresa_id
        AND d.usuario_auth_id = auth.uid()
        AND d.activo IS TRUE
        AND pedidos.delivery_repartidor_id = auth.uid()
        AND EXISTS (SELECT 1 FROM public.usuarios u WHERE u.auth_user_id=auth.uid()
          AND u.empresa_id=pedidos.empresa_id AND u.activo IS TRUE AND u.permitir_acceso IS TRUE)
    )
  );

DROP POLICY IF EXISTS pedidos_delivery_update_admin_only ON public.pedidos;
CREATE POLICY pedidos_delivery_update_admin_only ON public.pedidos
  AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (delivery_tipo <> 'delivery' OR public.delivery_usuario_puede_administrar(empresa_id))
  WITH CHECK (delivery_tipo <> 'delivery' OR public.delivery_usuario_puede_administrar(empresa_id));

CREATE TABLE IF NOT EXISTS public.pedidos_delivery_eventos (
  id bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  empresa_id uuid NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  pedido_id uuid NOT NULL REFERENCES public.pedidos(id) ON DELETE CASCADE,
  numero_pedido text NOT NULL,
  evento text NOT NULL CHECK (evento IN ('pedido_recibido','estado_cambiado','pedido_cancelado','repartidor_cambiado')),
  estado_anterior text,
  estado_nuevo text,
  repartidor_anterior_id uuid,
  repartidor_nuevo_id uuid,
  motivo text,
  usuario_id uuid,
  creado_en timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS pedidos_delivery_eventos_empresa_fecha_idx
  ON public.pedidos_delivery_eventos(empresa_id, creado_en DESC);
CREATE INDEX IF NOT EXISTS pedidos_delivery_eventos_pedido_fecha_idx
  ON public.pedidos_delivery_eventos(pedido_id, creado_en DESC);

ALTER TABLE public.pedidos_delivery_eventos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS pedidos_delivery_eventos_select_scope ON public.pedidos_delivery_eventos;
CREATE POLICY pedidos_delivery_eventos_select_scope ON public.pedidos_delivery_eventos
  FOR SELECT TO authenticated
  USING (
    public.delivery_usuario_puede_administrar(empresa_id)
    OR EXISTS (
      SELECT 1 FROM public.pedidos p
      JOIN public.delivery_repartidores d ON d.empresa_id=p.empresa_id
        AND d.usuario_auth_id=auth.uid() AND d.activo IS TRUE
      JOIN public.usuarios u ON u.empresa_id=p.empresa_id
        AND u.auth_user_id=auth.uid() AND u.activo IS TRUE AND u.permitir_acceso IS TRUE
      WHERE p.id=pedidos_delivery_eventos.pedido_id
        AND p.delivery_repartidor_id=auth.uid()
    )
  );
GRANT SELECT ON public.pedidos_delivery_eventos TO authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.pedidos_delivery_eventos FROM authenticated;

CREATE OR REPLACE FUNCTION public.registrar_evento_pedido_delivery()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE v_evento text;
BEGIN
  IF NEW.delivery_tipo IS DISTINCT FROM 'delivery' THEN RETURN NEW; END IF;
  IF TG_OP = 'INSERT' THEN
    v_evento := 'pedido_recibido';
  ELSIF OLD.delivery_tipo IS DISTINCT FROM NEW.delivery_tipo THEN
    v_evento := 'pedido_recibido';
  ELSIF OLD.delivery_estado IS DISTINCT FROM NEW.delivery_estado THEN
    v_evento := CASE WHEN NEW.delivery_estado = 'cancelado' THEN 'pedido_cancelado' ELSE 'estado_cambiado' END;
  ELSIF OLD.delivery_repartidor_id IS DISTINCT FROM NEW.delivery_repartidor_id THEN
    v_evento := 'repartidor_cambiado';
  ELSE
    RETURN NEW;
  END IF;

  INSERT INTO public.pedidos_delivery_eventos (
    empresa_id, pedido_id, numero_pedido, evento,
    estado_anterior, estado_nuevo, repartidor_anterior_id, repartidor_nuevo_id,
    motivo, usuario_id
  ) VALUES (
    NEW.empresa_id, NEW.id, NEW.numero_pedido, v_evento,
    CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE OLD.delivery_estado END,
    NEW.delivery_estado,
    CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE OLD.delivery_repartidor_id END,
    NEW.delivery_repartidor_id,
    CASE WHEN NEW.delivery_estado = 'cancelado' THEN nullif(btrim(coalesce(NEW.delivery_cancelado_motivo,'')), '') ELSE NULL END,
    auth.uid()
  );
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.registrar_evento_pedido_delivery() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS pedidos_delivery_eventos_audit ON public.pedidos;
CREATE TRIGGER pedidos_delivery_eventos_audit
  AFTER INSERT OR UPDATE
  ON public.pedidos
  FOR EACH ROW EXECUTE FUNCTION public.registrar_evento_pedido_delivery();

CREATE OR REPLACE FUNCTION public.actualizar_estado_pedido_delivery_repartidor(
  p_pedido_id uuid,
  p_estado_nuevo text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE v_pedido public.pedidos%rowtype;
BEGIN
  IF auth.uid() IS NULL OR p_pedido_id IS NULL OR p_estado_nuevo IS NULL OR p_estado_nuevo NOT IN ('en_camino','entregado') THEN
    RAISE EXCEPTION 'CAMBIO_ESTADO_DELIVERY_INVALIDO';
  END IF;
  SELECT p.* INTO v_pedido
  FROM public.pedidos p
  JOIN public.delivery_repartidores d
    ON d.empresa_id = p.empresa_id AND d.usuario_auth_id = auth.uid() AND d.activo IS TRUE
  JOIN public.usuarios u
    ON u.empresa_id = p.empresa_id AND u.auth_user_id = auth.uid()
      AND u.activo IS TRUE AND u.permitir_acceso IS TRUE
  WHERE p.id = p_pedido_id
    AND p.delivery_tipo = 'delivery'
    AND p.delivery_repartidor_id = auth.uid()
  FOR UPDATE OF p;
  IF NOT FOUND THEN RAISE EXCEPTION 'PEDIDO_DELIVERY_NO_ASIGNADO'; END IF;

  IF p_estado_nuevo = 'en_camino' AND (v_pedido.estado <> 'completado' OR v_pedido.delivery_estado NOT IN ('asignado','listo')) THEN
    RAISE EXCEPTION 'PEDIDO_DELIVERY_NO_LISTO_PARA_SALIR';
  ELSIF p_estado_nuevo = 'entregado' AND v_pedido.delivery_estado <> 'en_camino' THEN
    RAISE EXCEPTION 'PEDIDO_DELIVERY_NO_ESTA_EN_CAMINO';
  END IF;

  UPDATE public.pedidos
  SET delivery_estado = p_estado_nuevo,
      delivery_actualizado_en = now()
  WHERE id = v_pedido.id AND empresa_id = v_pedido.empresa_id;

  RETURN jsonb_build_object('id',v_pedido.id,'numero_pedido',v_pedido.numero_pedido,'delivery_estado',p_estado_nuevo);
END;
$$;
REVOKE ALL ON FUNCTION public.actualizar_estado_pedido_delivery_repartidor(uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.actualizar_estado_pedido_delivery_repartidor(uuid,text) TO authenticated;

-- El seguimiento publico mantiene el estado de cocina y expone por separado el estado de delivery.
CREATE OR REPLACE FUNCTION public.obtener_estado_pedido_qr_publico(p_pedido_id uuid)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT jsonb_build_object(
    'numero_pedido',p.numero_pedido,
    'mesa',p.mesa_nombre,
    'estado',p.estado,
    'delivery_tipo',p.delivery_tipo,
    'delivery_estado',CASE WHEN p.delivery_tipo='delivery' THEN p.delivery_estado ELSE NULL END,
    'total',p.total,
    'ultima_correccion_en',(SELECT max(c.creado_en) FROM public.pedidos_qr_cambios c WHERE c.pedido_id=p.id),
    'creado_en',p.creado_en,
    'actualizado_en',p.actualizado_en,
    'delivery_actualizado_en',p.delivery_actualizado_en
  )
  FROM public.pedidos p
  WHERE p.id=p_pedido_id
    AND p.origen IN ('catalogo_qr','catalogo_qr_mesa')
$$;
REVOKE ALL ON FUNCTION public.obtener_estado_pedido_qr_publico(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.obtener_estado_pedido_qr_publico(uuid) TO anon, authenticated;
