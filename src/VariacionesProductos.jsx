import { useEffect, useMemo, useState } from 'react';
import { supabase } from './supabaseClient';
import { useEmpresaInfo } from './utils/useEmpresa';

const separarValores = (texto) => [...new Set(String(texto || '').split(/[\n,;]/).map((x) => x.trim()).filter(Boolean))];

const descargarCSV = (filas) => {
  const csv = filas.map((fila) => fila.map((celda) => `"${String(celda ?? '').replaceAll('"', '""')}"`).join(',')).join('\r\n');
  const url = URL.createObjectURL(new Blob([`\ufeff${csv}`], { type: 'text/csv;charset=utf-8' }));
  const enlace = document.createElement('a');
  enlace.href = url;
  enlace.download = 'variaciones-productos.csv';
  enlace.click();
  URL.revokeObjectURL(url);
};

export default function VariacionesProductos() {
  const { id: empresaId } = useEmpresaInfo();
  const [plantillas, setPlantillas] = useState([]);
  const [busqueda, setBusqueda] = useState('');
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [modal, setModal] = useState(false);
  const [editando, setEditando] = useState(null);
  const [nombre, setNombre] = useState('');
  const [valoresTexto, setValoresTexto] = useState('');
  const [guardando, setGuardando] = useState(false);

  const cargar = async () => {
    if (!empresaId) return;
    setCargando(true);
    const { data, error: errorConsulta } = await supabase.from('plantillas_variaciones')
      .select('id,nombre,valores,activo,actualizado_en').eq('empresa_id', empresaId).order('nombre');
    if (errorConsulta) {
      setError(errorConsulta.code === '42P01' || errorConsulta.code === 'PGRST205'
        ? 'Falta aplicar database/migration_variaciones_productos.sql en Supabase.'
        : `No se pudieron cargar las variaciones: ${errorConsulta.message}`);
    } else {
      setError('');
      setPlantillas(data || []);
    }
    setCargando(false);
  };

  useEffect(() => { cargar(); }, [empresaId]);

  const filtradas = useMemo(() => plantillas.filter((x) =>
    `${x.nombre} ${(x.valores || []).join(' ')}`.toLowerCase().includes(busqueda.trim().toLowerCase())), [plantillas, busqueda]);

  const abrirNueva = () => { setEditando(null); setNombre(''); setValoresTexto(''); setModal(true); };
  const abrirEdicion = (fila) => {
    setEditando(fila);
    setNombre(fila.nombre);
    setValoresTexto((fila.valores || []).join('\n'));
    setModal(true);
  };

  const guardar = async (e) => {
    e.preventDefault();
    const valores = separarValores(valoresTexto);
    if (nombre.trim().length < 2) return setError('El nombre de la variación debe tener al menos 2 caracteres.');
    if (!valores.length) return setError('Agrega al menos un valor, separado por coma o por línea.');
    if (valores.length > 100 || valores.some((x) => x.length > 80)) return setError('Usa hasta 100 valores, de un máximo de 80 caracteres cada uno.');
    setGuardando(true);
    setError('');
    const { error: errorGuardar } = await supabase.rpc('guardar_plantilla_variacion', {
      p_plantilla_id: editando?.id || null,
      p_nombre: nombre.trim(),
      p_valores: valores,
      p_activo: editando?.activo ?? true,
    });
    if (errorGuardar) {
      setError(errorGuardar.message.toLowerCase().includes('duplicate')
        ? 'Ya existe una variación con ese nombre.'
        : `No se pudo guardar: ${errorGuardar.message}`);
    } else {
      setModal(false);
      await cargar();
    }
    setGuardando(false);
  };

  const cambiarEstado = async (fila) => {
    const { error: errorEstado } = await supabase.rpc('guardar_plantilla_variacion', {
      p_plantilla_id: fila.id,
      p_nombre: fila.nombre,
      p_valores: fila.valores || [],
      p_activo: !fila.activo,
    });
    if (errorEstado) setError(`No se pudo actualizar el estado: ${errorEstado.message}`);
    else await cargar();
  };

  return (
    <main className="space-y-4 text-slate-800">
      <header>
        <h1 className="text-2xl font-bold">Variaciones de productos</h1>
        <p className="mt-1 text-sm text-slate-500">Administra atributos reutilizables como color, tamaño o modelo y sus valores.</p>
      </header>

      {error && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</div>}

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b p-4">
          <div><h2 className="font-bold">Todas las variaciones</h2><p className="text-xs text-slate-500">{plantillas.length} plantillas registradas</p></div>
          <button onClick={abrirNueva} className="rounded-lg bg-orange-500 px-4 py-2 text-sm font-bold text-white hover:bg-orange-600">+ Añadir variación</button>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 p-4">
          <button onClick={() => descargarCSV([['Variación', 'Valores', 'Estado'], ...filtradas.map((x) => [x.nombre, (x.valores || []).join(' | '), x.activo ? 'Activa' : 'Inactiva'])])}
            disabled={!filtradas.length} className="rounded border px-3 py-2 text-xs font-semibold disabled:opacity-50">Exportar a CSV</button>
          <input aria-label="Buscar variaciones" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Buscar variaciones..."
            className="w-full rounded-lg border px-3 py-2 text-sm outline-none focus:border-orange-400 sm:max-w-xs" />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[620px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="px-4 py-3">Variación</th><th className="px-4 py-3">Valores</th><th className="px-4 py-3">Estado</th><th className="px-4 py-3">Acción</th></tr></thead>
            <tbody className="divide-y">
              {cargando ? <tr><td colSpan="4" className="p-8 text-center text-slate-500">Cargando variaciones...</td></tr>
                : filtradas.length ? filtradas.map((fila) => <tr key={fila.id}>
                  <td className="px-4 py-3 font-semibold">{fila.nombre}</td>
                  <td className="px-4 py-3"><div className="flex max-w-2xl flex-wrap gap-1.5">{(fila.valores || []).map((valor) => <span key={valor} className="rounded-full bg-slate-100 px-2.5 py-1 text-xs">{valor}</span>)}</div></td>
                  <td className="px-4 py-3"><span className={`rounded-full px-2 py-1 text-xs font-semibold ${fila.activo ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>{fila.activo ? 'Activa' : 'Inactiva'}</span></td>
                  <td className="px-4 py-3"><div className="flex gap-2"><button onClick={() => abrirEdicion(fila)} className="rounded border px-3 py-1.5 text-xs font-semibold hover:bg-slate-50">Editar</button><button onClick={() => cambiarEstado(fila)} className="rounded border px-3 py-1.5 text-xs font-semibold hover:bg-slate-50">{fila.activo ? 'Desactivar' : 'Reactivar'}</button></div></td>
                </tr>)
                  : <tr><td colSpan="4" className="p-10 text-center text-slate-500">{busqueda ? 'No se encontraron variaciones.' : 'No hay variaciones registradas.'}</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      {modal && <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/50 p-4" role="presentation">
        <form onSubmit={guardar} className="w-full max-w-lg space-y-4 rounded-xl bg-white p-5 shadow-2xl" role="dialog" aria-modal="true" aria-labelledby="variacion-title">
          <div className="flex items-center justify-between"><h2 id="variacion-title" className="text-lg font-bold">{editando ? 'Editar variación' : 'Agregar variación'}</h2><button type="button" onClick={() => setModal(false)} aria-label="Cerrar" className="rounded p-2 text-slate-500 hover:bg-slate-100">✕</button></div>
          <label className="block text-sm font-semibold">Nombre de la variación *<input autoFocus value={nombre} onChange={(e) => setNombre(e.target.value)} maxLength={100} required placeholder="Ej.: Color, Tamaño, Modelo" className="mt-1 w-full rounded-lg border px-3 py-2 font-normal" /></label>
          <label className="block text-sm font-semibold">Agregar valores de variación *<textarea value={valoresTexto} onChange={(e) => setValoresTexto(e.target.value)} required rows={5} placeholder={'Un valor por línea o separados por coma\nEj.: Rojo, Azul, Negro'} className="mt-1 w-full rounded-lg border px-3 py-2 font-normal" /></label>
          <p className="text-xs text-slate-500">Los valores repetidos se consolidan al guardar. Las plantillas usadas por productos se pueden desactivar sin borrar su historial.</p>
          <div className="flex justify-end gap-2"><button type="button" onClick={() => setModal(false)} className="rounded-lg border px-4 py-2 text-sm">Cerrar</button><button disabled={guardando} className="rounded-lg bg-orange-500 px-4 py-2 text-sm font-bold text-white disabled:opacity-60">{guardando ? 'Guardando...' : 'Guardar'}</button></div>
        </form>
      </div>}
    </main>
  );
}
