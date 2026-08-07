import React, { useState } from 'react';
import { supabase } from './supabaseClient';
import { sonidoExito, sonidoError } from './utils/sonido';
import { useEmpresaInfo } from './utils/useEmpresa';
import { useUbicacionUsuario } from './utils/useUbicacion';

const AbrirCaja = ({ onCajaAbierta }) => {
  const { id: empresaId } = useEmpresaInfo();
  const { id: ubicacionUsuarioId, nombre: nombreUbicacionUsuario, ve_todas: usuarioVeTodas, cargando: cargandoUbicacion } = useUbicacionUsuario();
  const [saldoInicial, setSaldoInicial] = useState('');
  const [cargando, setCargando] = useState(false);
  const [ubicacionesDisponibles, setUbicacionesDisponibles] = useState([]);
  const [ubicacionIdCaja, setUbicacionIdCaja] = useState('');

  React.useEffect(() => {
    const cargarUbicaciones = async () => {
      if (!empresaId || !usuarioVeTodas) return;
      const { data } = await supabase.from('ubicaciones_comerciales').select('id, nombre, codigo_ubicacion').eq('empresa_id', empresaId).order('creado_en');
      if (data) setUbicacionesDisponibles(data);
    };
    cargarUbicaciones();
  }, [empresaId, usuarioVeTodas]);

  const handleAbrirCaja = async (e) => {
    e.preventDefault();
    if (!saldoInicial || Number(saldoInicial) < 0) {
      return alert('Por favor, ingresá un monto válido para abrir la caja.');
    }
    const ubicacionElegida = usuarioVeTodas ? ubicacionIdCaja : ubicacionUsuarioId;
    if (!ubicacionElegida) {
      return alert(usuarioVeTodas ? 'Seleccioná la sucursal donde vas a abrir la caja.' : 'Tu usuario no tiene una sucursal fija asignada. Pedile a un administrador que te la asigne en Gestión de usuarios.');
    }

    setCargando(true);
    try {
      const nuevaCaja = {
        empresa_id: empresaId,
        saldo_inicial: Number(saldoInicial),
        estado: 'Abierta',
        fecha_apertura: new Date().toISOString(),
        ubicacion_id: ubicacionElegida,
      };

      const { data, error } = await supabase
        .from('caja_registros')
        .insert([nuevaCaja])
        .select();

      // Si la tabla no existe aún, ignoramos el error para que puedas seguir probando el flujo
      if (error && error.code !== '42P01') throw error;

      // Avisamos al Dashboard que la caja ya está abierta para que muestre el POS
      const cajaGuardada = data && data[0] ? data[0] : nuevaCaja;
      sonidoExito();
      if (onCajaAbierta) onCajaAbierta(cajaGuardada);

    } catch (error) {
      sonidoError();
      console.error("Error al abrir la caja:", error.message);
      alert('Hubo un error al registrar la caja. Revisá la consola.');
    } finally {
      setCargando(false);
    }
  };

  return (
    <div className="p-6 bg-[#f4f6f9] min-h-screen w-full font-sans text-gray-800">
      
      <h1 className="text-2xl font-bold text-gray-800 mb-6">Abrir caja registradora</h1>

      <div className="bg-white border border-gray-200 rounded-lg shadow-sm p-8 max-w-4xl mx-auto mt-4">
        
        <form onSubmit={handleAbrirCaja}>
          
          <div className="text-center mb-6">
            <h2 className="text-gray-600 text-lg mb-3">Ingrese el saldo inicial en Caja</h2>
            <hr className="border-gray-300 w-3/4 mx-auto" />
          </div>

          <div className="flex flex-col items-center justify-center gap-2 mb-6">
            <label className="font-bold text-sm text-gray-700">Sucursal:</label>
            {usuarioVeTodas ? (
              <select
                required
                className="w-full md:w-96 border border-gray-300 rounded p-2 text-sm bg-white outline-none"
                value={ubicacionIdCaja}
                onChange={(e) => setUbicacionIdCaja(e.target.value)}
              >
                <option value="">Seleccioná una sucursal</option>
                {ubicacionesDisponibles.map((u) => (
                  <option key={u.id} value={u.id}>{u.nombre}{u.codigo_ubicacion ? ` (${u.codigo_ubicacion})` : ''}</option>
                ))}
              </select>
            ) : (
              <div className="w-full md:w-96 border border-gray-200 bg-gray-50 rounded p-2 text-sm text-gray-700 text-center font-bold">
                {cargandoUbicacion ? 'Cargando...' : (nombreUbicacionUsuario || 'Sin sucursal asignada')}
              </div>
            )}
          </div>

          <div className="flex flex-col md:flex-row items-center justify-center gap-4 mb-6">
            <label className="font-bold text-sm text-gray-700 w-full md:w-auto text-right">
              Efectivo en Moneda Base:
            </label>
            
            <div className="flex w-full md:w-96 border border-gray-300 rounded overflow-hidden focus-within:border-blue-500 focus-within:ring-1 focus-within:ring-blue-500">
              <span className="bg-gray-100 text-gray-500 px-3 py-2 border-r border-gray-300 flex items-center justify-center">
                💵
              </span>
              <input 
                type="number" 
                required
                placeholder="Ingresar cantidad" 
                value={saldoInicial}
                onChange={(e) => setSaldoInicial(e.target.value)}
                className="w-full px-3 py-2 text-sm outline-none"
              />
            </div>
          </div>

          <div className="flex justify-center md:justify-end md:w-[75%] mx-auto">
            <button 
              type="submit" 
              disabled={cargando}
              className={`bg-[#fd7e14] text-white font-bold py-2 px-6 rounded shadow-sm hover:bg-[#e86e04] transition-colors ${cargando ? 'opacity-70 cursor-not-allowed' : ''}`}
            >
              {cargando ? 'Abriendo...' : 'Abrir registro'}
            </button>
          </div>

        </form>

      </div>
    </div>
  );
};

export default AbrirCaja;