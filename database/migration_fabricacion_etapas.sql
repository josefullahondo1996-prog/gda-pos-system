-- Etapas configurables y registro de la etapa elegida por producción.
create table if not exists public.fabricacion_etapas (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  nombre text not null,
  orden integer not null default 0,
  activo boolean not null default true,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);

create unique index if not exists fabricacion_etapas_empresa_nombre_uidx
  on public.fabricacion_etapas (empresa_id, lower(nombre));

alter table public.fabricacion_etapas enable row level security;
grant select on public.fabricacion_etapas to authenticated;
revoke insert, update, delete on public.fabricacion_etapas from anon, authenticated;

drop policy if exists fabricacion_etapas_select_empresa on public.fabricacion_etapas;
create policy fabricacion_etapas_select_empresa
  on public.fabricacion_etapas for select to authenticated
  using (
    exists (
      select 1 from public.usuarios u
      left join public.roles r on r.id = u.rol_id
      where u.auth_user_id = auth.uid()
        and u.empresa_id = fabricacion_etapas.empresa_id
        and u.activo = true and u.permitir_acceso = true
        and (coalesce(r.nombre, '') ilike '%admin%'
          or r.permisos is null
          or coalesce(r.permisos #>> array['productos', 'Ajustar stock'], 'false') = 'true')
    )
  );

create or replace function public.guardar_fabricacion_etapa(
  p_etapa_id uuid,
  p_nombre text,
  p_orden integer default 0,
  p_activo boolean default true
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  v_empresa_id uuid;
  v_usuario_id text;
  v_rol_id bigint;
  v_permisos jsonb;
  v_rol_nombre text;
  v_etapa_id uuid;
begin
  select u.empresa_id, u.id::text, u.rol_id
    into v_empresa_id, v_usuario_id, v_rol_id
  from public.usuarios u
  where u.auth_user_id = auth.uid() and u.activo = true and u.permitir_acceso = true
  order by u.id limit 1;
  if v_usuario_id is null then raise exception 'Usuario no autorizado'; end if;

  select r.nombre, r.permisos into v_rol_nombre, v_permisos
  from public.roles r where r.id = v_rol_id;
  if coalesce(v_rol_nombre, '') not ilike '%admin%'
    and v_permisos is not null
    and coalesce(v_permisos #>> array['productos', 'Ajustar stock'], 'false') <> 'true' then
    raise exception 'Tu rol no tiene permiso para administrar etapas de producción';
  end if;
  if p_nombre is null or length(btrim(p_nombre)) < 2 or length(p_nombre) > 100
    or p_orden is null or p_orden < 0 or p_orden > 9999 then
    raise exception 'Indica un nombre y orden válidos para la etapa';
  end if;

  if p_etapa_id is null then
    insert into public.fabricacion_etapas (empresa_id, nombre, orden, activo)
    values (v_empresa_id, btrim(p_nombre), p_orden, coalesce(p_activo, true))
    returning id into v_etapa_id;
  else
    update public.fabricacion_etapas
      set nombre = btrim(p_nombre), orden = p_orden,
          activo = coalesce(p_activo, true), actualizado_en = now()
    where id = p_etapa_id and empresa_id = v_empresa_id
    returning id into v_etapa_id;
    if v_etapa_id is null then raise exception 'La etapa no existe o no pertenece a tu empresa'; end if;
  end if;
  return v_etapa_id;
end;
$$;

revoke all on function public.guardar_fabricacion_etapa(uuid, text, integer, boolean) from public, anon;
grant execute on function public.guardar_fabricacion_etapa(uuid, text, integer, boolean) to authenticated;

alter table public.fabricacion_producciones
  add column if not exists etapa_id uuid references public.fabricacion_etapas(id) on delete set null,
  add column if not exists etapa_nombre text;

create or replace function public.crear_fabricacion_produccion_con_etapa(
  p_receta_id uuid,
  p_ubicacion_id uuid,
  p_cantidad numeric,
  p_items_real jsonb,
  p_referencia text default null,
  p_centro_trabajo_id uuid default null,
  p_operario text default null,
  p_costo_adicional numeric default 0,
  p_desperdicio numeric default 0,
  p_fecha timestamptz default now(),
  p_notas text default null,
  p_etapa_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  v_empresa_id uuid;
  v_etapa_nombre text;
  v_produccion_id uuid;
begin
  select u.empresa_id into v_empresa_id
  from public.usuarios u
  where u.auth_user_id = auth.uid() and u.activo = true and u.permitir_acceso = true
  order by u.id limit 1;
  if v_empresa_id is null then raise exception 'Usuario no autorizado'; end if;

  if p_etapa_id is not null then
    select e.nombre into v_etapa_nombre
    from public.fabricacion_etapas e
    where e.id = p_etapa_id and e.empresa_id = v_empresa_id and e.activo = true;
    if v_etapa_nombre is null then raise exception 'La etapa de producción no existe o está inactiva'; end if;
  end if;

  v_produccion_id := public.crear_fabricacion_produccion(
    p_receta_id, p_ubicacion_id, p_cantidad, p_items_real, p_referencia,
    p_centro_trabajo_id, p_operario, p_costo_adicional, p_desperdicio,
    p_fecha, p_notas
  );
  update public.fabricacion_producciones
    set etapa_id = p_etapa_id, etapa_nombre = v_etapa_nombre
  where id = v_produccion_id and empresa_id = v_empresa_id;
  if not found then raise exception 'No se pudo asociar la etapa a la producción'; end if;
  return v_produccion_id;
end;
$$;

revoke all on function public.crear_fabricacion_produccion_con_etapa(uuid, uuid, numeric, jsonb, text, uuid, text, numeric, numeric, timestamptz, text, uuid) from public, anon;
grant execute on function public.crear_fabricacion_produccion_con_etapa(uuid, uuid, numeric, jsonb, text, uuid, text, numeric, numeric, timestamptz, text, uuid) to authenticated;
