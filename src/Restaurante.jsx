import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ChefHat, ClipboardList, Clock3, Download, ExternalLink, LayoutGrid, LoaderCircle, RefreshCw, Save, Settings2, UtensilsCrossed, X, CircleDollarSign, Pencil, Trash2, Search, CheckCircle2, Timer, Users, History as HistoryIcon, ArrowRightLeft, Truck } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { renderToStaticMarkup } from 'react-dom/server';
import { supabase } from './supabaseClient';
import { useEmpresaInfo } from './utils/useEmpresa';
import { useConfiguracionEmpresa, notificarConfiguracionEmpresaActualizada } from './utils/useConfiguracionEmpresa';
import { useNotificacion } from './NotificacionContext';
import DeliveryRestaurante from './DeliveryRestaurante';

const URL_MESA = (token) => `${window.location.origin}/catalogo-qr/${token}`;
const FECHA = (value) => new Date(value).toLocaleTimeString('es-PY', { hour: '2-digit', minute: '2-digit' });
const importe = (value) => `Gs ${Math.round(Number(value || 0)).toLocaleString('es-PY')}`;
const SECCIONES = [
  { id: 'mapa', label: 'Mapa de mesas', path: '/restaurante/mapa', icon: LayoutGrid },
  { id: 'pedidos', label: 'Pedidos en cocina', path: '/restaurante/pedidos', icon: ClipboardList },
  { id: 'delivery', label: 'Delivery', path: '/restaurante/delivery', icon: Truck },
  { id: 'cocina-pro', label: 'Cocina Pro', path: '/restaurante/cocina-pro', icon: ChefHat },
  { id: 'historial', label: 'Historial', path: '/restaurante/historial', icon: HistoryIcon },
  { id: 'configuracion', label: 'Configuración', path: '/restaurante/configuracion', icon: Settings2 },
];

