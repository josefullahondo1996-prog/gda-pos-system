import { useEffect, useState } from 'react';
import { supabase } from './supabaseClient';
import { useEmpresaInfo } from './utils/useEmpresa';
import { sonidoExito, sonidoError } from './utils/sonido';
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

export default function GruposClientes() {
    const { id: empresaId, nombre: nombreDelNegocio } = useEmpresaInfo();
    const { notificar, confirmar } = useNotificacion();

    const [grupos, setGrupos] = useState([]);
    const [busqueda, setBusqueda] = useState('');
    const [cargando, setCargando] = useState(true);

    const [paginaActual, setPaginaActual] = useState(1);
    const [porPagina, setPorPagina] = useState(25);

    const [mostrarForm, setMostrarForm] = useState(false);
    const [editando, setEditando] = useState(null);
    const [nombreForm, setNombreForm] = useState('');
    const [descripcionForm, setDescripcionForm] = useState('');
    const [porcentajeForm, setPorcentajeForm] = useState('');
    const [guardando, setGuardando] = useState(false);

    useEffect(() => {
        if (empresaId) cargarGrupos();
        // eslint-disable-next-line react-hooks/exhaustive-deps
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
        setDescripcionForm('');
        setPorcentajeForm('');
        setMostrarForm(true);
    };

    const abrirEditar = (grupo) => {
        setEditando(grupo);
        setNombreForm(grupo.nombre);
        setDescripcionForm(grupo.descripcion || '');
        setPorcentajeForm(grupo.porcentaje ?? '');
        setMostrarForm(true);
    };

    const guardarGrupo = async (e) => {
        e.preventDefault();
        if (!nombreForm.trim()) return notificar.info('El nombre del grupo de clientes es obligatorio.');

        setGuardando(true);
        try {
            const datos = {
                nombre: nombreForm.trim(),
                descripcion: descripcionForm || null,
                tipo_calculo: 'porcentaje',
                porcentaje: porcentajeForm === '' ? null : Number(porcentajeForm),
            };

            if (editando) {
                const { error } = await supabase.from('grupos_clientes').update(datos).eq('id', editando.id).eq('empresa_id', empresaId);
                if (error) throw error;
                notificar.exito('Grupo de clientes actualizado.');
            } else {
                const { error } = await supabase.from('grupos_clientes').insert([{ ...datos, empresa_id: empresaId, activo: true }]);
                if (error) throw error;
                notificar.exito('Grupo de clientes creado.');
            }
            sonidoExito();
            setMostrarForm(false);
            cargarGrupos();
        } catch (error) {
            sonidoError();
            notificar.error('Error al guardar: ' + error.message);
        } finally {
            setGuardando(false);
        }
    };

    const eliminarGrupo = async (grupo) => {
        if (!(await confirmar(`¿Eliminar permanentemente el grupo "${grupo.nombre}"? Esta acción no se puede deshacer.`))) return;
        const { error } = await supabase.from('grupos_clientes').delete().eq('id', grupo.id).eq('empresa_id', empresaId);
        if (error) return notificar.error('Error al eliminar: ' + error.message);
        sonidoExito();
        notificar.exito('Grupo eliminado.');
        setGrupos(grupos.filter((g) => g.id !== grupo.id));
    };

    const alternarActivo = async (grupo) => {
        const nuevoEstado = !grupo.activo;
        const { error } = await supabase.from('grupos_clientes').update({ activo: nuevoEstado }).eq('id', grupo.id).eq('empresa_id', empresaId);
        if (error) return notificar.error('Error: ' + error.message);
        notificar.exito(nuevoEstado ? 'Grupo activado.' : 'Grupo desactivado.');
        cargarGrupos();
    };

    const columnasExport = [
        { key: 'nombre', label: 'Nombre' }, { key: 'descripcion', label: 'Descripción' }, { key: 'porcentaje', label: 'Descuento por defecto (%)' },
    ];

    const exportarCSV = () => {
        const filas = [columnasExport.map((c) => c.label).join(',')];
        gruposFiltrados.forEach((g) => filas.push(columnasExport.map((c) => `"${String(g[c.key] ?? '').replace(/"/g, '""')}"`).join(',')));
        descargarArchivo(filas.join('\n'), 'grupos_clientes.csv', 'text/csv;charset=utf-8;');
    };

    const exportarExcel = () => {
        let html = '<table><tr>' + columnasExport.map((c) => `<th>${c.label}</th>`).join('') + '</tr>';
        gruposFiltrados.forEach((g) => { html += '<tr>' + columnasExport.map((c) => `<td>${g[c.key] ?? ''}</td>`).join('') + '</tr>'; });
        html += '</table>';
        descargarArchivo(html, 'grupos_clientes.xls', 'application/vnd.ms-excel');
    };

    return (
        <div className="bg-transparent text-sm text-gray-700">
            <h2 className="text-2xl font-bold text-gray-800 mb-1">Grupos de clientes</h2>
            <p className="text-gray-400 text-xs mb-4">Administra tus grupos de clientes</p>

            <div className="bg-white rounded-lg shadow-sm border-t-2 border-[#004284]">
                <div className="p-4 border-b border-gray-100 flex justify-between items-center">
                    <h3 className="font-bold text-gray-700">Grupos de clientes total</h3>
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
                                <th className="p-3">Nombre</th>
                                <th className="p-3">Descripción</th>
                                <th className="p-3 w-72">Acción</th>
                            </tr>
                        </thead>
                        <tbody>
                            {cargando ? (
                                <tr><td colSpan={3} className="text-center py-8 text-gray-400">Cargando...</td></tr>
                            ) : gruposPagina.length === 0 ? (
                                <tr><td colSpan={3} className="text-center py-8 text-gray-400">No hay grupos de clientes registrados.</td></tr>
                            ) : (
                                gruposPagina.map((g) => (
                                    <tr key={g.id} className={`border-b hover:bg-gray-50 ${g.activo === false ? 'opacity-50' : ''}`}>
                                        <td className="p-3 font-medium text-gray-700">
                                            {g.nombre}
                                            {g.activo === false && <span className="ml-2 text-[10px] bg-gray-200 text-gray-500 px-1.5 py-0.5 rounded-full">Inactivo</span>}
                                        </td>
                                        <td className="p-3 text-gray-500">{g.descripcion || '—'}</td>
                                        <td className="p-3">
                                            <div className="flex gap-2">
                                                <button onClick={() => abrirEditar(g)} className="bg-orange-500 hover:bg-orange-600 text-white text-xs font-bold px-3 py-1.5 rounded flex items-center gap-1">
                                                    ✏️ Editar
                                                </button>
                                                <button onClick={() => eliminarGrupo(g)} className="bg-red-600 hover:bg-red-700 text-white text-xs font-bold px-3 py-1.5 rounded flex items-center gap-1">
                                                    🗑️ Borrar
                                                </button>
                                                <button onClick={() => alternarActivo(g)} className="bg-gray-500 hover:bg-gray-600 text-white text-xs font-bold px-3 py-1.5 rounded flex items-center gap-1">
                                                    ⏻ {g.activo === false ? 'Activar' : 'Deactivate'}
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
                            <span className="px-3 py-1 text-xs font-bold">{paginaSegura} / {totalPaginas}</span>
                            <button onClick={() => setPaginaActual((p) => Math.min(totalPaginas, p + 1))} disabled={paginaSegura === totalPaginas} className="px-3 py-1 text-xs font-bold border rounded disabled:opacity-40 hover:bg-gray-50">Siguiente</button>
                        </div>
                    </div>
                </div>
            </div>

            {/* Modal — clon exacto de "Agregar grupo de precios de venta" de CDEpos,
          adaptado a grupo de clientes: Nombre*, Descripción, Descuento por defecto (%) */}
            {mostrarForm && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden">
                        <div className="bg-[#5b4fcf] px-5 py-4 flex justify-between items-center">
                            <h3 className="text-white font-bold text-lg">{editando ? 'Editar grupo de clientes' : 'Agregar grupo de clientes'}</h3>
                            <button onClick={() => setMostrarForm(false)} className="text-white/80 hover:text-white text-xl leading-none">✕</button>
                        </div>
                        <form onSubmit={guardarGrupo} className="p-6 flex flex-col gap-4">
                            <div>
                                <label className="block text-sm font-bold text-gray-700 mb-1">Nombre:*</label>
                                <input
                                    autoFocus
                                    className="w-full border border-gray-300 rounded p-2.5 text-sm"
                                    value={nombreForm}
                                    onChange={(e) => setNombreForm(e.target.value)}
                                    placeholder="Nombre"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-bold text-gray-700 mb-1">Descripción:</label>
                                <textarea
                                    className="w-full border border-gray-300 rounded p-2.5 text-sm"
                                    rows={3}
                                    value={descripcionForm}
                                    onChange={(e) => setDescripcionForm(e.target.value)}
                                    placeholder="Descripción"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-bold text-gray-700 mb-1">Descuento por defecto (%):</label>
                                <div className="flex items-center border border-gray-300 rounded overflow-hidden">
                                    <input
                                        type="number"
                                        step="0.01"
                                        className="flex-1 p-2.5 text-sm outline-none"
                                        value={porcentajeForm}
                                        onChange={(e) => setPorcentajeForm(e.target.value)}
                                        placeholder="Ej: 25"
                                    />
                                    <span className="px-3 text-gray-400 bg-gray-50 h-full flex items-center">%</span>
                                </div>
                                <p className="text-xs text-gray-400 mt-1">
                                    Descuento que se aplicará automáticamente a los clientes de este grupo. Se puede ajustar por cliente.
                                </p>
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
