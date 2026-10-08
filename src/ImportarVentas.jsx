import { useEffect, useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import { AlertCircle, CheckCircle2, Download, FileSpreadsheet, LoaderCircle, Upload } from 'lucide-react';
import { supabase } from './supabaseClient';
import { useEmpresaInfo } from './utils/useEmpresa';
import { useUbicacionUsuario } from './utils/useUbicacion';
import { fechaImportacionISO } from './utils/fechaImportacion';

const CAMPOS = [
  { id: 'factura', label: 'N.º de factura', required: true, aliases: ['factura_no', 'numero_factura', 'invoice_number', 'invoice', 'factura'] },
  { id: 'cliente', label: 'Nombre del cliente', aliases: ['nombre_del_cliente', 'customer_name', 'cliente', 'customer'] },
  { id: 'fecha', label: 'Fecha y hora de venta', required: true, aliases: ['fecha_de_venta', 'sale_datetime', 'sale_date', 'fecha'] },
  { id: 'sku', label: 'SKU / código del producto', aliases: ['sku_del_producto', 'product_sku', 'sku', 'codigo_producto', 'codigo'] },
  { id: 'producto', label: 'Nombre del producto', aliases: ['nombre_del_producto', 'product_name', 'producto', 'nombre'] },
  { id: 'cantidad', label: 'Cantidad', required: true, aliases: ['quantity', 'cantidad'] },
  { id: 'precio', label: 'Precio unitario', required: true, aliases: ['precio_unitario', 'unit_price', 'price'] },
  { id: 'descuentoLinea', label: 'Descuento de línea (importe total)', aliases: ['descuento_de_articulo', 'descuento_linea', 'line_discount'] },
  { id: 'descuentoFactura', label: 'Descuento total de factura', aliases: ['descuento_factura', 'invoice_discount', 'descuento'] },
  { id: 'total', label: 'Total de factura', aliases: ['total_del_pedido', 'total_factura', 'invoice_total', 'total'] },
  { id: 'pagado', label: 'Importe pagado', required: true, aliases: ['monto_pagado', 'importe_pagado', 'amount_paid', 'paid'] },
  { id: 'metodo', label: 'Método de pago', aliases: ['metodo_de_pago', 'payment_method', 'metodo_pago'] },
  { id: 'nota', label: 'Nota de venta', aliases: ['descripcion', 'nota', 'sale_note'] },
];
const MAX_NUMERO_FACTURA = 2147483647;

const clave = (valor) => String(valor ?? '').trim().toLocaleLowerCase('es').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
const numero = (entrada) => {
  if (entrada === '' || entrada === null || entrada === undefined) return NaN;
  if (typeof entrada === 'number') return entrada;
  let texto = String(entrada).trim().replace(/[^\d,.-]/g, '');
  const coma = texto.lastIndexOf(','), punto = texto.lastIndexOf('.');
  if (coma >= 0 && punto >= 0) {
    const decimal = coma > punto ? ',' : '.';
    texto = texto.replace(/[.,]/g, (sep) => sep === decimal ? '.' : '');
  } else if (coma >= 0) texto = /,\d{1,2}$/.test(texto) ? texto.replace(',', '.') : texto.replaceAll(',', '');
  else if ((texto.match(/\./g) || []).length > 1 || /\.\d{3}$/.test(texto)) texto = texto.replaceAll('.', '');
  return Number(texto);
};

const plantilla = () => {
  const rows = [
    ['Factura no.', 'Nombre del cliente', 'Fecha de venta', 'SKU del producto', 'Nombre del producto', 'Cantidad', 'Precio unitario', 'Descuento de artículo', 'Descuento factura', 'Total del pedido', 'Importe pagado', 'Método de pago', 'Nota'],
    [1001001, 'Cliente de ejemplo', '2026-01-15 10:30:00', 'REP-001', 'Filtro ejemplo', 2, 50000, 0, 5000, 95000, 95000, 'Efectivo', 'Venta importada'],
  ];
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows), 'Ventas');
  XLSX.writeFileXLSX(workbook, 'plantilla-importacion-ventas.xlsx');
};

