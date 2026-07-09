import { useEffect, useState } from 'react';
import { supabase } from './supabaseClient';

export default function CuentasPorCobrar() {
  const [deudas, setDeudas] = useState([]);
  const [montoPago, setMontoPago] = useState({}); // Para guardar lo que se escribe en cada fila

  useEffect(() => {
    cargarDeudas();
  }, []);

  const cargarDeudas = async () => {
    const { data, error } = await supabase
      .from('ventas')
      .select('*')
      .eq('estado', 'pendiente')
      .order('fecha', { ascending: false });

    if (!error) setDeudas(data);
  };

  const manejarCambioInput = (id, valor) => {
    setMontoPago({ ...montoPago, [id]: valor });
  };

  const registrarPago = async (venta) => {
    const abono = parseFloat(montoPago[venta.id]);
    
    if (!abono || abono <= 0) {
      alert('Ingresa un monto válido');
      return;
    }

    const nuevoSaldo = venta.saldo_pendiente - abono;
    const nuevoEstado = nuevoSaldo <= 0 ? 'pagado' : 'pendiente';
    const saldoFinal = nuevoSaldo <= 0 ? 0 : nuevoSaldo;

    const { error } = await supabase
      .from('ventas')
      .update({ 
        saldo_pendiente: saldoFinal, 
        estado: nuevoEstado 
      })
      .eq('id', venta.id);

    if (error) {
      alert('Error al registrar el pago: ' + error.message);
    } else {
      alert(nuevoEstado === 'pagado' ? '¡Deuda cancelada!' : 'Pago parcial registrado.');
      setMontoPago({ ...montoPago, [venta.id]: '' }); // Limpiar input
      cargarDeudas(); // Recargar la tabla
    }
  };

  return (
    <div className="bg-white p-6 rounded-lg shadow-md mt-6">
      <h2 className="text-xl font-bold mb-4 text-[#004284]">Cuentas por Cobrar (Créditos)</h2>
      
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b-2 text-gray-600 text-sm">
              <th className="pb-2">Cliente</th>
              <th className="pb-2">Total Factura</th>
              <th className="pb-2 text-red-600">Saldo Pendiente</th>
              <th className="pb-2">Registrar Pago (Gs)</th>
              <th className="pb-2">Acción</th>
            </tr>
          </thead>
          <tbody>
            {deudas.length === 0 ? (
              <tr>
                <td colSpan="5" className="text-center py-4 text-gray-500">
                  No hay cuentas por cobrar pendientes. ¡Excelente!
                </td>
              </tr>
            ) : (
              deudas.map((deuda) => (
                <tr key={deuda.id} className="border-b hover:bg-gray-50">
                  <td className="py-3 font-medium">{deuda.cliente_nombre}</td>
                  <td className="py-3 text-gray-500">Gs {Number(deuda.total).toLocaleString('es-PY')}</td>
                  <td className="py-3 font-bold text-red-600">Gs {Number(deuda.saldo_pendiente).toLocaleString('es-PY')}</td>
                  <td className="py-3">
                    <input 
                      type="number" 
                      placeholder="Monto a pagar"
                      className="border p-1 rounded w-32"
                      value={montoPago[deuda.id] || ''}
                      onChange={(e) => manejarCambioInput(deuda.id, e.target.value)}
                    />
                  </td>
                  <td className="py-3">
                    <button 
                      onClick={() => registrarPago(deuda)}
                      className="bg-green-500 text-white px-3 py-1 rounded text-sm font-bold hover:bg-green-600"
                    >
                      Abonar
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