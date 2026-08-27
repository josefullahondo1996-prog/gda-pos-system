import { useEffect, useState } from 'react';
import { supabase } from './supabaseClient';
import { useEmpresaInfo } from './utils/useEmpresa';
import RolPermisos from './RolPermisos';
import { useNotificacion } from './NotificacionContext';
import { useLanguage } from './LanguageContext';

export default function Roles() {
    const { t } = useLanguage();
    const { id: empresaId } = useEmpresaInfo();
    const { confirmar } = useNotificacion();
    const [roles, setRoles] = useState([]);
    const [busqueda, setBusqueda] = useState('');
    const [cargando, setCargando] = useState(true);
    const [porPagina, setPorPagina] = useState(25);

    const [mostrarPantallaPermisos, setMostrarPantallaPermisos] = useState(false);
    const [editando, setEditando] = useState(null);

    useEffect(() => { if (empresaId) cargarRoles(); }, [empresaId]);

    const cargarRoles = async () => {
        setCargando(true);
        const { data, error } = await supabase.from('roles').select('*').eq('empresa_id', empresaId).order('nombre');
        if (!error && data) setRoles(data);
        setCargando(false);
    };

    const rolesFiltrados = roles.filter((r) => r.nombre.toLowerCase().includes(busqueda.toLowerCase()));

    const abrirNuevo = () => {
        setEditando(null);
        setMostrarPantallaPermisos(true);
    };

    const abrirEditar = (rol) => {
        setEditando(rol);
        setMostrarPantallaPermisos(true);
    };

    const eliminarRol = async (rol) => {
        if (!(await confirmar(`El rol "${rol.nombre}" será eliminado permanentemente.`, { titulo: '¿Estás seguro?', textoConfirmar: 'Eliminar', textoCancelar: 'Cancelar', peligroso: true }))) return;
        const { error } = await supabase.from('roles').delete().eq('id', rol.id).eq('empresa_id', empresaId);
        if (error) return alert(t('deleteError') + ': ' + error.message);
        setRoles(roles.filter((r) => r.id !== rol.id));
    };

    if (mostrarPantallaPermisos) {
        return (
            <RolPermisos
                rolEditar={editando}
                onGuardado={() => { setMostrarPantallaPermisos(false); cargarRoles(); }}
                onCancelar={() => setMostrarPantallaPermisos(false)}
            />
        );
    }

    return (
        <div className="bg-transparent text-sm text-gray-700">
            <h2 className="text-2xl font-bold text-gray-800 mb-1">{t('roles')}</h2>
            <p className="text-gray-400 text-xs mb-4">{t('manageRoles')}</p>

            <div className="bg-white rounded-lg shadow-sm border-t-2 border-[#004284]">
                <div className="p-4 border-b border-gray-100 flex justify-between items-center">
                    <h3 className="font-bold text-gray-700">{t('allRoles')}</h3>
                    <button onClick={abrirNuevo} className="bg-orange-500 hover:bg-orange-600 text-white font-bold px-4 py-2 rounded text-sm">
                        + {t('add')}
                    </button>
                </div>

                <div className="p-4">
                    <div className="flex flex-wrap justify-between items-center gap-3 mb-4">
                        <div className="flex items-center gap-2 text-gray-600 font-medium text-xs">
                            <span>{t('show')}</span>
                            <select value={porPagina} onChange={(e) => setPorPagina(Number(e.target.value))} className="border rounded p-1.5 bg-white">
                                <option value={10}>10</option>
                                <option value={25}>25</option>
                                <option value={50}>50</option>
                            </select>
                            <span>{t('entries')}</span>
                        </div>
                        <input
                            type="text"
                            className="border rounded p-1.5 w-64 outline-none focus:border-blue-500"
                            placeholder={`${t('search')} ...`}
                            value={busqueda}
                            onChange={(e) => setBusqueda(e.target.value)}
                        />
                    </div>

                    <table className="w-full text-left text-sm border-collapse">
                        <thead>
                            <tr className="border-b border-gray-200 bg-gray-50 text-gray-500 font-bold uppercase text-xs">
                                <th className="p-3">{t('roles')}</th>
                                <th className="p-3 w-56">{t('action')}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {cargando ? (
                                <tr><td colSpan={2} className="text-center py-8 text-gray-400">{t('loading')}</td></tr>
                            ) : rolesFiltrados.length === 0 ? (
                                <tr><td colSpan={2} className="text-center py-8 text-gray-400">{t('noRoles')}</td></tr>
                            ) : (
                                rolesFiltrados.slice(0, porPagina).map((r) => (
                                    <tr key={r.id} className="border-b hover:bg-gray-50 group">
                                        <td className="p-3 font-medium text-gray-700">{r.nombre}</td>
                                        <td className="p-3">
                                            <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                                <button onClick={() => abrirEditar(r)} className="bg-orange-500 hover:bg-orange-600 text-white text-xs font-bold px-3 py-1.5 rounded flex items-center gap-1">
                                                    ✏️ {t('edit')}
                                                </button>
                                                <button onClick={() => eliminarRol(r)} className="bg-red-600 hover:bg-red-700 text-white text-xs font-bold px-3 py-1.5 rounded flex items-center gap-1">
                                                    🗑️ {t('delete')}
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>

                    <div className="text-xs font-bold text-gray-500 mt-4">
                        {t('showing')} 1 {t('to')} {Math.min(porPagina, rolesFiltrados.length)} {t('of')} {rolesFiltrados.length} {t('entries')}
                    </div>
                </div>
            </div>
        </div>
    );
}