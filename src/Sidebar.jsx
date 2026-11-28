import React from 'react';
import { Link } from 'react-router-dom';
import { CircleDollarSign, LayoutDashboard, Users, ShoppingCart } from 'lucide-react';

const Sidebar = () => {
  return (
    <div className="w-64 bg-white text-slate-800 min-h-screen flex flex-col border-r border-slate-200">
      {/* LOGO */}
      <div className="p-5 flex items-center gap-3 border-b border-slate-200">
        <div className="bg-[#e96b25] text-white font-black text-xl px-2 py-1 rounded">PY</div>
        <span className="text-xl font-bold tracking-wide text-slate-800">pos</span>
      </div>

      {/* MENÚ DE NAVEGACIÓN */}
      <Link to="/abrir-caja" className="flex items-center gap-3 p-3 rounded-md text-[#245a81] hover:bg-slate-100 transition-colors">
  <CircleDollarSign size={18} aria-hidden="true" /> Punto de Venta (POS)
</Link>

      <nav className="flex-1 p-4 space-y-1 overflow-y-auto text-sm">
        
        <Link to="/" className="flex items-center gap-3 p-3 rounded-md hover:bg-slate-100 transition-colors">
          <LayoutDashboard size={18} className="text-[#245a81]" aria-hidden="true" /> Inicio
        </Link>
        
        <div className="pt-4 pb-2 px-3 text-xs text-slate-400 font-bold uppercase tracking-wider">Gestión</div>
        
        <Link to="/usuarios" className="flex items-center gap-3 p-3 rounded-md hover:bg-slate-100 transition-colors">
          <Users size={18} className="text-[#245a81]" aria-hidden="true" /> Usuarios
        </Link>
        
        <div className="pt-4 pb-2 px-3 text-xs text-slate-400 font-bold uppercase tracking-wider">Inventario</div>
        
        <Link to="/compras/agregar" className="flex items-center gap-3 p-3 rounded-md hover:bg-slate-100 transition-colors">
          <ShoppingCart size={18} className="text-[#245a81]" aria-hidden="true" /> Agregar Compra
        </Link>

      </nav>
    </div>
  );
};

export default Sidebar;
