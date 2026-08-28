import { useState } from 'react';
import { Package, ShoppingCart, User, LogOut } from 'lucide-react';
import CatalogoMovil from './components/ClienteMovil/CatalogoMovil';
import CarritoMovil from './components/ClienteMovil/CarritoMovil';
import PerfilMovil from './components/ClienteMovil/PerfilMovil';
import { supabase } from './supabaseClient';

/**
 * InterfazClienteMovil - Interfaz simplificada para clientes en móvil/tablet
 * Muestra: Catálogo, Carrito, Perfil
 * NO muestra: Sistema de administración, reportes, menú complejo
 */
export default function InterfazClienteMovil({ session }) {
  const [vistaActiva, setVistaActiva] = useState('catalogo');
  const [carrito, setCarrito] = useState([]);
  const [datosCliente, setDatosCliente] = useState({
    nombre: session?.user?.user_metadata?.full_name || 'Cliente',
    email: session?.user?.email || '',
    telefono: session?.user?.user_metadata?.phone || '',
    direccion: session?.user?.user_metadata?.address || '',
  });

  // Agregar producto al carrito
  const handleAgregarAlCarrito = (producto) => {
    setCarrito((prevCarrito) => {
      const itemExistente = prevCarrito.find((item) => item.id === producto.id);
      
      if (itemExistente) {
        // Si existe, aumentar cantidad
        return prevCarrito.map((item) =>
          item.id === producto.id
            ? { ...item, cantidad: item.cantidad + 1 }
            : item
        );
      } else {
        // Si no existe, agregar nuevo
        return [...prevCarrito, { ...producto, cantidad: 1 }];
      }
    });

    // Cambiar a carrito para que el cliente vea que se agregó
    setVistaActiva('carrito');
  };

  // Actualizar cantidad de item
  const handleActualizarCantidad = (productoId, nuevaCantidad) => {
    if (nuevaCantidad <= 0) {
      handleEliminarItem(productoId);
    } else {
      setCarrito((prevCarrito) =>
        prevCarrito.map((item) =>
          item.id === productoId ? { ...item, cantidad: nuevaCantidad } : item
        )
      );
    }
  };

  // Eliminar item del carrito
  const handleEliminarItem = (productoId) => {
    setCarrito((prevCarrito) => prevCarrito.filter((item) => item.id !== productoId));
  };

  // Procesar pago
  const handleProcesarPago = async () => {
    if (carrito.length === 0) {
      alert('El carrito está vacío');
      return;
    }

    // Aquí iría la lógica de pago (Stripe, PayPal, etc.)
    alert(`Total a pagar: $${carrito.reduce((sum, item) => sum + item.precio * item.cantidad, 0).toFixed(2)}`);
  };

  // Cerrar sesión
  const handleCerrarSesion = async () => {
    await supabase.auth.signOut();
    window.location.href = '/';
  };

  return (
    <div className="h-screen flex flex-col bg-gray-50">
      {/* CABECERA */}
      <header className="bg-gradient-to-r from-orange-600 to-orange-500 text-white shadow-lg sticky top-0 z-20">
        <div className="px-4 py-4">
          <h1 className="text-2xl font-black text-center">Tu Tienda</h1>
          <p className="text-orange-100 text-xs text-center mt-0.5">Compra fácil desde tu móvil</p>
        </div>
      </header>

      {/* CONTENIDO PRINCIPAL */}
      <main className="flex-1 overflow-hidden px-4 py-4">
        {/* CATALOGO */}
        {vistaActiva === 'catalogo' && (
          <CatalogoMovil onAgregarAlCarrito={handleAgregarAlCarrito} />
        )}

        {/* CARRITO */}
        {vistaActiva === 'carrito' && (
          <CarritoMovil
            carrito={carrito}
            onActualizarCantidad={handleActualizarCantidad}
            onEliminarItem={handleEliminarItem}
            onProcesarPago={handleProcesarPago}
          />
        )}

        {/* PERFIL */}
        {vistaActiva === 'perfil' && (
          <PerfilMovil
            datosCliente={datosCliente}
            onCerrarSesion={handleCerrarSesion}
            comprasHistorico={[]}
          />
        )}
      </main>

      {/* BARRA DE NAVEGACIÓN INFERIOR */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 h-16 flex justify-around items-center z-20 px-4">
        {/* CATÁLOGO */}
        <button
          onClick={() => setVistaActiva('catalogo')}
          className={`flex flex-col items-center justify-center gap-1 flex-1 py-2 px-2 rounded-xl transition-all ${
            vistaActiva === 'catalogo'
              ? 'bg-orange-100 text-orange-600 font-bold'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          <Package size={22} />
          <span className="text-[10px] font-bold">Comprar</span>
        </button>

        {/* CARRITO CON CONTADOR */}
        <button
          onClick={() => setVistaActiva('carrito')}
          className={`flex flex-col items-center justify-center gap-1 flex-1 py-2 px-2 rounded-xl transition-all relative ${
            vistaActiva === 'carrito'
              ? 'bg-orange-100 text-orange-600 font-bold'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          <ShoppingCart size={22} />
          {carrito.length > 0 && (
            <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[9px] font-black w-5 h-5 rounded-full flex items-center justify-center">
              {carrito.length}
            </span>
          )}
          <span className="text-[10px] font-bold">Carrito</span>
        </button>

        {/* PERFIL */}
        <button
          onClick={() => setVistaActiva('perfil')}
          className={`flex flex-col items-center justify-center gap-1 flex-1 py-2 px-2 rounded-xl transition-all ${
            vistaActiva === 'perfil'
              ? 'bg-orange-100 text-orange-600 font-bold'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          <User size={22} />
          <span className="text-[10px] font-bold">Perfil</span>
        </button>
      </nav>

      {/* ESPACIO PARA LA BARRA INFERIOR */}
      <div className="h-16"></div>
    </div>
  );
}
