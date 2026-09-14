import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeft, Download, FileDown, PackageSearch, Printer, RefreshCw } from 'lucide-react';
import { supabase } from './supabaseClient';
import { useEmpresaInfo } from './utils/useEmpresa';
import { useUbicacionUsuario } from './utils/useUbicacion';
import { useSucursalActiva } from './utils/SucursalContext';
import { formatearStock } from './utils/cantidadProducto';

const formatearCantidad = (cantidad, unidad) => formatearStock(cantidad, unidad);
const formatearFecha = (fecha) => fecha
  ? new Date(fecha).toLocaleString('es-PY', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  : '-';

export default function HistorialExistencias() {
  const navigate = useNavigate();
  const location = useLocation();
  const productoId = location.pathname.split('/').filter(Boolean)[1] || '';
  const { id: empresaId } = useEmpresaInfo();
  const { id: ubicacionUsuarioId, nombre: nombreUbicacionUsuario, ve_todas: usuarioVeTodas } = useUbicacionUsuario();
  const { sucursalActiva } = useSucursalActiva();
  const [productos, setProductos] = useState([]);
  const [ubicaciones, setUbicaciones] = useState([]);
  const [productoSeleccionado, setProductoSeleccionado] = useState(null);
  const [ubicacionSeleccionada, setUbicacionSeleccionada] = useState('');
  const [movimientos, setMovimientos] = useState([]);
  const [stockPorUbicacion, setStockPorUbicacion] = useState({});
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [porPagina, setPorPagina] = useState(25);

  const cargarHistorial = async (idProducto = productoId, idUbicacion = ubicacionSeleccionada) => {
    if (!empresaId || !idProducto) return;
    setCargando(true);
    setError('');

    const [rProductos, rUbicaciones, rStock, rVentas, rCompras] = await Promise.all([
      supabase.from('productos').select('*').eq('empresa_id', empresaId).order('nombre'),
      supabase.from('ubicaciones_comerciales').select('id, nombre, codigo_ubicacion').eq('empresa_id', empresaId).eq('activo', true).order('nombre'),
      supabase.from('producto_stock_ubicacion').select('producto_id, ubicacion_id, cantidad').eq('empresa_id', empresaId),
      supabase.from('detalle_ventas').select('cantidad, ventas(fecha, id, cliente)').eq('empresa_id', empresaId).eq('producto_id', idProducto),
      supabase.from('detalle_compras').select('cantidad, compras(fecha, id, proveedor_nombre, nro_factura)').eq('empresa_id', empresaId).eq('producto_id', idProducto),
    ]);

    const consultaBaseConError = [rProductos, rUbicaciones, rStock].find((respuesta) => respuesta.error);
    if (consultaBaseConError) {
      setError(`No se pudo cargar la información del producto o la ubicación: ${consultaBaseConError.error.message}`);
      setCargando(false);
      return;
    }

    const listaProductos = rProductos.data || [];
    const listaUbicaciones = rUbicaciones.data || [];
    setProductos(listaProductos);
    setUbicaciones(listaUbicaciones);
    setStockPorUbicacion((rStock.data || []).reduce((mapa, fila) => {
      mapa[`${fila.producto_id}:${fila.ubicacion_id}`] = Number(fila.cantidad) || 0;
      return mapa;
    }, {}));

    const erroresMovimientos = [rVentas, rCompras].filter((respuesta) => respuesta.error);
    setError(erroresMovimientos.length ? `La ubicación está disponible, pero no se pudieron cargar todos los movimientos: ${erroresMovimientos.map((respuesta) => respuesta.error.message).join(' | ')}` : '');

    const producto = listaProductos.find((item) => String(item.id) === String(idProducto));
    setProductoSeleccionado(producto || null);

    const movimientosSinSaldo = [
      ...(rVentas.data || []).map((venta) => ({
        tipo: 'Ventas',
        cambio: -Number(venta.cantidad || 0),
        fecha: venta.ventas?.fecha,
        referencia: venta.ventas?.id ? String(venta.ventas.id).slice(0, 8).toUpperCase() : '-',
        tercero: venta.ventas?.cliente || 'Cliente ocasional',
      })),
      ...(rCompras.data || []).map((compra) => ({
        tipo: 'Compras',
        cambio: Number(compra.cantidad || 0),
        fecha: compra.compras?.fecha,
        referencia: compra.compras?.nro_factura || (compra.compras?.id ? String(compra.compras.id).slice(0, 8).toUpperCase() : '-'),
        tercero: compra.compras?.proveedor_nombre || 'Proveedor no especificado',
      })),
    ].filter((movimiento) => movimiento.fecha).sort((a, b) => new Date(a.fecha) - new Date(b.fecha));

    const stockActualGlobal = Number(producto?.stock_actual) || 0;
    const totalNeto = movimientosSinSaldo.reduce((total, movimiento) => total + movimiento.cambio, 0);
    let saldo = stockActualGlobal - totalNeto;
    const movimientosConSaldo = movimientosSinSaldo.map((movimiento) => {
      saldo += movimiento.cambio;
      return { ...movimiento, nuevaCantidad: saldo };
    });
    setMovimientos(movimientosConSaldo.reverse());
    setUbicacionSeleccionada(idUbicacion || sucursalActiva || ubicacionUsuarioId || listaUbicaciones[0]?.id || '');
    setCargando(false);
  };

  useEffect(() => {
    cargarHistorial();
  }, [empresaId, productoId]);

  const producto = productoSeleccionado;
  const stockActual = useMemo(() => {
    if (!producto) return 0;
    const clave = `${producto.id}:${ubicacionSeleccionada}`;
    return ubicacionSeleccionada && stockPorUbicacion[clave] !== undefined
      ? stockPorUbicacion[clave]
      : Number(producto.stock_actual) || 0;
  }, [producto, ubicacionSeleccionada, stockPorUbicacion]);
  const totalCompras = movimientos.filter((m) => m.tipo === 'Compras').reduce((total, m) => total + m.cambio, 0);
  const totalVentas = movimientos.filter((m) => m.tipo === 'Ventas').reduce((total, m) => total + Math.abs(m.cambio), 0);
  const stockApertura = Math.max(0, Number(producto?.stock_actual || 0) - totalCompras + totalVentas);
  const ubicacionActual = ubicaciones.find((ubicacion) => String(ubicacion.id) === String(ubicacionSeleccionada));
  const movimientosVisibles = movimientos.slice(0, porPagina);

  const cambiarProducto = (event) => {
    const nuevoId = event.target.value;
    if (nuevoId) navigate(`/stock-history/${nuevoId}`);
  };

  const cambiarUbicacion = (event) => {
    setUbicacionSeleccionada(event.target.value);
    cargarHistorial(productoId, event.target.value);
  };

  const exportarCsv = () => {
    const encabezados = ['Tipo', 'Cambio de cantidad', 'Nueva cantidad', 'Fecha', 'Numero de referencia', 'Customer/Supplier information'];
    const filas = movimientos.map((movimiento) => [
      movimiento.tipo,
      movimiento.cambio,
      movimiento.nuevaCantidad,
      formatearFecha(movimiento.fecha),
      movimiento.referencia,
      movimiento.tercero,
    ]);
    const csv = [encabezados, ...filas]
      .map((fila) => fila.map((valor) => `"${String(valor ?? '').replaceAll('"', '""')}"`).join(','))
      .join('\n');
    const enlace = document.createElement('a');
    enlace.href = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' }));
    enlace.download = `historial_${producto?.codigo || producto?.id || 'producto'}.csv`;
    enlace.click();
    URL.revokeObjectURL(enlace.href);
  };

  return (
    <div className="max-w-[1400px] mx-auto text-[#17213a] pb-8">
      <div className="flex flex-wrap items-end justify-between gap-3 mb-3">
        <div>
          <button onClick={() => navigate('/catalogo')} className="inline-flex items-center gap-1.5 text-[11px] font-bold text-slate-500 hover:text-orange-500 mb-2">
            <ArrowLeft size={16} /> Volver a productos
          </button>
          <h1 className="text-xl md:text-2xl font-black tracking-tight text-[#16213b]">Historial de existencias de productos</h1>
        </div>
        <button onClick={() => cargarHistorial()} className="inline-flex items-center gap-2 rounded border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-600 shadow-sm hover:border-orange-300 hover:text-orange-600">
          <RefreshCw size={15} /> Actualizar
        </button>
      </div>

      <section className="bg-white border border-slate-200 rounded-md shadow-[0_1px_3px_rgba(15,23,42,0.06)] overflow-hidden mb-5">
        <div className="px-4 py-3 bg-[#f7f9fc] border-b border-slate-200 font-black text-[13px] text-[#263b63]">
          {producto?.nombre || 'Seleccionar producto'}{producto?.codigo ? ` (${producto.codigo})` : ''}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 px-5 py-4">
          <label className="text-[11px] font-black text-slate-700">
            Producto:
            <select value={producto?.id || ''} onChange={cambiarProducto} className="mt-1.5 w-full border border-slate-200 rounded px-3 py-2 text-xs font-medium bg-white text-slate-700">
              <option value="">Seleccione un producto</option>
              {productos.map((item) => <option key={item.id} value={item.id}>{item.nombre}{item.codigo ? ` - ${item.codigo}` : ''}</option>)}
            </select>
          </label>
          <label className="text-[11px] font-black text-slate-700">
            Ubicación de la empresa:
            <select value={ubicacionSeleccionada} onChange={cambiarUbicacion} className="mt-1.5 w-full border border-slate-200 rounded px-3 py-2 text-xs font-medium bg-white text-slate-700">
              {!usuarioVeTodas && ubicacionUsuarioId && <option value={ubicacionUsuarioId}>{nombreUbicacionUsuario || 'Mi ubicación'}</option>}
              {ubicaciones.filter((ubicacion) => usuarioVeTodas || String(ubicacion.id) !== String(ubicacionUsuarioId)).map((ubicacion) => (
                <option key={ubicacion.id} value={ubicacion.id}>{ubicacion.nombre}{ubicacion.codigo_ubicacion ? ` (${ubicacion.codigo_ubicacion})` : ''}</option>
              ))}
              {!ubicaciones.length && <option value="">Sin ubicaciones registradas</option>}
            </select>
          </label>
        </div>
      </section>

      {error ? <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-4 mb-5 text-sm font-semibold">{error}</div> : null}
      {cargando ? (
        <div className="bg-white rounded-lg border border-slate-200 p-12 text-center text-slate-500 font-semibold">Cargando historial...</div>
      ) : !producto ? (
        <div className="bg-white rounded-lg border border-slate-200 p-12 text-center text-slate-500"><PackageSearch className="mx-auto mb-3" />Producto no encontrado.</div>
      ) : (
        <>
          <section className="bg-white border border-slate-200 rounded-md shadow-[0_1px_3px_rgba(15,23,42,0.06)] p-4 mb-5">
            <h2 className="font-bold text-[13px] text-[#263b63] mb-3">{producto.nombre} {producto.codigo ? `(${producto.codigo})` : ''}</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-xs">
              <div className="md:border-r md:border-slate-200 md:pr-6"><h3 className="font-black text-[11px] mb-1.5">Cantidades en</h3><div className="border-t border-slate-200 py-1.5 flex justify-between"><span>Compra total</span><strong>{formatearCantidad(totalCompras, producto.unidad)}</strong></div><div className="border-t border-slate-200 py-1.5 flex justify-between"><span>Stock de apertura</span><strong>{formatearCantidad(stockApertura, producto.unidad)}</strong></div><div className="border-t border-slate-200 py-1.5 flex justify-between"><span>Devolución de venta</span><strong>0</strong></div><div className="border-t border-slate-200 py-1.5 flex justify-between"><span>Transferencias de stock (En)</span><strong>0</strong></div></div>
              <div className="md:border-r md:border-slate-200 md:pr-6"><h3 className="font-black text-[11px] mb-1.5">Cantidades fuera</h3><div className="border-t border-slate-200 py-1.5 flex justify-between"><span>Total vendido</span><strong>{formatearCantidad(totalVentas, producto.unidad)}</strong></div><div className="border-t border-slate-200 py-1.5 flex justify-between"><span>Ajuste total de stock</span><strong>0</strong></div><div className="border-t border-slate-200 py-1.5 flex justify-between"><span>Devolución de compra</span><strong>0</strong></div><div className="border-t border-slate-200 py-1.5 flex justify-between"><span>Transferencias de stock (Afuera)</span><strong>0</strong></div></div>
              <div><h3 className="font-black text-[11px] mb-1.5">Totales</h3><div className="border-t border-slate-200 py-1.5 flex justify-between"><span>Stock actual</span><strong className="text-[#263b63]">{formatearCantidad(stockActual, producto.unidad)}</strong></div><div className="border-t border-slate-200 py-1.5 flex justify-between"><span>Ubicación</span><strong>{ubicacionActual?.nombre || 'General'}</strong></div></div>
            </div>
          </section>

          <section className="bg-white border border-slate-200 rounded-md shadow-[0_1px_3px_rgba(15,23,42,0.06)] p-4 overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-300 pb-3 mb-3">
              <label className="text-[11px] font-semibold text-slate-600">Mostrar <select value={porPagina} onChange={(event) => setPorPagina(Number(event.target.value))} className="mx-1 border border-slate-200 rounded px-2 py-1 bg-white"><option value={25}>25</option><option value={50}>50</option><option value={100}>100</option></select> entradas</label>
              <div className="flex flex-wrap gap-1.5"><button onClick={exportarCsv} className="inline-flex items-center gap-1 border border-slate-200 bg-slate-50 rounded px-2.5 py-1.5 text-[11px] font-bold text-slate-600 hover:bg-slate-100"><Download size={13} /> Exportar a CSV</button><button onClick={() => window.print()} className="inline-flex items-center gap-1 border border-slate-200 bg-slate-50 rounded px-2.5 py-1.5 text-[11px] font-bold text-slate-600 hover:bg-slate-100"><Printer size={13} /> Imprimir</button><button onClick={() => window.print()} className="inline-flex items-center gap-1 border border-slate-200 bg-slate-50 rounded px-2.5 py-1.5 text-[11px] font-bold text-slate-600 hover:bg-slate-100"><FileDown size={13} /> Exportar a PDF</button></div>
            </div>
            <div className="overflow-x-auto"><table className="w-full text-xs min-w-[800px]"><thead><tr className="bg-[#f7f9fc] text-[#64748b] uppercase text-[10px] tracking-wide"><th className="text-left p-3 font-black">Tipo</th><th className="text-left p-3 font-black">Cambio de cantidad</th><th className="text-left p-3 font-black">Nueva cantidad</th><th className="text-left p-3 font-black">Fecha</th><th className="text-left p-3 font-black">Número de referencia</th><th className="text-left p-3 font-black">Customer/Supplier information</th></tr></thead><tbody>{movimientosVisibles.map((movimiento, indice) => <tr key={`${movimiento.fecha}-${indice}`} className="border-b border-slate-100 hover:bg-[#f8fafc]"><td className="p-3 font-semibold text-slate-700">{movimiento.tipo}</td><td className={`p-3 font-bold ${movimiento.cambio < 0 ? 'text-red-500' : 'text-emerald-600'}`}>{movimiento.cambio > 0 ? '+' : ''}{formatearCantidad(movimiento.cambio, producto.unidad)}</td><td className="p-3 font-semibold text-slate-700">{formatearCantidad(movimiento.nuevaCantidad, producto.unidad)}</td><td className="p-3 whitespace-nowrap text-slate-600">{formatearFecha(movimiento.fecha)}</td><td className="p-3 text-slate-600">{movimiento.referencia}</td><td className="p-3 text-slate-600">{movimiento.tercero}</td></tr>)}{movimientosVisibles.length === 0 && <tr><td colSpan="6" className="p-10 text-center text-slate-400">No hay movimientos registrados para este producto.</td></tr>}</tbody></table></div>
          </section>
        </>
      )}
    </div>
  );
}
