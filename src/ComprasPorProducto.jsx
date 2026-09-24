import { useEffect, useMemo, useState } from 'react';
import { Download, Search } from 'lucide-react';
import { supabase } from './supabaseClient';
import { useEmpresaInfo } from './utils/useEmpresa';
import FiltroFecha from './FiltroFecha';

const formatoGs = (valor) => `${Number(valor || 0).toLocaleString('es-PY')} Gs`;

const ComprasPorProducto = () => {
  const { id: empresaId } = useEmpresaInfo();
  const [compras, setCompras] = useState([]);
  const [detalles, setDetalles] = useState([]);
  const [productos, setProductos] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [busqueda, setBusqueda] = useState('');
  const [rango, setRango] = useState({ desde: null, hasta: null, label: 'Todo' });

  useEffect(() => {
    if (!empresaId) return;

    const cargarDatos = async () => {
      setCargando(true);
      const [comprasResponse, detallesResponse, productosResponse] = await Promise.all([
        supabase.from('compras').select('id, fecha, proveedor_nombre, nro_factura').eq('empresa_id', empresaId),
        supabase.from('detalle_compras').select('compra_id, producto_id, nombre_producto, codigo_sku, cantidad, costo_unitario, subtotal').eq('empresa_id', empresaId),
        supabase.from('productos').select('id, nombre, codigo, categoria').eq('empresa_id', empresaId),
      ]);

      setCompras(comprasResponse.data || []);
      setDetalles(detallesResponse.data || []);
      setProductos(productosResponse.data || []);
      setCargando(false);
    };

    cargarDatos();
  }, [empresaId]);

  const datos = useMemo(() => {
    const compraPorId = new Map(compras.map((compra) => [compra.id, compra]));
    const productoPorId = new Map(productos.map((producto) => [producto.id, producto]));
    const agrupados = new Map();

    detalles.forEach((detalle) => {
      const compra = compraPorId.get(detalle.compra_id);
      if (!compra) return;
      const fecha = new Date(compra.fecha);
      if (Number.isNaN(fecha.getTime())) return;
      if (rango.desde && fecha < rango.desde) return;
      if (rango.hasta && fecha > rango.hasta) return;

      const producto = productoPorId.get(detalle.producto_id);
      const nombre = producto?.nombre || detalle.nombre_producto || 'Producto sin nombre';
      const codigo = producto?.codigo || detalle.codigo_sku || '';
      const textoBusqueda = `${nombre} ${codigo}`.toLowerCase();
      if (busqueda.trim() && !textoBusqueda.includes(busqueda.trim().toLowerCase())) return;

      const clave = detalle.producto_id || `${nombre}-${codigo}`;
      const cantidad = Number(detalle.cantidad) || 0;
      const costoUnitario = Number(detalle.costo_unitario) || 0;
      const subtotal = Number(detalle.subtotal) || cantidad * costoUnitario;
      const actual = agrupados.get(clave) || {
        clave,
        nombre,
        codigo,
        cantidad: 0,
        total: 0,
        compras: 0,
        ultimaCompra: null,
      };
      actual.cantidad += cantidad;
      actual.total += subtotal;
      actual.compras += 1;
      if (!actual.ultimaCompra || fecha > actual.ultimaCompra) actual.ultimaCompra = fecha;
      agrupados.set(clave, actual);
    });

    return Array.from(agrupados.values())
      .map((item) => ({ ...item, costoPromedio: item.cantidad ? item.total / item.cantidad : 0 }))
      .sort((a, b) => b.total - a.total);
  }, [compras, detalles, productos, rango, busqueda]);

  const totalUnidades = datos.reduce((total, item) => total + item.cantidad, 0);
  const totalComprado = datos.reduce((total, item) => total + item.total, 0);

  const exportarCSV = () => {
    const encabezados = ['PRODUCTO', 'CODIGO', 'CANTIDAD', 'COSTO PROMEDIO', 'TOTAL COMPRADO', 'COMPRAS', 'ULTIMA COMPRA'];
    const filas = datos.map((item) => [
      item.nombre,
      item.codigo,
      item.cantidad,
      item.costoPromedio,
      item.total,
      item.compras,
      item.ultimaCompra?.toLocaleDateString('es-PY') || '',
    ]);
    const contenido = [encabezados, ...filas]
      .map((fila) => fila.map((valor) => `"${String(valor).replaceAll('"', '""')}"`).join(','))
      .join('\n');
    const enlace = document.createElement('a');
    enlace.href = URL.createObjectURL(new Blob([contenido], { type: 'text/csv;charset=utf-8;' }));
    enlace.download = `compras-por-producto-${new Date().toISOString().slice(0, 10)}.csv`;
    enlace.click();
    URL.revokeObjectURL(enlace.href);
  };

  return (
    <div className="p-6 bg-gray-50 min-h-screen w-full text-gray-700">
      <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Compras por producto</h1>
          <p className="text-sm text-gray-500 mt-1">Detalle agrupado de los productos comprados.</p>
        </div>
        <button onClick={exportarCSV} disabled={!datos.length} className="bg-orange-500 hover:bg-orange-600 disabled:bg-gray-300 text-white font-bold py-2 px-4 rounded-lg text-sm flex items-center gap-2">
          <Download size={16} /> Exportar CSV
        </button>
      </div>

      <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200 mb-6 flex flex-wrap items-end gap-4">
        <div className="min-w-[240px] flex-1">
          <label className="block text-xs font-bold text-gray-600 mb-2">Buscar producto</label>
          <div className="relative">
            <Search size={16} className="absolute left-3 top-2.5 text-gray-400" />
            <input value={busqueda} onChange={(event) => setBusqueda(event.target.value)} placeholder="Nombre o código" className="border border-gray-300 rounded-md p-2 pl-9 w-full outline-none text-sm" />
          </div>
        </div>
        <div>
          <label className="block text-xs font-bold text-gray-600 mb-2">Rango de fechas</label>
          <FiltroFecha value={rango} onChange={setRango} />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
        <div className="bg-white rounded-lg border border-gray-200 p-4"><div className="text-xs text-gray-500">Productos</div><div className="text-xl font-bold text-gray-800">{datos.length}</div></div>
        <div className="bg-white rounded-lg border border-gray-200 p-4"><div className="text-xs text-gray-500">Total comprado</div><div className="text-xl font-bold text-orange-600">{formatoGs(totalComprado)}</div><div className="text-xs text-gray-500 mt-1">{totalUnidades.toLocaleString('es-PY')} unidades</div></div>
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        {cargando ? <div className="p-8 text-center text-gray-500">Cargando datos...</div> : !datos.length ? <div className="p-8 text-center text-gray-500">No hay compras para los filtros seleccionados.</div> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-100 border-b border-gray-200"><tr>
                <th className="px-4 py-3 text-left font-bold">PRODUCTO</th>
                <th className="px-4 py-3 text-left font-bold">CÓDIGO</th>
                <th className="px-4 py-3 text-right font-bold">CANTIDAD</th>
                <th className="px-4 py-3 text-right font-bold">COSTO PROMEDIO</th>
                <th className="px-4 py-3 text-right font-bold">TOTAL COMPRADO</th>
                <th className="px-4 py-3 text-right font-bold">COMPRAS</th>
                <th className="px-4 py-3 text-right font-bold">ÚLTIMA COMPRA</th>
              </tr></thead>
              <tbody>{datos.map((item) => <tr key={item.clave} className="border-b border-gray-100 hover:bg-gray-50">
                <td className="px-4 py-3 font-semibold text-gray-800">{item.nombre}</td>
                <td className="px-4 py-3 text-gray-500">{item.codigo || '-'}</td>
                <td className="px-4 py-3 text-right">{item.cantidad.toLocaleString('es-PY')}</td>
                <td className="px-4 py-3 text-right">{formatoGs(item.costoPromedio)}</td>
                <td className="px-4 py-3 text-right font-semibold">{formatoGs(item.total)}</td>
                <td className="px-4 py-3 text-right">{item.compras}</td>
                <td className="px-4 py-3 text-right">{item.ultimaCompra?.toLocaleDateString('es-PY') || '-'}</td>
              </tr>)}</tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default ComprasPorProducto;
