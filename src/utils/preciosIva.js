export const parseIvaPct = (valor) => {
  if (valor === null || valor === undefined || valor === '') return 0;
  const texto = String(valor).replace(/[^0-9.,-]/g, '').replace(',', '.');
  const numero = Number(texto);
  if (!Number.isFinite(numero)) return 0;
  return Math.max(0, numero);
};

export const precioSinIva = (valorConIva, ivaPct = 0) => {
  const tasa = parseIvaPct(ivaPct);
  const valor = Number(valorConIva) || 0;
  if (valor === 0 || tasa === 0) return valor;
  return valor / (1 + tasa / 100);
};

export const precioConIva = (valorSinIva, ivaPct = 0) => {
  const tasa = parseIvaPct(ivaPct);
  const valor = Number(valorSinIva) || 0;
  if (valor === 0 || tasa === 0) return valor;
  return valor * (1 + tasa / 100);
};

export const precioVentaConIva = (costoNeto, margenPct = 0, ivaPct = 0) => {
  const costo = Number(costoNeto) || 0;
  const margen = Number(margenPct) || 0;
  const ventaSinIva = costo * (1 + margen / 100);
  return precioConIva(ventaSinIva, ivaPct);
};

export const margenDesdeVentaConIva = (costoNeto, ventaConIva, ivaPct = 0) => {
  const costo = Number(costoNeto) || 0;
  const venta = Number(ventaConIva) || 0;
  if (costo <= 0) return 0;
  const ventaSinIva = precioSinIva(venta, ivaPct);
  return ((ventaSinIva - costo) / costo) * 100;
};
