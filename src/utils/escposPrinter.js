const BRIDGE_URL = 'http://127.0.0.1:8765';

const formatMoney = (amount, currency = 'PYG') => {
  const value = Number(amount || 0);
  const formatted = value.toLocaleString(currency === 'BRL' ? 'pt-BR' : 'es-PY', currency === 'PYG'
    ? { maximumFractionDigits: 0 }
    : { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return currency === 'PYG' ? `${formatted} Gs.` : `${currency} ${formatted}`;
};

const cp850 = new Map(Object.entries({
  'á': 0xa0, 'é': 0x82, 'í': 0xa1, 'ó': 0xa2, 'ú': 0xa3, 'ñ': 0xa4, 'Ñ': 0xa5,
  'Á': 0xb5, 'É': 0x90, 'Í': 0xd6, 'Ó': 0xe0, 'Ú': 0xe9, 'ü': 0x81, 'Ü': 0x9a,
  '¿': 0xa8, '¡': 0xad, 'º': 0xf8,
}));

const encodeText = (text) => {
  const bytes = [];
  for (const char of String(text ?? '')) {
    if (cp850.has(char)) bytes.push(cp850.get(char));
    else {
      const ascii = char.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\x20-\x7e]/g, '?');
      bytes.push(...new TextEncoder().encode(ascii));
    }
  }
  return bytes;
};

const wrap = (text, width) => {
  const words = String(text ?? '').split(/\s+/).filter(Boolean);
  const lines = [];
  let line = '';
  for (const word of words) {
    if (word.length > width) {
      if (line) lines.push(line);
      line = '';
      for (let i = 0; i < word.length; i += width) lines.push(word.slice(i, i + width));
    } else if (!line) line = word;
    else if (`${line} ${word}`.length <= width) line += ` ${word}`;
    else { lines.push(line); line = word; }
  }
  if (line) lines.push(line);
  return lines;
};

const fitRow = (left, right, width) => {
  const a = String(left ?? '').slice(0, width);
  const b = String(right ?? '').slice(0, width);
  return `${a}${' '.repeat(Math.max(1, width - a.length - b.length))}${b}`;
};

const asBase64 = (bytes) => {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.slice(i, i + 0x8000));
  return btoa(binary);
};

export function buildEscPosReceipt(venta, empresa = {}, characters = 42) {
  const width = Number(characters) <= 32 ? 32 : 42;
  const commands = [];
  const push = (...values) => commands.push(...values);
  const text = (value) => { push(...encodeText(value), 0x0a); };
  const center = (value) => { push(0x1b, 0x61, 0x01); text(value); push(0x1b, 0x61, 0x00); };
  const bold = (enabled) => push(0x1b, 0x45, enabled ? 1 : 0);
  const rule = () => text('-'.repeat(width));
  const currency = ['PYG', 'USD', 'EUR', 'BRL'].includes(venta.moneda_venta) ? venta.moneda_venta : 'PYG';
  const total = Number(venta.total_moneda ?? venta.total ?? 0);
  const paid = Number(venta.monto_pagado_moneda ?? venta.monto_pagado ?? total);
  const change = Math.max(0, paid - total);
  const balance = Number(venta.saldo_pendiente_moneda ?? venta.saldo_pendiente ?? 0);
  const rawTicket = String(venta.numero_factura || venta.id || '0');
  const ticket = /^\d{3}-\d{3}-\d+$/.test(rawTicket) ? rawTicket : `001-001-${rawTicket.padStart(7, '0')}`;
  const date = venta.fecha ? new Date(venta.fecha) : new Date();
  const dateText = `${date.toLocaleDateString('es-PY')} ${date.toLocaleTimeString('es-PY', { hour: '2-digit', minute: '2-digit' })}`;
  const items = venta.items || venta.detalle || [];

  push(0x1b, 0x40, 0x1b, 0x74, 0x02); // Initialize and select common ESC/POS PC850 code page.
  push(0x1b, 0x61, 0x01); bold(true);
  for (const line of wrap(String(empresa.nombre || 'MI EMPRESA').toUpperCase(), width)) text(line);
  push(0x1b, 0x61, 0x00);
  if (empresa.ruc) text(`RUC: ${empresa.ruc}`);
  if (empresa.telefono) text(`Tel: ${empresa.telefono}`);
  if (empresa.direccion) for (const line of wrap(empresa.direccion, width)) text(line);
  rule();
  text(`Ticket Nro: ${ticket}`);
  text(`Fecha: ${dateText}`);
  const condicionCredito = venta.metodo_pago?.toLowerCase().includes('crédito') || venta.estado_pago?.toLowerCase() === 'credito';
  text(`Condicion: ${condicionCredito ? 'CREDITO' : 'CONTADO'}`);
  if (venta.cliente_ruc) text(`RUC/CI: ${venta.cliente_ruc}`);
  for (const line of wrap(`Cliente: ${venta.cliente_nombre || venta.cliente || 'SIN NOMBRE'}`, width)) text(line);
  rule();

  if (items.length) {
    for (const item of items) {
      const quantity = Number(item.cantidad) || 1;
      const unitPrice = Number(item.precio_unitario_moneda ?? item.precio_venta ?? item.precio ?? item.precio_unitario ?? 0);
      const subtotal = Number(item.subtotal_moneda ?? item.subtotal ?? unitPrice * quantity);
      for (const line of wrap(item.nombre || item.nombre_producto || 'Producto', width)) text(line.toUpperCase());
      for (const line of wrap(`${quantity} x ${formatMoney(unitPrice, currency)}`, width)) text(line);
      text(fitRow('', formatMoney(subtotal, currency), width));
    }
  } else {
    text('Venta de Repuestos / Servicios');
    text(fitRow('', formatMoney(total, currency), width));
  }

  rule(); bold(true);
  text(fitRow('TOTAL:', formatMoney(total, currency), width));
  bold(false);
  text(fitRow(venta.metodo_pago || 'Efectivo', formatMoney(paid, currency), width));
  if (change > 0) text(fitRow('Vuelto:', formatMoney(change, currency), width));
  if (balance > 0) text(fitRow('Saldo pendiente:', formatMoney(balance, currency), width));
  if (currency === 'PYG') text(`Liquidacion IVA (10%): ${formatMoney(Math.round(total / 11), currency)}`);
  rule(); center('Gracias por su compra!');
  push(0x0a, 0x0a, 0x1d, 0x56, 0x00); // Feed and full cut (ignored by printers without a cutter).
  return asBase64(commands);
}

async function requestBridge(path, payload, timeoutMs = 2500) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${BRIDGE_URL}${path}`, {
      method: payload ? 'POST' : 'GET',
      headers: payload ? { 'Content-Type': 'application/json' } : undefined,
      body: payload ? JSON.stringify(payload) : undefined,
      signal: controller.signal,
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result.ok) throw new Error(result.error || 'No se pudo completar la impresión ESC/POS.');
    return result;
  } catch (error) {
    if (error.name === 'AbortError') throw new Error('Se agotó el tiempo de espera del puente de impresión local.');
    throw error;
  } finally { clearTimeout(timer); }
}

export async function printEscPos(printer, venta, empresa = {}) {
  if (!printer || printer.connection !== 'Network' || !printer.ip) throw new Error('La impresión ESC/POS requiere una impresora de red con IP configurada.');
  await requestBridge('/health');
  return requestBridge('/api/printer/print', {
    ip: printer.ip,
    port: Number(printer.port || 9100),
    bytesBase64: buildEscPosReceipt(venta, empresa, printer.characters || 42),
  }, 10000);
}

export async function checkPrinterBridge() {
  return requestBridge('/health');
}
