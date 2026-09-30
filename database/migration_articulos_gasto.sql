-- Catálogo de conceptos usados al detallar un gasto. El JSON de cada gasto
-- conserva una copia histórica de sus líneas aunque luego cambie el catálogo.
create table if not exists public.articulos_gasto (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  nombre text not null,
  categoria text,
  iva text not null default 'IVA 10%' check (iva in ('IVA 10%', 'IVA 5%', 'Exento')),
  costo_unitario numeric(14,2) not null default 0 check (costo_unitario >= 0),
  activo boolean not null default true,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  constraint articulos_gasto_empresa_nombre_uidx unique (empresa_id, nombre)
);

create index if not exists articulos_gasto_empresa_activo_nombre_idx
  on public.articulos_gasto (empresa_id, activo, nombre);

alter table public.articulos_gasto enable row level security;
grant select, insert, update on public.articulos_gasto to authenticated;
revoke delete on public.articulos_gasto from anon, authenticated;

drop policy if exists articulos_gasto_empresa_select on public.articulos_gasto;
create policy articulos_gasto_empresa_select on public.articulos_gasto
  for select to authenticated using (
    exists (select 1 from public.usuarios u where u.auth_user_id = auth.uid()
      and u.empresa_id = articulos_gasto.empresa_id
      and u.activo = true and u.permitir_acceso = true)
  );

drop policy if exists articulos_gasto_empresa_insert on public.articulos_gasto;
create policy articulos_gasto_empresa_insert on public.articulos_gasto
  for insert to authenticated with check (
    exists (select 1 from public.usuarios u where u.auth_user_id = auth.uid()
      and u.empresa_id = articulos_gasto.empresa_id
      and u.activo = true and u.permitir_acceso = true)
  );

drop policy if exists articulos_gasto_empresa_update on public.articulos_gasto;
create policy articulos_gasto_empresa_update on public.articulos_gasto
  for update to authenticated using (
    exists (select 1 from public.usuarios u where u.auth_user_id = auth.uid()
      and u.empresa_id = articulos_gasto.empresa_id
      and u.activo = true and u.permitir_acceso = true)
  ) with check (
    exists (select 1 from public.usuarios u where u.auth_user_id = auth.uid()
      and u.empresa_id = articulos_gasto.empresa_id
      and u.activo = true and u.permitir_acceso = true)
  );

alter table public.gastos add column if not exists items jsonb not null default '[]'::jsonb;
