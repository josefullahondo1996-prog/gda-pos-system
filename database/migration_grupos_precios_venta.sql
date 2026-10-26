-- Catálogo de grupos de precios de venta, separado de los grupos de clientes.
-- Los precios por producto siguen almacenados en productos.grupos_precio.
create table if not exists public.grupos_precios_venta (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  nombre text not null,
  descripcion text,
  margen_default numeric(8,2) not null default 0,
  activo boolean not null default true,
  creado_en timestamptz not null default now(),
  constraint grupos_precios_venta_nombre_no_vacio check (length(trim(nombre)) > 0),
  constraint grupos_precios_venta_margen_no_negativo check (margen_default >= 0),
  constraint grupos_precios_venta_empresa_nombre_unique unique (empresa_id, nombre)
);

create index if not exists idx_grupos_precios_venta_empresa_activo_nombre
  on public.grupos_precios_venta (empresa_id, activo, nombre);

alter table public.grupos_precios_venta enable row level security;
grant select, insert, update, delete on public.grupos_precios_venta to authenticated;

drop policy if exists grupos_precios_venta_select_empresa on public.grupos_precios_venta;
create policy grupos_precios_venta_select_empresa on public.grupos_precios_venta
  for select to authenticated
  using (empresa_id in (select empresa_id from public.usuarios where auth_user_id = auth.uid()));

drop policy if exists grupos_precios_venta_insert_empresa on public.grupos_precios_venta;
create policy grupos_precios_venta_insert_empresa on public.grupos_precios_venta
  for insert to authenticated
  with check (empresa_id in (select empresa_id from public.usuarios where auth_user_id = auth.uid()));

drop policy if exists grupos_precios_venta_update_empresa on public.grupos_precios_venta;
create policy grupos_precios_venta_update_empresa on public.grupos_precios_venta
  for update to authenticated
  using (empresa_id in (select empresa_id from public.usuarios where auth_user_id = auth.uid()))
  with check (empresa_id in (select empresa_id from public.usuarios where auth_user_id = auth.uid()));

drop policy if exists grupos_precios_venta_delete_empresa on public.grupos_precios_venta;
create policy grupos_precios_venta_delete_empresa on public.grupos_precios_venta
  for delete to authenticated
  using (empresa_id in (select empresa_id from public.usuarios where auth_user_id = auth.uid()));

-- Migra a catálogo los grupos ya usados en productos y asignaciones de clientes.
insert into public.grupos_precios_venta (empresa_id, nombre, margen_default)
select p.empresa_id, trim(item->>'nombre'), max(
  case when coalesce(item->>'margen', '') ~ '^[+-]?[0-9]+([.][0-9]+)?$'
    then greatest(0, (item->>'margen')::numeric)
    else 0
  end
)
from public.productos p
cross join lateral jsonb_array_elements(
  case when jsonb_typeof(p.grupos_precio) = 'array' then p.grupos_precio else '[]'::jsonb end
) item
where nullif(trim(item->>'nombre'), '') is not null
group by p.empresa_id, trim(item->>'nombre')
on conflict (empresa_id, nombre) do nothing;

do $$
begin
  if to_regclass('public.grupos_clientes') is not null and exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'grupos_clientes' and column_name = 'grupo_precios'
  ) then
    execute $sql$
      insert into public.grupos_precios_venta (empresa_id, nombre)
      select distinct gc.empresa_id, trim(gc.grupo_precios)
      from public.grupos_clientes gc
      where nullif(trim(gc.grupo_precios), '') is not null
      on conflict (empresa_id, nombre) do nothing
    $sql$;
  end if;
end $$;

-- Conserva las ocho opciones iniciales del formulario de producto.
insert into public.grupos_precios_venta (empresa_id, nombre, margen_default)
select e.id, g.nombre, g.margen
from public.empresas e
cross join (values
  ('Base de Cambio', 25::numeric),
  ('Base de cambio Credito', 25::numeric),
  ('Credito', 60::numeric),
  ('P Compra', 25::numeric),
  ('P CREDITO', 25::numeric),
  ('P Mayorista', 25::numeric),
  ('P Venta', 25::numeric),
  ('Precio con Entrega Batería', 25::numeric)
) as g(nombre, margen)
on conflict (empresa_id, nombre) do nothing;

create or replace function public.sincronizar_nombre_grupo_precio_venta()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.nombre is distinct from old.nombre then
    update public.productos p
    set grupos_precio = (
      select coalesce(jsonb_agg(
        case when item->>'nombre' = old.nombre
          then jsonb_set(item, '{nombre}', to_jsonb(new.nombre), true)
          else item
        end
      ), '[]'::jsonb)
      from jsonb_array_elements(
        case when jsonb_typeof(p.grupos_precio) = 'array' then p.grupos_precio else '[]'::jsonb end
      ) item
    )
    where p.empresa_id = new.empresa_id
      and jsonb_typeof(p.grupos_precio) = 'array'
      and exists (
        select 1 from jsonb_array_elements(p.grupos_precio) item
        where item->>'nombre' = old.nombre
      );

    if to_regclass('public.grupos_clientes') is not null and exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'grupos_clientes' and column_name = 'grupo_precios'
    ) then
      execute 'update public.grupos_clientes set grupo_precios = $1 where empresa_id = $2 and grupo_precios = $3'
        using new.nombre, new.empresa_id, old.nombre;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_sincronizar_nombre_grupo_precio_venta on public.grupos_precios_venta;
create trigger trg_sincronizar_nombre_grupo_precio_venta
  after update of nombre on public.grupos_precios_venta
  for each row execute function public.sincronizar_nombre_grupo_precio_venta();
