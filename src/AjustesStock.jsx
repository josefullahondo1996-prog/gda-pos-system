import { useCallback, useEffect, useMemo, useState, Fragment } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowDown, ArrowUp, ChevronDown, ChevronLeft, ChevronRight, ClipboardCheck, Download, Eye, FileSpreadsheet, FileText, Filter, LoaderCircle, Plus, Printer, RefreshCw, RotateCcw, Search, Settings2, Trash2 } from 'lucide-react';
import { supabase } from './supabaseClient';
import { useEmpresaInfo } from './utils/useEmpresa';
import { useUbicacionUsuario } from './utils/useUbicacion';

const numero = (valor) => (Number(valor) || 0).toLocaleString('es-PY', { maximumFractionDigits: 3 });
const fechaHora = (valor) => valor ? new Date(valor).toLocaleString('es-PY', { dateStyle: 'medium', timeStyle: 'short' }) : '—';
const fechaLocal = () => { const ahora = new Date(); return `${ahora.getFullYear()}-${String(ahora.getMonth() + 1).padStart(2, '0')}-${String(ahora.getDate()).padStart(2, '0')}`; };
const nuevaReferencia = () => `CS-${Date.now().toString().slice(-8)}`;
const escaparHtml = (texto) => String(texto ?? '').replace(/[&<>"']/g, (caracter) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[caracter]);
const COLUMNAS_AJUSTES = [
  { key: 'fecha', label: 'Fecha', sortable: true },
  { key: 'referencia', label: 'Número de referencia', sortable: true },
  { key: 'sesion', label: 'Sesión de conteo', sortable: true },
  { key: 'ubicacion', label: 'Ubicación', sortable: true },
  { key: 'estado', label: 'Estado', sortable: true },
  { key: 'origen', label: 'Origen', sortable: false },
  { key: 'productos', label: 'Productos', sortable: true },
  { key: 'usuario', label: 'Añadido por', sortable: true },
  { key: 'accion', label: 'Acción', sortable: false },
];
const descargarCSV = (filas) => {
  const csv = filas.map((fila) => fila.map((celda) => `"${String(celda ?? '').replaceAll('"', '""')}"`).join(';')).join('\r\n');
  const enlace = document.createElement('a');
  enlace.href = URL.createObjectURL(new Blob(['\ufeff', csv], { type: 'text/csv;charset=utf-8' }));
  enlace.download = 'ajustes-stock.csv';
  enlace.click();
  URL.revokeObjectURL(enlace.href);
};
const cargarAjustesPaginados = async (empresaId) => {
  const ajustes = [];
  const tamanoPagina = 500;
  for (let desde = 0; ; desde += tamanoPagina) {
    const { data, error } = await supabase.from('ajustes_stock').select('id, ubicacion_id, usuario_id, motivo, items, created_at').eq('empresa_id', empresaId).order('created_at', { ascending: false }).range(desde, desde + tamanoPagina - 1);
    if (error) return { data: null, error };
    ajustes.push(...(data || []));
    if (!data || data.length < tamanoPagina) return { data: ajustes, error: null };
  }
};

export default function AjustesStock({ initialCreate = false }) {
  const navigate = useNavigate();
  const { id: empresaId } = useEmpresaInfo();
  const { id: ubicacionUsuarioId, ve_todas: usuarioVeTodas, cargando: cargandoPermisos } = useUbicacionUsuario();
  const [ubicaciones, setUbicaciones] = useState([]);
  const [productos, setProductos] = useState([]);
  const [stock, setStock] = useState([]);
  const [ajustes, setAjustes] = useState([]);
  const [usuarios, setUsuarios] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [actualizando, setActualizando] = useState(false);
  const [error, setError] = useState('');
  const [exito, setExito] = useState('');
  const [ubicacionId, setUbicacionId] = useState('');
  const [busqueda, setBusqueda] = useState('');
  const [terminoFiltro, setTerminoFiltro] = useState('');
  const [items, setItems] = useState([]);
  const [motivo, setMotivo] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [filtro, setFiltro] = useState('');
  const [filtroReferencia, setFiltroReferencia] = useState('');
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
  const [filtrosAbiertos, setFiltrosAbiertos] = useState(true);
  const [mostrarColumnas, setMostrarColumnas] = useState(false);
  const [tamanoPagina, setTamanoPagina] = useState('25');
  const [paginaActual, setPaginaActual] = useState(1);
  const [colVisibles, setColVisibles] = useState({ fecha: true, referencia: true, sesion: true, ubicacion: true, estado: true, origen: true, productos: true, usuario: true, accion: true });
  const [ordenTabla, setOrdenTabla] = useState('fecha');
  const [ordenDescendente, setOrdenDescendente] = useState(true);

  const cargarDatos = useCallback(async (silencioso = false) => {
    if (!empresaId) return;
    if (silencioso) setActualizando(true);
    else setCargando(true);
    setError('');
    let consultaUbicaciones = supabase.from('ubicaciones_comerciales').select('id, nombre, codigo_ubicacion').eq('empresa_id', empresaId).eq('activo', true).order('nombre');
    if (!usuarioVeTodas && ubicacionUsuarioId) consultaUbicaciones = consultaUbicaciones.eq('id', ubicacionUsuarioId);
    const [respuestaSucursales, respuestaProductos, respuestaStock, respuestaAjustes, respuestaUsuarios] = await Promise.all([
      consultaUbicaciones,
      supabase.from('productos').select('id, nombre, codigo, stock_actual, precio_compra, precio_venta, categoria, marca, activo, administra_stock').eq('empresa_id', empresaId).order('nombre').limit(3000),
      supabase.from('producto_stock_ubicacion').select('producto_id, ubicacion_id, cantidad').eq('empresa_id', empresaId).limit(20000),
      cargarAjustesPaginados(empresaId),
      supabase.from('usuarios').select('id, nombre, apellido').eq('empresa_id', empresaId).limit(2000),
    ]);
    const problema = respuestaSucursales.error || respuestaProductos.error || respuestaStock.error || respuestaAjustes.error;
    if (problema) setError(`No se pudieron cargar los ajustes de stock: ${problema.message}`);
    setUbicaciones(respuestaSucursales.data || []);
    setProductos((respuestaProductos.data || []).filter((producto) => producto.activo !== false && producto.administra_stock !== false));
    setStock(respuestaStock.data || []);
    setAjustes(respuestaAjustes.data || []);
    setUsuarios(respuestaUsuarios.data || []);
    if (ubicacionUsuarioId) setUbicacionId((actual) => actual || String(ubicacionUsuarioId));
    else if (usuarioVeTodas && respuestaSucursales.data?.length === 1) setUbicacionId((actual) => actual || String(respuestaSucursales.data[0].id));
    setCargando(false);
    setActualizando(false);
  }, [empresaId, usuarioVeTodas, ubicacionUsuarioId]);

  useEffect(() => { cargarDatos(); }, [cargarDatos]);

  const nombreUbicacion = useMemo(() => new Map(ubicaciones.map((ubicacion) => [String(ubicacion.id), ubicacion.nombre])), [ubicaciones]);
  const nombreUsuario = useMemo(() => new Map(usuarios.map((usuario) => [String(usuario.id), `${usuario.nombre || ''} ${usuario.apellido || ''}`.trim()])), [usuarios]);
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
    const termino = terminoFiltro.trim().toLocaleLowerCase('es');
    const coincideTermino = !termino || `${producto.nombre} ${producto.codigo || ''}`.toLocaleLowerCase('es').includes(termino);
    return tieneSaldo && !items.some((item) => String(item.producto_id) === String(producto.id))
      && (categoriaProducto === 'Todas' || producto.categoria === categoriaProducto)
      && (marcaProducto === 'Todas' || producto.marca === marcaProducto)
      && (estadoStock === 'Todos' || (estadoStock === 'Con stock' ? Number(saldo) > 0 : Number(saldo) <= 0))
      && coincideTermino;
  }), [productos, stockPorProducto, ubicacionId, items, terminoFiltro, categoriaProducto, marcaProducto, estadoStock]);
  const productosElegibles = useMemo(() => {
    const termino = busqueda.trim().toLocaleLowerCase('es');
    return productosCoincidentes.filter((producto) => !termino || `${producto.nombre} ${producto.codigo || ''}`.toLocaleLowerCase('es').includes(termino)).slice(0, 12);
  }, [productosCoincidentes, busqueda]);
  const ajustesEtiquetados = useMemo(() => ajustes.map((ajuste) => {
    const referenciaGuardada = ajuste.motivo?.match(/Ref\.\s*([^·]+)/i)?.[1]?.trim();
    const sesionGuardada = ajuste.motivo?.match(/Sesión:\s*([^·]+)/i)?.[1]?.trim() || '';
    return {
      ...ajuste,
      fecha: ajuste.created_at || '',
      referencia: referenciaGuardada || `CS-${String(ajuste.id).replaceAll('-', '').slice(0, 8).toUpperCase()}`,
      sesion: sesionGuardada,
      ubicacion: nombreUbicacion.get(String(ajuste.ubicacion_id)) || 'Ubicación',
      estado: 'Validado',
      origen: /^Ref\.\s*CS-/i.test(ajuste.motivo || '') ? 'Panel' : '—',
      productos: (ajuste.items || []).length,
      usuario: nombreUsuario.get(String(ajuste.usuario_id)) || (ajuste.usuario_id ? 'Usuario registrado' : '—'),
    };
  }), [ajustes, nombreUbicacion, nombreUsuario]);
  const ajustesVisibles = useMemo(() => {
    const termino = filtro.trim().toLocaleLowerCase('es');
    const referencia = filtroReferencia.trim().toLocaleLowerCase('es');
    return ajustesEtiquetados.filter((ajuste) => {
      if (!usuarioVeTodas && ubicacionUsuarioId && String(ajuste.ubicacion_id) !== String(ubicacionUsuarioId)) return false;
      if (filtroUbicacion !== 'Todas' && String(ajuste.ubicacion_id) !== String(filtroUbicacion)) return false;
      const dia = String(ajuste.created_at || '').slice(0, 10);
      if (fechaDesde && dia < fechaDesde) return false;
      if (fechaHasta && dia > fechaHasta) return false;
      if (filtroEstado !== 'Todos' && filtroEstado !== 'Validado') return false;
      if (referencia && !ajuste.referencia.toLocaleLowerCase('es').includes(referencia)) return false;
      return !termino || `${ajuste.referencia} ${ajuste.sesion} ${ajuste.ubicacion} ${ajuste.estado} ${ajuste.origen} ${ajuste.usuario} ${ajuste.motivo || ''} ${(ajuste.items || []).map((item) => `${item.nombre || ''} ${item.producto_id || ''}`).join(' ')}`.toLocaleLowerCase('es').includes(termino);
    });
  }, [ajustesEtiquetados, filtro, filtroReferencia, usuarioVeTodas, ubicacionUsuarioId, filtroUbicacion, fechaDesde, fechaHasta, filtroEstado]);
  const ajustesOrdenados = useMemo(() => [...ajustesVisibles].sort((a, b) => {
    const valorA = a[ordenTabla] ?? '';
    const valorB = b[ordenTabla] ?? '';
    const comparacion = ordenTabla === 'fecha' ? String(valorA).localeCompare(String(valorB)) : typeof valorA === 'number' && typeof valorB === 'number' ? valorA - valorB : String(valorA).localeCompare(String(valorB), 'es', { numeric: true, sensitivity: 'base' });
    return ordenDescendente ? -comparacion : comparacion;
  }), [ajustesVisibles, ordenTabla, ordenDescendente]);
  const columnasVisibles = useMemo(() => COLUMNAS_AJUSTES.filter((columna) => colVisibles[columna.key]), [colVisibles]);
  const paginasTotales = Math.max(1, Math.ceil(ajustesOrdenados.length / (tamanoPagina === 'Todos' ? Math.max(1, ajustesOrdenados.length) : Number(tamanoPagina) || 25)));
  const paginaSegura = Math.min(paginaActual, paginasTotales);
  const indiceInicio = tamanoPagina === 'Todos' ? 0 : (paginaSegura - 1) * (Number(tamanoPagina) || 25);
  const ajustesPagina = ajustesOrdenados.slice(indiceInicio, tamanoPagina === 'Todos' ? undefined : indiceInicio + (Number(tamanoPagina) || 25));
  const filasDesde = ajustesOrdenados.length ? indiceInicio + 1 : 0;
  const filasHasta = ajustesOrdenados.length ? indiceInicio + ajustesPagina.length : 0;

  useEffect(() => { setPaginaActual(1); }, [filtro, filtroReferencia, filtroUbicacion, filtroEstado, fechaDesde, fechaHasta, tamanoPagina]);

  const agregarProducto = (producto) => {
    const stockActual = stockPorProducto.get(`${producto.id}:${ubicacionId}`);
    setItems((anteriores) => [...anteriores, { producto_id: String(producto.id), nombre: producto.nombre, codigo: producto.codigo || '', stock_anterior: stockActual, stock_nuevo: String(stockActual), precio_compra: Number(producto.precio_compra || 0), precio_venta: Number(producto.precio_venta || 0) }]);
    setBusqueda('');
  };
  const quitarProducto = (id) => setItems((anteriores) => anteriores.filter((item) => String(item.producto_id) !== String(id)));
  const actualizarStockNuevo = (id, valor) => setItems((anteriores) => anteriores.map((item) => String(item.producto_id) === String(id) ? { ...item, stock_nuevo: valor } : item));
  const diferencia = (item) => Number(item.stock_nuevo) - Number(item.stock_anterior);

  const limpiarFormulario = () => { setItems([]); setMotivo(''); setBusqueda(''); setTerminoFiltro(''); setCategoriaProducto('Todas'); setMarcaProducto('Todas'); setEstadoStock('Todos'); setSesionConteo(''); setFechaControl(fechaLocal()); setReferencia(nuevaReferencia()); };
  const cerrarFormulario = () => {
    if (guardando) return;
    limpiarFormulario();
    navigate('/control-stock');
  };
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
    setExito(`Control ${referencia} validado. Se actualizaron las existencias de la sucursal y el stock global.`);
    window.dispatchEvent(new Event('stock-actualizado'));
    if (initialCreate) navigate('/control-stock');
    else await cargarDatos(true);
  };

  const exportar = () => descargarCSV([
    ['Fecha', 'Sucursal', 'Motivo', 'Producto', 'Stock anterior', 'Stock contado', 'Diferencia'],
    ...ajustesVisibles.flatMap((ajuste) => (ajuste.items || []).map((item) => [fechaHora(ajuste.created_at), nombreUbicacion.get(String(ajuste.ubicacion_id)) || '', ajuste.motivo, item.nombre || item.producto_id, item.stock_anterior, item.stock_nuevo, item.diferencia])),
  ]);

  const filasExportacion = ajustesVisibles.flatMap((ajuste) => (ajuste.items || []).map((item) => [fechaHora(ajuste.fecha), ajuste.referencia, ajuste.sesion || 'Conteo de stock', ajuste.ubicacion, ajuste.estado, ajuste.origen, ajuste.usuario, item.nombre || item.producto_id, item.stock_anterior, item.stock_nuevo, item.diferencia]));
  const exportarExcel = async () => {
    try {
      const XLSX = await import('xlsx');
      const libro = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(libro, XLSX.utils.aoa_to_sheet([['Fecha', 'Referencia', 'Sesión de conteo', 'Ubicación', 'Estado', 'Origen', 'Añadido por', 'Producto', 'Stock teórico', 'Conteo físico', 'Diferencia'], ...filasExportacion]), 'Controles de stock');
      XLSX.writeFile(libro, 'controles-de-stock.xlsx');
    } catch (errorExportacion) { setError(`No se pudo generar Excel: ${errorExportacion.message}`); }
  };
  const imprimirListado = () => window.print();
  const exportarPdf = async () => {
    try {
      const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
      const documento = new jsPDF({ orientation: 'landscape' });
      documento.text('Controles de stock', 14, 14);
      autoTable(documento, { startY: 20, head: [['Fecha', 'Referencia', 'Sesión', 'Ubicación', 'Estado', 'Origen', 'Productos', 'Añadido por']], body: ajustesVisibles.map((ajuste) => [fechaHora(ajuste.fecha), ajuste.referencia, ajuste.sesion || 'Conteo de stock', ajuste.ubicacion, ajuste.estado, ajuste.origen, ajuste.productos, ajuste.usuario]), styles: { fontSize: 7 } });
      documento.save('controles-de-stock.pdf');
    } catch (errorExportacion) { setError(`No se pudo generar PDF: ${errorExportacion.message}`); }
  };
  const limpiarFiltros = () => { setFiltroUbicacion('Todas'); setFiltroEstado('Todos'); setFechaDesde(''); setFechaHasta(''); setFiltroReferencia(''); setFiltro(''); };

  if (cargandoPermisos || cargando) return <div className="flex min-h-64 items-center justify-center gap-2 text-sm text-slate-500"><LoaderCircle size={18} className="animate-spin" /> Cargando ajustes de stock…</div>;

  return (
    <div className="space-y-5 p-4 md:p-6">
      {!initialCreate && <>
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div><h1 className="text-2xl font-bold tracking-tight text-slate-900">Controles de stock</h1></div>
        <div className="flex flex-wrap gap-2"><button type="button" onClick={() => cargarDatos(true)} disabled={actualizando} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"><RefreshCw size={15} className={actualizando ? 'animate-spin' : ''} /> Actualizar</button></div>
      </div>

      {error && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
      {exito && <div role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{exito}</div>}



      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 p-4">
          <div><h2 className="font-bold text-slate-900">Todos los controles de stock</h2><p className="mt-0.5 text-xs text-slate-500">{ajustesVisibles.length.toLocaleString('es-PY')} controles validados</p></div>
          <button type="button" onClick={() => navigate('/control-stock/nuevo')} disabled={!ubicaciones.length} className="inline-flex items-center gap-2 rounded-md bg-orange-500 px-3 py-2 text-xs font-bold text-white shadow-sm hover:bg-orange-600 disabled:opacity-50"><Plus size={14}/> Añadir</button>
        </div>
        <div className="border-b border-slate-100">
          <button type="button" onClick={() => setFiltrosAbiertos((abierto) => !abierto)} className="flex w-full items-center justify-between px-4 py-3 text-sm font-bold text-slate-800"><span className="inline-flex items-center gap-2"><Filter size={15} className="text-slate-500"/>Filtros</span><ChevronDown size={16} className={`transition-transform ${filtrosAbiertos ? 'rotate-180' : ''}`}/></button>
          {filtrosAbiertos && <div className="grid gap-4 px-4 pb-4 sm:grid-cols-2 xl:grid-cols-4">
            <label className="text-xs font-semibold text-slate-700">Ubicación<select value={filtroUbicacion} onChange={(event) => setFiltroUbicacion(event.target.value)} className="mt-1.5 h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm font-normal"><option value="Todas">Todas</option>{ubicaciones.map((ubicacion) => <option key={ubicacion.id} value={ubicacion.id}>{ubicacion.nombre}</option>)}</select></label>
            <label className="text-xs font-semibold text-slate-700">Estado<select value={filtroEstado} onChange={(event) => setFiltroEstado(event.target.value)} className="mt-1.5 h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm font-normal"><option>Todos</option><option>Validado</option></select></label>
            <label className="text-xs font-semibold text-slate-700">Número de referencia<input value={filtroReferencia} onChange={(event) => setFiltroReferencia(event.target.value)} placeholder="Buscar referencia" className="mt-1.5 h-10 w-full rounded-md border border-slate-200 px-3 text-sm font-normal outline-none focus:border-orange-400"/></label>
            <label className="text-xs font-semibold text-slate-700">Rango de fechas<div className="mt-1.5 flex items-center gap-2"><input type="date" aria-label="Fecha desde" value={fechaDesde} onChange={(event) => setFechaDesde(event.target.value)} className="h-10 min-w-0 w-full rounded-md border border-slate-200 px-2 text-xs font-normal"/><span className="text-slate-400">a</span><input type="date" aria-label="Fecha hasta" value={fechaHasta} onChange={(event) => setFechaHasta(event.target.value)} className="h-10 min-w-0 w-full rounded-md border border-slate-200 px-2 text-xs font-normal"/></div><span className="mt-1 block font-normal text-slate-400">Vacío = se muestran todos los ajustes.</span></label>
            <div className="sm:col-span-2 xl:col-span-4"><button type="button" onClick={limpiarFiltros} className="inline-flex items-center gap-1.5 text-xs font-semibold text-orange-600 hover:text-orange-700"><RotateCcw size={13}/> Limpiar filtros</button></div>
          </div>}
        </div>
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 p-3 text-xs">
          <span className="text-slate-600">Mostrar</span><select value={tamanoPagina} onChange={(event) => setTamanoPagina(event.target.value)} className="h-8 rounded border border-slate-200 bg-white px-2"><option value="25">25</option><option value="50">50</option><option value="100">100</option><option value="200">200</option><option value="500">500</option><option value="1000">1,000</option><option value="Todos">Todas</option></select><span className="text-slate-600">entradas</span>
          <div className="flex flex-wrap items-center gap-1.5 xl:ml-3"><button type="button" onClick={exportar} disabled={!ajustesVisibles.length} className="rounded border border-slate-200 bg-white px-2.5 py-1.5 text-slate-700 hover:bg-slate-50 disabled:opacity-50"><Download size={13} className="mr-1 inline"/>CSV</button><button type="button" onClick={exportarExcel} disabled={!ajustesVisibles.length} className="rounded border border-slate-200 bg-white px-2.5 py-1.5 text-slate-700 hover:bg-slate-50 disabled:opacity-50"><FileSpreadsheet size={13} className="mr-1 inline"/>Excel</button><button type="button" onClick={imprimirListado} className="rounded border border-slate-200 bg-white px-2.5 py-1.5 text-slate-700 hover:bg-slate-50"><Printer size={13} className="mr-1 inline"/>Imprimir</button><div className="relative"><button type="button" onClick={() => setMostrarColumnas((mostrar) => !mostrar)} className="rounded border border-slate-200 bg-white px-2.5 py-1.5 text-slate-700 hover:bg-slate-50"><Settings2 size={13} className="mr-1 inline"/>Columnas</button>{mostrarColumnas && <div className="absolute left-0 top-9 z-30 w-56 rounded-lg border border-slate-200 bg-white p-2 shadow-lg">{COLUMNAS_AJUSTES.filter(({key}) => key !== 'accion').map(({key,label}) => <label key={key} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-xs hover:bg-slate-50"><input type="checkbox" checked={!!colVisibles[key]} onChange={() => setColVisibles((actual) => ({...actual,[key]:!actual[key]}))}/>{label}</label>)}</div>}</div><button type="button" onClick={exportarPdf} disabled={!ajustesVisibles.length} className="rounded border border-slate-200 bg-white px-2.5 py-1.5 text-slate-700 hover:bg-slate-50 disabled:opacity-50"><FileText size={13} className="mr-1 inline"/>PDF</button></div>
          <label className="relative ml-auto w-full sm:w-56"><Search size={14} className="absolute left-3 top-2.5 text-slate-400"/><input value={filtro} onChange={(event) => setFiltro(event.target.value)} placeholder="Buscar ..." className="h-9 w-full rounded-full border border-slate-200 py-1 pl-9 pr-3 outline-none focus:border-orange-400"/></label>
        </div>
        <div className="overflow-x-auto"><table className="w-full min-w-[1080px] border-collapse text-left text-xs"><thead className="bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500"><tr>{columnasVisibles.map((columna) => <th key={columna.key} className="border-b border-r border-slate-200 px-3 py-3 last:border-r-0">{columna.sortable ? <button type="button" onClick={() => { if (ordenTabla === columna.key) setOrdenDescendente((actual) => !actual); else { setOrdenTabla(columna.key); setOrdenDescendente(false); } }} className="inline-flex items-center gap-1 text-left">{columna.label}{ordenTabla === columna.key && (ordenDescendente ? <ArrowDown size={12}/> : <ArrowUp size={12}/>)}</button> : columna.label}</th>)}</tr></thead><tbody className="text-slate-700">
          {ajustesPagina.map((ajuste) => { const abierto = detalleAbierto === ajuste.id; return <Fragment key={ajuste.id}><tr className="border-b border-slate-100 odd:bg-white even:bg-slate-50/50 hover:bg-orange-50/40">{columnasVisibles.map(({key}) => <td key={key} className="border-r border-slate-100 px-3 py-3 align-middle last:border-r-0">{key === 'fecha' ? <span className="whitespace-nowrap">{fechaHora(ajuste.fecha)}</span> : key === 'referencia' ? <span className="font-mono font-semibold">{ajuste.referencia}</span> : key === 'sesion' ? (ajuste.sesion || 'Conteo de stock') : key === 'ubicacion' ? ajuste.ubicacion : key === 'estado' ? <span className="rounded-full bg-emerald-50 px-2 py-1 text-[10px] font-bold text-emerald-700">Validado</span> : key === 'origen' ? ajuste.origen : key === 'productos' ? ajuste.productos : key === 'usuario' ? ajuste.usuario : <button type="button" onClick={() => setDetalleAbierto(abierto ? null : ajuste.id)} className="inline-flex items-center gap-1 rounded bg-orange-500 px-3 py-1.5 font-bold text-white hover:bg-orange-600"><Eye size={13}/>{abierto ? 'Ocultar' : 'Ver'}</button>}</td>)}</tr>{abierto && <tr><td colSpan={columnasVisibles.length} className="border-b border-slate-200 bg-slate-50 px-4 py-3"><p className="mb-2 text-xs text-slate-600"><b>Nota / motivo:</b> {(ajuste.motivo || '').replace(/^Ref\. [^·]+ · /, '').replace(/^Sesión: [^·]+ · /, '')}</p><div className="overflow-x-auto rounded border border-slate-200 bg-white"><table className="w-full min-w-[640px] text-xs"><thead className="bg-slate-100 text-[10px] uppercase text-slate-500"><tr><th className="p-2 text-left">Producto</th><th className="p-2 text-right">Stock teórico</th><th className="p-2 text-right">Conteo físico</th><th className="p-2 text-right">Diferencia</th></tr></thead><tbody>{(ajuste.items || []).map((item, index) => <tr key={`${ajuste.id}-${index}`} className="border-t"><td className="p-2">{item.nombre || `Producto ${item.producto_id}`}</td><td className="p-2 text-right">{numero(item.stock_anterior)}</td><td className="p-2 text-right">{numero(item.stock_nuevo)}</td><td className={`p-2 text-right font-bold ${Number(item.diferencia) < 0 ? 'text-red-600' : Number(item.diferencia) > 0 ? 'text-emerald-700' : ''}`}>{Number(item.diferencia) > 0 ? '+' : ''}{numero(item.diferencia)}</td></tr>)}</tbody></table></div></td></tr>}</Fragment>;})}
          {!ajustesPagina.length && <tr><td colSpan={Math.max(1,columnasVisibles.length)} className="px-4 py-12 text-center"><div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-500"><ClipboardCheck size={19}/></div><p className="font-semibold text-slate-700">No hay controles para mostrar</p><p className="mt-1 text-xs text-slate-500">Probá cambiar o limpiar los filtros.</p></td></tr>}
        </tbody></table></div>
        <div className="flex flex-col justify-between gap-3 border-t border-slate-100 px-4 py-3 text-xs text-slate-600 sm:flex-row sm:items-center"><span>Mostrando {filasDesde.toLocaleString('es-PY')} a {filasHasta.toLocaleString('es-PY')} de {ajustesOrdenados.length.toLocaleString('es-PY')} entradas</span><div className="flex items-center gap-1"><button type="button" disabled={paginaSegura <= 1} onClick={() => setPaginaActual((actual) => Math.max(1, actual - 1))} className="inline-flex items-center gap-1 rounded border border-slate-200 px-3 py-1.5 disabled:opacity-40"><ChevronLeft size={13}/>Anterior</button><span className="rounded bg-orange-500 px-3 py-1.5 font-bold text-white">{paginaSegura} / {paginasTotales}</span><button type="button" disabled={paginaSegura >= paginasTotales} onClick={() => setPaginaActual((actual) => Math.min(paginasTotales, actual + 1))} className="inline-flex items-center gap-1 rounded border border-slate-200 px-3 py-1.5 disabled:opacity-40">Siguiente<ChevronRight size={13}/></button></div></div>
      </section>
      </>}

      {initialCreate && <div className="w-full">
        <h1 className="mb-5 text-2xl font-bold tracking-tight text-slate-900">Nuevo control de stock</h1>
        <form onSubmit={guardarAjuste} className="w-full space-y-7">
          {error && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

          <section className="flex min-h-[150px] items-center rounded-lg border border-slate-200 bg-white px-5 py-5 shadow-sm">
            <div className="grid w-full gap-5 sm:grid-cols-2 xl:grid-cols-4">
              <label className="text-sm font-semibold text-slate-700">Ubicación de la empresa:*<select value={ubicacionId} onChange={(event) => { setUbicacionId(event.target.value); setItems([]); }} required className="mt-2 h-11 w-full rounded-md border border-slate-200 bg-white px-3 text-sm font-normal text-slate-800 outline-none focus:border-orange-400"><option value="">Seleccione</option>{ubicaciones.map((ubicacion) => <option key={ubicacion.id} value={ubicacion.id}>{ubicacion.nombre}</option>)}</select></label>
              <label className="text-sm font-semibold text-slate-700">Sesión de conteo:<input value={sesionConteo} onChange={(event) => setSesionConteo(event.target.value)} maxLength="120" className="mt-2 h-11 w-full rounded-md border border-slate-200 px-3 text-sm font-normal outline-none focus:border-orange-400" /></label>
              <label className="text-sm font-semibold text-slate-700">Fecha:*<input type="date" value={fechaControl} onChange={(event) => setFechaControl(event.target.value)} required className="mt-2 h-11 w-full rounded-md border border-slate-200 bg-slate-100 px-3 text-sm font-normal outline-none focus:border-orange-400" /></label>
              <label className="text-sm font-semibold text-slate-700">Nota:<textarea value={motivo} onChange={(event) => setMotivo(event.target.value)} required minLength="3" maxLength="350" rows="2" className="mt-2 h-11 w-full resize-y rounded-md border border-slate-200 px-3 py-2 text-sm font-normal outline-none focus:border-orange-400" /></label>
            </div>
          </section>

          <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
            <div className="flex h-[49px] items-center border-b border-slate-200 bg-slate-50 px-5"><h2 className="text-base font-semibold text-slate-800">Sesión de conteo</h2></div>
            <div className="space-y-4 p-5">
              <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
                <label className="text-sm font-semibold text-slate-700">Categoría:<select value={categoriaProducto} onChange={(event) => setCategoriaProducto(event.target.value)} className="mt-2 h-11 w-full rounded-md border border-slate-200 bg-white px-3 text-sm font-normal"><option>Todas</option>{categorias.map((categoria) => <option key={categoria}>{categoria}</option>)}</select></label>
                <label className="text-sm font-semibold text-slate-700">Marca:<select value={marcaProducto} onChange={(event) => setMarcaProducto(event.target.value)} className="mt-2 h-11 w-full rounded-md border border-slate-200 bg-white px-3 text-sm font-normal"><option value="Todas">Todas</option>{marcasDisponibles.map((marca) => <option key={marca} value={marca}>{marca}</option>)}</select></label>
                <label className="text-sm font-semibold text-slate-700">Estado de stock:<select value={estadoStock} onChange={(event) => setEstadoStock(event.target.value)} className="mt-2 h-11 w-full rounded-md border border-slate-200 bg-white px-3 text-sm font-normal"><option>Todos</option><option>Con stock</option><option>Sin stock</option></select></label>
              </div>

              <div className="grid items-end gap-5 xl:grid-cols-4">
                <label className="text-sm font-semibold text-slate-700 xl:col-span-2">Buscar:<input value={terminoFiltro} onChange={(event) => setTerminoFiltro(event.target.value)} disabled={!ubicacionId} placeholder="Buscar Productos" className="mt-2 h-11 w-full rounded-md border border-slate-200 px-3 text-sm font-normal outline-none focus:border-orange-400 disabled:bg-slate-50" /></label>
                <button type="button" onClick={cargarProductosFiltrados} disabled={!ubicacionId || !productosCoincidentes.length} className="inline-flex h-11 w-fit items-center justify-self-start gap-2 rounded-md bg-orange-500 px-4 text-sm font-bold text-white shadow-sm hover:bg-orange-600 disabled:opacity-50"><Download size={15} /> Cargar productos filtrados</button>
                <button type="button" onClick={imprimirPlanilla} disabled={!items.length} className="inline-flex h-11 w-fit items-center justify-self-start gap-2 rounded-md border border-slate-200 bg-slate-50 px-4 text-sm font-semibold text-slate-700 disabled:opacity-50"><Printer size={15} /> Imprimir planilla</button>
              </div>

              <div className="relative mx-auto w-full md:w-2/3">
                <Search size={17} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" />
                <input value={busqueda} onChange={(event) => setBusqueda(event.target.value)} disabled={!ubicacionId} placeholder="Buscar productos para el ajuste de stock" className="h-12 w-full rounded-md border border-slate-200 bg-slate-50 pl-11 pr-3 text-sm outline-none focus:border-orange-400 disabled:bg-slate-50" />
                {busqueda && <div className="absolute inset-x-0 top-full z-20 mt-1 max-h-52 divide-y divide-slate-100 overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg">{productosElegibles.map((producto) => <button key={producto.id} type="button" onClick={() => agregarProducto(producto)} className="flex w-full items-center justify-between px-3 py-2 text-left hover:bg-orange-50"><span><span className="block text-sm font-semibold text-slate-800">{producto.nombre}</span><span className="text-xs text-slate-500">{producto.codigo || 'Sin código'} · sistema: {numero(stockPorProducto.get(`${producto.id}:${ubicacionId}`))}</span></span><Plus size={16} className="text-orange-600" /></button>)}{productosElegibles.length === 0 && <p className="px-3 py-4 text-center text-xs text-slate-500">Sin productos con saldo inicial para esta sucursal.</p>}</div>}
              </div>
            <div className="mt-3 overflow-x-auto rounded-lg border border-slate-200">
              <table className="table-fixed border-collapse text-left text-sm" style={{ width: '1572px' }}>
                <colgroup>
                  <col style={{ width: '232px' }} />
                  <col style={{ width: '125px' }} />
                  <col style={{ width: '123px' }} />
                  <col style={{ width: '124px' }} />
                  <col style={{ width: '228px' }} />
                  <col style={{ width: '125px' }} />
                  <col style={{ width: '125px' }} />
                  <col style={{ width: '124px' }} />
                  <col style={{ width: '121px' }} />
                  <col style={{ width: '125px' }} />
                  <col style={{ width: '75px' }} />
                  <col style={{ width: '45px' }} />
                </colgroup>
                <thead className="h-[76px] bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
                  <tr>
                    {[
                      'Producto',
                      <>Stock<br />teórico</>,
                      <>Conteo<br />físico</>,
                      'Diferencia',
                      'Tipo de ajuste',
                      <>Costo<br />unitario</>,
                      <>Contado base<br />de cambio</>,
                      'Crédito',
                      <>Precio<br />venta</>,
                      'Subtotal',
                      'Razón',
                      '',
                    ].map((titulo, indice) => (
                      <th key={indice} className="border-r border-slate-200 px-3 py-3 text-left align-middle leading-tight last:border-r-0">{titulo}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {items.map((item) => {
                    const cambio = diferencia(item);
                    const tipo = cambio > 0 ? 'Aumento' : cambio < 0 ? 'Disminución' : 'Sin diferencia';
                    const estiloTipo = cambio > 0 ? 'bg-emerald-50 text-emerald-700' : cambio < 0 ? 'bg-red-50 text-red-700' : 'bg-slate-100 text-slate-600';
                    return (
                      <tr key={item.producto_id} className="h-[96px] hover:bg-slate-50/70">
                        <td className="border-r border-slate-100 px-4 py-4 align-middle"><p className="font-semibold leading-snug text-slate-800">{item.nombre}</p><p className="mt-1 text-[11px] text-slate-500">{item.codigo || 'Sin código'}</p></td>
                        <td className="border-r border-slate-100 px-3 py-4 text-right align-middle">{numero(item.stock_anterior)}</td>
                        <td className="border-r border-slate-100 px-3 py-4 text-right align-middle"><input aria-label={`Conteo físico de ${item.nombre}`} type="number" inputMode="decimal" min="0" step="any" value={item.stock_nuevo} onChange={(event) => actualizarStockNuevo(item.producto_id, event.target.value)} className="h-11 w-[100px] rounded-md border border-slate-200 px-2 text-right text-sm outline-none focus:border-orange-400" /></td>
                        <td className={`border-r border-slate-100 px-3 py-4 text-right align-middle font-bold ${cambio < 0 ? 'text-red-600' : cambio > 0 ? 'text-emerald-700' : 'text-slate-500'}`}>{cambio > 0 ? '+' : ''}{Number.isFinite(cambio) ? numero(cambio) : '—'}</td>
                        <td className="border-r border-slate-100 px-3 py-4 align-middle"><span className={`inline-flex rounded-md px-2.5 py-2 text-xs font-semibold ${estiloTipo}`}>{tipo}</span></td>
                        <td className="border-r border-slate-100 px-3 py-4 text-right align-middle">{numero(item.precio_compra)}</td>
                        <td title="No hay conversión de cambio configurada para este producto" className="border-r border-slate-100 px-3 py-4 text-center align-middle text-slate-400">—</td>
                        <td title="El precio a crédito no forma parte de los datos de stock disponibles" className="border-r border-slate-100 px-3 py-4 text-right align-middle text-slate-400">—</td>
                        <td className="border-r border-slate-100 px-3 py-4 text-right align-middle">{numero(item.precio_venta)}</td>
                        <td className="border-r border-slate-100 px-3 py-4 text-right align-middle">{numero(Number(item.stock_nuevo || 0) * item.precio_compra)}</td>
                        <td className="border-r border-slate-100 px-3 py-4 text-xs text-slate-500 align-middle">{motivo || '—'}</td>
                        <td className="px-2 py-4 text-center align-middle"><button type="button" onClick={() => quitarProducto(item.producto_id)} aria-label={`Quitar ${item.nombre}`} className="rounded p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"><Trash2 size={15} /></button></td>
                      </tr>
                    );
                  })}
                  {items.length === 0 && <tr className="h-[96px]"><td colSpan="12" className="border-b border-slate-100 px-4 py-6 text-center text-xs text-slate-500">Cargá productos para preparar el conteo.</td></tr>}
                </tbody>
                <tfoot className="border-t border-slate-200 bg-white text-sm">
                  <tr className="h-9">
                    <td colSpan="9" className="px-4 text-right font-semibold text-slate-700">Cantidad total:</td>
                    <td className="px-3 text-right font-semibold text-slate-800">{numero(items.reduce((total, item) => total + (Number(item.stock_nuevo) || 0), 0))}</td>
                    <td colSpan="2" />
                  </tr>
                </tfoot>
              </table>
            </div>
            </div>
          </section>

          <div className="flex flex-col-reverse gap-2 border-t border-slate-200 bg-slate-50 px-5 py-4 sm:flex-row sm:justify-end"><button type="button" onClick={cerrarFormulario} disabled={guardando} className="rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-50">Cancelar</button><button type="submit" disabled={guardando || !items.length} className="inline-flex items-center justify-center gap-2 rounded-lg bg-orange-500 px-5 py-2.5 text-sm font-bold text-white hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-50">{guardando ? <><LoaderCircle size={16} className="animate-spin" /> Guardando…</> : <><ClipboardCheck size={16} /> Guardar ajuste</>}</button></div>
        </form>
      </div>}
    </div>
  );
}
