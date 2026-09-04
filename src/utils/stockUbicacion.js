import { supabase } from '../supabaseClient';

// Suma (o resta, con delta negativo) cantidad al stock de UN producto en UNA sucursal puntual.
// Es aditivo y no rompe nada: no toca productos.stock_actual, que sigue funcionando igual que antes.
// Si algo falla acá (ej: la sucursal todavía no existe), no debe frenar el flujo principal
// (compra / apertura de stock), por eso quien llama a esta función debe envolver en try/catch
// y seguir adelante aunque falle.
export const ajustarStockUbicacion = async ({ empresaId, productoId, ubicacionId, delta }) => {
    if (!empresaId || !productoId || !ubicacionId || !delta) return;

    const { data: filaActual, error: errorLectura } = await supabase
        .from('producto_stock_ubicacion')
        .select('id, cantidad')
        .eq('producto_id', productoId)
        .eq('ubicacion_id', ubicacionId)
        .maybeSingle();
    if (errorLectura) throw errorLectura;

    let cantidadBase = 0;
    if (filaActual) {
        cantidadBase = Number(filaActual.cantidad || 0);
    } else {
        const { data: prod } = await supabase.from('productos').select('stock_actual').eq('id', productoId).maybeSingle();
        cantidadBase = Number(prod?.stock_actual || 0);
    }

    const cantidadNueva = Math.max(0, cantidadBase + Number(delta));

    if (filaActual) {
        const { error } = await supabase
            .from('producto_stock_ubicacion')
            .update({ cantidad: cantidadNueva, actualizado_en: new Date().toISOString() })
            .eq('id', filaActual.id);
        if (error) throw error;
    } else {
        const { error } = await supabase
            .from('producto_stock_ubicacion')
            .insert([{ empresa_id: empresaId, producto_id: productoId, ubicacion_id: ubicacionId, cantidad: cantidadNueva }]);
        if (error) throw error;
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