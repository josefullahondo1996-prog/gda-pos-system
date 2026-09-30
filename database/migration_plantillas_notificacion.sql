-- Plantillas de notificación aisladas por empresa. No activa envíos automáticos.
create table if not exists public.plantillas_notificacion (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  evento text not null,
  canal text not null check (canal in ('email', 'sms', 'whatsapp')),
  asunto text,
  cc text,
  bcc text,
  contenido text not null default '',
  activo boolean not null default true,
  updated_at timestamptz not null default now()
);

create unique index if not exists plantillas_notificacion_empresa_evento_canal_uidx
  on public.plantillas_notificacion (empresa_id, evento, canal);

alter table public.plantillas_notificacion enable row level security;
grant select, insert, update, delete on public.plantillas_notificacion to authenticated;

drop policy if exists plantillas_notificacion_empresa_access on public.plantillas_notificacion;
create policy plantillas_notificacion_empresa_access
  on public.plantillas_notificacion
  for all
  using (
    empresa_id in (
      select u.empresa_id from public.usuarios u
      where u.auth_user_id = auth.uid() and u.activo = true and u.permitir_acceso = true
    )
  )
  with check (
    empresa_id in (
      select u.empresa_id from public.usuarios u
      where u.auth_user_id = auth.uid() and u.activo = true and u.permitir_acceso = true
    )
  );
