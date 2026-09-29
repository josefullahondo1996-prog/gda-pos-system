-- Pedidos de preparación de clientes.
-- Esta tabla no genera ventas, cobros ni movimientos de existencias.
CREATE TABLE IF NOT EXISTS public.pedidos (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id uuid NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
    numero_pedido text NOT NULL,
    cliente_id text,
    cliente_nombre text NOT NULL,
    cliente_telefono text,
    fecha_entrega date,
    estado text NOT NULL DEFAULT 'pendiente'
        CHECK (estado IN ('pendiente', 'en_preparacion', 'completado', 'cancelado')),
    items jsonb NOT NULL DEFAULT '[]'::jsonb
        CHECK (jsonb_typeof(items) = 'array'),
    total numeric(14, 2) NOT NULL DEFAULT 0 CHECK (total >= 0),
    nota text,
    creado_en timestamptz NOT NULL DEFAULT now(),
    actualizado_en timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT pedidos_empresa_numero_unico UNIQUE (empresa_id, numero_pedido)
);

CREATE INDEX IF NOT EXISTS idx_pedidos_empresa_fecha
    ON public.pedidos (empresa_id, creado_en DESC);
CREATE INDEX IF NOT EXISTS idx_pedidos_empresa_estado
    ON public.pedidos (empresa_id, estado);

ALTER TABLE public.pedidos ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE ON public.pedidos TO authenticated;

DROP POLICY IF EXISTS pedidos_select_empresa ON public.pedidos;
CREATE POLICY pedidos_select_empresa
    ON public.pedidos FOR SELECT TO authenticated
    USING (EXISTS (
        SELECT 1 FROM public.usuarios u
        WHERE u.auth_user_id = auth.uid()
          AND u.empresa_id = pedidos.empresa_id
          AND u.activo = true
          AND u.permitir_acceso = true
    ));

DROP POLICY IF EXISTS pedidos_insert_empresa ON public.pedidos;
CREATE POLICY pedidos_insert_empresa
    ON public.pedidos FOR INSERT TO authenticated
    WITH CHECK (EXISTS (
        SELECT 1 FROM public.usuarios u
        WHERE u.auth_user_id = auth.uid()
          AND u.empresa_id = pedidos.empresa_id
          AND u.activo = true
          AND u.permitir_acceso = true
    ));

DROP POLICY IF EXISTS pedidos_update_empresa ON public.pedidos;
CREATE POLICY pedidos_update_empresa
    ON public.pedidos FOR UPDATE TO authenticated
    USING (EXISTS (
        SELECT 1 FROM public.usuarios u
        WHERE u.auth_user_id = auth.uid()
          AND u.empresa_id = pedidos.empresa_id
          AND u.activo = true
          AND u.permitir_acceso = true
    ))
    WITH CHECK (EXISTS (
        SELECT 1 FROM public.usuarios u
        WHERE u.auth_user_id = auth.uid()
          AND u.empresa_id = pedidos.empresa_id
          AND u.activo = true
          AND u.permitir_acceso = true
    ));
