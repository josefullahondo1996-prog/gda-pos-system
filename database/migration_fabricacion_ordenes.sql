-- Órdenes de fabricación: cola separada de la producción inmediata.
-- Aplicar después de migration_fabricacion.sql y migration_fabricacion_etapas.sql.
create table if not exists public.fabricacion_ordenes_produccion (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  receta_id uuid not null references public.fabricacion_recetas(id) on delete restrict,
  ubicacion_id uuid not null references public.ubicaciones_comerciales(id) on delete restrict,
  produccion_id uuid references public.fabricacion_producciones(id) on delete set null,
  referencia text not null,
  producto_id bigint not null references public.productos(id) on delete restrict,
  producto_nombre text not null,
  receta_nombre text not null,
  ubicacion_nombre text not null,
  cantidad numeric(14,4) not null check (cantidad > 0),
  cantidad_desperdiciada numeric(14,4) not null default 0 check (cantidad_desperdiciada >= 0),
  prioridad text not null default 'Media' check (prioridad in ('Baja','Media','Alta','Urgente')),
  estado text not null default 'Planificado' check (estado in ('Planificado','En Proceso','Completado','Cancelado')),
  fecha_objetivo date,
  costo_adicional numeric(14,2) not null default 0 check (costo_adicional >= 0),
  centro_trabajo_id uuid references public.fabricacion_centros_trabajo(id) on delete set null,
  etapa_id uuid references public.fabricacion_etapas(id) on delete set null,
  operario text,
  notas text,
  creado_por text,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  unique (empresa_id, referencia)
);

create index if not exists fabricacion_ordenes_empresa_estado_fecha_idx
  on public.fabricacion_ordenes_produccion (empresa_id, estado, fecha_objetivo, creado_en desc);
