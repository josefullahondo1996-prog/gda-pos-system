import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Download, FileSpreadsheet, FileText, Filter, Printer, RefreshCw, SlidersHorizontal } from 'lucide-react';
import { supabase } from './supabaseClient';
import { useEmpresaInfo } from './utils/useEmpresa';
import { useUbicacionUsuario } from './utils/useUbicacion';

const SIN_PERSONAL = 'Sin personal';
const LIMITE_CONSULTA = 1000;
const formatGs = (value) => `${Math.round(Number(value) || 0).toLocaleString('es-PY')} Gs`;
const formatDate = (value) => value ? new Date(value).toLocaleString('es-PY', { dateStyle: 'short', timeStyle: 'short' }) : '—';
const dateStart = (value) => value ? new Date(`${value}T00:00:00`).toISOString() : null;
const dateEnd = (value) => value ? new Date(`${value}T23:59:59.999`).toISOString() : null;
const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const escapeCsv = (value) => `"${String(value ?? '').replaceAll('"', '""')}"`;
const unique = (values) => [...new Set(values.filter(Boolean))];

const readAllPages = async (makeQuery) => {
  const rows = [];
  for (let offset = 0; ; offset += LIMITE_CONSULTA) {
    const { data, error } = await makeQuery().range(offset, offset + LIMITE_CONSULTA - 1);
    if (error) throw error;
    rows.push(...(data || []));
    if (!data || data.length < LIMITE_CONSULTA) break;
  }
  return rows;
};

const ORDER_COLUMNS = [
  { key: 'fecha', label: 'FECHA', value: (row) => new Date(row.fecha || 0).getTime() },
  { key: 'factura', label: 'FACTURA NO.', value: (row) => row.factura },
  { key: 'personal', label: 'PERSONAL DE SERVICIO', value: (row) => row.personal },
  { key: 'ubicacion', label: 'UBICACIÓN', value: (row) => row.ubicacion },
  { key: 'subtotal', label: 'SUBTOTAL', money: true, value: (row) => row.subtotal },
  { key: 'descuento', label: 'DESCUENTO TOTAL', money: true, value: (row) => row.descuento },
  { key: 'impuesto', label: 'TOTAL IMPUESTOS', money: true, value: (row) => row.impuesto },
  { key: 'cantidad', label: 'CANTIDAD TOTAL', value: (row) => row.cantidad },
];

const LINE_COLUMNS = [
  { key: 'fecha', label: 'FECHA', value: (row) => new Date(row.fecha || 0).getTime() },
  { key: 'factura', label: 'FACTURA NO.', value: (row) => row.factura },
  { key: 'personal', label: 'PERSONAL DE SERVICIO', value: (row) => row.personal },
  { key: 'producto', label: 'PRODUCTO', value: (row) => row.producto },
  { key: 'cantidad', label: 'CANTIDAD', value: (row) => row.cantidad },
  { key: 'precio', label: 'PRECIO UNITARIO', money: true, value: (row) => row.precio },
  { key: 'descuento', label: 'DESCUENTO', money: true, value: (row) => row.descuento },
  { key: 'impuesto', label: 'IMPUESTO', money: true, value: (row) => row.impuesto },
  { key: 'neto', label: 'PRECIO NETO', money: true, value: (row) => row.neto },
  { key: 'total', label: 'TOTAL', money: true, value: (row) => row.total },
];

const defaultVisibility = (columns) => Object.fromEntries(columns.map(({ key }) => [key, true]));

