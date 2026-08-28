import { useState } from 'react';
import {
  Package,
  ShoppingCart,
  User,
  LogOut,
  Menu,
  Bell,
  ArrowRightLeft,
  BarChart3,
  Settings,
  Headset,
  Home,
  ReceiptText,
  CircleDollarSign,
  ChevronRight,
  Store,
  Wallet,
  Boxes,
} from 'lucide-react';
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
  const [menuAbierto, setMenuAbierto] = useState(false);
  const [carrito, setCarrito] = useState([]);
  const [datosCliente, setDatosCliente] = useState({
    nombre: session?.user?.user_metadata?.full_name || 'Cliente',
    email: session?.user?.email || '',
    telefono: session?.user?.user_metadata?.phone || '',
    direccion: session?.user?.user_metadata?.address || '',
  });

  const menuItems = [
    { id: 'catalogo', label: 'Comprar', icon: Store },
    { id: 'carrito', label: 'Carrito', icon: ShoppingCart },
    { id: 'perfil', label: 'Perfil', icon: User },
    { id: 'resumen', label: 'Resumen', icon: BarChart3 },
    { id: 'pagos', label: 'Pagos', icon: Wallet },
    { id: 'pedidos', label: 'Pedidos', icon: ReceiptText },
    { id: 'stock', label: 'Stock', icon: Boxes },
  ];

  const handleMenuSelect = (id) => {
    if (id === 'resumen' || id === 'pagos' || id === 'pedidos' || id === 'stock') {
      setVistaActiva('catalogo');
    } else {
      setVistaActiva(id);
    }
    setMenuAbierto(false);
  };

  // Agregar producto al carrito
  const handleAgregarAlCarrito = (producto) => {
    setCarrito((prevCarrito) => {
      const itemExistente = prevCarrito.find((item) => item.id === producto.id);

      if (itemExistente) {
        return prevCarrito.map((item) =>
          item.id === producto.id
            ? { ...item, cantidad: item.cantidad + 1 }
            : item
        );
      }

      return [...prevCarrito, { ...producto, cantidad: 1 }];
    });

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

    alert(`Total a pagar: $${carrito.reduce((sum, item) => sum + item.precio * item.cantidad, 0).toFixed(2)}`);
  };

  // Cerrar sesión
  const handleCerrarSesion = async () => {
    await supabase.auth.signOut();
    window.location.href = '/';
  };

  return (
    <div className="h-screen flex flex-col bg-[#f5f1ee] text-slate-900 overflow-hidden">
      <header className="bg-[#f5f1ee] border-b border-gray-200 sticky top-0 z-20">
        <div className="px-4 pt-5 pb-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-full bg-gradient-to-br from-orange-500 to-orange-600 text-white font-black text-xl flex items-center justify-center shadow-md">
              {datosCliente?.nombre?.charAt(0)?.toUpperCase() || 'C'}
            </div>
            <div>
              <h1 className="text-2xl font-black tracking-tight text-gray-900">{session?.user?.user_metadata?.full_name || 'Tu Tienda'}</h1>
              <p className="text-xs text-gray-500">CD ePos</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button className="w-11 h-11 rounded-full bg-white border border-gray-200 text-gray-700 flex items-center justify-center shadow-sm hover:bg-gray-50 transition-colors">
              <Bell size={18} />
            </button>
            <button
              onClick={() => setMenuAbierto(true)}
              className="w-11 h-11 rounded-full bg-white border border-gray-200 text-gray-700 flex items-center justify-center shadow-sm hover:bg-gray-50 transition-colors"
              aria-label="Abrir menú"
            >
              <Menu size={20} />
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto px-4 py-4 pb-24">
        {vistaActiva === 'catalogo' && (
          <CatalogoMovil onAgregarAlCarrito={handleAgregarAlCarrito} />
        )}

        {vistaActiva === 'carrito' && (
          <CarritoMovil
            carrito={carrito}
            onActualizarCantidad={handleActualizarCantidad}
            onEliminarItem={handleEliminarItem}
            onProcesarPago={handleProcesarPago}
          />
        )}

        {vistaActiva === 'perfil' && (
          <PerfilMovil
            datosCliente={datosCliente}
            onCerrarSesion={handleCerrarSesion}
            comprasHistorico={[]}
          />
        )}
      </main>

      {menuAbierto && (
        <div
          className="fixed inset-0 z-40 bg-black/35 backdrop-blur-[1px]"
          onClick={() => setMenuAbierto(false)}
        >
          <aside
            className="absolute right-0 top-0 h-full w-[88vw] max-w-[420px] bg-[#f7f3f0] text-gray-900 shadow-2xl border-l border-gray-200 overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-6">
              <div className="flex items-center justify-between pb-4 border-b border-gray-200 mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-full bg-gradient-to-br from-orange-500 to-orange-600 text-white font-black text-xl flex items-center justify-center shadow-md">
                    {datosCliente?.nombre?.charAt(0)?.toUpperCase() || 'C'}
                  </div>
                  <div>
                    <p className="text-2xl font-black text-gray-900">{datosCliente?.nombre || 'Cliente'}</p>
                    <p className="text-xs text-gray-500">{datosCliente?.email || 'cliente@correo.com'}</p>
                  </div>
                </div>
                <button
                  onClick={() => setMenuAbierto(false)}
                  className="w-9 h-9 rounded-full bg-white border border-gray-200 text-gray-700 flex items-center justify-center"
                  aria-label="Cerrar menú"
                >
                  <ChevronRight size={18} />
                </button>
              </div>

              <div className="space-y-2">
                {menuItems.map(({ id, label, icon: Icon }) => {
                  const isActive = vistaActiva === id;

                  return (
                    <button
                      key={id}
                      onClick={() => handleMenuSelect(id)}
                      className={`w-full flex items-center justify-between gap-3 rounded-xl px-4 py-3 text-left transition-all ${
                        isActive
                          ? 'bg-orange-100 text-orange-700 border border-orange-200'
                          : 'text-gray-800 hover:bg-white hover:shadow-sm'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${isActive ? 'bg-orange-500 text-white' : 'bg-white border border-gray-200 text-gray-700'}`}>
                          <Icon size={18} />
                        </div>
                        <span className="text-[1.05rem] font-medium">{label}</span>
                      </div>
                      <ChevronRight size={16} className={isActive ? 'text-orange-600' : 'text-gray-400'} />
                    </button>
                  );
                })}
              </div>

              <div className="mt-6 pt-4 border-t border-gray-200 space-y-3">
                <button className="w-full flex items-center gap-3 rounded-xl px-4 py-3 text-left text-gray-800 hover:bg-white hover:shadow-sm transition-all">
                  <div className="w-10 h-10 rounded-xl bg-white border border-gray-200 flex items-center justify-center text-gray-700">
                    <Settings size={18} />
                  </div>
                  <span className="text-[1.05rem] font-medium">Configuración</span>
                </button>

                <button className="w-full flex items-center gap-3 rounded-xl px-4 py-3 text-left text-gray-800 hover:bg-white hover:shadow-sm transition-all">
                  <div className="w-10 h-10 rounded-xl bg-white border border-gray-200 flex items-center justify-center text-gray-700">
                    <Headset size={18} />
                  </div>
                  <span className="text-[1.05rem] font-medium">Soporte</span>
                </button>

                <button
                  onClick={handleCerrarSesion}
                  className="w-full flex items-center gap-3 rounded-xl px-4 py-3 text-left text-red-600 hover:bg-red-50 transition-all"
                >
                  <div className="w-10 h-10 rounded-xl bg-red-50 border border-red-200 flex items-center justify-center text-red-600">
                    <LogOut size={18} />
                  </div>
                  <span className="text-[1.05rem] font-medium">Cerrar sesión</span>
                </button>
              </div>
            </div>
          </aside>
        </div>
      )}

      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 h-20 flex justify-around items-center z-20 px-4 shadow-[0_-4px_18px_rgba(15,23,42,0.06)]">
        <button
          onClick={() => setVistaActiva('catalogo')}
          className={`flex flex-col items-center justify-center gap-1 flex-1 py-2 px-2 rounded-xl transition-all ${
            vistaActiva === 'catalogo'
              ? 'bg-orange-100 text-orange-600 font-bold'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          <Home size={22} />
          <span className="text-[10px] font-bold">Inicio</span>
        </button>

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
    </div>
  );
}
