import React, { useState } from 'react';
import { supabase } from './supabaseClient'; // Asegurate de que la ruta a tu cliente de Supabase sea la correcta
import LogoPyPos from './LogoPyPos';
import { LanguageSelector, useLanguage } from './LanguageContext';

const Login = ({ setSession, onCrearNegocio, errorExterno }) => {
  const { t } = useLanguage();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

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

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col justify-center items-center p-4">
      <div className="w-full max-w-md flex justify-end mb-3"><LanguageSelector /></div>
      <div className="bg-white p-8 rounded-2xl shadow-lg w-full max-w-md text-center border border-gray-100">
        
        <div className="flex justify-center items-center mb-6">
          <LogoPyPos size={52} />
        </div>

        <h2 className="text-2xl font-bold text-gray-800 mb-1">{t('login')}</h2>
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

        <form onSubmit={handleSubmit} className="space-y-4 text-left">
          <div className="relative">
            <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-gray-400">
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
            </span>
            <input
              type="email"
              placeholder={t('email')}
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full pl-10 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500 focus:bg-white transition-all text-sm"
            />
          </div>

          <div className="relative">
            <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-gray-400">
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
            </span>
            <input
              type="password"
              placeholder={t('password')}
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full pl-10 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500 focus:bg-white transition-all text-sm"
            />
          </div>

          <div className="flex items-center justify-between text-xs pt-1">
            <label className="flex items-center gap-2 text-gray-600 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                className="rounded border-gray-300 text-orange-500 focus:ring-orange-500 w-4 h-4"
              />
              {t('remember')}
            </label>
            <a href="#recuperar" className="text-orange-500 hover:underline font-medium">
              {t('forgotPassword')}
            </a>
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
        </form>

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