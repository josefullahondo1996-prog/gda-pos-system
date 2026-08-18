import React, { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';
import { useEmpresaInfo } from './utils/useEmpresa';

const InformeCajaPago = ({ perfilUsuario }) => {
  const { id: empresaId } = useEmpresaInfo();
  const [pagos, setPagos] = useState([]);
  const [pagosFiltrados, setPagosFiltrados] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busqueda, setBusqueda] = useState('');
  const [paginaActual, setPaginaActual] = useState(1);
  const [resultadosPorPagina, setResultadosPorPagina] = useState(25);
  
  // Filtros de fecha
  const [fechaInicio, setFechaInicio] = useState('');
  const [fechaFin, setFechaFin] = useState('');
  const [filtroTipoPago, setFiltroTipoPago] = useState('Todos');

  // Cargar pagos desde la base de datos
  const cargarPagos = async () => {
    if (!empresaId) return;
    setLoading(true);
    try {
      let query = supabase
        .from('pagos_clientes')
        .select('*')
        .order('fecha', { ascending: false });

      // Si hay empresaId, filtrar por empresa
      if (empresaId) {
        query = query.eq('empresa_id', empresaId);
      }

      const { data, error } = await query;

      if (error) throw error;
      setPagos(data || []);
    } catch (error) {
      console.error('Error al cargar pagos:', error.message);
      setPagos([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    cargarPagos();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empresaId]);

  // Aplicar filtros
  useEffect(() => {
    let resultado = pagos;

    // Filtro por búsqueda
    if (busqueda.trim()) {
      resultado = resultado.filter((p) =>
        (p.numero_referencia || '').toLowerCase().includes(busqueda.toLowerCase()) ||
        (p.factura_no || '').toLowerCase().includes(busqueda.toLowerCase()) ||
        (p.cliente_id || '').toLowerCase().includes(busqueda.toLowerCase())
      );
    }

    // Filtro por fecha
    if (fechaInicio) {
      const inicio = new Date(fechaInicio);
      inicio.setHours(0, 0, 0, 0);
      resultado = resultado.filter((p) => new Date(p.fecha) >= inicio);
    }

    if (fechaFin) {
      const fin = new Date(fechaFin);
      fin.setHours(23, 59, 59, 999);
      resultado = resultado.filter((p) => new Date(p.fecha) <= fin);
    }

    // Filtro por tipo de pago
    if (filtroTipoPago !== 'Todos') {
      resultado = resultado.filter((p) => p.metodo_pago === filtroTipoPago);
    }

    setPagosFiltrados(resultado);
    setPaginaActual(1);
  }, [pagos, busqueda, fechaInicio, fechaFin, filtroTipoPago]);

  // Paginación
  const totalPaginas = Math.ceil(pagosFiltrados.length / resultadosPorPagina);
  const pagosPaginados = pagosFiltrados.slice(
    (paginaActual - 1) * resultadosPorPagina,
    paginaActual * resultadosPorPagina
  );

  // Exportar a CSV
  const exportarCSV = () => {
    const headers = ['FECHA', 'Nº DE REFERENCIA', 'FACTURA NO.', 'CANTIDAD', 'TIPO DE PAGO', 'CUENTA PAGO'];
    const filas = pagosFiltrados.map((p) => [
      new Date(p.fecha).toLocaleString('es-PY'),
      p.numero_referencia || '—',
      p.factura_no || '—',
      Number(p.monto || 0).toLocaleString('es-PY'),
      p.metodo_pago || '—',
      p.cuenta_pago || '—',
    ]);

    const contenido = [
      headers.join(','),
      ...filas.map((f) => f.map((v) => `"${v}"`).join(',')),
    ].join('\n');

    const blob = new Blob([contenido], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `informe-caja-pago-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Exportar a Excel
  const exportarExcel = () => {
    const headers = ['FECHA', 'Nº DE REFERENCIA', 'FACTURA NO.', 'CANTIDAD', 'TIPO DE PAGO', 'CUENTA PAGO'];
    const filas = pagosFiltrados.map((p) => [
      new Date(p.fecha).toLocaleString('es-PY'),
      p.numero_referencia || '—',
      p.factura_no || '—',
      Number(p.monto || 0).toLocaleString('es-PY'),
      p.metodo_pago || '—',
      p.cuenta_pago || '—',
    ]);

    let html = '<table border="1"><tr>';
    headers.forEach((h) => { html += `<th>${h}</th>`; });
    html += '</tr>';
    filas.forEach((fila) => {
      html += '<tr>';
      fila.forEach((celda) => { html += `<td>${celda}</td>`; });
      html += '</tr>';
    });
    html += '</table>';

    const blob = new Blob([html], { type: 'application/vnd.ms-excel' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `informe-caja-pago-${new Date().toISOString().split('T')[0]}.xls`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Imprimir
  const imprimir = () => {
    const ventana = window.open('', '_blank');
    const headers = ['FECHA', 'Nº DE REFERENCIA', 'FACTURA NO.', 'CANTIDAD', 'TIPO DE PAGO', 'CUENTA PAGO'];
    const filas = pagosFiltrados.map((p) => [
      new Date(p.fecha).toLocaleString('es-PY'),
      p.numero_referencia || '—',
      p.factura_no || '—',
      Number(p.monto || 0).toLocaleString('es-PY'),
      p.metodo_pago || '—',
      p.cuenta_pago || '—',
    ]);

    let html = '<table border="1" style="width:100%; border-collapse:collapse;"><tr>';
    headers.forEach((h) => { html += `<th style="padding:8px; text-align:left;">${h}</th>`; });
    html += '</tr>';
    filas.forEach((fila) => {
      html += '<tr>';
      fila.forEach((celda) => { html += `<td style="padding:8px;">${celda}</td>`; });
      html += '</tr>';
    });
    html += '</table>';

    ventana.document.write(html);
    ventana.document.close();
    ventana.print();
  };

  // Exportar a PDF
  const exportarPDF = () => {
    alert('PDF exportado (función a implementar con librería PDF)');
  };

  return (
    <div className="p-6 bg-gray-50 min-h-screen w-full font-sans text-gray-700">
      {/* Encabezado */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-800">
          Informe de caja de pago
          <span className="text-sm font-normal text-gray-500 ml-2">Detalles de transacciones</span>
        </h1>
      </div>

      {/* Filtros */}
      <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200 mb-6">
        <div className="flex flex-col md:flex-row gap-4 items-end">
          {/* Filtro de Fecha */}
          <div className="flex-1">
            <label className="block text-xs font-bold text-gray-600 mb-2">Rango de fechas:</label>
            <div className="flex gap-2 items-center">
              <input
                type="date"
                value={fechaInicio}
                onChange={(e) => setFechaInicio(e.target.value)}
                className="border border-gray-300 rounded-md p-2 flex-1 outline-none"
              />
              <span className="text-gray-400">-</span>
              <input
                type="date"
                value={fechaFin}
                onChange={(e) => setFechaFin(e.target.value)}
                className="border border-gray-300 rounded-md p-2 flex-1 outline-none"
              />
            </div>
          </div>

          {/* Filtro de Tipo de Pago */}
          <div className="flex-1">
            <label className="block text-xs font-bold text-gray-600 mb-2">Tipo de pago:</label>
            <select
              value={filtroTipoPago}
              onChange={(e) => setFiltroTipoPago(e.target.value)}
              className="border border-gray-300 rounded-md p-2 w-full outline-none"
            >
              <option value="Todos">Todos</option>
              <option value="Efectivo">Efectivo</option>
              <option value="Tarjeta">Tarjeta</option>
              <option value="Transferencia">Transferencia</option>
              <option value="Cheque">Cheque</option>
            </select>
          </div>

          {/* Búsqueda */}
          <div className="flex-1">
            <label className="block text-xs font-bold text-gray-600 mb-2">Buscar:</label>
            <input
              type="text"
              placeholder="Ref. pago o factura..."
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              className="border border-gray-300 rounded-md p-2 w-full outline-none"
            />
          </div>
        </div>
      </div>

      {/* Botones de Exportación */}
      <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200 mb-6 flex flex-wrap gap-2">
        <button
          onClick={exportarCSV}
          className="bg-blue-500 hover:bg-blue-600 text-white font-bold py-2 px-4 rounded-lg transition-colors text-sm"
        >
          📥 Exportar a CSV
        </button>
        <button
          onClick={exportarExcel}
          className="bg-green-500 hover:bg-green-600 text-white font-bold py-2 px-4 rounded-lg transition-colors text-sm"
        >
          📊 Exportar a Excel
        </button>
        <button
          onClick={imprimir}
          className="bg-gray-600 hover:bg-gray-700 text-white font-bold py-2 px-4 rounded-lg transition-colors text-sm"
        >
          🖨️ Imprimir
        </button>
        <button
          onClick={exportarPDF}
          className="bg-red-500 hover:bg-red-600 text-white font-bold py-2 px-4 rounded-lg transition-colors text-sm"
        >
          📄 Exportar a PDF
        </button>
      </div>

      {/* Tabla de Pagos */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-gray-500">Cargando pagos...</div>
        ) : pagosPaginados.length === 0 ? (
          <div className="p-8 text-center text-gray-500">No hay pagos registrados en este período.</div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-100 border-b border-gray-200">
                  <tr>
                    <th className="px-6 py-3 text-left font-bold text-gray-700">FECHA</th>
                    <th className="px-6 py-3 text-left font-bold text-gray-700">Nº DE REFERENCIA</th>
                    <th className="px-6 py-3 text-left font-bold text-gray-700">FACTURA NO.</th>
                    <th className="px-6 py-3 text-right font-bold text-gray-700">CANTIDAD</th>
                    <th className="px-6 py-3 text-left font-bold text-gray-700">TIPO DE PAGO</th>
                    <th className="px-6 py-3 text-left font-bold text-gray-700">CUENTA</th>
                  </tr>
                </thead>
                <tbody>
                  {pagosPaginados.map((pago, idx) => (
                    <tr key={idx} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-3">{new Date(pago.fecha).toLocaleString('es-PY')}</td>
                      <td className="px-6 py-3">{pago.numero_referencia || '—'}</td>
                      <td className="px-6 py-3">{pago.factura_no || '—'}</td>
                      <td className="px-6 py-3 text-right font-bold text-gray-800">
                        {Number(pago.monto || 0).toLocaleString('es-PY')} Gs
                      </td>
                      <td className="px-6 py-3">
                        <span className="px-3 py-1 rounded-full text-xs font-bold bg-orange-100 text-orange-700">
                          {pago.metodo_pago || 'N/A'}
                        </span>
                      </td>
                      <td className="px-6 py-3 text-gray-600">{pago.cuenta_pago || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Paginación */}
            <div className="bg-gray-50 px-6 py-4 border-t border-gray-200 flex items-center justify-between text-sm">
              <div className="text-gray-600">
                Mostrando {pagosPaginados.length > 0 ? (paginaActual - 1) * resultadosPorPagina + 1 : 0} a{' '}
                {Math.min(paginaActual * resultadosPorPagina, pagosFiltrados.length)} de {pagosFiltrados.length} pagos
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setPaginaActual(Math.max(1, paginaActual - 1))}
                  disabled={paginaActual === 1}
                  className="px-3 py-1 border border-gray-300 rounded disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-100"
                >
                  ◀ Anterior
                </button>
                {Array.from({ length: Math.min(5, totalPaginas) }, (_, i) => {
                  const numPagina = i + 1;
                  return (
                    <button
                      key={numPagina}
                      onClick={() => setPaginaActual(numPagina)}
                      className={`px-3 py-1 border rounded font-bold transition-colors ${
                        paginaActual === numPagina
                          ? 'bg-orange-500 text-white border-orange-500'
                          : 'border-gray-300 hover:bg-gray-100'
                      }`}
                    >
                      {numPagina}
                    </button>
                  );
                })}
                {totalPaginas > 5 && <span className="px-2 py-1">...</span>}
                <button
                  onClick={() => setPaginaActual(Math.min(totalPaginas, paginaActual + 1))}
                  disabled={paginaActual === totalPaginas}
                  className="px-3 py-1 border border-gray-300 rounded disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-100"
                >
                  Siguiente ▶
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default InformeCajaPago;
