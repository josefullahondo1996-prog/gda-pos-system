import { useEffect, useState } from 'react';
import { supabase } from './supabaseClient';
import { useEmpresaInfo } from './utils/useEmpresa';
import { generateReceipt } from './utils/generateReceipt';
import { generateNotaRemision } from './utils/generateNotaRemision';
import { ajustarStockUbicacion } from './utils/stockUbicacion';
import FiltroFecha from './FiltroFecha';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

const formatGs = (v) => `Gs ${Number(v || 0).toLocaleString('es-PY')}`;
const formatFecha = (f) => (f ? new Date(f).toLocaleDateString('es-PY') + ' ' + new Date(f).toLocaleTimeString('es-PY', { hour: '2-digit', minute: '2-digit' }) : '—');

const badgeEstado = (estado) => {
    const base = 'px-2 py-1 rounded-full text-[10px] font-bold';
    if (estado === 'Anulada' || estado === 'Devuelta') return `${base} bg-red-100 text-red-700`;
    if (estado === 'Credito' || estado === 'Pago Parcial' || estado === 'Pendiente') return `${base} bg-yellow-100 text-yellow-700`;
    return `${base} bg-green-100 text-green-700`;
};

export default function TodasLasVentas({ onNuevaVenta }) {
    const { id: empresaId, nombre: nombreEmpresa, direccion: direccionEmpresa, telefono: telefonoEmpresa, ruc: rucEmpresa } = useEmpresaInfo();
    const [ventas, setVentas] = useState([]);
    const [ubicaciones, setUbicaciones] = useState({});
    const [celularesPorCliente, setCelularesPorCliente] = useState({});
    const [cargando, setCargando] = useState(true);
    const [busqueda, setBusqueda] = useState('');
    const [menuAbiertoId, setMenuAbiertoId] = useState(null);

    // Toolbar tipo CDEpos: entradas por página, paginación y columnas visibles
    const [entradasPorPagina, setEntradasPorPagina] = useState(25);
    const [paginaActual, setPaginaActual] = useState(1);
    const [mostrarMenuColumnas, setMostrarMenuColumnas] = useState(false);
    const [columnasVisibles, setColumnasVisibles] = useState({
        facturaNo: true, numeroContacto: true, ubicacion: true, sifen: true,
        metodoPago: true, gsPyg: true, creditosOtorgados: true,
        creditoDevolucion: true, estadoEnvio: true, totalArticulos: true,
        tipoServicio: true, campoPersonalizado1: true, añadidoPor: true,
        notaVenta: true, notaPersonal: true, detallesEnvio: true, personalServicio: true,
    });

    // Filtros tipo CDEpos (panel "Filtros" con desplegables + rango de fechas)
    const [mostrarFiltros, setMostrarFiltros] = useState(true);
    const [filtroUbicacion, setFiltroUbicacion] = useState('');
    const [filtroCliente, setFiltroCliente] = useState('');
    const [filtroEstadoPago, setFiltroEstadoPago] = useState('');
    const [filtroUsuario, setFiltroUsuario] = useState('');
    const [rangoFecha, setRangoFecha] = useState({ desde: null, hasta: null, label: 'Todo' });

    const [ventaDetalle, setVentaDetalle] = useState(null); // { venta, items, modo: 'ver'|'pagos' }
    const [ventaEditando, setVentaEditando] = useState(null);
    const [formEdit, setFormEdit] = useState({
        cliente: '', metodo_pago: '', nota_venta: '',
        tipo_servicio: '', campo_personalizado_1: '', nota_personal: '',
        detalles_envio: '', personal_servicio: '',
    });
    const [ventaAAnular, setVentaAAnular] = useState(null);
    const [motivoAnulacion, setMotivoAnulacion] = useState('');
    const [anulando, setAnulando] = useState(false);

    useEffect(() => {
        if (empresaId) cargarTodo();
    }, [empresaId]);

    useEffect(() => {
        setPaginaActual(1);
    }, [filtroUbicacion, filtroCliente, filtroEstadoPago, filtroUsuario, rangoFecha]);

    const cargarTodo = async () => {
        setCargando(true);
        const [resVentas, resUbicaciones, resClientes] = await Promise.all([
            supabase.from('ventas').select('*').eq('empresa_id', empresaId).order('fecha', { ascending: false }).limit(300),
            supabase.from('ubicaciones_comerciales').select('id, nombre').eq('empresa_id', empresaId),
            supabase.from('clientes').select('nombre, nombre_empresa, celular').eq('empresa_id', empresaId),
        ]);
        if (!resVentas.error && resVentas.data) setVentas(resVentas.data);
        if (!resUbicaciones.error && resUbicaciones.data) {
            const mapa = {};
            resUbicaciones.data.forEach((u) => { mapa[u.id] = u.nombre; });
            setUbicaciones(mapa);
        }
        if (!resClientes.error && resClientes.data) {
            const mapaCelulares = {};
            resClientes.data.forEach((c) => {
                if (c.nombre) mapaCelulares[c.nombre] = c.celular;
                if (c.nombre_empresa) mapaCelulares[c.nombre_empresa] = c.celular;
            });
            setCelularesPorCliente(mapaCelulares);
        }
        setCargando(false);
    };

    const ventasFiltradas = ventas.filter((v) => {
        const coincideBusqueda = [v.cliente, v.metodo_pago, v.estado_pago].join(' ').toLowerCase().includes(busqueda.toLowerCase());
        const coincideUbicacion = !filtroUbicacion || String(v.ubicacion_id) === filtroUbicacion;
        const coincideCliente = !filtroCliente || v.cliente === filtroCliente;
        const coincideEstadoPago = !filtroEstadoPago || v.estado_pago === filtroEstadoPago;
        const coincideUsuario = !filtroUsuario || v.usuario_nombre === filtroUsuario;
        const fechaVenta = v.fecha ? new Date(v.fecha) : null;
        const coincideDesde = !rangoFecha.desde || (fechaVenta && fechaVenta >= rangoFecha.desde);
        const coincideHasta = !rangoFecha.hasta || (fechaVenta && fechaVenta <= rangoFecha.hasta);
        return coincideBusqueda && coincideUbicacion && coincideCliente && coincideEstadoPago && coincideUsuario && coincideDesde && coincideHasta;
    });

    // Opciones de los desplegables, calculadas a partir de los datos ya cargados (sin pedir nada nuevo al servidor)
    const clientesUnicos = [...new Set(ventas.map((v) => v.cliente).filter(Boolean))].sort();
    const usuariosUnicos = [...new Set(ventas.map((v) => v.usuario_nombre).filter(Boolean))].sort();
    const estadosPagoUnicos = [...new Set(ventas.map((v) => v.estado_pago).filter(Boolean))].sort();

    // Tarjetas de resumen ("Cobrado PYG" / "Total ventas") sobre lo ya filtrado
    const totalCobrado = ventasFiltradas.reduce((acc, v) => acc + Number(v.monto_pagado || 0), 0);
    const totalVentasFiltradas = ventasFiltradas.length;

    const limpiarFiltros = () => {
        setFiltroUbicacion(''); setFiltroCliente(''); setFiltroEstadoPago('');
        setFiltroUsuario(''); setRangoFecha({ desde: null, hasta: null, label: 'Todo' });
        setBusqueda('');
    };

    const totalPaginas = Math.max(1, Math.ceil(ventasFiltradas.length / entradasPorPagina));
    const paginaSegura = Math.min(paginaActual, totalPaginas);
    const ventasPagina = ventasFiltradas.slice((paginaSegura - 1) * entradasPorPagina, paginaSegura * entradasPorPagina);

    const cambiarBusqueda = (valor) => { setBusqueda(valor); setPaginaActual(1); };

    const cargarDetalleVenta = async (venta) => {
        const { data } = await supabase.from('detalle_ventas').select('*').eq('venta_id', venta.id);
        return data || [];
    };

    // Repone stock (global + por sucursal) de todos los ítems de la venta.
    // Se usa tanto para Anular como para Borrar como para Devolución, así una venta
    // nunca queda "consumiendo" stock fantasma sin explicación.
    const reponerStockDeVenta = async (venta) => {
        const items = await cargarDetalleVenta(venta);
        for (const item of items) {
            if (!item.producto_id) continue;
            const { data: prod } = await supabase.from('productos').select('stock_actual').eq('id', item.producto_id).eq('empresa_id', empresaId).single();
            const nuevoStock = (Number(prod?.stock_actual) || 0) + Number(item.cantidad || 0);
            await supabase.from('productos').update({ stock_actual: nuevoStock }).eq('id', item.producto_id).eq('empresa_id', empresaId);
            if (venta.ubicacion_id) {
                try {
                    await ajustarStockUbicacion({ empresaId, productoId: item.producto_id, ubicacionId: venta.ubicacion_id, delta: Number(item.cantidad || 0) });
                } catch (e) {
                    console.warn('No se pudo reponer stock por sucursal:', e.message);
                }
            }
        }
        return items;
    };

    const abrirModalAnular = (venta) => {
        setMenuAbiertoId(null);
        if (venta.estado_pago === 'Anulada' || venta.estado_pago === 'Devuelta') return alert('Esta venta ya está anulada.');
        setMotivoAnulacion('');
        setVentaAAnular(venta);
    };

    const confirmarAnulacion = async () => {
        if (!ventaAAnular) return;
        setAnulando(true);
        try {
            await reponerStockDeVenta(ventaAAnular);
            const { error } = await supabase
                .from('ventas')
                .update({ estado_pago: 'Anulada', motivo_anulacion: motivoAnulacion || null })
                .eq('id', ventaAAnular.id)
                .eq('empresa_id', empresaId);
            if (error) throw error;
            setVentaAAnular(null);
            cargarTodo();
        } catch (error) {
            alert('Error al anular la venta: ' + error.message);
        } finally {
            setAnulando(false);
        }
    };

    const devolverVenta = async (venta) => {
        if (venta.estado_pago === 'Anulada' || venta.estado_pago === 'Devuelta') return alert('Esta venta ya fue anulada/devuelta.');
        if (!confirm(`¿Registrar devolución completa de la venta #${venta.id}? Se repondrá el stock de todos los productos.`)) return;
        await reponerStockDeVenta(venta);
        const { error } = await supabase.from('ventas').update({ estado_pago: 'Devuelta' }).eq('id', venta.id).eq('empresa_id', empresaId);
        if (error) return alert('Error al registrar la devolución: ' + error.message);
        cargarTodo();
    };

    const borrarVenta = async (venta) => {
        if (!confirm(`Esto borra la venta #${venta.id} de forma permanente. ${venta.estado_pago !== 'Anulada' && venta.estado_pago !== 'Devuelta' ? 'También se repondrá el stock de sus productos. ' : ''}¿Confirmás?`)) return;
        if (venta.estado_pago !== 'Anulada' && venta.estado_pago !== 'Devuelta') {
            await reponerStockDeVenta(venta);
        }
        await supabase.from('detalle_ventas').delete().eq('venta_id', venta.id);
        const { error } = await supabase.from('ventas').delete().eq('id', venta.id).eq('empresa_id', empresaId);
        if (error) return alert('Error al borrar la venta: ' + error.message);
        cargarTodo();
    };

    const verVenta = async (venta) => {
        setMenuAbiertoId(null);
        const items = await cargarDetalleVenta(venta);
        setVentaDetalle({ venta, items, modo: 'ver' });
    };

    const verPagos = (venta) => {
        setMenuAbiertoId(null);
        setVentaDetalle({ venta, items: [], modo: 'pagos' });
    };

    const abrirEditar = (venta) => {
        setMenuAbiertoId(null);
        setVentaEditando(venta);
        setFormEdit({
            cliente: venta.cliente || '', metodo_pago: venta.metodo_pago || '', nota_venta: venta.nota_venta || '',
            tipo_servicio: venta.tipo_servicio || '', campo_personalizado_1: venta.campo_personalizado_1 || '',
            nota_personal: venta.nota_personal || '', detalles_envio: venta.detalles_envio || '',
            personal_servicio: venta.personal_servicio || '',
        });
    };

    const guardarEdicion = async (e) => {
        e.preventDefault();
        const { error } = await supabase.from('ventas').update(formEdit).eq('id', ventaEditando.id).eq('empresa_id', empresaId);
        if (error) return alert('Error al guardar: ' + error.message);
        setVentaEditando(null);
        cargarTodo();
    };

    const imprimirFactura = async (venta) => {
        setMenuAbiertoId(null);
        const items = await cargarDetalleVenta(venta);
        generateReceipt(
            { ...venta, cliente_nombre: venta.cliente, items },
            { nombre: nombreEmpresa, direccion: direccionEmpresa, telefono: telefonoEmpresa, ruc: rucEmpresa },
            '80mm',
            true
        );
    };

    const imprimirNotaRemision = async (venta) => {
        setMenuAbiertoId(null);
        const items = await cargarDetalleVenta(venta);
        generateNotaRemision(venta, items, { nombre: nombreEmpresa });
    };

    const verUrlFactura = () => {
        setMenuAbiertoId(null);
        alert('Tu sistema todavía no tiene facturación electrónica conectada (SET / e-Kuatia), por eso todavía no hay una URL de factura para mostrar acá. Si querés, lo podemos conectar más adelante.');
    };

    const nuevaNotificacion = () => {
        setMenuAbiertoId(null);
        alert('Todavía no tenés un canal de notificaciones conectado (email / WhatsApp) para avisarle al cliente sobre esta venta. Avisame si querés que lo armemos.');
    };

    // === Datos calculados para exportación / columnas ===
    const columnasVentasExport = [
        { key: 'fecha', label: 'Fecha' },
        { key: 'facturaNo', label: 'Factura No.' },
        { key: 'cliente', label: 'Nombre del Cliente' },
        { key: 'numeroContacto', label: 'Numero de Contacto' },
        { key: 'ubicacion', label: 'Ubicacion' },
        { key: 'estado_pago', label: 'Estado de Pago' },
        { key: 'metodo_pago', label: 'Metodo de Pago' },
        { key: 'total', label: 'Cantidad Total' },
        { key: 'total_pagado', label: 'Total Pagado' },
        { key: 'creditosOtorgados', label: 'Creditos Otorgados' },
        { key: 'creditoDevolucion', label: 'Credito por Devolucion' },
        { key: 'estadoEnvio', label: 'Estado del Envio' },
        { key: 'articulos', label: 'Total Articulos' },
        { key: 'tipoServicio', label: 'Tipos de Servicio' },
        { key: 'campoPersonalizado1', label: 'Campo Personalizado 1' },
        { key: 'añadidoPor', label: 'Añadido por' },
        { key: 'notaVenta', label: 'Nota de Venta' },
        { key: 'notaPersonal', label: 'Nota del Personal' },
        { key: 'detallesEnvio', label: 'Detalles de Envio' },
        { key: 'personalServicio', label: 'Personal de Servicio' },
    ];

    const filaExport = (v) => ({
        fecha: formatFecha(v.fecha),
        facturaNo: String(v.id).slice(0, 8).toUpperCase(),
        cliente: v.cliente || 'Cliente Ocasional',
        numeroContacto: celularesPorCliente[v.cliente] || '',
        ubicacion: ubicaciones[v.ubicacion_id] || nombreEmpresa || '',
        estado_pago: v.estado_pago || '',
        metodo_pago: v.metodo_pago || '',
        total: v.total ?? 0,
        total_pagado: (Number(v.total) || 0) - (Number(v.saldo_pendiente) || 0),
        creditosOtorgados: v.saldo_pendiente ?? 0,
        creditoDevolucion: 0,
        estadoEnvio: '',
        articulos: v.articulos ?? 0,
        tipoServicio: v.tipo_servicio || '',
        campoPersonalizado1: v.campo_personalizado_1 || '',
        añadidoPor: v.usuario_nombre || '',
        notaVenta: v.nota_venta || '',
        notaPersonal: v.nota_personal || '',
        detallesEnvio: v.detalles_envio || '',
        personalServicio: v.personal_servicio || '',
    });

    const descargarArchivo = (contenido, nombreArchivo, tipo) => {
        const blob = new Blob([contenido], { type: tipo });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = nombreArchivo;
        a.click();
        URL.revokeObjectURL(url);
    };

    const exportarCSV = () => {
        const filas = [columnasVentasExport.map((c) => c.label).join(',')];
        ventasFiltradas.forEach((v) => {
            const fila = filaExport(v);
            filas.push(columnasVentasExport.map((col) => `"${String(fila[col.key] ?? '').replace(/"/g, '""')}"`).join(','));
        });
        descargarArchivo(filas.join('\n'), 'todas_las_ventas.csv', 'text/csv;charset=utf-8;');
    };

    const exportarExcel = () => {
        let html = '<table><tr>' + columnasVentasExport.map((c) => `<th>${c.label}</th>`).join('') + '</tr>';
        ventasFiltradas.forEach((v) => {
            const fila = filaExport(v);
            html += '<tr>' + columnasVentasExport.map((col) => `<td>${fila[col.key] ?? ''}</td>`).join('') + '</tr>';
        });
        html += '</table>';
        descargarArchivo(html, 'todas_las_ventas.xls', 'application/vnd.ms-excel');
    };

    const exportarPDF = () => {
        const doc = new jsPDF();
        doc.text('Todas las ventas', 14, 12);
        autoTable(doc, {
            startY: 18,
            head: [columnasVentasExport.map((c) => c.label)],
            body: ventasFiltradas.map((v) => {
                const fila = filaExport(v);
                return columnasVentasExport.map((col) => String(fila[col.key] ?? ''));
            }),
            styles: { fontSize: 6 },
        });
        doc.save('todas_las_ventas.pdf');
    };

    // Fila de totales del pie de tabla (igual que en la referencia: cuenta por Estado y por Método de pago)
    const conteoPorEstado = ventasFiltradas.reduce((acc, v) => {
        const e = v.estado_pago || '—';
        acc[e] = (acc[e] || 0) + 1;
        return acc;
    }, {});
    const conteoPorMetodo = ventasFiltradas.reduce((acc, v) => {
        const m = v.metodo_pago || '—';
        acc[m] = (acc[m] || 0) + 1;
        return acc;
    }, {});
    const totalCantidad = ventasFiltradas.reduce((acc, v) => acc + (Number(v.total) || 0), 0);
    const totalPagadoGeneral = ventasFiltradas.reduce((acc, v) => acc + ((Number(v.total) || 0) - (Number(v.saldo_pendiente) || 0)), 0);
    const totalCreditosGeneral = ventasFiltradas.reduce((acc, v) => acc + (Number(v.saldo_pendiente) || 0), 0);
    const totalArticulosGeneral = ventasFiltradas.reduce((acc, v) => acc + (Number(v.articulos) || 0), 0);

    return (
        <div className="bg-transparent text-sm text-gray-700" onClick={() => { menuAbiertoId && setMenuAbiertoId(null); mostrarMenuColumnas && setMostrarMenuColumnas(false); }}>
            <div className="flex justify-between items-center flex-wrap gap-2 mb-4">
                <div>
                    <h2 className="text-2xl font-bold text-gray-800 mb-1">Todas las ventas</h2>
                    <p className="text-gray-400 text-xs">Historial completo de ventas registradas</p>
                </div>
                <button
                    onClick={() => onNuevaVenta && onNuevaVenta()}
                    className="bg-orange-500 hover:bg-orange-600 text-white font-bold py-2 px-6 rounded-lg flex items-center gap-2 shadow-md transition-colors"
                >
                    <span className="text-xl leading-none">+</span> Añadir
                </button>
            </div>

            {/* Panel de Filtros, tipo CDEpos */}
            <div className="bg-white rounded-lg shadow-sm p-4 mb-4" onClick={(e) => e.stopPropagation()}>
                <button
                    onClick={() => setMostrarFiltros((v) => !v)}
                    className="flex items-center gap-2 text-gray-700 font-bold text-sm mb-1"
                >
                    <span>🔽</span> Filtros
                </button>
                {mostrarFiltros && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-3">
                        <div>
                            <label className="block text-xs font-bold text-gray-500 mb-1">Ubicación de la empresa:</label>
                            <select className="border rounded p-2 w-full text-xs" value={filtroUbicacion} onChange={(e) => setFiltroUbicacion(e.target.value)}>
                                <option value="">Todos</option>
                                {Object.entries(ubicaciones).map(([id, nombre]) => (
                                    <option key={id} value={id}>{nombre}</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-gray-500 mb-1">Cliente:</label>
                            <select className="border rounded p-2 w-full text-xs" value={filtroCliente} onChange={(e) => setFiltroCliente(e.target.value)}>
                                <option value="">Todos</option>
                                {clientesUnicos.map((c) => <option key={c} value={c}>{c}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-gray-500 mb-1">Estado de pago:</label>
                            <select className="border rounded p-2 w-full text-xs" value={filtroEstadoPago} onChange={(e) => setFiltroEstadoPago(e.target.value)}>
                                <option value="">Todos</option>
                                {estadosPagoUnicos.map((e2) => <option key={e2} value={e2}>{e2}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-gray-500 mb-1">Rango de fechas:</label>
                            <FiltroFecha value={rangoFecha} onChange={(nuevoRango) => setRangoFecha(nuevoRango)} />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-gray-500 mb-1">Usuario:</label>
                            <select className="border rounded p-2 w-full text-xs" value={filtroUsuario} onChange={(e) => setFiltroUsuario(e.target.value)}>
                                <option value="">Todos</option>
                                {usuariosUnicos.map((u) => <option key={u} value={u}>{u}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-gray-500 mb-1" title="Aún no hay módulo de envíos conectado">Estado del envío:</label>
                            <select className="border rounded p-2 w-full text-xs text-gray-400" disabled>
                                <option>Todos</option>
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-gray-500 mb-1" title="Aún no tenés facturación electrónica SIFEN conectada">SIFEN:</label>
                            <select className="border rounded p-2 w-full text-xs text-gray-400" disabled>
                                <option>Todos</option>
                            </select>
                        </div>
                        <div className="flex items-end">
                            <button onClick={limpiarFiltros} className="text-xs font-bold text-orange-600 hover:text-orange-700 border border-orange-200 rounded px-3 py-2 w-full">
                                ✕ Limpiar filtros
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {/* Tarjetas de resumen */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                <div className="bg-white rounded-lg shadow-sm p-4 flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-green-100 text-green-700 flex items-center justify-center font-bold">Gs</div>
                    <div>
                        <p className="text-[10px] text-gray-400 uppercase font-bold">Cobrado PYG</p>
                        <p className="text-lg font-bold text-gray-800">{formatGs(totalCobrado)}</p>
                    </div>
                </div>
                <div className="bg-white rounded-lg shadow-sm p-4 flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-orange-100 text-orange-700 flex items-center justify-center">📋</div>
                    <div>
                        <p className="text-[10px] text-gray-400 uppercase font-bold">Total ventas</p>
                        <p className="text-lg font-bold text-gray-800">{totalVentasFiltradas} <span className="text-xs font-normal text-gray-400">transacciones</span></p>
                    </div>
                </div>
            </div>

            <div className="bg-white rounded-lg shadow-sm border-t-2 border-[#004284]">

                {/* Toolbar: mostrar entradas / exportar / buscar */}
                <div className="p-4 border-b border-gray-100 flex flex-wrap justify-between items-center gap-3">
                    <div className="flex items-center gap-2 text-gray-600 font-medium text-xs">
                        <span>Mostrar</span>
                        <select
                            className="border rounded p-1"
                            value={entradasPorPagina}
                            onChange={(e) => { setEntradasPorPagina(Number(e.target.value)); setPaginaActual(1); }}
                        >
                            <option value={10}>10</option>
                            <option value={25}>25</option>
                            <option value={50}>50</option>
                            <option value={100}>100</option>
                        </select>
                        <span>entradas</span>
                    </div>

                    <div className="flex flex-wrap gap-2" onClick={(e) => e.stopPropagation()}>
                        <button onClick={exportarCSV} className="border rounded px-3 py-1.5 text-xs font-bold text-gray-600 hover:bg-gray-50">📄 Exportar a CSV</button>
                        <button onClick={exportarExcel} className="border rounded px-3 py-1.5 text-xs font-bold text-gray-600 hover:bg-gray-50">📊 Exportar a Excel</button>
                        <button onClick={() => window.print()} className="border rounded px-3 py-1.5 text-xs font-bold text-gray-600 hover:bg-gray-50">🖨️ Imprimir</button>
                        <div className="relative">
                            <button onClick={() => setMostrarMenuColumnas((v) => !v)} className="border rounded px-3 py-1.5 text-xs font-bold text-gray-600 hover:bg-gray-50">📋 Visibilidad de columnas</button>
                            {mostrarMenuColumnas && (
                                <div className="absolute right-0 mt-1 bg-white border rounded shadow-lg p-3 z-20 w-56 max-h-64 overflow-y-auto">
                                    {Object.entries({
                                        facturaNo: 'Factura No.', numeroContacto: 'Número de Contacto', ubicacion: 'Ubicación',
                                        sifen: 'SIFEN', metodoPago: 'Método de Pago', gsPyg: 'GS PYG',
                                        creditosOtorgados: 'Creditos Ortogados', creditoDevolucion: 'Credito por Devolucion',
                                        estadoEnvio: 'Estado del Envío', totalArticulos: 'Total Artículos',
                                        tipoServicio: 'Tipos de Servicio', campoPersonalizado1: 'Campo Personalizado 1',
                                        añadidoPor: 'Añadido por', notaVenta: 'Nota de Venta', notaPersonal: 'Nota del Personal',
                                        detallesEnvio: 'Detalles de Envío', personalServicio: 'Personal de Servicio',
                                    }).map(([key, label]) => (
                                        <label key={key} className="flex items-center gap-2 text-xs py-1 cursor-pointer">
                                            <input
                                                type="checkbox"
                                                checked={columnasVisibles[key]}
                                                onChange={() => setColumnasVisibles((prev) => ({ ...prev, [key]: !prev[key] }))}
                                            />
                                            {label}
                                        </label>
                                    ))}
                                </div>
                            )}
                        </div>
                        <button onClick={exportarPDF} className="border rounded px-3 py-1.5 text-xs font-bold text-gray-600 hover:bg-gray-50">📕 Exportar a PDF</button>
                    </div>

                    <input
                        type="text"
                        className="border rounded p-1.5 w-64 outline-none focus:border-blue-500 text-xs"
                        placeholder="Buscar ..."
                        value={busqueda}
                        onChange={(e) => cambiarBusqueda(e.target.value)}
                        onClick={(e) => e.stopPropagation()}
                    />
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs border-collapse whitespace-nowrap">
                        <thead>
                            <tr className="border-b-2 border-gray-200 bg-gray-50 text-gray-500 font-bold uppercase">
                                <th className="p-3">Acción</th>
                                <th className="p-3">Fecha</th>
                                {columnasVisibles.facturaNo && <th className="p-3">Factura No.</th>}
                                <th className="p-3">Nombre del Cliente</th>
                                {columnasVisibles.numeroContacto && <th className="p-3">Número de Contacto</th>}
                                {columnasVisibles.ubicacion && <th className="p-3">Ubicación</th>}
                                <th className="p-3">Estado de Pago</th>
                                {columnasVisibles.sifen && <th className="p-3">SIFEN</th>}
                                {columnasVisibles.metodoPago && <th className="p-3">Método de Pago</th>}
                                <th className="p-3 text-right">Cantidad Total</th>
                                <th className="p-3 text-right">Total Pagado</th>
                                {columnasVisibles.gsPyg && <th className="p-3">GS PYG</th>}
                                {columnasVisibles.creditosOtorgados && <th className="p-3 text-right">Creditos Ortogados</th>}
                                {columnasVisibles.creditoDevolucion && <th className="p-3 text-right">Credito por Devolucion</th>}
                                {columnasVisibles.estadoEnvio && <th className="p-3">Estado del Envío</th>}
                                {columnasVisibles.totalArticulos && <th className="p-3 text-right">Total Artículos</th>}
                                {columnasVisibles.tipoServicio && <th className="p-3">Tipos de Servicio</th>}
                                {columnasVisibles.campoPersonalizado1 && <th className="p-3">Campo Personalizado 1</th>}
                                {columnasVisibles.añadidoPor && <th className="p-3">Añadido por</th>}
                                {columnasVisibles.notaVenta && <th className="p-3">Nota de Venta</th>}
                                {columnasVisibles.notaPersonal && <th className="p-3">Nota del Personal</th>}
                                {columnasVisibles.detallesEnvio && <th className="p-3">Detalles de Envío</th>}
                                {columnasVisibles.personalServicio && <th className="p-3">Personal de Servicio</th>}
                            </tr>
                        </thead>
                        <tbody>
                            {cargando ? (
                                <tr><td colSpan={23} className="text-center py-8 text-gray-400">Cargando...</td></tr>
                            ) : ventasPagina.length === 0 ? (
                                <tr><td colSpan={23} className="text-center py-8 text-gray-400 font-medium">No hay datos disponibles en la tabla</td></tr>
                            ) : (
                                ventasPagina.map((venta) => {
                                    const totalPagadoReal = (Number(venta.total) || 0) - (Number(venta.saldo_pendiente) || 0);
                                    return (
                                        <tr key={venta.id} className="border-b hover:bg-gray-50">
                                            <td className="p-3 relative" onClick={(e) => e.stopPropagation()}>
                                                <button
                                                    onClick={() => setMenuAbiertoId(menuAbiertoId === venta.id ? null : venta.id)}
                                                    className="bg-teal-500 hover:bg-teal-600 text-white text-xs font-bold px-3 py-1.5 rounded flex items-center gap-1"
                                                >
                                                    Acciones <span className="text-[9px]">▾</span>
                                                </button>
                                                {menuAbiertoId === venta.id && (
                                                    <div className="absolute left-0 z-20 mt-1 w-56 bg-white rounded-lg shadow-xl border border-gray-100 py-1 text-sm text-gray-700">
                                                        <button onClick={() => verVenta(venta)} className="w-full text-left px-4 py-2 hover:bg-gray-50 flex items-center gap-2">👁️ Ver</button>
                                                        <button onClick={() => abrirEditar(venta)} className="w-full text-left px-4 py-2 hover:bg-gray-50 flex items-center gap-2">✏️ Editar</button>
                                                        <button onClick={() => abrirModalAnular(venta)} className="w-full text-left px-4 py-2 hover:bg-gray-50 flex items-center gap-2 text-orange-600">🚫 Anular</button>
                                                        <button onClick={() => borrarVenta(venta)} className="w-full text-left px-4 py-2 hover:bg-gray-50 flex items-center gap-2 text-red-600">🗑️ Borrar</button>
                                                        <button onClick={() => imprimirNotaRemision(venta)} className="w-full text-left px-4 py-2 hover:bg-gray-50 flex items-center gap-2">🚚 Nota de Remisión</button>
                                                        <button onClick={() => imprimirFactura(venta)} className="w-full text-left px-4 py-2 hover:bg-gray-50 flex items-center gap-2">🖨️ Imprimir Factura</button>
                                                        <button onClick={() => imprimirNotaRemision(venta)} className="w-full text-left px-4 py-2 hover:bg-gray-50 flex items-center gap-2">📄 Imprimir nota de remisión</button>
                                                        <div className="border-t border-gray-100 my-1" />
                                                        <button onClick={() => verPagos(venta)} className="w-full text-left px-4 py-2 hover:bg-gray-50 flex items-center gap-2">💰 Ver pagos</button>
                                                        <button onClick={() => devolverVenta(venta)} className="w-full text-left px-4 py-2 hover:bg-gray-50 flex items-center gap-2">↩️ Devolución de Venta</button>
                                                        <button onClick={verUrlFactura} className="w-full text-left px-4 py-2 hover:bg-gray-50 flex items-center gap-2">🔗 Ver URL de factura</button>
                                                        <button onClick={nuevaNotificacion} className="w-full text-left px-4 py-2 hover:bg-gray-50 flex items-center gap-2">✉️ Nueva Notificación de Venta</button>
                                                    </div>
                                                )}
                                            </td>
                                            <td className="p-3 text-gray-600">{formatFecha(venta.fecha)}</td>
                                            {columnasVisibles.facturaNo && <td className="p-3 font-mono text-gray-500">{String(venta.id).slice(0, 8).toUpperCase()}</td>}
                                            <td className="p-3 font-medium text-gray-700">{venta.cliente || 'Cliente Ocasional'}</td>
                                            {columnasVisibles.numeroContacto && <td className="p-3 text-gray-500">{celularesPorCliente[venta.cliente] || '—'}</td>}
                                            {columnasVisibles.ubicacion && <td className="p-3 text-gray-500">{ubicaciones[venta.ubicacion_id] || nombreEmpresa}</td>}
                                            <td className="p-3"><span className={badgeEstado(venta.estado_pago)}>{venta.estado_pago || '—'}</span></td>
                                            {columnasVisibles.sifen && (
                                                <td className="p-3">
                                                    <span className="bg-gray-100 text-gray-500 px-2 py-1 rounded text-[10px] font-bold" title="Tu sistema todavía no tiene facturación electrónica SIFEN conectada">
                                                        🖨️ No conectado
                                                    </span>
                                                </td>
                                            )}
                                            {columnasVisibles.metodoPago && <td className="p-3 text-gray-500">{venta.metodo_pago || '—'}</td>}
                                            <td className="p-3 text-right font-bold text-gray-700">{formatGs(venta.total)}</td>
                                            <td className="p-3 text-right text-gray-600">{formatGs(totalPagadoReal)}</td>
                                            {columnasVisibles.gsPyg && <td className="p-3 text-gray-400">-</td>}
                                            {columnasVisibles.creditosOtorgados && <td className="p-3 text-right font-bold text-red-600">{formatGs(venta.saldo_pendiente)}</td>}
                                            {columnasVisibles.creditoDevolucion && <td className="p-3 text-right text-gray-400">{formatGs(0)}</td>}
                                            {columnasVisibles.estadoEnvio && <td className="p-3 text-gray-400">—</td>}
                                            {columnasVisibles.totalArticulos && <td className="p-3 text-right">{venta.articulos ?? 0}</td>}
                                            {columnasVisibles.tipoServicio && <td className="p-3 text-gray-500">{venta.tipo_servicio || '—'}</td>}
                                            {columnasVisibles.campoPersonalizado1 && <td className="p-3 text-gray-500">{venta.campo_personalizado_1 || '—'}</td>}
                                            {columnasVisibles.añadidoPor && <td className="p-3 text-gray-500">{venta.usuario_nombre || '—'}</td>}
                                            {columnasVisibles.notaVenta && <td className="p-3 text-gray-500 max-w-[180px] truncate" title={venta.nota_venta || ''}>{venta.nota_venta || '—'}</td>}
                                            {columnasVisibles.notaPersonal && <td className="p-3 text-gray-500 max-w-[180px] truncate" title={venta.nota_personal || ''}>{venta.nota_personal || '—'}</td>}
                                            {columnasVisibles.detallesEnvio && <td className="p-3 text-gray-500 max-w-[180px] truncate" title={venta.detalles_envio || ''}>{venta.detalles_envio || '—'}</td>}
                                            {columnasVisibles.personalServicio && <td className="p-3 text-gray-500">{venta.personal_servicio || '—'}</td>}
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                        {ventasFiltradas.length > 0 && (
                            <tfoot>
                                <tr className="bg-gray-100 font-bold text-gray-700 border-t-2">
                                    <td className="p-3" colSpan={2}>Total:</td>
                                    {columnasVisibles.facturaNo && <td className="p-3" />}
                                    <td className="p-3" />
                                    {columnasVisibles.numeroContacto && <td className="p-3" />}
                                    {columnasVisibles.ubicacion && <td className="p-3" />}
                                    <td className="p-3">{Object.entries(conteoPorEstado).map(([k, n]) => `${k} - ${n}`).join(', ')}</td>
                                    {columnasVisibles.sifen && <td className="p-3" />}
                                    {columnasVisibles.metodoPago && <td className="p-3">{Object.entries(conteoPorMetodo).map(([k, n]) => `${k} - ${n}`).join(', ')}</td>}
                                    <td className="p-3 text-right">{formatGs(totalCantidad)}</td>
                                    <td className="p-3 text-right">{formatGs(totalPagadoGeneral)}</td>
                                    {columnasVisibles.gsPyg && <td className="p-3" />}
                                    {columnasVisibles.creditosOtorgados && <td className="p-3 text-right">{formatGs(totalCreditosGeneral)}</td>}
                                    {columnasVisibles.creditoDevolucion && <td className="p-3 text-right">{formatGs(0)}</td>}
                                    {columnasVisibles.estadoEnvio && <td className="p-3" />}
                                    {columnasVisibles.totalArticulos && <td className="p-3 text-right">{totalArticulosGeneral}</td>}
                                    {columnasVisibles.tipoServicio && <td className="p-3" />}
                                    {columnasVisibles.campoPersonalizado1 && <td className="p-3" />}
                                    {columnasVisibles.añadidoPor && <td className="p-3" />}
                                    {columnasVisibles.notaVenta && <td className="p-3" />}
                                    {columnasVisibles.notaPersonal && <td className="p-3" />}
                                    {columnasVisibles.detallesEnvio && <td className="p-3" />}
                                    {columnasVisibles.personalServicio && <td className="p-3" />}
                                </tr>
                            </tfoot>
                        )}
                    </table>
                </div>

                {/* Paginación */}
                <div className="flex flex-wrap justify-between items-center gap-3 p-4 text-xs text-gray-500 font-medium">
                    <span>
                        Mostrando {ventasFiltradas.length === 0 ? 0 : (paginaSegura - 1) * entradasPorPagina + 1} a{' '}
                        {Math.min(paginaSegura * entradasPorPagina, ventasFiltradas.length)} de {ventasFiltradas.length} entradas
                    </span>
                    <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                        <button
                            disabled={paginaSegura === 1}
                            onClick={() => setPaginaActual((p) => Math.max(1, p - 1))}
                            className="border rounded px-3 py-1 disabled:opacity-40 hover:bg-gray-50"
                        >
                            Anterior
                        </button>
                        <span className="bg-[#004284] text-white rounded px-3 py-1">{paginaSegura}</span>
                        <button
                            disabled={paginaSegura === totalPaginas}
                            onClick={() => setPaginaActual((p) => Math.min(totalPaginas, p + 1))}
                            className="border rounded px-3 py-1 disabled:opacity-40 hover:bg-gray-50"
                        >
                            Siguiente
                        </button>
                    </div>
                </div>
            </div>

            {/* Modal Ver venta / Ver pagos */}
            {ventaDetalle && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setVentaDetalle(null)}>
                    <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
                        <div className="bg-[#004284] px-5 py-4 flex justify-between items-center">
                            <h3 className="text-white font-bold text-lg">{ventaDetalle.modo === 'pagos' ? 'Pagos de la venta' : 'Detalle de la venta'}</h3>
                            <button onClick={() => setVentaDetalle(null)} className="text-white/80 hover:text-white text-xl leading-none">✕</button>
                        </div>
                        <div className="p-6 overflow-y-auto flex flex-col gap-3 text-sm">
                            <p><span className="font-bold text-gray-600">Cliente:</span> {ventaDetalle.venta.cliente || 'Cliente Ocasional'}</p>
                            <p><span className="font-bold text-gray-600">Fecha:</span> {formatFecha(ventaDetalle.venta.fecha)}</p>
                            <p><span className="font-bold text-gray-600">Estado:</span> <span className={badgeEstado(ventaDetalle.venta.estado_pago)}>{ventaDetalle.venta.estado_pago}</span></p>
                            <p><span className="font-bold text-gray-600">Método de pago:</span> {ventaDetalle.venta.metodo_pago || '—'}</p>
                            <p><span className="font-bold text-gray-600">Monto pagado:</span> {formatGs(ventaDetalle.venta.monto_pagado)}</p>
                            <p><span className="font-bold text-gray-600">Saldo pendiente:</span> {formatGs(ventaDetalle.venta.saldo_pendiente)}</p>
                            <p><span className="font-bold text-gray-600">Total:</span> {formatGs(ventaDetalle.venta.total)}</p>
                            {ventaDetalle.venta.nota_venta && <p><span className="font-bold text-gray-600">Nota:</span> {ventaDetalle.venta.nota_venta}</p>}
                            {ventaDetalle.venta.motivo_anulacion && <p><span className="font-bold text-gray-600">Motivo de anulación:</span> {ventaDetalle.venta.motivo_anulacion}</p>}

                            {ventaDetalle.modo === 'ver' && (
                                <div className="mt-2">
                                    <p className="font-bold text-gray-600 mb-1">Productos:</p>
                                    {ventaDetalle.items.length === 0 ? (
                                        <p className="text-gray-400 text-xs">No hay detalle de productos guardado para esta venta.</p>
                                    ) : (
                                        <table className="w-full text-xs border-collapse">
                                            <thead>
                                                <tr className="text-gray-500 border-b"><th className="text-left py-1">Producto</th><th className="text-right py-1">Cant.</th><th className="text-right py-1">Subtotal</th></tr>
                                            </thead>
                                            <tbody>
                                                {ventaDetalle.items.map((it) => (
                                                    <tr key={it.id} className="border-b border-gray-50">
                                                        <td className="py-1">{it.nombre_producto}</td>
                                                        <td className="py-1 text-right">{it.cantidad}</td>
                                                        <td className="py-1 text-right">{formatGs(it.subtotal)}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Modal Editar venta (datos básicos, no productos ni stock) */}
            {ventaEditando && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setVentaEditando(null)}>
                    <div className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden" onClick={(e) => e.stopPropagation()}>
                        <div className="bg-[#004284] px-5 py-4 flex justify-between items-center">
                            <h3 className="text-white font-bold text-lg">Editar venta</h3>
                            <button onClick={() => setVentaEditando(null)} className="text-white/80 hover:text-white text-xl leading-none">✕</button>
                        </div>
                        <form onSubmit={guardarEdicion} className="p-6 flex flex-col gap-4 max-h-[75vh] overflow-y-auto">
                            <p className="text-[11px] text-gray-400 -mt-2">Por seguridad de stock, acá solo se editan datos de la venta. Para cambiar productos, anulá esta venta y registrá una nueva.</p>
                            <div>
                                <label className="block text-sm font-bold text-gray-700 mb-1">Cliente:</label>
                                <input className="w-full border border-gray-300 rounded p-2.5 text-sm" value={formEdit.cliente} onChange={(e) => setFormEdit({ ...formEdit, cliente: e.target.value })} />
                            </div>
                            <div>
                                <label className="block text-sm font-bold text-gray-700 mb-1">Método de pago:</label>
                                <input className="w-full border border-gray-300 rounded p-2.5 text-sm" value={formEdit.metodo_pago} onChange={(e) => setFormEdit({ ...formEdit, metodo_pago: e.target.value })} />
                            </div>
                            <div>
                                <label className="block text-sm font-bold text-gray-700 mb-1">Tipo de servicio:</label>
                                <input className="w-full border border-gray-300 rounded p-2.5 text-sm" value={formEdit.tipo_servicio} onChange={(e) => setFormEdit({ ...formEdit, tipo_servicio: e.target.value })} placeholder="Ej: Reparación, Instalación, Venta directa..." />
                            </div>
                            <div>
                                <label className="block text-sm font-bold text-gray-700 mb-1">Personal de servicio:</label>
                                <input className="w-full border border-gray-300 rounded p-2.5 text-sm" value={formEdit.personal_servicio} onChange={(e) => setFormEdit({ ...formEdit, personal_servicio: e.target.value })} placeholder="Quién atendió/realizó el servicio" />
                            </div>
                            <div>
                                <label className="block text-sm font-bold text-gray-700 mb-1">Detalles de envío:</label>
                                <input className="w-full border border-gray-300 rounded p-2.5 text-sm" value={formEdit.detalles_envio} onChange={(e) => setFormEdit({ ...formEdit, detalles_envio: e.target.value })} placeholder="Dirección, transportista, etc." />
                            </div>
                            <div>
                                <label className="block text-sm font-bold text-gray-700 mb-1">Campo personalizado 1:</label>
                                <input className="w-full border border-gray-300 rounded p-2.5 text-sm" value={formEdit.campo_personalizado_1} onChange={(e) => setFormEdit({ ...formEdit, campo_personalizado_1: e.target.value })} />
                            </div>
                            <div>
                                <label className="block text-sm font-bold text-gray-700 mb-1">Nota de venta (visible para el cliente):</label>
                                <textarea className="w-full border border-gray-300 rounded p-2.5 text-sm" rows={2} value={formEdit.nota_venta} onChange={(e) => setFormEdit({ ...formEdit, nota_venta: e.target.value })} />
                            </div>
                            <div>
                                <label className="block text-sm font-bold text-gray-700 mb-1">Nota del personal (uso interno):</label>
                                <textarea className="w-full border border-gray-300 rounded p-2.5 text-sm" rows={2} value={formEdit.nota_personal} onChange={(e) => setFormEdit({ ...formEdit, nota_personal: e.target.value })} />
                            </div>
                            <div className="flex gap-2 justify-end pt-2 border-t border-gray-100">
                                <button type="submit" className="bg-orange-500 hover:bg-orange-600 text-white font-bold text-sm px-5 py-2 rounded">Guardar</button>
                                <button type="button" onClick={() => setVentaEditando(null)} className="border border-gray-300 text-gray-600 font-bold text-sm px-5 py-2 rounded hover:bg-gray-50">Cerrar</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
            {/* Modal Anular venta (motivo + confirmación, mismo diseño que CDEpos) */}
            {ventaAAnular && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => !anulando && setVentaAAnular(null)}>
                    <div className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden p-6 flex flex-col items-center text-center" onClick={(e) => e.stopPropagation()}>
                        <div className="w-16 h-16 rounded-full border-4 border-orange-400 flex items-center justify-center text-orange-400 text-3xl font-bold mb-4">
                            !
                        </div>
                        <h3 className="text-xl font-bold text-gray-800 mb-2">¿Anular esta venta?</h3>
                        <p className="text-sm text-gray-500 mb-4">
                            La venta N° {ventaAAnular.id} quedará <span className="font-bold">ANULADA</span> (no se borra).
                            Se devolverá el stock al inventario{ventaAAnular.metodo_pago ? ' y se revertirá el monto de la caja' : ''}. Indicá el motivo:
                        </p>
                        <textarea
                            autoFocus
                            className="w-full border border-gray-300 rounded p-2.5 text-sm mb-5"
                            rows={2}
                            placeholder="Motivo de la anulación (ej: error de carga)"
                            value={motivoAnulacion}
                            onChange={(e) => setMotivoAnulacion(e.target.value)}
                        />
                        <div className="flex gap-3 w-full">
                            <button
                                type="button"
                                disabled={anulando}
                                onClick={() => setVentaAAnular(null)}
                                className="flex-1 border border-gray-300 text-gray-600 font-bold text-sm px-5 py-2.5 rounded hover:bg-gray-50 disabled:opacity-60"
                            >
                                Cancelar
                            </button>
                            <button
                                type="button"
                                disabled={anulando}
                                onClick={confirmarAnulacion}
                                className="flex-1 bg-red-500 hover:bg-red-600 text-white font-bold text-sm px-5 py-2.5 rounded disabled:opacity-60"
                            >
                                {anulando ? 'Anulando...' : 'Sí, anular'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
