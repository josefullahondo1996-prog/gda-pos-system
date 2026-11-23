-- Delivery con cobertura circular por kilometros y tarifa fija por tramo.
-- Requiere migration_restaurante_delivery.sql y migration_catalogo_qr_carrito.sql.

alter table public.delivery_zonas
  add column if not exists centro_latitud numeric(10,7),
  add column if not exists centro_longitud numeric(10,7),
  add column if not exists radio_km numeric(8,2);

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'delivery_zonas_centro_par' and conrelid = 'public.delivery_zonas'::regclass) then
    alter table public.delivery_zonas add constraint delivery_zonas_centro_par
      check ((centro_latitud is null) = (centro_longitud is null));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'delivery_zonas_radio_valido' and conrelid = 'public.delivery_zonas'::regclass) then
    alter table public.delivery_zonas add constraint delivery_zonas_radio_valido
      check (radio_km is null or (radio_km > 0 and radio_km <= 100));
  end if;
end $$;

alter table public.pedidos add column if not exists delivery_distancia_km numeric(8,2);

create or replace function public.delivery_distancia_km(
  p_latitud_a numeric, p_longitud_a numeric, p_latitud_b numeric, p_longitud_b numeric
) returns numeric language sql immutable strict
set search_path = pg_catalog, public, pg_temp as $$
  select round((2 * 6371.0088 * asin(sqrt(least(1::double precision, greatest(0::double precision,
    power(sin(radians(p_latitud_b - p_latitud_a)::double precision / 2), 2)
    + cos(radians(p_latitud_a)::double precision) * cos(radians(p_latitud_b)::double precision)
      * power(sin(radians(p_longitud_b - p_longitud_a)::double precision / 2), 2)
  )))))::numeric, 2);
$$;
revoke all on function public.delivery_distancia_km(numeric,numeric,numeric,numeric) from public;

create or replace function public.crear_pedido_delivery_qr_publico(
  p_token uuid, p_cliente_nombre text, p_cliente_telefono text, p_items jsonb,
  p_nota text, p_direccion text, p_zona_id uuid,
  p_latitud numeric default null, p_longitud numeric default null,
  p_sin_ubicacion boolean default false, p_destinatario text default null,
  p_destinatario_telefono text default null, p_pago_con numeric default null
) returns jsonb language plpgsql security definer
set search_path = pg_catalog, public, pg_temp as $$
declare
  v_result jsonb; v_pedido_id uuid; v_empresa uuid; v_ubicacion uuid;
  v_costo numeric := 0; v_zona_id uuid; v_distancia numeric;
