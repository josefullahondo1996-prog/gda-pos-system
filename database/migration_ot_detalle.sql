-- Datos ampliados de recepción OT. Es aditivo y conserva las columnas actuales.
-- La aplicación mantiene compatibilidad con bases que aún no aplicaron esta migración.
ALTER TABLE IF EXISTS public.ordenes_trabajo
  ADD COLUMN IF NOT EXISTS detalle_ot jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.ordenes_trabajo.detalle_ot IS
  'Datos de recepción, vehículo, diagnóstico, fechas y presupuesto de la orden de trabajo';
