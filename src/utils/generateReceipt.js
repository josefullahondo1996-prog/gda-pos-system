import { jsPDF } from 'jspdf';

const formatGs = (v) => `${Number(v || 0).toLocaleString('es-PY')}`;

// Normaliza los ítems vengan del carrito del POS (nombre, precio_venta/precio) o
// de detalle_ventas ya guardado (nombre_producto, subtotal). No rompe ningún llamado
// existente: si no hay ítems, cae al resumen de una sola línea como antes.
const normalizarItems = (venta) => {
  const items = venta.items || venta.detalle || [];
  return items.map((it) => {
    const nombre = it.nombre || it.nombre_producto || 'Producto';
    const cantidad = Number(it.cantidad) || 1;
    const precioUnitario = it.precio_venta ?? it.precio ?? it.precio_unitario ?? (it.subtotal ? it.subtotal / cantidad : 0);
    const subtotal = it.subtotal ?? precioUnitario * cantidad;
    return { nombre, cantidad, subtotal };
  });
};

/**
 * Genera (y opcionalmente imprime automáticamente) el ticket de venta para impresora térmica.
 * @param {object} venta - venta guardada, con .items (carrito) o .detalle (detalle_ventas) si hay
 * @param {object} empresa - { nombre, direccion, telefono, ruc }
 * @param {'80mm'|'58mm'} formato
 * @param {boolean} autoImprimir - si true, abre el diálogo de impresión del navegador automáticamente
 *                                  (para imprimir directo en la térmica sin tener que abrir el PDF a mano).
 *                                  Si false (o se omite), descarga el PDF como siempre.
 */
