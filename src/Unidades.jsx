import { useEffect, useState } from 'react';
import { supabase } from './supabaseClient';
import { useEmpresaInfo } from './utils/useEmpresa';

export default function Unidades() {
    const { id: empresaId } = useEmpresaInfo();
    const [unidades, setUnidades] = useState([]);
    const [busqueda, setBusqueda] = useState('');
    const [cargando, setCargando] = useState(true);

    const [paginaActual, setPaginaActual] = useState(1);
    const [porPagina, setPorPagina] = useState(25);

    const [mostrarForm, setMostrarForm] = useState(false);
    const [editando, setEditando] = useState(null);
    const [nombreForm, setNombreForm] = useState('');
    const [nombreCortoForm, setNombreCortoForm] = useState('');
    const [permitirDecimalForm, setPermitirDecimalForm] = useState(false);
    const [guardando, setGuardando] = useState(false);

    useEffect(() => {
        if (empresaId) cargarUnidades();
    }, [empresaId]);

    const cargarUnidades = async () => {
        if (!empresaId) return;
        setCargando(true);
        const { data, error } = await supabase.from('unidades').select('*').eq('empresa_id', empresaId).order('nombre', { ascending: true });
        if (!error && data) setUnidades(data);
        setCargando(false);
    };

    const unidadesFiltradas = unidades.filter((u) => u.nombre.toLowerCase().includes(busqueda.toLowerCase()));

    const totalPaginas = Math.max(1, Math.ceil(unidadesFiltradas.length / porPagina));
    const paginaSegura = Math.min(paginaActual, totalPaginas);
    const unidadesPagina = unidadesFiltradas.slice((paginaSegura - 1) * porPagina, paginaSegura * porPagina);

    useEffect(() => { setPaginaActual(1); }, [busqueda, porPagina]);

    const abrirNuevo = () => {
        setEditando(null);
        setNombreForm('');
        setNombreCortoForm('');
        setPermitirDecimalForm(false);
        setMostrarForm(true);
    };

    const abrirEditar = (unidad) => {
        setEditando(unidad);
        setNombreForm(unidad.nombre);
        setNombreCortoForm(unidad.nombre_corto || '');
        setPermitirDecimalForm(unidad.permitir_decimal || false);
        setMostrarForm(true);
    };

    const guardarUnidad = async (e) => {
        e.preventDefault();
        if (!nombreForm.trim()) return alert('El nombre de la unidad es obligatorio.');
        if (!nombreCortoForm.trim()) return alert('El nombre corto es obligatorio.');

        setGuardando(true);
        try {
            const datos = {
                nombre: nombreForm.trim(),
                nombre_corto: nombreCortoForm.trim(),
                permitir_decimal: permitirDecimalForm,
            };

            if (editando) {
                const { error } = await supabase.from('unidades').update(datos).eq('id', editando.id).eq('empresa_id', empresaId);
                if (error) throw error;
            } else {
                const { error } = await supabase.from('unidades').insert([{ ...datos, empresa_id: empresaId }]);
                if (error) throw error;
            }
            setMostrarForm(false);
            cargarUnidades();
        } catch (error) {
            alert('Error al guardar: ' + error.message);
        } finally {
            setGuardando(false);
        }
    };

    const eliminarUnidad = async (unidad) => {
        if (!window.confirm(`¿Eliminar la unidad "${unidad.nombre}"?`)) return;
        const { error } = await supabase.from('unidades').delete().eq('id', unidad.id).eq('empresa_id', empresaId);
        if (error) return alert('Error al eliminar: ' + error.message);
        setUnidades(unidades.filter((u) => u.id !== unidad.id));
    };

    const exportarCSV = () => {
        const filas = [['Nombre', 'Nombre corto', 'Permitir decimal'], ...unidadesFiltradas.map((u) => [u.nombre, u.nombre_corto || '', u.permitir_decimal ? 'Sí' : 'No'])];
        const csv = filas.map((f) => f.join(',')).join('\n');
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'unidades.csv';
        a.click();
        URL.revokeObjectURL(url);
    };

    return (
        <div className="bg-transparent text-sm text-gray-700">
            <h2 className="text-2xl font-bold text-gray-800 mb-1">Unidades</h2>
            <p className="text-gray-400 text-xs mb-4">Administra tus unidades</p>

            <div className="bg-white rounded-lg shadow-sm border-t-2 border-[#004284]">
                <div className="p-4 border-b border-gray-100 flex justify-between items-center">
                    <h3 className="font-bold text-gray-700">Todas sus unidades</h3>
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
                            placeholder="Buscar unidad..."
                            value={busqueda}
                            onChange={(e) => setBusqueda(e.target.value)}
                        />
                    </div>

                    <table className="w-full text-left text-sm border-collapse">
                        <thead>
                            <tr className="border-b border-gray-200 bg-gray-50 text-gray-500 font-bold uppercase text-xs">
                                <th className="p-3">Nombre</th>
                                <th className="p-3">Nombre corto</th>
                                <th className="p-3">Permitir decimal ℹ️</th>
                                <th className="p-3 w-56">Acción</th>
                            </tr>
                        </thead>
                        <tbody>
                            {cargando ? (
                                <tr><td colSpan={4} className="text-center py-8 text-gray-400">Cargando...</td></tr>
                            ) : unidadesPagina.length === 0 ? (
                                <tr><td colSpan={4} className="text-center py-8 text-gray-400">No hay unidades registradas.</td></tr>
                            ) : (
                                unidadesPagina.map((u) => (
                                    <tr key={u.id} className="border-b hover:bg-gray-50">
                                        <td className="p-3 font-medium text-gray-700">{u.nombre}</td>
                                        <td className="p-3 text-gray-500">{u.nombre_corto || '—'}</td>
                                        <td className="p-3 text-gray-500">{u.permitir_decimal ? 'Sí' : 'No'}</td>
                                        <td className="p-3">
                                            <div className="flex gap-2">
                                                <button onClick={() => abrirEditar(u)} className="bg-orange-500 hover:bg-orange-600 text-white text-xs font-bold px-3 py-1.5 rounded flex items-center gap-1">
                                                    ✏️ Editar
                                                </button>
                                                <button onClick={() => eliminarUnidad(u)} className="bg-red-600 hover:bg-red-700 text-white text-xs font-bold px-3 py-1.5 rounded flex items-center gap-1">
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
                            Mostrando {unidadesPagina.length === 0 ? 0 : (paginaSegura - 1) * porPagina + 1} a {(paginaSegura - 1) * porPagina + unidadesPagina.length} de {unidadesFiltradas.length} entradas
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

            {/* Modal Añadir/Editar */}
            {mostrarForm && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden">
                        <div className="bg-[#5b4fcf] px-5 py-4 flex justify-between items-center">
                            <h3 className="text-white font-bold text-lg">{editando ? 'Editar unidad' : 'Agregar unidad'}</h3>
                            <button onClick={() => setMostrarForm(false)} className="text-white/80 hover:text-white text-xl leading-none">✕</button>
                        </div>
                        <form onSubmit={guardarUnidad} className="p-6 flex flex-col gap-4">
                            <div>
                                <label className="block text-sm font-bold text-gray-700 mb-1">Nombre de la unidad:*</label>
                                <input
                                    autoFocus
                                    className="w-full border border-gray-300 rounded p-2.5 text-sm"
                                    value={nombreForm}
                                    onChange={(e) => setNombreForm(e.target.value)}
                                    placeholder="Ej: Litros"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-bold text-gray-700 mb-1">Nombre corto:*</label>
                                <input
                                    className="w-full border border-gray-300 rounded p-2.5 text-sm"
                                    value={nombreCortoForm}
                                    onChange={(e) => setNombreCortoForm(e.target.value)}
                                    placeholder="Ej: LS"
                                />
                            </div>
                            <label className="flex items-center gap-2 text-sm text-gray-700">
                                <input
                                    type="checkbox"
                                    checked={permitirDecimalForm}
                                    onChange={(e) => setPermitirDecimalForm(e.target.checked)}
                                />
                                ¿Permitir decimal? <span className="text-blue-500" title="Activá esto si la unidad se puede vender fraccionada, ej. 1.5 Kg">ℹ️</span>
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