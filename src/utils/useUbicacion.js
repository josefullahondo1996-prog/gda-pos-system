import { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';

// Devuelve la sucursal del usuario logueado:
// - ve_todas = true  -> es admin / tiene acceso a todas las sucursales (todas_localizaciones)
// - ve_todas = false -> está fijo a una sola sucursal (id + nombre)
export const useUbicacionUsuario = () => {
    const [ubicacion, setUbicacion] = useState({ id: null, nombre: '', ve_todas: true, cargando: true });

    useEffect(() => {
        let activo = true;

        const cargar = async () => {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session?.user?.id) {
                if (activo) setUbicacion({ id: null, nombre: '', ve_todas: true, cargando: false });
                return;
            }

            const { data, error } = await supabase
                .from('usuarios')
                .select('todas_localizaciones, ubicacion_id, ubicaciones_comerciales(id, nombre, codigo_ubicacion, activo)')
                .eq('auth_user_id', session.user.id)
                .maybeSingle();

            if (!activo) return;

            if (!error && data) {
                setUbicacion({
                    id: data.ubicaciones_comerciales?.activo ? data.ubicacion_id : null,
                    nombre: data.ubicaciones_comerciales?.activo ? data.ubicaciones_comerciales.nombre : '',
                    codigo: data.ubicaciones_comerciales?.activo ? data.ubicaciones_comerciales.codigo_ubicacion : '',
                    ve_todas: data.todas_localizaciones ?? true,
                    cargando: false,
                });
            } else {
                setUbicacion({ id: null, nombre: '', ve_todas: true, cargando: false });
            }
        };

        cargar();

        const { data: { subscription } } = supabase.auth.onAuthStateChange((_event) => {
            // Solo recargamos en login/logout real, no en cada refresco de token en segundo plano
            if (_event === 'SIGNED_IN' || _event === 'SIGNED_OUT') cargar();
        });
        return () => {
            activo = false;
            subscription.unsubscribe();
        };
    }, []);

    return ubicacion;
};