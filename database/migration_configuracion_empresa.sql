-- Persistencia de las opciones de configuración de empresa de PyPOS.
-- Aditiva e idempotente para no alterar datos existentes.
ALTER TABLE public.empresas
  ADD COLUMN IF NOT EXISTS ruc text,
  ADD COLUMN IF NOT EXISTS logo_url text,
  ADD COLUMN IF NOT EXISTS configuracion jsonb NOT NULL DEFAULT '{}'::jsonb;
