import { useEffect, useMemo, useState } from 'react';
import { supabase } from './supabaseClient';
import { useEmpresaInfo } from './utils/useEmpresa';
import { useNotificacion } from './NotificacionContext';

const descargarArchivo = (contenido, nombre, tipo) => {
  const blob = new Blob([contenido], { type: tipo });
  const url = URL.createObjectURL(blob);
  const enlace = document.createElement('a');
  enlace.href = url;
  enlace.download = nombre;
  enlace.click();
  URL.revokeObjectURL(url);
};

export default function CategoriasGastos() {
  const { id: empresaId, nombre: nombreEmpresa } = useEmpresaInfo();
  const { notificar, confirmar } = useNotificacion();
  const [categorias, setCategorias] = useState([]);
  const [busqueda, setBusqueda] = useState('');
  const [cargando, setCargando] = useState(true);
  const [porPagina, setPorPagina] = useState(25);
  const [pagina, setPagina] = useState(1);
  const [mostrarForm, setMostrarForm] = useState(false);
  const [editando, setEditando] = useState(null);
  const [nombre, setNombre] = useState('');
  const [codigo, setCodigo] = useState('');
  const [guardando, setGuardando] = useState(false);

  const cargarCategorias = async () => {
    if (!empresaId) return;
    setCargando(true);
    const { data, error } = await supabase.from('categorias_gastos').select('*').eq('empresa_id', empresaId).order('nombre');
    if (error) notificar.error('Error al cargar categorías: ' + error.message);
    setCategorias(data || []);
    setCargando(false);
  };

  useEffect(() => { cargarCategorias(); }, [empresaId]);

  const filtradas = useMemo(() => categorias.filter((categoria) =>
    `${categoria.nombre || ''} ${categoria.codigo || ''}`.toLowerCase().includes(busqueda.toLowerCase())
  ), [categorias, busqueda]);
  const totalPaginas = Math.max(1, Math.ceil(filtradas.length / porPagina));
  const paginaSegura = Math.min(pagina, totalPaginas);
  const paginadas = filtradas.slice((paginaSegura - 1) * porPagina, paginaSegura * porPagina);

  useEffect(() => { setPagina(1); }, [busqueda, porPagina]);

  const abrirNuevo = () => {
    setEditando(null); setNombre(''); setCodigo(''); setMostrarForm(true);
  };

  const abrirEditar = (categoria) => {
    setEditando(categoria); setNombre(categoria.nombre || ''); setCodigo(categoria.codigo || ''); setMostrarForm(true);
  };

  const guardar = async (event) => {
    event.preventDefault();
    if (!nombre.trim()) return notificar.info('El nombre de la categoría es obligatorio.');
    setGuardando(true);
    try {
      const datos = { nombre: nombre.trim(), codigo: codigo.trim() || null };
      const resultado = editando
        ? await supabase.from('categorias_gastos').update(datos).eq('id', editando.id).eq('empresa_id', empresaId)
        : await supabase.from('categorias_gastos').insert([{ ...datos, empresa_id: empresaId }]);
      if (resultado.error) throw resultado.error;
      notificar.exito(editando ? 'Categoría actualizada.' : 'Categoría creada.');
      setMostrarForm(false);
      await cargarCategorias();
    } catch (error) {
      notificar.error('Error al guardar la categoría: ' + error.message);
    } finally {
      setGuardando(false);
    }
  };

  const borrar = async (categoria) => {
    if (!(await confirmar(`¿Eliminar la categoría "${categoria.nombre}"?`))) return;
    const { error } = await supabase.from('categorias_gastos').delete().eq('id', categoria.id).eq('empresa_id', empresaId);
    if (error) return notificar.error('Error al borrar: ' + error.message);
    notificar.exito('Categoría eliminada.');
    cargarCategorias();
  };

  const exportarCSV = () => {
    const filas = [['Nombre de la categoría', 'Código de categoría'], ...filtradas.map((item) => [item.nombre, item.codigo || ''])];
    descargarArchivo(filas.map((fila) => fila.map((valor) => `"${String(valor).replace(/"/g, '""')}"`).join(',')).join('\n'), 'categorias-gastos.csv', 'text/csv;charset=utf-8');
  };

  return (
    <div className="bg-transparent text-sm text-gray-700">
      <h2 className="text-2xl font-bold text-gray-800 mb-1">Categorías de gastos</h2>
      <p className="text-gray-400 text-xs mb-4">Gestiona tus categorías de gastos</p>
      <div className="bg-white rounded-lg shadow-sm border-t-2 border-[#004284]">
        <div className="p-4 border-b border-gray-100 flex justify-between items-center">
          <h3 className="font-bold text-gray-700">Todas tus categorías de gastos</h3>
          <button onClick={abrirNuevo} className="bg-orange-500 hover:bg-orange-600 text-white font-bold px-4 py-2 rounded text-sm">+ Añadir</button>
        </div>
        <div className="p-4">
          <div className="flex flex-wrap justify-between items-center gap-3 mb-4">
            <div className="flex items-center gap-2"><button onClick={exportarCSV} className="bg-gray-100 border text-gray-600 px-2.5 py-1 rounded text-xs font-semibold">📄 Exportar a CSV</button><select value={porPagina} onChange={(e) => setPorPagina(Number(e.target.value))} className="border rounded p-1.5 text-xs bg-white"><option value={10}>Mostrar 10</option><option value={25}>Mostrar 25</option><option value={50}>Mostrar 50</option></select></div>
            <input type="text" className="border rounded p-1.5 w-64 outline-none focus:border-blue-500" placeholder="Buscar ..." value={busqueda} onChange={(e) => setBusqueda(e.target.value)} />
          </div>
          <div className="overflow-x-auto"><table className="w-full text-left border-collapse"><thead><tr className="border-b bg-gray-50 text-gray-500 font-bold uppercase text-xs"><th className="p-3">Nombre de la categoría</th><th className="p-3">Código de categoría</th><th className="p-3">Acción</th></tr></thead><tbody>{cargando ? <tr><td colSpan="3" className="text-center py-8 text-gray-400">Cargando...</td></tr> : paginadas.length === 0 ? <tr><td colSpan="3" className="text-center py-8 text-gray-400">No hay categorías registradas.</td></tr> : paginadas.map((categoria) => <tr key={categoria.id} className="border-b hover:bg-gray-50"><td className="p-3 font-medium">{categoria.nombre}</td><td className="p-3 text-gray-500">{categoria.codigo || '—'}</td><td className="p-3"><div className="flex gap-2"><button onClick={() => abrirEditar(categoria)} className="bg-orange-500 hover:bg-orange-600 text-white text-xs font-bold px-3 py-1.5 rounded">✏️ Editar</button><button onClick={() => borrar(categoria)} className="bg-red-600 hover:bg-red-700 text-white text-xs font-bold px-3 py-1.5 rounded">🗑️ Borrar</button></div></td></tr>)}</tbody></table></div>
          <div className="flex justify-between items-center mt-4 text-xs font-bold text-gray-500"><span>Mostrando {paginadas.length} de {filtradas.length} entradas</span><div className="flex gap-1"><button onClick={() => setPagina((actual) => Math.max(1, actual - 1))} disabled={paginaSegura === 1} className="px-3 py-1 border rounded disabled:opacity-40">Anterior</button><span className="px-3 py-1">{paginaSegura} / {totalPaginas}</span><button onClick={() => setPagina((actual) => Math.min(totalPaginas, actual + 1))} disabled={paginaSegura === totalPaginas} className="px-3 py-1 border rounded disabled:opacity-40">Siguiente</button></div></div>
        </div>
      </div>
      {mostrarForm && <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[9999] p-4" onClick={() => setMostrarForm(false)}><div className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden" onClick={(e) => e.stopPropagation()}><div className="bg-orange-500 px-5 py-4 flex justify-between items-center"><h3 className="text-white font-bold">{editando ? 'Editar categoría de gasto' : 'Añadir categoría de gasto'}</h3><button onClick={() => setMostrarForm(false)} className="text-white text-xl">×</button></div><form onSubmit={guardar} className="p-5 flex flex-col gap-4"><div><label className="block font-bold mb-1">Nombre de la categoría:*</label><input autoFocus required className="w-full border rounded p-2" value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej. Pago de salario" /></div><div><label className="block font-bold mb-1">Código de categoría:</label><input className="w-full border rounded p-2" value={codigo} onChange={(e) => setCodigo(e.target.value)} placeholder="Opcional" /></div><div className="flex justify-end gap-2"><button type="button" onClick={() => setMostrarForm(false)} className="border rounded px-4 py-2 font-bold">Cerrar</button><button type="submit" disabled={guardando} className="bg-orange-500 text-white rounded px-4 py-2 font-bold disabled:opacity-60">{guardando ? 'Guardando...' : editando ? 'Actualizar' : 'Guardar'}</button></div></form></div></div>}
    </div>
  );
}
