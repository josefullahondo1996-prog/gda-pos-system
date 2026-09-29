import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowRightLeft, Download, LoaderCircle, Package, Plus, RefreshCw, Search, Trash2, X } from 'lucide-react';
import { supabase } from './supabaseClient';
import { useEmpresaInfo } from './utils/useEmpresa';
import { useUbicacionUsuario } from './utils/useUbicacion';

const dinero = (valor) => `Gs ${Math.round(Number(valor) || 0).toLocaleString('es-PY')}`;
const numero = (valor) => (Number(valor) || 0).toLocaleString('es-PY', { maximumFractionDigits: 3 });
const fechaHora = (valor) => valor ? new Date(valor).toLocaleString('es-PY', { dateStyle: 'medium', timeStyle: 'short' }) : '—';
const descargarCSV = (nombre, filas) => {
  const csv = filas.map((fila) => fila.map((celda) => `"${String(celda ?? '').replaceAll('"', '""')}"`).join(';')).join('\r\n');
  const enlace = document.createElement('a');
  enlace.href = URL.createObjectURL(new Blob(['\ufeff', csv], { type: 'text/csv;charset=utf-8' }));
  enlace.download = `${nombre}.csv`;
  enlace.click();
  URL.revokeObjectURL(enlace.href);
};

export default function TransferenciasStock() {
  const { id: empresaId } = useEmpresaInfo();
  const { id: ubicacionUsuarioId, ve_todas: usuarioVeTodas, cargando: cargandoPermisos } = useUbicacionUsuario();
  const [ubicaciones, setUbicaciones] = useState([]);
  const [productos, setProductos] = useState([]);
  const [stock, setStock] = useState([]);
  const [transferencias, setTransferencias] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [actualizando, setActualizando] = useState(false);
  const [error, setError] = useState('');
  const [exito, setExito] = useState('');
  const [mostrarFormulario, setMostrarFormulario] = useState(false);
  const [origenId, setOrigenId] = useState('');
  const [destinoId, setDestinoId] = useState('');
  const [busqueda, setBusqueda] = useState('');
  const [items, setItems] = useState([]);
  const [notas, setNotas] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [filtro, setFiltro] = useState('');

  const cargarDatos = useCallback(async (silencioso = false) => {
    if (!empresaId) return;
    if (silencioso) setActualizando(true);
    else setCargando(true);
    setError('');
    const [respuestaSucursales, respuestaProductos, respuestaStock, respuestaTransferencias] = await Promise.all([
      supabase.from('ubicaciones_comerciales').select('id, nombre, codigo_ubicacion').eq('empresa_id', empresaId).eq('activo', true).order('nombre'),
      supabase.from('productos').select('id, nombre, codigo, stock_actual, precio_compra, activo, administra_stock').eq('empresa_id', empresaId).order('nombre').limit(3000),
      supabase.from('producto_stock_ubicacion').select('producto_id, ubicacion_id, cantidad').eq('empresa_id', empresaId).limit(20000),
      supabase.from('transferencias_stock').select('id, origen_ubicacion_id, destino_ubicacion_id, usuario_id, items, notas, created_at').eq('empresa_id', empresaId).order('created_at', { ascending: false }).limit(500),
    ]);
    const problema = respuestaSucursales.error || respuestaProductos.error || respuestaStock.error || respuestaTransferencias.error;
    if (problema) setError(`No se pudieron cargar las transferencias: ${problema.message}`);
    setUbicaciones(respuestaSucursales.data || []);
    setProductos((respuestaProductos.data || []).filter((producto) => producto.activo !== false && producto.administra_stock !== false));
    setStock(respuestaStock.data || []);
    setTransferencias(respuestaTransferencias.data || []);
    if (ubicacionUsuarioId) setOrigenId((actual) => actual || String(ubicacionUsuarioId));
    setCargando(false);
    setActualizando(false);
  }, [empresaId, ubicacionUsuarioId]);

  useEffect(() => { cargarDatos(); }, [cargarDatos]);

  const nombresUbicacion = useMemo(() => new Map(ubicaciones.map((ubicacion) => [String(ubicacion.id), ubicacion.nombre])), [ubicaciones]);
  const stocksPorProducto = useMemo(() => {
    const resultado = new Map();
    stock.forEach((fila) => resultado.set(`${fila.producto_id}:${fila.ubicacion_id}`, Number(fila.cantidad) || 0));
    return resultado;
  }, [stock]);
  const stockDisponible = (productoId) => stocksPorProducto.get(`${productoId}:${origenId}`) ?? null;
  const itemsTransferibles = useMemo(() => {
    const termino = busqueda.trim().toLocaleLowerCase('es');
    return productos.filter((producto) => {
      const disponible = stocksPorProducto.get(`${producto.id}:${origenId}`);
      const coincide = !termino || `${producto.nombre} ${producto.codigo || ''}`.toLocaleLowerCase('es').includes(termino);
      return coincide && Number(disponible) > 0 && !items.some((item) => String(item.producto_id) === String(producto.id));
    }).slice(0, 12);
  }, [productos, stocksPorProducto, origenId, items, busqueda]);
  const transferenciasVisibles = useMemo(() => {
    const termino = filtro.trim().toLocaleLowerCase('es');
    return transferencias.filter((transferencia) => {
      if (!usuarioVeTodas && ubicacionUsuarioId && ![transferencia.origen_ubicacion_id, transferencia.destino_ubicacion_id].some((id) => String(id) === String(ubicacionUsuarioId))) return false;
      if (!termino) return true;
      const nombres = `${nombresUbicacion.get(String(transferencia.origen_ubicacion_id)) || ''} ${nombresUbicacion.get(String(transferencia.destino_ubicacion_id)) || ''}`;
      const productosTexto = (transferencia.items || []).map((item) => `${item.nombre || ''} ${item.producto_id || ''}`).join(' ');
      return `${transferencia.id} ${nombres} ${productosTexto} ${transferencia.notas || ''}`.toLocaleLowerCase('es').includes(termino);
    });
  }, [transferencias, filtro, nombresUbicacion, usuarioVeTodas, ubicacionUsuarioId]);

  const agregarProducto = (producto) => {
    setItems((anteriores) => [...anteriores, {
      producto_id: String(producto.id),
      nombre: producto.nombre,
      codigo: producto.codigo || '',
      cantidad: '',
      disponible: stockDisponible(producto.id),
    }]);
    setBusqueda('');
  };
  const actualizarCantidad = (productoId, valor) => setItems((anteriores) => anteriores.map((item) => String(item.producto_id) === String(productoId) ? { ...item, cantidad: valor } : item));
  const quitarProducto = (productoId) => setItems((anteriores) => anteriores.filter((item) => String(item.producto_id) !== String(productoId)));

  const limpiarFormulario = () => {
    setItems([]);
    setNotas('');
    setDestinoId('');
    setBusqueda('');
  };

  const guardarTransferencia = async (event) => {
    event.preventDefault();
    setError('');
    setExito('');
    if (!empresaId) return setError('No se encontró la empresa de esta sesión.');
    if (!usuarioVeTodas) return setError('Solo usuarios con acceso a todas las sucursales pueden transferir existencias.');
    if (!origenId || !destinoId || String(origenId) === String(destinoId)) return setError('Seleccioná sucursales de origen y destino diferentes.');
    if (!items.length) return setError('Agregá al menos un producto.');
    const itemInvalido = items.find((item) => !Number.isFinite(Number(item.cantidad)) || Number(item.cantidad) <= 0 || Number(item.cantidad) > Number(item.disponible));
    if (itemInvalido) return setError(`Revisá la cantidad de ${itemInvalido.nombre}; hay ${numero(itemInvalido.disponible)} en origen.`);

    setGuardando(true);
    const { error: errorRPC } = await supabase.rpc('transferir_stock', {
      p_origen_ubicacion_id: origenId,
      p_destino_ubicacion_id: destinoId,
      p_items: items.map((item) => ({ producto_id: item.producto_id, cantidad: Number(item.cantidad) })),
      p_notas: notas,
    });
    setGuardando(false);
    if (errorRPC) return setError(errorRPC.message || 'No se pudo registrar la transferencia.');
    limpiarFormulario();
    setMostrarFormulario(false);
    setExito('Transferencia registrada. Las existencias de origen y destino ya están actualizadas.');
    window.dispatchEvent(new Event('stock-actualizado'));
    await cargarDatos(true);
  };

  const exportar = () => descargarCSV('transferencias-stock', [
    ['Fecha', 'Origen', 'Destino', 'Productos', 'Cantidades', 'Notas'],
    ...transferenciasVisibles.map((transferencia) => [
      fechaHora(transferencia.created_at),
      nombresUbicacion.get(String(transferencia.origen_ubicacion_id)) || transferencia.origen_ubicacion_id,
      nombresUbicacion.get(String(transferencia.destino_ubicacion_id)) || transferencia.destino_ubicacion_id,
      (transferencia.items || []).map((item) => item.nombre).join(', '),
      (transferencia.items || []).map((item) => item.cantidad).join(', '),
      transferencia.notas || '',
    ]),
  ]);

  if (cargandoPermisos || cargando) return <div className="flex min-h-64 items-center justify-center gap-2 text-sm text-slate-500"><LoaderCircle size={18} className="animate-spin" /> Cargando transferencias de stock…</div>;

  return (
    <div className="space-y-5 p-4 md:p-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="mb-1 text-xs font-bold uppercase tracking-[0.16em] text-orange-600">Inventario / movimientos</p>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Transferencias de stock</h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-500">Mové existencias entre sucursales con validación y registro atómico. El stock total de la empresa no cambia.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => cargarDatos(true)} disabled={actualizando} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"><RefreshCw size={15} className={actualizando ? 'animate-spin' : ''} /> Actualizar</button>
          <button type="button" onClick={exportar} disabled={!transferenciasVisibles.length} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"><Download size={15} /> Exportar CSV</button>
          {usuarioVeTodas && <button type="button" title={ubicaciones.length < 2 ? 'Se necesitan dos sucursales activas para transferir' : undefined} disabled={ubicaciones.length < 2} onClick={() => { setError(''); setExito(''); setMostrarFormulario(true); }} className="inline-flex items-center gap-2 rounded-lg bg-orange-500 px-4 py-2 text-sm font-bold text-white shadow-sm hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-50"><Plus size={16} /> Nueva transferencia</button>}
        </div>
      </div>

      {error && !mostrarFormulario && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
      {exito && <div role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{exito}</div>}
      {!usuarioVeTodas && <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">Tu usuario está vinculado a una sola sucursal. Podés consultar los movimientos de esa sucursal; para transferir entre ubicaciones, debe habilitarse el acceso a todas las sucursales y el permiso “Transferir stock”.</div>}

      <div className="grid gap-4 sm:grid-cols-3">
        <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Transferencias registradas</p><p className="mt-2 text-2xl font-black text-slate-900">{transferenciasVisibles.length.toLocaleString('es-PY')}</p></article>
        <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Productos movidos</p><p className="mt-2 text-2xl font-black text-slate-900">{transferenciasVisibles.reduce((total, transferencia) => total + (transferencia.items || []).length, 0).toLocaleString('es-PY')}</p></article>
        <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Sucursales activas</p><p className="mt-2 text-2xl font-black text-slate-900">{ubicaciones.length.toLocaleString('es-PY')}</p></article>
      </div>

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b border-slate-100 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div><h2 className="font-bold text-slate-900">Historial de transferencias</h2><p className="mt-0.5 text-xs text-slate-500">Últimos {transferenciasVisibles.length.toLocaleString('es-PY')} movimientos</p></div>
          <label className="relative block w-full sm:max-w-sm"><Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" /><input value={filtro} onChange={(event) => setFiltro(event.target.value)} placeholder="Buscar por sucursal o producto" className="w-full rounded-lg border border-slate-200 py-2 pl-9 pr-3 text-sm outline-none focus:border-orange-400" /></label>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[850px] text-left text-sm">
            <thead className="bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500"><tr><th className="px-4 py-3">Fecha</th><th className="px-4 py-3">Origen</th><th className="px-4 py-3"></th><th className="px-4 py-3">Destino</th><th className="px-4 py-3">Artículos</th><th className="px-4 py-3">Detalle</th><th className="px-4 py-3">Notas</th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {transferenciasVisibles.map((transferencia) => <tr key={transferencia.id} className="align-top hover:bg-slate-50/70"><td className="whitespace-nowrap px-4 py-3 text-slate-600">{fechaHora(transferencia.created_at)}</td><td className="px-4 py-3 font-semibold text-slate-800">{nombresUbicacion.get(String(transferencia.origen_ubicacion_id)) || 'Ubicación'}</td><td className="px-4 py-3 text-orange-500"><ArrowRightLeft size={17} /></td><td className="px-4 py-3 font-semibold text-slate-800">{nombresUbicacion.get(String(transferencia.destino_ubicacion_id)) || 'Ubicación'}</td><td className="px-4 py-3">{(transferencia.items || []).length}</td><td className="max-w-xs px-4 py-3 text-xs text-slate-600">{(transferencia.items || []).map((item) => `${item.nombre} × ${numero(item.cantidad)}`).join(', ') || '—'}</td><td className="max-w-[220px] px-4 py-3 text-xs text-slate-500">{transferencia.notas || '—'}</td></tr>)}
              {transferenciasVisibles.length === 0 && <tr><td colSpan="7" className="px-4 py-12 text-center"><div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-500"><Package size={19} /></div><p className="font-semibold text-slate-700">No hay transferencias para mostrar</p><p className="mt-1 text-xs text-slate-500">Los movimientos completados aparecerán aquí.</p></td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      {mostrarFormulario && <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/50 p-3 sm:p-6" onMouseDown={(event) => { if (event.target === event.currentTarget && !guardando) setMostrarFormulario(false); }}>
        <form onSubmit={guardarTransferencia} className="flex max-h-[94vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
          <div className="flex items-start justify-between border-b border-slate-100 px-5 py-4"><div><p className="text-[10px] font-black uppercase tracking-[0.15em] text-orange-600">Movimiento interno</p><h2 className="mt-1 text-xl font-black text-slate-900">Nueva transferencia</h2><p className="mt-1 text-xs text-slate-500">Las cantidades se validan y actualizan juntas; si falla una línea, se cancela todo el movimiento.</p></div><button type="button" onClick={() => { if (!guardando) { setMostrarFormulario(false); limpiarFormulario(); } }} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" aria-label="Cerrar"><X size={19} /></button></div>
          <div className="overflow-y-auto p-5">
            {error && <div role="alert" className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700">{error}</div>}
            {ubicaciones.length < 2 && <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-900">Se necesitan al menos dos sucursales activas para registrar transferencias.</div>}
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-xs font-bold text-slate-600">Sucursal de origen<select value={origenId} onChange={(event) => { setOrigenId(event.target.value); setItems([]); }} required className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm font-medium text-slate-800 outline-none focus:border-orange-400"><option value="">Seleccionar origen…</option>{ubicaciones.map((ubicacion) => <option key={ubicacion.id} value={ubicacion.id}>{ubicacion.nombre}</option>)}</select></label>
              <label className="text-xs font-bold text-slate-600">Sucursal de destino<select value={destinoId} onChange={(event) => setDestinoId(event.target.value)} required className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm font-medium text-slate-800 outline-none focus:border-orange-400"><option value="">Seleccionar destino…</option>{ubicaciones.filter((ubicacion) => String(ubicacion.id) !== String(origenId)).map((ubicacion) => <option key={ubicacion.id} value={ubicacion.id}>{ubicacion.nombre}</option>)}</select></label>
            </div>
            <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(280px,0.9fr)]">
              <div><label className="text-xs font-bold text-slate-600">Agregar productos<input value={busqueda} onChange={(event) => setBusqueda(event.target.value)} disabled={!origenId} placeholder={origenId ? 'Buscar nombre, código o SKU…' : 'Seleccioná primero la sucursal de origen'} className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-orange-400 disabled:bg-slate-50" /></label>
                {busqueda && <div className="mt-2 max-h-56 divide-y divide-slate-100 overflow-y-auto rounded-lg border border-slate-200">{itemsTransferibles.map((producto) => <button key={producto.id} type="button" onClick={() => agregarProducto(producto)} className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left hover:bg-orange-50"><span className="min-w-0"><span className="block truncate text-sm font-semibold text-slate-800">{producto.nombre}</span><span className="text-xs text-slate-500">{producto.codigo || 'Sin código'} · disponible: {numero(stocksPorProducto.get(`${producto.id}:${origenId}`))}</span></span><Plus size={16} className="shrink-0 text-orange-600" /></button>)}{itemsTransferibles.length === 0 && <p className="px-3 py-4 text-center text-xs text-slate-500">Sin productos con stock registrado en origen.</p>}</div>}
                <div className="mt-3 rounded-lg border border-slate-200">
                  <div className="flex justify-between border-b border-slate-100 bg-slate-50 px-3 py-2 text-[10px] font-bold uppercase tracking-wide text-slate-500"><span>Producto</span><span>Cantidad / disponible</span></div>
                  {items.map((item) => <div key={item.producto_id} className="flex items-center justify-between gap-3 border-b border-slate-100 px-3 py-2.5 last:border-0"><div className="min-w-0"><p className="truncate text-sm font-semibold text-slate-800">{item.nombre}</p><p className="text-[11px] text-slate-500">{item.codigo || 'Sin código'}</p></div><div className="flex shrink-0 items-center gap-2"><input aria-label={`Cantidad para ${item.nombre}`} type="number" inputMode="decimal" min="0.001" max={item.disponible} step="any" value={item.cantidad} onChange={(event) => actualizarCantidad(item.producto_id, event.target.value)} className="w-24 rounded-md border border-slate-200 px-2 py-1.5 text-right text-sm outline-none focus:border-orange-400" /><span className="text-[11px] text-slate-500">/ {numero(item.disponible)}</span><button type="button" onClick={() => quitarProducto(item.producto_id)} aria-label={`Quitar ${item.nombre}`} className="rounded p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"><Trash2 size={15} /></button></div></div>)}
                  {items.length === 0 && <p className="px-3 py-7 text-center text-xs text-slate-500">Buscá un producto con stock disponible en origen.</p>}
                </div>
              </div>
              <label className="text-xs font-bold text-slate-600">Nota interna<textarea value={notas} onChange={(event) => setNotas(event.target.value)} rows="5" maxLength="500" placeholder="Motivo o referencia del movimiento (opcional)" className="mt-1.5 w-full resize-y rounded-lg border border-slate-200 px-3 py-2.5 text-sm font-normal outline-none focus:border-orange-400" /><span className="mt-1 block text-right text-[10px] font-normal text-slate-400">{notas.length}/500</span></label>
            </div>
          </div>
          <div className="flex flex-col-reverse gap-2 border-t border-slate-100 bg-slate-50 px-5 py-4 sm:flex-row sm:justify-end"><button type="button" onClick={() => { setMostrarFormulario(false); limpiarFormulario(); }} disabled={guardando} className="rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-50">Cancelar</button><button type="submit" disabled={guardando || ubicaciones.length < 2 || !items.length} className="inline-flex items-center justify-center gap-2 rounded-lg bg-orange-500 px-5 py-2.5 text-sm font-bold text-white hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-50">{guardando ? <><LoaderCircle size={16} className="animate-spin" /> Procesando…</> : <><ArrowRightLeft size={16} /> Registrar transferencia</>}</button></div>
        </form>
      </div>}
    </div>
  );
}
