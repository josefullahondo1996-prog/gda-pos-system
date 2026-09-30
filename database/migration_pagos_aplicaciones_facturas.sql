-- Registra la distribución de cada cobro entre una o varias facturas.
-- Los pagos anteriores a esta migración quedan sin asignación histórica.
BEGIN;

ALTER TABLE public.pagos_clientes
  ALTER COLUMN cliente_id DROP NOT NULL;

CREATE TABLE IF NOT EXISTS public.pagos_clientes_aplicaciones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  pago_id uuid NOT NULL REFERENCES public.pagos_clientes(id) ON DELETE CASCADE,
  venta_id integer NOT NULL REFERENCES public.ventas(id) ON DELETE CASCADE,
  monto_aplicado numeric(12,2) NOT NULL CHECK (monto_aplicado > 0),
  creado_en timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pagos_clientes_aplicaciones_pago_venta_key UNIQUE (pago_id, venta_id)
);

CREATE INDEX IF NOT EXISTS pagos_clientes_aplicaciones_empresa_idx
  ON public.pagos_clientes_aplicaciones (empresa_id, creado_en DESC);
CREATE INDEX IF NOT EXISTS pagos_clientes_aplicaciones_venta_idx
  ON public.pagos_clientes_aplicaciones (venta_id, creado_en DESC);

ALTER TABLE public.pagos_clientes_aplicaciones ENABLE ROW LEVEL SECURITY;
CREATE POLICY pagos_clientes_aplicaciones_select_empresa
  ON public.pagos_clientes_aplicaciones FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.usuarios u
    WHERE u.auth_user_id = auth.uid()
      AND u.empresa_id = pagos_clientes_aplicaciones.empresa_id
      AND u.activo = true AND u.permitir_acceso = true
  ));
REVOKE ALL ON public.pagos_clientes_aplicaciones FROM anon, authenticated;
GRANT SELECT ON public.pagos_clientes_aplicaciones TO authenticated;
CREATE TRIGGER auditar_cambios_pos
  AFTER INSERT OR UPDATE OR DELETE ON public.pagos_clientes_aplicaciones
  FOR EACH ROW EXECUTE FUNCTION public.registrar_evento_auditoria_fila();

