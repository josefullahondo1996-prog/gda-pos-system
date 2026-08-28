import { Trash2, Plus, Minus, ShoppingCart } from 'lucide-react';

/**
 * CarritoMovil - Carrito de compras simplificado para móvil
 * Muestra items del carrito con opciones de cantidad y eliminación
 */
export default function CarritoMovil({ carrito = [], onActualizarCantidad, onEliminarItem, onProcesarPago }) {
  const total = carrito.reduce((sum, item) => sum + item.precio * item.cantidad, 0);

  return (
    <div className="flex flex-col gap-4 h-full">
      {/* SIN ITEMS */}
      {carrito.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-4">
          <ShoppingCart size={64} className="text-gray-300" />
          <div className="text-center">
            <h3 className="text-lg font-bold text-gray-800 mb-1">Carrito vacío</h3>
            <p className="text-gray-500 text-sm">Agrega productos para continuar</p>
          </div>
        </div>
      ) : (
        <>
          {/* LISTADO DE ITEMS */}
          <div className="flex-1 overflow-y-auto space-y-2">
            {carrito.map((item) => (
              <div
                key={item.id}
                className="bg-white rounded-lg border border-gray-200 p-3 flex gap-3"
              >
                {/* IMAGEN */}
                <div className="w-16 h-16 bg-orange-100 rounded flex items-center justify-center flex-shrink-0">
                  {item.imagen ? (
                    <img
                      src={item.imagen}
                      alt={item.nombre}
                      className="w-full h-full object-cover rounded"
                    />
                  ) : (
                    <ShoppingCart size={24} className="text-orange-400" />
                  )}
                </div>

                {/* INFO */}
                <div className="flex-1 flex flex-col gap-1">
                  <h4 className="font-bold text-sm text-gray-800">{item.nombre}</h4>
                  <p className="text-orange-600 font-bold">
                    ${parseFloat(item.precio).toFixed(2)}
                  </p>

                  {/* CONTROLES CANTIDAD */}
                  <div className="flex items-center gap-2 mt-1">
                    <button
                      onClick={() => onActualizarCantidad(item.id, Math.max(1, item.cantidad - 1))}
                      className="bg-gray-200 hover:bg-gray-300 rounded p-1 transition-colors"
                    >
                      <Minus size={14} />
                    </button>
                    <span className="text-sm font-bold w-6 text-center">{item.cantidad}</span>
                    <button
                      onClick={() => onActualizarCantidad(item.id, item.cantidad + 1)}
                      className="bg-gray-200 hover:bg-gray-300 rounded p-1 transition-colors"
                    >
                      <Plus size={14} />
                    </button>
                  </div>
                </div>

                {/* ELIMINAR */}
                <button
                  onClick={() => onEliminarItem(item.id)}
                  className="text-red-500 hover:text-red-700 transition-colors p-2"
                >
                  <Trash2 size={18} />
                </button>
              </div>
            ))}
          </div>

          {/* RESUMEN Y PAGO */}
          <div className="border-t border-gray-200 pt-3 space-y-3">
            {/* SUBTOTAL */}
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Subtotal:</span>
              <span className="font-bold">${total.toFixed(2)}</span>
            </div>

            {/* TOTAL */}
            <div className="flex justify-between text-lg border-t border-gray-200 pt-3">
              <span className="font-bold text-gray-800">Total:</span>
              <span className="font-bold text-orange-600 text-xl">${total.toFixed(2)}</span>
            </div>

            {/* BOTÓN PAGAR */}
            <button
              onClick={onProcesarPago}
              disabled={carrito.length === 0}
              className="w-full bg-orange-600 hover:bg-orange-700 disabled:bg-gray-300 text-white font-bold py-3 rounded-lg transition-colors"
            >
              Procesar Pago
            </button>
          </div>
        </>
      )}
    </div>
  );
}
