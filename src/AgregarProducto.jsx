import React, { useState, useEffect, useRef } from 'react';
import { supabase } from './supabaseClient';
import AperturaStock from './AperturaStock';
import { sonidoExito } from './utils/sonido';
import { useEmpresaInfo } from './utils/useEmpresa';
import { useConfiguracionEmpresa } from './utils/useConfiguracionEmpresa';
import { useLanguage } from './LanguageContext';
import { precioConIva, precioSinIva, precioVentaConIva as calcularPrecioVentaConIva, margenDesdeVentaConIva } from './utils/preciosIva';

const GARANTIAS = ['Sin garantía', '30 días', '3 meses', '6 meses', '1 año'];
const redondearMoneda = (valor, moneda) => moneda === 'PYG' ? Math.round(Number(valor) || 0) : Math.round((Number(valor) || 0) * 100) / 100;
const slugVariacion = (texto) => String(texto || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80);

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

const AgregarProducto = ({ onGuardado, onCancelar, productoEditar, ubicacionId }) => {
    const { t } = useLanguage();
    const { id: empresaId, nombre: nombreEmpresa } = useEmpresaInfo();
    const { ajustes: ajustesEmpresa, cargando: cargandoAjustesEmpresa } = useConfiguracionEmpresa(empresaId);
    const monedaPrecio = ['PYG', 'USD', 'EUR', 'BRL'].includes(ajustesEmpresa.currency) ? ajustesEmpresa.currency : 'PYG';
    const [tasaPygPorMoneda, setTasaPygPorMoneda] = useState(1);
    const [tasaPrecioLista, setTasaPrecioLista] = useState(false);
    const [monedaPrecioPersistible, setMonedaPrecioPersistible] = useState(false);
    const simboloMonedaPrecio = { PYG: 'Gs', USD: 'USD', EUR: '€', BRL: 'R$' }[monedaPrecio];
    const valoresInicialesAplicados = useRef(false);
    const prefijoSkuAplicado = useRef(false);
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

    const [imagenesProducto, setImagenesProducto] = useState([]);
    const imagenPreview = imagenesProducto[0] || null;
    const [datosAdicionales, setDatosAdicionales] = useState({});
    const [peso, setPeso] = useState('');
    const [mostrarCamposAdicionales, setMostrarCamposAdicionales] = useState(false);
    const [mostrarModulosIntegraciones, setMostrarModulosIntegraciones] = useState(false);
    const [urlImagen, setUrlImagen] = useState('');
    const [urlImagenAbierta, setUrlImagenAbierta] = useState(false);
    const inputCamaraRef = useRef(null);
    const inputFolletoRef = useRef(null);

    const [ivaPct, setIvaPct] = useState(10);
    const [tipoImpuestoPrecio, setTipoImpuestoPrecio] = useState('Incluido');
    const [tipoProducto, setTipoProducto] = useState('Individual');
    const [plantillasVariaciones, setPlantillasVariaciones] = useState([]);
    const [variacionesSeleccionadas, setVariacionesSeleccionadas] = useState([]);
    const [valoresVariacionSeleccionados, setValoresVariacionSeleccionados] = useState({});
    const [variantesEditadas, setVariantesEditadas] = useState({});
    const [variantesExistentes, setVariantesExistentes] = useState([]);
    const [cargandoVariantes, setCargandoVariantes] = useState(false);

    // Estados para productos tipo Combo
    const [catalogoProductos, setCatalogoProductos] = useState([]);
    const [comboProductos, setComboProductos] = useState([]);
    const [busquedaCombo, setBusquedaCombo] = useState('');
    const [filtradosCombo, setFiltradosCombo] = useState([]);

    // Ahora los 4 valores de precio son editables de forma independiente
    const [precioCompraSinIva, setPrecioCompraSinIva] = useState('');
    const [precioCompraConIva, setPrecioCompraConIva] = useState('');
    const [margenPct, setMargenPct] = useState(25);
    const [precioVentaConIva, setPrecioVentaConIva] = useState('');

    const [gruposPrecio, setGruposPrecio] = useState(
        GRUPOS_PRECIO_INICIALES.map((g) => ({ ...g, precioVenta: 0 }))
    );
    const [catalogoGruposPrecio, setCatalogoGruposPrecio] = useState([]);

    const [guardando, setGuardando] = useState(false);
    const [productoParaStock, setProductoParaStock] = useState(null);
    const [metadataProductoDisponible, setMetadataProductoDisponible] = useState(null);
    const [modalUnidadAbierto, setModalUnidadAbierto] = useState(false);
    const [unidadNuevaNombre, setUnidadNuevaNombre] = useState('');
    const [unidadNuevaCorta, setUnidadNuevaCorta] = useState('');
    const [unidadNuevaDecimal, setUnidadNuevaDecimal] = useState(false);
    const [modalCategoriaAbierto, setModalCategoriaAbierto] = useState(false);
    const [categoriaNuevaNombre, setCategoriaNuevaNombre] = useState('');
    const [categoriaNuevaCodigo, setCategoriaNuevaCodigo] = useState('');
    const [categoriaNuevaDescripcion, setCategoriaNuevaDescripcion] = useState('');
    const [categoriaNuevaPadre, setCategoriaNuevaPadre] = useState('');
    const [guardandoListaRapida, setGuardandoListaRapida] = useState(false);

    useEffect(() => {
        const cargarListas = async () => {
            if (!empresaId) return;
            const [resMarcas, resUnidades, resCategorias, resProductos, resVariaciones, resGruposPrecio] = await Promise.all([
                supabase.from('marcas').select('*').eq('empresa_id', empresaId).order('nombre', { ascending: true }),
                supabase.from('unidades').select('*').eq('empresa_id', empresaId).order('nombre', { ascending: true }),
                supabase.from('categorias_productos').select('*').eq('empresa_id', empresaId).order('nombre', { ascending: true }),
                supabase.from('productos').select('*').eq('empresa_id', empresaId).order('nombre', { ascending: true }),
                supabase.from('plantillas_variaciones').select('id,nombre,valores,activo').eq('empresa_id', empresaId).order('nombre', { ascending: true }),
                supabase.from('grupos_precios_venta').select('nombre,margen_default,activo').eq('empresa_id', empresaId).eq('activo', true).order('nombre', { ascending: true }),
            ]);
            if (!resMarcas.error && resMarcas.data) setMarcasDisponibles(resMarcas.data);
            if (!resUnidades.error && resUnidades.data) setUnidadesDisponibles(resUnidades.data);
            if (!resCategorias.error && resCategorias.data) setCategoriasDisponibles(resCategorias.data);
            if (!resProductos.error && resProductos.data) setCatalogoProductos(resProductos.data);
            if (!resVariaciones.error && resVariaciones.data) setPlantillasVariaciones(resVariaciones.data);
            if (!resGruposPrecio.error && resGruposPrecio.data) setCatalogoGruposPrecio(resGruposPrecio.data);
        };
        cargarListas();
    }, [empresaId]);

    useEffect(() => {
        if (!empresaId) return;
        let vigente = true;
        supabase.from('productos').select('datos_adicionales').eq('empresa_id', empresaId).limit(1)
            .then(({ error }) => { if (vigente) setMetadataProductoDisponible(!error); });
        return () => { vigente = false; };
    }, [empresaId]);

    useEffect(() => {
        if (cargandoAjustesEmpresa || valoresInicialesAplicados.current || productoEditar) return;
        valoresInicialesAplicados.current = true;
        const margenPredeterminado = Number(ajustesEmpresa.default_profit_percent);
        if (Number.isFinite(margenPredeterminado) && margenPredeterminado >= 0 && margenPredeterminado <= 100) {
            setMargenPct(margenPredeterminado);
        }
        const impuestoPredeterminado = { 'IVA 10%': 10, 'IVA 5%': 5, 'EXENTA': 0, 'Ninguna': 0 }[ajustesEmpresa.default_sales_tax];
        if (impuestoPredeterminado !== undefined) setIvaPct(impuestoPredeterminado);
    }, [ajustesEmpresa, cargandoAjustesEmpresa, productoEditar, unidadesDisponibles]);

    useEffect(() => {
        if (cargandoAjustesEmpresa) return undefined;
        let activo = true;
        setTasaPrecioLista(false);
        const cargarTasa = async () => {
            const fallback = { PYG: 1, USD: 7850, EUR: 8790, BRL: 1380 }[monedaPrecio] || 1;
            let tasa = fallback;
            if (monedaPrecio !== 'PYG') {
                try {
                    const response = await fetch('https://velocity.com.py/api');
                    if (!response.ok) throw new Error('No se pudo actualizar la tasa');
                    const data = await response.json();
                    const rates = data?.rates || {};
                    const vigente = monedaPrecio === 'USD' ? Number(rates.PYG)
                        : monedaPrecio === 'EUR' ? Number(rates.EUR_PYG)
                            : monedaPrecio === 'BRL' ? Number(rates.BRL_PYG) : null;
                    if (Number.isFinite(vigente) && vigente > 0) tasa = vigente;
                } catch (error) {
                    console.warn('No se actualizó la tasa para mostrar precios; se usará la tasa de respaldo:', error);
                }
                let margenGuardado = 0;
                try { margenGuardado = Number(localStorage.getItem('gda_margen_negocio')) || 0; } catch { /* almacenamiento opcional */ }
                tasa *= 1 + margenGuardado / 100;
            }
            if (activo) {
                setTasaPygPorMoneda(tasa);
                setTasaPrecioLista(true);
            }
        };
        cargarTasa();
        return () => { activo = false; };
    }, [cargandoAjustesEmpresa, monedaPrecio]);

    useEffect(() => {
        if (!empresaId) return undefined;
        let vigente = true;
        supabase.from('productos').select('moneda_precio,precio_venta_moneda').eq('empresa_id', empresaId).limit(1)
            .then(({ error }) => { if (vigente) setMonedaPrecioPersistible(!error); });
        return () => { vigente = false; };
    }, [empresaId]);

    useEffect(() => {
        if (cargandoAjustesEmpresa || prefijoSkuAplicado.current || productoEditar) return;
        prefijoSkuAplicado.current = true;
        const prefijoConfigurado = String(ajustesEmpresa.sku_prefix || '').trim();
        if (prefijoConfigurado) setSku((actual) => actual || prefijoConfigurado);
    }, [ajustesEmpresa.sku_prefix, cargandoAjustesEmpresa, productoEditar]);

    useEffect(() => {
        if (cargandoAjustesEmpresa || productoEditar || unidad || !ajustesEmpresa.default_unit || !unidadesDisponibles.length) return;
        const buscada = String(ajustesEmpresa.default_unit).split(' (')[0].trim().toLocaleLowerCase('es');
        const unidadCoincidente = unidadesDisponibles.find((item) => item.nombre.toLocaleLowerCase('es') === buscada);
        if (unidadCoincidente) setUnidad(unidadCoincidente.nombre);
    }, [ajustesEmpresa.default_unit, cargandoAjustesEmpresa, productoEditar, unidad, unidadesDisponibles]);

    useEffect(() => {
        if (!productoEditar || !tasaPrecioLista) return;

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
        const adicionales = productoEditar.datos_adicionales && typeof productoEditar.datos_adicionales === 'object' ? productoEditar.datos_adicionales : {};
        setDatosAdicionales(adicionales);
        setTipoCodigoBarra(adicionales.tipo_codigo_barras || 'Code 128 (C128)');
        setPeso(productoEditar.peso ?? '');
        setImagenesProducto([...new Set([productoEditar.imagen_url, ...(Array.isArray(adicionales.imagenes) ? adicionales.imagenes : [])].filter(Boolean))].slice(0, 5));
        setTipoImpuestoPrecio(productoEditar.tipo_impuesto || 'Incluido');
        setTipoProducto(productoEditar.tipo_producto || 'Individual');
        if (productoEditar.tipo_producto === 'Variable') setAdministraStock(false);
        setComboProductos(productoEditar.combo_productos || []);

        const ivaGuardado = productoEditar.iva ? parseInt(productoEditar.iva.replace(/\D/g, '')) || 0 : 10;
        setIvaPct(ivaGuardado);

        const monedaGuardada = productoEditar.moneda_precio || 'PYG';
        const factorVisual = monedaGuardada === monedaPrecio ? 1 : tasaPygPorMoneda;
        const compraConIva = monedaGuardada === monedaPrecio && Number.isFinite(Number(productoEditar.precio_compra_moneda))
            ? Number(productoEditar.precio_compra_moneda)
            : (Number(productoEditar.precio_compra) || 0) / factorVisual;
        const compraSinIva = precioSinIva(compraConIva, ivaGuardado);
        const ventaConIva = monedaGuardada === monedaPrecio && Number.isFinite(Number(productoEditar.precio_venta_moneda))
            ? Number(productoEditar.precio_venta_moneda)
            : (Number(productoEditar.precio_venta) || 0) / factorVisual;
        setPrecioCompraSinIva(compraSinIva ? compraSinIva.toFixed(0) : '');
        setPrecioCompraConIva(compraConIva || '');
        setPrecioVentaConIva(ventaConIva || '');

        if (compraSinIva > 0 && ventaConIva > 0) {
            const margenCalculado = margenDesdeVentaConIva(compraSinIva, ventaConIva, ivaGuardado);
            setMargenPct(margenCalculado.toFixed(1));
        }
        const gruposGuardados = Array.isArray(productoEditar.grupos_precio) ? productoEditar.grupos_precio : [];
        const gruposBase = gruposGuardados.length > 0 ? gruposGuardados : GRUPOS_PRECIO_INICIALES;
        setGruposPrecio(gruposBase.map((grupo) => {
            const margenGrupo = Number(grupo.margen) || 0;
            const precioGuardado = Number(grupo.precioVenta ?? grupo.precio_venta);
            const precioCalculado = calcularPrecioVentaConIva(compraSinIva, margenGrupo, ivaGuardado);
            return {
                ...grupo,
                margen: grupo.margen ?? margenGrupo,
                precioVenta: Number.isFinite(precioGuardado) && precioGuardado > 0 ? precioGuardado : precioCalculado,
            };
        }));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [productoEditar, tasaPrecioLista, tasaPygPorMoneda, monedaPrecio]);

    useEffect(() => {
        if (!productoEditar || productoEditar.tipo_producto !== 'Variable' || !empresaId || !tasaPrecioLista) return;
        let vigente = true;
        const cargarVariantes = async () => {
            setCargandoVariantes(true);
            const { data, error } = await supabase.from('productos').select('id,codigo,precio_venta,precio_venta_moneda,moneda_precio,atributos_variacion,activo')
                .eq('empresa_id', empresaId).eq('producto_padre_id', productoEditar.id).order('nombre');
            if (!vigente) return;
            if (error) {
                console.error('No se pudieron leer las variantes del producto:', error.message);
                setCargandoVariantes(false);
                return;
            }
            const filas = data || [];
            setVariantesExistentes(filas);
            const atributos = filas.flatMap((fila) => Array.isArray(fila.atributos_variacion) ? fila.atributos_variacion : []);
            const ids = [...new Set(atributos.map((a) => a.plantilla_id).filter(Boolean))];
            const valoresPorPlantilla = Object.fromEntries(ids.map((id) => [id, [...new Set(atributos.filter((a) => a.plantilla_id === id).map((a) => a.valor))]]));
            setVariacionesSeleccionadas(ids);
            setValoresVariacionSeleccionados(valoresPorPlantilla);
            setVariantesEditadas(Object.fromEntries(filas.map((fila) => [JSON.stringify((fila.atributos_variacion || []).map((a) => [a.plantilla_id, a.valor]).sort()), {
                productoId: fila.id, codigo: fila.codigo || '', precioVenta: String(fila.moneda_precio === monedaPrecio && fila.precio_venta_moneda != null ? fila.precio_venta_moneda : (Number(fila.precio_venta) || 0) / tasaPygPorMoneda),
            }])));
            setCargandoVariantes(false);
        };
        cargarVariantes();
        return () => { vigente = false; };
    }, [productoEditar, empresaId, tasaPrecioLista, tasaPygPorMoneda, monedaPrecio]);

    // === RECALCULO EN CADENA (compra → venta), cada campo puede editarse a mano ===

    // 1) Escribís "IVA no incluido" → recalcula "IVA incluido" y el precio de venta
    const handlePrecioCompraSinIva = (valor) => {
        setPrecioCompraSinIva(valor);
        const base = Number(valor) || 0;
        setPrecioCompraConIva(base ? precioConIva(base, ivaPct).toFixed(0) : '');
        recalcularVentaDesdeCompra(base, margenPct);
    };

    // 2) Escribís "IVA incluido" (precio de compra CON iva) → recalcula "IVA no incluido" y el precio de venta
    const handlePrecioCompraConIva = (valor) => {
        setPrecioCompraConIva(valor);
        const conIva = Number(valor) || 0;
        const sinIva = conIva ? precioSinIva(conIva, ivaPct) : 0;
        setPrecioCompraSinIva(sinIva ? sinIva.toFixed(0) : '');
        recalcularVentaDesdeCompra(sinIva, margenPct);
    };

    // 3) Escribís el Margen (%) → recalcula el precio de venta
    const handleMargenPct = (valor) => {
        setMargenPct(valor);
        recalcularVentaDesdeCompra(Number(precioCompraSinIva) || 0, Number(valor) || 0);
    };

    const recalcularVentaDesdeCompra = (compraSinIva, margen) => {
        const ventaConIva = calcularPrecioVentaConIva(compraSinIva, margen, ivaPct);
        setPrecioVentaConIva(ventaConIva ? ventaConIva.toFixed(0) : '');
        setGruposPrecio((prev) => prev.map((grupo) => ({
            ...grupo,
            precioVenta: calcularPrecioVentaConIva(compraSinIva, Number(grupo.margen) || 0, ivaPct),
        })));
    };

    // 4) Escribís "Incluyendo impuesto" (precio de venta) directamente → recalcula el margen %
    const handlePrecioVentaConIva = (valor) => {
        setPrecioVentaConIva(valor);
        const ventaConIva = Number(valor) || 0;
        const compraSinIva = Number(precioCompraSinIva) || 0;
        if (compraSinIva > 0) {
            const nuevoMargen = margenDesdeVentaConIva(compraSinIva, ventaConIva, ivaPct);
            setMargenPct(nuevoMargen.toFixed(1));
        }
    };

    // Si cambia el % de IVA, recalculamos todo a partir del precio de compra sin IVA
    const handleIvaPct = (nuevoIva) => {
        setIvaPct(nuevoIva);
        const base = Number(precioCompraSinIva) || 0;
        setPrecioCompraConIva(base ? precioConIva(base, nuevoIva).toFixed(0) : '');
        const ventaConIva = calcularPrecioVentaConIva(base, margenPct, nuevoIva);
        setPrecioVentaConIva(ventaConIva ? ventaConIva.toFixed(0) : '');
        setGruposPrecio((prev) => prev.map((grupo) => ({
            ...grupo,
            precioVenta: calcularPrecioVentaConIva(base, Number(grupo.margen) || 0, nuevoIva),
        })));
    };

    // --- FUNCIONES Y EFECTO PARA PRODUCTOS COMBO ---
    const manejarBusquedaCombo = (texto) => {
        setBusquedaCombo(texto);
        if (texto.trim() === '') {
            setFiltradosCombo([]);
            return;
        }
        const query = texto.toLowerCase();
        setFiltradosCombo(
            catalogoProductos.filter((p) => {
                const esMismoProducto = productoEditar && p.id === productoEditar.id;
                return !esMismoProducto && p.tipo_producto !== 'Variable' && p.activo !== false && (p.nombre.toLowerCase().includes(query) || (p.codigo && p.codigo.toLowerCase().includes(query)));
            }).slice(0, 5)
        );
    };

    const agregarProductoAlCombo = (prod) => {
        if (comboProductos.find((item) => item.id === prod.id)) {
            alert('Este producto ya fue agregado al combo.');
            return;
        }
        setComboProductos([
            ...comboProductos,
            {
                id: prod.id,
                nombre: prod.nombre,
                cantidad: 1,
                unidad: prod.unidad || 'UNID',
                precio_compra: prod.precio_compra || 0,
            },
        ]);
        setBusquedaCombo('');
        setFiltradosCombo([]);
    };

    useEffect(() => {
        if (tipoProducto === 'Combo') {
            const totalSinIva = comboProductos.reduce((sum, item) => sum + (Number(item.precio_compra) || 0) * (Number(item.cantidad) || 0), 0);
            setPrecioCompraSinIva(totalSinIva);
            setPrecioCompraConIva(precioConIva(totalSinIva, ivaPct).toFixed(0));
            
            // Recalcular la venta usando el margen actual
            const ventaConIva = calcularPrecioVentaConIva(totalSinIva, margenPct, ivaPct);
            setPrecioVentaConIva(ventaConIva ? ventaConIva.toFixed(0) : '');
        }
    }, [comboProductos, tipoProducto, ivaPct, margenPct]);

    const actualizarMargenGrupo = (index, nuevoMargen) => {
        setGruposPrecio((prev) =>
            prev.map((g, i) => {
                if (i !== index) return g;
                const base = precioCompraSinIva ? Number(precioCompraSinIva) : 0;
                const venta = calcularPrecioVentaConIva(base, Number(nuevoMargen), ivaPct);
                return { ...g, margen: nuevoMargen, precioVenta: venta };
            })
        );
    };

    const actualizarPrecioGrupo = (index, nuevoPrecio) => {
        const precio = Number(nuevoPrecio);
        if (!Number.isFinite(precio) || precio < 0) return;
        const base = Number(precioCompraSinIva) || 0;
        const nuevoMargen = base > 0 ? margenDesdeVentaConIva(base, precio, ivaPct) : 0;
        setGruposPrecio((prev) => prev.map((grupo, i) => i === index
            ? { ...grupo, precioVenta: precio, margen: nuevoMargen.toFixed(1) }
            : grupo));
    };

    const eliminarGrupo = (index) => {
        setGruposPrecio((prev) => prev.filter((_, i) => i !== index));
    };

    const agregarGrupo = () => {
        const nombreGrupo = prompt('Nombre del nuevo grupo de precio:');
        if (!nombreGrupo) return;
        const nombreLimpio = nombreGrupo.trim();
        if (!nombreLimpio) return;
        if (gruposPrecio.some((g) => String(g.nombre || '').trim().toLowerCase() === nombreLimpio.toLowerCase())) return alert('Este grupo ya está agregado al producto.');
        const grupoCatalogo = catalogoGruposPrecio.find((g) => g.nombre.trim().toLowerCase() === nombreLimpio.toLowerCase());
        if (catalogoGruposPrecio.length && !grupoCatalogo) return alert('Primero creá el grupo en Productos → Grupo de precios de venta.');
        const margenGrupo = Number(grupoCatalogo?.margen_default ?? 25) || 0;
        const precioVentaGrupo = calcularPrecioVentaConIva(Number(precioCompraSinIva) || 0, margenGrupo, ivaPct);
        setGruposPrecio((prev) => [...prev, { nombre: grupoCatalogo?.nombre || nombreLimpio, margen: margenGrupo, precioVenta: precioVentaGrupo }]);
    };

    const abrirUnidadRapida = () => {
        setUnidadNuevaNombre(''); setUnidadNuevaCorta(''); setUnidadNuevaDecimal(false); setModalUnidadAbierto(true);
    };

    const guardarUnidadRapida = async (event) => {
        event.preventDefault();
        const nuevoNombre = unidadNuevaNombre.trim();
        const nombreCorto = unidadNuevaCorta.trim();
        if (!nuevoNombre || !nombreCorto) return alert('Completá el nombre y el nombre corto de la unidad.');
        if (unidadesDisponibles.some((item) => item.nombre.toLocaleLowerCase('es') === nuevoNombre.toLocaleLowerCase('es'))) return alert('Ya existe una unidad con ese nombre.');
        setGuardandoListaRapida(true);
        try {
            const { data, error } = await supabase.from('unidades').insert([{ nombre: nuevoNombre, nombre_corto: nombreCorto, permitir_decimal: unidadNuevaDecimal, empresa_id: empresaId }]).select().single();
            if (error) throw error;
            setUnidadesDisponibles((actuales) => [...actuales, data].sort((a, b) => a.nombre.localeCompare(b.nombre)));
            setUnidad(data.nombre);
            setModalUnidadAbierto(false);
        } catch (error) { alert('No se pudo crear la unidad: ' + error.message); }
        finally { setGuardandoListaRapida(false); }
    };

    const crearMarcaRapida = async () => {
        const nuevoNombre = prompt('Nombre de la marca:')?.trim();
        if (!nuevoNombre) return;
        try {
            const { data, error } = await supabase.from('marcas').insert([{ nombre: nuevoNombre, empresa_id: empresaId }]).select().single();
            if (error) throw error;
            setMarcasDisponibles((actuales) => [...actuales, data].sort((a, b) => a.nombre.localeCompare(b.nombre)));
            setMarca(data.nombre);
        } catch (error) { alert('No se pudo crear la marca: ' + error.message); }
    };

    const abrirCategoriaRapida = () => {
        setCategoriaNuevaNombre(''); setCategoriaNuevaCodigo(''); setCategoriaNuevaDescripcion(''); setCategoriaNuevaPadre(''); setModalCategoriaAbierto(true);
    };

    const guardarCategoriaRapida = async (event) => {
        event.preventDefault();
        const nuevoNombre = categoriaNuevaNombre.trim();
        if (!nuevoNombre) return alert('El nombre de la categoría es obligatorio.');
        if (categoriasDisponibles.some((item) => item.nombre.toLocaleLowerCase('es') === nuevoNombre.toLocaleLowerCase('es') && String(item.categoria_padre_id || '') === categoriaNuevaPadre)) return alert('Ya existe una categoría con ese nombre bajo ese nivel.');
        setGuardandoListaRapida(true);
        try {
            const { data, error } = await supabase.from('categorias_productos').insert([{ nombre: nuevoNombre, codigo: categoriaNuevaCodigo.trim() || null, descripcion: categoriaNuevaDescripcion.trim() || null, categoria_padre_id: categoriaNuevaPadre || null, empresa_id: empresaId }]).select().single();
            if (error) throw error;
            setCategoriasDisponibles((actuales) => [...actuales, data].sort((a, b) => a.nombre.localeCompare(b.nombre)));
            const padre = categoriasDisponibles.find((item) => String(item.id) === String(categoriaNuevaPadre));
            setCategoria(padre?.nombre || data.nombre);
            setSubcategoria(padre ? data.nombre : '');
            setModalCategoriaAbierto(false);
        } catch (error) { alert('No se pudo crear la categoría: ' + error.message); }
        finally { setGuardandoListaRapida(false); }
    };

    const dimensionesVariacion = plantillasVariaciones.filter((plantilla) => variacionesSeleccionadas.includes(plantilla.id)).map((plantilla) => ({
        plantilla,
        valores: (valoresVariacionSeleccionados[plantilla.id] || []).filter((valor) => (plantilla.valores || []).includes(valor)),
    }));
    const variantesExcedenLimite = dimensionesVariacion.reduce((total, dimension) => total * Math.max(1, dimension.valores.length), 1) > 100;
    let combinacionesVariacion = [];
    if (dimensionesVariacion.length && dimensionesVariacion.every((dimension) => dimension.valores.length) && !variantesExcedenLimite) {
        combinacionesVariacion = dimensionesVariacion.reduce((combinaciones, dimension) => combinaciones.flatMap((atributos) => dimension.valores.map((valor) => [
            ...atributos,
            { plantilla_id: dimension.plantilla.id, nombre: dimension.plantilla.nombre, valor },
        ])), [[]]);
    }
    const claveCombinacion = (atributos) => JSON.stringify(atributos.map((a) => [a.plantilla_id, a.valor]).sort(([idA, valorA], [idB, valorB]) => String(idA).localeCompare(String(idB)) || String(valorA).localeCompare(String(valorB))));
    const actualizarVariante = (clave, campo, valor) => setVariantesEditadas((prev) => ({ ...prev, [clave]: { ...prev[clave], [campo]: valor } }));
    const alternarPlantillaVariacion = (plantilla, marcada) => {
        setVariacionesSeleccionadas((prev) => marcada ? [...new Set([...prev, plantilla.id])] : prev.filter((id) => id !== plantilla.id));
        setValoresVariacionSeleccionados((prev) => ({ ...prev, [plantilla.id]: marcada ? [...(plantilla.valores || [])] : [] }));
    };
    const plantillasDisponiblesFormulario = plantillasVariaciones.filter((plantilla) => plantilla.activo || variacionesSeleccionadas.includes(plantilla.id));

    const [subiendoImagen, setSubiendoImagen] = useState(false);

    const comprimirImagen = async (file) => {
        if (file.size > 5 * 1024 * 1024) throw new Error(`${file.name} supera los 5 MB.`);
        const bitmap = await createImageBitmap(file);
        const lado = Math.min(bitmap.width, bitmap.height);
        const x = Math.round((bitmap.width - lado) / 2);
        const y = Math.round((bitmap.height - lado) / 2);
        const canvas = document.createElement('canvas');
        canvas.width = 1200;
        canvas.height = 1200;
        canvas.getContext('2d').drawImage(bitmap, x, y, lado, lado, 0, 0, 1200, 1200);
        bitmap.close();
        const blob = await new Promise((resolve, reject) => canvas.toBlob((value) => value ? resolve(value) : reject(new Error('No se pudo comprimir la imagen.')), 'image/jpeg', 0.86));
        return new File([blob], `${file.name.replace(/\.[^.]+$/, '')}.jpg`, { type: 'image/jpeg' });
    };

    const subirArchivoProducto = async (file) => {
        const extension = file.name.split('.').pop()?.replace(/[^a-zA-Z0-9]/g, '').toLowerCase() || 'bin';
        const nombreArchivo = `${empresaId}/${crypto.randomUUID()}.${extension}`;
        const { error: errorSubida } = await supabase.storage.from('productos').upload(nombreArchivo, file, { upsert: false, contentType: file.type || undefined });
        if (errorSubida) throw errorSubida;
        return supabase.storage.from('productos').getPublicUrl(nombreArchivo).data.publicUrl;
    };

    const manejarImagenes = async (files) => {
        const seleccionadas = Array.from(files || []).filter((file) => file.type.startsWith('image/'));
        if (!seleccionadas.length) return;
        const disponibles = Math.max(0, 5 - imagenesProducto.length);
        if (!disponibles) return alert('Este producto ya tiene el máximo de 5 imágenes.');
        if (seleccionadas.length > disponibles) alert(`Se agregarán solo ${disponibles} imagen(es) para respetar el máximo de 5.`);
        setSubiendoImagen(true);
        try {
            const urls = [];
            for (const file of seleccionadas.slice(0, disponibles)) urls.push(await subirArchivoProducto(await comprimirImagen(file)));
            setImagenesProducto((actuales) => [...actuales, ...urls].slice(0, 5));
        } catch (error) {
            console.error(error);
            alert('No se pudieron subir las imágenes: ' + error.message + '\n\nVerificá que el bucket "productos" esté configurado en Supabase Storage.');
        } finally {
            setSubiendoImagen(false);
        }
    };

    const manejarFolleto = async (file) => {
        if (!file) return;
        if (file.size > 5 * 1024 * 1024) return alert('El folleto no puede superar los 5 MB.');
        setSubiendoImagen(true);
        try {
            const url = await subirArchivoProducto(file);
            setDatosAdicionales((actuales) => ({ ...actuales, folleto_url: url, folleto_nombre: file.name }));
        } catch (error) {
            alert('No se pudo subir el folleto: ' + error.message);
        } finally {
            setSubiendoImagen(false);
        }
    };

    const agregarImagenDesdeUrl = () => {
        try {
            const url = new URL(urlImagen.trim());
            if (!['http:', 'https:'].includes(url.protocol)) throw new Error();
            if (imagenesProducto.length >= 5) return alert('Este producto ya tiene el máximo de 5 imágenes.');
            setImagenesProducto((actuales) => [...actuales, url.href]);
            setUrlImagen('');
            setUrlImagenAbierta(false);
        } catch {
            alert('Ingresá un enlace válido que empiece con http:// o https://.');
        }
    };

    const limpiarFormulario = () => {
        setNombre(''); setSku(''); setUnidad(''); setMarca(''); setCategoria(''); setSubcategoria(''); setGarantia('');
        setDescripcion(''); setAdministraStock(true); setCantidadAlerta(''); setExpiraCantidad('');
        setImagenesProducto([]); setDatosAdicionales({}); setPeso(''); setUrlImagen(''); setPrecioCompraSinIva(''); setPrecioCompraConIva(''); setPrecioVentaConIva(''); setMargenPct(25);
        setComboProductos([]);
        setVariacionesSeleccionadas([]); setValoresVariacionSeleccionados({}); setVariantesEditadas({}); setVariantesExistentes([]);
        setTipoProducto('Individual');
        setBusquedaCombo('');
        setFiltradosCombo([]);
        setGruposPrecio(GRUPOS_PRECIO_INICIALES.map((grupo) => ({ ...grupo, precioVenta: 0 })));
    };

    const guardarProducto = async (opcion) => {
        if (metadataProductoDisponible === null) return alert('Espera a que se verifique la configuración de campos del producto.');
        const usaMetadataExtendida = imagenesProducto.length > 1 || Boolean(datosAdicionales.folleto_url || datosAdicionales.administra_serie || datosAdicionales.no_vender || datosAdicionales.servicio_ejecutar || Object.keys(datosAdicionales).some((key) => key.startsWith('campo_personalizado_') && String(datosAdicionales[key] || '').trim()));
        if (usaMetadataExtendida && !metadataProductoDisponible) return alert('Para guardar las imágenes adicionales, el folleto y los campos personalizados, primero aplicá database/migration_productos_datos_adicionales.sql en Supabase. No se guardó el producto.');
        if (!tasaPrecioLista || !Number.isFinite(tasaPygPorMoneda) || tasaPygPorMoneda <= 0) return alert('Espera a que se cargue una tasa válida para los precios.');
        if (monedaPrecio !== 'PYG' && !monedaPrecioPersistible) return alert('Para guardar productos con precios en otra moneda, primero aplica database/migration_ventas_multimoneda.sql en Supabase.');
        if (!nombre.trim()) return alert('El nombre del producto es obligatorio.');
        if (!unidad) return alert('Seleccioná la unidad.');
        if (productoEditar?.tipo_producto === 'Variable' && tipoProducto !== 'Variable' && variantesExistentes.length) {
            return alert('No se puede cambiar el tipo mientras este producto tenga variantes asociadas. Conservá el tipo Variable para proteger sus códigos y stock.');
        }
        if (tipoProducto === 'Variable') {
            if (productoEditar?.tipo_producto === 'Variable' && cargandoVariantes) return alert('Espera a que termine de cargar la lista de variantes.');
            if (!sku.trim()) return alert('Ingresá un SKU base para generar códigos únicos para cada variante.');
            if (variantesExcedenLimite) return alert('La combinación supera 100 variantes. Reducí los valores seleccionados.');
            if (!combinacionesVariacion.length) return alert('Seleccioná al menos una variación activa y uno de sus valores.');
            if (opcion === 'cargar_stock') return alert('El stock inicial se carga por variante desde el catálogo una vez guardado.');
            const codigos = combinacionesVariacion.map((atributos) => {
                const clave = claveCombinacion(atributos);
                const defecto = `${slugVariacion(sku)}-${slugVariacion(atributos.map((a) => a.valor).join('-'))}`.slice(0, 100);
                return String(variantesEditadas[clave]?.codigo || defecto).trim().toLowerCase();
            });
            if (new Set(codigos).size !== codigos.length) return alert('Cada combinación debe tener un código distinto.');
        }

        if (!productoEditar && empresaId) {
            const { data: limites } = await supabase.rpc('consultar_limites_empresa', { p_empresa_id: empresaId });
            if (limites?.productos >= limites?.limite_productos) {
                alert(`Aviso: tu plan ${limites.plan || ''} alcanzó el límite de ${limites.limite_productos} productos. Podés continuar, pero conviene actualizar el plan.`);
            }
        }

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
                administra_stock: tipoProducto === 'Variable' ? false : administraStock,
                alerta_stock_bajo: cantidadAlerta ? Number(cantidadAlerta) : 5,
                expira_cantidad: expiraCantidad ? Number(expiraCantidad) : null,
                expira_unidad: expiraUnidad,
                imagen_url: imagenPreview || null,
                peso: peso === '' ? null : Number(peso),
                ...(metadataProductoDisponible ? { datos_adicionales: {
                    ...datosAdicionales,
                    imagenes: imagenesProducto.slice(1),
                    ...(tipoCodigoBarra !== 'Code 128 (C128)' ? { tipo_codigo_barras: tipoCodigoBarra } : {}),
                } } : {}),
                precio_compra: (Number(precioCompraConIva) || 0) * tasaPygPorMoneda,
                precio_venta: Math.round((Number(precioVentaConIva) || 0) * tasaPygPorMoneda),
                moneda_precio: monedaPrecio,
                precio_compra_moneda: Number(precioCompraConIva) || 0,
                precio_venta_moneda: Number(precioVentaConIva) || 0,
                iva: `IVA ${ivaPct}%`,
                tipo_impuesto: tipoImpuestoPrecio,
                tipo_producto: tipoProducto,
                combo_productos: tipoProducto === 'Combo' ? comboProductos : null,
                producto_padre_id: productoEditar?.producto_padre_id || null,
                atributos_variacion: productoEditar?.atributos_variacion || [],
                grupos_precio: gruposPrecio.map((grupo) => ({
                    nombre: String(grupo.nombre || '').trim(),
                    margen: Number(grupo.margen) || 0,
                    precioVenta: redondearMoneda(grupo.precioVenta, monedaPrecio),
                    precioVentaPyg: Math.round((Number(grupo.precioVenta) || 0) * tasaPygPorMoneda),
                    moneda: monedaPrecio,
                })).filter((grupo) => grupo.nombre),
            };
            if (!monedaPrecioPersistible) {
                delete datosProducto.moneda_precio;
                delete datosProducto.precio_compra_moneda;
                delete datosProducto.precio_venta_moneda;
            }

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

            if (tipoProducto === 'Variable' && productoGuardado?.id) {
                const existentesPorClave = new Map(variantesExistentes.map((fila) => [claveCombinacion(fila.atributos_variacion || []), fila]));
                const variantesPendientes = combinacionesVariacion.map((atributos) => {
                    const clave = claveCombinacion(atributos);
                    const edicion = variantesEditadas[clave] || {};
                    const existente = existentesPorClave.get(clave);
                    const codigoDefault = `${slugVariacion(sku)}-${slugVariacion(atributos.map((a) => a.valor).join('-'))}`.slice(0, 100);
                    const precioVariante = Math.max(0, redondearMoneda(edicion.precioVenta ?? precioVentaConIva, monedaPrecio));
                    const precioBase = Number(precioVentaConIva) || 0;
                    const factor = precioBase > 0 ? precioVariante / precioBase : 1;
                    const nombreAtributos = atributos.map((a) => `${a.nombre}: ${a.valor}`).join(' / ');
                    return {
                        id: existente?.id || edicion.productoId || null,
                        datos: {
                            nombre: `${nombre.trim()} (${nombreAtributos})`,
                            codigo: String(edicion.codigo || codigoDefault).trim(),
                            unidad,
                            marca: marca || null,
                            categoria: categoria || null,
                            subcategoria: subcategoria || null,
                            garantia: garantia || null,
                            descripcion: descripcion || null,
                            administra_stock: true,
                            alerta_stock_bajo: cantidadAlerta ? Number(cantidadAlerta) : 5,
                            expira_cantidad: expiraCantidad ? Number(expiraCantidad) : null,
                            expira_unidad: expiraUnidad,
                            imagen_url: imagenPreview || null,
                            peso: peso === '' ? null : Number(peso),
                            ...(metadataProductoDisponible ? { datos_adicionales: { ...datosAdicionales, imagenes: imagenesProducto.slice(1), ...(tipoCodigoBarra !== 'Code 128 (C128)' ? { tipo_codigo_barras: tipoCodigoBarra } : {}) } } : {}),
                            precio_compra: (Number(precioCompraConIva) || 0) * tasaPygPorMoneda,
                            precio_venta: Math.round(precioVariante * tasaPygPorMoneda),
                            moneda_precio: monedaPrecio,
                            precio_compra_moneda: Number(precioCompraConIva) || 0,
                            precio_venta_moneda: precioVariante,
                            activo: true,
                            iva: `IVA ${ivaPct}%`,
                            tipo_impuesto: tipoImpuestoPrecio,
                            tipo_producto: 'Individual',
                            combo_productos: null,
                            grupos_precio: datosProducto.grupos_precio.map((grupo) => ({ ...grupo, precioVenta: Math.round(Number(grupo.precioVenta || 0) * factor) })),
                            producto_padre_id: productoGuardado.id,
                            atributos_variacion: atributos,
                        },
                    };
                });
                if (!monedaPrecioPersistible) variantesPendientes.forEach(({ datos }) => {
                    delete datos.moneda_precio;
                    delete datos.precio_compra_moneda;
                    delete datos.precio_venta_moneda;
                });
                const nuevasVariantes = variantesPendientes.filter((fila) => !fila.id).map((fila) => ({ ...fila.datos, stock_actual: 0, empresa_id: empresaId }));
                if (nuevasVariantes.length) {
                    const { error: errorNuevas } = await supabase.from('productos').insert(nuevasVariantes);
                    if (errorNuevas) {
                        if (!productoEditar) await supabase.from('productos').delete().eq('id', productoGuardado.id).eq('empresa_id', empresaId);
                        throw errorNuevas;
                    }
                }
                for (const fila of variantesPendientes.filter((variante) => variante.id)) {
                    const { error: errorVariante } = await supabase.from('productos').update(fila.datos)
                        .eq('id', fila.id).eq('producto_padre_id', productoGuardado.id).eq('empresa_id', empresaId);
                    if (errorVariante) throw errorVariante;
                }
            }

            if (opcion === 'cargar_stock') {
                // No cerramos todavía: pasamos a la pantalla de Stock de Apertura
                setProductoParaStock(productoGuardado);
                return;
            }

            // Notificamos a PuntoDeVenta (y a cualquier otro componente que escuche)
            // para que recargue la grilla de productos con los datos actualizados.
            window.dispatchEvent(new Event('stock-actualizado'));

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
                ubicacionId={ubicacionId}
                onGuardado={() => { setProductoParaStock(null); if (onGuardado) onGuardado('cargar_stock'); }}
                onCancelar={() => { setProductoParaStock(null); if (onGuardado) onGuardado('cargar_stock'); }}
            />
        );
    }

    return (
        <div className="product-create-form bg-transparent text-sm text-gray-700 p-3 sm:p-5">
            {modalUnidadAbierto && <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/50 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget && !guardandoListaRapida) setModalUnidadAbierto(false); }}>
                <section role="dialog" aria-modal="true" aria-labelledby="titulo-nueva-unidad" className="w-full max-w-md overflow-hidden rounded-xl bg-white shadow-2xl">
                    <header className="flex items-center justify-between bg-[#5b4fcf] px-5 py-4"><h3 id="titulo-nueva-unidad" className="text-lg font-bold text-white">Agregar unidad</h3><button type="button" onClick={() => setModalUnidadAbierto(false)} className="text-xl leading-none text-white/80 hover:text-white" aria-label="Cerrar">×</button></header>
                    <form onSubmit={guardarUnidadRapida} className="flex flex-col gap-4 p-6">
                        <div><label className="mb-1 block text-sm font-bold text-gray-700">Nombre de la unidad:*</label><input autoFocus required value={unidadNuevaNombre} onChange={(event) => { const value = event.target.value; setUnidadNuevaNombre(value); setUnidadNuevaCorta((actual) => actual || value.replace(/[^\p{L}\p{N}]/gu, '').slice(0, 8).toUpperCase()); }} placeholder="Ej.: Litros" className="w-full rounded border border-gray-300 p-2.5 text-sm outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100" /></div>
                        <div><label className="mb-1 block text-sm font-bold text-gray-700">Nombre corto:*</label><input required value={unidadNuevaCorta} onChange={(event) => setUnidadNuevaCorta(event.target.value)} placeholder="Ej.: LS" className="w-full rounded border border-gray-300 p-2.5 text-sm outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100" /></div>
                        <label className="flex items-center gap-2 text-sm text-gray-700"><input type="checkbox" checked={unidadNuevaDecimal} onChange={(event) => setUnidadNuevaDecimal(event.target.checked)} className="accent-orange-500" />¿Permitir decimal? <span className="text-blue-500" title="Activalo si se puede vender fraccionada, por ejemplo 1.5 Kg">ⓘ</span></label>
                        <div className="flex justify-end gap-2 border-t border-gray-100 pt-3"><button type="submit" disabled={guardandoListaRapida} className="rounded bg-orange-500 px-5 py-2 text-sm font-bold text-white hover:bg-orange-600 disabled:opacity-60">{guardandoListaRapida ? 'Guardando...' : 'Guardar'}</button><button type="button" disabled={guardandoListaRapida} onClick={() => setModalUnidadAbierto(false)} className="rounded border border-gray-300 px-5 py-2 text-sm font-bold text-gray-600 hover:bg-gray-50">Cerrar</button></div>
                    </form>
                </section>
            </div>}
            {modalCategoriaAbierto && <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/50 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget && !guardandoListaRapida) setModalCategoriaAbierto(false); }}>
                <section role="dialog" aria-modal="true" aria-labelledby="titulo-nueva-categoria" className="w-full max-w-md overflow-hidden rounded-xl bg-white shadow-2xl">
                    <header className="flex items-center justify-between bg-[#5b4fcf] px-5 py-4"><h3 id="titulo-nueva-categoria" className="text-lg font-bold text-white">Agregar categoría</h3><button type="button" onClick={() => setModalCategoriaAbierto(false)} className="text-xl leading-none text-white/80 hover:text-white" aria-label="Cerrar">×</button></header>
                    <form onSubmit={guardarCategoriaRapida} className="flex max-h-[85vh] flex-col gap-4 overflow-y-auto p-6">
                        <div><label className="mb-1 block text-sm font-bold text-gray-700">Nombre de la categoría:*</label><input autoFocus required value={categoriaNuevaNombre} onChange={(event) => setCategoriaNuevaNombre(event.target.value)} placeholder="Nombre de la categoría" className="w-full rounded border border-gray-300 p-2.5 text-sm outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100" /></div>
                        <div><label className="mb-1 block text-sm font-bold text-gray-700">Categoría padre (opcional):</label><select value={categoriaNuevaPadre} onChange={(event) => setCategoriaNuevaPadre(event.target.value)} className="w-full rounded border border-gray-300 bg-white p-2.5 text-sm"><option value="">Ninguna (categoría principal)</option>{categoriasDisponibles.filter((item) => !item.categoria_padre_id).map((item) => <option key={item.id} value={item.id}>{item.nombre}</option>)}</select></div>
                        <div><label className="mb-1 block text-sm font-bold text-gray-700">Código de categoría:</label><input value={categoriaNuevaCodigo} onChange={(event) => setCategoriaNuevaCodigo(event.target.value)} placeholder="Opcional" className="w-full rounded border border-gray-300 p-2.5 text-sm outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100" /></div>
                        <div><label className="mb-1 block text-sm font-bold text-gray-700">Descripción:</label><textarea rows={3} value={categoriaNuevaDescripcion} onChange={(event) => setCategoriaNuevaDescripcion(event.target.value)} placeholder="Breve descripción" className="w-full rounded border border-gray-300 p-2.5 text-sm outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100" /></div>
                        <div className="flex justify-end gap-2 border-t border-gray-100 pt-3"><button type="submit" disabled={guardandoListaRapida} className="rounded bg-orange-500 px-5 py-2 text-sm font-bold text-white hover:bg-orange-600 disabled:opacity-60">{guardandoListaRapida ? 'Guardando...' : 'Guardar'}</button><button type="button" disabled={guardandoListaRapida} onClick={() => setModalCategoriaAbierto(false)} className="rounded border border-gray-300 px-5 py-2 text-sm font-bold text-gray-600 hover:bg-gray-50">Cerrar</button></div>
                    </form>
                </section>
            </div>}
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4 border-b border-slate-200 pb-3 px-1">
                <div className="text-xs font-medium text-slate-500">
                    <span className="text-slate-400">PyPos</span><span className="mx-2 text-slate-300">/</span>
                    <span>{t('products')}</span><span className="mx-2 text-slate-300">/</span>
                    <h2 data-guia-tour="producto" className="inline text-xs font-semibold text-slate-700">{productoEditar ? t('editProduct') : t('addNewProduct')}</h2>
                </div>
                <button onClick={() => onCancelar && onCancelar()} className="text-xs font-semibold text-slate-500 hover:text-orange-600 transition-colors">
                    ← {t('backToList')}
                </button>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_320px] items-start gap-5">

                {/* COLUMNA IZQUIERDA (2/3) */}
                <div className="flex min-w-0 flex-col gap-5">

                    {/* Información del producto */}
                    <div className="bg-white p-5 sm:p-6 rounded-xl shadow-[0_2px_10px_rgba(15,23,42,0.06)] border border-slate-200">
                        <h3 className="font-bold text-slate-800 mb-5 pb-3 border-b border-slate-100 flex items-center gap-2">📦 {t('productInformation')}</h3>

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
                                <div className="flex min-w-0 border border-gray-300 rounded overflow-hidden">
                                    <input
                                        className="min-w-0 flex-[2] p-2 text-sm border-r border-gray-300 outline-none"
                                        placeholder="SKU"
                                        value={sku}
                                        onChange={(e) => setSku(e.target.value)}
                                    />
                                    <select
                                        className="min-w-0 flex-1 p-2 text-sm bg-white outline-none"
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

                        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 mb-4">
                            <div>
                                <label className="block text-xs font-bold text-gray-500 mb-1">{t('units')} *</label>
                                <div className="flex gap-2"><select className="min-w-0 flex-1 border border-gray-300 rounded p-2 text-sm bg-white" value={unidad} onChange={(e) => setUnidad(e.target.value)}><option value="">{t('select')}</option>{unidadesDisponibles.map((u) => <option key={u.id} value={u.nombre}>{u.nombre}</option>)}</select><button type="button" onClick={abrirUnidadRapida} title="Crear unidad" aria-label="Crear unidad" className="h-10 w-10 shrink-0 rounded border border-orange-300 bg-orange-50 text-lg font-bold text-orange-700 hover:bg-orange-100">+</button></div>
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-gray-500 mb-1">Marca</label>
                                <div className="flex gap-2"><select className="min-w-0 flex-1 border border-gray-300 rounded p-2 text-sm bg-white" value={marca} onChange={(e) => setMarca(e.target.value)}><option value="">Seleccione</option>{marcasDisponibles.map((m) => <option key={m.id} value={m.nombre}>{m.nombre}</option>)}</select><button type="button" onClick={crearMarcaRapida} title="Crear marca" aria-label="Crear marca" className="h-10 w-10 shrink-0 rounded border border-orange-300 bg-orange-50 text-lg font-bold text-orange-700 hover:bg-orange-100">+</button></div>
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-gray-500 mb-1">{t('categories')}</label>
                                <div className="flex gap-2"><select className="min-w-0 flex-1 border border-gray-300 rounded p-2 text-sm bg-white" value={categoria} onChange={(e) => { setCategoria(e.target.value); setSubcategoria(''); }}>
                                    <option value="">{t('select')}</option>
                                    {categoriasDisponibles.filter((item) => !item.categoria_padre_id).map((item) => <option key={item.id} value={item.nombre}>{item.nombre}</option>)}
                                </select><button type="button" onClick={abrirCategoriaRapida} title="Crear categoría" aria-label="Crear categoría" className="h-10 w-10 shrink-0 rounded border border-orange-300 bg-orange-50 text-lg font-bold text-orange-700 hover:bg-orange-100">+</button></div>
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-gray-500 mb-1">{t('subcategory')}</label>
                                <select className="w-full border border-gray-300 rounded p-2 text-sm bg-white" value={subcategoria} onChange={(e) => setSubcategoria(e.target.value)} disabled={!categoria}><option value="">{t('select')}</option>{categoriasDisponibles.filter((item) => item.categoria_padre_id && String(categoriasDisponibles.find((padre) => padre.nombre === categoria && !padre.categoria_padre_id)?.id) === String(item.categoria_padre_id)).map((item) => <option key={item.id} value={item.nombre}>{item.nombre}</option>)}</select>
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
                    <div className="bg-white rounded-xl shadow-[0_2px_10px_rgba(15,23,42,0.06)] border border-slate-200 overflow-hidden">
                        <button
                            onClick={() => setMostrarDatosTipo(!mostrarDatosTipo)}
                            className="w-full text-left px-5 py-4 font-bold text-slate-800 flex justify-between items-center hover:bg-slate-50 transition-colors"
                        >
                            {t('dataAndType')} 
                            <span className="text-blue-500">{mostrarDatosTipo ? '▲' : '▼'}</span>
                        </button>

                        {mostrarDatosTipo && (
                            <div className="p-5 sm:p-6 border-t border-slate-100">
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
                                            <button type="button" onClick={() => inputFolletoRef.current?.click()} className="bg-gray-100 text-gray-600 text-xs font-bold px-3 py-1.5 rounded border">{datosAdicionales.folleto_nombre || t('selectFile')}</button>
                                            <input ref={inputFolletoRef} type="file" accept=".pdf,.doc,.docx,.xls,.xlsx" className="hidden" onChange={(event) => manejarFolleto(event.target.files?.[0])} />
                                            <span className="text-xs text-gray-400">{datosAdicionales.folleto_url ? <a href={datosAdicionales.folleto_url} target="_blank" rel="noreferrer" className="text-blue-600 underline">Ver folleto</a> : t('noFileSelected')}</span>
                                        </div>
                                        <p className="text-[11px] text-gray-400 mt-1">Tamaño máximo de archivo: 5MB</p>
                                    </div>
                                </div>

                            </div>
                        )}
                    </div>

                    {/* Stock y alertas, separado como en el formulario de referencia */}
                    <section className="bg-white rounded-xl shadow-[0_2px_10px_rgba(15,23,42,0.06)] border border-slate-200 overflow-hidden">
                        <div className="px-5 py-4 border-b border-slate-100">
                            <h3 className="font-bold text-slate-800">📦 {t('stockAndAlerts')}</h3>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-5 sm:p-6">
                            <div>
                                <label className="block text-xs font-semibold text-slate-600 mb-1.5">{t('manageStockQuestion')}</label>
                                <label className="flex items-center gap-2 border border-slate-300 rounded-md px-3 py-2.5 w-fit min-h-10">
                                    <input type="checkbox" checked={tipoProducto === 'Variable' ? false : administraStock} disabled={tipoProducto === 'Variable'} onChange={(e) => setAdministraStock(e.target.checked)} />
                                    <span className="text-sm">{t('yes')}</span>
                                </label>
                            </div>
                            <div>
                                <label className="block text-xs font-semibold text-slate-600 mb-1.5">{t('alertQuantity')}</label>
                                <input type="number" className="w-full border border-slate-300 rounded-md px-3 py-2.5 text-sm focus:border-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-100" placeholder={t('alertQuantity')} value={cantidadAlerta} onChange={(e) => setCantidadAlerta(e.target.value)} />
                            </div>
                            {ajustesEmpresa.enable_product_expiry !== false && <div>
                                <label className="block text-xs font-semibold text-slate-600 mb-1.5">{t('expiresIn')}</label>
                                <div className="flex border border-slate-300 rounded-md overflow-hidden min-h-10">
                                    <input type="number" className="w-20 px-3 py-2 text-sm border-r border-slate-300 outline-none" value={expiraCantidad} onChange={(e) => setExpiraCantidad(e.target.value)} />
                                    <select className="flex-1 px-3 py-2 text-sm bg-white outline-none" value={expiraUnidad} onChange={(e) => setExpiraUnidad(e.target.value)}>
                                        <option>Días</option><option>Meses</option><option>Años</option>
                                    </select>
                                </div>
                            </div>}
                        </div>
                    </section>

                    {/* Imagen del producto */}
                    <div className="bg-white p-5 sm:p-6 rounded-xl shadow-[0_2px_10px_rgba(15,23,42,0.06)] border border-slate-200">
                        <div className="flex justify-between items-center mb-3">
                            <h3 className="font-bold text-gray-700">📷 Imagen del producto {imagenesProducto.length}/5</h3>
                            <span className="text-[11px] text-gray-400">1:1 — se comprimen automáticamente</span>
                        </div>

                        <div className="border-2 border-dashed border-slate-300 rounded-xl bg-slate-50/60 flex flex-col items-center justify-center py-10 transition-colors hover:border-orange-300 hover:bg-orange-50/30">
                            {imagenesProducto.length ? (
                                <div className="mb-4 flex flex-wrap justify-center gap-3">{imagenesProducto.map((url, index) => <div key={`${url}-${index}`} className="relative"><img src={url} alt={`Imagen ${index + 1} del producto`} className={`h-24 w-24 rounded-lg object-cover ${index === 0 ? 'ring-2 ring-orange-400' : ''}`} /><button type="button" onClick={() => setImagenesProducto((actuales) => actuales.filter((_, i) => i !== index))} aria-label={`Quitar imagen ${index + 1}`} className="absolute -right-2 -top-2 rounded-full bg-red-600 px-1.5 text-xs font-bold text-white">×</button>{index === 0 && <span className="block text-center text-[10px] text-slate-500">Principal</span>}</div>)}</div>
                            ) : (
                                <div className="text-4xl mb-3 text-gray-300">🖼️</div>
                            )}
                            <p className="text-sm text-gray-500 mb-3">Arrastrá imágenes o elegí una opción (hasta 5)</p>
                            <div className="flex gap-2">
                                <label className={`bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold px-4 py-2 rounded cursor-pointer flex items-center gap-1 ${subiendoImagen ? 'opacity-60 pointer-events-none' : ''}`}>
                                    {subiendoImagen ? '⏳ Subiendo...' : '⬆️ Subir archivos'}
                                    <input type="file" accept="image/*" multiple className="hidden" onChange={(event) => { manejarImagenes(event.target.files); event.target.value = ''; }} disabled={subiendoImagen || imagenesProducto.length >= 5} />
                                </label>
                                <input ref={inputCamaraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(event) => { manejarImagenes(event.target.files); event.target.value = ''; }} />
                                <button type="button" onClick={() => inputCamaraRef.current?.click()} className="bg-orange-500 hover:bg-orange-600 text-white text-xs font-bold px-4 py-2 rounded flex items-center gap-1">
                                    📷 Usar cámara
                                </button>
                                <button type="button" onClick={() => setUrlImagenAbierta((abierta) => !abierta)} className="rounded border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700">Desde URL</button>
                            </div>
                            {urlImagenAbierta && <div className="mt-4 flex w-full max-w-xl gap-2"><input type="url" value={urlImagen} onChange={(event) => setUrlImagen(event.target.value)} placeholder="https://..." className="min-w-0 flex-1 rounded border border-slate-300 px-3 py-2 text-sm" /><button type="button" onClick={agregarImagenDesdeUrl} className="rounded bg-slate-800 px-4 py-2 text-xs font-bold text-white">Agregar</button></div>}
                        </div>
                    </div>

                    {/* Precios e impuestos */}
                    <div className="bg-white rounded-xl shadow-[0_2px_10px_rgba(15,23,42,0.06)] border border-slate-200 overflow-hidden">
                        <div className="flex items-center gap-2 px-5 py-4 border-b border-slate-100">
                            <span className="w-2.5 h-2.5 bg-orange-500 rounded-full"></span>
                            <h3 className="font-bold text-slate-800">{t('pricesAndTaxes')}</h3>
                        </div>

                        <p className="px-5 pt-3 text-xs text-slate-500">Ingresá los precios en {monedaPrecio} ({simboloMonedaPrecio}). El sistema conserva también su equivalente contable en PYG para mantener compatibles caja e inventario.{monedaPrecio !== 'PYG' && tasaPrecioLista ? ` Tasa usada al guardar: 1 ${monedaPrecio} = ${tasaPygPorMoneda.toLocaleString('es-PY')} PYG.` : ''}</p>

                        <div className="p-5 sm:p-6">
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                                <div>
                                    <label className="block text-xs font-bold text-gray-500 mb-1">Impuesto aplicable:</label>
                                    <select className="w-full border border-gray-300 rounded p-2 text-sm bg-white" value={ivaPct} onChange={(e) => handleIvaPct(Number(e.target.value))}>
                                        <option value={10}>IVA 10%</option>
                                        <option value={5}>IVA 5%</option>
                                        <option value={0}>Exenta / Sin impuesto</option>
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
                                        <option>Variable</option>
                                        <option>Combo</option>
                                        <option>Servicio</option>
                                    </select>
                                </div>
                            </div>

                            {tipoProducto === 'Variable' ? (
                                <section className="mt-2 space-y-4 rounded-xl border border-orange-200 bg-orange-50/40 p-4">
                                    <div>
                                        <h4 className="font-bold text-slate-800">Variantes del producto</h4>
                                        <p className="mt-1 text-xs text-slate-600">Cada combinación tendrá código, precio y stock propios. El stock se carga por variante desde el catálogo.</p>
                                    </div>
                                    {!plantillasDisponiblesFormulario.length ? (
                                        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">No hay plantillas activas. Primero crea atributos y valores en <b>Productos → Variaciones</b>.</div>
                                    ) : plantillasDisponiblesFormulario.map((plantilla) => {
                                        const seleccionada = variacionesSeleccionadas.includes(plantilla.id);
                                        const valoresMarcados = valoresVariacionSeleccionados[plantilla.id] || [];
                                        return <div key={plantilla.id} className="rounded-lg border bg-white p-3">
                                            <label className="flex cursor-pointer items-center gap-2 text-sm font-bold"><input type="checkbox" checked={seleccionada} onChange={(e) => alternarPlantillaVariacion(plantilla, e.target.checked)} />{plantilla.nombre}</label>
                                            {seleccionada && <div className="mt-3 flex flex-wrap gap-2">{(plantilla.valores || []).map((valor) => <label key={valor} className="flex cursor-pointer items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs"><input type="checkbox" checked={valoresMarcados.includes(valor)} onChange={(e) => setValoresVariacionSeleccionados((prev) => ({ ...prev, [plantilla.id]: e.target.checked ? [...new Set([...valoresMarcados, valor])] : valoresMarcados.filter((v) => v !== valor) }))} />{valor}</label>)}</div>}
                                        </div>;
                                    })}
                                    {variantesExcedenLimite && <p className="text-sm font-semibold text-red-700">La combinación genera más de 100 variantes. Reduce los valores seleccionados.</p>}
                                    {!!combinacionesVariacion.length && <div className="overflow-x-auto rounded-lg border bg-white">
                                        <div className="border-b p-3 text-sm font-semibold">{combinacionesVariacion.length} combinaciones generadas</div>
                                        <table className="w-full min-w-[520px] text-left text-xs"><thead className="bg-slate-50 uppercase text-slate-500"><tr><th className="p-3">Valor</th><th className="p-3">SKU / código</th><th className="p-3">Precio de venta</th></tr></thead><tbody className="divide-y">{combinacionesVariacion.map((atributos) => {
                                            const clave = claveCombinacion(atributos);
                                            const codigoDefecto = `${slugVariacion(sku)}-${slugVariacion(atributos.map((a) => a.valor).join('-'))}`.slice(0, 100);
                                            return <tr key={clave}><td className="p-3 font-semibold">{atributos.map((a) => `${a.nombre}: ${a.valor}`).join(' / ')}</td><td className="p-3"><input value={variantesEditadas[clave]?.codigo ?? codigoDefecto} onChange={(e) => actualizarVariante(clave, 'codigo', e.target.value)} maxLength={100} className="w-full rounded border px-2 py-1.5" aria-label={`Código de ${atributos.map((a) => a.valor).join(' ')}`} /></td><td className="p-3"><input type="number" min="0" step="0.01" value={variantesEditadas[clave]?.precioVenta ?? precioVentaConIva ?? ''} onChange={(e) => actualizarVariante(clave, 'precioVenta', e.target.value)} className="w-32 rounded border px-2 py-1.5" aria-label={`Precio de ${atributos.map((a) => a.valor).join(' ')} en ${monedaPrecio}`} /></td></tr>;
                                        })}</tbody></table>
                                    </div>}
                                    {productoEditar && productoEditar.tipo_producto === 'Variable' && variantesExistentes.some((fila) => !combinacionesVariacion.some((variante) => claveCombinacion(variante) === claveCombinacion(fila.atributos_variacion || []))) && <p className="text-xs text-amber-800">Las variantes existentes que quites de esta selección se conservan para proteger su stock e historial.</p>}
                                </section>
                            ) : tipoProducto === 'Combo' ? (
                                <div className="flex flex-col gap-4 mt-2">
                                    {/* Buscador de sub-productos */}
                                    <div className="relative">
                                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                            <span className="text-gray-400 text-sm">🔍</span>
                                        </div>
                                        <input
                                            type="text"
                                            className="w-full pl-9 border border-gray-300 rounded p-2 text-sm outline-none focus:border-blue-500"
                                            placeholder="Introduzca el nombre del producto / SKU / código de barras de escaneo"
                                            value={busquedaCombo}
                                            onChange={(e) => manejarBusquedaCombo(e.target.value)}
                                        />
                                        {filtradosCombo.length > 0 && (
                                            <div className="absolute z-50 left-0 right-0 mt-1 bg-white border border-gray-300 rounded shadow-lg max-h-60 overflow-y-auto">
                                                {filtradosCombo.map((prod) => (
                                                    <div
                                                        key={prod.id}
                                                        onClick={() => agregarProductoAlCombo(prod)}
                                                        className="p-2 hover:bg-blue-50 cursor-pointer border-b last:border-0 flex justify-between items-center text-sm"
                                                    >
                                                        <div>
                                                            <span className="font-semibold text-gray-700">{prod.nombre}</span>
                                                            {prod.codigo && <span className="text-xs text-gray-400 ml-2">({prod.codigo})</span>}
                                                        </div>
                                                        <span className="font-bold text-blue-600">
                                                            {Number(prod.precio_compra || 0).toLocaleString('es-PY')} Gs
                                                        </span>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>

                                    {/* Grilla de productos agregados */}
                                    <div className="border border-gray-200 rounded-lg overflow-hidden">
                                        <table className="w-full text-left text-xs border-collapse">
                                            <thead>
                                                <tr className="bg-gray-100 text-gray-500 font-bold border-b border-gray-200">
                                                    <th className="p-3 uppercase">Nombre del Producto</th>
                                                    <th className="p-3 uppercase w-28 text-center">Cantidad</th>
                                                    <th className="p-3 uppercase text-right w-44">Precio de Compra (sin impuestos)</th>
                                                    <th className="p-3 uppercase text-right w-44">Importe Total (impuesto exc.)</th>
                                                    <th className="p-3 text-center w-12"></th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {comboProductos.length === 0 ? (
                                                    <tr>
                                                        <td colSpan="5" className="p-6 text-center text-gray-400 italic">
                                                            Ningún producto agregado al combo. Utilice el buscador de arriba.
                                                        </td>
                                                    </tr>
                                                ) : (
                                                    comboProductos.map((item) => {
                                                        const totalSinImpuesto = (Number(item.precio_compra) || 0) * (Number(item.cantidad) || 0);
                                                        return (
                                                            <tr key={item.id} className="border-b border-gray-100 hover:bg-gray-50">
                                                                <td className="p-3 font-medium text-gray-850">{item.nombre}</td>
                                                                <td className="p-3 text-center">
                                                                    <div className="flex items-center justify-center gap-1">
                                                                        <input
                                                                            type="number"
                                                                            min="1"
                                                                            className="w-16 border border-gray-300 rounded p-1 text-xs text-center outline-none focus:border-blue-500"
                                                                            value={item.cantidad}
                                                                            onChange={(e) => {
                                                                                const val = Number(e.target.value);
                                                                                setComboProductos((prev) =>
                                                                                    prev.map((p) => (p.id === item.id ? { ...p, cantidad: val > 0 ? val : 1 } : p))
                                                                                );
                                                                            }}
                                                                        />
                                                                        <select
                                                                            className="border border-gray-300 rounded p-1 text-[10px] bg-white outline-none focus:border-blue-500"
                                                                            value={item.unidad}
                                                                            onChange={(e) => {
                                                                                const val = e.target.value;
                                                                                setComboProductos((prev) =>
                                                                                    prev.map((p) => (p.id === item.id ? { ...p, unidad: val } : p))
                                                                                );
                                                                            }}
                                                                        >
                                                                            <option value="UNID">UNID</option>
                                                                            {unidadesDisponibles.map((u) => (
                                                                                <option key={u.id} value={u.nombre}>{u.nombre}</option>
                                                                            ))}
                                                                        </select>
                                                                    </div>
                                                                </td>
                                                                <td className="p-3 text-right text-gray-600 font-semibold">
                                                                    {Number(item.precio_compra || 0).toLocaleString('es-PY')} Gs
                                                                </td>
                                                                <td className="p-3 text-right text-gray-800 font-bold">
                                                                    {totalSinImpuesto.toLocaleString('es-PY')} Gs
                                                                </td>
                                                                <td className="p-3 text-center">
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => setComboProductos((prev) => prev.filter((p) => p.id !== item.id))}
                                                                        className="text-red-500 hover:text-red-700 text-base font-bold outline-none"
                                                                    >
                                                                        ✕
                                                                    </button>
                                                                </td>
                                                            </tr>
                                                        );
                                                    })
                                                )}
                                            </tbody>
                                            {comboProductos.length > 0 && (
                                                <tfoot>
                                                    <tr className="bg-gray-50 border-t font-bold text-gray-700">
                                                        <td colSpan="3" className="p-3 text-right uppercase">Total a Pagar con IVA:</td>
                                                        <td className="p-3 text-right text-blue-600 text-sm font-extrabold">
                                                            {Number(precioCompraConIva || 0).toLocaleString('es-PY')} Gs
                                                        </td>
                                                        <td></td>
                                                    </tr>
                                                </tfoot>
                                            )}
                                        </table>
                                    </div>

                                    {/* Controles de margen y precio de venta */}
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-2">
                                        <div>
                                            <label className="block text-xs font-bold text-gray-500 mb-1">x Margen (%):</label>
                                            <input
                                                type="number"
                                                className="w-full border border-gray-300 rounded p-2 text-sm bg-white outline-none focus:border-blue-500"
                                                value={margenPct}
                                                onChange={(e) => handleMargenPct(e.target.value)}
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-bold text-gray-500 mb-1">Precio de venta predeterminado ({simboloMonedaPrecio}):</label>
                                            <input
                                                type="number"
                                                step="0.01"
                                                className="w-full border border-gray-300 rounded p-2 text-sm font-bold text-green-700 bg-white outline-none focus:border-blue-500"
                                                placeholder="Precio de venta"
                                                value={precioVentaConIva}
                                                onChange={(e) => handlePrecioVentaConIva(e.target.value)}
                                            />
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <div className="border border-gray-200 rounded-lg overflow-hidden">
                                    <div className="grid grid-cols-3 text-white text-xs font-bold">
                                                <div className="bg-green-600 px-3 py-2">{t('defaultPurchasePrice')} ({simboloMonedaPrecio})</div>
                                        <div className="bg-green-600 px-3 py-2 border-l border-green-500">x Margen (%) ℹ️</div>
                                        <div className="bg-green-600 px-3 py-2 border-l border-green-500">{t('defaultSalePrice')} ({simboloMonedaPrecio})</div>
                                    </div>
                                    <div className="grid grid-cols-3 gap-4 p-4">
                                        <div className="grid grid-cols-2 gap-2">
                                            <div>
                                                <label className="block text-[11px] font-bold text-gray-500 mb-1">{t('taxNotIncluded')}:*</label>
                                                <input
                                                    type="number"
                                                    step="0.01"
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
                                                    step="0.01"
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
                                                step="0.01"
                                                className="w-full border border-gray-300 rounded p-2 text-sm"
                                                value={margenPct}
                                                onChange={(e) => handleMargenPct(e.target.value)}
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-[11px] font-bold text-gray-500 mb-1">Incluyendo impuesto</label>
                                            <input
                                                type="number"
                                                step="0.01"
                                                className="w-full border border-gray-300 rounded p-2 text-sm font-bold text-green-700"
                                                placeholder="IVA incluido"
                                                value={precioVentaConIva}
                                                onChange={(e) => handlePrecioVentaConIva(e.target.value)}
                                            />
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>

                    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                        <button type="button" className="flex w-full items-center justify-between p-4 text-left text-sm font-bold text-slate-700" aria-expanded={mostrarCamposAdicionales} onClick={() => setMostrarCamposAdicionales((value) => !value)}>⚙️ Campos adicionales <span>{mostrarCamposAdicionales ? '▲' : '▼'}</span></button>
                        {mostrarCamposAdicionales && <div className="grid gap-4 border-t border-slate-100 p-5 sm:grid-cols-2">
                            <div><label className="mb-1 block text-xs font-semibold text-slate-600">Peso</label><input type="number" min="0" step="0.001" value={peso} onChange={(event) => setPeso(event.target.value)} className="w-full rounded border border-slate-300 px-3 py-2 text-sm" /></div>
                            <label className="flex items-center gap-2 self-end rounded border border-slate-200 p-3 text-sm"><input type="checkbox" checked={Boolean(datosAdicionales.administra_serie)} onChange={(event) => setDatosAdicionales((actuales) => ({ ...actuales, administra_serie: event.target.checked }))} /> Administrar IMEI / número de serie</label>
                            <label className="flex items-center gap-2 rounded border border-slate-200 p-3 text-sm"><input type="checkbox" checked={Boolean(datosAdicionales.no_vender)} onChange={(event) => setDatosAdicionales((actuales) => ({ ...actuales, no_vender: event.target.checked }))} /> No vender este producto</label>
                            {[1, 2, 3, 4].map((numero) => { const key = `campo_personalizado_${numero}`; const label = String(ajustesEmpresa[key] || `Campo personalizado ${numero}`).trim(); return <div key={key}><label className="mb-1 block text-xs font-semibold text-slate-600">{label}</label><input value={datosAdicionales[key] || ''} onChange={(event) => setDatosAdicionales((actuales) => ({ ...actuales, [key]: event.target.value }))} className="w-full rounded border border-slate-300 px-3 py-2 text-sm" /></div>; })}
                        </div>}
                    </section>
                    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                        <button type="button" className="flex w-full items-center justify-between p-4 text-left text-sm font-bold text-slate-700" aria-expanded={mostrarModulosIntegraciones} onClick={() => setMostrarModulosIntegraciones((value) => !value)}>🔌 Módulos e integraciones <span>{mostrarModulosIntegraciones ? '▲' : '▼'}</span></button>
                        {mostrarModulosIntegraciones && <div className="border-t border-slate-100 p-5"><label className="mb-1 block text-xs font-semibold text-slate-600">Servicio a ejecutar</label><select value={datosAdicionales.servicio_ejecutar || ''} onChange={(event) => setDatosAdicionales((actuales) => ({ ...actuales, servicio_ejecutar: event.target.value }))} className="w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm"><option value="">Seleccionar...</option>{String(ajustesEmpresa.product_service_types || '').split(/[,\n]/).map((item) => item.trim()).filter(Boolean).map((item) => <option key={item}>{item}</option>)}</select><p className="mt-2 text-xs text-slate-500">Las opciones se definen en Configuración → Producto. Se guarda como dato del catálogo y no genera órdenes de trabajo.</p></div>}
                    </section>

                    {/* Botones de guardado */}
                    <div className="flex flex-wrap gap-3 justify-end">
                        {productoEditar ? (
                            <>
                                {tipoProducto !== 'Variable' && <button
                                    disabled={guardando}
                                    onClick={() => guardarProducto('cargar_stock')}
                                    className="bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold px-4 py-2.5 rounded flex items-center gap-2 disabled:opacity-60"
                                >
                                    📦 Actualizar y editar Stock de apertura
                                </button>}
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
                                {tipoProducto !== 'Variable' && <button
                                    disabled={guardando}
                                    onClick={() => guardarProducto('cargar_stock')}
                                    className="bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold px-4 py-2.5 rounded flex items-center gap-2 disabled:opacity-60"
                                >
                                    📦 Guardar y cargar stock inicial
                                </button>}
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

                <aside className="min-w-0 space-y-4 xl:sticky xl:top-4 xl:max-h-[calc(100vh-2rem)] xl:overflow-y-auto" aria-label="Grupos de precio">
                    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-[0_2px_10px_rgba(15,23,42,0.06)]">
                        <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-4">
                            <h3 className="flex items-center gap-2 font-bold text-slate-800">📋 Grupos de precio</h3>
                            <button type="button" onClick={agregarGrupo} className="rounded-md border border-orange-200 bg-orange-50 px-3 py-2 text-xs font-semibold text-orange-700 transition-colors hover:bg-orange-100">+ Nuevo</button>
                        </div>
                        <div className="space-y-3 p-3">
                            {gruposPrecio.map((g, i) => (
                                <div key={g.nombre + i} className="rounded-lg border border-slate-200 bg-white p-3 shadow-[0_1px_3px_rgba(15,23,42,0.04)]">
                                    <div className="mb-3 flex items-start justify-between gap-2">
                                        <p className="flex min-w-0 items-center gap-2 text-sm font-semibold text-slate-800"><span className="h-2 w-2 shrink-0 rounded-full bg-emerald-500"/><span>{g.nombre}</span></p>
                                        <button type="button" onClick={() => eliminarGrupo(i)} aria-label={`No usar el grupo ${g.nombre} en este producto`} className="rounded p-1 text-xs text-slate-400 transition-colors hover:text-red-500">✕</button>
                                    </div>
                                    <div className="grid grid-cols-[76px_minmax(0,1fr)] gap-2">
                                        <label className="text-[10px] text-slate-500">Margen %<input type="number" className="mt-1 w-full rounded-md border border-slate-300 px-2 py-2 text-sm focus:border-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-100" value={g.margen} onChange={(e) => actualizarMargenGrupo(i, e.target.value)} /></label>
                                        <label className="min-w-0 text-[10px] text-slate-500">Precio venta (IVA inc.)<input type="number" min="0" step="1" className="mt-1 w-full min-w-0 rounded-md border border-slate-300 px-2 py-2 text-sm focus:border-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-100" value={Math.round(g.precioVenta) || 0} onChange={(e) => actualizarPrecioGrupo(i, e.target.value)} /></label>
                                    </div>
                                </div>
                            ))}
                            {!gruposPrecio.length && <p className="rounded-lg bg-slate-50 p-4 text-sm text-slate-500">No hay grupos de precio configurados.</p>}
                        </div>
                        <p className="px-4 pb-4 text-xs text-slate-500">Los precios se guardan con el producto y se aplican al seleccionar un cliente de ese grupo.</p>
                    </section>
                </aside>

            </div>
        </div>
    );
};

export default AgregarProducto;
