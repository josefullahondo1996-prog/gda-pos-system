import { Search, Package, ShoppingCart } from 'lucide-react';
import { useState, useEffect } from 'react';
import { supabase } from '../../supabaseClient';

/**
 * CatalogoMovil - Catálogo simplificado para clientes en móvil
 * Muestra productos disponibles con búsqueda simple
 */
export default function CatalogoMovil({ onAgregarAlCarrito }) {
  const [productos, setProductos] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [busqueda, setBusqueda] = useState('');
  const [productosFiltrados, setProductosFiltrados] = useState([]);

  // Carga productos desde Supabase (ajusta según tu schema)
  useEffect(() => {
    const cargarProductos = async () => {
      try {
        setCargando(true);
        const { data, error } = await supabase
          .from('productos')
          .select('id, nombre, precio, descripcion, imagen')
          .eq('activo', true)
          .limit(50);

        if (error) throw error;
        
        setProductos(data || []);
        setProductosFiltrados(data || []);
      } catch (error) {
        console.error('Error cargando productos:', error);
        // Mostrar productos de demo si hay error
        setProductos([
          { id: 1, nombre: 'Producto 1', precio: 10.00, descripcion: 'Demo' },
          { id: 2, nombre: 'Producto 2', precio: 15.00, descripcion: 'Demo' },
        ]);
      } finally {
        setCargando(false);
      }
    };

    cargarProductos();
  }, []);

  // Filtra productos por búsqueda
  useEffect(() => {
    if (!busqueda.trim()) {
      setProductosFiltrados(productos);
    } else {
      const filtrados = productos.filter(p =>
        p.nombre.toLowerCase().includes(busqueda.toLowerCase())
      );
      setProductosFiltrados(filtrados);
    }
  }, [busqueda, productos]);

  return (
    <div className="flex flex-col gap-4 h-full">
      {/* BUSCADOR */}
      <div className="flex gap-2 sticky top-0 bg-white z-10">
        <div className="flex-1 relative">
          <Search size={18} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Buscar productos..."
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500"
          />
        </div>
      </div>

      {/* ESTADO DE CARGA */}
      {cargando && (
        <div className="flex justify-center items-center py-8">
          <p className="text-gray-500">Cargando productos...</p>
        </div>
      )}

      {/* SIN RESULTADOS */}
      {!cargando && productosFiltrados.length === 0 && (
        <div className="text-center py-8">
          <Package size={48} className="mx-auto text-gray-300 mb-3" />
          <p className="text-gray-500">No hay productos disponibles</p>
        </div>
      )}

      {/* GRID DE PRODUCTOS */}
      <div className="grid grid-cols-2 gap-3 flex-1 overflow-y-auto">
        {productosFiltrados.map((producto) => (
          <div
            key={producto.id}
            className="bg-white rounded-lg shadow-sm border border-gray-100 overflow-hidden hover:shadow-md transition-shadow"
          >
            {/* IMAGEN PRODUCTO */}
            <div className="w-full h-32 bg-gradient-to-br from-orange-100 to-orange-50 flex items-center justify-center">
              {producto.imagen ? (
                <img
                  src={producto.imagen}
                  alt={producto.nombre}
                  className="w-full h-full object-cover"
                />
              ) : (
                <Package size={40} className="text-orange-300" />
              )}
            </div>

            {/* INFO PRODUCTO */}
            <div className="p-3 flex flex-col gap-2">
              <h3 className="font-bold text-sm text-gray-800 line-clamp-2">
                {producto.nombre}
              </h3>

              <p className="text-orange-600 font-bold text-lg">
                ${parseFloat(producto.precio).toFixed(2)}
              </p>

              {/* BOTÓN AGREGAR */}
              <button
                onClick={() => onAgregarAlCarrito(producto)}
                className="w-full bg-orange-600 hover:bg-orange-700 text-white rounded-lg py-2 text-sm font-bold flex items-center justify-center gap-2 transition-colors"
              >
                <ShoppingCart size={16} />
                Agregar
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
