import { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';

export const useEmpresaInfo = () => {
  const [empresaInfo, setEmpresaInfo] = useState({ id: null, nombre: '', direccion: '', telefono: '', ruc: '', logo_url: '' });

  useEffect(() => {
    let activo = true;

    const cargarEmpresa = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user?.id) {
        if (activo) setEmpresaInfo({ id: null, nombre: '', direccion: '', telefono: '', ruc: '', logo_url: '' });
        return;
      }

      const { data, error } = await supabase
        .from('usuarios')
        .select('empresa_id, empresas(id, nombre, direccion, telefono, ruc, logo_url)')
        .eq('auth_user_id', session.user.id)
        .maybeSingle();

      if (!activo) return;

      if (!error && data) {
        const empresaId = data.empresa_id || data.empresas?.id || null;
        setEmpresaInfo({
          id: empresaId,
          nombre: data.empresas?.nombre || '',
          direccion: data.empresas?.direccion || '',
          telefono: data.empresas?.telefono || '',
          ruc: data.empresas?.ruc || '',
          logo_url: data.empresas?.logo_url || '',
        });
      } else {
        setEmpresaInfo({ id: null, nombre: '', direccion: '', telefono: '', ruc: '', logo_url: '' });
      }
    };

    cargarEmpresa();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      // Solo recargamos en login/logout real. Eventos como TOKEN_REFRESHED
      // (que ocurren solos al volver a la pestaña) no deben disparar una recarga.
      if (_event !== 'SIGNED_IN' && _event !== 'SIGNED_OUT') return;

      if (!session?.user?.id) {
        setEmpresaInfo({ id: null, nombre: '', direccion: '', telefono: '', ruc: '', logo_url: '' });
        return;
      }
      cargarEmpresa();
    });

    return () => {
      activo = false;
      subscription.unsubscribe();
    };
  }, []);

  return empresaInfo;
};

export const useNombreEmpresa = () => {
  const { nombre } = useEmpresaInfo();
  return nombre;
};