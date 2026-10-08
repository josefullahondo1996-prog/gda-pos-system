import { useEffect, useMemo, useState } from 'react';
import { BadgePercent, CalendarDays, LoaderCircle, Plus, RefreshCw, Save, Trash2, X } from 'lucide-react';
import { supabase } from './supabaseClient';
import { useEmpresaInfo } from './utils/useEmpresa';
import { useNotificacion } from './NotificacionContext';

const vacio = { nombre: '', fecha_inicio: '', fecha_fin: '', tipo: 'porcentaje', valor: '', prioridad: 1, marca: '', categoria: '', activo: true };
const fechaLocal = (valor) => valor ? new Date(valor).toLocaleString('es-PY') : 'Sin límite';

export default function DescuentosVentas({ perfilUsuario }) {
  const { id: empresaId } = useEmpresaInfo();
  const { notificar, confirmar } = useNotificacion();
  const esAdmin = (perfilUsuario?.roles?.nombre || '').toLowerCase().includes('admin');
  const puedeAdministrar = esAdmin || !perfilUsuario?.roles?.permisos || perfilUsuario.roles.permisos.ventas_pos?.['Aplicar descuentos'] === true;
  const [reglas, setReglas] = useState([]);
  const [productos, setProductos] = useState([]);
  const [ubicaciones, setUbicaciones] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [form, setForm] = useState(null);
  const [productoIds, setProductoIds] = useState([]);
  const [ubicacionIds, setUbicacionIds] = useState([]);
  const [busquedaProducto, setBusquedaProducto] = useState('');
  const [error, setError] = useState('');

  const cargar = async () => {
    if (!empresaId) return;
    setCargando(true); setError('');
    const [r, p, u] = await Promise.all([
      supabase.from('descuentos_ventas').select('*').eq('empresa_id', empresaId).order('prioridad', { ascending: false }).order('nombre'),
      supabase.from('productos').select('id,nombre,codigo,marca,categoria').eq('empresa_id', empresaId).order('nombre').limit(3000),
      supabase.from('ubicaciones_comerciales').select('id,nombre,activo').eq('empresa_id', empresaId).order('nombre'),
    ]);
    if (r.error) setError(r.error.message);
    else setReglas(r.data || []);
    if (!p.error) setProductos(p.data || []);
    if (!u.error) setUbicaciones((u.data || []).filter((item) => item.activo !== false));
    setCargando(false);
  };

  useEffect(() => { cargar(); }, [empresaId]);

  const productosFiltrados = useMemo(() => {
    const q = busquedaProducto.trim().toLocaleLowerCase('es');
    return (q ? productos.filter((p) => `${p.nombre} ${p.codigo || ''}`.toLocaleLowerCase('es').includes(q)) : productos).slice(0, 100);
  }, [productos, busquedaProducto]);

  const abrirNuevo = () => { setError(''); setProductoIds([]); setUbicacionIds([]); setForm({ ...vacio }); };
  const abrirEditar = (regla) => {
    setError(''); setProductoIds(regla.producto_ids || []); setUbicacionIds(regla.ubicacion_ids || []);
    setForm({ ...regla, fecha_inicio: regla.fecha_inicio ? regla.fecha_inicio.slice(0, 16) : '', fecha_fin: regla.fecha_fin ? regla.fecha_fin.slice(0, 16) : '' });
  };

  const guardar = async (event) => {
    event.preventDefault();
    if (!empresaId || !puedeAdministrar || !form) return;
    const valor = Number(form.valor);
    if (!form.nombre.trim() || !Number.isFinite(valor) || valor <= 0 || (form.tipo === 'porcentaje' && valor > 100)) {
      setError('Ingresá un nombre y un descuento válido. El porcentaje debe estar entre 0 y 100.'); return;
    }
    if (form.fecha_inicio && form.fecha_fin && new Date(form.fecha_fin) <= new Date(form.fecha_inicio)) {
      setError('La fecha de término debe ser posterior a la fecha de inicio.'); return;
    }
    const datos = {
      empresa_id: empresaId,
      nombre: form.nombre.trim(),
      fecha_inicio: form.fecha_inicio ? new Date(form.fecha_inicio).toISOString() : null,
      fecha_fin: form.fecha_fin ? new Date(form.fecha_fin).toISOString() : null,
      tipo: form.tipo, valor, prioridad: Math.max(0, Math.floor(Number(form.prioridad) || 0)),
      marca: form.marca.trim() || null, categoria: form.categoria.trim() || null,
      producto_ids: productoIds, ubicacion_ids: ubicacionIds, activo: form.activo !== false,
      actualizado_en: new Date().toISOString(),
    };
    setGuardando(true); setError('');
    const result = form.id
      ? await supabase.from('descuentos_ventas').update(datos).eq('id', form.id).eq('empresa_id', empresaId)
      : await supabase.from('descuentos_ventas').insert(datos);
    setGuardando(false);
    if (result.error) { setError(result.error.message); return; }
    notificar.exito(form.id ? 'Descuento actualizado.' : 'Descuento creado.');
    setForm(null); await cargar();
  };

  const cambiarEstado = async (regla) => {
    const { error: errorCambio } = await supabase.from('descuentos_ventas').update({ activo: !regla.activo, actualizado_en: new Date().toISOString() }).eq('id', regla.id).eq('empresa_id', empresaId);
    if (errorCambio) return notificar.error(errorCambio.message);
    setReglas((items) => items.map((item) => item.id === regla.id ? { ...item, activo: !item.activo } : item));
  };

  const eliminar = async (regla) => {
    if (!(await confirmar(`¿Eliminar el descuento “${regla.nombre}”?`, { titulo: 'Eliminar descuento', textoConfirmar: 'Eliminar', textoCancelar: 'Cancelar', peligroso: true }))) return;
    const { error: errorBorrar } = await supabase.from('descuentos_ventas').delete().eq('id', regla.id).eq('empresa_id', empresaId);
    if (errorBorrar) return notificar.error(errorBorrar.message);
    setReglas((items) => items.filter((item) => item.id !== regla.id));
  };

  const alcance = (regla) => {
    const partes = [];
    if (regla.marca) partes.push(`Marca: ${regla.marca}`);
    if (regla.categoria) partes.push(`Categoría: ${regla.categoria}`);
    if (regla.producto_ids?.length) partes.push(`${regla.producto_ids.length} producto(s)`);
    if (regla.ubicacion_ids?.length) partes.push(`${regla.ubicacion_ids.length} sucursal(es)`);
    return partes.join(' · ') || 'Todos los productos y sucursales';
  };

  return <main className="mx-auto max-w-7xl space-y-5 text-slate-800">
    <header className="flex flex-wrap items-end justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-widest text-orange-600">Ventas</p><h1 className="mt-1 text-2xl font-black">Descuentos</h1><p className="mt-1 text-sm text-slate-500">Reglas promocionales por producto, marca, categoría, fechas y sucursal.</p></div><div className="flex gap-2"><button onClick={cargar} className="rounded-lg border border-slate-200 bg-white p-2.5 text-slate-600" aria-label="Actualizar"><RefreshCw size={17}/></button>{puedeAdministrar && <button onClick={abrirNuevo} className="inline-flex items-center gap-2 rounded-lg bg-orange-500 px-4 py-2.5 text-sm font-bold text-white"><Plus size={17}/>Nuevo descuento</button>}</div></header>
    {!puedeAdministrar && <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">Tu rol puede consultar los descuentos, pero no administrarlos.</div>}
    {error && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</div>}
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm"><div className="flex items-center gap-2 border-b border-slate-100 p-4"><BadgePercent size={18} className="text-orange-500"/><h2 className="font-bold">Promociones configuradas</h2><span className="ml-auto text-xs text-slate-500">{reglas.length} regla(s)</span></div>
      {cargando ? <div className="p-10 text-center text-slate-500">Cargando descuentos…</div> : reglas.length === 0 ? <div className="p-10 text-center text-sm text-slate-500">No hay descuentos configurados.</div> : <div className="overflow-x-auto"><table className="w-full min-w-[850px] text-left text-sm"><thead className="bg-slate-50 text-[10px] uppercase text-slate-500"><tr><th className="px-4 py-3">Nombre / alcance</th><th className="px-4 py-3">Vigencia</th><th className="px-4 py-3">Descuento</th><th className="px-4 py-3">Prioridad</th><th className="px-4 py-3">Estado</th><th className="px-4 py-3">Acciones</th></tr></thead><tbody className="divide-y divide-slate-100">{reglas.map((regla) => <tr key={regla.id} className={regla.activo ? '' : 'bg-slate-50 text-slate-500'}><td className="px-4 py-3"><div className="font-semibold">{regla.nombre}</div><div className="mt-1 text-xs text-slate-500">{alcance(regla)}</div></td><td className="px-4 py-3 text-xs"><div>{fechaLocal(regla.fecha_inicio)}</div><div className="mt-1">{fechaLocal(regla.fecha_fin)}</div></td><td className="px-4 py-3 font-bold">{regla.tipo === 'porcentaje' ? `${regla.valor}%` : `Gs ${Number(regla.valor).toLocaleString('es-PY')}`}</td><td className="px-4 py-3">{regla.prioridad}</td><td className="px-4 py-3"><span className={`rounded-full px-2.5 py-1 text-xs font-bold ${regla.activo ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-600'}`}>{regla.activo ? 'Activo' : 'Inactivo'}</span></td><td className="px-4 py-3"><div className="flex gap-2">{puedeAdministrar && <><button onClick={() => abrirEditar(regla)} className="rounded-md border px-2.5 py-1.5 text-xs font-semibold">Editar</button><button onClick={() => cambiarEstado(regla)} className="rounded-md border px-2.5 py-1.5 text-xs font-semibold">{regla.activo ? 'Desactivar' : 'Activar'}</button><button onClick={() => eliminar(regla)} className="rounded-md border border-red-200 px-2.5 py-1.5 text-xs text-red-700" aria-label={`Eliminar ${regla.nombre}`}><Trash2 size={14}/></button></>}</div></td></tr>)}</tbody></table></div>}
    </section>
    {form && <div className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto bg-slate-950/50 p-3 sm:items-center"><form onSubmit={guardar} className="my-4 w-full max-w-3xl space-y-4 rounded-2xl bg-white p-5 shadow-2xl"><div className="flex items-start justify-between"><div><h2 className="text-lg font-black">{form.id ? 'Editar descuento' : 'Nuevo descuento'}</h2><p className="mt-1 text-xs text-slate-500">Las reglas se guardan para esta empresa y no cambian ventas existentes.</p></div><button type="button" onClick={() => setForm(null)} aria-label="Cerrar"><X size={19}/></button></div>
      {error && <div role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</div>}
      <div className="grid gap-3 sm:grid-cols-2"><label className="text-xs font-bold">Nombre<input required maxLength={120} value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} className="mt-1 block w-full rounded-lg border p-2.5 text-sm font-normal"/></label><label className="text-xs font-bold">Prioridad (mayor primero)<input type="number" min="0" step="1" value={form.prioridad} onChange={(e) => setForm({ ...form, prioridad: e.target.value })} className="mt-1 block w-full rounded-lg border p-2.5 text-sm font-normal"/></label><label className="text-xs font-bold">Tipo<select value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value })} className="mt-1 block w-full rounded-lg border bg-white p-2.5 text-sm font-normal"><option value="porcentaje">Porcentaje (%)</option><option value="monto">Monto fijo (Gs por unidad)</option></select></label><label className="text-xs font-bold">Importe<input required type="number" min="0.01" max={form.tipo === 'porcentaje' ? 100 : undefined} step="0.01" value={form.valor} onChange={(e) => setForm({ ...form, valor: e.target.value })} className="mt-1 block w-full rounded-lg border p-2.5 text-sm font-normal"/></label><label className="text-xs font-bold">Empieza a (opcional)<span className="mt-1 flex items-center gap-2 rounded-lg border px-2"><CalendarDays size={15} className="text-slate-400"/><input type="datetime-local" value={form.fecha_inicio || ''} onChange={(e) => setForm({ ...form, fecha_inicio: e.target.value })} className="w-full py-2 text-sm font-normal"/></span></label><label className="text-xs font-bold">Termina (opcional)<span className="mt-1 flex items-center gap-2 rounded-lg border px-2"><CalendarDays size={15} className="text-slate-400"/><input type="datetime-local" value={form.fecha_fin || ''} onChange={(e) => setForm({ ...form, fecha_fin: e.target.value })} className="w-full py-2 text-sm font-normal"/></span></label><label className="text-xs font-bold">Marca (opcional)<input maxLength={120} value={form.marca || ''} onChange={(e) => setForm({ ...form, marca: e.target.value })} className="mt-1 block w-full rounded-lg border p-2.5 text-sm font-normal"/></label><label className="text-xs font-bold">Categoría (opcional)<input maxLength={120} value={form.categoria || ''} onChange={(e) => setForm({ ...form, categoria: e.target.value })} className="mt-1 block w-full rounded-lg border p-2.5 text-sm font-normal"/></label></div>
      <div className="grid gap-3 sm:grid-cols-2"><fieldset className="rounded-lg border p-3"><legend className="px-1 text-xs font-bold">Productos específicos (opcional)</legend><input value={busquedaProducto} onChange={(e) => setBusquedaProducto(e.target.value)} placeholder="Buscar nombre o código" className="mb-2 w-full rounded border p-2 text-sm"/><div className="max-h-36 space-y-1 overflow-auto">{productosFiltrados.map((p) => <label key={p.id} className="flex items-center gap-2 text-xs"><input type="checkbox" checked={productoIds.includes(p.id)} onChange={(e) => setProductoIds((ids) => e.target.checked ? [...ids, p.id] : ids.filter((id) => id !== p.id))}/><span>{p.nombre} <span className="text-slate-400">{p.codigo || ''}</span></span></label>)}</div><p className="mt-2 text-[10px] text-slate-500">Sin selección, puede aplicar a todos los productos que cumplan los demás filtros.</p></fieldset><fieldset className="rounded-lg border p-3"><legend className="px-1 text-xs font-bold">Sucursales (opcional)</legend><div className="max-h-44 space-y-2 overflow-auto">{ubicaciones.map((u) => <label key={u.id} className="flex items-center gap-2 text-xs"><input type="checkbox" checked={ubicacionIds.includes(u.id)} onChange={(e) => setUbicacionIds((ids) => e.target.checked ? [...ids, u.id] : ids.filter((id) => id !== u.id))}/>{u.nombre}</label>)}</div><p className="mt-2 text-[10px] text-slate-500">Sin selección, la regla no limita sucursal.</p></fieldset></div>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.activo !== false} onChange={(e) => setForm({ ...form, activo: e.target.checked })}/>Descuento activo</label>
      <div className="flex justify-end gap-2 border-t pt-3"><button type="button" onClick={() => setForm(null)} className="rounded-lg border px-4 py-2 text-sm">Cancelar</button><button disabled={guardando} className="inline-flex items-center gap-2 rounded-lg bg-orange-500 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">{guardando ? <LoaderCircle size={16} className="animate-spin"/> : <Save size={16}/>}Guardar regla</button></div>
    </form></div>}
  </main>;
}
