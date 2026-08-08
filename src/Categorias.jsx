import { useEffect, useMemo, useState } from 'react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { supabase } from './supabaseClient';
import { useEmpresaInfo } from './utils/useEmpresa';
import { useNotificacion } from './NotificacionContext';

const descargarArchivo = (contenido, nombreArchivo, tipo) => {
  const blob = new Blob([contenido], { type: tipo });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nombreArchivo;
  a.click();
  URL.revokeObjectURL(url);
};

export default function Categorias() {
  const { id: empresaId, nombre: nombreDelNegocio } = useEmpresaInfo();
  const { notificar, confirmar } = useNotificacion();

  const [categorias, setCategorias] = useState([]);
  const [busqueda, setBusqueda] = useState('');
  const [cargando, setCargando] = useState(true);
  const [porPagina, setPorPagina] = useState(25);
  const [paginaActual, setPaginaActual] = useState(1);

  const [mostrarForm, setMostrarForm] = useState(false);
  const [editando, setEditando] = useState(null);
  const [nombreForm, setNombreForm] = useState('');
  const [codigoForm, setCodigoForm] = useState('');
  const [descripcionForm, setDescripcionForm] = useState('');
  const [padreForm, setPadreForm] = useState('');
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    if (empresaId) cargarCategorias();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empresaId]);

  const cargarCategorias = async () => {
    setCargando(true);
    const { data, error } = await supabase.from('categorias_productos').select('*').eq('empresa_id', empresaId);
    if (!error && data) setCategorias(data);
    setCargando(false);
  };

  // Ordena mostrando primero cada categoría "padre" (sin categoria_padre_id)
  // seguida inmediatamente de sus subcategorías, con "--" como en la captura.
  const categoriasOrdenadas = useMemo(() => {
    const porPadre = {};
    categorias.forEach((c) => {
      const key = c.categoria_padre_id || 'raiz';
      if (!porPadre[key]) porPadre[key] = [];
      porPadre[key].push(c);
    });
    Object.values(porPadre).forEach((lista) => lista.sort((a, b) => a.nombre.localeCompare(b.nombre)));

    const resultado = [];
    const agregar = (nodo, nivel) => {
      resultado.push({ ...nodo, nivel });
      (porPadre[nodo.id] || []).forEach((hijo) => agregar(hijo, nivel + 1));
    };
    (porPadre['raiz'] || []).forEach((raiz) => agregar(raiz, 0));
    return resultado;
  }, [categorias]);

  const filtradas = categoriasOrdenadas.filter((c) =>
    !busqueda || c.nombre.toLowerCase().includes(busqueda.toLowerCase()) || (c.codigo || '').toLowerCase().includes(busqueda.toLowerCase())
  );

  const totalPaginas = Math.max(1, Math.ceil(filtradas.length / porPagina));
  const paginaSegura = Math.min(paginaActual, totalPaginas);
  const paginadas = filtradas.slice((paginaSegura - 1) * porPagina, paginaSegura * porPagina);

  useEffect(() => { setPaginaActual(1); }, [busqueda, porPagina]);

  const abrirNuevo = () => {
    setEditando(null);
    setNombreForm(''); setCodigoForm(''); setDescripcionForm(''); setPadreForm('');
    setMostrarForm(true);
  };

  const abrirEditar = (cat) => {
    setEditando(cat);
    setNombreForm(cat.nombre);
    setCodigoForm(cat.codigo || '');
    setDescripcionForm(cat.descripcion || '');
    setPadreForm(cat.categoria_padre_id || '');
    setMostrarForm(true);
  };

  const guardarCategoria = async (e) => {
    e.preventDefault();
    if (!nombreForm.trim()) return notificar.info('El nombre de la categoría es obligatorio.');
    if (editando && String(padreForm) === String(editando.id)) {
      return notificar.info('Una categoría no puede ser su propia categoría padre.');
    }

    setGuardando(true);
    try {
      const datos = {
        nombre: nombreForm.trim(),
        codigo: codigoForm || null,
        descripcion: descripcionForm || null,
        categoria_padre_id: padreForm || null,
      };

      if (editando) {
        const { error } = await supabase.from('categorias_productos').update(datos).eq('id', editando.id).eq('empresa_id', empresaId);
        if (error) throw error;
        notificar.exito('Categoría actualizada.');
      } else {
        const { error } = await supabase.from('categorias_productos').insert([{ ...datos, empresa_id: empresaId }]);
        if (error) throw error;
        notificar.exito('Categoría creada.');
      }
      setMostrarForm(false);
      cargarCategorias();
    } catch (error) {
      notificar.error('Error al guardar: ' + error.message);
    } finally {
      setGuardando(false);
    }
  };

  const eliminarCategoria = async (cat) => {
    const tieneHijas = categorias.some((c) => c.categoria_padre_id === cat.id);
    if (tieneHijas) {
      return notificar.error('Esta categoría tiene subcategorías. Eliminá o reasigná esas primero.');
    }
    if (!(await confirmar(`¿Eliminar la categoría "${cat.nombre}"?`))) return;
    const { error } = await supabase.from('categorias_productos').delete().eq('id', cat.id).eq('empresa_id', empresaId);
    if (error) return notificar.error('Error al eliminar: ' + error.message);
    notificar.exito('Categoría eliminada.');
    cargarCategorias();
  };

  const columnasExport = [
    { key: 'nombre', label: 'Categoría' }, { key: 'codigo', label: 'Código de categoría' }, { key: 'descripcion', label: 'Descripción' },
  ];

  const exportarCSV = () => {
    const filas = [columnasExport.map((c) => c.label).join(',')];
    filtradas.forEach((c) => filas.push(columnasExport.map((col) => `"${String(col.key === 'nombre' ? '--'.repeat(c.nivel) + (c.nombre ?? '') : (c[col.key] ?? '')).replace(/"/g, '""')}"`).join(',')));
    descargarArchivo(filas.join('\n'), 'categorias.csv', 'text/csv;charset=utf-8;');
  };

  const exportarExcel = () => {
    let html = '<table><tr>' + columnasExport.map((c) => `<th>${c.label}</th>`).join('') + '</tr>';
    filtradas.forEach((c) => {
      html += '<tr>' + columnasExport.map((col) => `<td>${col.key === 'nombre' ? '--'.repeat(c.nivel) + c.nombre : (c[col.key] ?? '')}</td>`).join('') + '</tr>';
    });
    html += '</table>';
    descargarArchivo(html, 'categorias.xls', 'application/vnd.ms-excel');
  };

  const exportarPDF = () => {
    const doc = new jsPDF();
    doc.text(`Categorías - ${nombreDelNegocio || ''}`, 14, 12);
    autoTable(doc, {
      startY: 18,
      head: [columnasExport.map((c) => c.label)],
      body: filtradas.map((c) => [
        '--'.repeat(c.nivel) + c.nombre,
        c.codigo || '',
        c.descripcion || '',
      ]),
      styles: { fontSize: 7 },
    });
    doc.save('categorias.pdf');
  };

  // Solo categorías "raíz" (sin padre) pueden elegirse como padre, para no
  // permitir más de 2 niveles de profundidad (igual que la captura de referencia).
  const categoriasRaiz = categorias.filter((c) => !c.categoria_padre_id && c.id !== editando?.id);

  return (
    <div className="bg-transparent text-sm text-gray-700">
      <h2 className="text-2xl font-bold text-gray-800 mb-1">Categorías</h2>
      <p className="text-gray-400 text-xs mb-4">Administra tus categorías</p>

      <div className="bg-white rounded-lg shadow-sm border-t-2 border-[#004284]">
        <div className="p-4 border-b border-gray-100 flex justify-between items-center">
          <h3 className="font-bold text-gray-700">Todas tus categorías</h3>
          <button onClick={abrirNuevo} className="bg-orange-500 hover:bg-orange-600 text-white font-bold px-4 py-2 rounded text-sm">
            + Añadir
          </button>
        </div>

        <div className="p-4">
          <div className="flex flex-wrap justify-between items-center gap-3 mb-4">
            <div className="flex gap-1 flex-wrap items-center">
              <button onClick={exportarCSV} className="bg-gray-100 border text-gray-600 px-2.5 py-1 rounded text-xs font-semibold hover:bg-gray-200">📄 Exportar a CSV</button>
              <button onClick={exportarExcel} className="bg-gray-100 border text-gray-600 px-2.5 py-1 rounded text-xs font-semibold hover:bg-gray-200">📊 Exportar a Excel</button>
              <button onClick={() => window.print()} className="bg-gray-100 border text-gray-600 px-2.5 py-1 rounded text-xs font-semibold hover:bg-gray-200">🖨️ Imprimir</button>
              <button onClick={exportarPDF} className="bg-gray-100 border text-gray-600 px-2.5 py-1 rounded text-xs font-semibold hover:bg-gray-200">📄 Exportar a PDF</button>
              <select value={porPagina} onChange={(e) => setPorPagina(Number(e.target.value))} className="border rounded p-1.5 text-xs font-semibold bg-white ml-2">
                <option value={10}>Mostrar 10</option>
                <option value={25}>Mostrar 25</option>
                <option value={50}>Mostrar 50</option>
                <option value={100}>Mostrar 100</option>
              </select>
            </div>
            <input
              type="text"
              className="border rounded p-1.5 w-64 outline-none focus:border-blue-500"
              placeholder="Buscar..."
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
            />
          </div>

          <table className="w-full text-left text-sm border-collapse">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50 text-gray-500 font-bold uppercase text-xs">
                <th className="p-3">Categoría</th>
                <th className="p-3">Código de categoría</th>
                <th className="p-3">Descripción</th>
                <th className="p-3 w-56">Acción</th>
              </tr>
            </thead>
            <tbody>
              {cargando ? (
                <tr><td colSpan={4} className="text-center py-8 text-gray-400">Cargando...</td></tr>
              ) : paginadas.length === 0 ? (
                <tr><td colSpan={4} className="text-center py-8 text-gray-400">No hay categorías registradas.</td></tr>
              ) : (
                paginadas.map((c) => (
                  <tr key={c.id} className="border-b hover:bg-gray-50">
                    <td className="p-3 font-medium text-gray-700">
                      <span className="text-gray-300">{'--'.repeat(c.nivel)}</span>{c.nombre}
                    </td>
                    <td className="p-3 text-gray-500">{c.codigo || '—'}</td>
                    <td className="p-3 text-gray-500">{c.descripcion || '—'}</td>
                    <td className="p-3">
                      <div className="flex gap-2">
                        <button onClick={() => abrirEditar(c)} className="bg-orange-500 hover:bg-orange-600 text-white text-xs font-bold px-3 py-1.5 rounded flex items-center gap-1">
                          ✏️ Editar
                        </button>
                        <button onClick={() => eliminarCategoria(c)} className="bg-red-600 hover:bg-red-700 text-white text-xs font-bold px-3 py-1.5 rounded flex items-center gap-1">
                          🗑️ Borrar
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>

          <div className="flex flex-wrap justify-between items-center mt-4 gap-2">
            <div className="text-xs font-bold text-gray-500">
              Mostrando {paginadas.length === 0 ? 0 : (paginaSegura - 1) * porPagina + 1} a {(paginaSegura - 1) * porPagina + paginadas.length} de {filtradas.length} entradas
            </div>
            <div className="flex gap-1">
              <button onClick={() => setPaginaActual((p) => Math.max(1, p - 1))} disabled={paginaSegura === 1} className="px-3 py-1 text-xs font-bold border rounded disabled:opacity-40 hover:bg-gray-50">Anterior</button>
              <span className="px-3 py-1 text-xs font-bold">{paginaSegura} / {totalPaginas}</span>
              <button onClick={() => setPaginaActual((p) => Math.min(totalPaginas, p + 1))} disabled={paginaSegura === totalPaginas} className="px-3 py-1 text-xs font-bold border rounded disabled:opacity-40 hover:bg-gray-50">Siguiente</button>
            </div>
          </div>
        </div>
      </div>

      {mostrarForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden">
            <div className="bg-[#5b4fcf] px-5 py-4 flex justify-between items-center">
              <h3 className="text-white font-bold text-lg">{editando ? 'Editar categoría' : 'Agregar categoría'}</h3>
              <button onClick={() => setMostrarForm(false)} className="text-white/80 hover:text-white text-xl leading-none">✕</button>
            </div>
            <form onSubmit={guardarCategoria} className="p-6 flex flex-col gap-4">
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-1">Nombre de la categoría:*</label>
                <input
                  autoFocus
                  className="w-full border border-gray-300 rounded p-2.5 text-sm"
                  value={nombreForm}
                  onChange={(e) => setNombreForm(e.target.value)}
                  placeholder="Nombre de la categoría"
                />
              </div>
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-1">Categoría padre (opcional):</label>
                <select className="w-full border border-gray-300 rounded p-2.5 text-sm bg-white" value={padreForm} onChange={(e) => setPadreForm(e.target.value)}>
                  <option value="">Ninguna (categoría principal)</option>
                  {categoriasRaiz.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-1">Código de categoría:</label>
                <input
                  className="w-full border border-gray-300 rounded p-2.5 text-sm"
                  value={codigoForm}
                  onChange={(e) => setCodigoForm(e.target.value)}
                  placeholder="Opcional"
                />
              </div>
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-1">Descripción:</label>
                <textarea
                  className="w-full border border-gray-300 rounded p-2.5 text-sm"
                  rows={3}
                  value={descripcionForm}
                  onChange={(e) => setDescripcionForm(e.target.value)}
                  placeholder="Breve descripción"
                />
              </div>

              <div className="flex gap-2 justify-end pt-2 border-t border-gray-100">
                <button
                  type="submit"
                  disabled={guardando}
                  className="bg-orange-500 hover:bg-orange-600 text-white font-bold text-sm px-5 py-2 rounded disabled:opacity-60"
                >
                  {guardando ? 'Guardando...' : 'Guardar'}
                </button>
                <button type="button" onClick={() => setMostrarForm(false)} className="border border-gray-300 text-gray-600 font-bold text-sm px-5 py-2 rounded hover:bg-gray-50">
                  Cerrar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
