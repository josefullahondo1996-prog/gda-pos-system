-- Grupos de precio por producto para listas asignadas a grupos de clientes.
-- Aditivo y seguro para productos existentes: no cambia precio_venta ni stock.
alter table public.productos
  add column if not exists grupos_precio jsonb not null default '[]'::jsonb;

comment on column public.productos.grupos_precio is
  'Lista de precios por grupo: [{nombre, margen, precioVenta}].';
