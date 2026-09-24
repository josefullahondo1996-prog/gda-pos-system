import { useEffect, useMemo, useState } from 'react';
import { Download, Search, SlidersHorizontal } from 'lucide-react';
import { supabase } from './supabaseClient';
import { useEmpresaInfo } from './utils/useEmpresa';
import { useSucursalActiva } from './utils/SucursalContext';
import FiltroFecha from './FiltroFecha';

const dinero = (valor) => `${Number(valor || 0).toLocaleString('es-PY')} Gs`;
const fechaTexto = (valor) => valor ? new Date(valor).toLocaleDateString('es-PY') : '-';
const hoy = new Date();
const inicioHoy = new Date(hoy); inicioHoy.setHours(0, 0, 0, 0);
const finHoy = new Date(hoy); finHoy.setHours(23, 59, 59, 999);

export default function VentasPorProductoDetalle() {
  const { id: empresaId } = useEmpresaInfo();
  const { sucursalActiva } = useSucursalActiva();
  const [ventas, setVentas] = useState([]);
  const [detalles, setDetalles] = useState([]);
  const [productos, setProductos] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [busqueda, setBusqueda] = useState('');
  const [cliente, setCliente] = useState('');
  const [categoria, setCategoria] = useState('');
  const [marca, setMarca] = useState('');
  const [rango, setRango] = useState({ desde: inicioHoy, hasta: finHoy, label: 'Hoy' });
  const [vista, setVista] = useState('agrupado');
  const [pagina, setPagina] = useState(1);
  const [porPagina, setPorPagina] = useState(25);

  useEffect(() => {
    if (!empresaId) return;
    const cargar = async () => {
      setCargando(true); setError('');
      const [ventasResponse, detallesResponse, productosResponse] = await Promise.all([
        supabase.from('ventas').select('*').eq('empresa_id', empresaId),
        supabase.from('detalle_ventas').select('*').eq('empresa_id', empresaId),
        supabase.from('productos').select('*').eq('empresa_id', empresaId),
      ]);
      const fallo = [ventasResponse, detallesResponse, productosResponse].find((response) => response.error);
      if (fallo) setError(fallo.error.message || 'No se pudieron cargar las ventas.');
      setVentas(ventasResponse.data || []);
      setDetalles(detallesResponse.data || []);
      setProductos(productosResponse.data || []);
      setCargando(false);
    };
    cargar();
  }, [empresaId]);

  const productosMap = useMemo(() => new Map(productos.map((producto) => [producto.id, producto])), [productos]);
  const clientes = useMemo(() => [...new Set(ventas.map((venta) => venta.cliente).filter(Boolean))].sort(), [ventas]);
  const categorias = useMemo(() => [...new Set(productos.map((producto) => producto.categoria).filter(Boolean))].sort(), [productos]);
  const marcas = useMemo(() => [...new Set(productos.map((producto) => producto.marca || producto.marca_nombre).filter(Boolean))].sort(), [productos]);

  const filasDetalladas = useMemo(() => {
    const ventasMap = new Map(ventas.map((venta) => [venta.id, venta]));
    const texto = busqueda.trim().toLowerCase();
    return detalles.map((detalle) => {
      const venta = ventasMap.get(detalle.venta_id);
      const producto = productosMap.get(detalle.producto_id);
      const fecha = venta?.fecha ? new Date(venta.fecha) : null;
      const nombre = producto?.nombre || detalle.nombre_producto || 'Producto sin nombre';
      const codigo = producto?.codigo || '';
      const marcaProducto = producto?.marca || producto?.marca_nombre || '';
      const cantidad = Number(detalle.cantidad) || 0;
      const precio = Number(detalle.precio_unitario) || 0;
      const descuento = Number(detalle.descuento) || 0;
      const impuesto = Number(detalle.impuesto) || 0;
      const subtotal = Number(detalle.subtotal) || cantidad * precio;
      const total = subtotal - descuento + impuesto;
      const costo = Number(detalle.precio_costo || producto?.precio_compra) || 0;
      return { ...detalle, venta, producto, fecha, nombre, codigo, marcaProducto, cantidad, precio, descuento, impuesto, subtotal, total, costo, ganancia: total - (costo * cantidad) };
    }).filter((item) => {
      if (!item.venta || !item.fecha || Number.isNaN(item.fecha.getTime())) return false;
      if (rango.desde && item.fecha < rango.desde) return false;
      if (rango.hasta && item.fecha > rango.hasta) return false;
      if (sucursalActiva && item.venta.ubicacion_id !== sucursalActiva) return false;
      if (cliente && item.venta.cliente !== cliente) return false;
      if (categoria && item.producto?.categoria !== categoria) return false;
      if (marca && item.marcaProducto !== marca) return false;
      if (texto && !`${item.nombre} ${item.codigo} ${item.venta.cliente || ''}`.toLowerCase().includes(texto)) return false;
      return true;
    }).sort((a, b) => b.fecha - a.fecha);
  }, [ventas, detalles, productosMap, rango, sucursalActiva, cliente, categoria, marca, busqueda]);

  const filas = useMemo(() => {
    if (vista === 'detallado') return filasDetalladas;
    const agrupados = new Map();
    filasDetalladas.forEach((item) => {
      const clave = item.producto_id || item.nombre;
      const actual = agrupados.get(clave) || { id: clave, nombre: item.nombre, codigo: item.codigo, cantidad: 0, total: 0, costoTotal: 0, ganancia: 0, ventas: 0 };
      actual.cantidad += item.cantidad;
      actual.total += item.total;
      actual.costoTotal += item.costo * item.cantidad;
      actual.ganancia += item.ganancia;
      actual.ventas += 1;
      agrupados.set(clave, actual);
    });
    return [...agrupados.values()].map((item) => ({ ...item, precioPromedio: item.cantidad ? item.total / item.cantidad : 0, margen: item.total ? (item.ganancia / item.total) * 100 : 0 })).sort((a, b) => b.total - a.total);
  }, [filasDetalladas, vista]);

  useEffect(() => setPagina(1), [busqueda, cliente, categoria, marca, rango, vista, porPagina]);
  const totalPaginas = Math.max(1, Math.ceil(filas.length / porPagina));
  const paginaSegura = Math.min(pagina, totalPaginas);
  const filasPagina = filas.slice((paginaSegura - 1) * porPagina, paginaSegura * porPagina);
  const totalCantidad = filas.reduce((total, item) => total + item.cantidad, 0);
  const totalVenta = filas.reduce((total, item) => total + item.total, 0);
  const totalGanancia = filas.reduce((total, item) => total + (item.ganancia || 0), 0);

  const exportarCSV = () => {
    const encabezados = vista === 'detallado' ? ['PRODUCTO', 'CODIGO', 'CLIENTE', 'FECHA', 'CANTIDAD', 'PRECIO UNITARIO', 'TOTAL'] : ['PRODUCTO', 'CODIGO', 'CANTIDAD', 'PRECIO PROMEDIO', 'TOTAL VENTAS', 'GANANCIA', 'MARGEN'];
    const filasCSV = filas.map((item) => vista === 'detallado'
      ? [item.nombre, item.codigo, item.venta?.cliente || '', fechaTexto(item.fecha), item.cantidad, dinero(item.precio), dinero(item.total)]
      : [item.nombre, item.codigo, item.cantidad, dinero(item.precioPromedio), dinero(item.total), dinero(item.ganancia), `${item.margen.toFixed(2)}%`]);
    const contenido = [encabezados, ...filasCSV].map((fila) => fila.map((valor) => `"${String(valor ?? '').replaceAll('"', '""')}"`).join(',')).join('\n');
    const enlace = document.createElement('a');
    enlace.href = URL.createObjectURL(new Blob([contenido], { type: 'text/csv;charset=utf-8;' }));
    enlace.download = `ventas-por-producto-${new Date().toISOString().slice(0, 10)}.csv`;
    enlace.click(); URL.revokeObjectURL(enlace.href);
  };

  return (
    <div className="p-6 bg-gray-50 min-h-screen w-full text-gray-700">
      <div className="flex flex-wrap justify-between items-start gap-4 mb-5"><div><h1 className="text-2xl font-bold text-gray-800">Ventas por producto</h1><p className="text-sm text-gray-500 mt-1">Resumen de productos vendidos y su rentabilidad.</p></div><button onClick={exportarCSV} disabled={!filas.length} className="bg-orange-500 hover:bg-orange-600 disabled:bg-gray-300 text-white font-bold px-4 py-2 rounded-lg text-sm flex items-center gap-2"><Download size={16} /> Exportar CSV</button></div>
      <section className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 mb-5"><div className="flex items-center gap-2 text-sm font-bold text-sky-600 mb-4"><SlidersHorizontal size={16} /> Filtros</div><div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-4">
        <label className="text-xs font-bold">Buscar producto<input value={busqueda} onChange={(event) => setBusqueda(event.target.value)} placeholder="Nombre o código" className="mt-2 border rounded-md p-2 w-full text-sm font-normal" /></label>
        <label className="text-xs font-bold">Cliente<select value={cliente} onChange={(event) => setCliente(event.target.value)} className="mt-2 border rounded-md p-2 w-full text-sm font-normal"><option value="">Todos</option>{clientes.map((item) => <option key={item}>{item}</option>)}</select></label>
        <label className="text-xs font-bold">Categoría<select value={categoria} onChange={(event) => setCategoria(event.target.value)} className="mt-2 border rounded-md p-2 w-full text-sm font-normal"><option value="">Todas</option>{categorias.map((item) => <option key={item}>{item}</option>)}</select></label>
        <label className="text-xs font-bold">Marca<select value={marca} onChange={(event) => setMarca(event.target.value)} className="mt-2 border rounded-md p-2 w-full text-sm font-normal"><option value="">Todas</option>{marcas.map((item) => <option key={item}>{item}</option>)}</select></label>
        <label className="text-xs font-bold">Rango de fechas<span className="block mt-2"><FiltroFecha value={rango} onChange={setRango} /></span></label>
      </div></section>
      <section className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-5"><div className="bg-white border rounded-lg p-4"><div className="text-xs text-gray-500">Productos</div><div className="text-xl font-bold">{vista === 'agrupado' ? filas.length : new Set(filasDetalladas.map((item) => item.producto_id)).size}</div></div><div className="bg-white border rounded-lg p-4"><div className="text-xs text-gray-500">Total vendido</div><div className="text-xl font-bold text-orange-600">{dinero(totalVenta)}</div><div className="text-xs text-gray-500">{totalCantidad.toLocaleString('es-PY')} unidades</div></div><div className="bg-white border rounded-lg p-4"><div className="text-xs text-gray-500">Ganancia estimada</div><div className="text-xl font-bold text-emerald-600">{dinero(totalGanancia)}</div></div></section>
      <section className="bg-white rounded-lg shadow-sm border border-gray-200 p-4"><div className="flex flex-wrap items-center gap-2 mb-4 text-xs"><button onClick={() => setVista('agrupado')} className={`border rounded px-3 py-1.5 ${vista === 'agrupado' ? 'bg-orange-500 text-white' : 'bg-gray-50'}`}>Agrupado por producto</button><button onClick={() => setVista('detallado')} className={`border rounded px-3 py-1.5 ${vista === 'detallado' ? 'bg-orange-500 text-white' : 'bg-gray-50'}`}>Detallado</button><span className="ml-2">Mostrar</span><select value={porPagina} onChange={(event) => setPorPagina(Number(event.target.value))} className="border rounded p-1"><option value="10">10</option><option value="25">25</option><option value="50">50</option><option value="100">100</option></select><span>entradas</span></div>
        {error && <div className="mb-4 rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
        {cargando ? <div className="p-8 text-center text-gray-500">Cargando ventas...</div> : !filas.length ? <div className="p-8 text-center text-gray-500">No hay ventas para los filtros seleccionados.</div> : <div className="overflow-x-auto"><table className="w-full text-xs"><thead className="bg-gray-100 border-b"><tr>{(vista === 'detallado' ? ['PRODUCTO', 'CODIGO', 'CLIENTE', 'FECHA', 'CANTIDAD', 'PRECIO UNITARIO', 'TOTAL'] : ['PRODUCTO', 'CODIGO', 'CANTIDAD', 'PRECIO PROMEDIO', 'TOTAL VENTAS', 'GANANCIA', 'MARGEN']).map((item) => <th key={item} className="px-3 py-3 text-left font-bold whitespace-nowrap">{item}</th>)}</tr></thead><tbody>{filasPagina.map((item) => vista === 'detallado' ? <tr key={item.id} className="border-b hover:bg-gray-50"><td className="px-3 py-3 font-semibold">{item.nombre}</td><td className="px-3 py-3">{item.codigo || '-'}</td><td className="px-3 py-3">{item.venta?.cliente || '-'}</td><td className="px-3 py-3">{fechaTexto(item.fecha)}</td><td className="px-3 py-3 text-right">{item.cantidad}</td><td className="px-3 py-3 text-right">{dinero(item.precio)}</td><td className="px-3 py-3 text-right font-semibold">{dinero(item.total)}</td></tr> : <tr key={item.id} className="border-b hover:bg-gray-50"><td className="px-3 py-3 font-semibold">{item.nombre}</td><td className="px-3 py-3">{item.codigo || '-'}</td><td className="px-3 py-3 text-right">{item.cantidad}</td><td className="px-3 py-3 text-right">{dinero(item.precioPromedio)}</td><td className="px-3 py-3 text-right font-semibold">{dinero(item.total)}</td><td className="px-3 py-3 text-right text-emerald-600">{dinero(item.ganancia)}</td><td className="px-3 py-3 text-right">{item.margen.toFixed(2)}%</td></tr>)}</tbody></table></div>}
        <div className="flex flex-wrap justify-between items-center gap-3 text-xs mt-4"><span>Mostrando {filas.length ? ((paginaSegura - 1) * porPagina) + 1 : 0} a {Math.min(paginaSegura * porPagina, filas.length)} de {filas.length} entradas</span><div className="flex gap-1"><button disabled={paginaSegura === 1} onClick={() => setPagina((actual) => actual - 1)} className="border rounded px-3 py-1 disabled:opacity-40">Anterior</button><span className="bg-blue-600 text-white rounded px-3 py-1">{paginaSegura}</span><button disabled={paginaSegura === totalPaginas} onClick={() => setPagina((actual) => actual + 1)} className="border rounded px-3 py-1 disabled:opacity-40">Siguiente</button></div></div>
      </section>
    </div>
  );
}