CREATE OR REPLACE FUNCTION public.registrar_pago_cliente_y_aplicar(
  p_empresa_id uuid,
  p_monto numeric,
  p_cliente_id bigint DEFAULT NULL,
  p_venta_id integer DEFAULT NULL,
  p_metodo_pago text DEFAULT 'Efectivo',
  p_nota text DEFAULT NULL,
  p_fecha timestamptz DEFAULT now(),
  p_cuenta_pago text DEFAULT NULL,
  p_cuenta_id uuid DEFAULT NULL,
  p_documento_url text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $$
DECLARE
  v_nombre text;
  v_nombre_empresa text;
  v_nombre_cuenta text;
  v_pago_id uuid;
  v_restante numeric(12,2);
  v_aplicado numeric(12,2);
  v_saldo numeric(12,2);
  v_estado text;
  v_venta record;
  v_aplicaciones jsonb := '[]'::jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.usuarios u
    WHERE u.auth_user_id = auth.uid() AND u.empresa_id = p_empresa_id
      AND u.activo = true AND u.permitir_acceso = true
  ) THEN
    RAISE EXCEPTION 'No tenés acceso a esta empresa';
  END IF;
  IF p_monto IS NULL OR p_monto <= 0 OR p_monto > 9999999999.99 THEN
    RAISE EXCEPTION 'El monto del pago debe ser mayor que cero';
  END IF;

  IF p_cliente_id IS NOT NULL THEN
    SELECT c.nombre, c.nombre_empresa
      INTO v_nombre, v_nombre_empresa
    FROM public.clientes c
    WHERE c.id = p_cliente_id AND c.empresa_id = p_empresa_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'El cliente no pertenece a esta empresa'; END IF;
  END IF;

  IF p_cuenta_id IS NOT NULL THEN
    SELECT cc.nombre INTO v_nombre_cuenta
    FROM public.cuentas_caja cc
    WHERE cc.id = p_cuenta_id AND cc.empresa_id = p_empresa_id AND cc.activo = true
    FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'La cuenta de caja no pertenece a esta empresa o está inactiva'; END IF;
  END IF;

  INSERT INTO public.pagos_clientes (
    empresa_id, cliente_id, monto, metodo_pago, nota, fecha,
    cuenta_pago, documento_url
  ) VALUES (
    p_empresa_id, p_cliente_id, p_monto, COALESCE(NULLIF(p_metodo_pago, ''), 'Efectivo'),
    NULLIF(p_nota, ''), COALESCE(p_fecha, now()),
    COALESCE(v_nombre_cuenta, NULLIF(p_cuenta_pago, '')), NULLIF(p_documento_url, '')
  ) RETURNING id INTO v_pago_id;

  IF p_cuenta_id IS NOT NULL THEN
    UPDATE public.cuentas_caja
    SET saldo = saldo + p_monto
    WHERE id = p_cuenta_id AND empresa_id = p_empresa_id;
  END IF;

  v_restante := p_monto;
  FOR v_venta IN
    SELECT v.id, v.total, v.monto_pagado, v.saldo_pendiente, v.cliente
    FROM public.ventas v
    WHERE v.empresa_id = p_empresa_id
      AND COALESCE(v.saldo_pendiente, 0) > 0
      AND lower(COALESCE(v.estado_pago, '')) NOT IN ('anulada', 'anulado', 'devuelta', 'devolucion', 'devolución')
      AND (
        (p_venta_id IS NOT NULL AND v.id = p_venta_id
          AND (p_cliente_id IS NULL OR v.cliente IN (v_nombre, v_nombre_empresa)))
        OR (
          p_venta_id IS NULL AND p_cliente_id IS NOT NULL
          AND v.cliente IN (v_nombre, v_nombre_empresa)
        )
      )
    ORDER BY v.fecha ASC NULLS LAST, v.id ASC
    FOR UPDATE
  LOOP
    EXIT WHEN v_restante <= 0;
    v_aplicado := LEAST(v_restante, GREATEST(0, COALESCE(v_venta.saldo_pendiente, 0)));
    IF v_aplicado <= 0 THEN CONTINUE; END IF;

    v_saldo := GREATEST(0, COALESCE(v_venta.saldo_pendiente, 0) - v_aplicado);
    v_estado := CASE WHEN v_saldo = 0 THEN 'Pagado' ELSE 'Pago Parcial' END;
    UPDATE public.ventas
    SET saldo_pendiente = v_saldo,
        monto_pagado = COALESCE(monto_pagado, 0) + v_aplicado,
        estado_pago = v_estado
    WHERE id = v_venta.id AND empresa_id = p_empresa_id;

    INSERT INTO public.pagos_clientes_aplicaciones (
      empresa_id, pago_id, venta_id, monto_aplicado
    ) VALUES (p_empresa_id, v_pago_id, v_venta.id, v_aplicado);

    v_aplicaciones := v_aplicaciones || jsonb_build_array(
      jsonb_build_object('venta_id', v_venta.id, 'monto_aplicado', v_aplicado)
    );
    v_restante := v_restante - v_aplicado;
  END LOOP;

  RETURN jsonb_build_object(
    'pago_id', v_pago_id,
    'monto', p_monto,
    'monto_aplicado', p_monto - v_restante,
    'monto_sin_aplicar', v_restante,
    'aplicaciones', v_aplicaciones
  );
END;
$$;

REVOKE ALL ON FUNCTION public.registrar_pago_cliente_y_aplicar(
  uuid, numeric, bigint, integer, text, text, timestamptz, text, uuid, text
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.registrar_pago_cliente_y_aplicar(
  uuid, numeric, bigint, integer, text, text, timestamptz, text, uuid, text
) TO authenticated;

COMMIT;
