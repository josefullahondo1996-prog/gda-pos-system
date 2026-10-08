-- Mantiene la asignacion de listas de precios por grupo de clientes.
-- No modifica precios, ventas, inventario ni registros existentes.
alter table public.grupos_clientes
  add column if not exists grupo_precios text;

-- Conserva cualquier lista que una versión anterior haya guardado en la columna
-- equivalente. No reemplaza valores ya migrados ni toca precios.
update public.grupos_clientes
set grupo_precios = grupo_precio_venta
where grupo_precios is null
  and grupo_precio_venta is not null;
