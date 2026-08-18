import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from './supabaseClient';
import { useEmpresaInfo } from './utils/useEmpresa';
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';

const CobroDeVentas = ({ perfilUsuario }) => {
  const { id: empresaId } = useEmpresaInfo();

  // Estados principales
  const [ventas, setVentas] = useState([]);
  const [clientes, setClientes] = useState([]);
  const [ubicaciones, setUbicaciones] = useState([]);
  const [loading, setLoading] = useState(true);

  // Filtros
  const [filtroEstado, setFiltroEstado] = useState('Todas');
  const [filtroUbicacion, setFiltroUbicacion] = useState('Todas');
  const [filtroMetodoPago, setFiltroMetodoPago] = useState('Todos');
  const [filtroCliente, setFiltroCliente] = useState('Todos');
  const [fechaInicio, setFechaInicio] = useState('');
  const [fechaFin, setFechaFin] = useState('');

  // Tab activo
  const [tabActivo, setTabActivo] = useState('Estado actual');

  // Paginación
  const [paginaActual, setPaginaActual] = useState(1);
  const [porPagina, setPorPagina] = useState(25);

  // Cargar datos
  useEffect(() => {
    const cargarDatos = async () => {
      if (!empresaId) return;
      setLoading(true);
      try {
        const [
          { data: ventasData },
          { data: clientesData },
          { data: ubicacionesData },
        ] = await Promise.all([
          supabase.from('ventas').select('*').eq('empresa_id', empresaId).order('fecha', { ascending: false }),
          supabase.from('clientes').select('*').eq('empresa_id', empresaId).order('nombre'),
          supabase.from('ubicaciones_comerciales').select('*').eq('empresa_id', empresaId).order('nombre'),
        ]);

        setVentas(ventasData || []);
        setClientes(clientesData || []);
        setUbicaciones(ubicacionesData || []);
      } catch (error) {
        console.error('Error al cargar datos:', error.message);
      } finally {
        setLoading(false);
      }
    };

    cargarDatos();
  }, [empresaId]);

  // Aplicar filtros
  const ventasFiltradas = useMemo(() => {
    let filtered = [...ventas];

    if (filtroEstado !== 'Todas') {
      filtered = filtered.filter((v) => v.estado_pago === filtroEstado);
    }

    if (filtroMetodoPago !== 'Todos') {
      filtered = filtered.filter((v) => v.metodo_pago === filtroMetodoPago);
    }

    if (filtroCliente !== 'Todos') {
      filtered = filtered.filter((v) => v.cliente === filtroCliente);
    }

    if (fechaInicio) {
      const inicio = new Date(fechaInicio);
      inicio.setHours(0, 0, 0, 0);
      filtered = filtered.filter((v) => new Date(v.fecha) >= inicio);
    }

    if (fechaFin) {
      const fin = new Date(fechaFin);
      fin.setHours(23, 59, 59, 999);
      filtered = filtered.filter((v) => new Date(v.fecha) <= fin);
    }

    return filtered;
  }, [ventas, filtroEstado, filtroMetodoPago, filtroCliente, fechaInicio, fechaFin]);

  // Calcular métricas
  const metricas = useMemo(() => {
    const totalACobrar = ventasFiltradas.reduce((acc, v) => acc + Number(v.saldo_pendiente || 0), 0);
    const totalCobrado = ventasFiltradas.reduce((acc, v) => acc + Number(v.monto_pagado || 0), 0);
    const totalVentas = ventasFiltradas.reduce((acc, v) => acc + Number(v.total || 0), 0);

    return {
      totalACobrar,
      totalCobrado,
      saldoPorCobrar: totalACobrar,
      totalVentas,
      cantidadVentas: ventasFiltradas.length,
    };
  }, [ventasFiltradas]);

  // Agrupar por método de pago
  const porMetodoPago = useMemo(() => {
    const agrupado = {};
    ventasFiltradas.forEach((v) => {
      const metodo = v.metodo_pago || 'Sin método';
      if (!agrupado[metodo]) {
        agrupado[metodo] = {
          metodo,
          cantidad: 0,
          total: 0,
          cobrado: 0,
          pendiente: 0,
        };
      }
      agrupado[metodo].cantidad += 1;
      agrupado[metodo].total += Number(v.total || 0);
      agrupado[metodo].cobrado += Number(v.monto_pagado || 0);
      agrupado[metodo].pendiente += Number(v.saldo_pendiente || 0);
    });
    return Object.values(agrupado);
  }, [ventasFiltradas]);

  // Agrupar por cliente
  const porCliente = useMemo(() => {
    const agrupado = {};
    ventasFiltradas.forEach((v) => {
      const cliente = v.cliente || 'Sin cliente';
      if (!agrupado[cliente]) {
        agrupado[cliente] = {
          cliente,
          cantidad: 0,
          total: 0,
          cobrado: 0,
          pendiente: 0,
        };
      }
      agrupado[cliente].cantidad += 1;
      agrupado[cliente].total += Number(v.total || 0);
      agrupado[cliente].cobrado += Number(v.monto_pagado || 0);
      agrupado[cliente].pendiente += Number(v.saldo_pendiente || 0);
    });
    return Object.values(agrupado);
  }, [ventasFiltradas]);

  // Datos para gráfico de evolución diaria
  const datosEvoluccion = useMemo(() => {
    const agrupado = {};
    ventasFiltradas.forEach((v) => {
      const fecha = new Date(v.fecha).toLocaleDateString('es-PY', { day: '2-digit', month: 'short' });
      if (!agrupado[fecha]) {
        agrupado[fecha] = { fecha, cobrado: 0, pendiente: 0, total: 0 };
      }
      agrupado[fecha].cobrado += Number(v.monto_pagado || 0);
      agrupado[fecha].pendiente += Number(v.saldo_pendiente || 0);
      agrupado[fecha].total += Number(v.total || 0);
    });
    return Object.values(agrupado).slice(-30); // Últimos 30 días
  }, [ventasFiltradas]);

  // Datos para gráfico de estados
  const datosEstados = useMemo(() => {
    const estados = { 'A cobrar': 0, 'Pagado': 0, 'Pago Parcial': 0 };
    ventasFiltradas.forEach((v) => {
      const estado = v.estado_pago || 'A cobrar';
      if (estado in estados) {
        estados[estado] += 1;
      }
    });
    return Object.entries(estados).map(([nombre, value]) => ({
      nombre,
      value,
    }));
  }, [ventasFiltradas]);

  // Obtener datos según tab
  const datosTabActual = useMemo(() => {
    if (tabActivo === 'Método de pago') return porMetodoPago;
    if (tabActivo === 'Cliente') return porCliente;
    return ventasFiltradas;
  }, [tabActivo, ventasFiltradas, porMetodoPago, porCliente]);

  // Paginación
  const totalPaginas = Math.ceil(datosTabActual.length / porPagina);
  const datosPaginados = datosTabActual.slice(
    (paginaActual - 1) * porPagina,
    paginaActual * porPagina
  );

  // Exportar CSV
  const exportarCSV = () => {
    const headers = tabActivo === 'Estado actual'
      ? ['Fecha', 'Cliente', 'Total', 'Monto Pagado', 'Saldo Pendiente', 'Estado', 'Método Pago']
      : tabActivo === 'Método de pago'
      ? ['Método Pago', 'Cantidad', 'Total', 'Cobrado', 'Pendiente']
      : ['Cliente', 'Cantidad', 'Total', 'Cobrado', 'Pendiente'];

    const filas = datosPaginados.map((d) => {
      if (tabActivo === 'Estado actual') {
        return [
          new Date(d.fecha).toLocaleDateString('es-PY'),
          d.cliente || 'N/A',
          Number(d.total).toLocaleString('es-PY'),
          Number(d.monto_pagado).toLocaleString('es-PY'),
          Number(d.saldo_pendiente).toLocaleString('es-PY'),
          d.estado_pago || 'N/A',
          d.metodo_pago || 'N/A',
        ];
      } else {
        return [
          d.metodo || d.cliente || 'N/A',
          d.cantidad,
          Number(d.total).toLocaleString('es-PY'),
          Number(d.cobrado).toLocaleString('es-PY'),
          Number(d.pendiente).toLocaleString('es-PY'),
        ];
      }
    });

    const contenido = [
      headers.join(','),
      ...filas.map((f) => f.map((v) => `"${v}"`).join(',')),
    ].join('\n');

    const blob = new Blob([contenido], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `cobros-de-venta-${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Exportar Excel
  const exportarExcel = () => {
    const headers = tabActivo === 'Estado actual'
      ? ['Fecha', 'Cliente', 'Total', 'Monto Pagado', 'Saldo Pendiente', 'Estado', 'Método Pago']
      : tabActivo === 'Método de pago'
      ? ['Método Pago', 'Cantidad', 'Total', 'Cobrado', 'Pendiente']
      : ['Cliente', 'Cantidad', 'Total', 'Cobrado', 'Pendiente'];

    const filas = datosPaginados.map((d) => {
      if (tabActivo === 'Estado actual') {
        return [
          new Date(d.fecha).toLocaleDateString('es-PY'),
          d.cliente || 'N/A',
          Number(d.total).toLocaleString('es-PY'),
          Number(d.monto_pagado).toLocaleString('es-PY'),
          Number(d.saldo_pendiente).toLocaleString('es-PY'),
          d.estado_pago || 'N/A',
          d.metodo_pago || 'N/A',
        ];
      } else {
        return [
          d.metodo || d.cliente || 'N/A',
          d.cantidad,
          Number(d.total).toLocaleString('es-PY'),
          Number(d.cobrado).toLocaleString('es-PY'),
          Number(d.pendiente).toLocaleString('es-PY'),
        ];
      }
    });

    let html = '<table border="1"><tr>';
    headers.forEach((h) => { html += `<th>${h}</th>`; });
    html += '</tr>';
    filas.forEach((fila) => {
      html += '<tr>';
      fila.forEach((celda) => { html += `<td>${celda}</td>`; });
      html += '</tr>';
    });
    html += '</table>';

    const blob = new Blob([html], { type: 'application/vnd.ms-excel;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `cobros-de-venta-${new Date().toISOString().split('T')[0]}.xls`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Imprimir
  const imprimir = () => {
    const ventana = window.open('', '_blank');
    const headers = tabActivo === 'Estado actual'
      ? ['Fecha', 'Cliente', 'Total', 'Monto Pagado', 'Saldo Pendiente', 'Estado', 'Método Pago']
      : tabActivo === 'Método de pago'
      ? ['Método Pago', 'Cantidad', 'Total', 'Cobrado', 'Pendiente']
      : ['Cliente', 'Cantidad', 'Total', 'Cobrado', 'Pendiente'];

    const filas = datosPaginados.map((d) => {
      if (tabActivo === 'Estado actual') {
        return [
          new Date(d.fecha).toLocaleDateString('es-PY'),
          d.cliente || 'N/A',
          Number(d.total).toLocaleString('es-PY'),
          Number(d.monto_pagado).toLocaleString('es-PY'),
          Number(d.saldo_pendiente).toLocaleString('es-PY'),
          d.estado_pago || 'N/A',
          d.metodo_pago || 'N/A',
        ];
      } else {
        return [
          d.metodo || d.cliente || 'N/A',
          d.cantidad,
          Number(d.total).toLocaleString('es-PY'),
          Number(d.cobrado).toLocaleString('es-PY'),
          Number(d.pendiente).toLocaleString('es-PY'),
        ];
      }
    });

    let html = `
      <html>
        <head>
          <title>Cobros de Venta</title>
          <style>
            table { border-collapse: collapse; width: 100%; }
            th, td { border: 1px solid #000; padding: 8px; text-align: left; }
            th { background-color: #f0f0f0; font-weight: bold; }
            td { font-size: 12px; }
          </style>
        </head>
        <body>
          <h2>Cobros de Venta</h2>
          <table>
            <tr>`;
    headers.forEach((h) => { html += `<th>${h}</th>`; });
    html += '</tr>';
    filas.forEach((fila) => {
      html += '<tr>';
      fila.forEach((celda) => { html += `<td>${celda}</td>`; });
      html += '</tr>';
    });
    html += '</table></body></html>';

    ventana.document.write(html);
    ventana.document.close();
    ventana.print();
  };

  const formatGs = (valor) => `Gs ${Number(valor || 0).toLocaleString('es-PY')}`;
  const formatPorcentaje = (parte, total) => total > 0 ? ((parte / total) * 100).toFixed(1) : '0';

  return (
    <div className="p-6 bg-gray-50 min-h-screen w-full font-sans text-gray-700">
      {/* Encabezado */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-800">
          Cobros de venta
        </h1>
        <p className="text-sm text-gray-500 mt-1">Controla tus ventas, gastos y cierre de cajas</p>
      </div>

      {/* Filtros */}
      <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200 mb-6">
        <div className="text-sm font-bold text-gray-600 mb-3">Filtros</div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
          {/* Estado */}
          <div>
            <label className="block text-xs font-bold text-gray-600 mb-2">Estado:</label>
            <select
              value={filtroEstado}
              onChange={(e) => setFiltroEstado(e.target.value)}
              className="border border-gray-300 rounded-md p-2 w-full outline-none text-sm"
            >
              <option value="Todas">Todas</option>
              <option value="A cobrar">A cobrar</option>
              <option value="Pagado">Pagado</option>
              <option value="Pago Parcial">Pago Parcial</option>
            </select>
          </div>

          {/* Ubicación */}
          <div>
            <label className="block text-xs font-bold text-gray-600 mb-2">Ubicación:</label>
            <select
              value={filtroUbicacion}
              onChange={(e) => setFiltroUbicacion(e.target.value)}
              className="border border-gray-300 rounded-md p-2 w-full outline-none text-sm"
            >
              <option value="Todas">Todas</option>
              {ubicaciones.map((u) => (
                <option key={u.id} value={u.nombre}>
                  {u.nombre}
                </option>
              ))}
            </select>
          </div>

          {/* Método de Pago */}
          <div>
            <label className="block text-xs font-bold text-gray-600 mb-2">Método de pago:</label>
            <select
              value={filtroMetodoPago}
              onChange={(e) => setFiltroMetodoPago(e.target.value)}
              className="border border-gray-300 rounded-md p-2 w-full outline-none text-sm"
            >
              <option value="Todos">Todos</option>
              <option value="Efectivo">Efectivo</option>
              <option value="Tarjeta">Tarjeta</option>
              <option value="Transferencia">Transferencia</option>
              <option value="Cheque">Cheque</option>
            </select>
          </div>

          {/* Cliente */}
          <div>
            <label className="block text-xs font-bold text-gray-600 mb-2">Cliente:</label>
            <select
              value={filtroCliente}
              onChange={(e) => setFiltroCliente(e.target.value)}
              className="border border-gray-300 rounded-md p-2 w-full outline-none text-sm"
            >
              <option value="Todos">Todos</option>
              {clientes.map((c) => (
                <option key={c.id} value={c.nombre}>
                  {c.nombre}
                </option>
              ))}
            </select>
          </div>

          {/* Rango de Fechas */}
          <div>
            <label className="block text-xs font-bold text-gray-600 mb-2">Fechas:</label>
            <div className="flex gap-1">
              <input
                type="date"
                value={fechaInicio}
                onChange={(e) => setFechaInicio(e.target.value)}
                className="border border-gray-300 rounded-md p-2 flex-1 outline-none text-sm"
              />
              <input
                type="date"
                value={fechaFin}
                onChange={(e) => setFechaFin(e.target.value)}
                className="border border-gray-300 rounded-md p-2 flex-1 outline-none text-sm"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Botones de acciones */}
      <div className="bg-white p-3 rounded-lg shadow-sm border border-gray-200 mb-6 flex flex-wrap gap-2">
        <button className="px-4 py-2 bg-orange-500 text-white rounded-lg text-sm font-bold hover:bg-orange-600">+ Acciones</button>
        <button className="px-4 py-2 bg-green-500 text-white rounded-lg text-sm font-bold hover:bg-green-600">✓ Cambio de estado</button>
      </div>

      {/* Métricas principales */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200">
          <p className="text-xs text-gray-500 mb-1">TOTAL A COBRAR</p>
          <p className="text-2xl font-bold text-gray-800">{formatGs(metricas.totalACobrar)}</p>
        </div>
        <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200">
          <p className="text-xs text-gray-500 mb-1">TOTAL COBRADO</p>
          <p className="text-2xl font-bold text-green-600">{formatGs(metricas.totalCobrado)}</p>
        </div>
        <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200">
          <p className="text-xs text-gray-500 mb-1">SALDO POR COBRAR</p>
          <p className="text-2xl font-bold text-orange-600">{formatGs(metricas.saldoPorCobrar)}</p>
        </div>
      </div>

      {/* Gráficos */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* Gráfico de Evolución de Cobros */}
        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
          <h2 className="text-lg font-bold text-gray-800 mb-4">📈 Evolución de Cobros</h2>
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={datosEvoluccion} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="colorCobrado" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10b981" stopOpacity={0.8} />
                  <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="colorPendiente" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#f97316" stopOpacity={0.8} />
                  <stop offset="95%" stopColor="#f97316" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="fecha" stroke="#9ca3af" fontSize={11} />
              <YAxis stroke="#9ca3af" fontSize={11} />
              <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.3} />
              <Tooltip
                formatter={(value) => `Gs ${Number(value).toLocaleString('es-PY')}`}
                contentStyle={{ borderRadius: '8px', border: '1px solid #e5e7eb' }}
              />
              <Legend wrapperStyle={{ paddingTop: '10px' }} />
              <Area
                type="monotone"
                dataKey="cobrado"
                stroke="#10b981"
                fillOpacity={1}
                fill="url(#colorCobrado)"
                name="Cobrado"
              />
              <Area
                type="monotone"
                dataKey="pendiente"
                stroke="#f97316"
                fillOpacity={1}
                fill="url(#colorPendiente)"
                name="Pendiente"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Gráfico de Métodos de Pago */}
        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
          <h2 className="text-lg font-bold text-gray-800 mb-4">💳 Cobros por Método de Pago</h2>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={porMetodoPago}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.3} />
              <XAxis dataKey="metodo" stroke="#9ca3af" fontSize={11} />
              <YAxis stroke="#9ca3af" fontSize={11} />
              <Tooltip
                formatter={(value) => `Gs ${Number(value).toLocaleString('es-PY')}`}
                contentStyle={{ borderRadius: '8px', border: '1px solid #e5e7eb' }}
              />
              <Legend wrapperStyle={{ paddingTop: '10px' }} />
              <Bar dataKey="cobrado" fill="#10b981" name="Cobrado" />
              <Bar dataKey="pendiente" fill="#f97316" name="Pendiente" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Gráfico de Estados */}
      <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200 mb-6">
        <h2 className="text-lg font-bold text-gray-800 mb-4">📊 Distribución de Estados</h2>
        <ResponsiveContainer width="100%" height={300}>
          <PieChart>
            <Pie
              data={datosEstados}
              cx="50%"
              cy="50%"
              labelLine={false}
              label={({ nombre, value }) => `${nombre}: ${value}`}
              outerRadius={80}
              fill="#8884d8"
              dataKey="value"
            >
              <Cell fill="#10b981" />
              <Cell fill="#ef4444" />
              <Cell fill="#f97316" />
            </Pie>
            <Tooltip formatter={(value) => `${value} cobros`} />
            <Legend />
          </PieChart>
        </ResponsiveContainer>
      </div>

      {/* Tabs */}
      <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200 mb-6 flex flex-wrap gap-2 border-b-2">
        {['Estado actual', 'Método de pago', 'Cliente'].map((tab) => (
          <button
            key={tab}
            onClick={() => {
              setTabActivo(tab);
              setPaginaActual(1);
            }}
            className={`px-4 py-2 rounded-lg text-sm font-bold transition-colors ${
              tabActivo === tab
                ? 'bg-orange-500 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Opciones de Exportación */}
      <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200 mb-6 flex flex-wrap gap-2">
        <button
          onClick={exportarCSV}
          className="bg-blue-500 hover:bg-blue-600 text-white font-bold py-2 px-4 rounded-lg text-sm transition-colors"
        >
          📥 Exportar a CSV
        </button>
        <button
          onClick={exportarExcel}
          className="bg-green-500 hover:bg-green-600 text-white font-bold py-2 px-4 rounded-lg text-sm transition-colors"
        >
          📊 Exportar a Excel
        </button>
        <button
          onClick={imprimir}
          className="bg-gray-600 hover:bg-gray-700 text-white font-bold py-2 px-4 rounded-lg text-sm transition-colors"
        >
          🖨️ Imprimir
        </button>
        <button className="bg-red-500 hover:bg-red-600 text-white font-bold py-2 px-4 rounded-lg text-sm transition-colors">
          📄 Exportar a PDF
        </button>
      </div>

      {/* Tabla */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-gray-500">Cargando datos...</div>
        ) : datosPaginados.length === 0 ? (
          <div className="p-8 text-center text-gray-500">No hay datos disponibles.</div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-gray-100 border-b border-gray-200">
                  <tr>
                    {tabActivo === 'Estado actual' ? (
                      <>
                        <th className="px-4 py-3 text-left font-bold text-gray-700">FECHA</th>
                        <th className="px-4 py-3 text-left font-bold text-gray-700">CLIENTE</th>
                        <th className="px-4 py-3 text-right font-bold text-gray-700">TOTAL</th>
                        <th className="px-4 py-3 text-right font-bold text-gray-700">MONTO PAGADO</th>
                        <th className="px-4 py-3 text-right font-bold text-gray-700">SALDO PENDIENTE</th>
                        <th className="px-4 py-3 text-left font-bold text-gray-700">ESTADO</th>
                        <th className="px-4 py-3 text-left font-bold text-gray-700">MÉTODO PAGO</th>
                      </>
                    ) : (
                      <>
                        <th className="px-4 py-3 text-left font-bold text-gray-700">{tabActivo === 'Método de pago' ? 'MÉTODO' : 'CLIENTE'}</th>
                        <th className="px-4 py-3 text-center font-bold text-gray-700">CANTIDAD</th>
                        <th className="px-4 py-3 text-right font-bold text-gray-700">TOTAL</th>
                        <th className="px-4 py-3 text-right font-bold text-gray-700">COBRADO</th>
                        <th className="px-4 py-3 text-right font-bold text-gray-700">PENDIENTE</th>
                      </>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {datosPaginados.map((item, idx) => (
                    <tr key={idx} className="border-b border-gray-100 hover:bg-gray-50">
                      {tabActivo === 'Estado actual' ? (
                        <>
                          <td className="px-4 py-3">{new Date(item.fecha).toLocaleDateString('es-PY')}</td>
                          <td className="px-4 py-3 font-bold text-gray-800">{item.cliente || 'N/A'}</td>
                          <td className="px-4 py-3 text-right">{formatGs(item.total)}</td>
                          <td className="px-4 py-3 text-right text-green-600 font-bold">{formatGs(item.monto_pagado)}</td>
                          <td className="px-4 py-3 text-right text-orange-600 font-bold">{formatGs(item.saldo_pendiente)}</td>
                          <td className="px-4 py-3">
                            <span className={`px-2 py-1 rounded text-xs font-bold ${
                              item.estado_pago === 'Pagado' ? 'bg-green-100 text-green-700' :
                              item.estado_pago === 'Pago Parcial' ? 'bg-yellow-100 text-yellow-700' :
                              'bg-red-100 text-red-700'
                            }`}>
                              {item.estado_pago || 'N/A'}
                            </span>
                          </td>
                          <td className="px-4 py-3">{item.metodo_pago || 'N/A'}</td>
                        </>
                      ) : (
                        <>
                          <td className="px-4 py-3 font-bold text-gray-800">{item.metodo || item.cliente || 'N/A'}</td>
                          <td className="px-4 py-3 text-center">{item.cantidad}</td>
                          <td className="px-4 py-3 text-right">{formatGs(item.total)}</td>
                          <td className="px-4 py-3 text-right text-green-600 font-bold">{formatGs(item.cobrado)}</td>
                          <td className="px-4 py-3 text-right text-orange-600 font-bold">{formatGs(item.pendiente)}</td>
                        </>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Total */}
            <div className="bg-gray-100 px-4 py-3 font-bold text-gray-800 border-t border-gray-200 text-right">
              Total: {datosPaginados.length} registros
            </div>

            {/* Paginación */}
            <div className="bg-gray-50 px-6 py-4 border-t border-gray-200 flex items-center justify-between text-xs">
              <div className="text-gray-600">
                Mostrando {datosPaginados.length > 0 ? (paginaActual - 1) * porPagina + 1 : 0} a{' '}
                {Math.min(paginaActual * porPagina, datosTabActual.length)} de {datosTabActual.length} registros
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setPaginaActual(Math.max(1, paginaActual - 1))}
                  disabled={paginaActual === 1}
                  className="px-3 py-1 border border-gray-300 rounded disabled:opacity-50 hover:bg-gray-200"
                >
                  Anterior
                </button>
                {Array.from({ length: Math.min(5, totalPaginas) }, (_, i) => (
                  <button
                    key={i + 1}
                    onClick={() => setPaginaActual(i + 1)}
                    className={`px-3 py-1 border rounded font-bold transition-colors ${
                      paginaActual === i + 1
                        ? 'bg-orange-500 text-white border-orange-500'
                        : 'border-gray-300 hover:bg-gray-200'
                    }`}
                  >
                    {i + 1}
                  </button>
                ))}
                {totalPaginas > 5 && <span className="px-2 py-1">...</span>}
                <button
                  onClick={() => setPaginaActual(Math.min(totalPaginas, paginaActual + 1))}
                  disabled={paginaActual === totalPaginas}
                  className="px-3 py-1 border border-gray-300 rounded disabled:opacity-50 hover:bg-gray-200"
                >
                  Siguiente
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default CobroDeVentas;
