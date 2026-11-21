import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bike, MapPin, MessageCircle, RefreshCw, Save, Truck } from 'lucide-react';
import { supabase } from './supabaseClient';
import { useEmpresaInfo } from './utils/useEmpresa';
import { useNotificacion } from './NotificacionContext';
import MapaDelivery from './MapaDelivery';

const G = (n) => `Gs ${Math.round(Number(n || 0)).toLocaleString('es-PY')}`;
const ESTADOS = ['recibido', 'preparando', 'listo', 'asignado', 'en_camino', 'entregado', 'cancelado'];
const ETIQUETAS = { recibido: 'Recibido', preparando: 'Preparando', listo: 'Listo', asignado: 'Repartidor asignado', en_camino: 'En camino', entregado: 'Entregado', cancelado: 'Cancelado' };
const mensajeWhatsAppDelivery = (pedido, nombreZona) => {
  const latitud = Number(pedido.delivery_latitud);
  const longitud = Number(pedido.delivery_longitud);
  const tieneCoordenadas = pedido.delivery_latitud != null && pedido.delivery_longitud != null && Number.isFinite(latitud) && Number.isFinite(longitud);
  const mapa = tieneCoordenadas ? `https://www.google.com/maps/dir/?api=1&destination=${latitud},${longitud}` : null;
  const lineas = [
    `🚚 *Pedido delivery ${pedido.numero_pedido || ''}*`,
    `Cliente: ${pedido.cliente_nombre || 'Sin nombre'}`,
    pedido.cliente_telefono ? `Teléfono del cliente: ${pedido.cliente_telefono}` : null,
    pedido.delivery_destinatario ? `Recibe: ${pedido.delivery_destinatario}` : null,
    pedido.delivery_destinatario_telefono ? `Teléfono de quien recibe: ${pedido.delivery_destinatario_telefono}` : null,
    `Dirección: ${pedido.delivery_direccion || 'Confirmar con el cliente'}`,
    `Zona: ${nombreZona || 'Por confirmar'} · Envío: Gs ${Math.round(Number(pedido.delivery_costo || 0)).toLocaleString('es-PY')}`,
    mapa ? `📍 Ubicación exacta: ${mapa}` : '📍 El cliente no marcó ubicación exacta; confirmar por teléfono.',
    '',
    'Productos:',
    ...(pedido.items || []).map((item) => `• ${item.cantidad} × ${item.nombre}`),
    `Total: Gs ${Math.round(Number(pedido.total || 0)).toLocaleString('es-PY')}`,
    pedido.delivery_pago_con ? `Paga con: Gs ${Math.round(Number(pedido.delivery_pago_con)).toLocaleString('es-PY')}` : null,
    pedido.nota ? `Nota: ${pedido.nota}` : null,
  ].filter(Boolean);
  return lineas.join('\n');
};

