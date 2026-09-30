-- Plantillas de variación y productos derivados. Las variantes heredan el flujo
-- normal de stock/venta porque cada una tiene su propio registro en productos.
create table if not exists public.plantillas_variaciones (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  nombre text not null,
  valores jsonb not null default '[]'::jsonb,
  activo boolean not null default true,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  constraint plantillas_variaciones_valores_array check (jsonb_typeof(valores) = 'array')
);

create unique index if not exists plantillas_variaciones_empresa_nombre_uidx
  on public.plantillas_variaciones (empresa_id, lower(nombre));

alter table public.plantillas_variaciones enable row level security;
grant select on public.plantillas_variaciones to authenticated;
revoke insert, update, delete on public.plantillas_variaciones from anon, authenticated;

drop policy if exists plantillas_variaciones_select_empresa on public.plantillas_variaciones;
create policy plantillas_variaciones_select_empresa
  on public.plantillas_variaciones for select to authenticated
  using (
    exists (
      select 1 from public.usuarios u
      left join public.roles r on r.id = u.rol_id
      where u.auth_user_id = auth.uid()
        and u.empresa_id = plantillas_variaciones.empresa_id
        and u.activo = true and u.permitir_acceso = true
        and (coalesce(r.nombre, '') ilike '%admin%'
          or r.permisos is null
          or coalesce(r.permisos #>> array['productos', 'Agregar producto'], 'false') = 'true'
          or coalesce(r.permisos #>> array['productos', 'Editar producto'], 'false') = 'true')
    )
  );

-- La fila padre representa la ficha variable; cada variante es una ficha normal
-- con SKU/código y stock independientes, compatible con registrar_venta/compra.
alter table public.productos
  add column if not exists producto_padre_id integer references public.productos(id) on delete set null,
  add column if not exists atributos_variacion jsonb not null default '[]'::jsonb;

create index if not exists productos_padre_variacion_idx
  on public.productos (empresa_id, producto_padre_id)
  where producto_padre_id is not null;

create or replace function public.guardar_plantilla_variacion(
  p_plantilla_id uuid,
  p_nombre text,
  p_valores jsonb,
  p_activo boolean default true
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  v_empresa_id uuid;
  v_rol_id bigint;
  v_rol_nombre text;
  v_permisos jsonb;
  v_id uuid;
  v_valores jsonb;
begin
  select u.empresa_id, u.rol_id
    into v_empresa_id, v_rol_id
  from public.usuarios u
  where u.auth_user_id = auth.uid() and u.activo = true and u.permitir_acceso = true
  order by u.id limit 1;
  if v_empresa_id is null then raise exception 'Usuario no autorizado'; end if;

  select r.nombre, r.permisos into v_rol_nombre, v_permisos
  from public.roles r where r.id = v_rol_id;
  if coalesce(v_rol_nombre, '') not ilike '%admin%'
    and v_permisos is not null
    and coalesce(v_permisos #>> array['productos', 'Agregar producto'], 'false') <> 'true'
    and coalesce(v_permisos #>> array['productos', 'Editar producto'], 'false') <> 'true' then
    raise exception 'Tu rol no tiene permiso para administrar variaciones de productos';
  end if;

  if p_nombre is null or length(btrim(p_nombre)) < 2 or length(btrim(p_nombre)) > 100
    or p_valores is null or jsonb_typeof(p_valores) <> 'array' then
    raise exception 'Indica un nombre y una lista de valores válidos';
  end if;

  select coalesce(jsonb_agg(to_jsonb(v.valor) order by v.ord), '[]'::jsonb)
    into v_valores
  from (
    select distinct on (lower(btrim(elem.value #>> '{}')))
      btrim(elem.value #>> '{}') as valor, elem.ord
    from jsonb_array_elements(p_valores) with ordinality as elem(value, ord)
    where jsonb_typeof(elem.value) = 'string'
      and length(btrim(elem.value #>> '{}')) between 1 and 80
    order by lower(btrim(elem.value #>> '{}')), elem.ord
  ) v;
  if jsonb_array_length(v_valores) < 1 or jsonb_array_length(v_valores) > 100 then
    raise exception 'Cada variación debe tener entre 1 y 100 valores';
  end if;

  if p_plantilla_id is null then
    insert into public.plantillas_variaciones (empresa_id, nombre, valores, activo)
    values (v_empresa_id, btrim(p_nombre), v_valores, coalesce(p_activo, true))
    returning id into v_id;
  else
    update public.plantillas_variaciones
      set nombre = btrim(p_nombre), valores = v_valores,
          activo = coalesce(p_activo, true), actualizado_en = now()
    where id = p_plantilla_id and empresa_id = v_empresa_id
    returning id into v_id;
    if v_id is null then raise exception 'La variación no existe o no pertenece a tu empresa'; end if;
  end if;
  return v_id;
end;
$$;

revoke all on function public.guardar_plantilla_variacion(uuid, text, jsonb, boolean) from public, anon;
grant execute on function public.guardar_plantilla_variacion(uuid, text, jsonb, boolean) to authenticated;
