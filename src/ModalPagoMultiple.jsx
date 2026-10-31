import { useEffect, useMemo, useState } from 'react';

const MONEDAS = {
    PYG: { etiqueta: 'Gs (Guarani)', simbolo: 'Gs', bandera: '🇵🇾', decimales: 0 },
    USD: { etiqueta: '$ USD', simbolo: 'USD', bandera: '🇺🇸', decimales: 2 },
    EUR: { etiqueta: '€ EUR', simbolo: 'EUR', bandera: '🇪🇺', decimales: 2 },
    BRL: { etiqueta: 'R$ BRL', simbolo: 'R$', bandera: '🇧🇷', decimales: 2 },
};

const redondear = (valor, decimales = 0) => {
    const factor = 10 ** decimales;
    return Math.round((Number(valor) + Number.EPSILON) * factor) / factor;
};

const formatMoney = (valor, moneda = 'PYG') => {
    const codigo = MONEDAS[moneda] ? moneda : 'PYG';
    const cantidad = Number(valor || 0).toLocaleString('es-PY', {
        minimumFractionDigits: MONEDAS[codigo].decimales,
        maximumFractionDigits: MONEDAS[codigo].decimales,
    });
    return codigo === 'PYG' ? `${cantidad} Gs` : `${MONEDAS[codigo].simbolo} ${cantidad}`;
};

const monedaCuenta = (cuenta) => {
    const texto = String(cuenta?.moneda || '').toLocaleLowerCase('es');
    if (texto.includes('usd') || texto.includes('dólar') || texto.includes('dolar')) return 'USD';
    if (texto.includes('eur') || texto.includes('euro')) return 'EUR';
    if (texto.includes('brl') || texto.includes('real')) return 'BRL';
    return 'PYG';
};

const METODOS_PAGO = [
    { value: 'Efectivo', label: '💵 Efectivo' },
    { value: 'Tarjeta', label: '💳 Tarjeta' },
    { value: 'Transferencia', label: '🏦 Transferencia' },
];
const METODOS_VUELTO = ['Efectivo', 'Tarjeta', 'Cheque', 'Transferencia bancaria', 'Otro', ...Array.from({ length: 7 }, (_, index) => `Pago personalizado ${index + 1}`), 'Saldo a favor (NC)'];

