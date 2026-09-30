import { useEffect, useMemo, useRef, useState } from 'react';
import { Activity, ArrowDownUp, BadgeDollarSign, Boxes, Download, FileSpreadsheet, Filter, RefreshCw, Search, Users } from 'lucide-react';
import { supabase } from './supabaseClient';
import { useEmpresaInfo } from './utils/useEmpresa';
import { useSucursalActiva } from './utils/SucursalContext';

const PAGE_SIZE = 1000;
const MAX_ROWS = 20000;
const REPORTES = [
  { id: 'compras-ventas', nombre: 'Compras y ventas', icon: ArrowDownUp, tablas: ['ventas', 'compras'] },
  { id: 'clientes-proveedores', nombre: 'Proveedores y clientes', icon: Users, tablas: ['clientes', 'ventas', 'compras'] },
  { id: 'grupos-clientes', nombre: 'Grupos de clientes', icon: Users, tablas: ['clientes', 'ventas'] },
  { id: 'productos-mas-vendidos', nombre: 'Productos más vendidos', icon: Boxes, tablas: ['productos', 'detalle_ventas', 'ventas'] },
  { id: 'detalle-articulo', nombre: 'Detalle por artículo', icon: FileSpreadsheet, tablas: ['detalle_ventas', 'detalle_compras', 'ventas', 'compras'] },
  { id: 'pagos-compras', nombre: 'Pagos de compra', icon: BadgeDollarSign, tablas: ['pagos_compras', 'compras'] },
  { id: 'actividad', nombre: 'Historial de actividades', icon: Activity, tablas: ['eventos_auditoria'] },
  { id: 'rg-90', nombre: 'RG 90 — Marangatu', icon: FileSpreadsheet, tablas: ['ventas', 'compras', 'detalle_ventas', 'detalle_compras', 'clientes'] },
];

const fechaLocalISO = (fecha = new Date()) => {
  const ajustada = new Date(fecha.getTime() - fecha.getTimezoneOffset() * 60000);
  return ajustada.toISOString().slice(0, 10);
};
const moneda = (valor) => `Gs ${Math.round(Number(valor) || 0).toLocaleString('es-PY')}`;
const numero = (valor) => Number(valor || 0).toLocaleString('es-PY', { maximumFractionDigits: 3 });
const fecha = (valor) => {
  if (!valor) return '—';
  const soloDia = String(valor).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return (soloDia ? new Date(Number(soloDia[1]), Number(soloDia[2]) - 1, Number(soloDia[3])) : new Date(valor)).toLocaleDateString('es-PY');
};
const valorDe = (fila, ...claves) => claves.map((clave) => fila?.[clave]).find((valor) => valor !== undefined && valor !== null && valor !== '') ?? '';
const nombreContacto = (fila) => valorDe(fila, 'nombre', 'nombre_empresa', 'proveedor_nombre', 'cliente', 'proveedor') || 'Sin identificar';
const referencia = (fila) => valorDe(fila, 'numero_factura', 'nro_factura', 'numero_comprobante', 'referencia', 'id');

async function leerTabla(tabla, empresaId) {
  const filas = [];
  for (let desde = 0; desde < MAX_ROWS; desde += PAGE_SIZE) {
    const { data, error } = await supabase.from(tabla).select('*').eq('empresa_id', empresaId).range(desde, desde + PAGE_SIZE - 1);
    if (error) throw error;
    filas.push(...(data || []));
    if (!data || data.length < PAGE_SIZE) return { filas, truncado: false };
  }
  return { filas, truncado: true };
}

function exportarCSV(nombre, columnas, filas) {
  const escapar = (valor) => `"${String(valor ?? '').replaceAll('"', '""')}"`;
  const contenido = `\uFEFF${[columnas, ...filas].map((fila) => fila.map(escapar).join(';')).join('\r\n')}`;
  const enlace = document.createElement('a');
  enlace.href = URL.createObjectURL(new Blob([contenido], { type: 'text/csv;charset=utf-8' }));
  enlace.download = `${nombre}-${fechaLocalISO()}.csv`;
  enlace.click();
  URL.revokeObjectURL(enlace.href);
}

