const formatGs = (v) => `${Number(v || 0).toLocaleString('es-PY')}`;
const formatMoneda = (v, moneda = 'PYG') => {
  const opciones = moneda === 'PYG'
    ? { minimumFractionDigits: 0, maximumFractionDigits: 0 }
    : { minimumFractionDigits: 2, maximumFractionDigits: 2 };
  const cantidad = Number(v || 0).toLocaleString(moneda === 'BRL' ? 'pt-BR' : 'es-PY', opciones);
  return moneda === 'BRL' ? `R$ ${cantidad}` : moneda === 'USD' ? `USD ${cantidad}` : moneda === 'EUR' ? `€ ${cantidad}` : `${cantidad} Gs.`;
};
const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[character]));

// Normaliza los ítems vengan del carrito del POS (nombre, precio_venta/precio) o
// de detalle_ventas ya guardado (nombre_producto, subtotal).
const normalizarItems = (venta) => {
  const items = venta.items || venta.detalle || [];
  return items.map((it) => {
    const nombre = it.nombre || it.nombre_producto || 'Producto';
    const cantidad = Number(it.cantidad) || 1;
    const precioUnitario =
      it.precio_venta ?? it.precio ?? it.precio_unitario ??
      (it.subtotal ? it.subtotal / cantidad : 0);
    const subtotal = it.subtotal ?? precioUnitario * cantidad;
    return {
      nombre,
      cantidad,
      precioUnitario: it.precio_unitario_moneda ?? precioUnitario,
      subtotal: it.subtotal_moneda ?? subtotal,
    };
  });
};

/**
 * Genera el ticket en HTML (CSS @page para 80mm/58mm) y abre la ventana de impresión.
 * @param {object} venta     - venta con .items / .detalle, .cliente, .cliente_ruc, .total, etc.
 * @param {object} empresa   - { nombre, ruc, telefono, direccion }
 * @param {'80mm'|'58mm'} formato
 * @param {boolean} autoImprimir abre el diálogo de impresión automáticamente
 */