begin
  if length(btrim(coalesce(p_direccion,''))) < 5 or length(p_direccion) > 300 then raise exception 'DIRECCION_INVALIDA'; end if;
  if (p_latitud is null) <> (p_longitud is null) then raise exception 'UBICACION_INVALIDA'; end if;
  if p_latitud is not null and (p_latitud < -90 or p_latitud > 90 or p_longitud < -180 or p_longitud > 180) then raise exception 'UBICACION_INVALIDA'; end if;
  if p_destinatario is not null and length(btrim(p_destinatario)) > 120 then raise exception 'DESTINATARIO_INVALIDO'; end if;
  if p_destinatario_telefono is not null and length(btrim(p_destinatario_telefono)) > 30 then raise exception 'TELEFONO_DESTINATARIO_INVALIDO'; end if;
  if p_destinatario_telefono is not null and length(regexp_replace(p_destinatario_telefono,'[^0-9]','','g')) < 8 then raise exception 'TELEFONO_DESTINATARIO_INVALIDO'; end if;

  select empresa_id, ubicacion_id into v_empresa, v_ubicacion from public.catalogos_qr
    where public_token=p_token and estado='Activo' and (expira_el is null or expira_el >= current_date);
  if not found then raise exception 'CATALOGO_NO_DISPONIBLE'; end if;

  if p_latitud is not null then
    select z.id, z.costo, public.delivery_distancia_km(p_latitud,p_longitud,z.centro_latitud,z.centro_longitud)
      into v_zona_id, v_costo, v_distancia
    from public.delivery_zonas z
    where z.empresa_id=v_empresa and z.activo and (z.ubicacion_id is null or z.ubicacion_id=v_ubicacion)
      and z.radio_km is not null and z.centro_latitud is not null
      and public.delivery_distancia_km(p_latitud,p_longitud,z.centro_latitud,z.centro_longitud) <= z.radio_km
    order by z.radio_km asc, (z.ubicacion_id is not null) desc, z.creado_en
    limit 1;
  end if;

  -- Compatibilidad: las zonas anteriores con poligono siguen funcionando.
  if v_zona_id is null and p_latitud is not null then
    select z.id, z.costo into v_zona_id, v_costo from public.delivery_zonas z
    where z.empresa_id=v_empresa and z.activo and (z.ubicacion_id is null or z.ubicacion_id=v_ubicacion)
      and jsonb_array_length(coalesce(z.poligono,'[]'::jsonb)) >= 3
      and public.delivery_punto_en_poligono(z.poligono,p_latitud,p_longitud)
    order by (z.ubicacion_id is not null) desc, z.creado_en limit 1;
  end if;
  if v_zona_id is null and p_zona_id is not null then
    select z.id,z.costo into v_zona_id,v_costo from public.delivery_zonas z
      where z.id=p_zona_id and z.empresa_id=v_empresa and z.activo
        and (z.ubicacion_id is null or z.ubicacion_id=v_ubicacion)
        and z.radio_km is null and jsonb_array_length(coalesce(z.poligono,'[]'::jsonb)) < 3;
  end if;
  if v_zona_id is null and not coalesce(p_sin_ubicacion,false) then
    if p_latitud is null then raise exception 'UBICACION_REQUERIDA'; else raise exception 'ZONA_FUERA_DE_COBERTURA'; end if;
  end if;
  if p_pago_con is not null and (p_pago_con < 0 or p_pago_con > 999999999999) then raise exception 'MONTO_EFECTIVO_INVALIDO'; end if;

  v_result := public.crear_pedido_catalogo_qr_publico(p_token,p_cliente_nombre,p_cliente_telefono,p_items,p_nota);
  v_pedido_id := (v_result->>'id')::uuid;
  if p_pago_con is not null and p_pago_con < (v_result->>'total')::numeric + v_costo then raise exception 'EFECTIVO_INSUFICIENTE'; end if;
  update public.pedidos set delivery_tipo='delivery', delivery_direccion=btrim(p_direccion), delivery_zona_id=v_zona_id,
    delivery_costo=v_costo, delivery_estado='recibido', delivery_actualizado_en=now(),
    delivery_latitud=p_latitud, delivery_longitud=p_longitud, delivery_distancia_km=v_distancia,
    delivery_sin_ubicacion=coalesce(p_sin_ubicacion,false),
    delivery_destinatario=nullif(btrim(coalesce(p_destinatario,'')),''),
    delivery_destinatario_telefono=nullif(btrim(coalesce(p_destinatario_telefono,'')),''),
    delivery_pago_con=p_pago_con, total=total+v_costo
    where id=v_pedido_id and empresa_id=v_empresa;
  return v_result || jsonb_build_object('total',(v_result->>'total')::numeric+v_costo,
    'delivery_costo',v_costo,'delivery_zona_id',v_zona_id,'delivery_distancia_km',v_distancia);
end; $$;
revoke all on function public.crear_pedido_delivery_qr_publico(uuid,text,text,jsonb,text,text,uuid,numeric,numeric,boolean,text,text,numeric) from public;
grant execute on function public.crear_pedido_delivery_qr_publico(uuid,text,text,jsonb,text,text,uuid,numeric,numeric,boolean,text,text,numeric) to anon, authenticated;

drop function if exists public.listar_zonas_delivery_qr_publico(uuid);
create function public.listar_zonas_delivery_qr_publico(p_token uuid)
returns table(id uuid,nombre text,costo numeric,poligono jsonb,centro_latitud numeric,centro_longitud numeric,radio_km numeric)
language sql stable security definer set search_path = pg_catalog, public, pg_temp as $$
  select z.id,z.nombre,z.costo,z.poligono,z.centro_latitud,z.centro_longitud,z.radio_km
  from public.delivery_zonas z join public.catalogos_qr c on c.empresa_id=z.empresa_id
  where c.public_token=p_token and c.estado='Activo' and (c.expira_el is null or c.expira_el>=current_date)
    and z.activo and (z.ubicacion_id is null or z.ubicacion_id=c.ubicacion_id)
  order by z.radio_km nulls last, z.nombre;
$$;
revoke all on function public.listar_zonas_delivery_qr_publico(uuid) from public;
grant execute on function public.listar_zonas_delivery_qr_publico(uuid) to anon, authenticated;

notify pgrst, 'reload schema';
