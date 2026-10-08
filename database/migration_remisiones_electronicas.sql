-- Registro multiempresa de documentos electrónicos de traslado enviados a Goekua.
-- Las filas se crean/actualizan exclusivamente desde Edge Function con service role.
BEGIN;

CREATE TABLE IF NOT EXISTS public.remisiones_electronicas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  solicitud_id uuid NOT NULL,
  origen_tipo text NOT NULL CHECK (origen_tipo IN ('venta', 'transferencia')),
  venta_id integer REFERENCES public.ventas(id) ON DELETE RESTRICT,
  transferencia_id uuid REFERENCES public.transferencias_stock(id) ON DELETE RESTRICT,
  punto_expedicion text NOT NULL CHECK (punto_expedicion ~ '^[0-9]{3}$'),
  numero_documento text NOT NULL CHECK (numero_documento ~ '^[0-9]{1,7}$'),
  goekua_id text,
  cdc text,
  estado text NOT NULL CHECK (estado IN ('EN_PROCESO', 'EMITIDA', 'RECHAZADA', 'INCIERTA')),
  origen_nombre text NOT NULL,
  destino_nombre text NOT NULL,
  motivo text NOT NULL,
  fecha_traslado timestamptz NOT NULL,
  payload jsonb NOT NULL CHECK (jsonb_typeof(payload) = 'object'),
  respuesta jsonb CHECK (respuesta IS NULL OR jsonb_typeof(respuesta) = 'object'),
  error_respuesta text,
  creado_por uuid NOT NULL,
  creado_en timestamptz NOT NULL DEFAULT now(),
  actualizado_en timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT remisiones_solicitud_unica UNIQUE (empresa_id, solicitud_id),
  CONSTRAINT remisiones_origen_coherente CHECK (
    (origen_tipo = 'venta' AND venta_id IS NOT NULL AND transferencia_id IS NULL)
    OR (origen_tipo = 'transferencia' AND transferencia_id IS NOT NULL AND venta_id IS NULL)
  ),
  CONSTRAINT remisiones_serie_numero_unico UNIQUE (empresa_id, punto_expedicion, numero_documento)
);

CREATE INDEX IF NOT EXISTS remisiones_empresa_fecha_idx
  ON public.remisiones_electronicas (empresa_id, creado_en DESC);
CREATE INDEX IF NOT EXISTS remisiones_empresa_estado_idx
  ON public.remisiones_electronicas (empresa_id, estado, creado_en DESC);

ALTER TABLE public.remisiones_electronicas ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.remisiones_electronicas FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.remisiones_electronicas TO authenticated;
GRANT ALL ON public.remisiones_electronicas TO service_role;

DROP POLICY IF EXISTS remisiones_empresa_select ON public.remisiones_electronicas;
CREATE POLICY remisiones_empresa_select
  ON public.remisiones_electronicas
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.usuarios u
    WHERE u.auth_user_id = auth.uid()
      AND u.empresa_id = remisiones_electronicas.empresa_id
      AND u.activo = true AND u.permitir_acceso = true
  ));

COMMIT;
