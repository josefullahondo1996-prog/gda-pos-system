import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeft, ArrowRightLeft, Download, LoaderCircle, Package, Plus, RefreshCw, Search, Trash2 } from 'lucide-react';
import { supabase } from './supabaseClient';
import { useEmpresaInfo } from './utils/useEmpresa';
import { useUbicacionUsuario } from './utils/useUbicacion';

const dinero = (valor) => `Gs ${Math.round(Number(valor) || 0).toLocaleString('es-PY')}`;
const numero = (valor) => (Number(valor) || 0).toLocaleString('es-PY', { maximumFractionDigits: 3 });
const fechaHoy = () => {
  const hoy = new Date();
  return `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}-${String(hoy.getDate()).padStart(2, '0')}`;
};
const fechaCorta = (valor) => valor ? new Date(`${String(valor).slice(0, 10)}T12:00:00`).toLocaleDateString('es-PY') : '—';
const descargarCSV = (nombre, filas) => {
  const csv = filas.map((fila) => fila.map((celda) => `"${String(celda ?? '').replaceAll('"', '""')}"`).join(';')).join('\r\n');
  const enlace = document.createElement('a');
  enlace.href = URL.createObjectURL(new Blob(['\ufeff', csv], { type: 'text/csv;charset=utf-8' }));
  enlace.download = `${nombre}.csv`;
  enlace.click();
  URL.revokeObjectURL(enlace.href);
};

