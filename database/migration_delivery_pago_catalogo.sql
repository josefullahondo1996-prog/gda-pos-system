-- Metodos de pago para pedidos delivery del Catalogo QR.
-- Ejecutar despues de migration_restaurante_delivery_operacion_segura.sql
-- y migration_delivery_tarifas_radiales.sql.

create table if not exists public.delivery_pago_configuracion (
  empresa_id uuid primary key references public.empresas(id) on delete cascade,
  acepta_efectivo boolean not null default true,
  acepta_transferencia boolean not null default false,
  acepta_tarjeta boolean not null default false,
  transferencia_alias text,
  transferencia_titular text,
  transferencia_banco text,
  actualizado_en timestamptz not null default now(),
  constraint delivery_pago_alias_requerido check (
    acepta_transferencia = false or length(btrim(coalesce(transferencia_alias,''))) between 2 and 120
  )
);

alter table public.delivery_pago_configuracion enable row level security;
grant select, insert, update on public.delivery_pago_configuracion to authenticated;
drop policy if exists delivery_pago_configuracion_empresa on public.delivery_pago_configuracion;
create policy delivery_pago_configuracion_empresa on public.delivery_pago_configuracion
  for all to authenticated
  using (public.delivery_usuario_puede_administrar(empresa_id))
  with check (public.delivery_usuario_puede_administrar(empresa_id));

alter table public.pedidos
  add column if not exists delivery_metodo_pago text not null default 'efectivo',
  add column if not exists delivery_pago_estado text not null default 'pendiente_cobro',
  add column if not exists delivery_comprobante_path text;

do $$ begin
  if not exists (select 1 from pg_constraint where conname='pedidos_delivery_metodo_pago_valido' and conrelid='public.pedidos'::regclass) then
    alter table public.pedidos add constraint pedidos_delivery_metodo_pago_valido
      check (delivery_metodo_pago in ('efectivo','transferencia','tarjeta'));
  end if;
  if not exists (select 1 from pg_constraint where conname='pedidos_delivery_pago_estado_valido' and conrelid='public.pedidos'::regclass) then
    alter table public.pedidos add constraint pedidos_delivery_pago_estado_valido
      check (delivery_pago_estado in ('pendiente_cobro','comprobante_recibido','confirmado'));
  end if;
