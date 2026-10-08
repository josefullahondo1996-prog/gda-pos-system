-- Guarda el arqueo por medio de pago desde la app móvil.
-- La columna es opcional para conservar compatibilidad con cierres anteriores y con escritorio.
ALTER TABLE public.caja_registros
  ADD COLUMN IF NOT EXISTS rendicion_final jsonb;

COMMENT ON COLUMN public.caja_registros.rendicion_final IS
  'Conteos y diferencias de efectivo, tarjeta, transferencia y QR al cerrar la caja.';
