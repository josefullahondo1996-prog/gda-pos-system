import { useEffect, useMemo, useState } from 'react';
import { supabase } from './supabaseClient';
import { useEmpresaInfo } from './utils/useEmpresa';

const formatGs = (v) => `Gs ${Number(v || 0).toLocaleString('es-PY')}`;
const formatNumero = (v) => (v === null || v === undefined ? '—' : Number(v).toLocaleString('es-PY'));
const textoSeguro = (value) => value || '—';

export default function ListaProductos() {
  const { id: empresaId } = useEmpresaInfo();
  const [productos, setProductos] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [busqueda, setBusqueda] = useState('');
  const [filtroMarca, setFiltroMarca] = useState('');
  const [filtroCategoria, setFiltroCategoria] = useState('');
  const [filtroUnidad, setFiltroUnidad] = useState('');
  const [mostrarFiltros, setMostrarFiltros] = useState(true);
  const [entradasPorPagina, setEntradasPorPagina] = useState(25);
  const [paginaActual, setPaginaActual] = useState(1);

  useEffect(() => {
    if (!empresaId) return;
    cargarProductos();
  }, [empresaId]);

  useEffect(() => {
    setPaginaActual(1);
  }, [busqueda, filtroMarca, filtroCategoria, filtroUnidad]);

  const cargarProductos = async () => {
    setCargando(true);
    const { data, error } = await supabase
      .from('productos')
      .select('*')
      .eq('empresa_id', empresaId)
      .order('nombre', { ascending: true });

    if (error) {
      console.error('Error cargando productos:', error.message);
    } else if (data) {
      setProductos(data);
    }
    setCargando(false);
  };

  const marcas = useMemo(
    () => Array.from(new Set(productos.map((p) => p.marca).filter(Boolean))).sort(),
    [productos]
  );
  const categorias = useMemo(
    () => Array.from(new Set(productos.map((p) => p.categoria).filter(Boolean))).sort(),
    [productos]
  );
  const unidades = useMemo(
    () => Array.from(new Set(productos.map((p) => p.unidad).filter(Boolean))).sort(),
    [productos]
  );

  const productosFiltrados = productos.filter((producto) => {
    const texto = [producto.nombre, producto.codigo, producto.marca, producto.categoria, producto.unidad]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();

    const coincideBusqueda = texto.includes(busqueda.trim().toLowerCase());
    const coincideMarca = !filtroMarca || producto.marca === filtroMarca;
    const coincideCategoria = !filtroCategoria || producto.categoria === filtroCategoria;
    const coincideUnidad = !filtroUnidad || producto.unidad === filtroUnidad;

    return coincideBusqueda && coincideMarca && coincideCategoria && coincideUnidad;
  });

  const totalProductos = productosFiltrados.length;
  const totalStock = productosFiltrados.reduce((acc, producto) => acc + Number(producto.stock_actual || 0), 0);
  const valorInventario = productosFiltrados.reduce(
    (acc, producto) => acc + Number(producto.stock_actual || 0) * Number(producto.precio_compra || 0),
    0
  );
  const productosSinStock = productosFiltrados.filter((producto) => Number(producto.stock_actual) <= 0).length;

  const totalPaginas = Math.max(1, Math.ceil(productosFiltrados.length / entradasPorPagina));
  const paginaSegura = Math.min(paginaActual, totalPaginas);
  const productosPagina = productosFiltrados.slice((paginaSegura - 1) * entradasPorPagina, paginaSegura * entradasPorPagina);

  return (
    <div className="bg-transparent text-sm text-gray-700">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between mb-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-800">Lista de productos</h2>
          <p className="text-gray-500 text-sm">Inventario de productos cargados para tu negocio.</p>
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          <button
            type="button"
            onClick={cargarProductos}
            className="bg-[#004284] hover:bg-blue-800 text-white text-xs font-bold uppercase px-4 py-2 rounded transition"
          >
            ↻ Actualizar
          </button>
          <button
            type="button"
            onClick={() => setMostrarFiltros((prev) => !prev)}
            className="border border-gray-200 hover:border-gray-300 text-gray-700 text-xs font-bold uppercase px-4 py-2 rounded transition"
          >
            {mostrarFiltros ? 'Ocultar filtros' : 'Mostrar filtros'}
          </button>
        </div>
      </div>

      {mostrarFiltros && (
        <div className="bg-white rounded-lg shadow-sm p-4 mb-4">
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
            <div>
              <label className="block text-xs font-bold text-gray-500 mb-1">Buscar producto</label>
              <input
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                placeholder="Nombre, SKU, marca, categoría..."
                className="w-full border border-gray-200 rounded px-3 py-2 text-sm outline-none focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-500 mb-1">Marca</label>
              <select
                value={filtroMarca}
                onChange={(e) => setFiltroMarca(e.target.value)}
                className="w-full border border-gray-200 rounded px-3 py-2 text-sm outline-none focus:border-blue-500"
              >
                <option value="">Todas</option>
                {marcas.map((marca) => (
                  <option key={marca} value={marca}>{marca}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-500 mb-1">Categoría</label>
              <select
                value={filtroCategoria}
                onChange={(e) => setFiltroCategoria(e.target.value)}
                className="w-full border border-gray-200 rounded px-3 py-2 text-sm outline-none focus:border-blue-500"
              >
                <option value="">Todas</option>
                {categorias.map((categoria) => (
                  <option key={categoria} value={categoria}>{categoria}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-500 mb-1">Unidad</label>
              <select
                value={filtroUnidad}
                onChange={(e) => setFiltroUnidad(e.target.value)}
                className="w-full border border-gray-200 rounded px-3 py-2 text-sm outline-none focus:border-blue-500"
              >
                <option value="">Todas</option>
                {unidades.map((unidad) => (
                  <option key={unidad} value={unidad}>{unidad}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-3 items-center">
            <button
              type="button"
              onClick={() => {
                setBusqueda('');
                setFiltroMarca('');
                setFiltroCategoria('');
                setFiltroUnidad('');
              }}
              className="text-xs font-bold text-orange-600 hover:text-orange-700 border border-orange-200 rounded px-3 py-2"
            >
              ✕ Limpiar filtros
            </button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
        <div className="bg-white rounded-lg shadow-sm p-4">
          <p className="text-xs uppercase tracking-[0.2em] text-gray-400">Productos</p>
          <p className="mt-2 text-2xl font-bold text-gray-800">{totalProductos}</p>
        </div>
        <div className="bg-white rounded-lg shadow-sm p-4">
          <p className="text-xs uppercase tracking-[0.2em] text-gray-400">Stock total</p>
          <p className="mt-2 text-2xl font-bold text-gray-800">{formatNumero(totalStock)}</p>
        </div>
        <div className="bg-white rounded-lg shadow-sm p-4">
          <p className="text-xs uppercase tracking-[0.2em] text-gray-400">Valor inventario</p>
          <p className="mt-2 text-2xl font-bold text-gray-800">{formatGs(valorInventario)}</p>
        </div>
        <div className="bg-white rounded-lg shadow-sm p-4">
          <p className="text-xs uppercase tracking-[0.2em] text-gray-400">Sin stock</p>
          <p className="mt-2 text-2xl font-bold text-gray-800">{productosSinStock}</p>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-sm overflow-x-auto">
        <table className="w-full text-left text-sm border-collapse">
          <thead>
            <tr className="bg-gray-50 text-gray-600 border-b">
              <th className="p-3 w-16 text-center">Imagen</th>
              <th className="p-3">Producto</th>
              <th className="p-3">SKU</th>
              <th className="p-3">Marca</th>
              <th className="p-3">Categoría</th>
              <th className="p-3">Unidad</th>
              <th className="p-3 text-right">Stock</th>
              <th className="p-3 text-right">Precio compra</th>
              <th className="p-3 text-right">Precio venta</th>
              <th className="p-3 text-right">Alerta</th>
              <th className="p-3">Administra stock</th>
            </tr>
          </thead>
          <tbody>
            {cargando ? (
              <tr>
                <td colSpan="11" className="p-8 text-center text-gray-500">Cargando productos...</td>
              </tr>
            ) : productosPagina.length === 0 ? (
              <tr>
                <td colSpan="11" className="p-8 text-center text-gray-500">No se encontraron productos.</td>
              </tr>
            ) : (
              productosPagina.map((producto) => (
                <tr key={producto.id} className="border-b hover:bg-gray-50">
                  <td className="p-3 text-center">
                    {producto.imagen_url ? (
                      <img
                        src={producto.imagen_url}
                        alt={producto.nombre}
                        className="w-10 h-10 rounded-lg object-cover border border-gray-200 inline-block"
                      />
                    ) : (
                      <span className="inline-flex items-center justify-center w-10 h-10 rounded-lg bg-gray-100 text-gray-400 text-lg">📦</span>
                    )}
                  </td>
                  <td className="p-3 font-medium text-gray-800">{producto.nombre || 'Producto sin nombre'}</td>
                  <td className="p-3 text-gray-500">{textoSeguro(producto.codigo)}</td>
                  <td className="p-3 text-gray-500">{textoSeguro(producto.marca)}</td>
                  <td className="p-3 text-gray-500">{textoSeguro(producto.categoria)}</td>
                  <td className="p-3 text-gray-500">{textoSeguro(producto.unidad)}</td>
                  <td className={`p-3 text-right font-semibold ${Number(producto.stock_actual || 0) <= Number(producto.alerta_stock_bajo || 0) ? 'text-red-600' : 'text-gray-800'}`}>
                    {formatNumero(producto.stock_actual)}
                  </td>
                  <td className="p-3 text-right text-gray-700">{formatGs(producto.precio_compra)}</td>
                  <td className="p-3 text-right text-gray-700">{formatGs(producto.precio_venta)}</td>
                  <td className="p-3 text-right text-gray-500">{textoSeguro(producto.alerta_stock_bajo)}</td>
                  <td className="p-3 text-gray-500">{producto.administra_stock ? 'Sí' : 'No'}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap justify-between items-center gap-3 p-4 text-xs text-gray-500 font-medium">
        <span>
          Mostrando {productosPagina.length === 0 ? 0 : (paginaSegura - 1) * entradasPorPagina + 1} a {Math.min(paginaSegura * entradasPorPagina, productosFiltrados.length)} de {productosFiltrados.length} productos
        </span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={paginaSegura === 1}
            onClick={() => setPaginaActual((prev) => Math.max(1, prev - 1))}
            className="border rounded px-3 py-1 disabled:opacity-40 hover:bg-gray-50"
          >
            Anterior
          </button>
          <span className="bg-[#004284] text-white rounded px-3 py-1">{paginaSegura}</span>
          <button
            type="button"
            disabled={paginaSegura === totalPaginas}
            onClick={() => setPaginaActual((prev) => Math.min(totalPaginas, prev + 1))}
            className="border rounded px-3 py-1 disabled:opacity-40 hover:bg-gray-50"
          >
            Siguiente
          </button>
        </div>
      </div>
    </div>
  );
}
