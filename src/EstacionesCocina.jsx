import { useEffect, useMemo, useState } from 'react';
import { ChefHat, Plus, Save, Trash2 } from 'lucide-react';
import { supabase } from './supabaseClient';
import { useEmpresaInfo } from './utils/useEmpresa';
import { notificarConfiguracionEmpresaActualizada, useConfiguracionEmpresa } from './utils/useConfiguracionEmpresa';
import { useNotificacion } from './NotificacionContext';

export default function EstacionesCocina() {
  const { id: empresaId } = useEmpresaInfo();
  const { ajustes, cargando } = useConfiguracionEmpresa(empresaId);
  const { notificar } = useNotificacion();
  const [estaciones, setEstaciones] = useState([]);
  const [categorias, setCategorias] = useState([]);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    setEstaciones(Array.isArray(ajustes.restaurante_estaciones) ? ajustes.restaurante_estaciones : []);
  }, [ajustes.restaurante_estaciones]);

  useEffect(() => {
    if (!empresaId) return;
    let vigente = true;
    supabase.from('productos').select('categoria').eq('empresa_id', empresaId).eq('activo', true).then(({ data, error }) => {
      if (!vigente) return;
      if (error) return notificar.error(`No se pudieron cargar las categorías de productos: ${error.message}`);
      setCategorias([...new Set((data || []).map((item) => item.categoria?.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es')));
    });
    return () => { vigente = false; };
  }, [empresaId]);

  const categoriasUsadas = useMemo(() => new Set(estaciones.flatMap((estacion) => estacion.categorias || [])), [estaciones]);
  const editar = (id, cambios) => setEstaciones((actuales) => actuales.map((estacion) => estacion.id === id ? { ...estacion, ...cambios } : estacion));
  const agregar = () => setEstaciones((actuales) => [...actuales, { id: crypto.randomUUID(), nombre: '', categorias: [] }]);
  const guardar = async (event) => {
    event.preventDefault();
    if (estaciones.some((estacion) => !estacion.nombre.trim() || !(estacion.categorias || []).length)) return notificar.error('Cada estación necesita un nombre y al menos una categoría.');
    const asignadas = estaciones.flatMap((estacion) => estacion.categorias || []);
    if (new Set(asignadas).size !== asignadas.length) return notificar.error('Asigná cada categoría a una sola estación para evitar duplicar comandas.');
    setGuardando(true);
    const { data: empresa, error: leerError } = await supabase.from('empresas').select('configuracion').eq('id', empresaId).maybeSingle();
    if (leerError || !empresa) { setGuardando(false); return notificar.error(`No se pudo leer la configuración de la empresa: ${leerError?.message || 'Empresa no encontrada'}`); }
    const configuracion = empresa.configuracion && typeof empresa.configuracion === 'object' ? empresa.configuracion : {};
    const { error } = await supabase.from('empresas').update({ configuracion: { ...configuracion, version: 1, ajustes: { ...(configuracion.ajustes || {}), restaurante_estaciones: estaciones.map((estacion) => ({ ...estacion, nombre: estacion.nombre.trim() })) } } }).eq('id', empresaId);
    setGuardando(false);
    if (error) return notificar.error(`No se pudieron guardar las estaciones: ${error.message}`);
    notificarConfiguracionEmpresaActualizada(empresaId);
    notificar.exito('Estaciones de cocina guardadas.');
  };

  return <section className="space-y-4">
    <header className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="flex items-center gap-2 text-xl font-black text-slate-900"><ChefHat size={22} className="text-orange-600"/>Estaciones de Cocina</h2><p className="mt-1 text-sm text-slate-600">Organizá la comanda por áreas y asigná cada categoría a una estación.</p></div><button type="button" onClick={agregar} className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-3 py-2.5 text-sm font-bold text-white"><Plus size={16}/>Agregar estación</button></header>
    <form onSubmit={guardar} className="space-y-3">
      {cargando ? <div className="rounded-xl border bg-white p-8 text-center text-slate-500">Cargando configuración…</div> : estaciones.map((estacion) => <article key={estacion.id} className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4 md:grid-cols-[minmax(180px,1fr)_2fr_auto] md:items-start">
        <label className="text-xs font-bold uppercase tracking-wide text-slate-500">Nombre de estación<input required maxLength={60} value={estacion.nombre} onChange={(event) => editar(estacion.id, { nombre: event.target.value })} placeholder="Ej.: Cocina caliente" className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm font-medium normal-case text-slate-900"/></label>
        <fieldset><legend className="text-xs font-bold uppercase tracking-wide text-slate-500">Categorías asignadas</legend><div className="mt-1.5 flex flex-wrap gap-2">{categorias.map((categoria) => { const seleccionada = (estacion.categorias || []).includes(categoria); const yaAsignada = categoriasUsadas.has(categoria) && !seleccionada; return <label key={categoria} className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold ${seleccionada ? 'border-orange-300 bg-orange-50 text-orange-900' : 'border-slate-200 text-slate-700'}`}><input type="checkbox" checked={seleccionada} disabled={yaAsignada} onChange={(event) => editar(estacion.id, { categorias: event.target.checked ? [...(estacion.categorias || []), categoria] : (estacion.categorias || []).filter((item) => item !== categoria) })} className="accent-orange-600"/>{categoria}</label>; })}{!categorias.length && <p className="text-sm text-slate-500">No hay categorías activas para asignar.</p>}</div></fieldset>
        <button type="button" aria-label={`Eliminar estación ${estacion.nombre || 'nueva'}`} onClick={() => setEstaciones((actuales) => actuales.filter((item) => item.id !== estacion.id))} className="justify-self-end rounded-lg border border-rose-200 p-2 text-rose-700 hover:bg-rose-50"><Trash2 size={17}/></button>
      </article>)}
      {!cargando && !estaciones.length && <div className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center"><ChefHat className="mx-auto text-slate-300" size={34}/><p className="mt-3 font-bold text-slate-800">Todavía no hay estaciones</p><p className="mt-1 text-sm text-slate-500">Creá una estación y asignale categorías para organizar el trabajo de cocina.</p><button type="button" onClick={agregar} className="mt-4 inline-flex items-center gap-2 rounded-lg bg-orange-500 px-4 py-2.5 text-sm font-bold text-white"><Plus size={16}/>Crear primera estación</button></div>}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-blue-100 bg-blue-50 p-3 text-xs text-blue-950"><span>La estación clasifica categorías de productos. El estado y el cobro de la comanda siguen controlados por Pedidos en Cocina y Cocina Pro.</span><button type="submit" disabled={guardando || cargando} className="inline-flex items-center gap-2 rounded-lg bg-orange-500 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50"><Save size={16}/>{guardando ? 'Guardando…' : 'Guardar estaciones'}</button></div>
    </form>
  </section>;
}
