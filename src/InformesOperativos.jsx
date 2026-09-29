import { useEffect, useMemo, useState } from 'react';
import { CalendarClock, ClipboardCheck, Download, PackageSearch, RefreshCw, Search, TrendingDown, WalletCards } from 'lucide-react';
import { supabase } from './supabaseClient';
import { useEmpresaInfo } from './utils/useEmpresa';
import { useSucursalActiva } from './utils/SucursalContext';

const PAGINA_LECTURA = 1000;
const MAX_FILAS = 20000;
const ESTADOS = [
  { id: 'stock', label: 'Inventario / stock', icon: PackageSearch },
  { id: 'deudas', label: 'Cuentas por cobrar y pagar', icon: WalletCards },
  { id: 'gastos', label: 'Comprobantes de egresos', icon: TrendingDown },
  { id: 'iva', label: 'Impuestos registrados', icon: Download },
  { id: 'vencimientos', label: 'Vencimientos', icon: CalendarClock },
  { id: 'ajustes', label: 'Ajustes de stock', icon: ClipboardCheck },
];

const moneda = (valor) => `Gs ${Math.round(Number(valor) || 0).toLocaleString('es-PY')}`;
const fechaCorta = (fecha) => fecha ? new Date(fecha).toLocaleDateString('es-PY') : '—';
const inicioMesISO = () => {
  const fecha = new Date();
  return new Date(fecha.getFullYear(), fecha.getMonth(), 1).toISOString().slice(0, 10);
};
const hoyISO = () => {
  const fecha = new Date();
  return new Date(fecha.getTime() - fecha.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};

async function leerFilasEmpresa(tabla, empresaId) {
  const filas = [];
  for (let desde = 0; desde < MAX_FILAS; desde += PAGINA_LECTURA) {
    const { data, error } = await supabase.from(tabla).select('*').eq('empresa_id', empresaId).range(desde, desde + PAGINA_LECTURA - 1);
    if (error) throw error;
    filas.push(...(data || []));
    if (!data || data.length < PAGINA_LECTURA) return { filas, truncado: false };
  }
  return { filas, truncado: true };
}

function descargarCSV(nombre, columnas, filas) {
  const escape = (valor) => `"${String(valor ?? '').replaceAll('"', '""')}"`;
  const contenido = `\uFEFF${[columnas, ...filas].map((fila) => fila.map(escape).join(',')).join('\r\n')}`;
  const url = URL.createObjectURL(new Blob([contenido], { type: 'text/csv;charset=utf-8' }));
  const enlace = document.createElement('a');
  enlace.href = url;
  enlace.download = `${nombre}-${hoyISO()}.csv`;
  enlace.click();
  URL.revokeObjectURL(url);
}

function Tarjeta({ titulo, valor, nota }) {
  return <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><p className="text-xs font-bold uppercase tracking-wide text-slate-500">{titulo}</p><p className="mt-2 text-xl font-black text-slate-900">{valor}</p>{nota && <p className="mt-1 text-xs text-slate-500">{nota}</p>}</article>;
}

function Tabla({ columnas, filas, vacio }) {
  return <div className="overflow-x-auto"><table className="w-full min-w-[720px] text-left text-sm"><thead className="bg-slate-50 text-[11px] font-bold uppercase tracking-wide text-slate-500"><tr>{columnas.map((columna) => <th key={columna.titulo} className={`px-4 py-3 ${columna.derecha ? 'text-right' : ''}`}>{columna.titulo}</th>)}</tr></thead><tbody className="divide-y divide-slate-100">{filas.length ? filas.map((fila, indice) => <tr key={fila.id || `${fila.ref || fila.nombre || fila.fecha || 'fila'}-${indice}`} className="hover:bg-slate-50/70">{columnas.map((columna) => <td key={columna.titulo} className={`px-4 py-3 ${columna.derecha ? 'text-right font-semibold tabular-nums' : 'text-slate-700'}`}>{columna.render ? columna.render(fila) : (fila[columna.campo] ?? '—')}</td>)}</tr>) : <tr><td colSpan={columnas.length} className="px-4 py-12 text-center text-sm text-slate-400">{vacio}</td></tr>}</tbody></table></div>;
}

export default function InformesOperativos() {
  const { id: empresaId } = useEmpresaInfo();
  const { sucursalActiva, ubicaciones, usuarioVeTodas } = useSucursalActiva();
  const [reporte, setReporte] = useState('stock');
  const [datos, setDatos] = useState({});
  const [errores, setErrores] = useState({});
  const [cargando, setCargando] = useState(false);
  const [desde, setDesde] = useState(inicioMesISO);
  const [hasta, setHasta] = useState(hoyISO);
  const [busqueda, setBusqueda] = useState('');
  const [umbralStock, setUmbralStock] = useState('5');
  const [mostrarSoloBajo, setMostrarSoloBajo] = useState(false);

  const cargar = async (tipo = reporte) => {
    if (!empresaId) return;
    setCargando(true);
    setErrores((actuales) => ({ ...actuales, [tipo]: '' }));
    const tablasPorReporte = {
      stock: ['productos', 'producto_stock_ubicacion'],
      deudas: ['ventas', 'compras'],
      gastos: ['gastos'],
      iva: ['ventas', 'compras', 'detalle_ventas', 'detalle_compras'],
      vencimientos: ['productos', 'producto_stock_ubicacion'],
      ajustes: ['ajustes_stock'],
    };
    const resultados = await Promise.all((tablasPorReporte[tipo] || []).map(async (tabla) => {
      try {
        const resultado = await leerFilasEmpresa(tabla, empresaId);
        return [tabla, resultado, null];
      } catch (error) {
        return [tabla, { filas: [], truncado: false }, error];
      }
    }));
    const nuevo = {};
    const fallos = [];
    const truncados = [];
    resultados.forEach(([tabla, resultado, error]) => {
      nuevo[tabla] = resultado.filas;
      if (resultado.truncado) truncados.push(tabla);
      if (error) fallos.push(`${tabla}: ${error.message}`);
    });
    setDatos((anteriores) => ({ ...anteriores, [tipo]: nuevo }));
    setErrores((anteriores) => ({
      ...anteriores,
      [tipo]: [fallos.length ? `No se pudieron cargar algunas fuentes: ${fallos.join(' · ')}` : '', truncados.length ? `El informe alcanzó el límite de ${MAX_FILAS.toLocaleString('es-PY')} filas en ${truncados.join(', ')}.` : ''].filter(Boolean).join(' '),
    }));
    setCargando(false);
  };

  useEffect(() => { cargar(reporte); }, [empresaId, reporte]);

  const conjuntos = datos[reporte] || {};
  const fechasPermitidas = (fecha) => {
    if (!fecha) return false;
    const dia = String(fecha).slice(0, 10);
    return (!desde || dia >= desde) && (!hasta || dia <= hasta);
  };
  const perteneceSucursal = (fila) => !sucursalActiva || String(fila.ubicacion_id || '') === String(sucursalActiva);
  const termino = busqueda.trim().toLocaleLowerCase('es');

  const filasStock = useMemo(() => {
    const ubicacionesStock = conjuntos.producto_stock_ubicacion || [];
    const porProducto = new Map();
    ubicacionesStock.forEach((fila) => {
      if (sucursalActiva && String(fila.ubicacion_id) !== String(sucursalActiva)) return;
      const clave = String(fila.producto_id);
      porProducto.set(clave, (porProducto.get(clave) || 0) + Number(fila.cantidad || 0));
    });
    const limite = Number(umbralStock) || 0;
    return (conjuntos.productos || []).map((producto) => {
      const porSucursal = porProducto.get(String(producto.id));
      const stock = sucursalActiva
        ? (porSucursal === undefined ? null : porSucursal)
        : Number(producto.stock_actual || 0);
      return {
        ...producto,
        stock_reporte: stock,
        valor_costo: stock === null ? null : stock * Number(producto.precio_compra || 0),
        valor_venta: stock === null ? null : stock * Number(producto.precio_venta || 0),
        bajo: stock !== null && stock <= limite,
      };
    }).filter((producto) => (!mostrarSoloBajo || producto.bajo)
      && (!termino || `${producto.nombre} ${producto.codigo || ''}`.toLocaleLowerCase('es').includes(termino)))
      .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  }, [conjuntos.productos, conjuntos.producto_stock_ubicacion, sucursalActiva, umbralStock, mostrarSoloBajo, termino]);

  const filasDeuda = useMemo(() => {
    const ventas = (conjuntos.ventas || []).filter((fila) => Number(fila.saldo_pendiente || 0) > 0 && fechasPermitidas(fila.fecha) && perteneceSucursal(fila))
      .map((fila) => ({ id: `v-${fila.id}`, tipo: 'Por cobrar', tercero: fila.cliente || 'Cliente ocasional', fecha: fila.fecha, ref: fila.numero_factura || fila.id, total: Number(fila.total || 0), saldo: Number(fila.saldo_pendiente || 0) }));
    const compras = (conjuntos.compras || []).filter((fila) => Number(fila.saldo_pendiente || 0) > 0 && fechasPermitidas(fila.fecha) && perteneceSucursal(fila))
      .map((fila) => ({ id: `c-${fila.id}`, tipo: 'Por pagar', tercero: fila.proveedor_nombre || fila.proveedor || 'Proveedor', fecha: fila.fecha, ref: fila.nro_factura || fila.id, total: Number(fila.total || 0), saldo: Number(fila.saldo_pendiente || 0) }));
    return [...ventas, ...compras].filter((fila) => !termino || `${fila.tipo} ${fila.tercero} ${fila.ref}`.toLocaleLowerCase('es').includes(termino)).sort((a, b) => new Date(a.fecha) - new Date(b.fecha));
  }, [conjuntos.ventas, conjuntos.compras, desde, hasta, sucursalActiva, termino]);

  const filasGastos = useMemo(() => (conjuntos.gastos || []).filter((fila) => fechasPermitidas(fila.fecha) && perteneceSucursal(fila))
    .map((fila) => ({ ...fila, monto_reporte: Number(fila.monto || 0), categoria_reporte: fila.categoria || 'Sin categoría' }))
    .filter((fila) => !termino || `${fila.descripcion || ''} ${fila.categoria_reporte} ${fila.proveedor || ''} ${fila.cuenta_pago || ''}`.toLocaleLowerCase('es').includes(termino))
    .sort((a, b) => new Date(b.fecha) - new Date(a.fecha)), [conjuntos.gastos, desde, hasta, sucursalActiva, termino]);

  const filasIVA = useMemo(() => {
    const docs = [
      ...(conjuntos.ventas || []).filter((fila) => fechasPermitidas(fila.fecha) && perteneceSucursal(fila)).map((fila) => ({ ...fila, clase: 'Venta' })),
      ...(conjuntos.compras || []).filter((fila) => fechasPermitidas(fila.fecha) && perteneceSucursal(fila)).map((fila) => ({ ...fila, clase: 'Compra' })),
    ];
    const detallesVentas = conjuntos.detalle_ventas || [];
    const detallesCompras = conjuntos.detalle_compras || [];
    return docs.map((documento) => {
      const detalles = documento.clase === 'Venta'
        ? detallesVentas.filter((detalle) => String(detalle.venta_id) === String(documento.id))
        : detallesCompras.filter((detalle) => String(detalle.compra_id) === String(documento.id));
      const impuesto = detalles.reduce((suma, detalle) => suma + Number(detalle.impuesto || 0), 0);
      return { id: `${documento.clase}-${documento.id}`, clase: documento.clase, fecha: documento.fecha, ref: documento.numero_factura || documento.nro_factura || documento.id, tercero: documento.cliente || documento.proveedor_nombre || documento.proveedor || '—', base: Number(documento.total || 0) - impuesto, impuesto, total: Number(documento.total || 0) };
    }).filter((fila) => !termino || `${fila.clase} ${fila.tercero} ${fila.ref}`.toLocaleLowerCase('es').includes(termino)).sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
  }, [conjuntos.ventas, conjuntos.compras, conjuntos.detalle_ventas, conjuntos.detalle_compras, desde, hasta, sucursalActiva, termino]);

  const filasVencimientos = useMemo(() => {
    const stocks = conjuntos.producto_stock_ubicacion || [];
    const stockPorProducto = new Map();
    stocks.forEach((fila) => {
      if (sucursalActiva && String(fila.ubicacion_id) !== String(sucursalActiva)) return;
      const clave = String(fila.producto_id);
      stockPorProducto.set(clave, (stockPorProducto.get(clave) || 0) + Number(fila.cantidad || 0));
    });
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    return (conjuntos.productos || []).filter((producto) => producto.fecha_vencimiento)
      .map((producto) => {
        const vencimiento = new Date(`${String(producto.fecha_vencimiento).slice(0, 10)}T00:00:00`);
        const dias = Math.ceil((vencimiento.getTime() - hoy.getTime()) / 86400000);
        const stock = sucursalActiva
          ? (stockPorProducto.has(String(producto.id)) ? stockPorProducto.get(String(producto.id)) : null)
          : Number(producto.stock_actual || 0);
        return { ...producto, dias_para_vencer: dias, stock_vencimiento: stock, estado_vencimiento: dias < 0 ? 'Vencido' : dias <= 30 ? 'Próximo a vencer' : 'Vigente' };
      })
      .filter((producto) => !termino || `${producto.nombre} ${producto.codigo || ''} ${producto.categoria || ''} ${producto.marca || ''}`.toLocaleLowerCase('es').includes(termino))
      .sort((a, b) => a.dias_para_vencer - b.dias_para_vencer);
  }, [conjuntos.productos, conjuntos.producto_stock_ubicacion, sucursalActiva, termino]);

  const filasAjustes = useMemo(() => (conjuntos.ajustes_stock || []).filter((ajuste) => fechasPermitidas(ajuste.created_at)
    && (!sucursalActiva || String(ajuste.ubicacion_id) === String(sucursalActiva)))
    .flatMap((ajuste) => (ajuste.items || []).map((item, indice) => ({
      id: `${ajuste.id}-${indice}`,
      fecha: ajuste.created_at,
      ubicacion: ubicaciones.find((ubicacion) => String(ubicacion.id) === String(ajuste.ubicacion_id))?.nombre || '—',
      motivo: ajuste.motivo || '—',
      producto: item.nombre || `Producto ${item.producto_id}`,
      stock_anterior: Number(item.stock_anterior || 0),
      stock_nuevo: Number(item.stock_nuevo || 0),
      diferencia: Number(item.diferencia || 0),
    })))
    .filter((fila) => !termino || `${fila.ubicacion} ${fila.motivo} ${fila.producto}`.toLocaleLowerCase('es').includes(termino))
    .sort((a, b) => new Date(b.fecha) - new Date(a.fecha)), [conjuntos.ajustes_stock, desde, hasta, sucursalActiva, termino, ubicaciones]);

  const suma = (filas, clave) => filas.reduce((total, fila) => total + Number(fila[clave] || 0), 0);
  const datosActivos = { stock: filasStock, deudas: filasDeuda, gastos: filasGastos, iva: filasIVA, vencimientos: filasVencimientos, ajustes: filasAjustes }[reporte] || [];
  const exportar = () => {
    if (reporte === 'stock') descargarCSV('inventario-stock', ['Código', 'Producto', 'Stock', 'Costo unitario', 'Precio de venta', 'Valor al costo', 'Valor de venta'], filasStock.map((fila) => [fila.codigo, fila.nombre, fila.stock_reporte, fila.precio_compra, fila.precio_venta, fila.valor_costo, fila.valor_venta]));
    if (reporte === 'deudas') descargarCSV('deudas', ['Tipo', 'Fecha', 'Referencia', 'Tercero', 'Total', 'Saldo'], filasDeuda.map((fila) => [fila.tipo, fechaCorta(fila.fecha), fila.ref, fila.tercero, fila.total, fila.saldo]));
    if (reporte === 'gastos') descargarCSV('egresos', ['Fecha', 'Descripción', 'Categoría', 'Proveedor', 'Método', 'Cuenta', 'Monto'], filasGastos.map((fila) => [fechaCorta(fila.fecha), fila.descripcion, fila.categoria_reporte, fila.proveedor, fila.metodo_pago, fila.cuenta_pago, fila.monto_reporte]));
    if (reporte === 'iva') descargarCSV('iva-registrado', ['Tipo', 'Fecha', 'Referencia', 'Tercero', 'Base estimada', 'Impuesto registrado', 'Total'], filasIVA.map((fila) => [fila.clase, fechaCorta(fila.fecha), fila.ref, fila.tercero, fila.base, fila.impuesto, fila.total]));
    if (reporte === 'vencimientos') descargarCSV('vencimientos-productos', ['Código', 'Producto', 'Vencimiento', 'Días restantes', 'Stock', 'Estado'], filasVencimientos.map((fila) => [fila.codigo, fila.nombre, fila.fecha_vencimiento, fila.dias_para_vencer, fila.stock_vencimiento, fila.estado_vencimiento]));
    if (reporte === 'ajustes') descargarCSV('ajustes-stock', ['Fecha', 'Sucursal', 'Motivo', 'Producto', 'Stock anterior', 'Stock contado', 'Diferencia'], filasAjustes.map((fila) => [fechaCorta(fila.fecha), fila.ubicacion, fila.motivo, fila.producto, fila.stock_anterior, fila.stock_nuevo, fila.diferencia]));
  };

  const fechaControls = !['stock', 'vencimientos'].includes(reporte);
  const error = errores[reporte];
  const tituloSucursal = sucursalActiva ? ubicaciones.find((item) => String(item.id) === String(sucursalActiva))?.nombre : 'Todas las sucursales';

  return (
    <div className="mx-auto w-full max-w-[1500px] space-y-5 p-4 text-slate-800 md:p-6">
      <header className="flex flex-wrap items-end justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-[0.18em] text-orange-600">Informes</p><h1 className="mt-1 text-2xl font-black tracking-tight md:text-3xl">Informes operativos</h1><p className="mt-1 text-sm text-slate-500">Inventario, saldos, egresos, impuestos, vencimientos y ajustes registrados.</p></div><div className="flex gap-2"><button type="button" onClick={() => cargar()} disabled={cargando} className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm font-bold hover:border-orange-300 disabled:opacity-50"><RefreshCw size={16} className={cargando ? 'animate-spin' : ''} />Actualizar</button><button type="button" onClick={exportar} disabled={!datosActivos.length} className="inline-flex items-center gap-2 rounded-lg bg-orange-500 px-3 py-2.5 text-sm font-bold text-white hover:bg-orange-600 disabled:opacity-50"><Download size={16} />CSV</button></div></header>

      <div className="flex gap-2 overflow-x-auto border-b border-slate-200">{ESTADOS.map((item) => { const Icon = item.icon; return <button key={item.id} type="button" onClick={() => { setReporte(item.id); setBusqueda(''); }} className={`inline-flex shrink-0 items-center gap-2 border-b-2 px-3 py-3 text-sm font-bold transition-colors ${reporte === item.id ? 'border-orange-500 text-orange-600' : 'border-transparent text-slate-500 hover:text-slate-800'}`}><Icon size={16} />{item.label}</button>; })}</div>

      <section className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
        {fechaControls && <><label className="text-xs font-bold text-slate-600">Desde<input type="date" value={desde} onChange={(event) => setDesde(event.target.value)} className="mt-1 block rounded-md border border-slate-300 px-2.5 py-2 text-sm font-normal" /></label><label className="text-xs font-bold text-slate-600">Hasta<input type="date" value={hasta} onChange={(event) => setHasta(event.target.value)} className="mt-1 block rounded-md border border-slate-300 px-2.5 py-2 text-sm font-normal" /></label></>}
        {reporte === 'stock' && <><label className="text-xs font-bold text-slate-600">Umbral de stock bajo<input type="number" min="0" value={umbralStock} onChange={(event) => setUmbralStock(event.target.value)} className="mt-1 block w-28 rounded-md border border-slate-300 px-2.5 py-2 text-sm font-normal" /></label><label className="flex items-center gap-2 rounded-md px-1 py-2 text-sm font-semibold text-slate-600"><input type="checkbox" checked={mostrarSoloBajo} onChange={(event) => setMostrarSoloBajo(event.target.checked)} className="accent-orange-500" />Solo stock bajo</label></>}
        <label className="relative min-w-[190px] flex-1"><Search size={15} className="absolute left-3 top-[30px] -translate-y-1/2 text-slate-400" /><input value={busqueda} onChange={(event) => setBusqueda(event.target.value)} placeholder="Buscar en este informe" className="mt-1 w-full rounded-md border border-slate-300 py-2 pl-9 pr-3 text-sm font-normal" /></label>
        <p className="ml-auto text-xs font-semibold text-slate-500">{usuarioVeTodas ? tituloSucursal : tituloSucursal || 'Sucursal asignada'}</p>
      </section>

      {error && <div role="alert" className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">{error}</div>}
      {reporte === 'iva' && <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800">El impuesto se suma desde las líneas existentes de ventas y compras. Revisá el resultado con tu configuración fiscal antes de usarlo para una declaración.</div>}

      {reporte === 'stock' && <><div className="grid gap-3 sm:grid-cols-3"><Tarjeta titulo="Productos" valor={filasStock.length.toLocaleString('es-PY')} /><Tarjeta titulo="Stock bajo" valor={filasStock.filter((fila) => fila.bajo).length.toLocaleString('es-PY')} nota={`Umbral configurado: ${Number(umbralStock) || 0}`} /><Tarjeta titulo="Valor del stock al costo" valor={moneda(suma(filasStock, 'valor_costo'))} nota={sucursalActiva ? `${filasStock.filter((fila) => fila.stock_reporte === null).length} productos sin desglose de stock por sucursal` : undefined} /></div><section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm"><Tabla columnas={[{ titulo: 'Código', campo: 'codigo' }, { titulo: 'Producto', campo: 'nombre' }, { titulo: 'Stock', derecha: true, render: (fila) => <span className={fila.bajo ? 'font-bold text-amber-700' : ''}>{fila.stock_reporte === null ? 'Sin desglose' : Number(fila.stock_reporte).toLocaleString('es-PY')}</span> }, { titulo: 'Costo unitario', derecha: true, render: (fila) => moneda(fila.precio_compra) }, { titulo: 'Precio de venta', derecha: true, render: (fila) => moneda(fila.precio_venta) }, { titulo: 'Estado', render: (fila) => fila.stock_reporte === null ? <span className="text-xs font-bold text-slate-500">Sin desglose</span> : fila.bajo ? <span className="rounded-full bg-amber-50 px-2 py-1 text-xs font-bold text-amber-700">Bajo</span> : <span className="text-xs font-bold text-emerald-700">Disponible</span> }]} filas={filasStock} vacio="No hay productos que coincidan con los filtros." /></section></>}

      {reporte === 'deudas' && <><div className="grid gap-3 sm:grid-cols-3"><Tarjeta titulo="Documentos pendientes" valor={filasDeuda.length.toLocaleString('es-PY')} /><Tarjeta titulo="Por cobrar" valor={moneda(suma(filasDeuda.filter((fila) => fila.tipo === 'Por cobrar'), 'saldo'))} /><Tarjeta titulo="Por pagar" valor={moneda(suma(filasDeuda.filter((fila) => fila.tipo === 'Por pagar'), 'saldo'))} /></div><section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm"><Tabla columnas={[{ titulo: 'Tipo', render: (fila) => <span className={fila.tipo === 'Por cobrar' ? 'font-bold text-emerald-700' : 'font-bold text-amber-700'}>{fila.tipo}</span> }, { titulo: 'Fecha', render: (fila) => fechaCorta(fila.fecha) }, { titulo: 'Referencia', campo: 'ref' }, { titulo: 'Cliente / proveedor', campo: 'tercero' }, { titulo: 'Total', derecha: true, render: (fila) => moneda(fila.total) }, { titulo: 'Saldo pendiente', derecha: true, render: (fila) => moneda(fila.saldo) }]} filas={filasDeuda} vacio="No hay saldos pendientes para este período." /></section></>}

      {reporte === 'gastos' && <><div className="grid gap-3 sm:grid-cols-3"><Tarjeta titulo="Comprobantes" valor={filasGastos.length.toLocaleString('es-PY')} /><Tarjeta titulo="Total egresos" valor={moneda(suma(filasGastos, 'monto_reporte'))} /><Tarjeta titulo="Categorías" valor={new Set(filasGastos.map((fila) => fila.categoria_reporte)).size.toLocaleString('es-PY')} /></div><section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm"><Tabla columnas={[{ titulo: 'Fecha', render: (fila) => fechaCorta(fila.fecha) }, { titulo: 'Descripción', campo: 'descripcion' }, { titulo: 'Categoría', campo: 'categoria_reporte' }, { titulo: 'Proveedor', campo: 'proveedor' }, { titulo: 'Método de pago', campo: 'metodo_pago' }, { titulo: 'Cuenta', campo: 'cuenta_pago' }, { titulo: 'Monto', derecha: true, render: (fila) => moneda(fila.monto_reporte) }]} filas={filasGastos} vacio="No hay egresos para este período." /></section></>}

      {reporte === 'iva' && <><div className="grid gap-3 sm:grid-cols-3"><Tarjeta titulo="Documentos" valor={filasIVA.length.toLocaleString('es-PY')} /><Tarjeta titulo="Impuesto registrado" valor={moneda(suma(filasIVA, 'impuesto'))} /><Tarjeta titulo="Total documentos" valor={moneda(suma(filasIVA, 'total'))} /></div><section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm"><Tabla columnas={[{ titulo: 'Tipo', campo: 'clase' }, { titulo: 'Fecha', render: (fila) => fechaCorta(fila.fecha) }, { titulo: 'Referencia', campo: 'ref' }, { titulo: 'Cliente / proveedor', campo: 'tercero' }, { titulo: 'Base estimada', derecha: true, render: (fila) => moneda(fila.base) }, { titulo: 'IVA en líneas', derecha: true, render: (fila) => moneda(fila.impuesto) }, { titulo: 'Total', derecha: true, render: (fila) => moneda(fila.total) }]} filas={filasIVA} vacio="No hay documentos con líneas impositivas para este período." /></section></>}

      {reporte === 'vencimientos' && <><div className="grid gap-3 sm:grid-cols-3"><Tarjeta titulo="Productos con vencimiento" valor={filasVencimientos.length.toLocaleString('es-PY')} /><Tarjeta titulo="Vencidos" valor={filasVencimientos.filter((fila) => fila.estado_vencimiento === 'Vencido').length.toLocaleString('es-PY')} nota="Revisá el stock y las reglas de venta." /><Tarjeta titulo="Vencen en 30 días" valor={filasVencimientos.filter((fila) => fila.estado_vencimiento === 'Próximo a vencer').length.toLocaleString('es-PY')} /></div><section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm"><Tabla columnas={[{ titulo: 'Código', campo: 'codigo' }, { titulo: 'Producto', campo: 'nombre' }, { titulo: 'Fecha de vencimiento', render: (fila) => fechaCorta(fila.fecha_vencimiento) }, { titulo: 'Días', derecha: true, render: (fila) => fila.dias_para_vencer < 0 ? `${Math.abs(fila.dias_para_vencer)} vencido(s)` : fila.dias_para_vencer }, { titulo: 'Stock', derecha: true, render: (fila) => fila.stock_vencimiento === null ? 'Sin desglose' : numero(fila.stock_vencimiento) }, { titulo: 'Estado', render: (fila) => <span className={`rounded-full px-2 py-1 text-xs font-bold ${fila.estado_vencimiento === 'Vencido' ? 'bg-red-50 text-red-700' : fila.estado_vencimiento === 'Próximo a vencer' ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700'}`}>{fila.estado_vencimiento}</span> }]} filas={filasVencimientos} vacio="No hay productos con fecha de vencimiento registrada." /></section></>}

      {reporte === 'ajustes' && <><div className="grid gap-3 sm:grid-cols-3"><Tarjeta titulo="Líneas ajustadas" valor={filasAjustes.length.toLocaleString('es-PY')} /><Tarjeta titulo="Aumentos" valor={filasAjustes.filter((fila) => fila.diferencia > 0).length.toLocaleString('es-PY')} /><Tarjeta titulo="Disminuciones" valor={filasAjustes.filter((fila) => fila.diferencia < 0).length.toLocaleString('es-PY')} /></div><section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm"><Tabla columnas={[{ titulo: 'Fecha', render: (fila) => fechaCorta(fila.fecha) }, { titulo: 'Sucursal', campo: 'ubicacion' }, { titulo: 'Motivo', campo: 'motivo' }, { titulo: 'Producto', campo: 'producto' }, { titulo: 'Stock anterior', derecha: true, render: (fila) => numero(fila.stock_anterior) }, { titulo: 'Stock contado', derecha: true, render: (fila) => numero(fila.stock_nuevo) }, { titulo: 'Diferencia', derecha: true, render: (fila) => <span className={fila.diferencia < 0 ? 'font-bold text-red-600' : fila.diferencia > 0 ? 'font-bold text-emerald-700' : ''}>{fila.diferencia > 0 ? '+' : ''}{numero(fila.diferencia)}</span> }]} filas={filasAjustes} vacio="No hay ajustes de stock en este período." /></section></>}

      {cargando && <div className="fixed inset-0 z-20 grid place-items-center bg-white/55 text-sm font-bold text-slate-600">Cargando informe…</div>}
    </div>
  );
}