end $$;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('delivery-comprobantes','delivery-comprobantes',false,5242880,array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;
grant insert on storage.objects to anon, authenticated;
grant select on storage.objects to authenticated;

create or replace function public.delivery_catalogo_qr_activo(p_token text)
returns boolean language sql stable security definer
set search_path = pg_catalog, public, pg_temp as $$
  select exists (
    select 1 from public.catalogos_qr c
    where c.public_token::text=p_token and c.estado='Activo'
      and (c.expira_el is null or c.expira_el >= current_date)
  );
$$;
revoke all on function public.delivery_catalogo_qr_activo(text) from public;
grant execute on function public.delivery_catalogo_qr_activo(text) to anon, authenticated;

drop policy if exists delivery_comprobantes_subir_catalogo on storage.objects;
create policy delivery_comprobantes_subir_catalogo on storage.objects
  for insert to anon, authenticated
  with check (
    bucket_id='delivery-comprobantes'
    and name ~ '^[0-9a-fA-F-]{36}/[0-9a-fA-F-]{36}\.(jpg|jpeg|png|webp)$'
    and public.delivery_catalogo_qr_activo((storage.foldername(name))[1])
  );

drop policy if exists delivery_comprobantes_ver_empresa on storage.objects;
create policy delivery_comprobantes_ver_empresa on storage.objects
  for select to authenticated
  using (
    bucket_id='delivery-comprobantes'
    and exists (
      select 1 from public.catalogos_qr c
      where c.public_token::text=(storage.foldername(name))[1]
        and public.delivery_usuario_puede_administrar(c.empresa_id)
    )
  );

create or replace function public.obtener_pago_delivery_qr_publico(p_token uuid)
returns jsonb language sql stable security definer
set search_path = pg_catalog, public, pg_temp as $$
  select jsonb_build_object(
    'acepta_efectivo',coalesce(pc.acepta_efectivo,true),
    'acepta_transferencia',coalesce(pc.acepta_transferencia,false),
    'acepta_tarjeta',coalesce(pc.acepta_tarjeta,false),
    'transferencia_alias',pc.transferencia_alias,
    'transferencia_titular',pc.transferencia_titular,
    'transferencia_banco',pc.transferencia_banco
  )
  from public.catalogos_qr c
  left join public.delivery_pago_configuracion pc on pc.empresa_id=c.empresa_id
  where c.public_token=p_token and c.estado='Activo'
    and (c.expira_el is null or c.expira_el>=current_date)
  limit 1;
$$;
revoke all on function public.obtener_pago_delivery_qr_publico(uuid) from public;
grant execute on function public.obtener_pago_delivery_qr_publico(uuid) to anon, authenticated;

drop function if exists public.crear_pedido_delivery_qr_publico(uuid,text,text,jsonb,text,text,uuid,numeric,numeric,boolean,text,text,numeric);
create function public.crear_pedido_delivery_qr_publico(
  p_token uuid, p_cliente_nombre text, p_cliente_telefono text, p_items jsonb,
  p_nota text, p_direccion text, p_zona_id uuid,
  p_latitud numeric default null, p_longitud numeric default null,
  p_sin_ubicacion boolean default false, p_destinatario text default null,
  p_destinatario_telefono text default null, p_pago_con numeric default null,
  p_metodo_pago text default 'efectivo', p_comprobante_path text default null
) returns jsonb language plpgsql security definer
set search_path = pg_catalog, public, pg_temp as $$
declare
  v_result jsonb; v_pedido_id uuid; v_empresa uuid; v_ubicacion uuid;
  v_costo numeric := 0; v_zona_id uuid; v_distancia numeric;
  v_acepta_efectivo boolean := true; v_acepta_transferencia boolean := false;
  v_acepta_tarjeta boolean := false; v_pago_estado text := 'pendiente_cobro';
begin
  if length(btrim(coalesce(p_direccion,''))) < 5 or length(p_direccion) > 300 then raise exception 'DIRECCION_INVALIDA'; end if;
  if (p_latitud is null) <> (p_longitud is null) then raise exception 'UBICACION_INVALIDA'; end if;
  if p_latitud is not null and (p_latitud < -90 or p_latitud > 90 or p_longitud < -180 or p_longitud > 180) then raise exception 'UBICACION_INVALIDA'; end if;
  if p_destinatario is not null and length(btrim(p_destinatario)) > 120 then raise exception 'DESTINATARIO_INVALIDO'; end if;
  if p_destinatario_telefono is not null and length(btrim(p_destinatario_telefono)) > 30 then raise exception 'TELEFONO_DESTINATARIO_INVALIDO'; end if;
  if p_destinatario_telefono is not null and length(regexp_replace(p_destinatario_telefono,'[^0-9]','','g')) < 8 then raise exception 'TELEFONO_DESTINATARIO_INVALIDO'; end if;
  if coalesce(p_metodo_pago,'') not in ('efectivo','transferencia','tarjeta') then raise exception 'METODO_PAGO_INVALIDO'; end if;

  select empresa_id, ubicacion_id into v_empresa, v_ubicacion from public.catalogos_qr
    where public_token=p_token and estado='Activo' and (expira_el is null or expira_el >= current_date);
  if not found then raise exception 'CATALOGO_NO_DISPONIBLE'; end if;
  select coalesce(acepta_efectivo,true),coalesce(acepta_transferencia,false),coalesce(acepta_tarjeta,false)
    into v_acepta_efectivo,v_acepta_transferencia,v_acepta_tarjeta
    from public.delivery_pago_configuracion where empresa_id=v_empresa;
  if not found then
    v_acepta_efectivo := true;
    v_acepta_transferencia := false;
    v_acepta_tarjeta := false;
  end if;
  if p_metodo_pago='efectivo' and not v_acepta_efectivo then raise exception 'METODO_PAGO_NO_DISPONIBLE'; end if;
  if p_metodo_pago='transferencia' and not v_acepta_transferencia then raise exception 'METODO_PAGO_NO_DISPONIBLE'; end if;
  if p_metodo_pago='tarjeta' and not v_acepta_tarjeta then raise exception 'METODO_PAGO_NO_DISPONIBLE'; end if;

  if p_metodo_pago='transferencia' then
    if p_comprobante_path is null or p_comprobante_path !~ ('^'||p_token::text||'/[0-9a-fA-F-]{36}\.(jpg|jpeg|png|webp)$') then
      raise exception 'COMPROBANTE_REQUERIDO';
    end if;
    if not exists (select 1 from storage.objects o where o.bucket_id='delivery-comprobantes' and o.name=p_comprobante_path) then
      raise exception 'COMPROBANTE_NO_ENCONTRADO';
    end if;
    v_pago_estado := 'comprobante_recibido';
  elsif p_comprobante_path is not null then
    raise exception 'COMPROBANTE_NO_ESPERADO';
  end if;

  if p_latitud is not null then
    select z.id,z.costo,public.delivery_distancia_km(p_latitud,p_longitud,z.centro_latitud,z.centro_longitud)
      into v_zona_id,v_costo,v_distancia
    from public.delivery_zonas z
    where z.empresa_id=v_empresa and z.activo and (z.ubicacion_id is null or z.ubicacion_id=v_ubicacion)
      and z.radio_km is not null and z.centro_latitud is not null
      and public.delivery_distancia_km(p_latitud,p_longitud,z.centro_latitud,z.centro_longitud)<=z.radio_km
    order by z.radio_km asc,(z.ubicacion_id is not null) desc,z.creado_en limit 1;
  end if;
  if v_zona_id is null and p_latitud is not null then
    select z.id,z.costo into v_zona_id,v_costo from public.delivery_zonas z
    where z.empresa_id=v_empresa and z.activo and (z.ubicacion_id is null or z.ubicacion_id=v_ubicacion)
      and jsonb_array_length(coalesce(z.poligono,'[]'::jsonb))>=3
      and public.delivery_punto_en_poligono(z.poligono,p_latitud,p_longitud)
    order by (z.ubicacion_id is not null) desc,z.creado_en limit 1;
  end if;
  if v_zona_id is null and p_zona_id is not null then
    select z.id,z.costo into v_zona_id,v_costo from public.delivery_zonas z
    where z.id=p_zona_id and z.empresa_id=v_empresa and z.activo
      and (z.ubicacion_id is null or z.ubicacion_id=v_ubicacion)
      and z.radio_km is null and jsonb_array_length(coalesce(z.poligono,'[]'::jsonb))<3;
  end if;
  if v_zona_id is null and not coalesce(p_sin_ubicacion,false) then
    if p_latitud is null then raise exception 'UBICACION_REQUERIDA'; else raise exception 'ZONA_FUERA_DE_COBERTURA'; end if;
  end if;
  if p_pago_con is not null and (p_pago_con<0 or p_pago_con>999999999999) then raise exception 'MONTO_EFECTIVO_INVALIDO'; end if;

  v_result := public.crear_pedido_catalogo_qr_publico(p_token,p_cliente_nombre,p_cliente_telefono,p_items,p_nota);
  v_pedido_id := (v_result->>'id')::uuid;
  if p_metodo_pago='efectivo' and p_pago_con is not null and p_pago_con<(v_result->>'total')::numeric+v_costo then raise exception 'EFECTIVO_INSUFICIENTE'; end if;
  update public.pedidos set delivery_tipo='delivery',delivery_direccion=btrim(p_direccion),delivery_zona_id=v_zona_id,
    delivery_costo=v_costo,delivery_estado='recibido',delivery_actualizado_en=now(),
    delivery_latitud=p_latitud,delivery_longitud=p_longitud,delivery_distancia_km=v_distancia,
    delivery_sin_ubicacion=coalesce(p_sin_ubicacion,false),
    delivery_destinatario=nullif(btrim(coalesce(p_destinatario,'')),''),
    delivery_destinatario_telefono=nullif(btrim(coalesce(p_destinatario_telefono,'')),''),
    delivery_pago_con=case when p_metodo_pago='efectivo' then p_pago_con else null end,
    delivery_metodo_pago=p_metodo_pago,delivery_pago_estado=v_pago_estado,
    delivery_comprobante_path=p_comprobante_path,total=total+v_costo
  where id=v_pedido_id and empresa_id=v_empresa;
  return v_result||jsonb_build_object('total',(v_result->>'total')::numeric+v_costo,
    'delivery_costo',v_costo,'delivery_zona_id',v_zona_id,'delivery_distancia_km',v_distancia,
    'delivery_metodo_pago',p_metodo_pago,'delivery_pago_estado',v_pago_estado);
end; $$;
revoke all on function public.crear_pedido_delivery_qr_publico(uuid,text,text,jsonb,text,text,uuid,numeric,numeric,boolean,text,text,numeric,text,text) from public;
grant execute on function public.crear_pedido_delivery_qr_publico(uuid,text,text,jsonb,text,text,uuid,numeric,numeric,boolean,text,text,numeric,text,text) to anon,authenticated;

notify pgrst,'reload schema';
