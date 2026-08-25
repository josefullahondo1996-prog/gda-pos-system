-- Registra el usuario que realiza cada venta para el informe de vendedores.
-- Es idempotente y conserva todas las ventas existentes.
ALTER TABLE ventas ADD COLUMN IF NOT EXISTS usuario_nombre text;
ALTER TABLE ventas ADD COLUMN IF NOT EXISTS personal_servicio text;

CREATE INDEX IF NOT EXISTS ventas_empresa_usuario_fecha_idx
    ON ventas (empresa_id, usuario_nombre, fecha);