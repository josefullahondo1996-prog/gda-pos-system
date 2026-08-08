import { useState } from 'react';
import { supabase } from './supabaseClient';
import { useEmpresaInfo } from './utils/useEmpresa';

export default function NuevaVenta({ onVentaCreada }) {
  const { id: empresaId } = useEmpresaInfo();
  const [cliente, setCliente] = useState('');
  const [monto, setMonto] = useState('');

  const registrarVenta = async (e) => {
    e.preventDefault();
    const { data, error } = await supabase
      .from('ventas')
      .insert([{ 
        empresa_id: empresaId,
        cliente: cliente,
        total: parseFloat(monto),
        saldo_pendiente: parseFloat(monto)
      }]);

    if (error) alert('Error al registrar: ' + error.message);
    else {
      alert('¡Venta registrada con éxito!');
      if (onVentaCreada) onVentaCreada();
      setCliente('');
      setMonto('');
    }
  };

  return (
    <div className="bg-white p-6 rounded-lg shadow-md max-w-md mx-auto mt-10">
      <h2 className="text-xl font-bold mb-4 text-[#004284]">Registrar Nueva Venta</h2>
      <form onSubmit={registrarVenta} className="flex flex-col gap-4">
        <input 
          className="border p-2 rounded" 
          placeholder="Nombre del Cliente" 
          value={cliente}
          onChange={(e) => setCliente(e.target.value)} 
          required 
        />
        <input 
          className="border p-2 rounded" 
          type="number" 
          placeholder="Monto total (Gs)" 
          value={monto}
          onChange={(e) => setMonto(e.target.value)} 
          required 
        />
        <button type="submit" className="bg-[#28a745] text-white p-2 rounded font-bold hover:bg-green-700">
          Guardar Venta
        </button>
      </form>
    </div>
  );
}