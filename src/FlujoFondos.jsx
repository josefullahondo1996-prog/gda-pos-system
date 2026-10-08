import { useCallback, useEffect, useMemo, useState } from 'react';
import { Download, RefreshCw } from 'lucide-react';
import { supabase } from './supabaseClient';
import { useEmpresaInfo } from './utils/useEmpresa';
import { useSucursalActiva } from './utils/SucursalContext';

const hoyLocal = () => {
  const fecha = new Date();
  return `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}-${String(fecha.getDate()).padStart(2, '0')}`;
};
const inicioMes = () => `${hoyLocal().slice(0, 7)}-01`;
const moneda = (valor) => `Gs ${Math.round(Number(valor) || 0).toLocaleString('es-PY')}`;
const fechaTexto = (valor) => valor ? new Date(valor).toLocaleDateString('es-PY') : '—';

async function leerPorFecha(tabla, empresaId, columna, desde, hasta) {
  const filas = [];
  const diaSiguiente = new Date(`${hasta}T00:00:00`);
  diaSiguiente.setDate(diaSiguiente.getDate() + 1);
  const limiteExclusivo = `${diaSiguiente.getFullYear()}-${String(diaSiguiente.getMonth() + 1).padStart(2, '0')}-${String(diaSiguiente.getDate()).padStart(2, '0')}`;
  for (let inicio = 0; inicio < 20000; inicio += 1000) {
    let query = supabase.from(tabla).select('*').eq('empresa_id', empresaId)
      .gte(columna, desde).lt(columna, limiteExclusivo).order(columna, { ascending: false }).range(inicio, inicio + 999);
    const { data, error } = await query;
    if (error) throw error;
    filas.push(...(data || []));
    if (!data || data.length < 1000) break;
  }
  return filas;
}

async function leerTodos(tabla, empresaId) {
  const filas = [];
  for (let inicio = 0; inicio < 20000; inicio += 1000) {
    const { data, error } = await supabase.from(tabla).select('*').eq('empresa_id', empresaId).range(inicio, inicio + 999);
    if (error) throw error;
    filas.push(...(data || []));
    if (!data || data.length < 1000) break;
  }
  return filas;
}

function descargarCSV(filas) {
  const escapar = (valor) => `"${String(valor ?? '').replaceAll('"', '""')}"`;
  const columnas = ['Fecha', 'Tipo', 'Concepto', 'Referencia', 'Método', 'Importe Gs'];
  const contenido = `\uFEFF${[columnas, ...filas.map((fila) => [fechaTexto(fila.fecha), fila.tipo, fila.concepto, fila.referencia, fila.metodo, Math.round(fila.monto)])].map((fila) => fila.map(escapar).join(',')).join('\r\n')}`;
  const url = URL.createObjectURL(new Blob([contenido], { type: 'text/csv;charset=utf-8' }));
  const enlace = document.createElement('a');
  enlace.href = url; enlace.download = `flujo-fondos-${hoyLocal()}.csv`; enlace.click();
  URL.revokeObjectURL(url);
}

