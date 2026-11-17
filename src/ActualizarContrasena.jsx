import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from './supabaseClient';
import LogoPyPos from './LogoPyPos';
import { LanguageSelector } from './LanguageContext';

export default function ActualizarContrasena({ session }) {
  const navigate = useNavigate();
  const [contrasena, setContrasena] = useState('');
  const [confirmacion, setConfirmacion] = useState('');
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);

  const guardarContrasena = async (event) => {
    event.preventDefault();
    setError('');
    if (contrasena.length < 8) {
      setError('La contraseña debe tener al menos 8 caracteres.');
      return;
    }
    if (contrasena !== confirmacion) {
      setError('Las contraseñas no coinciden.');
      return;
    }

    setGuardando(true);
    try {
      const { error: errorActualizacion } = await supabase.auth.updateUser({ password: contrasena });
      if (errorActualizacion) {
        setError(`No se pudo actualizar la contraseña: ${errorActualizacion.message}`);
        return;
      }
      await supabase.auth.signOut();
      navigate('/login?contrasena_actualizada=1', { replace: true });
    } catch (errorGuardado) {
      setError(`No se pudo actualizar la contraseña: ${errorGuardado.message}`);
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="login-page min-h-screen flex flex-col justify-center items-center p-4">
      <div className="login-language w-full max-w-md flex justify-end mb-3"><LanguageSelector /></div>
      <div className="login-card bg-white p-8 rounded-2xl shadow-lg w-full max-w-md text-center border border-gray-100">
        <div className="flex justify-center items-center mb-6"><LogoPyPos size={52} /></div>
        <h1 className="mb-2 text-2xl font-bold text-gray-800">Crear contraseña nueva</h1>
        <p className="mb-6 text-sm text-gray-500">{session ? `Cuenta: ${session.user.email}` : 'El enlace venció o ya fue utilizado. Solicitá otro desde el inicio de sesión.'}</p>
        {error && <div role="alert" className="mb-4 rounded-lg bg-red-100 p-3 text-left text-sm text-red-700">{error}</div>}
        {session ? (
          <form onSubmit={guardarContrasena} className="space-y-4 text-left">
            <label className="block text-sm font-medium text-gray-700">Nueva contraseña
              <input type="password" required minLength={8} autoComplete="new-password" value={contrasena} onChange={(event) => setContrasena(event.target.value)} className="mt-1 w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-orange-500" />
            </label>
            <label className="block text-sm font-medium text-gray-700">Confirmar contraseña
              <input type="password" required minLength={8} autoComplete="new-password" value={confirmacion} onChange={(event) => setConfirmacion(event.target.value)} className="mt-1 w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-orange-500" />
            </label>
            <button type="submit" disabled={guardando} className="w-full rounded-xl bg-orange-500 py-3 font-bold uppercase tracking-wider text-white shadow-md hover:bg-orange-600 disabled:cursor-not-allowed disabled:bg-gray-400">{guardando ? 'Guardando…' : 'Guardar contraseña'}</button>
          </form>
        ) : (
          <button type="button" onClick={() => navigate('/login', { replace: true })} className="w-full rounded-xl bg-orange-500 py-3 font-bold text-white hover:bg-orange-600">Volver al inicio de sesión</button>
        )}
      </div>
    </div>
  );
}
