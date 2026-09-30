import { useEffect, useState } from 'react';
import {
    AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
    PieChart, Pie, Cell, Legend,
} from 'recharts';
import { supabase } from './supabaseClient';import { useEmpresaInfo } from './utils/useEmpresa';import FiltroFecha from './FiltroFecha';
import { useSucursalActiva } from './utils/SucursalContext';

const formatGs = (v) => `${Math.round(Number(v) || 0).toLocaleString('es-PY')} Gs`;
const COLORS = ['#3b82f6', '#f59e0b', '#ef4444', '#10b981', '#8b5cf6', '#ec4899'];
const fechaLocal = (valor) => {
    if (!valor) return new Date(NaN);
    const soloFecha = String(valor).match(/^(\d{4})-(\d{2})-(\d{2})$/);
    return soloFecha ? new Date(Number(soloFecha[1]), Number(soloFecha[2]) - 1, Number(soloFecha[3])) : new Date(valor);
};



const TABS = [
    { key: 'productos', label: '📦 Beneficio por productos' },
    { key: 'categorias', label: '🏷️ Beneficio por categorías' },
    { key: 'marcas', label: '⭐ Beneficio por marcas' },
];

export default function GananciasPerdidas() {
    const { id: empresaId } = useEmpresaInfo();
    // Sucursal elegida en el selector global del header (compartida con toda la app)
    const { sucursalActiva: filtroUbicacion } = useSucursalActiva();
    const [ventas, setVentas] = useState([]);
    const [compras, setCompras] = useState([]);
    const [gastos, setGastos] = useState([]);
    const [detalleVentas, setDetalleVentas] = useState([]);
    const [productos, setProductos] = useState([]);
    const [cargando, setCargando] = useState(true);

    const [rango, setRango] = useState({ desde: null, hasta: null, label: 'Este mes' });

    const [tabActiva, setTabActiva] = useState('productos');
    const [busquedaTabla, setBusquedaTabla] = useState('');
    const [paginaActual, setPaginaActual] = useState(1);
    const porPagina = 25;

    useEffect(() => {
        if (empresaId) cargarDatos();
    }, [empresaId, filtroUbicacion]);


    const cargarDatos = async () => {
        setCargando(true);
        let qVentas = supabase.from('ventas').select('*').eq('empresa_id', empresaId);
        let qCompras = supabase.from('compras').select('*').eq('empresa_id', empresaId);
        let qGastos = supabase.from('gastos').select('*').eq('empresa_id', empresaId);
        if (filtroUbicacion) {
            qVentas = qVentas.eq('ubicacion_id', filtroUbicacion);
            qCompras = qCompras.eq('ubicacion_id', filtroUbicacion);
            qGastos = qGastos.eq('ubicacion_id', filtroUbicacion);
        }
        const [rv, rc, rg, rd, rp] = await Promise.all([
            qVentas,
            qCompras,
            qGastos,
            supabase.from('detalle_ventas').select('*').eq('empresa_id', empresaId),
            supabase.from('productos').select('*').eq('empresa_id', empresaId),
        ]);
        setVentas(rv.data || []);
        setCompras(rc.data || []);
        setGastos(rg.data || []);
        setDetalleVentas(rd.data || []);
        setProductos(rp.data || []);
        setCargando(false);
    };

    useEffect(() => {
        const hoy = new Date();
        const inicioHoy = new Date(hoy);
        inicioHoy.setHours(0, 0, 0, 0);
        const finHoy = new Date(hoy);
        finHoy.setHours(23, 59, 59, 999);
        setRango({ desde: inicioHoy, hasta: finHoy, label: 'Hoy' });
    }, []);

    const dentroDelRango = (fecha) => {
        if (!rango.desde && !rango.hasta) return true;
        const f = fechaLocal(fecha);
        if (Number.isNaN(f.getTime())) return false;
        if (rango.desde && f < rango.desde) return false;
        if (rango.hasta && f > rango.hasta) return false;
        return true;
    };

    const ventasF = ventas.filter((v) => dentroDelRango(v.fecha) && !['anulada', 'devuelta'].includes(String(v.estado_pago || '').toLocaleLowerCase('es')));
    const comprasF = compras.filter((c) => dentroDelRango(c.fecha));
    const gastosF = gastos.filter((g) => dentroDelRango(g.fecha));
    const idsVentasF = new Set(ventasF.map((v) => v.id));
    const detalleF = detalleVentas.filter((d) => idsVentasF.has(d.venta_id));
    const ventaPorId = new Map(ventasF.map((venta) => [String(venta.id), venta]));
    const brutoPorVenta = new Map();
    detalleF.forEach((detalle) => brutoPorVenta.set(String(detalle.venta_id), (brutoPorVenta.get(String(detalle.venta_id)) || 0) + Number(detalle.subtotal || 0)));
    const ingresoNetoDetalle = (detalle) => {
        const bruto = Number(detalle.subtotal || 0);
        const venta = ventaPorId.get(String(detalle.venta_id));
        const totalLineas = brutoPorVenta.get(String(detalle.venta_id)) || 0;
        const descuento = Number(venta?.descuento || 0);
        return totalLineas > 0 ? bruto - descuento * bruto / totalLineas : bruto;
    };

    // === TOTALES BASE ===
    const ventasTotales = ventasF.reduce((a, v) => a + Number(v.total || 0), 0);
    const descuentoTotalVenta = ventasF.reduce((a, v) => a + Number(v.descuento || 0), 0);
    const comprasTotales = comprasF.reduce((a, c) => a + Number(c.total || 0), 0);
    const gastoTotal = gastosF.reduce((a, g) => a + Number(g.monto || 0), 0);

    const productosPorId = Object.fromEntries(productos.map((p) => [p.id, p]));
    const costoDetalle = (detalle) => {
        const costoHistorico = Number(detalle.precio_costo);
        return costoHistorico > 0 ? costoHistorico : Number(productosPorId[detalle.producto_id]?.precio_compra || 0);
    };
    const costoEstimadoLineas = detalleF.filter((detalle) => !(Number(detalle.precio_costo) > 0)).length;
    const costoVentas = detalleF.reduce((total, detalle) => total + costoDetalle(detalle) * Number(detalle.cantidad || 0), 0);
    const ventasSinDetalle = ventasF.filter((venta) => !detalleF.some((detalle) => String(detalle.venta_id) === String(venta.id))).length;
    const beneficioBruto = ventasTotales - costoVentas;
    const beneficioNeto = beneficioBruto - gastoTotal;
    const margenBruto = ventasTotales > 0 ? (beneficioBruto / ventasTotales) * 100 : 0;
    const margenNeto = ventasTotales > 0 ? (beneficioNeto / ventasTotales) * 100 : 0;

    // === GANANCIA DE HOY: siempre calculada con la fecha de hoy, sin importar el filtro elegido ===
    const inicioHoyFijo = new Date(); inicioHoyFijo.setHours(0, 0, 0, 0);
    const finHoyFijo = new Date(); finHoyFijo.setHours(23, 59, 59, 999);
    const dentroDeHoy = (fecha) => {
        const f = fechaLocal(fecha);
        return !Number.isNaN(f.getTime()) && f >= inicioHoyFijo && f <= finHoyFijo;
    };
    const ventasHoy = ventas.filter((v) => dentroDeHoy(v.fecha)).reduce((a, v) => a + Number(v.total || 0), 0);
    const ventasIdsHoy = new Set(ventas.filter((v) => dentroDeHoy(v.fecha) && !['anulada', 'devuelta'].includes(String(v.estado_pago || '').toLocaleLowerCase('es'))).map((v) => String(v.id)));
    const costoVentasHoy = detalleVentas.filter((d) => ventasIdsHoy.has(String(d.venta_id))).reduce((a, d) => a + costoDetalle(d) * Number(d.cantidad || 0), 0);
    const gastosHoy = gastos.filter((g) => dentroDeHoy(g.fecha)).reduce((a, g) => a + Number(g.monto || 0), 0);
    const gananciaHoy = ventasHoy - costoVentasHoy - gastosHoy;

    const cantDiasRango = rango.desde && rango.hasta
        ? Math.max(1, Math.round((rango.hasta - rango.desde) / 86400000) + 1)
        : Math.max(1, new Set(ventasF.map((v) => v.fecha?.slice(0, 10))).size || 1);
    const ventaDiariaProm = ventasTotales / cantDiasRango;
    const gastoDiarioProm = gastoTotal / cantDiasRango;
    const ratioGastosVentas = ventasTotales > 0 ? (gastoTotal / ventasTotales) * 100 : 0;

    const valorStockCompra = productos.reduce((a, p) => a + Number(p.stock_actual || 0) * Number(p.precio_compra || 0), 0);
    const valorStockVenta = productos.reduce((a, p) => a + Number(p.stock_actual || 0) * Number(p.precio_venta || 0), 0);
    const rotacionInventario = valorStockCompra > 0 ? comprasTotales / valorStockCompra : 0;

    // No inferir impuestos desde el total: las ventas/compras históricas no guardan
    // siempre la tasa y el tipo de precio aplicados en el momento del documento.
    const ivaDebito = detalleF.reduce((total, detalle) => total + Number(detalle.impuesto || 0), 0);
    // === TENDENCIA DIARIA ===
    const mapaDias = {};
    const clavesOrdenadas = [];
    const agregarDia = (fecha, campo, monto) => {
        const f = fechaLocal(fecha);
        if (Number.isNaN(f.getTime())) return;
        const key = f.toLocaleDateString('es-PY', { day: '2-digit', month: '2-digit' });
        if (!mapaDias[key]) { mapaDias[key] = { name: key, Ventas: 0, Gastos: 0, Ganancia: 0, _t: f.getTime() }; clavesOrdenadas.push(key); }
        mapaDias[key][campo] += monto;
    };
    ventasF.forEach((v) => agregarDia(v.fecha, 'Ventas', Number(v.total || 0)));
    gastosF.forEach((g) => agregarDia(g.fecha, 'Gastos', Number(g.monto || 0)));
    const ventasPorId = new Map(ventasF.map((venta) => [String(venta.id), venta]));
    detalleF.forEach((detalle) => {
        const venta = ventasPorId.get(String(detalle.venta_id));
        if (venta) agregarDia(venta.fecha, 'Ganancia', -costoDetalle(detalle) * Number(detalle.cantidad || 0));
    });
    const datosTendencia = Object.values(mapaDias).sort((a, b) => a._t - b._t).map((d) => ({ ...d, Ganancia: d.Ventas - d.Gastos + d.Ganancia }));

    // === INGRESOS (donut) ===
    const datosIngresos = [{ name: 'Ventas', value: ventasTotales }].filter((d) => d.value > 0);

    // === DESGLOSE GASTOS (pie por categoría) ===
    const gastosPorCategoria = {};
    gastosF.forEach((g) => {
        const cat = g.categoria || 'Sin categoría';
        gastosPorCategoria[cat] = (gastosPorCategoria[cat] || 0) + Number(g.monto || 0);
    });
    const datosDesgloseGastos = Object.entries(gastosPorCategoria).map(([name, value]) => ({ name, value }));

    // === BENEFICIO POR PRODUCTO / CATEGORÍA / MARCA ===
    const beneficioPorProducto = {};
    detalleF.forEach((d) => {
        const prod = productosPorId[d.producto_id];
        const costoUnit = costoDetalle(d);
        const cantidad = Number(d.cantidad || 0);
        const ingreso = ingresoNetoDetalle(d);
        const costo = costoUnit * cantidad;
        const key = d.nombre_producto || 'Producto';
        if (!beneficioPorProducto[key]) beneficioPorProducto[key] = { nombre: key, cantidad: 0, ingreso: 0, costo: 0 };
        beneficioPorProducto[key].cantidad += cantidad;
        beneficioPorProducto[key].ingreso += ingreso;
        beneficioPorProducto[key].costo += costo;
    });
    const filasProductos = Object.values(beneficioPorProducto).map((f) => ({ ...f, beneficio: f.ingreso - f.costo }));

    const beneficioPorCategoria = {};
    detalleF.forEach((d) => {
        const prod = productosPorId[d.producto_id];
        const cat = prod?.categoria || 'Sin categoría';
        const costoUnit = costoDetalle(d);
        const cantidad = Number(d.cantidad || 0);
        const ingreso = ingresoNetoDetalle(d);
        if (!beneficioPorCategoria[cat]) beneficioPorCategoria[cat] = { nombre: cat, ingreso: 0, costo: 0 };
        beneficioPorCategoria[cat].ingreso += ingreso;
        beneficioPorCategoria[cat].costo += costoUnit * cantidad;
    });
    const filasCategorias = Object.values(beneficioPorCategoria).map((f) => ({ ...f, beneficio: f.ingreso - f.costo }));

    const beneficioPorMarca = {};
    detalleF.forEach((d) => {
        const prod = productosPorId[d.producto_id];
        const marca = prod?.marca || 'Sin marca';
        const costoUnit = costoDetalle(d);
        const cantidad = Number(d.cantidad || 0);
        const ingreso = ingresoNetoDetalle(d);
        if (!beneficioPorMarca[marca]) beneficioPorMarca[marca] = { nombre: marca, ingreso: 0, costo: 0 };
        beneficioPorMarca[marca].ingreso += ingreso;
        beneficioPorMarca[marca].costo += costoUnit * cantidad;
    });
    const filasMarcas = Object.values(beneficioPorMarca).map((f) => ({ ...f, beneficio: f.ingreso - f.costo }));

    const filasPorTab = { productos: filasProductos, categorias: filasCategorias, marcas: filasMarcas }[tabActiva] || [];
    const filasFiltradas = filasPorTab.filter((f) => f.nombre.toLowerCase().includes(busquedaTabla.toLowerCase()));
    const totalPaginas = Math.max(1, Math.ceil(filasFiltradas.length / porPagina));
    const paginaSegura = Math.min(paginaActual, totalPaginas);
    const filasPagina = filasFiltradas.slice((paginaSegura - 1) * porPagina, paginaSegura * porPagina);
    const totalBeneficioTab = filasFiltradas.reduce((a, f) => a + f.beneficio, 0);

    useEffect(() => { setPaginaActual(1); }, [tabActiva, busquedaTabla]);

    const exportarCSV = () => {
        const filas = [['Nombre', 'Ingreso', 'Costo', 'Beneficio'], ...filasFiltradas.map((f) => [f.nombre, f.ingreso, f.costo, f.beneficio])];
        const csv = filas.map((f) => f.join(',')).join('\n');
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = `beneficio-${tabActiva}.csv`; a.click();
        URL.revokeObjectURL(url);
    };

    const Kpi = ({ valor, label, color }) => (
        <div className="bg-white p-3 rounded-xl shadow-sm border border-gray-100 text-center">
            <p className={`text-xl font-black ${color}`}>{valor}</p>
            <p className="text-[10px] font-bold text-gray-400 uppercase mt-1">{label}</p>
        </div>
    );

    if (cargando) return <div className="p-10 text-center font-bold text-orange-500">Cargando datos reales...</div>;

    return (
        <div className="bg-transparent text-sm text-gray-700">
            <h2 className="text-2xl font-bold text-gray-800 mb-4">Ganancias y Pérdidas</h2>

            {/* Filtro de fecha (la sucursal se elige arriba, en el selector global del sistema) */}
            <div className="flex justify-end items-center gap-3 mb-4">
                <FiltroFecha value={rango} onChange={(nuevoRango) => setRango(nuevoRango)} />
            </div>

            {/* GANANCIA DE HOY — siempre fija, no cambia con el filtro de arriba */}
            <div className={`rounded-2xl p-5 mb-4 flex items-center justify-between border ${gananciaHoy >= 0 ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
                <div>
                    <p className={`text-xs font-bold uppercase mb-1 ${gananciaHoy >= 0 ? 'text-green-600' : 'text-red-600'}`}>💰 Ganancia de hoy</p>
                    <p className={`text-2xl font-black ${gananciaHoy >= 0 ? 'text-green-700' : 'text-red-600'}`}>{formatGs(gananciaHoy)}</p>
                    <p className="text-[11px] text-gray-400 mt-0.5">Ventas de hoy − costo de artículos vendidos − gastos de hoy</p>
                </div>
                <div className="text-right text-xs text-gray-500 flex flex-col gap-0.5">
                    <span>Ventas hoy: <span className="font-bold text-gray-700">{formatGs(ventasHoy)}</span></span>
                    <span>Costo de ventas: <span className="font-bold text-gray-700">{formatGs(costoVentasHoy)}</span></span>
                    <span>Gastos hoy: <span className="font-bold text-gray-700">{formatGs(gastosHoy)}</span></span>
                </div>
            </div>

            {/* KPIs */}
            <div className="grid grid-cols-2 md:grid-cols-6 gap-3 mb-4">
                <Kpi valor={`${margenBruto.toFixed(1)}%`} label="Margen Bruto" color="text-blue-600" />
                <Kpi valor={`${margenNeto.toFixed(1)}%`} label="Margen Neto" color="text-green-600" />
                <Kpi valor={formatGs(ventaDiariaProm)} label="Venta diaria prom." color="text-orange-500" />
                <Kpi valor={formatGs(gastoDiarioProm)} label="Gasto diario prom." color="text-red-500" />
                <Kpi valor={`${ratioGastosVentas.toFixed(1)}%`} label="Ratio Gastos/Ventas" color="text-purple-500" />
                <Kpi valor={`${rotacionInventario.toFixed(2)}x`} label="Rotación Inventario" color="text-teal-600" />
            </div>

            {/* Tendencia diaria + Ingresos */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
                <div className="lg:col-span-2 bg-white p-5 rounded-2xl shadow-sm border border-gray-100">
                    <h3 className="font-bold text-gray-700 mb-4 flex items-center gap-2">📉 Tendencia Diaria</h3>
                    <div className="h-[260px]">
                        {datosTendencia.length === 0 ? (
                            <div className="flex h-full items-center justify-center text-gray-400 text-sm">Sin datos en este período.</div>
                        ) : (
                            <ResponsiveContainer width="100%" height="100%">
                                <AreaChart data={datosTendencia}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                    <XAxis dataKey="name" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                                    <YAxis tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                                    <Tooltip formatter={(v) => formatGs(v)} />
                                    <Legend />
                                    <Area type="monotone" dataKey="Ventas" stroke="#10b981" fill="#10b98122" strokeWidth={2} />
                                    <Area type="monotone" dataKey="Gastos" stroke="#ef4444" fill="#ef444422" strokeWidth={2} />
                                    <Area type="monotone" dataKey="Ganancia" stroke="#3b82f6" fill="#3b82f622" strokeWidth={2} />
                                </AreaChart>
                            </ResponsiveContainer>
                        )}
                    </div>
                </div>

                <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100">
                    <h3 className="font-bold text-gray-700 mb-4 flex items-center gap-2">🔵 Ingresos</h3>
                    <div className="h-[260px]">
                        {datosIngresos.length === 0 ? (
                            <div className="flex h-full items-center justify-center text-gray-400 text-sm">Sin ingresos aún.</div>
                        ) : (
                            <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                    <Pie data={datosIngresos} innerRadius={65} outerRadius={90} dataKey="value" fill="#10b981">
                                        {datosIngresos.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                                    </Pie>
                                    <Tooltip formatter={(v) => formatGs(v)} />
                                    <Legend verticalAlign="bottom" formatter={() => 'Ventas: 100.0%'} />
                                </PieChart>
                            </ResponsiveContainer>
                        )}
                    </div>
                </div>
            </div>

            {/* Desglose gastos + Resumen IVA */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
                <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100">
                    <h3 className="font-bold text-gray-700 mb-4 flex items-center gap-2">📊 Desglose Gastos</h3>
                    <div className="h-[220px]">
                        {datosDesgloseGastos.length === 0 ? (
                            <div className="flex h-full items-center justify-center text-gray-400 text-sm">Sin datos.</div>
                        ) : (
                            <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                    <Pie data={datosDesgloseGastos} outerRadius={80} dataKey="value" label>
                                        {datosDesgloseGastos.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                                    </Pie>
                                    <Tooltip formatter={(v) => formatGs(v)} />
                                </PieChart>
                            </ResponsiveContainer>
                        )}
                    </div>
                </div>

                <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100">
                    <h3 className="font-bold text-gray-700 mb-4 flex items-center gap-2">📄 Resumen IVA</h3>
                    <div className="flex flex-col gap-2 text-sm">
                        <div className="flex justify-between"><span className="text-gray-500">IVA de ventas guardado en líneas</span><span className="font-bold text-gray-800">{formatGs(ivaDebito)}</span></div>
                        <p className="border-t border-gray-100 pt-2 text-xs text-amber-700">No se calcula saldo fiscal: compras y ventas históricas no conservan consistentemente tasa y tipo de impuesto. Consultá el Informe Fiscal para ver solo los importes registrados.</p>
                    </div>
                    <p className="text-[10px] text-gray-400 mt-3">No se estima IVA a partir del total del comprobante.</p>
                </div>
            </div>

            {/* Costos y Deducciones + Ingresos */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
                <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100">
                    <h3 className="font-bold text-red-500 mb-4 flex items-center gap-2">➖ Costos y Deducciones</h3>
                    <div className="flex flex-col gap-2 text-sm">
                        <div className="flex justify-between"><span className="text-gray-500">Compras totales</span><span className="font-bold text-gray-800">{formatGs(comprasTotales)}</span></div>
                        <div className="flex justify-between"><span className="text-gray-500">Gasto total</span><span className="font-bold text-gray-800">{formatGs(gastoTotal)}</span></div>
                        <div className="flex justify-between"><span className="text-gray-500">Descuento total de venta</span><span className="font-bold text-gray-800">{formatGs(descuentoTotalVenta)}</span></div>
                        <div className="flex justify-between"><span className="text-gray-500">Valor de stock actual (a precio de compra)</span><span className="font-bold text-gray-800">{formatGs(valorStockCompra)}</span></div>
                    </div>
                </div>
                <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100">
                    <h3 className="font-bold text-green-600 mb-4 flex items-center gap-2">➕ Ingresos</h3>
                    <div className="flex flex-col gap-2 text-sm">
                        <div className="flex justify-between"><span className="text-gray-500">Ventas totales</span><span className="font-bold text-gray-800">{formatGs(ventasTotales)}</span></div>
                        <div className="flex justify-between"><span className="text-gray-500">Valor de stock actual (a precio de venta)</span><span className="font-bold text-gray-800">{formatGs(valorStockVenta)}</span></div>
                    </div>
                </div>
            </div>

            {/* Beneficio bruto / neto */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                <div className="bg-green-50 border border-green-100 rounded-2xl p-5 text-center">
                    <p className="text-[11px] font-bold text-green-600 uppercase mb-1">Beneficio Bruto</p>
                    <p className="text-2xl font-black text-green-700">{formatGs(beneficioBruto)}</p>
                    <p className="text-[10px] text-gray-400 mt-1">(Ventas totales − costo histórico de artículos vendidos)</p>
                </div>
                <div className={`rounded-2xl p-5 text-center border ${beneficioNeto >= 0 ? 'bg-green-50 border-green-100' : 'bg-red-50 border-red-100'}`}>
                    <p className={`text-[11px] font-bold uppercase mb-1 ${beneficioNeto >= 0 ? 'text-green-600' : 'text-red-600'}`}>Beneficio Neto</p>
                    <p className={`text-2xl font-black ${beneficioNeto >= 0 ? 'text-green-700' : 'text-red-600'}`}>{formatGs(beneficioNeto)}</p>
                    <p className="text-[10px] text-gray-400 mt-1">(Beneficio Bruto − Gastos; ventas ya incluyen descuento)</p>
                </div>
            </div>
            {(ventasSinDetalle > 0 || costoEstimadoLineas > 0) && <p className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">Precisión histórica limitada: {ventasSinDetalle} venta(s) sin detalle de artículos; {costoEstimadoLineas} línea(s) sin costo histórico usaron el costo actual del producto. El resultado puede no coincidir con el costo real de esas operaciones.</p>}

            {/* Tabs de beneficio detallado */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
                <div className="flex flex-wrap gap-2 mb-4 border-b border-gray-100 pb-3">
                    {TABS.map((t) => (
                        <button key={t.key} onClick={() => setTabActiva(t.key)}
                            className={`text-xs font-bold px-3 py-2 rounded-lg transition-colors ${tabActiva === t.key ? 'bg-blue-50 text-blue-600' : 'text-gray-400 hover:text-gray-600'}`}>
                            {t.label}
                        </button>
                    ))}
                    {['📍 Beneficio por ubicaciones', '🧾 Beneficio por factura', '📅 Beneficio por fecha', '👤 Beneficio por cliente', '📆 Beneficio por día'].map((label) => (
                        <button key={label} onClick={() => alert('Próximamente')} className="text-xs font-bold px-3 py-2 rounded-lg text-gray-300 cursor-not-allowed">
                            {label}
                        </button>
                    ))}
                </div>

                <div className="flex flex-wrap justify-between items-center gap-3 mb-4">
                    <div className="flex gap-1">
                        <button onClick={exportarCSV} className="bg-gray-100 border text-gray-600 px-2.5 py-1 rounded text-xs font-semibold hover:bg-gray-200">📄 Exportar a CSV</button>
                        <button onClick={() => window.print()} className="bg-gray-100 border text-gray-600 px-2.5 py-1 rounded text-xs font-semibold hover:bg-gray-200">🖨️ Imprimir</button>
                    </div>
                    <input type="text" className="border rounded p-1.5 w-64 text-sm outline-none focus:border-blue-500" placeholder="Buscar..." value={busquedaTabla} onChange={(e) => setBusquedaTabla(e.target.value)} />
                </div>

                <table className="w-full text-sm">
                    <thead>
                        <tr className="text-gray-400 text-xs uppercase border-b border-gray-100">
                            <th className="text-left py-2">{tabActiva === 'productos' ? 'Producto' : tabActiva === 'categorias' ? 'Categoría' : 'Marca'}</th>
                            <th className="text-right py-2">Cant. vendida</th>
                            <th className="text-right py-2">Ingreso</th>
                            <th className="text-right py-2">Costo</th>
                            <th className="text-right py-2">Beneficio</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filasPagina.length === 0 ? (
                            <tr><td colSpan={5} className="text-center py-8 text-gray-400">
                                {detalleVentas.length === 0 ? 'Aún no hay ventas con detalle guardado en este período.' : 'Sin resultados.'}
                            </td></tr>
                        ) : (
                            filasPagina.map((f) => (
                                <tr key={f.nombre} className="border-b border-gray-50 hover:bg-gray-50">
                                    <td className="py-2 font-medium text-gray-700">{f.nombre}</td>
                                    <td className="py-2 text-right text-gray-500">{f.cantidad || '—'}</td>
                                    <td className="py-2 text-right text-gray-700">{formatGs(f.ingreso)}</td>
                                    <td className="py-2 text-right text-gray-500">{formatGs(f.costo)}</td>
                                    <td className={`py-2 text-right font-bold ${f.beneficio >= 0 ? 'text-green-600' : 'text-red-600'}`}>{formatGs(f.beneficio)}</td>
                                </tr>
                            ))
                        )}
                    </tbody>
                    {filasPagina.length > 0 && (
                        <tfoot>
                            <tr className="font-bold bg-gray-50">
                                <td colSpan={4} className="py-2 px-1">Total:</td>
                                <td className={`py-2 text-right ${totalBeneficioTab >= 0 ? 'text-green-600' : 'text-red-600'}`}>{formatGs(totalBeneficioTab)}</td>
                            </tr>
                        </tfoot>
                    )}
                </table>

                <div className="flex justify-between items-center mt-4 text-xs">
                    <span className="font-bold text-gray-500">Mostrando {filasPagina.length === 0 ? 0 : (paginaSegura - 1) * porPagina + 1} a {(paginaSegura - 1) * porPagina + filasPagina.length} de {filasFiltradas.length} entradas</span>
                    <div className="flex gap-1">
                        <button onClick={() => setPaginaActual((p) => Math.max(1, p - 1))} disabled={paginaSegura === 1} className="px-3 py-1 border rounded font-bold disabled:opacity-40">Anterior</button>
                        <button onClick={() => setPaginaActual((p) => Math.min(totalPaginas, p + 1))} disabled={paginaSegura === totalPaginas} className="px-3 py-1 border rounded font-bold disabled:opacity-40">Siguiente</button>
                    </div>
                </div>

                <p className="text-[11px] text-gray-400 mt-3">
                    Nota: se usa el costo guardado en el detalle de venta; cuando falta, el informe estima con el costo actual del producto y lo indica arriba.
                </p>
            </div>
        </div>
    );
}
