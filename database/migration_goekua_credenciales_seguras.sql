-- Credenciales de Goekua cifradas y aisladas de las consultas del navegador.
-- El cifrado/descifrado ocurre en Edge Functions con GOEKUA_ENCRYPTION_KEY.
BEGIN;

CREATE TABLE IF NOT EXISTS public.goekua_credenciales (
  empresa_id uuid PRIMARY KEY REFERENCES public.empresas(id) ON DELETE CASCADE,
  ambiente text NOT NULL CHECK (ambiente IN ('staging', 'production')),
  api_key_cifrada text NOT NULL,
  api_key_iv text NOT NULL,
  base_url text NOT NULL CHECK (base_url ~ '^https://'),
  activa boolean NOT NULL DEFAULT false,
  actualizada_en timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.goekua_credenciales ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.goekua_credenciales FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.goekua_credenciales TO service_role;

-- PostgreSQL acumula privilegios de tabla y columna. Quitamos los permisos
-- generales y reotorgamos cada columna excepto la clave heredada en claro.
DO $$
DECLARE columnas text;
BEGIN
  SELECT string_agg(format('%I', attname), ', ' ORDER BY attnum)
    INTO columnas
    FROM pg_attribute
   WHERE attrelid = 'public.empresas'::regclass
     AND attnum > 0 AND NOT attisdropped AND attname <> 'fe_api_key';
  REVOKE SELECT, UPDATE ON public.empresas FROM PUBLIC, anon, authenticated;
  EXECUTE format('GRANT SELECT (%s), UPDATE (%s) ON public.empresas TO authenticated', columnas, columnas);
END $$;

-- Compatibilidad con empresas antiguas: jamás aceptar nuevas claves en claro.
CREATE OR REPLACE FUNCTION public.limpiar_api_key_goekua_en_claro()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  NEW.fe_api_key := NULL;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS empresas_limpiar_api_key_goekua ON public.empresas;
CREATE TRIGGER empresas_limpiar_api_key_goekua
  BEFORE INSERT OR UPDATE OF fe_api_key ON public.empresas
  FOR EACH ROW EXECUTE FUNCTION public.limpiar_api_key_goekua_en_claro();

COMMIT;
