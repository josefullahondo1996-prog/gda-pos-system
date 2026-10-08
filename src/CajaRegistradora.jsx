import { useEffect, useMemo, useState } from 'react';
import { Eye, FileDown, Printer, RefreshCw, Search } from 'lucide-react';
import { supabase } from './supabaseClient';
import { useEmpresaInfo, useNombreEmpresa } from './utils/useEmpresa';
import DetalleCaja from './DetalleCaja';

const formatGs = (v) => `${Number(v || 0).toLocaleString('es-PY')} Gs`;
const formatFecha = (f) => f ? new Date(f).toLocaleDateString('es-PY') + ' ' + new Date(f).toLocaleTimeString('es-PY', { hour: '2-digit', minute: '2-digit' }) : '—';
const metodosPago = ['Efectivo', 'Tarjeta', 'Transferencia', 'QR'];
const metodoNormalizado = (valor = '') => {
    const texto = valor.toLowerCase();
    if (texto.includes('efectivo') || texto.includes('contado')) return 'Efectivo';
    if (texto.includes('tarjeta') || texto.includes('pos')) return 'Tarjeta';
    if (texto.includes('transfer')) return 'Transferencia';
    if (texto.includes('qr')) return 'QR';
    return 'Otros';
};

export default function CajaRegistradora({ session, perfilUsuario }) {
    const nombreEmpresa = useNombreEmpresa();
    const { id: empresaId } = useEmpresaInfo();
    const [cajas, setCajas] = useState([]);
    const [ventas, setVentas] = useState([]);
    const [gastos, setGastos] = useState([]);
    const [ubicaciones, setUbicaciones] = useState({});
    const [cargando, setCargando] = useState(true);
    const [error, setError] = useState('');
    const [filtroUsuario, setFiltroUsuario] = useState('Todos');
    const [filtroEstado, setFiltroEstado] = useState('Todas');
    const [fechaDesde, setFechaDesde] = useState('');
    const [fechaHasta, setFechaHasta] = useState('');
    const [busqueda, setBusqueda] = useState('');
    const [paginaActual, setPaginaActual] = useState(1);
    const [porPagina, setPorPagina] = useState(25);
    const [cajaSeleccionada, setCajaSeleccionada] = useState(null);

    const cargarDatos = async () => {
        if (!empresaId) return;
        setCargando(true); setError('');
        const [resCajas, resVentas, resGastos, resUbicaciones] = await Promise.all([
            supabase.from('caja_registros').select('*').eq('empresa_id', empresaId).order('fecha_apertura', { ascending: false }),
            supabase.from('ventas').select('id, caja_id, total, monto_pagado, saldo_pendiente, estado_pago, metodo_pago, fecha, cliente, usuario_nombre').eq('empresa_id', empresaId),
            supabase.from('gastos').select('id, caja_id, monto, metodo_pago, descripcion, fecha').eq('empresa_id', empresaId),
            supabase.from('ubicaciones_comerciales').select('id, nombre').eq('empresa_id', empresaId),
        ]);
        const fallos = [resCajas, resVentas, resGastos].filter((r) => r.error);
        if (fallos.length) setError(`No se pudieron cargar todos los datos de caja: ${fallos.map((r) => r.error.message).join(' · ')}`);
        setCajas(resCajas.data || []); setVentas(resVentas.data || []); setGastos(resGastos.data || []);
        if (resUbicaciones.data) setUbicaciones(Object.fromEntries(resUbicaciones.data.map((u) => [u.id, u.nombre])));
        setCargando(false);
    };

    useEffect(() => { if (empresaId) cargarDatos(); }, [empresaId]);

    const totalesPorCaja = (cajaId) => {
        const ventasCaja = ventas.filter((v) => String(v.caja_id) === String(cajaId));
        const gastosCaja = gastos.filter((g) => String(g.caja_id) === String(cajaId));
        const ventasMetodo = Object.fromEntries([...metodosPago, 'Otros'].map((metodo) => [metodo, ventasCaja.filter((v) => metodoNormalizado(v.metodo_pago) === metodo).reduce((a, v) => a + Number(v.total || 0), 0)]));
        const gastosEfectivo = gastosCaja.filter((g) => metodoNormalizado(g.metodo_pago || 'Efectivo') === 'Efectivo').reduce((a, g) => a + Number(g.monto || 0), 0);
        const totalGastos = gastosCaja.reduce((a, g) => a + Number(g.monto || 0), 0);
        const efectivoEsperado = Number(cajas.find((c) => String(c.id) === String(cajaId))?.saldo_inicial || 0) + ventasMetodo.Efectivo - gastosEfectivo;
        const caja = cajas.find((c) => String(c.id) === String(cajaId));
        const contado = caja?.conteo_real == null ? null : Number(caja.conteo_real);
        return { ...ventasMetodo, totalVentas: ventasCaja.reduce((a, v) => a + Number(v.total || 0), 0), totalGastos, gastosEfectivo, ventasCaja, gastosCaja, cantidadVentas: ventasCaja.length, efectivoEsperado, contado, diferencia: contado == null ? null : contado - efectivoEsperado };
    };

    const usuarios = [...new Set(cajas.map((c) => c.usuario).filter(Boolean))];
    const cajasFiltradas = useMemo(() => cajas.filter((c) => {
        const fechaCaja = c.fecha_apertura ? new Date(c.fecha_apertura) : null;
        const texto = `${c.usuario || ''} ${ubicaciones[c.ubicacion_id] || nombreEmpresa || ''} ${c.estado || ''}`.toLowerCase();
        return (filtroUsuario === 'Todos' || c.usuario === filtroUsuario)
            && (filtroEstado === 'Todas' || c.estado === filtroEstado)
            && (!fechaDesde || (fechaCaja && fechaCaja >= new Date(`${fechaDesde}T00:00:00`)))
            && (!fechaHasta || (fechaCaja && fechaCaja <= new Date(`${fechaHasta}T23:59:59`)))
            && (!busqueda || texto.includes(busqueda.toLowerCase()));
    }), [cajas, filtroUsuario, filtroEstado, fechaDesde, fechaHasta, busqueda, ubicaciones, nombreEmpresa]);
    const totalPaginas = Math.max(1, Math.ceil(cajasFiltradas.length / porPagina));
    const paginaSegura = Math.min(paginaActual, totalPaginas);
    const cajasPagina = cajasFiltradas.slice((paginaSegura - 1) * porPagina, paginaSegura * porPagina);
    useEffect(() => { setPaginaActual(1); }, [filtroUsuario, filtroEstado, fechaDesde, fechaHasta, busqueda, porPagina]);

    const resumenPagina = cajasPagina.reduce((a, c) => {
        const t = totalesPorCaja(c.id);
        a.total += t.totalVentas; a.contado += t.contado || 0; a.diferencia += t.diferencia || 0;
        [...metodosPago, 'Otros'].forEach((m) => { a[m] += t[m]; });
        return a;
    }, { total: 0, contado: 0, diferencia: 0, ...Object.fromEntries([...metodosPago, 'Otros'].map((m) => [m, 0])) });
    const cajasAbiertas = cajasFiltradas.filter((c) => c.estado === 'Abierta').length;

    const exportarCSV = () => {
        const columnas = ['Estado', 'Apertura', 'Cierre', 'Ubicación', 'Usuario', 'Total ventas', 'Contado', 'Diferencia', ...metodosPago, 'Otros', 'Gastos'];
        const filas = cajasFiltradas.map((c) => { const t = totalesPorCaja(c.id); return [c.estado, formatFecha(c.fecha_apertura), formatFecha(c.fecha_cierre), ubicaciones[c.ubicacion_id] || nombreEmpresa, c.usuario || '—', t.totalVentas, t.contado ?? '', t.diferencia ?? '', ...metodosPago.map((m) => t[m]), t.Otros, t.totalGastos]; });
        const csv = [columnas, ...filas].map((fila) => fila.map((valor) => `"${String(valor ?? '').replaceAll('"', '""')}"`).join(';')).join('\r\n');
        const url = URL.createObjectURL(new Blob(['\ufeff', csv], { type: 'text/csv;charset=utf-8' }));
        const a = document.createElement('a'); a.href = url; a.download = 'caja-registradora.csv'; a.click(); URL.revokeObjectURL(url);
    };

    return <div className="bg-transparent text-sm text-gray-700">
        <header className="mb-4 flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-2xl font-bold text-gray-800">🏧 Caja registradora</h2><p className="mt-1 text-xs text-gray-500">Consulta los turnos, movimientos y diferencias de arqueo.</p></div><button onClick={cargarDatos} className="inline-flex items-center gap-2 rounded-lg border bg-white px-3 py-2 text-xs font-semibold hover:bg-gray-50"><RefreshCw size={14} /> Actualizar</button></header>
        {error && <div role="alert" className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">{error}</div>}
        <section className="mb-4 rounded-lg border-t-2 border-[#004284] bg-white p-4 shadow-sm"><h3 className="mb-3 text-xs font-bold uppercase text-blue-700">Filtros</h3><div className="grid gap-3 md:grid-cols-4"><label className="text-xs font-semibold text-gray-500">Usuario<select className="mt-1 w-full rounded border p-2 text-sm font-normal" value={filtroUsuario} onChange={(e) => setFiltroUsuario(e.target.value)}><option value="Todos">Todos los usuarios</option>{usuarios.map((u) => <option key={u}>{u}</option>)}</select></label><label className="text-xs font-semibold text-gray-500">Estado<select className="mt-1 w-full rounded border p-2 text-sm font-normal" value={filtroEstado} onChange={(e) => setFiltroEstado(e.target.value)}><option value="Todas">Todas</option><option value="Abierta">Abierta</option><option value="Cerrada">Cerrada</option></select></label><label className="text-xs font-semibold text-gray-500">Desde<input type="date" className="mt-1 w-full rounded border p-2 text-sm font-normal" value={fechaDesde} onChange={(e) => setFechaDesde(e.target.value)} /></label><label className="text-xs font-semibold text-gray-500">Hasta<input type="date" className="mt-1 w-full rounded border p-2 text-sm font-normal" value={fechaHasta} onChange={(e) => setFechaHasta(e.target.value)} /></label></div></section>
        <section className="mb-4 grid gap-3 sm:grid-cols-2"><article className="rounded-lg border bg-white p-4"><p className="text-[11px] font-bold uppercase text-gray-400">Total PYG · página actual</p><p className="mt-1 text-xl font-black text-gray-800">{formatGs(resumenPagina.total)}</p><p className="text-xs text-gray-500">Ventas registradas en {cajasPagina.length} cajas</p></article><article className="rounded-lg border bg-white p-4"><p className="text-[11px] font-bold uppercase text-gray-400">Cajas en el filtro</p><p className="mt-1 text-xl font-black text-orange-600">{cajasFiltradas.length} <span className="text-xs font-medium text-gray-500">· {cajasAbiertas} abiertas</span></p><p className="text-xs text-gray-500">Los totales se calculan para la página visible.</p></article></section>
        <section className="rounded-lg border-t-2 border-[#004284] bg-white p-4 shadow-sm"><div className="mb-4 flex flex-wrap items-center justify-between gap-3"><div className="flex flex-wrap items-center gap-2"><button onClick={exportarCSV} className="inline-flex items-center gap-1 rounded border bg-gray-50 px-2.5 py-2 text-xs font-semibold"><FileDown size={14} /> Exportar CSV</button><button onClick={() => window.print()} className="inline-flex items-center gap-1 rounded border bg-gray-50 px-2.5 py-2 text-xs font-semibold"><Printer size={14} /> Imprimir</button><select value={porPagina} onChange={(e) => setPorPagina(Number(e.target.value))} className="rounded border bg-white p-2 text-xs"><option value={25}>25 entradas</option><option value={50}>50 entradas</option><option value={100}>100 entradas</option><option value={200}>200 entradas</option></select></div><label className="relative"><Search size={15} className="absolute left-2 top-2.5 text-gray-400" /><input type="search" className="w-64 rounded border py-2 pl-8 pr-2 text-xs outline-none focus:border-blue-500" placeholder="Buscar usuario o ubicación..." value={busqueda} onChange={(e) => setBusqueda(e.target.value)} /></label></div>
            <div className="overflow-x-auto"><table className="w-full min-w-[1450px] border-collapse text-xs"><thead><tr className="border-b bg-gray-50 text-left text-[10px] uppercase text-gray-500">{['Acción','Estado','Apertura','Cierre','Usuario','Total (Gs)','Contado','Diferencia','Efectivo','Tarjeta','Transferencia','Otros','Gs PYG'].map((h) => <th key={h} className="p-3">{h}</th>)}</tr></thead><tbody>{cargando ? <tr><td colSpan="13" className="py-10 text-center text-gray-400">Cargando cajas…</td></tr> : cajasPagina.length === 0 ? <tr><td colSpan="13" className="py-10 text-center text-gray-400">No hay cajas para los filtros seleccionados.</td></tr> : cajasPagina.map((c) => { const t = totalesPorCaja(c.id); const dif = t.diferencia; return <tr key={c.id} className="border-b hover:bg-gray-50"><td className="p-2"><button type="button" onClick={() => setCajaSeleccionada(c)} className="inline-flex items-center gap-1 rounded bg-cyan-600 px-2.5 py-1.5 font-bold text-white hover:bg-cyan-700"><Eye size={13} /> Ver</button></td><td className="p-3"><span className={`rounded-full px-2 py-1 text-[10px] font-bold ${c.estado === 'Abierta' ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-600'}`}>{c.estado || '—'}</span></td><td className="p-3">{formatFecha(c.fecha_apertura)}</td><td className="p-3">{formatFecha(c.fecha_cierre)}</td><td className="p-3">{c.usuario || '—'}<div className="text-[10px] text-gray-400">{ubicaciones[c.ubicacion_id] || nombreEmpresa}</div></td><td className="p-3 text-right font-semibold">{formatGs(t.totalVentas)}</td><td className="p-3 text-right">{t.contado == null ? '—' : formatGs(t.contado)}</td><td className={`p-3 text-right font-bold ${dif == null ? 'text-gray-400' : dif < 0 ? 'text-red-600' : dif > 0 ? 'text-emerald-700' : 'text-gray-600'}`}>{dif == null ? '—' : `${formatGs(dif)}${dif < 0 ? ' · faltante' : dif > 0 ? ' · sobrante' : ' · cuadra'}`}</td>{[...metodosPago, 'Otros'].map((m) => <td key={m} className="p-3 text-right">{formatGs(t[m])}</td>)}<td className="p-3 text-right font-semibold">{formatGs(t.totalVentas)}</td></tr>; })}</tbody>{cajasPagina.length > 0 && <tfoot><tr className="bg-gray-50 font-bold"><td colSpan="5" className="p-3">Total página</td><td className="p-3 text-right">{formatGs(resumenPagina.total)}</td><td className="p-3 text-right">{formatGs(resumenPagina.contado)}</td><td className="p-3 text-right">{formatGs(resumenPagina.diferencia)}</td>{[...metodosPago, 'Otros'].map((m) => <td key={m} className="p-3 text-right">{formatGs(resumenPagina[m])}</td>)}<td className="p-3 text-right">{formatGs(resumenPagina.total)}</td></tr></tfoot>}</table></div>
            <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-xs text-gray-500"><span>Mostrando {cajasPagina.length ? (paginaSegura - 1) * porPagina + 1 : 0} a {(paginaSegura - 1) * porPagina + cajasPagina.length} de {cajasFiltradas.length} entradas</span><div className="flex gap-2"><button onClick={() => setPaginaActual((p) => Math.max(1, p - 1))} disabled={paginaSegura === 1} className="rounded border px-3 py-1.5 disabled:opacity-40">Anterior</button><span className="rounded bg-blue-800 px-3 py-1.5 font-bold text-white">{paginaSegura} / {totalPaginas}</span><button onClick={() => setPaginaActual((p) => Math.min(totalPaginas, p + 1))} disabled={paginaSegura === totalPaginas} className="rounded border px-3 py-1.5 disabled:opacity-40">Siguiente</button></div></div>
        </section>
        {cajaSeleccionada && <DetalleCaja cajaInfo={cajaSeleccionada} empresaId={empresaId} nombreEmpresa={ubicaciones[cajaSeleccionada.ubicacion_id] || nombreEmpresa} session={session} perfilUsuario={perfilUsuario} onClose={() => setCajaSeleccionada(null)} />}
    </div>;
}
