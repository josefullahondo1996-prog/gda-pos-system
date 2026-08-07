import { supabase } from '../supabaseClient';

// Suma (o resta, con delta negativo) cantidad al stock de UN producto en UNA sucursal puntual.
// Es aditivo y no rompe nada: no toca productos.stock_actual, que sigue funcionando igual que antes.
// Si algo falla acá (ej: la sucursal todavía no existe), no debe frenar el flujo principal
// (compra / apertura de stock), por eso quien llama a esta función debe envolver en try/catch
// y seguir adelante aunque falle.
export const ajustarStockUbicacion = async ({ empresaId, productoId, ubicacionId, delta }) => {
    if (!empresaId || !productoId || !ubicacionId || !delta) return;

    const { data: filaActual } = await supabase
        .from('producto_stock_ubicacion')
        .select('id, cantidad')
        .eq('producto_id', productoId)
        .eq('ubicacion_id', ubicacionId)
        .maybeSingle();

    const cantidadNueva = Math.max(0, Number(filaActual?.cantidad || 0) + Number(delta));

    if (filaActual) {
        await supabase
            .from('producto_stock_ubicacion')
            .update({ cantidad: cantidadNueva, actualizado_en: new Date().toISOString() })
            .eq('id', filaActual.id);
    } else {
        await supabase
            .from('producto_stock_ubicacion')
            .insert([{ empresa_id: empresaId, producto_id: productoId, ubicacion_id: ubicacionId, cantidad: cantidadNueva }]);
    }
};

// Trae, para una lista de productos, cuánto stock tienen en cada sucursal.
// Devuelve un mapa: { [producto_id]: { [ubicacion_id]: cantidad } }
export const cargarMapaStockPorUbicacion = async (empresaId) => {
    const mapa = {};
    if (!empresaId) return mapa;
    const { data, error } = await supabase
        .from('producto_stock_ubicacion')
        .select('producto_id, ubicacion_id, cantidad')
        .eq('empresa_id', empresaId);
    if (error || !data) return mapa;
    data.forEach((fila) => {
        if (!mapa[fila.producto_id]) mapa[fila.producto_id] = {};
        mapa[fila.producto_id][fila.ubicacion_id] = Number(fila.cantidad) || 0;
    });
    return mapa;
};