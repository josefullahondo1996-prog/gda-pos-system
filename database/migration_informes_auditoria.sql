-- Auditoría de operaciones del POS, aislada por empresa y complementaria a las RPC existentes.
CREATE TABLE IF NOT EXISTS public.eventos_auditoria (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  ocurrido_en timestamptz NOT NULL DEFAULT now(),
  usuario_auth_id uuid,
  usuario_nombre text,
  accion text NOT NULL,
  tabla text NOT NULL,
  registro_id text,
  ubicacion_id text,
  detalle jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS eventos_auditoria_empresa_fecha_idx
  ON public.eventos_auditoria (empresa_id, ocurrido_en DESC);
CREATE INDEX IF NOT EXISTS eventos_auditoria_empresa_tabla_idx
  ON public.eventos_auditoria (empresa_id, tabla, ocurrido_en DESC);

ALTER TABLE public.eventos_auditoria ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'eventos_auditoria'
      AND policyname = 'eventos_auditoria_select_empresa'
  ) THEN
    CREATE POLICY eventos_auditoria_select_empresa
      ON public.eventos_auditoria FOR SELECT TO authenticated
      USING (EXISTS (
        SELECT 1 FROM public.usuarios u
        WHERE u.auth_user_id = auth.uid()
          AND u.empresa_id = eventos_auditoria.empresa_id
          AND u.activo = true AND u.permitir_acceso = true
      ));
  END IF;
END;
$$;
REVOKE ALL ON public.eventos_auditoria FROM anon, authenticated;
GRANT SELECT ON public.eventos_auditoria TO authenticated;

CREATE OR REPLACE FUNCTION public.registrar_evento_auditoria_fila()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $$
DECLARE
  v_fila jsonb;
  v_anterior jsonb;
  v_empresa_id uuid;
  v_usuario_nombre text;
BEGIN
  v_fila := CASE WHEN TG_OP = 'DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END;
  v_anterior := CASE WHEN TG_OP = 'INSERT' THEN '{}'::jsonb ELSE to_jsonb(OLD) END;
  v_empresa_id := NULLIF(v_fila->>'empresa_id', '')::uuid;
  IF v_empresa_id IS NULL THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
  END IF;

  SELECT NULLIF(trim(concat_ws(' ', u.nombre, u.apellido)), '')
    INTO v_usuario_nombre
  FROM public.usuarios u
  WHERE u.auth_user_id = auth.uid() AND u.empresa_id = v_empresa_id
  LIMIT 1;

  INSERT INTO public.eventos_auditoria (
    empresa_id, usuario_auth_id, usuario_nombre, accion, tabla,
    registro_id, ubicacion_id, detalle
  ) VALUES (
    v_empresa_id, auth.uid(), COALESCE(v_usuario_nombre, auth.uid()::text),
    TG_OP, TG_TABLE_NAME, v_fila->>'id', v_fila->>'ubicacion_id',
    jsonb_build_object(
      'anterior', v_anterior - 'password' - 'access_token' - 'refresh_token' - 'api_key' - 'clave_acceso',
      'actual', v_fila - 'password' - 'access_token' - 'refresh_token' - 'api_key' - 'clave_acceso'
    )
  );
  IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END;
$$;

DO $$
DECLARE
  v_tabla text;
BEGIN
  FOREACH v_tabla IN ARRAY ARRAY[
    'ventas', 'compras', 'detalle_ventas', 'detalle_compras', 'pagos_clientes',
    'pagos_compras', 'gastos', 'productos', 'producto_stock_ubicacion',
    'ajustes_stock', 'transferencias_stock', 'clientes', 'proveedores',
    'caja_registros', 'cuentas_caja'
  ] LOOP
    IF to_regclass(format('public.%I', v_tabla)) IS NOT NULL THEN
      IF NOT EXISTS (
        SELECT 1 FROM pg_trigger
        WHERE tgrelid = to_regclass(format('public.%I', v_tabla))
          AND tgname = 'auditar_cambios_pos'
          AND NOT tgisinternal
      ) THEN
        EXECUTE format(
          'CREATE TRIGGER auditar_cambios_pos AFTER INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.registrar_evento_auditoria_fila()',
          v_tabla
        );
      END IF;
    END IF;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.registrar_inicio_sesion_auditoria()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $$
DECLARE
  v_empresa_id uuid;
  v_usuario_nombre text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Se requiere una sesión autenticada';
  END IF;
  SELECT u.empresa_id, NULLIF(trim(concat_ws(' ', u.nombre, u.apellido)), '')
    INTO v_empresa_id, v_usuario_nombre
  FROM public.usuarios u
  WHERE u.auth_user_id = auth.uid() AND u.activo = true AND u.permitir_acceso = true
  LIMIT 1;
  IF v_empresa_id IS NULL THEN
    RAISE EXCEPTION 'Usuario no vinculado a una empresa activa';
  END IF;
  INSERT INTO public.eventos_auditoria (empresa_id, usuario_auth_id, usuario_nombre, accion, tabla, detalle)
  VALUES (v_empresa_id, auth.uid(), COALESCE(v_usuario_nombre, auth.uid()::text), 'INICIO_SESION', 'auth', '{}'::jsonb);
END;
$$;
REVOKE ALL ON FUNCTION public.registrar_inicio_sesion_auditoria() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.registrar_inicio_sesion_auditoria() TO authenticated;
