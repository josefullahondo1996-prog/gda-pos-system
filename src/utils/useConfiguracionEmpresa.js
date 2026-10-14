import { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';

const leerCacheLocal = (empresaId) => {
  try {
    const guardado = JSON.parse(localStorage.getItem(`pypos-config-empresa-${empresaId}`) || '{}');
    if (guardado?.configuracion && typeof guardado.configuracion === 'object') return guardado.configuracion;
    if (guardado?.ajustes && typeof guardado.ajustes === 'object') return { ajustes: guardado.ajustes };
    if (guardado?.extra && typeof guardado.extra === 'object') return { version: guardado.version || 1, modulos: guardado.extra };
  } catch { /* el caché puede faltar o estar corrupto */ }
  return {};
};

export const notificarConfiguracionEmpresaActualizada = (empresaId) => {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('empresa-configuracion-actualizada', { detail: { empresaId } }));
  }
};

export const useConfiguracionEmpresa = (empresaId) => {
  const [resultado, setResultado] = useState({ ajustes: {}, cargando: Boolean(empresaId), localOnly: false });

  useEffect(() => {
    let vigente = true;
    if (!empresaId) {
      setResultado({ ajustes: {}, cargando: false, localOnly: false });
      return () => { vigente = false; };
    }

    const aplicar = (configuracion, localOnly) => {
      if (!vigente) return;
      setResultado({
        ajustes: configuracion?.ajustes && typeof configuracion.ajustes === 'object' ? configuracion.ajustes : {},
        configuracion,
        cargando: false,
        localOnly,
      });
    };

    const cargar = async () => {
      setResultado((actual) => ({ ...actual, cargando: true }));
      const { data, error } = await supabase.from('empresas').select('configuracion').eq('id', empresaId).maybeSingle();
      if (!vigente) return;
      if (error) aplicar(leerCacheLocal(empresaId), true);
      else aplicar(data?.configuracion && typeof data.configuracion === 'object' ? data.configuracion : {}, false);
    };

    const escucharActualizacion = (event) => {
      if (!event?.detail?.empresaId || event.detail.empresaId === empresaId) cargar();
    };
    const escucharStorage = (event) => {
      if (event.key === `pypos-config-empresa-${empresaId}`) cargar();
    };
    window.addEventListener('empresa-configuracion-actualizada', escucharActualizacion);
    window.addEventListener('storage', escucharStorage);
    cargar();

    return () => {
      vigente = false;
      window.removeEventListener('empresa-configuracion-actualizada', escucharActualizacion);
      window.removeEventListener('storage', escucharStorage);
    };
  }, [empresaId]);

  return resultado;
};