// Cada fila guarda tanto el importe entregado como su equivalente contable en Gs.
// La venta sigue pasando por el flujo transaccional existente de PuntoDeVenta.
export default function ModalPagoMultiple({
    abierto,
    onCerrar,
    totalArticulos,
    totalAPagar,
    totalAPagarGs,
    cuentasCaja = [],
    ajustesEmpresa = {},
    moneda = 'PYG',
    tasaFactura = 1,
    tasasCambio = {},
    monedasDisponibles = ['PYG'],
    onFinalizar,
}) {
    const [filas, setFilas] = useState([]);
    const [cantidad, setCantidad] = useState('');
    const [monedaPago, setMonedaPago] = useState('PYG');
    const [metodo, setMetodo] = useState('Efectivo');
    const [cuentaId, setCuentaId] = useState('');
    const [nota, setNota] = useState('');
    const [guardando, setGuardando] = useState(false);
    const [acumuladoDenominaciones, setAcumuladoDenominaciones] = useState(0);
    const [sinVuelto, setSinVuelto] = useState(false);
    const [metodoVuelto, setMetodoVuelto] = useState('Efectivo');
    const [cuentaVueltoId, setCuentaVueltoId] = useState('');

    const metodosPago = [
        ...METODOS_PAGO,
        ...Array.from({ length: 7 }, (_, index) => {
            const numero = index + 1;
            const etiqueta = String(ajustesEmpresa[`label_payment_${numero}`] || '').trim();
            return { value: `Pago personalizado ${numero}`, label: etiqueta || `Pago personalizado ${numero}` };
        }),
    ];

    const codigosPago = useMemo(() => [...new Set(['PYG', ...monedasDisponibles])].filter((codigo) => MONEDAS[codigo]), [monedasDisponibles]);
    const tasaParaMoneda = (codigo) => {
        if (codigo === 'PYG') return 1;
        if (codigo === moneda && Number.isFinite(Number(tasaFactura)) && Number(tasaFactura) > 0) return Number(tasaFactura);
        const tasaDelDia = Number(tasasCambio?.[codigo]?.compra);
        if (Number.isFinite(tasaDelDia) && tasaDelDia > 0) return tasaDelDia;
        return null;
    };
    const cuentasDisponibles = useMemo(
        () => cuentasCaja.filter((cuenta) => monedaCuenta(cuenta) === monedaPago),
        [cuentasCaja, monedaPago]
    );
    const cuentasGuarani = useMemo(() => cuentasCaja.filter((cuenta) => monedaCuenta(cuenta) === 'PYG'), [cuentasCaja]);
    const tasaActiva = tasaParaMoneda(monedaPago);
    const totalGs = Math.max(0, Number(totalAPagarGs ?? (moneda === 'PYG' ? totalAPagar : Number(totalAPagar || 0) * Number(tasaFactura || 1))) || 0);
    const pagoRealizadoGs = filas.reduce((acc, fila) => acc + Number(fila.montoGs || 0), 0);
    const montoBorrador = Number(cantidad);
    const montoBorradorGs = tasaActiva && Number.isFinite(montoBorrador) && montoBorrador > 0
        ? (monedaPago === 'PYG' ? redondear(montoBorrador) : redondear(montoBorrador * tasaActiva))
        : 0;
    const pagoProyectadoGs = pagoRealizadoGs + montoBorradorGs;
    const pagoAplicadoGs = Math.min(pagoProyectadoGs, totalGs);
    const vueltoGs = Math.max(0, pagoProyectadoGs - totalGs);
    const vueltoEnMonedaPago = tasaActiva
        ? redondear(monedaPago === 'PYG' ? vueltoGs : vueltoGs / tasaActiva, MONEDAS[monedaPago].decimales)
        : 0;
    const saldoGs = Math.max(0, totalGs - pagoProyectadoGs);
    const faltanteGs = Math.max(0, totalGs - pagoRealizadoGs);
    const montoPredeterminado = tasaActiva ? redondear(faltanteGs / tasaActiva, MONEDAS[monedaPago].decimales) : 0;
    const equivalenciaUSD = Number(tasasCambio?.USD?.compra) > 0
        ? redondear(totalGs / Number(tasasCambio.USD.compra), 2)
        : (moneda === 'USD' && Number(tasaFactura) > 0 ? redondear(totalGs / Number(tasaFactura), 2) : null);

    useEffect(() => {
        if (abierto) {
            setMonedaPago(codigosPago.includes('PYG') ? 'PYG' : codigosPago[0] || 'PYG');
            setFilas([]);
            setCantidad('');
            setMetodo('Efectivo');
            setCuentaId('');
            setNota('');
            setAcumuladoDenominaciones(0);
            setSinVuelto(false);
            setMetodoVuelto('Efectivo');
            setCuentaVueltoId('');
        }
    }, [abierto, codigosPago]);

    useEffect(() => {
        if (!abierto) return;
        if (cuentaId && cuentasDisponibles.some((cuenta) => String(cuenta.id) === String(cuentaId))) return;
        setCuentaId(String(cuentasDisponibles[0]?.id || ''));
    }, [abierto, monedaPago, cuentasDisponibles, cuentaId]);

    if (!abierto) return null;

    const abrirConDefault = () => {
        if (cantidad === '' && tasaActiva) setCantidad(String(montoPredeterminado));
    };

    const cambiarMonedaPago = (codigo) => {
        setMonedaPago(codigo);
        setCantidad('');
        setAcumuladoDenominaciones(0);
    };

    const agregarFila = () => {
        const monto = Number(cantidad);
        if (!tasaActiva) return alert(`No hay cotización de compra para ${monedaPago}. Fijá la tasa del día en Mesa de Cambios.`);
        if (!Number.isFinite(monto) || monto <= 0) return alert('Ingresá una cantidad válida.');
        const metodosConDenominaciones = Array.isArray(ajustesEmpresa.cash_denomination_methods) ? ajustesEmpresa.cash_denomination_methods : [];
        const validarDenominaciones = monedaPago === 'PYG' && ajustesEmpresa.cash_denomination_strict_check === true && metodosConDenominaciones.includes(metodo);
        if (validarDenominaciones && acumuladoDenominaciones !== monto) return alert('La suma de las denominaciones debe coincidir exactamente con el importe de este pago. Usa los botones de denominación.');
        const montoGs = monedaPago === 'PYG' ? redondear(monto) : redondear(monto * tasaActiva);
        setFilas((prev) => [...prev, {
            id: `${Date.now()}-${prev.length}`,
            cantidad: monto,
            moneda: monedaPago,
            montoGs,
            tasa: tasaActiva,
            metodo,
            cuentaId,
            nota: nota.trim(),
        }]);
        setCantidad(tasaActiva ? String(redondear(Math.max(0, faltanteGs - montoGs) / tasaActiva, MONEDAS[monedaPago].decimales)) : '');
        setAcumuladoDenominaciones(0);
        setNota('');
    };

    const quitarFila = (id) => setFilas((prev) => prev.filter((fila) => fila.id !== id));

    const finalizar = async () => {
        const filasFinales = [...filas];
        if (montoBorradorGs > 0) {
            const metodosConDenominaciones = Array.isArray(ajustesEmpresa.cash_denomination_methods) ? ajustesEmpresa.cash_denomination_methods : [];
            const validarDenominaciones = monedaPago === 'PYG' && ajustesEmpresa.cash_denomination_strict_check === true && metodosConDenominaciones.includes(metodo);
            if (validarDenominaciones && acumuladoDenominaciones !== montoBorrador) return alert('La suma de las denominaciones debe coincidir exactamente con el importe de este pago. Usa los botones de denominación.');
            filasFinales.push({
                id: `${Date.now()}-borrador`,
                cantidad: montoBorrador,
                moneda: monedaPago,
                montoGs: montoBorradorGs,
                tasa: tasaActiva,
                metodo,
                cuentaId,
                nota: nota.trim(),
            });
        }
        if (filasFinales.length === 0) return alert('Ingresá el monto del pago.');
        setGuardando(true);
        try {
            const metodosUnicos = [...new Set(filasFinales.map((fila) => fila.metodo))];
            const metodoResumen = filasFinales.length > 1 || metodosUnicos.length > 1 ? 'Pago Múltiple' : metodosUnicos[0];
            const detalleTexto = filasFinales.map((fila) => {
                const cuenta = cuentasCaja.find((c) => String(c.id) === String(fila.cuentaId));
                const cuentaTexto = cuenta ? ` (${cuenta.nombre})` : '';
                const tasaTexto = fila.moneda === 'PYG' ? '' : ` · tasa ${formatMoney(fila.tasa, 'PYG')}/${fila.moneda}`;
                return `${formatMoney(fila.cantidad, fila.moneda)} ${fila.metodo}${cuentaTexto}${tasaTexto}${fila.nota ? ` — ${fila.nota}` : ''}`;
            }).join(' | ');
            const cuentaVuelto = cuentasCaja.find((cuenta) => String(cuenta.id) === String(cuentaVueltoId));
            const resumenVuelto = vueltoGs > 0
                ? `Vuelto calculado ${formatMoney(vueltoGs)}: ${sinVuelto ? 'no entregado; el cliente lo deja en caja' : `entregado por ${metodoVuelto}${cuentaVuelto ? ` desde ${cuentaVuelto.nombre}` : ''}`}`
                : '';

            await onFinalizar({
                montoPagadoGs: pagoAplicadoGs,
                vueltoGs,
                saldoPendienteGs: saldoGs,
                montoPagado: moneda === 'PYG' ? pagoAplicadoGs : pagoAplicadoGs / (Number(tasaFactura) || 1),
                vuelto: moneda === 'PYG' ? vueltoGs : vueltoGs / (Number(tasaFactura) || 1),
                saldoPendiente: moneda === 'PYG' ? saldoGs : saldoGs / (Number(tasaFactura) || 1),
                metodoPago: metodoResumen,
                notaPagos: [`Pago múltiple: ${detalleTexto}`, resumenVuelto].filter(Boolean).join(' | '),
                filas: filasFinales,
                sinVuelto,
                montoVueltoGs: vueltoGs,
                montoVueltoEntregadoGs: sinVuelto ? 0 : vueltoGs,
                metodoVuelto: sinVuelto ? null : metodoVuelto,
                cuentaVueltoId: sinVuelto ? null : (cuentaVueltoId || null),
            });
        } finally {
            setGuardando(false);
        }
    };

    const denominaciones = String(ajustesEmpresa.cash_denominations || '').split(',').map((valor) => Number(valor.trim())).filter((valor) => Number.isFinite(valor) && valor > 0).sort((a, b) => b - a);
    const metodosDenominaciones = Array.isArray(ajustesEmpresa.cash_denomination_methods) ? ajustesEmpresa.cash_denomination_methods : [];
    const mostrarDenominaciones = monedaPago === 'PYG' && denominaciones.length > 0 && metodosDenominaciones.includes(metodo) && ['Pantalla POS', 'Todas las pantallas'].includes(ajustesEmpresa.enable_cash_denomination_on);

    return (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-slate-950/50 p-3 sm:p-5" onClick={onCerrar}>
            <section role="dialog" aria-modal="true" aria-labelledby="pos-pago-multiple-title" className="max-h-[94vh] w-full max-w-5xl overflow-hidden rounded-xl bg-white shadow-2xl" onClick={(event) => event.stopPropagation()}>
                <header className="flex items-center justify-between border-b bg-slate-900 px-5 py-4 text-white sm:px-6">
                    <div><h2 id="pos-pago-multiple-title" className="text-lg font-bold">Pago múltiple</h2><p className="mt-0.5 text-xs text-slate-300">Divide el cobro entre monedas y métodos de pago</p></div>
                    <button type="button" onClick={onCerrar} className="rounded-md px-3 py-1 text-xl text-white/80 hover:bg-white/10" aria-label="Cerrar">×</button>
                </header>

                <div className="grid max-h-[calc(94vh-132px)] grid-cols-1 overflow-y-auto lg:grid-cols-[minmax(0,1.65fr)_minmax(250px,.85fr)]">
                    <div className="space-y-4 p-4 sm:p-6">
                        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
                            <span className="text-slate-500">Pago total</span><strong className="text-slate-900">{formatMoney(pagoProyectadoGs, 'PYG')}</strong>
                        </div>

                        <div>
                            <span className="mb-1.5 block text-xs font-bold text-slate-500">Pagar en:</span>
                            <div className="flex flex-wrap gap-2">{codigosPago.map((codigo) => {
                                const tasa = tasaParaMoneda(codigo);
                                const habilitado = codigo === 'PYG' || tasa !== null;
                                return <button type="button" key={codigo} disabled={!habilitado} onClick={() => cambiarMonedaPago(codigo)} className={`rounded-lg border px-3 py-2 text-sm font-bold transition ${monedaPago === codigo ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-300 bg-white text-slate-700 hover:border-orange-400'} disabled:cursor-not-allowed disabled:opacity-40`} title={!habilitado ? `Fijá la cotización de compra de ${codigo} en Mesa de Cambios` : undefined}><span className="mr-1.5" aria-hidden="true">{MONEDAS[codigo].bandera}</span>{MONEDAS[codigo].etiqueta}{codigo !== 'PYG' && tasa ? <span className="ml-1 text-[10px] font-medium opacity-75">(1={formatMoney(tasa, 'PYG')})</span> : null}</button>;
                            })}</div>
                            {monedaPago !== 'PYG' && tasaActiva && <p className="mt-1.5 text-[11px] text-slate-500">Se convierte usando la tasa de compra del día: 1 {monedaPago} = {formatMoney(tasaActiva, 'PYG')}.</p>}
                        </div>

                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-[1fr_1fr_1fr]">
                            <label className="text-xs font-bold text-slate-500">Monto ({monedaPago}): *<span className="mt-1 flex h-10 overflow-hidden rounded-md border border-slate-300 focus-within:border-orange-500 focus-within:ring-2 focus-within:ring-orange-100"><span className="flex items-center border-r bg-slate-50 px-3 text-xs text-slate-500">{MONEDAS[monedaPago].simbolo}</span><input type="number" min="0" step={monedaPago === 'PYG' ? '1' : '0.01'} value={cantidad} onFocus={abrirConDefault} onChange={(event) => setCantidad(event.target.value)} placeholder={tasaActiva ? String(montoPredeterminado) : 'Sin cotización'} className="w-full min-w-0 px-3 text-sm font-semibold text-slate-900 outline-none" /></span></label>
                            <label className="text-xs font-bold text-slate-500">Método de pago: *<select value={metodo} onChange={(event) => { setMetodo(event.target.value); setAcumuladoDenominaciones(0); }} className="mt-1 h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm font-medium text-slate-800">{metodosPago.map((opcion) => <option key={opcion.value} value={opcion.value}>{opcion.label}</option>)}</select></label>
                            <label className="text-xs font-bold text-slate-500 sm:col-span-2 xl:col-span-1">Cuenta de pago:<select value={cuentaId} onChange={(event) => setCuentaId(event.target.value)} className="mt-1 h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm font-medium text-slate-800"><option value="">Sin especificar</option>{cuentasDisponibles.map((cuenta) => <option key={cuenta.id} value={cuenta.id}>{cuenta.nombre}</option>)}</select></label>
                        </div>
                        {cuentasDisponibles.length === 0 && <p className="-mt-2 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">No hay una cuenta activa en {monedaPago}. Podés continuar sin asignarla o crearla en Caja / Banco.</p>}

                        {mostrarDenominaciones && <div className="rounded-lg border border-slate-200 bg-slate-50 p-3"><div className="mb-2 flex justify-between text-xs"><strong>Denominaciones</strong><span className="text-slate-500">Acumulado: {formatMoney(acumuladoDenominaciones)}</span></div><div className="flex flex-wrap gap-2">{denominaciones.map((valor, index) => <button key={`${valor}-${index}`} type="button" onClick={() => { const total = acumuladoDenominaciones + valor; setAcumuladoDenominaciones(total); setCantidad(String(total)); }} className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-bold hover:border-orange-400">+ {formatMoney(valor)}</button>)}</div></div>}

                        <label className="block text-xs font-bold text-slate-500">Nota de pago:<textarea value={nota} onChange={(event) => setNota(event.target.value)} rows={2} className="mt-1 w-full resize-y rounded-md border border-slate-300 p-2 text-sm font-normal text-slate-800 outline-none focus:border-orange-500" /></label>

                        <button type="button" onClick={agregarFila} disabled={!tasaActiva} className="w-full rounded-lg bg-orange-500 py-2.5 font-bold text-white hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-50">+ Agregar fila de pago</button>

                        {vueltoGs > 0 && <section className="space-y-3 rounded-lg border border-emerald-200 bg-emerald-50/60 p-3" aria-label="Configuración del vuelto">
                            <label className="flex cursor-pointer items-start gap-2 text-xs font-semibold text-slate-700"><input type="checkbox" checked={sinVuelto} onChange={(event) => setSinVuelto(event.target.checked)} className="mt-0.5 h-4 w-4 accent-emerald-600" /><span>Sin vuelto: el cliente deja <strong>{formatMoney(vueltoEnMonedaPago, monedaPago)}</strong> ({formatMoney(vueltoGs)}) y queda en la caja</span></label>
                            {!sinVuelto && <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                                <label className="text-xs font-bold text-slate-500">Método de pago del vuelto:<select value={metodoVuelto} onChange={(event) => setMetodoVuelto(event.target.value)} className="mt-1 h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm font-medium text-slate-800">{METODOS_VUELTO.map((opcion) => <option key={opcion} value={opcion}>{opcion}</option>)}</select></label>
                                <label className="text-xs font-bold text-slate-500">Cuenta de pago del vuelto:<select value={cuentaVueltoId} onChange={(event) => setCuentaVueltoId(event.target.value)} className="mt-1 h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm font-medium text-slate-800"><option value="">Ninguna</option>{cuentasGuarani.map((cuenta) => <option key={cuenta.id} value={cuenta.id}>{cuenta.nombre}</option>)}</select></label>
                            </div>}
                        </section>}

                        {filas.length > 0 && <div className="divide-y overflow-hidden rounded-lg border border-slate-200">{filas.map((fila) => {
                            const cuenta = cuentasCaja.find((c) => String(c.id) === String(fila.cuentaId));
                            return <div key={fila.id} className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm"><div><strong className="text-slate-900">{formatMoney(fila.cantidad, fila.moneda)}</strong><span className="ml-2 text-slate-600">{fila.metodo}</span><p className="text-[11px] text-slate-500">{formatMoney(fila.montoGs)}{cuenta ? ` · ${cuenta.nombre}` : ''}</p></div><button type="button" onClick={() => quitarFila(fila.id)} className="rounded px-2 py-1 font-bold text-rose-600 hover:bg-rose-50" aria-label="Quitar fila">×</button></div>;
                        })}</div>}
                    </div>

                    <aside className="space-y-3 border-t bg-slate-50 p-4 sm:p-6 lg:border-l lg:border-t-0">
                        <div className="rounded-lg border border-slate-200 bg-white p-3"><div className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Total artículos</div><div className="mt-1 text-xl font-extrabold text-slate-900">{totalArticulos}</div></div>
                        <div className="rounded-lg border border-slate-200 bg-white p-3"><div className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Total a pagar</div><div className="mt-1 text-xl font-extrabold text-slate-900">{formatMoney(totalGs)}</div>{moneda !== 'PYG' && <div className="text-xs text-slate-500">{formatMoney(totalAPagar, moneda)} · {moneda}</div>}{equivalenciaUSD !== null && moneda !== 'USD' && <div className="text-xs text-slate-500">USD {formatMoney(equivalenciaUSD, 'USD').replace('USD ', '')}</div>}</div>
                        <div className="rounded-lg border border-slate-200 bg-white p-3"><div className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Pago total</div><div className="mt-1 text-xl font-extrabold text-slate-900">{formatMoney(pagoProyectadoGs)}</div></div>
                        <div className="rounded-lg border border-slate-200 bg-white p-3"><div className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Vuelto</div><div className={`mt-1 text-xl font-extrabold ${vueltoGs > 0 ? 'text-emerald-600' : 'text-slate-900'}`}>{formatMoney(vueltoEnMonedaPago, monedaPago)}</div>{monedaPago !== 'PYG' && <div className="text-xs text-slate-500">Equivalente: {formatMoney(vueltoGs, 'PYG')}</div>}{vueltoGs > 0 && <div className="mt-1 text-xs text-slate-500">{sinVuelto ? 'El importe queda en caja' : `Se entrega por ${metodoVuelto}`}</div>}</div>
                        <div className="rounded-lg border border-slate-200 bg-white p-3"><div className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Saldo</div><div className={`mt-1 text-xl font-extrabold ${saldoGs > 0 ? 'text-rose-600' : 'text-slate-900'}`}>{formatMoney(saldoGs)}</div>{saldoGs > 0 && <div className="mt-1 text-xs text-rose-600">Queda pendiente en la venta</div>}</div>
                    </aside>
                </div>

                <footer className="flex justify-end gap-2 border-t bg-white px-4 py-3 sm:px-6"><button type="button" onClick={onCerrar} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-bold text-slate-600 hover:bg-slate-50">Cerrar</button><button type="button" onClick={finalizar} disabled={guardando || (filas.length === 0 && montoBorradorGs <= 0)} className="rounded-lg bg-orange-500 px-4 py-2 text-sm font-bold text-white hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-50">{guardando ? 'Procesando…' : 'Finalizar el pago'}</button></footer>
            </section>
        </div>
    );
}
