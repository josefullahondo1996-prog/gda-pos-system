const unidadNormalizada = (unidad) => String(unidad || '').trim().toLowerCase();
const unidadEsKilogramo = (unidad) => /^(kg|kilo|kilos|kilogramo|kilogramos)$/.test(unidadNormalizada(unidad));
const unidadEsGramo = (unidad) => /^(g|gr|gramo|gramos)$/.test(unidadNormalizada(unidad));
const unidadPermiteDecimal = (unidad) => unidadEsKilogramo(unidad) || unidadEsGramo(unidad) || /^(l|lt|litro|litros|m|metro|metros)$/.test(unidadNormalizada(unidad));

export const cantidadInicial = (unidad, stockDisponible) => {
    const stock = Number(stockDisponible);
    const inicial = unidadEsGramo(unidad) ? 1 : 1;
    return Number.isFinite(stock) && stock > 0 ? Math.min(inicial, stock) : inicial;
};

export const pasoCantidad = (unidad) => (unidadEsGramo(unidad) ? 0.001 : unidadPermiteDecimal(unidad) ? 0.01 : 1);

export const cantidadVisible = (cantidad, unidad) => (
    unidadEsGramo(unidad) ? Number(cantidad || 0) * 1000 : Number(cantidad || 0)
);

export const formatearStock = (cantidad, unidad) => {
    if (!unidadEsKilogramo(unidad)) {
        return `${cantidadVisible(cantidad, unidad)} ${unidad || 'UNID'}`;
    }

    const gramosTotales = Math.max(0, Math.round(Number(cantidad || 0) * 1000));
    const kilogramos = Math.floor(gramosTotales / 1000);
    const gramos = gramosTotales % 1000;

    return `${kilogramos} kg ${gramos} g`;
};

export const cantidadInterna = (cantidad, unidad) => (
    unidadEsGramo(unidad) ? Number(cantidad) / 1000 : Number(cantidad)
);

export const pasoVisible = (unidad) => (unidadEsGramo(unidad) ? 1 : pasoCantidad(unidad));

export const etiquetaCantidad = (unidad) => (unidadEsGramo(unidad) ? 'gramos' : (unidad || 'unidades'));

export const cantidadValida = (valor) => {
    const cantidad = Number(valor);
    return Number.isFinite(cantidad) && cantidad > 0;
};