// Utilidades para interactuar con la API de Goekua (facturación electrónica)
// a través de las Supabase Edge Functions.
//
// Estas funciones NUNCA exponen la API Key de Goekua al frontend:
// la clave vive como variable de entorno en Supabase y solo la usa
// la Edge Function del lado del servidor.

import { supabase } from '../supabaseClient';

/**
 * Genera una factura electrónica para una venta existente.
 *
 * @param {string} ventaId  – UUID de la venta en la tabla `ventas`
 * @param {string} empresaId – UUID de la empresa
 * @returns {{ success: boolean, goekua_id?: string, error?: string }}
 */
export async function generarFacturaElectronica(ventaId, empresaId) {
  try {
    const { data, error } = await supabase.functions.invoke('generate-invoice', {
      body: { ventaId, empresaId },
    });

    if (error) {
      // Error de red / CORS / Supabase Edge Function no encontrada
      throw new Error(error.message || 'Error al invocar la función de facturación.');
    }

    if (data?.error) {
      // Error de negocio (ej: "facturación no activa", "ya tiene factura", etc.)
      return { success: false, error: data.error };
    }

    return { success: true, goekua_id: data.goekua_id };
  } catch (err) {
    console.error('generarFacturaElectronica:', err);
    return { success: false, error: err.message };
  }
}

/**
 * Consulta el estado de una factura electrónica por su CDC/ID.
 *
 * @param {string} cdc       – CDC o goekua_id del documento
 * @param {string} empresaId – UUID de la empresa
 * @returns {{ status, cdc, kudeUrl, sifenAuthorization, error? }}
 */
export async function consultarFacturaElectronica(cdc, empresaId) {
  try {
    const { data, error } = await supabase.functions.invoke('consultar-factura', {
      body: { cdc, empresaId },
    });

    if (error) {
      throw new Error(error.message || 'Error al consultar la factura.');
    }

    if (data?.error) {
      return { success: false, error: data.error };
    }

    return {
      success: true,
      status: data.status,
      cdc: data.cdc,
      kudeUrl: data.kudeUrl,
      sifenAuthorization: data.sifenAuthorization,
      responseSifenMessage: data.responseSifenMessage,
    };
  } catch (err) {
    console.error('consultarFacturaElectronica:', err);
    return { success: false, error: err.message };
  }
}

/**
 * Colores e íconos para mostrar el estado SIFEN de una factura.
 */
export const ESTADOS_SIFEN = {
  APPROVED:     { label: 'Aprobada',     color: 'bg-green-100 text-green-700',  icon: '✅' },
  REJECTED:     { label: 'Rechazada',    color: 'bg-red-100 text-red-700',      icon: '❌' },
  IN_REVIEW:    { label: 'En revisión',  color: 'bg-yellow-100 text-yellow-700',icon: '⏳' },
  CANCELED:     { label: 'Cancelada',    color: 'bg-gray-100 text-gray-600',    icon: '🚫' },
  FORWARDING:   { label: 'Reenviando',   color: 'bg-blue-100 text-blue-700',    icon: '📤' },
  FORWARDED:    { label: 'Reenviada',    color: 'bg-blue-100 text-blue-700',    icon: '📬' },
  INUTILIZATION:{ label: 'Inutilizada',  color: 'bg-gray-100 text-gray-500',    icon: '🗑️' },
};

/**
 * Devuelve el badge (className + label) para un estado SIFEN.
 * Si el estado no se reconoce, devuelve un badge genérico.
 */
export function getBadgeSifen(estado) {
  const info = ESTADOS_SIFEN[estado];
  if (!info) return { label: estado || '—', color: 'bg-gray-100 text-gray-500', icon: '❓' };
  return info;
}
