import { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';
import { sonidoExito, sonidoError } from './utils/sonido';

export default function ConfiguracionEmpresa({ perfilUsuario }) {
  const [nombre, setNombre] = useState('');
  const [ruc, setRuc] = useState('');
  const [direccion, setDireccion] = useState('');
  const [telefono, setTelefono] = useState('');
  const [logoUrl, setLogoUrl] = useState('');
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);

  const empresaId = perfilUsuario?.empresa_id;

  useEffect(() => {
    const cargarEmpresa = async () => {
      if (!empresaId) { setCargando(false); return; }
      const { data, error } = await supabase.from('empresas').select('*').eq('id', empresaId).maybeSingle();
      if (!error && data) {
        setNombre(data.nombre || '');
        setRuc(data.ruc || '');
        setDireccion(data.direccion || '');
        setTelefono(data.telefono || '');
        setLogoUrl(data.logo_url || '');
      }
      setCargando(false);
    };
    cargarEmpresa();
  }, [empresaId]);

  const guardarEmpresa = async (e) => {
    e.preventDefault();
    if (!empresaId) return;
    setGuardando(true);
    const { error } = await supabase
      .from('empresas')
      .update({ nombre, ruc: ruc || null, direccion: direccion || null, telefono: telefono || null, logo_url: logoUrl || null })
      .eq('id', empresaId);
    setGuardando(false);

    if (error) {
      sonidoError();
      alert('Error al guardar los datos de la empresa: ' + error.message);
    } else {
      sonidoExito();
      alert('¡Datos de la empresa actualizados!');
    }
  };

  if (cargando) return <div className="p-6 text-gray-500">Cargando datos de la empresa...</div>;

  return (
    <div className="bg-white p-6 rounded-lg shadow-md max-w-2xl">
      <h2 className="text-xl font-bold mb-4 text-gray-800">Datos de la Empresa</h2>
      <form onSubmit={guardarEmpresa} className="flex flex-col gap-4">
        <div>
          <label className="text-xs font-bold text-gray-500 block mb-1">Nombre del negocio *</label>
          <input className="border p-2 rounded w-full" value={nombre} onChange={(e) => setNombre(e.target.value)} required />
        </div>
        <div>
          <label className="text-xs font-bold text-gray-500 block mb-1">RUC</label>
          <input className="border p-2 rounded w-full" value={ruc} onChange={(e) => setRuc(e.target.value)} />
        </div>
        <div>
          <label className="text-xs font-bold text-gray-500 block mb-1">Dirección</label>
          <input className="border p-2 rounded w-full" value={direccion} onChange={(e) => setDireccion(e.target.value)} />
        </div>
        <div>
          <label className="text-xs font-bold text-gray-500 block mb-1">Teléfono</label>
          <input className="border p-2 rounded w-full" value={telefono} onChange={(e) => setTelefono(e.target.value)} />
        </div>
        <div>
          <label className="text-xs font-bold text-gray-500 block mb-1">URL del logo (opcional)</label>
          <input className="border p-2 rounded w-full" value={logoUrl} onChange={(e) => setLogoUrl(e.target.value)} placeholder="https://..." />
        </div>
        <button type="submit" disabled={guardando} className="bg-orange-500 hover:bg-orange-600 text-white font-bold px-4 py-2 rounded self-start">
          {guardando ? 'Guardando...' : 'Guardar cambios'}
        </button>
      </form>
    </div>
  );
}
