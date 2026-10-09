import React, { useState, useEffect, useRef, lazy, Suspense } from 'react';
import { supabase } from './supabaseClient';
import Login from './Login';
import CrearNegocio from './CrearNegocio';
import Dashboard from './Dashboard';
import ChatBotFlotante from './ChatBotFlotante';
import { useLanguage } from './LanguageContext';
import { useLocation } from 'react-router-dom';
import GdaLandingPage from './GdaLandingPage';
const CatalogoQRPublico = lazy(() => import('./CatalogoQR').then((m) => ({ default: m.CatalogoQRPublico })));

function App() {
  const { t } = useLanguage();
  const location = useLocation();
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
        .select('id, auth_user_id, empresa_id, nombre, apellido, nombre_usuario, email, activo, permitir_acceso, caja_actual, roles(nombre, permisos), empresas(id, nombre, ruc, direccion, telefono, logo_url, estado)')
        .eq('auth_user_id', session.user.id)
        .maybeSingle();

      if (error) throw error;

      if (!data || !data.empresas) {
        const { data: esDesarrollador } = await supabase.rpc('admin_es_desarrollador');
        if (esDesarrollador === true) {
          setErrorAcceso('');
          setPerfilUsuario({
            es_desarrollador: true,
            roles: { nombre: 'Desarrollador', permisos: null },
            empresas: { nombre: 'Administración del sistema' },
          });
          return;
        }

        // La cuenta de Auth existe, pero ya no tiene una ficha de usuario o empresa activa
        // (por ejemplo, si se borró la empresa directamente desde Supabase). No la dejamos entrar.
        setPerfilUsuario(null);
        setSession(null);
        supabase.auth.signOut();
        setErrorAcceso('Esta cuenta no está asociada a ningún negocio activo. Si tu negocio ya no existe, podés crear uno nuevo.');
        return;
      }

      if (data.empresas.estado === 'suspendida') {
        setPerfilUsuario(null);
        setSession(null);
        await supabase.auth.signOut();
        setErrorAcceso('Este negocio está suspendido. Contactá al soporte del sistema.');
        return;
      }

      if (data.activo === false || data.permitir_acceso === false) {
        setPerfilUsuario(null);
        setSession(null);
        await supabase.auth.signOut();
        setErrorAcceso('Tu usuario está desactivado o no tiene permiso de acceso. Contactá al administrador del negocio.');
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
    console.log('App: Iniciando sesión de Supabase...');
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      console.log('App: Sesión obtenida:', session ? 'Usuario logueado' : 'Sin sesión');
      usuarioActualId.current = session?.user?.id || null;
      setSession(session);
      try {
        await cargarPerfil(session);
      } catch (e) {
        console.error('App: Error en cargarPerfil:', e);
      }
      console.log('App: Finalizando estado de carga');
      setCargando(false);
    }).catch(err => {
      console.error('App: Error al obtener sesión:', err);
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
        if (_event === 'SIGNED_IN' && session?.user?.id) {
          setTimeout(() => {
            supabase.rpc('registrar_inicio_sesion_auditoria').then(({ error }) => {
              if (error) console.warn('No se pudo guardar el evento de inicio de sesión:', error.message);
            });
          }, 0);
        }
        setCargando(false);
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  if (location.pathname.startsWith('/catalogo-qr/')) return <Suspense fallback={<div className="grid min-h-screen place-items-center text-slate-500">Cargando catálogo...</div>}><CatalogoQRPublico /></Suspense>;

  if (cargando) {
    return (
      <div className="min-h-screen flex items-center justify-center text-gray-500">
        {t('loading')}
      </div>
    );
  }

  if (!session) {
    if (location.pathname !== '/login' && location.pathname !== '/crear-negocio') {
      return <GdaLandingPage />;
    }
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

  return (
    <>
      <Dashboard session={session} perfilUsuario={perfilUsuario} />
      <ChatBotFlotante perfilUsuario={perfilUsuario} />
    </>
  );
}

export default App;
