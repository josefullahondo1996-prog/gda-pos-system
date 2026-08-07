import React, { useState } from 'react';
import { useEmpresaInfo } from './utils/useEmpresa';
import { generateCierreCajaPDF } from './utils/generateCierreCajaPDF';

const formatGs = (v) => `Gs ${Number(v || 0).toLocaleString('es-PY')}`;
const formatDuracion = (inicio, fin) => {
  const ms = new Date(fin).getTime() - new Date(inicio).getTime();
  const horas = Math.floor(ms / 3600000);
  const min = Math.floor((ms % 3600000) / 60000);
  return `${horas}h ${min}min`;
};

const ReporteCierreCaja = ({ reporte, onVolver }) => {
  const { nombre: nombreEmpresa, direccion: direccionEmpresa, telefono: telefonoEmpresa } = useEmpresaInfo();
  const [formatoTicket, setFormatoTicket] = useState('80mm');

  if (!reporte) {
    return (
      <div className="text-center text-gray-400 mt-20">
        No hay datos de cierre para mostrar.
        <div className="mt-4">
          <button onClick={onVolver} className="bg-orange-500 text-white px-4 py-2 rounded-lg font-bold">
            Volver al inicio
          </button>
        </div>
      </div>
    );
  }

  const copiarResumen = () => {
    const texto = `Cierre de Caja #${reporte.cajaId}\n${reporte.sucursal}\nVentas del turno: ${formatGs(reporte.totalVentas)}\nMonto inicial: ${formatGs(reporte.fondoApertura)}\nMonto cierre (conteo real): ${formatGs(reporte.conteoReal)}\nTotal gastos: ${formatGs(reporte.totalGastos)}`;
    navigator.clipboard.writeText(texto);
    alert('Resumen copiado al portapapeles');
  };

  const imprimirTermico = () => {
    generateCierreCajaPDF(reporte, { nombre: nombreEmpresa, direccion: direccionEmpresa, telefono: telefonoEmpresa }, formatoTicket);
  };

  const descargarCSV = () => {
    const filas = [
      ['Sucursal', reporte.sucursal],
      ['Caja', reporte.cajaId],
      ['Desde', new Date(reporte.fechaApertura).toLocaleString('es-PY')],
      ['Hasta', new Date(reporte.fechaCierre).toLocaleString('es-PY')],
      ['Operador', reporte.operador],
      ['Ventas efectivo', reporte.ventasEfectivo],
      ['Ventas tarjeta', reporte.ventasTarjeta],
      ['Ventas transferencia', reporte.ventasTransferencia],
      ['Total ventas', reporte.totalVentas],
      ['Fondo apertura', reporte.fondoApertura],
      ['Total gastos', reporte.totalGastos],
      ['Conteo real', reporte.conteoReal],
      ['Diferencia', reporte.diferencia],
      ['Nota', reporte.notaCierre || ''],
    ];
    const csv = filas.map((f) => f.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `cierre-caja-${reporte.cajaId}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="max-w-3xl mx-auto">

      <div className="flex flex-wrap gap-2 mb-4 items-center">
        <button onClick={() => window.print()} className="bg-orange-500 text-white text-sm font-bold px-4 py-2 rounded-lg hover:bg-orange-600">🖶 Imprimir</button>
        <button onClick={descargarCSV} className="bg-green-600 text-white text-sm font-bold px-4 py-2 rounded-lg hover:bg-green-700">📊 Descargar CSV</button>
        <button onClick={copiarResumen} className="bg-blue-600 text-white text-sm font-bold px-4 py-2 rounded-lg hover:bg-blue-700">🔗 Compartir / Copiar</button>

        <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1 ml-1">
          <button
            onClick={() => setFormatoTicket('80mm')}
            className={`text-xs font-bold px-2.5 py-1.5 rounded ${formatoTicket === '80mm' ? 'bg-white shadow text-gray-800' : 'text-gray-500'}`}
          >
            80mm
          </button>
          <button
            onClick={() => setFormatoTicket('58mm')}
            className={`text-xs font-bold px-2.5 py-1.5 rounded ${formatoTicket === '58mm' ? 'bg-white shadow text-gray-800' : 'text-gray-500'}`}
          >
            58mm
          </button>
        </div>
        <button onClick={imprimirTermico} className="bg-[#1e2a4a] text-white text-sm font-bold px-4 py-2 rounded-lg hover:bg-[#28365f]">
          🧾 Imprimir ticket ({formatoTicket})
        </button>

        <button onClick={onVolver} className="ml-auto border border-gray-300 text-gray-700 text-sm font-bold px-4 py-2 rounded-lg hover:bg-gray-50">🏠 Volver al inicio</button>
      </div>

      <div className="bg-[#1e2a4a] text-white rounded-t-xl p-6 flex justify-between items-start">
        <div>
          <h1 className="font-black text-lg">{reporte.sucursal.toUpperCase()}</h1>
          <p className="text-gray-300 text-sm">Fin del día</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-4 text-xs">
            <div><p className="text-gray-400 uppercase font-bold mb-1">Desde</p><p>{new Date(reporte.fechaApertura).toLocaleString('es-PY')}</p></div>
            <div><p className="text-gray-400 uppercase font-bold mb-1">Hasta</p><p>{new Date(reporte.fechaCierre).toLocaleString('es-PY')}</p></div>
            <div><p className="text-gray-400 uppercase font-bold mb-1">Duración</p><p>{formatDuracion(reporte.fechaApertura, reporte.fechaCierre)}</p></div>
            <div><p className="text-gray-400 uppercase font-bold mb-1">Cajero</p><p>{reporte.operador}</p></div>
          </div>
        </div>
        <span className="bg-[#2b3a5c] text-xs font-bold px-3 py-1 rounded-full">CAJA #{reporte.cajaId}</span>
      </div>

      <div className="bg-white border border-gray-200 border-t-0 rounded-b-xl p-6">

        <div className="grid grid-cols-3 gap-4 mb-6">
          <div className="bg-blue-50 border border-blue-100 rounded-lg p-4">
            <p className="text-[11px] font-bold text-blue-400 uppercase mb-1">Ventas del turno</p>
            <p className="text-blue-700 font-black text-xl">{formatGs(reporte.totalVentas)}</p>
            <p className="text-[11px] text-gray-500 mt-1">{reporte.cantVentas} venta(s)</p>
          </div>
          <div className="bg-green-50 border border-green-100 rounded-lg p-4">
            <p className="text-[11px] font-bold text-green-500 uppercase mb-1">Monto inicial</p>
            <p className="text-green-700 font-black text-xl">{formatGs(reporte.fondoApertura)}</p>
          </div>
          <div className="bg-purple-50 border border-purple-100 rounded-lg p-4">
            <p className="text-[11px] font-bold text-purple-400 uppercase mb-1">Monto cierre</p>
            <p className="text-purple-700 font-black text-xl">{formatGs(reporte.conteoReal)}</p>
          </div>
        </div>

        <div className="mb-6">
          <p className="font-bold text-gray-700 mb-2 text-sm">💳 Pagos por método</p>
          <div className="border border-gray-200 rounded-lg divide-y divide-gray-100">
            {[
              { label: 'Efectivo', valor: reporte.ventasEfectivo },
              { label: 'Tarjeta', valor: reporte.ventasTarjeta },
              { label: 'Transferencia', valor: reporte.ventasTransferencia },
            ].filter(m => m.valor > 0).map((m) => (
              <div key={m.label} className="flex justify-between px-4 py-2 text-sm">
                <span className="text-gray-600">{m.label}</span>
                <span className="font-bold text-gray-800">{formatGs(m.valor)}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="mb-6">
          <p className="font-bold text-gray-700 mb-2 text-sm">➖ Gastos y arqueo</p>
          <div className="border border-gray-200 rounded-lg divide-y divide-gray-100 text-sm">
            <div className="flex justify-between px-4 py-2"><span className="text-gray-600">Total gastos del turno</span><span className="font-bold text-red-600">{formatGs(reporte.totalGastos)}</span></div>
            <div className="flex justify-between px-4 py-2"><span className="text-gray-600">Saldo teórico en efectivo</span><span className="font-bold text-gray-700">{formatGs(reporte.saldoTeorico)}</span></div>
            <div className="flex justify-between px-4 py-2">
              <span className="text-gray-600">Diferencia</span>
              <span className={`font-bold ${reporte.cajaCuadrada ? 'text-green-600' : 'text-red-600'}`}>
                {reporte.cajaCuadrada ? 'Caja cuadrada ✅' : `${formatGs(Math.abs(reporte.diferencia))} (${reporte.diferencia > 0 ? 'sobrante' : 'faltante'})`}
              </span>
            </div>
          </div>
        </div>

        {reporte.notaCierre && (
          <div className="mb-2">
            <p className="font-bold text-gray-700 mb-2 text-sm">📝 Nota de cierre</p>
            <p className="text-sm text-gray-600 bg-gray-50 border border-gray-100 rounded-lg p-3">{reporte.notaCierre}</p>
          </div>
        )}

        <p className="text-center text-[11px] text-gray-400 mt-6">
          Generado el {new Date().toLocaleString('es-PY')} · {reporte.sucursal}
        </p>
      </div>
    </div>
  );
};

export default ReporteCierreCaja;