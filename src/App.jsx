import React, { useState, useEffect, useRef } from 'react';
import { supabase } from './supabaseClient';
import Login from './Login';
import CrearNegocio from './CrearNegocio';
import Dashboard from './Dashboard';

function App() {
  const [session, setSession] = useState(null);
  const [perfilUsuario, setPerfilUsuario] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [mostrarCrearNegocio, setMostrarCrearNegocio] = useState(false);
  const [errorAcceso, setErrorAcceso] = useState('');
  // Guarda qué usuario ya tenemos cargado, para no repetir el proceso de
  // carga cuando Supabase reenvía "SIGNED_IN" con el mismo usuario
  // (esto pasa solo, al volver a la pestaña del navegador).
  const usuarioActualId = useRef(null);

  const cargarPerfil = async (session) => {
    if (!session) {
      setPerfilUsuario(null);
      return;
    }
    try {
      const { data, error } = await supabase
        .from('usuarios')
        .select('*, roles(nombre, permisos), empresas(id, nombre, ruc, direccion, telefono, logo_url)')
        .eq('auth_user_id', session.user.id)
        .maybeSingle();

      if (error) throw error;

      if (!data || !data.empresas) {
        // La cuenta de Auth existe, pero ya no tiene una ficha de usuario o empresa activa
        // (por ejemplo, si se borró la empresa directamente desde Supabase). No la dejamos entrar.
        setPerfilUsuario(null);
        setSession(null);
        supabase.auth.signOut();
        setErrorAcceso('Esta cuenta no está asociada a ningún negocio activo. Si tu negocio ya no existe, podés crear uno nuevo.');
        return;
      }

      setErrorAcceso('');
      setPerfilUsuario(data);
    } catch (err) {
      console.error('Error al cargar el perfil del usuario:', err.message);
      setPerfilUsuario(null);
    }
  };

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      usuarioActualId.current = session?.user?.id || null;
      setSession(session);
      await cargarPerfil(session);
      setCargando(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        const nuevoUsuarioId = session?.user?.id || null;

        // Si el usuario logueado es el mismo que ya teníamos cargado, no hacemos
        // nada: esto cubre el caso de "SIGNED_IN"/"TOKEN_REFRESHED" repetidos
        // que Supabase dispara solo al volver a la pestaña del navegador.
        if (nuevoUsuarioId === usuarioActualId.current) {
          setSession(session); // igual guardamos el token nuevo, en silencio
          return;
        }

        // Acá sí cambió de verdad quién está logueado (login, logout, u otro usuario)
        usuarioActualId.current = nuevoUsuarioId;
        setCargando(true);
        setSession(session);
        await cargarPerfil(session);
        setCargando(false);
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  if (cargando) {
    return (
      <div className="min-h-screen flex items-center justify-center text-gray-500">
        Cargando...
      </div>
    );
  }

  if (!session) {
    if (mostrarCrearNegocio) {
      return <CrearNegocio onVolverALogin={() => { setErrorAcceso(''); setMostrarCrearNegocio(false); }} />;
    }
    return (
      <Login
        setSession={setSession}
        onCrearNegocio={() => { setErrorAcceso(''); setMostrarCrearNegocio(true); }}
        errorExterno={errorAcceso}
      />
    );
  }

  return <Dashboard session={session} perfilUsuario={perfilUsuario} />;
}

export default App;