export default function FlujoFondos() {
  const { id: empresaId } = useEmpresaInfo();
  const { sucursalActiva } = useSucursalActiva();
  const [desde, setDesde] = useState(inicioMes);
  const [hasta, setHasta] = useState(hoyLocal);
  const [movimientos, setMovimientos] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [avisos, setAvisos] = useState([]);

  const cargar = useCallback(async () => {
    if (!empresaId) return;
    if (desde > hasta) { setError('La fecha desde no puede ser posterior a la fecha hasta.'); return; }
    setCargando(true); setError(''); setAvisos([]);
    const resultados = await Promise.allSettled([
      leerPorFecha('ventas', empresaId, 'fecha', desde, hasta),
      leerPorFecha('gastos', empresaId, 'fecha', desde, hasta),
      leerPorFecha('compras', empresaId, 'fecha', desde, hasta),
      leerTodos('pagos_compras', empresaId),
      leerPorFecha('pagos_clientes', empresaId, 'fecha', desde, hasta),
      leerPorFecha('pagos_devoluciones_ventas', empresaId, 'pagado_en', desde, hasta),
    ]);
    const [ventasR, gastosR, comprasR, pagosComprasR, cobrosR, reembolsosR] = resultados;
    const fallos = resultados.map((r, i) => r.status === 'rejected' ? ['ventas', 'gastos', 'compras/pagos', 'pagos a proveedores', 'cobros de clientes', 'reembolsos de ventas'][i] : null).filter(Boolean);
    if (ventasR.status === 'rejected' || gastosR.status === 'rejected') {
      setError(`No se pudieron leer ventas o gastos: ${[ventasR, gastosR].filter((r) => r.status === 'rejected').map((r) => r.reason?.message || 'error de base de datos').join(' · ')}`);
      setMovimientos([]); setCargando(false); return;
    }
    const ventas = ventasR.value;
    const gastos = gastosR.value;
    const compras = comprasR.status === 'fulfilled' ? comprasR.value : [];
    const pagosCompras = pagosComprasR.status === 'fulfilled' ? pagosComprasR.value : [];
    const cobrosClientes = cobrosR.status === 'fulfilled' ? cobrosR.value : [];
    const reembolsosVentas = reembolsosR.status === 'fulfilled' ? reembolsosR.value : [];
    const esSucursal = (fila) => !sucursalActiva || !fila.ubicacion_id || String(fila.ubicacion_id) === String(sucursalActiva);
    const pagosCompraPorId = new Map();
    pagosCompras.forEach((pago) => pagosCompraPorId.set(String(pago.compra_id), (pagosCompraPorId.get(String(pago.compra_id)) || 0) + Number(pago.monto || 0)));
    const filas = [];
    ventas.filter(esSucursal).forEach((venta) => {
      if (String(venta.estado_pago || '').toLowerCase() === 'cotizacion') return;
      const monto = Number(venta.monto_pagado ?? (String(venta.estado_pago || '').toLowerCase() === 'pagado' ? venta.total : 0)) || 0;
      if (monto > 0) filas.push({ id: `venta-${venta.id}`, fecha: venta.fecha, tipo: 'Entrada', concepto: 'Venta', referencia: venta.numero_factura || venta.id, metodo: venta.metodo_pago || 'No especificado', monto });
    });
    gastos.filter(esSucursal).forEach((gasto) => {
      const monto = Number(gasto.monto || 0);
      if (monto > 0) filas.push({ id: `gasto-${gasto.id}`, fecha: gasto.fecha || gasto.creado_en, tipo: 'Salida', concepto: gasto.descripcion || gasto.categoria || 'Gasto', referencia: gasto.nro_referencia || gasto.id, metodo: gasto.metodo_pago || gasto.cuenta_pago || 'No especificado', monto });
    });
    compras.filter(esSucursal).forEach((compra) => {
      const pagadoRegistrado = Math.max(0, Number(compra.total || 0) - Number(compra.saldo_pendiente || 0));
      const pagoInicialEstimado = Math.max(0, pagadoRegistrado - (pagosCompraPorId.get(String(compra.id)) || 0));
      if (pagoInicialEstimado > 0) filas.push({ id: `compra-${compra.id}`, fecha: compra.fecha, tipo: 'Salida', concepto: 'Pago inicial de compra', referencia: compra.nro_factura || compra.id, metodo: 'Método no guardado', monto: pagoInicialEstimado });
    });
    pagosCompras.filter((pago) => String(pago.fecha || '').slice(0, 10) >= desde && String(pago.fecha || '').slice(0, 10) <= hasta).forEach((pago) => {
      const compra = compras.find((fila) => String(fila.id) === String(pago.compra_id));
      if (!sucursalActiva || !compra || esSucursal(compra)) {
        const monto = Number(pago.monto || 0);
        if (monto > 0) filas.push({ id: `pago-compra-${pago.id}`, fecha: pago.fecha, tipo: 'Salida', concepto: 'Pago a proveedor', referencia: pago.nota || pago.compra_id, metodo: pago.metodo_pago || pago.cuenta_pago || 'No especificado', monto });
      }
    });
    cobrosClientes.forEach((pago) => {
      const monto = Number(pago.monto ?? pago.cantidad ?? 0) || 0;
      if (monto > 0) filas.push({ id: `cobro-${pago.id}`, fecha: pago.fecha, tipo: 'Entrada', concepto: 'Cobro de saldo de cliente', referencia: pago.numero_referencia || pago.factura_no || pago.venta_id || pago.id, metodo: pago.metodo_pago || pago.cuenta_pago || 'No especificado', monto });
    });
    reembolsosVentas.forEach((pago) => {
      const monto = Number(pago.monto || 0);
      if (monto > 0) filas.push({ id: `reembolso-venta-${pago.id}`, fecha: pago.pagado_en, tipo: 'Salida', concepto: 'Reembolso de devolución de venta', referencia: `DV-${pago.devolucion_id}`, metodo: pago.metodo_pago || 'No especificado', monto });
    });
    filas.sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
    setMovimientos(filas);
    setAvisos(fallos.length ? [`No se pudieron leer: ${fallos.join(', ')}. El informe muestra las fuentes disponibles.`] : []);
    setCargando(false);
  }, [empresaId, desde, hasta, sucursalActiva]);

  useEffect(() => { cargar(); }, [cargar]);

  const totales = useMemo(() => movimientos.reduce((r, fila) => {
    r[fila.tipo === 'Entrada' ? 'entradas' : 'salidas'] += fila.monto;
    return r;
  }, { entradas: 0, salidas: 0 }), [movimientos]);
  const saldoNeto = totales.entradas - totales.salidas;

  return <main className="mx-auto w-full max-w-7xl space-y-5 p-4 md:p-6">
    <header className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="text-2xl font-bold text-slate-900">Flujo de fondos</h1><p className="mt-1 text-sm text-slate-500">Movimientos de cobros y pagos registrados para la empresa.</p></div><div className="flex gap-2"><button onClick={() => descargarCSV(movimientos)} disabled={!movimientos.length} className="inline-flex items-center gap-2 rounded-lg border bg-white px-3 py-2 text-sm font-semibold disabled:opacity-50"><Download size={16} /> Exportar CSV</button><button onClick={cargar} className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white"><RefreshCw size={16} /> Actualizar</button></div></header>
    <section className="flex flex-wrap items-end gap-3 rounded-xl border bg-white p-4"><label className="text-sm font-medium">Desde<input type="date" value={desde} max={hasta} onChange={(e) => setDesde(e.target.value)} className="mt-1 block rounded-lg border px-3 py-2" /></label><label className="text-sm font-medium">Hasta<input type="date" value={hasta} min={desde} max={hoyLocal()} onChange={(e) => setHasta(e.target.value)} className="mt-1 block rounded-lg border px-3 py-2" /></label></section>
    {error && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
    {avisos.map((aviso) => <div key={aviso} className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">{aviso}</div>)}
    <section className="grid gap-3 sm:grid-cols-3"><article className="rounded-xl border bg-white p-4"><p className="text-sm text-slate-500">Entradas registradas</p><p className="mt-2 text-xl font-bold text-emerald-700">{moneda(totales.entradas)}</p></article><article className="rounded-xl border bg-white p-4"><p className="text-sm text-slate-500">Salidas registradas</p><p className="mt-2 text-xl font-bold text-red-700">{moneda(totales.salidas)}</p></article><article className="rounded-xl border bg-white p-4"><p className="text-sm text-slate-500">Neto del período</p><p className={`mt-2 text-xl font-bold ${saldoNeto < 0 ? 'text-red-700' : 'text-slate-900'}`}>{moneda(saldoNeto)}</p></article></section>
    <section className="overflow-hidden rounded-xl border bg-white"><div className="flex items-center justify-between border-b px-4 py-3"><h2 className="font-semibold">Movimientos</h2><span className="text-xs text-slate-500">{movimientos.length.toLocaleString('es-PY')} registros</span></div><div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-sm"><thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="p-3">Fecha</th><th className="p-3">Tipo</th><th className="p-3">Concepto</th><th className="p-3">Referencia</th><th className="p-3">Método / cuenta</th><th className="p-3 text-right">Importe</th></tr></thead><tbody className="divide-y">{cargando ? <tr><td colSpan="6" className="p-8 text-center text-slate-500">Cargando movimientos…</td></tr> : movimientos.length ? movimientos.map((fila) => <tr key={fila.id} className="hover:bg-slate-50"><td className="whitespace-nowrap p-3">{fechaTexto(fila.fecha)}</td><td className={`p-3 font-semibold ${fila.tipo === 'Entrada' ? 'text-emerald-700' : 'text-red-700'}`}>{fila.tipo}</td><td className="p-3">{fila.concepto}</td><td className="p-3">{fila.referencia}</td><td className="p-3">{fila.metodo}</td><td className="whitespace-nowrap p-3 text-right font-semibold">{moneda(fila.monto)}</td></tr>) : <tr><td colSpan="6" className="p-10 text-center text-slate-500">No hay movimientos en este período.</td></tr>}</tbody></table></div></section>
    <p className="text-xs leading-relaxed text-slate-500">El neto incluye pagos de ventas y clientes, gastos, pagos a proveedores y reembolsos registrados. Los pagos iniciales de compras se estiman a partir del total y saldo vigente; el sistema todavía no conserva su fecha y cuenta de pago por separado.</p>
  </main>;
}
