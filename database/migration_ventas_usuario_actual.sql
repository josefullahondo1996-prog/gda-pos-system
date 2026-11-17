-- Asigna cada venta al perfil autenticado que la registró.
-- No reemplaza registrar_venta ni modifica su transacción atómica.

ALTER TABLE public.ventas
  ADD COLUMN IF NOT EXISTS usuario_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'ventas_usuario_id_fkey'
      AND conrelid = 'public.ventas'::regclass
  ) THEN
    ALTER TABLE public.ventas
      ADD CONSTRAINT ventas_usuario_id_fkey
      FOREIGN KEY (usuario_id)
      REFERENCES public.usuarios(id)
      ON DELETE SET NULL;
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS idx_ventas_empresa_usuario_fecha
  ON public.ventas (empresa_id, usuario_id, fecha DESC);

CREATE OR REPLACE FUNCTION public.asignar_usuario_autenticado_a_venta()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_usuario_id uuid;
  v_nombre text;
BEGIN
  -- Las ventas hechas desde una sesión Auth siempre se vinculan al usuario
  -- real del JWT; no confiamos en el nombre que envíe el navegador.
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT
    u.id,
    COALESCE(
      NULLIF(BTRIM(CONCAT_WS(' ', u.nombre, u.apellido)), ''),
      NULLIF(BTRIM(u.nombre_usuario), '')
    )
  INTO v_usuario_id, v_nombre
  FROM public.usuarios AS u
  WHERE u.auth_user_id = auth.uid()
    AND u.empresa_id = NEW.empresa_id
    AND u.activo = true
    AND u.permitir_acceso = true
  ORDER BY u.id
  LIMIT 1;

  IF v_usuario_id IS NOT NULL THEN
    NEW.usuario_id := v_usuario_id;
    NEW.usuario_nombre := COALESCE(v_nombre, NEW.usuario_nombre);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_ventas_usuario_autenticado ON public.ventas;
CREATE TRIGGER trigger_ventas_usuario_autenticado
  BEFORE INSERT ON public.ventas
  FOR EACH ROW
  EXECUTE FUNCTION public.asignar_usuario_autenticado_a_venta();