export default function TransferenciasStock() {
  const location = useLocation();
  const navigate = useNavigate();
  const esNuevo = location.pathname.endsWith('/nuevo');
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
  const [origenId, setOrigenId] = useState('');
  const [destinoId, setDestinoId] = useState('');
  const [busqueda, setBusqueda] = useState('');
  const [items, setItems] = useState([]);
  const [notas, setNotas] = useState('');
  const [fechaTransferencia, setFechaTransferencia] = useState(fechaHoy);
  const [referencia, setReferencia] = useState('');
  const [gastosEnvio, setGastosEnvio] = useState('0');
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
      supabase.from('transferencias_stock').select('id, origen_ubicacion_id, destino_ubicacion_id, usuario_id, items, notas, created_at, fecha_transferencia, referencia, estado, gastos_envio').eq('empresa_id', empresaId).order('fecha_transferencia', { ascending: false }).order('created_at', { ascending: false }).limit(500),
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
      precio_unitario: Number(producto.precio_compra) || 0,
      disponible: stockDisponible(producto.id),
    }]);
    setBusqueda('');
  };
  const actualizarCantidad = (productoId, valor) => setItems((anteriores) => anteriores.map((item) => String(item.producto_id) === String(productoId) ? { ...item, cantidad: valor } : item));
  const quitarProducto = (productoId) => setItems((anteriores) => anteriores.filter((item) => String(item.producto_id) !== String(productoId)));

  const limpiarFormulario = () => {
    setItems([]);
    setNotas('');
    setFechaTransferencia(fechaHoy());
    setReferencia('');
    setGastosEnvio('0');
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
    if (!fechaTransferencia) return setError('Ingresá la fecha de transferencia.');
    if (!Number.isFinite(Number(gastosEnvio)) || Number(gastosEnvio) < 0) return setError('Los gastos de envío deben ser un importe válido no negativo.');
    const itemInvalido = items.find((item) => !Number.isFinite(Number(item.cantidad)) || Number(item.cantidad) <= 0 || Number(item.cantidad) > Number(item.disponible));
    if (itemInvalido) return setError(`Revisá la cantidad de ${itemInvalido.nombre}; hay ${numero(itemInvalido.disponible)} en origen.`);
    const costoInvalido = items.find((item) => !Number.isFinite(Number(item.precio_unitario)) || Number(item.precio_unitario) < 0);
    if (costoInvalido) return setError(`El costo unitario de ${costoInvalido.nombre} debe ser válido y no negativo.`);

    setGuardando(true);
    try {
      const { error: errorRPC } = await supabase.rpc('transferir_stock_detallado', {
        p_origen_ubicacion_id: origenId,
        p_destino_ubicacion_id: destinoId,
        p_items: items.map((item) => ({ producto_id: item.producto_id, cantidad: Number(item.cantidad), precio_unitario: Number(item.precio_unitario) || 0 })),
        p_notas: notas,
        p_fecha_transferencia: fechaTransferencia,
        p_referencia: referencia.trim() || null,
        p_gastos_envio: Number(gastosEnvio),
      });
      if (errorRPC) return setError(errorRPC.message || 'No se pudo registrar la transferencia.');
      limpiarFormulario();
      setExito('Transferencia registrada. Las existencias de origen y destino ya están actualizadas.');
      window.dispatchEvent(new Event('stock-actualizado'));
      await cargarDatos(true);
      navigate('/transferencias-stock', { replace: true });
    } catch (errorGuardar) {
      setError(errorGuardar.message || 'No se pudo registrar la transferencia.');
    } finally {
      setGuardando(false);
    }
  };

  const exportar = () => descargarCSV('transferencias-stock', [
    ['Fecha', 'Número de referencia', 'Origen', 'Destino', 'Estado', 'Gastos de envío', 'Cantidad total', 'Productos', 'Notas'],
    ...transferenciasVisibles.map((transferencia) => [
      fechaCorta(transferencia.fecha_transferencia || transferencia.created_at),
      transferencia.referencia || transferencia.id,
      nombresUbicacion.get(String(transferencia.origen_ubicacion_id)) || transferencia.origen_ubicacion_id,
      nombresUbicacion.get(String(transferencia.destino_ubicacion_id)) || transferencia.destino_ubicacion_id,
      transferencia.estado || 'Terminado',
      dinero(transferencia.gastos_envio),
      numero((transferencia.items || []).reduce((suma, item) => suma + (Number(item.cantidad) || 0), 0)),
      (transferencia.items || []).map((item) => item.nombre).join(', '),
      transferencia.notas || '',
    ]),
  ]);

  if (cargandoPermisos || cargando) return <div className="flex min-h-64 items-center justify-center gap-2 text-sm text-slate-500"><LoaderCircle size={18} className="animate-spin" /> Cargando transferencias de stock…</div>;

  const formulario = (
    <form onSubmit={guardarTransferencia} className="space-y-5 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:p-6">
      {error && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700">{error}</div>}
      {ubicaciones.length < 2 && <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-900">Se necesitan al menos dos sucursales activas para registrar transferencias.</div>}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="text-xs font-bold text-slate-600">Fecha de transferencia<input type="date" value={fechaTransferencia} onChange={(event) => setFechaTransferencia(event.target.value)} required className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm font-medium text-slate-800 outline-none focus:border-orange-400" /></label>
        <label className="text-xs font-bold text-slate-600">Número de referencia<input value={referencia} onChange={(event) => setReferencia(event.target.value)} maxLength={100} placeholder="Opcional" className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm font-medium text-slate-800 outline-none focus:border-orange-400" /></label>
        <label className="text-xs font-bold text-slate-600">Sucursal de origen<select value={origenId} onChange={(event) => { setOrigenId(event.target.value); setItems([]); }} required className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm font-medium text-slate-800 outline-none focus:border-orange-400"><option value="">Seleccionar origen…</option>{ubicaciones.map((ubicacion) => <option key={ubicacion.id} value={ubicacion.id}>{ubicacion.nombre}</option>)}</select></label>
        <label className="text-xs font-bold text-slate-600">Sucursal de destino<select value={destinoId} onChange={(event) => setDestinoId(event.target.value)} required className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm font-medium text-slate-800 outline-none focus:border-orange-400"><option value="">Seleccionar destino…</option>{ubicaciones.filter((ubicacion) => String(ubicacion.id) !== String(origenId)).map((ubicacion) => <option key={ubicacion.id} value={ubicacion.id}>{ubicacion.nombre}</option>)}</select></label>
        <label className="text-xs font-bold text-slate-600">Estado<input value="Terminado" readOnly className="mt-1.5 w-full rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-sm font-semibold text-emerald-800" /><span className="mt-1 block text-[10px] font-normal text-slate-500">El stock de ambas sucursales se actualiza al registrar.</span></label>
        <label className="text-xs font-bold text-slate-600">Gastos de envío<input type="number" min="0" step="0.01" inputMode="decimal" value={gastosEnvio} onChange={(event) => setGastosEnvio(event.target.value)} className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm font-medium text-slate-800 outline-none focus:border-orange-400" /></label>
      </div>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(280px,0.9fr)]">
        <div>
          <label className="text-xs font-bold text-slate-600">Buscar productos<input value={busqueda} onChange={(event) => setBusqueda(event.target.value)} disabled={!origenId} placeholder={origenId ? 'Buscar nombre, código o SKU…' : 'Seleccioná primero la sucursal de origen'} className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-orange-400 disabled:bg-slate-50" /></label>
          {busqueda && <div className="mt-2 max-h-56 divide-y divide-slate-100 overflow-y-auto rounded-lg border border-slate-200">{itemsTransferibles.map((producto) => <button key={producto.id} type="button" onClick={() => agregarProducto(producto)} className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left hover:bg-orange-50"><span className="min-w-0"><span className="block truncate text-sm font-semibold text-slate-800">{producto.nombre}</span><span className="text-xs text-slate-500">{producto.codigo || 'Sin código'} · disponible: {numero(stocksPorProducto.get(`${producto.id}:${origenId}`))}</span></span><Plus size={16} className="shrink-0 text-orange-600" /></button>)}{itemsTransferibles.length === 0 && <p className="px-3 py-4 text-center text-xs text-slate-500">Sin productos con stock registrado en origen.</p>}</div>}
          <div className="mt-3 overflow-x-auto rounded-lg border border-slate-200">
            <div className="grid min-w-[560px] grid-cols-[minmax(0,1fr)_auto_auto] gap-2 border-b border-slate-100 bg-slate-50 px-3 py-2 text-[10px] font-bold uppercase tracking-wide text-slate-500"><span>Producto</span><span>Cantidad / disponible</span><span>Costo unitario</span></div>
            {items.map((item) => <div key={item.producto_id} className="grid min-w-[560px] grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-2 border-b border-slate-100 px-3 py-2.5 last:border-0"><div className="min-w-0"><p className="truncate text-sm font-semibold text-slate-800">{item.nombre}</p><p className="text-[11px] text-slate-500">{item.codigo || 'Sin código'}</p></div><div className="flex shrink-0 items-center gap-1"><input aria-label={`Cantidad para ${item.nombre}`} type="number" inputMode="decimal" min="0.001" max={item.disponible} step="any" value={item.cantidad} onChange={(event) => actualizarCantidad(item.producto_id, event.target.value)} className="w-20 rounded-md border border-slate-200 px-2 py-1.5 text-right text-sm outline-none focus:border-orange-400" /><span className="text-[10px] text-slate-500">/ {numero(item.disponible)}</span></div><div className="flex items-center gap-1"><input aria-label={`Costo unitario de ${item.nombre}`} type="number" inputMode="decimal" min="0" step="0.01" value={item.precio_unitario} onChange={(event) => setItems((anteriores) => anteriores.map((linea) => linea.producto_id === item.producto_id ? { ...linea, precio_unitario: event.target.value } : linea))} className="w-24 rounded-md border border-slate-200 px-2 py-1.5 text-right text-sm outline-none focus:border-orange-400" /><button type="button" onClick={() => quitarProducto(item.producto_id)} aria-label={`Quitar ${item.nombre}`} className="rounded p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"><Trash2 size={15} /></button></div></div>)}
            {items.length === 0 && <p className="px-3 py-7 text-center text-xs text-slate-500">Buscá un producto con stock disponible en origen.</p>}
          </div>
        </div>
        <div className="space-y-4"><label className="block text-xs font-bold text-slate-600">Notas adicionales<textarea value={notas} onChange={(event) => setNotas(event.target.value)} rows="5" maxLength="500" placeholder="Motivo o referencia del movimiento (opcional)" className="mt-1.5 w-full resize-y rounded-lg border border-slate-200 px-3 py-2.5 text-sm font-normal outline-none focus:border-orange-400" /><span className="mt-1 block text-right text-[10px] font-normal text-slate-400">{notas.length}/500</span></label><div className="rounded-lg bg-slate-50 p-3 text-sm"><div className="flex justify-between text-slate-600"><span>Cantidad total</span><strong>{numero(items.reduce((total, item) => total + (Number(item.cantidad) || 0), 0))}</strong></div><div className="mt-1 flex justify-between text-slate-600"><span>Subtotal de productos</span><strong>{dinero(items.reduce((total, item) => total + (Number(item.cantidad) || 0) * (Number(item.precio_unitario) || 0), 0))}</strong></div><div className="mt-1 flex justify-between font-bold text-slate-900"><span>Total con envío</span><strong>{dinero(items.reduce((total, item) => total + (Number(item.cantidad) || 0) * (Number(item.precio_unitario) || 0), 0) + (Number(gastosEnvio) || 0))}</strong></div></div></div>
      </div>
      <div className="flex flex-col-reverse gap-2 border-t border-slate-100 pt-4 sm:flex-row sm:justify-end"><Link to="/transferencias-stock" className="rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-center text-sm font-semibold text-slate-700 hover:bg-slate-100">Cancelar</Link><button type="submit" disabled={guardando || ubicaciones.length < 2 || !items.length || !usuarioVeTodas} className="inline-flex items-center justify-center gap-2 rounded-lg bg-orange-500 px-5 py-2.5 text-sm font-bold text-white hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-50">{guardando ? <><LoaderCircle size={16} className="animate-spin" /> Procesando…</> : <><ArrowRightLeft size={16} /> Registrar transferencia</>}</button></div>
    </form>
  );

  if (esNuevo) return (
    <div className="mx-auto max-w-7xl space-y-5 p-4 md:p-6">
      <div>
        <Link to="/transferencias-stock" className="mb-3 inline-flex items-center gap-2 text-sm font-semibold text-slate-500 hover:text-orange-600"><ArrowLeft size={16} /> Transferencias de stock</Link>
        <p className="mb-1 text-xs font-bold uppercase tracking-[0.16em] text-orange-600">Inventario / movimientos</p>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Agregar transferencia de stock</h1>
        <p className="mt-1 max-w-2xl text-sm text-slate-500">Registrá una transferencia entre sucursales. El stock de origen y destino se actualiza en el mismo movimiento.</p>
      </div>
      {formulario}
    </div>
  );

  return (
    <div className="space-y-5 p-4 md:p-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div><p className="mb-1 text-xs font-bold uppercase tracking-[0.16em] text-orange-600">Inventario / movimientos</p><h1 className="text-2xl font-bold tracking-tight text-slate-900">Transferencias de stock</h1><p className="mt-1 max-w-2xl text-sm text-slate-500">Mové existencias entre sucursales con validación y registro atómico. El stock total de la empresa no cambia.</p></div>
        <div className="flex flex-wrap gap-2"><button type="button" onClick={() => cargarDatos(true)} disabled={actualizando} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"><RefreshCw size={15} className={actualizando ? 'animate-spin' : ''} /> Actualizar</button><button type="button" onClick={exportar} disabled={!transferenciasVisibles.length} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"><Download size={15} /> Exportar CSV</button>{usuarioVeTodas && <Link to="/transferencias-stock/nuevo" className="inline-flex items-center gap-2 rounded-lg bg-orange-500 px-4 py-2 text-sm font-bold text-white shadow-sm hover:bg-orange-600"><Plus size={16} /> Agregar transferencia</Link>}</div>
      </div>
      {error && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
      {exito && <div role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{exito}</div>}
      {!usuarioVeTodas && <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">Tu usuario está vinculado a una sola sucursal. Podés consultar los movimientos de esa sucursal; para transferir entre ubicaciones, debe habilitarse el acceso a todas las sucursales y el permiso “Transferir stock”.</div>}
      <div className="grid gap-4 sm:grid-cols-3"><article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Transferencias registradas</p><p className="mt-2 text-2xl font-black text-slate-900">{transferenciasVisibles.length.toLocaleString('es-PY')}</p></article><article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Unidades transferidas</p><p className="mt-2 text-2xl font-black text-slate-900">{numero(transferenciasVisibles.reduce((total, transferencia) => total + (transferencia.items || []).reduce((suma, item) => suma + (Number(item.cantidad) || 0), 0), 0))}</p></article><article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Sucursales activas</p><p className="mt-2 text-2xl font-black text-slate-900">{ubicaciones.length.toLocaleString('es-PY')}</p></article></div>
      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm"><div className="flex flex-col gap-3 border-b border-slate-100 p-4 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="font-bold text-slate-900">Todas las transferencias de stock</h2><p className="mt-0.5 text-xs text-slate-500">Últimos {transferenciasVisibles.length.toLocaleString('es-PY')} movimientos</p></div><label className="relative block w-full sm:max-w-sm"><Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" /><input value={filtro} onChange={(event) => setFiltro(event.target.value)} placeholder="Buscar referencia, sucursal o producto" className="w-full rounded-lg border border-slate-200 py-2 pl-9 pr-3 text-sm outline-none focus:border-orange-400" /></label></div>
        <div className="overflow-x-auto"><table className="w-full min-w-[1120px] text-left text-sm"><thead className="bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500"><tr><th className="px-4 py-3">Fecha</th><th className="px-4 py-3">N.º referencia</th><th className="px-4 py-3">Desde ubicación</th><th className="px-4 py-3"></th><th className="px-4 py-3">Hasta ubicación</th><th className="px-4 py-3">Estado</th><th className="px-4 py-3">Envío</th><th className="px-4 py-3">Cantidad total</th><th className="px-4 py-3">Detalle y notas</th><th className="px-4 py-3">Acción</th></tr></thead><tbody className="divide-y divide-slate-100">{transferenciasVisibles.map((transferencia) => <tr key={transferencia.id} className="align-top hover:bg-slate-50/70"><td className="whitespace-nowrap px-4 py-3 text-slate-600">{fechaCorta(transferencia.fecha_transferencia || transferencia.created_at)}</td><td className="px-4 py-3 font-semibold text-slate-800">{transferencia.referencia || '—'}</td><td className="px-4 py-3 font-semibold text-slate-800">{nombresUbicacion.get(String(transferencia.origen_ubicacion_id)) || 'Ubicación'}</td><td className="px-4 py-3 text-orange-500"><ArrowRightLeft size={17} /></td><td className="px-4 py-3 font-semibold text-slate-800">{nombresUbicacion.get(String(transferencia.destino_ubicacion_id)) || 'Ubicación'}</td><td className="px-4 py-3"><span className="rounded-full bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700">{transferencia.estado || 'Terminado'}</span></td><td className="px-4 py-3">{dinero(transferencia.gastos_envio)}</td><td className="px-4 py-3">{numero((transferencia.items || []).reduce((suma, item) => suma + (Number(item.cantidad) || 0), 0))}</td><td className="max-w-sm px-4 py-3 text-xs text-slate-600"><span className="block">{(transferencia.items || []).map((item) => `${item.nombre} × ${numero(item.cantidad)}${Number(item.precio_unitario) ? ` · ${dinero(item.precio_unitario)}` : ''}`).join(', ') || '—'}</span>{transferencia.notas && <span className="mt-1 block text-slate-400">{transferencia.notas}</span>}</td><td className="px-4 py-3"><Link to={`/remisiones-electronicas?origen_tipo=transferencia&origen_id=${transferencia.id}`} className="whitespace-nowrap rounded border border-orange-200 px-2 py-1 text-xs font-semibold text-orange-700 hover:bg-orange-50">Emitir remisión</Link></td></tr>)}{transferenciasVisibles.length === 0 && <tr><td colSpan="10" className="px-4 py-12 text-center"><div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-500"><Package size={19} /></div><p className="font-semibold text-slate-700">No hay transferencias para mostrar</p><p className="mt-1 text-xs text-slate-500">Los movimientos completados aparecerán aquí.</p></td></tr>}</tbody></table></div>
      </section>
    </div>
  );
}
