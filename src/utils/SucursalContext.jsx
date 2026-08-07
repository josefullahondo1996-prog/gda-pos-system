import React, { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { useEmpresaInfo } from './useEmpresa';
import { useUbicacionUsuario } from './useUbicacion';

// === CONTEXTO GLOBAL DE SUCURSAL ===
// Un solo estado compartido para toda la app: cuando se cambia la sucursal
// desde cualquier pantalla, todas las demás (Inicio, Ganancias y Pérdidas,
// Productos, etc.) leen el mismo valor sin necesidad de recargar la página
// ni de mantener cada una su propio filtro por separado.
const SucursalContext = createContext(null);

export const SucursalProvider = ({ children }) => {
  const { id: empresaId } = useEmpresaInfo();
  // ve_todas / ubicacionUsuarioId: el permiso real del usuario logueado.
  // Si NO tiene permiso de ver todas las sucursales, queda bloqueado a la suya.
  const { id: ubicacionUsuarioId, ve_todas: usuarioVeTodas, cargando: cargandoPermiso } = useUbicacionUsuario();

  const [ubicaciones, setUbicaciones] = useState([]);
  // '' significa "Todas las sucursales" (solo disponible si usuarioVeTodas)
  const [sucursalActiva, setSucursalActivaState] = useState('');

  // Carga la lista de sucursales de la empresa una sola vez
  useEffect(() => {
    const cargarUbicaciones = async () => {
      if (!empresaId) return;
      const { data } = await supabase
        .from('ubicaciones_comerciales')
        .select('id, nombre')
        .eq('empresa_id', empresaId)
        .order('nombre');
      if (data) setUbicaciones(data);
    };
    cargarUbicaciones();
  }, [empresaId]);

  // Si el usuario está fijo a una sola sucursal, lo bloqueamos ahí apenas se sabe su permiso
  useEffect(() => {
    if (!cargandoPermiso && !usuarioVeTodas && ubicacionUsuarioId) {
      setSucursalActivaState(ubicacionUsuarioId);
    }
  }, [cargandoPermiso, usuarioVeTodas, ubicacionUsuarioId]);

  // Guard: nadie sin permiso puede forzar otra sucursal, aunque intente llamar al setter directo
  const setSucursalActiva = (nuevoId) => {
    if (!usuarioVeTodas) return;
    setSucursalActivaState(nuevoId);
  };

  const nombreSucursalActiva = sucursalActiva
    ? ubicaciones.find((u) => u.id === sucursalActiva)?.nombre || ''
    : 'Todas las sucursales';

  return (
    <SucursalContext.Provider
      value={{
        ubicaciones,
        sucursalActiva,
        setSucursalActiva,
        nombreSucursalActiva,
        usuarioVeTodas,
        ubicacionUsuarioId,
      }}
    >
      {children}
    </SucursalContext.Provider>
  );
};

// Hook que van a usar todas las pantallas (Inicio, GananciasPerdidas, ListaProductos, etc.)
export const useSucursalActiva = () => {
  const ctx = useContext(SucursalContext);
  if (!ctx) {
    // Fallback defensivo: si algún componente se usa fuera del Provider,
    // no rompe la app, simplemente se comporta como "todas las sucursales".
    return {
      ubicaciones: [],
      sucursalActiva: '',
      setSucursalActiva: () => {},
      nombreSucursalActiva: 'Todas las sucursales',
      usuarioVeTodas: true,
      ubicacionUsuarioId: null,
    };
  }
  return ctx;
};
