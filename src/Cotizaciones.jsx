import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from './supabaseClient';
import { useEmpresaInfo } from './utils/useEmpresa';

const fechaISO = (fecha) => `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}-${String(fecha.getDate()).padStart(2, '0')}`;
const hoy = () => fechaISO(new Date());
const fechaLimite = () => { const fecha = new Date(); fecha.setDate(fecha.getDate() + 14); return fechaISO(fecha); };
const moneda = (valor) => `Gs ${Number(valor || 0).toLocaleString('es-PY')}`;

export default function Cotizaciones() {
  const navigate = useNavigate();
  const { id: empresaId } = useEmpresaInfo();
  const [cotizaciones, setCotizaciones] = useState([]);
  const [productos, setProductos] = useState([]);
  const [clientes, setClientes] = useState([]);
  const [busqueda, setBusqueda] = useState('');
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [modal, setModal] = useState(false);
  const [cliente, setCliente] = useState('Cliente Ocasional');
  const [fechaVencimiento, setFechaVencimiento] = useState(fechaLimite());
  const [notas, setNotas] = useState('');
  const [descuento, setDescuento] = useState('');
  const [busquedaProducto, setBusquedaProducto] = useState('');
  const [items, setItems] = useState([]);
  const [guardando, setGuardando] = useState(false);

  const cargar = async () => {
    if (!empresaId) return;
    setCargando(true);
    const [resCotizaciones, resProductos, resClientes] = await Promise.all([
      supabase.from('cotizaciones_ventas').select('*').eq('empresa_id', empresaId).order('creado_en', { ascending: false }).limit(500),
      supabase.from('productos').select('id,nombre,codigo,unidad,precio_venta,grupos_precio,activo,tipo_producto').eq('empresa_id', empresaId).order('nombre').limit(5000),
      supabase.from('clientes').select('id,nombre,nombre_empresa,documento_nro').eq('empresa_id', empresaId).order('nombre').limit(3000),
    ]);
    if (resCotizaciones.error) {
      setError(resCotizaciones.error.code === '42P01' || resCotizaciones.error.code === 'PGRST205'
        ? 'Falta aplicar database/migration_cotizaciones.sql en el Supabase conectado.'
        : `No se pudieron cargar las cotizaciones: ${resCotizaciones.error.message}`);
    } else {
      setError('');
      setCotizaciones(resCotizaciones.data || []);
    }
    if (!resProductos.error) setProductos((resProductos.data || []).filter((p) => p.tipo_producto !== 'Variable' && p.activo !== false));
    if (!resClientes.error) setClientes(resClientes.data || []);
    setCargando(false);
  };

  useEffect(() => { cargar(); }, [empresaId]);

  const subtotal = items.reduce((total, item) => total + (Number(item.cantidad) || 0) * (Number(item.precio_unitario) || 0), 0);
  const descuentoAplicado = Math.min(Math.max(0, Number(descuento) || 0), subtotal);
  const total = Math.max(0, subtotal - descuentoAplicado);
  const productosSugeridos = useMemo(() => {
    const texto = busquedaProducto.trim().toLowerCase();
    if (!texto) return [];
    return productos.filter((p) => String(p.nombre || '').toLowerCase().includes(texto) || String(p.codigo || '').toLowerCase().includes(texto)).slice(0, 8);
  }, [busquedaProducto, productos]);
  const cotizacionesFiltradas = cotizaciones.filter((q) => `${q.referencia} ${q.cliente} ${q.estado}`.toLowerCase().includes(busqueda.trim().toLowerCase()));

  const nueva = () => {
    setCliente('Cliente Ocasional'); setFechaVencimiento(fechaLimite()); setNotas(''); setDescuento(''); setItems([]); setBusquedaProducto(''); setModal(true); setError('');
  };

  const agregarProducto = (producto) => {
    setItems((prev) => {
      const existente = prev.find((item) => String(item.producto_id) === String(producto.id));
      if (existente) return prev.map((item) => String(item.producto_id) === String(producto.id) ? { ...item, cantidad: Number(item.cantidad) + 1 } : item);
      return [...prev, { producto_id: producto.id, nombre_producto: producto.nombre, codigo: producto.codigo || '', unidad: producto.unidad || '', cantidad: 1, precio_unitario: Number(producto.precio_venta) || 0 }];
    });
    setBusquedaProducto('');
  };

  const guardar = async (e) => {
    e.preventDefault();
    if (!items.length) return setError('Agrega al menos un producto a la cotización.');
    if (total <= 0) return setError('El total de la cotización debe ser mayor que cero.');
    setGuardando(true); setError('');
    const referencia = `COT-${new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14)}-${Math.floor(Math.random() * 90 + 10)}`;
    const { error: errorGuardar } = await supabase.from('cotizaciones_ventas').insert([{
      empresa_id: empresaId,
      referencia,
      cliente: cliente.trim() || 'Cliente Ocasional',
      fecha: hoy(),
      fecha_vencimiento: fechaVencimiento || null,
      estado: 'Pendiente',
      items: items.map((item) => ({ ...item, cantidad: Number(item.cantidad), precio_unitario: Number(item.precio_unitario) })),
      subtotal,
      descuento: descuentoAplicado,
      total,
      notas: notas.trim() || null,
    }]);
    if (errorGuardar) setError(`No se pudo guardar la cotización: ${errorGuardar.message}`);
    else { setModal(false); await cargar(); }
    setGuardando(false);
  };

  const cancelar = async (cotizacion) => {
    const { error: errorEstado } = await supabase.from('cotizaciones_ventas').update({ estado: 'Cancelada', actualizado_en: new Date().toISOString() })
      .eq('id', cotizacion.id).eq('empresa_id', empresaId).eq('estado', 'Pendiente');
    if (errorEstado) setError(`No se pudo cancelar: ${errorEstado.message}`);
    else await cargar();
  };

  const convertir = (cotizacion) => {
    if (cotizacion.estado !== 'Pendiente') return;
    if (cotizacion.fecha_vencimiento && cotizacion.fecha_vencimiento < hoy()) {
      setError(`La cotización ${cotizacion.referencia} venció el ${cotizacion.fecha_vencimiento}.`);
      return;
    }
    const itemsCotizacion = (cotizacion.items || []).map((item) => {
      const producto = productos.find((p) => String(p.id) === String(item.producto_id));
      if (!producto) return null;
      return { ...producto, precio_lista_base: Number(item.precio_unitario) || 0, precio_venta: Number(item.precio_unitario) || 0, precio: Number(item.precio_unitario) || 0, cotizacion_precio_fijo: true, cantidad: Number(item.cantidad) || 1 };
    }).filter(Boolean);
    if (!itemsCotizacion.length) {
      setError('No se encontraron los productos de la cotización. Actualiza el catálogo antes de convertirla.');
      return;
    }
    sessionStorage.setItem('pypos_cotizacion_pendiente', JSON.stringify({
      id: cotizacion.id,
      referencia: cotizacion.referencia,
      cliente: cotizacion.cliente,
      items: itemsCotizacion,
      descuento: Number(cotizacion.descuento) || 0,
      notas: cotizacion.notas || '',
    }));
    navigate('/pos');
  };

  return <main className="space-y-4 text-slate-800">
    <header className="flex flex-wrap items-start justify-between gap-3"><div><h1 className="text-2xl font-bold">Presupuestos y cotizaciones</h1><p className="mt-1 text-sm text-slate-500">Guarda propuestas sin mover stock ni afectar caja y conviértelas desde el POS cuando el cliente acepte.</p></div><button onClick={nueva} className="rounded-lg bg-orange-500 px-4 py-2 text-sm font-bold text-white hover:bg-orange-600">+ Nuevo presupuesto</button></header>
    {error && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</div>}
    <section className="overflow-hidden rounded-xl border bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b p-4"><div><h2 className="font-bold">Lista de cotizaciones</h2><p className="text-xs text-slate-500">{cotizaciones.length} documentos registrados</p></div><input aria-label="Buscar cotizaciones" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Buscar por número o cliente..." className="w-full rounded-lg border px-3 py-2 text-sm sm:max-w-xs" /></div>
      <div className="overflow-x-auto"><table className="w-full min-w-[820px] text-left text-sm"><thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="p-3">Referencia</th><th className="p-3">Fecha</th><th className="p-3">Vence</th><th className="p-3">Cliente</th><th className="p-3 text-right">Total</th><th className="p-3">Estado</th><th className="p-3">Acciones</th></tr></thead><tbody className="divide-y">{cargando ? <tr><td colSpan="7" className="p-10 text-center text-slate-500">Cargando cotizaciones...</td></tr> : cotizacionesFiltradas.length ? cotizacionesFiltradas.map((q) => <tr key={q.id}><td className="p-3 font-mono font-semibold">{q.referencia}</td><td className="p-3">{q.fecha || '—'}</td><td className="p-3">{q.fecha_vencimiento || '—'}</td><td className="p-3">{q.cliente}</td><td className="p-3 text-right font-bold">{moneda(q.total)}</td><td className="p-3"><span className={`rounded-full px-2 py-1 text-xs font-semibold ${q.estado === 'Pendiente' ? 'bg-amber-50 text-amber-700' : q.estado === 'Convertida' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>{q.estado}</span></td><td className="p-3"><div className="flex gap-2">{q.estado === 'Pendiente' && <><button onClick={() => convertir(q)} className="rounded border border-emerald-200 px-3 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-50">Convertir en venta</button><button onClick={() => cancelar(q)} className="rounded border px-3 py-1.5 text-xs font-semibold hover:bg-slate-50">Cancelar</button></>}</div></td></tr>) : <tr><td colSpan="7" className="p-10 text-center text-slate-500">{busqueda ? 'No se encontraron cotizaciones.' : 'Todavía no hay presupuestos.'}</td></tr>}</tbody></table></div>
    </section>

    {modal && <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/50 p-3" role="presentation"><form onSubmit={guardar} role="dialog" aria-modal="true" aria-labelledby="cotizacion-title" className="max-h-[94vh] w-full max-w-4xl space-y-4 overflow-y-auto rounded-xl bg-white p-5 shadow-2xl">
      <div className="flex items-center justify-between"><h2 id="cotizacion-title" className="text-lg font-bold">Nuevo presupuesto</h2><button type="button" onClick={() => setModal(false)} className="rounded px-3 py-2 text-slate-500 hover:bg-slate-100" aria-label="Cerrar">✕</button></div>
      {error && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</div>}
      <div className="grid gap-3 sm:grid-cols-3"><label className="text-sm font-semibold">Cliente<select value={cliente} onChange={(e) => setCliente(e.target.value)} className="mt-1 w-full rounded-lg border px-3 py-2 font-normal"><option>Cliente Ocasional</option>{clientes.map((c) => <option key={c.id} value={c.nombre_empresa || c.nombre}>{c.nombre_empresa || c.nombre}{c.documento_nro ? ` · ${c.documento_nro}` : ''}</option>)}</select></label><label className="text-sm font-semibold">Fecha<input type="date" value={hoy()} readOnly className="mt-1 w-full rounded-lg border bg-slate-50 px-3 py-2 font-normal" /></label><label className="text-sm font-semibold">Vencimiento<input type="date" min={hoy()} value={fechaVencimiento} onChange={(e) => setFechaVencimiento(e.target.value)} className="mt-1 w-full rounded-lg border px-3 py-2 font-normal" /></label></div>
      <div className="relative"><label className="text-sm font-semibold">Agregar producto<input value={busquedaProducto} onChange={(e) => setBusquedaProducto(e.target.value)} placeholder="Buscar por nombre o código..." className="mt-1 w-full rounded-lg border px-3 py-2 font-normal" /></label>{productosSugeridos.length > 0 && <div className="absolute z-10 mt-1 max-h-60 w-full overflow-y-auto rounded-lg border bg-white shadow-lg">{productosSugeridos.map((p) => <button type="button" key={p.id} onClick={() => agregarProducto(p)} className="flex w-full justify-between border-b px-3 py-2 text-left text-sm last:border-0 hover:bg-orange-50"><span>{p.nombre} <small className="text-slate-500">{p.codigo || ''}</small></span><b>{moneda(p.precio_venta)}</b></button>)}</div>}</div>
      <div className="overflow-x-auto rounded-lg border"><table className="w-full min-w-[600px] text-left text-sm"><thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="p-3">Producto</th><th className="p-3">Cantidad</th><th className="p-3">Precio unitario</th><th className="p-3 text-right">Subtotal</th><th className="p-3"></th></tr></thead><tbody className="divide-y">{items.length ? items.map((item) => <tr key={item.producto_id}><td className="p-3 font-semibold">{item.nombre_producto}<div className="text-xs text-slate-500">{item.codigo}</div></td><td className="p-3"><input type="number" min="0.001" step="0.001" value={item.cantidad} onChange={(e) => setItems((prev) => prev.map((x) => x.producto_id === item.producto_id ? { ...x, cantidad: Math.max(0.001, Number(e.target.value) || 0.001) } : x))} className="w-24 rounded border px-2 py-1" /></td><td className="p-3"><input type="number" min="0" value={item.precio_unitario} onChange={(e) => setItems((prev) => prev.map((x) => x.producto_id === item.producto_id ? { ...x, precio_unitario: Math.max(0, Number(e.target.value) || 0) } : x))} className="w-32 rounded border px-2 py-1" /></td><td className="p-3 text-right font-semibold">{moneda(item.cantidad * item.precio_unitario)}</td><td className="p-3"><button type="button" onClick={() => setItems((prev) => prev.filter((x) => x.producto_id !== item.producto_id))} className="text-red-600">Quitar</button></td></tr>) : <tr><td colSpan="5" className="p-8 text-center text-slate-500">Busca y agrega los productos de la propuesta.</td></tr>}</tbody></table></div>
      <div className="grid gap-4 sm:grid-cols-2"><label className="text-sm font-semibold">Notas<textarea rows={2} value={notas} onChange={(e) => setNotas(e.target.value)} className="mt-1 w-full rounded-lg border px-3 py-2 font-normal" /></label><div className="space-y-2 rounded-lg bg-slate-50 p-3 text-sm"><label className="flex items-center justify-between gap-3">Descuento (Gs)<input type="number" min="0" max={subtotal} value={descuento} onChange={(e) => setDescuento(e.target.value)} className="w-36 rounded border px-2 py-1 text-right" /></label><p className="flex justify-between"><span>Subtotal</span><b>{moneda(subtotal)}</b></p><p className="flex justify-between text-red-700"><span>Descuento</span><b>− {moneda(descuentoAplicado)}</b></p><p className="flex justify-between border-t pt-2 text-base"><span>Total</span><b>{moneda(total)}</b></p></div></div>
      <div className="flex justify-end gap-2"><button type="button" onClick={() => setModal(false)} className="rounded-lg border px-4 py-2 text-sm">Cerrar</button><button disabled={guardando || !items.length} className="rounded-lg bg-orange-500 px-4 py-2 text-sm font-bold text-white disabled:opacity-60">{guardando ? 'Guardando...' : 'Guardar presupuesto'}</button></div>
    </form></div>}
  </main>;
}
