import { useState } from 'react';

const formatGs = (valor) => `${Math.round(Number(valor) || 0).toLocaleString('es-PY')} Gs`;

const METODOS_PAGO = [
    { value: 'Efectivo', label: '💵 Efectivo' },
    { value: 'Tarjeta', label: '💳 Tarjeta' },
    { value: 'Transferencia', label: '🏦 Transferencia' },
];

// Modal de pago múltiple: permite dividir el cobro de una venta en varias
// filas (distintos métodos y/o cuentas), calcula vuelto y saldo en vivo, y
// al finalizar entrega un resumen que PuntoDeVenta.jsx usa para cobrar
// SIN tocar la lógica de venta/crédito que ya existe (ver onFinalizar).
export default function ModalPagoMultiple({ abierto, onCerrar, totalArticulos, totalAPagar, cuentasCaja, onFinalizar }) {
    const [filas, setFilas] = useState([]);
    const [cantidad, setCantidad] = useState('');
    const [metodo, setMetodo] = useState('Efectivo');
    const [cuentaId, setCuentaId] = useState('');
    const [nota, setNota] = useState('');
    const [guardando, setGuardando] = useState(false);

    if (!abierto) return null;

    const pagoRealizado = filas.reduce((acc, f) => acc + Number(f.cantidad || 0), 0);
    const pagoAplicado = Math.min(pagoRealizado, totalAPagar);
    const vuelto = Math.max(0, pagoRealizado - totalAPagar);
    const saldo = Math.max(0, totalAPagar - pagoRealizado);

    // El campo "Cantidad" se auto-completa con lo que falta cobrar, igual que en la captura
    const faltantePorPagar = Math.max(0, totalAPagar - pagoRealizado);

    const abrirConDefault = () => {
        if (cantidad === '') setCantidad(String(faltantePorPagar || totalAPagar));
    };

    const agregarFila = () => {
        const monto = Number(cantidad);
        if (!monto || monto <= 0) return alert('Ingresá una cantidad válida.');
        setFilas((prev) => [
            ...prev,
            { id: Date.now(), cantidad: monto, metodo, cuentaId, nota: nota.trim() },
        ]);
        const restante = Math.max(0, faltantePorPagar - monto);
        setCantidad(restante > 0 ? String(restante) : '');
        setNota('');
    };

    const quitarFila = (id) => setFilas((prev) => prev.filter((f) => f.id !== id));

    const finalizar = async () => {
        if (filas.length === 0) return alert('Agregá al menos una fila de pago.');
        setGuardando(true);
        try {
            // Armamos un método de pago legible ("Efectivo" o "Efectivo + Tarjeta")
            // y una nota con el detalle de cada fila, para no perder información
            // aunque la tabla "ventas" solo tenga una columna de método de pago.
            const metodosUnicos = [...new Set(filas.map((f) => f.metodo))];
            const metodoResumen = metodosUnicos.length > 1 ? 'Pago Múltiple' : metodosUnicos[0];
            const detalleTexto = filas
                .map((f) => {
                    const cuenta = cuentasCaja.find((c) => c.id === f.cuentaId);
                    return `${f.metodo} ${formatGs(f.cantidad)}${cuenta ? ` (${cuenta.nombre})` : ''}${f.nota ? ` — ${f.nota}` : ''}`;
                })
                .join(' | ');

            await onFinalizar({
                montoPagado: pagoAplicado,
                metodoPago: metodoResumen,
                vuelto,
                saldoPendiente: saldo,
                notaPagos: `Pago múltiple: ${detalleTexto}`,
                filas,
            });
        } finally {
            setGuardando(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onCerrar}>
            <div
                className="bg-white rounded-xl shadow-2xl w-full max-w-3xl overflow-hidden"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="bg-indigo-600 text-white px-6 py-4 flex justify-between items-center">
                    <h2 className="text-lg font-bold">Pago</h2>
                    <button onClick={onCerrar} className="text-white/80 hover:text-white text-xl leading-none">✕</button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-0">
                    {/* Columna izquierda: formulario */}
                    <div className="md:col-span-2 p-6 space-y-4">
                        <div className="text-sm text-gray-500">
                            Pago Realizado: <span className="font-bold text-gray-800">{formatGs(pagoRealizado)}</span>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                            <div>
                                <label className="text-xs font-bold text-gray-500 block mb-1">Cantidad (PYG): *</label>
                                <div className="flex border border-gray-300 rounded-lg overflow-hidden">
                                    <span className="bg-gray-100 px-2 flex items-center text-xs font-bold text-gray-500">Gs</span>
                                    <input
                                        type="number"
                                        value={cantidad}
                                        onFocus={abrirConDefault}
                                        onChange={(e) => setCantidad(e.target.value)}
                                        placeholder={String(faltantePorPagar || totalAPagar)}
                                        className="w-full p-2 outline-none"
                                    />
                                </div>
                            </div>
                            <div>
                                <label className="text-xs font-bold text-gray-500 block mb-1">Método de pago: *</label>
                                <select value={metodo} onChange={(e) => setMetodo(e.target.value)} className="w-full border border-gray-300 rounded-lg p-2 bg-white">
                                    {METODOS_PAGO.map((m) => (
                                        <option key={m.value} value={m.value}>{m.label}</option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="text-xs font-bold text-gray-500 block mb-1">Cuenta de pago:</label>
                                <select value={cuentaId} onChange={(e) => setCuentaId(e.target.value)} className="w-full border border-gray-300 rounded-lg p-2 bg-white">
                                    <option value="">Sin especificar</option>
                                    {cuentasCaja.map((c) => (
                                        <option key={c.id} value={c.id}>{c.nombre}</option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        <div>
                            <label className="text-xs font-bold text-gray-500 block mb-1">Nota de pago:</label>
                            <textarea
                                value={nota}
                                onChange={(e) => setNota(e.target.value)}
                                rows={2}
                                className="w-full border border-gray-300 rounded-lg p-2 resize-none"
                            />
                        </div>

                        <button
                            onClick={agregarFila}
                            className="w-full bg-orange-500 hover:bg-orange-600 text-white font-bold py-2.5 rounded-lg"
                        >
                            + Agregar fila de pago
                        </button>

                        {filas.length > 0 && (
                            <div className="border border-gray-200 rounded-lg divide-y max-h-40 overflow-y-auto">
                                {filas.map((f) => (
                                    <div key={f.id} className="flex justify-between items-center px-3 py-2 text-sm">
                                        <span>
                                            <span className="font-bold">{formatGs(f.cantidad)}</span> · {f.metodo}
                                            {f.cuentaId && (() => {
                                                const c = cuentasCaja.find((cta) => cta.id === f.cuentaId);
                                                return c ? ` · ${c.nombre}` : '';
                                            })()}
                                        </span>
                                        <button onClick={() => quitarFila(f.id)} className="text-red-400 hover:text-red-600 font-bold">✕</button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Columna derecha: resumen */}
                    <div className="bg-indigo-50 p-6 space-y-4">
                        <div>
                            <div className="text-[11px] font-bold text-gray-500 uppercase">Total Artículos</div>
                            <div className="text-xl font-extrabold text-gray-800">{totalArticulos}</div>
                        </div>
                        <div>
                            <div className="text-[11px] font-bold text-gray-500 uppercase">Total a Pagar</div>
                            <div className="text-xl font-extrabold text-gray-800">{formatGs(totalAPagar)}</div>
                        </div>
                        <div>
                            <div className="text-[11px] font-bold text-gray-500 uppercase">Pago Total</div>
                            <div className="text-xl font-extrabold text-gray-800">{formatGs(pagoRealizado)}</div>
                        </div>
                        <div>
                            <div className="text-[11px] font-bold text-gray-500 uppercase">Cambiar el Retorno</div>
                            <div className={`text-xl font-extrabold ${vuelto > 0 ? 'text-green-600' : 'text-gray-800'}`}>{formatGs(vuelto)}</div>
                        </div>
                        <div>
                            <div className="text-[11px] font-bold text-gray-500 uppercase">Saldo</div>
                            <div className={`text-xl font-extrabold ${saldo > 0 ? 'text-red-600' : 'text-gray-800'}`}>{formatGs(saldo)}</div>
                            {saldo > 0 && (
                                <div className="text-xs text-red-500 mt-1">Queda como crédito del cliente</div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div className="px-6 py-4 border-t border-gray-200 flex justify-end gap-3">
                    <button onClick={onCerrar} className="px-5 py-2 rounded-lg border border-gray-300 font-bold text-gray-600 hover:bg-gray-50">
                        Cerrar
                    </button>
                    <button
                        onClick={finalizar}
                        disabled={guardando || filas.length === 0}
                        className="px-5 py-2 rounded-lg bg-orange-500 hover:bg-orange-600 text-white font-bold disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {guardando ? 'Procesando…' : 'Finalizar el pago'}
                    </button>
                </div>
            </div>
        </div>
    );
}