export default function ImportarVentas({ perfilUsuario }) {
  const { id: empresaId } = useEmpresaInfo();
  const ubicacionUsuario = useUbicacionUsuario();
  const [encabezados, setEncabezados] = useState([]);
  const [filas, setFilas] = useState([]);
  const [mapeo, setMapeo] = useState({});
  const [nombreArchivo, setNombreArchivo] = useState('');
  const [productos, setProductos] = useState([]);
  const [ubicaciones, setUbicaciones] = useState([]);
  const [ubicacionId, setUbicacionId] = useState('');
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [progreso, setProgreso] = useState('');
  const [error, setError] = useState('');
  const [resultado, setResultado] = useState(null);
  const permisos = perfilUsuario?.roles?.permisos;
  const esAdmin = (perfilUsuario?.roles?.nombre || '').toLowerCase().includes('admin');
  const puedeImportar = esAdmin || permisos?.ventas_pos?.['Acceder al Punto de Venta'] === true;

  useEffect(() => {
    if (!empresaId) return;
    let activo = true;
    (async () => {
      setCargando(true);
      const [productosResult, ubicacionesResult] = await Promise.all([
        supabase.from('productos').select('id,nombre,sku,codigo,stock_actual,activo').eq('empresa_id', empresaId).eq('activo', true).order('nombre').limit(10000),
        supabase.from('ubicaciones_comerciales').select('id,nombre').eq('empresa_id', empresaId).eq('activo', true).order('nombre'),
      ]);
      if (!activo) return;
      if (productosResult.error) setError(`No se pudieron cargar los productos: ${productosResult.error.message}`);
      else setProductos(productosResult.data || []);
      if (ubicacionesResult.error) setError(`No se pudieron cargar las ubicaciones: ${ubicacionesResult.error.message}`);
      else setUbicaciones(ubicacionesResult.data || []);
      setCargando(false);
    })();
    return () => { activo = false; };
  }, [empresaId]);

  useEffect(() => {
    if (ubicacionId || !ubicaciones.length) return;
    const asignada = !ubicacionUsuario.ve_todas ? ubicacionUsuario.id : null;
    const caja = perfilUsuario?.caja_actual?.ubicacion_id;
    const inicial = caja || asignada || (ubicaciones.length === 1 ? ubicaciones[0].id : '');
    if (inicial && ubicaciones.some((item) => String(item.id) === String(inicial))) setUbicacionId(String(inicial));
  }, [ubicaciones, ubicacionUsuario.id, ubicacionUsuario.ve_todas, ubicacionId, perfilUsuario]);

  const grupos = useMemo(() => {
    if (!filas.length || !encabezados.length) return [];
    const campo = (fila, id) => {
      const indice = mapeo[id];
      return indice === '' || indice === undefined ? '' : fila[encabezados[Number(indice)]] ?? '';
    };
    const productosCodigo = new Map();
    const productosNombre = new Map();
    const agregar = (mapa, key, producto) => {
      if (!key) return;
      const arreglo = mapa.get(key) || [];
      arreglo.push(producto);
      mapa.set(key, arreglo);
    };
    for (const producto of productos) {
      agregar(productosCodigo, clave(producto.sku), producto);
      agregar(productosCodigo, clave(producto.codigo), producto);
      agregar(productosNombre, clave(producto.nombre), producto);
    }
    const mapa = new Map();
    filas.forEach((fila, indice) => {
      const numeroFila = indice + 2;
      const facturaRaw = String(campo(fila, 'factura')).trim();
      const factura = /^\d+$/.test(facturaRaw) && facturaRaw.length <= 10 ? Number(facturaRaw) : NaN;
      if (!Number.isSafeInteger(factura) || factura <= 0 || factura > MAX_NUMERO_FACTURA) {
        const mensaje = facturaRaw ? 'el número debe ser un entero positivo de hasta 2.147.483.647.' : 'falta el número de factura.';
        mapa.set(`__fila_${numeroFila}`, { factura: facturaRaw || `Fila ${numeroFila}`, errores: [`Fila ${numeroFila}: ${mensaje}`], lineas: [], filaInicio: numeroFila });
        return;
      }
      const claveFactura = String(factura);
      if (!mapa.has(claveFactura)) mapa.set(claveFactura, { factura, errores: [], lineas: [], filaInicio: numeroFila, values: {} });
      const grupo = mapa.get(claveFactura);
      const descuentoFacturaRaw = String(campo(fila, 'descuentoFactura')).trim();
      const totalRaw = String(campo(fila, 'total')).trim();
      const pagadoRaw = String(campo(fila, 'pagado')).trim();
      const valoresGrupo = {
        cliente: String(campo(fila, 'cliente')).trim(), fecha: fechaImportacionISO(campo(fila, 'fecha')),
        descuentoFactura: mapeo.descuentoFactura === '' || mapeo.descuentoFactura === undefined || !descuentoFacturaRaw ? 0 : numero(descuentoFacturaRaw),
        total: mapeo.total === '' || mapeo.total === undefined || !totalRaw ? NaN : numero(totalRaw),
        pagado: pagadoRaw ? numero(pagadoRaw) : NaN, metodo: String(campo(fila, 'metodo')).trim(), nota: String(campo(fila, 'nota')).trim(),
      };
      if (numeroFila === grupo.filaInicio) grupo.values = valoresGrupo;
      else {
        for (const llave of ['cliente', 'fecha', 'descuentoFactura', 'total', 'pagado', 'metodo']) {
          const actual = valoresGrupo[llave]; const anterior = grupo.values[llave];
          if ((Number.isNaN(actual) && Number.isNaN(anterior)) || String(actual ?? '') === String(anterior ?? '')) continue;
          grupo.errores.push(`Factura ${factura}: el campo ${llave} no coincide entre filas (fila ${numeroFila}).`);
          break;
        }
      }
      if (!valoresGrupo.fecha) grupo.errores.push(`Fila ${numeroFila}: fecha de venta inválida.`);
      if (!Number.isFinite(valoresGrupo.pagado) || valoresGrupo.pagado < 0) grupo.errores.push(`Fila ${numeroFila}: importe pagado inválido.`);
      const sku = String(campo(fila, 'sku')).trim();
      const nombre = String(campo(fila, 'producto')).trim();
      const codigoMatches = sku ? productosCodigo.get(clave(sku)) || [] : [];
      const nombreMatches = nombre ? productosNombre.get(clave(nombre)) || [] : [];
      const matches = codigoMatches.length ? codigoMatches : nombreMatches;
      if (!matches.length) grupo.errores.push(`Fila ${numeroFila}: producto no encontrado (SKU/código o nombre exacto).`);
      else if (new Set(matches.map((item) => item.id)).size > 1) grupo.errores.push(`Fila ${numeroFila}: el SKU o nombre del producto es ambiguo.`);
      const producto = matches[0];
      const cantidad = numero(campo(fila, 'cantidad'));
      const precio = numero(campo(fila, 'precio'));
      const descuentoLineaRaw = String(campo(fila, 'descuentoLinea')).trim();
      const descuentoLinea = mapeo.descuentoLinea === '' || mapeo.descuentoLinea === undefined || !descuentoLineaRaw ? 0 : numero(descuentoLineaRaw);
      if (!Number.isFinite(cantidad) || cantidad <= 0) grupo.errores.push(`Fila ${numeroFila}: cantidad inválida.`);
      if (!Number.isFinite(precio) || precio < 0) grupo.errores.push(`Fila ${numeroFila}: precio unitario inválido.`);
      if (!Number.isFinite(descuentoLinea) || descuentoLinea < 0 || (Number.isFinite(cantidad) && Number.isFinite(precio) && descuentoLinea > cantidad * precio)) grupo.errores.push(`Fila ${numeroFila}: descuento de línea inválido.`);
      if (producto && Number.isFinite(cantidad) && Number.isFinite(precio) && Number.isFinite(descuentoLinea) && cantidad > 0) {
        grupo.lineas.push({ producto, cantidad, precioUnitario: Math.max(0, precio - descuentoLinea / cantidad), subtotal: Math.max(0, cantidad * precio - descuentoLinea), fila: numeroFila });
      }
    });
    const facturas = Array.from(mapa.values()).map((grupo) => {
      const subtotal = grupo.lineas.reduce((total, linea) => total + linea.subtotal, 0);
      const descuento = Number(grupo.values?.descuentoFactura || 0);
      const totalCalculado = Math.max(0, subtotal - descuento);
      const totalArchivo = grupo.values?.total;
      if (!Number.isFinite(descuento) || descuento < 0 || descuento > subtotal) grupo.errores.push(`Factura ${grupo.factura}: descuento total inválido.`);
      if (Number.isFinite(totalArchivo) && Math.abs(totalArchivo - totalCalculado) > 0.01) grupo.errores.push(`Factura ${grupo.factura}: el total indicado no coincide con sus líneas (${Math.round(totalCalculado)} Gs calculado).`);
      if (Number(grupo.values?.pagado) > totalCalculado + 0.01) grupo.errores.push(`Factura ${grupo.factura}: el importe pagado supera el total.`);
      return { ...grupo, subtotal, descuento, total: totalCalculado, valido: grupo.errores.length === 0 };
    });
    const stockDisponible = new Map(productos
      .filter((producto) => producto.stock_actual !== null && producto.stock_actual !== undefined)
      .map((producto) => [producto.id, Number(producto.stock_actual)]));
    for (const factura of facturas) {
      if (!factura.valido) continue;
      const cantidadesPorProducto = new Map();
      for (const linea of factura.lineas) cantidadesPorProducto.set(linea.producto.id, (cantidadesPorProducto.get(linea.producto.id) || 0) + linea.cantidad);
      for (const [productoId, cantidad] of cantidadesPorProducto) {
        const restante = stockDisponible.get(productoId);
        if (restante !== undefined && restante < cantidad) {
          const producto = factura.lineas.find((linea) => linea.producto.id === productoId)?.producto;
          factura.errores.push(`Factura ${factura.factura}: stock insuficiente para ${producto?.nombre || 'el artículo'} (disponible ${restante}, importación ${cantidad}).`);
        }
      }
      factura.valido = factura.errores.length === 0;
      if (factura.valido) {
        for (const [productoId, cantidad] of cantidadesPorProducto) {
          if (stockDisponible.has(productoId)) stockDisponible.set(productoId, stockDisponible.get(productoId) - cantidad);
        }
      }
    }
    return facturas;
  }, [filas, encabezados, mapeo, productos]);

  const cargarArchivo = async (event) => {
    const file = event.target.files?.[0];
    setError(''); setResultado(null); setFilas([]); setEncabezados([]); setMapeo({}); setNombreArchivo('');
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) return setError('El archivo supera el límite de 10 MB.');
    if (!/\.(csv|xlsx|xls)$/i.test(file.name)) return setError('Elegí un archivo Excel (.xlsx/.xls) o CSV.');
    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });
      const hoja = workbook.Sheets[workbook.SheetNames[0]];
      // Keep native Excel dates/numbers: display strings such as 1/15/26 are
      // locale-dependent and cannot be parsed safely.
      const datos = XLSX.utils.sheet_to_json(hoja, { defval: '', raw: true });
      if (!datos.length) throw new Error('El archivo no contiene filas de datos.');
      if (datos.length > 5000) throw new Error('El archivo supera el máximo de 5.000 líneas por lote.');
      const headers = Object.keys(datos[0]);
      const indexadas = Object.fromEntries(headers.map((header, index) => [header, String(index)]));
      const mapping = {};
      for (const field of CAMPOS) {
        const match = headers.find((header) => field.aliases.includes(clave(header)));
        mapping[field.id] = match === undefined ? '' : indexadas[match];
      }
      setNombreArchivo(file.name); setEncabezados(headers); setFilas(datos); setMapeo(mapping);
    } catch (err) { setError(`No se pudo leer el archivo: ${err.message}`); }
    finally { event.target.value = ''; }
  };

  const importar = async () => {
    if (!empresaId || !ubicacionId) return setError('Seleccioná una ubicación activa.');
    const requeridos = CAMPOS.filter((item) => item.required);
    const sinMapeo = requeridos.filter((item) => mapeo[item.id] === '' || mapeo[item.id] === undefined);
    if (sinMapeo.length) return setError(`Asigná estas columnas obligatorias: ${sinMapeo.map((item) => item.label).join(', ')}.`);
    if ((mapeo.sku === '' || mapeo.sku === undefined) && (mapeo.producto === '' || mapeo.producto === undefined)) return setError('Asigná una columna de SKU/código o una columna de nombre del producto.');
    const validos = grupos.filter((item) => item.valido);
    if (!validos.length) return setError('No hay facturas válidas para importar. Corregí los errores de la vista previa.');
    setGuardando(true); setError(''); setResultado(null);
    const procesados = []; const fallidos = [];
    try {
      const numeros = [...new Set(validos.map((grupo) => grupo.factura))];
      const existentes = new Set();
      for (let inicio = 0; inicio < numeros.length; inicio += 100) {
        const { data, error: errorConsulta } = await supabase.from('ventas').select('numero_factura')
          .eq('empresa_id', empresaId).in('numero_factura', numeros.slice(inicio, inicio + 100));
        if (errorConsulta) throw errorConsulta;
        (data || []).forEach((venta) => existentes.add(Number(venta.numero_factura)));
      }
      const pendientes = validos.filter((grupo) => {
        if (!existentes.has(Number(grupo.factura))) return true;
        fallidos.push({ factura: grupo.factura, error: 'Esa factura ya existe en esta empresa.' });
        return false;
      });
      for (const [indice, grupo] of pendientes.entries()) {
        setProgreso(`Registrando factura ${indice + 1} de ${pendientes.length}: ${grupo.factura}`);
        const pagado = Number(grupo.values.pagado);
        const estadoPago = pagado >= grupo.total ? 'Pagado' : pagado > 0 ? 'Pago Parcial' : 'Credito';
        const venta = {
          empresa_id: empresaId, numero_factura: grupo.factura,
          cliente: grupo.values.cliente || null, cliente_nombre: grupo.values.cliente || null,
          total: grupo.total, metodo_pago: grupo.values.metodo || (pagado === 0 ? 'Crédito' : 'Efectivo'),
          estado_pago: estadoPago, monto_pagado: pagado, saldo_pendiente: Math.max(0, grupo.total - pagado),
          articulos: grupo.lineas.length, descuento: grupo.descuento, cargo_embalaje: 0,
          nota_venta: grupo.values.nota || `Importada desde ${nombreArchivo}`,
          fecha: grupo.values.fecha, caja_id: null, ubicacion_id: ubicacionId,
        };
        const items = grupo.lineas.map((linea) => ({
          producto_id: linea.producto.id, nombre_producto: linea.producto.nombre,
          cantidad: linea.cantidad, precio_unitario: linea.precioUnitario,
        }));
        const { data, error: errorRpc } = await supabase.rpc('registrar_venta_importada', {
          p_venta: venta, p_items: items, p_ubicacion_id: ubicacionId,
        });
        if (errorRpc) fallidos.push({ factura: grupo.factura, error: errorRpc.message });
        else procesados.push({ factura: grupo.factura, id: String(data) });
      }
      setResultado({ procesados, fallidos, omitidos: grupos.filter((item) => !item.valido).length });
      if (procesados.length) window.dispatchEvent(new Event('stock-actualizado'));
    } catch (err) { setError(`La importación no pudo completarse: ${err.message}`); }
    finally { setGuardando(false); setProgreso(''); }
  };

  if (!puedeImportar) return <main className="mx-auto max-w-3xl rounded-xl border bg-white p-6 text-sm text-slate-700">Tu rol no tiene el permiso <b>Acceder al Punto de Venta</b>, requerido para importar ventas.</main>;

  return <main className="mx-auto max-w-7xl space-y-5 text-slate-800">
    <header className="flex flex-wrap items-end justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-widest text-orange-600">Ventas</p><h1 className="mt-1 text-2xl font-black">Importar ventas</h1><p className="mt-1 text-sm text-slate-500">Cargá un archivo Excel o CSV, asigná sus columnas y revisá cada factura antes de registrarla.</p></div><button type="button" onClick={plantilla} className="inline-flex items-center gap-2 rounded-lg border bg-white px-3 py-2.5 text-sm font-semibold"><Download size={16}/>Plantilla Excel</button></header>
    <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950"><b>Revisá el efecto en existencias:</b> al confirmar, cada factura se crea con el RPC atómico de ventas y descuenta del stock actual las cantidades importadas. Las facturas se guardan una por una; si una falla, las demás siguen y se informa el resultado.</div>
    {error && <div role="alert" className="flex gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800"><AlertCircle size={18}/>{error}</div>}
    {cargando ? <div className="rounded-xl border bg-white p-8 text-center text-sm text-slate-500"><LoaderCircle size={18} className="mx-auto animate-spin"/>Cargando productos y ubicaciones…</div> : <section className="space-y-4 rounded-xl border bg-white p-5 shadow-sm">
      <div className="grid gap-4 sm:grid-cols-2"><label className="block text-xs font-bold">Ubicación de venta<select value={ubicacionId} onChange={(event) => setUbicacionId(event.target.value)} disabled={!ubicacionUsuario.ve_todas && Boolean(ubicacionUsuario.id)} className="mt-1 block w-full rounded-lg border bg-white p-2.5 text-sm font-normal"><option value="">Seleccioná una ubicación</option>{ubicaciones.filter((item) => ubicacionUsuario.ve_todas || String(item.id) === String(ubicacionUsuario.id)).map((item) => <option key={item.id} value={item.id}>{item.nombre}</option>)}</select></label>
      <label className="block text-xs font-bold">Archivo Excel o CSV<input type="file" accept=".xlsx,.xls,.csv" onChange={cargarArchivo} className="mt-1 block w-full rounded-lg border p-2 text-sm font-normal"/><span className="mt-1 block text-xs font-normal text-slate-500">Máximo 10 MB y 5.000 líneas · {nombreArchivo || 'Elegí la primera hoja del archivo.'}</span></label></div>
      <p className="text-xs text-slate-500">Una línea por producto; las filas con el mismo número de factura se agrupan. El importe pagado y el descuento de factura deben repetirse en todas las líneas de esa factura. El descuento de línea se expresa como importe total de la línea.</p>
      {encabezados.length > 0 && <div className="grid gap-3 rounded-lg bg-slate-50 p-4 sm:grid-cols-2 lg:grid-cols-3">{CAMPOS.map((field) => <label key={field.id} className="block text-xs font-semibold">{field.label}{field.required ? ' *' : ''}<select value={mapeo[field.id] ?? ''} onChange={(event) => setMapeo((actual) => ({ ...actual, [field.id]: event.target.value }))} className="mt-1 block w-full rounded-lg border bg-white p-2 text-xs font-normal"><option value="">— Sin columna —</option>{encabezados.map((header, index) => <option key={`${index}-${header}`} value={String(index)}>{header}</option>)}</select></label>)}</div>}
      {grupos.length > 0 && <div className="space-y-3"><div className="flex flex-wrap items-center justify-between gap-2"><div><h2 className="font-bold">Vista previa por factura</h2><p className="text-xs text-slate-500">{grupos.filter((item) => item.valido).length} listas · {grupos.filter((item) => !item.valido).length} con errores</p></div><button type="button" onClick={importar} disabled={guardando || !ubicacionId || !grupos.some((item) => item.valido)} className="inline-flex items-center gap-2 rounded-lg bg-orange-500 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50">{guardando ? <><LoaderCircle size={16} className="animate-spin"/>{progreso || 'Importando…'}</> : <><Upload size={16}/>Confirmar facturas válidas</>}</button></div>
      <div className="max-h-[55vh] overflow-auto rounded-lg border"><table className="w-full min-w-[850px] text-left text-sm"><thead className="sticky top-0 bg-slate-50 text-[10px] uppercase text-slate-500"><tr><th className="px-3 py-2">Factura</th><th className="px-3 py-2">Cliente</th><th className="px-3 py-2">Fecha</th><th className="px-3 py-2 text-right">Líneas</th><th className="px-3 py-2 text-right">Total</th><th className="px-3 py-2">Validación</th></tr></thead><tbody className="divide-y">{grupos.slice(0, 500).map((grupo, index) => <tr key={`${grupo.factura}-${index}`}><td className="px-3 py-2 font-mono text-xs">{grupo.factura}</td><td className="px-3 py-2">{grupo.values?.cliente || '—'}</td><td className="px-3 py-2 text-xs">{grupo.values?.fecha ? new Date(grupo.values.fecha).toLocaleString('es-PY') : '—'}</td><td className="px-3 py-2 text-right">{grupo.lineas.length}</td><td className="px-3 py-2 text-right">Gs {Math.round(grupo.total || 0).toLocaleString('es-PY')}</td><td className="px-3 py-2 text-xs">{grupo.valido ? <span className="font-semibold text-emerald-700">Lista</span> : <span className="text-red-700">{grupo.errores.slice(0, 2).join(' ')}</span>}</td></tr>)}</tbody></table>{grupos.length > 500 && <p className="border-t p-2 text-center text-xs text-slate-500">Se muestran las primeras 500 facturas; el lote completo conserva un máximo de 5.000 líneas.</p>}</div></div>}
    </section>}
    {resultado && <section role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-950"><div className="flex items-center gap-2 font-bold"><CheckCircle2 size={18}/>Importación procesada</div><p className="mt-2">Facturas registradas: {resultado.procesados.length} · Filas/facturas inválidas: {resultado.omitidos} · No registradas: {resultado.fallidos.length}</p>{resultado.procesados.length > 0 && <p className="mt-1 text-xs">Facturas: {resultado.procesados.map((item) => `${item.factura} (#${item.id})`).join(', ')}</p>}{resultado.fallidos.length > 0 && <ul className="mt-2 max-h-40 list-inside list-disc overflow-auto text-xs">{resultado.fallidos.map((item, index) => <li key={`${item.factura}-${index}`}>Factura {item.factura}: {item.error}</li>)}</ul>}</section>}
  </main>;
}
