import { useEffect, useState } from 'react';
import { supabase } from './supabaseClient';
import { useEmpresaInfo } from './utils/useEmpresa';
import { formatearStock } from './utils/cantidadProducto';

export default function Inventario() {
  const { id: empresaId } = useEmpresaInfo();
  const [productos, setProductos] = useState([]);

  useEffect(() => {
    if (empresaId) cargarInventario();
  }, [empresaId]);

  const cargarInventario = async () => {
    if (!empresaId) return;
    const { data, error } = await supabase
      .from('productos')
      .select('*')
      .eq('empresa_id', empresaId)
      .order('nombre', { ascending: true }); // Ordena alfabéticamente

    if (error) {
      console.error('Error al cargar inventario:', error.message);
    } else {
      setProductos(data);
    }
  };

  return (
    <div className="bg-white p-6 rounded-lg shadow-md mt-6">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-bold text-[#004284]">Control de Stock y Alertas</h2>
        <button 
          onClick={cargarInventario}
          className="text-sm bg-blue-100 text-blue-700 px-3 py-1 rounded hover:bg-blue-200"
        >
          ↻ Actualizar
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b-2 text-gray-600 text-sm">
              <th className="pb-2">Producto / Repuesto</th>
              <th className="pb-2">Precio Venta</th>
              <th className="pb-2">Stock Actual</th>
              <th className="pb-2">Límite Alerta</th>
              <th className="pb-2">Estado</th>
            </tr>
          </thead>
          <tbody>
            {productos.length === 0 ? (
              <tr>
                <td colSpan="5" className="text-center py-4 text-gray-500">
                  No hay productos registrados en el inventario.
                </td>
              </tr>
            ) : (
              productos.map((prod) => {
                // Lógica de la alerta: si el stock es menor o igual a la alerta configurada
                const stockCritico = prod.stock_actual <= prod.alerta_stock_bajo;
                
                return (
                  <tr key={prod.id} className="border-b hover:bg-gray-50">
                    <td className="py-3 font-medium">{prod.nombre}</td>
                    <td className="py-3">Gs {Number(prod.precio_venta).toLocaleString('es-PY')}</td>
                    <td className={`py-3 font-bold text-lg ${stockCritico ? 'text-red-600' : 'text-gray-700'}`}>
                      {formatearStock(prod.stock_actual, prod.unidad)}
                    </td>
                    <td className="py-3 text-gray-500">{prod.alerta_stock_bajo}</td>
                    <td className="py-3">
                      {stockCritico ? (
                        <span className="bg-red-100 text-red-700 px-2 py-1 rounded-full text-xs font-bold border border-red-200">
                          ⚠️ STOCK BAJO
                        </span>
                      ) : (
                        <span className="bg-green-100 text-green-700 px-2 py-1 rounded-full text-xs font-bold border border-green-200">
                          Normal
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}