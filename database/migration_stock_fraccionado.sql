-- Permite registrar ventas de productos pesados o medidos en cantidades decimales.
ALTER TABLE ventas
    ALTER COLUMN articulos TYPE numeric USING articulos::numeric;