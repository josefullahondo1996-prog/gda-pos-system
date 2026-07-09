import { useState } from 'react';
import { supabase } from './supabaseClient'; 

// 1. IMPORTACIÓN DE TODOS LOS MÓDULOS DEL ERP
import GraficosDashboard from './GraficosDashboard';
import PuntoDeVenta from './PuntoDeVenta';
import ListaProductos from './ListaProductos';
import Catalogo from './Catalogo';
import GestorCompras from './GestorCompras';
import CuentasPorCobrar from './CuentasPorCobrar';
import Clientes from './Clientes';
import AbrirCaja from './AbrirCaja';

export default function Dashboard({ session }) {
  // Estados de navegación y control de caja
  const [vistaActiva, setVistaActiva] = useState('inicio');
  const [menuExpandido, setMenuExpandido] = useState('ventas'); 
  const [cajaActual, setCajaActual] = useState(null); 

  const cerrarSesion = async () => {
    await supabase.auth.signOut();
  };

  // 2. ENRUTADOR DE VISTAS (Aquí se decide qué se dibuja a la derecha)
  const renderizarVista = () => {
    switch (vistaActiva) {
      case 'inicio': 
        return <GraficosDashboard />;
      
      case 'pos': 
        // Validación exclusiva: Si la caja está cerrada, obliga a abrirla antes del POS
        if (!cajaActual) {
          return <AbrirCaja onCajaAbierta={(caja) => setCajaActual(caja)} />;
        }
        return <PuntoDeVenta cajaInfo={cajaActual} />;
        
      case 'catalogo': 
        return <ListaProductos />;
        
      case 'agregar_producto': 
        return <Catalogo />;
        
      case 'compras': 
        return <GestorCompras />;
        
      case 'clientes': 
        return <Clientes />;
        
      case 'cobros': 
        return <CuentasPorCobrar />;
        
      default: 
        return <GraficosDashboard />;
    }
  };

  const toggleMenu = (menu) => {
    if (menuExpandido === menu) setMenuExpandido(null);
    else setMenuExpandido(menu);
  };

  // Estilos de los botones del Sidebar
  const estiloBotonSimple = (vista) => `
    w-full text-left px-6 py-2.5 text-sm font-medium transition-colors flex items-center gap-3
    ${vistaActiva === vista ? 'bg-[#2b2b3f] text-white border-l-4 border-orange-500' : 'text-gray-400 hover:bg-[#252536] hover:text-white'}
  `;

  const estiloBotonDesplegable = (menuName) => `
    w-full text-left px-6 py-2.5 text-sm font-medium transition-colors flex justify-between items-center
    ${menuExpandido === menuName ? 'bg-[#2b2b3f] text-white border-l-4 border-orange-500' : 'text-gray-400 hover:bg-[#252536] hover:text-white'}
  `;

  const estiloSubItem = (vista) => `
    w-full text-left pl-12 pr-4 py-2 text-xs transition-colors flex items-center gap-2
    ${vistaActiva === vista ? 'text-white font-bold bg-[#252536]' : 'text-gray-400 hover:text-white hover:bg-[#252536]'}
  `;

  return (
    <div className="flex h-screen bg-[#f3f4f6] font-sans">
      
      {/* ========================================== */}
      {/* MENÚ LATERAL IZQUIERDO (SIDEBAR COMPLETO)  */}
      {/* ========================================== */}
      <aside className="w-[260px] bg-[#1e1e2d] text-white flex flex-col h-full shadow-xl z-20 hidden md:flex">
        
        {/* Logo Superior */}
        <div className="h-16 flex items-center justify-center border-b border-gray-700 bg-white">
          <h1 className="text-2xl font-bold tracking-wider text-[#004284]">
             CDE<span className="text-orange-500">POS</span>
          </h1>
        </div>

        {/* Lista de Navegación */}
        <nav className="flex-1 overflow-y-auto py-2 flex flex-col bg-[#1e1e2d]">
          
          <button onClick={() => setVistaActiva('inicio')} className={estiloBotonSimple('inicio')}>
            <span>⏱️</span> Inicio
          </button>
          
          {/* MENÚ: GESTIÓN DE USUARIOS */}
          <button onClick={() => toggleMenu('usuarios')} className={estiloBotonDesplegable('usuarios')}>
            <div className="flex items-center gap-3"><span>👥</span> Gestión de usuarios</div>
            <span className="text-[10px]">{menuExpandido === 'usuarios' ? '▼' : '◀'}</span>
          </button>

          {/* MENÚ: CLIENTE / PROVEEDOR */}
          <button onClick={() => toggleMenu('contactos')} className={estiloBotonDesplegable('contactos')}>
            <div className="flex items-center gap-3"><span>👤</span> Cliente/Proveedor</div>
            <span className="text-[10px]">{menuExpandido === 'contactos' ? '▼' : '◀'}</span>
          </button>
          {menuExpandido === 'contactos' && (
            <div className="bg-[#151521] py-1 flex flex-col">
              <button onClick={() => alert('Módulo Proveedores en construcción')} className={estiloSubItem('proveedores')}>🠖 Proveedores</button>
              <button onClick={() => setVistaActiva('clientes')} className={estiloSubItem('clientes')}>🠖 Clientes</button>
              <button onClick={() => alert('Módulo Grupos en construcción')} className={estiloSubItem('grupos_clientes')}>🠖 Grupos de clientes</button>
              <button onClick={() => alert('Módulo Importar en construcción')} className={estiloSubItem('importar_contactos')}>🠖 Importar contactos</button>
            </div>
          )}

          {/* MENÚ: PRODUCTOS */}
          <button onClick={() => toggleMenu('productos')} className={estiloBotonDesplegable('productos')}>
            <div className="flex items-center gap-3"><span>📦</span> Productos</div>
            <span className="text-[10px]">{menuExpandido === 'productos' ? '▼' : '◀'}</span>
          </button>
          {menuExpandido === 'productos' && (
            <div className="bg-[#151521] py-1 flex flex-col">
              <button onClick={() => setVistaActiva('catalogo')} className={estiloSubItem('catalogo')}>🠖 Lista de productos</button>
              <button onClick={() => setVistaActiva('agregar_producto')} className={estiloSubItem('agregar_producto')}>🠖 Agregar producto</button>
            </div>
          )}

          <button onClick={() => alert('Módulo en construcción')} className={estiloBotonSimple('fabricacion')}>
            <span>🏭</span> Fabricación
          </button>

          <button onClick={() => alert('Módulo en construcción')} className={estiloBotonSimple('ot')}>
            <span></span> OT
          </button>

          {/* MENÚ: COMPRAS (RECONECTADO) */}
          <button onClick={() => toggleMenu('compras')} className={estiloBotonDesplegable('compras')}>
            <div className="flex items-center gap-3"><span></span> Compras</div>
            <span className="text-[10px]">{menuExpandido === 'compras' ? '▼' : '◀'}</span>
          </button>
          {menuExpandido === 'compras' && (
            <div className="bg-[#151521] py-1 flex flex-col">
              <button onClick={() => setVistaActiva('compras')} className={estiloSubItem('compras')}>🠖 Lista de compras</button>
            </div>
          )}

          {/* MENÚ: VENTAS (LOS 12 SUBÍTEMS COMPLETOS) */}
          <button onClick={() => toggleMenu('ventas')} className={estiloBotonDesplegable('ventas')}>
            <div className="flex items-center gap-3"><span></span> Ventas</div>
            <span className="text-[10px]">{menuExpandido === 'ventas' ? '▼' : '◀'}</span>
          </button>
          {menuExpandido === 'ventas' && (
            <div className="bg-[#151521] py-1 flex flex-col">
              <button onClick={() => alert('Módulo en construcción')} className={estiloSubItem('todas_ventas')}>🠖 Todas las ventas</button>
              <button onClick={() => alert('Módulo Facturación A4 en construcción')} className={estiloSubItem('nueva_venta')}>🠖 Nueva venta</button>
              <button onClick={() => alert('Historial de Tickets en construcción')} className={estiloSubItem('ventas_pos')}>🠖 Ventas POS</button>
              
              {/* Este botón activa la caja registradora de forma exclusiva */}
              <button onClick={() => setVistaActiva('pos')} className={estiloSubItem('pos')}>🠖 Punto de venta</button>
              
              <button onClick={() => alert('Módulo en construcción')} className={estiloSubItem('nuevo_pedido')}>🠖 Nuevo Pedido Pendiente</button>
              <button onClick={() => setVistaActiva('cobros')} className={estiloSubItem('cobros')}>🠖 Pedidos Pendientes</button>
              <button onClick={() => alert('Módulo en construcción')} className={estiloSubItem('nuevo_presupuesto')}>🠖 Nuevo presupuesto</button>
              <button onClick={() => alert('Módulo en construcción')} className={estiloSubItem('presupuestos')}>🠖 Presupuestos</button>
              <button onClick={() => alert('Módulo en construcción')} className={estiloSubItem('devoluciones')}>🠖 Devoluciones</button>
              <button onClick={() => alert('Módulo en construcción')} className={estiloSubItem('envios')}>🠖 Envíos</button>
              <button onClick={() => alert('Módulo en construcción')} className={estiloSubItem('descuentos')}>🠖 Descuentos</button>
              <button onClick={() => alert('Módulo en construcción')} className={estiloSubItem('importar_ventas')}>🠖 Importar ventas</button>
            </div>
          )}

          {/* ACCESO DIRECTO RÁPIDO AL POS */}
          <button onClick={() => setVistaActiva('pos')} className="w-full text-left px-6 py-2 text-sm font-bold bg-orange-500 text-white hover:bg-orange-600 transition flex items-center justify-center gap-2 mt-4 mx-4 w-[calc(100%-2rem)] rounded shadow-md">
            <span>🛒</span> Punto de venta
          </button>

        </nav>

        {/* Footer del Sidebar */}
        <div className="p-4 border-t border-gray-700 bg-[#1e1e2d]">
          <button onClick={cerrarSesion} className="w-full bg-red-600 hover:bg-red-700 text-white py-1.5 rounded text-sm font-bold transition">
            Cerrar Sesión
          </button>
        </div>
      </aside>

      {/* ========================================== */}
      {/* ÁREA PRINCIPAL DERECHA (MAIN CONTENT)      */}
      {/* ========================================== */}
      <div className="flex-1 flex flex-col h-full overflow-hidden">
        
        {/* Header Superior */}
        <header className="h-16 bg-white shadow-sm flex items-center justify-between px-6 z-10 border-b">
          <div className="flex items-center gap-4">
            <h2 className="text-gray-800 font-bold text-lg">
              {vistaActiva === 'inicio' && 'Inicio'}
              {vistaActiva === 'pos' && 'Punto de Venta'}
              {vistaActiva === 'compras' && 'Compras'}
              {vistaActiva === 'cobros' && 'Cuentas por Cobrar'}
              {vistaActiva === 'catalogo' && 'Lista de Productos'}
              {vistaActiva === 'agregar_producto' && 'Agregar Producto'}
              {vistaActiva === 'clientes' && 'Clientes'}
            </h2>
          </div>
          <div className="flex items-center gap-4">
             <span className="text-sm font-medium text-gray-700 flex items-center gap-2">
              <span className="bg-orange-500 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs font-bold">G</span> 
              GDA Repuesto
            </span>
          </div>
        </header>

        {/* Inyección de los Módulos Activos */}
        <main className="flex-1 overflow-y-auto p-4 md:p-6 bg-[#f3f4f6]">
          {renderizarVista()}
        </main>

      </div>
    </div>
  );
}