function Tabla({ columnas, filas, vacio }) {
  return <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-sm"><thead className="bg-slate-50 text-[11px] font-bold uppercase tracking-wide text-slate-500"><tr>{columnas.map((columna) => <th key={columna.titulo} className={`px-4 py-3 ${columna.derecha ? 'text-right' : ''}`}>{columna.titulo}</th>)}</tr></thead><tbody className="divide-y divide-slate-100">{filas.length ? filas.map((fila, indice) => <tr key={fila.id || `${fila.documento || fila.nombre || fila.fecha || 'fila'}-${indice}`} className="hover:bg-slate-50/70">{columnas.map((columna) => <td key={columna.titulo} className={`px-4 py-3 ${columna.derecha ? 'text-right font-semibold tabular-nums' : 'text-slate-700'}`}>{columna.render ? columna.render(fila) : (fila[columna.campo] ?? '—')}</td>)}</tr>) : <tr><td colSpan={columnas.length} className="px-4 py-12 text-center text-slate-400">{vacio}</td></tr>}</tbody></table></div>;
}

export default function InformesMicdepos({ initialReport = 'compras-ventas' }) {
  const { id: empresaId, ruc: rucEmpresa } = useEmpresaInfo();
  const { sucursalActiva } = useSucursalActiva();
  const [reporteId, setReporteId] = useState(initialReport);
  const [desde, setDesde] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10));
  const [hasta, setHasta] = useState(fechaLocalISO);
  const [libro, setLibro] = useState('ventas');
  const [busqueda, setBusqueda] = useState('');
  const [datos, setDatos] = useState({});
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState('');
  const [truncadas, setTruncadas] = useState([]);
  const solicitudActual = useRef(0);

  useEffect(() => { setReporteId(initialReport); }, [initialReport]);
  const reporte = REPORTES.find((item) => item.id === reporteId) || REPORTES[0];

  const cargar = async () => {
    if (!empresaId) return;
    const solicitud = ++solicitudActual.current;
    setCargando(true);
    setError('');
    const resultados = await Promise.all(reporte.tablas.map(async (tabla) => {
      try { return [tabla, await leerTabla(tabla, empresaId), null]; }
      catch (fallo) { return [tabla, { filas: [], truncado: false }, fallo]; }
    }));
    if (solicitud !== solicitudActual.current) return;
    const siguientes = {};
    const fallos = [];
    const limite = [];
    resultados.forEach(([tabla, resultado, fallo]) => {
      siguientes[tabla] = resultado.filas;
      if (fallo) fallos.push(`${tabla}: ${fallo.message}`);
      if (resultado.truncado) limite.push(tabla);
    });
    setDatos(siguientes);
    setTruncadas(limite);
    setError(fallos.length ? `No se pudieron cargar algunas fuentes: ${fallos.join(' · ')}` : '');
    setCargando(false);
  };

  useEffect(() => { cargar(); }, [empresaId, reporteId]);

  const fechaEnRango = (valor) => {
    const dia = String(valor || '').slice(0, 10);
    return !!dia && (!desde || dia >= desde) && (!hasta || dia <= hasta);
  };
  const sucursalAplica = (fila) => !sucursalActiva || String(fila?.ubicacion_id || '') === String(sucursalActiva);
  const contieneBusqueda = (fila) => !busqueda.trim() || Object.values(fila).some((valor) => String(valor ?? '').toLocaleLowerCase('es').includes(busqueda.trim().toLocaleLowerCase('es')));
  const ventas = (datos.ventas || []).filter((fila) => fechaEnRango(fila.fecha) && sucursalAplica(fila));
  const compras = (datos.compras || []).filter((fila) => fechaEnRango(fila.fecha) && sucursalAplica(fila));
  const ventasPorId = useMemo(() => new Map((datos.ventas || []).map((fila) => [String(fila.id), fila])), [datos.ventas]);
  const comprasPorId = useMemo(() => new Map((datos.compras || []).map((fila) => [String(fila.id), fila])), [datos.compras]);
  const productosPorId = useMemo(() => new Map((datos.productos || []).map((fila) => [String(fila.id), fila])), [datos.productos]);

  const filas = useMemo(() => {
    if (reporteId === 'compras-ventas') return [...ventas.map((fila) => ({ id: `v-${fila.id}`, clase: 'Venta', fecha: fila.fecha, documento: referencia(fila), tercero: nombreContacto(fila), total: Number(fila.total || 0), saldo: Number(fila.saldo_pendiente || 0) })), ...compras.map((fila) => ({ id: `c-${fila.id}`, clase: 'Compra', fecha: fila.fecha, documento: referencia(fila), tercero: nombreContacto(fila), total: Number(fila.total || 0), saldo: Number(fila.saldo_pendiente || 0) }))].filter(contieneBusqueda).sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
    if (reporteId === 'clientes-proveedores') {
      const mapa = new Map();
      (datos.clientes || []).forEach((cliente) => mapa.set(nombreContacto(cliente).toLocaleLowerCase('es'), { id: cliente.id, nombre: nombreContacto(cliente), tipo: cliente.tipo_contacto || 'Contacto', grupo: cliente.grupo_clientes || 'Sin grupo', ventas: 0, compras: 0, cobrar: 0, pagar: 0, saldo: Number(cliente.saldo_apertura || 0) }));
      ventas.forEach((venta) => { const clave = nombreContacto(venta).toLocaleLowerCase('es'); const item = mapa.get(clave) || { nombre: nombreContacto(venta), tipo: 'Cliente', grupo: '—', ventas: 0, compras: 0, cobrar: 0, pagar: 0, saldo: 0 }; item.ventas += Number(venta.total || 0); item.cobrar += Number(venta.saldo_pendiente || 0); mapa.set(clave, item); });
      compras.forEach((compra) => { const clave = nombreContacto(compra).toLocaleLowerCase('es'); const item = mapa.get(clave) || { nombre: nombreContacto(compra), tipo: 'Proveedor', grupo: '—', ventas: 0, compras: 0, cobrar: 0, pagar: 0, saldo: 0 }; item.compras += Number(compra.total || 0); item.pagar += Number(compra.saldo_pendiente || 0); mapa.set(clave, item); });
      return [...mapa.values()].filter(contieneBusqueda).sort((a, b) => (b.ventas + b.compras) - (a.ventas + a.compras));
    }
    if (reporteId === 'grupos-clientes') {
      const mapa = new Map();
      (datos.clientes || []).filter((cliente) => ['Clientes', 'Ambos'].includes(cliente.tipo_contacto)).forEach((cliente) => {
        const grupo = cliente.grupo_clientes || 'Sin grupo';
        if (!mapa.has(grupo)) mapa.set(grupo, { nombre: grupo, contactos: 0, ventas: 0, saldo: 0 });
        const fila = mapa.get(grupo); fila.contactos += 1; fila.saldo += Number(cliente.saldo_apertura || 0);
      });
      ventas.forEach((venta) => { const cliente = (datos.clientes || []).find((fila) => nombreContacto(fila).toLocaleLowerCase('es') === nombreContacto(venta).toLocaleLowerCase('es')); const grupo = cliente?.grupo_clientes || 'Sin grupo'; if (!mapa.has(grupo)) mapa.set(grupo, { nombre: grupo, contactos: 0, ventas: 0, saldo: 0 }); mapa.get(grupo).ventas += Number(venta.total || 0); });
      return [...mapa.values()].filter(contieneBusqueda).sort((a, b) => b.ventas - a.ventas);
    }
    if (reporteId === 'productos-mas-vendidos') {
      const mapa = new Map();
      (datos.detalle_ventas || []).filter((detalle) => { const venta = ventasPorId.get(String(detalle.venta_id)); return venta && fechaEnRango(venta.fecha) && sucursalAplica(venta); }).forEach((detalle) => {
        const producto = productosPorId.get(String(detalle.producto_id)); const id = String(detalle.producto_id || detalle.nombre_producto || detalle.id);
        const fila = mapa.get(id) || { id, nombre: detalle.nombre_producto || producto?.nombre || 'Artículo', codigo: producto?.codigo || '', cantidad: 0, ingresos: 0, documentos: 0 };
        fila.cantidad += Number(detalle.cantidad || 0); fila.ingresos += Number(detalle.subtotal || 0); fila.documentos += 1; mapa.set(id, fila);
      });
      return [...mapa.values()].filter(contieneBusqueda).sort((a, b) => b.cantidad - a.cantidad);
    }
    if (reporteId === 'detalle-articulo') {
      const ventasDet = (datos.detalle_ventas || []).flatMap((detalle) => { const doc = ventasPorId.get(String(detalle.venta_id)); if (!doc || !fechaEnRango(doc.fecha) || !sucursalAplica(doc)) return []; return [{ id: `v-${detalle.id}`, fecha: doc.fecha, clase: 'Venta', documento: referencia(doc), tercero: nombreContacto(doc), producto: detalle.nombre_producto || productosPorId.get(String(detalle.producto_id))?.nombre || 'Artículo', cantidad: Number(detalle.cantidad || 0), unitario: Number(detalle.precio_unitario || 0), total: Number(detalle.subtotal || 0) }]; });
      const comprasDet = (datos.detalle_compras || []).flatMap((detalle) => { const doc = comprasPorId.get(String(detalle.compra_id)); if (!doc || !fechaEnRango(doc.fecha) || !sucursalAplica(doc)) return []; return [{ id: `c-${detalle.id}`, fecha: doc.fecha, clase: 'Compra', documento: referencia(doc), tercero: nombreContacto(doc), producto: detalle.nombre_producto || productosPorId.get(String(detalle.producto_id))?.nombre || 'Artículo', cantidad: Number(detalle.cantidad || 0), unitario: Number(detalle.costo_unitario || 0), total: Number(detalle.subtotal || 0) }]; });
      return [...ventasDet, ...comprasDet].filter(contieneBusqueda).sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
    }
    if (reporteId === 'pagos-compras') return (datos.pagos_compras || []).filter((pago) => { const compra = comprasPorId.get(String(pago.compra_id)); return fechaEnRango(pago.fecha) && sucursalAplica(compra || pago); }).map((pago) => { const compra = comprasPorId.get(String(pago.compra_id)); return { id: pago.id, fecha: pago.fecha, documento: referencia(compra || {}), proveedor: nombreContacto(compra || {}), metodo: pago.metodo_pago || '—', cuenta: pago.cuenta_pago || '—', monto: Number(pago.monto || 0), nota: pago.nota || '' }; }).filter(contieneBusqueda).sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
    if (reporteId === 'actividad') {
      return (datos.eventos_auditoria || []).filter((fila) => fechaEnRango(fila.ocurrido_en) && sucursalAplica(fila))
        .map((fila) => ({ id: fila.id, fecha: fila.ocurrido_en, tipo: `${fila.accion} · ${fila.tabla}`, detalle: `Registro ${fila.registro_id || '—'}${fila.detalle && Object.keys(fila.detalle).length ? ` · ${JSON.stringify(fila.detalle).slice(0, 350)}` : ''}`, usuario: fila.usuario_nombre || fila.usuario_auth_id || '—', ubicacion_id: fila.ubicacion_id }))
        .filter(contieneBusqueda).sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
    }
    if (reporteId === 'rg-90') {
      const documentos = libro === 'ventas' ? ventas : compras;
      const lineas = libro === 'ventas' ? (datos.detalle_ventas || []) : (datos.detalle_compras || []);
      const llave = libro === 'ventas' ? 'venta_id' : 'compra_id';
      return documentos.map((doc) => {
        const items = lineas.filter((linea) => String(linea[llave]) === String(doc.id));
        const iva = items.reduce((total, linea) => total + Number(linea.impuesto || 0), 0);
        return { id: doc.id, fecha: doc.fecha, numero: referencia(doc), tercero: nombreContacto(doc), documento: valorDe(doc, 'ruc', 'documento_nro', 'cliente_ruc') || '—', base: Math.max(0, Number(doc.total || 0) - iva), iva, total: Number(doc.total || 0), estado: doc.estado_pago || doc.estado || '—' };
      }).filter(contieneBusqueda).sort((a, b) => new Date(a.fecha) - new Date(b.fecha));
    }
    return [];
  }, [reporteId, datos, ventas, compras, ventasPorId, comprasPorId, productosPorId, desde, hasta, sucursalActiva, busqueda, libro]);

  const columnas = {
    'compras-ventas': [{ titulo: 'Fecha', campo: 'fecha', render: (f) => fecha(f.fecha) }, { titulo: 'Tipo', campo: 'clase' }, { titulo: 'Documento', campo: 'documento' }, { titulo: 'Cliente / proveedor', campo: 'tercero' }, { titulo: 'Total', campo: 'total', derecha: true, render: (f) => moneda(f.total) }, { titulo: 'Saldo', campo: 'saldo', derecha: true, render: (f) => moneda(f.saldo) }],
    'clientes-proveedores': [{ titulo: 'Contacto', campo: 'nombre' }, { titulo: 'Tipo', campo: 'tipo' }, { titulo: 'Grupo', campo: 'grupo' }, { titulo: 'Ventas', campo: 'ventas', derecha: true, render: (f) => moneda(f.ventas) }, { titulo: 'Compras', campo: 'compras', derecha: true, render: (f) => moneda(f.compras) }, { titulo: 'Por cobrar', campo: 'cobrar', derecha: true, render: (f) => moneda(f.cobrar) }, { titulo: 'Por pagar', campo: 'pagar', derecha: true, render: (f) => moneda(f.pagar) }],
    'grupos-clientes': [{ titulo: 'Grupo', campo: 'nombre' }, { titulo: 'Contactos', campo: 'contactos', derecha: true }, { titulo: 'Ventas del período', campo: 'ventas', derecha: true, render: (f) => moneda(f.ventas) }, { titulo: 'Saldo inicial asociado', campo: 'saldo', derecha: true, render: (f) => moneda(f.saldo) }],
    'productos-mas-vendidos': [{ titulo: 'Código', campo: 'codigo' }, { titulo: 'Producto', campo: 'nombre' }, { titulo: 'Unidades vendidas', campo: 'cantidad', derecha: true, render: (f) => numero(f.cantidad) }, { titulo: 'Importe de líneas', campo: 'ingresos', derecha: true, render: (f) => moneda(f.ingresos) }, { titulo: 'Líneas', campo: 'documentos', derecha: true }],
    'detalle-articulo': [{ titulo: 'Fecha', campo: 'fecha', render: (f) => fecha(f.fecha) }, { titulo: 'Tipo', campo: 'clase' }, { titulo: 'Documento', campo: 'documento' }, { titulo: 'Contacto', campo: 'tercero' }, { titulo: 'Artículo', campo: 'producto' }, { titulo: 'Cantidad', campo: 'cantidad', derecha: true, render: (f) => numero(f.cantidad) }, { titulo: 'Precio unitario', campo: 'unitario', derecha: true, render: (f) => moneda(f.unitario) }, { titulo: 'Total', campo: 'total', derecha: true, render: (f) => moneda(f.total) }],
    'pagos-compras': [{ titulo: 'Fecha', campo: 'fecha', render: (f) => fecha(f.fecha) }, { titulo: 'Referencia de compra', campo: 'documento' }, { titulo: 'Proveedor', campo: 'proveedor' }, { titulo: 'Método', campo: 'metodo' }, { titulo: 'Cuenta', campo: 'cuenta' }, { titulo: 'Monto', campo: 'monto', derecha: true, render: (f) => moneda(f.monto) }, { titulo: 'Nota', campo: 'nota' }],
    actividad: [{ titulo: 'Fecha', campo: 'fecha', render: (f) => fecha(f.fecha) }, { titulo: 'Tipo de actividad', campo: 'tipo' }, { titulo: 'Detalle', campo: 'detalle' }, { titulo: 'Usuario registrado', campo: 'usuario' }],
    'rg-90': [{ titulo: 'Fecha', campo: 'fecha', render: (f) => fecha(f.fecha) }, { titulo: 'Comprobante', campo: 'numero' }, { titulo: 'Cliente / proveedor', campo: 'tercero' }, { titulo: 'Documento', campo: 'documento' }, { titulo: 'Subtotal registrado', campo: 'base', derecha: true, render: (f) => moneda(f.base) }, { titulo: 'IVA guardado en líneas', campo: 'iva', derecha: true, render: (f) => moneda(f.iva) }, { titulo: 'Total', campo: 'total', derecha: true, render: (f) => moneda(f.total) }],
  }[reporteId] || [];
  const columnasCSV = columnas.map((columna) => columna.titulo);
  const filasCSV = filas.map((fila) => columnas.map((columna) => String(columna.render ? columna.render(fila) : (fila[columna.campo] ?? ''))));
  const total = filas.reduce((acum, fila) => acum + Number(fila.total ?? fila.monto ?? fila.ingresos ?? fila.ventas ?? 0), 0);

  return <div className="space-y-5 p-4 md:p-6">
    <header className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-[0.18em] text-orange-600">Informes</p><h1 className="mt-1 text-2xl font-black text-slate-900">{reporte.nombre}</h1><p className="mt-1 text-sm text-slate-500">Consultas por empresa y sucursal, con filtros y exportación a CSV.</p></div><div className="flex gap-2"><button onClick={() => cargar()} disabled={cargando} className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-bold text-slate-700 disabled:opacity-50"><RefreshCw size={15} className={cargando ? 'animate-spin' : ''} />Actualizar</button><button onClick={() => exportarCSV(reporte.id, columnasCSV, filasCSV)} disabled={!filas.length} className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-3 py-2 text-sm font-bold text-white disabled:opacity-50"><Download size={15} />{reporteId === 'rg-90' ? 'CSV de consulta' : 'CSV'}</button></div></header>
    <nav className="flex gap-2 overflow-x-auto rounded-xl border border-slate-200 bg-white p-2">{REPORTES.map((item) => { const Icon = item.icon; return <button key={item.id} onClick={() => setReporteId(item.id)} className={`inline-flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-xs font-bold transition ${reporteId === item.id ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'}`}><Icon size={15} />{item.nombre}</button>; })}</nav>
    <section className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-3"><label className="text-xs font-bold text-slate-600">Desde<input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} className="mt-1 block rounded-md border border-slate-300 px-2.5 py-2 text-sm font-normal" /></label><label className="text-xs font-bold text-slate-600">Hasta<input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} className="mt-1 block rounded-md border border-slate-300 px-2.5 py-2 text-sm font-normal" /></label>{reporteId === 'rg-90' && <label className="text-xs font-bold text-slate-600">Libro<select value={libro} onChange={(e) => setLibro(e.target.value)} className="mt-1 block rounded-md border border-slate-300 px-2.5 py-2 text-sm font-normal"><option value="ventas">Ventas</option><option value="compras">Compras</option></select></label>}<label className="relative min-w-[200px] flex-1"><Search size={15} className="absolute left-3 top-[30px] -translate-y-1/2 text-slate-400" /><input value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Buscar en este informe" className="mt-1 w-full rounded-md border border-slate-300 py-2 pl-9 pr-3 text-sm font-normal" /></label><p className="ml-auto inline-flex items-center gap-1 text-xs font-semibold text-slate-500"><Filter size={14} />{sucursalActiva ? 'Sucursal activa' : 'Todas las sucursales'}</p></section>
    {error && <div role="alert" className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">{error}</div>}{truncadas.length > 0 && <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">Se alcanzó el límite de {MAX_ROWS.toLocaleString('es-PY')} filas en {truncadas.join(', ')}.</div>}
    {reporteId === 'rg-90' && <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950"><strong>Este CSV es solo de consulta y no se puede importar como registro oficial de Marangatu.</strong> Para generar el archivo oficial faltan, por comprobante, tipo documental y timbrado, identificación tributaria de terceros, desglose 10%/5%/exento e imputación al impuesto. La especificación DNIT requiere campos en orden, hasta 5.000 filas y archivo CSV/TXT UTF-8 dentro de un ZIP con nombre conforme al RUC y período. El sistema aún no conserva todos esos datos; no completaré los faltantes con valores inventados.{rucEmpresa ? ` RUC del informante disponible: ${rucEmpresa}.` : ' Falta el RUC de la empresa.'}</div>}
    {reporteId === 'actividad' && <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">Bitácora persistente para inicios de sesión y cambios en ventas, compras, pagos, gastos, stock, clientes, proveedores y cajas. Solo registra eventos desde que se instala la migración; no reconstruye acciones anteriores ni cambios de módulos que aún no tienen disparador.</div>}
    <div className="grid gap-3 sm:grid-cols-3"><article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><p className="text-xs font-bold uppercase tracking-wide text-slate-500">Registros</p><p className="mt-2 text-xl font-black text-slate-900">{filas.length.toLocaleString('es-PY')}</p></article><article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><p className="text-xs font-bold uppercase tracking-wide text-slate-500">Total mostrado</p><p className="mt-2 text-xl font-black text-slate-900">{moneda(total)}</p></article><article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><p className="text-xs font-bold uppercase tracking-wide text-slate-500">Período</p><p className="mt-2 text-sm font-black text-slate-900">{fecha(desde)} – {fecha(hasta)}</p></article></div>
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm"><Tabla columnas={columnas} filas={filas} vacio={cargando ? 'Cargando datos del informe…' : 'No hay registros para los filtros seleccionados.'} /></section>
  </div>;
}
