import { useState } from 'react';
import { supabase } from './supabaseClient';

const CrearNegocio = ({ onVolverALogin }) => {
  const [nombreNegocio, setNombreNegocio] = useState('');
  const [nombreAdmin, setNombreAdmin] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [exito, setExito] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const { data, error } = await supabase.functions.invoke('crear-negocio', {
      body: { nombreNegocio, nombreAdmin, email, password },
    });

    if (error || data?.error) {
      let mensaje = data?.error;
      if (!mensaje && error) {
        try {
          const errBody = await error.context.json();
          mensaje = errBody.error || errBody.message;
        } catch (_) {
          mensaje = error.message;
        }
      }
      setError(mensaje || 'No se pudo crear el negocio.');
      setLoading(false);
      return;
    }

    setExito(true);
    setLoading(false);
  };

  if (exito) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col justify-center items-center p-4">
        <div className="bg-white p-8 rounded-2xl shadow-lg w-full max-w-md text-center border border-gray-100">
          <h2 className="text-2xl font-bold text-gray-800 mb-2">¡Listo!</h2>
          <p className="text-sm text-gray-500 mb-6">Tu negocio se creó correctamente. Ya podés iniciar sesión con el correo y la contraseña que registraste.</p>
          <button onClick={onVolverALogin} className="w-full py-3 text-white font-bold rounded-xl shadow-md bg-orange-500 hover:bg-orange-600 uppercase tracking-wider text-sm">
            Ir a iniciar sesión
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col justify-center items-center p-4">
      <div className="bg-white p-8 rounded-2xl shadow-lg w-full max-w-md text-center border border-gray-100">
        <h2 className="text-2xl font-bold text-gray-800 mb-1">Creá tu negocio</h2>
        <p className="text-sm text-gray-400 mb-6">Registrá tu empresa y tu cuenta de administrador</p>

        {error && <div className="mb-4 p-3 bg-red-100 text-red-700 text-sm rounded-lg text-left">{error}</div>}

        <form onSubmit={handleSubmit} className="space-y-4 text-left">
          <div>
            <label className="text-xs font-bold text-gray-500 block mb-1">Nombre del negocio *</label>
            <input required value={nombreNegocio} onChange={(e) => setNombreNegocio(e.target.value)}
              className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500 text-sm" />
          </div>
          <div>
            <label className="text-xs font-bold text-gray-500 block mb-1">Tu nombre</label>
            <input value={nombreAdmin} onChange={(e) => setNombreAdmin(e.target.value)}
              className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500 text-sm" />
          </div>
          <div>
            <label className="text-xs font-bold text-gray-500 block mb-1">Correo electrónico *</label>
            <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
              className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500 text-sm" />
          </div>
          <div>
            <label className="text-xs font-bold text-gray-500 block mb-1">Contraseña *</label>
            <input type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500 text-sm" />
          </div>

          <button type="submit" disabled={loading}
            className={`w-full py-3 text-white font-bold rounded-xl shadow-md uppercase tracking-wider text-sm mt-4 ${loading ? 'bg-gray-400 cursor-not-allowed' : 'bg-orange-500 hover:bg-orange-600'}`}>
            {loading ? 'Creando...' : 'CREAR NEGOCIO'}
          </button>
        </form>

        <button onClick={onVolverALogin} className="text-xs text-gray-400 hover:text-orange-500 mt-6">
          ¿Ya tenés cuenta? Iniciar sesión
        </button>
      </div>
    </div>
  );
};

export default CrearNegocio;
