import { useState } from 'react';
import { supabase } from './supabaseClient';

export default function NuevoGasto({ onGastoCreado }) {
  const [descripcion, setDescripcion] = useState('');
  const [monto, setMonto] = useState('');

  const registrarGasto = async (e) => {
    e.preventDefault();
    const { error } = await supabase
      .from('gastos')
      .insert([{ descripcion, monto: parseFloat(monto) }]);

    if (error) {
      alert('Error al registrar: ' + error.message);
    } else {
      alert('¡Gasto registrado con éxito!');
      if (onGastoCreado) onGastoCreado();
      setDescripcion('');
      setMonto('');
    }
  };

  return (
    <div className="bg-white p-6 rounded-lg shadow-md mt-6">
      <h2 className="text-xl font-bold mb-4 text-red-600">Registrar Gasto Operativo</h2>
      <form onSubmit={registrarGasto} className="flex flex-col gap-4">
        <input 
          className="border p-2 rounded" 
          placeholder="Descripción (Ej. Luz, Alquiler, Internet)" 
          value={descripcion}
          onChange={(e) => setDescripcion(e.target.value)} 
          required 
        />
        <input 
          className="border p-2 rounded" 
          type="number" 
          placeholder="Monto (Gs)" 
          value={monto}
          onChange={(e) => setMonto(e.target.value)} 
          required 
        />
        <button type="submit" className="bg-red-500 text-white p-2 rounded font-bold hover:bg-red-700">
          Guardar Gasto
        </button>
      </form>
    </div>
  );
}