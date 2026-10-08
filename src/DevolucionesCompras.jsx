import { useEffect, useMemo, useState } from 'react';
import { ArrowLeftRight, LoaderCircle, PackageSearch, Plus, RefreshCw, X } from 'lucide-react';
import { supabase } from './supabaseClient';
import { useEmpresaInfo } from './utils/useEmpresa';
import { useNotificacion } from './NotificacionContext';

const gs = (valor) => `Gs ${Number(valor || 0).toLocaleString('es-PY')}`;
const fecha = (valor) => valor ? new Date(valor).toLocaleString('es-PY') : '—';

export default function DevolucionesCompras({ perfilUsuario }) {
  const { id: empresaId } = useEmpresaInfo();
  const { notificar } = useNotificacion();
  const puedeAdministrar = (perfilUsuario?.roles?.nombre || '').toLowerCase().includes('admin')
    || !perfilUsuario?.roles?.permisos
    || perfilUsuario.roles.permisos.compras?.['Agregar compra'] === true;
  const [devoluciones, setDevoluciones] = useState([]);
  const [compras, setCompras] = useState([]);
  const [form, setForm] = useState(false);
  const [compraId, setCompraId] = useState('');
  const [lineasCompra, setLineasCompra] = useState([]);
  const [devueltasPorLinea, setDevueltasPorLinea] = useState({});
  const [cantidades, setCantidades] = useState({});
  const [motivo, setMotivo] = useState('');
  const [cargando, setCargando] = useState(true);
  const [cargandoCompra, setCargandoCompra] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');

  const cargar = async () => {
    if (!empresaId) return;
    setCargando(true); setError('');
    const [r, p] = await Promise.all([
      supabase.from('devoluciones_compras').select('*').eq('empresa_id', empresaId).order('fecha', { ascending: false }).limit(500),
      supabase.from('compras').select('id,proveedor_nombre,nro_factura,total,fecha,estado_compra,ubicacion_id,ubicacion').eq('empresa_id', empresaId).order('fecha', { ascending: false }).limit(500),
    ]);
    if (r.error) setError(r.error.message); else setDevoluciones(r.data || []);
    if (!p.error) setCompras(p.data || []);
    setCargando(false);
  };

  useEffect(() => { cargar(); }, [empresaId]);

  const compraElegida = compras.find((compra) => String(compra.id) === String(compraId));
  const comprasRecibidas = compras.filter((compra) =>
    String(compra.estado_compra || 'Recibido').trim().toLowerCase() === 'recibido'
  );
  const disponibles = useMemo(() => lineasCompra.map((linea) => ({
    ...linea,
    pendiente: Math.max(0, Number(linea.cantidad || 0) - Number(devueltasPorLinea[linea.id] || 0)),
    cantidadDevolver: Number(cantidades[linea.id] || 0),
  })), [lineasCompra, devueltasPorLinea, cantidades]);
  const totalDevolucion = disponibles.reduce((total, linea) => total + linea.cantidadDevolver * Number(linea.costo_unitario || 0), 0);
  const hayCantidadDevolver = disponibles.some((linea) => linea.cantidadDevolver > 0);

  const seleccionarCompra = async (id) => {
    setCompraId(id); setLineasCompra([]); setCantidades({}); setDevueltasPorLinea({}); setError('');
    if (!id) return;
    setCargandoCompra(true);
    const [detalles, devs] = await Promise.all([
      supabase.from('detalle_compras').select('id,producto_id,nombre_producto,codigo_sku,cantidad,costo_unitario').eq('empresa_id', empresaId).eq('compra_id', id).order('id'),
      supabase.from('devoluciones_compras').select('id').eq('empresa_id', empresaId).eq('compra_id', id),
    ]);
    if (detalles.error) setError(detalles.error.message);
    else {
      setLineasCompra(detalles.data || []);
      const ids = (devs.data || []).map((devolucion) => devolucion.id);
      if (ids.length) {
        const { data, error: errorDetalle } = await supabase.from('detalle_devoluciones_compras').select('compra_detalle_id,cantidad').eq('empresa_id', empresaId).in('devolucion_id', ids);
        if (errorDetalle) setError(errorDetalle.message);
        else setDevueltasPorLinea((data || []).reduce((acc, linea) => ({ ...acc, [linea.compra_detalle_id]: (acc[linea.compra_detalle_id] || 0) + Number(linea.cantidad || 0) }), {}));
      }
    }
    setCargandoCompra(false);
  };

  const enviar = async (event) => {
    event.preventDefault();
    const items = disponibles.filter((linea) => linea.cantidadDevolver > 0).map((linea) => ({ compra_detalle_id: linea.id, cantidad: linea.cantidadDevolver }));
    if (!compraId || !items.length || !motivo.trim()) { setError('Seleccioná compra, cantidades y el motivo de la devolución.'); return; }
    if (items.some((item) => item.cantidad > disponibles.find((linea) => linea.id === item.compra_detalle_id).pendiente)) { setError('Alguna cantidad supera lo pendiente de devolver.'); return; }
    setGuardando(true); setError('');
    const { data, error: errorGuardar } = await supabase.rpc('registrar_devolucion_compra', { p_compra_id: Number(compraId), p_items: items, p_motivo: motivo.trim() });
    setGuardando(false);
    if (errorGuardar) { setError(errorGuardar.message); return; }
    notificar.exito(`Devolución de compra registrada. Referencia interna #${data}. El importe queda como crédito con el proveedor.`);
    setForm(false); setCompraId(''); setLineasCompra([]); setCantidades({}); setMotivo(''); await cargar();
    window.dispatchEvent(new Event('stock-actualizado'));
  };

  const cancelar = () => { setForm(false); setCompraId(''); setLineasCompra([]); setCantidades({}); setMotivo(''); setError(''); };

  return <main className="mx-auto max-w-7xl space-y-5 text-slate-800">
    <header className="flex flex-wrap items-end justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-widest text-orange-600">Compras</p><h1 className="mt-1 text-2xl font-black">Devoluciones de compra</h1><p className="mt-1 text-sm text-slate-500">Devolvé artículos de una compra registrada, con control de cantidades y crédito a favor.</p></div><div className="flex gap-2"><button onClick={cargar} aria-label="Actualizar" className="rounded-lg border bg-white p-2.5"><RefreshCw size={17}/></button>{puedeAdministrar && <button onClick={() => { setError(''); setForm(true); }} className="inline-flex items-center gap-2 rounded-lg bg-orange-500 px-4 py-2.5 text-sm font-bold text-white"><Plus size={17}/>Nueva devolución</button>}</div></header>
    {!puedeAdministrar && <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">Tu rol puede consultar devoluciones, pero no registrarlas.</div>}
    {error && !form && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</div>}
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm"><div className="flex items-center gap-2 border-b p-4"><ArrowLeftRight size={18} className="text-orange-500"/><h2 className="font-bold">Historial de devoluciones</h2><span className="ml-auto text-xs text-slate-500">{devoluciones.length} documento(s)</span></div>{cargando ? <div className="p-10 text-center text-slate-500">Cargando devoluciones…</div> : devoluciones.length === 0 ? <div className="p-10 text-center text-sm text-slate-500">Todavía no hay devoluciones registradas.</div> : <div className="overflow-x-auto"><table className="w-full min-w-[780px] text-left text-sm"><thead className="bg-slate-50 text-[10px] uppercase text-slate-500"><tr><th className="px-4 py-3">Fecha / referencia</th><th className="px-4 py-3">Compra original</th><th className="px-4 py-3">Proveedor</th><th className="px-4 py-3">Motivo</th><th className="px-4 py-3 text-right">Total</th><th className="px-4 py-3 text-right">Crédito proveedor</th></tr></thead><tbody className="divide-y divide-slate-100">{devoluciones.map((devolucion) => <tr key={devolucion.id}><td className="px-4 py-3"><div>{fecha(devolucion.fecha)}</div><div className="font-mono text-xs text-slate-500">{devolucion.referencia}</div></td><td className="px-4 py-3">#{devolucion.compra_id}</td><td className="px-4 py-3">{devolucion.proveedor_nombre}</td><td className="max-w-xs truncate px-4 py-3">{devolucion.motivo}</td><td className="px-4 py-3 text-right font-bold">{gs(devolucion.total)}</td><td className="px-4 py-3 text-right text-emerald-700">{gs(devolucion.credito_proveedor)}</td></tr>)}</tbody></table></div>}</section>
    {form && <div className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto bg-slate-950/50 p-3 sm:items-center"><form onSubmit={enviar} className="my-4 w-full max-w-4xl space-y-4 rounded-2xl bg-white p-5 shadow-2xl"><div className="flex justify-between"><div><h2 className="text-lg font-black">Registrar devolución</h2><p className="mt-1 text-xs text-slate-500">La operación resta stock de forma atómica y registra el crédito. No mueve dinero de caja.</p></div><button type="button" onClick={cancelar} aria-label="Cerrar"><X size={19}/></button></div>{error && <div role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</div>}
      <label className="block text-xs font-bold">Compra original recibida<select required value={compraId} onChange={(e) => seleccionarCompra(e.target.value)} className="mt-1 block w-full rounded-lg border bg-white p-2.5 text-sm font-normal"><option value="">Seleccioná una compra recibida</option>{comprasRecibidas.map((compra) => <option key={compra.id} value={compra.id}>#{compra.id} · {compra.proveedor_nombre || 'Proveedor'} · {compra.nro_factura || 'Sin factura'} · {fecha(compra.fecha)} · {gs(compra.total)}</option>)}</select></label>
      {compraElegida && <div className="grid gap-2 rounded-lg bg-slate-50 p-3 text-xs sm:grid-cols-3"><p><b>Proveedor:</b> {compraElegida.proveedor_nombre || '—'}</p><p><b>Factura:</b> {compraElegida.nro_factura || '—'}</p><p><b>Sucursal:</b> {compraElegida.ubicacion || '—'}</p></div>}
      {cargandoCompra ? <div className="p-7 text-center text-slate-500">Cargando artículos…</div> : lineasCompra.length > 0 && <div className="overflow-x-auto rounded-lg border"><table className="w-full min-w-[670px] text-left text-sm"><thead className="bg-slate-50 text-xs"><tr><th className="px-3 py-2.5">Artículo de compra</th><th className="px-3 py-2.5 text-right">Comprado</th><th className="px-3 py-2.5 text-right">Pendiente</th><th className="px-3 py-2.5 text-right">Costo unitario</th><th className="px-3 py-2.5">Devolver</th></tr></thead><tbody className="divide-y">{disponibles.map((linea) => <tr key={linea.id}><td className="px-3 py-2.5"><div className="font-medium">{linea.nombre_producto}</div><div className="text-xs text-slate-400">{linea.codigo_sku || ''}</div></td><td className="px-3 py-2.5 text-right">{linea.cantidad}</td><td className="px-3 py-2.5 text-right">{linea.pendiente}</td><td className="px-3 py-2.5 text-right">{gs(linea.costo_unitario)}</td><td className="px-3 py-2.5"><input type="number" min="0" max={linea.pendiente} step="1" disabled={!linea.pendiente} value={cantidades[linea.id] || ''} onChange={(e) => setCantidades((items) => ({ ...items, [linea.id]: e.target.value }))} className="w-28 rounded border p-2"/></td></tr>)}</tbody></table></div>}
      {compraElegida && lineasCompra.length === 0 && !cargandoCompra && <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"><PackageSearch size={16} className="mr-2 inline"/>La compra no tiene artículos disponibles.</div>}
      <label className="block text-xs font-bold">Motivo<textarea required minLength={3} maxLength={500} value={motivo} onChange={(e) => setMotivo(e.target.value)} rows={2} className="mt-1 block w-full rounded-lg border p-2.5 text-sm font-normal"/></label>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-3"><p className="text-sm">Crédito a favor estimado: <b className="text-emerald-700">{gs(totalDevolucion)}</b></p><div className="flex gap-2"><button type="button" onClick={cancelar} className="rounded-lg border px-4 py-2 text-sm">Cancelar</button><button disabled={guardando || !compraId || !hayCantidadDevolver} className="inline-flex items-center gap-2 rounded-lg bg-orange-500 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">{guardando ? <LoaderCircle size={16} className="animate-spin"/> : <ArrowLeftRight size={16}/>}Confirmar devolución</button></div></div>
    </form></div>}
  </main>;
}
