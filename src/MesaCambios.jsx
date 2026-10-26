import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, CalendarDays, Check, Clock3, Download, History, Info, Landmark, Save } from 'lucide-react';
import { supabase } from './supabaseClient';
import { useEmpresaInfo } from './utils/useEmpresa';
import { useConfiguracionEmpresa } from './utils/useConfiguracionEmpresa';

const ZONA = 'America/Asuncion';
const FORMATO_GS = new Intl.NumberFormat('es-PY', { maximumFractionDigits: 0 });
const FORMATO_DIVISA = new Intl.NumberFormat('es-PY', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const MONEDAS = { USD: { nombre: 'dólares', simbolo: '$' }, BRL: { nombre: 'reales', simbolo: 'R$' }, EUR: { nombre: 'euros', simbolo: '€' } };
const FECHA_HOY = () => new Intl.DateTimeFormat('en-CA', { timeZone: ZONA, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const FECHA_MANANA = (fecha) => { const valor = new Date(`${fecha}T12:00:00Z`); valor.setUTCDate(valor.getUTCDate() + 1); return valor.toISOString().slice(0, 10); };
const FORMATO_FECHA = (fecha) => new Intl.DateTimeFormat('es-PY', { timeZone: ZONA, day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(`${fecha}T12:00:00`));
const HORA = (valor) => valor ? new Intl.DateTimeFormat('es-PY', { timeZone: ZONA, hour: '2-digit', minute: '2-digit' }).format(new Date(valor)) : '—';
const VACIAR_TASAS = (codigos) => Object.fromEntries(codigos.map((codigo) => [codigo, { venta: '', compra: '' }]));
const formatearSaldo = (codigo, valor) => codigo === 'PYG'
  ? `${FORMATO_GS.format(Number(valor) || 0)} Gs`
  : `${MONEDAS[codigo]?.simbolo || codigo} ${FORMATO_DIVISA.format(Number(valor) || 0)}`;

export default function MesaCambios() {
  const { id: empresaId, nombre: nombreEmpresa } = useEmpresaInfo();
  const { ajustes } = useConfiguracionEmpresa(empresaId);
  const monedas = useMemo(() => {
    const configuradas = ajustes.enable_multicurrency === true && Array.isArray(ajustes.multicurrency_ids) ? ajustes.multicurrency_ids : [];
    const base = ajustes.currency && ajustes.currency !== 'PYG' ? [ajustes.currency] : [];
    return [...new Set([...configuradas, ...base])].filter((codigo) => MONEDAS[codigo]);
  }, [ajustes.currency, ajustes.enable_multicurrency, ajustes.multicurrency_ids]);
  const [tasas, setTasas] = useState(() => VACIAR_TASAS([]));
  const [historial, setHistorial] = useState([]);
  const [cajas, setCajas] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');
  const [mensaje, setMensaje] = useState('');
  const hoy = FECHA_HOY();
  const monedasCaja = [...new Set([...monedas.filter((codigo) => codigo === 'USD'), 'PYG', ...monedas.filter((codigo) => codigo !== 'USD')])];
  const tasasDeHoy = historial.find((fila) => fila.fecha === hoy)?.tasas || {};

  const cargarDatos = useCallback(async () => {
    if (!empresaId) return;
    setCargando(true);
    setError('');
    const [resTasas, resCajas] = await Promise.all([
      supabase.from('cotizaciones_cambio_diarias').select('id,fecha,tasas,fijado_por,creado_en,actualizado_en').eq('empresa_id', empresaId).order('fecha', { ascending: false }).limit(90),
      supabase.from('caja_registros').select('*').eq('empresa_id', empresaId).gte('fecha_apertura', `${hoy}T00:00:00-03:00`).lt('fecha_apertura', `${FECHA_MANANA(hoy)}T00:00:00-03:00`).order('fecha_apertura', { ascending: false }).limit(30),
    ]);
    if (resTasas.error) {
      setError(resTasas.error.code === '42P01' || resTasas.error.message?.includes('cotizaciones_cambio_diarias')
        ? 'Falta aplicar database/migration_mesa_cambios.sql en el Supabase conectado.'
        : `No se pudieron cargar las cotizaciones: ${resTasas.error.message}`);
    } else {
      const filas = resTasas.data || [];
      setHistorial(filas);
      const actual = filas.find((fila) => fila.fecha === hoy);
      if (actual?.tasas) setTasas((anteriores) => ({ ...VACIAR_TASAS(monedas), ...actual.tasas, ...Object.fromEntries(monedas.map((codigo) => [codigo, { ...VACIAR_TASAS([codigo])[codigo], ...actual.tasas[codigo] }])) }));
    }
    if (resCajas.error) {
      console.warn('No se pudieron cargar las cajas del día:', resCajas.error.message);
      setCajas([]);
    } else {
      const cajasDelDia = resCajas.data || [];
      const idsCajas = cajasDelDia.map((caja) => caja.id);
      let ventas = [];
      let gastos = [];
      let movimientosCajaDisponibles = true;
      if (idsCajas.length) {
        const [resVentas, resGastos] = await Promise.all([
          supabase.from('ventas').select('caja_id,total,metodo_pago').eq('empresa_id', empresaId).in('caja_id', idsCajas),
          supabase.from('gastos').select('caja_id,monto,metodo_pago').eq('empresa_id', empresaId).in('caja_id', idsCajas),
        ]);
        if (resVentas.error) { movimientosCajaDisponibles = false; console.warn('No se pudieron calcular las ventas de caja:', resVentas.error.message); }
        else ventas = resVentas.data || [];
        if (resGastos.error) { movimientosCajaDisponibles = false; console.warn('No se pudieron calcular los gastos de caja:', resGastos.error.message); }
        else gastos = resGastos.data || [];
      }
      setCajas(cajasDelDia.map((caja) => {
        const ventasEfectivo = ventas.filter((venta) => String(venta.caja_id) === String(caja.id) && String(venta.metodo_pago || '').toLocaleLowerCase('es').includes('efectivo')).reduce((suma, venta) => suma + Number(venta.total || 0), 0);
        const gastosEfectivo = gastos.filter((gasto) => String(gasto.caja_id) === String(caja.id) && (!gasto.metodo_pago || String(gasto.metodo_pago).toLocaleLowerCase('es').includes('efectivo'))).reduce((suma, gasto) => suma + Number(gasto.monto || 0), 0);
        const saldoEsperado = Number(caja.saldo_inicial || 0) + ventasEfectivo - gastosEfectivo;
        const conteoFinal = caja.conteo_real ?? caja.saldo_final;
        return { ...caja, diferenciaGs: movimientosCajaDisponibles && caja.estado !== 'Abierta' && conteoFinal != null ? Number(conteoFinal || 0) - saldoEsperado : null };
      }));
    }
    setCargando(false);
  }, [empresaId, hoy, monedas]);

  useEffect(() => { cargarDatos(); }, [cargarDatos]);

  const cambiarTasa = (codigo, lado, valor) => {
    setTasas((actuales) => ({ ...actuales, [codigo]: { ...(actuales[codigo] || { venta: '', compra: '' }), [lado]: valor } }));
    setMensaje('');
  };

  const fijarTasas = async (event) => {
    event.preventDefault();
    if (!empresaId) return;
    if (monedas.length === 0) {
      setError('No hay monedas activas. Activa la multidivisa y selecciona las monedas extra en Configuración de Empresa.');
      return;
    }
    const limpias = {};
    for (const codigo of monedas) {
      const venta = Number(tasas[codigo]?.venta);
      const compra = Number(tasas[codigo]?.compra);
      if (!Number.isFinite(venta) || venta <= 0 || !Number.isFinite(compra) || compra <= 0) {
        setError(`Ingresá tasas de compra y venta mayores a cero para ${codigo}.`);
        return;
      }
      if (compra > venta) { setError(`La tasa de compra de ${codigo} no puede superar la tasa de venta.`); return; }
      limpias[codigo] = { venta, compra };
    }
    setGuardando(true); setError(''); setMensaje('');
    const usuario = (await supabase.auth.getUser()).data?.user?.email || null;
    const { error: errorGuardar } = await supabase.from('cotizaciones_cambio_diarias').upsert({ empresa_id: empresaId, fecha: hoy, tasas: limpias, fijado_por: usuario, actualizado_en: new Date().toISOString() }, { onConflict: 'empresa_id,fecha' });
    if (errorGuardar) setError(`No se pudieron fijar las tasas: ${errorGuardar.message}`);
    else { setTasas(limpias); setMensaje(`Cotizaciones fijadas para el ${FORMATO_FECHA(hoy)}.`); await cargarDatos(); }
    setGuardando(false);
  };

  const descargarCsv = () => {
    const encabezado = ['Fecha', ...monedas.flatMap((codigo) => [`${codigo} venta`, `${codigo} compra`]), 'Fijado por'];
    const filas = historial.map((fila) => [fila.fecha, ...monedas.flatMap((codigo) => [fila.tasas?.[codigo]?.venta ?? '', fila.tasas?.[codigo]?.compra ?? '']), fila.fijado_por || '']);
    const csv = [encabezado, ...filas].map((fila) => fila.map((valor) => `"${String(valor).replaceAll('"', '""')}"`).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob(['\uFEFF', csv], { type: 'text/csv;charset=utf-8' }));
    const enlace = document.createElement('a'); enlace.href = url; enlace.download = `cotizaciones-${hoy}.csv`; enlace.click(); URL.revokeObjectURL(url);
  };

  return <main className="space-y-5 pb-8">
    <header className="flex flex-wrap items-end justify-between gap-3"><div><h1 className="text-2xl font-bold text-slate-900">Mesa de Cambios</h1><p className="mt-1 text-sm text-slate-500">Cotizaciones del día {FORMATO_FECHA(hoy)} · {nombreEmpresa || 'Tu empresa'}</p></div><span className="rounded-full bg-blue-50 px-3 py-1.5 text-xs font-bold text-blue-700"><CalendarDays size={14} className="mr-1 inline" />{FORMATO_FECHA(hoy)}</span></header>
    {error && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-800">{error}</div>}
    {mensaje && <div role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800">{mensaje}</div>}
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1.8fr)_minmax(300px,.9fr)]">
      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-slate-50/80 px-5 py-4"><h2 className="font-bold text-slate-800"><CalendarDays size={17} className="mr-2 inline text-slate-500" />Tasas de Hoy</h2><div className="flex gap-2"><span className="rounded-full bg-emerald-100 px-2.5 py-1 text-[11px] font-bold text-emerald-700">{historial.some((fila) => fila.fecha === hoy) ? <><Check size={12} className="mr-1 inline" />Fijada {HORA(historial.find((fila) => fila.fecha === hoy)?.actualizado_en)}</> : 'Pendiente de fijar'}</span><span className="rounded-full bg-slate-200 px-2.5 py-1 text-[11px] font-bold text-slate-600">{cargando ? 'Cargando…' : `${monedas.length} monedas`}</span></div></div>
        <form onSubmit={fijarTasas} className="space-y-4 p-5">
          {monedas.length > 0 ? <div className="overflow-x-auto rounded-lg border border-slate-200"><table className="w-full min-w-[620px] text-left text-sm"><thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500"><tr><th className="w-[20%] p-3 align-bottom">Moneda</th><th className="w-[40%] p-3"><span className="font-black text-rose-500"><ArrowDown size={14} className="mr-1 inline" />Venta</span><p className="mt-1 text-[10px] font-normal normal-case leading-4">Lo que te cuesta la divisa cuando pagás con ella (1 divisa = ? Gs)</p></th><th className="w-[40%] p-3"><span className="font-black text-emerald-600"><ArrowUp size={14} className="mr-1 inline" />Compra</span><p className="mt-1 text-[10px] font-normal normal-case leading-4">La tasa que aplicás cuando recibís la divisa (1 divisa = ? Gs)</p></th></tr></thead><tbody className="divide-y divide-slate-100">{monedas.map((codigo) => <tr key={codigo}><td className="p-3"><strong className="text-slate-900">{MONEDAS[codigo].simbolo} {codigo}</strong><span className="ml-1 text-xs text-slate-500">{MONEDAS[codigo].nombre}</span></td>{['venta', 'compra'].map((lado) => <td key={lado} className="p-3"><label className="flex h-11 items-center overflow-hidden rounded-md border border-slate-300 focus-within:border-orange-500 focus-within:ring-2 focus-within:ring-orange-100"><span className="border-r bg-slate-50 px-3 py-3 text-xs font-semibold text-slate-500">Gs</span><input aria-label={`${codigo} ${lado}`} required min="1" step="1" type="number" value={tasas[codigo]?.[lado] || ''} onChange={(event) => cambiarTasa(codigo, lado, event.target.value)} className="w-full min-w-0 px-3 py-2 font-semibold text-slate-800 outline-none" placeholder="0" /></label></td>)}</tr>)}</tbody></table></div> : <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-5 text-sm text-amber-900">No hay monedas activas para cotizar. Ve a <strong>Configuración de Empresa → Datos de empresa</strong>, activa multidivisa y selecciona las monedas que vas a usar.</div>}
          <p className="flex items-start gap-2 text-xs leading-5 text-slate-500"><Info size={15} className="mt-0.5 shrink-0 text-slate-400" />Compra es la tasa a la que recibís una divisa; venta es el valor para conseguirla. La fijación guarda un historial diario por empresa.</p>
          <div className="text-center"><button disabled={guardando || cargando || monedas.length === 0} className="inline-flex items-center gap-2 rounded-lg bg-orange-500 px-5 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-orange-600 disabled:cursor-wait disabled:opacity-60"><Save size={16} />{guardando ? 'Guardando…' : 'Fijar Tasas del Día'}</button></div>
        </form>
      </section>
      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b bg-slate-50/80 px-5 py-4"><h2 className="font-bold text-slate-800"><Landmark size={17} className="mr-2 inline text-slate-500" />Cajas del Día</h2><span className="rounded-full bg-blue-600 px-2.5 py-0.5 text-xs font-bold text-white">{cajas.length}</span></div>
        <div className="space-y-3 p-4">{cajas.length ? cajas.map((caja) => {
          const tasasDisponibles = monedas.filter((codigo) => Number(tasasDeHoy[codigo]?.compra) > 0);
          const apertura = monedasCaja.map((codigo) => {
            if (codigo === 'PYG') return formatearSaldo(codigo, caja.saldo_inicial);
            const saldo = caja.saldos_iniciales?.[codigo] ?? caja.apertura_por_moneda?.[codigo] ?? caja[`saldo_inicial_${codigo.toLowerCase()}`];
            return `${saldo == null ? '—' : formatearSaldo(codigo, saldo)} ${codigo}`;
          }).join(' | ');
          const diferencia = monedasCaja.map((codigo) => {
            if (codigo === 'PYG') return caja.diferenciaGs == null ? '—' : formatearSaldo(codigo, caja.diferenciaGs);
            const valor = caja.diferencias_moneda?.[codigo] ?? caja.rendicion_final?.diferencias_moneda?.[codigo] ?? caja[`diferencia_${codigo.toLowerCase()}`];
            return `${valor == null ? '—' : formatearSaldo(codigo, valor)} ${codigo}`;
          }).join(' | ');
          return <article key={caja.id} className="rounded-lg border-l-4 border-emerald-500 bg-slate-50 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2"><strong className="text-sm text-slate-800">{caja.usuario || nombreEmpresa || 'Caja'}</strong><span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${caja.estado === 'Abierta' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-600'}`}>{caja.estado || '—'}</span></div>
            <p className="mt-1 text-xs text-slate-500"><Clock3 size={12} className="mr-1 inline" />{caja.estado === 'Abierta' ? `Abierta ${HORA(caja.fecha_apertura)}` : `Cerrada ${HORA(caja.fecha_apertura)}${caja.fecha_cierre ? ` - ${HORA(caja.fecha_cierre)}` : ''}`}</p>
            {tasasDisponibles.length > 0 && <div className="mt-2 flex flex-wrap gap-1.5">{tasasDisponibles.map((codigo) => <span key={codigo} className="rounded bg-emerald-100 px-2 py-1 text-[11px] font-bold text-emerald-800">{codigo}: {FORMATO_GS.format(Number(tasasDeHoy[codigo].compra))} Gs</span>)}</div>}
            <p className="mt-2 text-xs font-semibold text-slate-700">{caja.estado === 'Abierta' ? 'Apertura:' : 'Dif:'} <span className="font-normal">{caja.estado === 'Abierta' ? apertura : diferencia}</span></p>
          </article>;
        }) : <div className="py-8 text-center text-sm text-slate-500">{cargando ? 'Cargando cajas…' : 'Todavía no hay cajas registradas hoy.'}</div>}</div>
        {monedas.length > 0 && <p className="border-t px-4 py-3 text-[11px] leading-4 text-slate-500">La apertura y el arqueo de caja de PyPOS se guardan en Gs. Para monedas extranjeras se muestra “—” cuando la caja no tiene importes registrados en esa moneda.</p>}
      </section>
    </div>
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm"><div className="flex flex-wrap items-center justify-between gap-3 border-b bg-slate-50/80 px-5 py-4"><h2 className="font-bold text-slate-800"><History size={17} className="mr-2 inline text-slate-500" />Historial de Cotizaciones</h2><button type="button" onClick={descargarCsv} disabled={!historial.length} className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50"><Download size={14} />Descargar CSV</button></div><div className="overflow-x-auto"><table className="w-full min-w-[640px] text-left text-sm"><thead className="border-b bg-white text-[10px] font-bold uppercase tracking-wide text-slate-500"><tr><th rowSpan="2" className="p-3">Fecha</th>{monedas.map((codigo) => <th key={codigo} colSpan="2" className="border-l p-3 text-center">{MONEDAS[codigo].simbolo} {codigo}</th>)}</tr><tr>{monedas.flatMap((codigo) => [<th key={`${codigo}-venta`} className="border-l px-3 pb-3 text-right text-rose-600">↓ Venta</th>, <th key={`${codigo}-compra`} className="px-3 pb-3 text-right text-emerald-600">↑ Compra</th>])}</tr></thead><tbody className="divide-y divide-slate-100">{cargando ? <tr><td colSpan={1 + monedas.length * 2} className="p-8 text-center text-slate-500">Cargando historial…</td></tr> : historial.length ? historial.map((fila) => <tr key={fila.id} className={fila.fecha === hoy ? 'bg-amber-50/70' : 'hover:bg-slate-50'}><td className="p-3"><span className="font-semibold text-slate-800">{fila.fecha === hoy && <span className="mr-2 rounded-full bg-blue-600 px-2 py-0.5 text-[9px] font-black text-white">HOY</span>}{FORMATO_FECHA(fila.fecha)}</span><p className="mt-1 text-[10px] text-slate-500">{HORA(fila.actualizado_en)} · {fila.fijado_por || '—'}</p></td>{monedas.flatMap((codigo) => [<td key={`${fila.id}-${codigo}-v`} className="border-l p-3 text-right font-semibold">{fila.tasas?.[codigo]?.venta ? FORMATO_GS.format(fila.tasas[codigo].venta) : '—'}</td>, <td key={`${fila.id}-${codigo}-c`} className="p-3 text-right font-semibold">{fila.tasas?.[codigo]?.compra ? FORMATO_GS.format(fila.tasas[codigo].compra) : '—'}</td>])}</tr>) : <tr><td colSpan={1 + monedas.length * 2} className="p-8 text-center text-slate-500">Todavía no hay cotizaciones fijadas.</td></tr>}</tbody></table></div><div className="flex items-center justify-between border-t px-4 py-3 text-xs text-slate-500"><span>Mostrando {historial.length} de {historial.length} cotizaciones</span><span className="inline-flex items-center gap-1"><Clock3 size={13} />Historial de los últimos 90 días</span></div></section>
  </main>;
}
