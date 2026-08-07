import { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';
import { sonidoExito, sonidoError } from './utils/sonido';
import { useEmpresaInfo } from './utils/useEmpresa';
import { useUbicacionUsuario } from './utils/useUbicacion';

export default function NuevoGasto({ onGastoCreado }) {
  const { id: empresaId } = useEmpresaInfo();
  const { id: ubicacionFijaId, nombre: ubicacionFijaNombre, ve_todas: veTodas } = useUbicacionUsuario();
  const [descripcion, setDescripcion] = useState('');
  const [monto, setMonto] = useState('');
  const [ubicacionesDisponibles, setUbicacionesDisponibles] = useState([]);
  const [ubicacionElegidaId, setUbicacionElegidaId] = useState('');

  useEffect(() => {
    const cargarUbicaciones = async () => {
      if (!empresaId || !veTodas) return;
      const { data } = await supabase.from('ubicaciones_comerciales').select('id, nombre, codigo_ubicacion').eq('empresa_id', empresaId).eq('activo', true).order('creado_en');
      if (data) {
        setUbicacionesDisponibles(data);
        if (!ubicacionElegidaId && data.length > 0) setUbicacionElegidaId(data[0].id);
      }
    };
    cargarUbicaciones();
  }, [empresaId, veTodas]);

  const registrarGasto = async (e) => {
    e.preventDefault();
    const ubicacionFinalId = veTodas ? (ubicacionElegidaId || null) : ubicacionFijaId;

    const { error } = await supabase
      .from('gastos')
      .insert([{ empresa_id: empresaId, ubicacion_id: ubicacionFinalId, descripcion, monto: parseFloat(monto) }]);

    if (error) {
      sonidoError();
      alert('Error al registrar: ' + error.message);
    } else {
      sonidoExito();
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
        {veTodas && ubicacionesDisponibles.length > 0 && (
          <select
            required
            value={ubicacionElegidaId}
            onChange={(e) => setUbicacionElegidaId(e.target.value)}
            className="border p-2 rounded bg-white"
          >
            <option value="">Seleccioná una sucursal</option>
            {ubicacionesDisponibles.map((u) => (
              <option key={u.id} value={u.id}>{u.nombre}{u.codigo_ubicacion ? ` (${u.codigo_ubicacion})` : ''}</option>
            ))}
          </select>
        )}
        {!veTodas && ubicacionFijaNombre && (
          <p className="text-xs text-gray-500">Sucursal: <span className="font-bold text-gray-700">{ubicacionFijaNombre}</span></p>
        )}
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