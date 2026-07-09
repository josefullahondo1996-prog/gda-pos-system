import { useEffect, useState } from 'react';
import { supabase } from './supabaseClient';

export default function ListaProductos() {
  const [productos, setProductos] = useState([]);
  const [busqueda, setBusqueda] = useState('');
  
  // Estados para los Filtros Superiores
  const [filtroCategoria, setFiltroCategoria] = useState('Todos');
  const [filtroMarca, setFiltroMarca] = useState('Todos');

  useEffect(() => {
    cargarProductos();
  }, []);

  const cargarProductos = async () => {
    const { data, error } = await supabase
      .from('productos')
      .select('*')
      .order('nombre', { ascending: true });

    if (!error && data) setProductos(data);
  };

  // Filtrado en tiempo real (Buscador + Selects)
  const productosFiltrados = productos.filter(p => {
    const coincideBusqueda = p.nombre.toLowerCase().includes(busqueda.toLowerCase()) || 
                             (p.codigo && p.codigo.toLowerCase().includes(busqueda.toLowerCase()));
    const coincideCategoria = filtroCategoria === 'Todos' || p.categoria === filtroCategoria;
    const coincideMarca = filtroMarca === 'Todos' || p.marca === filtroMarca;
    
    return coincideBusqueda && coincideCategoria && coincideMarca;
  });

  return (
    <div className="bg-transparent text-sm text-gray-700">
      
      {/* 1. SECCIÓN DE FILTROS AVANZADOS */}
      <div className="bg-white p-4 rounded-lg shadow-sm border-t-2 border-[#004284] mb-4">
        <h3 className="text-xs font-bold text-gray-500 mb-3 uppercase tracking-wider"> Filtros</h3>
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
            <select className="w-full border rounded p-1.5 bg-white"><option>G.D.A - Repuestos y Servicios</option></select>
          </div>
        </div>
      </div>

      {/* 2. TAB PANEL: TODOS LOS PRODUCTOS */}
      <div className="bg-white rounded-lg shadow-sm border-t-2 border-[#004284] p-4">
        
        {/* Barra de Acciones Superiores */}
        <div className="flex flex-wrap justify-between items-center gap-3 mb-4">
          <div className="flex gap-1 flex-wrap">
            <button className="bg-gray-100 border text-gray-600 px-2.5 py-1 rounded text-xs font-semibold hover:bg-gray-200">📄 Exportar a CSV</button>
            <button className="bg-gray-100 border text-gray-600 px-2.5 py-1 rounded text-xs font-semibold hover:bg-gray-200">📊 Exportar a Excel</button>
            <button className="bg-gray-100 border text-gray-600 px-2.5 py-1 rounded text-xs font-semibold hover:bg-gray-200">🖨️ Imprimir</button>
            <button className="bg-gray-100 border text-gray-600 px-2.5 py-1 rounded text-xs font-semibold hover:bg-gray-200">📕 Exportar a PDF</button>
          </div>
          
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-gray-500">Buscar:</span>
            <input 
              type="text" 
              className="border rounded p-1.5 w-64 outline-none focus:border-blue-500"
              placeholder="Nombre del repuesto o SKU..."
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
            />
          </div>
        </div>

        {/* 3. GRId DE TABLA PRINCIPAL */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50 text-gray-600 font-bold uppercase">
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
              {productosFiltrados.length === 0 ? (
                <tr>
                  <td colSpan="10" className="text-center py-8 text-gray-400 font-medium">
                    Ningún producto coincide con los criterios de búsqueda.
                  </td>
                </tr>
              ) : (
                productosFiltrados.map((prod) => (
                  <tr key={prod.id} className="border-b hover:bg-gray-50 text-gray-700 font-medium">
                    <td className="p-3">
                      <button className="bg-[#17a2b8] text-white px-2 py-1 rounded text-[11px] font-bold flex items-center gap-1">
                        Acciones <span className="text-[9px]">▼</span>
                      </button>
                    </td>
                    <td className="p-3 font-bold text-gray-900">{prod.nombre}</td>
                    <td className="p-3 text-gray-500">G.D.A - Repuestos y Servicios</td>
                    <td className="p-3 text-right font-semibold text-gray-600">
                      {prod.precio_compra ? `${Number(prod.precio_compra).toLocaleString('es-PY')} Gs` : '0 Gs'}
                    </td>
                    <td className="p-3 text-right font-bold text-gray-800">
                      {Number(prod.precio_venta).toLocaleString('es-PY')} Gs
                    </td>
                    <td className="p-3 text-center">
                      <span className={`px-2 py-0.5 rounded-sm font-bold text-[11px] ${prod.stock_actual <= prod.alerta_stock_bajo ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-700'}`}>
                        {prod.stock_actual} UNID
                      </span>
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

        {/* Footer indicador de entradas */}
        <div className="mt-4 text-xs font-bold text-gray-500">
          Mostrando {productosFiltrados.length} de {productos.length} entradas registradas
        </div>

      </div>
    </div>
  );
}