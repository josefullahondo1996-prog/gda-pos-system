import { useEffect, useMemo, useState } from 'react';
import { supabase } from './supabaseClient';
import { useEmpresaInfo } from './utils/useEmpresa';
import { useNotificacion } from './NotificacionContext';
import { QRCodeSVG } from 'qrcode.react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ExternalLink, Copy, Download, Plus, Search, QrCode, Pencil, Pause, Play, Trash2, X, Save } from 'lucide-react';

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
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-bold text-slate-800">Mis catálogos <span className="ml-2 rounded-full bg-slate-100 px-2 py-1 text-xs text-slate-500">{catalogos.length}</span></h2><p className="mt-1 text-xs text-slate-500">Los enlaces públicos solo exponen productos, precio y disponibilidad.</p></div><label className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2"><Search size={16} className="text-slate-400"/><input value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Buscar catálogo..." className="w-48 text-sm outline-none"/></label></div>
        {errorCarga && <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">{errorCarga}<div className="mt-1 text-xs">Archivo de migración: database/migration_catalogo_qr.sql</div></div>}
        <div className="overflow-x-auto"><table className="w-full min-w-[880px] text-left text-sm"><thead><tr className="border-y border-slate-100 text-[11px] uppercase tracking-wide text-slate-500"><th className="px-3 py-3">Catálogo</th><th className="px-3 py-3">Enlace público</th><th className="px-3 py-3">Estado</th><th className="px-3 py-3">Vistas</th><th className="px-3 py-3">Expira</th><th className="px-3 py-3 text-right">Acciones</th></tr></thead><tbody className="divide-y divide-slate-100">{visibles.map((c) => <tr key={c.id}><td className="px-3 py-4"><div className="font-semibold text-slate-800">{c.nombre}</div>{c.descripcion && <div className="max-w-56 truncate text-xs text-slate-500">{c.descripcion}</div>}</td><td className="px-3 py-4"><button onClick={() => copiar(c)} className="inline-flex max-w-60 items-center gap-1 truncate text-xs font-medium text-blue-700 hover:underline"><span className="truncate">{urlPublica(c.public_token)}</span><Copy size={13}/></button></td><td className="px-3 py-4"><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${c.estado === 'Activo' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>{c.estado}</span></td><td className="px-3 py-4 font-medium text-slate-700">{c.vistas || 0}</td><td className="px-3 py-4 text-slate-600">{c.expira_el ? new Date(`${c.expira_el}T00:00:00`).toLocaleDateString('es-PY') : 'Sin vencimiento'}</td><td className="px-3 py-4"><div className="flex justify-end gap-1"><button title="Ver catálogo" onClick={() => window.open(urlPublica(c.public_token), '_blank', 'noopener,noreferrer')} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"><ExternalLink size={16}/></button><button title="Mostrar QR" onClick={() => setQr(c)} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"><QrCode size={16}/></button><button title="Descargar QR" onClick={() => descargarQR(c)} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"><Download size={16}/></button><button title="Editar" onClick={() => abrirEdicion(c)} className="rounded-lg p-2 text-blue-600 hover:bg-blue-50"><Pencil size={16}/></button><button title={c.estado === 'Activo' ? 'Pausar' : 'Activar'} onClick={() => alternar(c)} className="rounded-lg p-2 text-amber-600 hover:bg-amber-50">{c.estado === 'Activo' ? <Pause size={16}/> : <Play size={16}/>}</button><button title="Eliminar" onClick={() => eliminar(c)} className="rounded-lg p-2 text-red-500 hover:bg-red-50"><Trash2 size={16}/></button></div></td></tr>)}{!cargando && visibles.length === 0 && <tr><td colSpan="6" className="py-12 text-center text-slate-400">No hay catálogos todavía. Creá uno para publicar tu primer catálogo QR.</td></tr>}</tbody></table>{cargando && <div className="py-10 text-center text-sm text-slate-400">Cargando catálogos...</div>}</div>
      </section>
    </div>

    {modal && <div className="fixed inset-0 z-[90] flex items-center justify-center overflow-y-auto bg-slate-950/60 p-3 backdrop-blur-sm"><form onSubmit={guardar} className="my-auto max-h-[95vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-white shadow-2xl"><div className="sticky top-0 z-10 flex items-center justify-between border-b bg-white px-5 py-4"><div><h2 className="font-bold text-slate-900">{editando ? 'Editar catálogo' : 'Nuevo catálogo'}</h2><p className="text-xs text-slate-500">Datos básicos, filtros y personalización del QR</p></div><button type="button" onClick={() => setModal(false)} className="rounded-lg p-2 hover:bg-slate-100"><X size={18}/></button></div>
      <div className="grid gap-5 p-5 md:grid-cols-2"><div className="space-y-3 md:col-span-2"><h3 className="font-semibold text-slate-800">Datos básicos</h3><div className="grid gap-3 md:grid-cols-2"><label className="text-xs font-semibold text-slate-600">Nombre *<input required maxLength="100" value={form.nombre} onChange={(e) => setForm({...form,nombre:e.target.value})} className="mt-1 w-full rounded-lg border p-2.5 text-sm" placeholder="Ej.: Catálogo de repuestos"/></label><label className="text-xs font-semibold text-slate-600">Estado<select value={form.estado} onChange={(e) => setForm({...form,estado:e.target.value})} className="mt-1 w-full rounded-lg border p-2.5 text-sm"><option>Activo</option><option>Pausado</option></select></label><label className="text-xs font-semibold text-slate-600">Expira el<input type="date" value={form.expira_el} onChange={(e) => setForm({...form,expira_el:e.target.value})} className="mt-1 w-full rounded-lg border p-2.5 text-sm"/></label><label className="text-xs font-semibold text-slate-600">WhatsApp del vendedor<input value={form.whatsapp} onChange={(e) => setForm({...form,whatsapp:e.target.value})} className="mt-1 w-full rounded-lg border p-2.5 text-sm" placeholder="595981234567"/></label><label className="text-xs font-semibold text-slate-600 md:col-span-2">Descripción<textarea value={form.descripcion || ''} onChange={(e) => setForm({...form,descripcion:e.target.value})} rows="2" className="mt-1 w-full rounded-lg border p-2.5 text-sm"/></label><label className="text-xs font-semibold text-slate-600 md:col-span-2">Mensaje de bienvenida<textarea value={form.mensaje_bienvenida || ''} onChange={(e) => setForm({...form,mensaje_bienvenida:e.target.value})} rows="2" className="mt-1 w-full rounded-lg border p-2.5 text-sm" placeholder="Consultanos disponibilidad por WhatsApp"/></label></div></div>
      <div className="space-y-3"><h3 className="font-semibold text-slate-800">Qué productos mostrar</h3><label className="block text-xs font-semibold text-slate-600">Sucursal<select value={form.ubicacion_id} onChange={(e) => setForm({...form,ubicacion_id:e.target.value})} className="mt-1 w-full rounded-lg border p-2.5 text-sm"><option value="">Todas las sucursales</option>{ubicaciones.map((u) => <option key={u.id} value={u.id}>{u.nombre}</option>)}</select></label><div className="grid grid-cols-2 gap-2"><label className="text-xs font-semibold text-slate-600">Precio mínimo<input type="number" min="0" value={form.precio_min} onChange={(e) => setForm({...form,precio_min:e.target.value})} className="mt-1 w-full rounded-lg border p-2.5 text-sm"/></label><label className="text-xs font-semibold text-slate-600">Precio máximo<input type="number" min="0" value={form.precio_max} onChange={(e) => setForm({...form,precio_max:e.target.value})} className="mt-1 w-full rounded-lg border p-2.5 text-sm"/></label></div><label className="block text-xs font-semibold text-slate-600">Categorías <span className="font-normal">(vacío = todas)</span><select multiple value={form.categoria} onChange={(e) => setForm({...form,categoria:[...e.target.selectedOptions].map((x)=>x.value)})} className="mt-1 h-32 w-full rounded-lg border p-2 text-sm">{categorias.map((x)=><option key={x}>{x}</option>)}</select></label><label className="block text-xs font-semibold text-slate-600">Marcas <span className="font-normal">(vacío = todas)</span><select multiple value={form.marca} onChange={(e) => setForm({...form,marca:[...e.target.selectedOptions].map((x)=>x.value)})} className="mt-1 h-32 w-full rounded-lg border p-2 text-sm">{marcas.map((x)=><option key={x}>{x}</option>)}</select></label></div>
      <div className="space-y-3"><h3 className="font-semibold text-slate-800">Personalización y QR</h3><label className="block text-xs font-semibold text-slate-600">Color del catálogo<input type="color" value={form.color} onChange={(e)=>setForm({...form,color:e.target.value})} className="mt-1 h-10 w-full rounded-lg border p-1"/></label><label className="block text-xs font-semibold text-slate-600">Color del código QR<input type="color" value={form.qr_color} onChange={(e)=>setForm({...form,qr_color:e.target.value})} className="mt-1 h-10 w-full rounded-lg border p-1"/></label><label className="block text-xs font-semibold text-slate-600">Título del QR<input value={form.qr_titulo} onChange={(e)=>setForm({...form,qr_titulo:e.target.value})} className="mt-1 w-full rounded-lg border p-2.5 text-sm"/></label><label className="block text-xs font-semibold text-slate-600">Subtítulo del QR<input value={form.qr_subtitulo} onChange={(e)=>setForm({...form,qr_subtitulo:e.target.value})} className="mt-1 w-full rounded-lg border p-2.5 text-sm"/></label><p className="rounded-lg bg-amber-50 p-3 text-xs text-amber-900">El enlace público muestra el precio y disponibilidad para informar. No registra pedidos ni modifica existencias.</p></div></div>
      <div className="sticky bottom-0 flex justify-end gap-2 border-t bg-white p-4"><button type="button" onClick={()=>setModal(false)} className="rounded-lg border px-4 py-2 text-sm font-semibold">Cancelar</button><button disabled={guardando} className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-bold text-white disabled:opacity-60"><Save size={16}/>{guardando?'Guardando...':'Guardar catálogo'}</button></div></form></div>}
    {qr && <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/60 p-4" onClick={()=>setQr(null)}><div className="w-full max-w-sm rounded-2xl bg-white p-6 text-center shadow-2xl" onClick={(e)=>e.stopPropagation()}><button onClick={()=>setQr(null)} className="float-right rounded p-1 hover:bg-slate-100"><X size={18}/></button><h3 className="mt-2 font-bold text-slate-900">{qr.qr_titulo || qr.nombre}</h3><p className="text-sm text-slate-500">{qr.qr_subtitulo || 'Escaneá para ver el catálogo'}</p><QRCodeSVG value={urlPublica(qr.public_token)} size={256} level="H" includeMargin fgColor={qr.qr_color || '#111827'} className="mx-auto my-4"/><div className="flex justify-center gap-2"><button onClick={()=>copiar(qr)} className="rounded-lg border px-3 py-2 text-sm font-semibold">Copiar enlace</button><button onClick={()=>descargarQR(qr)} className="inline-flex items-center gap-1 rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white"><Download size={15}/> Descargar SVG</button></div></div></div>}
  </div>;
}

export function CatalogoQRPublico() {
  const token = window.location.pathname.split('/').filter(Boolean).at(-1);
  const [catalogo, setCatalogo] = useState(null); const [cargando, setCargando] = useState(true); const [busqueda, setBusqueda] = useState('');
  useEffect(() => { let vivo = true; supabase.rpc('obtener_catalogo_qr_publico', { p_token: token }).then(({ data }) => { if (vivo) { setCatalogo(data); setCargando(false); } }); return () => { vivo = false; }; }, [token]);
  const productos = (catalogo?.productos || []).filter((p) => `${p.nombre} ${p.codigo || ''} ${p.categoria || ''}`.toLowerCase().includes(busqueda.toLowerCase()));
  const whatsapp = catalogo?.whatsapp?.replace(/\D/g, '');
  if (cargando) return <main className="grid min-h-screen place-items-center bg-slate-50 text-slate-500">Cargando catálogo...</main>;
  if (!catalogo) return <main className="grid min-h-screen place-items-center bg-slate-50 p-6 text-center"><div><QrCode className="mx-auto mb-3 text-slate-300" size={44}/><h1 className="text-xl font-bold text-slate-800">Este catálogo no está disponible</h1><p className="mt-1 text-sm text-slate-500">El enlace pudo haber vencido o el catálogo fue pausado.</p></div></main>;
  return <main className="min-h-screen bg-slate-50" style={{'--catalog-color':catalogo.color || '#f59e0b'}}><header className="bg-slate-950 px-5 py-10 text-white" style={{borderBottom:`5px solid ${catalogo.color || '#f59e0b'}`}}><div className="mx-auto max-w-6xl"><p className="text-sm font-semibold text-amber-300">{catalogo.empresa}</p><h1 className="mt-2 text-3xl font-extrabold">{catalogo.nombre}</h1>{catalogo.descripcion && <p className="mt-2 max-w-2xl text-slate-300">{catalogo.descripcion}</p>}{catalogo.bienvenida && <p className="mt-3 text-sm text-slate-200">{catalogo.bienvenida}</p>}<div className="mt-5 flex max-w-xl items-center gap-2 rounded-xl bg-white px-3 py-2 text-slate-500"><Search size={18}/><input value={busqueda} onChange={(e)=>setBusqueda(e.target.value)} placeholder="Buscar productos..." className="w-full text-sm outline-none"/></div></div></header><section className="mx-auto max-w-6xl px-4 py-7"><p className="mb-4 text-sm text-slate-500">{productos.length} productos</p><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">{productos.map((p)=><article key={p.id} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"><div className="grid h-48 place-items-center bg-slate-100">{p.imagen ? <img src={p.imagen} alt={p.nombre} className="h-full w-full object-contain"/> : <QrCode className="text-slate-300" size={44}/>}</div><div className="p-4"><div className="text-xs font-semibold uppercase tracking-wide text-slate-400">{p.categoria || p.marca || 'Producto'}</div><h2 className="mt-1 line-clamp-2 min-h-12 font-bold text-slate-800">{p.nombre}</h2>{p.codigo && <p className="text-xs text-slate-400">Código: {p.codigo}</p>}<div className="mt-3 flex items-end justify-between gap-2"><span className="text-lg font-extrabold text-slate-900">{moneda(p.precio)}</span><span className={`text-xs font-semibold ${p.disponible?'text-emerald-700':'text-slate-400'}`}>{p.disponible?'Disponible':'Consultar disponibilidad'}</span></div>{whatsapp && <a target="_blank" rel="noreferrer" href={`https://wa.me/${whatsapp}?text=${encodeURIComponent(`Hola, consulto por ${p.nombre}${p.codigo ? ` (${p.codigo})` : ''}.`)}`} className="mt-4 block rounded-lg bg-emerald-600 px-3 py-2 text-center text-sm font-bold text-white hover:bg-emerald-700">Consultar por WhatsApp</a>}</div></article>)}</div>{productos.length===0 && <div className="rounded-xl border border-dashed p-12 text-center text-slate-400">No hay productos que coincidan con la búsqueda.</div>}</section><footer className="pb-8 text-center text-xs text-slate-400">Catálogo digital · {catalogo.empresa}</footer></main>;
}
