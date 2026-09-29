import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ClipboardCheck, Download, LoaderCircle, Plus, RefreshCw, Search, Trash2, X } from 'lucide-react';
import { supabase } from './supabaseClient';
import { useEmpresaInfo } from './utils/useEmpresa';
import { useUbicacionUsuario } from './utils/useUbicacion';

const numero = (valor) => (Number(valor) || 0).toLocaleString('es-PY', { maximumFractionDigits: 3 });
const fechaHora = (valor) => valor ? new Date(valor).toLocaleString('es-PY', { dateStyle: 'medium', timeStyle: 'short' }) : '—';
const descargarCSV = (filas) => {
  const csv = filas.map((fila) => fila.map((celda) => `"${String(celda ?? '').replaceAll('"', '""')}"`).join(';')).join('\r\n');
  const enlace = document.createElement('a');
  enlace.href = URL.createObjectURL(new Blob(['\ufeff', csv], { type: 'text/csv;charset=utf-8' }));
  enlace.download = 'ajustes-stock.csv';
  enlace.click();
  URL.revokeObjectURL(enlace.href);
};

export default function AjustesStock() {
  const { id: empresaId } = useEmpresaInfo();
  const { id: ubicacionUsuarioId, ve_todas: usuarioVeTodas, cargando: cargandoPermisos } = useUbicacionUsuario();
  const [ubicaciones, setUbicaciones] = useState([]);
  const [productos, setProductos] = useState([]);
  const [stock, setStock] = useState([]);
  const [ajustes, setAjustes] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [actualizando, setActualizando] = useState(false);
  const [error, setError] = useState('');
  const [exito, setExito] = useState('');
  const [mostrarFormulario, setMostrarFormulario] = useState(false);
  const [ubicacionId, setUbicacionId] = useState('');
  const [busqueda, setBusqueda] = useState('');
  const [items, setItems] = useState([]);
  const [motivo, setMotivo] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [filtro, setFiltro] = useState('');

  const cargarDatos = useCallback(async (silencioso = false) => {
    if (!empresaId) return;
    if (silencioso) setActualizando(true);
    else setCargando(true);
    setError('');
    let consultaUbicaciones = supabase.from('ubicaciones_comerciales').select('id, nombre, codigo_ubicacion').eq('empresa_id', empresaId).eq('activo', true).order('nombre');
    if (!usuarioVeTodas && ubicacionUsuarioId) consultaUbicaciones = consultaUbicaciones.eq('id', ubicacionUsuarioId);
    const [respuestaSucursales, respuestaProductos, respuestaStock, respuestaAjustes] = await Promise.all([
      consultaUbicaciones,
      supabase.from('productos').select('id, nombre, codigo, stock_actual, precio_compra, activo, administra_stock').eq('empresa_id', empresaId).order('nombre').limit(3000),
      supabase.from('producto_stock_ubicacion').select('producto_id, ubicacion_id, cantidad').eq('empresa_id', empresaId).limit(20000),
      supabase.from('ajustes_stock').select('id, ubicacion_id, usuario_id, motivo, items, created_at').eq('empresa_id', empresaId).order('created_at', { ascending: false }).limit(500),
    ]);
    const problema = respuestaSucursales.error || respuestaProductos.error || respuestaStock.error || respuestaAjustes.error;
    if (problema) setError(`No se pudieron cargar los ajustes de stock: ${problema.message}`);
    setUbicaciones(respuestaSucursales.data || []);
    setProductos((respuestaProductos.data || []).filter((producto) => producto.activo !== false && producto.administra_stock !== false));
    setStock(respuestaStock.data || []);
    setAjustes(respuestaAjustes.data || []);
    if (ubicacionUsuarioId) setUbicacionId((actual) => actual || String(ubicacionUsuarioId));
    setCargando(false);
    setActualizando(false);
  }, [empresaId, usuarioVeTodas, ubicacionUsuarioId]);

  useEffect(() => { cargarDatos(); }, [cargarDatos]);

  const nombreUbicacion = useMemo(() => new Map(ubicaciones.map((ubicacion) => [String(ubicacion.id), ubicacion.nombre])), [ubicaciones]);
  const stockPorProducto = useMemo(() => {
    const resultado = new Map();
    stock.forEach((fila) => resultado.set(`${fila.producto_id}:${fila.ubicacion_id}`, Number(fila.cantidad) || 0));
    return resultado;
  }, [stock]);
  const productosElegibles = useMemo(() => {
    const termino = busqueda.trim().toLocaleLowerCase('es');
    return productos.filter((producto) => {
      const tieneSaldo = stockPorProducto.has(`${producto.id}:${ubicacionId}`);
      const agregado = items.some((item) => String(item.producto_id) === String(producto.id));
      return tieneSaldo && !agregado && (!termino || `${producto.nombre} ${producto.codigo || ''}`.toLocaleLowerCase('es').includes(termino));
    }).slice(0, 12);
  }, [productos, stockPorProducto, ubicacionId, items, busqueda]);
  const ajustesVisibles = useMemo(() => {
    const termino = filtro.trim().toLocaleLowerCase('es');
    return ajustes.filter((ajuste) => {
      if (!usuarioVeTodas && ubicacionUsuarioId && String(ajuste.ubicacion_id) !== String(ubicacionUsuarioId)) return false;
      return !termino || `${nombreUbicacion.get(String(ajuste.ubicacion_id)) || ''} ${ajuste.motivo || ''} ${(ajuste.items || []).map((item) => `${item.nombre || ''} ${item.producto_id || ''}`).join(' ')}`.toLocaleLowerCase('es').includes(termino);
    });
  }, [ajustes, filtro, nombreUbicacion, usuarioVeTodas, ubicacionUsuarioId]);

  const agregarProducto = (producto) => {
    const stockActual = stockPorProducto.get(`${producto.id}:${ubicacionId}`);
    setItems((anteriores) => [...anteriores, { producto_id: String(producto.id), nombre: producto.nombre, codigo: producto.codigo || '', stock_anterior: stockActual, stock_nuevo: String(stockActual) }]);
    setBusqueda('');
  };
  const quitarProducto = (id) => setItems((anteriores) => anteriores.filter((item) => String(item.producto_id) !== String(id)));
  const actualizarStockNuevo = (id, valor) => setItems((anteriores) => anteriores.map((item) => String(item.producto_id) === String(id) ? { ...item, stock_nuevo: valor } : item));
  const diferencia = (item) => Number(item.stock_nuevo) - Number(item.stock_anterior);

  const limpiarFormulario = () => { setItems([]); setMotivo(''); setBusqueda(''); };
  const guardarAjuste = async (event) => {
    event.preventDefault();
    setError('');
    setExito('');
    if (!empresaId) return setError('No se encontró la empresa de esta sesión.');
    if (!ubicacionId) return setError('Seleccioná una sucursal.');
    if (motivo.trim().length < 3) return setError('Explicá el motivo del ajuste (al menos 3 caracteres).');
    if (!items.length) return setError('Agregá al menos un producto.');
    const inválido = items.find((item) => item.stock_nuevo === '' || !Number.isSafeInteger(Number(item.stock_nuevo)) || Number(item.stock_nuevo) < 0);
    if (inválido) return setError(`La cantidad contada de ${inválido.nombre} debe ser un entero igual o mayor que cero.`);
    const modificados = items.filter((item) => diferencia(item) !== 0);
    if (!modificados.length) return setError('Las cantidades contadas no presentan diferencias para ajustar.');

    setGuardando(true);
    const { error: errorRPC } = await supabase.rpc('ajustar_stock', {
      p_ubicacion_id: ubicacionId,
      p_items: modificados.map((item) => ({ producto_id: item.producto_id, stock_nuevo: Number(item.stock_nuevo) })),
      p_motivo: motivo.trim(),
    });
    setGuardando(false);
    if (errorRPC) return setError(errorRPC.message || 'No se pudo guardar el ajuste.');
    limpiarFormulario();
    setMostrarFormulario(false);
    setExito('Ajuste guardado. Se actualizaron las existencias de la sucursal y el stock global.');
    window.dispatchEvent(new Event('stock-actualizado'));
    await cargarDatos(true);
  };

  const exportar = () => descargarCSV([
    ['Fecha', 'Sucursal', 'Motivo', 'Producto', 'Stock anterior', 'Stock contado', 'Diferencia'],
    ...ajustesVisibles.flatMap((ajuste) => (ajuste.items || []).map((item) => [fechaHora(ajuste.created_at), nombreUbicacion.get(String(ajuste.ubicacion_id)) || '', ajuste.motivo, item.nombre || item.producto_id, item.stock_anterior, item.stock_nuevo, item.diferencia])),
  ]);

  if (cargandoPermisos || cargando) return <div className="flex min-h-64 items-center justify-center gap-2 text-sm text-slate-500"><LoaderCircle size={18} className="animate-spin" /> Cargando ajustes de stock…</div>;

  return (
    <div className="space-y-5 p-4 md:p-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div><p className="mb-1 text-xs font-bold uppercase tracking-[0.16em] text-orange-600">Inventario / control</p><h1 className="text-2xl font-bold tracking-tight text-slate-900">Ajustes de stock</h1><p className="mt-1 max-w-2xl text-sm text-slate-500">Registrá el conteo físico y el motivo. La diferencia actualiza el saldo de la sucursal y el stock global en una sola transacción.</p></div>
        <div className="flex flex-wrap gap-2"><button type="button" onClick={() => cargarDatos(true)} disabled={actualizando} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"><RefreshCw size={15} className={actualizando ? 'animate-spin' : ''} /> Actualizar</button><button type="button" onClick={exportar} disabled={!ajustesVisibles.length} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"><Download size={15} /> Exportar CSV</button><button type="button" onClick={() => { setError(''); setExito(''); setMostrarFormulario(true); }} disabled={!ubicaciones.length} className="inline-flex items-center gap-2 rounded-lg bg-orange-500 px-4 py-2 text-sm font-bold text-white shadow-sm hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-50"><Plus size={16} /> Nuevo ajuste</button></div>
      </div>

      {error && !mostrarFormulario && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
      {exito && <div role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{exito}</div>}

      <div className="grid gap-4 sm:grid-cols-3"><article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Ajustes registrados</p><p className="mt-2 text-2xl font-black text-slate-900">{ajustesVisibles.length.toLocaleString('es-PY')}</p></article><article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Productos revisados</p><p className="mt-2 text-2xl font-black text-slate-900">{ajustesVisibles.reduce((total, ajuste) => total + (ajuste.items || []).length, 0).toLocaleString('es-PY')}</p></article><article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Sucursales disponibles</p><p className="mt-2 text-2xl font-black text-slate-900">{ubicaciones.length.toLocaleString('es-PY')}</p></article></div>

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm"><div className="flex flex-col gap-3 border-b border-slate-100 p-4 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="font-bold text-slate-900">Historial de ajustes</h2><p className="mt-0.5 text-xs text-slate-500">Últimos {ajustesVisibles.length.toLocaleString('es-PY')} movimientos</p></div><label className="relative block w-full sm:max-w-sm"><Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" /><input value={filtro} onChange={(event) => setFiltro(event.target.value)} placeholder="Buscar sucursal, producto o motivo" className="w-full rounded-lg border border-slate-200 py-2 pl-9 pr-3 text-sm outline-none focus:border-orange-400" /></label></div>
        <div className="overflow-x-auto"><table className="w-full min-w-[920px] text-left text-sm"><thead className="bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500"><tr><th className="px-4 py-3">Fecha</th><th className="px-4 py-3">Sucursal</th><th className="px-4 py-3">Motivo</th><th className="px-4 py-3">Producto</th><th className="px-4 py-3 text-right">Anterior</th><th className="px-4 py-3 text-right">Contado</th><th className="px-4 py-3 text-right">Diferencia</th></tr></thead><tbody className="divide-y divide-slate-100">
          {ajustesVisibles.flatMap((ajuste) => (ajuste.items || []).map((item, index) => <tr key={`${ajuste.id}:${index}`} className="hover:bg-slate-50/70"><td className="whitespace-nowrap px-4 py-3 text-slate-600">{fechaHora(ajuste.created_at)}</td><td className="px-4 py-3 font-semibold text-slate-800">{nombreUbicacion.get(String(ajuste.ubicacion_id)) || 'Ubicación'}</td><td className="max-w-[220px] px-4 py-3 text-xs text-slate-600">{ajuste.motivo}</td><td className="px-4 py-3 font-medium text-slate-800">{item.nombre || `Producto ${item.producto_id}`}</td><td className="px-4 py-3 text-right">{numero(item.stock_anterior)}</td><td className="px-4 py-3 text-right">{numero(item.stock_nuevo)}</td><td className={`px-4 py-3 text-right font-bold ${Number(item.diferencia) < 0 ? 'text-red-600' : Number(item.diferencia) > 0 ? 'text-emerald-700' : 'text-slate-500'}`}>{Number(item.diferencia) > 0 ? '+' : ''}{numero(item.diferencia)}</td></tr>))}
          {!ajustesVisibles.some((ajuste) => (ajuste.items || []).length) && <tr><td colSpan="7" className="px-4 py-12 text-center"><div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-500"><ClipboardCheck size={19} /></div><p className="font-semibold text-slate-700">No hay ajustes para mostrar</p><p className="mt-1 text-xs text-slate-500">Los conteos confirmados aparecerán aquí con su motivo y diferencia.</p></td></tr>}
        </tbody></table></div>
      </section>

      {mostrarFormulario && <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/50 p-3 sm:p-6" onMouseDown={(event) => { if (event.target === event.currentTarget && !guardando) setMostrarFormulario(false); }}><form onSubmit={guardarAjuste} className="flex max-h-[94vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-start justify-between border-b border-slate-100 px-5 py-4"><div><p className="text-[10px] font-black uppercase tracking-[0.15em] text-orange-600">Conteo físico</p><h2 className="mt-1 text-xl font-black text-slate-900">Nuevo ajuste de stock</h2><p className="mt-1 text-xs text-slate-500">Se registra la cantidad contada; el sistema calcula el delta y lo aplica al stock global.</p></div><button type="button" onClick={() => { if (!guardando) { setMostrarFormulario(false); limpiarFormulario(); } }} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" aria-label="Cerrar"><X size={19} /></button></div>
        <div className="overflow-y-auto p-5">{error && <div role="alert" className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700">{error}</div>}
          <div className="grid gap-3 sm:grid-cols-2"><label className="text-xs font-bold text-slate-600">Sucursal<select value={ubicacionId} onChange={(event) => { setUbicacionId(event.target.value); setItems([]); }} required className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm font-medium text-slate-800 outline-none focus:border-orange-400"><option value="">Seleccionar sucursal…</option>{ubicaciones.map((ubicacion) => <option key={ubicacion.id} value={ubicacion.id}>{ubicacion.nombre}</option>)}</select></label><label className="text-xs font-bold text-slate-600">Motivo<textarea value={motivo} onChange={(event) => setMotivo(event.target.value)} required minLength="3" maxLength="500" rows="2" placeholder="Conteo físico, merma, corrección…" className="mt-1.5 w-full resize-y rounded-lg border border-slate-200 px-3 py-2.5 text-sm font-normal outline-none focus:border-orange-400" /></label></div>
          <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-900"><AlertTriangle size={15} className="mr-1 inline -translate-y-px" />El guardado corrige existencias reales. Solo se habilitan productos con saldo inicial registrado; se requieren unidades enteras porque el stock global del sistema está configurado como entero.</div>
          <div className="mt-5"><label className="text-xs font-bold text-slate-600">Buscar productos con saldo en esta sucursal<input value={busqueda} onChange={(event) => setBusqueda(event.target.value)} disabled={!ubicacionId} placeholder="Buscar nombre, código o SKU…" className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-orange-400 disabled:bg-slate-50" /></label>
            {busqueda && <div className="mt-2 max-h-52 divide-y divide-slate-100 overflow-y-auto rounded-lg border border-slate-200">{productosElegibles.map((producto) => <button key={producto.id} type="button" onClick={() => agregarProducto(producto)} className="flex w-full items-center justify-between px-3 py-2 text-left hover:bg-orange-50"><span><span className="block text-sm font-semibold text-slate-800">{producto.nombre}</span><span className="text-xs text-slate-500">{producto.codigo || 'Sin código'} · sistema: {numero(stockPorProducto.get(`${producto.id}:${ubicacionId}`))}</span></span><Plus size={16} className="text-orange-600" /></button>)}{productosElegibles.length === 0 && <p className="px-3 py-4 text-center text-xs text-slate-500">Sin productos con saldo inicial para esta sucursal.</p>}</div>}
            <div className="mt-3 overflow-x-auto rounded-lg border border-slate-200"><table className="w-full min-w-[560px] text-left text-sm"><thead className="bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500"><tr><th className="px-3 py-2">Producto</th><th className="px-3 py-2 text-right">Sistema</th><th className="px-3 py-2 text-right">Conteo físico</th><th className="px-3 py-2 text-right">Diferencia</th><th className="px-3 py-2"></th></tr></thead><tbody className="divide-y divide-slate-100">{items.map((item) => <tr key={item.producto_id}><td className="px-3 py-2.5"><p className="font-semibold text-slate-800">{item.nombre}</p><p className="text-[11px] text-slate-500">{item.codigo || 'Sin código'}</p></td><td className="px-3 py-2.5 text-right">{numero(item.stock_anterior)}</td><td className="px-3 py-2.5 text-right"><input aria-label={`Conteo físico de ${item.nombre}`} type="number" inputMode="numeric" min="0" step="1" value={item.stock_nuevo} onChange={(event) => actualizarStockNuevo(item.producto_id, event.target.value)} className="w-28 rounded-md border border-slate-200 px-2 py-1.5 text-right text-sm outline-none focus:border-orange-400" /></td><td className={`px-3 py-2.5 text-right font-bold ${diferencia(item) < 0 ? 'text-red-600' : diferencia(item) > 0 ? 'text-emerald-700' : 'text-slate-500'}`}>{diferencia(item) > 0 ? '+' : ''}{Number.isFinite(diferencia(item)) ? numero(diferencia(item)) : '—'}</td><td className="px-3 py-2.5 text-right"><button type="button" onClick={() => quitarProducto(item.producto_id)} aria-label={`Quitar ${item.nombre}`} className="rounded p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"><Trash2 size={15} /></button></td></tr>)}{items.length === 0 && <tr><td colSpan="5" className="px-3 py-8 text-center text-xs text-slate-500">Agregá un producto para capturar su cantidad contada.</td></tr>}</tbody></table></div>
          </div>
        </div>
        <div className="flex flex-col-reverse gap-2 border-t border-slate-100 bg-slate-50 px-5 py-4 sm:flex-row sm:justify-end"><button type="button" onClick={() => { setMostrarFormulario(false); limpiarFormulario(); }} disabled={guardando} className="rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-50">Cancelar</button><button type="submit" disabled={guardando || !items.length} className="inline-flex items-center justify-center gap-2 rounded-lg bg-orange-500 px-5 py-2.5 text-sm font-bold text-white hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-50">{guardando ? <><LoaderCircle size={16} className="animate-spin" /> Guardando…</> : <><ClipboardCheck size={16} /> Guardar ajuste</>}</button></div>
      </form></div>}
    </div>
  );
}
