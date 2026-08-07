import React from 'react';
import { Link } from 'react-router-dom';

const Sidebar = () => {
  return (
    <div className="w-64 bg-[#1e293b] text-white min-h-screen flex flex-col shadow-xl">
      {/* LOGO */}
      <div className="p-5 flex items-center gap-3 border-b border-slate-700">
        <div className="bg-orange-500 text-white font-black text-xl px-2 py-1 rounded">PY</div>
        <span className="text-xl font-bold tracking-wide">pos</span>
      </div>

      {/* MENÚ DE NAVEGACIÓN */}
      <Link to="/abrir-caja" className="flex items-center gap-3 p-3 rounded-lg hover:bg-slate-800 transition-colors">
  <span className="text-orange-500">💰</span> Punto de Venta (POS)
</Link>

      <nav className="flex-1 p-4 space-y-1 overflow-y-auto text-sm">
        
        <Link to="/" className="flex items-center gap-3 p-3 rounded-lg hover:bg-slate-800 transition-colors">
          <span className="text-orange-500">📊</span> Inicio
        </Link>
        
        <div className="pt-4 pb-2 px-3 text-xs text-slate-400 font-bold uppercase tracking-wider">Gestión</div>
        
        <Link to="/usuarios" className="flex items-center gap-3 p-3 rounded-lg hover:bg-slate-800 transition-colors">
          <span className="text-orange-500">👥</span> Usuarios
        </Link>
        
        <div className="pt-4 pb-2 px-3 text-xs text-slate-400 font-bold uppercase tracking-wider">Inventario</div>
        
        <Link to="/compras/agregar" className="flex items-center gap-3 p-3 rounded-lg hover:bg-slate-800 transition-colors">
          <span className="text-orange-500">➕</span> Agregar Compra
        </Link>

      </nav>
    </div>
  );
};

export default Sidebar;