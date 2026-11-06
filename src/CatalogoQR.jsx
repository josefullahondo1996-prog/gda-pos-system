import { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from './supabaseClient';
import { useEmpresaInfo } from './utils/useEmpresa';
import { useNotificacion } from './NotificacionContext';
import { QRCodeSVG } from 'qrcode.react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ExternalLink, Copy, Download, Plus, Search, QrCode, Pencil, Pause, Play, Trash2, X, Save, Menu, ChevronLeft, ChevronRight, CheckCircle2, LoaderCircle, Minus, ShoppingCart } from 'lucide-react';

const nuevoFormulario = () => ({ nombre: '', estado: 'Activo', expira_el: '', descripcion: '', mensaje_bienvenida: '', categoria: [], marca: [], ubicacion_id: '', precio_min: '', precio_max: '', whatsapp: '', color: '#f59e0b', qr_color: '#111827', qr_titulo: '', qr_subtitulo: '' });
const urlPublica = (token) => `${window.location.origin}/catalogo-qr/${token}`;
const moneda = (n) => new Intl.NumberFormat('es-PY', { style: 'currency', currency: 'PYG', maximumFractionDigits: 0 }).format(Number(n || 0));

export default function CatalogoQR() {
  const { id: empresaId } = useEmpresaInfo();
  const { notificar, confirmar } = useNotificacion();
  const [catalogos, setCatalogos] = useState([]);
  const [categorias, setCategorias] = useState([]);
  const [marcas, setMarcas] = useState([]);
  const [ubicaciones, setUbicaciones] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [busqueda, setBusqueda] = useState('');
  const [modal, setModal] = useState(false);
  const [editando, setEditando] = useState(null);
  const [form, setForm] = useState(nuevoFormulario());
  const [guardando, setGuardando] = useState(false);
  const [qr, setQr] = useState(null);
  const [errorCarga, setErrorCarga] = useState('');

  useEffect(() => {
    let vigente = true;
    if (!empresaId) return () => { vigente = false; };
    (async () => {
      setCargando(true);
      const [c, p, u] = await Promise.all([
        supabase.from('catalogos_qr').select('*').eq('empresa_id', empresaId).order('creado_en', { ascending: false }),
        supabase.from('productos').select('categoria,marca').eq('empresa_id', empresaId),
        supabase.from('ubicaciones_comerciales').select('id,nombre').eq('empresa_id', empresaId).eq('activo', true).order('nombre'),
      ]);
      if (!vigente) return;
      setErrorCarga(c.error?.code === 'PGRST205' || c.error?.code === '42P01' ? 'Falta instalar la migración de Catálogo QR en Supabase. El módulo está listo, pero guardar y publicar seguirá desactivado hasta habilitar su tabla segura.' : (c.error ? `Error al cargar catálogos (${c.error.code || 'sin código'}): ${c.error.message || JSON.stringify(c.error)}` : ''));
      if (c.error && c.error.code !== 'PGRST205' && c.error.code !== '42P01') notificar.error(`No se pudieron cargar los catálogos: ${c.error.message}`);
      setCatalogos(c.data || []);
      setCategorias([...new Set((p.data || []).map((x) => x.categoria).filter(Boolean))].sort((a, b) => a.localeCompare(b)));
      setMarcas([...new Set((p.data || []).map((x) => x.marca).filter(Boolean))].sort((a, b) => a.localeCompare(b))); setUbicaciones(u.data || []); setCargando(false);
    })();
    return () => { vigente = false; };
  }, [empresaId]);
  const visibles = useMemo(() => catalogos.filter((c) => c.nombre.toLowerCase().includes(busqueda.toLowerCase())), [catalogos, busqueda]);

  const abrirNuevo = () => { setEditando(null); setForm(nuevoFormulario()); setModal(true); };
  const abrirEdicion = (c) => {
    setEditando(c); setForm({ ...nuevoFormulario(), ...c, expira_el: c.expira_el || '', ubicacion_id: c.ubicacion_id || '', precio_min: c.precio_min ?? '', precio_max: c.precio_max ?? '', categoria: c.categoria || [], marca: c.marca || [] }); setModal(true);
  };
  const guardar = async (e) => {
    e.preventDefault(); if (!empresaId || !form.nombre.trim()) return;
    setGuardando(true);
    const payload = { ...form, nombre: form.nombre.trim(), empresa_id: empresaId, expira_el: form.expira_el || null, ubicacion_id: form.ubicacion_id || null, precio_min: form.precio_min === '' ? null : Number(form.precio_min), precio_max: form.precio_max === '' ? null : Number(form.precio_max) };
    const resp = editando
      ? await supabase.from('catalogos_qr').update(payload).eq('id', editando.id).eq('empresa_id', empresaId).select().single()
      : await supabase.from('catalogos_qr').insert(payload).select().single();
    setGuardando(false);
    if (resp.error) { notificar.error(`No se pudo guardar: ${resp.error.message}`); return; }
    setModal(false); setCatalogos((actual) => editando ? actual.map((x) => x.id === editando.id ? resp.data : x) : [resp.data, ...actual]);
    notificar.exito('Catálogo guardado correctamente.');
  };
  const alternar = async (c) => {
    const estado = c.estado === 'Activo' ? 'Pausado' : 'Activo';
    const { error } = await supabase.from('catalogos_qr').update({ estado }).eq('id', c.id).eq('empresa_id', empresaId);
    if (error) return notificar.error(`No se pudo actualizar: ${error.message}`);
    setCatalogos((xs) => xs.map((x) => x.id === c.id ? { ...x, estado } : x));
  };
  const eliminar = async (c) => {
    if (!(await confirmar(`¿Eliminar el catálogo “${c.nombre}”? Su enlace QR dejará de funcionar.`))) return;
    const { error } = await supabase.from('catalogos_qr').delete().eq('id', c.id).eq('empresa_id', empresaId);
    if (error) return notificar.error(`No se pudo eliminar: ${error.message}`);
    setCatalogos((xs) => xs.filter((x) => x.id !== c.id));
  };
  const copiar = async (c) => { await navigator.clipboard.writeText(urlPublica(c.public_token)); notificar.exito('Enlace copiado.'); };
  const descargarQR = (c) => {
    const svg = renderToStaticMarkup(<QRCodeSVG value={urlPublica(c.public_token)} size={720} level="H" includeMargin fgColor={c.qr_color || '#111827'} />);
    const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }); const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = `qr-${c.nombre.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.svg`; a.click(); URL.revokeObjectURL(a.href);
  };

  return <div className="min-h-full overflow-auto bg-slate-50 p-4 md:p-7">
    <div className="mx-auto max-w-7xl space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-4 rounded-2xl bg-gradient-to-r from-slate-900 to-slate-800 p-6 text-white shadow-lg">
        <div><div className="mb-2 flex items-center gap-2 text-amber-300"><QrCode size={19}/><span className="text-xs font-bold uppercase tracking-[.18em]">Catálogo QR</span></div><h1 className="text-2xl font-bold">Tus catálogos públicos</h1><p className="mt-1 text-sm text-slate-300">Compartí tus productos y precios con un enlace o código QR.</p></div>
        <button onClick={abrirNuevo} className="inline-flex items-center gap-2 rounded-xl bg-amber-400 px-4 py-3 font-bold text-slate-900 hover:bg-amber-300"><Plus size={18}/> Nuevo catálogo</button>
      </header>
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:p-6">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-bold text-slate-800">Mis catálogos <span className="ml-2 rounded-full bg-slate-100 px-2 py-1 text-xs text-slate-500">{catalogos.length}</span></h2><p className="mt-1 text-xs text-slate-500">El catálogo público muestra precio y stock, y recibe pedidos desde un carrito. No cobra ni descuenta existencias.</p></div><label className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2"><Search size={16} className="text-slate-400"/><input value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Buscar catálogo..." className="w-48 text-sm outline-none"/></label></div>
        {errorCarga && <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">{errorCarga}<div className="mt-1 text-xs">Archivo de migración: database/migration_catalogo_qr.sql</div></div>}
        <div className="overflow-x-auto"><table className="w-full min-w-[880px] text-left text-sm"><thead><tr className="border-y border-slate-100 text-[11px] uppercase tracking-wide text-slate-500"><th className="px-3 py-3">Catálogo</th><th className="px-3 py-3">Enlace público</th><th className="px-3 py-3">Estado</th><th className="px-3 py-3">Vistas</th><th className="px-3 py-3">Expira</th><th className="px-3 py-3 text-right">Acciones</th></tr></thead><tbody className="divide-y divide-slate-100">{visibles.map((c) => <tr key={c.id}><td className="px-3 py-4"><div className="font-semibold text-slate-800">{c.nombre}</div>{c.descripcion && <div className="max-w-56 truncate text-xs text-slate-500">{c.descripcion}</div>}</td><td className="px-3 py-4"><button onClick={() => copiar(c)} className="inline-flex max-w-60 items-center gap-1 truncate text-xs font-medium text-blue-700 hover:underline"><span className="truncate">{urlPublica(c.public_token)}</span><Copy size={13}/></button></td><td className="px-3 py-4"><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${c.estado === 'Activo' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>{c.estado}</span></td><td className="px-3 py-4 font-medium text-slate-700">{c.vistas || 0}</td><td className="px-3 py-4 text-slate-600">{c.expira_el ? new Date(`${c.expira_el}T00:00:00`).toLocaleDateString('es-PY') : 'Sin vencimiento'}</td><td className="px-3 py-4"><div className="flex justify-end gap-1"><button title="Ver catálogo" onClick={() => window.open(urlPublica(c.public_token), '_blank', 'noopener,noreferrer')} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"><ExternalLink size={16}/></button><button title="Mostrar QR" onClick={() => setQr(c)} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"><QrCode size={16}/></button><button title="Descargar QR" onClick={() => descargarQR(c)} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"><Download size={16}/></button><button title="Editar" onClick={() => abrirEdicion(c)} className="rounded-lg p-2 text-blue-600 hover:bg-blue-50"><Pencil size={16}/></button><button title={c.estado === 'Activo' ? 'Pausar' : 'Activar'} onClick={() => alternar(c)} className="rounded-lg p-2 text-amber-600 hover:bg-amber-50">{c.estado === 'Activo' ? <Pause size={16}/> : <Play size={16}/>}</button><button title="Eliminar" onClick={() => eliminar(c)} className="rounded-lg p-2 text-red-500 hover:bg-red-50"><Trash2 size={16}/></button></div></td></tr>)}{!cargando && visibles.length === 0 && <tr><td colSpan="6" className="py-12 text-center text-slate-400">No hay catálogos todavía. Creá uno para publicar tu primer catálogo QR.</td></tr>}</tbody></table>{cargando && <div className="py-10 text-center text-sm text-slate-400">Cargando catálogos...</div>}</div>
      </section>
    </div>

    {modal && <div className="fixed inset-0 z-[90] flex items-center justify-center overflow-y-auto bg-slate-950/60 p-3 backdrop-blur-sm"><form onSubmit={guardar} className="my-auto max-h-[95vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-white shadow-2xl"><div className="sticky top-0 z-10 flex items-center justify-between border-b bg-white px-5 py-4"><div><h2 className="font-bold text-slate-900">{editando ? 'Editar catálogo' : 'Nuevo catálogo'}</h2><p className="text-xs text-slate-500">Datos básicos, filtros y personalización del QR</p></div><button type="button" onClick={() => setModal(false)} className="rounded-lg p-2 hover:bg-slate-100"><X size={18}/></button></div>
      <div className="grid gap-5 p-5 md:grid-cols-2"><div className="space-y-3 md:col-span-2"><h3 className="font-semibold text-slate-800">Datos básicos</h3><div className="grid gap-3 md:grid-cols-2"><label className="text-xs font-semibold text-slate-600">Nombre *<input required maxLength="100" value={form.nombre} onChange={(e) => setForm({...form,nombre:e.target.value})} className="mt-1 w-full rounded-lg border p-2.5 text-sm" placeholder="Ej.: Catálogo de repuestos"/></label><label className="text-xs font-semibold text-slate-600">Estado<select value={form.estado} onChange={(e) => setForm({...form,estado:e.target.value})} className="mt-1 w-full rounded-lg border p-2.5 text-sm"><option>Activo</option><option>Pausado</option></select></label><label className="text-xs font-semibold text-slate-600">Expira el<input type="date" value={form.expira_el} onChange={(e) => setForm({...form,expira_el:e.target.value})} className="mt-1 w-full rounded-lg border p-2.5 text-sm"/></label><label className="text-xs font-semibold text-slate-600">WhatsApp del vendedor<input value={form.whatsapp} onChange={(e) => setForm({...form,whatsapp:e.target.value})} className="mt-1 w-full rounded-lg border p-2.5 text-sm" placeholder="595981234567"/></label><label className="text-xs font-semibold text-slate-600 md:col-span-2">Descripción<textarea value={form.descripcion || ''} onChange={(e) => setForm({...form,descripcion:e.target.value})} rows="2" className="mt-1 w-full rounded-lg border p-2.5 text-sm"/></label><label className="text-xs font-semibold text-slate-600 md:col-span-2">Mensaje de bienvenida<textarea value={form.mensaje_bienvenida || ''} onChange={(e) => setForm({...form,mensaje_bienvenida:e.target.value})} rows="2" className="mt-1 w-full rounded-lg border p-2.5 text-sm" placeholder="Consultanos disponibilidad por WhatsApp"/></label></div></div>
      <div className="space-y-3"><h3 className="font-semibold text-slate-800">Qué productos mostrar</h3><label className="block text-xs font-semibold text-slate-600">Sucursal<select value={form.ubicacion_id} onChange={(e) => setForm({...form,ubicacion_id:e.target.value})} className="mt-1 w-full rounded-lg border p-2.5 text-sm"><option value="">Todas las sucursales</option>{ubicaciones.map((u) => <option key={u.id} value={u.id}>{u.nombre}</option>)}</select></label><div className="grid grid-cols-2 gap-2"><label className="text-xs font-semibold text-slate-600">Precio mínimo<input type="number" min="0" value={form.precio_min} onChange={(e) => setForm({...form,precio_min:e.target.value})} className="mt-1 w-full rounded-lg border p-2.5 text-sm"/></label><label className="text-xs font-semibold text-slate-600">Precio máximo<input type="number" min="0" value={form.precio_max} onChange={(e) => setForm({...form,precio_max:e.target.value})} className="mt-1 w-full rounded-lg border p-2.5 text-sm"/></label></div><label className="block text-xs font-semibold text-slate-600">Categorías <span className="font-normal">(vacío = todas)</span><select multiple value={form.categoria} onChange={(e) => setForm({...form,categoria:[...e.target.selectedOptions].map((x)=>x.value)})} className="mt-1 h-32 w-full rounded-lg border p-2 text-sm">{categorias.map((x)=><option key={x}>{x}</option>)}</select></label><label className="block text-xs font-semibold text-slate-600">Marcas <span className="font-normal">(vacío = todas)</span><select multiple value={form.marca} onChange={(e) => setForm({...form,marca:[...e.target.selectedOptions].map((x)=>x.value)})} className="mt-1 h-32 w-full rounded-lg border p-2 text-sm">{marcas.map((x)=><option key={x}>{x}</option>)}</select></label></div>
      <div className="space-y-3"><h3 className="font-semibold text-slate-800">Personalización y QR</h3><label className="block text-xs font-semibold text-slate-600">Color del catálogo<input type="color" value={form.color} onChange={(e)=>setForm({...form,color:e.target.value})} className="mt-1 h-10 w-full rounded-lg border p-1"/></label><label className="block text-xs font-semibold text-slate-600">Color del código QR<input type="color" value={form.qr_color} onChange={(e)=>setForm({...form,qr_color:e.target.value})} className="mt-1 h-10 w-full rounded-lg border p-1"/></label><label className="block text-xs font-semibold text-slate-600">Título del QR<input value={form.qr_titulo} onChange={(e)=>setForm({...form,qr_titulo:e.target.value})} className="mt-1 w-full rounded-lg border p-2.5 text-sm"/></label><label className="block text-xs font-semibold text-slate-600">Subtítulo del QR<input value={form.qr_subtitulo} onChange={(e)=>setForm({...form,qr_subtitulo:e.target.value})} className="mt-1 w-full rounded-lg border p-2.5 text-sm"/></label><p className="rounded-lg bg-amber-50 p-3 text-xs text-amber-900">Los clientes podrán agregar productos al carrito y enviar un pedido. El pedido no cobra ni descuenta stock; se confirma y registra como pendiente para que tu equipo lo prepare.</p></div></div>
      <div className="sticky bottom-0 flex justify-end gap-2 border-t bg-white p-4"><button type="button" onClick={()=>setModal(false)} className="rounded-lg border px-4 py-2 text-sm font-semibold">Cancelar</button><button disabled={guardando} className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-bold text-white disabled:opacity-60"><Save size={16}/>{guardando?'Guardando...':'Guardar catálogo'}</button></div></form></div>}
    {qr && <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/60 p-4" onClick={()=>setQr(null)}><div className="w-full max-w-sm rounded-2xl bg-white p-6 text-center shadow-2xl" onClick={(e)=>e.stopPropagation()}><button onClick={()=>setQr(null)} className="float-right rounded p-1 hover:bg-slate-100"><X size={18}/></button><h3 className="mt-2 font-bold text-slate-900">{qr.qr_titulo || qr.nombre}</h3><p className="text-sm text-slate-500">{qr.qr_subtitulo || 'Escaneá para ver el catálogo'}</p><QRCodeSVG value={urlPublica(qr.public_token)} size={256} level="H" includeMargin fgColor={qr.qr_color || '#111827'} className="mx-auto my-4"/><div className="flex justify-center gap-2"><button onClick={()=>copiar(qr)} className="rounded-lg border px-3 py-2 text-sm font-semibold">Copiar enlace</button><button onClick={()=>descargarQR(qr)} className="inline-flex items-center gap-1 rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white"><Download size={15}/> Descargar SVG</button></div></div></div>}
  </div>;
}

export function CatalogoQRPublico() {
  const token = window.location.pathname.split('/').filter(Boolean).at(-1);
  const [catalogo, setCatalogo] = useState(null); const [cargando, setCargando] = useState(true); const [busqueda, setBusqueda] = useState('');
  const [categoriaActiva, setCategoriaActiva] = useState('Todas'); const [menuCategoriasAbierto, setMenuCategoriasAbierto] = useState(false);
  const [carrito, setCarrito] = useState({}); const [carritoAbierto, setCarritoAbierto] = useState(false); const [nombreCliente, setNombreCliente] = useState(''); const [telefonoCliente, setTelefonoCliente] = useState(''); const [notaPedido, setNotaPedido] = useState(''); const [errorPedido, setErrorPedido] = useState(''); const [guardandoPedido, setGuardandoPedido] = useState(false); const [pedidoConfirmado, setPedidoConfirmado] = useState(null);
  const sliderCategoriasRef = useRef(null); const productosRef = useRef(null);
  useEffect(() => { let vivo = true; supabase.rpc('obtener_catalogo_qr_publico', { p_token: token }).then(({ data }) => { if (vivo) { setCatalogo(data); setCargando(false); } }); return () => { vivo = false; }; }, [token]);
  const productos = catalogo?.productos || [];
  const cantidadEnCarrito = Object.values(carrito).reduce((total, cantidad) => total + Number(cantidad || 0), 0);
  const itemsCarrito = Object.entries(carrito).map(([id, cantidad]) => ({ producto: productos.find((item) => String(item.id) === id), cantidad: Number(cantidad) })).filter((item) => item.producto && item.cantidad > 0);
  const totalCarrito = itemsCarrito.reduce((total, item) => total + Number(item.producto.precio || 0) * item.cantidad, 0);
  const categorias = [...new Set(productos.map((p) => p.categoria?.trim() || 'Sin categoría'))].sort((a, b) => a.localeCompare(b, 'es'));
  const productosFiltrados = productos.filter((p) => {
    const coincideBusqueda = `${p.nombre} ${p.codigo || ''} ${p.categoria || ''}`.toLowerCase().includes(busqueda.toLowerCase());
    const coincideCategoria = categoriaActiva === 'Todas' || (p.categoria?.trim() || 'Sin categoría') === categoriaActiva;
    return coincideBusqueda && coincideCategoria;
  });
  const whatsapp = catalogo?.whatsapp?.replace(/\D/g, '');
  const stockDisponible = (producto) => producto.stock_disponible == null ? null : Math.max(0, Number(producto.stock_disponible));
  const formatoCantidad = (cantidad) => new Intl.NumberFormat('es-PY', { maximumFractionDigits: 3 }).format(Number(cantidad || 0));
  const actualizarCarrito = (producto, delta) => {
    const stock = stockDisponible(producto);
    setCarrito((actual) => {
      const cantidad = Math.max(0, Math.min(stock, Number(actual[producto.id] || 0) + delta));
      const siguiente = { ...actual };
      if (cantidad === 0) delete siguiente[producto.id]; else siguiente[producto.id] = cantidad;
      return siguiente;
    });
  };
  const abrirCarrito = () => { setPedidoConfirmado(null); setErrorPedido(''); setCarritoAbierto(true); };
  const enviarPedido = async (event) => {
    event.preventDefault(); setErrorPedido('');
    if (!nombreCliente.trim() || telefonoCliente.replace(/\D/g, '').length < 8 || itemsCarrito.length === 0) return setErrorPedido('Ingresá tu nombre, un teléfono válido y al menos un producto.');
    setGuardandoPedido(true);
    const { data, error } = await supabase.rpc('crear_pedido_catalogo_qr_publico', {
      p_token: token,
      p_cliente_nombre: nombreCliente.trim(),
      p_cliente_telefono: telefonoCliente.trim(),
      p_items: itemsCarrito.map(({ producto, cantidad }) => ({ producto_id: producto.id, cantidad })),
      p_nota: notaPedido.trim() || null,
    });
    setGuardandoPedido(false);
    if (error) {
      const mensajeError = error.message || '';
      const rpcNoDisponible = error.code === 'PGRST202' || error.code === '42883' || mensajeError.includes('crear_pedido_catalogo_qr_publico');
      setErrorPedido(mensajeError.includes('STOCK_INSUFICIENTE')
        ? 'Cambió el stock de uno o más productos. Actualizamos las existencias; ajustá el carrito y volvé a enviar.'
        : rpcNoDisponible
          ? 'El envío de pedidos todavía no está habilitado en este catálogo. Aplicá database/migration_catalogo_qr_carrito.sql en Supabase y volvé a intentar.'
          : `No se pudo enviar el pedido: ${mensajeError}`);
      if (mensajeError.includes('STOCK_INSUFICIENTE')) {
        const { data: catalogoActualizado } = await supabase.rpc('obtener_catalogo_qr_publico', { p_token: token });
        if (catalogoActualizado) setCatalogo(catalogoActualizado);
      }
      return;
    }
    setPedidoConfirmado(data); setCarrito({});
  };
  const seleccionarCategoria = (categoria) => {
    setCategoriaActiva(categoria);
    setMenuCategoriasAbierto(false);
    requestAnimationFrame(() => productosRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  };
  const moverSliderCategorias = (direccion) => sliderCategoriasRef.current?.scrollBy({ left: direccion * 240, behavior: 'smooth' });
  if (cargando) return <main className="grid min-h-screen place-items-center bg-slate-50 text-slate-500">Cargando catálogo...</main>;
  if (!catalogo) return <main className="grid min-h-screen place-items-center bg-slate-50 p-6 text-center"><div><QrCode className="mx-auto mb-3 text-slate-300" size={44}/><h1 className="text-xl font-bold text-slate-800">Este catálogo no está disponible</h1><p className="mt-1 text-sm text-slate-500">El enlace pudo haber vencido o el catálogo fue pausado.</p></div></main>;
  return <main className="fixed inset-0 z-10 min-h-screen overflow-x-hidden overflow-y-auto overscroll-y-contain bg-slate-50 touch-pan-y" style={{'--catalog-color':catalogo.color || '#f59e0b', WebkitOverflowScrolling: 'touch'}}>
    <header className="relative z-30 bg-slate-950 px-5 py-7 text-white" style={{borderBottom:`5px solid ${catalogo.color || '#f59e0b'}`}}>
      <div className="mx-auto max-w-6xl">
        <div className="flex items-start justify-between gap-4">
          <div><p className="text-sm font-semibold text-amber-300">{catalogo.empresa}</p><h1 className="mt-2 text-3xl font-extrabold">{catalogo.nombre}</h1></div>
          <div className="relative shrink-0">
            <button type="button" aria-label="Abrir categorías" aria-expanded={menuCategoriasAbierto} onClick={() => setMenuCategoriasAbierto((abierto) => !abierto)} className="flex items-center gap-2 rounded-xl border border-white/20 bg-white/10 px-3 py-2.5 text-sm font-semibold text-white transition hover:bg-white/20"><Menu size={19}/><span className="hidden sm:inline">Categorías</span></button>
            {menuCategoriasAbierto && <><button type="button" aria-label="Cerrar menú de categorías" onClick={() => setMenuCategoriasAbierto(false)} className="fixed inset-0 z-30 cursor-default"/><div className="absolute right-0 top-full z-40 mt-2 max-h-[70vh] w-64 overflow-y-auto rounded-xl border border-slate-200 bg-white p-2 text-slate-800 shadow-xl"><p className="px-3 py-2 text-xs font-bold uppercase tracking-wide text-slate-400">Categorías</p>{['Todas', ...categorias].map((categoria) => <button key={categoria} type="button" onClick={() => seleccionarCategoria(categoria)} className={`block w-full rounded-lg px-3 py-2.5 text-left text-sm transition ${categoriaActiva === categoria ? 'bg-slate-900 font-semibold text-white' : 'text-slate-700 hover:bg-slate-100'}`}>{categoria}</button>)}</div></>}
          </div>
        </div>
        {catalogo.descripcion && <p className="mt-2 max-w-2xl text-slate-300">{catalogo.descripcion}</p>}{catalogo.bienvenida && <p className="mt-3 text-sm text-slate-200">{catalogo.bienvenida}</p>}
        <div className="mt-5 flex max-w-xl items-center gap-2 rounded-xl bg-white px-3 py-2 text-slate-500"><Search size={18}/><input value={busqueda} onChange={(e)=>setBusqueda(e.target.value)} placeholder="Buscar productos..." className="w-full text-sm outline-none"/></div>
      </div>
    </header>
    <nav aria-label="Deslizador de categorías" className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 shadow-sm backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center gap-2 px-3 py-2">
        <button type="button" aria-label="Deslizar categorías a la izquierda" onClick={() => moverSliderCategorias(-1)} className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-slate-200 text-slate-600 hover:bg-slate-100"><ChevronLeft size={18}/></button>
        <div ref={sliderCategoriasRef} className="flex min-w-0 flex-1 snap-x gap-2 overflow-x-auto scroll-smooth [&::-webkit-scrollbar]:hidden" style={{ scrollbarWidth: 'none' }}>
          {['Todas', ...categorias].map((categoria) => <button key={categoria} type="button" onClick={() => seleccionarCategoria(categoria)} className={`shrink-0 snap-start rounded-full border px-4 py-2 text-sm font-semibold transition-colors ${categoriaActiva === categoria ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 bg-white text-slate-700 hover:border-slate-400'}`}>{categoria}</button>)}
        </div>
        <button type="button" aria-label="Deslizar categorías a la derecha" onClick={() => moverSliderCategorias(1)} className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-slate-200 text-slate-600 hover:bg-slate-100"><ChevronRight size={18}/></button>
      </div>
    </nav>
    <section ref={productosRef} className="mx-auto max-w-6xl scroll-mt-16 px-4 py-7">
      <p className="mb-4 text-sm text-slate-500">{productosFiltrados.length} productos{categoriaActiva !== 'Todas' ? ` · ${categoriaActiva}` : ''}</p>
      <div key={categoriaActiva} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {productosFiltrados.map((p) => {
          const stock = stockDisponible(p);
          const stockCargado = stock !== null;
          const enCarrito = Number(carrito[p.id] || 0);
          return <article key={p.id} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition duration-200 hover:-translate-y-0.5 hover:shadow-md">
            <div className="grid h-48 place-items-center bg-slate-100">{p.imagen ? <img src={p.imagen} alt={p.nombre} className="h-full w-full object-contain"/> : <QrCode className="text-slate-300" size={44}/>}</div>
            <div className="p-4">
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">{p.categoria || p.marca || 'Producto'}</div>
              <h2 className="mt-1 line-clamp-2 min-h-12 font-bold text-slate-800">{p.nombre}</h2>
              {p.codigo && <p className="text-xs text-slate-400">Código: {p.codigo}</p>}
              <div className="mt-3 flex items-end justify-between gap-2"><span className="text-lg font-extrabold text-slate-900">{moneda(p.precio)}</span><span className={`text-xs font-bold ${stockCargado && stock > 0 ? 'text-emerald-700' : stockCargado ? 'text-rose-600' : 'text-amber-700'}`}>{stockCargado ? stock > 0 ? `${formatoCantidad(stock)} disponibles` : 'Agotado' : 'Stock por actualizar'}</span></div>
              {enCarrito > 0 ? <div className="mt-4 flex items-center justify-between rounded-lg border border-slate-200 p-2"><span className="text-xs font-semibold text-slate-600">En el carrito: {formatoCantidad(enCarrito)}</span><div className="flex items-center gap-2"><button type="button" aria-label={`Quitar una unidad de ${p.nombre}`} onClick={() => actualizarCarrito(p, -1)} className="grid h-9 w-9 place-items-center rounded-lg border hover:bg-slate-50"><Minus size={16}/></button><button type="button" aria-label={`Agregar una unidad de ${p.nombre}`} disabled={!stockCargado || enCarrito >= stock} onClick={() => actualizarCarrito(p, 1)} className="grid h-9 w-9 place-items-center rounded-lg bg-slate-900 text-white hover:bg-slate-700 disabled:opacity-40"><Plus size={16}/></button></div></div> : <button type="button" disabled={!stockCargado || stock <= 0} onClick={() => actualizarCarrito(p, 1)} className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-sm font-bold text-white disabled:cursor-not-allowed disabled:bg-slate-300" style={{ backgroundColor: stockCargado && stock > 0 ? (catalogo.color || '#f59e0b') : undefined }}><ShoppingCart size={16}/>{!stockCargado ? 'Stock no disponible' : stock > 0 ? 'Agregar al carrito' : 'Sin stock'}</button>}
              {whatsapp && <a target="_blank" rel="noreferrer" href={`https://wa.me/${whatsapp}?text=${encodeURIComponent(`Hola, consulto por ${p.nombre}${p.codigo ? ` (${p.codigo})` : ''}.`)}`} className="mt-2 block rounded-lg border border-emerald-200 px-3 py-2 text-center text-xs font-bold text-emerald-700 hover:bg-emerald-50">Consultar por WhatsApp</a>}
            </div>
          </article>;
        })}
      </div>
      {productosFiltrados.length===0 && <div className="rounded-xl border border-dashed p-12 text-center text-slate-400">No hay productos en esta categoría o que coincidan con la búsqueda.</div>}
    </section>
    <footer className="pb-24 text-center text-xs text-slate-400">Catálogo digital · {catalogo.empresa}</footer>
    {cantidadEnCarrito > 0 && <button type="button" onClick={abrirCarrito} className="fixed bottom-4 left-4 right-4 z-40 mx-auto flex max-w-xl items-center justify-between rounded-2xl bg-slate-950 px-5 py-4 text-left text-white shadow-xl"><span className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-white/10"><ShoppingCart size={19}/></span><span><strong className="block text-sm">Ver carrito · {formatoCantidad(cantidadEnCarrito)} unidades</strong><span className="text-xs text-slate-300">Revisar y enviar pedido</span></span></span><strong>{moneda(totalCarrito)}</strong></button>}
    {carritoAbierto && <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/60 p-3 backdrop-blur-sm" onMouseDown={(event) => { if (event.target === event.currentTarget && !guardandoPedido) setCarritoAbierto(false); }}><form onSubmit={enviarPedido} className="flex max-h-[92dvh] w-full max-w-xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
      <header className="flex items-start justify-between border-b border-slate-200 px-5 py-4"><div><p className="text-xs font-bold uppercase tracking-widest text-orange-600">Compra</p><h2 className="mt-1 text-xl font-black text-slate-900">{pedidoConfirmado ? 'Pedido recibido' : 'Tu carrito'}</h2></div><button type="button" onClick={() => setCarritoAbierto(false)} aria-label="Cerrar carrito" className="rounded-lg p-2 text-slate-400 hover:bg-slate-100"><X size={20}/></button></header>
      {pedidoConfirmado ? <div className="overflow-y-auto p-6 text-center"><CheckCircle2 className="mx-auto text-emerald-600" size={48}/><h3 className="mt-3 text-lg font-black text-slate-900">Pedido {pedidoConfirmado.numero_pedido} enviado</h3><p className="mt-2 text-sm text-slate-600">Total: <strong>{moneda(pedidoConfirmado.total)}</strong></p><p className="mt-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">El negocio revisará el pedido y confirmará disponibilidad y forma de pago. Este pedido no es un cobro y no reserva ni descuenta stock todavía.</p><button type="button" onClick={() => setCarritoAbierto(false)} className="mt-5 w-full rounded-lg bg-slate-900 px-4 py-3 text-sm font-bold text-white">Volver al catálogo</button></div> : <>
        <div className="flex-1 space-y-4 overflow-y-auto p-5">
          {errorPedido && <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{errorPedido}</div>}
          {itemsCarrito.length > 0 ? <div className="divide-y divide-slate-100 rounded-xl border border-slate-200">{itemsCarrito.map(({ producto, cantidad }) => <div key={producto.id} className="flex items-center gap-3 p-3"><div className="min-w-0 flex-1"><p className="truncate text-sm font-bold text-slate-800">{producto.nombre}</p><p className="text-xs text-slate-500">{moneda(producto.precio)} · stock {formatoCantidad(stockDisponible(producto))}</p></div><div className="flex items-center gap-2"><button type="button" aria-label={`Quitar una unidad de ${producto.nombre}`} onClick={() => actualizarCarrito(producto, -1)} className="grid h-8 w-8 place-items-center rounded border"><Minus size={14}/></button><span className="min-w-7 text-center text-sm font-bold">{formatoCantidad(cantidad)}</span><button type="button" aria-label={`Agregar una unidad de ${producto.nombre}`} disabled={cantidad >= stockDisponible(producto)} onClick={() => actualizarCarrito(producto, 1)} className="grid h-8 w-8 place-items-center rounded bg-slate-900 text-white disabled:opacity-40"><Plus size={14}/></button><button type="button" aria-label={`Quitar ${producto.nombre} del carrito`} onClick={() => setCarrito((actual) => { const siguiente = { ...actual }; delete siguiente[producto.id]; return siguiente; })} className="grid h-8 w-8 place-items-center rounded text-rose-600 hover:bg-rose-50"><Trash2 size={15}/></button></div></div>)}</div> : <div className="rounded-xl border border-dashed p-6 text-center text-sm text-slate-500">Tu carrito está vacío. Volvé al catálogo para elegir productos.</div>}
          <div className="flex justify-between border-t border-slate-200 pt-3 text-sm"><span className="font-bold text-slate-600">Total estimado</span><strong className="text-lg">{moneda(totalCarrito)}</strong></div>
          <label className="block text-sm font-semibold text-slate-700">Tu nombre<input required maxLength="120" value={nombreCliente} onChange={(event) => setNombreCliente(event.target.value)} className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2.5 font-normal" autoComplete="name"/></label>
          <label className="block text-sm font-semibold text-slate-700">Teléfono de contacto<input required minLength="8" maxLength="30" value={telefonoCliente} onChange={(event) => setTelefonoCliente(event.target.value)} className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2.5 font-normal" type="tel" autoComplete="tel"/></label>
          <label className="block text-sm font-semibold text-slate-700">Nota para el negocio (opcional)<textarea maxLength="500" value={notaPedido} onChange={(event) => setNotaPedido(event.target.value)} rows="2" className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2.5 font-normal" placeholder="Horario o detalle de entrega"/></label>
          <p className="text-xs text-slate-500">El stock se vuelve a validar al enviar. El pedido queda pendiente; el negocio confirmará disponibilidad y pago.</p>
        </div>
        <footer className="flex justify-end gap-2 border-t border-slate-200 bg-slate-50 px-5 py-4"><button type="button" disabled={guardandoPedido} onClick={() => setCarritoAbierto(false)} className="rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-bold text-slate-600">Seguir mirando</button><button type="submit" disabled={guardandoPedido || itemsCarrito.length === 0} className="inline-flex items-center gap-2 rounded-lg bg-orange-500 px-5 py-2.5 text-sm font-bold text-white hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-60">{guardandoPedido ? <><LoaderCircle size={16} className="animate-spin"/>Enviando…</> : <><ShoppingCart size={16}/>Enviar pedido</>}</button></footer>
      </>}</form></div>}
  </main>;
}
