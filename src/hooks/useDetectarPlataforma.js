import { useEffect, useState } from 'react';
import { Capacitor } from '@capacitor/core';

/**
 * Hook que detecta si la app está corriendo en móvil/tablet o escritorio
 * Retorna true si es móvil/tablet, false si es web/escritorio
 */
export function useDetectarPlataforma() {
  const [esMovil, setEsMovil] = useState(false);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    const detectar = () => {
      // Detecta por plataforma (Android/iOS)
      const plataforma = Capacitor.getPlatform();
      const esPlataformaMovil = plataforma === 'android' || plataforma === 'ios';

      // Detecta por tamaño de pantalla (< 768px = móvil)
      const esPantallaPequeña = window.innerWidth < 768;

      // Es móvil si es plataforma móvil O pantalla pequeña
      const resultado = esPlataformaMovil || esPantallaPequeña;
      
      setEsMovil(resultado);
      setCargando(false);
    };

    detectar();

    // Escucha cambios de tamaño de pantalla (ej: girar el dispositivo)
    const manejadorResize = () => detectar();
    window.addEventListener('resize', manejadorResize);

    return () => window.removeEventListener('resize', manejadorResize);
  }, []);

  return { esMovil, cargando };
}
