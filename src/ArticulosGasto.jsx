import { useCallback, useEffect, useState } from 'react';
import { Search } from 'lucide-react';
import { supabase } from './supabaseClient';
import { useEmpresaInfo } from './utils/useEmpresa';

const moneda = (valor) => `Gs ${Math.round(Number(valor) || 0).toLocaleString('es-PY')}`;
const VACIO = { nombre: '', categoria: '', iva: 'IVA 10%', costo_unitario: '0' };

export default function ArticulosGasto() {
  const { id: empresaId } = useEmpresaInfo();
  const [articulos, setArticulos] = useState([]);
  const [categorias, setCategorias] = useState([]);
  const [form, setForm] = useState(VACIO);
  const [editarId, setEditarId] = useState(null);
  const [busqueda, setBusqueda] = useState('');
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');
  const [mensaje, setMensaje] = useState('');

  const cargar = useCallback(async () => {
    if (!empresaId) return;
    setCargando(true);
    const [articulosR, categoriasR] = await Promise.all([
      supabase.from('articulos_gasto').select('*').eq('empresa_id', empresaId).order('nombre'),
      supabase.from('categorias_gastos').select('nombre').eq('empresa_id', empresaId).order('nombre'),
    ]);
    if (articulosR.error) {
      setError(articulosR.error.code === '42P01' || articulosR.error.code === 'PGRST205'
        ? 'Falta aplicar database/migration_articulos_gasto.sql en Supabase.'
        : `No se pudo cargar el catálogo: ${articulosR.error.message}`);
    } else { setArticulos(articulosR.data || []); setError(''); }
    if (!categoriasR.error) setCategorias(categoriasR.data || []);
    setCargando(false);
  }, [empresaId]);

  useEffect(() => { cargar(); }, [cargar]);

  const guardar = async (event) => {
    event.preventDefault();
    const nombre = form.nombre.trim();
    if (!nombre) return setError('El nombre del artículo es obligatorio.');
    const costo = Number(form.costo_unitario);
    if (!Number.isFinite(costo) || costo < 0) return setError('El costo debe ser un importe válido.');
    setGuardando(true); setError(''); setMensaje('');
    const fila = { empresa_id: empresaId, nombre, categoria: form.categoria || null, iva: form.iva, costo_unitario: costo, actualizado_en: new Date().toISOString() };
    const resultado = editarId
      ? await supabase.from('articulos_gasto').update(fila).eq('id', editarId).eq('empresa_id', empresaId)
      : await supabase.from('articulos_gasto').insert([fila]);
    if (resultado.error) setError(resultado.error.code === '23505' ? 'Ya existe un artículo de gasto con ese nombre.' : `No se pudo guardar: ${resultado.error.message}`);
    else { setForm(VACIO); setEditarId(null); setMensaje(editarId ? 'Artículo actualizado.' : 'Artículo agregado.'); await cargar(); }
    setGuardando(false);
  };

  const editar = (articulo) => {
    setEditarId(articulo.id); setForm({ nombre: articulo.nombre || '', categoria: articulo.categoria || '', iva: articulo.iva || 'IVA 10%', costo_unitario: String(articulo.costo_unitario ?? 0) }); setError(''); setMensaje('');
  };
  const cambiarActivo = async (articulo) => {
    const { error: errorEstado } = await supabase.from('articulos_gasto').update({ activo: !articulo.activo, actualizado_en: new Date().toISOString() }).eq('id', articulo.id).eq('empresa_id', empresaId);
    if (errorEstado) setError(`No se pudo actualizar el artículo: ${errorEstado.message}`);
    else { setArticulos((actuales) => actuales.map((item) => item.id === articulo.id ? { ...item, activo: !item.activo } : item)); setMensaje(articulo.activo ? 'Artículo desactivado.' : 'Artículo reactivado.'); }
  };
  const visibles = articulos.filter((articulo) => `${articulo.nombre} ${articulo.categoria || ''} ${articulo.iva}`.toLocaleLowerCase('es').includes(busqueda.trim().toLocaleLowerCase('es')));

  return <main className="mx-auto w-full max-w-6xl space-y-5 p-4 md:p-6">
    <header><h1 className="text-2xl font-bold text-slate-900">Artículos de gasto</h1><p className="mt-1 text-sm text-slate-500">Administra conceptos frecuentes y reutilízalos al registrar egresos.</p></header>
    {error && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</div>}
    {mensaje && <div role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{mensaje}</div>}
    <section className="rounded-xl border bg-white p-4 shadow-sm"><h2 className="mb-3 font-semibold">{editarId ? 'Editar artículo' : 'Nuevo artículo'}</h2><form onSubmit={guardar} className="grid gap-3 md:grid-cols-5"><label className="text-sm font-medium md:col-span-2">Nombre<input required maxLength="120" value={form.nombre} onChange={(e) => setForm((anterior) => ({ ...anterior, nombre: e.target.value }))} className="mt-1 w-full rounded-lg border px-3 py-2" placeholder="Ej.: Combustible" /></label><label className="text-sm font-medium">Categoría<select value={form.categoria} onChange={(e) => setForm((anterior) => ({ ...anterior, categoria: e.target.value }))} className="mt-1 w-full rounded-lg border bg-white px-3 py-2"><option value="">Sin categoría</option>{categorias.map((categoria) => <option key={categoria.nombre}>{categoria.nombre}</option>)}</select></label><label className="text-sm font-medium">IVA<select value={form.iva} onChange={(e) => setForm((anterior) => ({ ...anterior, iva: e.target.value }))} className="mt-1 w-full rounded-lg border bg-white px-3 py-2"><option>IVA 10%</option><option>IVA 5%</option><option>Exento</option></select></label><label className="text-sm font-medium">Costo unitario<input type="number" min="0" step="1" value={form.costo_unitario} onChange={(e) => setForm((anterior) => ({ ...anterior, costo_unitario: e.target.value }))} className="mt-1 w-full rounded-lg border px-3 py-2" /></label><div className="flex justify-end gap-2 md:col-span-5"><button type="button" onClick={() => { setForm(VACIO); setEditarId(null); setError(''); setMensaje(''); }} className="rounded-lg border px-4 py-2 text-sm">Limpiar</button><button disabled={guardando} className="rounded-lg bg-orange-500 px-4 py-2 text-sm font-bold text-white disabled:opacity-60">{guardando ? 'Guardando…' : editarId ? 'Guardar cambios' : 'Agregar artículo'}</button></div></form></section>
    <section className="overflow-hidden rounded-xl border bg-white"><div className="flex flex-wrap items-center justify-between gap-3 border-b p-4"><h2 className="font-semibold">Catálogo ({articulos.length})</h2><label className="relative"><Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" /><input aria-label="Buscar artículos de gasto" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} className="w-full rounded-lg border py-2 pl-9 pr-3 text-sm sm:w-72" placeholder="Buscar artículo..." /></label></div><div className="overflow-x-auto"><table className="w-full min-w-[720px] text-left text-sm"><thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="p-3">Nombre</th><th className="p-3">Categoría</th><th className="p-3">IVA</th><th className="p-3 text-right">Costo</th><th className="p-3">Estado</th><th className="p-3">Acciones</th></tr></thead><tbody className="divide-y">{cargando ? <tr><td colSpan="6" className="p-8 text-center text-slate-500">Cargando catálogo…</td></tr> : visibles.length ? visibles.map((articulo) => <tr key={articulo.id} className={!articulo.activo ? 'bg-slate-50 text-slate-500' : ''}><td className="p-3 font-semibold">{articulo.nombre}</td><td className="p-3">{articulo.categoria || '—'}</td><td className="p-3">{articulo.iva}</td><td className="p-3 text-right">{moneda(articulo.costo_unitario)}</td><td className="p-3">{articulo.activo ? 'Activo' : 'Inactivo'}</td><td className="p-3"><div className="flex gap-2"><button onClick={() => editar(articulo)} className="rounded border px-2.5 py-1.5 text-xs font-semibold">Editar</button><button onClick={() => cambiarActivo(articulo)} className="rounded border px-2.5 py-1.5 text-xs font-semibold">{articulo.activo ? 'Desactivar' : 'Reactivar'}</button></div></td></tr>) : <tr><td colSpan="6" className="p-8 text-center text-slate-500">{busqueda ? 'No se encontraron artículos.' : 'Todavía no hay artículos de gasto.'}</td></tr>}</tbody></table></div></section>
  </main>;
}
