-- Adds Micdepos-style transfer metadata while keeping the existing atomic RPC
-- as the only path that changes inventory quantities.
ALTER TABLE public.transferencias_stock
  ADD COLUMN IF NOT EXISTS fecha_transferencia date,
  ADD COLUMN IF NOT EXISTS referencia text,
  ADD COLUMN IF NOT EXISTS estado text NOT NULL DEFAULT 'Terminado',
  ADD COLUMN IF NOT EXISTS gastos_envio numeric(14, 2) NOT NULL DEFAULT 0;

UPDATE public.transferencias_stock
SET fecha_transferencia = created_at::date
WHERE fecha_transferencia IS NULL;

ALTER TABLE public.transferencias_stock
  ALTER COLUMN fecha_transferencia SET DEFAULT CURRENT_DATE,
  ALTER COLUMN fecha_transferencia SET NOT NULL;

ALTER TABLE public.transferencias_stock
  DROP CONSTRAINT IF EXISTS transferencias_stock_estado_check,
  ADD CONSTRAINT transferencias_stock_estado_check
    CHECK (estado IN ('Pendiente', 'En tránsito', 'Terminado')),
  DROP CONSTRAINT IF EXISTS transferencias_stock_gastos_envio_check,
  ADD CONSTRAINT transferencias_stock_gastos_envio_check CHECK (gastos_envio >= 0);

CREATE OR REPLACE FUNCTION public.transferir_stock_detallado(
  p_origen_ubicacion_id uuid,
  p_destino_ubicacion_id uuid,
  p_items jsonb,
  p_notas text DEFAULT NULL,
  p_fecha_transferencia date DEFAULT CURRENT_DATE,
  p_referencia text DEFAULT NULL,
  p_gastos_envio numeric DEFAULT 0
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $$
DECLARE
  v_id uuid;
  v_envio numeric(14, 2) := COALESCE(p_gastos_envio, 0);
  v_item jsonb;
  v_costo numeric;
BEGIN
  IF p_fecha_transferencia IS NULL THEN
    RAISE EXCEPTION 'La fecha de transferencia es obligatoria';
  END IF;
  IF v_envio < 0 OR v_envio::text IN ('NaN', 'Infinity', '-Infinity') THEN
    RAISE EXCEPTION 'Los gastos de envío deben ser un importe válido no negativo';
  END IF;
  IF length(btrim(COALESCE(p_referencia, ''))) > 100 THEN
    RAISE EXCEPTION 'La referencia no puede superar 100 caracteres';
  END IF;
  IF p_items IS NOT NULL AND jsonb_typeof(p_items) = 'array' THEN
    FOR v_item IN SELECT value FROM jsonb_array_elements(p_items)
    LOOP
      v_costo := COALESCE(NULLIF(v_item->>'precio_unitario', '')::numeric, 0);
      IF v_costo < 0 OR v_costo::text IN ('NaN', 'Infinity', '-Infinity') THEN
        RAISE EXCEPTION 'El costo unitario debe ser válido y no negativo';
      END IF;
    END LOOP;
  END IF;

  -- This existing RPC performs the company/role/branch checks and changes
  -- source and destination quantities atomically. Any later error rolls back it.
  v_id := public.transferir_stock(
    p_origen_ubicacion_id,
    p_destino_ubicacion_id,
    p_items,
    p_notas
  );

  UPDATE public.transferencias_stock AS t
  SET fecha_transferencia = p_fecha_transferencia,
      referencia = NULLIF(btrim(p_referencia), ''),
      estado = 'Terminado',
      gastos_envio = v_envio,
      items = COALESCE((
        SELECT jsonb_agg(
          item.value || jsonb_build_object(
            'precio_unitario', precio.costo,
            'subtotal', (item.value->>'cantidad')::numeric * precio.costo
          ) ORDER BY item.ordinality
        )
        FROM jsonb_array_elements(t.items) WITH ORDINALITY AS item(value, ordinality)
        LEFT JOIN LATERAL (
          SELECT COALESCE(NULLIF(src.value->>'precio_unitario', '')::numeric, 0) AS costo
          FROM jsonb_array_elements(p_items) AS src(value)
          WHERE src.value->>'producto_id' = item.value->>'producto_id'
          LIMIT 1
        ) AS precio ON true
      ), '[]'::jsonb)
  WHERE t.id = v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.transferir_stock_detallado(uuid, uuid, jsonb, text, date, text, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.transferir_stock_detallado(uuid, uuid, jsonb, text, date, text, numeric) TO authenticated;