function PedidoCard({ pedido, onAvanzar, onCancelar, onEditar, guardando, objetivoMinutos = 20 }) {
  const siguiente = pedido.estado === 'pendiente' ? 'en_preparacion' : 'completado';
  const [ahora, setAhora] = useState(Date.now());
  useEffect(() => { const timer = window.setInterval(() => setAhora(Date.now()), 30000); return () => window.clearInterval(timer); }, []);
  const minutos = Math.max(0, Math.floor((ahora - new Date(pedido.creado_en).getTime()) / 60000));
  const fueraObjetivo = minutos > Number(objetivoMinutos || 20);
  return <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
    <div className="flex flex-wrap items-start justify-between gap-2"><div><p className="text-xs font-bold uppercase tracking-wide text-orange-600">{pedido.mesa_nombre || 'Pedido QR'} · {pedido.numero_pedido}</p><h3 className="mt-1 text-lg font-black text-slate-900">{pedido.estado === 'pendiente' ? 'Nuevo pedido' : pedido.estado === 'completado' ? 'Listo para cobrar' : 'En preparación'}</h3></div><span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold ${fueraObjetivo ? 'bg-rose-100 text-rose-800' : 'bg-slate-100 text-slate-600'}`}><Clock3 size={13}/>{FECHA(pedido.creado_en)} · {minutos} min</span></div>
    <div className="mt-3 divide-y divide-slate-100 rounded-lg border border-slate-100">{(pedido.items || []).map((item, index) => <div key={`${pedido.id}-${index}`} className="flex justify-between gap-3 px-3 py-2 text-sm"><span><b>{item.cantidad}×</b> {item.nombre}</span><span className="text-slate-500">{importe(item.subtotal)}</span></div>)}</div>
    {pedido.nota && <p className="mt-3 rounded-lg bg-amber-50 p-2.5 text-sm text-amber-900">Nota: {pedido.nota}</p>}
    <div className="mt-3 flex items-center justify-between gap-3"><span className="font-bold text-slate-700">Total {importe(pedido.total)}</span><div className="flex flex-wrap justify-end gap-2">{onEditar && <button type="button" disabled={guardando} onClick={() => onEditar(pedido)} className="inline-flex items-center gap-1 rounded-lg border border-blue-200 px-3 py-2 text-sm font-bold text-blue-700 hover:bg-blue-50 disabled:opacity-50"><Pencil size={14}/>Corregir</button>}{onCancelar && <button disabled={guardando} onClick={() => onCancelar([pedido.id], pedido.mesa_nombre || 'pedido')} className="rounded-lg border border-rose-200 px-3 py-2 text-sm font-bold text-rose-700 hover:bg-rose-50 disabled:opacity-50">Cancelar</button>}{pedido.estado === 'completado' ? <span className="rounded-lg bg-emerald-100 px-3 py-2 text-sm font-bold text-emerald-800">Listo · espera cobro</span> : <button disabled={guardando} onClick={() => onAvanzar(pedido, siguiente)} className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-bold text-white hover:bg-slate-700 disabled:opacity-50">{guardando ? 'Guardando…' : pedido.estado === 'pendiente' ? 'Comenzar preparación' : 'Marcar listo'}</button>}</div></div>
  </article>;
}

function CuentaMesaCard({ cuenta, onCobrar, onCancelar, onEditar, guardando }) {
  const total = cuenta.pedidos.reduce((sum, pedido) => sum + Number(pedido.total || 0), 0);
  const articulos = cuenta.pedidos.reduce((sum, pedido) => sum + (Array.isArray(pedido.items) ? pedido.items.length : 0), 0);
  return <article className="rounded-xl border border-emerald-200 bg-white p-4 shadow-sm"><div className="flex flex-wrap items-start justify-between gap-2"><div><p className="text-xs font-bold uppercase tracking-wide text-emerald-700">Cuenta de mesa</p><h3 className="mt-1 text-lg font-black text-slate-900">{cuenta.mesa_nombre}</h3><p className="mt-1 text-xs text-slate-500">{cuenta.pedidos.length} comandas · {articulos} líneas</p></div><span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-800">Lista para cobrar</span></div><div className="mt-3 divide-y divide-slate-100 rounded-lg border border-slate-100">{cuenta.pedidos.map((pedido) => <div key={pedido.id} className="flex flex-wrap items-center justify-between gap-3 px-3 py-2 text-sm"><span>{pedido.numero_pedido} · {Array.isArray(pedido.items) ? pedido.items.reduce((n, item) => n + Number(item.cantidad || 0), 0) : 0} unidades · {importe(pedido.total)}</span><button type="button" disabled={guardando} onClick={() => onEditar(pedido)} className="inline-flex items-center gap-1 rounded-lg border border-blue-200 px-2.5 py-1.5 text-xs font-bold text-blue-700"><Pencil size={13}/>Corregir</button></div>)}</div><div className="mt-3 flex items-center justify-between gap-2"><span className="font-black text-slate-900">Total {importe(total)}</span><div className="flex gap-2"><button type="button" disabled={guardando} onClick={() => onCancelar(cuenta.pedidos.map((pedido) => pedido.id), cuenta.mesa_nombre)} className="rounded-lg border border-rose-200 px-3 py-2 text-sm font-bold text-rose-700 disabled:opacity-50">Cancelar cuenta</button><button type="button" disabled={guardando} onClick={() => onCobrar(cuenta)} className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-50"><CircleDollarSign size={16}/>{guardando ? 'Abriendo POS…' : 'Cobrar cuenta'}</button></div></div></article>;
}

export default function Restaurante({ section = 'mapa' }) {
  const navigate = useNavigate();
  const empresa = useEmpresaInfo();
  const empresaId = empresa?.id;
  const { ajustes } = useConfiguracionEmpresa(empresaId);
  const { notificar } = useNotificacion();
  const [mesas, setMesas] = useState([]);
  const [pedidos, setPedidos] = useState([]);
  const [pedidosCobrados, setPedidosCobrados] = useState([]);
  const [productosDisponibles, setProductosDisponibles] = useState([]);
  const [catalogos, setCatalogos] = useState([]);
  const [catalogoSeleccionado, setCatalogoSeleccionado] = useState('');
  const [mesaQr, setMesaQr] = useState(null);
  const [mesaDetalle, setMesaDetalle] = useState(null);
  const [filtroMesas, setFiltroMesas] = useState('todas');
  const [busquedaMesas, setBusquedaMesas] = useState('');
  const [minutosPreparacion, setMinutosPreparacion] = useState('20');
  const [cargando, setCargando] = useState(true);
  const [guardandoId, setGuardandoId] = useState('');
  const [guardandoConfiguracion, setGuardandoConfiguracion] = useState(false);
  const [error, setError] = useState('');
  const [cancelacion, setCancelacion] = useState(null);
  const [motivoCancelacion, setMotivoCancelacion] = useState('');
  const [cancelando, setCancelando] = useState(false);
  const [pedidoEnEdicion, setPedidoEnEdicion] = useState(null);
  const [itemsCorreccion, setItemsCorreccion] = useState([]);
  const [notaCorreccion, setNotaCorreccion] = useState('');
  const [motivoCorreccion, setMotivoCorreccion] = useState('');
  const [guardandoCorreccion, setGuardandoCorreccion] = useState(false);
  const [mesaDestinoId, setMesaDestinoId] = useState('');
  const [motivoMovimiento, setMotivoMovimiento] = useState('');
  const [moviendoMesa, setMoviendoMesa] = useState(false);
  const [historial, setHistorial] = useState({ correcciones: [], cancelaciones: [], movimientos: [] });
  const [cargandoHistorial, setCargandoHistorial] = useState(false);
  const [errorHistorial, setErrorHistorial] = useState('');

  const cargar = useCallback(async () => {
    if (!empresaId) return;
    setCargando(true); setError('');
    const [rMesas, rPedidos, rCatalogos, rCobros, rProductos] = await Promise.all([
      supabase.from('catalogos_qr_mesas').select('*').eq('empresa_id', empresaId).order('nombre'),
      supabase.from('pedidos').select('*').eq('empresa_id', empresaId).order('creado_en', { ascending: false }).limit(250),
      section === 'configuracion' ? supabase.from('catalogos_qr').select('id,nombre,estado').eq('empresa_id', empresaId).eq('estado', 'Activo').order('nombre') : Promise.resolve({ data: [], error: null }),
      supabase.from('pedidos_qr_ventas').select('pedido_id,venta_id,estado_pago').eq('empresa_id', empresaId).order('creado_en', { ascending: false }).limit(250),
      supabase.from('productos').select('id,nombre,codigo,precio_venta,stock_actual,activo').eq('empresa_id', empresaId).eq('activo', true).order('nombre').limit(1000),
    ]);
    const failure = rMesas.error || rPedidos.error || rCobros.error || rCatalogos.error || rProductos.error;
    if (failure) setError(`No se pudo cargar Restaurante. Aplicá database/migration_pedidos_qr_mesa.sql, database/migration_cobro_pedidos_qr.sql y database/migration_restaurante_cuentas_qr.sql, además de las migraciones de Pedidos y Catálogo QR. ${failure.message}`);
    setMesas(rMesas.data || []);
    setPedidos((rPedidos.data || []).filter((pedido) => pedido.origen === 'catalogo_qr_mesa'));
    setPedidosCobrados(rCobros.data || []);
    setProductosDisponibles(rProductos.data || []);
    setCatalogos(rCatalogos.data || []);
    setCatalogoSeleccionado(ajustes.restaurant_catalogo_qr_id || '');
    setMinutosPreparacion(String(ajustes.restaurant_preparation_minutes || 20));
    setCargando(false);
  }, [empresaId, section, ajustes.restaurant_catalogo_qr_id, ajustes.restaurant_preparation_minutes]);

  useEffect(() => { cargar(); }, [cargar]);
  const cargarHistorial = useCallback(async () => {
    if (!empresaId || section !== 'historial') return;
    setCargandoHistorial(true); setErrorHistorial('');
    const [rCorrecciones, rCancelaciones, rMovimientos] = await Promise.all([
      supabase.from('pedidos_qr_cambios').select('*').eq('empresa_id', empresaId).order('creado_en', { ascending: false }).limit(200),
      supabase.from('pedidos').select('id,numero_pedido,mesa_nombre,total,cancelado_en,cancelado_por,cancelado_motivo').eq('empresa_id', empresaId).eq('origen', 'catalogo_qr_mesa').eq('estado', 'cancelado').order('cancelado_en', { ascending: false }).limit(200),
      supabase.from('pedidos_qr_movimientos_mesa').select('*').eq('empresa_id', empresaId).order('creado_en', { ascending: false }).limit(200),
    ]);
    const pedidoIds = [...new Set((rCorrecciones.data || []).map((cambio) => cambio.pedido_id))];
    const usuarioIds = [...new Set([
      ...(rCorrecciones.data || []).map((item) => item.usuario_id),
      ...(rCancelaciones.data || []).map((item) => item.cancelado_por),
      ...(rMovimientos.data || []).map((item) => item.usuario_id),
    ].filter(Boolean))];
    const [rNumeros, rUsuarios] = await Promise.all([
      pedidoIds.length ? supabase.from('pedidos').select('id,numero_pedido,mesa_nombre').eq('empresa_id', empresaId).in('id', pedidoIds) : Promise.resolve({ data: [], error: null }),
      usuarioIds.length ? supabase.from('usuarios').select('auth_user_id,nombre,apellido').eq('empresa_id', empresaId).in('auth_user_id', usuarioIds) : Promise.resolve({ data: [], error: null }),
    ]);
    const failure = rCorrecciones.error || rCancelaciones.error || rMovimientos.error || rNumeros.error || rUsuarios.error;
    if (failure) setErrorHistorial(`No se pudo cargar el historial. Aplicá las migraciones de cuentas QR, edición de pedidos y movimientos de mesas. ${failure.message}`);
    const mapaPedidos = new Map((rNumeros.data || []).map((pedido) => [pedido.id, pedido]));
    const mapaUsuarios = new Map((rUsuarios.data || []).map((usuario) => [usuario.auth_user_id, [usuario.nombre, usuario.apellido].filter(Boolean).join(' ')]));
    setHistorial({
      correcciones: (rCorrecciones.data || []).map((cambio) => ({ ...cambio, pedido: mapaPedidos.get(cambio.pedido_id), usuario_nombre: mapaUsuarios.get(cambio.usuario_id) || 'Usuario' })),
      cancelaciones: (rCancelaciones.data || []).map((pedido) => ({ ...pedido, usuario_nombre: mapaUsuarios.get(pedido.cancelado_por) || 'Usuario' })),
      movimientos: (rMovimientos.data || []).map((movimiento) => ({ ...movimiento, usuario_nombre: mapaUsuarios.get(movimiento.usuario_id) || 'Usuario' })),
    });
    setCargandoHistorial(false);
  }, [empresaId, section]);
  useEffect(() => { cargarHistorial(); }, [cargarHistorial]);
  useEffect(() => {
    if (!empresaId) return undefined;
    const channel = supabase.channel(`restaurante-pedidos-${empresaId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pedidos', filter: `empresa_id=eq.${empresaId}` }, () => cargar())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pedidos_qr_ventas', filter: `empresa_id=eq.${empresaId}` }, () => cargar())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [empresaId, cargar]);

  const idsPedidosCobrados = useMemo(() => new Set(pedidosCobrados.map((item) => item.pedido_id)), [pedidosCobrados]);
  const pedidosSinCobrar = useMemo(() => pedidos.filter((pedido) => !idsPedidosCobrados.has(pedido.id) && pedido.estado !== 'cancelado'), [pedidos, idsPedidosCobrados]);
  const cuentasPorMesa = useMemo(() => {
    const resultado = new Map();
    [...pedidosSinCobrar].sort((a, b) => new Date(a.creado_en) - new Date(b.creado_en)).forEach((pedido) => {
      if (!pedido.mesa_id) return;
      if (!resultado.has(pedido.mesa_id)) resultado.set(pedido.mesa_id, { mesa_id: pedido.mesa_id, mesa_nombre: pedido.mesa_nombre || 'Mesa', pedidos: [] });
      resultado.get(pedido.mesa_id).pedidos.push(pedido);
    });
    return resultado;
  }, [pedidosSinCobrar]);
  const pedidosActivos = pedidosSinCobrar.filter((pedido) => ['pendiente', 'en_preparacion'].includes(pedido.estado)).sort((a, b) => new Date(a.creado_en) - new Date(b.creado_en));
  const pedidosListos = pedidosSinCobrar.filter((pedido) => pedido.estado === 'completado').sort((a, b) => new Date(a.creado_en) - new Date(b.creado_en));
  const pedidosListosParciales = pedidosSinCobrar.filter((pedido) => pedido.estado === 'completado'
    && cuentasPorMesa.get(pedido.mesa_id)?.pedidos.some((comanda) => comanda.estado !== 'completado'));
  const cuentasListasCobro = [...cuentasPorMesa.values()].filter((cuenta) => cuenta.pedidos.length && cuenta.pedidos.every((pedido) => pedido.estado === 'completado'));
  const resumenMesas = useMemo(() => mesas.reduce((resultado, mesa) => {
    const cuenta = cuentasPorMesa.get(mesa.id);
    if (cuenta && cuenta.pedidos.every((pedido) => pedido.estado === 'completado')) resultado.listas += 1;
    else if (cuenta) resultado.ocupadas += 1;
    else if (!mesa.activo) resultado.desactivadas += 1;
    else resultado.libres += 1;
    return resultado;
  }, { libres: 0, ocupadas: 0, listas: 0, desactivadas: 0 }), [mesas, cuentasPorMesa]);
  const mesasFiltradas = useMemo(() => mesas.filter((mesa) => {
    const cuenta = cuentasPorMesa.get(mesa.id);
    const estado = cuenta ? cuenta.pedidos.every((pedido) => pedido.estado === 'completado') ? 'listas' : 'ocupadas' : !mesa.activo ? 'desactivadas' : 'libres';
    return (filtroMesas === 'todas' || filtroMesas === estado)
      && mesa.nombre.toLocaleLowerCase('es').includes(busquedaMesas.trim().toLocaleLowerCase('es'));
  }), [mesas, cuentasPorMesa, filtroMesas, busquedaMesas]);
  const pendientes = pedidosActivos.filter((pedido) => pedido.estado === 'pendiente');
  const preparando = pedidosActivos.filter((pedido) => pedido.estado === 'en_preparacion');
  const resumenProductos = useMemo(() => {
    const acumulado = new Map();
    pedidosActivos.forEach((pedido) => (pedido.items || []).forEach((item) => {
      const actual = acumulado.get(item.nombre) || { nombre: item.nombre, cantidad: 0, comandas: 0 };
      actual.cantidad += Number(item.cantidad || 0); actual.comandas += 1; acumulado.set(item.nombre, actual);
    }));
    return [...acumulado.values()].sort((a, b) => b.cantidad - a.cantidad);
  }, [pedidosActivos]);

  const cobrarCuenta = (cuenta) => navigate('/pos', { state: { pedidoRestaurante: { ids: cuenta.pedidos.map((pedido) => pedido.id) } } });

  const abrirDetalleMesa = (mesa) => {
    setMesaDetalle(mesa); setMesaDestinoId(''); setMotivoMovimiento('');
  };

  const abrirCancelacion = (pedidoIds, mesaNombre) => {
    setCancelacion({ pedidoIds, mesaNombre });
    setMotivoCancelacion('');
  };

  const confirmarCancelacion = async (event) => {
    event.preventDefault();
    if (!cancelacion || motivoCancelacion.trim().length < 3) return;
    setCancelando(true);
    const { error: cancelError } = await supabase.rpc('cancelar_pedidos_qr_mesa', {
      p_pedido_ids: cancelacion.pedidoIds,
      p_motivo: motivoCancelacion.trim(),
    });
    setCancelando(false);
    if (cancelError) return notificar.error(`No se pudo cancelar: ${cancelError.message}`);
    const ids = new Set(cancelacion.pedidoIds);
    setPedidos((actual) => actual.map((pedido) => ids.has(pedido.id) ? { ...pedido, estado: 'cancelado' } : pedido));
    notificar.exito(cancelacion.pedidoIds.length > 1 ? 'Cuenta cancelada y mesa liberada.' : 'Pedido cancelado y mesa liberada.');
    setCancelacion(null);
  };

  const moverCombinarCuenta = async () => {
    if (!mesaDetalle || !mesaDestinoId || motivoMovimiento.trim().length < 3) return;
    setMoviendoMesa(true);
    const { data: cantidad, error: movimientoError } = await supabase.rpc('mover_combinar_pedidos_qr_mesas', {
      p_mesa_origen_id: mesaDetalle.id,
      p_mesa_destino_id: mesaDestinoId,
      p_motivo: motivoMovimiento.trim(),
    });
    setMoviendoMesa(false);
    if (movimientoError) return notificar.error(`No se pudo mover la cuenta: ${movimientoError.message}`);
    setMesaDetalle(null); setMesaDestinoId(''); setMotivoMovimiento('');
    await cargar();
    notificar.exito(`${cantidad} comanda(s) movidas. La cuenta quedó unida a la mesa destino.`);
  };

  const abrirCorreccion = (pedido) => {
    setPedidoEnEdicion(pedido);
    setItemsCorreccion((pedido.items || []).map((item) => ({ ...item, producto_id: String(item.producto_id), cantidad: Number(item.cantidad || 1) })));
    setNotaCorreccion(pedido.nota || '');
    setMotivoCorreccion('');
  };

  const actualizarCantidadCorreccion = (productoId, cantidad) => {
    setItemsCorreccion((items) => items.map((item) => item.producto_id === productoId ? { ...item, cantidad: cantidad === '' ? '' : Math.max(0, Number(cantidad) || 0) } : item));
  };

  const agregarProductoCorreccion = (productoId) => {
    const producto = productosDisponibles.find((item) => String(item.id) === productoId);
    if (!producto || itemsCorreccion.some((item) => item.producto_id === productoId)) return;
    setItemsCorreccion((items) => [...items, { producto_id: productoId, nombre: producto.nombre, codigo: producto.codigo || '', cantidad: 1, precio_unitario: Number(producto.precio_venta || 0), subtotal: Number(producto.precio_venta || 0), unidad: producto.unidad || '' }]);
  };

  const guardarCorreccion = async (event) => {
    event.preventDefault();
    if (!pedidoEnEdicion || !itemsCorreccion.length || motivoCorreccion.trim().length < 3) return;
    const items = itemsCorreccion.filter((item) => Number(item.cantidad) > 0).map((item) => ({ producto_id: item.producto_id, cantidad: Number(item.cantidad) }));
    if (!items.length) return notificar.error('El pedido debe tener al menos un producto.');
    setGuardandoCorreccion(true);
    const { data: total, error: correctionError } = await supabase.rpc('corregir_pedido_qr_mesa', {
      p_pedido_id: pedidoEnEdicion.id,
      p_items: items,
      p_nota: notaCorreccion.trim() || null,
      p_motivo: motivoCorreccion.trim(),
    });
    setGuardandoCorreccion(false);
    if (correctionError) return notificar.error(`No se pudo corregir: ${correctionError.message}`);
    const productos = new Map(productosDisponibles.map((item) => [String(item.id), item]));
    setPedidos((actuales) => actuales.map((pedido) => pedido.id === pedidoEnEdicion.id ? {
      ...pedido,
      items: items.map((item) => {
        const producto = productos.get(item.producto_id);
        const precio = Number(producto?.precio_venta || 0);
        return { producto_id: item.producto_id, nombre: producto?.nombre || item.producto_id, codigo: producto?.codigo || '', cantidad: item.cantidad, precio_unitario: precio, subtotal: Math.round(precio * item.cantidad * 100) / 100, unidad: producto?.unidad || '' };
      }),
      total: Number(total), nota: notaCorreccion.trim() || null, actualizado_en: new Date().toISOString(),
    } : pedido));
    setPedidoEnEdicion(null);
    notificar.exito('Pedido corregido. El cambio y el motivo quedaron registrados.');
  };

  const avanzarPedido = async (pedido, estado) => {
    setGuardandoId(pedido.id);
    const { error: updateError } = await supabase.from('pedidos').update({ estado, actualizado_en: new Date().toISOString() }).eq('id', pedido.id).eq('empresa_id', empresaId);
    if (updateError) notificar.error(`No se pudo actualizar el pedido: ${updateError.message}`);
    else { setPedidos((actual) => actual.map((item) => item.id === pedido.id ? { ...item, estado } : item)); notificar.exito(estado === 'en_preparacion' ? 'Pedido enviado a preparación.' : 'Pedido marcado como listo.'); }
    setGuardandoId('');
  };

  const guardarConfiguracion = async (event) => {
    event.preventDefault();
    if (!empresaId) return;
    setGuardandoConfiguracion(true);
    const { data: actual, error: readError } = await supabase.from('empresas').select('configuracion').eq('id', empresaId).maybeSingle();
    if (readError || !actual) { setGuardandoConfiguracion(false); return notificar.error(`No se pudo leer la configuración de la empresa: ${readError?.message || 'Empresa no encontrada'}`); }
    const configuracion = actual.configuracion && typeof actual.configuracion === 'object' ? actual.configuracion : {};
    const ajustesActualizados = { ...(configuracion.ajustes || {}), restaurant_catalogo_qr_id: catalogoSeleccionado || null, restaurant_preparation_minutes: Math.max(1, Math.min(240, Number(minutosPreparacion) || 20)) };
    const { error: saveError } = await supabase.from('empresas').update({ configuracion: { ...configuracion, version: 1, ajustes: ajustesActualizados } }).eq('id', empresaId);
    setGuardandoConfiguracion(false);
    if (saveError) return notificar.error(`No se pudo guardar: ${saveError.message}`);
    notificarConfiguracionEmpresaActualizada(empresaId); notificar.exito('Configuración de restaurante guardada.');
  };

  const copiarEnlaceMesa = async () => {
    try { await navigator.clipboard.writeText(URL_MESA(mesaQr.public_token)); notificar.exito('Enlace de la mesa copiado.'); }
    catch { notificar.error('No se pudo copiar el enlace desde este navegador.'); }
  };

  const descargarCodigoMesa = () => {
    const svg = renderToStaticMarkup(<QRCodeSVG value={URL_MESA(mesaQr.public_token)} size={900} level="H" includeMargin />);
    const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `qr-${String(mesaQr.nombre).toLowerCase().replace(/[^a-z0-9]+/g, '-')}.svg`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const activeTab = SECCIONES.find((item) => item.id === section) || SECCIONES[0];
  return <div className="mx-auto w-full max-w-7xl space-y-5 p-4 md:p-6">
    <header className="rounded-2xl bg-gradient-to-r from-slate-950 via-slate-900 to-orange-950 p-5 text-white shadow-lg md:p-7"><div className="flex items-center gap-3"><span className="grid h-11 w-11 place-items-center rounded-xl bg-white/10"><UtensilsCrossed size={22}/></span><div><p className="text-xs font-bold uppercase tracking-[.18em] text-orange-300">Operación gastronómica</p><h1 className="text-2xl font-black">Restaurante · {activeTab.label}</h1></div></div><p className="mt-3 max-w-3xl text-sm text-slate-300">Administrá mesas, recibí pedidos QR y coordiná la preparación desde una pantalla compartida.</p></header>
    <nav className="grid grid-cols-2 gap-2 rounded-xl border border-slate-200 bg-white p-2 shadow-sm md:grid-cols-3 xl:grid-cols-6">{SECCIONES.map(({ id, label, path, icon: Icon }) => <Link key={id} to={path} className={`flex items-center justify-center gap-2 rounded-lg px-3 py-3 text-sm font-bold transition ${section === id ? 'bg-orange-500 text-white shadow-sm' : 'text-slate-600 hover:bg-orange-50 hover:text-orange-700'}`}><Icon size={17}/>{label}</Link>)}</nav>
    {error && <div role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">{error}</div>}

    {section === 'delivery' ? <DeliveryRestaurante /> : section === 'historial' ? (
      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-lg font-black text-slate-900">Historial de mesas y comandas</h2><p className="text-sm text-slate-500">Cambios, cancelaciones y cuentas trasladadas dentro de tu empresa.</p></div><button type="button" onClick={cargarHistorial} disabled={cargandoHistorial} className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-bold"><RefreshCw size={15} className={cargandoHistorial?'animate-spin':''}/>Actualizar historial</button></div>
        {errorHistorial && <div role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">{errorHistorial}</div>}
        {cargandoHistorial ? <div className="rounded-xl bg-white p-12 text-center text-slate-500"><LoaderCircle className="mx-auto animate-spin"/></div> : <div className="grid gap-4 xl:grid-cols-3">
          <section className="rounded-xl border border-blue-200 bg-white p-4"><h3 className="mb-3 flex items-center gap-2 font-black text-blue-900"><Pencil size={16}/>Correcciones ({historial.correcciones.length})</h3><div className="max-h-[65vh] space-y-3 overflow-y-auto">{historial.correcciones.map((cambio)=><article key={cambio.id} className="rounded-lg border border-slate-200 p-3"><p className="text-xs font-bold text-slate-500">{cambio.pedido?.mesa_nombre || 'Mesa'} · {cambio.pedido?.numero_pedido || String(cambio.pedido_id).slice(0,8)} · {new Date(cambio.creado_en).toLocaleString('es-PY')} · por {cambio.usuario_nombre}</p><p className="mt-1 text-sm font-bold text-slate-800">{importe(cambio.total_anterior)} → {importe(cambio.total_nuevo)}</p><p className="mt-1 text-xs text-slate-600">Antes: {(cambio.items_anteriores||[]).map((item)=>`${item.cantidad}× ${item.nombre}`).join(', ')}</p><p className="text-xs text-slate-600">Ahora: {(cambio.items_nuevos||[]).map((item)=>`${item.cantidad}× ${item.nombre}`).join(', ')}</p><p className="mt-2 rounded bg-blue-50 p-2 text-xs text-blue-900">Motivo: {cambio.motivo}</p></article>)}{!historial.correcciones.length&&<p className="py-6 text-center text-sm text-slate-400">Sin correcciones registradas.</p>}</div></section>
          <section className="rounded-xl border border-rose-200 bg-white p-4"><h3 className="mb-3 flex items-center gap-2 font-black text-rose-900"><X size={17}/>Cancelaciones ({historial.cancelaciones.length})</h3><div className="max-h-[65vh] space-y-3 overflow-y-auto">{historial.cancelaciones.map((pedido)=><article key={pedido.id} className="rounded-lg border border-slate-200 p-3"><p className="text-xs font-bold text-slate-500">{pedido.mesa_nombre || 'Mesa'} · {pedido.numero_pedido} · {pedido.cancelado_en?new Date(pedido.cancelado_en).toLocaleString('es-PY'):'Fecha no disponible'} · por {pedido.usuario_nombre}</p><p className="mt-1 font-bold text-slate-800">{importe(pedido.total)}</p><p className="mt-2 rounded bg-rose-50 p-2 text-xs text-rose-900">Motivo: {pedido.cancelado_motivo || 'No especificado'}</p></article>)}{!historial.cancelaciones.length&&<p className="py-6 text-center text-sm text-slate-400">Sin cancelaciones registradas.</p>}</div></section>
          <section className="rounded-xl border border-orange-200 bg-white p-4"><h3 className="mb-3 flex items-center gap-2 font-black text-orange-900"><ArrowRightLeft size={17}/>Movimientos de mesa ({historial.movimientos.length})</h3><div className="max-h-[65vh] space-y-3 overflow-y-auto">{historial.movimientos.map((movimiento)=><article key={movimiento.id} className="rounded-lg border border-slate-200 p-3"><p className="text-xs font-bold text-slate-500">{new Date(movimiento.creado_en).toLocaleString('es-PY')} · por {movimiento.usuario_nombre}</p><p className="mt-1 font-bold text-slate-800">{movimiento.mesa_origen_nombre} <ArrowRightLeft size={13} className="inline"/> {movimiento.mesa_destino_nombre}</p><p className="text-xs text-slate-600">{movimiento.cantidad_pedidos} comanda(s) trasladadas</p><p className="mt-2 rounded bg-orange-50 p-2 text-xs text-orange-900">Motivo: {movimiento.motivo}</p></article>)}{!historial.movimientos.length&&<p className="py-6 text-center text-sm text-slate-400">Sin movimientos de mesa.</p>}</div></section>
        </div>}
      </section>
    ) : section === 'configuracion' ? (
      <form onSubmit={guardarConfiguracion} className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div><h2 className="text-lg font-black">Configuración del restaurante</h2><p className="mt-1 text-sm text-slate-500">Elegí el catálogo que verán tus clientes al escanear las mesas y el tiempo objetivo de preparación.</p></div>
        <label className="block text-sm font-bold text-slate-700">Catálogo QR para las mesas<select value={catalogoSeleccionado} onChange={(event) => setCatalogoSeleccionado(event.target.value)} className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5"><option value="">Seleccionar catálogo activo</option>{catalogos.map((catalogo) => <option key={catalogo.id} value={catalogo.id}>{catalogo.nombre}</option>)}</select></label>
        <label className="block max-w-xs text-sm font-bold text-slate-700">Objetivo de preparación (minutos)<input type="number" min="1" max="240" value={minutosPreparacion} onChange={(event) => setMinutosPreparacion(event.target.value)} className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2.5"/></label>
        <div className="flex flex-wrap gap-2"><button type="submit" disabled={guardandoConfiguracion} className="inline-flex items-center gap-2 rounded-lg bg-orange-500 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50">{guardandoConfiguracion ? <LoaderCircle size={16} className="animate-spin"/> : <Save size={16}/>}Guardar configuración</button><Link to="/catalogo-qr" className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-bold text-slate-700"><Settings2 size={16}/>Administrar catálogo y QR</Link></div>
        <p className="text-xs text-slate-500">Las mesas se crean, imprimen o desactivan desde el botón de mesas del catálogo QR.</p>
      </form>
    ) : section === 'mapa' ? (
      <>
        <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-lg font-black text-slate-900">Estado de las mesas</h2><p className="text-sm text-slate-500">Una mesa queda ocupada hasta cobrar o cancelar todos sus pedidos abiertos.</p></div><button onClick={cargar} className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-bold"><RefreshCw size={15}/>Actualizar</button></div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">{[['libres','Libres','border-emerald-200 bg-emerald-50 text-emerald-800'],['ocupadas','En cocina','border-orange-200 bg-orange-50 text-orange-800'],['listas','Listas para cobrar','border-blue-200 bg-blue-50 text-blue-800'],['desactivadas','Desactivadas','border-slate-200 bg-slate-100 text-slate-600']].map(([id,label,style])=><button key={id} type="button" onClick={()=>setFiltroMesas(filtroMesas===id?'todas':id)} className={`rounded-xl border p-3 text-left transition ${style} ${filtroMesas===id?'ring-2 ring-slate-800':''}`}><p className="text-xs font-bold uppercase">{label}</p><p className="mt-1 text-2xl font-black">{resumenMesas[id]}</p></button>)}</div>
        <div className="flex flex-col gap-2 sm:flex-row"><label className="relative flex-1"><Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"/><input value={busquedaMesas} onChange={(event)=>setBusquedaMesas(event.target.value)} placeholder="Buscar mesa…" className="w-full rounded-lg border border-slate-300 bg-white py-2.5 pl-9 pr-3 text-sm"/></label><select value={filtroMesas} onChange={(event)=>setFiltroMesas(event.target.value)} className="rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm font-semibold"><option value="todas">Todas las mesas</option><option value="libres">Libres</option><option value="ocupadas">En cocina</option><option value="listas">Listas para cobrar</option><option value="desactivadas">Desactivadas</option></select></div>
        {cargando ? <div className="rounded-xl bg-white p-12 text-center text-slate-500"><LoaderCircle className="mx-auto animate-spin"/></div> : mesas.length ? mesasFiltradas.length ? <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">{mesasFiltradas.map((mesa) => { const cuenta = cuentasPorMesa.get(mesa.id); const lista = cuenta?.pedidos.length > 0 && cuenta.pedidos.every((pedido) => pedido.estado === 'completado'); const total = cuenta?.pedidos.reduce((sum, pedido) => sum + Number(pedido.total || 0), 0) || 0; const enCocina = cuenta?.pedidos.filter((pedido) => pedido.estado !== 'completado').length || 0; const estado = !mesa.activo && cuenta ? 'Desactivada · con cuenta' : !mesa.activo ? 'Desactivada' : cuenta ? lista ? 'Lista para cobrar' : 'En cocina' : 'Libre'; const estadoStyle = !mesa.activo && !cuenta ? 'bg-slate-200 text-slate-600' : lista ? 'bg-blue-100 text-blue-800' : cuenta ? 'bg-orange-100 text-orange-800' : 'bg-emerald-100 text-emerald-800'; const masAntiguo = cuenta ? Math.max(0, Math.floor((Date.now() - Math.min(...cuenta.pedidos.map((pedido) => new Date(pedido.creado_en).getTime()))) / 60000)) : 0; return <article key={mesa.id} className={`rounded-2xl border p-4 shadow-sm ${!mesa.activo && !cuenta ? 'border-slate-200 bg-slate-100' : lista ? 'border-blue-200 bg-blue-50/50' : cuenta ? 'border-orange-200 bg-orange-50' : 'border-emerald-200 bg-white'}`}><div className="flex items-start justify-between gap-2"><div><span className={`rounded-full px-2 py-1 text-[11px] font-black uppercase ${estadoStyle}`}>{estado}</span><h3 className="mt-2 text-xl font-black text-slate-900">{mesa.nombre}</h3></div><span className="grid h-10 w-10 place-items-center rounded-xl bg-white/80 text-slate-500"><Users size={19}/></span></div>{cuenta ? <><div className="mt-4 flex items-center justify-between text-sm"><span className="text-slate-600">{cuenta.pedidos.length} {cuenta.pedidos.length===1?'comanda':'comandas'}</span><span className="font-black text-slate-900">{importe(total)}</span></div><div className="mt-2 flex items-center gap-2 text-xs text-slate-600"><Timer size={14}/>{masAntiguo} min desde el primer pedido{enCocina>0&&<span className="ml-auto font-bold text-orange-700">{enCocina} en cocina</span>}</div></> : <p className="mt-4 text-sm text-slate-500">Sin pedidos abiertos</p>}<div className="mt-4 grid grid-cols-2 gap-2"><button type="button" onClick={()=>setMesaQr(mesa)} className="inline-flex items-center justify-center gap-1 rounded-lg border border-slate-300 bg-white px-2 py-2 text-xs font-bold text-slate-700"><UtensilsCrossed size={14}/>Código QR</button><button type="button" onClick={()=>abrirDetalleMesa(mesa)} className="rounded-lg bg-slate-900 px-2 py-2 text-xs font-bold text-white">Ver mesa</button>{cuenta&&lista&&<button type="button" onClick={()=>cobrarCuenta(cuenta)} className="col-span-2 inline-flex items-center justify-center gap-1 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-bold text-white"><CircleDollarSign size={15}/>Cobrar {importe(total)}</button>}</div></article>;})}</div> : <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">No hay mesas que coincidan con la búsqueda y el filtro seleccionados.</div> : !error && <div className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center"><LayoutGrid className="mx-auto text-slate-300" size={34}/><p className="mt-3 font-bold">Aún no hay mesas configuradas</p><p className="mt-1 text-sm text-slate-500">Creá el catálogo QR y agregá mesas para generar sus códigos.</p><Link to="/catalogo-qr" className="mt-4 inline-flex rounded-lg bg-orange-500 px-4 py-2 text-sm font-bold text-white">Configurar mesas QR</Link></div>}
      </>
    ) : section === 'pedidos' ? (
      <>
        <div className="grid gap-3 sm:grid-cols-3"><div className="rounded-xl border bg-white p-4"><p className="text-xs font-bold uppercase text-slate-500">Pedidos activos</p><p className="mt-1 text-2xl font-black">{pedidosActivos.length}</p></div><div className="rounded-xl border border-amber-200 bg-amber-50 p-4"><p className="text-xs font-bold uppercase text-amber-700">Nuevos</p><p className="mt-1 text-2xl font-black text-amber-900">{pendientes.length}</p></div><div className="rounded-xl border border-blue-200 bg-blue-50 p-4"><p className="text-xs font-bold uppercase text-blue-700">Preparando</p><p className="mt-1 text-2xl font-black text-blue-900">{preparando.length}</p></div></div>
        {cargando ? <p className="rounded-xl bg-white p-10 text-center text-slate-500">Cargando pedidos…</p> : pedidosActivos.length ? <div className="grid gap-4 lg:grid-cols-2">{pedidosActivos.map((pedido) => <PedidoCard key={pedido.id} pedido={pedido} onAvanzar={avanzarPedido} onCancelar={abrirCancelacion} onEditar={abrirCorreccion} guardando={guardandoId === pedido.id} objetivoMinutos={ajustes.restaurant_preparation_minutes}/>)}</div> : <div className="rounded-xl border border-dashed bg-white p-10 text-center text-slate-500"><ClipboardList className="mx-auto text-slate-300" size={32}/><p className="mt-3 font-bold">No hay pedidos pendientes de cocina</p><p className="text-sm">Los nuevos pedidos de las mesas aparecerán aquí automáticamente.</p></div>}
        {pedidosListosParciales.length > 0 && <section className="space-y-3"><h2 className="text-sm font-black uppercase tracking-wide text-slate-600">Comandas listas · esperando a que termine la mesa ({pedidosListosParciales.length})</h2><div className="grid gap-4 lg:grid-cols-2">{pedidosListosParciales.map((pedido) => <PedidoCard key={pedido.id} pedido={pedido} onAvanzar={avanzarPedido} onCancelar={abrirCancelacion} onEditar={abrirCorreccion} guardando={guardandoId === pedido.id} objetivoMinutos={ajustes.restaurant_preparation_minutes}/>)}</div></section>}
        {cuentasListasCobro.length > 0 && <section className="space-y-3"><h2 className="flex items-center gap-2 text-sm font-black uppercase tracking-wide text-emerald-800"><CircleDollarSign size={17}/>Cuentas listas para cobrar ({cuentasListasCobro.length})</h2><div className="grid gap-4 lg:grid-cols-2">{cuentasListasCobro.map((cuenta) => <CuentaMesaCard key={cuenta.mesa_id} cuenta={cuenta} onCobrar={cobrarCuenta} onCancelar={abrirCancelacion} onEditar={abrirCorreccion} guardando={cancelando}/>)}</div></section>}
      </>
    ) : (
      <>
        <div className="flex flex-wrap items-end justify-between gap-3"><div><h2 className="text-lg font-black">Cocina Pro</h2><p className="text-sm text-slate-500">Cola ordenada por antigüedad. Los pedidos QR se actualizan en tiempo real.</p></div><span className="rounded-full bg-orange-50 px-3 py-1.5 text-xs font-bold text-orange-800">Objetivo {ajustes.restaurant_preparation_minutes || 20} min</span></div>
        {cargando ? <p className="rounded-xl bg-white p-10 text-center text-slate-500">Cargando cocina…</p> : <div className="space-y-4">
          {resumenProductos.length > 0 && <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><h3 className="mb-3 text-sm font-black uppercase tracking-wide text-slate-600">Carga activa por producto</h3><div className="flex gap-2 overflow-x-auto pb-1">{resumenProductos.map((item) => <div key={item.nombre} className="min-w-36 rounded-lg bg-slate-50 px-3 py-2"><p className="truncate text-xs text-slate-500">{item.nombre}</p><p className="mt-1 text-lg font-black text-slate-900">{item.cantidad} <span className="text-xs font-semibold">unid.</span></p><p className="text-[10px] text-slate-400">{item.comandas} líneas activas</p></div>)}</div></section>}
          <div className="grid gap-4 xl:grid-cols-3"><section className="rounded-xl border border-amber-200 bg-amber-50/60 p-3"><h3 className="mb-3 flex items-center gap-2 font-black text-amber-900"><ClipboardList size={17}/>Entrantes ({pendientes.length})</h3><div className="space-y-3">{pendientes.map((pedido) => <PedidoCard key={pedido.id} pedido={pedido} onAvanzar={avanzarPedido} onCancelar={abrirCancelacion} onEditar={abrirCorreccion} guardando={guardandoId === pedido.id} objetivoMinutos={ajustes.restaurant_preparation_minutes}/>)}</div>{!pendientes.length && <p className="p-6 text-center text-sm text-amber-800">Sin pedidos nuevos</p>}</section><section className="rounded-xl border border-blue-200 bg-blue-50/60 p-3"><h3 className="mb-3 flex items-center gap-2 font-black text-blue-900"><ChefHat size={17}/>En preparación ({preparando.length})</h3><div className="space-y-3">{preparando.map((pedido) => <PedidoCard key={pedido.id} pedido={pedido} onAvanzar={avanzarPedido} onCancelar={abrirCancelacion} onEditar={abrirCorreccion} guardando={guardandoId === pedido.id} objetivoMinutos={ajustes.restaurant_preparation_minutes}/>)}</div>{!preparando.length && <p className="p-6 text-center text-sm text-blue-800">Nada en preparación</p>}</section><section className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-3"><h3 className="mb-3 flex items-center gap-2 font-black text-emerald-900"><CheckCircle2 size={17}/>Listos ({pedidosListos.length})</h3><div className="space-y-3">{pedidosListos.map((pedido) => <PedidoCard key={pedido.id} pedido={pedido} onAvanzar={avanzarPedido} onCancelar={abrirCancelacion} onEditar={abrirCorreccion} guardando={guardandoId === pedido.id} objetivoMinutos={ajustes.restaurant_preparation_minutes}/>)}</div>{!pedidosListos.length && <p className="p-6 text-center text-sm text-emerald-800">Sin comandas listas</p>}</section></div>
        </div>}
      </>
    )}
    {mesaDetalle && (() => { const cuenta = cuentasPorMesa.get(mesaDetalle.id); const lista = cuenta?.pedidos.length > 0 && cuenta.pedidos.every((pedido) => pedido.estado === 'completado'); const total = cuenta?.pedidos.reduce((sum, pedido) => sum + Number(pedido.total || 0), 0) || 0; return <div className="fixed inset-0 z-[105] grid place-items-center bg-slate-950/60 p-4" role="presentation" onMouseDown={(event)=>{if(event.target===event.currentTarget)setMesaDetalle(null);}}><section role="dialog" aria-modal="true" aria-labelledby="detalle-mesa-titulo" className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl"><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-widest text-orange-600">Control de mesa</p><h2 id="detalle-mesa-titulo" className="mt-1 text-2xl font-black text-slate-900">{mesaDetalle.nombre}</h2><p className="mt-1 text-sm text-slate-500">{!mesaDetalle.activo?'Mesa desactivada':!cuenta?'Disponible':lista?'Cuenta lista para cobrar':'Pedido en cocina'}</p></div><button type="button" aria-label="Cerrar detalle de mesa" onClick={()=>setMesaDetalle(null)} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"><X size={20}/></button></div>
      {cuenta ? <><div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-slate-50 p-4"><div><p className="text-xs font-bold uppercase text-slate-500">Cuenta abierta</p><p className="mt-1 text-2xl font-black text-slate-900">{importe(total)}</p></div><div className="text-right text-sm text-slate-600"><p>{cuenta.pedidos.length} comandas</p><p>{cuenta.pedidos.filter((pedido)=>pedido.estado==='completado').length} listas · {cuenta.pedidos.filter((pedido)=>pedido.estado!=='completado').length} en cocina</p></div></div><div className="mt-4 space-y-3">{cuenta.pedidos.map((pedido)=> <article key={pedido.id} className="rounded-xl border border-slate-200 p-4"><div className="flex flex-wrap items-start justify-between gap-2"><div><p className="text-xs font-bold text-slate-500">{pedido.numero_pedido} · {FECHA(pedido.creado_en)}</p><p className="mt-1 font-black text-slate-900">{pedido.estado==='completado'?'Lista para cobrar':pedido.estado==='en_preparacion'?'En preparación':'Nueva'}</p></div><span className="font-black">{importe(pedido.total)}</span></div><div className="mt-2 flex flex-wrap gap-2 text-xs text-slate-600">{(pedido.items||[]).map((item,index)=><span key={`${pedido.id}-mesa-item-${index}`} className="rounded-full bg-slate-100 px-2.5 py-1">{item.cantidad}× {item.nombre}</span>)}</div>{pedido.nota&&<p className="mt-2 rounded-lg bg-amber-50 p-2 text-sm text-amber-900">Nota: {pedido.nota}</p>}<div className="mt-3 flex flex-wrap gap-2"><button type="button" onClick={()=>{setMesaDetalle(null);abrirCorreccion(pedido);}} className="inline-flex items-center gap-1 rounded-lg border border-blue-200 px-3 py-2 text-xs font-bold text-blue-700"><Pencil size={13}/>Corregir</button></div></article>)}</div></> : <div className="mt-5 rounded-xl border border-dashed border-emerald-200 bg-emerald-50 p-6 text-center"><CheckCircle2 className="mx-auto text-emerald-600"/><p className="mt-2 font-bold text-emerald-900">No hay pedidos abiertos</p><p className="mt-1 text-sm text-emerald-800">Esta mesa está disponible para recibir un nuevo pedido QR.</p></div>}
      {cuenta && mesaDetalle.activo && <form onSubmit={(event)=>{event.preventDefault();moverCombinarCuenta();}} className="mt-4 space-y-3 rounded-xl border border-orange-200 bg-orange-50/60 p-4"><div><h3 className="flex items-center gap-2 font-black text-orange-950"><ArrowRightLeft size={16}/>Mover y combinar cuenta</h3><p className="mt-1 text-xs text-orange-900">Traslada todas las comandas abiertas a otra mesa del mismo catálogo. Si ya tiene pedidos, se unirán en su cuenta.</p></div><label className="block text-sm font-bold text-slate-700">Mesa destino<select required value={mesaDestinoId} onChange={(event)=>setMesaDestinoId(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5"><option value="">Seleccionar mesa disponible</option>{mesas.filter((mesa)=>mesa.activo&&mesa.id!==mesaDetalle.id&&mesa.catalogo_id===mesaDetalle.catalogo_id).map((mesa)=><option key={mesa.id} value={mesa.id}>{mesa.nombre}{cuentasPorMesa.has(mesa.id)?' · combinar con cuenta abierta':''}</option>)}</select></label><label className="block text-sm font-bold text-slate-700">Motivo<textarea required minLength={3} maxLength={500} value={motivoMovimiento} onChange={(event)=>setMotivoMovimiento(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 bg-white p-3 font-normal" placeholder="Ej.: el grupo se cambió a una mesa más grande"/></label><button type="submit" disabled={moviendoMesa||!mesaDestinoId||motivoMovimiento.trim().length<3} className="inline-flex items-center gap-2 rounded-lg bg-orange-600 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50">{moviendoMesa?<LoaderCircle size={16} className="animate-spin"/>:<ArrowRightLeft size={16}/>}Mover y combinar</button></form>}
      <div className="mt-5 flex flex-wrap justify-end gap-2"><button type="button" onClick={()=>{setMesaDetalle(null);setMesaQr(mesaDetalle);}} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-bold text-slate-700">Ver QR</button>{cuenta&&<><button type="button" onClick={()=>{setMesaDetalle(null);navigate('/restaurante/pedidos');}} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-bold text-slate-700">Abrir cocina</button><button type="button" onClick={()=>{setMesaDetalle(null);abrirCancelacion(cuenta.pedidos.map((pedido)=>pedido.id),mesaDetalle.nombre);}} className="rounded-lg border border-rose-200 px-3 py-2 text-sm font-bold text-rose-700">Cancelar cuenta</button>{lista&&<button type="button" onClick={()=>cobrarCuenta(cuenta)} className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-bold text-white"><CircleDollarSign size={15}/>Cobrar cuenta</button>}</>}<button type="button" onClick={()=>setMesaDetalle(null)} className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-bold text-white">Cerrar</button></div>
    </section></div>;})()}
    {cancelacion && <div className="fixed inset-0 z-[110] grid place-items-center bg-slate-950/60 p-4"><form onSubmit={confirmarCancelacion} role="dialog" aria-modal="true" aria-labelledby="cancelar-pedido-titulo" className="w-full max-w-md space-y-4 rounded-2xl bg-white p-5 shadow-2xl"><div className="flex items-start justify-between gap-3"><div><h2 id="cancelar-pedido-titulo" className="text-lg font-black text-slate-900">Cancelar {cancelacion.pedidoIds.length > 1 ? 'cuenta' : 'pedido'} · {cancelacion.mesaNombre}</h2><p className="mt-1 text-sm text-slate-500">El stock no se descontó al recibir el pedido QR. La cancelación queda registrada con tu motivo.</p></div><button type="button" onClick={() => setCancelacion(null)} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" aria-label="Cerrar">×</button></div><label className="block text-sm font-bold text-slate-700">Motivo de cancelación<textarea autoFocus required minLength={3} maxLength={500} value={motivoCancelacion} onChange={(event) => setMotivoCancelacion(event.target.value)} className="mt-1.5 min-h-24 w-full rounded-lg border border-slate-300 p-3 font-normal" placeholder="Ej.: el cliente cambió el pedido"/></label><div className="flex justify-end gap-2"><button type="button" onClick={() => setCancelacion(null)} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-bold text-slate-700">Volver</button><button type="submit" disabled={cancelando || motivoCancelacion.trim().length < 3} className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">{cancelando ? 'Cancelando…' : 'Confirmar cancelación'}</button></div></form></div>}
    {pedidoEnEdicion && <div className="fixed inset-0 z-[110] grid place-items-center overflow-y-auto bg-slate-950/60 p-4"><form onSubmit={guardarCorreccion} role="dialog" aria-modal="true" aria-labelledby="corregir-pedido-titulo" className="my-auto max-h-[92vh] w-full max-w-2xl space-y-4 overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl"><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-wide text-orange-600">{pedidoEnEdicion.mesa_nombre} · {pedidoEnEdicion.numero_pedido}</p><h2 id="corregir-pedido-titulo" className="text-xl font-black text-slate-900">Corregir comanda</h2><p className="mt-1 text-sm text-slate-500">Ajustá productos y cantidades. Se recalcularán los precios actuales; todavía no se cobra ni se descuenta stock.</p></div><button type="button" onClick={() => setPedidoEnEdicion(null)} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" aria-label="Cerrar">×</button></div>
      <label className="block text-sm font-bold text-slate-700">Agregar producto<select value="" onChange={(event) => agregarProductoCorreccion(event.target.value)} className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5"><option value="">Seleccionar producto disponible</option>{productosDisponibles.filter((producto) => !itemsCorreccion.some((item) => item.producto_id === String(producto.id))).map((producto) => <option key={producto.id} value={producto.id}>{producto.nombre} · {importe(producto.precio_venta)}</option>)}</select></label>
      <div className="space-y-2">{itemsCorreccion.map((item) => <div key={item.producto_id} className="grid grid-cols-[1fr_100px_auto] items-center gap-2 rounded-lg border border-slate-200 p-3"><div><p className="font-bold text-slate-800">{item.nombre}</p><p className="text-xs text-slate-500">{importe(item.precio_unitario)} c/u</p></div><label className="text-xs font-bold text-slate-500">Cantidad<input type="number" min="0" step="0.01" value={item.cantidad} onChange={(event) => actualizarCantidadCorreccion(item.producto_id, event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-2 text-sm text-slate-900"/></label><button type="button" onClick={() => setItemsCorreccion((items) => items.filter((current) => current.producto_id !== item.producto_id))} className="rounded-lg p-2 text-rose-600 hover:bg-rose-50" aria-label={`Quitar ${item.nombre}`}><Trash2 size={17}/></button></div>)}</div>
      <label className="block text-sm font-bold text-slate-700">Nota para cocina<textarea maxLength={500} value={notaCorreccion} onChange={(event) => setNotaCorreccion(event.target.value)} className="mt-1.5 min-h-20 w-full rounded-lg border border-slate-300 p-3 font-normal" placeholder="Sin cebolla, bien cocido…"/></label>
      <label className="block text-sm font-bold text-slate-700">Motivo del cambio (queda en el historial)<textarea required minLength={3} maxLength={500} value={motivoCorreccion} onChange={(event) => setMotivoCorreccion(event.target.value)} className="mt-1.5 min-h-20 w-full rounded-lg border border-slate-300 p-3 font-normal" placeholder="Ej.: el cliente pidió cambiar la bebida"/></label>
      <p className="text-right text-sm font-black text-slate-800">Total estimado {importe(itemsCorreccion.reduce((sum, item) => sum + Number(item.cantidad || 0) * Number(item.precio_unitario || 0), 0))}</p><div className="flex justify-end gap-2"><button type="button" onClick={() => setPedidoEnEdicion(null)} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-bold text-slate-700">Volver</button><button type="submit" disabled={guardandoCorreccion || !itemsCorreccion.some((item) => Number(item.cantidad) > 0) || motivoCorreccion.trim().length < 3} className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">{guardandoCorreccion ? <LoaderCircle size={16} className="animate-spin"/> : <Save size={16}/>}Guardar corrección</button></div>
    </form></div>}
    {mesaQr && <div className="fixed inset-0 z-[100] grid place-items-center bg-slate-950/60 p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setMesaQr(null); }}><section role="dialog" aria-modal="true" aria-labelledby="mesa-qr-titulo" className="w-full max-w-md rounded-2xl bg-white p-5 text-center shadow-2xl"><header className="flex items-center justify-between text-left"><div><p className="text-xs font-bold uppercase tracking-widest text-orange-600">Código para escanear</p><h2 id="mesa-qr-titulo" className="mt-1 text-xl font-black text-slate-900">{mesaQr.nombre}</h2></div><button type="button" aria-label="Cerrar código QR" onClick={() => setMesaQr(null)} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"><X size={20}/></button></header><div className="my-5 inline-block rounded-2xl border border-slate-200 bg-white p-4"><QRCodeSVG value={URL_MESA(mesaQr.public_token)} size={260} level="H" includeMargin /></div><p className="mb-4 break-all rounded-lg bg-slate-50 p-3 text-xs text-slate-600">{URL_MESA(mesaQr.public_token)}</p><div className="grid grid-cols-2 gap-2"><button type="button" onClick={copiarEnlaceMesa} className="rounded-lg border border-slate-300 px-3 py-2.5 text-sm font-bold text-slate-700">Copiar enlace</button><button type="button" onClick={descargarCodigoMesa} className="inline-flex items-center justify-center gap-2 rounded-lg bg-slate-900 px-3 py-2.5 text-sm font-bold text-white"><Download size={16}/>Descargar QR</button><a href={URL_MESA(mesaQr.public_token)} target="_blank" rel="noreferrer" className="col-span-2 inline-flex items-center justify-center gap-2 rounded-lg bg-orange-500 px-3 py-2.5 text-sm font-bold text-white"><ExternalLink size={16}/>Abrir menú de esta mesa</a></div></section></div>}
  </div>;
}
