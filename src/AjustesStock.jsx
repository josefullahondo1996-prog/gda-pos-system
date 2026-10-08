import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ClipboardCheck, Download, LoaderCircle, Plus, Printer, RefreshCw, Search, Trash2, X } from 'lucide-react';
import { supabase } from './supabaseClient';
import { useEmpresaInfo } from './utils/useEmpresa';
import { useUbicacionUsuario } from './utils/useUbicacion';

const numero = (valor) => (Number(valor) || 0).toLocaleString('es-PY', { maximumFractionDigits: 3 });
const fechaHora = (valor) => valor ? new Date(valor).toLocaleString('es-PY', { dateStyle: 'medium', timeStyle: 'short' }) : '—';
const fechaLocal = () => { const ahora = new Date(); return `${ahora.getFullYear()}-${String(ahora.getMonth() + 1).padStart(2, '0')}-${String(ahora.getDate()).padStart(2, '0')}`; };
const nuevaReferencia = () => `CS-${Date.now().toString().slice(-8)}`;
const escaparHtml = (texto) => String(texto ?? '').replace(/[&<>"']/g, (caracter) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[caracter]);
const descargarCSV = (filas) => {
  const csv = filas.map((fila) => fila.map((celda) => `"${String(celda ?? '').replaceAll('"', '""')}"`).join(';')).join('\r\n');
  const enlace = document.createElement('a');
  enlace.href = URL.createObjectURL(new Blob(['\ufeff', csv], { type: 'text/csv;charset=utf-8' }));
  enlace.download = 'ajustes-stock.csv';
  enlace.click();
  URL.revokeObjectURL(enlace.href);
};

export default function AjustesStock({ initialCreate = false }) {
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
  const [filtroUbicacion, setFiltroUbicacion] = useState('Todas');
  const [filtroEstado, setFiltroEstado] = useState('Todos');
  const [fechaDesde, setFechaDesde] = useState('');
  const [fechaHasta, setFechaHasta] = useState('');
  const [referencia, setReferencia] = useState(nuevaReferencia);
  const [sesionConteo, setSesionConteo] = useState('');
  const [fechaControl, setFechaControl] = useState(fechaLocal);
  const [categoriaProducto, setCategoriaProducto] = useState('Todas');
  const [marcaProducto, setMarcaProducto] = useState('Todas');
  const [estadoStock, setEstadoStock] = useState('Todos');
  const [detalleAbierto, setDetalleAbierto] = useState(null);

  const cargarDatos = useCallback(async (silencioso = false) => {
    if (!empresaId) return;
    if (silencioso) setActualizando(true);
    else setCargando(true);
    setError('');
    let consultaUbicaciones = supabase.from('ubicaciones_comerciales').select('id, nombre, codigo_ubicacion').eq('empresa_id', empresaId).eq('activo', true).order('nombre');
    if (!usuarioVeTodas && ubicacionUsuarioId) consultaUbicaciones = consultaUbicaciones.eq('id', ubicacionUsuarioId);
    const [respuestaSucursales, respuestaProductos, respuestaStock, respuestaAjustes] = await Promise.all([
      consultaUbicaciones,
      supabase.from('productos').select('id, nombre, codigo, stock_actual, precio_compra, precio_venta, categoria, marca, activo, administra_stock').eq('empresa_id', empresaId).order('nombre').limit(3000),
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
  useEffect(() => { if (initialCreate) setMostrarFormulario(true); }, [initialCreate]);

  const nombreUbicacion = useMemo(() => new Map(ubicaciones.map((ubicacion) => [String(ubicacion.id), ubicacion.nombre])), [ubicaciones]);
  const stockPorProducto = useMemo(() => {
    const resultado = new Map();
    stock.forEach((fila) => resultado.set(`${fila.producto_id}:${fila.ubicacion_id}`, Number(fila.cantidad) || 0));
    return resultado;
  }, [stock]);
  const marcasDisponibles = useMemo(() => [...new Set(productos.map((producto) => producto.marca).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es')), [productos]);
  const categorias = useMemo(() => [...new Set(productos.map((producto) => producto.categoria).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es')), [productos]);
  const productosCoincidentes = useMemo(() => productos.filter((producto) => {
    const saldo = stockPorProducto.get(`${producto.id}:${ubicacionId}`);
    const tieneSaldo = stockPorProducto.has(`${producto.id}:${ubicacionId}`);
    const termino = busqueda.trim().toLocaleLowerCase('es');
    const coincideTermino = !termino || `${producto.nombre} ${producto.codigo || ''}`.toLocaleLowerCase('es').includes(termino);
    return tieneSaldo && !items.some((item) => String(item.producto_id) === String(producto.id))
      && (categoriaProducto === 'Todas' || producto.categoria === categoriaProducto)
      && (marcaProducto === 'Todas' || producto.marca === marcaProducto)
      && (estadoStock === 'Todos' || (estadoStock === 'Con stock' ? Number(saldo) > 0 : Number(saldo) <= 0))
      && coincideTermino;
  }), [productos, stockPorProducto, ubicacionId, items, busqueda, categoriaProducto, marcaProducto, estadoStock]);
  const productosElegibles = useMemo(() => {
    return productosCoincidentes.slice(0, 12);
  }, [productosCoincidentes]);
  const ajustesVisibles = useMemo(() => {
    const termino = filtro.trim().toLocaleLowerCase('es');
    return ajustes.filter((ajuste) => {
      if (!usuarioVeTodas && ubicacionUsuarioId && String(ajuste.ubicacion_id) !== String(ubicacionUsuarioId)) return false;
      if (filtroUbicacion !== 'Todas' && String(ajuste.ubicacion_id) !== String(filtroUbicacion)) return false;
      const dia = String(ajuste.created_at || '').slice(0, 10);
      if (fechaDesde && dia < fechaDesde) return false;
      if (fechaHasta && dia > fechaHasta) return false;
      if (filtroEstado !== 'Todos' && filtroEstado !== 'Validado') return false;
      const ref = `CS-${String(ajuste.id).replaceAll('-', '').slice(0, 8).toUpperCase()}`;
      return !termino || `${ref} ${nombreUbicacion.get(String(ajuste.ubicacion_id)) || ''} ${ajuste.motivo || ''} ${(ajuste.items || []).map((item) => `${item.nombre || ''} ${item.producto_id || ''}`).join(' ')}`.toLocaleLowerCase('es').includes(termino);
    });
  }, [ajustes, filtro, nombreUbicacion, usuarioVeTodas, ubicacionUsuarioId, filtroUbicacion, fechaDesde, fechaHasta, filtroEstado]);

  const agregarProducto = (producto) => {
    const stockActual = stockPorProducto.get(`${producto.id}:${ubicacionId}`);
    setItems((anteriores) => [...anteriores, { producto_id: String(producto.id), nombre: producto.nombre, codigo: producto.codigo || '', stock_anterior: stockActual, stock_nuevo: String(stockActual), precio_compra: Number(producto.precio_compra || 0), precio_venta: Number(producto.precio_venta || 0) }]);
    setBusqueda('');
  };
  const quitarProducto = (id) => setItems((anteriores) => anteriores.filter((item) => String(item.producto_id) !== String(id)));
  const actualizarStockNuevo = (id, valor) => setItems((anteriores) => anteriores.map((item) => String(item.producto_id) === String(id) ? { ...item, stock_nuevo: valor } : item));
  const diferencia = (item) => Number(item.stock_nuevo) - Number(item.stock_anterior);

  const limpiarFormulario = () => { setItems([]); setMotivo(''); setBusqueda(''); setCategoriaProducto('Todas'); setMarcaProducto('Todas'); setEstadoStock('Todos'); setSesionConteo(''); setFechaControl(fechaLocal()); setReferencia(nuevaReferencia()); };
  const cargarProductosFiltrados = () => {
    if (!ubicacionId) return setError('Seleccioná una sucursal antes de cargar productos.');
    if (!productosCoincidentes.length) return setError('No hay productos pendientes que coincidan con esos filtros.');
    const nuevas = productosCoincidentes.map((producto) => {
      const saldo = stockPorProducto.get(`${producto.id}:${ubicacionId}`);
      return { producto_id: String(producto.id), nombre: producto.nombre, codigo: producto.codigo || '', stock_anterior: saldo, stock_nuevo: String(saldo), precio_compra: Number(producto.precio_compra || 0), precio_venta: Number(producto.precio_venta || 0) };
    });
    setItems((anteriores) => [...anteriores, ...nuevas]); setBusqueda(''); setError('');
  };
  const imprimirPlanilla = () => {
    if (!items.length) return setError('Cargá productos antes de imprimir la planilla.');
    const ventana = window.open('', '_blank', 'width=1100,height=800');
    if (!ventana) return setError('El navegador bloqueó la impresión. Permití las ventanas emergentes para este sitio.');
    const filas = items.map((item) => `<tr><td>${escaparHtml(item.codigo || '—')}</td><td>${escaparHtml(item.nombre)}</td><td class="right">${numero(item.stock_anterior)}</td><td class="count"></td><td class="count"></td><td class="count"></td></tr>`).join('');
    ventana.document.write(`<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Planilla ${escaparHtml(referencia)}</title><style>body{font:12px Arial,sans-serif;color:#111;padding:24px}h1{font-size:20px;margin:0 0 8px}p{margin:4px 0}.meta{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:18px 0}table{width:100%;border-collapse:collapse;margin-top:16px}th,td{border:1px solid #888;padding:7px;text-align:left;height:22px}th{background:#eee}.right{text-align:right}.count{width:90px}@media print{body{padding:0}}</style></head><body><h1>Control de stock · Planilla de conteo</h1><div class="meta"><p><b>Referencia:</b> ${escaparHtml(referencia)}</p><p><b>Fecha:</b> ${escaparHtml(fechaControl)}</p><p><b>Sucursal:</b> ${escaparHtml(ubicaciones.find((u) => String(u.id) === String(ubicacionId))?.nombre || '')}</p><p><b>Sesión:</b> ${escaparHtml(sesionConteo || 'Conteo de stock')}</p><p><b>Nota:</b> ${escaparHtml(motivo || '—')}</p></div><table><thead><tr><th>Código</th><th>Producto</th><th>Stock sistema</th><th>Conteo 1</th><th>Conteo final</th><th>Diferencia</th></tr></thead><tbody>${filas}</tbody></table><script>window.onload=()=>window.print()</script></body></html>`);
    ventana.document.close();
  };
  const guardarAjuste = async (event) => {
    event.preventDefault();
    setError('');
    setExito('');
    if (!empresaId) return setError('No se encontró la empresa de esta sesión.');
    if (!ubicacionId) return setError('Seleccioná una sucursal.');
    if (motivo.trim().length < 3) return setError('Explicá la nota o motivo del control (al menos 3 caracteres).');
    if (!items.length) return setError('Agregá al menos un producto.');
    const inválido = items.find((item) => item.stock_nuevo === '' || !Number.isFinite(Number(item.stock_nuevo)) || Number(item.stock_nuevo) < 0);
    if (inválido) return setError(`La cantidad contada de ${inválido.nombre} debe ser un número igual o mayor que cero.`);
    const modificados = items.filter((item) => diferencia(item) !== 0);
    if (!modificados.length) return setError('Las cantidades contadas no presentan diferencias para ajustar.');

    setGuardando(true);
    const motivoRegistrado = `Ref. ${referencia} · Sesión: ${sesionConteo.trim() || 'Conteo de stock'} · Fecha control: ${fechaControl} · ${motivo.trim()}`;
    const { error: errorRPC } = await supabase.rpc('ajustar_stock', {
      p_ubicacion_id: ubicacionId,
      p_items: modificados.map((item) => ({ producto_id: item.producto_id, stock_nuevo: Number(item.stock_nuevo) })),
      p_motivo: motivoRegistrado.slice(0, 500),
    });
    setGuardando(false);
    if (errorRPC) return setError(errorRPC.message || 'No se pudo guardar el ajuste.');
    limpiarFormulario();
    setMostrarFormulario(false);
    setExito(`Control ${referencia} validado. Se actualizaron las existencias de la sucursal y el stock global.`);
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
        <div><p className="mb-1 text-xs font-bold uppercase tracking-[0.16em] text-orange-600">Inventario</p><h1 className="text-2xl font-bold tracking-tight text-slate-900">Control de stock</h1><p className="mt-1 max-w-2xl text-sm text-slate-500">Cargá una planilla de conteo por sucursal, compará el físico con el sistema y validá las diferencias con trazabilidad.</p></div>
        <div className="flex flex-wrap gap-2"><button type="button" onClick={() => cargarDatos(true)} disabled={actualizando} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"><RefreshCw size={15} className={actualizando ? 'animate-spin' : ''} /> Actualizar</button><button type="button" onClick={exportar} disabled={!ajustesVisibles.length} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"><Download size={15} /> Exportar CSV</button><button type="button" onClick={() => { setError(''); setExito(''); setMostrarFormulario(true); }} disabled={!ubicaciones.length} className="inline-flex items-center gap-2 rounded-lg bg-orange-500 px-4 py-2 text-sm font-bold text-white shadow-sm hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-50"><Plus size={16} /> Nuevo control</button></div>
      </div>

      {error && !mostrarFormulario && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
      {exito && <div role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{exito}</div>}

      <div className="grid gap-4 sm:grid-cols-3"><article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Controles validados</p><p className="mt-2 text-2xl font-black text-slate-900">{ajustesVisibles.length.toLocaleString('es-PY')}</p></article><article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Productos contados</p><p className="mt-2 text-2xl font-black text-slate-900">{ajustesVisibles.reduce((total, ajuste) => total + (ajuste.items || []).length, 0).toLocaleString('es-PY')}</p></article><article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Sucursales disponibles</p><p className="mt-2 text-2xl font-black text-slate-900">{ubicaciones.length.toLocaleString('es-PY')}</p></article></div>

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm"><div className="border-b border-slate-100 p-4"><div className="mb-3"><h2 className="font-bold text-slate-900">Todos los controles de stock</h2><p className="mt-0.5 text-xs text-slate-500">{ajustesVisibles.length.toLocaleString('es-PY')} controles validados</p></div><div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5"><select value={filtroUbicacion} onChange={(event) => setFiltroUbicacion(event.target.value)} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs"><option value="Todas">Todas las sucursales</option>{ubicaciones.map((ubicacion) => <option key={ubicacion.id} value={ubicacion.id}>{ubicacion.nombre}</option>)}</select><select value={filtroEstado} onChange={(event) => setFiltroEstado(event.target.value)} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs"><option>Todos</option><option>Validado</option><option>Borrador</option><option>Cancelado</option></select><input type="date" aria-label="Fecha desde" value={fechaDesde} onChange={(event) => setFechaDesde(event.target.value)} className="rounded-lg border border-slate-200 px-3 py-2 text-xs" /><input type="date" aria-label="Fecha hasta" value={fechaHasta} onChange={(event) => setFechaHasta(event.target.value)} className="rounded-lg border border-slate-200 px-3 py-2 text-xs" /><label className="relative"><Search size={15} className="absolute left-3 top-2.5 text-slate-400" /><input value={filtro} onChange={(event) => setFiltro(event.target.value)} placeholder="Buscar referencia o producto" className="w-full rounded-lg border border-slate-200 py-2 pl-9 pr-3 text-xs outline-none focus:border-orange-400" /></label></div></div>
        <div className="overflow-x-auto"><table className="w-full min-w-[980px] text-left text-sm"><thead className="bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500"><tr><th className="px-4 py-3">Fecha</th><th className="px-4 py-3">Número de referencia</th><th className="px-4 py-3">Sesión de conteo</th><th className="px-4 py-3">Ubicación</th><th className="px-4 py-3">Estado</th><th className="px-4 py-3">Productos</th><th className="px-4 py-3">Añadido por</th><th className="px-4 py-3 text-right">Acción</th></tr></thead><tbody className="divide-y divide-slate-100">
          {ajustesVisibles.map((ajuste) => { const ref = `CS-${String(ajuste.id).replaceAll('-', '').slice(0, 8).toUpperCase()}`; const sesion = (ajuste.motivo || '').match(/Sesión: ([^·]+)/)?.[1]?.trim() || 'Conteo de stock'; const abierto = detalleAbierto === ajuste.id; return <><tr key={ajuste.id} className="hover:bg-slate-50/70"><td className="whitespace-nowrap px-4 py-3 text-slate-600">{fechaHora(ajuste.created_at)}</td><td className="px-4 py-3 font-mono text-xs font-bold text-slate-800">{ref}</td><td className="px-4 py-3">{sesion}</td><td className="px-4 py-3">{nombreUbicacion.get(String(ajuste.ubicacion_id)) || 'Ubicación'}</td><td className="px-4 py-3"><span className="rounded-full bg-emerald-100 px-2 py-1 text-[10px] font-bold text-emerald-800">Validado</span></td><td className="px-4 py-3">{(ajuste.items || []).length}</td><td className="px-4 py-3 text-xs text-slate-500">{ajuste.usuario_id || 'Usuario registrado'}</td><td className="px-4 py-3 text-right"><button type="button" onClick={() => setDetalleAbierto(abierto ? null : ajuste.id)} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-100">{abierto ? 'Ocultar' : 'Ver detalle'}</button></td></tr>{abierto && <tr key={`${ajuste.id}-detalle`}><td colSpan="8" className="bg-slate-50 px-4 py-3"><p className="mb-2 text-xs text-slate-600"><b>Nota / motivo:</b> {(ajuste.motivo || '').replace(/^Ref\. [^·]+ · /, '').replace(/^Sesión: [^·]+ · /, '')}</p><div className="overflow-x-auto rounded-lg border bg-white"><table className="w-full min-w-[640px] text-xs"><thead className="bg-slate-100 text-[10px] uppercase text-slate-500"><tr><th className="p-2 text-left">Producto</th><th className="p-2 text-right">Stock teórico</th><th className="p-2 text-right">Conteo físico</th><th className="p-2 text-right">Diferencia</th></tr></thead><tbody>{(ajuste.items || []).map((item, index) => <tr key={`${ajuste.id}-${index}`} className="border-t"><td className="p-2">{item.nombre || `Producto ${item.producto_id}`}</td><td className="p-2 text-right">{numero(item.stock_anterior)}</td><td className="p-2 text-right">{numero(item.stock_nuevo)}</td><td className={`p-2 text-right font-bold ${Number(item.diferencia) < 0 ? 'text-red-600' : Number(item.diferencia) > 0 ? 'text-emerald-700' : ''}`}>{Number(item.diferencia) > 0 ? '+' : ''}{numero(item.diferencia)}</td></tr>)}</tbody></table></div></td></tr>}</>; })}
          {!ajustesVisibles.length && <tr><td colSpan="8" className="px-4 py-12 text-center"><div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-500"><ClipboardCheck size={19} /></div><p className="font-semibold text-slate-700">No hay controles para mostrar</p><p className="mt-1 text-xs text-slate-500">Los conteos validados aparecerán aquí con su referencia, estado y diferencias.</p></td></tr>}
        </tbody></table></div>
      </section>

      {mostrarFormulario && <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/50 p-3 sm:p-6" onMouseDown={(event) => { if (event.target === event.currentTarget && !guardando) setMostrarFormulario(false); }}><form onSubmit={guardarAjuste} className="flex max-h-[94vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-start justify-between border-b border-slate-100 px-5 py-4"><div><p className="text-[10px] font-black uppercase tracking-[0.15em] text-orange-600">Inventario · {referencia}</p><h2 className="mt-1 text-xl font-black text-slate-900">Nuevo control de stock</h2><p className="mt-1 text-xs text-slate-500">Prepará el conteo físico, imprimí la planilla y validá la diferencia contra el stock actual.</p></div><button type="button" onClick={() => { if (!guardando) { setMostrarFormulario(false); limpiarFormulario(); } }} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" aria-label="Cerrar"><X size={19} /></button></div>
        <div className="overflow-y-auto p-5">{error && <div role="alert" className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700">{error}</div>}
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><label className="text-xs font-bold text-slate-600">Ubicación de la empresa<select value={ubicacionId} onChange={(event) => { setUbicacionId(event.target.value); setItems([]); }} required className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm font-medium text-slate-800 outline-none focus:border-orange-400"><option value="">Seleccionar sucursal…</option>{ubicaciones.map((ubicacion) => <option key={ubicacion.id} value={ubicacion.id}>{ubicacion.nombre}</option>)}</select></label><label className="text-xs font-bold text-slate-600">Sesión de conteo<input value={sesionConteo} onChange={(event) => setSesionConteo(event.target.value)} maxLength="120" placeholder="Ej.: Conteo general octubre" className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm font-normal outline-none focus:border-orange-400" /></label><label className="text-xs font-bold text-slate-600">Fecha<input type="date" value={fechaControl} onChange={(event) => setFechaControl(event.target.value)} required className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm font-normal outline-none focus:border-orange-400" /></label><label className="text-xs font-bold text-slate-600">Nota<textarea value={motivo} onChange={(event) => setMotivo(event.target.value)} required minLength="3" maxLength="350" rows="1" placeholder="Motivo o comentario del conteo" className="mt-1.5 w-full resize-y rounded-lg border border-slate-200 px-3 py-2.5 text-sm font-normal outline-none focus:border-orange-400" /></label></div>
          <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-900"><AlertTriangle size={15} className="mr-1 inline -translate-y-px" />El guardado corrige existencias reales con cantidades enteras o decimales. Solo se habilitan productos con saldo inicial registrado; el saldo de la sucursal y el global se actualizan juntos.</div>
          <div className="mt-5 grid gap-2 sm:grid-cols-2 xl:grid-cols-4"><label className="text-xs font-bold text-slate-600">Categoría<select value={categoriaProducto} onChange={(event) => setCategoriaProducto(event.target.value)} className="mt-1 block w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-normal"><option>Todas</option>{categorias.map((categoria) => <option key={categoria}>{categoria}</option>)}</select></label><label className="text-xs font-bold text-slate-600">Marca<select value={marcaProducto} onChange={(event) => setMarcaProducto(event.target.value)} className="mt-1 block w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-normal"><option value="Todas">Todas</option>{marcasDisponibles.map((marca) => <option key={marca} value={marca}>{marca}</option>)}</select></label><label className="text-xs font-bold text-slate-600">Estado de stock<select value={estadoStock} onChange={(event) => setEstadoStock(event.target.value)} className="mt-1 block w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-normal"><option>Todos</option><option>Con stock</option><option>Sin stock</option></select></label><label className="text-xs font-bold text-slate-600">Buscar<input value={busqueda} onChange={(event) => setBusqueda(event.target.value)} disabled={!ubicacionId} placeholder="Nombre, código o SKU…" className="mt-1 block w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-normal outline-none focus:border-orange-400 disabled:bg-slate-50" /></label>
          </div><div className="mt-3 flex flex-wrap items-center gap-2"><button type="button" onClick={cargarProductosFiltrados} disabled={!ubicacionId || !productosCoincidentes.length} className="inline-flex items-center gap-2 rounded-lg bg-slate-800 px-3 py-2 text-xs font-bold text-white disabled:opacity-50"><Download size={14} /> Cargar productos filtrados ({productosCoincidentes.length})</button><button type="button" onClick={imprimirPlanilla} disabled={!items.length} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700 disabled:opacity-50"><Printer size={14} /> Imprimir planilla</button><span className="text-xs text-slate-500">Productos cargados: {items.length}</span></div>
            {busqueda && <div className="mt-2 max-h-52 divide-y divide-slate-100 overflow-y-auto rounded-lg border border-slate-200">{productosElegibles.map((producto) => <button key={producto.id} type="button" onClick={() => agregarProducto(producto)} className="flex w-full items-center justify-between px-3 py-2 text-left hover:bg-orange-50"><span><span className="block text-sm font-semibold text-slate-800">{producto.nombre}</span><span className="text-xs text-slate-500">{producto.codigo || 'Sin código'} · sistema: {numero(stockPorProducto.get(`${producto.id}:${ubicacionId}`))}</span></span><Plus size={16} className="text-orange-600" /></button>)}{productosElegibles.length === 0 && <p className="px-3 py-4 text-center text-xs text-slate-500">Sin productos con saldo inicial para esta sucursal.</p>}</div>}
            <div className="mt-3 overflow-x-auto rounded-lg border border-slate-200"><table className="w-full min-w-[980px] text-left text-sm"><thead className="bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500"><tr><th className="px-3 py-2">Producto</th><th className="px-3 py-2 text-right">Stock teórico</th><th className="px-3 py-2 text-right">Conteo físico</th><th className="px-3 py-2 text-right">Diferencia</th><th className="px-3 py-2 text-right">Costo unitario</th><th className="px-3 py-2 text-right">Precio venta</th><th className="px-3 py-2 text-right">Subtotal costo</th><th className="px-3 py-2">Razón</th><th className="px-3 py-2"></th></tr></thead><tbody className="divide-y divide-slate-100">{items.map((item) => <tr key={item.producto_id}><td className="px-3 py-2.5"><p className="font-semibold text-slate-800">{item.nombre}</p><p className="text-[11px] text-slate-500">{item.codigo || 'Sin código'}</p></td><td className="px-3 py-2.5 text-right">{numero(item.stock_anterior)}</td><td className="px-3 py-2.5 text-right"><input aria-label={`Conteo físico de ${item.nombre}`} type="number" inputMode="decimal" min="0" step="any" value={item.stock_nuevo} onChange={(event) => actualizarStockNuevo(item.producto_id, event.target.value)} className="w-24 rounded-md border border-slate-200 px-2 py-1.5 text-right text-sm outline-none focus:border-orange-400" /></td><td className={`px-3 py-2.5 text-right font-bold ${diferencia(item) < 0 ? 'text-red-600' : diferencia(item) > 0 ? 'text-emerald-700' : 'text-slate-500'}`}>{diferencia(item) > 0 ? '+' : ''}{Number.isFinite(diferencia(item)) ? numero(diferencia(item)) : '—'}</td><td className="px-3 py-2.5 text-right">{numero(item.precio_compra)}</td><td className="px-3 py-2.5 text-right">{numero(item.precio_venta)}</td><td className="px-3 py-2.5 text-right">{numero(Number(item.stock_nuevo || 0) * item.precio_compra)}</td><td className="px-3 py-2.5 text-xs text-slate-500">{motivo || '—'}</td><td className="px-3 py-2.5 text-right"><button type="button" onClick={() => quitarProducto(item.producto_id)} aria-label={`Quitar ${item.nombre}`} className="rounded p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"><Trash2 size={15} /></button></td></tr>)}{items.length === 0 && <tr><td colSpan="9" className="px-3 py-8 text-center text-xs text-slate-500">Cargá productos para preparar el conteo.</td></tr>}</tbody></table></div>
          </div>
        <div className="flex flex-col-reverse gap-2 border-t border-slate-100 bg-slate-50 px-5 py-4 sm:flex-row sm:justify-end"><button type="button" onClick={() => { setMostrarFormulario(false); limpiarFormulario(); }} disabled={guardando} className="rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-50">Cancelar</button><button type="submit" disabled={guardando || !items.length} className="inline-flex items-center justify-center gap-2 rounded-lg bg-orange-500 px-5 py-2.5 text-sm font-bold text-white hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-50">{guardando ? <><LoaderCircle size={16} className="animate-spin" /> Guardando…</> : <><ClipboardCheck size={16} /> Guardar ajuste</>}</button></div>
      </form></div>}
    </div>
  );
}
