-- Guarda la fecha del lote de stock inicial asociado a un producto.
-- Ejecútese una vez en Supabase SQL Editor antes de usar el nuevo campo.
ALTER TABLE public.productos
  ADD COLUMN IF NOT EXISTS fecha_vencimiento date;
