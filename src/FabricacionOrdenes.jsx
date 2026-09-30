import { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, ClipboardList, LoaderCircle, Plus, Search, X } from 'lucide-react';
import { supabase } from './supabaseClient';
import { useEmpresaInfo } from './utils/useEmpresa';
import { useUbicacionUsuario } from './utils/useUbicacion';

const dinero = (n) => Math.round(Number(n) || 0).toLocaleString('es-PY') + ' Gs';
const errorTexto = (e) => e?.message || 'No se pudo completar la operación.';

export default function FabricacionOrdenes() {
  const empresa = useEmpresaInfo();
  const ubicacionUsuario = useUbicacionUsuario();
  const [ordenes, setOrdenes] = useState([]);
  const [recetas, setRecetas] = useState([]);
  const [ubicaciones, setUbicaciones] = useState([]);
  const [centros, setCentros] = useState([]);
  const [etapas, setEtapas] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [form, setForm] = useState(null);
  const [busqueda, setBusqueda] = useState('');
  const [estadoFiltro, setEstadoFiltro] = useState('');
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState('');
  const [completar, setCompletar] = useState(null);
  const empresaId = empresa.id;
  const ubicacionId = ubicacionUsuario.id;
  const veTodas = ubicacionUsuario.ve_todas;
  const campo = 'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100';
  const btn = 'inline-flex items-center justify-center gap-2 rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-50';
  const btn2 = 'inline-flex items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50';
  const etiqueta = 'mb-1.5 block text-xs font-semibold text-slate-600';

  const cargar = useCallback(async () => {
    if (!empresaId) return;
    setCargando(true); setError('');
    const [o, r, u, c, e] = await Promise.all([
      supabase.from('fabricacion_ordenes_produccion').select('*').eq('empresa_id', empresaId).order('creado_en', { ascending: false }).limit(3000),
      supabase.from('fabricacion_recetas').select('id,nombre,producto_id,rendimiento').eq('empresa_id', empresaId).eq('activo', true).order('nombre'),
      supabase.from('ubicaciones_comerciales').select('id,nombre').eq('empresa_id', empresaId).eq('activo', true).order('nombre'),
      supabase.from('fabricacion_centros_trabajo').select('id,nombre').eq('empresa_id', empresaId).eq('activo', true).order('nombre'),
      supabase.from('fabricacion_etapas').select('id,nombre,orden').eq('empresa_id', empresaId).eq('activo', true).order('orden'),
    ]);
    const failed = [o, r, u, c, e].find((x) => x.error);
    if (failed) setError(['42P01','PGRST205'].includes(failed.error.code) || /fabricacion_ordenes/i.test(failed.error.message || '')
      ? 'Falta aplicar database/migration_fabricacion_ordenes.sql después de las migraciones de fabricación.'
      : errorTexto(failed.error));
    if (!o.error) setOrdenes(o.data || []);
    if (!r.error) setRecetas(r.data || []);
    if (!u.error) setUbicaciones((u.data || []).filter((x) => veTodas || !ubicacionId || x.id === ubicacionId));
    if (!c.error) setCentros(c.data || []);
    if (!e.error) setEtapas(e.data || []);
    setCargando(false);
  }, [empresaId, ubicacionId, veTodas]);

  useEffect(() => { cargar(); }, [cargar]);

  const visibles = useMemo(() => ordenes.filter((o) => {
    const texto = `${o.referencia} ${o.producto_nombre} ${o.receta_nombre}`.toLowerCase();
    return (!busqueda || texto.includes(busqueda.toLowerCase())) && (!estadoFiltro || o.estado === estadoFiltro);
  }), [ordenes, busqueda, estadoFiltro]);

  const guardar = async (ev) => {
    ev.preventDefault(); setGuardando(true); setError('');
    const { error: err } = await supabase.rpc('guardar_fabricacion_orden', {
      p_orden_id: form.id || null, p_receta_id: form.receta_id, p_ubicacion_id: form.ubicacion_id,
      p_cantidad: Number(form.cantidad), p_prioridad: form.prioridad, p_fecha_objetivo: form.fecha_objetivo || null,
      p_desperdicio: Number(form.desperdicio || 0), p_costo_adicional: Number(form.costo_adicional || 0), p_notas: form.notas || null,
    });
    setGuardando(false);
    if (err) { setError(errorTexto(err)); return; }
    setForm(null); setAviso('Orden guardada. El stock se modifica únicamente al completar la producción.'); await cargar();
  };

  const cambiarEstado = async (orden, estado) => {
    if (estado === 'Completado') { setCompletar({ orden, centro_id: '', etapa_id: '', operario: '' }); return; }
    setGuardando(true); setError('');
    const { error: err } = await supabase.rpc('actualizar_fabricacion_orden_estado', { p_orden_id: orden.id, p_estado: estado });
    setGuardando(false);
    if (err) setError(errorTexto(err)); else { setAviso('Estado de la orden actualizado.'); await cargar(); }
  };

  const confirmarCompletar = async (ev) => {
    ev.preventDefault(); setGuardando(true); setError('');
    const { error: err } = await supabase.rpc('completar_fabricacion_orden', {
      p_orden_id: completar.orden.id, p_centro_id: completar.centro_id || null,
      p_operario: completar.operario || null, p_etapa_id: completar.etapa_id || null,
    });
    setGuardando(false);
    if (err) { setError(errorTexto(err)); return; }
    setCompletar(null); setAviso('Orden completada: ingredientes consumidos, producto terminado agregado y costo actualizado.'); await cargar();
  };

  const estados = ['Planificado', 'En Proceso', 'Completado', 'Cancelado'];
  const nueva = () => setForm({ id: '', receta_id: '', ubicacion_id: ubicacionId || ubicaciones[0]?.id || '', cantidad: '1', desperdicio: '0', prioridad: 'Media', fecha_objetivo: '', costo_adicional: '0', notas: '' });

  return <section className="space-y-4">
    {error && <div role="alert" className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">{error}</div>}
    {aviso && <div role="status" className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800"><Check size={16} />{aviso}<button className="ml-auto" onClick={() => setAviso('')} aria-label="Cerrar aviso"><X size={16} /></button></div>}
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-lg font-bold">Órdenes de producción</h2><p className="text-sm text-slate-500">Planifica el trabajo. El inventario cambia cuando completas una orden.</p></div><button className={btn} disabled={cargando || !recetas.length || !ubicaciones.length} onClick={nueva}><Plus size={16} /> Nueva orden</button></div>
    <div className="flex flex-wrap gap-3"><label className="relative min-w-56 flex-1"><Search size={15} className="absolute left-3 top-2.5 text-slate-400" /><input className={campo + ' pl-9'} value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Buscar referencia o producto" /></label><select className={campo + ' max-w-52'} value={estadoFiltro} onChange={(e) => setEstadoFiltro(e.target.value)}><option value="">Todos los estados</option>{estados.map((s) => <option key={s}>{s}</option>)}</select><button className={btn2} onClick={cargar} disabled={cargando}>{cargando ? <LoaderCircle size={15} className="animate-spin" /> : 'Actualizar'}</button></div>
    <div className="overflow-x-auto rounded-xl border bg-white"><table className="min-w-[1050px] w-full text-left text-sm"><thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr>{['Fecha objetivo','Nro. orden','Producto / receta','Cantidad','Prioridad','Estado','Sucursal','Acciones'].map((x) => <th key={x} className="px-4 py-3">{x}</th>)}</tr></thead><tbody className="divide-y">{visibles.map((o) => <tr key={o.id}><td className="px-4 py-3">{o.fecha_objetivo ? new Date(o.fecha_objetivo + 'T12:00:00').toLocaleDateString('es-PY') : '—'}</td><td className="px-4 py-3 font-mono text-xs">{o.referencia}</td><td className="px-4 py-3 font-semibold">{o.producto_nombre}<div className="text-xs font-normal text-slate-500">{o.receta_nombre}</div></td><td className="px-4 py-3">{Number(o.cantidad).toLocaleString('es-PY')}<div className="text-xs text-slate-500">Desperdicio: {Number(o.cantidad_desperdiciada).toLocaleString('es-PY')}</div></td><td className="px-4 py-3">{o.prioridad}</td><td className="px-4 py-3">{o.estado}</td><td className="px-4 py-3">{o.ubicacion_nombre}</td><td className="px-4 py-3"><div className="flex flex-wrap gap-2">{o.estado === 'Planificado' && <><button className={btn2} disabled={guardando} onClick={() => setForm({ id:o.id, receta_id:o.receta_id, ubicacion_id:o.ubicacion_id, cantidad:String(o.cantidad), desperdicio:String(o.cantidad_desperdiciada), prioridad:o.prioridad, fecha_objetivo:o.fecha_objetivo || '', costo_adicional:String(o.costo_adicional || 0), notas:o.notas || '' })}>Editar</button><button className={btn2} disabled={guardando} onClick={() => cambiarEstado(o,'En Proceso')}>Iniciar</button></>}{o.estado === 'En Proceso' && <button className={btn} disabled={guardando} onClick={() => cambiarEstado(o,'Completado')}><Check size={14} /> Completar</button>}{['Planificado','En Proceso'].includes(o.estado) && <button className="rounded-lg border border-red-200 px-3 py-2 text-xs font-semibold text-red-700 disabled:opacity-50" disabled={guardando} onClick={() => cambiarEstado(o,'Cancelado')}>Cancelar</button>}{o.produccion_id && <span className="text-xs text-slate-500">Producción registrada</span>}</div></td></tr>)}{!cargando && !visibles.length && <tr><td colSpan="8" className="p-10 text-center text-slate-500"><ClipboardList className="mx-auto mb-2" size={20} />No hay órdenes para mostrar.</td></tr>}{cargando && <tr><td colSpan="8" className="p-10 text-center text-slate-500"><LoaderCircle className="mx-auto animate-spin" size={20} /></td></tr>}</tbody></table></div>

    {form && <div className="fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto bg-slate-950/50 p-3"><form onSubmit={guardar} className="my-4 w-full max-w-2xl space-y-4 rounded-2xl bg-white p-5 shadow-2xl"><div className="flex justify-between"><div><h3 className="text-lg font-bold">{form.id ? 'Editar orden' : 'Nueva orden de producción'}</h3><p className="text-sm text-slate-500">Guardar la orden no reserva ni descuenta existencias.</p></div><button type="button" onClick={() => setForm(null)} aria-label="Cerrar"><X size={18} /></button></div><div className="grid gap-3 sm:grid-cols-2"><label><span className={etiqueta}>Receta *</span><select required className={campo} value={form.receta_id} onChange={(e) => setForm({ ...form, receta_id:e.target.value })}><option value="">Selecciona</option>{recetas.map((r) => <option key={r.id} value={r.id}>{r.nombre}</option>)}</select></label><label><span className={etiqueta}>Sucursal *</span><select required className={campo} value={form.ubicacion_id} onChange={(e) => setForm({ ...form, ubicacion_id:e.target.value })}><option value="">Selecciona</option>{ubicaciones.map((u) => <option key={u.id} value={u.id}>{u.nombre}</option>)}</select></label><label><span className={etiqueta}>Cantidad *</span><input required className={campo} type="number" min="1" step="1" value={form.cantidad} onChange={(e) => setForm({ ...form, cantidad:e.target.value })} /></label><label><span className={etiqueta}>Prioridad</span><select className={campo} value={form.prioridad} onChange={(e) => setForm({ ...form, prioridad:e.target.value })}>{['Baja','Media','Alta','Urgente'].map((x) => <option key={x}>{x}</option>)}</select></label><label><span className={etiqueta}>Fecha objetivo</span><input className={campo} type="date" value={form.fecha_objetivo} onChange={(e) => setForm({ ...form, fecha_objetivo:e.target.value })} /></label><label><span className={etiqueta}>Cantidad desperdiciada</span><input className={campo} type="number" min="0" step="1" value={form.desperdicio} onChange={(e) => setForm({ ...form, desperdicio:e.target.value })} /></label><label><span className={etiqueta}>Costo adicional (Gs)</span><input className={campo} type="number" min="0" step="1" value={form.costo_adicional} onChange={(e) => setForm({ ...form, costo_adicional:e.target.value })} /></label><label className="sm:col-span-2"><span className={etiqueta}>Notas</span><textarea className={campo} maxLength="1000" rows="3" value={form.notas} onChange={(e) => setForm({ ...form, notas:e.target.value })} /></label></div><div className="flex justify-end gap-2 border-t pt-3"><button type="button" className={btn2} onClick={() => setForm(null)}>Cancelar</button><button className={btn} disabled={guardando}>{guardando ? <LoaderCircle size={16} className="animate-spin" /> : 'Guardar orden'}</button></div></form></div>}

    {completar && <div className="fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto bg-slate-950/50 p-3"><form onSubmit={confirmarCompletar} className="w-full max-w-lg space-y-4 rounded-2xl bg-white p-5 shadow-2xl"><div className="flex justify-between"><div><h3 className="text-lg font-bold">Completar {completar.orden.referencia}</h3><p className="text-sm text-slate-500">Esto consumirá los ingredientes y actualizará el stock y costo promedio.</p></div><button type="button" onClick={() => setCompletar(null)} aria-label="Cerrar"><X size={18} /></button></div><label className="block"><span className={etiqueta}>Centro de trabajo</span><select className={campo} value={completar.centro_id} onChange={(e) => setCompletar({ ...completar, centro_id:e.target.value })}><option value="">Sin asignar</option>{centros.map((x) => <option key={x.id} value={x.id}>{x.nombre}</option>)}</select></label><label className="block"><span className={etiqueta}>Etapa</span><select className={campo} value={completar.etapa_id} onChange={(e) => setCompletar({ ...completar, etapa_id:e.target.value })}><option value="">Sin asignar</option>{etapas.map((x) => <option key={x.id} value={x.id}>{x.nombre}</option>)}</select></label><label className="block"><span className={etiqueta}>Operario</span><input className={campo} maxLength="120" value={completar.operario} onChange={(e) => setCompletar({ ...completar, operario:e.target.value })} /></label><div className="flex justify-end gap-2 border-t pt-3"><button type="button" className={btn2} onClick={() => setCompletar(null)}>Volver</button><button className={btn} disabled={guardando}>{guardando ? <LoaderCircle size={16} className="animate-spin" /> : 'Confirmar producción'}</button></div></form></div>}
  </section>;
}
