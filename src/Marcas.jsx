import { useEffect, useState } from 'react';
import { supabase } from './supabaseClient';
import { useEmpresaInfo } from './utils/useEmpresa';
import { useNotificacion } from './NotificacionContext';

export default function Marcas() {
    const { id: empresaId } = useEmpresaInfo();
    const { confirmar } = useNotificacion();
    const [marcas, setMarcas] = useState([]);
    const [busqueda, setBusqueda] = useState('');
    const [cargando, setCargando] = useState(true);

    const [paginaActual, setPaginaActual] = useState(1);
    const [porPagina, setPorPagina] = useState(25);

    const [mostrarForm, setMostrarForm] = useState(false);
    const [editando, setEditando] = useState(null);
    const [nombreForm, setNombreForm] = useState('');
    const [descripcionForm, setDescripcionForm] = useState('');
    const [usoReparacionForm, setUsoReparacionForm] = useState(false);
    const [guardando, setGuardando] = useState(false);

    useEffect(() => {
        if (empresaId) cargarMarcas();
    }, [empresaId]);

    const cargarMarcas = async () => {
        if (!empresaId) return;
        setCargando(true);
        const { data, error } = await supabase.from('marcas').select('*').eq('empresa_id', empresaId).order('nombre', { ascending: true });
        if (!error && data) setMarcas(data);
        setCargando(false);
    };

    const marcasFiltradas = marcas.filter((m) => m.nombre.toLowerCase().includes(busqueda.toLowerCase()));

    const totalPaginas = Math.max(1, Math.ceil(marcasFiltradas.length / porPagina));
    const paginaSegura = Math.min(paginaActual, totalPaginas);
    const marcasPagina = marcasFiltradas.slice((paginaSegura - 1) * porPagina, paginaSegura * porPagina);

    useEffect(() => { setPaginaActual(1); }, [busqueda, porPagina]);

    const abrirNuevo = () => {
        setEditando(null);
        setNombreForm('');
        setDescripcionForm('');
        setUsoReparacionForm(false);
        setMostrarForm(true);
    };

    const abrirEditar = (marca) => {
        setEditando(marca);
        setNombreForm(marca.nombre);
        setDescripcionForm(marca.descripcion || marca.nota || '');
        setUsoReparacionForm(marca.uso_reparacion || false);
        setMostrarForm(true);
    };

    const guardarMarca = async (e) => {
        e.preventDefault();
        if (!nombreForm.trim()) return alert('El nombre de la marca es obligatorio.');

        setGuardando(true);
        try {
            const datos = {
                nombre: nombreForm.trim(),
                nota: descripcionForm || null,
                descripcion: descripcionForm || null,
                uso_reparacion: usoReparacionForm,
            };

            if (editando) {
                const { error } = await supabase.from('marcas').update(datos).eq('id', editando.id).eq('empresa_id', empresaId);
                if (error) throw error;
            } else {
                const { error } = await supabase.from('marcas').insert([{ ...datos, empresa_id: empresaId }]);
                if (error) throw error;
            }
            setMostrarForm(false);
            cargarMarcas();
        } catch (error) {
            alert('Error al guardar: ' + error.message);
        } finally {
            setGuardando(false);
        }
    };

    const eliminarMarca = async (marca) => {
        if (!(await confirmar(`La marca "${marca.nombre}" será eliminada permanentemente.`, { titulo: '¿Estás seguro?', textoConfirmar: 'Eliminar', textoCancelar: 'Cancelar', peligroso: true }))) return;
        const { error } = await supabase.from('marcas').delete().eq('id', marca.id).eq('empresa_id', empresaId);
        if (error) return alert('Error al eliminar: ' + error.message);
        setMarcas(marcas.filter((m) => m.id !== marca.id));
    };

    const exportarCSV = () => {
        const filas = [['Marca', 'Descripción', 'Uso para reparación'], ...marcasFiltradas.map((m) => [m.nombre, m.descripcion || m.nota || '', m.uso_reparacion ? 'Sí' : 'No'])];
        const csv = filas.map((f) => f.join(',')).join('\n');
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'marcas.csv';
        a.click();
        URL.revokeObjectURL(url);
    };

    return (
        <div className="bg-transparent text-sm text-gray-700">
            <h2 className="text-2xl font-bold text-gray-800 mb-1">Marcas</h2>
            <p className="text-gray-400 text-xs mb-4">Gestiona tus marcas</p>

            <div className="bg-white rounded-lg shadow-sm border-t-2 border-[#004284]">
                <div className="p-4 border-b border-gray-100 flex justify-between items-center">
                    <h3 className="font-bold text-gray-700">Todas tus marcas</h3>
                    <button onClick={abrirNuevo} className="bg-orange-500 hover:bg-orange-600 text-white font-bold px-4 py-2 rounded text-sm">
                        + Añadir
                    </button>
                </div>

                <div className="p-4">
                    <div className="flex flex-wrap justify-between items-center gap-3 mb-4">
                        <div className="flex gap-1 flex-wrap items-center">
                            <button onClick={exportarCSV} className="bg-gray-100 border text-gray-600 px-2.5 py-1 rounded text-xs font-semibold hover:bg-gray-200">📄 Exportar a CSV</button>
                            <button onClick={() => window.print()} className="bg-gray-100 border text-gray-600 px-2.5 py-1 rounded text-xs font-semibold hover:bg-gray-200">🖨️ Imprimir</button>
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
                            placeholder="Buscar marca..."
                            value={busqueda}
                            onChange={(e) => setBusqueda(e.target.value)}
                        />
                    </div>

                    <table className="w-full text-left text-sm border-collapse">
                        <thead>
                            <tr className="border-b border-gray-200 bg-gray-50 text-gray-500 font-bold uppercase text-xs">
                                <th className="p-3">Marcas</th>
                                <th className="p-3">Nota</th>
                                <th className="p-3 w-56">Acción</th>
                            </tr>
                        </thead>
                        <tbody>
                            {cargando ? (
                                <tr><td colSpan={3} className="text-center py-8 text-gray-400">Cargando...</td></tr>
                            ) : marcasPagina.length === 0 ? (
                                <tr><td colSpan={3} className="text-center py-8 text-gray-400">No hay marcas registradas.</td></tr>
                            ) : (
                                marcasPagina.map((m) => (
                                    <tr key={m.id} className="border-b hover:bg-gray-50">
                                        <td className="p-3 font-medium text-gray-700">{m.nombre}</td>
                                        <td className="p-3 text-gray-500">{m.descripcion || m.nota || '—'}</td>
                                        <td className="p-3">
                                            <div className="flex gap-2">
                                                <button onClick={() => abrirEditar(m)} className="bg-orange-500 hover:bg-orange-600 text-white text-xs font-bold px-3 py-1.5 rounded flex items-center gap-1">
                                                    ✏️ Editar
                                                </button>
                                                <button onClick={() => eliminarMarca(m)} className="bg-red-600 hover:bg-red-700 text-white text-xs font-bold px-3 py-1.5 rounded flex items-center gap-1">
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
                            Mostrando {marcasPagina.length === 0 ? 0 : (paginaSegura - 1) * porPagina + 1} a {(paginaSegura - 1) * porPagina + marcasPagina.length} de {marcasFiltradas.length} entradas
                        </div>
                        <div className="flex gap-1">
                            <button onClick={() => setPaginaActual((p) => Math.max(1, p - 1))} disabled={paginaSegura === 1} className="px-3 py-1 text-xs font-bold border rounded disabled:opacity-40 hover:bg-gray-50">Anterior</button>
                            {Array.from({ length: totalPaginas }, (_, i) => i + 1)
                                .filter((n) => n === 1 || n === totalPaginas || Math.abs(n - paginaSegura) <= 1)
                                .reduce((acc, n, i, arr) => {
                                    if (i > 0 && n - arr[i - 1] > 1) acc.push('...');
                                    acc.push(n);
                                    return acc;
                                }, [])
                                .map((n, i) => n === '...' ? (
                                    <span key={`dots-${i}`} className="px-2 py-1 text-xs text-gray-400">...</span>
                                ) : (
                                    <button key={n} onClick={() => setPaginaActual(n)} className={`px-3 py-1 text-xs font-bold border rounded ${n === paginaSegura ? 'bg-[#004284] text-white border-[#004284]' : 'hover:bg-gray-50'}`}>{n}</button>
                                ))}
                            <button onClick={() => setPaginaActual((p) => Math.min(totalPaginas, p + 1))} disabled={paginaSegura === totalPaginas} className="px-3 py-1 text-xs font-bold border rounded disabled:opacity-40 hover:bg-gray-50">Siguiente</button>
                        </div>
                    </div>
                </div>
            </div>

            {/* Modal Añadir/Editar — clon del modal "Agregar marca" */}
            {mostrarForm && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden">
                        <div className="bg-[#5b4fcf] px-5 py-4 flex justify-between items-center">
                            <h3 className="text-white font-bold text-lg">{editando ? 'Editar marca' : 'Agregar marca'}</h3>
                            <button onClick={() => setMostrarForm(false)} className="text-white/80 hover:text-white text-xl leading-none">✕</button>
                        </div>
                        <form onSubmit={guardarMarca} className="p-6 flex flex-col gap-4">
                            <div>
                                <label className="block text-sm font-bold text-gray-700 mb-1">Nombre de la marca:*</label>
                                <input
                                    autoFocus
                                    className="w-full border border-gray-300 rounded p-2.5 text-sm"
                                    value={nombreForm}
                                    onChange={(e) => setNombreForm(e.target.value)}
                                    placeholder="Nombre de la marca"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-bold text-gray-700 mb-1">Breve descripción:</label>
                                <input
                                    className="w-full border border-gray-300 rounded p-2.5 text-sm"
                                    value={descripcionForm}
                                    onChange={(e) => setDescripcionForm(e.target.value)}
                                    placeholder="Breve descripción"
                                />
                            </div>
                            <label className="flex items-center gap-2 text-sm text-gray-700">
                                <input
                                    type="checkbox"
                                    checked={usoReparacionForm}
                                    onChange={(e) => setUsoReparacionForm(e.target.checked)}
                                />
                                ¿Uso para reparación? <span className="text-blue-500" title="Marca esta opción si esta marca se usa en órdenes de trabajo / servicios técnicos">ℹ️</span>
                            </label>

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