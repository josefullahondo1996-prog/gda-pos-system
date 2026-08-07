import { jsPDF } from 'jspdf';

const formatGs = (v) => `${Number(v || 0).toLocaleString('es-PY')}`;

const formatFechaHora = (f) => {
  if (!f) return '—';
  const d = new Date(f);
  return `${d.toLocaleDateString('es-PY')} ${d.toLocaleTimeString('es-PY', { hour: '2-digit', minute: '2-digit' })}`;
};

const formatDuracion = (inicio, fin) => {
  const ms = new Date(fin).getTime() - new Date(inicio).getTime();
  if (Number.isNaN(ms) || ms < 0) return '—';
  const horas = Math.floor(ms / 3600000);
  const min = Math.floor((ms % 3600000) / 60000);
  return `${horas}h ${min}min`;
};

/**
 * Genera el PDF del cierre de caja para impresora térmica.
 * @param {object} reporte - el mismo objeto "reporte" que arma CierreCaja.jsx / usa ReporteCierreCaja.jsx
 * @param {object} empresa - { nombre, direccion, telefono, ruc } (opcional, con respaldo si falta)
 * @param {'80mm'|'58mm'} formato - ancho del rollo térmico
 */
export const generateCierreCajaPDF = (reporte, empresa = {}, formato = '80mm') => {
  try {
    if (!reporte) return;

    const es58 = formato === '58mm';
    const anchoPagina = es58 ? 58 : 80;
    const margen = es58 ? 3 : 4;
    const anchoUtil = anchoPagina - margen * 2;
    const centro = anchoPagina / 2;

    const fTitulo = es58 ? 10 : 12;
    const fSub = es58 ? 6.5 : 8;
    const fTexto = es58 ? 7 : 8.5;
    const fEtiqueta = es58 ? 6 : 7.5;
    const fTotal = es58 ? 9 : 11;

    const metodos = [
      { label: 'Efectivo', valor: reporte.ventasEfectivo },
      { label: 'Tarjeta', valor: reporte.ventasTarjeta },
      { label: 'Transferencia', valor: reporte.ventasTransferencia },
    ].filter((m) => m.valor > 0);

    // Altura dinámica según cuánto contenido va a entrar (más líneas de método de pago o nota = más alto)
    const lineasExtra = metodos.length + (reporte.notaCierre ? Math.ceil(reporte.notaCierre.length / (es58 ? 24 : 34)) + 2 : 0);
    const alturaBase = es58 ? 108 : 118;
    const altura = alturaBase + lineasExtra * (es58 ? 4.5 : 5);

    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: [anchoPagina, altura] });

    let y = es58 ? 7 : 9;
    const nombreNegocio = (empresa.nombre || reporte.sucursal || 'MI EMPRESA').toUpperCase();

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

    y += 1;
    doc.setDrawColor(180);
    doc.line(margen, y, anchoPagina - margen, y);
    y += es58 ? 4 : 5;

    doc.setFont('Helvetica', 'bold');
    doc.setFontSize(fTitulo - (es58 ? 1 : 1));
    doc.setTextColor(30);
    doc.text('CIERRE DE CAJA', centro, y, { align: 'center' });
    y += es58 ? 3.5 : 4.5;

    doc.setFont('Helvetica', 'normal');
    doc.setFontSize(fEtiqueta);
    doc.setTextColor(90);
    doc.text(`Caja #${reporte.cajaId ?? '—'}  ·  ${reporte.sucursal || ''}`, centro, y, { align: 'center' });
    y += es58 ? 4 : 5;

    // --- Datos del turno ---
    doc.setTextColor(60);
    const filaEtiquetaValor = (etiqueta, valor) => {
      doc.setFont('Helvetica', 'bold');
      doc.setFontSize(fEtiqueta);
      doc.text(etiqueta, margen, y);
      doc.setFont('Helvetica', 'normal');
      doc.setFontSize(fTexto);
      doc.text(String(valor), anchoPagina - margen, y, { align: 'right' });
      y += es58 ? 3.6 : 4.4;
    };

    filaEtiquetaValor('Apertura:', formatFechaHora(reporte.fechaApertura));
    filaEtiquetaValor('Cierre:', formatFechaHora(reporte.fechaCierre));
    filaEtiquetaValor('Duracion:', formatDuracion(reporte.fechaApertura, reporte.fechaCierre));
    filaEtiquetaValor('Cajero:', reporte.operador || '—');

    y += 1;
    doc.setDrawColor(210);
    doc.line(margen, y, anchoPagina - margen, y);
    y += es58 ? 4 : 5;

    // --- Ventas por método de pago ---
    doc.setFont('Helvetica', 'bold');
    doc.setFontSize(fTexto);
    doc.setTextColor(30);
    doc.text('VENTAS DEL TURNO', margen, y);
    y += es58 ? 3.8 : 4.6;

    metodos.forEach((m) => {
      doc.setFont('Helvetica', 'normal');
      doc.setFontSize(fTexto);
      doc.setTextColor(70);
      doc.text(m.label, margen, y);
      doc.text(`Gs ${formatGs(m.valor)}`, anchoPagina - margen, y, { align: 'right' });
      y += es58 ? 3.6 : 4.4;
    });

    doc.setFont('Helvetica', 'bold');
    doc.setFontSize(fTexto);
    doc.setTextColor(20);
    doc.text(`TOTAL (${reporte.cantVentas ?? 0} vta.)`, margen, y);
    doc.setTextColor(0, 100, 0);
    doc.text(`Gs ${formatGs(reporte.totalVentas)}`, anchoPagina - margen, y, { align: 'right' });
    y += es58 ? 4.5 : 5.5;

    doc.setDrawColor(210);
    doc.line(margen, y, anchoPagina - margen, y);
    y += es58 ? 4 : 5;

    // --- Arqueo ---
    doc.setFont('Helvetica', 'bold');
    doc.setFontSize(fTexto);
    doc.setTextColor(30);
    doc.text('ARQUEO DE CAJA', margen, y);
    y += es58 ? 3.8 : 4.6;

    filaEtiquetaValor('Fondo apertura:', `Gs ${formatGs(reporte.fondoApertura)}`);
    filaEtiquetaValor('Total gastos:', `Gs ${formatGs(reporte.totalGastos)}`);
    filaEtiquetaValor('Efectivo teorico:', `Gs ${formatGs(reporte.saldoTeorico)}`);
    filaEtiquetaValor('Conteo real:', `Gs ${formatGs(reporte.conteoReal)}`);

    y += 0.5;
    const cuadrada = reporte.cajaCuadrada;
    doc.setFillColor(cuadrada ? 230 : 255, cuadrada ? 245 : 225, cuadrada ? 230 : 225);
    doc.roundedRect(margen, y - (es58 ? 3.2 : 4), anchoUtil, es58 ? 6.5 : 8, 1, 1, 'F');
    doc.setFont('Helvetica', 'bold');
    doc.setFontSize(fTexto);
    doc.setTextColor(cuadrada ? 0 : 180, cuadrada ? 120 : 0, 0);
    const textoDif = cuadrada
      ? 'CAJA CUADRADA ✓'
      : `DIFERENCIA: Gs ${formatGs(Math.abs(reporte.diferencia))} (${reporte.diferencia > 0 ? 'sobrante' : 'faltante'})`;
    doc.text(textoDif, centro, y + (es58 ? 1.3 : 1.5), { align: 'center' });
    y += es58 ? 7 : 9;

    // --- Nota ---
    if (reporte.notaCierre) {
      doc.setDrawColor(210);
      doc.line(margen, y, anchoPagina - margen, y);
      y += es58 ? 4 : 5;
      doc.setFont('Helvetica', 'bold');
      doc.setFontSize(fEtiqueta);
      doc.setTextColor(30);
      doc.text('NOTA:', margen, y);
      y += es58 ? 3.4 : 4;
      doc.setFont('Helvetica', 'normal');
      doc.setFontSize(fEtiqueta);
      doc.setTextColor(80);
      const lineasNota = doc.splitTextToSize(reporte.notaCierre, anchoUtil);
      doc.text(lineasNota, margen, y);
      y += lineasNota.length * (es58 ? 3.2 : 3.8) + 1;
    }

    y += 2;
    doc.setDrawColor(180);
    doc.line(margen, y, anchoPagina - margen, y);
    y += es58 ? 4 : 5;

    doc.setFont('Helvetica', 'normal');
    doc.setFontSize(fEtiqueta - 0.5);
    doc.setTextColor(130);
    doc.text(`Generado: ${formatFechaHora(new Date())}`, centro, y, { align: 'center' });
    y += es58 ? 3 : 3.6;
    doc.text('Sistema POS', centro, y, { align: 'center' });

    doc.save(`Cierre_Caja_${reporte.cajaId || 'NUEVO'}_${formato}.pdf`);
  } catch (error) {
    console.error('Error al generar el PDF de cierre de caja:', error);
    alert('Error al generar el ticket de cierre: ' + error.message);
  }
};