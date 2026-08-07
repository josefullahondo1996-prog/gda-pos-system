import React, { useState } from 'react';
import { supabase } from './supabaseClient';
import { sonidoExito } from './utils/sonido';
import { useEmpresaInfo } from './utils/useEmpresa';
import { useUbicacionUsuario } from './utils/useUbicacion';
import { ajustarStockUbicacion } from './utils/stockUbicacion';

const formatGs = (v) => Number(v || 0).toLocaleString('es-PY');

const crearFilaVacia = (producto) => ({
    id: crypto.randomUUID(),
    productoId: producto?.id || null,
    nombre: producto?.nombre || '',
    cantidad: 1,
    unidad: producto?.unidad || 'UNID',
    costoUnitarioConIva: producto?.precio_compra
        ? Math.round(Number(producto.precio_compra) * (1 + (parseInt(producto.iva) || 10) / 100))
        : '',
    expDate: '',
    nota: '',
});

const AperturaStock = ({ producto, onGuardado, onCancelar }) => {
    const { id: empresaId, nombre: nombreEmpresa } = useEmpresaInfo();
    const { id: ubicacionId, nombre: nombreUbicacionUsuario, codigo: codigoUbicacionUsuario } = useUbicacionUsuario();
    const [filas, setFilas] = useState([crearFilaVacia(producto)]);
    const [guardando, setGuardando] = useState(false);

    const actualizarFila = (id, campo, valor) => {
        setFilas((prev) => prev.map((f) => (f.id === id ? { ...f, [campo]: valor } : f)));
    };

    const agregarFila = () => {
        setFilas((prev) => [...prev, crearFilaVacia(null)]);
    };

    const eliminarFila = (id) => {
        setFilas((prev) => (prev.length > 1 ? prev.filter((f) => f.id !== id) : prev));
    };

    const totalGeneral = filas.reduce((acc, f) => acc + (Number(f.cantidad) || 0) * (Number(f.costoUnitarioConIva) || 0), 0);

    const guardar = async () => {
        const filasValidas = filas.filter((f) => f.productoId && Number(f.cantidad) > 0);
        if (filasValidas.length === 0) return alert('Cargá al menos una cantidad válida.');

        setGuardando(true);
        try {
            for (const fila of filasValidas) {
                const { data: prodActual, error: errorLectura } = await supabase
                    .from('productos')
                    .select('stock_actual, iva')
                    .eq('id', fila.productoId)
                    .eq('empresa_id', empresaId)
                    .single();
                if (errorLectura) throw errorLectura;

                const ivaPct = parseInt(prodActual.iva) || 10;
                const costoSinIva = Number(fila.costoUnitarioConIva) / (1 + ivaPct / 100);
                const nuevoStock = (Number(prodActual.stock_actual) || 0) + Number(fila.cantidad);

                const { error: errorUpdate } = await supabase
                    .from('productos')
                    .update({
                        stock_actual: nuevoStock,
                        precio_compra: costoSinIva || undefined,
                    })
                    .eq('id', fila.productoId)
                    .eq('empresa_id', empresaId);
                if (errorUpdate) throw errorUpdate;

                // Además del stock global (arriba, sin tocar), sumamos el stock de la sucursal
                // del usuario que está cargando. Si esto falla no frena la carga de apertura.
                if (ubicacionId) {
                    try {
                        await ajustarStockUbicacion({
                            empresaId,
                            productoId: fila.productoId,
                            ubicacionId,
                            delta: Number(fila.cantidad),
                        });
                    } catch (errStock) {
                        console.error('No se pudo actualizar el stock por sucursal:', errStock.message);
                    }
                }
            }

            sonidoExito();
            alert('¡Stock de apertura guardado con éxito!');
            if (onGuardado) onGuardado();
        } catch (error) {
            console.error(error);
            alert('Error al guardar el stock: ' + error.message);
        } finally {
            setGuardando(false);
        }
    };

    return (
        <div className="bg-transparent text-sm text-gray-700">
            <div className="flex items-center justify-between mb-4">
                <p className="text-xs font-bold text-gray-500">
                    <span className="text-blue-600">CDEpos</span> / Productos / <span className="text-gray-700">Añadir Stock de apertura</span>
                </p>
                <button onClick={() => onCancelar && onCancelar()} className="text-xs font-bold text-gray-500 hover:text-gray-800">
                    ← Volver a la lista
                </button>
            </div>

            <div className="bg-white rounded-lg shadow-sm border-t-2 border-[#004284]">
                <div className="p-5 border-b border-gray-100">
                    <h2 className="font-bold text-gray-800 text-lg mb-1">Añadir Stock de apertura</h2>
                    <p className="text-xs text-gray-500">Ubicación: <span className="font-bold text-gray-700">{nombreUbicacionUsuario || nombreEmpresa}{codigoUbicacionUsuario ? ` (${codigoUbicacionUsuario})` : ''}</span></p>
                </div>

                <div className="overflow-x-auto p-4">
                    <table className="w-full text-xs border-collapse">
                        <thead>
                            <tr className="text-gray-400 font-bold uppercase text-[11px] border-b border-gray-200">
                                <th className="text-left py-2 pr-3">Nombre del producto</th>
                                <th className="text-left py-2 pr-3">Cantidad restante</th>
                                <th className="text-left py-2 pr-3">Costo unitario (con IVA)</th>
                                <th className="text-left py-2 pr-3">Exp. date</th>
                                <th className="text-right py-2 pr-3">Subtotal</th>
                                <th className="text-left py-2 pr-3">Fecha</th>
                                <th className="text-left py-2 pr-3">Nota</th>
                                <th className="w-10"></th>
                            </tr>
                        </thead>
                        <tbody>
                            {filas.map((f) => (
                                <tr key={f.id} className="border-b border-gray-50 align-top">
                                    <td className="py-3 pr-3 font-bold text-gray-800 min-w-[160px]">
                                        {f.nombre || <span className="text-gray-300 font-normal">(sin producto)</span>}
                                    </td>
                                    <td className="py-3 pr-3">
                                        <div className="flex items-center gap-1">
                                            <input
                                                type="number"
                                                min="0"
                                                className="w-16 border border-gray-300 rounded p-1.5"
                                                value={f.cantidad}
                                                onChange={(e) => actualizarFila(f.id, 'cantidad', e.target.value)}
                                            />
                                            <span className="bg-gray-50 border border-gray-200 rounded px-2 py-1.5 text-[10px] font-bold text-gray-500">
                                                {f.unidad}
                                            </span>
                                        </div>
                                    </td>
                                    <td className="py-3 pr-3">
                                        <input
                                            type="number"
                                            className="w-28 border border-gray-300 rounded p-1.5"
                                            value={f.costoUnitarioConIva}
                                            onChange={(e) => actualizarFila(f.id, 'costoUnitarioConIva', e.target.value)}
                                        />
                                    </td>
                                    <td className="py-3 pr-3">
                                        <input
                                            type="date"
                                            className="border border-gray-200 bg-gray-50 rounded p-1.5 w-32"
                                            value={f.expDate}
                                            onChange={(e) => actualizarFila(f.id, 'expDate', e.target.value)}
                                        />
                                    </td>
                                    <td className="py-3 pr-3 text-right font-bold text-gray-700">
                                        {formatGs((Number(f.cantidad) || 0) * (Number(f.costoUnitarioConIva) || 0))}
                                    </td>
                                    <td className="py-3 pr-3 text-gray-400 whitespace-nowrap">
                                        {new Date().toLocaleString('es-PY', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                    </td>
                                    <td className="py-3 pr-3">
                                        <textarea
                                            className="border border-gray-300 rounded p-1.5 w-40 h-14 resize-none"
                                            value={f.nota}
                                            onChange={(e) => actualizarFila(f.id, 'nota', e.target.value)}
                                        />
                                    </td>
                                    <td className="py-3 text-center">
                                        {filas.length > 1 && (
                                            <button onClick={() => eliminarFila(f.id)} className="text-red-400 hover:text-red-600 font-bold">✕</button>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                        <tfoot>
                            <tr>
                                <td className="py-3 font-bold text-gray-700">Total:</td>
                                <td colSpan={3}></td>
                                <td className="py-3 text-right font-black text-gray-800">{formatGs(totalGeneral)}</td>
                                <td colSpan={3}></td>
                            </tr>
                        </tfoot>
                    </table>

                    <button
                        onClick={agregarFila}
                        className="bg-orange-500 hover:bg-orange-600 text-white text-xs font-bold w-8 h-8 rounded flex items-center justify-center mt-2"
                        title="Agregar otra fila"
                    >
                        +
                    </button>
                </div>

                <div className="flex justify-end p-5 border-t border-gray-100">
                    <button
                        onClick={guardar}
                        disabled={guardando}
                        className="bg-orange-500 hover:bg-orange-600 text-white font-bold px-6 py-2.5 rounded disabled:opacity-60"
                    >
                        {guardando ? 'Guardando...' : 'Guardar'}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default AperturaStock;