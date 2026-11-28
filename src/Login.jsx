import React, { useState } from 'react';
import { supabase } from './supabaseClient'; // Asegurate de que la ruta a tu cliente de Supabase sea la correcta
import LogoPyPos from './LogoPyPos';
import { LanguageSelector, useLanguage } from './LanguageContext';
import { LockKeyhole, Mail } from 'lucide-react';

const Login = ({ setSession, onCrearNegocio, errorExterno }) => {
  const { t } = useLanguage();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [mostrarRecuperacion, setMostrarRecuperacion] = useState(false);
  const [avisoRecuperacion, setAvisoRecuperacion] = useState(() => (
    new URLSearchParams(window.location.search).get('contrasena_actualizada') === '1'
      ? 'La contraseña se actualizó. Ya podés iniciar sesión.'
      : ''
  ));

  const mensajeError = error || errorExterno;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    // Autenticación real contra la base de datos
    const { data, error } = await supabase.auth.signInWithPassword({
      email: email,
      password: password,
    });

    if (error) {
      setError('Correo o contraseña incorrectos. Por favor, verificá tus datos.');
      setLoading(false);
    } else {
      // Si la autenticación es exitosa, actualizamos el estado de sesión
      if (data?.session) {
        setSession(data.session);
      }
      setLoading(false);
    }
  };

  const solicitarRecuperacion = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setAvisoRecuperacion('');
    try {
      const { error: errorRecuperacion } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${window.location.origin}/login?recovery=1`,
      });
      if (errorRecuperacion) {
        setError(`No se pudo enviar el correo de recuperación: ${errorRecuperacion.message}`);
      } else {
        setAvisoRecuperacion('Si existe una cuenta con ese correo, recibirás un enlace para crear una contraseña nueva. Revisá también la carpeta de spam.');
      }
    } catch (errorEnvio) {
      setError(`No se pudo enviar el correo de recuperación: ${errorEnvio.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page min-h-screen flex flex-col justify-center items-center p-4">
      <div className="login-language w-full max-w-md flex justify-end mb-3"><LanguageSelector /></div>
      <div className="login-card bg-white p-8 rounded-2xl shadow-lg w-full max-w-md text-center border border-gray-100">
        
        <div className="flex justify-center items-center mb-6">
          <LogoPyPos size={52} />
        </div>

        <h2 className="text-2xl font-bold text-gray-800 mb-1">{mostrarRecuperacion ? 'Recuperar contraseña' : t('login')}</h2>
        <p className="text-sm text-gray-400 mb-6">PYpos</p>

        {/* Muestra errores de inicio de sesión si los hay */}
        {mensajeError && (
          <div className="mb-4 p-3 bg-red-100 text-red-700 text-sm rounded-lg text-left">
            {mensajeError}
            {errorExterno && !error && (
              <>
                {' '}
                <button type="button" onClick={onCrearNegocio} className="font-bold underline hover:no-underline">
                  Creá tu cuenta acá.
                </button>
              </>
            )}
          </div>
        )}

        {avisoRecuperacion && <div role="status" className="mb-4 rounded-lg bg-emerald-50 p-3 text-left text-sm text-emerald-800">{avisoRecuperacion}</div>}

        {mostrarRecuperacion ? (
          <form onSubmit={solicitarRecuperacion} className="space-y-4 text-left">
            <p className="text-sm text-gray-600">Ingresá el correo de tu cuenta y te enviaremos un enlace para elegir una contraseña nueva.</p>
            <div className="relative">
              <span aria-hidden="true" className="absolute inset-y-0 left-0 flex items-center pl-3 text-gray-400"><Mail size={18} /></span>
              <input type="email" name="email" aria-label={t('email')} placeholder={t('email')} required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className="ds-field w-full py-3 pl-10 pr-4 text-sm" />
            </div>
            <button type="submit" disabled={loading} className="mt-4 w-full rounded-xl bg-orange-500 py-3 text-sm font-bold uppercase tracking-wider text-white shadow-md transition-colors hover:bg-orange-600 disabled:cursor-not-allowed disabled:bg-gray-400">
              {loading ? 'Enviando…' : 'Enviar enlace'}
            </button>
            <button type="button" onClick={() => { setMostrarRecuperacion(false); setError(null); setAvisoRecuperacion(''); }} className="w-full py-2 text-sm font-medium text-orange-600 hover:underline">Volver a iniciar sesión</button>
          </form>
        ) : <form onSubmit={handleSubmit} className="space-y-4 text-left">
          <div className="relative">
              <span aria-hidden="true" className="absolute inset-y-0 left-0 flex items-center pl-3 text-gray-400">
                <Mail size={18} />
            </span>
            <input
              type="email"
              name="email"
              aria-label={t('email')}
              placeholder={t('email')}
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="ds-field w-full py-3 pl-10 pr-4 text-sm"
            />
          </div>

          <div className="relative">
            <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-gray-400">
              <LockKeyhole size={18} aria-hidden="true" />
            </span>
            <input
              type="password"
              name="password"
              aria-label={t('password')}
              placeholder={t('password')}
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="ds-field w-full py-3 pl-10 pr-4 text-sm"
            />
          </div>

          <div className="flex items-center justify-between text-xs pt-1">
            <label className="flex items-center gap-2 text-gray-600 cursor-pointer">
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                className="rounded border-gray-300 text-orange-500 focus:ring-orange-500 w-4 h-4"
              />
              {t('remember')}
            </label>
            <button type="button" onClick={() => { setMostrarRecuperacion(true); setError(null); setAvisoRecuperacion(''); }} className="text-orange-500 hover:underline font-medium">
              {t('forgotPassword')}
            </button>
          </div>

          <button
            type="submit"
            disabled={loading}
            className={`w-full py-3 text-white font-bold rounded-xl shadow-md transition-colors uppercase tracking-wider text-sm mt-4 ${
              loading ? 'bg-gray-400 cursor-not-allowed' : 'bg-orange-500 hover:bg-orange-600'
            }`}
          >
            {loading ? t('validating') : t('loginButton')}
          </button>
        </form>}

        {onCrearNegocio && (
          <button onClick={onCrearNegocio} className="text-xs text-orange-500 hover:underline mt-6 font-medium">
            {t('newBusiness')}
          </button>
        )}

        <p className="text-xs text-gray-400 mt-8">© 2026 PYpos</p>
      </div>
    </div>
  );
};

export default Login;
