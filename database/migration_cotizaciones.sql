-- Cotizaciones comerciales sin impacto en caja ni inventario. La conversión
-- se realiza desde el POS usando la RPC existente de venta.
create table if not exists public.cotizaciones_ventas (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  referencia text not null,
  cliente text not null default 'Cliente Ocasional',
  fecha date not null default current_date,
  fecha_vencimiento date,
  estado text not null default 'Pendiente' check (estado in ('Pendiente', 'Convertida', 'Cancelada')),
  items jsonb not null default '[]'::jsonb check (jsonb_typeof(items) = 'array'),
  subtotal numeric(14,2) not null default 0,
  descuento numeric(14,2) not null default 0,
  total numeric(14,2) not null default 0,
  notas text,
  venta_id text,
  creado_por text,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  constraint cotizaciones_ventas_referencia_empresa_uidx unique (empresa_id, referencia)
);

create index if not exists cotizaciones_ventas_empresa_estado_fecha_idx
  on public.cotizaciones_ventas (empresa_id, estado, fecha desc);

alter table public.cotizaciones_ventas enable row level security;
grant select, insert, update on public.cotizaciones_ventas to authenticated;
revoke delete on public.cotizaciones_ventas from anon, authenticated;

drop policy if exists cotizaciones_ventas_empresa_select on public.cotizaciones_ventas;
create policy cotizaciones_ventas_empresa_select on public.cotizaciones_ventas
  for select to authenticated using (
    exists (select 1 from public.usuarios u where u.auth_user_id = auth.uid()
      and u.empresa_id = cotizaciones_ventas.empresa_id
      and u.activo = true and u.permitir_acceso = true)
  );

drop policy if exists cotizaciones_ventas_empresa_insert on public.cotizaciones_ventas;
create policy cotizaciones_ventas_empresa_insert on public.cotizaciones_ventas
  for insert to authenticated with check (
    exists (select 1 from public.usuarios u where u.auth_user_id = auth.uid()
      and u.empresa_id = cotizaciones_ventas.empresa_id
      and u.activo = true and u.permitir_acceso = true)
  );

drop policy if exists cotizaciones_ventas_empresa_update on public.cotizaciones_ventas;
create policy cotizaciones_ventas_empresa_update on public.cotizaciones_ventas
  for update to authenticated using (
    exists (select 1 from public.usuarios u where u.auth_user_id = auth.uid()
      and u.empresa_id = cotizaciones_ventas.empresa_id
      and u.activo = true and u.permitir_acceso = true)
  ) with check (
    exists (select 1 from public.usuarios u where u.auth_user_id = auth.uid()
      and u.empresa_id = cotizaciones_ventas.empresa_id
      and u.activo = true and u.permitir_acceso = true)
  );
