import { jsPDF } from 'jspdf';
import 'jspdf-autotable';

export const generateReceipt = (venta) => {
  try {
    // Configuración para ticket térmico de 80mm con altura dinámica básica
    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: [80, 160] 
    });

    // Cabecera del Negocio
    doc.setFont("Helvetica", "bold");
    doc.setFontSize(12);
    doc.setTextColor(0, 66, 132); // El azul oficial #004284
    doc.text("GDA - REPUESTOS Y SERVICIOS", 40, 12, { align: "center" });
    
    doc.setFont("Helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(100);
    doc.text("Minga Guazú - Paraguay", 40, 17, { align: "center" });
    doc.text("--------------------------------------------------", 40, 22, { align: "center" });

    // Información de la Transacción
    doc.setFont("Helvetica", "bold");
    doc.setTextColor(60);
    doc.text(`Cliente: ${venta.cliente_nombre}`, 5, 28);
    
    doc.setFont("Helvetica", "normal");
    doc.text(`Fecha: ${new Date(venta.fecha).toLocaleDateString('es-PY')}`, 5, 33);
    doc.text(`Comprobante: TICKET-000${venta.id || '00'}`, 5, 38);
    doc.text("--------------------------------------------------", 40, 43, { align: "center" });

    // Tabla de Detalles del Ticket
    doc.autoTable({
      startY: 46,
      theme: 'plain',
      styles: { fontSize: 8, cellPadding: 1, textColor: [60, 60, 60] },
      headStyles: { fontStyle: 'bold', textColor: [0, 66, 132] },
      head: [['Concepto', 'Total']],
      body: [
        ['Venta de Repuestos / Servicios', `Gs ${Number(venta.total).toLocaleString('es-PY')}`]
      ],
      margin: { left: 5, right: 5 }
    });

    // Bloque de Totales y Saldos
    let finalY = 60;
    if (doc.lastAutoTable && doc.lastAutoTable.finalY) {
      finalY = doc.lastAutoTable.finalY + 6;
    }

    doc.setFont("Helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(0, 0, 0);
    doc.text(`TOTAL FACTURA: Gs ${Number(venta.total).toLocaleString('es-PY')}`, 5, finalY);
    
    // Si la venta tiene saldo pendiente, lo mostramos de forma crítica
    if (venta.saldo_pendiente !== undefined) {
      const tieneSaldo = Number(venta.saldo_pendiente) > 0;
      doc.setTextColor(tieneSaldo ? 220 : 40, 0, 0);
      doc.text(`SALDO PENDIENTE: Gs ${Number(venta.saldo_pendiente).toLocaleString('es-PY')}`, 5, finalY + 5);
    }

    // Pie de página administrativo
    doc.setTextColor(120);
    doc.setFont("Helvetica", "italic");
    doc.setFontSize(8);
    doc.text("¡Gracias por su confianza y preferencia!", 40, finalY + 18, { align: "center" });
    doc.setFont("Helvetica", "normal");
    doc.text("GDA Sistema POS v8 Clon", 40, finalY + 23, { align: "center" });

    // Descargar el PDF automáticamente
    const nombreArchivo = `Ticket_GDA_${venta.id || 'NUEVO'}.pdf`;
    doc.save(nombreArchivo);
    
    console.log('PDF generado y descargado:', nombreArchivo);
  } catch (error) {
    console.error('Error al generar el PDF:', error);
    alert('Error al generar el PDF: ' + error.message);
  }
};
