import AgregarProducto from './AgregarProducto';
import DetalleProducto from './utils/DetalleProducto';
import { useEffect, useState } from 'react';
import { supabase } from './supabaseClient';
import { useEmpresaInfo } from './utils/useEmpresa';
import { useUbicacionUsuario } from './utils/useUbicacion';
import { useSucursalActiva } from './utils/SucursalContext';
import { cargarMapaStockPorUbicacion } from './utils/stockUbicacion';

export default function ListaProductos() {
  const { id: empresaId, nombre: nombreEmpresa } = useEmpresaInfo();
  const { nombre: nombreUbicacionUsuario, ve_todas: usuarioVeTodas } = useUbicacionUsuario();
  // sucursalActiva: la elegida en el selector global del header.
  // Si el usuario está fijo a una sola sucursal, el contexto ya la deja bloqueada acá también.
  const { sucursalActiva, nombreSucursalActiva } = useSucursalActiva();
  const [mapaStockUbicacion, setMapaStockUbicacion] = useState({});
  const [productos, setProductos] = useState([]);
  const [busqueda, setBusqueda] = useState('');

  // Estados para los Filtros Superiores (igual que antes)
  const [filtroCategoria, setFiltroCategoria] = useState('Todos');
  const [filtroMarca, setFiltroMarca] = useState('Todos');

  // Estados nuevos para la estructura tipo CDEpos
  const [tabActiva, setTabActiva] = useState('todos');
  const [seleccionados, setSeleccionados] = useState([]);
  const [accionAbierta, setAccionAbierta] = useState(null);
  const [paginaActual, setPaginaActual] = useState(1);
  const [porPagina, setPorPagina] = useState(25);
  const [mostrarFormularioNuevo, setMostrarFormularioNuevo] = useState(false);
  const [productoEditando, setProductoEditando] = useState(null);
  const [productoDetalle, setProductoDetalle] = useState(null);

  useEffect(() => {
    cargarProductos();
  }, []);

  const cargarProductos = async () => {
    let query = supabase
      .from('productos')
      .select('*')
      .order('nombre', { ascending: true });

    if (empresaId) query = query.eq('empresa_id', empresaId);

    const { data, error } = await query;

    if (!error && data) setProductos(data);
  };

  useEffect(() => {
    if (!empresaId) return;
    cargarMapaStockPorUbicacion(empresaId).then(setMapaStockUbicacion);
  }, [empresaId, productos.length]);

  // Filtrado en tiempo real (Buscador + Selects) — misma lógica que ya tenías
  const productosFiltrados = productos.filter(p => {
    const coincideBusqueda = p.nombre.toLowerCase().includes(busqueda.toLowerCase()) ||
      (p.codigo && p.codigo.toLowerCase().includes(busqueda.toLowerCase()));
    const coincideCategoria = filtroCategoria === 'Todos' || p.categoria === filtroCategoria;
    const coincideMarca = filtroMarca === 'Todos' || p.marca === filtroMarca;
    const coincideTab = tabActiva === 'todos' || (tabActiva === 'stock' && Number(p.stock_actual) <= Number(p.alerta_stock_bajo || 5));

    return coincideBusqueda && coincideCategoria && coincideMarca && coincideTab;
  });

  // Paginación (client-side, sobre el resultado ya filtrado)
  const totalPaginas = Math.max(1, Math.ceil(productosFiltrados.length / porPagina));
  const paginaSegura = Math.min(paginaActual, totalPaginas);
  const productosPagina = productosFiltrados.slice((paginaSegura - 1) * porPagina, paginaSegura * porPagina);

  useEffect(() => {
    setPaginaActual(1);
  }, [busqueda, filtroCategoria, filtroMarca, tabActiva, porPagina]);

  const todosSeleccionadosEnPagina = productosPagina.length > 0 && productosPagina.every((p) => seleccionados.includes(p.id));

  const toggleSeleccionarTodos = () => {
    if (todosSeleccionadosEnPagina) {
      setSeleccionados(seleccionados.filter((id) => !productosPagina.some((p) => p.id === id)));
    } else {
      const nuevos = productosPagina.map((p) => p.id).filter((id) => !seleccionados.includes(id));
      setSeleccionados([...seleccionados, ...nuevos]);
    }
  };

  const toggleSeleccionarUno = (id) => {
    setSeleccionados(seleccionados.includes(id) ? seleccionados.filter((x) => x !== id) : [...seleccionados, id]);
  };

  const eliminarProducto = async (id) => {
    if (!window.confirm('¿Eliminar este producto? Esta acción no se puede deshacer.')) return;
    const { error } = await supabase.from('productos').delete().eq('id', id).eq('empresa_id', empresaId);
    if (error) return alert('Error al eliminar: ' + error.message);
    setProductos(productos.filter((p) => p.id !== id));
    setSeleccionados(seleccionados.filter((x) => x !== id));
    setAccionAbierta(null);
  };

  const eliminarSeleccionados = async () => {
    if (seleccionados.length === 0) return alert('Seleccioná al menos un producto.');
    if (!window.confirm(`¿Eliminar ${seleccionados.length} producto(s) seleccionado(s)?`)) return;
    const { error } = await supabase.from('productos').delete().in('id', seleccionados).eq('empresa_id', empresaId);
    if (error) return alert('Error al eliminar: ' + error.message);
    setProductos(productos.filter((p) => !seleccionados.includes(p.id)));
    setSeleccionados([]);
  };

  const exportarCSV = () => {
    const filas = [
      ['Producto', 'Ubicación', 'Precio Compra', 'Precio Venta', 'Stock', 'Categoría', 'Marca', 'IVA', 'SKU'],
      ...productosFiltrados.map((p) => [
        p.nombre, nombreEmpresa, p.precio_compra || 0, p.precio_venta || 0,
        p.stock_actual || 0, p.categoria || '', p.marca || '', p.iva || 'IVA 10%', p.codigo || '',
      ]),
    ];
    const csv = filas.map((f) => f.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'productos.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  if (mostrarFormularioNuevo) {
    return (
      <AgregarProducto
        productoEditar={productoEditando}
        onGuardado={() => {
          setMostrarFormularioNuevo(false);
          setProductoEditando(null);
          cargarProductos();
        }}
        onCancelar={() => {
          setMostrarFormularioNuevo(false);
          setProductoEditando(null);
        }}
      />
    );
  }

  return (
    <div className="bg-transparent text-sm text-gray-700">

      {/* 1. SECCIÓN DE FILTROS AVANZADOS (igual que antes) */}
      <div className="bg-white p-4 rounded-lg shadow-sm border-t-2 border-[#004284] mb-4">
        <h3 className="text-xs font-bold text-gray-500 mb-3 uppercase tracking-wider">🔻 Filtros</h3>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <label className="block text-xs font-bold text-gray-500 mb-1">Categoría:</label>
            <select className="w-full border rounded p-1.5 bg-white" value={filtroCategoria} onChange={(e) => setFiltroCategoria(e.target.value)}>
              <option value="Todos">(Todos)</option>
              <option value="Bateria">Bateria</option>
              <option value="Motor y Componentes Internos">Motor y Componentes Internos</option>
              <option value="Sistema de Frenos">Sistema de Frenos</option>
              <option value="Suspensión y Dirección">Suspensión y Dirección</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-500 mb-1">Marca:</label>
            <select className="w-full border rounded p-1.5 bg-white" value={filtroMarca} onChange={(e) => setFiltroMarca(e.target.value)}>
              <option value="Todos">(Todos)</option>
              <option value="NAKAMOTO">NAKAMOTO</option>
              <option value="Michelin">Michelin</option>
              <option value="SNG">SNG</option>
              <option value="Cral">Cral</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-500 mb-1">IVA:</label>
            <select className="w-full border rounded p-1.5 bg-white"><option>(Todos)</option></select>
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-500 mb-1">Ubicación de la empresa:</label>
            <select className="w-full border rounded p-1.5 bg-white"><option>{nombreEmpresa}</option></select>
          </div>
        </div>
      </div>

      {/* 2. TABS: TODOS LOS PRODUCTOS / INVENTARIO-STOCK */}
      <div className="bg-white rounded-lg shadow-sm border-t-2 border-[#004284]">
        <div className="flex gap-1 px-4 pt-3 border-b border-gray-100">
          <button
            onClick={() => setTabActiva('todos')}
            className={`px-4 py-2 text-xs font-bold border-b-2 transition-colors ${tabActiva === 'todos' ? 'border-[#004284] text-[#004284]' : 'border-transparent text-gray-400 hover:text-gray-600'
              }`}
          >
            🐾 Todos los productos
          </button>
          <button
            onClick={() => setTabActiva('stock')}
            className={`px-4 py-2 text-xs font-bold border-b-2 transition-colors ${tabActiva === 'stock' ? 'border-[#004284] text-[#004284]' : 'border-transparent text-gray-400 hover:text-gray-600'
              }`}
          >
            📊 Inventario / Stock
          </button>
        </div>

        <div className="p-4">
          {/* Barra de Acciones Superiores */}
          <div className="flex flex-wrap justify-between items-center gap-3 mb-4">
            <div className="flex gap-1 flex-wrap items-center">
              <button onClick={exportarCSV} className="bg-gray-100 border text-gray-600 px-2.5 py-1 rounded text-xs font-semibold hover:bg-gray-200">📄 Exportar a CSV</button>
              <button onClick={() => window.print()} className="bg-gray-100 border text-gray-600 px-2.5 py-1 rounded text-xs font-semibold hover:bg-gray-200">🖨️ Imprimir</button>
              <select value={porPagina} onChange={(e) => setPorPagina(Number(e.target.value))} className="border rounded p-1.5 text-xs font-semibold bg-white ml-2">
                <option value={10}>Mostrar 10</option>
                <option value={25}>Mostrar 25</option>
                <option value={50}>Mostrar 50</option>
                <option value={100}>Mostrar 100</option>
              </select>
            </div>

            <div className="flex items-center gap-3">
              <input
                type="text"
                className="border rounded p-1.5 w-64 outline-none focus:border-blue-500"
                placeholder="Buscar por nombre o SKU..."
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
              />
              <button
                onClick={() => setMostrarFormularioNuevo(true)}
                className="bg-orange-500 hover:bg-orange-600 text-white font-bold px-3 py-1.5 rounded text-xs whitespace-nowrap"
              >
                + Añadir
              </button>
            </div>
          </div>

          {/* 3. TABLA PRINCIPAL */}
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50 text-gray-600 font-bold uppercase">
                  <th className="p-3 w-8">
                    <input type="checkbox" checked={todosSeleccionadosEnPagina} onChange={toggleSeleccionarTodos} />
                  </th>
                  <th className="p-3 w-14">Imagen</th>
                  <th className="p-3 w-24">Acción</th>
                  <th className="p-3">Producto</th>
                  <th className="p-3">Ubicación de la Empresa</th>
                  <th className="p-3 text-right">Precio Compra Unitario</th>
                  <th className="p-3 text-right">Precio de Venta</th>
                  <th className="p-3 text-center">Stock Actual</th>
                  <th className="p-3">Categoría</th>
                  <th className="p-3">Marca</th>
                  <th className="p-3">IVA</th>
                  <th className="p-3">SKU / Código Barra</th>
                </tr>
              </thead>
              <tbody>
                {productosPagina.length === 0 ? (
                  <tr>
                    <td colSpan="11" className="text-center py-8 text-gray-400 font-medium">
                      Ningún producto coincide con los criterios de búsqueda.
                    </td>
                  </tr>
                ) : (
                  productosPagina.map((prod) => (
                    <tr key={prod.id} className="border-b hover:bg-gray-50 text-gray-700 font-medium">
                      <td className="p-3">
                        <input type="checkbox" checked={seleccionados.includes(prod.id)} onChange={() => toggleSeleccionarUno(prod.id)} />
                      </td>
                      <td className="p-3">
                        {prod.imagen_url ? (
                          <img
                            src={prod.imagen_url}
                            alt={prod.nombre}
                            onClick={() => setProductoDetalle(prod)}
                            className="w-9 h-9 rounded object-cover border border-gray-200 cursor-pointer hover:ring-2 hover:ring-orange-400 transition-all"
                          />
                        ) : (
                          <button
                            onClick={() => setProductoDetalle(prod)}
                            className="w-9 h-9 rounded bg-gray-50 border border-gray-200 flex items-center justify-center text-gray-300 hover:border-orange-400 hover:text-orange-400 transition-colors"
                            title="Ver detalle del producto"
                          >
                            🖼️
                          </button>
                        )}
                      </td>
                      <td className="p-3 relative">
                        <button
                          onClick={() => setAccionAbierta(accionAbierta === prod.id ? null : prod.id)}
                          className="bg-[#17a2b8] text-white px-2 py-1 rounded text-[11px] font-bold flex items-center gap-1"
                        >
                          Acciones <span className="text-[9px]">▼</span>
                        </button>
                        {accionAbierta === prod.id && (
                          <div className="absolute z-20 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg w-36 py-1">
                            <button
                              onClick={() => {
                                setProductoEditando(prod);
                                setMostrarFormularioNuevo(true);
                                setAccionAbierta(null);
                              }}
                              className="w-full text-left px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50"
                            >
                              ✏️ Editar
                            </button>
                            <button
                              onClick={() => eliminarProducto(prod.id)}
                              className="w-full text-left px-3 py-1.5 text-xs text-red-600 hover:bg-red-50"
                            >
                              🗑️ Eliminar
                            </button>
                          </div>
                        )}
                      </td>
                      <td className="p-3 font-bold text-gray-900">{prod.nombre}</td>
                      <td className="p-3 text-gray-500">{!usuarioVeTodas && nombreUbicacionUsuario ? nombreUbicacionUsuario : nombreEmpresa}</td>
                      <td className="p-3 text-right font-semibold text-gray-600">
                        {prod.precio_compra ? `${Number(prod.precio_compra).toLocaleString('es-PY')} Gs` : '0 Gs'}
                      </td>
                      <td className="p-3 text-right font-bold text-gray-800">
                        {Number(prod.precio_venta || 0).toLocaleString('es-PY')} Gs
                      </td>
                      <td className="p-3 text-center">
                        <span className={`px-2 py-0.5 rounded-sm font-bold text-[11px] ${Number(prod.stock_actual) <= Number(prod.alerta_stock_bajo || 5) ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-700'}`}>
                          {prod.stock_actual ?? 0} UNID
                        </span>
                        {sucursalActiva && (
                          <div className="text-[10px] text-gray-400 mt-1">
                            En {nombreSucursalActiva}: <span className="font-bold text-gray-600">{mapaStockUbicacion[prod.id]?.[sucursalActiva] ?? 0} UNID</span>
                          </div>
                        )}
                      </td>
                      <td className="p-3 text-gray-500">{prod.categoria || '—'}</td>
                      <td className="p-3 text-gray-600 font-semibold">{prod.marca || '—'}</td>
                      <td className="p-3 text-gray-500">{prod.iva || 'IVA 10%'}</td>
                      <td className="p-3 font-mono text-gray-600 font-bold">{prod.codigo || '—'}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Barra de acciones masivas */}
          {seleccionados.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-4">
              <button onClick={eliminarSeleccionados} className="bg-red-600 hover:bg-red-700 text-white text-xs font-bold px-3 py-1.5 rounded">
                Eliminar seleccionados ({seleccionados.length})
              </button>
              <button onClick={() => alert('Función en construcción')} className="bg-gray-600 hover:bg-gray-700 text-white text-xs font-bold px-3 py-1.5 rounded">
                Desactivar seleccionados
              </button>
            </div>
          )}

          {/* Footer: entradas + paginación */}
          <div className="flex flex-wrap justify-between items-center mt-4 gap-2">
            <div className="text-xs font-bold text-gray-500">
              Mostrando {productosPagina.length === 0 ? 0 : (paginaSegura - 1) * porPagina + 1} a {(paginaSegura - 1) * porPagina + productosPagina.length} de {productosFiltrados.length} entradas
            </div>
            <div className="flex gap-1">
              <button
                onClick={() => setPaginaActual((p) => Math.max(1, p - 1))}
                disabled={paginaSegura === 1}
                className="px-3 py-1 text-xs font-bold border rounded disabled:opacity-40 hover:bg-gray-50"
              >
                Anterior
              </button>
              {Array.from({ length: totalPaginas }, (_, i) => i + 1)
                .filter((n) => n === 1 || n === totalPaginas || Math.abs(n - paginaSegura) <= 1)
                .reduce((acc, n, i, arr) => {
                  if (i > 0 && n - arr[i - 1] > 1) acc.push('...');
                  acc.push(n);
                  return acc;
                }, [])
                .map((n, i) =>
                  n === '...' ? (
                    <span key={`dots-${i}`} className="px-2 py-1 text-xs text-gray-400">...</span>
                  ) : (
                    <button
                      key={n}
                      onClick={() => setPaginaActual(n)}
                      className={`px-3 py-1 text-xs font-bold border rounded ${n === paginaSegura ? 'bg-[#004284] text-white border-[#004284]' : 'hover:bg-gray-50'}`}
                    >
                      {n}
                    </button>
                  )
                )}
              <button
                onClick={() => setPaginaActual((p) => Math.min(totalPaginas, p + 1))}
                disabled={paginaSegura === totalPaginas}
                className="px-3 py-1 text-xs font-bold border rounded disabled:opacity-40 hover:bg-gray-50"
              >
                Siguiente
              </button>
            </div>
          </div>
        </div>
      </div>
      {productoDetalle && (
        <DetalleProducto producto={productoDetalle} onClose={() => setProductoDetalle(null)} />
      )}
    </div>
  );
}