export const generateReceipt = (venta, empresa = {}, formato = '80mm', autoImprimir = false) => {
  try {
    const es58 = formato === '58mm';
    const anchoPagina = es58 ? 58 : 80;
    const margen = es58 ? 3 : 5;
    const anchoUtil = anchoPagina - margen * 2;
    const centro = anchoPagina / 2;

    const fTitulo = es58 ? 10 : 12;
    const fSub = es58 ? 6.5 : 8;
    const fTexto = es58 ? 7 : 8.5;
    const fTotal = es58 ? 9 : 10.5;

    const nombreNegocio = (empresa.nombre || 'MI EMPRESA').toUpperCase();
    const items = normalizarItems(venta);
    const lineasProducto = items.length > 0 ? items.length : 1;

    // Altura dinámica según cantidad de productos
    const alturaBase = es58 ? 60 : 65;
    const altura = alturaBase + lineasProducto * (es58 ? 7 : 6);

    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: [anchoPagina, altura] });

    let y = es58 ? 7 : 9;

    doc.setFont('Helvetica', 'bold');
    doc.setFontSize(fTitulo);
    doc.setTextColor(0, 66, 132);
    doc.text(nombreNegocio, centro, y, { align: 'center' });
    y += es58 ? 4.5 : 5.5;

    doc.setFont('Helvetica', 'normal');
    doc.setFontSize(fSub);
    doc.setTextColor(100);
    if (empresa.direccion) { doc.text(empresa.direccion, centro, y, { align: 'center' }); y += es58 ? 3.2 : 4; }
    if (empresa.telefono) { doc.text(`Tel: ${empresa.telefono}`, centro, y, { align: 'center' }); y += es58 ? 3.2 : 4; }
    if (empresa.ruc) { doc.text(`RUC: ${empresa.ruc}`, centro, y, { align: 'center' }); y += es58 ? 3.2 : 4; }

    y += 0.5;
    doc.setDrawColor(180);
    doc.line(margen, y, anchoPagina - margen, y);
    y += es58 ? 4 : 5;

    doc.setFont('Helvetica', 'bold');
    doc.setFontSize(fTexto);
    doc.setTextColor(60);
    doc.text(`Cliente: ${venta.cliente_nombre || venta.cliente || 'Cliente Ocasional'}`, margen, y);
    y += es58 ? 3.6 : 4.4;

    doc.setFont('Helvetica', 'normal');
    doc.setTextColor(90);
    doc.text(`Fecha: ${venta.fecha ? new Date(venta.fecha).toLocaleDateString('es-PY') : new Date().toLocaleDateString('es-PY')}`, margen, y);
    y += es58 ? 3.6 : 4.4;
    doc.text(`Comprobante: TICKET-${String(venta.id || '0').padStart(4, '0')}`, margen, y);
    y += es58 ? 4 : 4.8;

    doc.setDrawColor(180);
    doc.line(margen, y, anchoPagina - margen, y);
    y += es58 ? 3.6 : 4.4;

    // --- Ítems (uno por producto si hay carrito/detalle; si no, resumen genérico) ---
    doc.setFont('Helvetica', 'bold');
    doc.setFontSize(fTexto);
    doc.setTextColor(30);
    doc.text('Producto', margen, y);
    doc.text('Total', anchoPagina - margen, y, { align: 'right' });
    y += es58 ? 3.4 : 4;
    doc.setDrawColor(220);
    doc.line(margen, y, anchoPagina - margen, y);
    y += es58 ? 3.2 : 3.8;

    doc.setFont('Helvetica', 'normal');
    doc.setFontSize(fTexto);
    doc.setTextColor(60);

    if (items.length > 0) {
      items.forEach((it) => {
        const nombreCorto = doc.splitTextToSize(`${it.cantidad}x ${it.nombre}`, anchoUtil - (es58 ? 14 : 18));
        doc.text(nombreCorto, margen, y);
        doc.text(`Gs ${formatGs(it.subtotal)}`, anchoPagina - margen, y, { align: 'right' });
        y += nombreCorto.length * (es58 ? 3.2 : 3.8);
      });
    } else {
      doc.text('Venta de Repuestos / Servicios', margen, y);
      doc.text(`Gs ${formatGs(venta.total)}`, anchoPagina - margen, y, { align: 'right' });
      y += es58 ? 3.6 : 4.2;
    }

    y += 1;
    doc.setDrawColor(180);
    doc.line(margen, y, anchoPagina - margen, y);
    y += es58 ? 4.2 : 5;

    doc.setFont('Helvetica', 'bold');
    doc.setFontSize(fTotal);
    doc.setTextColor(0, 0, 0);
    doc.text('TOTAL:', margen, y);
    doc.text(`Gs ${formatGs(venta.total)}`, anchoPagina - margen, y, { align: 'right' });
    y += es58 ? 4.5 : 5.5;

    if (venta.saldo_pendiente !== undefined && Number(venta.saldo_pendiente) > 0) {
      doc.setFont('Helvetica', 'bold');
      doc.setFontSize(fTexto);
      doc.setTextColor(200, 0, 0);
      doc.text(`SALDO PENDIENTE: Gs ${formatGs(venta.saldo_pendiente)}`, margen, y);
      y += es58 ? 4 : 4.8;
    }

    y += 1;
    doc.setDrawColor(180);
    doc.line(margen, y, anchoPagina - margen, y);
    y += es58 ? 4 : 5;

    doc.setFont('Helvetica', 'italic');
    doc.setFontSize(fSub);
    doc.setTextColor(120);
    doc.text('¡Gracias por su confianza!', centro, y, { align: 'center' });
    y += es58 ? 3.4 : 4;
    doc.setFont('Helvetica', 'normal');
    doc.text('Sistema POS', centro, y, { align: 'center' });

    const nombreArchivo = `Ticket_${venta.id || 'NUEVO'}.pdf`;

    if (autoImprimir) {
      // Dispara el diálogo de impresión del navegador apenas se abre el PDF,
      // para poder imprimir directo en la térmica sin tener que abrir el archivo a mano.
      doc.autoPrint();
      const blobUrl = doc.output('bloburl');
      const ventana = window.open(blobUrl, '_blank');
      if (!ventana) {
        // Si el navegador bloqueó el popup, no se pierde el ticket: se descarga igual.
        alert('Tu navegador bloqueó la ventana de impresión automática. Habilitá los popups para este sitio, o descargá el ticket manualmente.');
        doc.save(nombreArchivo);
      }
    } else {
      doc.save(nombreArchivo);
    }
  } catch (error) {
    console.error('Error al generar el ticket:', error);
    alert('Error al generar el ticket: ' + error.message);
  }
};