-- Registra pagos de reembolsos de ventas y descuenta su cuenta en forma atómica.
BEGIN;

ALTER TABLE public.devoluciones_ventas
  ADD COLUMN IF NOT EXISTS monto_reembolsado numeric(14,2) NOT NULL DEFAULT 0;
ALTER TABLE public.devoluciones_ventas
  ADD COLUMN IF NOT EXISTS estado_reembolso text NOT NULL DEFAULT 'pendiente';

DO $constraint$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.devoluciones_ventas'::regclass
      AND conname = 'devoluciones_ventas_estado_reembolso_check'
  ) THEN
    ALTER TABLE public.devoluciones_ventas
      ADD CONSTRAINT devoluciones_ventas_estado_reembolso_check
      CHECK (estado_reembolso IN ('pendiente', 'parcial', 'pagado'));
  END IF;
END;
$constraint$;

CREATE TABLE IF NOT EXISTS public.pagos_devoluciones_ventas (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  empresa_id uuid NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  devolucion_id bigint NOT NULL REFERENCES public.devoluciones_ventas(id),
  cuenta_id uuid NOT NULL REFERENCES public.cuentas_caja(id),
  monto numeric(14,2) NOT NULL CHECK (monto > 0),
  metodo_pago text NOT NULL,
  nota text,
  pagado_en timestamptz NOT NULL DEFAULT now(),
  creado_por uuid,
  creado_en timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS pagos_devoluciones_ventas_empresa_fecha_idx
  ON public.pagos_devoluciones_ventas (empresa_id, pagado_en DESC);
CREATE INDEX IF NOT EXISTS pagos_devoluciones_ventas_devolucion_idx
  ON public.pagos_devoluciones_ventas (empresa_id, devolucion_id);
ALTER TABLE public.pagos_devoluciones_ventas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS pagos_devoluciones_ventas_select_empresa ON public.pagos_devoluciones_ventas;
CREATE POLICY pagos_devoluciones_ventas_select_empresa ON public.pagos_devoluciones_ventas
  FOR SELECT TO authenticated USING (empresa_id = public.mi_empresa_id());
GRANT SELECT ON public.pagos_devoluciones_ventas TO authenticated;
REVOKE ALL ON public.pagos_devoluciones_ventas FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.pagos_devoluciones_ventas FROM authenticated;

CREATE OR REPLACE FUNCTION public.registrar_pago_reembolso_venta(
  p_devolucion_id bigint,
  p_cuenta_id uuid,
  p_monto numeric,
  p_metodo_pago text,
  p_nota text DEFAULT NULL
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'auth'
AS $function$
DECLARE
  v_empresa_id uuid := public.mi_empresa_id();
  v_devolucion public.devoluciones_ventas%ROWTYPE;
  v_cuenta public.cuentas_caja%ROWTYPE;
  v_pago_id bigint;
  v_restante numeric(14,2);
  v_reembolsado_nuevo numeric(14,2);
  v_estado_nuevo text;
BEGIN
  IF auth.uid() IS NULL OR v_empresa_id IS NULL THEN
    RAISE EXCEPTION 'Se requiere una sesión autenticada con empresa';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.usuarios u
    WHERE u.auth_user_id = auth.uid() AND u.empresa_id = v_empresa_id
      AND u.activo = true AND u.permitir_acceso = true
  ) THEN RAISE EXCEPTION 'Usuario inactivo o sin permiso de acceso'; END IF;
  IF NOT public.tiene_permiso('ventas_pos', 'Devolver venta') AND NOT EXISTS (
    SELECT 1 FROM public.usuarios u JOIN public.roles r ON r.id = u.rol_id
    WHERE u.auth_user_id = auth.uid() AND u.empresa_id = v_empresa_id
      AND lower(r.nombre) LIKE '%admin%'
  ) THEN RAISE EXCEPTION 'No tenés permiso para pagar reembolsos'; END IF;
  IF p_monto IS NULL OR p_monto <= 0 OR p_monto > 999999999999.99
     OR round(p_monto, 2) <> p_monto THEN
    RAISE EXCEPTION 'El importe debe ser positivo y tener hasta dos decimales';
  END IF;
  IF NULLIF(btrim(p_metodo_pago), '') IS NULL OR length(p_metodo_pago) > 60 THEN
    RAISE EXCEPTION 'Seleccioná un método de pago válido';
  END IF;

  SELECT * INTO v_devolucion FROM public.devoluciones_ventas
  WHERE id = p_devolucion_id AND empresa_id = v_empresa_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Devolución no encontrada en esta empresa'; END IF;
  v_restante := GREATEST(0, COALESCE(v_devolucion.credito_cliente, 0)
    - COALESCE(v_devolucion.monto_reembolsado, 0));
  IF p_monto > v_restante THEN
    RAISE EXCEPTION 'El importe supera el reembolso pendiente (% disponible)', v_restante;
  END IF;

  SELECT * INTO v_cuenta FROM public.cuentas_caja
  WHERE id = p_cuenta_id AND empresa_id = v_empresa_id AND activo = true FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Cuenta de caja/banco no encontrada o inactiva'; END IF;
  IF COALESCE(v_cuenta.saldo, 0) < p_monto THEN
    RAISE EXCEPTION 'Saldo insuficiente en la cuenta seleccionada';
  END IF;

  INSERT INTO public.pagos_devoluciones_ventas
    (empresa_id, devolucion_id, cuenta_id, monto, metodo_pago, nota, creado_por)
  VALUES
    (v_empresa_id, p_devolucion_id, p_cuenta_id, p_monto,
     btrim(p_metodo_pago), NULLIF(btrim(p_nota), ''), auth.uid())
  RETURNING id INTO v_pago_id;

  v_reembolsado_nuevo := COALESCE(v_devolucion.monto_reembolsado, 0) + p_monto;
  v_estado_nuevo := CASE WHEN v_reembolsado_nuevo >= v_devolucion.credito_cliente
    THEN 'pagado' ELSE 'parcial' END;
  UPDATE public.devoluciones_ventas
  SET monto_reembolsado = v_reembolsado_nuevo, estado_reembolso = v_estado_nuevo
  WHERE id = p_devolucion_id AND empresa_id = v_empresa_id;
  UPDATE public.cuentas_caja
  SET saldo = COALESCE(saldo, 0) - p_monto
  WHERE id = p_cuenta_id AND empresa_id = v_empresa_id;
  RETURN v_pago_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.registrar_pago_reembolso_venta(bigint, uuid, numeric, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.registrar_pago_reembolso_venta(bigint, uuid, numeric, text, text) TO authenticated;
COMMIT;
