import React, { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';
import AperturaStock from './AperturaStock';
import { sonidoExito } from './utils/sonido';
import { useEmpresaInfo } from './utils/useEmpresa';
import { useLanguage } from './LanguageContext';

const GARANTIAS = ['Sin garantía', '30 días', '3 meses', '6 meses', '1 año'];

const GRUPOS_PRECIO_INICIALES = [
    { nombre: 'Base de Cambio', margen: 25 },
    { nombre: 'Base de cambio Credito', margen: 25 },
    { nombre: 'Credito', margen: 60 },
    { nombre: 'P Compra', margen: 25 },
    { nombre: 'P CREDITO', margen: 25 },
    { nombre: 'P Mayorista', margen: 25 },
    { nombre: 'P Venta', margen: 25 },
    { nombre: 'Precio con Entrega Batería', margen: 25 },
];

const AgregarProducto = ({ onGuardado, onCancelar, productoEditar }) => {
    const { t } = useLanguage();
    const { id: empresaId, nombre: nombreEmpresa } = useEmpresaInfo();
    const [nombre, setNombre] = useState('');
    const [sku, setSku] = useState('');
    const [tipoCodigoBarra, setTipoCodigoBarra] = useState('Code 128 (C128)');
    const [unidad, setUnidad] = useState('');
    const [marca, setMarca] = useState('');
    const [marcasDisponibles, setMarcasDisponibles] = useState([]);
    const [unidadesDisponibles, setUnidadesDisponibles] = useState([]);
    const [categoriasDisponibles, setCategoriasDisponibles] = useState([]);
    const [categoria, setCategoria] = useState('');
    const [subcategoria, setSubcategoria] = useState('');
    const [garantia, setGarantia] = useState('');

    const [mostrarDatosTipo, setMostrarDatosTipo] = useState(true);
    const [descripcion, setDescripcion] = useState('');
    const [administraStock, setAdministraStock] = useState(true);
    const [cantidadAlerta, setCantidadAlerta] = useState('');
    const [expiraCantidad, setExpiraCantidad] = useState('');
    const [expiraUnidad, setExpiraUnidad] = useState('Meses');

    const [imagenPreview, setImagenPreview] = useState(null);

    const [ivaPct, setIvaPct] = useState(10);
    const [tipoImpuestoPrecio, setTipoImpuestoPrecio] = useState('Incluido');
    const [tipoProducto, setTipoProducto] = useState('Individual');

    // Ahora los 4 valores de precio son editables de forma independiente
    const [precioCompraSinIva, setPrecioCompraSinIva] = useState('');
    const [precioCompraConIva, setPrecioCompraConIva] = useState('');
    const [margenPct, setMargenPct] = useState(25);
    const [precioVentaConIva, setPrecioVentaConIva] = useState('');

    const [gruposPrecio, setGruposPrecio] = useState(
        GRUPOS_PRECIO_INICIALES.map((g) => ({ ...g, precioVenta: 0 }))
    );

    const [guardando, setGuardando] = useState(false);
    const [productoParaStock, setProductoParaStock] = useState(null);

    useEffect(() => {
        const cargarListas = async () => {
            if (!empresaId) return;
            const [resMarcas, resUnidades, resCategorias] = await Promise.all([
                supabase.from('marcas').select('*').eq('empresa_id', empresaId).order('nombre', { ascending: true }),
                supabase.from('unidades').select('*').eq('empresa_id', empresaId).order('nombre', { ascending: true }),
                supabase.from('categorias_productos').select('*').eq('empresa_id', empresaId).order('nombre', { ascending: true }),
            ]);
            if (!resMarcas.error && resMarcas.data) setMarcasDisponibles(resMarcas.data);
            if (!resUnidades.error && resUnidades.data) setUnidadesDisponibles(resUnidades.data);
            if (!resCategorias.error && resCategorias.data) setCategoriasDisponibles(resCategorias.data);
        };
        cargarListas();
    }, [empresaId]);

    useEffect(() => {
        if (!productoEditar) return;

        setNombre(productoEditar.nombre || '');
        setSku(productoEditar.codigo || '');
        setUnidad(productoEditar.unidad || '');
        setMarca(productoEditar.marca || '');
        setCategoria(productoEditar.categoria || '');
        setSubcategoria(productoEditar.subcategoria || '');
        setGarantia(productoEditar.garantia || '');
        setDescripcion(productoEditar.descripcion || '');
        setAdministraStock(productoEditar.administra_stock ?? true);
        setCantidadAlerta(productoEditar.alerta_stock_bajo ?? '');
        setExpiraCantidad(productoEditar.expira_cantidad ?? '');
        setExpiraUnidad(productoEditar.expira_unidad || 'Meses');
        setImagenPreview(productoEditar.imagen_url || null);
        setTipoImpuestoPrecio(productoEditar.tipo_impuesto || 'Incluido');
        setTipoProducto(productoEditar.tipo_producto || 'Individual');

        const ivaGuardado = productoEditar.iva ? parseInt(productoEditar.iva.replace(/\D/g, '')) || 0 : 10;
        setIvaPct(ivaGuardado);

        const compraSinIva = Number(productoEditar.precio_compra) || 0;
        const ventaConIva = Number(productoEditar.precio_venta) || 0;
        setPrecioCompraSinIva(compraSinIva || '');
        setPrecioCompraConIva(compraSinIva ? (compraSinIva * (1 + ivaGuardado / 100)).toFixed(0) : '');
        setPrecioVentaConIva(ventaConIva || '');

        if (compraSinIva > 0 && ventaConIva > 0) {
            const ventaSinIva = ventaConIva / (1 + ivaGuardado / 100);
            const margenCalculado = ((ventaSinIva - compraSinIva) / compraSinIva) * 100;
            setMargenPct(margenCalculado.toFixed(1));
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [productoEditar]);

    // === RECALCULO EN CADENA (compra → venta), cada campo puede editarse a mano ===

    // 1) Escribís "IVA no incluido" → recalcula "IVA incluido" y el precio de venta
    const handlePrecioCompraSinIva = (valor) => {
        setPrecioCompraSinIva(valor);
        const base = Number(valor) || 0;
        setPrecioCompraConIva(base ? (base * (1 + ivaPct / 100)).toFixed(0) : '');
        recalcularVentaDesdeCompra(base, margenPct);
    };

    // 2) Escribís "IVA incluido" (precio de compra CON iva) → recalcula "IVA no incluido" y el precio de venta
    const handlePrecioCompraConIva = (valor) => {
        setPrecioCompraConIva(valor);
        const conIva = Number(valor) || 0;
        const sinIva = conIva ? conIva / (1 + ivaPct / 100) : 0;
        setPrecioCompraSinIva(sinIva ? sinIva.toFixed(0) : '');
        recalcularVentaDesdeCompra(sinIva, margenPct);
    };

    // 3) Escribís el Margen (%) → recalcula el precio de venta
    const handleMargenPct = (valor) => {
        setMargenPct(valor);
        recalcularVentaDesdeCompra(Number(precioCompraSinIva) || 0, Number(valor) || 0);
    };

    const recalcularVentaDesdeCompra = (compraSinIva, margen) => {
        const ventaSinIva = compraSinIva * (1 + margen / 100);
        const ventaConIva = ventaSinIva * (1 + ivaPct / 100);
        setPrecioVentaConIva(ventaConIva ? ventaConIva.toFixed(0) : '');
    };

    // 4) Escribís "Incluyendo impuesto" (precio de venta) directamente → recalcula el margen %
    const handlePrecioVentaConIva = (valor) => {
        setPrecioVentaConIva(valor);
        const ventaConIva = Number(valor) || 0;
        const ventaSinIva = ventaConIva / (1 + ivaPct / 100);
        const compraSinIva = Number(precioCompraSinIva) || 0;
        if (compraSinIva > 0) {
            const nuevoMargen = ((ventaSinIva - compraSinIva) / compraSinIva) * 100;
            setMargenPct(nuevoMargen.toFixed(1));
        }
    };

    // Si cambia el % de IVA, recalculamos todo a partir del precio de compra sin IVA
    const handleIvaPct = (nuevoIva) => {
        setIvaPct(nuevoIva);
        const base = Number(precioCompraSinIva) || 0;
        setPrecioCompraConIva(base ? (base * (1 + nuevoIva / 100)).toFixed(0) : '');
        const ventaSinIva = base * (1 + margenPct / 100);
        setPrecioVentaConIva(ventaSinIva ? (ventaSinIva * (1 + nuevoIva / 100)).toFixed(0) : '');
    };

    const actualizarMargenGrupo = (index, nuevoMargen) => {
        setGruposPrecio((prev) =>
            prev.map((g, i) => {
                if (i !== index) return g;
                const base = precioCompraSinIva ? Number(precioCompraSinIva) : 0;
                const venta = base * (1 + Number(nuevoMargen) / 100) * (1 + ivaPct / 100);
                return { ...g, margen: nuevoMargen, precioVenta: venta };
            })
        );
    };

    const eliminarGrupo = (index) => {
        setGruposPrecio((prev) => prev.filter((_, i) => i !== index));
    };

    const agregarGrupo = () => {
        const nombreGrupo = prompt('Nombre del nuevo grupo de precio:');
        if (!nombreGrupo) return;
        setGruposPrecio((prev) => [...prev, { nombre: nombreGrupo, margen: 25, precioVenta: 0 }]);
    };

    const [subiendoImagen, setSubiendoImagen] = useState(false);

    const manejarImagen = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        if (file.size > 5 * 1024 * 1024) return alert('La imagen supera los 5MB.');

        setSubiendoImagen(true);
        try {
            const extension = file.name.split('.').pop();
            const nombreArchivo = `${crypto.randomUUID()}.${extension}`;

            const { error: errorSubida } = await supabase.storage
                .from('productos')
                .upload(nombreArchivo, file);

            if (errorSubida) throw errorSubida;

            const { data: urlData } = supabase.storage
                .from('productos')
                .getPublicUrl(nombreArchivo);

            setImagenPreview(urlData.publicUrl);
        } catch (error) {
            console.error(error);
            alert('Error al subir la imagen: ' + error.message + '\n\n¿Ya creaste el bucket "productos" en Supabase Storage?');
        } finally {
            setSubiendoImagen(false);
        }
    };

    const limpiarFormulario = () => {
        setNombre(''); setSku(''); setUnidad(''); setMarca(''); setCategoria(''); setSubcategoria(''); setGarantia('');
        setDescripcion(''); setAdministraStock(true); setCantidadAlerta(''); setExpiraCantidad('');
        setImagenPreview(null); setPrecioCompraSinIva(''); setMargenPct(25);
    };

    const guardarProducto = async (opcion) => {
        if (!nombre.trim()) return alert('El nombre del producto es obligatorio.');
        if (!unidad) return alert('Seleccioná la unidad.');

        setGuardando(true);
        try {
            const datosProducto = {
                nombre: nombre.trim(),
                codigo: sku || null,
                unidad,
                marca: marca || null,
                categoria: categoria || null,
                subcategoria: subcategoria || null,
                garantia: garantia || null,
                descripcion: descripcion || null,
                administra_stock: administraStock,
                alerta_stock_bajo: cantidadAlerta ? Number(cantidadAlerta) : 5,
                expira_cantidad: expiraCantidad ? Number(expiraCantidad) : null,
                expira_unidad: expiraUnidad,
                imagen_url: imagenPreview || null,
                precio_compra: Number(precioCompraSinIva) || 0,
                precio_venta: Math.round(Number(precioVentaConIva)) || 0,
                iva: `IVA ${ivaPct}%`,
                tipo_impuesto: tipoImpuestoPrecio,
                tipo_producto: tipoProducto,
            };

            let productoGuardado = null;

            if (productoEditar) {
                const { data, error } = await supabase.from('productos').update(datosProducto).eq('id', productoEditar.id).eq('empresa_id', empresaId).select();
                if (error) throw error;
                productoGuardado = data?.[0] || { ...productoEditar, ...datosProducto };
            } else {
                const { data, error } = await supabase.from('productos').insert([{ ...datosProducto, stock_actual: 0, empresa_id: empresaId }]).select();
                if (error) throw error;
                productoGuardado = data?.[0];
            }

            if (opcion === 'cargar_stock') {
                // No cerramos todavía: pasamos a la pantalla de Stock de Apertura
                setProductoParaStock(productoGuardado);
                return;
            }

            sonidoExito();
            alert(productoEditar ? t('productUpdated') : t('productSaved'));

            if (opcion === 'agregar_otro') {
                limpiarFormulario();
            } else {
                if (onGuardado) onGuardado(opcion);
            }
        } catch (error) {
            console.error(error);
            alert(
                'Error al guardar el producto. Si el error menciona una columna, corré el SQL que agrega las columnas nuevas a la tabla "productos" en Supabase.\n\n' + error.message
            );
        } finally {
            setGuardando(false);
        }
    };

    if (productoParaStock) {
        return (
            <AperturaStock
                producto={productoParaStock}
                onGuardado={() => { setProductoParaStock(null); if (onGuardado) onGuardado('cargar_stock'); }}
                onCancelar={() => { setProductoParaStock(null); if (onGuardado) onGuardado('cargar_stock'); }}
            />
        );
    }

    return (
        <div className="bg-transparent text-sm text-gray-700">

            {/* Breadcrumb */}
            <div className="flex items-center justify-between mb-4">
                <p className="text-xs font-bold text-gray-500">
                    <span className="text-blue-600">CDEpos</span> / {t('products')} / <span className="text-gray-700">{productoEditar ? t('editProduct') : t('addNewProduct')}</span>
                </p>
                <button onClick={() => onCancelar && onCancelar()} className="text-xs font-bold text-gray-500 hover:text-gray-800">
                    ← {t('backToList')}
                </button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

                {/* COLUMNA IZQUIERDA (2/3) */}
                <div className="lg:col-span-2 flex flex-col gap-4">

                    {/* Información del producto */}
                    <div className="bg-white p-5 rounded-lg shadow-sm border-t-2 border-[#004284]">
                        <h3 className="font-bold text-gray-700 mb-4 flex items-center gap-2">📦 {t('productInformation')}</h3>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                            <div>
                                <label className="block text-xs font-bold text-gray-500 mb-1">{t('productName')} *</label>
                                <input
                                    className="w-full border border-gray-300 rounded p-2 text-sm"
                                    placeholder={t('productName')}
                                    value={nombre}
                                    onChange={(e) => setNombre(e.target.value)}
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-gray-500 mb-1">{t('skuBarcodeType')}</label>
                                <div className="flex border border-gray-300 rounded overflow-hidden">
                                    <input
                                        className="w-20 p-2 text-sm border-r border-gray-300 outline-none"
                                        placeholder="SKU"
                                        value={sku}
                                        onChange={(e) => setSku(e.target.value)}
                                    />
                                    <select
                                        className="flex-1 p-2 text-sm bg-white outline-none"
                                        value={tipoCodigoBarra}
                                        onChange={(e) => setTipoCodigoBarra(e.target.value)}
                                    >
                                        <option>Code 128 (C128)</option>
                                        <option>EAN-13</option>
                                        <option>UPC-A</option>
                                    </select>
                                </div>
                            </div>
                        </div>

                        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-4">
                            <div>
                                <label className="block text-xs font-bold text-gray-500 mb-1">{t('units')} *</label>
                                <select className="w-full border border-gray-300 rounded p-2 text-sm bg-white" value={unidad} onChange={(e) => setUnidad(e.target.value)}>
                                    <option value="">{t('select')}</option>
                                    {unidadesDisponibles.map((u) => <option key={u.id} value={u.nombre}>{u.nombre}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-gray-500 mb-1">Marca</label>
                                <select className="w-full border border-gray-300 rounded p-2 text-sm bg-white" value={marca} onChange={(e) => setMarca(e.target.value)}>
                                    <option value="">Seleccione</option>
                                    {marcasDisponibles.map((m) => <option key={m.id} value={m.nombre}>{m.nombre}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-gray-500 mb-1">{t('categories')}</label>
                                <select className="w-full border border-gray-300 rounded p-2 text-sm bg-white" value={categoria} onChange={(e) => setCategoria(e.target.value)}>
                                    <option value="">{t('select')}</option>
                                    {categoriasDisponibles.filter((c) => !c.categoria_padre_id).map((padre) => (
                                        <React.Fragment key={padre.id}>
                                            <option value={padre.nombre}>{padre.nombre}</option>
                                            {categoriasDisponibles.filter((h) => h.categoria_padre_id === padre.id).map((hija) => (
                                                <option key={hija.id} value={hija.nombre}>-- {hija.nombre}</option>
                                            ))}
                                        </React.Fragment>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-gray-500 mb-1">{t('subcategory')}</label>
                                <input className="w-full border border-gray-300 rounded p-2 text-sm" placeholder={t('subcategory')} value={subcategoria} onChange={(e) => setSubcategoria(e.target.value)} />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-gray-500 mb-1">{t('warranty')}</label>
                                <select className="w-full border border-gray-300 rounded p-2 text-sm bg-white" value={garantia} onChange={(e) => setGarantia(e.target.value)}>
                                    <option value="">{t('select')}</option>
                                    {GARANTIAS.map((g) => <option key={g} value={g}>{g}</option>)}
                                </select>
                            </div>
                        </div>

                        <div>
                            <label className="block text-xs font-bold text-gray-500 mb-1">{t('commercialLocations')} *</label>
                            <div className="border border-gray-300 rounded p-2 flex flex-wrap gap-2">
                                <span className="bg-blue-500 text-white text-xs font-bold px-2 py-1 rounded flex items-center gap-1">
                                    ✕ {nombreEmpresa} (BL0001)
                                </span>
                            </div>
                            <p className="text-[11px] text-gray-400 mt-1">{t('selectAvailableLocations')}</p>
                        </div>
                    </div>

                    {/* Datos y tipo (colapsable) */}
                    <div className="bg-white rounded-lg shadow-sm border border-blue-200">
                        <button
                            onClick={() => setMostrarDatosTipo(!mostrarDatosTipo)}
                            className="w-full text-left px-4 py-3 font-bold text-gray-700 flex justify-between items-center"
                        >
                            {t('dataAndType')} 
                            <span className="text-blue-500">{mostrarDatosTipo ? '▲' : '▼'}</span>
                        </button>

                        {mostrarDatosTipo && (
                            <div className="p-5 border-t border-gray-100">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-5">
                                    <div>
                                        <label className="block text-xs font-bold text-gray-500 mb-1">{t('productDescription')}</label>
                                        <textarea
                                            className="w-full border border-gray-300 rounded p-2 text-sm h-20"
                                            placeholder={t('productDescription')}
                                            value={descripcion}
                                            onChange={(e) => setDescripcion(e.target.value)}
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-gray-500 mb-1">{t('productBrochure')}</label>
                                        <div className="flex items-center gap-2 border border-gray-300 rounded p-2">
                                            <button type="button" className="bg-gray-100 text-gray-600 text-xs font-bold px-3 py-1.5 rounded border">{t('selectFile')}</button>
                                            <span className="text-xs text-gray-400">{t('noFileSelected')}</span>
                                        </div>
                                        <p className="text-[11px] text-gray-400 mt-1">Tamaño máximo de archivo: 5MB</p>
                                    </div>
                                </div>

                                <p className="text-xs font-bold text-blue-600 mb-3">📊 {t('stockAndAlerts')}</p>
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                    <div>
                                        <label className="block text-xs font-bold text-gray-500 mb-1">{t('manageStockQuestion')}</label>
                                        <label className="flex items-center gap-2 border border-gray-300 rounded p-2 w-fit">
                                            <input type="checkbox" checked={administraStock} onChange={(e) => setAdministraStock(e.target.checked)} />
                                            <span className="text-sm">{t('yes')}</span>
                                        </label>
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-gray-500 mb-1">{t('alertQuantity')}</label>
                                        <input
                                            type="number"
                                            className="w-full border border-gray-300 rounded p-2 text-sm"
                                            placeholder={t('alertQuantity')}
                                            value={cantidadAlerta}
                                            onChange={(e) => setCantidadAlerta(e.target.value)}
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-gray-500 mb-1">{t('expiresIn')}</label>
                                        <div className="flex border border-gray-300 rounded overflow-hidden">
                                            <input
                                                type="number"
                                                className="w-16 p-2 text-sm border-r border-gray-300 outline-none"
                                                value={expiraCantidad}
                                                onChange={(e) => setExpiraCantidad(e.target.value)}
                                            />
                                            <select className="flex-1 p-2 text-sm bg-white outline-none" value={expiraUnidad} onChange={(e) => setExpiraUnidad(e.target.value)}>
                                                <option>Días</option>
                                                <option>Meses</option>
                                                <option>Años</option>
                                            </select>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Imagen del producto */}
                    <div className="bg-white p-5 rounded-lg shadow-sm border-t-2 border-orange-400">
                        <div className="flex justify-between items-center mb-3">
                            <h3 className="font-bold text-gray-700">📷 Imagen del producto {imagenPreview ? '1/5' : '0/5'}</h3>
                            <span className="text-[11px] text-gray-400">1:1 — se comprimen automáticamente</span>
                        </div>

                        <div className="border-2 border-dashed border-gray-200 rounded-lg flex flex-col items-center justify-center py-10">
                            {imagenPreview ? (
                                <img src={imagenPreview} alt="preview" className="h-28 w-28 object-cover rounded-lg mb-3" />
                            ) : (
                                <div className="text-4xl mb-3 text-gray-300">🖼️</div>
                            )}
                            <p className="text-sm text-gray-500 mb-3">Arrastrá imágenes o elegí una opción (hasta 5)</p>
                            <div className="flex gap-2">
                                <label className={`bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold px-4 py-2 rounded cursor-pointer flex items-center gap-1 ${subiendoImagen ? 'opacity-60 pointer-events-none' : ''}`}>
                                    {subiendoImagen ? '⏳ Subiendo...' : '⬆️ Subir archivos'}
                                    <input type="file" accept="image/*" className="hidden" onChange={manejarImagen} disabled={subiendoImagen} />
                                </label>
                                <button type="button" onClick={() => alert('Función de cámara disponible próximamente')} className="bg-orange-500 hover:bg-orange-600 text-white text-xs font-bold px-4 py-2 rounded flex items-center gap-1">
                                    📷 Usar cámara
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* Precios e impuestos */}
                    <div className="bg-white rounded-lg shadow-sm border border-orange-200">
                        <div className="flex items-center gap-2 px-5 py-3 border-b border-gray-100">
                            <span className="w-3 h-3 bg-orange-500 rounded-full"></span>
                            <h3 className="font-bold text-gray-700">{t('pricesAndTaxes')}</h3>
                        </div>

                        <div className="p-5">
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                                <div>
                                    <label className="block text-xs font-bold text-gray-500 mb-1">{t('applicableTax')}:</label>
                                    <select className="w-full border border-gray-300 rounded p-2 text-sm bg-white" value={ivaPct} onChange={(e) => handleIvaPct(Number(e.target.value))}>
                                        <option value={10}>IVA 10%</option>
                                        <option value={5}>IVA 5%</option>
                                        <option value={0}>Exento</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-gray-500 mb-1">{t('salePriceTaxType')}:</label>
                                    <select className="w-full border border-gray-300 rounded p-2 text-sm bg-white" value={tipoImpuestoPrecio} onChange={(e) => setTipoImpuestoPrecio(e.target.value)}>
                                        <option>Incluido</option>
                                        <option>No incluido</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-gray-500 mb-1">{t('productType')}:</label>
                                    <select className="w-full border border-gray-300 rounded p-2 text-sm bg-white" value={tipoProducto} onChange={(e) => setTipoProducto(e.target.value)}>
                                        <option>Individual</option>
                                        <option>Combo</option>
                                        <option>Servicio</option>
                                    </select>
                                </div>
                            </div>

                            <div className="border border-gray-200 rounded-lg overflow-hidden">
                                <div className="grid grid-cols-3 text-white text-xs font-bold">
                                    <div className="bg-green-600 px-3 py-2">{t('defaultPurchasePrice')}</div>
                                    <div className="bg-green-600 px-3 py-2 border-l border-green-500">x Margen (%) ℹ️</div>
                                    <div className="bg-green-600 px-3 py-2 border-l border-green-500">{t('defaultSalePrice')}</div>
                                </div>
                                <div className="grid grid-cols-3 gap-4 p-4">
                                    <div className="grid grid-cols-2 gap-2">
                                        <div>
                                            <label className="block text-[11px] font-bold text-gray-500 mb-1">{t('taxNotIncluded')}:*</label>
                                            <input
                                                type="number"
                                                className="w-full border border-gray-300 rounded p-2 text-sm"
                                                placeholder={t('taxNotIncluded')}
                                                value={precioCompraSinIva}
                                                onChange={(e) => handlePrecioCompraSinIva(e.target.value)}
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-[11px] font-bold text-gray-500 mb-1">{t('taxIncluded')}:*</label>
                                            <input
                                                type="number"
                                                className="w-full border border-gray-300 rounded p-2 text-sm"
                                                placeholder={t('taxIncluded')}
                                                value={precioCompraConIva}
                                                onChange={(e) => handlePrecioCompraConIva(e.target.value)}
                                            />
                                        </div>
                                    </div>
                                    <div>
                                        <input
                                            type="number"
                                            className="w-full border border-gray-300 rounded p-2 text-sm"
                                            value={margenPct}
                                            onChange={(e) => handleMargenPct(e.target.value)}
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-[11px] font-bold text-gray-500 mb-1">Incluyendo impuesto</label>
                                        <input
                                            type="number"
                                            className="w-full border border-gray-300 rounded p-2 text-sm font-bold text-green-700"
                                            placeholder="IVA incluido"
                                            value={precioVentaConIva}
                                            onChange={(e) => handlePrecioVentaConIva(e.target.value)}
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <button className="w-full text-left bg-white p-4 rounded-lg shadow-sm border text-gray-500 text-sm font-bold flex justify-between items-center" onClick={() => alert('Sección en construcción')}>
                        ⚙️ Campos adicionales (peso, IMEI, personalizados, rack) <span>▼</span>
                    </button>
                    <button className="w-full text-left bg-white p-4 rounded-lg shadow-sm border text-gray-500 text-sm font-bold flex justify-between items-center" onClick={() => alert('Sección en construcción')}>
                        🔌 Módulos e integraciones (WooCommerce, facturación, etc.) <span>▼</span>
                    </button>

                    {/* Botones de guardado */}
                    <div className="flex flex-wrap gap-3 justify-end">
                        {productoEditar ? (
                            <>
                                <button
                                    disabled={guardando}
                                    onClick={() => guardarProducto('cargar_stock')}
                                    className="bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold px-4 py-2.5 rounded flex items-center gap-2 disabled:opacity-60"
                                >
                                    📦 Actualizar y editar Stock de apertura
                                </button>
                                <button
                                    disabled={guardando}
                                    onClick={() => onCancelar && onCancelar()}
                                    className="bg-white border border-gray-300 text-gray-700 text-sm font-bold px-4 py-2.5 rounded flex items-center gap-2 hover:bg-gray-50 disabled:opacity-60"
                                >
                                    Cancelar
                                </button>
                                <button
                                    disabled={guardando}
                                    onClick={() => guardarProducto('editado')}
                                    className="bg-orange-500 hover:bg-orange-600 text-white text-sm font-bold px-5 py-2.5 rounded flex items-center gap-2 disabled:opacity-60"
                                >
                                    💾 {guardando ? 'Guardando cambios...' : 'Guardar cambios'}
                                </button>
                            </>
                        ) : (
                            <>
                                <button
                                    disabled={guardando}
                                    onClick={() => guardarProducto('cargar_stock')}
                                    className="bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold px-4 py-2.5 rounded flex items-center gap-2 disabled:opacity-60"
                                >
                                    📦 Guardar y cargar stock inicial
                                </button>
                                <button
                                    disabled={guardando}
                                    onClick={() => guardarProducto('agregar_otro')}
                                    className="bg-white border border-gray-300 text-gray-700 text-sm font-bold px-4 py-2.5 rounded flex items-center gap-2 hover:bg-gray-50 disabled:opacity-60"
                                >
                                    + Guardar y agregar otro
                                </button>
                                <button
                                    disabled={guardando}
                                    onClick={() => guardarProducto('listo')}
                                    className="bg-orange-500 hover:bg-orange-600 text-white text-sm font-bold px-5 py-2.5 rounded flex items-center gap-2 disabled:opacity-60"
                                >
                                    💾 {guardando ? 'Guardando...' : 'Guardar'}
                                </button>
                            </>
                        )}
                    </div>
                </div>

                {/* COLUMNA DERECHA: GRUPOS DE PRECIO */}
                <div className="bg-white p-5 rounded-lg shadow-sm border-t-2 border-[#004284] h-fit">
                    <div className="flex justify-between items-center mb-4">
                        <h3 className="font-bold text-gray-700 flex items-center gap-2">📋 Grupos de precio</h3>
                        <button onClick={agregarGrupo} className="text-xs font-bold text-blue-600 border border-blue-200 rounded px-2 py-1 hover:bg-blue-50">
                            + Nuevo
                        </button>
                    </div>

                    <div className="flex flex-col gap-4 max-h-[700px] overflow-y-auto pr-1">
                        {gruposPrecio.map((g, i) => (
                            <div key={g.nombre + i} className="border border-gray-100 rounded-lg p-3">
                                <div className="flex justify-between items-center mb-2">
                                    <p className="text-sm font-bold text-gray-700 flex items-center gap-1">
                                        <span className="w-2 h-2 bg-green-500 rounded-full"></span> {g.nombre}
                                    </p>
                                    <button onClick={() => eliminarGrupo(i)} className="text-gray-300 hover:text-red-500 text-xs">✕</button>
                                </div>
                                <div className="grid grid-cols-2 gap-2">
                                    <div>
                                        <label className="block text-[10px] font-bold text-gray-400 mb-1">Margen %</label>
                                        <input
                                            type="number"
                                            className="w-full border border-gray-300 rounded p-1.5 text-sm"
                                            value={g.margen}
                                            onChange={(e) => actualizarMargenGrupo(i, e.target.value)}
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-[10px] font-bold text-gray-400 mb-1">Precio venta (IVA inc.)</label>
                                        <input type="text" readOnly className="w-full border border-gray-200 bg-gray-50 rounded p-1.5 text-sm" value={Math.round(g.precioVenta) || 0} />
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                    <p className="text-[10px] text-gray-400 mt-3">
                        Los grupos de precio se calculan en pantalla a partir del precio de compra. Solo el precio del grupo principal se guarda como "Precio de venta" del producto.
                    </p>
                </div>
            </div>
        </div>
    );
};

export default AgregarProducto;