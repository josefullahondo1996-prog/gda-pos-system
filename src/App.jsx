import React, { useState, useEffect, useRef, lazy, Suspense } from 'react';
import { supabase } from './supabaseClient';
import Login from './Login';
import CrearNegocio from './CrearNegocio';
import ActualizarContrasena from './ActualizarContrasena';
import Dashboard from './Dashboard';
import { useLanguage } from './LanguageContext';
import { useLocation } from 'react-router-dom';
import { useNotificacion } from './NotificacionContext';
import { sonidoExito } from './utils/sonido';
import GdaLandingPage from './GdaLandingPage';
const CatalogoQRPublico = lazy(() => import('./CatalogoQR').then((m) => ({ default: m.CatalogoQRPublico })));
const EstadoPedidoQRPublico = lazy(() => import('./CatalogoQR').then((m) => ({ default: m.EstadoPedidoQRPublico })));

function App() {
  const { t } = useLanguage();
  const { notificar } = useNotificacion();
  const location = useLocation();
  const [session, setSession] = useState(null);
  const [perfilUsuario, setPerfilUsuario] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [mostrarCrearNegocio, setMostrarCrearNegocio] = useState(false);
  const [errorAcceso, setErrorAcceso] = useState('');
  const [errorInicializacion, setErrorInicializacion] = useState('');
  // Guarda qué usuario ya tenemos cargado, para no repetir el proceso de
  // carga cuando Supabase reenvía "SIGNED_IN" con el mismo usuario
  // (esto pasa solo, al volver a la pestaña del navegador).
  const usuarioActualId = useRef(null);
  const transicionAuthRef = useRef(0);
  const notificarRef = useRef(notificar);
  const pedidosNotificadosRef = useRef(new Set());
  notificarRef.current = notificar;

  const cargarPerfil = async (session, sigueVigente = () => true) => {
    if (!session) {
      if (sigueVigente()) setPerfilUsuario(null);
      return;
    }
    try {
      const { data, error } = await supabase
        .from('usuarios')
        .select('id, auth_user_id, empresa_id, nombre, apellido, nombre_usuario, email, activo, permitir_acceso, roles(nombre, permisos), empresas(id, nombre, ruc, direccion, telefono, logo_url, estado)')
        .eq('auth_user_id', session.user.id)
        .maybeSingle();

      if (!sigueVigente()) return;
      if (error) throw error;

      if (!data || !data.empresas) {
        const { data: esDesarrollador } = await supabase.rpc('admin_es_desarrollador');
        if (!sigueVigente()) return;
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
      if (!sigueVigente()) return;
      console.error('Error al cargar el perfil del usuario:', err.message);
      setPerfilUsuario(null);
    }
  };

  useEffect(() => {
    console.log('App: Iniciando sesión de Supabase...');
    const cargaInicialId = transicionAuthRef.current;
    const timeoutCarga = window.setTimeout(() => {
      if (transicionAuthRef.current !== cargaInicialId) return;
      console.error('App: Supabase tardó demasiado en restaurar la sesión.');
      setErrorInicializacion('La conexión con Supabase está tardando demasiado. Revisá tu conexión y volvé a intentar.');
      setCargando(false);
    }, 15000);

    supabase.auth.getSession().then(async ({ data: { session }, error }) => {
      if (transicionAuthRef.current !== cargaInicialId) return;
      if (error) throw error;
      console.log('App: Sesión obtenida:', session ? 'Usuario logueado' : 'Sin sesión');
      usuarioActualId.current = session?.user?.id || null;
      setSession(session);
      setErrorInicializacion('');
      try {
        await cargarPerfil(session, () => transicionAuthRef.current === cargaInicialId);
      } catch (e) {
        console.error('App: Error en cargarPerfil:', e);
      }
      if (transicionAuthRef.current !== cargaInicialId) return;
      window.clearTimeout(timeoutCarga);
      console.log('App: Finalizando estado de carga');
      setCargando(false);
    }).catch(err => {
      window.clearTimeout(timeoutCarga);
      if (transicionAuthRef.current !== cargaInicialId) return;
      console.error('App: Error al obtener sesión:', err);
      setErrorInicializacion('No se pudo restaurar la sesión con Supabase. Volvé a intentar.');
      setCargando(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        // Supabase emite este evento dentro de su bloqueo interno de Auth.
        // La restauración inicial la resuelve getSession() fuera del callback.
        if (_event === 'INITIAL_SESSION') return;

        const nuevoUsuarioId = session?.user?.id || null;

        if (_event === 'PASSWORD_RECOVERY') {
          transicionAuthRef.current += 1;
          usuarioActualId.current = nuevoUsuarioId;
          setSession(session);
          setPerfilUsuario(null);
          setErrorInicializacion('');
          setCargando(false);
          return;
        }

        // Si el usuario logueado es el mismo que ya teníamos cargado, no hacemos
        // nada: esto cubre el caso de "SIGNED_IN"/"TOKEN_REFRESHED" repetidos
        // que Supabase dispara solo al volver a la pestaña del navegador.
        if (nuevoUsuarioId === usuarioActualId.current) {
          setSession(session); // igual guardamos el token nuevo, en silencio
          return;
        }

        // Acá sí cambió de verdad quién está logueado (login, logout, u otro usuario)
        const transicionId = ++transicionAuthRef.current;
        usuarioActualId.current = nuevoUsuarioId;
        setSession(session);

        if (!session) {
          setPerfilUsuario(null);
          setErrorInicializacion('');
          setCargando(false);
          return;
        }

        setCargando(true);
        setErrorInicializacion('');
        // No esperar peticiones de Supabase desde onAuthStateChange: el SDK
        // mantiene su bloqueo de Auth durante el callback y eso puede trabar
        // getSession() al restaurar una sesión guardada.
        window.setTimeout(() => {
          void (async () => {
            await cargarPerfil(session, () => transicionAuthRef.current === transicionId);
            if (transicionAuthRef.current !== transicionId) return;
            if (_event === 'SIGNED_IN' && session.user.id) {
              const { error } = await supabase.rpc('registrar_inicio_sesion_auditoria');
              if (error) console.warn('No se pudo guardar el evento de inicio de sesión:', error.message);
            }
            if (transicionAuthRef.current === transicionId) setCargando(false);
          })().catch(err => {
            if (transicionAuthRef.current !== transicionId) return;
            console.error('App: Error al procesar el cambio de sesión:', err);
            setCargando(false);
          });
        }, 0);
      }
    );

    return () => {
      window.clearTimeout(timeoutCarga);
      subscription.unsubscribe();
    };
  }, []);

  const empresaIdNotificaciones = perfilUsuario?.empresa_id || perfilUsuario?.empresas?.id;
  const nombreRol = String(perfilUsuario?.roles?.nombre || '').toLowerCase();
  const permisosRol = perfilUsuario?.roles?.permisos;
  const puedeRecibirAvisosDePedido = nombreRol.includes('admin')
    || perfilUsuario?.es_desarrollador === true
    || permisosRol?.ventas_pos?.['Acceder al Punto de Venta'] === true;

  useEffect(() => {
    if (!session?.user?.id || !empresaIdNotificaciones || !puedeRecibirAvisosDePedido) return undefined;

    const channel = supabase.channel(`avisos-pedidos-${empresaIdNotificaciones}-${session.user.id}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'pedidos',
        filter: `empresa_id=eq.${empresaIdNotificaciones}`,
      }, ({ new: pedido }) => {
        const esPedidoDeCatalogo = ['catalogo_qr', 'catalogo_qr_mesa'].includes(pedido?.origen);
        if (!pedido || pedido.estado !== 'pendiente' || (!esPedidoDeCatalogo && pedido.delivery_tipo !== 'delivery')) return;

        const clave = `${empresaIdNotificaciones}:${pedido.id || pedido.numero_pedido || pedido.creado_en}`;
        if (pedidosNotificadosRef.current.has(clave)) return;
        pedidosNotificadosRef.current.add(clave);
        if (pedidosNotificadosRef.current.size > 200) {
          pedidosNotificadosRef.current.delete(pedidosNotificadosRef.current.values().next().value);
        }

        sonidoExito();
        const canal = pedido.delivery_tipo === 'delivery'
          ? 'Delivery'
          : pedido.origen === 'catalogo_qr_mesa'
            ? `Mesa ${pedido.mesa_nombre || ''}`.trim()
            : 'Catálogo QR';
        notificarRef.current.info(`Llegó un nuevo pedido${pedido.numero_pedido ? ` · ${pedido.numero_pedido}` : ''} (${canal}).`);
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [session?.user?.id, empresaIdNotificaciones, puedeRecibirAvisosDePedido]);

  if (location.pathname.startsWith('/pedido/seguimiento/')) return <Suspense fallback={<div className="grid min-h-screen place-items-center text-slate-500">Cargando seguimiento...</div>}><EstadoPedidoQRPublico /></Suspense>;
  if (location.pathname.startsWith('/catalogo-qr/')) return <Suspense fallback={<div className="grid min-h-screen place-items-center text-slate-500">Cargando catálogo...</div>}><CatalogoQRPublico /></Suspense>;

  if (errorInicializacion) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 px-6 text-center text-gray-600">
        <p role="alert">{errorInicializacion}</p>
        <button type="button" onClick={() => window.location.reload()} className="rounded-lg bg-orange-500 px-5 py-3 font-semibold text-white hover:bg-orange-600">
          Volver a intentar
        </button>
      </div>
    );
  }

  if (cargando) {
    return (
      <div className="min-h-screen flex items-center justify-center text-gray-500">
        <div className="gda-navigation-progress gda-app-loading-progress" role="progressbar" aria-label="Cargando GDA POS" aria-valuetext="Cargando GDA POS" />
        {t('loading')}
      </div>
    );
  }

  const estaRecuperandoContrasena = location.pathname === '/login'
    && new URLSearchParams(location.search).get('recovery') === '1';
  if (estaRecuperandoContrasena) return <ActualizarContrasena session={session} />;

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
    </>
  );
}

export default App;
