-- Agregar la columna combo_productos a la tabla productos para guardar la composición del combo
ALTER TABLE productos ADD COLUMN IF NOT EXISTS combo_productos jsonb;
