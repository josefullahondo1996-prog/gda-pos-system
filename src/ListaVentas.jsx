import { useEffect, useState } from 'react';
import { supabase } from './supabaseClient';
import { useEmpresaInfo } from './utils/useEmpresa';
import { generateReceipt } from './utils/generateReceipt';

export default function ListaVentas() {
  const { id: empresaId, nombre: nombreEmpresa, direccion: direccionEmpresa, telefono: telefonoEmpresa, ruc: rucEmpresa } = useEmpresaInfo();
  const [ventas, setVentas] = useState([]);

  // useEffect hace que la función obtenerVentas se ejecute apenas carga la pantalla
  useEffect(() => {
    if (empresaId) obtenerVentas();
  }, [empresaId]);

  const obtenerVentas = async () => {
    if (!empresaId) {
      setVentas([]);
      return;
    }
    const query = supabase
      .from('ventas')
      .select('*')
      .eq('empresa_id', empresaId)
      .order('fecha', { ascending: false }) // Las más nuevas primero
      .limit(10); // Mostrar solo las últimas 10 para no saturar
    const { data, error } = await query;

    if (error) {
      console.error('Error al cargar ventas:', error.message);
    } else {
      setVentas(data);
    }
  };

  return (
    <div className="bg-white p-6 rounded-lg shadow-md mt-6">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-lg font-bold text-[#004284]">Últimas Ventas Registradas</h2>
        <button 
          onClick={obtenerVentas}
          className="text-sm bg-blue-100 text-blue-700 px-3 py-1 rounded hover:bg-blue-200"
        >
          ↻ Actualizar
        </button>
      </div>
      
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b-2 text-gray-600 text-sm">
              <th className="pb-2">Fecha</th>
              <th className="pb-2">Cliente</th>
              <th className="pb-2">Total</th>
              <th className="pb-2">Estado</th>
              <th className="pb-2">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {ventas.length === 0 ? (
              <tr>
                <td colSpan="4" className="text-center py-4 text-gray-500">
                  Aún no hay ventas registradas.
                </td>
              </tr>
            ) : (
              ventas.map((venta) => (
                <tr key={venta.id} className="border-b hover:bg-gray-50">
                  <td className="py-3">{new Date(venta.fecha).toLocaleDateString()}</td>
                  <td className="py-3 font-medium">{venta.cliente_nombre}</td>
                  <td className="py-3">Gs {venta.total.toLocaleString()}</td>
                  <td className="py-3">
                    <span className={`px-2 py-1 rounded-full text-xs font-bold ${
                      venta.estado === 'pagado' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'
                    }`}>
                      {venta.estado.toUpperCase()}
                    </span>
                  </td>
                  <td className="py-3">
                    <button 
                      onClick={() => generateReceipt(venta, { nombre: nombreEmpresa, direccion: direccionEmpresa, telefono: telefonoEmpresa, ruc: rucEmpresa })}
                      className="bg-blue-50 text-[#004284] border border-blue-200 px-3 py-1 rounded text-xs font-bold hover:bg-blue-100 flex items-center gap-1 transition"
                    >
                      🖨️ Imprimir
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}