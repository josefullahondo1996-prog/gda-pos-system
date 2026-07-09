import { useState } from 'react';
import { supabase } from './supabaseClient';

export default function AbrirCaja({ onCajaAbierta }) {
  const [montoInicial, setMontoInicial] = useState('');
  const [cargando, setCargando] = useState(false);

  const manejarAbrirCaja = async (e) => {
    e.preventDefault();
    const monto = parseFloat(montoInicial);

    if (isNaN(monto) || monto < 0) {
      alert('Por favor, ingrese un monto inicial válido (puede ser 0).');
      return;
    }

    setCargando(true);

    try {
      const { data, error } = await supabase
        .from('cajas')
        .insert([{ 
          monto_inicial: monto, 
          estado: 'abierto' 
        }])
        .select();

      if (error) throw error;

      alert('¡Caja registradora abierta con éxito!');
      if (onCajaAbierta) onCajaAbierta(data[0]); // Le avisa al sistema que ya puede pasar al POS
    } catch (error) {
      alert('Error al abrir la caja: ' + error.message);
    } finally {
      setCargando(false);
    }
  };

  return (
    <div className="bg-transparent text-sm text-gray-700 mt-2">
      <h2 className="text-2xl font-bold mb-6 text-gray-800">Abrir caja registradora</h2>

      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-12 max-w-4xl mx-auto mt-4 min-h-[350px] flex flex-col justify-center items-center">
        <form onSubmit={manejarAbrirCaja} className="w-full max-w-xl text-center">
          
          <h3 className="text-lg font-medium text-gray-700 mb-8">
            Ingrese el saldo inicial en Caja
          </h3>

          <div className="mb-6 text-left">
            <label className="block text-gray-600 font-bold mb-2">
              Efectivo en Moneda Base:
            </label>
            <div className="flex rounded-md shadow-sm border border-gray-300 overflow-hidden focus-within:border-indigo-500 transition-colors">
              <span className="bg-gray-100 text-gray-500 px-4 py-3 flex items-center border-r border-gray-300 font-bold">
                💵
              </span>
              <input
                type="number"
                className="w-full px-4 py-3 outline-none text-base"
                placeholder="Ingresar cantidad"
                value={montoInicial}
                onChange={(e) => setMontoInicial(e.target.value)}
                disabled={cargando}
                required
              />
            </div>
          </div>

          <div className="text-right mt-8">
            <button
              type="submit"
              disabled={cargando}
              className="bg-orange-500 text-white font-bold px-6 py-2.5 rounded shadow hover:bg-orange-600 transition-all text-sm uppercase tracking-wider"
            >
              {cargando ? 'Abriendo...' : 'Abrir registro'}
            </button>
          </div>

        </form>
      </div>
    </div>
  );
}