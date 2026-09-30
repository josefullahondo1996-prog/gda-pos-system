import React, { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';
import { useEmpresaInfo } from './utils/useEmpresa';

const facturasDelPago = (pago) => (pago.facturas_aplicadas || []).length
  ? pago.facturas_aplicadas.map((item) => `#${item.referencia}: ${Number(item.monto_aplicado || 0).toLocaleString('es-PY')} Gs`).join(' | ')
  : 'Sin vínculo histórico';
const montoSinAplicarDelPago = (pago) => pago.monto_sin_aplicar == null
  ? 'No determinable (histórico)'
  : Number(pago.monto_sin_aplicar).toLocaleString('es-PY');

const InformeCajaPago = ({ perfilUsuario }) => {
  const { id: empresaId } = useEmpresaInfo();
  const [pagos, setPagos] = useState([]);
  const [clientes, setClientes] = useState([]);
  const [pagosFiltrados, setPagosFiltrados] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busqueda, setBusqueda] = useState('');
  const [paginaActual, setPaginaActual] = useState(1);
  const [resultadosPorPagina, setResultadosPorPagina] = useState(25);
  
  // Filtros de fecha
  const [fechaInicio, setFechaInicio] = useState('');
  const [fechaFin, setFechaFin] = useState('');
  const [filtroTipoPago, setFiltroTipoPago] = useState('Todos');
  const [filtroCuenta, setFiltroCuenta] = useState('Todas');
  const [filtroCliente, setFiltroCliente] = useState('Todos');

  // Cargar pagos desde la base de datos
  const cargarPagos = async () => {
    if (!empresaId) return;
    setLoading(true);
    try {
      const [pagosEmpresa, clientesResultado] = await Promise.all([
        (async () => {
          const filas = [];
          for (let desde = 0; desde < 20000; desde += 1000) {
            let query = supabase.from('pagos_clientes').select('*').order('fecha', { ascending: false }).range(desde, desde + 999);
            query = query.eq('empresa_id', empresaId);
            const { data, error } = await query;
            if (error) throw error;
            filas.push(...(data || []));
            if (!data || data.length < 1000) break;
          }
          return filas;
        })(),
        supabase.from('clientes').select('id, nombre, nombre_empresa').eq('empresa_id', empresaId),
      ]);
      const aplicaciones = [];
      for (let desde = 0; desde < 20000; desde += 1000) {
        const { data, error } = await supabase.from('pagos_clientes_aplicaciones').select('pago_id, venta_id, monto_aplicado').eq('empresa_id', empresaId).range(desde, desde + 999);
        if (error) throw error;
        aplicaciones.push(...(data || []));
        if (!data || data.length < 1000) break;
      }
      const ventasIds = [...new Set(aplicaciones.map((item) => item.venta_id))];
      const ventasAplicadas = [];
      for (let desde = 0; desde < ventasIds.length; desde += 500) {
        const { data, error } = await supabase.from('ventas').select('id, cliente, fecha, total').eq('empresa_id', empresaId).in('id', ventasIds.slice(desde, desde + 500));
        if (error) throw error;
        ventasAplicadas.push(...(data || []));
      }
      const ventaPorId = new Map(ventasAplicadas.map((venta) => [String(venta.id), venta]));
      const aplicacionesPorPago = new Map();
      aplicaciones.forEach((aplicacion) => {
        const venta = ventaPorId.get(String(aplicacion.venta_id));
        const detalle = {
          venta_id: aplicacion.venta_id,
          referencia: String(aplicacion.venta_id).slice(0, 8),
          cliente: venta?.cliente || '',
          monto_aplicado: Number(aplicacion.monto_aplicado || 0),
        };
        const lista = aplicacionesPorPago.get(String(aplicacion.pago_id)) || [];
        lista.push(detalle);
        aplicacionesPorPago.set(String(aplicacion.pago_id), lista);
      });
      setPagos(pagosEmpresa.map((pago) => {
        const facturas_aplicadas = aplicacionesPorPago.get(String(pago.id)) || [];
        const monto_aplicado = facturas_aplicadas.reduce((total, item) => total + item.monto_aplicado, 0);
        return {
          ...pago,
          facturas_aplicadas,
          monto_aplicado,
          monto_sin_aplicar: facturas_aplicadas.length
            ? Math.max(0, Number(pago.monto || 0) - monto_aplicado)
            : null,
        };
      }));
      setClientes(clientesResultado.data || []);
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
      resultado = resultado.filter((p) => {
        const cliente = clientes.find((c) => String(c.id) === String(p.cliente_id));
        const facturas = (p.facturas_aplicadas || []).map((item) => `${item.referencia} ${item.cliente}`).join(' ');
        return `${p.numero_referencia || ''} ${p.factura_no || ''} ${p.cliente_id || ''} ${cliente?.nombre || ''} ${cliente?.nombre_empresa || ''} ${facturas}`.toLocaleLowerCase('es').includes(busqueda.toLocaleLowerCase('es'));
      });
    }

    // Filtro por fecha
    if (fechaInicio) {
      resultado = resultado.filter((p) => String(p.fecha || '').slice(0, 10) >= fechaInicio);
    }

    if (fechaFin) {
      resultado = resultado.filter((p) => String(p.fecha || '').slice(0, 10) <= fechaFin);
    }

    // Filtro por tipo de pago
    if (filtroTipoPago !== 'Todos') {
      resultado = resultado.filter((p) => p.metodo_pago === filtroTipoPago);
    }
    if (filtroCuenta !== 'Todas') resultado = resultado.filter((p) => (p.cuenta_pago || 'Sin cuenta') === filtroCuenta);
    if (filtroCliente !== 'Todos') resultado = resultado.filter((p) => String(p.cliente_id || '') === filtroCliente);

    setPagosFiltrados(resultado.map((p) => {
      const cliente = clientes.find((c) => String(c.id) === String(p.cliente_id));
      const clientePorFactura = (p.facturas_aplicadas || []).map((item) => item.cliente).filter(Boolean).join(', ');
      return { ...p, cliente_nombre: cliente?.nombre_empresa || cliente?.nombre || clientePorFactura || 'Cliente sin ficha' };
    }));
    setPaginaActual(1);
  }, [pagos, clientes, busqueda, fechaInicio, fechaFin, filtroTipoPago, filtroCuenta, filtroCliente]);

  const totalCobrado = pagosFiltrados.reduce((total, pago) => total + Number(pago.monto || 0), 0);

  // Paginación
  const totalPaginas = Math.ceil(pagosFiltrados.length / resultadosPorPagina);
  const pagosPaginados = pagosFiltrados.slice(
    (paginaActual - 1) * resultadosPorPagina,
    paginaActual * resultadosPorPagina
  );

  // Exportar a CSV
  const exportarCSV = () => {
    const headers = ['FECHA', 'CLIENTE', 'Nº DE REFERENCIA', 'FACTURA NO.', 'FACTURAS APLICADAS', 'MONTO SIN APLICAR', 'MONTO DEL PAGO', 'TIPO DE PAGO', 'CUENTA PAGO'];
    const filas = pagosFiltrados.map((p) => [
      new Date(p.fecha).toLocaleString('es-PY'),
      p.cliente_nombre,
      p.numero_referencia || '—',
      p.factura_no || '—',
      facturasDelPago(p),
      montoSinAplicarDelPago(p),
      Number(p.monto || 0),
      p.metodo_pago || '—',
      p.cuenta_pago || '—',
    ]);

    const escapar = (valor) => `"${String(valor ?? '').replaceAll('"', '""')}"`;
    const contenido = `\uFEFF${[headers, ...filas].map((fila) => fila.map(escapar).join(',')).join('\r\n')}`;

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
    const headers = ['FECHA', 'CLIENTE', 'Nº DE REFERENCIA', 'FACTURA NO.', 'FACTURAS APLICADAS', 'MONTO SIN APLICAR', 'MONTO DEL PAGO', 'TIPO DE PAGO', 'CUENTA PAGO'];
    const filas = pagosFiltrados.map((p) => [
      new Date(p.fecha).toLocaleString('es-PY'),
      p.cliente_nombre,
      p.numero_referencia || '—',
      p.factura_no || '—',
      facturasDelPago(p),
      montoSinAplicarDelPago(p),
      Number(p.monto || 0),
      p.metodo_pago || '—',
      p.cuenta_pago || '—',
    ]);

    const escaparHTML = (valor) => String(valor ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
    let html = '<table border="1"><tr>';
    headers.forEach((h) => { html += `<th>${escaparHTML(h)}</th>`; });
    html += '</tr>';
    filas.forEach((fila) => {
      html += '<tr>';
      fila.forEach((celda) => { html += `<td>${escaparHTML(celda)}</td>`; });
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
    const headers = ['FECHA', 'CLIENTE', 'Nº DE REFERENCIA', 'FACTURA NO.', 'FACTURAS APLICADAS', 'MONTO SIN APLICAR', 'MONTO DEL PAGO', 'TIPO DE PAGO', 'CUENTA PAGO'];
    const filas = pagosFiltrados.map((p) => [
      new Date(p.fecha).toLocaleString('es-PY'),
      p.cliente_nombre,
      p.numero_referencia || '—',
      p.factura_no || '—',
      facturasDelPago(p),
      montoSinAplicarDelPago(p),
      Number(p.monto || 0),
      p.metodo_pago || '—',
      p.cuenta_pago || '—',
    ]);

    let html = '<table border="1" style="width:100%; border-collapse:collapse;"><tr>';
    headers.forEach((h) => { html += `<th style="padding:8px; text-align:left;">${String(h).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')}</th>`; });
    html += '</tr>';
    filas.forEach((fila) => {
      html += '<tr>';
      fila.forEach((celda) => { html += `<td style="padding:8px;">${String(celda ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;')}</td>`; });
      html += '</tr>';
    });
    html += '</table>';

    ventana.document.write(html);
    ventana.document.close();
    ventana.print();
  };

  // Exportar a PDF
  const exportarPDF = () => {
    Promise.all([import('jspdf'), import('jspdf-autotable')]).then(([{ default: jsPDF }, { default: autoTable }]) => {
      const doc = new jsPDF({ orientation: 'landscape' });
      doc.text('Informe de cobros de clientes', 14, 14);
      autoTable(doc, { head: [['Fecha', 'Cliente', 'Referencia', 'Factura', 'Facturas aplicadas', 'Sin aplicar', 'Monto', 'Método', 'Cuenta']], body: pagosFiltrados.map((p) => [new Date(p.fecha).toLocaleString('es-PY'), p.cliente_nombre, p.numero_referencia || '—', p.factura_no || '—', facturasDelPago(p), montoSinAplicarDelPago(p), Number(p.monto || 0).toLocaleString('es-PY'), p.metodo_pago || '—', p.cuenta_pago || '—']), startY: 20, styles: { fontSize: 7 } });
      doc.save(`informe-cobros-${new Date().toISOString().slice(0, 10)}.pdf`);
    }).catch((error) => alert(`No se pudo generar el PDF: ${error.message}`));
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
          <div className="flex-1"><label className="block text-xs font-bold text-gray-600 mb-2">Cuenta:</label><select value={filtroCuenta} onChange={(e) => setFiltroCuenta(e.target.value)} className="border border-gray-300 rounded-md p-2 w-full outline-none"><option value="Todas">Todas</option>{[...new Set(pagos.map((p) => p.cuenta_pago || 'Sin cuenta'))].sort().map((cuenta) => <option key={cuenta} value={cuenta}>{cuenta}</option>)}</select></div>
          <div className="flex-1"><label className="block text-xs font-bold text-gray-600 mb-2">Cliente:</label><select value={filtroCliente} onChange={(e) => setFiltroCliente(e.target.value)} className="border border-gray-300 rounded-md p-2 w-full outline-none"><option value="Todos">Todos</option>{clientes.filter((cliente) => pagos.some((pago) => String(pago.cliente_id) === String(cliente.id))).map((cliente) => <option key={cliente.id} value={cliente.id}>{cliente.nombre_empresa || cliente.nombre}</option>)}</select></div>

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

      <div className="mb-6 grid gap-3 sm:grid-cols-2"><div className="rounded-lg border border-gray-200 bg-white p-4"><p className="text-xs font-bold uppercase text-gray-500">Cobros filtrados</p><p className="mt-1 text-xl font-black text-gray-900">{pagosFiltrados.length.toLocaleString('es-PY')}</p></div><div className="rounded-lg border border-gray-200 bg-white p-4"><p className="text-xs font-bold uppercase text-gray-500">Importe cobrado</p><p className="mt-1 text-xl font-black text-gray-900">{totalCobrado.toLocaleString('es-PY')} Gs</p></div></div>
      <p className="-mt-4 mb-5 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">Los pagos nuevos muestran cómo se aplicaron a una o varias facturas. Los movimientos anteriores a la migración aparecen como “Sin vínculo histórico”: la base no permite asignarlos con certeza. La sucursal y el usuario que cobró tampoco se conservan todavía.</p>

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
                    <th className="px-6 py-3 text-left font-bold text-gray-700">CLIENTE</th>
                    <th className="px-6 py-3 text-left font-bold text-gray-700">Nº DE REFERENCIA</th>
                    <th className="px-6 py-3 text-left font-bold text-gray-700">FACTURA NO.</th>
                    <th className="px-6 py-3 text-left font-bold text-gray-700">FACTURAS APLICADAS</th>
                    <th className="px-6 py-3 text-right font-bold text-gray-700">SIN APLICAR</th>
                    <th className="px-6 py-3 text-right font-bold text-gray-700">CANTIDAD</th>
                    <th className="px-6 py-3 text-left font-bold text-gray-700">TIPO DE PAGO</th>
                    <th className="px-6 py-3 text-left font-bold text-gray-700">CUENTA</th>
                  </tr>
                </thead>
                <tbody>
                  {pagosPaginados.map((pago, idx) => (
                    <tr key={idx} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-3">{new Date(pago.fecha).toLocaleString('es-PY')}</td>
                      <td className="px-6 py-3">{pago.cliente_nombre}</td>
                      <td className="px-6 py-3">{pago.numero_referencia || '—'}</td>
                      <td className="px-6 py-3">{pago.factura_no || '—'}</td>
                      <td className="px-6 py-3">{facturasDelPago(pago)}</td>
                      <td className="px-6 py-3 text-right">{montoSinAplicarDelPago(pago)}{pago.monto_sin_aplicar == null ? '' : ' Gs'}</td>
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
