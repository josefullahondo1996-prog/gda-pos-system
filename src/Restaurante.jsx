import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChefHat, ClipboardList, Clock3, Download, ExternalLink, LayoutGrid, LoaderCircle, RefreshCw, Save, Settings2, UtensilsCrossed, X } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { renderToStaticMarkup } from 'react-dom/server';
import { supabase } from './supabaseClient';
import { useEmpresaInfo } from './utils/useEmpresa';
import { useConfiguracionEmpresa, notificarConfiguracionEmpresaActualizada } from './utils/useConfiguracionEmpresa';
import { useNotificacion } from './NotificacionContext';

const URL_MESA = (token) => `${window.location.origin}/catalogo-qr/${token}`;
const FECHA = (value) => new Date(value).toLocaleTimeString('es-PY', { hour: '2-digit', minute: '2-digit' });
const importe = (value) => `Gs ${Math.round(Number(value || 0)).toLocaleString('es-PY')}`;
const SECCIONES = [
  { id: 'mapa', label: 'Mapa de mesas', path: '/restaurante/mapa', icon: LayoutGrid },
  { id: 'pedidos', label: 'Pedidos en cocina', path: '/restaurante/pedidos', icon: ClipboardList },
  { id: 'cocina-pro', label: 'Cocina Pro', path: '/restaurante/cocina-pro', icon: ChefHat },
  { id: 'configuracion', label: 'Configuración', path: '/restaurante/configuracion', icon: Settings2 },
];

