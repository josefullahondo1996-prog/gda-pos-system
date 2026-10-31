import { useEffect, useMemo, useState } from 'react';
import { ChevronDown, Download, FileSpreadsheet, FileText, Filter, Printer, Search, SlidersHorizontal } from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { supabase } from './supabaseClient';
import { useEmpresaInfo } from './utils/useEmpresa';
import { useUbicacionUsuario } from './utils/useUbicacion';
import FiltroFecha from './FiltroFecha';

const TAMANO_PAGINA = 1000;
const VISTAS = ['Detallado', 'Detallado (Con la compra)', 'Agrupados', 'Por categoria', 'Por marca'];
const COLUMNAS_POR_VISTA = {
  'Detallado': [
    ['producto', 'PRODUCTO'], ['codigo', 'SKU/CÓDIGO DE BARRAS'], ['cliente', 'NOMBRE DEL CLIENTE'], ['codigoContacto', 'CÓDIGO DE CONTACTO'],
    ['factura', 'FACTURA NO.'], ['fecha', 'FECHA'], ['cantidad', 'CANTIDAD'], ['precioUnitario', 'PRECIO UNITARIO'], ['descuento', 'DESCUENTO'],
    ['impuesto', 'IMPUESTO'], ['precioConImpuesto', 'PRECIO UNIT'], ['total', 'TOTAL'], ['precioCosto', 'PRECIO COSTO'], ['costoTotal', 'COSTO TOTAL'],
    ['ganancia', 'GANANCIA'], ['margen', 'MARGEN %'],
  ],
  'Detallado (Con la compra)': [
    ['producto', 'PRODUCTO'], ['codigo', 'SKU/CÓDIGO DE BARRAS'], ['cliente', 'NOMBRE DEL CLIENTE'], ['factura', 'FACTURA NO.'], ['fecha', 'FECHA'],
    ['referenciaCompra', 'NO. DE REFERENCIA DE COMPRA'], ['proveedor', 'NOMBRE DEL PROVEEDOR'], ['cantidad', 'CANTIDAD'],
  ],
  'Agrupados': [
    ['producto', 'PRODUCTO'], ['codigo', 'SKU/CÓDIGO DE BARRAS'], ['fecha', 'FECHA'], ['stock', 'STOCK ACTUAL'],
    ['cantidad', 'UNIDAD TOTAL VENDIDA'], ['total', 'TOTAL'],
  ],
  'Por categoria': [['categoria', 'CATEGORÍA'], ['stock', 'STOCK ACTUAL'], ['cantidad', 'UNIDAD TOTAL VENDIDA'], ['total', 'TOTAL']],
  'Por marca': [['marca', 'MARCA'], ['stock', 'STOCK ACTUAL'], ['cantidad', 'UNIDAD TOTAL VENDIDA'], ['total', 'TOTAL']],
};

