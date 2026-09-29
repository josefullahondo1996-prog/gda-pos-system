import { useEffect, useMemo, useState } from 'react';
import { AlertCircle, ClipboardList, Eye, Plus, RefreshCw, Search, X } from 'lucide-react';
import { supabase } from './supabaseClient';
import { useEmpresaInfo } from './utils/useEmpresa';

const ESTADOS = [
  { value: 'pendiente', label: 'Pendiente', color: 'bg-amber-50 text-amber-700 border-amber-200' },
  { value: 'en_preparacion', label: 'En preparación', color: 'bg-blue-50 text-blue-700 border-blue-200' },
  { value: 'completado', label: 'Completado', color: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  { value: 'cancelado', label: 'Cancelado', color: 'bg-slate-100 text-slate-600 border-slate-200' },
];

const dinero = (valor) => `Gs ${Math.round(Number(valor) || 0).toLocaleString('es-PY')}`;
const fechaHora = (valor) => valor
  ? new Date(valor).toLocaleString('es-PY', { dateStyle: 'medium', timeStyle: 'short' })
  : '—';

function BadgeEstado({ estado }) {
  const definicion = ESTADOS.find((item) => item.value === estado) || ESTADOS[0];
  return <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-bold ${definicion.color}`}>{definicion.label}</span>;
}

function ModalPedido({ onClose, onSaved }) {
  const { id: empresaId } = useEmpresaInfo();
  const [clientes, setClientes] = useState([]);
  const [productos, setProductos] = useState([]);
  const [clienteId, setClienteId] = useState('');
  const [fechaEntrega, setFechaEntrega] = useState('');
  const [nota, setNota] = useState('');
  const [busquedaProducto, setBusquedaProducto] = useState('');
  const [items, setItems] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let activo = true;
    const cargar = async () => {
      if (!empresaId) return;
      setCargando(true);
      const [respuestaClientes, respuestaProductos] = await Promise.all([
        supabase.from('clientes').select('id, nombre, nombre_empresa, celular, tipo_contacto').eq('empresa_id', empresaId).order('nombre'),
        supabase.from('productos').select('id, nombre, codigo, precio_venta, stock_actual').eq('empresa_id', empresaId).order('nombre').limit(1000),
      ]);
      if (!activo) return;
      const problema = respuestaClientes.error || respuestaProductos.error;
      if (problema) setError(`No se pudieron cargar clientes o productos: ${problema.message}`);
      setClientes((respuestaClientes.data || []).filter((cliente) => !cliente.tipo_contacto || ['Clientes', 'Ambos'].includes(cliente.tipo_contacto)));
      setProductos(respuestaProductos.data || []);
      setCargando(false);
    };
    cargar();
    return () => { activo = false; };
  }, [empresaId]);

  const cliente = clientes.find((item) => String(item.id) === String(clienteId));
  const total = items.reduce((suma, item) => suma + Number(item.cantidad) * Number(item.precio_unitario), 0);
  const productosVisibles = useMemo(() => {
    const termino = busquedaProducto.trim().toLocaleLowerCase('es');
    return productos.filter((producto) => {
      const agregado = items.some((item) => String(item.producto_id) === String(producto.id));
      const coincide = !termino || `${producto.nombre} ${producto.codigo || ''}`.toLocaleLowerCase('es').includes(termino);
      return coincide && !agregado;
    }).slice(0, 8);
  }, [productos, items, busquedaProducto]);

  const agregarProducto = (producto) => {
    setItems((anteriores) => [...anteriores, {
      producto_id: String(producto.id),
      nombre: producto.nombre,
      codigo: producto.codigo || '',
      cantidad: 1,
      precio_unitario: Number(producto.precio_venta) || 0,
      unidad: '',
    }]);
    setBusquedaProducto('');
  };

  const actualizarItem = (id, campo, valor) => {
    setItems((anteriores) => anteriores.map((item) => String(item.producto_id) === String(id)
      ? { ...item, [campo]: campo === 'cantidad' || campo === 'precio_unitario' ? Number(valor) : valor }
      : item));
  };

  const guardar = async (event) => {
    event.preventDefault();
    setError('');
    if (!empresaId) return setError('No se encontró la empresa de la sesión.');
    if (!cliente || items.length === 0) return setError('Seleccioná un cliente y agregá al menos un producto.');
    if (items.some((item) => !Number.isFinite(Number(item.cantidad)) || Number(item.cantidad) <= 0 || Number(item.precio_unitario) < 0)) {
      return setError('Revisá las cantidades y los precios del pedido.');
    }

    setGuardando(true);
    const numero = `PED-${new Date().toISOString().slice(2, 10).replaceAll('-', '')}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
    const { error: errorGuardar } = await supabase.from('pedidos').insert({
      empresa_id: empresaId,
      numero_pedido: numero,
      cliente_id: String(cliente.id),
      cliente_nombre: cliente.nombre_empresa || cliente.nombre || 'Cliente',
      cliente_telefono: cliente.celular || null,
      fecha_entrega: fechaEntrega || null,
      estado: 'pendiente',
      items: items.map((item) => ({
        producto_id: item.producto_id,
        nombre: item.nombre,
        codigo: item.codigo,
        cantidad: Number(item.cantidad),
        precio_unitario: Number(item.precio_unitario),
        subtotal: Number(item.cantidad) * Number(item.precio_unitario),
        unidad: item.unidad,
      })),
      total,
      nota: nota.trim() || null,
    });
    setGuardando(false);
    if (errorGuardar) return setError(`No se pudo guardar el pedido: ${errorGuardar.message}`);
    onSaved();
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/50 p-3 md:p-6" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <form onSubmit={guardar} className="flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <header className="flex items-start justify-between border-b border-slate-200 px-5 py-4">
          <div><p className="text-xs font-bold uppercase tracking-widest text-orange-600">Ventas</p><h2 className="mt-1 text-xl font-black text-slate-900">Nuevo pedido</h2><p className="mt-1 text-sm text-slate-500">El pedido no registra una venta ni modifica el stock.</p></div>
          <button type="button" onClick={onClose} aria-label="Cerrar" className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"><X size={20} /></button>
        </header>
        <div className="flex-1 space-y-5 overflow-y-auto p-5">
          {error && <div role="alert" className="flex gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700"><AlertCircle size={18} className="shrink-0" />{error}</div>}
          {cargando ? <p className="py-8 text-center text-sm text-slate-500">Cargando clientes y productos…</p> : (
            <>
              <div className="grid gap-4 md:grid-cols-2">
                <label className="text-sm font-bold text-slate-700">Cliente<select required value={clienteId} onChange={(event) => setClienteId(event.target.value)} className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 font-normal"><option value="">Seleccionar cliente</option>{clientes.map((item) => <option key={item.id} value={item.id}>{item.nombre_empresa || item.nombre || 'Cliente'}{item.celular ? ` · ${item.celular}` : ''}</option>)}</select></label>
                <label className="text-sm font-bold text-slate-700">Fecha estimada de entrega<input type="date" value={fechaEntrega} onChange={(event) => setFechaEntrega(event.target.value)} className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2.5 font-normal" /></label>
              </div>
              <section className="rounded-xl border border-slate-200">
                <div className="border-b border-slate-200 p-3"><label className="relative block"><Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" /><input value={busquedaProducto} onChange={(event) => setBusquedaProducto(event.target.value)} placeholder="Buscar producto por nombre o código" className="w-full rounded-lg border border-slate-200 py-2 pl-9 pr-3 text-sm outline-none focus:border-orange-400" /></label>
                  {productosVisibles.length > 0 && busquedaProducto && <div className="mt-2 divide-y divide-slate-100 rounded-lg border border-slate-200">{productosVisibles.map((producto) => <button key={producto.id} type="button" onClick={() => agregarProducto(producto)} className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left hover:bg-orange-50"><span><span className="block text-sm font-bold text-slate-800">{producto.nombre}</span><span className="text-xs text-slate-500">{producto.codigo || 'Sin código'} · stock {Number(producto.stock_actual || 0).toLocaleString('es-PY')}</span></span><span className="text-sm font-bold text-slate-700">{dinero(producto.precio_venta)} <Plus size={14} className="inline text-orange-600" /></span></button>)}</div>}
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[600px] text-left text-sm"><thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="px-3 py-2">Producto</th><th className="px-3 py-2 w-28">Cantidad</th><th className="px-3 py-2 w-36">Precio</th><th className="px-3 py-2 text-right">Subtotal</th><th className="w-10" /></tr></thead><tbody className="divide-y divide-slate-100">{items.map((item) => <tr key={item.producto_id}><td className="px-3 py-3 font-semibold text-slate-800">{item.nombre}<span className="ml-2 text-xs font-normal text-slate-400">{item.codigo}</span></td><td className="px-3 py-2"><input aria-label={`Cantidad ${item.nombre}`} type="number" min="0.001" step="any" value={item.cantidad} onChange={(event) => actualizarItem(item.producto_id, 'cantidad', event.target.value)} className="w-full rounded border border-slate-300 px-2 py-1.5" /></td><td className="px-3 py-2"><input aria-label={`Precio ${item.nombre}`} type="number" min="0" step="any" value={item.precio_unitario} onChange={(event) => actualizarItem(item.producto_id, 'precio_unitario', event.target.value)} className="w-full rounded border border-slate-300 px-2 py-1.5" /></td><td className="px-3 py-3 text-right font-bold">{dinero(Number(item.cantidad) * Number(item.precio_unitario))}</td><td className="px-2"><button type="button" aria-label={`Quitar ${item.nombre}`} onClick={() => setItems((anteriores) => anteriores.filter((fila) => fila.producto_id !== item.producto_id))} className="rounded p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"><X size={16} /></button></td></tr>)}{items.length === 0 && <tr><td colSpan="5" className="px-3 py-8 text-center text-sm text-slate-400">Buscá un producto para empezar el pedido.</td></tr>}</tbody></table>
                </div>
                <div className="flex justify-end border-t border-slate-200 bg-slate-50 px-4 py-3 text-lg font-black">Total: <span className="ml-3 text-orange-600">{dinero(total)}</span></div>
              </section>
              <label className="block text-sm font-bold text-slate-700">Nota<textarea value={nota} onChange={(event) => setNota(event.target.value)} maxLength={1000} rows={3} placeholder="Indicaciones para preparar o entregar el pedido" className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2.5 font-normal" /></label>
            </>
          )}
        </div>
        <footer className="flex justify-end gap-2 border-t border-slate-200 bg-slate-50 px-5 py-4"><button type="button" onClick={onClose} className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-slate-600">Cancelar</button><button type="submit" disabled={cargando || guardando || items.length === 0} className="rounded-lg bg-orange-500 px-5 py-2 text-sm font-bold text-white hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-50">{guardando ? 'Guardando…' : 'Crear pedido'}</button></footer>
      </form>
    </div>
  );
}

export default function Pedidos() {
  const { id: empresaId } = useEmpresaInfo();
  const [pedidos, setPedidos] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [busqueda, setBusqueda] = useState('');
  const [estado, setEstado] = useState('todos');
  const [modalAbierto, setModalAbierto] = useState(false);
  const [pedidoSeleccionado, setPedidoSeleccionado] = useState(null);
  const [guardandoId, setGuardandoId] = useState('');

  const cargar = async () => {
    if (!empresaId) return;
    setCargando(true);
    setError('');
    const { data, error: errorCarga } = await supabase.from('pedidos').select('*').eq('empresa_id', empresaId).order('creado_en', { ascending: false });
    if (errorCarga) setError(errorCarga.code === '42P01'
      ? 'Falta aplicar database/migration_pedidos.sql en el proyecto Supabase para habilitar este módulo.'
      : `No se pudieron cargar los pedidos: ${errorCarga.message}`);
    setPedidos(data || []);
    setCargando(false);
  };

  useEffect(() => { cargar(); }, [empresaId]);

  const pedidosFiltrados = useMemo(() => pedidos.filter((pedido) => {
    const texto = `${pedido.numero_pedido || ''} ${pedido.cliente_nombre || ''} ${pedido.nota || ''}`.toLocaleLowerCase('es');
    return (estado === 'todos' || pedido.estado === estado) && texto.includes(busqueda.trim().toLocaleLowerCase('es'));
  }), [pedidos, estado, busqueda]);

  const cambiarEstado = async (pedido, nuevoEstado) => {
    setGuardandoId(String(pedido.id));
    setError('');
    const { error: errorActualizar } = await supabase.from('pedidos').update({ estado: nuevoEstado, actualizado_en: new Date().toISOString() }).eq('id', pedido.id).eq('empresa_id', empresaId);
    if (errorActualizar) setError(`No se pudo actualizar el estado: ${errorActualizar.message}`);
    else {
      setPedidoSeleccionado((actual) => actual?.id === pedido.id ? { ...actual, estado: nuevoEstado } : actual);
      await cargar();
    }
    setGuardandoId('');
  };

  const exportarCSV = () => {
    const filas = [['Pedido', 'Fecha', 'Cliente', 'Teléfono', 'Entrega', 'Estado', 'Productos', 'Total', 'Nota'], ...pedidosFiltrados.map((pedido) => [
      pedido.numero_pedido, fechaHora(pedido.creado_en), pedido.cliente_nombre, pedido.cliente_telefono || '', pedido.fecha_entrega || '', pedido.estado,
      (pedido.items || []).map((item) => `${item.nombre} x${item.cantidad}`).join(' | '), pedido.total, pedido.nota || '',
    ])];
    const csv = `\uFEFF${filas.map((fila) => fila.map((celda) => `"${String(celda ?? '').replaceAll('"', '""')}"`).join(',')).join('\r\n')}`;
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const enlace = document.createElement('a');
    enlace.href = url;
    enlace.download = `pedidos-${new Date().toISOString().slice(0, 10)}.csv`;
    enlace.click();
    URL.revokeObjectURL(url);
  };

  const pendientes = pedidos.filter((pedido) => ['pendiente', 'en_preparacion'].includes(pedido.estado));
  const valorPendiente = pendientes.reduce((suma, pedido) => suma + Number(pedido.total || 0), 0);

  return (
    <div className="mx-auto w-full max-w-[1500px] space-y-5 p-4 text-slate-800 md:p-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div><p className="text-xs font-bold uppercase tracking-[0.18em] text-orange-600">Ventas / preparación</p><h1 className="mt-1 text-2xl font-black tracking-tight md:text-3xl">Pedidos</h1><p className="mt-1 text-sm text-slate-500">Organizá los pedidos de clientes antes de registrar la venta.</p></div>
        <div className="flex flex-wrap gap-2"><button type="button" onClick={cargar} className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm font-bold hover:border-orange-300"><RefreshCw size={16} />Actualizar</button><button type="button" onClick={exportarCSV} disabled={pedidosFiltrados.length === 0} className="rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm font-bold disabled:opacity-50">Exportar CSV</button><button type="button" onClick={() => setModalAbierto(true)} className="inline-flex items-center gap-2 rounded-lg bg-orange-500 px-4 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-orange-600"><Plus size={17} />Nuevo pedido</button></div>
      </header>

      {error && <div role="alert" className="flex gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800"><AlertCircle size={18} className="shrink-0" />{error}</div>}

      <section className="grid gap-3 sm:grid-cols-3">
        <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><p className="text-xs font-bold uppercase tracking-wide text-slate-500">Total de pedidos</p><p className="mt-2 text-2xl font-black">{pedidos.length}</p></article>
        <article className="rounded-xl border border-amber-200 bg-amber-50/60 p-4 shadow-sm"><p className="text-xs font-bold uppercase tracking-wide text-amber-700">Pendientes de preparación</p><p className="mt-2 text-2xl font-black text-amber-800">{pendientes.length}</p></article>
        <article className="rounded-xl border border-orange-200 bg-orange-50/60 p-4 shadow-sm"><p className="text-xs font-bold uppercase tracking-wide text-orange-700">Valor pendiente</p><p className="mt-2 text-2xl font-black text-orange-800">{dinero(valorPendiente)}</p></article>
      </section>

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center gap-3 border-b border-slate-200 p-3">
          <label className="relative min-w-[220px] flex-1"><Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" /><input value={busqueda} onChange={(event) => setBusqueda(event.target.value)} placeholder="Buscar por número, cliente o nota" className="w-full rounded-lg border border-slate-200 py-2 pl-9 pr-3 text-sm outline-none focus:border-orange-400" /></label>
          <select value={estado} onChange={(event) => setEstado(event.target.value)} aria-label="Filtrar por estado" className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"><option value="todos">Todos los estados</option>{ESTADOS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[950px] text-left text-sm"><thead className="bg-slate-50 text-[11px] font-bold uppercase tracking-wide text-slate-500"><tr><th className="px-4 py-3">N.º de pedido</th><th className="px-4 py-3">Fecha</th><th className="px-4 py-3">Cliente</th><th className="px-4 py-3">Entrega</th><th className="px-4 py-3">Artículos</th><th className="px-4 py-3 text-right">Total</th><th className="px-4 py-3">Estado</th><th className="px-4 py-3 text-right">Acciones</th></tr></thead>
            <tbody className="divide-y divide-slate-100">{cargando ? <tr><td colSpan="8" className="px-4 py-12 text-center text-slate-500">Cargando pedidos…</td></tr> : pedidosFiltrados.length === 0 ? <tr><td colSpan="8" className="px-4 py-12 text-center"><ClipboardList size={28} className="mx-auto mb-2 text-slate-300" /><p className="font-bold text-slate-600">No hay pedidos para mostrar</p><p className="mt-1 text-xs text-slate-400">Creá un pedido para comenzar a organizar la preparación.</p></td></tr> : pedidosFiltrados.map((pedido) => <tr key={pedido.id} className="hover:bg-slate-50/80"><td className="px-4 py-3 font-black text-slate-800">{pedido.numero_pedido}</td><td className="px-4 py-3 text-slate-600">{fechaHora(pedido.creado_en)}</td><td className="px-4 py-3"><span className="font-bold">{pedido.cliente_nombre}</span>{pedido.cliente_telefono && <span className="block text-xs text-slate-400">{pedido.cliente_telefono}</span>}</td><td className="px-4 py-3 text-slate-600">{pedido.fecha_entrega ? new Date(`${pedido.fecha_entrega}T12:00:00`).toLocaleDateString('es-PY') : '—'}</td><td className="px-4 py-3">{Array.isArray(pedido.items) ? pedido.items.reduce((suma, item) => suma + Number(item.cantidad || 0), 0) : 0}</td><td className="px-4 py-3 text-right font-bold">{dinero(pedido.total)}</td><td className="px-4 py-3"><BadgeEstado estado={pedido.estado} /></td><td className="px-4 py-3"><div className="flex justify-end gap-1"><button type="button" aria-label={`Ver ${pedido.numero_pedido}`} onClick={() => setPedidoSeleccionado(pedido)} className="rounded-lg p-2 text-slate-500 hover:bg-orange-50 hover:text-orange-600"><Eye size={16} /></button>{pedido.estado === 'pendiente' && <button type="button" disabled={guardandoId === String(pedido.id)} onClick={() => cambiarEstado(pedido, 'en_preparacion')} className="rounded-lg px-2 py-1 text-xs font-bold text-blue-700 hover:bg-blue-50 disabled:opacity-50">Preparar</button>}{pedido.estado === 'en_preparacion' && <button type="button" disabled={guardandoId === String(pedido.id)} onClick={() => cambiarEstado(pedido, 'completado')} className="rounded-lg px-2 py-1 text-xs font-bold text-emerald-700 hover:bg-emerald-50 disabled:opacity-50">Completar</button>}{['pendiente', 'en_preparacion'].includes(pedido.estado) && <button type="button" disabled={guardandoId === String(pedido.id)} onClick={() => cambiarEstado(pedido, 'cancelado')} className="rounded-lg px-2 py-1 text-xs font-bold text-slate-500 hover:bg-slate-100 disabled:opacity-50">Cancelar</button>}</div></td></tr>)}</tbody>
          </table>
        </div>
        <div className="border-t border-slate-100 px-4 py-3 text-xs text-slate-400">Mostrando {pedidosFiltrados.length} de {pedidos.length} pedidos</div>
      </section>

      {modalAbierto && <ModalPedido onClose={() => setModalAbierto(false)} onSaved={async () => { setModalAbierto(false); await cargar(); }} />}
      {pedidoSeleccionado && <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/50 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) setPedidoSeleccionado(null); }}><section className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl"><div className="flex justify-between"><div><h2 className="text-xl font-black">{pedidoSeleccionado.numero_pedido}</h2><p className="mt-1 text-sm text-slate-500">{pedidoSeleccionado.cliente_nombre} · {fechaHora(pedidoSeleccionado.creado_en)}</p></div><button type="button" onClick={() => setPedidoSeleccionado(null)} aria-label="Cerrar" className="rounded-lg p-2 text-slate-400 hover:bg-slate-100"><X size={20} /></button></div><div className="mt-4"><BadgeEstado estado={pedidoSeleccionado.estado} /></div><div className="mt-4 divide-y divide-slate-100 rounded-xl border border-slate-200">{(pedidoSeleccionado.items || []).map((item) => <div key={item.producto_id} className="flex justify-between gap-3 p-3 text-sm"><span>{item.nombre}<span className="ml-2 text-slate-400">× {item.cantidad}</span></span><span className="font-bold">{dinero(item.subtotal ?? Number(item.cantidad) * Number(item.precio_unitario))}</span></div>)}</div><div className="mt-3 text-right text-lg font-black">Total: {dinero(pedidoSeleccionado.total)}</div>{pedidoSeleccionado.fecha_entrega && <p className="mt-3 text-sm text-slate-600">Entrega estimada: {new Date(`${pedidoSeleccionado.fecha_entrega}T12:00:00`).toLocaleDateString('es-PY')}</p>}{pedidoSeleccionado.nota && <div className="mt-3 rounded-lg bg-slate-50 p-3 text-sm text-slate-600">{pedidoSeleccionado.nota}</div>}<div className="mt-5 flex justify-end"><button type="button" onClick={() => setPedidoSeleccionado(null)} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-bold">Cerrar</button></div></section></div>}
    </div>
  );
}
