import { User, LogOut, Phone, Mail, MapPin, History } from 'lucide-react';
import { useState } from 'react';

/**
 * PerfilMovil - Perfil del cliente simplificado para móvil
 * Muestra información del cliente y opciones básicas
 */
export default function PerfilMovil({ datosCliente, onCerrarSesion, comprasHistorico = [] }) {
  const [mostrarHistorico, setMostrarHistorico] = useState(false);

  return (
    <div className="flex flex-col gap-4 h-full overflow-y-auto pb-6">
      {/* ENCABEZADO PERFIL */}
      <div className="bg-gradient-to-r from-orange-500 to-orange-600 text-white rounded-lg p-6 text-center">
        <div className="w-16 h-16 bg-white bg-opacity-20 rounded-full mx-auto mb-3 flex items-center justify-center">
          <User size={32} />
        </div>
        <h2 className="text-xl font-bold">{datosCliente?.nombre || 'Cliente'}</h2>
        <p className="text-orange-100 text-sm mt-1">{datosCliente?.email || 'sin@email.com'}</p>
      </div>

      {/* INFORMACIÓN DE CONTACTO */}
      <div className="bg-white rounded-lg border border-gray-200 p-4 space-y-3">
        <h3 className="font-bold text-gray-800 mb-3">Información de Contacto</h3>

        {datosCliente?.telefono && (
          <div className="flex items-center gap-3">
            <Phone size={18} className="text-orange-600" />
            <div className="flex-1">
              <p className="text-xs text-gray-500">Teléfono</p>
              <p className="text-sm font-bold text-gray-800">{datosCliente.telefono}</p>
            </div>
          </div>
        )}

        {datosCliente?.email && (
          <div className="flex items-center gap-3">
            <Mail size={18} className="text-orange-600" />
            <div className="flex-1">
              <p className="text-xs text-gray-500">Email</p>
              <p className="text-sm font-bold text-gray-800">{datosCliente.email}</p>
            </div>
          </div>
        )}

        {datosCliente?.direccion && (
          <div className="flex items-start gap-3">
            <MapPin size={18} className="text-orange-600 mt-0.5" />
            <div className="flex-1">
              <p className="text-xs text-gray-500">Dirección</p>
              <p className="text-sm font-bold text-gray-800">{datosCliente.direccion}</p>
            </div>
          </div>
        )}
      </div>

      {/* HISTORIAL DE COMPRAS */}
      {comprasHistorico && comprasHistorico.length > 0 && (
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <button
            onClick={() => setMostrarHistorico(!mostrarHistorico)}
            className="w-full flex items-center justify-between font-bold text-gray-800 hover:text-orange-600 transition-colors"
          >
            <div className="flex items-center gap-2">
              <History size={18} className="text-orange-600" />
              Historial de Compras
            </div>
            <span className="text-sm">{mostrarHistorico ? '▼' : '▶'}</span>
          </button>

          {mostrarHistorico && (
            <div className="mt-3 space-y-2 max-h-48 overflow-y-auto">
              {comprasHistorico.map((compra, idx) => (
                <div key={idx} className="border-t border-gray-100 pt-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">{new Date(compra.fecha).toLocaleDateString()}</span>
                    <span className="font-bold text-orange-600">${compra.total.toFixed(2)}</span>
                  </div>
                  <p className="text-xs text-gray-500 mt-0.5">{compra.cantidad} artículos</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* OPCIONES */}
      <div className="space-y-2 mt-auto">
        {/* BOTÓN CERRAR SESIÓN */}
        <button
          onClick={onCerrarSesion}
          className="w-full flex items-center justify-center gap-2 bg-red-600 hover:bg-red-700 text-white font-bold py-3 rounded-lg transition-colors"
        >
          <LogOut size={18} />
          Cerrar Sesión
        </button>
      </div>
    </div>
  );
}
