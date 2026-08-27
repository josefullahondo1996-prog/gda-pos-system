import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from './supabaseClient';
import { useEmpresaInfo } from './utils/useEmpresa';
import { useUbicacionUsuario } from './utils/useUbicacion';
import { useLanguage } from './LanguageContext';

const VentasPorProducto = ({ perfilUsuario }) => {
  const { t } = useLanguage();
  const { id: empresaId } = useEmpresaInfo();
  const { ve_todas: usuarioVeTodas } = useUbicacionUsuario();

  // Estados principales
  const [ventas, setVentas] = useState([]);
  const [detalleVentas, setDetalleVentas] = useState([]);
  const [productos, setProductos] = useState([]);
  const [clientes, setClientes] = useState([]);
  const [ubicaciones, setUbicaciones] = useState([]);
  const [categorias, setCategorias] = useState([]);
  const [marcas, setMarcas] = useState([]);
  const [loading, setLoading] = useState(true);

  // Filtros
  const [buscarProducto, setBuscarProducto] = useState('');
  const [filtroCliente, setFiltroCliente] = useState('Ninguna');
  const [filtroGrupoClientes, setFiltroGrupoClientes] = useState('Todas');
  const [filtroUbicacion, setFiltroUbicacion] = useState('Todos');
  const [filtroCategoria, setFiltroCategoria] = useState('Todos');
  const [filtroMarca, setFiltroMarca] = useState('Todos');
  const [fechaInicio, setFechaInicio] = useState('');
  const [fechaFin, setFechaFin] = useState('');
  const [intervaloTiempo, setIntervaloTiempo] = useState('07:00 A');
  const [ordenProducto, setOrdenProducto] = useState('Todos');

  // Vista
  const [vistaActual, setVistaActual] = useState('Detallado');
  const [paginaActual, setPaginaActual] = useState(1);
  const [porPagina, setPorPagina] = useState(25);
  const [columnasVisibles, setColumnasVisibles] = useState({
    cantidad: true,
    precio_unitario: true,
    descuento: true,
    impuesto: true,
    precio_gasto: true,
    total: true,
    precio_costo_total: true,
    costo_gasto: true,
    ganancia: true,
    margen: true,
  });

  // Cargar datos
  useEffect(() => {
    const cargarDatos = async () => {
      if (!empresaId) return;
      setLoading(true);
      try {
        const [
          { data: ventasData },
          { data: detalleData },
          { data: productosData },
          { data: clientesData },
          { data: ubicacionesData },
          { data: categoriasData },
          { data: marcasData },
        ] = await Promise.all([
          supabase.from('ventas').select('*').eq('empresa_id', empresaId),
          supabase.from('detalle_ventas').select('*').eq('empresa_id', empresaId),
          supabase.from('productos').select('*').eq('empresa_id', empresaId),
          supabase.from('clientes').select('*').eq('empresa_id', empresaId),
          supabase.from('ubicaciones_comerciales').select('*').eq('empresa_id', empresaId),
          supabase.from('categorias_productos').select('*').eq('empresa_id', empresaId),
          supabase.from('marcas').select('*').eq('empresa_id', empresaId),
        ]);

        setVentas(ventasData || []);
        setDetalleVentas(detalleData || []);
        setProductos(productosData || []);
        setClientes(clientesData || []);
        setUbicaciones(ubicacionesData || []);
        setCategorias(categoriasData || []);
        setMarcas(marcasData || []);
      } catch (error) {
        console.error('Error al cargar datos:', error.message);
      } finally {
        setLoading(false);
      }
    };

    cargarDatos();
  }, [empresaId]);

  // Procesar datos según la vista seleccionada
  const datosProcessados = useMemo(() => {
    if (!detalleVentas.length) return [];

    // Enriquecer detalles con info de venta y producto
    const detallesEnriquecidos = detalleVentas
      .map((detalle) => {
        const venta = ventas.find((v) => v.id === detalle.venta_id);
        const producto = productos.find((p) => p.id === detalle.producto_id);
        
        // Calcular valores
        const cantidad = Number(detalle.cantidad || 0);
        const precioUnitario = Number(detalle.precio_unitario || 0);
        const descuento = Number(detalle.descuento || 0);
        const impuesto = Number(detalle.impuesto || 0);
        const precioCosto = Number(detalle.precio_costo || producto?.precio_compra || 0);
        const subtotal = Number(detalle.subtotal || precioUnitario * cantidad);
        const total = subtotal - descuento + impuesto;
        const precioCostoTotal = precioCosto * cantidad;
        const ganancia = total - precioCostoTotal;
        const margen = total > 0 ? (ganancia / total) * 100 : 0;
        
        return {
          ...detalle,
          venta,
          producto,
          cantidad,
          precioUnitario,
          descuento,
          impuesto,
          precioCosto,
          subtotal,
          total,
          precioCostoTotal,
          ganancia,
          margen,
        };
      })
      .filter((d) => d.venta && d.producto);

    // Aplicar filtros
    let filtered = detallesEnriquecidos;

    if (buscarProducto.trim()) {
      filtered = filtered.filter((d) =>
        d.producto.nombre.toLowerCase().includes(buscarProducto.toLowerCase()) ||
        (d.producto.codigo && d.producto.codigo.toLowerCase().includes(buscarProducto.toLowerCase()))
      );
    }

    if (filtroCliente !== 'Ninguna') {
      filtered = filtered.filter((d) => d.venta.cliente === filtroCliente);
    }

    if (filtroUbicacion !== 'Todos') {
      filtered = filtered.filter((d) => {
        // Aquí necesitarías verificar cómo está relacionada la ubicación en tu venta
        return true; // Ajusta esto según tu estructura
      });
    }

    if (filtroCategoria !== 'Todos') {
      filtered = filtered.filter((d) => d.producto.categoria === filtroCategoria);
    }

    if (filtroMarca !== 'Todos') {
      filtered = filtered.filter((d) => {
        const marcaProducto = d.producto.marca_id 
          ? marcas.find(m => m.id === d.producto.marca_id)?.nombre 
          : d.producto.marca;
        return marcaProducto === filtroMarca;
      });
    }

    if (fechaInicio) {
      const inicio = new Date(fechaInicio);
      inicio.setHours(0, 0, 0, 0);
      filtered = filtered.filter((d) => new Date(d.venta.fecha) >= inicio);
    }

    if (fechaFin) {
      const fin = new Date(fechaFin);
      fin.setHours(23, 59, 59, 999);
      filtered = filtered.filter((d) => new Date(d.venta.fecha) <= fin);
    }

    // Procesar según vista
    if (vistaActual === 'Detallado') {
      return filtered;
    } else if (vistaActual === 'Agrupados') {
      // Agrupar por producto
      const agrupados = {};
      filtered.forEach((d) => {
        const key = d.producto_id;
        if (!agrupados[key]) {
          agrupados[key] = {
            producto_id: d.producto_id,
            producto: d.producto,
            cantidad: 0,
            total: 0,
            precioCostoTotal: 0,
            descuento: 0,
            impuesto: 0,
            ganancia: 0,
          };
        }
        agrupados[key].cantidad += d.cantidad;
        agrupados[key].total += d.total;
        agrupados[key].precioCostoTotal += d.precioCostoTotal;
        agrupados[key].descuento += d.descuento;
        agrupados[key].impuesto += d.impuesto;
        agrupados[key].ganancia += d.ganancia;
      });
      return Object.values(agrupados);
    } else if (vistaActual === 'Por categoría') {
      // Agrupar por categoría
      const agrupados = {};
      filtered.forEach((d) => {
        const key = d.producto.categoria || 'Sin categoría';
        if (!agrupados[key]) {
          agrupados[key] = {
            categoria: key,
            cantidad: 0,
            total: 0,
            precioCostoTotal: 0,
            descuento: 0,
            impuesto: 0,
            ganancia: 0,
          };
        }
        agrupados[key].cantidad += d.cantidad;
        agrupados[key].total += d.total;
        agrupados[key].precioCostoTotal += d.precioCostoTotal;
        agrupados[key].descuento += d.descuento;
        agrupados[key].impuesto += d.impuesto;
        agrupados[key].ganancia += d.ganancia;
      });
      return Object.values(agrupados);
    } else if (vistaActual === 'Por marca') {
      // Agrupar por marca
      const agrupados = {};
      filtered.forEach((d) => {
        const marcaProducto = d.producto.marca_id 
          ? marcas.find(m => m.id === d.producto.marca_id)?.nombre 
          : d.producto.marca || 'Sin marca';
        if (!agrupados[marcaProducto]) {
          agrupados[marcaProducto] = {
            marca: marcaProducto,
            cantidad: 0,
            total: 0,
            precioCostoTotal: 0,
            descuento: 0,
            impuesto: 0,
            ganancia: 0,
          };
        }
        agrupados[marcaProducto].cantidad += d.cantidad;
        agrupados[marcaProducto].total += d.total;
        agrupados[marcaProducto].precioCostoTotal += d.precioCostoTotal;
        agrupados[marcaProducto].descuento += d.descuento;
        agrupados[marcaProducto].impuesto += d.impuesto;
        agrupados[marcaProducto].ganancia += d.ganancia;
      });
      return Object.values(agrupados);
    }

    return filtered;
  }, [
    detalleVentas,
    ventas,
    productos,
    marcas,
    buscarProducto,
    filtroCliente,
    filtroUbicacion,
    filtroCategoria,
    filtroMarca,
    fechaInicio,
    fechaFin,
    vistaActual,
  ]);

  // Paginación
  const totalPaginas = Math.ceil(datosProcessados.length / porPagina);
  const datosPaginados = datosProcessados.slice(
    (paginaActual - 1) * porPagina,
    paginaActual * porPagina
  );

  // Exportar CSV
  const exportarCSV = () => {
    const headers = ['PRODUCTO', 'CANTIDAD', 'PRECIO UNITARIO', 'DESCUENTO', 'IMPUESTO', 'PRECIO GASTO', 'TOTAL', 'PRECIO COSTO TOTAL', 'GANANCIA', 'MARGEN'];
    const filas = datosProcessados.map((d) => [
      d.producto?.nombre || d.categoria || d.marca || 'N/A',
      d.cantidad || 0,
      Number(d.precioUnitario || 0).toLocaleString('es-PY'),
      Number(d.descuento || 0).toLocaleString('es-PY'),
      Number(d.impuesto || 0).toLocaleString('es-PY'),
      Number(d.precioCosto || 0).toLocaleString('es-PY'),
      Number(d.total || 0).toLocaleString('es-PY'),
      Number(d.precioCostoTotal || 0).toLocaleString('es-PY'),
      Number(d.ganancia || 0).toLocaleString('es-PY'),
      Number(d.margen || 0).toFixed(2) + '%',
    ]);

    const contenido = [
      headers.join(','),
      ...filas.map((f) => f.map((v) => `"${v}"`).join(',')),
    ].join('\n');

    const blob = new Blob([contenido], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `ventas-por-producto-${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Exportar Excel
  const exportarExcel = () => {
    const headers = ['PRODUCTO', 'CANTIDAD', 'PRECIO UNITARIO', 'DESCUENTO', 'IMPUESTO', 'PRECIO GASTO', 'TOTAL', 'PRECIO COSTO TOTAL', 'GANANCIA', 'MARGEN'];
    const filas = datosProcessados.map((d) => [
      d.producto?.nombre || d.categoria || d.marca || 'N/A',
      d.cantidad || 0,
      Number(d.precioUnitario || 0).toLocaleString('es-PY'),
      Number(d.descuento || 0).toLocaleString('es-PY'),
      Number(d.impuesto || 0).toLocaleString('es-PY'),
      Number(d.precioCosto || 0).toLocaleString('es-PY'),
      Number(d.total || 0).toLocaleString('es-PY'),
      Number(d.precioCostoTotal || 0).toLocaleString('es-PY'),
      Number(d.ganancia || 0).toLocaleString('es-PY'),
      Number(d.margen || 0).toFixed(2) + '%',
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

    const blob = new Blob([html], { type: 'application/vnd.ms-excel;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `ventas-por-producto-${new Date().toISOString().split('T')[0]}.xls`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Imprimir
  const imprimir = () => {
    const ventana = window.open('', '_blank');
    const headers = ['PRODUCTO', 'CANTIDAD', 'PRECIO UNITARIO', 'DESCUENTO', 'IMPUESTO', 'PRECIO GASTO', 'TOTAL', 'PRECIO COSTO TOTAL', 'GANANCIA', 'MARGEN'];
    const filas = datosProcessados.map((d) => [
      d.producto?.nombre || d.categoria || d.marca || 'N/A',
      d.cantidad || 0,
      Number(d.precioUnitario || 0).toLocaleString('es-PY'),
      Number(d.descuento || 0).toLocaleString('es-PY'),
      Number(d.impuesto || 0).toLocaleString('es-PY'),
      Number(d.precioCosto || 0).toLocaleString('es-PY'),
      Number(d.total || 0).toLocaleString('es-PY'),
      Number(d.precioCostoTotal || 0).toLocaleString('es-PY'),
      Number(d.ganancia || 0).toLocaleString('es-PY'),
      Number(d.margen || 0).toFixed(2) + '%',
    ]);

    let html = `
      <html>
        <head>
          <title>Ventas por Producto</title>
          <style>
            table { border-collapse: collapse; width: 100%; }
            th, td { border: 1px solid #000; padding: 8px; text-align: left; }
            th { background-color: #f0f0f0; font-weight: bold; }
            td { font-size: 12px; }
          </style>
        </head>
        <body>
          <h2>Ventas por Producto</h2>
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

  const formatGs = (valor) => `${Number(valor || 0).toLocaleString('es-PY')} Gs`;

  return (
    <div className="p-6 bg-gray-50 min-h-screen w-full font-sans text-gray-700">
      {/* Encabezado */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-800">
          {t('salesByProduct')}
        </h1>
      </div>

      {/* Panel de Filtros */}
      <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200 mb-6">
        <div className="text-sm font-bold text-gray-600 mb-3">{t('filters')}</div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Buscar Producto */}
          <div>
            <label className="block text-xs font-bold text-gray-600 mb-2">{t('searchProduct')}:</label>
            <input
              type="text"
              placeholder="Introduzca el no"
              value={buscarProducto}
              onChange={(e) => setBuscarProducto(e.target.value)}
              className="border border-gray-300 rounded-md p-2 w-full outline-none text-sm"
            />
          </div>

          {/* Cliente */}
          <div>
            <label className="block text-xs font-bold text-gray-600 mb-2">{t('customers')}:</label>
            <select
              value={filtroCliente}
              onChange={(e) => setFiltroCliente(e.target.value)}
              className="border border-gray-300 rounded-md p-2 w-full outline-none text-sm"
            >
              <option value="Ninguna">Ninguna</option>
              {clientes.map((c) => (
                <option key={c.id} value={c.nombre}>
                  {c.nombre}
                </option>
              ))}
            </select>
          </div>

          {/* Nombre del grupo de clientes */}
          <div>
            <label className="block text-xs font-bold text-gray-600 mb-2">{t('customerGroupName')}:</label>
            <select
              value={filtroGrupoClientes}
              onChange={(e) => setFiltroGrupoClientes(e.target.value)}
              className="border border-gray-300 rounded-md p-2 w-full outline-none text-sm"
            >
              <option value="Todas">Todas</option>
            </select>
          </div>

          {/* Categoría */}
          <div>
            <label className="block text-xs font-bold text-gray-600 mb-2">{t('categories')}:</label>
            <select
              value={filtroCategoria}
              onChange={(e) => setFiltroCategoria(e.target.value)}
              className="border border-gray-300 rounded-md p-2 w-full outline-none text-sm"
            >
              <option value="Todos">Todos</option>
              {categorias.map((c) => (
                <option key={c.id} value={c.nombre}>
                  {c.nombre}
                </option>
              ))}
            </select>
          </div>

          {/* Marca */}
          <div>
            <label className="block text-xs font-bold text-gray-600 mb-2">{t('brands')}:</label>
            <select
              value={filtroMarca}
              onChange={(e) => setFiltroMarca(e.target.value)}
              className="border border-gray-300 rounded-md p-2 w-full outline-none text-sm"
            >
              <option value="Todos">Todos</option>
              {marcas.map((m) => (
                <option key={m.id} value={m.nombre}>
                  {m.nombre}
                </option>
              ))}
            </select>
          </div>

          {/* Rango de Fechas */}
          <div className="md:col-span-2">
            <label className="block text-xs font-bold text-gray-600 mb-2">Rango de fechas:</label>
            <div className="flex gap-2">
              <input
                type="date"
                value={fechaInicio}
                onChange={(e) => setFechaInicio(e.target.value)}
                className="border border-gray-300 rounded-md p-2 flex-1 outline-none text-sm"
              />
              <span className="text-gray-400 flex items-center">-</span>
              <input
                type="date"
                value={fechaFin}
                onChange={(e) => setFechaFin(e.target.value)}
                className="border border-gray-300 rounded-md p-2 flex-1 outline-none text-sm"
              />
            </div>
          </div>

          {/* Intervalo de tiempo */}
          <div>
            <label className="block text-xs font-bold text-gray-600 mb-2">Intervalo de tiempo:</label>
            <input
              type="text"
              value={intervaloTiempo}
              onChange={(e) => setIntervaloTiempo(e.target.value)}
              className="border border-gray-300 rounded-md p-2 w-full outline-none text-sm"
            />
          </div>

          {/* Orden del producto */}
          <div>
            <label className="block text-xs font-bold text-gray-600 mb-2">Orden del producto:</label>
            <select
              value={ordenProducto}
              onChange={(e) => setOrdenProducto(e.target.value)}
              className="border border-gray-300 rounded-md p-2 w-full outline-none text-sm"
            >
              <option value="Todos">Todos</option>
              <option value="A-Z">A-Z</option>
              <option value="Z-A">Z-A</option>
            </select>
          </div>
        </div>
      </div>

      {/* Vistas */}
      <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200 mb-6 flex flex-wrap gap-2">
        {['Detallado', 'Detallado (Con la compra)', 'Agrupados', 'Por categoría', 'Por marca'].map((vista) => (
          <button
            key={vista}
            onClick={() => setVistaActual(vista)}
            className={`px-4 py-2 rounded-lg text-sm font-bold transition-colors ${
              vistaActual === vista
                ? 'bg-orange-500 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            {vista}
          </button>
        ))}
      </div>

      {/* Opciones de Exportación */}
      <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200 mb-6 flex flex-wrap gap-2">
        <button
          onClick={exportarCSV}
          className="bg-blue-500 hover:bg-blue-600 text-white font-bold py-2 px-4 rounded-lg text-sm transition-colors flex items-center gap-2"
        >
          📥 Exportar a CSV
        </button>
        <button
          onClick={exportarExcel}
          className="bg-green-500 hover:bg-green-600 text-white font-bold py-2 px-4 rounded-lg text-sm transition-colors flex items-center gap-2"
        >
          📊 Exportar a Excel
        </button>
        <button
          onClick={imprimir}
          className="bg-gray-600 hover:bg-gray-700 text-white font-bold py-2 px-4 rounded-lg text-sm transition-colors flex items-center gap-2"
        >
          🖨️ Imprimir
        </button>
        <button className="bg-red-500 hover:bg-red-600 text-white font-bold py-2 px-4 rounded-lg text-sm transition-colors flex items-center gap-2">
          📄 Exportar a PDF
        </button>
        <div className="flex items-center gap-2 bg-gray-100 rounded-lg p-2 ml-auto">
          <button className="text-xs font-bold text-gray-600 px-2 py-1">👁️ Visibilidad de columnas</button>
        </div>
      </div>

      {/* Búsqueda rápida */}
      <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200 mb-6">
        <input
          type="text"
          placeholder="Buscar ..."
          className="border border-gray-300 rounded-md p-2 w-full outline-none text-sm"
        />
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
                    <th className="px-4 py-3 text-left font-bold text-gray-700">PRODUCTO</th>
                    {columnasVisibles.cantidad && <th className="px-4 py-3 text-center font-bold text-gray-700">CANTIDAD</th>}
                    {columnasVisibles.precio_unitario && <th className="px-4 py-3 text-right font-bold text-gray-700">PRECIO UNITARIO</th>}
                    {columnasVisibles.descuento && <th className="px-4 py-3 text-right font-bold text-gray-700">DESCUENTO</th>}
                    {columnasVisibles.impuesto && <th className="px-4 py-3 text-right font-bold text-gray-700">IMPUESTO</th>}
                    {columnasVisibles.precio_gasto && <th className="px-4 py-3 text-right font-bold text-gray-700">PRECIO GASTO</th>}
                    {columnasVisibles.total && <th className="px-4 py-3 text-right font-bold text-gray-700">TOTAL</th>}
                    {columnasVisibles.precio_costo_total && <th className="px-4 py-3 text-right font-bold text-gray-700">PRECIO COSTO TOTAL</th>}
                    {columnasVisibles.costo_gasto && <th className="px-4 py-3 text-right font-bold text-gray-700">COSTO GASTO</th>}
                    {columnasVisibles.ganancia && <th className="px-4 py-3 text-right font-bold text-gray-700">GANANCIA</th>}
                    {columnasVisibles.margen && <th className="px-4 py-3 text-right font-bold text-gray-700">MARGEN</th>}
                  </tr>
                </thead>
                <tbody>
                  {datosPaginados.map((item, idx) => (
                    <tr key={idx} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="px-4 py-3 font-bold text-gray-800">
                        {item.producto?.nombre || item.categoria || item.marca || 'N/A'}
                      </td>
                      {columnasVisibles.cantidad && <td className="px-4 py-3 text-center">{item.cantidad || 0}</td>}
                      {columnasVisibles.precio_unitario && (
                        <td className="px-4 py-3 text-right">{formatGs(item.precioUnitario)}</td>
                      )}
                      {columnasVisibles.descuento && (
                        <td className="px-4 py-3 text-right">{formatGs(item.descuento)}</td>
                      )}
                      {columnasVisibles.impuesto && (
                        <td className="px-4 py-3 text-right">{formatGs(item.impuesto)}</td>
                      )}
                      {columnasVisibles.precio_gasto && (
                        <td className="px-4 py-3 text-right">{formatGs(item.precioCosto)}</td>
                      )}
                      {columnasVisibles.total && (
                        <td className="px-4 py-3 text-right font-bold text-gray-800">{formatGs(item.total)}</td>
                      )}
                      {columnasVisibles.precio_costo_total && (
                        <td className="px-4 py-3 text-right">{formatGs(item.precioCostoTotal)}</td>
                      )}
                      {columnasVisibles.costo_gasto && (
                        <td className="px-4 py-3 text-right">{formatGs(item.precioCostoTotal)}</td>
                      )}
                      {columnasVisibles.ganancia && (
                        <td className="px-4 py-3 text-right text-green-600 font-bold">
                          {formatGs(item.ganancia)}
                        </td>
                      )}
                      {columnasVisibles.margen && (
                        <td className="px-4 py-3 text-right text-green-600 font-bold">
                          {Number(item.margen).toFixed(2)}%
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Total */}
            <div className="bg-gray-100 px-4 py-3 font-bold text-gray-800 border-t border-gray-200 flex justify-between">
              <span>Total:</span>
              <span>{datosProcessados.reduce((acc, d) => acc + (d.cantidad || 0), 0)} UNID</span>
            </div>

            {/* Paginación */}
            <div className="bg-gray-50 px-6 py-4 border-t border-gray-200 flex items-center justify-between text-xs">
              <div className="text-gray-600">
                Mostrando {datosPaginados.length > 0 ? (paginaActual - 1) * porPagina + 1 : 0} a{' '}
                {Math.min(paginaActual * porPagina, datosProcessados.length)} de {datosProcessados.length} resultados
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

export default VentasPorProducto;
