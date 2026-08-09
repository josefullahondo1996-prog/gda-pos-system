const formatGs = (v) => `${Number(v || 0).toLocaleString('es-PY')}`;

// Normaliza los ítems vengan del carrito del POS (nombre, precio_venta/precio) o
// de detalle_ventas ya guardado (nombre_producto, subtotal).
const normalizarItems = (venta) => {
  const items = venta.items || venta.detalle || [];
  return items.map((it) => {
    const nombre = it.nombre || it.nombre_producto || 'Producto';
    const cantidad = Number(it.cantidad) || 1;
    const precioUnitario = it.precio_venta ?? it.precio ?? it.precio_unitario ?? (it.subtotal ? it.subtotal / cantidad : 0);
    const subtotal = it.subtotal ?? precioUnitario * cantidad;
    return { nombre, cantidad, precioUnitario, subtotal };
  });
};

/**
 * Genera el ticket en HTML (usando CSS @page para 80mm/58mm) y lanza la impresión.
 * @param {object} venta - venta guardada, con .items o .detalle
 * @param {object} empresa - { nombre, direccion, telefono, ruc }
 * @param {'80mm'|'58mm'} formato
 * @param {boolean} autoImprimir - (Con HTML siempre se lanza el modal de impresión de Chrome)
 */
export const generateReceipt = (venta, empresa = {}, formato = '80mm', autoImprimir = false) => {
  try {
    const es58 = formato === '58mm';
    const paperWidth = es58 ? '58mm' : '80mm';
    const containerWidth = es58 ? '180px' : '280px';
    const nombreNegocio = (empresa.nombre || 'MI EMPRESA').toUpperCase();
    const items = normalizarItems(venta);
    
    // Construir filas de ítems
    let itemsHtml = '';
    items.forEach(it => {
       itemsHtml += `
         <div style="margin-bottom: 6px;">
            <div style="font-size: 11px; text-transform: uppercase;">${it.nombre}</div>
            <div class="flex-between" style="font-size: 11px;">
               <span>${it.cantidad} X ${formatGs(it.precioUnitario)}</span>
               <span>${formatGs(it.subtotal)}</span>
            </div>
         </div>
       `;
    });

    if (items.length === 0) {
      itemsHtml = `
         <div class="flex-between" style="font-size: 11px;">
            <span>Venta de Repuestos / Servicios</span>
            <span>${formatGs(venta.total)}</span>
         </div>
      `;
    }

    const fechaStr = venta.fecha ? new Date(venta.fecha).toLocaleString('es-PY') : new Date().toLocaleString('es-PY');
    const condicionVenta = venta.metodo_pago?.includes('Crédito') ? 'CRÉDITO' : 'CONTADO';
    const clienteStr = venta.cliente_nombre || venta.cliente || 'SIN NOMBRE';
    const ticketId = String(venta.id || '0').padStart(8, '0');

    let pagoHtml = '';
    if (venta.monto_pagado !== undefined) {
      pagoHtml += `
        <div class="flex-between" style="font-size: 11px; margin-top: 5px;">
           <span>Formas de Pago: EFECTIVO / OTRO</span>
           <span>${formatGs(venta.monto_pagado)}</span>
        </div>
      `;
      const vuelto = Number(venta.monto_pagado) - Number(venta.total);
      if (vuelto > 0) {
        pagoHtml += `
          <div class="flex-between bold" style="font-size: 11px; margin-top: 2px;">
             <span>VUELTO</span>
             <span>${formatGs(vuelto)}</span>
          </div>
        `;
      }
    }

    let saldoPendienteHtml = '';
    if (venta.saldo_pendiente !== undefined && Number(venta.saldo_pendiente) > 0) {
       saldoPendienteHtml = `
          <div class="flex-between bold" style="font-size: 11px; margin-top: 2px;">
             <span>SALDO PENDIENTE</span>
             <span>${formatGs(venta.saldo_pendiente)}</span>
          </div>
       `;
    }

    // HTML completo a inyectar en la nueva ventana
    const htmlContent = `
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <title>Ticket_${ticketId}</title>
  <style>
    /* Estilos base para la pantalla y la impresión */
    body {
      font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
      margin: 0;
      padding: 0;
      color: #000;
      background: #f0f0f0;
    }
    
    /* MAGIA PARA LA IMPRESORA TÉRMICA */
    @media print {
      @page {
        size: ${paperWidth} auto;
        margin: 0;
      }
      body {
        margin: 0;
        padding: 0;
        width: 100%;
        display: flex;
        justify-content: center;
        background: #fff;
      }
    }

    .ticket {
      width: ${containerWidth};
      margin: 0 auto;
      padding: 15px 10px;
      background: #fff;
      box-sizing: border-box;
    }
    
    .text-center { text-align: center; }
    .bold { font-weight: bold; }
    .text-sm { font-size: 11px; }
    .text-xs { font-size: 9px; }
    .divider {
      border-top: 1px dashed #000;
      margin: 8px 0;
    }
    .flex-between {
      display: flex;
      justify-content: space-between;
    }
    .mb-1 { margin-bottom: 4px; }
  </style>
</head>
<body>
  <div class="ticket">
    <!-- Cabecera -->
    <div class="text-center bold" style="font-size: 15px; margin-bottom: 5px;">${nombreNegocio}</div>
    ${empresa.ruc ? `<div class="text-center text-xs mb-1">RUC: ${empresa.ruc}</div>` : ''}
    ${empresa.direccion ? `<div class="text-center text-xs mb-1">${empresa.direccion}</div>` : ''}
    ${empresa.telefono ? `<div class="text-center text-xs mb-1">Tel: ${empresa.telefono}</div>` : ''}
    
    <div class="divider"></div>
    
    <!-- Info Venta -->
    <div class="text-center bold text-sm mb-1">TICKET Nº: ${ticketId}</div>
    <div class="text-sm mb-1">Fecha de Emisión: ${fechaStr}</div>
    <div class="text-sm mb-1">Cond. de Venta: ${condicionVenta}</div>
    <div class="text-sm mb-1">Cliente: ${clienteStr}</div>
    
    <div class="divider"></div>
    
    <!-- Encabezado Ítems -->
    <div class="flex-between bold text-xs mb-1">
      <span>Descripción</span>
      <span>Total Item</span>
    </div>
    <div class="divider"></div>
    
    <!-- Ítems -->
    ${itemsHtml}
    
    <div class="divider"></div>
    
    <!-- Totales -->
    <div class="flex-between bold" style="font-size: 14px; margin-bottom: 5px;">
      <span>TOTAL:</span>
      <span>Gs ${formatGs(venta.total)}</span>
    </div>
    
    ${pagoHtml}
    ${saldoPendienteHtml}
    
    <div class="divider"></div>
    <div class="text-center text-xs mb-1" style="font-style: italic;">¡Gracias por su confianza!</div>
    <div class="text-center text-xs">Sistema POS</div>
  </div>
  
  <script>
    // Inicia la impresión ni bien cargue la ventanita
    window.onload = function() {
      setTimeout(() => {
         window.print();
      }, 300);
    };
    
    // Cierra la ventanita sola cuando el usuario cancela o termina de imprimir
    window.onafterprint = function() {
      window.close();
    };
  </script>
</body>
</html>
    `;

    // Abrimos una ventana emergente ("popup")
    const printWindow = window.open('', '_blank', 'width=350,height=600');
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