export const generateReceipt = (venta, empresa = {}, formato = '80mm', autoImprimir = false) => {
  try {
    const es58       = formato === '58mm';
    const paperWidth = es58 ? '58mm' : '80mm';
    const bodyWidth  = es58 ? '50mm' : '72mm';

    const nombreNegocio = (empresa.nombre || 'MI EMPRESA').toUpperCase();
    const logoUrl = String(empresa.logo_url || '').trim();
    const logoSeguro = /^(https:\/\/|data:image\/(png|jpeg|webp|svg\+xml);base64,)/i.test(logoUrl) ? logoUrl : '';
    const logoHtml = logoSeguro
      ? `<img src="${escapeHtml(logoSeguro)}" alt="Logotipo de ${escapeHtml(empresa.nombre || 'la empresa')}" style="display:block;max-width:75%;max-height:18mm;margin:0 auto 4px;object-fit:contain;" />`
      : '';
    const items         = normalizarItems(venta);
    const moneda = ['PYG', 'USD', 'EUR', 'BRL'].includes(venta.moneda_venta) ? venta.moneda_venta : 'PYG';

    // ── Número de ticket ──────────────────────────────────────────────────────
    const ticketRaw = venta.numero_factura || String(venta.id || '0');
    const ticketId  = /^\d{3}-\d{3}-\d+$/.test(ticketRaw)
      ? ticketRaw
      : `001-001-${ticketRaw.padStart(7, '0')}`;

    // ── Fecha formateada ──────────────────────────────────────────────────────
    const fechaObj = venta.fecha ? new Date(venta.fecha) : new Date();
    const fechaStr =
      fechaObj.toLocaleDateString('es-PY', { day: '2-digit', month: '2-digit', year: 'numeric' }) +
      ' ' +
      fechaObj.toLocaleTimeString('es-PY', { hour: '2-digit', minute: '2-digit' });

    // ── Cliente ───────────────────────────────────────────────────────────────
    const clienteNombre = venta.cliente_nombre || venta.cliente || 'SIN NOMBRE';
    const clienteRuc    = venta.cliente_ruc    || '';

    // ── Condición de venta ────────────────────────────────────────────────────
    const condicion =
      venta.metodo_pago?.toLowerCase().includes('crédito') ||
      venta.estado_pago?.toLowerCase() === 'credito'
        ? 'CRÉDITO'
        : 'CONTADO';

    // ── Filas de productos ────────────────────────────────────────────────────
    let itemsHtml = '';
    if (items.length > 0) {
      items.forEach((it) => {
        const nombre = it.nombre.length > 22
          ? it.nombre.substring(0, 21) + '…'
          : it.nombre;
        itemsHtml += `
      <tr>
        <td style="text-align:left;vertical-align:top;padding:2px 0;">${escapeHtml(it.cantidad)}</td>
        <td style="vertical-align:top;padding:2px 4px;">
          <div style="text-transform:uppercase;word-break:break-word;">${escapeHtml(nombre)}</div>
          <div style="font-size:9px;color:#333;">${escapeHtml(it.cantidad)} x ${formatMoneda(it.precioUnitario, moneda)}</div>
        </td>
        <td style="text-align:right;vertical-align:top;padding:2px 0;white-space:nowrap;">${formatMoneda(it.subtotal, moneda)}</td>
      </tr>`;
      });
    } else {
      itemsHtml = `
      <tr>
        <td>1</td>
        <td style="padding:2px 4px;">Venta de Repuestos / Servicios</td>
        <td style="text-align:right;">${formatMoneda(venta.total_moneda ?? venta.total, moneda)}</td>
      </tr>`;
    }

    // ── Pagos ─────────────────────────────────────────────────────────────────
    const metodoPagoLabel = venta.metodo_pago || 'Efectivo';
    const total           = Number(venta.total_moneda ?? venta.total ?? 0);
    const montoPagado     = Number(venta.monto_pagado_moneda ?? venta.monto_pagado ?? total);
    const vuelto          = montoPagado > total ? montoPagado - total : 0;
    const saldoPendiente  = Number(venta.saldo_pendiente_moneda ?? venta.saldo_pendiente ?? 0);

    let pagoHtml = `
      <tr>
        <td style="padding:1px 0;">${escapeHtml(metodoPagoLabel)}:</td>
        <td style="text-align:right;padding:1px 0;">${formatMoneda(montoPagado, moneda)}</td>
      </tr>`;

    if (vuelto > 0) {
      pagoHtml += `
      <tr>
        <td style="padding:1px 0;"><b>Vuelto:</b></td>
        <td style="text-align:right;padding:1px 0;"><b>${formatMoneda(vuelto, moneda)}</b></td>
      </tr>`;
    }

    if (saldoPendiente > 0) {
      pagoHtml += `
      <tr>
        <td style="padding:1px 0;color:#c00;"><b>Saldo pendiente:</b></td>
        <td style="text-align:right;padding:1px 0;color:#c00;"><b>${formatMoneda(saldoPendiente, moneda)}</b></td>
      </tr>`;
    }

    // ── IVA 10% (fórmula paraguaya: total / 11, redondeado) ──────────────────
    const iva10 = Math.round(total / 11);

    // ── HTML completo ─────────────────────────────────────────────────────────
    const htmlContent = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <title>Ticket_${escapeHtml(ticketId)}</title>
  <style>
    @media print {
      @page {
        margin: 0;
        size: ${paperWidth} auto;
      }
      body { margin: 0; padding: 0; background: #fff; }
    }
    body {
      font-family: 'Courier New', Courier, monospace;
      width: ${bodyWidth};
      margin: 0 auto;
      padding: 5px;
      font-size: 12px;
      font-weight: 600;
      background: #fff;
      color: #000;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .text-center { text-align: center; }
    .text-right  { text-align: right; }
    .bold        { font-weight: bold; }
    .line {
      border: none;
      border-top: 1px dashed #000;
      margin: 5px 0;
    }
    table { width: 100%; border-collapse: collapse; }
    th {
      font-size: 10px;
      text-align: left;
      border-bottom: 1px dashed #000;
      padding-bottom: 3px;
    }
    td { font-size: 11px; font-weight: 600; }
    .right { text-align: right; }
  </style>
</head>
<body>

  <!-- CABECERA -->
  ${logoHtml}
  <div class="text-center bold" style="font-size:13px;margin-bottom:2px;">${escapeHtml(nombreNegocio)}</div>
  ${empresa.ruc       ? `<div class="text-center" style="font-size:10px;">RUC: ${escapeHtml(empresa.ruc)}</div>`       : ''}
  ${empresa.telefono  ? `<div class="text-center" style="font-size:10px;">Tel: ${escapeHtml(empresa.telefono)}</div>`  : ''}
  ${empresa.direccion ? `<div class="text-center" style="font-size:10px;">${escapeHtml(empresa.direccion)}</div>`      : ''}

  <div class="line"></div>

  <!-- INFO DEL TICKET -->
  <div><b>Ticket N\xb0:</b> ${escapeHtml(ticketId)}</div>
  <div><b>Fecha:</b> ${fechaStr}</div>
  <div><b>Condici\xf3n:</b> ${condicion}</div>
  ${clienteRuc ? `<div><b>RUC/CI:</b> ${escapeHtml(clienteRuc)}</div>` : ''}
  <div><b>Cliente:</b> ${escapeHtml(clienteNombre)}</div>

  <div class="line"></div>

  <!-- TABLA DE PRODUCTOS -->
  <table>
    <thead>
      <tr>
        <th style="width:10%;">Cant.</th>
        <th style="width:62%;">Producto</th>
        <th class="right" style="width:28%;">Total</th>
      </tr>
    </thead>
    <tbody>
      ${itemsHtml}
    </tbody>
  </table>

  <div class="line"></div>

  <!-- TOTALES -->
  <table>
    <tr>
      <td class="bold" style="font-size:13px;">TOTAL:</td>
      <td class="right bold" style="font-size:13px;">${formatMoneda(total, moneda)}</td>
    </tr>
    ${pagoHtml}
  </table>

  <div class="line"></div>

  <!-- IVA Y CIERRE -->
  ${moneda === 'PYG' ? `<div class="text-center" style="font-size:10px;">Liquidaci\xf3n IVA: (10%) ${formatGs(iva10)} Gs.</div>` : ''}
  <div class="line"></div>
  <div class="text-center bold" style="font-size:11px;margin-top:4px;">\xa1Gracias por su compra!</div>

  <script>
    window.onload = function () {
      if (${autoImprimir ? 'true' : 'false'}) setTimeout(function () { window.print(); }, 300);
    };
    window.onafterprint = function () { window.close(); };
  <\/script>
</body>
</html>`;

    const printWindow = window.open('', '_blank', 'width=380,height=650');
    if (printWindow) {
      printWindow.document.open();
      printWindow.document.write(htmlContent);
      printWindow.document.close();
    } else {
      alert('Tu navegador bloqueó la ventana emergente. Por favor permite los "Pop-ups" para este sitio para poder imprimir tickets.');
    }

  } catch (error) {
    console.error('Error al generar el ticket HTML:', error);
    alert('Error al generar el ticket: ' + error.message);
  }
};
