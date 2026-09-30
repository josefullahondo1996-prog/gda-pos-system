-- Seguimiento logístico de ventas; no realiza movimientos de stock ni de caja.
create table if not exists public.envios_ventas (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  venta_id integer not null references public.ventas(id) on delete restrict,
  referencia_venta text,
  cliente text not null default 'Cliente Ocasional',
  direccion text not null,
  contacto text,
  transportista text,
  codigo_seguimiento text,
  estado text not null default 'Pendiente'
    check (estado in ('Pendiente', 'Preparando', 'En tránsito', 'Entregado', 'Fallido', 'Cancelado')),
  fecha_entrega date,
  notas text,
  creado_por text,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  constraint envios_ventas_empresa_venta_uidx unique (empresa_id, venta_id)
);

create index if not exists envios_ventas_empresa_estado_fecha_idx
  on public.envios_ventas (empresa_id, estado, creado_en desc);

alter table public.envios_ventas enable row level security;
grant select, insert, update on public.envios_ventas to authenticated;
revoke delete on public.envios_ventas from anon, authenticated;

drop policy if exists envios_ventas_empresa_select on public.envios_ventas;
create policy envios_ventas_empresa_select on public.envios_ventas
  for select to authenticated using (
    exists (select 1 from public.usuarios u where u.auth_user_id = auth.uid()
      and u.empresa_id = envios_ventas.empresa_id
      and u.activo = true and u.permitir_acceso = true)
  );

drop policy if exists envios_ventas_empresa_insert on public.envios_ventas;
create policy envios_ventas_empresa_insert on public.envios_ventas
  for insert to authenticated with check (
    exists (select 1 from public.usuarios u where u.auth_user_id = auth.uid()
      and u.empresa_id = envios_ventas.empresa_id
      and u.activo = true and u.permitir_acceso = true)
    and exists (select 1 from public.ventas v where v.id = envios_ventas.venta_id
      and v.empresa_id = envios_ventas.empresa_id)
  );

drop policy if exists envios_ventas_empresa_update on public.envios_ventas;
create policy envios_ventas_empresa_update on public.envios_ventas
  for update to authenticated using (
    exists (select 1 from public.usuarios u where u.auth_user_id = auth.uid()
      and u.empresa_id = envios_ventas.empresa_id
      and u.activo = true and u.permitir_acceso = true)
  ) with check (
    exists (select 1 from public.usuarios u where u.auth_user_id = auth.uid()
      and u.empresa_id = envios_ventas.empresa_id
      and u.activo = true and u.permitir_acceso = true)
  );
