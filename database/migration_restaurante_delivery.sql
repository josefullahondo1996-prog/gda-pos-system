-- Delivery para pedidos del catálogo QR: zonas, repartidores y despacho.
-- Ejecutar en Supabase SQL Editor después de las migraciones de pedidos QR.
create table if not exists public.delivery_zonas (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  ubicacion_id uuid null references public.ubicaciones_comerciales(id) on delete cascade,
  nombre text not null check (length(btrim(nombre)) between 2 and 80),
  costo numeric(14,2) not null default 0 check (costo >= 0),
  activo boolean not null default true,
  creado_en timestamptz not null default now(),
  unique (empresa_id, ubicacion_id, nombre)
);

create table if not exists public.delivery_repartidores (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  usuario_auth_id uuid not null,
  vehiculo text,
  activo boolean not null default true,
  creado_en timestamptz not null default now(),
  unique (empresa_id, usuario_auth_id)
);

alter table public.pedidos add column if not exists delivery_tipo text not null default 'retiro'
  check (delivery_tipo in ('retiro','delivery','mesa'));
alter table public.pedidos add column if not exists delivery_direccion text;
alter table public.pedidos add column if not exists delivery_zona_id uuid references public.delivery_zonas(id) on delete set null;
alter table public.pedidos add column if not exists delivery_costo numeric(14,2) not null default 0 check (delivery_costo >= 0);
alter table public.pedidos add column if not exists delivery_repartidor_id uuid;
alter table public.pedidos add column if not exists delivery_estado text not null default 'recibido'
  check (delivery_estado in ('recibido','preparando','listo','asignado','en_camino','entregado','cancelado'));
alter table public.pedidos add column if not exists delivery_actualizado_en timestamptz not null default now();
create index if not exists pedidos_delivery_empresa_estado_idx
  on public.pedidos(empresa_id, delivery_tipo, delivery_estado, creado_en desc);

alter table public.delivery_zonas enable row level security;
alter table public.delivery_repartidores enable row level security;
grant select, insert, update, delete on public.delivery_zonas, public.delivery_repartidores to authenticated;
drop policy if exists delivery_zonas_empresa on public.delivery_zonas;
create policy delivery_zonas_empresa on public.delivery_zonas for all to authenticated
using (exists (select 1 from public.usuarios u where u.auth_user_id=auth.uid() and u.empresa_id=delivery_zonas.empresa_id and u.activo and u.permitir_acceso))
with check (exists (select 1 from public.usuarios u where u.auth_user_id=auth.uid() and u.empresa_id=delivery_zonas.empresa_id and u.activo and u.permitir_acceso));
drop policy if exists delivery_repartidores_empresa on public.delivery_repartidores;
create policy delivery_repartidores_empresa on public.delivery_repartidores for all to authenticated
using (exists (select 1 from public.usuarios u where u.auth_user_id=auth.uid() and u.empresa_id=delivery_repartidores.empresa_id and u.activo and u.permitir_acceso))
with check (exists (select 1 from public.usuarios u where u.auth_user_id=auth.uid() and u.empresa_id=delivery_repartidores.empresa_id and u.activo and u.permitir_acceso)
  and exists (select 1 from public.usuarios u where u.auth_user_id=delivery_repartidores.usuario_auth_id and u.empresa_id=delivery_repartidores.empresa_id and u.activo));

-- RPC público seguro para registrar pedidos delivery. La función existente valida catálogo,
-- precios y stock; este wrapper agrega dirección y tarifa validando zona/sucursal en servidor.
create or replace function public.crear_pedido_delivery_qr_publico(
  p_token uuid, p_cliente_nombre text, p_cliente_telefono text, p_items jsonb,
  p_nota text, p_direccion text, p_zona_id uuid
) returns jsonb language plpgsql security definer
set search_path = pg_catalog, public, pg_temp as $$
declare v_result jsonb; v_pedido_id uuid; v_empresa uuid; v_ubicacion uuid; v_costo numeric;
begin
  if length(btrim(coalesce(p_direccion,''))) < 5 or length(p_direccion) > 300 then raise exception 'DIRECCION_INVALIDA'; end if;
  select empresa_id, ubicacion_id into v_empresa, v_ubicacion from public.catalogos_qr
    where public_token=p_token and estado='Activo' and (expira_el is null or expira_el >= current_date);
  if not found then raise exception 'CATALOGO_NO_DISPONIBLE'; end if;
  select costo into v_costo from public.delivery_zonas z where z.id=p_zona_id and z.empresa_id=v_empresa and z.activo
    and (z.ubicacion_id is null or z.ubicacion_id=v_ubicacion);
  if not found then raise exception 'ZONA_NO_DISPONIBLE'; end if;
  v_result := public.crear_pedido_catalogo_qr_publico(p_token,p_cliente_nombre,p_cliente_telefono,p_items,p_nota);
  v_pedido_id := (v_result->>'id')::uuid;
  update public.pedidos set delivery_tipo='delivery', delivery_direccion=btrim(p_direccion), delivery_zona_id=p_zona_id,
    delivery_costo=v_costo, delivery_estado='recibido', total=total+v_costo, delivery_actualizado_en=now()
    where id=v_pedido_id and empresa_id=v_empresa;
  return v_result || jsonb_build_object('total', (v_result->>'total')::numeric + v_costo, 'delivery_costo',v_costo);
end; $$;
revoke all on function public.crear_pedido_delivery_qr_publico(uuid,text,text,jsonb,text,text,uuid) from public;
grant execute on function public.crear_pedido_delivery_qr_publico(uuid,text,text,jsonb,text,text,uuid) to anon, authenticated;

-- Solo se exponen zonas activas para que el cliente pueda elegir tarifa al ordenar.
create or replace function public.listar_zonas_delivery_qr_publico(p_token uuid)
returns table(id uuid,nombre text,costo numeric) language sql stable security definer
set search_path = pg_catalog, public, pg_temp as $$
  select z.id,z.nombre,z.costo from public.delivery_zonas z join public.catalogos_qr c on c.empresa_id=z.empresa_id
  where c.public_token=p_token and c.estado='Activo' and (c.expira_el is null or c.expira_el>=current_date)
    and z.activo and (z.ubicacion_id is null or z.ubicacion_id=c.ubicacion_id) order by z.nombre;
$$;
revoke all on function public.listar_zonas_delivery_qr_publico(uuid) from public;
grant execute on function public.listar_zonas_delivery_qr_publico(uuid) to anon, authenticated;
