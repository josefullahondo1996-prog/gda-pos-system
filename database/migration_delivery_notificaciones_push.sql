-- Suscripciones Web Push para avisar al repartidor cuando le asignan un pedido.
-- Ejecutar despues de migration_restaurante_delivery_operacion_segura.sql.

CREATE TABLE IF NOT EXISTS public.delivery_push_suscripciones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  usuario_auth_id uuid NOT NULL,
  endpoint text NOT NULL UNIQUE,
  p256dh text NOT NULL,
  auth text NOT NULL,
  actualizado_en timestamptz NOT NULL DEFAULT now(),
  UNIQUE (empresa_id, usuario_auth_id, endpoint)
);

ALTER TABLE public.delivery_push_suscripciones ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.delivery_push_suscripciones TO authenticated;

DROP POLICY IF EXISTS delivery_push_suscripciones_select ON public.delivery_push_suscripciones;
CREATE POLICY delivery_push_suscripciones_select ON public.delivery_push_suscripciones
  FOR SELECT TO authenticated
  USING (
    usuario_auth_id = auth.uid()
    OR public.delivery_usuario_puede_administrar(empresa_id)
  );

DROP POLICY IF EXISTS delivery_push_suscripciones_insert ON public.delivery_push_suscripciones;
CREATE POLICY delivery_push_suscripciones_insert ON public.delivery_push_suscripciones
  FOR INSERT TO authenticated
  WITH CHECK (
    usuario_auth_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.usuarios u
      JOIN public.delivery_repartidores d
        ON d.empresa_id = u.empresa_id AND d.usuario_auth_id = u.auth_user_id AND d.activo IS TRUE
      WHERE u.auth_user_id = auth.uid() AND u.empresa_id = delivery_push_suscripciones.empresa_id
        AND u.activo IS TRUE AND u.permitir_acceso IS TRUE
    )
  );

DROP POLICY IF EXISTS delivery_push_suscripciones_update ON public.delivery_push_suscripciones;
CREATE POLICY delivery_push_suscripciones_update ON public.delivery_push_suscripciones
  FOR UPDATE TO authenticated
  USING (usuario_auth_id = auth.uid())
  WITH CHECK (
    usuario_auth_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.usuarios u
      JOIN public.delivery_repartidores d
        ON d.empresa_id = u.empresa_id AND d.usuario_auth_id = u.auth_user_id AND d.activo IS TRUE
      WHERE u.auth_user_id = auth.uid() AND u.empresa_id = delivery_push_suscripciones.empresa_id
        AND u.activo IS TRUE AND u.permitir_acceso IS TRUE
    )
  );

DROP POLICY IF EXISTS delivery_push_suscripciones_delete ON public.delivery_push_suscripciones;
CREATE POLICY delivery_push_suscripciones_delete ON public.delivery_push_suscripciones
  FOR DELETE TO authenticated
  USING (usuario_auth_id = auth.uid());

CREATE INDEX IF NOT EXISTS delivery_push_suscripciones_usuario_idx
  ON public.delivery_push_suscripciones (empresa_id, usuario_auth_id);
