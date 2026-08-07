import React from 'react';
import { useNombreEmpresa } from './useEmpresa';

const formatGs = (v) => `${Number(v || 0).toLocaleString('es-PY')} Gs`;

const DetalleProducto = ({ producto, onClose }) => {
    if (!producto) return null;
    const nombreEmpresa = useNombreEmpresa();

    const ivaPct = producto.iva ? parseInt(producto.iva.replace(/\D/g, '')) || 0 : 0;
    const precioCompraSinIva = Number(producto.precio_compra) || 0;
    const precioCompraConIva = precioCompraSinIva * (1 + ivaPct / 100);
    const precioVentaConIva = Number(producto.precio_venta) || 0;
    const precioVentaSinIva = ivaPct ? precioVentaConIva / (1 + ivaPct / 100) : precioVentaConIva;
    const margen = precioCompraSinIva > 0 ? ((precioVentaSinIva - precioCompraSinIva) / precioCompraSinIva) * 100 : 0;

    const Campo = ({ label, valor }) => (
        <p className="mb-2">
            <span className="font-bold text-gray-800">{label}: </span>
            <span className="text-gray-600">{valor || '--'}</span>
        </p>
    );

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
            <div
                className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header morado igual a la captura */}
                <div className="bg-[#5b4fcf] px-6 py-4 flex items-center justify-between sticky top-0 z-10">
                    <h2 className="text-white font-bold text-lg">{producto.nombre}</h2>
                    <button onClick={onClose} className="text-white text-xl leading-none hover:text-gray-200">✕</button>
                </div>

                <div className="p-6">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-6">
                        {/* Columna 1 */}
                        <div className="text-sm">
                            <Campo label="SKU/Codigo de Barra" valor={producto.codigo} />
                            <Campo label="Marca" valor={producto.marca} />
                            <Campo label="Unidad" valor={producto.unidad} />
                            <Campo label="Tipo de código de barras" valor="C128" />
                        </div>

                        {/* Columna 2 */}
                        <div className="text-sm">
                            <Campo label="Categoría" valor={producto.categoria} />
                            <Campo label="Subcategoría" valor={producto.subcategoria} />
                            <Campo label="Administrar Stock?" valor={producto.administra_stock ? 'Sí' : 'No'} />
                            <Campo label="Cantidad para alerta" valor={producto.alerta_stock_bajo} />
                        </div>

                        {/* Columna 3 */}
                        <div className="text-sm">
                            <Campo label="Expira en" valor={producto.expira_cantidad ? `${producto.expira_cantidad}.00 ${producto.expira_unidad || 'Meses'}` : null} />
                            <Campo label="Impuesto aplicable" valor={producto.iva} />
                            <Campo label="Tipo de impuesto sobre el precio de venta" valor={producto.tipo_impuesto} />
                            <Campo label="Tipo de producto" valor={producto.tipo_producto} />
                        </div>

                        {/* Imagen */}
                        <div className="md:col-start-4 md:row-start-1 md:row-span-1 flex justify-center items-start">
                            {producto.imagen_url ? (
                                <img src={producto.imagen_url} alt={producto.nombre} className="w-full max-w-[260px] rounded-lg border border-gray-100 object-cover" />
                            ) : (
                                <div className="w-full max-w-[260px] h-48 bg-gray-50 border border-dashed border-gray-200 rounded-lg flex items-center justify-center text-gray-300 text-4xl">
                                    🖼️
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Tabla de precios */}
                    <div className="overflow-x-auto rounded-lg border border-gray-100">
                        <table className="w-full text-xs">
                            <thead>
                                <tr className="bg-green-600 text-white text-left">
                                    <th className="px-3 py-2 font-bold">Precio de compra predeterminado (IVA no incluido)</th>
                                    <th className="px-3 py-2 font-bold">Precio de compra predeterminado (IVA incluido)</th>
                                    <th className="px-3 py-2 font-bold">x Margen (%)</th>
                                    <th className="px-3 py-2 font-bold">Precio de venta predeterminado (IVA no incluido)</th>
                                    <th className="px-3 py-2 font-bold">Precio de venta predeterminado (IVA incluido)</th>
                                    <th className="px-3 py-2 font-bold">Precios de grupo</th>
                                    <th className="px-3 py-2 font-bold">Imágenes de variación</th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr className="bg-gray-50">
                                    <td className="px-3 py-3 font-medium text-gray-700">{formatGs(precioCompraSinIva)}</td>
                                    <td className="px-3 py-3 font-medium text-gray-700">{formatGs(precioCompraConIva)}</td>
                                    <td className="px-3 py-3 font-medium text-gray-700">{margen.toFixed(0)}</td>
                                    <td className="px-3 py-3 font-medium text-gray-700">{formatGs(precioVentaSinIva)}</td>
                                    <td className="px-3 py-3 font-medium text-gray-700">{formatGs(precioVentaConIva)}</td>
                                    <td className="px-3 py-3 text-gray-400 italic">Aún no configurado por producto</td>
                                    <td className="px-3 py-3">
                                        {producto.imagen_url ? (
                                            <img src={producto.imagen_url} alt="" className="w-10 h-10 rounded object-cover border" />
                                        ) : (
                                            <span className="text-gray-300">—</span>
                                        )}
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                    </div>

                    <p className="text-[11px] text-gray-400 mt-3">
                        "Disponible en ubicaciones": {nombreEmpresa}
                    </p>
                </div>
            </div>
        </div>
    );
};

export default DetalleProducto;