const fechaLocal = (valor) => {
  if (!valor) return null;
  if (valor instanceof Date) return Number.isNaN(valor.getTime()) ? null : new Date(valor);
  const soloFecha = String(valor).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const fecha = soloFecha
    ? new Date(Number(soloFecha[1]), Number(soloFecha[2]) - 1, Number(soloFecha[3]))
    : new Date(valor);
  return Number.isNaN(fecha.getTime()) ? null : fecha;
};
const dinero = (valor) => `${Number(valor || 0).toLocaleString('es-PY', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} Gs`;
const numero = (valor) => Number(valor || 0).toLocaleString('es-PY', { minimumFractionDigits: 3, maximumFractionDigits: 3 });
const etiquetaFecha = (valor) => valor ? fechaLocal(valor)?.toLocaleDateString('es-PY') || '—' : '—';
const normalizarTexto = (valor) => String(valor || '').trim().toLocaleLowerCase('es');
const escaparHTML = (valor) => String(valor ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const escaparCSV = (valor) => String(valor ?? '').replaceAll('"', '""');
const fechaHoy = () => { const fecha = new Date(); fecha.setHours(0, 0, 0, 0); return fecha; };
const finHoy = () => { const fecha = new Date(); fecha.setHours(23, 59, 59, 999); return fecha; };
const fechaArchivo = () => { const fecha = new Date(); return `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}-${String(fecha.getDate()).padStart(2, '0')}`; };

async function cargarTablaEmpresa(tabla, empresaId) {
  const acumuladas = [];
  for (let inicio = 0; ; inicio += TAMANO_PAGINA) {
    const { data, error } = await supabase
      .from(tabla)
      .select('*')
      .eq('empresa_id', empresaId)
      .range(inicio, inicio + TAMANO_PAGINA - 1);
    if (error) return { data: acumuladas, error };
    acumuladas.push(...(data || []));
    if (!data || data.length < TAMANO_PAGINA) break;
  }
  return { data: acumuladas, error: null };
}

export default function VentasPorProductoClonado() {
  const { id: empresaId } = useEmpresaInfo();
  const { id: ubicacionUsuarioId, ve_todas: usuarioVeTodas, cargando: cargandoUbicacion } = useUbicacionUsuario();
  const [ventas, setVentas] = useState([]);
  const [detalles, setDetalles] = useState([]);
  const [productos, setProductos] = useState([]);
  const [clientes, setClientes] = useState([]);
  const [ubicaciones, setUbicaciones] = useState([]);
  const [marcas, setMarcas] = useState([]);
  const [unidades, setUnidades] = useState([]);
  const [compras, setCompras] = useState([]);
  const [detallesCompras, setDetallesCompras] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');

  const [productoFiltro, setProductoFiltro] = useState('');
  const [clienteFiltro, setClienteFiltro] = useState('');
  const [grupoFiltro, setGrupoFiltro] = useState('');
  const [ubicacionFiltro, setUbicacionFiltro] = useState('');
  const [categoriaFiltro, setCategoriaFiltro] = useState('');
  const [marcaFiltro, setMarcaFiltro] = useState('');
  const [origenFiltro, setOrigenFiltro] = useState('');
  const [horaDesde, setHoraDesde] = useState('00:00');
  const [horaHasta, setHoraHasta] = useState('23:59');
  const [rango, setRango] = useState({ desde: fechaHoy(), hasta: finHoy(), label: 'Hoy' });
  const [filtrosAbiertos, setFiltrosAbiertos] = useState(true);

  const [vista, setVista] = useState('Detallado');
  const [busquedaTabla, setBusquedaTabla] = useState('');
  const [pagina, setPagina] = useState(1);
  const [porPagina, setPorPagina] = useState('25');
  const [columnas, setColumnas] = useState({});
  const [mostrarColumnas, setMostrarColumnas] = useState(false);
  const [orden, setOrden] = useState({ clave: 'fecha', direccion: 'desc' });

  useEffect(() => {
    if (!empresaId) return undefined;
    let vigente = true;
    const cargar = async () => {
      setCargando(true);
      setError('');
      const tablas = ['ventas', 'detalle_ventas', 'productos', 'clientes', 'ubicaciones_comerciales', 'marcas', 'unidades', 'compras', 'detalle_compras'];
      const respuestas = await Promise.all(tablas.map((tabla) => cargarTablaEmpresa(tabla, empresaId)));
      if (!vigente) return;
      const fallo = respuestas.find((respuesta) => respuesta.error);
      if (fallo) setError(fallo.error.message || 'No se pudieron cargar los datos del informe.');
      const datos = respuestas.map((respuesta) => respuesta.data || []);
      setVentas(datos[0]);
      setDetalles(datos[1]);
      setProductos(datos[2]);
      setClientes(datos[3]);
      setUbicaciones(datos[4]);
      setMarcas(datos[5]);
      setUnidades(datos[6]);
      setCompras(datos[7]);
      setDetallesCompras(datos[8]);
      setCargando(false);
    };
    cargar();
    return () => { vigente = false; };
  }, [empresaId]);

  const mapas = useMemo(() => {
    const clientesPorId = new Map(clientes.map((cliente) => [String(cliente.id), cliente]));
    const clientesPorNombre = new Map(clientes.map((cliente) => [normalizarTexto(cliente.nombre || cliente.nombre_empresa), cliente]));
    const ubicacionPorId = new Map(ubicaciones.map((ubicacion) => [String(ubicacion.id), ubicacion.nombre]));
    const marcaPorId = new Map(marcas.map((marca) => [String(marca.id), marca.nombre]));
    const unidadPorId = new Map(unidades.map((unidad) => [String(unidad.id), unidad.nombre]));
    const productoPorId = new Map(productos.map((producto) => [String(producto.id), producto]));
    const compraPorId = new Map(compras.map((compra) => [String(compra.id), compra]));
    const ventasPorId = new Map(ventas.map((venta) => [String(venta.id), venta]));
    const totalPorVenta = new Map();
    detalles.forEach((detalle) => {
      const key = String(detalle.venta_id);
      totalPorVenta.set(key, (totalPorVenta.get(key) || 0) + Number(detalle.subtotal || 0));
    });
    const comprasPorProducto = new Map();
    detallesCompras.forEach((detalle) => {
      const compra = compraPorId.get(String(detalle.compra_id));
      if (!compra || !detalle.producto_id) return;
      const fila = { detalle, compra, fecha: fechaLocal(compra.fecha) };
      const key = String(detalle.producto_id);
      comprasPorProducto.set(key, [...(comprasPorProducto.get(key) || []), fila]);
    });
    comprasPorProducto.forEach((filas) => filas.sort((a, b) => (b.fecha?.getTime() || 0) - (a.fecha?.getTime() || 0)));
    return { clientesPorId, clientesPorNombre, ubicacionPorId, marcaPorId, unidadPorId, productoPorId, compraPorId, ventasPorId, totalPorVenta, comprasPorProducto };
  }, [clientes, ubicaciones, marcas, unidades, productos, compras, ventas, detalles, detallesCompras]);

  const opciones = useMemo(() => {
    const clienteNombres = ventas.map((venta) => venta.cliente || venta.cliente_nombre || mapas.clientesPorId.get(String(venta.cliente_id))?.nombre || '').filter(Boolean);
    const grupos = [...clientes.map((cliente) => cliente.grupo_clientes), ...ventas.map((venta) => venta.grupo_clientes || venta.grupo_cliente)].filter(Boolean);
    const categorias = productos.map((producto) => producto.categoria || mapas.categoriaPorId?.get?.(String(producto.categoria_id))).filter(Boolean);
    const nombresMarcas = productos.map((producto) => producto.marca || producto.marca_nombre || mapas.marcaPorId.get(String(producto.marca_id))).filter(Boolean);
    const origenes = [...new Set(ventas.map((venta) => venta.origen || venta.canal || venta.fuente).filter(Boolean))];
    return {
      clientes: [...new Set(clienteNombres)].sort((a, b) => a.localeCompare(b, 'es')),
      grupos: [...new Set(grupos)].sort((a, b) => a.localeCompare(b, 'es')),
      ubicaciones: ubicaciones.filter((ubicacion) => ubicacion.activo !== false && (usuarioVeTodas || String(ubicacion.id) === String(ubicacionUsuarioId))),
      categorias: [...new Set(categorias)].sort((a, b) => a.localeCompare(b, 'es')),
      marcas: [...new Set(nombresMarcas)].sort((a, b) => a.localeCompare(b, 'es')),
      origenes: [...new Set(['POS', 'Online', ...origenes])],
    };
  }, [ventas, clientes, productos, ubicaciones, mapas, usuarioVeTodas, ubicacionUsuarioId]);

  const ventasDetalladas = useMemo(() => {
    const resumenPorVenta = new Map();
    detalles.forEach((detalle) => {
      const key = String(detalle.venta_id);
      resumenPorVenta.set(key, (resumenPorVenta.get(key) || 0) + Number(detalle.subtotal || 0));
    });
    return detalles.flatMap((detalle) => {
      const venta = mapas.ventasPorId.get(String(detalle.venta_id));
      const producto = mapas.productoPorId.get(String(detalle.producto_id));
      if (!venta) return [];
      const fecha = fechaLocal(venta.fecha);
      if (!fecha) return [];
      const cliente = mapas.clientesPorId.get(String(venta.cliente_id))
        || mapas.clientesPorNombre.get(normalizarTexto(venta.cliente || venta.cliente_nombre));
      const nombre = producto?.nombre || detalle.nombre_producto || 'Producto sin nombre';
      const codigo = producto?.codigo || detalle.codigo_sku || detalle.codigo || '';
      const cantidad = Number(detalle.cantidad) || 0;
      const precioUnitario = Number(detalle.precio_unitario) || 0;
      const subtotal = Number(detalle.subtotal) || cantidad * precioUnitario;
      const impuesto = Number(detalle.impuesto) || 0;
      const descuentoDocumento = Number(venta.descuento) * (resumenPorVenta.get(String(venta.id)) ? subtotal / resumenPorVenta.get(String(venta.id)) : 0);
      const descuento = (Number(detalle.descuento) || 0) + descuentoDocumento;
      const total = Math.max(0, subtotal - descuento + impuesto);
      const precioCosto = Number(detalle.precio_costo) || Number(producto?.precio_compra) || 0;
      const costoTotal = precioCosto * cantidad;
      const ganancia = total - costoTotal;
      const unidad = detalle.unidad || mapas.unidadPorId.get(String(producto?.unidad_id)) || producto?.unidad || 'UNID';
      const ubicacionId = venta.ubicacion_id || venta.sucursal_id || '';
      const origen = venta.origen || venta.canal || venta.fuente || 'POS';
      return [{
        id: detalle.id,
        venta,
        producto,
        fecha,
        nombre,
        codigo,
        cliente: venta.cliente || venta.cliente_nombre || cliente?.nombre || cliente?.nombre_empresa || 'Ninguna',
        codigoContacto: venta.codigo_contacto || venta.codigo_cliente || cliente?.codigo_cliente || '—',
        grupo: venta.grupo_clientes || venta.grupo_cliente || cliente?.grupo_clientes || '',
        factura: venta.numero_factura || venta.nro_factura || venta.numero || '—',
        cantidad,
        unidad,
        precioUnitario,
        descuento,
        impuesto,
        precioConImpuesto: precioUnitario + (cantidad ? impuesto / cantidad : 0),
        total,
        precioCosto,
        costoTotal,
        ganancia,
        margen: total ? (ganancia / total) * 100 : 0,
        categoria: producto?.categoria || 'Sin categorizar',
        marca: producto?.marca || producto?.marca_nombre || mapas.marcaPorId.get(String(producto?.marca_id)) || 'Sin marca',
        stock: Number(producto?.stock_actual) || 0,
        ubicacionId: String(ubicacionId),
        ubicacionNombre: mapas.ubicacionPorId.get(String(ubicacionId)) || venta.ubicacion || '—',
        origen,
        unidadesVendidas: { [unidad]: cantidad },
      }];
    });
  }, [detalles, mapas]);

  const filasFiltradas = useMemo(() => {
    const texto = normalizarTexto(productoFiltro);
    const desde = rango.desde ? fechaLocal(rango.desde) : null;
    const hasta = rango.hasta ? fechaLocal(rango.hasta) : null;
    if (hasta) hasta.setHours(23, 59, 59, 999);
    const desdeMin = Number(horaDesde.slice(0, 2)) * 60 + Number(horaDesde.slice(3, 5));
    const hastaMin = Number(horaHasta.slice(0, 2)) * 60 + Number(horaHasta.slice(3, 5));
    const ubicacionAplicada = !usuarioVeTodas && ubicacionUsuarioId ? String(ubicacionUsuarioId) : ubicacionFiltro;
    return ventasDetalladas.filter((fila) => {
      const estado = normalizarTexto(fila.venta.estado_pago || fila.venta.estado || '');
      if (/(anulad|devuelt|cancelad)/.test(estado)) return false;
      if (desde && fila.fecha < desde) return false;
      if (hasta && fila.fecha > hasta) return false;
      const minutos = fila.fecha.getHours() * 60 + fila.fecha.getMinutes();
      const pasaHora = desdeMin <= hastaMin ? minutos >= desdeMin && minutos <= hastaMin : minutos >= desdeMin || minutos <= hastaMin;
      if (!pasaHora) return false;
      if (ubicacionAplicada && fila.ubicacionId !== ubicacionAplicada) return false;
      if (clienteFiltro && normalizarTexto(fila.cliente) !== normalizarTexto(clienteFiltro)) return false;
      if (grupoFiltro && (normalizarTexto(grupoFiltro) === 'ninguna' ? Boolean(fila.grupo) : normalizarTexto(fila.grupo) !== normalizarTexto(grupoFiltro))) return false;
      if (categoriaFiltro && normalizarTexto(fila.categoria) !== normalizarTexto(categoriaFiltro)) return false;
      if (marcaFiltro && normalizarTexto(fila.marca) !== normalizarTexto(marcaFiltro)) return false;
      if (origenFiltro && normalizarTexto(fila.origen) !== normalizarTexto(origenFiltro)) return false;
      if (texto && !normalizarTexto(`${fila.nombre} ${fila.codigo}`).includes(texto)) return false;
      return true;
    });
  }, [ventasDetalladas, rango, horaDesde, horaHasta, usuarioVeTodas, ubicacionUsuarioId, ubicacionFiltro, clienteFiltro, grupoFiltro, categoriaFiltro, marcaFiltro, origenFiltro, productoFiltro]);

  const filasPorVista = useMemo(() => {
    if (vista === 'Detallado' || vista === 'Detallado (Con la compra)') {
      if (vista === 'Detallado') return filasFiltradas;
      return filasFiltradas.map((fila) => {
        const comprasProducto = mapas.comprasPorProducto.get(String(fila.producto?.id)) || [];
        const compraAsociada = comprasProducto.find((registro) => registro.fecha && registro.fecha <= fila.fecha
          && (!fila.ubicacionId || !registro.compra.ubicacion_id || String(registro.compra.ubicacion_id) === fila.ubicacionId));
        return {
          ...fila,
          referenciaCompra: compraAsociada?.compra.nro_factura || (compraAsociada?.compra.id ? `PO-${String(compraAsociada.compra.id).slice(0, 8)}` : 'Sin referencia registrada'),
          proveedor: compraAsociada?.compra.proveedor_nombre || 'Sin proveedor registrado',
        };
      });
    }

    const agrupadas = new Map();
    filasFiltradas.forEach((fila) => {
      const clave = vista === 'Agrupados'
        ? `producto:${fila.producto?.id || fila.nombre}`
        : vista === 'Por categoria' ? `categoria:${fila.categoria}` : `marca:${fila.marca}`;
      const etiqueta = vista === 'Por categoria' ? fila.categoria : vista === 'Por marca' ? fila.marca : fila.nombre;
      const registro = agrupadas.get(clave) || {
        id: clave,
        nombre: etiqueta,
        codigo: fila.codigo,
        fecha: null,
        stock: 0,
        cantidad: 0,
        total: 0,
        categoria: fila.categoria,
        marca: fila.marca,
        unidadesVendidas: {},
        productosStock: new Set(),
      };
      registro.cantidad += fila.cantidad;
      registro.total += fila.total;
      registro.unidadesVendidas[fila.unidad] = (registro.unidadesVendidas[fila.unidad] || 0) + fila.cantidad;
      if (vista === 'Agrupados') {
        if (!registro.productosStock.has(String(fila.producto?.id || fila.nombre))) {
          registro.stock += fila.stock;
          registro.productosStock.add(String(fila.producto?.id || fila.nombre));
        }
        if (!registro.fecha || fila.fecha > registro.fecha) registro.fecha = fila.fecha;
      } else {
        const claveProducto = String(fila.producto?.id || fila.nombre);
        if (!registro.productosStock.has(claveProducto)) {
          registro.stock += fila.stock;
          registro.productosStock.add(claveProducto);
        }
      }
      agrupadas.set(clave, registro);
    });
    return [...agrupadas.values()].map(({ productosStock, ...fila }) => fila);
  }, [filasFiltradas, mapas.comprasPorProducto, vista]);

  const filasVistaFiltradas = useMemo(() => {
    const texto = normalizarTexto(busquedaTabla);
    if (!texto) return filasPorVista;
    return filasPorVista.filter((fila) => normalizarTexto([
      fila.nombre, fila.codigo, fila.cliente, fila.codigoContacto, fila.factura, fila.categoria, fila.marca,
      fila.referenciaCompra, fila.proveedor, fila.ubicacionNombre, etiquetaFecha(fila.fecha), fila.unidad,
      numero(fila.stock), numero(fila.cantidad), dinero(fila.total), dinero(fila.ganancia),
    ].join(' ')).includes(texto));
  }, [filasPorVista, busquedaTabla]);

  const columnasVista = COLUMNAS_POR_VISTA[vista];
  const columnasVisibles = columnasVista.filter(([clave]) => columnas[clave] !== false);
  const filasOrdenadas = useMemo(() => {
    const filas = [...filasVistaFiltradas];
    const direccion = orden.direccion === 'asc' ? 1 : -1;
    filas.sort((a, b) => {
      const valorA = a[orden.clave]; const valorB = b[orden.clave];
      if (valorA instanceof Date || valorB instanceof Date || orden.clave === 'fecha') {
        return ((fechaLocal(valorA)?.getTime() || 0) - (fechaLocal(valorB)?.getTime() || 0)) * direccion;
      }
      if (typeof valorA === 'number' && typeof valorB === 'number') return (valorA - valorB) * direccion;
      return String(valorA ?? '').localeCompare(String(valorB ?? ''), 'es', { numeric: true, sensitivity: 'base' }) * direccion;
    });
    return filas;
  }, [filasVistaFiltradas, orden]);

  useEffect(() => setPagina(1), [vista, porPagina, filasFiltradas.length, productoFiltro, busquedaTabla]);
  useEffect(() => {
    setOrden(vista === 'Detallado' || vista === 'Detallado (Con la compra)'
      ? { clave: 'fecha', direccion: 'desc' }
      : { clave: vista === 'Agrupados' ? 'fecha' : vista === 'Por categoria' ? 'categoria' : 'marca', direccion: vista === 'Agrupados' ? 'desc' : 'asc' });
  }, [vista]);

  const todos = porPagina === 'all';
  const tamano = todos ? Math.max(filasOrdenadas.length, 1) : Number(porPagina);
  const totalPaginas = Math.max(1, Math.ceil(filasOrdenadas.length / tamano));
  const paginaActual = Math.min(pagina, totalPaginas);
  const filasPagina = filasOrdenadas.slice((paginaActual - 1) * tamano, paginaActual * tamano);
  const primero = filasOrdenadas.length ? (paginaActual - 1) * tamano + 1 : 0;
  const ultimo = Math.min(paginaActual * tamano, filasOrdenadas.length);

  const valorCelda = (fila, clave) => {
    switch (clave) {
      case 'producto': return fila.nombre || '—';
      case 'codigo': return fila.codigo || '—';
      case 'cliente': return fila.cliente || '—';
      case 'codigoContacto': return fila.codigoContacto || '—';
      case 'factura': return fila.factura || '—';
      case 'fecha': return etiquetaFecha(fila.fecha);
      case 'cantidad': return `${numero(fila.cantidad)} ${fila.unidad || ''}`.trim();
      case 'precioUnitario': return dinero(fila.precioUnitario);
      case 'descuento': return dinero(fila.descuento);
      case 'impuesto': {
        const base = Math.max(0, (fila.precioUnitario * fila.cantidad) - fila.descuento);
        const tasa = base ? Math.round((fila.impuesto / base) * 100) : 0;
        return <span>{dinero(fila.impuesto)}<small className="mt-0.5 block text-[10px] font-normal text-slate-400">{tasa ? `IVA ${tasa}%` : '—'}</small></span>;
      }
      case 'precioConImpuesto': return dinero(fila.precioConImpuesto);
      case 'total': return dinero(fila.total);
      case 'precioCosto': return dinero(fila.precioCosto);
      case 'costoTotal': return dinero(fila.costoTotal);
      case 'ganancia': return <span className={fila.ganancia < 0 ? 'font-semibold text-red-600' : 'font-semibold text-emerald-700'}>{dinero(fila.ganancia)}</span>;
      case 'margen': return `${Number(fila.margen || 0).toLocaleString('es-PY', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
      case 'referenciaCompra': return fila.referenciaCompra || '—';
      case 'proveedor': return fila.proveedor || '—';
      case 'stock': return numero(fila.stock);
      case 'categoria': return fila.categoria || 'Sin categorizar';
      case 'marca': return fila.marca || 'Sin marca';
      default: return fila[clave] ?? '—';
    }
  };

  const sumaCantidadPorUnidad = (filas) => {
    const totales = new Map();
    filas.forEach((fila) => Object.entries(fila.unidadesVendidas || { [fila.unidad || 'UNID']: Number(fila.cantidad) || 0 }).forEach(([unidad, cantidad]) => {
      totales.set(unidad, (totales.get(unidad) || 0) + Number(cantidad || 0));
    }));
    return [...totales].map(([unidad, cantidad]) => `${numero(cantidad)} ${unidad}`).join(' · ');
  };

  const totalCelda = (clave, indice) => {
    if (indice === 0) return <span className="font-bold">Total:</span>;
    if (['cantidad'].includes(clave)) return <span className="font-bold">{sumaCantidadPorUnidad(filasOrdenadas)}</span>;
    if (clave === 'stock') return <span className="font-bold">{numero(filasOrdenadas.reduce((suma, fila) => suma + Number(fila.stock || 0), 0))}</span>;
    if (['descuento', 'impuesto', 'total', 'costoTotal', 'ganancia'].includes(clave)) return <span className="font-bold">{dinero(filasOrdenadas.reduce((suma, fila) => suma + Number(fila[clave] || 0), 0))}</span>;
    if (clave === 'margen') {
      const totalVenta = filasOrdenadas.reduce((suma, fila) => suma + Number(fila.total || 0), 0);
      const totalGanancia = filasOrdenadas.reduce((suma, fila) => suma + Number(fila.ganancia || 0), 0);
      return <span className="font-bold">{totalVenta ? `${((totalGanancia / totalVenta) * 100).toLocaleString('es-PY', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%` : '0,0%'}</span>;
    }
    if (['precioUnitario', 'precioConImpuesto', 'precioCosto'].includes(clave)) {
      const cantidad = filasOrdenadas.reduce((suma, fila) => suma + Number(fila.cantidad || 0), 0);
      const total = filasOrdenadas.reduce((suma, fila) => suma + Number(fila[clave] || 0) * Number(fila.cantidad || 0), 0);
      return <span className="font-bold">{dinero(cantidad ? total / cantidad : 0)}</span>;
    }
    return null;
  };

  const togglearColumna = (clave) => setColumnas((actual) => ({ ...actual, [clave]: actual[clave] === false }));
  const ordenarPor = (clave) => setOrden((actual) => ({ clave, direccion: actual.clave === clave && actual.direccion === 'asc' ? 'desc' : 'asc' }));
  const valorExportable = (fila, clave) => {
    if (clave === 'producto') return fila.nombre || '—';
    if (clave === 'codigo') return fila.codigo || '—';
    if (clave === 'cliente') return fila.cliente || '—';
    if (clave === 'codigoContacto') return fila.codigoContacto || '—';
    if (clave === 'factura') return fila.factura || '—';
    if (clave === 'fecha') return etiquetaFecha(fila.fecha);
    if (clave === 'cantidad') return `${numero(fila.cantidad)} ${fila.unidad || ''}`.trim();
    if (clave === 'precioUnitario') return dinero(fila.precioUnitario);
    if (clave === 'descuento') return dinero(fila.descuento);
    if (clave === 'impuesto') return `${dinero(fila.impuesto)}${fila.impuesto ? ` (IVA ${Math.round((fila.impuesto / Math.max(1, (fila.precioUnitario * fila.cantidad) - fila.descuento)) * 100)}%)` : ''}`;
    if (clave === 'precioConImpuesto') return dinero(fila.precioConImpuesto);
    if (clave === 'total') return dinero(fila.total);
    if (clave === 'precioCosto') return dinero(fila.precioCosto);
    if (clave === 'costoTotal') return dinero(fila.costoTotal);
    if (clave === 'ganancia') return dinero(fila.ganancia);
    if (clave === 'margen') return `${Number(fila.margen || 0).toLocaleString('es-PY', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
    if (clave === 'referenciaCompra') return fila.referenciaCompra || '—';
    if (clave === 'proveedor') return fila.proveedor || '—';
    if (clave === 'stock') return numero(fila.stock);
    if (clave === 'categoria') return fila.categoria || 'Sin categorizar';
    if (clave === 'marca') return fila.marca || 'Sin marca';
    return fila[clave] ?? '—';
  };
  const datosExportacion = filasOrdenadas.map((fila) => columnasVisibles.map(([clave]) => valorExportable(fila, clave)));

  const exportarCSV = () => {
    const contenido = [columnasVisibles.map(([, titulo]) => titulo), ...datosExportacion]
      .map((fila) => fila.map((valor) => `"${escaparCSV(valor)}"`).join(',')).join('\n');
    const enlace = document.createElement('a');
    enlace.href = URL.createObjectURL(new Blob([`\uFEFF${contenido}`], { type: 'text/csv;charset=utf-8;' }));
    enlace.download = `ventas-por-producto-${fechaArchivo()}.csv`;
    enlace.click();
    URL.revokeObjectURL(enlace.href);
  };

  const exportarExcel = () => {
    const contenido = `<table><thead><tr>${columnasVisibles.map(([, titulo]) => `<th>${escaparHTML(titulo)}</th>`).join('')}</tr></thead><tbody>${datosExportacion.map((fila) => `<tr>${fila.map((valor) => `<td>${escaparHTML(valor)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
    const enlace = document.createElement('a');
    enlace.href = URL.createObjectURL(new Blob([contenido], { type: 'application/vnd.ms-excel;charset=utf-8;' }));
    enlace.download = `ventas-por-producto-${fechaArchivo()}.xls`;
    enlace.click();
    URL.revokeObjectURL(enlace.href);
  };

  const imprimir = () => {
    const ventana = window.open('', '_blank');
    if (!ventana) return;
    const encabezados = columnasVisibles.map(([, titulo]) => `<th>${escaparHTML(titulo)}</th>`).join('');
    const filasHTML = datosExportacion.map((fila) => `<tr>${fila.map((valor) => `<td>${escaparHTML(valor)}</td>`).join('')}</tr>`).join('');
    ventana.document.write(`<html><head><title>Ventas por producto</title><style>body{font-family:Arial,sans-serif;font-size:10px;color:#1f2937}h1{font-size:18px}table{border-collapse:collapse;width:100%}th,td{border:1px solid #d8dee8;padding:6px;text-align:left}th{background:#f3f5f8;font-size:9px}tr:nth-child(even){background:#fafbfc}</style></head><body><h1>Ventas por producto</h1><p>${escaparHTML(vista)} · ${filasOrdenadas.length} entradas</p><table><thead><tr>${encabezados}</tr></thead><tbody>${filasHTML}</tbody></table></body></html>`);
    ventana.document.close();
    ventana.focus();
    ventana.print();
  };

  const exportarPDF = () => {
    const documento = new jsPDF({ orientation: 'landscape' });
    documento.text('Ventas por producto', 14, 14);
    documento.setFontSize(9);
    documento.text(`${vista} · ${filasOrdenadas.length} entradas`, 14, 20);
    autoTable(documento, {
      head: [columnasVisibles.map(([, titulo]) => titulo)],
      body: datosExportacion,
      startY: 25,
      styles: { fontSize: 6, cellPadding: 2 },
      headStyles: { fillColor: [246, 247, 249], textColor: [55, 65, 81] },
      alternateRowStyles: { fillColor: [250, 251, 252] },
    });
    documento.save(`ventas-por-producto-${fechaArchivo()}.pdf`);
  };

  const selectFiltro = (valor, cambiar, lista, tituloVacio, deshabilitado = false) => (
    <select value={valor} onChange={(evento) => cambiar(evento.target.value)} disabled={deshabilitado} className="mt-2 h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm font-normal text-slate-700 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100 disabled:bg-slate-100 disabled:text-slate-500">
      <option value="">{tituloVacio}</option>
      {lista.map((item) => typeof item === 'string'
        ? <option key={item} value={item}>{item}</option>
        : <option key={item.id} value={item.id}>{item.nombre}</option>)}
    </select>
  );
  const etiquetaFiltro = 'block text-[13px] font-semibold text-slate-700';
  const ubicacionFija = !usuarioVeTodas && ubicacionUsuarioId ? String(ubicacionUsuarioId) : '';
  const ubicacionValor = ubicacionFija || ubicacionFiltro;
  const origenes = opciones.origenes.map((origen) => origen.toLocaleUpperCase('es') === 'POS' ? 'POS' : origen.toLocaleUpperCase('es') === 'ONLINE' ? 'Online' : origen);

  return (
    <div className="min-h-full w-full bg-[#f5f6f8] p-4 text-slate-700 sm:p-6">
      <h1 className="mb-5 text-2xl font-bold tracking-tight text-slate-800">Ventas por producto</h1>

      <section className="mb-6 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <button type="button" onClick={() => setFiltrosAbiertos((abierto) => !abierto)} aria-expanded={filtrosAbiertos} aria-controls="filtros-ventas-producto" className="flex w-full items-center justify-between border-b border-slate-200 bg-white px-5 py-4 text-left text-sm font-bold text-sky-700 transition hover:bg-slate-50">
          <span className="inline-flex items-center gap-2"><Filter size={16} />Filtros</span>
          <ChevronDown size={17} aria-hidden="true" className={`transform-gpu transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] ${filtrosAbiertos ? 'rotate-180' : 'rotate-0'}`} />
        </button>
        {filtrosAbiertos && (
          <div id="filtros-ventas-producto" className="grid grid-cols-1 gap-x-6 gap-y-4 px-5 py-5 sm:grid-cols-2 xl:grid-cols-4">
            <label className={etiquetaFiltro}>Buscar producto:
              <span className="mt-2 flex h-10 overflow-hidden rounded-md border border-slate-300 focus-within:border-sky-500 focus-within:ring-2 focus-within:ring-sky-100"><span className="grid w-10 shrink-0 place-items-center border-r border-slate-300 bg-slate-50 text-slate-500"><Search size={15} /></span><input value={productoFiltro} onChange={(evento) => setProductoFiltro(evento.target.value)} placeholder="Introduzca nombre, SKU o código de barras" className="min-w-0 flex-1 px-3 text-sm font-normal outline-none" /></span>
            </label>
            <label className={etiquetaFiltro}>Cliente:
              {selectFiltro(clienteFiltro, setClienteFiltro, opciones.clientes, 'Ninguna')}
            </label>
            <label className={etiquetaFiltro}>Nombre del grupo de clientes:
              {selectFiltro(grupoFiltro, setGrupoFiltro, opciones.grupos, 'Todas')}
            </label>
            <label className={etiquetaFiltro}>Ubicación de la empresa:
              {selectFiltro(ubicacionValor, setUbicacionFiltro, opciones.ubicaciones, 'Seleccione', Boolean(ubicacionFija))}
            </label>
            <label className={etiquetaFiltro}>Categoría:
              {selectFiltro(categoriaFiltro, setCategoriaFiltro, opciones.categorias, 'Todos')}
            </label>
            <label className={etiquetaFiltro}>Marca:
              {selectFiltro(marcaFiltro, setMarcaFiltro, opciones.marcas, 'Todos')}
            </label>
            <label className={etiquetaFiltro}>Rango de fechas:
              <span className="mt-2 block"><FiltroFecha value={rango} onChange={setRango} /></span>
            </label>
            <label className={etiquetaFiltro}>Origen del producto:
              {selectFiltro(origenFiltro, setOrigenFiltro, origenes, 'Todos')}
            </label>
            <label className={`${etiquetaFiltro} sm:col-span-2`}>Intervalo de tiempo:
              <span className="mt-2 flex max-w-[420px] overflow-hidden rounded-md border border-slate-300">
                <input aria-label="Hora desde" type="time" value={horaDesde} onChange={(evento) => setHoraDesde(evento.target.value)} className="h-10 w-1/2 border-r border-slate-300 px-3 text-sm font-normal outline-none focus:bg-sky-50" />
                <input aria-label="Hora hasta" type="time" value={horaHasta} onChange={(evento) => setHoraHasta(evento.target.value)} className="h-10 w-1/2 px-3 text-sm font-normal outline-none focus:bg-sky-50" />
              </span>
            </label>
          </div>
        )}
      </section>

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div role="tablist" aria-label="Vistas del informe de ventas por producto" className="flex overflow-x-auto border-b border-slate-200 px-3 pt-2 sm:px-5">
          {VISTAS.map((nombreVista) => (
            <button key={nombreVista} type="button" role="tab" aria-selected={vista === nombreVista} onClick={() => setVista(nombreVista)} className={`relative shrink-0 whitespace-nowrap border-b-[3px] px-3 py-3 text-sm font-semibold transition-colors ${vista === nombreVista ? 'border-sky-600 text-slate-800' : 'border-transparent text-slate-500 hover:bg-slate-50 hover:text-slate-800'}`}>
              {nombreVista === 'Agrupados' ? <span className="mr-1.5 text-base">☷</span> : null}
              {nombreVista === 'Por categoria' || nombreVista === 'Por marca' ? <span className="mr-1.5 text-base">☰</span> : null}
              {nombreVista}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2.5 border-b border-slate-100 px-4 py-3 text-xs sm:px-5">
          <label className="flex items-center gap-2 whitespace-nowrap text-slate-600">Mostrar
            <select aria-label="Mostrar entradas" value={porPagina} onChange={(evento) => setPorPagina(evento.target.value)} className="h-9 rounded-md border border-slate-300 bg-white px-2.5 text-sm text-slate-700 outline-none focus:border-sky-500">
              {['25', '50', '100', '200', '500', '1000'].map((cantidad) => <option key={cantidad} value={cantidad}>{Number(cantidad).toLocaleString('es-PY')}</option>)}
              <option value="all">Todas</option>
            </select>
            entradas
          </label>
          <button type="button" onClick={exportarCSV} disabled={!filasOrdenadas.length} className="inline-flex h-9 items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 text-xs font-medium text-slate-700 transition hover:border-sky-400 hover:bg-sky-50 disabled:cursor-not-allowed disabled:opacity-50"><Download size={14} />Exportar a CSV</button>
          <button type="button" onClick={exportarExcel} disabled={!filasOrdenadas.length} className="inline-flex h-9 items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 text-xs font-medium text-slate-700 transition hover:border-sky-400 hover:bg-sky-50 disabled:cursor-not-allowed disabled:opacity-50"><FileSpreadsheet size={14} />Exportar a Excel</button>
          <button type="button" onClick={imprimir} disabled={!filasOrdenadas.length} className="inline-flex h-9 items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 text-xs font-medium text-slate-700 transition hover:border-sky-400 hover:bg-sky-50 disabled:cursor-not-allowed disabled:opacity-50"><Printer size={14} />Imprimir</button>
          <div className="relative">
            <button type="button" onClick={() => setMostrarColumnas((mostrar) => !mostrar)} aria-expanded={mostrarColumnas} className="inline-flex h-9 items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 text-xs font-medium text-slate-700 transition hover:border-sky-400 hover:bg-sky-50"><SlidersHorizontal size={14} />Visibilidad de columnas</button>
            {mostrarColumnas && (
              <div className="absolute left-0 top-10 z-30 max-h-[min(70vh,420px)] w-72 overflow-y-auto rounded-lg border border-slate-200 bg-white p-2 shadow-xl">
                <p className="px-2 py-2 text-[11px] font-bold uppercase tracking-wide text-slate-400">Columnas visibles</p>
                {columnasVista.map(([clave, titulo]) => <label key={clave} className="flex cursor-pointer items-center gap-2 rounded px-2 py-2 text-xs text-slate-700 hover:bg-slate-50"><input type="checkbox" checked={columnas[clave] !== false} onChange={() => togglearColumna(clave)} className="accent-sky-600" />{titulo}</label>)}
              </div>
            )}
          </div>
          <button type="button" onClick={exportarPDF} disabled={!filasOrdenadas.length} className="inline-flex h-9 items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 text-xs font-medium text-slate-700 transition hover:border-sky-400 hover:bg-sky-50 disabled:cursor-not-allowed disabled:opacity-50"><FileText size={14} />Exportar a PDF</button>
          <label className="relative ml-auto block min-w-[180px] flex-1 sm:max-w-[250px]">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input aria-label="Buscar en el informe" value={busquedaTabla} onChange={(evento) => setBusquedaTabla(evento.target.value)} placeholder="Buscar ..." className="h-9 w-full rounded-full border border-slate-300 pl-9 pr-3 text-sm outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-100" />
          </label>
        </div>

        {error && <div role="alert" className="mx-4 mt-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700 sm:mx-5">No se pudieron cargar todos los datos del informe: {error}</div>}
        {vista === 'Detallado (Con la compra)' && <p className="mx-4 mt-3 text-xs text-slate-500 sm:mx-5">Las ventas no guardan un vínculo con un lote de compra específico; se muestra como referencia la compra más reciente del producto anterior a cada venta.</p>}

        <div className="overflow-x-auto px-3 pb-1 pt-3 sm:px-5">
          <table className="w-full min-w-[1380px] border-separate border-spacing-0 text-xs" aria-label={`Ventas por producto: ${vista}`}>
            <thead>
              <tr>
                {columnasVisibles.map(([clave, titulo]) => (
                  <th key={clave} scope="col" className="border-b border-slate-200 bg-[#f6f7f9] px-3 py-3 text-left text-[10px] font-bold uppercase tracking-[0.06em] text-slate-600 first:rounded-tl-md last:rounded-tr-md">
                    <button type="button" onClick={() => ordenarPor(clave)} className="inline-flex items-center gap-1.5 text-left hover:text-sky-700" aria-label={`Ordenar por ${titulo}`}>
                      {titulo}<span className={`text-[10px] ${orden.clave === clave ? 'text-sky-600' : 'text-slate-300'}`}>{orden.clave === clave ? (orden.direccion === 'asc' ? '▲' : '▼') : '↕'}</span>
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {cargando || cargandoUbicacion ? (
                <tr><td colSpan={Math.max(columnasVisibles.length, 1)} className="px-4 py-14 text-center text-sm text-slate-500">Cargando ventas...</td></tr>
              ) : !filasOrdenadas.length ? (
                <tr><td colSpan={Math.max(columnasVisibles.length, 1)} className="px-4 py-14 text-center text-sm text-slate-500">No hay datos disponibles.</td></tr>
              ) : filasPagina.map((fila, indice) => (
                <tr key={fila.id || `${fila.nombre}-${indice}`} className="group transition-colors odd:bg-white even:bg-[#fafbfc] hover:bg-sky-50/70">
                  {columnasVisibles.map(([clave]) => <td key={clave} className="border-b border-slate-100 px-3 py-3 align-middle text-slate-700">{valorCelda(fila, clave)}</td>)}
                </tr>
              ))}
            </tbody>
            {!cargando && filasOrdenadas.length > 0 && (
              <tfoot>
                <tr className="bg-slate-100 text-slate-800">
                  {columnasVisibles.map(([clave], indice) => <td key={clave} className="border-t border-slate-300 px-3 py-3 align-middle">{totalCelda(clave, indice)}</td>)}
                </tr>
              </tfoot>
            )}
          </table>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-4 py-4 text-xs text-slate-600 sm:px-5">
          <span>Mostrando {primero.toLocaleString('es-PY')} a {ultimo.toLocaleString('es-PY')} de {filasOrdenadas.length.toLocaleString('es-PY')} entradas</span>
          <div className="flex items-center gap-1.5">
            <button type="button" disabled={paginaActual <= 1 || cargando} onClick={() => setPagina((actual) => Math.max(1, actual - 1))} className="h-8 rounded-md border border-slate-300 px-3 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40">Anterior</button>
            <span className="grid h-8 min-w-8 place-items-center rounded-md bg-sky-600 px-2 font-semibold text-white">{paginaActual}</span>
            <button type="button" disabled={paginaActual >= totalPaginas || cargando} onClick={() => setPagina((actual) => Math.min(totalPaginas, actual + 1))} className="h-8 rounded-md border border-slate-300 px-3 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40">Siguiente</button>
          </div>
        </div>
      </section>
    </div>
  );
}
