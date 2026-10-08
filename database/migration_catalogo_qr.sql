-- Catálogos públicos QR independientes del flujo de ventas e inventario.
create table if not exists public.catalogos_qr (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  nombre text not null,
  estado text not null default 'Activo' check (estado in ('Activo', 'Pausado')),
  expira_el date,
  descripcion text,
  mensaje_bienvenida text,
  categoria text[] not null default '{}',
  marca text[] not null default '{}',
  ubicacion_id uuid references public.ubicaciones_comerciales(id) on delete set null,
  precio_min numeric(12,2),
  precio_max numeric(12,2),
  whatsapp text,
  color text not null default '#f59e0b',
  qr_color text not null default '#111827',
  qr_titulo text,
  qr_subtitulo text,
  public_token uuid not null default gen_random_uuid() unique,
  vistas bigint not null default 0,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);

create index if not exists catalogos_qr_empresa_creado_idx
  on public.catalogos_qr (empresa_id, creado_en desc);
alter table public.catalogos_qr enable row level security;

drop policy if exists catalogos_qr_select_empresa on public.catalogos_qr;
create policy catalogos_qr_select_empresa on public.catalogos_qr for select to authenticated
  using (exists (select 1 from public.usuarios u where u.auth_user_id = auth.uid() and u.empresa_id = catalogos_qr.empresa_id and u.activo is not false and u.permitir_acceso is not false));
drop policy if exists catalogos_qr_insert_empresa on public.catalogos_qr;
create policy catalogos_qr_insert_empresa on public.catalogos_qr for insert to authenticated
  with check (exists (select 1 from public.usuarios u where u.auth_user_id = auth.uid() and u.empresa_id = catalogos_qr.empresa_id and u.activo is not false and u.permitir_acceso is not false));
drop policy if exists catalogos_qr_update_empresa on public.catalogos_qr;
create policy catalogos_qr_update_empresa on public.catalogos_qr for update to authenticated
  using (exists (select 1 from public.usuarios u where u.auth_user_id = auth.uid() and u.empresa_id = catalogos_qr.empresa_id and u.activo is not false and u.permitir_acceso is not false))
  with check (exists (select 1 from public.usuarios u where u.auth_user_id = auth.uid() and u.empresa_id = catalogos_qr.empresa_id and u.activo is not false and u.permitir_acceso is not false));
drop policy if exists catalogos_qr_delete_empresa on public.catalogos_qr;
create policy catalogos_qr_delete_empresa on public.catalogos_qr for delete to authenticated
  using (exists (select 1 from public.usuarios u where u.auth_user_id = auth.uid() and u.empresa_id = catalogos_qr.empresa_id and u.activo is not false and u.permitir_acceso is not false));

grant select, insert, update, delete on public.catalogos_qr to authenticated;

-- RPC público: solo devuelve información apta para catálogo y nunca datos internos.
create or replace function public.obtener_catalogo_qr_publico(p_token uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  c public.catalogos_qr%rowtype;
  empresa_nombre text;
  productos_json jsonb;
begin
  select * into c from public.catalogos_qr where public_token = p_token and estado = 'Activo';
  if not found or (c.expira_el is not null and c.expira_el < current_date) then
    return null;
  end if;

  select nombre into empresa_nombre from public.empresas where id = c.empresa_id;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', p.id, 'nombre', p.nombre, 'codigo', p.codigo, 'descripcion', p.descripcion,
    'precio', p.precio_venta, 'imagen', p.imagen_url, 'categoria', p.categoria,
    'marca', p.marca,
    'disponible', case when c.ubicacion_id is null then p.stock_actual > 0 else coalesce(ps.cantidad, 0) > 0 end
  ) order by p.nombre), '[]'::jsonb)
  into productos_json
  from public.productos p
  left join public.producto_stock_ubicacion ps on ps.producto_id = p.id and ps.ubicacion_id = c.ubicacion_id and ps.empresa_id = p.empresa_id
  where p.empresa_id = c.empresa_id
    and coalesce(p.activo, true) = true
    and (cardinality(c.categoria) = 0 or p.categoria = any(c.categoria))
    and (cardinality(c.marca) = 0 or p.marca = any(c.marca))
    and (c.precio_min is null or coalesce(p.precio_venta, 0) >= c.precio_min)
    and (c.precio_max is null or coalesce(p.precio_venta, 0) <= c.precio_max)
    and (c.ubicacion_id is null or exists (select 1 from public.ubicaciones_comerciales uc where uc.id = c.ubicacion_id and uc.empresa_id = c.empresa_id and uc.activo is true));

  update public.catalogos_qr set vistas = vistas + 1 where id = c.id;
  return jsonb_build_object(
    'nombre', c.nombre, 'empresa', empresa_nombre, 'descripcion', c.descripcion,
    'bienvenida', c.mensaje_bienvenida, 'whatsapp', c.whatsapp, 'color', c.color,
    'productos', productos_json
  );
end;
$$;
revoke all on function public.obtener_catalogo_qr_publico(uuid) from public;
grant execute on function public.obtener_catalogo_qr_publico(uuid) to anon, authenticated;