export default function VentasPorPersonal() {
  const { id: empresaId } = useEmpresaInfo();
  const { id: ubicacionUsuarioId, ve_todas: usuarioVeTodas, cargando: cargandoPermisos } = useUbicacionUsuario();
  const solicitudRef = useRef(0);
  const [fechaInicio, setFechaInicio] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
  });
  const [fechaFin, setFechaFin] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10);
  });
  const [ventas, setVentas] = useState([]);
  const [detalles, setDetalles] = useState([]);
  const [usuarios, setUsuarios] = useState([]);
  const [ubicaciones, setUbicaciones] = useState([]);
  const [ubicacionFiltro, setUbicacionFiltro] = useState('');
  const [personalFiltro, setPersonalFiltro] = useState('');
  const [pestana, setPestana] = useState('pedidos');
  const [buscar, setBuscar] = useState('');
  const [porPagina, setPorPagina] = useState('25');
  const [pagina, setPagina] = useState(1);
  const [orden, setOrden] = useState({ key: 'fecha', asc: false });
  const [visibilidad, setVisibilidad] = useState({ pedidos: defaultVisibility(ORDER_COLUMNS), lineas: defaultVisibility(LINE_COLUMNS) });
  const [mostrarColumnas, setMostrarColumnas] = useState(false);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!cargandoPermisos && !usuarioVeTodas && ubicacionUsuarioId) setUbicacionFiltro(String(ubicacionUsuarioId));
  }, [cargandoPermisos, usuarioVeTodas, ubicacionUsuarioId]);

  const cargarDatos = useCallback(async () => {
    if (cargandoPermisos) return;
    if (!empresaId) {
      setCargando(false);
      return;
    }
    const solicitud = ++solicitudRef.current;
    const vigente = () => solicitud === solicitudRef.current;
    if (!usuarioVeTodas && !ubicacionUsuarioId) {
      setVentas([]);
      setDetalles([]);
      setError('Este usuario no tiene una sucursal asignada para consultar el informe.');
      setCargando(false);
      return;
    }
    if (!fechaInicio || !fechaFin || fechaInicio > fechaFin) {
      setError('Seleccioná un rango de fechas válido.');
      setCargando(false);
      return;
    }

    let activa = true;
    setCargando(true);
    setError('');
    try {
      const sucursalEfectiva = usuarioVeTodas ? ubicacionFiltro : ubicacionUsuarioId;
      const makeSalesQuery = () => {
        let query = supabase.from('ventas').select('*')
          .eq('empresa_id', empresaId)
          .gte('fecha', dateStart(fechaInicio))
          .lte('fecha', dateEnd(fechaFin))
          .order('fecha', { ascending: false });
        if (sucursalEfectiva) query = query.eq('ubicacion_id', sucursalEfectiva);
        return query;
      };

      const [ventasCargadas, usuariosResult, ubicacionesResult] = await Promise.all([
        readAllPages(makeSalesQuery),
        supabase.from('usuarios').select('id, nombre, apellido, activo').eq('empresa_id', empresaId).order('nombre'),
        supabase.from('ubicaciones_comerciales').select('id, nombre').eq('empresa_id', empresaId).order('nombre'),
      ]);
      if (usuariosResult.error) throw usuariosResult.error;
      if (ubicacionesResult.error) throw ubicacionesResult.error;

      const detallesCargados = [];
      for (let index = 0; index < ventasCargadas.length; index += 100) {
        const ids = ventasCargadas.slice(index, index + 100).map((venta) => venta.id);
        const paginaDetalles = await readAllPages(() => supabase.from('detalle_ventas').select('*')
          .eq('empresa_id', empresaId).in('venta_id', ids));
        detallesCargados.push(...paginaDetalles);
      }

      if (!vigente()) return;
      setVentas(ventasCargadas);
      setDetalles(detallesCargados);
      setUsuarios(usuariosResult.data || []);
      setUbicaciones(ubicacionesResult.data || []);
    } catch (loadError) {
      if (!vigente()) return;
      setVentas([]);
      setDetalles([]);
      setError(loadError?.message || 'No se pudo cargar el informe de ventas por personal.');
    } finally {
      if (vigente()) setCargando(false);
    }
  }, [empresaId, cargandoPermisos, usuarioVeTodas, ubicacionUsuarioId, ubicacionFiltro, fechaInicio, fechaFin]);

  useEffect(() => {
    cargarDatos();
    return () => { solicitudRef.current += 1; };
  }, [cargarDatos]);

  const nombreUbicacion = useMemo(() => new Map(ubicaciones.map((item) => [String(item.id), item.nombre])), [ubicaciones]);
  const detallesPorVenta = useMemo(() => {
    const mapa = new Map();
    detalles.forEach((detalle) => {
      const key = String(detalle.venta_id);
      if (!mapa.has(key)) mapa.set(key, []);
      mapa.get(key).push(detalle);
    });
    return mapa;
  }, [detalles]);
  const personalOptions = useMemo(() => unique([
    ...usuarios.map((item) => [item.nombre, item.apellido].filter(Boolean).join(' ').trim()),
    ...ventas.map((venta) => venta.personal_servicio || venta.usuario_nombre),
  ]).sort((a, b) => a.localeCompare(b, 'es')), [usuarios, ventas]);

  const ventasFiltradas = useMemo(() => ventas.filter((venta) => {
    const personal = venta.personal_servicio || venta.usuario_nombre || SIN_PERSONAL;
    return !personalFiltro || personal === personalFiltro;
  }), [ventas, personalFiltro]);

  const filasPedidos = useMemo(() => ventasFiltradas.map((venta) => {
    const lineas = detallesPorVenta.get(String(venta.id)) || [];
    const subtotalLineas = lineas.reduce((sum, linea) => sum + (Number(linea.subtotal) || (Number(linea.cantidad) || 0) * (Number(linea.precio_unitario) || 0)), 0);
    const descuentoLineas = lineas.reduce((sum, linea) => sum + (Number(linea.descuento) || 0), 0);
    const impuesto = lineas.reduce((sum, linea) => sum + (Number(linea.impuesto) || 0), 0);
    const descuento = venta.descuento == null ? descuentoLineas : Number(venta.descuento) || 0;
    const cargo = Number(venta.cargo_embalaje) || 0;
    return {
      id: venta.id,
      fecha: venta.fecha,
      factura: String(venta.numero_factura || venta.nro_factura || venta.factura_no || venta.id || '—'),
      personal: venta.personal_servicio || venta.usuario_nombre || SIN_PERSONAL,
      ubicacion: nombreUbicacion.get(String(venta.ubicacion_id)) || '—',
      subtotal: lineas.length ? subtotalLineas : (Number(venta.total) || 0) + descuento - cargo - impuesto,
      descuento,
      impuesto,
      cantidad: lineas.length ? lineas.reduce((sum, linea) => sum + (Number(linea.cantidad) || 0), 0) : Number(venta.articulos) || 0,
    };
  }), [ventasFiltradas, detallesPorVenta, nombreUbicacion]);

  const filasLineas = useMemo(() => ventasFiltradas.flatMap((venta) => {
    const lineas = detallesPorVenta.get(String(venta.id)) || [];
    const subtotalVenta = lineas.reduce((sum, linea) => sum + (Number(linea.subtotal) || (Number(linea.cantidad) || 0) * (Number(linea.precio_unitario) || 0)), 0);
    const descuentoVenta = Number(venta.descuento) || 0;
    const descuentoExplicito = lineas.reduce((sum, linea) => sum + (Number(linea.descuento) || 0), 0);
    const descuentoRestante = Math.max(0, descuentoVenta - descuentoExplicito);
    return lineas.map((linea) => {
      const cantidad = Number(linea.cantidad) || 0;
      const precio = Number(linea.precio_unitario) || 0;
      const subtotal = Number(linea.subtotal) || cantidad * precio;
      const descuento = (Number(linea.descuento) || 0) + (subtotalVenta ? descuentoRestante * subtotal / subtotalVenta : 0);
      const impuesto = Number(linea.impuesto) || 0;
      const neto = Math.max(0, subtotal - descuento);
      return {
        id: linea.id || `${venta.id}-${linea.producto_id || linea.nombre_producto}`,
        fecha: venta.fecha,
        factura: String(venta.numero_factura || venta.nro_factura || venta.factura_no || venta.id || '—'),
        personal: venta.personal_servicio || venta.usuario_nombre || SIN_PERSONAL,
        producto: linea.nombre_producto || linea.producto_nombre || `Producto ${linea.producto_id || ''}`.trim(),
        cantidad,
        precio,
        descuento,
        impuesto,
        neto,
        total: neto + impuesto,
      };
    });
  }), [ventasFiltradas, detallesPorVenta]);

  const definiciones = pestana === 'pedidos' ? ORDER_COLUMNS : LINE_COLUMNS;
  const filasBase = pestana === 'pedidos' ? filasPedidos : filasLineas;
  const filasFiltradas = useMemo(() => {
    const needle = buscar.trim().toLocaleLowerCase('es');
    const rows = filasBase.filter((row) => !needle || Object.values(row).some((value) => String(value ?? '').toLocaleLowerCase('es').includes(needle)));
    const columna = definiciones.find((item) => item.key === orden.key);
    if (!columna) return rows;
    return [...rows].sort((a, b) => {
      const left = columna.value(a);
      const right = columna.value(b);
      const compare = typeof left === 'number' && typeof right === 'number'
        ? left - right
        : String(left ?? '').localeCompare(String(right ?? ''), 'es', { numeric: true, sensitivity: 'base' });
      return orden.asc ? compare : -compare;
    });
  }, [filasBase, buscar, definiciones, orden]);

  useEffect(() => { setPagina(1); }, [fechaInicio, fechaFin, ubicacionFiltro, personalFiltro, pestana, buscar, porPagina]);
  const limite = porPagina === 'all' ? filasFiltradas.length : Number(porPagina);
  const paginas = Math.max(1, Math.ceil(filasFiltradas.length / Math.max(1, limite)));
  const paginaSegura = Math.min(pagina, paginas);
  const filasPagina = filasFiltradas.slice((paginaSegura - 1) * limite, paginaSegura * limite);
  const columnasVisibles = definiciones.filter((columna) => visibilidad[pestana][columna.key]);
  const sumar = (key) => filasFiltradas.reduce((sum, row) => sum + (Number(row[key]) || 0), 0);

  const valorCelda = (row, columna) => columna.key === 'fecha'
    ? formatDate(row.fecha)
    : columna.money ? formatGs(columna.value(row)) : columna.value(row) ?? '—';

  const cambiarOrden = (key) => setOrden((actual) => ({ key, asc: actual.key === key ? !actual.asc : true }));
  const cambiarPestana = (next) => {
    setPestana(next);
    setOrden({ key: 'fecha', asc: false });
    setMostrarColumnas(false);
  };

  const exportar = (formato) => {
    const encabezados = columnasVisibles.map((columna) => columna.label);
    const contenido = [
      encabezados.map(escapeCsv).join(','),
      ...filasFiltradas.map((row) => columnasVisibles.map((columna) => escapeCsv(valorCelda(row, columna))).join(',')),
    ].join('\r\n');
    const blob = formato === 'excel'
      ? new Blob([`<html><meta charset="utf-8"><table><thead><tr>${encabezados.map((value) => `<th>${escapeHtml(value)}</th>`).join('')}</tr></thead><tbody>${filasFiltradas.map((row) => `<tr>${columnasVisibles.map((columna) => `<td>${escapeHtml(valorCelda(row, columna))}</td>`).join('')}</tr>`).join('')}</tbody></table></html>`], { type: 'application/vnd.ms-excel;charset=utf-8' })
      : new Blob(['\ufeff', contenido], { type: 'text/csv;charset=utf-8' });
    const href = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = href;
    anchor.download = `ventas-por-personal-${pestana}-${new Date().toISOString().slice(0, 10)}.${formato === 'excel' ? 'xls' : 'csv'}`;
    anchor.click();
    URL.revokeObjectURL(href);
  };

  const imprimir = () => {
    const ventana = window.open('', '_blank');
    if (!ventana) return;
    const encabezados = columnasVisibles.map((columna) => `<th>${escapeHtml(columna.label)}</th>`).join('');
    const body = filasFiltradas.map((row) => `<tr>${columnasVisibles.map((columna) => `<td>${escapeHtml(valorCelda(row, columna))}</td>`).join('')}</tr>`).join('');
    ventana.document.write(`<html><head><meta charset="utf-8"><title>Ventas por personal</title><style>body{font:12px Arial;padding:20px}h1{font-size:18px}table{border-collapse:collapse;width:100%}th,td{border:1px solid #ccc;padding:6px;text-align:left}th{background:#eee}@media print{body{padding:0}}</style></head><body><h1>Ventas por personal</h1><p>${escapeHtml(fechaInicio)} — ${escapeHtml(fechaFin)}</p><table><thead><tr>${encabezados}</tr></thead><tbody>${body || `<tr><td colspan="${columnasVisibles.length}">No hay datos</td></tr>`}</tbody></table></body></html>`);
    ventana.document.close();
    ventana.focus();
    ventana.print();
    ventana.close();
  };

  const exportarPdf = async () => {
    try {
      const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
      const doc = new jsPDF({ orientation: 'landscape' });
      doc.setFontSize(15);
      doc.text(pestana === 'pedidos' ? 'Ventas por personal — Pedidos' : 'Ventas por personal — Órdenes de línea', 14, 15);
      doc.setFontSize(9);
      doc.text(`${fechaInicio} — ${fechaFin}`, 14, 21);
      autoTable(doc, {
        startY: 26,
        head: [columnasVisibles.map((columna) => columna.label)],
        body: filasFiltradas.map((row) => columnasVisibles.map((columna) => String(valorCelda(row, columna)))),
        styles: { fontSize: 7, cellPadding: 2 },
        headStyles: { fillColor: [241, 245, 249], textColor: [51, 65, 85] },
      });
      doc.save(`ventas-por-personal-${pestana}-${new Date().toISOString().slice(0, 10)}.pdf`);
    } catch (exportError) {
      setError(exportError?.message || 'No se pudo generar el PDF.');
    }
  };

  return (
    <div className="mx-auto w-full max-w-[1500px] text-[13px] text-slate-700">
      <h1 className="mb-5 text-2xl font-bold tracking-tight text-slate-900">Ventas por personal</h1>

      <section className="mb-6 overflow-hidden rounded-[10px] border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center gap-2 border-b border-slate-200 bg-slate-50 px-5 py-3 font-bold text-sky-600"><Filter size={16} /> Filtros</div>
        <div className="grid grid-cols-1 gap-5 px-5 py-5 md:grid-cols-3">
          <label className="font-bold text-slate-800">Ubicación de la empresa:
            <select value={ubicacionFiltro} disabled={!usuarioVeTodas} onChange={(event) => setUbicacionFiltro(event.target.value)} className="mt-2 h-11 w-full rounded-md border border-slate-200 bg-white px-3 text-sm font-normal outline-none focus:border-sky-400 disabled:bg-slate-50">
              <option value="">Todas las localizaciones</option>
              {ubicaciones.map((ubicacion) => <option key={ubicacion.id} value={ubicacion.id}>{ubicacion.nombre}</option>)}
            </select>
          </label>
          <label className="font-bold text-slate-800">Personal de servicio:
            <select value={personalFiltro} onChange={(event) => setPersonalFiltro(event.target.value)} className="mt-2 h-11 w-full rounded-md border border-slate-200 bg-white px-3 text-sm font-normal outline-none focus:border-sky-400">
              <option value="">Todos</option>
              {personalOptions.map((persona) => <option key={persona} value={persona}>{persona}</option>)}
              {ventas.some((venta) => !venta.personal_servicio && !venta.usuario_nombre) && !personalOptions.includes(SIN_PERSONAL) && <option value={SIN_PERSONAL}>{SIN_PERSONAL}</option>}
            </select>
          </label>
          <fieldset className="font-bold text-slate-800"><legend>Rango de fechas:</legend>
            <div className="mt-2 grid grid-cols-2 overflow-hidden rounded-md border border-slate-200 bg-white text-sm font-normal">
              <input aria-label="Fecha desde" type="date" value={fechaInicio} max={fechaFin || undefined} onChange={(event) => setFechaInicio(event.target.value)} className="h-11 min-w-0 border-0 border-r border-slate-200 px-2 outline-none" />
              <input aria-label="Fecha hasta" type="date" value={fechaFin} min={fechaInicio || undefined} onChange={(event) => setFechaFin(event.target.value)} className="h-11 min-w-0 border-0 px-2 outline-none" />
            </div>
          </fieldset>
        </div>
      </section>

      {error && <div role="alert" className="mb-4 rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

      <section className="overflow-hidden rounded-[10px] border border-slate-200 bg-white shadow-sm">
        <div role="tablist" aria-label="Tipo de informe" className="flex border-b border-slate-200">
          {[['pedidos', 'Pedidos'], ['lineas', 'Órdenes de línea']].map(([key, label]) => (
            <button key={key} role="tab" aria-selected={pestana === key} onClick={() => cambiarPestana(key)} className={`border-b-2 px-5 py-3 text-[15px] font-bold ${pestana === key ? 'border-sky-500 text-slate-900' : 'border-transparent text-slate-600 hover:text-slate-900'}`}>{label}</button>
          ))}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 px-3 py-3">
          <label className="flex items-center gap-2 text-slate-600">Mostrar
            <select value={porPagina} onChange={(event) => setPorPagina(event.target.value)} className="h-9 rounded border border-slate-200 bg-white px-2 outline-none">
              {['25', '50', '100', '200', '500', '1000'].map((count) => <option key={count} value={count}>{Number(count).toLocaleString('es-PY')}</option>)}
              <option value="all">Todas</option>
            </select> entradas
          </label>
          <div className="flex flex-1 flex-wrap items-center justify-end gap-1.5">
            <button onClick={() => exportar('csv')} className="flex items-center gap-1 rounded border border-slate-200 bg-slate-50 px-2.5 py-2 font-medium text-slate-600 hover:bg-slate-100"><Download size={14} /> Exportar a CSV</button>
            <button onClick={() => exportar('excel')} className="flex items-center gap-1 rounded border border-slate-200 bg-slate-50 px-2.5 py-2 font-medium text-slate-600 hover:bg-slate-100"><FileSpreadsheet size={14} /> Exportar a Excel</button>
            <button onClick={imprimir} className="flex items-center gap-1 rounded border border-slate-200 bg-slate-50 px-2.5 py-2 font-medium text-slate-600 hover:bg-slate-100"><Printer size={14} /> Imprimir</button>
            <button onClick={() => setMostrarColumnas((value) => !value)} aria-expanded={mostrarColumnas} className="flex items-center gap-1 rounded border border-slate-200 bg-slate-50 px-2.5 py-2 font-medium text-slate-600 hover:bg-slate-100"><SlidersHorizontal size={14} /> Visibilidad de columnas</button>
            <button onClick={exportarPdf} className="flex items-center gap-1 rounded border border-slate-200 bg-slate-50 px-2.5 py-2 font-medium text-slate-600 hover:bg-slate-100"><FileText size={14} /> Exportar a PDF</button>
            <button onClick={cargarDatos} aria-label="Actualizar informe" title="Actualizar informe" className="rounded border border-slate-200 bg-white p-2 text-slate-500 hover:text-sky-600"><RefreshCw size={14} /></button>
            <input aria-label="Buscar" value={buscar} onChange={(event) => setBuscar(event.target.value)} placeholder="Buscar ..." className="h-9 w-40 rounded-full border border-slate-200 px-3 text-[13px] outline-none focus:border-sky-400" />
          </div>
        </div>

        {mostrarColumnas && <div className="flex flex-wrap gap-x-5 gap-y-2 border-t border-slate-100 px-4 py-3 text-xs">
          {definiciones.map((columna) => <label key={columna.key} className="flex items-center gap-2"><input type="checkbox" checked={visibilidad[pestana][columna.key]} onChange={() => setVisibilidad((actual) => ({ ...actual, [pestana]: { ...actual[pestana], [columna.key]: !actual[pestana][columna.key] } }))} />{columna.label}</label>)}
        </div>}

        <div className="overflow-x-auto border-t border-slate-100">
          <table className="w-full min-w-[900px] text-[12px]">
            <thead className="bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500"><tr>
              {columnasVisibles.map((columna) => <th key={columna.key} className="whitespace-nowrap px-3 py-3 text-left">
                <button type="button" onClick={() => cambiarOrden(columna.key)} className="flex items-center gap-2 font-bold hover:text-sky-600">{columna.label}<span aria-hidden="true">{orden.key === columna.key ? (orden.asc ? '↑' : '↓') : '↕'}</span></button>
              </th>)}
            </tr></thead>
            {!cargando && filasPagina.length > 0 && <tbody className="divide-y divide-slate-100">
              {filasPagina.map((row, index) => <tr key={row.id || index} className="hover:bg-slate-50">
                {columnasVisibles.map((columna) => <td key={columna.key} className="whitespace-nowrap px-3 py-3">{valorCelda(row, columna)}</td>)}
              </tr>)}
            </tbody>}
            <tfoot className="bg-slate-300 font-bold text-slate-800">
              {pestana === 'pedidos' ? <tr>
                <td colSpan={Math.max(1, columnasVisibles.findIndex((columna) => ['subtotal', 'descuento', 'impuesto', 'cantidad'].includes(columna.key)))} className="px-4 py-3 text-right">Total:</td>
                {columnasVisibles.filter((columna) => ['subtotal', 'descuento', 'impuesto', 'cantidad'].includes(columna.key)).map((columna) => <td key={columna.key} className="whitespace-nowrap px-3 py-3">{columna.money ? formatGs(sumar(columna.key)) : Math.round(sumar(columna.key)).toLocaleString('es-PY')}</td>)}
              </tr> : <tr>
                <td colSpan={Math.max(1, columnasVisibles.findIndex((columna) => ['cantidad', 'descuento', 'impuesto', 'neto', 'total'].includes(columna.key)))} className="px-4 py-3 text-right">Total:</td>
                {columnasVisibles.filter((columna) => ['cantidad', 'descuento', 'impuesto', 'neto', 'total'].includes(columna.key)).map((columna) => <td key={columna.key} className="whitespace-nowrap px-3 py-3">{columna.money ? formatGs(sumar(columna.key)) : Math.round(sumar(columna.key)).toLocaleString('es-PY')}</td>)}
              </tr>}
            </tfoot>
          </table>
          {cargando ? <div className="p-8 text-center text-slate-500">Cargando ventas por personal…</div> : filasFiltradas.length === 0 ? <div className="p-8 text-center text-slate-500">No hay datos disponibles en la tabla.</div> : null}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-3 py-4 text-slate-500">
          <span>Mostrando {filasPagina.length === 0 ? 0 : (paginaSegura - 1) * limite + 1} a {Math.min(paginaSegura * limite, filasFiltradas.length)} de {filasFiltradas.length.toLocaleString('es-PY')} entradas</span>
          <div className="flex overflow-hidden rounded border border-slate-200">
            <button disabled={paginaSegura <= 1} onClick={() => setPagina((value) => Math.max(1, value - 1))} className="border-r border-slate-200 bg-white px-3 py-1.5 disabled:opacity-40">Anterior</button>
            <span className="bg-sky-600 px-3 py-1.5 font-bold text-white">{paginaSegura}</span>
            <button disabled={paginaSegura >= paginas} onClick={() => setPagina((value) => Math.min(paginas, value + 1))} className="border-l border-slate-200 bg-white px-3 py-1.5 disabled:opacity-40">Siguiente</button>
          </div>
        </div>
      </section>
    </div>
  );
}