alter table public.fabricacion_ordenes_produccion enable row level security;
grant select on public.fabricacion_ordenes_produccion to authenticated;
revoke insert, update, delete on public.fabricacion_ordenes_produccion from anon, authenticated;
drop policy if exists fabricacion_ordenes_select_empresa on public.fabricacion_ordenes_produccion;
create policy fabricacion_ordenes_select_empresa on public.fabricacion_ordenes_produccion
  for select to authenticated using (
    exists (select 1 from public.usuarios u left join public.roles r on r.id = u.rol_id
      where u.auth_user_id = auth.uid() and u.empresa_id = fabricacion_ordenes_produccion.empresa_id
        and u.activo = true and u.permitir_acceso = true
        and (coalesce(r.nombre,'') ilike '%admin%' or r.permisos is null
          or coalesce(r.permisos #>> array['productos','Ajustar stock'],'false') = 'true')
        and (coalesce(u.todas_localizaciones,false) or u.ubicacion_id=fabricacion_ordenes_produccion.ubicacion_id))
  );

create or replace function public.guardar_fabricacion_orden(
  p_orden_id uuid, p_receta_id uuid, p_ubicacion_id uuid, p_cantidad numeric,
  p_prioridad text default 'Media', p_fecha_objetivo date default null,
  p_desperdicio numeric default 0, p_costo_adicional numeric default 0,
  p_notas text default null
) returns uuid language plpgsql security definer
set search_path = pg_catalog, public, auth as $$
declare
  v_empresa_id uuid; v_usuario_id text; v_ubicacion_usuario_id uuid; v_todas boolean; v_rol_id bigint;
  v_rol_nombre text; v_permisos jsonb; v_receta public.fabricacion_recetas%rowtype;
  v_ubicacion_nombre text; v_orden_id uuid; v_referencia text;
begin
  select u.empresa_id,u.id::text,u.ubicacion_id,u.todas_localizaciones,u.rol_id
    into v_empresa_id,v_usuario_id,v_ubicacion_usuario_id,v_todas,v_rol_id
    from public.usuarios u where u.auth_user_id=auth.uid() and u.activo=true and u.permitir_acceso=true
    order by u.id limit 1;
  if v_usuario_id is null then raise exception 'Usuario no autorizado'; end if;
  select r.nombre,r.permisos into v_rol_nombre,v_permisos from public.roles r where r.id=v_rol_id;
  if coalesce(v_rol_nombre,'') not ilike '%admin%' and v_permisos is not null
    and coalesce(v_permisos #>> array['productos','Ajustar stock'],'false') <> 'true' then
    raise exception 'Tu rol no tiene permiso para administrar órdenes de fabricación';
  end if;
  if p_cantidad is null or p_cantidad <= 0 or p_cantidad >= 9999999999.9999
    or p_cantidad <> round(p_cantidad,0) or coalesce(p_desperdicio,0) < 0
    or coalesce(p_desperdicio,0) <> round(coalesce(p_desperdicio,0),0)
    or coalesce(p_costo_adicional,0) < 0 or coalesce(p_costo_adicional,0) >= 1000000000000
    or coalesce(p_prioridad,'') not in ('Baja','Media','Alta','Urgente')
    or length(coalesce(p_notas,'')) > 1000 then raise exception 'Completa datos válidos para la orden'; end if;
  if not coalesce(v_todas,false) and p_ubicacion_id is distinct from v_ubicacion_usuario_id then raise exception 'No tienes acceso a esa sucursal'; end if;
  select * into v_receta from public.fabricacion_recetas r
    where r.id=p_receta_id and r.empresa_id=v_empresa_id and r.activo=true;
  if not found then raise exception 'Selecciona una receta activa de tu empresa'; end if;
  select nombre into v_ubicacion_nombre from public.ubicaciones_comerciales
    where id=p_ubicacion_id and empresa_id=v_empresa_id and activo=true;
  if v_ubicacion_nombre is null then raise exception 'Selecciona una sucursal activa'; end if;
  if p_orden_id is not null then
    perform 1 from public.fabricacion_ordenes_produccion where id=p_orden_id and empresa_id=v_empresa_id and estado='Planificado' for update;
    if not found then raise exception 'Solo se pueden editar órdenes planificadas de tu empresa'; end if;
  end if;
  v_referencia := 'OP-' || to_char(now(),'YYYYMMDD') || '-' || upper(substr(gen_random_uuid()::text,1,8));
  if p_orden_id is null then
    insert into public.fabricacion_ordenes_produccion(empresa_id,receta_id,ubicacion_id,referencia,producto_id,producto_nombre,receta_nombre,ubicacion_nombre,cantidad,cantidad_desperdiciada,prioridad,fecha_objetivo,costo_adicional,notas,creado_por)
    select v_empresa_id,v_receta.id,p_ubicacion_id,v_referencia,p.id,p.nombre,v_receta.nombre,v_ubicacion_nombre,p_cantidad,coalesce(p_desperdicio,0),p_prioridad,p_fecha_objetivo,coalesce(p_costo_adicional,0),nullif(btrim(p_notas),''),v_usuario_id
      from public.productos p where p.id=v_receta.producto_id and p.empresa_id=v_empresa_id and p.activo=true and p.administra_stock=true
    returning id into v_orden_id;
  else
    update public.fabricacion_ordenes_produccion o set receta_id=v_receta.id,ubicacion_id=p_ubicacion_id,producto_id=v_receta.producto_id,
      producto_nombre=(select p.nombre from public.productos p where p.id=v_receta.producto_id and p.empresa_id=v_empresa_id),
      receta_nombre=v_receta.nombre,ubicacion_nombre=v_ubicacion_nombre,cantidad=p_cantidad,cantidad_desperdiciada=coalesce(p_desperdicio,0),
      prioridad=p_prioridad,fecha_objetivo=p_fecha_objetivo,costo_adicional=coalesce(p_costo_adicional,0),notas=nullif(btrim(p_notas),''),actualizado_en=now()
      where o.id=p_orden_id and o.empresa_id=v_empresa_id returning o.id into v_orden_id;
  end if;
  if v_orden_id is null then raise exception 'El producto terminado no está activo o no controla stock'; end if;
  return v_orden_id;
end; $$;

create or replace function public.actualizar_fabricacion_orden_estado(p_orden_id uuid,p_estado text)
returns uuid language plpgsql security definer set search_path=pg_catalog,public,auth as $$
declare v_empresa_id uuid; v_rol_nombre text; v_permisos jsonb; v_rol_id bigint; v_id uuid; v_ubicacion_id uuid; v_ubicacion_usuario_id uuid; v_todas boolean;
begin
  select u.empresa_id,u.rol_id,u.ubicacion_id,u.todas_localizaciones into v_empresa_id,v_rol_id,v_ubicacion_usuario_id,v_todas from public.usuarios u
    where u.auth_user_id=auth.uid() and u.activo=true and u.permitir_acceso=true order by u.id limit 1;
  if v_empresa_id is null then raise exception 'Usuario no autorizado'; end if;
  select r.nombre,r.permisos into v_rol_nombre,v_permisos from public.roles r where r.id=v_rol_id;
  if coalesce(v_rol_nombre,'') not ilike '%admin%' and v_permisos is not null
    and coalesce(v_permisos #>> array['productos','Ajustar stock'],'false') <> 'true' then raise exception 'Permiso insuficiente'; end if;
  if p_estado not in ('En Proceso','Cancelado') then raise exception 'Estado no permitido'; end if;
  select ubicacion_id into v_ubicacion_id from public.fabricacion_ordenes_produccion where id=p_orden_id and empresa_id=v_empresa_id;
  if v_ubicacion_id is null or (not coalesce(v_todas,false) and v_ubicacion_id is distinct from v_ubicacion_usuario_id) then raise exception 'La orden no existe o no tienes acceso a su sucursal'; end if;
  update public.fabricacion_ordenes_produccion set estado=p_estado,actualizado_en=now()
    where id=p_orden_id and empresa_id=v_empresa_id and estado in ('Planificado','En Proceso') returning id into v_id;
  if v_id is null then raise exception 'La orden no existe o ya está cerrada'; end if;
  return v_id;
end; $$;

create or replace function public.completar_fabricacion_orden(
  p_orden_id uuid,p_centro_id uuid default null,p_operario text default null,p_etapa_id uuid default null
) returns uuid language plpgsql security definer set search_path=pg_catalog,public,auth as $$
declare v_empresa_id uuid; v_orden public.fabricacion_ordenes_produccion%rowtype;
  v_items jsonb; v_produccion_id uuid;
begin
  select u.empresa_id into v_empresa_id from public.usuarios u where u.auth_user_id=auth.uid()
    and u.activo=true and u.permitir_acceso=true order by u.id limit 1;
  if v_empresa_id is null then raise exception 'Usuario no autorizado'; end if;
  select * into v_orden from public.fabricacion_ordenes_produccion where id=p_orden_id and empresa_id=v_empresa_id for update;
  if not found or v_orden.estado not in ('Planificado','En Proceso') then raise exception 'La orden no está disponible para completar'; end if;
  select jsonb_agg(jsonb_build_object('producto_id',i.producto_id,
      'cantidad',round(((v_orden.cantidad+v_orden.cantidad_desperdiciada)*i.cantidad/r.rendimiento),0)) order by i.producto_id)
    into v_items from public.fabricacion_receta_items i join public.fabricacion_recetas r on r.id=i.receta_id and r.empresa_id=i.empresa_id
    where i.empresa_id=v_empresa_id and i.receta_id=v_orden.receta_id;
  if v_items is null then raise exception 'La receta de la orden no tiene ingredientes'; end if;
  v_produccion_id := public.crear_fabricacion_produccion_con_etapa(
    v_orden.receta_id,v_orden.ubicacion_id,v_orden.cantidad,v_items,v_orden.referencia,
    p_centro_id,p_operario,v_orden.costo_adicional,v_orden.cantidad_desperdiciada,now(),v_orden.notas,p_etapa_id);
  update public.fabricacion_ordenes_produccion set estado='Completado',produccion_id=v_produccion_id,
    centro_trabajo_id=p_centro_id,etapa_id=p_etapa_id,operario=nullif(btrim(p_operario),''),actualizado_en=now()
    where id=v_orden.id and empresa_id=v_empresa_id;
  return v_produccion_id;
end; $$;

revoke all on function public.guardar_fabricacion_orden(uuid,uuid,uuid,numeric,text,date,numeric,numeric,text) from public,anon;
revoke all on function public.actualizar_fabricacion_orden_estado(uuid,text) from public,anon;
revoke all on function public.completar_fabricacion_orden(uuid,uuid,text,uuid) from public,anon;
grant execute on function public.guardar_fabricacion_orden(uuid,uuid,uuid,numeric,text,date,numeric,numeric,text) to authenticated;
grant execute on function public.actualizar_fabricacion_orden_estado(uuid,text) to authenticated;
grant execute on function public.completar_fabricacion_orden(uuid,uuid,text,uuid) to authenticated;
