import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

// Genera un PDF de "Nota de Remisión" (detalle de productos entregados, sin precios).
// No toca generateReceipt.js: es un generador independiente para no romper la impresión
// de facturas que ya funciona.
export const generateNotaRemision = (venta, detalles = [], empresa = {}) => {
  try {
    const nombreNegocio = empresa.nombre || 'MI EMPRESA';
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: [80, 160 + detalles.length * 5] });

    doc.setFont('Helvetica', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(0, 66, 132);
    doc.text('NOTA DE REMISIÓN', 40, 12, { align: 'center' });

    doc.setFont('Helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(100);
    doc.text(nombreNegocio, 40, 17, { align: 'center' });
    doc.text('--------------------------------------------------', 40, 22, { align: 'center' });

    doc.setFont('Helvetica', 'bold');
    doc.setTextColor(60);
    doc.text(`Cliente: ${venta.cliente || 'Cliente Ocasional'}`, 5, 28);
    doc.setFont('Helvetica', 'normal');
    doc.text(`Fecha: ${venta.fecha ? new Date(venta.fecha).toLocaleDateString('es-PY') : '—'}`, 5, 33);
    doc.text(`Comprobante venta: N° ${venta.id || '—'}`, 5, 38);
    doc.text('--------------------------------------------------', 40, 43, { align: 'center' });

    autoTable(doc, {
      startY: 46,
      theme: 'plain',
      styles: { fontSize: 8, cellPadding: 1, textColor: [60, 60, 60] },
      headStyles: { fontStyle: 'bold', textColor: [0, 66, 132] },
      head: [['Producto', 'Cant.']],
      body: detalles.length > 0
        ? detalles.map((d) => [d.nombre_producto || '—', d.cantidad])
        : [['(Sin productos detallados para esta venta)', '']],
      margin: { left: 5, right: 5 },
    });

    let finalY = (doc.lastAutoTable && doc.lastAutoTable.finalY) ? doc.lastAutoTable.finalY + 10 : 60;
    doc.setFontSize(8);
    doc.setTextColor(100);
    doc.text('Firma de conformidad de recepción:', 5, finalY);
    doc.text('____________________________', 5, finalY + 12);

    doc.save(`NotaRemision_${venta.id || 'NUEVA'}.pdf`);
  } catch (error) {
    console.error('Error al generar la nota de remisión:', error);
    alert('Error al generar la nota de remisión: ' + error.message);
  }
};