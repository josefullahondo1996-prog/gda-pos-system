import { useEffect, useState } from 'react';
import { supabase } from './supabaseClient';
import { useEmpresaInfo } from './utils/useEmpresa';
import { sonidoExito, sonidoError } from './utils/sonido';

const vacio = {
    nombre: '',
    codigo_ubicacion: '',
    punto_referencia: '',
    ciudad: '',
    codigo_postal: '',
    departamento: '',
    pais: 'Paraguay',
    precio_grupal: '',
    esquema_factura: 'Default',
    diseno_factura_pos: 'COMPROVANTE',
    diseno_factura_venta: 'COMPROVANTE',
};

export default function UbicacionesComerciales() {
    const { id: empresaId, nombre: nombreEmpresa } = useEmpresaInfo();
    const [ubicaciones, setUbicaciones] = useState([]);
    const [cargando, setCargando] = useState(true);
    const [busqueda, setBusqueda] = useState('');

    const [mostrarForm, setMostrarForm] = useState(false);
    const [editando, setEditando] = useState(null);
    const [form, setForm] = useState(vacio);
    const [guardando, setGuardando] = useState(false);

    useEffect(() => {
        if (empresaId) cargarUbicaciones();
    }, [empresaId]);

    const cargarUbicaciones = async () => {
        setCargando(true);
        const { data, error } = await supabase
            .from('ubicaciones_comerciales')
            .select('*')
            .eq('empresa_id', empresaId)
            .order('creado_en', { ascending: true });
        if (!error && data) setUbicaciones(data);
        setCargando(false);
    };

    const ubicacionesFiltradas = ubicaciones.filter((u) =>
        [u.nombre, u.codigo_ubicacion, u.ciudad, u.departamento].join(' ').toLowerCase().includes(busqueda.toLowerCase())
    );

    const abrirNuevo = () => {
        setEditando(null);
        setForm({ ...vacio, nombre: ubicaciones.length === 0 ? (nombreEmpresa || '') : '' });
        setMostrarForm(true);
    };

    const abrirEditar = (u) => {
        setEditando(u);
        setForm({
            nombre: u.nombre || '',
            codigo_ubicacion: u.codigo_ubicacion || '',
            punto_referencia: u.punto_referencia || '',
            ciudad: u.ciudad || '',
            codigo_postal: u.codigo_postal || '',
            departamento: u.departamento || '',
            pais: u.pais || 'Paraguay',
            precio_grupal: u.precio_grupal || '',
            esquema_factura: u.esquema_factura || 'Default',
            diseno_factura_pos: u.diseno_factura_pos || 'COMPROVANTE',
            diseno_factura_venta: u.diseno_factura_venta || 'COMPROVANTE',
        });
        setMostrarForm(true);
    };

    const guardar = async (e) => {
        e.preventDefault();
        if (!form.nombre.trim()) return alert('El nombre de la ubicación es obligatorio.');
        setGuardando(true);
        try {
            const datos = { ...form, empresa_id: empresaId };
            if (editando) {
                const { error } = await supabase.from('ubicaciones_comerciales').update(datos).eq('id', editando.id).eq('empresa_id', empresaId);
                if (error) throw error;
            } else {
                const { error } = await supabase.from('ubicaciones_comerciales').insert([datos]);
                if (error) throw error;
            }
            sonidoExito();
            setMostrarForm(false);
            cargarUbicaciones();
        } catch (error) {
            sonidoError();
            alert('Error al guardar la ubicación: ' + error.message);
        } finally {
            setGuardando(false);
        }
    };

    const alternarActiva = async (u) => {
        const { error } = await supabase.from('ubicaciones_comerciales').update({ activo: !u.activo }).eq('id', u.id).eq('empresa_id', empresaId);
        if (error) return alert('Error al actualizar el estado: ' + error.message);
        sonidoExito();
        cargarUbicaciones();
    };

    return (
        <div className="bg-transparent text-sm text-gray-700">
            <h2 className="text-2xl font-bold text-gray-800 mb-1">Ubicaciones comerciales</h2>
            <p className="text-gray-400 text-xs mb-4">Administre las ubicaciones comerciales</p>

            <div className="bg-white rounded-lg shadow-sm border-t-2 border-[#004284]">
                <div className="p-4 border-b border-gray-100 flex justify-between items-center">
                    <h3 className="font-bold text-gray-700">Todas las ubicaciones comerciales</h3>
                    <button onClick={abrirNuevo} className="bg-orange-500 hover:bg-orange-600 text-white font-bold px-4 py-2 rounded text-sm">
                        + Añadir
                    </button>
                </div>

                <div className="p-4">
                    <div className="flex justify-end mb-4">
                        <input
                            type="text"
                            className="border rounded p-1.5 w-64 outline-none focus:border-blue-500"
                            placeholder="Buscar ..."
                            value={busqueda}
                            onChange={(e) => setBusqueda(e.target.value)}
                        />
                    </div>

                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm border-collapse whitespace-nowrap">
                            <thead>
                                <tr className="border-b border-gray-200 bg-gray-50 text-gray-500 font-bold uppercase text-xs">
                                    <th className="p-3">Nombre</th>
                                    <th className="p-3">ID de ubicación</th>
                                    <th className="p-3">Punto de referencia</th>
                                    <th className="p-3">Ciudad</th>
                                    <th className="p-3">Código postal</th>
                                    <th className="p-3">Departamento</th>
                                    <th className="p-3">País</th>
                                    <th className="p-3">Precio grupal</th>
                                    <th className="p-3">Esquema de la factura</th>
                                    <th className="p-3">Diseño de factura para POS</th>
                                    <th className="p-3">Diseño de factura a la venta</th>
                                    <th className="p-3">Acción</th>
                                </tr>
                            </thead>
                            <tbody>
                                {cargando ? (
                                    <tr><td colSpan={12} className="text-center py-8 text-gray-400">Cargando...</td></tr>
                                ) : ubicacionesFiltradas.length === 0 ? (
                                    <tr><td colSpan={12} className="text-center py-8 text-gray-400">No hay ubicaciones comerciales registradas.</td></tr>
                                ) : (
                                    ubicacionesFiltradas.map((u) => (
                                        <tr key={u.id} className="border-b hover:bg-gray-50">
                                            <td className="p-3 font-medium text-gray-700">{u.nombre}</td>
                                            <td className="p-3 text-gray-500">{u.codigo_ubicacion || '—'}</td>
                                            <td className="p-3 text-gray-500">{u.punto_referencia || '—'}</td>
                                            <td className="p-3 text-gray-500">{u.ciudad || '—'}</td>
                                            <td className="p-3 text-gray-500">{u.codigo_postal || '—'}</td>
                                            <td className="p-3 text-gray-500">{u.departamento || '—'}</td>
                                            <td className="p-3 text-gray-500">{u.pais || '—'}</td>
                                            <td className="p-3 text-gray-500">{u.precio_grupal || '—'}</td>
                                            <td className="p-3 text-gray-500">{u.esquema_factura || '—'}</td>
                                            <td className="p-3 text-gray-500">{u.diseno_factura_pos || '—'}</td>
                                            <td className="p-3 text-gray-500">{u.diseno_factura_venta || '—'}</td>
                                            <td className="p-3">
                                                <div className="flex gap-2 flex-wrap">
                                                    <button onClick={() => abrirEditar(u)} className="bg-orange-500 hover:bg-orange-600 text-white text-xs font-bold px-3 py-1.5 rounded flex items-center gap-1">
                                                        ✏️ Editar
                                                    </button>
                                                    <button onClick={() => alert('Configuraciones de la ubicación en construcción')} className="bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-bold px-3 py-1.5 rounded flex items-center gap-1">
                                                        🔧 Configuraciones
                                                    </button>
                                                    <button onClick={() => alternarActiva(u)} className={`text-white text-xs font-bold px-3 py-1.5 rounded flex items-center gap-1 ${u.activo ? 'bg-red-600 hover:bg-red-700' : 'bg-gray-500 hover:bg-gray-600'}`}>
                                                        {u.activo ? '⏻ Desactivar ubicación' : '⏻ Activar ubicación'}
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>

                    <div className="text-xs font-bold text-gray-500 mt-4">
                        Mostrando {ubicacionesFiltradas.length === 0 ? 0 : 1} a {ubicacionesFiltradas.length} de {ubicacionesFiltradas.length} entradas
                    </div>
                </div>
            </div>

            {/* Modal Añadir/Editar ubicación */}
            {mostrarForm && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden max-h-[90vh] flex flex-col">
                        <div className="bg-[#5b4fcf] px-5 py-4 flex justify-between items-center">
                            <h3 className="text-white font-bold text-lg">{editando ? 'Editar ubicación comercial' : 'Añadir ubicación comercial'}</h3>
                            <button onClick={() => setMostrarForm(false)} className="text-white/80 hover:text-white text-xl leading-none">✕</button>
                        </div>
                        <form onSubmit={guardar} className="p-6 flex flex-col gap-4 overflow-y-auto">
                            <div>
                                <label className="block text-sm font-bold text-gray-700 mb-1">Nombre:*</label>
                                <input autoFocus className="w-full border border-gray-300 rounded p-2.5 text-sm" value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} placeholder="Ej: G.D.A - Repuestos y Servicios" />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-bold text-gray-700 mb-1">ID de ubicación:</label>
                                    <input className="w-full border border-gray-300 rounded p-2.5 text-sm" value={form.codigo_ubicacion} onChange={(e) => setForm({ ...form, codigo_ubicacion: e.target.value })} placeholder="BL0001" />
                                </div>
                                <div>
                                    <label className="block text-sm font-bold text-gray-700 mb-1">Punto de referencia:</label>
                                    <input className="w-full border border-gray-300 rounded p-2.5 text-sm" value={form.punto_referencia} onChange={(e) => setForm({ ...form, punto_referencia: e.target.value })} />
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-bold text-gray-700 mb-1">Ciudad:</label>
                                    <input className="w-full border border-gray-300 rounded p-2.5 text-sm" value={form.ciudad} onChange={(e) => setForm({ ...form, ciudad: e.target.value })} />
                                </div>
                                <div>
                                    <label className="block text-sm font-bold text-gray-700 mb-1">Código postal:</label>
                                    <input className="w-full border border-gray-300 rounded p-2.5 text-sm" value={form.codigo_postal} onChange={(e) => setForm({ ...form, codigo_postal: e.target.value })} />
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-bold text-gray-700 mb-1">Departamento:</label>
                                    <input className="w-full border border-gray-300 rounded p-2.5 text-sm" value={form.departamento} onChange={(e) => setForm({ ...form, departamento: e.target.value })} placeholder="Ej: Alto Paraná" />
                                </div>
                                <div>
                                    <label className="block text-sm font-bold text-gray-700 mb-1">País:</label>
                                    <input className="w-full border border-gray-300 rounded p-2.5 text-sm" value={form.pais} onChange={(e) => setForm({ ...form, pais: e.target.value })} />
                                </div>
                            </div>
                            <div>
                                <label className="block text-sm font-bold text-gray-700 mb-1">Precio grupal:</label>
                                <input className="w-full border border-gray-300 rounded p-2.5 text-sm" value={form.precio_grupal} onChange={(e) => setForm({ ...form, precio_grupal: e.target.value })} />
                            </div>
                            <div className="grid grid-cols-3 gap-4">
                                <div>
                                    <label className="block text-sm font-bold text-gray-700 mb-1">Esquema factura:</label>
                                    <input className="w-full border border-gray-300 rounded p-2.5 text-sm" value={form.esquema_factura} onChange={(e) => setForm({ ...form, esquema_factura: e.target.value })} />
                                </div>
                                <div>
                                    <label className="block text-sm font-bold text-gray-700 mb-1">Diseño factura POS:</label>
                                    <input className="w-full border border-gray-300 rounded p-2.5 text-sm" value={form.diseno_factura_pos} onChange={(e) => setForm({ ...form, diseno_factura_pos: e.target.value })} />
                                </div>
                                <div>
                                    <label className="block text-sm font-bold text-gray-700 mb-1">Diseño factura venta:</label>
                                    <input className="w-full border border-gray-300 rounded p-2.5 text-sm" value={form.diseno_factura_venta} onChange={(e) => setForm({ ...form, diseno_factura_venta: e.target.value })} />
                                </div>
                            </div>

                            <div className="flex gap-2 justify-end pt-2 border-t border-gray-100">
                                <button type="submit" disabled={guardando} className="bg-orange-500 hover:bg-orange-600 text-white font-bold text-sm px-5 py-2 rounded disabled:opacity-60">
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
