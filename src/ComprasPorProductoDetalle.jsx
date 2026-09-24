import { useEffect, useMemo, useState } from 'react';
import { Download, FileSpreadsheet, FileText, Printer, Search, SlidersHorizontal } from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { supabase } from './supabaseClient';
import { useEmpresaInfo } from './utils/useEmpresa';
import FiltroFecha from './FiltroFecha';

const columnasIniciales = {
  producto: true,
  codigo: true,
  proveedor: true,
  referencia: true,
  fecha: true,
  cantidad: true,
  unidad: true,
  costo: true,
  subtotal: true,
};

const hoy = new Date();
const inicioHoy = new Date(hoy); inicioHoy.setHours(0, 0, 0, 0);
const finHoy = new Date(hoy); finHoy.setHours(23, 59, 59, 999);
const dinero = (valor) => `${Number(valor || 0).toLocaleString('es-PY')} Gs`;
const fechaTexto = (valor) => valor ? new Date(valor).toLocaleDateString('es-PY') : '-';
const esc = (valor) => String(valor ?? '').replaceAll('"', '""');

export default function ComprasPorProductoDetalle() {
  const { id: empresaId } = useEmpresaInfo();
  const [compras, setCompras] = useState([]);
  const [detalles, setDetalles] = useState([]);
  const [productos, setProductos] = useState([]);
  const [proveedores, setProveedores] = useState([]);
  const [ubicaciones, setUbicaciones] = useState([]);
  const [marcas, setMarcas] = useState([]);
  const [unidades, setUnidades] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [busquedaProducto, setBusquedaProducto] = useState('');
  const [busquedaTabla, setBusquedaTabla] = useState('');
  const [proveedorFiltro, setProveedorFiltro] = useState('');
  const [ubicacionFiltro, setUbicacionFiltro] = useState('');
  const [marcaFiltro, setMarcaFiltro] = useState('');
  const [rango, setRango] = useState({ desde: inicioHoy, hasta: finHoy, label: 'Hoy' });
  const [pagina, setPagina] = useState(1);
  const [porPagina, setPorPagina] = useState(25);
  const [columnas, setColumnas] = useState(columnasIniciales);
  const [mostrarColumnas, setMostrarColumnas] = useState(false);

  useEffect(() => {
    if (!empresaId) return;
    const cargar = async () => {
      setCargando(true); setError('');
      const respuestas = await Promise.all([
        supabase.from('compras').select('id, fecha, proveedor_nombre, nro_factura, ubicacion, ubicacion_id').eq('empresa_id', empresaId),
        supabase.from('detalle_compras').select('id, compra_id, producto_id, nombre_producto, codigo_sku, cantidad, costo_unitario, subtotal').eq('empresa_id', empresaId),
        supabase.from('productos').select('*').eq('empresa_id', empresaId),
        supabase.from('proveedores').select('id, empresa, nombre_contacto').eq('empresa_id', empresaId),
        supabase.from('ubicaciones_comerciales').select('id, nombre').eq('empresa_id', empresaId).eq('activo', true).order('nombre'),
        supabase.from('marcas').select('id, nombre').eq('empresa_id', empresaId).order('nombre'),
        supabase.from('unidades').select('id, nombre').eq('empresa_id', empresaId).order('nombre'),
      ]);
      const fallo = respuestas.find((respuesta) => respuesta.error);
      if (fallo) setError(fallo.error.message || 'No se pudieron cargar los datos del informe.');
      setCompras(respuestas[0].data || []);
      setDetalles(respuestas[1].data || []);
      setProductos(respuestas[2].data || []);
      setProveedores(respuestas[3].data || []);
      setUbicaciones(respuestas[4].data || []);
      setMarcas(respuestas[5].data || []);
      setUnidades(respuestas[6].data || []);
      setCargando(false);
    };
    cargar();
  }, [empresaId]);

  const datos = useMemo(() => {
    const compraMap = new Map(compras.map((item) => [item.id, item]));
    const productoMap = new Map(productos.map((item) => [item.id, item]));
    const unidadMap = new Map(unidades.map((item) => [item.id, item.nombre]));
    const marcaMap = new Map(marcas.map((item) => [item.id, item.nombre]));
    const proveedorMap = new Map(proveedores.map((item) => [item.empresa || item.nombre_contacto, item]));
    const texto = `${busquedaProducto} ${busquedaTabla}`.trim().toLowerCase();

    return detalles.map((detalle) => {
      const compra = compraMap.get(detalle.compra_id);
      const producto = productoMap.get(detalle.producto_id);
      const fecha = compra?.fecha ? new Date(compra.fecha) : null;
      const proveedor = compra?.proveedor_nombre || 'Sin proveedor';
      const unidad = unidadMap.get(producto?.unidad_id) || producto?.unidad || 'UNID';
      const marca = marcaMap.get(producto?.marca_id) || '';
      const cantidad = Number(detalle.cantidad) || 0;
      const costo = Number(detalle.costo_unitario) || 0;
      return {
        ...detalle,
        compra,
        producto,
        fecha,
        nombre: producto?.nombre || detalle.nombre_producto || 'Producto sin nombre',
        codigo: producto?.codigo || detalle.codigo_sku || '-',
        proveedor,
        referencia: compra?.nro_factura || (compra?.id ? `PO-${String(compra.id).slice(0, 8)}` : '-'),
        ubicacion: compra?.ubicacion_id || '',
        ubicacionTexto: compra?.ubicacion || 'Sin ubicación',
        marca,
        unidad,
        cantidad,
        costo,
        subtotal: Number(detalle.subtotal) || cantidad * costo,
      };
    }).filter((item) => {
      if (!item.compra || !item.fecha || Number.isNaN(item.fecha.getTime())) return false;
      if (rango.desde && item.fecha < rango.desde) return false;
      if (rango.hasta && item.fecha > rango.hasta) return false;
      if (proveedorFiltro && item.proveedor !== proveedorFiltro) return false;
      if (ubicacionFiltro && item.ubicacion !== ubicacionFiltro) return false;
      if (marcaFiltro && item.marca !== marcaFiltro) return false;
      if (texto && !`${item.nombre} ${item.codigo} ${item.proveedor} ${item.referencia} ${item.ubicacionTexto}`.toLowerCase().includes(texto)) return false;
      return true;
    }).sort((a, b) => b.fecha - a.fecha);
  }, [compras, detalles, productos, proveedores, ubicaciones, marcas, unidades, rango, busquedaProducto, busquedaTabla, proveedorFiltro, ubicacionFiltro, marcaFiltro]);

  useEffect(() => setPagina(1), [rango, busquedaProducto, busquedaTabla, proveedorFiltro, ubicacionFiltro, marcaFiltro, porPagina]);

  const totalPaginas = Math.max(1, Math.ceil(datos.length / porPagina));
  const paginaActual = Math.min(pagina, totalPaginas);
  const filas = datos.slice((paginaActual - 1) * porPagina, paginaActual * porPagina);
  const totalCantidad = datos.reduce((total, item) => total + item.cantidad, 0);
  const totalSubtotal = datos.reduce((total, item) => total + item.subtotal, 0);
  const proveedoresUnicos = [...new Set(compras.map((item) => item.proveedor_nombre).filter(Boolean))].sort();

  const encabezados = [
    ['producto', 'PRODUCTO'], ['codigo', 'SKU/CODIGO DE PRODUCTO'], ['proveedor', 'PROVEEDOR'], ['referencia', 'NUMERO DE REFERENCIA'],
    ['fecha', 'FECHA'], ['cantidad', 'CANTIDAD'], ['unidad', 'UNIDAD TOTAL AJUSTADA'], ['costo', 'PRECIO DE COMPRA UNITARIO'], ['subtotal', 'SUBTOTAL'],
  ];
  const valoresFila = (item) => ({ producto: item.nombre, codigo: item.codigo, proveedor: item.proveedor, referencia: item.referencia, fecha: fechaTexto(item.fecha), cantidad: item.cantidad, unidad: `${item.cantidad} ${item.unidad}`, costo: dinero(item.costo), subtotal: dinero(item.subtotal) });

  const exportarCSV = () => {
    const visibles = encabezados.filter(([key]) => columnas[key]);
    const filasCSV = datos.map((item) => { const valores = valoresFila(item); return visibles.map(([key]) => valores[key]); });
    const contenido = [visibles.map(([, label]) => label), ...filasCSV].map((fila) => fila.map((valor) => `"${esc(valor)}"`).join(',')).join('\n');
    const enlace = document.createElement('a');
    enlace.href = URL.createObjectURL(new Blob([contenido], { type: 'text/csv;charset=utf-8;' }));
    enlace.download = `compras-por-producto-${new Date().toISOString().slice(0, 10)}.csv`;
    enlace.click(); URL.revokeObjectURL(enlace.href);
  };

  const exportarExcel = () => {
    const visibles = encabezados.filter(([key]) => columnas[key]);
    const filasHTML = datos.map((item) => { const valores = valoresFila(item); return `<tr>${visibles.map(([key]) => `<td>${esc(valores[key])}</td>`).join('')}</tr>`; }).join('');
    const html = `<table><thead><tr>${visibles.map(([, label]) => `<th>${label}</th>`).join('')}</tr></thead><tbody>${filasHTML}</tbody></table>`;
    const enlace = document.createElement('a'); enlace.href = URL.createObjectURL(new Blob([html], { type: 'application/vnd.ms-excel' }));
    enlace.download = `compras-por-producto-${new Date().toISOString().slice(0, 10)}.xls`; enlace.click(); URL.revokeObjectURL(enlace.href);
  };

  const imprimir = () => {
    const ventana = window.open('', '_blank');
    if (!ventana) return;
    const visibles = encabezados.filter(([key]) => columnas[key]);
    const filasHTML = datos.map((item) => { const valores = valoresFila(item); return `<tr>${visibles.map(([key]) => `<td>${esc(valores[key])}</td>`).join('')}</tr>`; }).join('');
    ventana.document.write(`<html><head><title>Compras por producto</title><style>body{font-family:Arial;font-size:11px}table{border-collapse:collapse;width:100%}th,td{border:1px solid #ccc;padding:6px;text-align:left}th{background:#eee}</style></head><body><h2>Compras por producto</h2><table><thead><tr>${visibles.map(([, label]) => `<th>${label}</th>`).join('')}</tr></thead><tbody>${filasHTML}</tbody></table></body></html>`);
    ventana.document.close(); ventana.focus(); ventana.print();
  };

  const exportarPDF = () => {
    const visibles = encabezados.filter(([key]) => columnas[key]);
    const doc = new jsPDF({ orientation: 'landscape' });
    doc.text('Compras por producto', 14, 14);
    autoTable(doc, { head: [visibles.map(([, label]) => label)], body: datos.map((item) => { const valores = valoresFila(item); return visibles.map(([key]) => valores[key]); }), startY: 20, styles: { fontSize: 7 } });
    doc.save(`compras-por-producto-${new Date().toISOString().slice(0, 10)}.pdf`);
  };

  return (
    <div className="p-6 bg-gray-50 min-h-screen w-full text-gray-700">
      <h1 className="text-2xl font-bold text-gray-800 mb-5">Compras por producto</h1>
      <section className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 mb-5">
        <div className="flex items-center gap-2 text-sm font-bold text-sky-600 mb-4"><SlidersHorizontal size={16} /> Filtros</div>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          <label className="text-xs font-bold">Buscar producto:
            <div className="relative mt-2"><Search size={15} className="absolute left-3 top-2.5 text-gray-400" /><input value={busquedaProducto} onChange={(event) => setBusquedaProducto(event.target.value)} placeholder="Introduzca el nombre del producto / SKU" className="border border-gray-300 rounded-md p-2 pl-9 w-full text-sm font-normal" /></div>
          </label>
          <label className="text-xs font-bold">Proveedor:
            <select value={proveedorFiltro} onChange={(event) => setProveedorFiltro(event.target.value)} className="mt-2 border border-gray-300 rounded-md p-2 w-full text-sm font-normal"><option value="">Ninguna</option>{proveedoresUnicos.map((item) => <option key={item} value={item}>{item}</option>)}</select>
          </label>
          <label className="text-xs font-bold">Ubicación de la empresa:
            <select value={ubicacionFiltro} onChange={(event) => setUbicacionFiltro(event.target.value)} className="mt-2 border border-gray-300 rounded-md p-2 w-full text-sm font-normal"><option value="">Seleccione</option>{ubicaciones.map((item) => <option key={item.id} value={item.id}>{item.nombre}</option>)}</select>
          </label>
          <label className="text-xs font-bold">Rango de fechas:<span className="block mt-2"><FiltroFecha value={rango} onChange={setRango} /></span></label>
          <label className="text-xs font-bold">Marca:
            <select value={marcaFiltro} onChange={(event) => setMarcaFiltro(event.target.value)} className="mt-2 border border-gray-300 rounded-md p-2 w-full text-sm font-normal"><option value="">Todos</option>{marcas.map((item) => <option key={item.id} value={item.nombre}>{item.nombre}</option>)}</select>
          </label>
        </div>
      </section>

      <section className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
        <div className="flex flex-wrap items-center gap-2 mb-4 text-xs">
          <span>Mostrar</span><select value={porPagina} onChange={(event) => setPorPagina(Number(event.target.value))} className="border rounded p-1"><option value="10">10</option><option value="25">25</option><option value="50">50</option><option value="100">100</option></select><span>entradas</span>
          <button onClick={exportarCSV} className="border rounded px-3 py-1.5 bg-gray-50 hover:bg-gray-100 flex items-center gap-1"><Download size={13} /> Exportar a CSV</button>
          <button onClick={exportarExcel} className="border rounded px-3 py-1.5 bg-gray-50 hover:bg-gray-100 flex items-center gap-1"><FileSpreadsheet size={13} /> Exportar a Excel</button>
          <button onClick={imprimir} className="border rounded px-3 py-1.5 bg-gray-50 hover:bg-gray-100 flex items-center gap-1"><Printer size={13} /> Imprimir</button>
          <div className="relative"><button onClick={() => setMostrarColumnas((actual) => !actual)} className="border rounded px-3 py-1.5 bg-gray-50 hover:bg-gray-100 flex items-center gap-1"><SlidersHorizontal size={13} /> Visibilidad de columnas</button>{mostrarColumnas && <div className="absolute z-10 top-9 left-0 bg-white border rounded shadow p-3 w-64">{encabezados.map(([key, label]) => <label key={key} className="flex gap-2 items-center py-1 text-xs"><input type="checkbox" checked={columnas[key]} onChange={() => setColumnas((actual) => ({ ...actual, [key]: !actual[key] }))} /> {label}</label>)}</div>}</div>
          <button onClick={exportarPDF} className="border rounded px-3 py-1.5 bg-gray-50 hover:bg-gray-100 flex items-center gap-1"><FileText size={13} /> Exportar a PDF</button>
          <div className="relative ml-auto min-w-[190px]"><Search size={14} className="absolute left-2.5 top-2.5 text-gray-400" /><input value={busquedaTabla} onChange={(event) => setBusquedaTabla(event.target.value)} placeholder="Buscar ..." className="border rounded-full p-2 pl-8 w-full text-xs" /></div>
        </div>

        {error && <div className="mb-4 rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
        {cargando ? <div className="p-8 text-center text-gray-500">Cargando datos...</div> : !datos.length ? <div className="p-8 text-center text-gray-500">No hay datos disponibles.</div> : <div className="overflow-x-auto"><table className="w-full text-xs"><thead className="bg-gray-100 border-b"><tr>{encabezados.filter(([key]) => columnas[key]).map(([key, label]) => <th key={key} className="px-3 py-3 text-left font-bold whitespace-nowrap">{label}</th>)}</tr></thead><tbody>{filas.map((item) => { const valores = valoresFila(item); return <tr key={item.id} className="border-b hover:bg-gray-50">{encabezados.filter(([key]) => columnas[key]).map(([key]) => <td key={key} className={`px-3 py-3 ${['cantidad', 'costo', 'subtotal'].includes(key) ? 'text-right' : ''}`}>{valores[key]}</td>)}</tr>; })}</tbody><tfoot><tr className="bg-slate-200 font-bold"><td colSpan={Math.max(1, encabezados.findIndex(([key]) => key === 'cantidad'))} className="px-3 py-3 text-right">Total:</td>{columnas.cantidad && <td className="px-3 py-3 text-right">{totalCantidad.toLocaleString('es-PY')}</td>}{columnas.unidad && <td />}{columnas.costo && <td />}{columnas.subtotal && <td className="px-3 py-3 text-right">{dinero(totalSubtotal)}</td>}</tr></tfoot></table></div>}
        <div className="flex flex-wrap justify-between items-center gap-3 text-xs mt-4"><span>Mostrando {datos.length ? ((paginaActual - 1) * porPagina) + 1 : 0} a {Math.min(paginaActual * porPagina, datos.length)} de {datos.length} entradas</span><div className="flex gap-1"><button disabled={paginaActual === 1} onClick={() => setPagina((actual) => actual - 1)} className="border rounded px-3 py-1 disabled:opacity-40">Anterior</button><span className="bg-blue-600 text-white rounded px-3 py-1">{paginaActual}</span><button disabled={paginaActual === totalPaginas} onClick={() => setPagina((actual) => actual + 1)} className="border rounded px-3 py-1 disabled:opacity-40">Siguiente</button></div></div>
      </section>
    </div>
  );
}
