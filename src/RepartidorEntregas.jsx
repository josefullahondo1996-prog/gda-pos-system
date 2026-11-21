import { useCallback, useEffect, useState } from 'react';
import { ArrowUpRight, CheckCircle2, MapPin, Phone, RefreshCw, Truck } from 'lucide-react';
import { supabase } from './supabaseClient';
import { useEmpresaInfo } from './utils/useEmpresa';
import { useNotificacion } from './NotificacionContext';

const importe = (valor) => `Gs ${Math.round(Number(valor || 0)).toLocaleString('es-PY')}`;
const etiquetaEstado = (estado) => ({ recibido: 'Recibido', preparando: 'Preparando', listo: 'Listo para despacho', asignado: 'Asignado', en_camino: 'En camino', entregado: 'Entregado', cancelado: 'Cancelado' })[estado] || 'Recibido';

export default function RepartidorEntregas({ perfilUsuario }) {
  const empresa = useEmpresaInfo();
  const empresaId = perfilUsuario?.empresa_id || empresa?.id;
  const authUserId = perfilUsuario?.auth_user_id;
  const { notificar } = useNotificacion();
  const [pedidos, setPedidos] = useState([]);
  const [repartidor, setRepartidor] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [guardandoId, setGuardandoId] = useState('');
  const [error, setError] = useState('');
  const [pedidoParaFinalizar, setPedidoParaFinalizar] = useState(null);
  const [montoEfectivo, setMontoEfectivo] = useState('');

  const cargar = useCallback(async () => {
    if (!empresaId || !authUserId) { setCargando(false); return; }
    setCargando(true);
    setError('');
    const { data: asignacion, error: errorAsignacion } = await supabase
      .from('delivery_repartidores')
      .select('empresa_id, usuario_auth_id, vehiculo, activo')
      .eq('empresa_id', empresaId)
      .eq('usuario_auth_id', authUserId)
      .eq('activo', true)
      .maybeSingle();
    if (errorAsignacion) {
      setError(`No se pudo verificar tu acceso a Delivery: ${errorAsignacion.message}`);
      setRepartidor(null);
      setPedidos([]);
      setCargando(false);
      return;
    }
    setRepartidor(asignacion);
    if (!asignacion) { setPedidos([]); setCargando(false); return; }
    const { data, error: errorPedidos } = await supabase
      .from('pedidos')
      .select('*')
      .eq('empresa_id', empresaId)
      .eq('delivery_tipo', 'delivery')
      .eq('delivery_repartidor_id', authUserId)
      .order('creado_en', { ascending: false })
      .limit(100);
    if (errorPedidos) setError(`No se pudieron cargar tus entregas: ${errorPedidos.message}`);
    setPedidos(data || []);
    setCargando(false);
  }, [empresaId, authUserId]);

  useEffect(() => { cargar(); }, [cargar]);
  useEffect(() => {
    if (!empresaId || !authUserId) return undefined;
    const channel = supabase.channel(`mis-entregas-${empresaId}-${authUserId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pedidos', filter: `empresa_id=eq.${empresaId}` }, cargar)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [empresaId, authUserId, cargar]);

  const cambiarEstado = async (pedido, estadoNuevo) => {
    if (estadoNuevo === 'entregado') {
      setPedidoParaFinalizar(pedido);
      setMontoEfectivo('');
      return;
    }
    setGuardandoId(pedido.id);
    const { error: errorActualizacion } = await supabase.rpc('actualizar_estado_pedido_delivery_repartidor', {
      p_pedido_id: pedido.id,
      p_estado_nuevo: estadoNuevo,
    });
    setGuardandoId('');
    if (errorActualizacion) return notificar.error(`No se pudo actualizar el pedido: ${errorActualizacion.message}`);
    setPedidos((actuales) => actuales.map((item) => item.id === pedido.id ? { ...item, delivery_estado: estadoNuevo } : item));
    notificar.exito(estadoNuevo === 'entregado' ? `Pedido ${pedido.numero_pedido} marcado como entregado.` : `Pedido ${pedido.numero_pedido} marcado en camino.`);
  };

  const confirmarEntrega = async (event) => {
    event.preventDefault();
    if (!pedidoParaFinalizar) return;
    const recibido = Number(montoEfectivo);
    if (!Number.isFinite(recibido) || recibido < Number(pedidoParaFinalizar.total || 0)) return;
    setGuardandoId(pedidoParaFinalizar.id);
    const { data, error: errorActualizacion } = await supabase.rpc('finalizar_entrega_pedido_delivery_repartidor', {
      p_pedido_id: pedidoParaFinalizar.id,
      p_monto_efectivo: recibido,
    });
    setGuardandoId('');
    if (errorActualizacion) return notificar.error(`No se pudo registrar la entrega y el cobro: ${errorActualizacion.message}`);
    setPedidos((actuales) => actuales.map((item) => item.id === pedidoParaFinalizar.id ? {
      ...item,
      delivery_estado: 'entregado',
      delivery_efectivo_recibido: Number(data?.efectivo_recibido ?? recibido),
      delivery_vuelto: Number(data?.vuelto ?? (recibido - Number(pedidoParaFinalizar.total || 0))),
    } : item));
    notificar.exito(`Pedido ${pedidoParaFinalizar.numero_pedido} entregado. Vuelto: ${importe(data?.vuelto ?? recibido - Number(pedidoParaFinalizar.total || 0))}.`);
    setPedidoParaFinalizar(null);
    setMontoEfectivo('');
  };

  const activos = pedidos.filter((pedido) => !['entregado', 'cancelado'].includes(pedido.delivery_estado));
  const finalizados = pedidos.filter((pedido) => ['entregado', 'cancelado'].includes(pedido.delivery_estado));

  return <div className="space-y-5">
    <header className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-white p-4">
      <div><h2 className="flex items-center gap-2 text-lg font-black"><Truck size={20}/>Mis entregas</h2><p className="mt-1 text-sm text-slate-500">Pedidos asignados a tu usuario{repartidor?.vehiculo ? ` · ${repartidor.vehiculo}` : ''}</p></div>
      <button type="button" onClick={cargar} disabled={cargando} className="inline-flex items-center gap-2 rounded-lg border bg-white px-3 py-2 text-sm font-bold"><RefreshCw size={15} className={cargando ? 'animate-spin' : ''}/>Actualizar</button>
    </header>
    {error && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</div>}
    {!error && !cargando && !repartidor && <div className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">Tu usuario todavía no está habilitado como repartidor. Pedile al administrador que lo active en <b>Restaurante → Delivery · Repartidores</b>.</div>}
    {repartidor && <>
      <div className="flex items-center justify-between gap-3"><h3 className="font-black text-slate-800">Pendientes de entrega</h3><span className="rounded-full bg-orange-100 px-2.5 py-1 text-xs font-black text-orange-800">{activos.length}</span></div>
      {cargando ? <p className="rounded-xl border bg-white p-8 text-center text-slate-500">Cargando tus pedidos…</p> : activos.length ? <div className="grid gap-3 lg:grid-cols-2">{activos.map((pedido) => {
        const tienePunto = pedido.delivery_latitud != null && pedido.delivery_longitud != null;
        const mapa = tienePunto ? `https://www.google.com/maps/dir/?api=1&destination=${pedido.delivery_latitud},${pedido.delivery_longitud}` : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(pedido.delivery_direccion || '')}`;
        return <article key={pedido.id} className="space-y-3 rounded-xl border bg-white p-4 shadow-sm">
          <div className="flex items-start justify-between gap-3"><div><p className="text-xs font-bold uppercase text-orange-700">{pedido.numero_pedido} · {new Date(pedido.creado_en).toLocaleString('es-PY')}</p><h4 className="mt-1 text-lg font-black">{pedido.cliente_nombre}</h4></div><span className="rounded-full bg-blue-50 px-2 py-1 text-xs font-bold text-blue-800">{etiquetaEstado(pedido.delivery_estado)}</span></div>
          {pedido.cliente_telefono && <a href={`tel:${pedido.cliente_telefono}`} className="inline-flex items-center gap-2 text-sm font-semibold text-blue-700"><Phone size={15}/>{pedido.cliente_telefono}</a>}
          {pedido.delivery_destinatario && <p className="text-sm text-slate-700">Recibe: <b>{pedido.delivery_destinatario}</b>{pedido.delivery_destinatario_telefono && ` · ${pedido.delivery_destinatario_telefono}`}</p>}
          <div className="rounded-lg bg-slate-50 p-3 text-sm"><p className="font-bold text-slate-800"><MapPin size={15} className="mr-1 inline"/>{pedido.delivery_direccion || 'Dirección por confirmar'}</p>{tienePunto && <p className="mt-1 text-xs text-slate-500">{Number(pedido.delivery_latitud).toFixed(6)}, {Number(pedido.delivery_longitud).toFixed(6)}</p>}<a href={mapa} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1 text-xs font-bold text-blue-700">Abrir ruta en Google Maps <ArrowUpRight size={13}/></a></div>
          <div className="space-y-1 border-t pt-3 text-sm">{(pedido.items || []).map((item, index) => <p key={`${pedido.id}-${index}`}>{item.cantidad} × {item.nombre}</p>)}</div>
          {pedido.nota && <p className="rounded-lg bg-amber-50 p-2 text-sm text-amber-900">Nota: {pedido.nota}</p>}
          <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3"><div className="text-sm"><p>Total: <b>{importe(pedido.total)}</b></p><p className="text-slate-500">Envío: {importe(pedido.delivery_costo)}{pedido.delivery_pago_con ? ` · paga con ${importe(pedido.delivery_pago_con)}` : ''}</p></div>{pedido.estado === 'completado' && ['asignado','listo'].includes(pedido.delivery_estado) ? <button type="button" disabled={guardandoId === pedido.id} onClick={() => cambiarEstado(pedido, 'en_camino')} className="inline-flex items-center gap-2 rounded-lg bg-blue-700 px-4 py-2.5 text-sm font-black text-white hover:bg-blue-800 disabled:opacity-50"><Truck size={17}/>{guardandoId === pedido.id ? 'Guardando…' : 'Iniciar entrega'}</button> : pedido.delivery_estado === 'en_camino' ? <button type="button" disabled={guardandoId === pedido.id} onClick={() => cambiarEstado(pedido, 'entregado')} className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-black text-white hover:bg-emerald-700 disabled:opacity-50"><CheckCircle2 size={17}/>{guardandoId === pedido.id ? 'Guardando…' : 'Marcar entregado'}</button> : <span className="rounded-lg bg-slate-100 px-3 py-2 text-xs font-bold text-slate-600">Esperando que cocina lo deje listo</span>}</div>
        </article>;
      })}</div> : <div className="rounded-xl border border-dashed bg-white p-8 text-center text-sm text-slate-500">No tenés pedidos pendientes asignados.</div>}
      {finalizados.length > 0 && <details className="rounded-xl border bg-white p-4"><summary className="cursor-pointer font-bold text-slate-700">Entregas finalizadas ({finalizados.length})</summary><div className="mt-3 divide-y">{finalizados.map((pedido) => <div key={pedido.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm"><span><b>{pedido.numero_pedido}</b> · {pedido.cliente_nombre} · {pedido.delivery_direccion}{pedido.delivery_estado === 'entregado' && <> · Recibido {importe(pedido.delivery_efectivo_recibido)} · vuelto {importe(pedido.delivery_vuelto)}</>}</span><span className={`rounded-full px-2 py-1 text-xs font-bold ${pedido.delivery_estado === 'entregado' ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'}`}>{pedido.delivery_estado === 'entregado' ? 'Entregado' : 'Cancelado'}</span></div>)}</div></details>}
    </>}
    {pedidoParaFinalizar && <div role="dialog" aria-modal="true" aria-labelledby="delivery-cobro-title" className="fixed inset-0 z-[100] grid place-items-center bg-slate-950/55 p-4"><form onSubmit={confirmarEntrega} className="w-full max-w-md space-y-4 rounded-2xl bg-white p-5 shadow-2xl"><div><h3 id="delivery-cobro-title" className="text-xl font-black">Confirmar entrega · {pedidoParaFinalizar.numero_pedido}</h3><p className="mt-1 text-sm text-slate-600">Total a cobrar al cliente: <b>{importe(pedidoParaFinalizar.total)}</b></p></div><label className="block text-sm font-bold text-slate-700">Efectivo que te entregó el cliente<input type="number" required min={Number(pedidoParaFinalizar.total || 0)} step="1" autoFocus value={montoEfectivo} onChange={(event) => setMontoEfectivo(event.target.value)} placeholder="Ej.: 100000" className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-3 text-lg"/></label><div className="rounded-xl bg-emerald-50 p-4 text-emerald-950"><span className="text-sm font-semibold">Vuelto para el cliente</span><strong className="mt-1 block text-2xl">{importe(Math.max(0, (Number(montoEfectivo) || 0) - Number(pedidoParaFinalizar.total || 0)))}</strong></div><p className="text-xs text-slate-500">Al confirmar, el pedido quedará entregado y el efectivo/vuelto se guardará para que el negocio lo facture desde el POS.</p><div className="flex justify-end gap-2"><button type="button" disabled={guardandoId === pedidoParaFinalizar.id} onClick={() => setPedidoParaFinalizar(null)} className="rounded-lg border px-4 py-2 text-sm font-bold">Volver</button><button type="submit" disabled={guardandoId === pedidoParaFinalizar.id || !montoEfectivo || Number(montoEfectivo) < Number(pedidoParaFinalizar.total || 0)} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">{guardandoId === pedidoParaFinalizar.id ? 'Guardando…' : 'Confirmar entrega y cobro'}</button></div></form></div>}
  </div>;
}
