const UNIDADES_DECIMALES = /kg|kilo|kilogram|litro|litros|lt|metro|metros|m\b/i;

export const cantidadInicial = (unidad, stockDisponible) => {
    const stock = Number(stockDisponible);
    return Number.isFinite(stock) && stock > 0 ? Math.min(1, stock) : 1;
};

export const pasoCantidad = (unidad) => (UNIDADES_DECIMALES.test(unidad || '') ? 0.01 : 1);

export const cantidadValida = (valor) => {
    const cantidad = Number(valor);
    return Number.isFinite(cantidad) && cantidad > 0;
};