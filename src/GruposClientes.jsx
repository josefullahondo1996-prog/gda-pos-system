import { useEffect, useState } from 'react';
import { supabase } from './supabaseClient';
import { useEmpresaInfo } from './utils/useEmpresa';
import { sonidoExito, sonidoError } from './utils/sonido';

export default function GruposClientes() {
    const { id: empresaId } = useEmpresaInfo();
    const [grupos, setGrupos] = useState([]);
    const [busqueda, setBusqueda] = useState('');
    const [cargando, setCargando] = useState(true);

    const [paginaActual, setPaginaActual] = useState(1);
    const [porPagina, setPorPagina] = useState(25);

    const [mostrarForm, setMostrarForm] = useState(false);
    const [editando, setEditando] = useState(null);
    const [nombreForm, setNombreForm] = useState('');
    const [tipoCalculoForm, setTipoCalculoForm] = useState('porcentaje');
    const [porcentajeForm, setPorcentajeForm] = useState('');
    const [grupoPrecioForm, setGrupoPrecioForm] = useState('');
    const [guardando, setGuardando] = useState(false);

    useEffect(() => {
        if (empresaId) cargarGrupos();
    }, [empresaId]);

    const cargarGrupos = async () => {
        if (!empresaId) return;
        setCargando(true);
        const { data, error } = await supabase.from('grupos_clientes').select('*').eq('empresa_id', empresaId).order('nombre', { ascending: true });
        if (!error && data) setGrupos(data);
        setCargando(false);
    };

    const gruposFiltrados = grupos.filter((g) => g.nombre.toLowerCase().includes(busqueda.toLowerCase()));

    const totalPaginas = Math.max(1, Math.ceil(gruposFiltrados.length / porPagina));
    const paginaSegura = Math.min(paginaActual, totalPaginas);
    const gruposPagina = gruposFiltrados.slice((paginaSegura - 1) * porPagina, paginaSegura * porPagina);

    useEffect(() => { setPaginaActual(1); }, [busqueda, porPagina]);

    const abrirNuevo = () => {
        setEditando(null);
        setNombreForm('');
        setTipoCalculoForm('porcentaje');
        setPorcentajeForm('');
        setGrupoPrecioForm('');
        setMostrarForm(true);
    };

    const abrirEditar = (grupo) => {
        setEditando(grupo);
        setNombreForm(grupo.nombre);
        setTipoCalculoForm(grupo.tipo_calculo || 'porcentaje');
        setPorcentajeForm(grupo.porcentaje ?? '');
        setGrupoPrecioForm(grupo.grupo_precio_venta || '');
        setMostrarForm(true);
    };

    const guardarGrupo = async (e) => {
        e.preventDefault();
        if (!nombreForm.trim()) return alert('El nombre del grupo de clientes es obligatorio.');

        setGuardando(true);
        try {
            const datos = {
                nombre: nombreForm.trim(),
                tipo_calculo: tipoCalculoForm,
                porcentaje: tipoCalculoForm === 'porcentaje' ? (porcentajeForm === '' ? null : Number(porcentajeForm)) : null,
                grupo_precio_venta: tipoCalculoForm === 'grupo_precio' ? (grupoPrecioForm || null) : null,
            };

            if (editando) {
                const { error } = await supabase.from('grupos_clientes').update(datos).eq('id', editando.id).eq('empresa_id', empresaId);
                if (error) throw error;
            } else {
                const { error } = await supabase.from('grupos_clientes').insert([{ ...datos, empresa_id: empresaId }]);
                if (error) throw error;
            }
            sonidoExito();
            setMostrarForm(false);
            cargarGrupos();
        } catch (error) {
            sonidoError();
            alert('Error al guardar: ' + error.message);
        } finally {
            setGuardando(false);
        }
    };

    const eliminarGrupo = async (grupo) => {
        if (!window.confirm(`¿Eliminar el grupo de clientes "${grupo.nombre}"?`)) return;
        const { error } = await supabase.from('grupos_clientes').delete().eq('id', grupo.id).eq('empresa_id', empresaId);
        if (error) return alert('Error al eliminar: ' + error.message);
        sonidoExito();
        setGrupos(grupos.filter((g) => g.id !== grupo.id));
    };

    const exportarCSV = () => {
        const filas = [
            ['Nombre del grupo de clientes', 'Porcentaje de cálculo (%)', 'Grupo de precios de venta'],
            ...gruposFiltrados.map((g) => [g.nombre, g.tipo_calculo === 'porcentaje' ? (g.porcentaje ?? '') : '--', g.tipo_calculo === 'grupo_precio' ? (g.grupo_precio_venta || '') : '--']),
        ];
        const csv = filas.map((f) => f.join(',')).join('\n');
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'grupos_clientes.csv';
        a.click();
        URL.revokeObjectURL(url);
    };

    return (
        <div className="bg-transparent text-sm text-gray-700">
            <h2 className="text-2xl font-bold text-gray-800 mb-1">Grupos de clientes</h2>
            <p className="text-gray-400 text-xs mb-4">Gestiona tus grupos de clientes</p>

            <div className="bg-white rounded-lg shadow-sm border-t-2 border-[#004284]">
                <div className="p-4 border-b border-gray-100 flex justify-between items-center">
                    <h3 className="font-bold text-gray-700">Todos los grupos de clientes</h3>
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
                            placeholder="Buscar..."
                            value={busqueda}
                            onChange={(e) => setBusqueda(e.target.value)}
                        />
                    </div>

                    <table className="w-full text-left text-sm border-collapse">
                        <thead>
                            <tr className="border-b border-gray-200 bg-gray-50 text-gray-500 font-bold uppercase text-xs">
                                <th className="p-3">Nombre del grupo de clientes</th>
                                <th className="p-3">Porcentaje de cálculo (%)</th>
                                <th className="p-3">Grupo de precios de venta</th>
                                <th className="p-3 w-56">Acción</th>
                            </tr>
                        </thead>
                        <tbody>
                            {cargando ? (
                                <tr><td colSpan={4} className="text-center py-8 text-gray-400">Cargando...</td></tr>
                            ) : gruposPagina.length === 0 ? (
                                <tr><td colSpan={4} className="text-center py-8 text-gray-400">No hay grupos de clientes registrados.</td></tr>
                            ) : (
                                gruposPagina.map((g) => (
                                    <tr key={g.id} className="border-b hover:bg-gray-50">
                                        <td className="p-3 font-medium text-gray-700">{g.nombre}</td>
                                        <td className="p-3 text-gray-500">{g.tipo_calculo === 'porcentaje' ? `${g.porcentaje ?? 0}%` : '--'}</td>
                                        <td className="p-3 text-gray-500">{g.tipo_calculo === 'grupo_precio' ? (g.grupo_precio_venta || '—') : '--'}</td>
                                        <td className="p-3">
                                            <div className="flex gap-2">
                                                <button onClick={() => abrirEditar(g)} className="bg-orange-500 hover:bg-orange-600 text-white text-xs font-bold px-3 py-1.5 rounded flex items-center gap-1">
                                                    ✏️ Editar
                                                </button>
                                                <button onClick={() => eliminarGrupo(g)} className="bg-red-600 hover:bg-red-700 text-white text-xs font-bold px-3 py-1.5 rounded flex items-center gap-1">
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
                            Mostrando {gruposPagina.length === 0 ? 0 : (paginaSegura - 1) * porPagina + 1} a {(paginaSegura - 1) * porPagina + gruposPagina.length} de {gruposFiltrados.length} entradas
                        </div>
                        <div className="flex gap-1">
                            <button onClick={() => setPaginaActual((p) => Math.max(1, p - 1))} disabled={paginaSegura === 1} className="px-3 py-1 text-xs font-bold border rounded disabled:opacity-40 hover:bg-gray-50">Anterior</button>
                            <button className="px-3 py-1 text-xs font-bold border rounded bg-[#004284] text-white border-[#004284]">{paginaSegura}</button>
                            <button onClick={() => setPaginaActual((p) => Math.min(totalPaginas, p + 1))} disabled={paginaSegura === totalPaginas} className="px-3 py-1 text-xs font-bold border rounded disabled:opacity-40 hover:bg-gray-50">Siguiente</button>
                        </div>
                    </div>
                </div>
            </div>

            {/* Modal Añadir/Editar — clon de "Agregar grupo de clientes" de CDEpos */}
            {mostrarForm && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden">
                        <div className="bg-[#5b4fcf] px-5 py-4 flex justify-between items-center">
                            <h3 className="text-white font-bold text-lg">{editando ? 'Editar grupo de clientes' : 'Agregar grupo de clientes'}</h3>
                            <button onClick={() => setMostrarForm(false)} className="text-white/80 hover:text-white text-xl leading-none">✕</button>
                        </div>
                        <form onSubmit={guardarGrupo} className="p-6 flex flex-col gap-4">
                            <div>
                                <label className="block text-sm font-bold text-gray-700 mb-1">Nombre del grupo de clientes:*</label>
                                <input
                                    autoFocus
                                    className="w-full border border-gray-300 rounded p-2.5 text-sm"
                                    value={nombreForm}
                                    onChange={(e) => setNombreForm(e.target.value)}
                                    placeholder="Nombre del grupo de clientes"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-bold text-gray-700 mb-1">Tipo de cálculo de precio:</label>
                                <select
                                    className="w-full border border-gray-300 rounded p-2.5 text-sm bg-white"
                                    value={tipoCalculoForm}
                                    onChange={(e) => setTipoCalculoForm(e.target.value)}
                                >
                                    <option value="porcentaje">Porcentaje</option>
                                    <option value="grupo_precio">Grupo de precios de venta</option>
                                </select>
                            </div>

                            {tipoCalculoForm === 'porcentaje' ? (
                                <div>
                                    <label className="block text-sm font-bold text-gray-700 mb-1">
                                        Porcentaje de cálculo (%): <span className="text-blue-500" title="Se aplica como recargo o descuento sobre el precio base según el signo del valor">ℹ️</span>
                                    </label>
                                    <input
                                        type="number"
                                        step="0.01"
                                        className="w-full border border-gray-300 rounded p-2.5 text-sm"
                                        value={porcentajeForm}
                                        onChange={(e) => setPorcentajeForm(e.target.value)}
                                        placeholder="Porcentaje de cálculo (%)"
                                    />
                                </div>
                            ) : (
                                <div>
                                    <label className="block text-sm font-bold text-gray-700 mb-1">Grupo de precios de venta:</label>
                                    <input
                                        className="w-full border border-gray-300 rounded p-2.5 text-sm"
                                        value={grupoPrecioForm}
                                        onChange={(e) => setGrupoPrecioForm(e.target.value)}
                                        placeholder="Ej: P CREDITO"
                                    />
                                </div>
                            )}

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