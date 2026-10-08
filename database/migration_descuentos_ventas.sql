-- Reglas de descuento de venta por empresa. Esta tabla no modifica ventas,
-- precios ni stock existentes; el POS debe aplicar las reglas explícitamente.
CREATE TABLE IF NOT EXISTS public.descuentos_ventas (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id uuid NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
    nombre text NOT NULL CHECK (length(trim(nombre)) BETWEEN 1 AND 120),
    fecha_inicio timestamptz,
    fecha_fin timestamptz,
    tipo text NOT NULL DEFAULT 'porcentaje' CHECK (tipo IN ('porcentaje', 'monto')),
    valor numeric(14,2) NOT NULL CHECK (valor > 0),
    prioridad integer NOT NULL DEFAULT 1 CHECK (prioridad >= 0),
    marca text,
    categoria text,
    producto_ids integer[] NOT NULL DEFAULT '{}',
    ubicacion_ids uuid[] NOT NULL DEFAULT '{}',
    activo boolean NOT NULL DEFAULT true,
    creado_en timestamptz NOT NULL DEFAULT now(),
    actualizado_en timestamptz NOT NULL DEFAULT now(),
    CHECK (fecha_inicio IS NULL OR fecha_fin IS NULL OR fecha_fin > fecha_inicio),
    CHECK (tipo <> 'porcentaje' OR valor <= 100)
);

CREATE INDEX IF NOT EXISTS descuentos_ventas_empresa_activo_idx
    ON public.descuentos_ventas (empresa_id, activo, prioridad DESC);

ALTER TABLE public.descuentos_ventas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS descuentos_ventas_select_empresa ON public.descuentos_ventas;
CREATE POLICY descuentos_ventas_select_empresa ON public.descuentos_ventas
    FOR SELECT TO authenticated USING (empresa_id = public.mi_empresa_id());

DROP POLICY IF EXISTS descuentos_ventas_insert_empresa ON public.descuentos_ventas;
CREATE POLICY descuentos_ventas_insert_empresa ON public.descuentos_ventas
    FOR INSERT TO authenticated WITH CHECK (empresa_id = public.mi_empresa_id());

DROP POLICY IF EXISTS descuentos_ventas_update_empresa ON public.descuentos_ventas;
CREATE POLICY descuentos_ventas_update_empresa ON public.descuentos_ventas
    FOR UPDATE TO authenticated USING (empresa_id = public.mi_empresa_id())
    WITH CHECK (empresa_id = public.mi_empresa_id());

DROP POLICY IF EXISTS descuentos_ventas_delete_empresa ON public.descuentos_ventas;
CREATE POLICY descuentos_ventas_delete_empresa ON public.descuentos_ventas
    FOR DELETE TO authenticated USING (empresa_id = public.mi_empresa_id());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.descuentos_ventas TO authenticated;
REVOKE ALL ON public.descuentos_ventas FROM anon;