export default function DeliveryRestaurante() {
  const empresa = useEmpresaInfo(); const empresaId = empresa?.id; const { notificar } = useNotificacion();
  const navigate = useNavigate();
  const [zonas, setZonas] = useState([]); const [repartidores, setRepartidores] = useState([]); const [usuarios, setUsuarios] = useState([]); const [pedidos, setPedidos] = useState([]); const [ventasDelivery, setVentasDelivery] = useState(new Map());
  const [zona, setZona] = useState({ nombre: '', costo: '', poligono: [] }); const [repartidor, setRepartidor] = useState({ usuario_auth_id: '', vehiculo: '' }); const [cargando, setCargando] = useState(true); const [guardando, setGuardando] = useState(false); const [error, setError] = useState('');
  const [pedidoParaCancelar, setPedidoParaCancelar] = useState(null); const [motivoCancelacion, setMotivoCancelacion] = useState('');
  const cargar = useCallback(async () => {
    if (!empresaId) return;
    setCargando(true); setError('');
    const [z, d, u, p, v] = await Promise.all([
      supabase.from('delivery_zonas').select('*').eq('empresa_id', empresaId).order('nombre'),
      supabase.from('delivery_repartidores').select('*').eq('empresa_id', empresaId).order('creado_en'),
      supabase.from('usuarios').select('auth_user_id,nombre,apellido').eq('empresa_id', empresaId).eq('activo', true).eq('permitir_acceso', true).order('nombre'),
      supabase.from('pedidos').select('*').eq('empresa_id', empresaId).eq('delivery_tipo', 'delivery').order('creado_en', { ascending: false }).limit(150),
      supabase.from('pedidos_qr_ventas').select('pedido_id,venta_id,estado_pago').eq('empresa_id', empresaId),
    ]);
    const fallo = z.error || d.error || u.error || p.error || v.error;
    if (fallo) setError(`No se pudo cargar Delivery. Revisá las migraciones de Delivery y pedidos QR en Supabase. ${fallo.message}`);
    setZonas(z.data || []); setRepartidores(d.data || []); setUsuarios(u.data || []); setPedidos(p.data || []); setVentasDelivery(new Map((v.data || []).map((item) => [item.pedido_id, item]))); setCargando(false);
  }, [empresaId]);
  useEffect(() => { cargar(); }, [cargar]);
  useEffect(() => {
    if (!empresaId) return undefined;
    const channel = supabase.channel(`restaurante-delivery-${empresaId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pedidos', filter: `empresa_id=eq.${empresaId}` }, () => cargar())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [empresaId, cargar]);
  const guardarZona = async (e) => { e.preventDefault(); if (!zona.nombre.trim() || Number(zona.costo) < 0) return; if (zona.poligono.length > 0 && zona.poligono.length < 3) return notificar.error('Una zona dibujada necesita al menos 3 puntos.'); setGuardando(true); const { error: err } = await supabase.from('delivery_zonas').insert({ empresa_id: empresaId, nombre: zona.nombre.trim(), costo: Number(zona.costo), poligono: zona.poligono }); setGuardando(false); if (err) return notificar.error(err.message); setZona({ nombre: '', costo: '', poligono: [] }); cargar(); notificar.exito('Zona de entrega guardada.'); };
  const guardarRepartidor = async (e) => { e.preventDefault(); if (!repartidor.usuario_auth_id) return; setGuardando(true); const { error: err } = await supabase.from('delivery_repartidores').upsert({ empresa_id: empresaId, ...repartidor }, { onConflict: 'empresa_id,usuario_auth_id' }); setGuardando(false); if (err) return notificar.error(err.message); setRepartidor({ usuario_auth_id: '', vehiculo: '' }); cargar(); notificar.exito('Repartidor habilitado para Delivery.'); };
  const actualizarPedido = async (pedido, cambios) => { setGuardando(true); const { error: err } = await supabase.from('pedidos').update({ ...cambios, delivery_actualizado_en: new Date().toISOString() }).eq('id', pedido.id).eq('empresa_id', empresaId); setGuardando(false); if (err) { notificar.error(`No se pudo actualizar el pedido: ${err.message}`); return false; } await cargar(); return true; };
  const cancelarPedido = async (event) => { event.preventDefault(); const motivo = motivoCancelacion.trim(); if (!pedidoParaCancelar || motivo.length < 3) return; const guardado = await actualizarPedido(pedidoParaCancelar, { delivery_estado: 'cancelado', delivery_cancelado_motivo: motivo }); if (guardado) { setPedidoParaCancelar(null); setMotivoCancelacion(''); notificar.exito('Pedido delivery cancelado y registrado en el historial.'); } };
  const mapaUsuarios = new Map(usuarios.map((u) => [u.auth_user_id, [u.nombre, u.apellido].filter(Boolean).join(' ')]));
  const mapaZonas = new Map(zonas.map((z) => [z.id, z.nombre]));
  return <div className="space-y-5">
    <header className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-lg font-black">Delivery · Zonas y repartidores</h2><p className="text-sm text-slate-500">Configurá tarifas y recibí aquí los pedidos del catálogo que solicitan entrega.</p></div><button onClick={cargar} disabled={cargando} className="inline-flex items-center gap-2 rounded-lg border bg-white px-3 py-2 text-sm font-bold"><RefreshCw size={15} className={cargando ? 'animate-spin' : ''}/>Actualizar</button></header>
    {error && <div role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">{error}</div>}
    <div className="grid gap-4 lg:grid-cols-2">
      <section className="rounded-xl border bg-white p-4"><h3 className="mb-3 flex items-center gap-2 font-black"><MapPin size={17}/>Zonas y tarifas</h3><form onSubmit={guardarZona} className="space-y-3"><div className="grid gap-2 sm:grid-cols-[1fr_150px_auto]"><input required maxLength="80" value={zona.nombre} onChange={(e)=>setZona({...zona,nombre:e.target.value})} placeholder="Ej.: Centro" className="rounded-lg border px-3 py-2 text-sm"/><input required type="number" min="0" value={zona.costo} onChange={(e)=>setZona({...zona,costo:e.target.value})} placeholder="Tarifa Gs" className="rounded-lg border px-3 py-2 text-sm"/><button disabled={guardando} className="inline-flex items-center justify-center gap-1 rounded-lg bg-orange-500 px-3 py-2 text-sm font-bold text-white"><Save size={14}/>Guardar zona</button></div><MapaDelivery puntos={zona.poligono} onChange={(poligono)=>setZona((actual)=>({...actual,poligono}))}/></form><div className="mt-3 divide-y rounded-lg border">{zonas.map((z)=><div key={z.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm"><span className="font-semibold">{z.nombre}{z.poligono?.length>=3&&<small className="ml-2 text-slate-400">· cobertura dibujada</small>}</span><span>{G(z.costo)}</span><button onClick={async()=>{const {error:err}=await supabase.from('delivery_zonas').update({activo:!z.activo}).eq('id',z.id).eq('empresa_id',empresaId);if(err)notificar.error(err.message);else cargar();}} className={`rounded-full px-2 py-1 text-xs font-bold ${z.activo?'bg-emerald-100 text-emerald-800':'bg-slate-100 text-slate-500'}`}>{z.activo?'Activa':'Pausada'}</button></div>)}{!zonas.length&&<p className="p-4 text-sm text-slate-500">Agregá una zona para habilitar pedidos a domicilio en el catálogo.</p>}</div><p className="mt-2 text-xs text-slate-500">Trazá la cobertura sobre OpenStreetMap y asignale tarifa fija. Sin polígono, la zona estará disponible para seleccionarla manualmente desde el catálogo.</p></section>
      <section className="rounded-xl border bg-white p-4"><h3 className="mb-3 flex items-center gap-2 font-black"><Bike size={17}/>Repartidores</h3><form onSubmit={guardarRepartidor} className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]"><select required value={repartidor.usuario_auth_id} onChange={(e)=>setRepartidor({...repartidor,usuario_auth_id:e.target.value})} className="rounded-lg border bg-white px-3 py-2 text-sm"><option value="">Seleccionar usuario</option>{usuarios.map((u)=><option key={u.auth_user_id} value={u.auth_user_id}>{[u.nombre,u.apellido].filter(Boolean).join(' ')}</option>)}</select><input value={repartidor.vehiculo} onChange={(e)=>setRepartidor({...repartidor,vehiculo:e.target.value})} placeholder="Vehículo (opcional)" className="rounded-lg border px-3 py-2 text-sm"/><button disabled={guardando} className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-bold text-white">Habilitar</button></form><div className="mt-3 divide-y rounded-lg border">{repartidores.map((d)=><div key={d.id} className="flex items-center justify-between px-3 py-2 text-sm"><span className="font-semibold">{mapaUsuarios.get(d.usuario_auth_id)||'Usuario'}</span><span className="text-slate-500">{d.vehiculo||'Sin vehículo'}</span><button onClick={async()=>{const {error:err}=await supabase.from('delivery_repartidores').update({activo:!d.activo}).eq('id',d.id);if(err)notificar.error(err.message);else cargar();}} className="text-xs font-bold text-orange-700">{d.activo?'Deshabilitar':'Habilitar'}</button></div>)}{!repartidores.length&&<p className="p-4 text-sm text-slate-500">Habilitá usuarios de tu empresa para asignarles entregas.</p>}</div><p className="mt-2 text-xs text-slate-500">El repartidor debe contar con usuario PyPOS activo. La bandeja operativa queda visible para los usuarios autorizados de la empresa.</p></section>
    </div>
    <section className="rounded-xl border bg-white p-4"><div className="mb-3 flex items-center gap-2"><Truck size={18}/><h3 className="font-black">Pedidos para entregar <span className="ml-1 rounded-full bg-orange-100 px-2 py-0.5 text-xs text-orange-800">{pedidos.filter((p)=>!['entregado','cancelado'].includes(p.delivery_estado)).length} activos</span></h3></div>
      {cargando ? <p className="p-8 text-center text-slate-500">Cargando pedidos…</p> : pedidos.length ? <div className="grid gap-3 lg:grid-cols-2">{pedidos.map((p)=>{
        const tieneCoordenadas=p.delivery_latitud!=null&&p.delivery_longitud!=null;
        const latitud=Number(p.delivery_latitud); const longitud=Number(p.delivery_longitud);
        const urlGoogleMaps=`https://www.google.com/maps/dir/?api=1&destination=${latitud},${longitud}`;
        const urlOSM=`https://www.openstreetmap.org/?mlat=${latitud}&mlon=${longitud}#map=17/${latitud}/${longitud}`;
        const urlWhatsApp=`https://wa.me/?text=${encodeURIComponent(mensajeWhatsAppDelivery(p,mapaZonas.get(p.delivery_zona_id)))}`;
        const finalizado=['entregado','cancelado'].includes(p.delivery_estado);
        return <article key={p.id} className="rounded-xl border border-slate-200 p-4">
          <div className="flex justify-between gap-3"><div><p className="text-xs font-bold uppercase text-orange-700">{p.numero_pedido} · {new Date(p.creado_en).toLocaleString('es-PY')}</p><h4 className="mt-1 font-black">{p.cliente_nombre} · {p.cliente_telefono||'Sin teléfono'}</h4></div><b className="whitespace-nowrap">{G(p.total)}</b></div>
          <p className="mt-2 rounded-lg bg-slate-50 p-2 text-sm"><MapPin size={14} className="mr-1 inline"/>{p.delivery_direccion||'Dirección por confirmar'} · {mapaZonas.get(p.delivery_zona_id)||'Zona por confirmar'} · envío {G(p.delivery_costo)}</p>
          {p.delivery_destinatario&&<p className="mt-1 text-sm text-slate-700">Recibe: <b>{p.delivery_destinatario}</b>{p.delivery_destinatario_telefono&&` · ${p.delivery_destinatario_telefono}`}</p>}
          {tieneCoordenadas?<div className="mt-2 flex flex-wrap gap-2"><a target="_blank" rel="noreferrer" href={urlGoogleMaps} className="inline-flex rounded-lg bg-blue-700 px-3 py-1.5 text-xs font-bold text-white">Cómo llegar en Google Maps</a><a target="_blank" rel="noreferrer" href={urlOSM} className="inline-flex rounded-lg border border-blue-200 bg-white px-3 py-1.5 text-xs font-bold text-blue-700">Ver en OpenStreetMap</a></div>:<p className="mt-2 rounded-lg bg-amber-50 p-2 text-xs font-bold text-amber-900">Confirmá la dirección con el cliente: no hay ubicación exacta.</p>}
          <a href={urlWhatsApp} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white hover:bg-emerald-700"><MessageCircle size={15}/>Compartir pedido con repartidor</a>
          <p className="mt-2 text-sm text-slate-600">{(Array.isArray(p.items)?p.items:[]).map((i)=>`${i.cantidad}× ${i.nombre}`).join(', ')}</p>
          {p.delivery_pago_con&&<p className="mt-1 text-xs text-slate-600">Efectivo con: {G(p.delivery_pago_con)}</p>}{p.nota&&<p className="mt-1 text-xs text-slate-500">Nota: {p.nota}</p>}
          {p.delivery_estado==='entregado'&&<div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3">{ventasDelivery.get(p.id)?<><p className="font-bold text-emerald-900">Facturado · venta #{ventasDelivery.get(p.id).venta_id}</p><p className="mt-1 text-xs text-emerald-800">Efectivo recibido {G(p.delivery_efectivo_recibido)} · vuelto {G(p.delivery_vuelto)}</p></>:p.delivery_efectivo_recibido!=null?<><p className="font-bold text-emerald-950">Entrega confirmada · factura pendiente</p><p className="mt-1 text-sm text-emerald-900">Efectivo recibido {G(p.delivery_efectivo_recibido)} · vuelto {G(p.delivery_vuelto)}</p><button type="button" onClick={()=>navigate('/pos',{state:{pedidoDelivery:{id:p.id}}})} className="mt-2 rounded-lg bg-emerald-700 px-3 py-2 text-sm font-bold text-white hover:bg-emerald-800">Facturar en el POS</button></>:<p className="font-bold text-amber-900">Entrega anterior: falta registrar el efectivo recibido para habilitar la factura.</p>}</div>}
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <select disabled={finalizado} value={p.delivery_estado||'recibido'} onChange={(e)=>actualizarPedido(p,{delivery_estado:e.target.value})} className="rounded-lg border bg-white px-3 py-2 text-sm disabled:bg-slate-100">{ESTADOS.filter((x)=>!['entregado','cancelado'].includes(x)).map((x)=><option key={x} value={x}>{ETIQUETAS[x]}</option>)}{finalizado&&<option value={p.delivery_estado}>{ETIQUETAS[p.delivery_estado]}</option>}</select>
            <select disabled={finalizado} value={p.delivery_repartidor_id||''} onChange={(e)=>actualizarPedido(p,{delivery_repartidor_id:e.target.value||null,delivery_estado:e.target.value?'asignado':p.delivery_estado})} className="rounded-lg border bg-white px-3 py-2 text-sm disabled:bg-slate-100"><option value="">Sin repartidor</option>{repartidores.filter((d)=>d.activo).map((d)=><option key={d.id} value={d.usuario_auth_id}>{mapaUsuarios.get(d.usuario_auth_id)||'Usuario'} · {d.vehiculo||'repartidor'}</option>)}</select>
            {!finalizado&&<button type="button" onClick={()=>{setPedidoParaCancelar(p);setMotivoCancelacion('');}} className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-bold text-red-700 hover:bg-red-100 sm:col-span-2">Cancelar pedido</button>}
          </div>
        </article>;
      })}</div> : <div className="rounded-xl border border-dashed p-8 text-center text-sm text-slate-500">Todavía no hay pedidos delivery. Cuando un cliente envíe uno desde el catálogo, aparecerá en esta bandeja.</div>}
    </section>
    {pedidoParaCancelar && <div role="dialog" aria-modal="true" aria-labelledby="delivery-cancel-title" className="fixed inset-0 z-[80] grid place-items-center bg-slate-950/50 p-4"><form onSubmit={cancelarPedido} className="w-full max-w-md space-y-4 rounded-2xl bg-white p-5 shadow-xl"><div><h3 id="delivery-cancel-title" className="text-lg font-black">Cancelar pedido {pedidoParaCancelar.numero_pedido}</h3><p className="text-sm text-slate-500">El motivo quedará guardado en el historial de Delivery.</p></div><textarea required minLength={3} maxLength={500} value={motivoCancelacion} onChange={(e)=>setMotivoCancelacion(e.target.value)} placeholder="Motivo de cancelación" className="min-h-24 w-full rounded-lg border p-3 text-sm"/><div className="flex justify-end gap-2"><button type="button" disabled={guardando} onClick={()=>setPedidoParaCancelar(null)} className="rounded-lg border px-4 py-2 text-sm font-bold">Volver</button><button type="submit" disabled={guardando||motivoCancelacion.trim().length<3} className="rounded-lg bg-red-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">{guardando?'Guardando…':'Confirmar cancelación'}</button></div></form></div>}
  </div>;
}
