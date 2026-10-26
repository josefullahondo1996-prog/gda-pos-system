-- Historial diario de cotizaciones comerciales por empresa.
-- Las tasas no alteran ventas ni movimientos de caja automaticamente.
create table if not exists public.cotizaciones_cambio_diarias (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  fecha date not null default current_date,
  tasas jsonb not null default '{}'::jsonb check (jsonb_typeof(tasas) = 'object'),
  fijado_por text,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  constraint cotizaciones_cambio_diarias_empresa_fecha_uidx unique (empresa_id, fecha)
);

create index if not exists cotizaciones_cambio_diarias_empresa_fecha_idx
  on public.cotizaciones_cambio_diarias (empresa_id, fecha desc);

alter table public.cotizaciones_cambio_diarias enable row level security;
grant select, insert, update on public.cotizaciones_cambio_diarias to authenticated;
revoke delete on public.cotizaciones_cambio_diarias from anon, authenticated;

drop policy if exists cotizaciones_cambio_diarias_select on public.cotizaciones_cambio_diarias;
create policy cotizaciones_cambio_diarias_select on public.cotizaciones_cambio_diarias
  for select to authenticated using (
    exists (select 1 from public.usuarios u where u.auth_user_id = auth.uid()
      and u.empresa_id = cotizaciones_cambio_diarias.empresa_id
      and u.activo = true and u.permitir_acceso = true)
  );

drop policy if exists cotizaciones_cambio_diarias_insert on public.cotizaciones_cambio_diarias;
create policy cotizaciones_cambio_diarias_insert on public.cotizaciones_cambio_diarias
  for insert to authenticated with check (
    exists (select 1 from public.usuarios u where u.auth_user_id = auth.uid()
      and u.empresa_id = cotizaciones_cambio_diarias.empresa_id
      and u.activo = true and u.permitir_acceso = true)
  );

drop policy if exists cotizaciones_cambio_diarias_update on public.cotizaciones_cambio_diarias;
create policy cotizaciones_cambio_diarias_update on public.cotizaciones_cambio_diarias
  for update to authenticated using (
    exists (select 1 from public.usuarios u where u.auth_user_id = auth.uid()
      and u.empresa_id = cotizaciones_cambio_diarias.empresa_id
      and u.activo = true and u.permitir_acceso = true)
  ) with check (
    exists (select 1 from public.usuarios u where u.auth_user_id = auth.uid()
      and u.empresa_id = cotizaciones_cambio_diarias.empresa_id
      and u.activo = true and u.permitir_acceso = true)
  );
