-- seed.sql
-- Datos iniciales para el sistema POS

INSERT INTO Productos(nombre, descripcion, precio, stock, categoria)
VALUES
('Pan francés', 'Pan fresco diario', 1.50, 100, 'Alimentos'),
('Leche entera', 'Botella 1L', 0.90, 50, 'Bebidas'),
('Café molido', 'Café premium 250g', 4.20, 30, 'Bebidas');

INSERT INTO Clientes(nombre, email, telefono, direccion)
VALUES
('Juan Pérez', 'juan.perez@example.com', '555-1234', 'Av. Principal 123'),
('María López', 'maria.lopez@example.com', '555-5678', 'Calle Secundaria 45');

INSERT INTO Cajas(apertura, estado)
VALUES
(100.00, 'abierta');
