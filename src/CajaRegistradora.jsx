import { useEffect, useState } from 'react';
import { supabase } from './supabaseClient';
import { useEmpresaInfo, useNombreEmpresa } from './utils/useEmpresa';

const formatGs = (v) => `${Number(v || 0).toLocaleString('es-PY')} Gs`;
const formatFecha = (f) => f ? new Date(f).toLocaleDateString('es-PY') + ' ' + new Date(f).toLocaleTimeString('es-PY', { hour: '2-digit', minute: '2-digit' }) : '—';

const formatDuracion = (inicio, fin) => {
    if (!inicio || !fin) return '';
    const ms = new Date(fin).getTime() - new Date(inicio).getTime();
    const h = Math.floor(ms / 3600000);
    const m = Math.floor((ms % 3600000) / 60000);
    return `(${h}h ${m}min)`;
};

export default function CajaRegistradora() {
    const nombreEmpresa = useNombreEmpresa();
    const { id: empresaId } = useEmpresaInfo();
    const [cajas, setCajas] = useState([]);
    const [ventas, setVentas] = useState([]);
    const [ubicaciones, setUbicaciones] = useState({});
    const [cargando, setCargando] = useState(true);

    const [filtroUsuario, setFiltroUsuario] = useState('Todos');
    const [filtroEstado, setFiltroEstado] = useState('Todas');
    const [fechaDesde, setFechaDesde] = useState('');
    const [fechaHasta, setFechaHasta] = useState('');
    const [busqueda, setBusqueda] = useState('');

    const [paginaActual, setPaginaActual] = useState(1);
    const [porPagina, setPorPagina] = useState(25);

    useEffect(() => {
        if (empresaId) cargarDatos();
    }, [empresaId]);

    const cargarDatos = async () => {
        if (!empresaId) return;
        setCargando(true);
        const [resCajas, resVentas, resUbicaciones] = await Promise.all([
            supabase.from('caja_registros').select('*').eq('empresa_id', empresaId).order('fecha_apertura', { ascending: false }),
            supabase.from('ventas').select('caja_id, total, metodo_pago').eq('empresa_id', empresaId),
            supabase.from('ubicaciones_comerciales').select('id, nombre').eq('empresa_id', empresaId),
        ]);
        if (!resCajas.error && resCajas.data) setCajas(resCajas.data);
        if (!resVentas.error && resVentas.data) setVentas(resVentas.data);
        if (!resUbicaciones.error && resUbicaciones.data) {
            const mapa = {};
            resUbicaciones.data.forEach((u) => { mapa[u.id] = u.nombre; });
            setUbicaciones(mapa);
        }
        setCargando(false);
    };

    const totalesPorCaja = (cajaId) => {
        const ventasCaja = ventas.filter((v) => v.caja_id === cajaId);
        return {
            efectivo: ventasCaja.filter((v) => v.metodo_pago === 'Efectivo').reduce((a, v) => a + Number(v.total || 0), 0),
            tarjeta: ventasCaja.filter((v) => v.metodo_pago === 'Tarjeta').reduce((a, v) => a + Number(v.total || 0), 0),
            transferencia: ventasCaja.filter((v) => v.metodo_pago === 'Transferencia').reduce((a, v) => a + Number(v.total || 0), 0),
        };
    };

    const usuarios = [...new Set(cajas.map((c) => c.usuario).filter(Boolean))];

    const cajasFiltradas = cajas.filter((c) => {
        const coincideUsuario = filtroUsuario === 'Todos' || c.usuario === filtroUsuario;
        const coincideEstado = filtroEstado === 'Todas' || c.estado === filtroEstado;
        const fechaCaja = c.fecha_apertura ? new Date(c.fecha_apertura) : null;
        const coincideDesde = !fechaDesde || (fechaCaja && fechaCaja >= new Date(fechaDesde));
        const coincideHasta = !fechaHasta || (fechaCaja && fechaCaja <= new Date(fechaHasta + 'T23:59:59'));
        const coincideBusqueda = !busqueda || (c.usuario || '').toLowerCase().includes(busqueda.toLowerCase());
        return coincideUsuario && coincideEstado && coincideDesde && coincideHasta && coincideBusqueda;
    });

    const totalPaginas = Math.max(1, Math.ceil(cajasFiltradas.length / porPagina));
    const paginaSegura = Math.min(paginaActual, totalPaginas);
    const cajasPagina = cajasFiltradas.slice((paginaSegura - 1) * porPagina, paginaSegura * porPagina);

    useEffect(() => { setPaginaActual(1); }, [filtroUsuario, filtroEstado, fechaDesde, fechaHasta, busqueda, porPagina]);

    const totalEfectivoGeneral = cajasFiltradas.reduce((a, c) => a + totalesPorCaja(c.id).efectivo, 0);
    const totalTarjetaGeneral = cajasFiltradas.reduce((a, c) => a + totalesPorCaja(c.id).tarjeta, 0);
    const totalTransferenciaGeneral = cajasFiltradas.reduce((a, c) => a + totalesPorCaja(c.id).transferencia, 0);
    const cajasAbiertas = cajas.filter((c) => c.estado === 'Abierta').length;

    const exportarCSV = () => {
        const filas = [
            ['Estado', 'Apertura', 'Cierre', 'Ubicación', 'Usuario', 'Efectivo', 'Tarjeta', 'Transferencia'],
            ...cajasFiltradas.map((c) => {
                const t = totalesPorCaja(c.id);
                return [c.estado, formatFecha(c.fecha_apertura), formatFecha(c.fecha_cierre), ubicaciones[c.ubicacion_id] || nombreEmpresa, c.usuario || '—', t.efectivo, t.tarjeta, t.transferencia];
            }),
        ];
        const csv = filas.map((f) => f.join(',')).join('\n');
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'caja-registradora.csv';
        a.click();
        URL.revokeObjectURL(url);
    };

    return (
        <div className="bg-transparent text-sm text-gray-700">
            <h2 className="text-2xl font-bold text-gray-800 mb-4 flex items-center gap-2">🏧 Caja registradora</h2>

            {/* Filtros */}
            <div className="bg-white p-4 rounded-lg shadow-sm border-t-2 border-[#004284] mb-4">
                <h3 className="text-xs font-bold text-blue-600 mb-3 flex items-center gap-1">🔻 Filtros</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                        <label className="block text-xs font-bold text-gray-500 mb-1">Usuario:</label>
                        <select className="w-full border border-gray-300 rounded p-2 text-sm bg-white" value={filtroUsuario} onChange={(e) => setFiltroUsuario(e.target.value)}>
                            <option value="Todos">Todos los usuarios</option>
                            {usuarios.map((u) => <option key={u} value={u}>{u}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-gray-500 mb-1">Estado:</label>
                        <select className="w-full border border-gray-300 rounded p-2 text-sm bg-white" value={filtroEstado} onChange={(e) => setFiltroEstado(e.target.value)}>
                            <option value="Todas">Todas</option>
                            <option value="Abierta">Abierta</option>
                            <option value="Cerrada">Cerrada</option>
                        </select>
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-gray-500 mb-1">Rango de fechas:</label>
                        <div className="flex gap-2">
                            <input type="date" className="w-full border border-gray-300 rounded p-2 text-sm" value={fechaDesde} onChange={(e) => setFechaDesde(e.target.value)} />
                            <input type="date" className="w-full border border-gray-300 rounded p-2 text-sm" value={fechaHasta} onChange={(e) => setFechaHasta(e.target.value)} />
                        </div>
                    </div>
                </div>
            </div>

            {/* KPIs */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-100 flex items-center gap-3">
                    <div className="bg-blue-100 text-blue-600 p-2 rounded-lg font-bold text-sm">Gs</div>
                    <div>
                        <p className="text-[11px] font-bold text-gray-400 uppercase">Total PYG</p>
                        <p className="font-black text-lg text-gray-800">{formatGs(totalEfectivoGeneral)}</p>
                    </div>
                </div>
                <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-100 flex items-center gap-3">
                    <div className="bg-orange-100 text-orange-600 p-2 rounded-lg">🏧</div>
                    <div>
                        <p className="text-[11px] font-bold text-gray-400 uppercase">Cajas</p>
                        <p className="font-black text-lg text-orange-500">{cajasFiltradas.length} <span className="text-xs font-normal text-gray-400">{cajasAbiertas} abiertas</span></p>
                    </div>
                </div>
            </div>

            {/* Tabla */}
            <div className="bg-white rounded-lg shadow-sm border-t-2 border-[#004284] p-4">
                <div className="flex flex-wrap justify-between items-center gap-3 mb-4">
                    <div className="flex gap-1 flex-wrap items-center">
                        <button onClick={exportarCSV} className="bg-gray-100 border text-gray-600 px-2.5 py-1 rounded text-xs font-semibold hover:bg-gray-200">📄 Exportar a CSV</button>
                        <button onClick={() => window.print()} className="bg-gray-100 border text-gray-600 px-2.5 py-1 rounded text-xs font-semibold hover:bg-gray-200">🖨️ Imprimir</button>
                        <select value={porPagina} onChange={(e) => setPorPagina(Number(e.target.value))} className="border rounded p-1.5 text-xs font-semibold bg-white ml-2">
                            <option value={10}>Mostrar 10</option>
                            <option value={25}>Mostrar 25</option>
                            <option value={50}>Mostrar 50</option>
                        </select>
                    </div>
                    <input
                        type="text"
                        className="border rounded p-1.5 w-64 outline-none focus:border-blue-500"
                        placeholder="Buscar por usuario..."
                        value={busqueda}
                        onChange={(e) => setBusqueda(e.target.value)}
                    />
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs border-collapse">
                        <thead>
                            <tr className="border-b border-gray-200 bg-gray-50 text-gray-500 font-bold uppercase">
                                <th className="p-3">Estado</th>
                                <th className="p-3">Apertura</th>
                                <th className="p-3">Cierre</th>
                                <th className="p-3">Ubicación</th>
                                <th className="p-3">Usuario</th>
                                <th className="p-3 text-right">Efectivo</th>
                                <th className="p-3 text-right">Tarjeta</th>
                                <th className="p-3 text-right">Transferencia</th>
                            </tr>
                        </thead>
                        <tbody>
                            {cargando ? (
                                <tr><td colSpan={8} className="text-center py-8 text-gray-400">Cargando...</td></tr>
                            ) : cajasPagina.length === 0 ? (
                                <tr><td colSpan={8} className="text-center py-8 text-gray-400">No hay cajas registradas.</td></tr>
                            ) : (
                                cajasPagina.map((c) => {
                                    const t = totalesPorCaja(c.id);
                                    return (
                                        <tr key={c.id} className="border-b hover:bg-gray-50">
                                            <td className="p-3">
                                                <span className={`px-2 py-1 rounded-full text-[10px] font-bold ${c.estado === 'Abierta' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                                                    {c.estado || '—'}
                                                </span>
                                            </td>
                                            <td className="p-3 text-gray-600">{formatFecha(c.fecha_apertura)}</td>
                                            <td className="p-3 text-gray-600">
                                                {formatFecha(c.fecha_cierre)} <span className="text-gray-400">{formatDuracion(c.fecha_apertura, c.fecha_cierre)}</span>
                                            </td>
                                            <td className="p-3 text-gray-500">{ubicaciones[c.ubicacion_id] || nombreEmpresa}</td>
                                            <td className="p-3 font-medium text-gray-700">{c.usuario || '—'}</td>
                                            <td className="p-3 text-right font-semibold text-gray-700">{t.efectivo > 0 ? formatGs(t.efectivo) : '-'}</td>
                                            <td className="p-3 text-right font-semibold text-gray-700">{t.tarjeta > 0 ? formatGs(t.tarjeta) : '-'}</td>
                                            <td className="p-3 text-right font-semibold text-gray-700">{t.transferencia > 0 ? formatGs(t.transferencia) : '-'}</td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                        {cajasPagina.length > 0 && (
                            <tfoot>
                                <tr className="font-bold bg-gray-50">
                                    <td colSpan={5} className="p-3 text-gray-700">Total:</td>
                                    <td className="p-3 text-right">{formatGs(totalEfectivoGeneral)}</td>
                                    <td className="p-3 text-right">{formatGs(totalTarjetaGeneral)}</td>
                                    <td className="p-3 text-right">{formatGs(totalTransferenciaGeneral)}</td>
                                </tr>
                            </tfoot>
                        )}
                    </table>
                </div>

                <div className="flex flex-wrap justify-between items-center mt-4 gap-2">
                    <div className="text-xs font-bold text-gray-500">
                        Mostrando {cajasPagina.length === 0 ? 0 : (paginaSegura - 1) * porPagina + 1} a {(paginaSegura - 1) * porPagina + cajasPagina.length} de {cajasFiltradas.length} entradas
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
    );
}