function PedidoCard({ pedido, onAvanzar, guardando, objetivoMinutos = 20 }) {
  const siguiente = pedido.estado === 'pendiente' ? 'en_preparacion' : 'completado';
  const [ahora, setAhora] = useState(Date.now());
  useEffect(() => { const timer = window.setInterval(() => setAhora(Date.now()), 30000); return () => window.clearInterval(timer); }, []);
  const minutos = Math.max(0, Math.floor((ahora - new Date(pedido.creado_en).getTime()) / 60000));
  const fueraObjetivo = minutos > Number(objetivoMinutos || 20);
  return <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
    <div className="flex flex-wrap items-start justify-between gap-2"><div><p className="text-xs font-bold uppercase tracking-wide text-orange-600">{pedido.mesa_nombre || 'Pedido QR'} · {pedido.numero_pedido}</p><h3 className="mt-1 text-lg font-black text-slate-900">{pedido.estado === 'pendiente' ? 'Nuevo pedido' : 'En preparación'}</h3></div><span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold ${fueraObjetivo ? 'bg-rose-100 text-rose-800' : 'bg-slate-100 text-slate-600'}`}><Clock3 size={13}/>{FECHA(pedido.creado_en)} · {minutos} min</span></div>
    <div className="mt-3 divide-y divide-slate-100 rounded-lg border border-slate-100">{(pedido.items || []).map((item, index) => <div key={`${pedido.id}-${index}`} className="flex justify-between gap-3 px-3 py-2 text-sm"><span><b>{item.cantidad}×</b> {item.nombre}</span><span className="text-slate-500">{importe(item.subtotal)}</span></div>)}</div>
    {pedido.nota && <p className="mt-3 rounded-lg bg-amber-50 p-2.5 text-sm text-amber-900">Nota: {pedido.nota}</p>}
    <div className="mt-3 flex items-center justify-between gap-3"><span className="font-bold text-slate-700">Total {importe(pedido.total)}</span><button disabled={guardando} onClick={() => onAvanzar(pedido, siguiente)} className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-bold text-white hover:bg-slate-700 disabled:opacity-50">{guardando ? 'Guardando…' : pedido.estado === 'pendiente' ? 'Comenzar preparación' : 'Marcar listo'}</button></div>
  </article>;
}

export default function Restaurante({ section = 'mapa' }) {
  const empresa = useEmpresaInfo();
  const empresaId = empresa?.id;
  const { ajustes } = useConfiguracionEmpresa(empresaId);
  const { notificar } = useNotificacion();
  const [mesas, setMesas] = useState([]);
  const [pedidos, setPedidos] = useState([]);
  const [catalogos, setCatalogos] = useState([]);
  const [catalogoSeleccionado, setCatalogoSeleccionado] = useState('');
  const [mesaQr, setMesaQr] = useState(null);
  const [minutosPreparacion, setMinutosPreparacion] = useState('20');
  const [cargando, setCargando] = useState(true);
  const [guardandoId, setGuardandoId] = useState('');
  const [guardandoConfiguracion, setGuardandoConfiguracion] = useState(false);
  const [error, setError] = useState('');

  const cargar = useCallback(async () => {
    if (!empresaId) return;
    setCargando(true); setError('');
    const [rMesas, rPedidos, rCatalogos] = await Promise.all([
      supabase.from('catalogos_qr_mesas').select('*').eq('empresa_id', empresaId).order('nombre'),
      supabase.from('pedidos').select('*').eq('empresa_id', empresaId).order('creado_en', { ascending: false }).limit(250),
      section === 'configuracion' ? supabase.from('catalogos_qr').select('id,nombre,estado').eq('empresa_id', empresaId).eq('estado', 'Activo').order('nombre') : Promise.resolve({ data: [], error: null }),
    ]);
    const failure = rMesas.error || rPedidos.error;
    if (failure) setError(`No se pudo cargar Restaurante. Aplicá database/migration_pedidos_qr_mesa.sql y verificá las migraciones de Pedidos y Catálogo QR. ${failure.message}`);
    setMesas(rMesas.data || []);
    setPedidos((rPedidos.data || []).filter((pedido) => pedido.origen === 'catalogo_qr_mesa'));
    setCatalogos(rCatalogos.data || []);
    setCatalogoSeleccionado(ajustes.restaurant_catalogo_qr_id || '');
    setMinutosPreparacion(String(ajustes.restaurant_preparation_minutes || 20));
    setCargando(false);
  }, [empresaId, section, ajustes.restaurant_catalogo_qr_id, ajustes.restaurant_preparation_minutes]);

  useEffect(() => { cargar(); }, [cargar]);
  useEffect(() => {
    if (!empresaId) return undefined;
    const channel = supabase.channel(`restaurante-pedidos-${empresaId}`).on('postgres_changes', { event: '*', schema: 'public', table: 'pedidos', filter: `empresa_id=eq.${empresaId}` }, () => cargar()).subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [empresaId, cargar]);

  const pedidosActivos = useMemo(() => pedidos.filter((pedido) => ['pendiente', 'en_preparacion'].includes(pedido.estado)), [pedidos]);
  const porMesa = useMemo(() => { const resultado = new Map(); pedidosActivos.forEach((pedido) => { if (!resultado.has(pedido.mesa_id)) resultado.set(pedido.mesa_id, pedido); }); return resultado; }, [pedidosActivos]);
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
    <nav className="grid grid-cols-2 gap-2 rounded-xl border border-slate-200 bg-white p-2 shadow-sm md:grid-cols-4">{SECCIONES.map(({ id, label, path, icon: Icon }) => <Link key={id} to={path} className={`flex items-center justify-center gap-2 rounded-lg px-3 py-3 text-sm font-bold transition ${section === id ? 'bg-orange-500 text-white shadow-sm' : 'text-slate-600 hover:bg-orange-50 hover:text-orange-700'}`}><Icon size={17}/>{label}</Link>)}</nav>
    {error && <div role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">{error}</div>}

    {section === 'configuracion' ? (
      <form onSubmit={guardarConfiguracion} className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div><h2 className="text-lg font-black">Configuración del restaurante</h2><p className="mt-1 text-sm text-slate-500">Elegí el catálogo que verán tus clientes al escanear las mesas y el tiempo objetivo de preparación.</p></div>
        <label className="block text-sm font-bold text-slate-700">Catálogo QR para las mesas<select value={catalogoSeleccionado} onChange={(event) => setCatalogoSeleccionado(event.target.value)} className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5"><option value="">Seleccionar catálogo activo</option>{catalogos.map((catalogo) => <option key={catalogo.id} value={catalogo.id}>{catalogo.nombre}</option>)}</select></label>
        <label className="block max-w-xs text-sm font-bold text-slate-700">Objetivo de preparación (minutos)<input type="number" min="1" max="240" value={minutosPreparacion} onChange={(event) => setMinutosPreparacion(event.target.value)} className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2.5"/></label>
        <div className="flex flex-wrap gap-2"><button type="submit" disabled={guardandoConfiguracion} className="inline-flex items-center gap-2 rounded-lg bg-orange-500 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50">{guardandoConfiguracion ? <LoaderCircle size={16} className="animate-spin"/> : <Save size={16}/>}Guardar configuración</button><Link to="/catalogo-qr" className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-bold text-slate-700"><Settings2 size={16}/>Administrar catálogo y QR</Link></div>
        <p className="text-xs text-slate-500">Las mesas se crean, imprimen o desactivan desde el botón de mesas del catálogo QR.</p>
      </form>
    ) : section === 'mapa' ? (
      <>
        <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-lg font-black text-slate-900">Estado de las mesas</h2><p className="text-sm text-slate-500">Ocupada significa que tiene pedidos pendientes o en preparación.</p></div><button onClick={cargar} className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-bold"><RefreshCw size={15}/>Actualizar</button></div>
        {cargando ? <div className="rounded-xl bg-white p-12 text-center text-slate-500"><LoaderCircle className="mx-auto animate-spin"/></div> : mesas.length ? <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">{mesas.map((mesa) => { const pedido = porMesa.get(mesa.id); return <article key={mesa.id} className={`rounded-2xl border p-4 shadow-sm ${!mesa.activo ? 'border-slate-200 bg-slate-100 opacity-60' : pedido ? 'border-orange-200 bg-orange-50' : 'border-emerald-200 bg-white'}`}><div className="flex items-start justify-between gap-2"><div><p className="text-xs font-bold uppercase tracking-wide text-slate-500">{mesa.activo ? pedido ? 'Ocupada' : 'Disponible' : 'Desactivada'}</p><h3 className="mt-1 text-xl font-black">{mesa.nombre}</h3></div><span className={`rounded-full px-2.5 py-1 text-xs font-bold ${pedido ? 'bg-orange-100 text-orange-800' : 'bg-emerald-100 text-emerald-800'}`}>{pedido ? `${pedido.items?.length || 0} productos` : 'Libre'}</span></div>{pedido && <><p className="mt-3 text-sm text-slate-600">Pedido {pedido.numero_pedido} · {FECHA(pedido.creado_en)}</p><p className="mt-1 text-xs font-bold uppercase text-orange-700">{pedido.estado === 'pendiente' ? 'Pendiente' : 'En preparación'}</p></>}<div className="mt-4 flex flex-wrap gap-2"><button type="button" onClick={() => setMesaQr(mesa)} className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-700"><UtensilsCrossed size={14}/>Ver código QR</button>{pedido && <button onClick={() => avanzarPedido(pedido, pedido.estado === 'pendiente' ? 'en_preparacion' : 'completado')} className="rounded-lg bg-slate-900 px-3 py-2 text-xs font-bold text-white">{pedido.estado === 'pendiente' ? 'Preparar' : 'Liberar mesa'}</button>}</div></article>; })}</div> : !error && <div className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center"><LayoutGrid className="mx-auto text-slate-300" size={34}/><p className="mt-3 font-bold">Aún no hay mesas configuradas</p><p className="mt-1 text-sm text-slate-500">Creá el catálogo QR y agregá mesas para generar sus códigos.</p><Link to="/catalogo-qr" className="mt-4 inline-flex rounded-lg bg-orange-500 px-4 py-2 text-sm font-bold text-white">Configurar mesas QR</Link></div>}
      </>
    ) : section === 'pedidos' ? (
      <>
        <div className="grid gap-3 sm:grid-cols-3"><div className="rounded-xl border bg-white p-4"><p className="text-xs font-bold uppercase text-slate-500">Pedidos activos</p><p className="mt-1 text-2xl font-black">{pedidosActivos.length}</p></div><div className="rounded-xl border border-amber-200 bg-amber-50 p-4"><p className="text-xs font-bold uppercase text-amber-700">Nuevos</p><p className="mt-1 text-2xl font-black text-amber-900">{pendientes.length}</p></div><div className="rounded-xl border border-blue-200 bg-blue-50 p-4"><p className="text-xs font-bold uppercase text-blue-700">Preparando</p><p className="mt-1 text-2xl font-black text-blue-900">{preparando.length}</p></div></div>
        {cargando ? <p className="rounded-xl bg-white p-10 text-center text-slate-500">Cargando pedidos…</p> : pedidosActivos.length ? <div className="grid gap-4 lg:grid-cols-2">{pedidosActivos.map((pedido) => <PedidoCard key={pedido.id} pedido={pedido} onAvanzar={avanzarPedido} guardando={guardandoId === pedido.id} objetivoMinutos={ajustes.restaurant_preparation_minutes}/>)}</div> : <div className="rounded-xl border border-dashed bg-white p-10 text-center text-slate-500"><ClipboardList className="mx-auto text-slate-300" size={32}/><p className="mt-3 font-bold">No hay pedidos pendientes de cocina</p><p className="text-sm">Los nuevos pedidos de las mesas aparecerán aquí automáticamente.</p></div>}
      </>
    ) : (
      <>
        <div className="flex flex-wrap items-end justify-between gap-3"><div><h2 className="text-lg font-black">Cocina Pro</h2><p className="text-sm text-slate-500">Tablero por etapas y carga agrupada por producto.</p></div><span className="rounded-full bg-orange-50 px-3 py-1.5 text-xs font-bold text-orange-800">Objetivo {ajustes.restaurant_preparation_minutes || 20} min</span></div>
        {cargando ? <p className="rounded-xl bg-white p-10 text-center text-slate-500">Cargando cocina…</p> : <div className="space-y-4">
          {resumenProductos.length > 0 && <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><h3 className="mb-3 text-sm font-black uppercase tracking-wide text-slate-600">Carga activa por producto</h3><div className="flex gap-2 overflow-x-auto pb-1">{resumenProductos.map((item) => <div key={item.nombre} className="min-w-36 rounded-lg bg-slate-50 px-3 py-2"><p className="truncate text-xs text-slate-500">{item.nombre}</p><p className="mt-1 text-lg font-black text-slate-900">{item.cantidad} <span className="text-xs font-semibold">unid.</span></p><p className="text-[10px] text-slate-400">{item.comandas} líneas activas</p></div>)}</div></section>}
          <div className="grid gap-4 xl:grid-cols-2"><section className="rounded-xl border border-amber-200 bg-amber-50/60 p-3"><h3 className="mb-3 flex items-center gap-2 font-black text-amber-900"><ClipboardList size={17}/>Entrantes ({pendientes.length})</h3><div className="space-y-3">{pendientes.map((pedido) => <PedidoCard key={pedido.id} pedido={pedido} onAvanzar={avanzarPedido} guardando={guardandoId === pedido.id} objetivoMinutos={ajustes.restaurant_preparation_minutes}/>)}</div>{!pendientes.length && <p className="p-6 text-center text-sm text-amber-800">Sin pedidos nuevos</p>}</section><section className="rounded-xl border border-blue-200 bg-blue-50/60 p-3"><h3 className="mb-3 flex items-center gap-2 font-black text-blue-900"><ChefHat size={17}/>En preparación ({preparando.length})</h3><div className="space-y-3">{preparando.map((pedido) => <PedidoCard key={pedido.id} pedido={pedido} onAvanzar={avanzarPedido} guardando={guardandoId === pedido.id} objetivoMinutos={ajustes.restaurant_preparation_minutes}/>)}</div>{!preparando.length && <p className="p-6 text-center text-sm text-blue-800">Nada en preparación</p>}</section></div>
        </div>}
      </>
    )}
    {mesaQr && <div className="fixed inset-0 z-[100] grid place-items-center bg-slate-950/60 p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setMesaQr(null); }}><section role="dialog" aria-modal="true" aria-labelledby="mesa-qr-titulo" className="w-full max-w-md rounded-2xl bg-white p-5 text-center shadow-2xl"><header className="flex items-center justify-between text-left"><div><p className="text-xs font-bold uppercase tracking-widest text-orange-600">Código para escanear</p><h2 id="mesa-qr-titulo" className="mt-1 text-xl font-black text-slate-900">{mesaQr.nombre}</h2></div><button type="button" aria-label="Cerrar código QR" onClick={() => setMesaQr(null)} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"><X size={20}/></button></header><div className="my-5 inline-block rounded-2xl border border-slate-200 bg-white p-4"><QRCodeSVG value={URL_MESA(mesaQr.public_token)} size={260} level="H" includeMargin /></div><p className="mb-4 break-all rounded-lg bg-slate-50 p-3 text-xs text-slate-600">{URL_MESA(mesaQr.public_token)}</p><div className="grid grid-cols-2 gap-2"><button type="button" onClick={copiarEnlaceMesa} className="rounded-lg border border-slate-300 px-3 py-2.5 text-sm font-bold text-slate-700">Copiar enlace</button><button type="button" onClick={descargarCodigoMesa} className="inline-flex items-center justify-center gap-2 rounded-lg bg-slate-900 px-3 py-2.5 text-sm font-bold text-white"><Download size={16}/>Descargar QR</button><a href={URL_MESA(mesaQr.public_token)} target="_blank" rel="noreferrer" className="col-span-2 inline-flex items-center justify-center gap-2 rounded-lg bg-orange-500 px-3 py-2.5 text-sm font-bold text-white"><ExternalLink size={16}/>Abrir menú de esta mesa</a></div></section></div>}
  </div>;
}
