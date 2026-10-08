import { useEffect, useMemo, useState } from 'react';
import { ArrowLeftRight, CheckCircle2, LoaderCircle, Plus, RefreshCw, WalletCards, X } from 'lucide-react';
import { supabase } from './supabaseClient';
import { useEmpresaInfo } from './utils/useEmpresa';
import { useNotificacion } from './NotificacionContext';

const gs = (value) => `Gs ${Number(value || 0).toLocaleString('es-PY')}`;
const fecha = (value) => value ? new Date(value).toLocaleString('es-PY') : '—';
const normalizar = (value) => String(value || '').trim().toLowerCase();

export default function DevolucionesVentas({ perfilUsuario }) {
  const { id: empresaId } = useEmpresaInfo();
  const { notificar } = useNotificacion();
  const permisos = perfilUsuario?.roles?.permisos;
  const puedeDevolver = (perfilUsuario?.roles?.nombre || '').toLowerCase().includes('admin')
    || !permisos || permisos.ventas_pos?.['Devolver venta'] === true;
  const [devoluciones, setDevoluciones] = useState([]);
  const [ventas, setVentas] = useState([]);
  const [pagosPorDevolucion, setPagosPorDevolucion] = useState({});
  const [cuentas, setCuentas] = useState([]);
  const [ventaId, setVentaId] = useState('');
  const [detalles, setDetalles] = useState([]);
  const [devueltasPorLinea, setDevueltasPorLinea] = useState({});
  const [cantidades, setCantidades] = useState({});
  const [totalDevueltoPrevio, setTotalDevueltoPrevio] = useState(0);
  const [motivo, setMotivo] = useState('');
  const [form, setForm] = useState(false);
  const [devolucionPagar, setDevolucionPagar] = useState(null);
  const [cuentaId, setCuentaId] = useState('');
  const [montoPago, setMontoPago] = useState('');
  const [metodoPago, setMetodoPago] = useState('Efectivo');
  const [notaPago, setNotaPago] = useState('');
  const [cargando, setCargando] = useState(true);
  const [cargandoDetalle, setCargandoDetalle] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');

  const cargar = async () => {
    if (!empresaId) return;
    setCargando(true); setError('');
    const [historial, ventasResult] = await Promise.all([
      supabase.from('devoluciones_ventas').select('*').eq('empresa_id', empresaId).order('fecha', { ascending: false }).limit(500),
      supabase.from('ventas').select('id,cliente,cliente_nombre,total,monto_pagado,saldo_pendiente,descuento,estado_pago,estado,fecha,numero_factura,ubicacion_id').eq('empresa_id', empresaId).order('fecha', { ascending: false }).limit(500),
    ]);
    if (historial.error) setError(historial.error.message); else setDevoluciones(historial.data || []);
    if (ventasResult.error) setError(ventasResult.error.message); else setVentas(ventasResult.data || []);
    const [pagos, cuentasResult] = await Promise.all([
      supabase.from('pagos_devoluciones_ventas').select('*').eq('empresa_id', empresaId).order('pagado_en', { ascending: false }).limit(1000),
      supabase.from('cuentas_caja').select('id,nombre,saldo,moneda').eq('empresa_id', empresaId).eq('activo', true).order('nombre'),
    ]);
    if (pagos.error) setError(pagos.error.message);
    else setPagosPorDevolucion((pagos.data || []).reduce((mapa, pago) => ({
      ...mapa, [pago.devolucion_id]: [...(mapa[pago.devolucion_id] || []), pago],
    }), {}));
    if (cuentasResult.error) setError(cuentasResult.error.message); else setCuentas(cuentasResult.data || []);
    setCargando(false);
  };

  useEffect(() => { cargar(); }, [empresaId]);

  const ventasElegibles = useMemo(() => ventas.filter((venta) =>
    !['anulada', 'devuelta', 'cotizacion', 'cotización'].includes(normalizar(venta.estado_pago))
    && !['pendiente', 'cotizacion', 'cotización'].includes(normalizar(venta.estado))
  ), [ventas]);
  const venta = ventas.find((item) => String(item.id) === String(ventaId));
  const lineasCalculadas = useMemo(() => {
    const brutoTotal = detalles.reduce((suma, item) => suma + Number(item.subtotal ?? Number(item.cantidad || 0) * Number(item.precio_unitario || 0)), 0);
    const factor = brutoTotal > 0 ? Math.max(0, 1 - Math.min(Number(venta?.descuento || 0), brutoTotal) / brutoTotal) : 1;
    return detalles.map((item) => {
      const pendiente = Math.max(0, Number(item.cantidad || 0) - Number(devueltasPorLinea[item.id] || 0));
      const cantidadDevolver = Number(cantidades[item.id] || 0);
      const bruto = Number(item.subtotal ?? Number(item.cantidad || 0) * Number(item.precio_unitario || 0))
        * cantidadDevolver / Math.max(1, Number(item.cantidad || 0));
      return { ...item, pendiente, cantidadDevolver, subtotalDevolver: Math.round(bruto * factor * 100) / 100 };
    });
  }, [detalles, devueltasPorLinea, cantidades, venta]);
  const itemsDevolver = lineasCalculadas.filter((item) => item.cantidadDevolver > 0);
  const devolucionCompleta = lineasCalculadas.length > 0 && lineasCalculadas.every((item) => item.cantidadDevolver >= item.pendiente);
  const totalDevolucion = devolucionCompleta
    ? Math.max(0, Number(venta?.total || 0) - totalDevueltoPrevio)
    : itemsDevolver.reduce((total, item) => total + item.subtotalDevolver, 0);
  const saldoCanceladoEstimado = Math.min(Number(venta?.saldo_pendiente || 0), totalDevolucion);
  const reembolsoPendienteEstimado = Math.max(0, totalDevolucion - saldoCanceladoEstimado);
  const cerrar = () => { setForm(false); setVentaId(''); setDetalles([]); setDevueltasPorLinea({}); setCantidades({}); setTotalDevueltoPrevio(0); setMotivo(''); setError(''); };
  const abrirReembolso = (devolucion) => {
    setDevolucionPagar(devolucion); setCuentaId(''); setMontoPago(''); setMetodoPago('Efectivo'); setNotaPago(''); setError('');
  };
  const cerrarReembolso = () => { setDevolucionPagar(null); setCuentaId(''); setMontoPago(''); setMetodoPago('Efectivo'); setNotaPago(''); setError(''); };

  const seleccionarVenta = async (id) => {
    setVentaId(id); setDetalles([]); setDevueltasPorLinea({}); setCantidades({}); setTotalDevueltoPrevio(0); setError('');
    if (!id) return;
    setCargandoDetalle(true);
    const [resultadoDetalles, resultadoDevoluciones] = await Promise.all([
      supabase.from('detalle_ventas').select('id,nombre_producto,cantidad,precio_unitario,subtotal').eq('empresa_id', empresaId).eq('venta_id', id).order('id'),
      supabase.from('devoluciones_ventas').select('id,total').eq('empresa_id', empresaId).eq('venta_id', id),
    ]);
    if (resultadoDetalles.error) setError(resultadoDetalles.error.message);
    else setDetalles(resultadoDetalles.data || []);
    if (resultadoDevoluciones.error) setError(resultadoDevoluciones.error.message);
    else {
      const docs = resultadoDevoluciones.data || [];
      setTotalDevueltoPrevio(docs.reduce((suma, doc) => suma + Number(doc.total || 0), 0));
      const docIds = docs.map((doc) => doc.id);
      if (docIds.length) {
        const { data, error: lineasError } = await supabase.from('detalle_devoluciones_ventas')
          .select('venta_detalle_id,cantidad').eq('empresa_id', empresaId).in('devolucion_id', docIds);
        if (lineasError) setError(lineasError.message);
        else setDevueltasPorLinea((data || []).reduce((mapa, linea) => ({
          ...mapa, [linea.venta_detalle_id]: (mapa[linea.venta_detalle_id] || 0) + Number(linea.cantidad || 0),
        }), {}));
      }
    }
    setCargandoDetalle(false);
  };

  const registrar = async (event) => {
    event.preventDefault();
    if (!ventaId || !itemsDevolver.length || !motivo.trim()) return setError('Seleccioná la venta, las cantidades y explicá el motivo.');
    setGuardando(true); setError('');
    const { data, error: rpcError } = await supabase.rpc('registrar_devolucion_venta', {
      p_venta_id: Number(ventaId),
      p_items: itemsDevolver.map((item) => ({ venta_detalle_id: item.id, cantidad: item.cantidadDevolver })),
      p_motivo: motivo.trim(),
    });
    setGuardando(false);
    if (rpcError) return setError(rpcError.message);
    notificar.exito(`Devolución ${devolucionCompleta ? 'total' : 'parcial'} registrada (#${data}). El importe cobrado queda pendiente de reembolso al cliente.`);
    cerrar(); await cargar(); window.dispatchEvent(new Event('stock-actualizado'));
  };

  const registrarReembolso = async (event) => {
    event.preventDefault();
    if (!devolucionPagar || !cuentaId || !Number(montoPago) || !metodoPago) return setError('Seleccioná una cuenta, el importe y el método de pago.');
    setGuardando(true); setError('');
    const { error: rpcError } = await supabase.rpc('registrar_pago_reembolso_venta', {
      // Supabase returns bigint IDs as strings; preserve the exact value for the RPC.
      p_devolucion_id: String(devolucionPagar.id), p_cuenta_id: cuentaId,
      p_monto: Number(montoPago), p_metodo_pago: metodoPago, p_nota: notaPago.trim() || null,
    });
    setGuardando(false);
    if (rpcError) return setError(rpcError.message);
    notificar.exito('Reembolso registrado y descontado de la cuenta seleccionada.');
    cerrarReembolso(); await cargar();
  };

  return <main className="mx-auto max-w-7xl space-y-5 text-slate-800">
    <header className="flex flex-wrap items-end justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-widest text-orange-600">Ventas</p><h1 className="mt-1 text-2xl font-black">Devoluciones de venta</h1><p className="mt-1 text-sm text-slate-500">Registrá devoluciones parciales o totales y consultá su trazabilidad.</p></div><div className="flex gap-2"><button onClick={cargar} aria-label="Actualizar" className="rounded-lg border bg-white p-2.5"><RefreshCw size={17}/></button>{puedeDevolver && <button onClick={() => { setForm(true); setError(''); }} className="inline-flex items-center gap-2 rounded-lg bg-orange-500 px-4 py-2.5 text-sm font-bold text-white"><Plus size={17}/>Nueva devolución</button>}</div></header>
    <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">La devolución repone existencias y reduce la deuda en una sola transacción. Si queda un importe a favor del cliente, podés reembolsarlo desde una cuenta activa; cada pago queda en el historial y descuenta el saldo de esa cuenta.</div>
    {!puedeDevolver && <div className="rounded-lg border border-slate-200 bg-white p-3 text-sm">Tu rol puede consultar el historial, pero no registrar devoluciones.</div>}
    {error && !form && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</div>}
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm"><div className="flex items-center gap-2 border-b p-4"><ArrowLeftRight size={18} className="text-orange-500"/><h2 className="font-bold">Historial de devoluciones</h2><span className="ml-auto text-xs text-slate-500">{devoluciones.length} documento(s)</span></div>{cargando ? <div className="p-10 text-center text-slate-500">Cargando devoluciones…</div> : devoluciones.length === 0 ? <div className="p-10 text-center text-sm text-slate-500">Todavía no hay devoluciones registradas.</div> : <div className="overflow-x-auto"><table className="w-full min-w-[1120px] text-left text-sm"><thead className="bg-slate-50 text-[10px] uppercase text-slate-500"><tr><th className="px-4 py-3">Fecha / referencia</th><th className="px-4 py-3">Venta original</th><th className="px-4 py-3">Cliente</th><th className="px-4 py-3">Motivo</th><th className="px-4 py-3 text-right">Total devuelto</th><th className="px-4 py-3 text-right">Saldo cancelado</th><th className="px-4 py-3 text-right">Reembolsado</th><th className="px-4 py-3">Estado</th><th className="px-4 py-3">Pagos</th><th className="px-4 py-3">Acción</th></tr></thead><tbody className="divide-y divide-slate-100">{devoluciones.map((item) => { const pendiente = Math.max(0, Number(item.credito_cliente || 0) - Number(item.monto_reembolsado || 0)); const pagos = pagosPorDevolucion[item.id] || []; return <tr key={item.id}><td className="px-4 py-3"><div>{fecha(item.fecha)}</div><div className="font-mono text-xs text-slate-500">{item.referencia}</div></td><td className="px-4 py-3">#{item.venta_id}</td><td className="px-4 py-3">{item.cliente || '—'}</td><td className="max-w-xs truncate px-4 py-3">{item.motivo}</td><td className="px-4 py-3 text-right font-bold">{gs(item.total)}</td><td className="px-4 py-3 text-right">{gs(item.saldo_reversado)}</td><td className="px-4 py-3 text-right">{gs(item.monto_reembolsado)}</td><td className="px-4 py-3">{pendiente === 0 ? <span className="font-semibold text-emerald-700">Pagado</span> : Number(item.monto_reembolsado || 0) > 0 ? <span className="font-semibold text-amber-700">Parcial</span> : <span className="font-semibold text-amber-700">Pendiente</span>}</td><td className="px-4 py-3 text-xs">{pagos.length ? pagos.map((pago) => <div key={pago.id}>{gs(pago.monto)} · {pago.metodo_pago}</div>) : '—'}</td><td className="px-4 py-3">{puedeDevolver && pendiente > 0 ? <button onClick={() => abrirReembolso(item)} className="inline-flex items-center gap-1 rounded-lg border border-emerald-200 px-2.5 py-1.5 text-xs font-bold text-emerald-800 hover:bg-emerald-50"><WalletCards size={14}/>Reembolsar</button> : pendiente === 0 && Number(item.credito_cliente || 0) > 0 ? <span className="inline-flex items-center gap-1 text-xs text-emerald-700"><CheckCircle2 size={14}/>Completado</span> : '—'}</td></tr>; })}</tbody></table></div>}</section>
    {form && <div className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto bg-slate-950/50 p-3 sm:items-center"><form onSubmit={registrar} className="my-4 w-full max-w-4xl space-y-4 rounded-2xl bg-white p-5 shadow-2xl"><div className="flex justify-between"><div><h2 className="text-lg font-black">Registrar devolución</h2><p className="mt-1 text-xs text-slate-500">Elegí cantidades; el servidor limita cada artículo a lo vendido que aún no se devolvió.</p></div><button type="button" onClick={cerrar} aria-label="Cerrar"><X size={19}/></button></div>{error && <div role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</div>}
      <label className="block text-xs font-bold">Venta original<select required value={ventaId} onChange={(e) => seleccionarVenta(e.target.value)} className="mt-1 block w-full rounded-lg border bg-white p-2.5 text-sm font-normal"><option value="">Seleccioná una venta</option>{ventasElegibles.map((item) => <option key={item.id} value={item.id}>#{item.id} · {item.cliente || item.cliente_nombre || 'Cliente'} · {item.numero_factura ? `Factura ${item.numero_factura}` : 'Sin factura'} · {fecha(item.fecha)} · {gs(item.total)}</option>)}</select></label>
      {venta && <div className="grid gap-2 rounded-lg bg-slate-50 p-3 text-xs sm:grid-cols-3"><p><b>Cliente:</b> {venta.cliente || venta.cliente_nombre || '—'}</p><p><b>Estado:</b> {venta.estado_pago || '—'}</p><p><b>Total de venta:</b> {gs(venta.total)}</p><p><b>Saldo pendiente:</b> {gs(venta.saldo_pendiente)}</p><p><b>Saldo a cancelar:</b> {gs(saldoCanceladoEstimado)}</p><p><b>Pendiente de reembolso:</b> {gs(reembolsoPendienteEstimado)}</p></div>}
      {cargandoDetalle ? <div className="p-6 text-center text-slate-500">Cargando artículos…</div> : lineasCalculadas.length > 0 && <div className="overflow-x-auto rounded-lg border"><table className="w-full min-w-[670px] text-left text-sm"><thead className="bg-slate-50 text-xs"><tr><th className="px-3 py-2">Artículo</th><th className="px-3 py-2 text-right">Vendido</th><th className="px-3 py-2 text-right">Pendiente</th><th className="px-3 py-2 text-right">Precio</th><th className="px-3 py-2">Devolver</th></tr></thead><tbody className="divide-y">{lineasCalculadas.map((item) => <tr key={item.id}><td className="px-3 py-2">{item.nombre_producto || 'Artículo'}</td><td className="px-3 py-2 text-right">{item.cantidad}</td><td className="px-3 py-2 text-right">{item.pendiente}</td><td className="px-3 py-2 text-right">{gs(item.precio_unitario)}</td><td className="px-3 py-2"><input aria-label={`Cantidad a devolver de ${item.nombre_producto}`} type="number" min="0" max={item.pendiente} step="1" disabled={!item.pendiente} value={cantidades[item.id] || ''} onChange={(e) => setCantidades((actual) => ({ ...actual, [item.id]: e.target.value }))} className="w-28 rounded border p-2"/></td></tr>)}</tbody></table></div>}
      <label className="block text-xs font-bold">Motivo<textarea required minLength={3} maxLength={500} value={motivo} onChange={(e) => setMotivo(e.target.value)} rows={2} className="mt-1 block w-full rounded-lg border p-2.5 text-sm font-normal"/></label>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-3"><div className="space-y-1 text-sm"><p>Importe de esta devolución: <b>{gs(totalDevolucion)}</b></p><p className="text-xs text-slate-500">Saldo cancelado: {gs(saldoCanceladoEstimado)} · Reembolso pendiente: {gs(reembolsoPendienteEstimado)}{devolucionCompleta ? ' · Devolución total' : ''}</p></div><div className="flex gap-2"><button type="button" onClick={cerrar} className="rounded-lg border px-4 py-2 text-sm">Cancelar</button><button disabled={guardando || !ventaId || !itemsDevolver.length} className="inline-flex items-center gap-2 rounded-lg bg-orange-500 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">{guardando ? <LoaderCircle size={16} className="animate-spin"/> : <ArrowLeftRight size={16}/>}Confirmar devolución</button></div></div>
    </form></div>}
    {devolucionPagar && <div className="fixed inset-0 z-[110] flex items-start justify-center overflow-y-auto bg-slate-950/50 p-3 sm:items-center"><form onSubmit={registrarReembolso} className="my-4 w-full max-w-lg space-y-4 rounded-2xl bg-white p-5 shadow-2xl"><div className="flex justify-between"><div><h2 className="text-lg font-black">Registrar reembolso</h2><p className="mt-1 text-xs text-slate-500">Devolución {devolucionPagar.referencia} · {devolucionPagar.cliente || 'Cliente'}</p></div><button type="button" onClick={cerrarReembolso} aria-label="Cerrar"><X size={19}/></button></div>{error && <div role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</div>}<div className="rounded-lg bg-amber-50 p-3 text-sm">Pendiente de reembolso: <b>{gs(Number(devolucionPagar.credito_cliente || 0) - Number(devolucionPagar.monto_reembolsado || 0))}</b></div>
      <label className="block text-xs font-bold">Cuenta de salida<select required value={cuentaId} onChange={(e) => setCuentaId(e.target.value)} className="mt-1 block w-full rounded-lg border bg-white p-2.5 text-sm font-normal"><option value="">Seleccioná una cuenta activa</option>{cuentas.map((cuenta) => <option key={cuenta.id} value={cuenta.id}>{cuenta.nombre} · Saldo {gs(cuenta.saldo)}</option>)}</select></label>
      <div className="grid gap-3 sm:grid-cols-2"><label className="block text-xs font-bold">Importe<input required type="number" min="0.01" max={Number(devolucionPagar.credito_cliente || 0) - Number(devolucionPagar.monto_reembolsado || 0)} step="0.01" value={montoPago} onChange={(e) => setMontoPago(e.target.value)} className="mt-1 block w-full rounded-lg border p-2.5 text-sm font-normal"/></label><label className="block text-xs font-bold">Método<select value={metodoPago} onChange={(e) => setMetodoPago(e.target.value)} className="mt-1 block w-full rounded-lg border bg-white p-2.5 text-sm font-normal"><option>Efectivo</option><option>Transferencia</option><option>Tarjeta</option><option>Cheque</option><option>Otro</option></select></label></div>
      <label className="block text-xs font-bold">Nota (opcional)<input maxLength="300" value={notaPago} onChange={(e) => setNotaPago(e.target.value)} className="mt-1 block w-full rounded-lg border p-2.5 text-sm font-normal"/></label><p className="text-xs text-slate-500">Al confirmar, se registra el pago y se descuenta el importe de la cuenta. El servidor vuelve a comprobar el saldo disponible.</p>
      <div className="flex justify-end gap-2 border-t pt-3"><button type="button" onClick={cerrarReembolso} className="rounded-lg border px-4 py-2 text-sm">Cancelar</button><button disabled={guardando || !cuentaId || !Number(montoPago) || cuentas.length === 0} className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">{guardando ? <LoaderCircle size={16} className="animate-spin"/> : <WalletCards size={16}/>}Confirmar reembolso</button></div>
    </form></div>}
  </main>;
}
