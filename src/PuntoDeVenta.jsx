import CierreCaja from './CierreCaja';
import GastosDelTurno from './GastosDelTurno';
import DetalleCaja from './DetalleCaja';
import NuevoClientePOS from './NuevoClientePOS';
import ModalPagoMultiple from './ModalPagoMultiple';
import AgregarProducto from './AgregarProducto';
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { supabase } from './supabaseClient';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { sonidoExito, sonidoError } from './utils/sonido';
import { generateReceipt } from './utils/generateReceipt';
import { checkPrinterBridge, printEscPos } from './utils/escposPrinter';
import { useEmpresaInfo } from './utils/useEmpresa';
import { useConfiguracionEmpresa } from './utils/useConfiguracionEmpresa';
import { useUbicacionUsuario } from './utils/useUbicacion';
import { cargarMapaStockPorUbicacion } from './utils/stockUbicacion';
import { useNotificacion } from './NotificacionContext';
import { cantidadInicial, pasoCantidad, cantidadValida, cantidadVisible, cantidadInterna, pasoVisible, etiquetaCantidad, formatearStock } from './utils/cantidadProducto';
import { useLanguage } from './LanguageContext';
import LogoPyPos from './LogoPyPos';

const formatGs = (valor) => `Gs ${Number(valor || 0).toLocaleString('es-PY')}`;

const PuntoDeVenta = ({ cajaInfo, session, perfilUsuario, onVolver, onSolicitarCierre, onNuevoGasto, onAbrirGuia }) => {
  const { t } = useLanguage();
  const { id: empresaId, nombre: nombreEmpresa, direccion: direccionEmpresa, telefono: telefonoEmpresa, ruc: rucEmpresa, logo_url: logoEmpresa } = useEmpresaInfo();
  const { ajustes: ajustesEmpresa, cargando: cargandoAjustesEmpresa } = useConfiguracionEmpresa(empresaId);
  const { notificar } = useNotificacion();
  const [formatoTicket, setFormatoTicket] = useState(() => localStorage.getItem('gda_formato_ticket') || '80mm');
  const [impresoraConfig, setImpresoraConfig] = useState(null);
  const [balanzaConfig, setBalanzaConfig] = useState(null);
  const [mostrarBalanza, setMostrarBalanza] = useState(false);
  const [productoBalanzaId, setProductoBalanzaId] = useState('');
  const [codigoBalanza, setCodigoBalanza] = useState('');
  const [lecturaBalanza, setLecturaBalanza] = useState(null);
  const [leyendoBalanza, setLeyendoBalanza] = useState(false);
  const [errorBalanza, setErrorBalanza] = useState('');

  // El perfil de la impresora configurada para la empresa determina el ancho
  // usado por el ticket. Si no hay impresora registrada, se conserva el ajuste
  // local anterior del POS.
  useEffect(() => {
    if (!empresaId) return;
    let activo = true;
    setImpresoraConfig(null);
    (async () => {
      const { data, error } = await supabase.from('empresas').select('configuracion').eq('id', empresaId).maybeSingle();
      if (!activo) return;
      let configuracion = data?.configuracion;
      if (error || !configuracion) {
        try { configuracion = JSON.parse(localStorage.getItem(`pypos-config-empresa-${empresaId}`) || '{}'); } catch { configuracion = {}; }
      }
      const impresoras = configuracion?.modulos?.printers || configuracion?.extra?.printers;
      const balanzas = configuracion?.modulos?.scales || configuracion?.extra?.scales;
      setBalanzaConfig(Array.isArray(balanzas) ? (balanzas.find((scale) => scale.is_default) || balanzas[0] || null) : null);
      const predeterminada = Array.isArray(impresoras) ? (impresoras.find((p) => p.is_default) || impresoras[0]) : null;
      if (!predeterminada) return;
      setImpresoraConfig(predeterminada);
      const formato = Number(predeterminada.characters || 42) <= 32 ? '58mm' : '80mm';
      setFormatoTicket(formato);
      localStorage.setItem('gda_formato_ticket', formato);
    })();
    return () => { activo = false; };
  }, [empresaId]);

  const cambiarFormatoTicket = (formato) => {
    setFormatoTicket(formato);
    localStorage.setItem('gda_formato_ticket', formato);
  };
  const { id: ubicacionUsuarioId, ve_todas: usuarioVeTodas } = useUbicacionUsuario();
  const ubicacionActivaId = cajaInfo?.ubicacion_id || ubicacionUsuarioId || null;
  const [mapaStockUbicacion, setMapaStockUbicacion] = useState({});

  // Stock real disponible EN ESTA SUCURSAL. Si el producto todavía no tiene stock
  // cargado por sucursal (ej: productos viejos, antes de esta función), usamos el
  // stock global como respaldo para no bloquear ventas por datos que faltan cargar.
  const stockEnSucursal = (producto) => {
    if (ubicacionActivaId) {
      const stockUbicacion = mapaStockUbicacion[producto.id]?.[ubicacionActivaId];
      if (stockUbicacion !== undefined && stockUbicacion !== null && Number(stockUbicacion) > 0) {
        return Number(stockUbicacion);
      }
    }
    return Number(producto.stock_actual) || 0;
  };
  const [mostrarCierreCaja, setMostrarCierreCaja] = useState(false);
  const [mostrarConfigBusqueda, setMostrarConfigBusqueda] = useState(false);
  const [mostrarNuevoCliente, setMostrarNuevoCliente] = useState(false);
  const [mostrarPagoMultiple, setMostrarPagoMultiple] = useState(false);
  const [mostrarFormularioProducto, setMostrarFormularioProducto] = useState(false);
  const [mostrarCalculadora, setMostrarCalculadora] = useState(false);
  const [mostrarCambioPersonal, setMostrarCambioPersonal] = useState(false);
  const [personalServicioCambio, setPersonalServicioCambio] = useState('');
  const [calculadoraA, setCalculadoraA] = useState('');
  const [calculadoraB, setCalculadoraB] = useState('');
  const [operacionCalculadora, setOperacionCalculadora] = useState('+');
  const [cuentasCaja, setCuentasCaja] = useState([]);
  const [clientesDisponibles, setClientesDisponibles] = useState([]);
  const [gruposClientes, setGruposClientes] = useState([]);
  const [reglasDescuento, setReglasDescuento] = useState([]);
  const [personalServicio, setPersonalServicio] = useState('');
  const [usuariosServicio, setUsuariosServicio] = useState([]);
  // === ESTADOS PRINCIPALES ===
  const [productos, setProductos] = useState([]);
  const [marcasEmpresa, setMarcasEmpresa] = useState([]);
  const [carrito, setCarrito] = useState([]);
  const [productoImagenAmpliada, setProductoImagenAmpliada] = useState(null);
  const [productoAgregadoId, setProductoAgregadoId] = useState(null);
  const [cicloResaltadoCarrito, setCicloResaltadoCarrito] = useState(0);
  const [cotizacionCargada, setCotizacionCargada] = useState(false);
  const [busqueda, setBusqueda] = useState('');
  const [camposBusqueda, setCamposBusqueda] = useState(['nombre', 'codigo']);
  const [cargando, setCargando] = useState(true);
  const [categoriaActiva, setCategoriaActiva] = useState('Todas las categorías');
  const [marcaActiva, setMarcaActiva] = useState('');

  const [cliente, setCliente] = useState('Cliente Ocasional');
  const [metodoPago, setMetodoPago] = useState('Efectivo');
  const [montoPagado, setMontoPagado] = useState('');
  const [monedaVenta, setMonedaVenta] = useState('PYG');
  const monedaBaseAnterior = useRef(null);
  const monedaBaseEmpresa = typeof ajustesEmpresa.currency === 'string' && ajustesEmpresa.currency ? ajustesEmpresa.currency : 'PYG';
  const monedasDisponibles = useMemo(() => {
    const compatibles = new Set(['PYG', 'USD', 'EUR', 'BRL']);
    const base = compatibles.has(monedaBaseEmpresa) ? monedaBaseEmpresa : 'PYG';
    const extrasConfiguradas = ajustesEmpresa.enable_multicurrency && Array.isArray(ajustesEmpresa.multicurrency_ids)
      ? ajustesEmpresa.multicurrency_ids.filter((moneda) => compatibles.has(moneda))
      : [];
    return [...new Set([base, ...extrasConfiguradas])];
  }, [ajustesEmpresa.enable_multicurrency, ajustesEmpresa.multicurrency_ids, monedaBaseEmpresa]);
  const claveMonedaVenta = empresaId ? `gda_moneda_venta_${empresaId}` : null;
  const guardarMonedaVenta = (moneda) => {
    if (!claveMonedaVenta) return;
    try { localStorage.setItem(claveMonedaVenta, moneda); } catch { /* caché opcional */ }
  };

  useEffect(() => {
    if (cargandoAjustesEmpresa || !empresaId) return;
    let preferida = '';
    try { preferida = localStorage.getItem(claveMonedaVenta) || ''; } catch { /* caché opcional */ }
    const cambioDeMonedaBase = monedaBaseAnterior.current && monedaBaseAnterior.current !== monedaBaseEmpresa;
    const siguiente = cambioDeMonedaBase
      ? monedaBaseEmpresa
      : monedasDisponibles.includes(preferida) ? preferida : (monedasDisponibles.includes(monedaBaseEmpresa) ? monedaBaseEmpresa : monedasDisponibles[0] || 'PYG');
    monedaBaseAnterior.current = monedaBaseEmpresa;
    setMonedaVenta(siguiente);
    guardarMonedaVenta(siguiente);
  }, [cargandoAjustesEmpresa, empresaId, claveMonedaVenta, monedasDisponibles, monedaBaseEmpresa]);
  const [tasaReferencia, setTasaReferencia] = useState(() => {
    if (typeof window === 'undefined') return 1;
    const tasaGuardada = Number(localStorage.getItem('gda_tasa_referencia'));
    return Number.isFinite(tasaGuardada) && tasaGuardada > 0 ? tasaGuardada : 1;
  });
  const [tasaCambio, setTasaCambio] = useState(() => {
    if (typeof window === 'undefined') return 1;
    const tasaGuardada = Number(localStorage.getItem('gda_tasa_cambio'));
    return Number.isFinite(tasaGuardada) && tasaGuardada > 0 ? tasaGuardada : 1;
  });
  const [margenNegocio, setMargenNegocio] = useState(() => {
    if (typeof window === 'undefined') return 0;
    const margenGuardado = Number(localStorage.getItem('gda_margen_negocio'));
    return Number.isFinite(margenGuardado) ? margenGuardado : 0;
  });
  const [cargandoTasa, setCargandoTasa] = useState(false);
  const [tasaFuente, setTasaFuente] = useState('velocity');
  const [monedaVentaPersistible, setMonedaVentaPersistible] = useState(false);
  const tasasFallback = {
    PYG: 1,
    USD: 7850,
    EUR: 8790,
    BRL: 1380,
  };

  const calcularTasaNegocio = (base, margen) => {
    const tasaBase = Number(base) || 0;
    const margenAplicado = Number(margen) || 0;
    if (tasaBase <= 0) return 0;
    return tasaBase * (1 + margenAplicado / 100);
  };

  const obtenerTasaDesdeApiVelocity = (moneda, data) => {
    if (!data || !data.success || !data.rates) return null;
    const rates = data.rates;
    const mapa = {
      PYG: Number(rates.PYG) || 1,
      USD: Number(rates.PYG) || null,
      EUR: Number(rates.EUR_PYG) || null,
      BRL: Number(rates.BRL_PYG) || null,
    };

    return mapa[moneda] ?? null;
  };

  // Controla qué combos del carrito tienen su composición visible
  const [combosExpandidos, setCombosExpandidos] = useState({});
  const toggleComboExpandido = (id) =>
    setCombosExpandidos((prev) => ({ ...prev, [id]: !prev[id] }));

  // === CAMPOS EXTRA (Descuento / Embalaje / Nota) ===
  const [mostrarOpciones, setMostrarOpciones] = useState(false);
  const [mostrarGastos, setMostrarGastos] = useState(false);
  const [abrirFormularioGasto, setAbrirFormularioGasto] = useState(false);
  const [mostrarDetalleCaja, setMostrarDetalleCaja] = useState(false);
  const [descuento, setDescuento] = useState('');
  const [cargoEmbalaje, setCargoEmbalaje] = useState('');
  const [notaVenta, setNotaVenta] = useState('');
  const [fechaVencimientoPresupuesto, setFechaVencimientoPresupuesto] = useState('');
  const [notaRemision, setNotaRemision] = useState('');
  const [mostrarTransaccionesRecientes, setMostrarTransaccionesRecientes] = useState(false);
  const [transaccionesRecientes, setTransaccionesRecientes] = useState([]);
  const [cargandoTransaccionesRecientes, setCargandoTransaccionesRecientes] = useState(false);
  const [errorTransaccionesRecientes, setErrorTransaccionesRecientes] = useState('');
  const [guardandoPresupuesto, setGuardandoPresupuesto] = useState(false);

  const [fechaHora, setFechaHora] = useState(new Date());

  useEffect(() => {
    if (!empresaId) return undefined;
    let vigente = true;
    supabase.from('ventas').select('moneda_venta,total_moneda').eq('empresa_id', empresaId).limit(1)
      .then(({ error }) => { if (vigente) setMonedaVentaPersistible(!error); });
    return () => { vigente = false; };
  }, [empresaId]);

  useEffect(() => {
    const timer = setInterval(() => setFechaHora(new Date()), 1000 * 30);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (monedaVenta === 'PYG') {
      setTasaReferencia(1);
      setTasaCambio(1);
      if (typeof window !== 'undefined') {
        localStorage.setItem('gda_tasa_referencia', '1');
        localStorage.setItem('gda_tasa_cambio', '1');
        guardarMonedaVenta('PYG');
      }
      return;
    }

    let cancelado = false;
    const cargarTasaCambio = async () => {
      setCargandoTasa(true);
      let tasaBase = tasasFallback[monedaVenta] || 1;

      try {
        const response = await fetch('https://velocity.com.py/api');
        if (!response.ok) throw new Error('No se pudo actualizar la tasa');
        const data = await response.json();
        const valor = obtenerTasaDesdeApiVelocity(monedaVenta, data);

        if (Number.isFinite(valor) && valor > 0) {
          tasaBase = valor;
          setTasaFuente(data?.source || 'velocity');
        }
      } catch (error) {
        console.warn('Sincronización de cotización fallida, usando fallback:', error);
      }

      if (!cancelado) {
        const tasaFinal = calcularTasaNegocio(tasaBase, margenNegocio);
        setTasaReferencia(tasaBase);
        setTasaCambio(tasaFinal);
        if (typeof window !== 'undefined') {
          localStorage.setItem('gda_tasa_referencia', String(tasaBase));
          localStorage.setItem('gda_tasa_cambio', String(tasaFinal));
          guardarMonedaVenta(monedaVenta);
        }
      }

      if (!cancelado) setCargandoTasa(false);
    };

    cargarTasaCambio();
    return () => { cancelado = true; };
  }, [monedaVenta, tasaFuente, margenNegocio]);

  useEffect(() => {
    if (monedaVenta === 'PYG') {
      setTasaCambio(1);
      localStorage.setItem('gda_tasa_cambio', '1');
      return;
    }

    const tasaFinal = calcularTasaNegocio(tasaReferencia, margenNegocio);
    setTasaCambio(tasaFinal);
    localStorage.setItem('gda_tasa_cambio', String(tasaFinal));
    localStorage.setItem('gda_margen_negocio', String(margenNegocio));
  }, [margenNegocio, monedaVenta, tasaReferencia]);

  useEffect(() => {
    const cargarClientes = async () => {
      if (!empresaId) return;
      const [clientesResult, gruposResult] = await Promise.all([
        supabase.from('clientes').select('*').eq('empresa_id', empresaId).order('nombre'),
        supabase.from('grupos_clientes').select('nombre, grupo_precios, activo').eq('empresa_id', empresaId).eq('activo', true),
      ]);
      if (!clientesResult.error && clientesResult.data) setClientesDisponibles(clientesResult.data);
      if (!gruposResult.error && gruposResult.data) setGruposClientes(gruposResult.data);
    };
    if (empresaId) cargarClientes();
  }, [empresaId]);

  useEffect(() => {
    let vigente = true;
    const cargarDescuentos = async () => {
      if (!empresaId) return;
      const { data, error } = await supabase.from('descuentos_ventas').select('*').eq('empresa_id', empresaId).eq('activo', true);
      if (!vigente) return;
      if (error) {
        if (error.code !== '42P01') console.warn('No se pudieron cargar descuentos promocionales:', error.message);
        setReglasDescuento([]);
      } else setReglasDescuento(data || []);
    };
    cargarDescuentos();
    return () => { vigente = false; };
  }, [empresaId]);

  useEffect(() => {
    const cargarUsuariosServicio = async () => {
      if (!empresaId) return;
      const { data, error } = await supabase
        .from('usuarios')
        .select('id, nombre, apellido, activo, comision_ventas')
        .eq('empresa_id', empresaId)
        .eq('activo', true)
        .order('nombre');
      if (!error) setUsuariosServicio(data || []);
    };
    cargarUsuariosServicio();
  }, [empresaId]);

  // Cuentas de caja reales (las mismas que administrás en "Caja / Banco"),
  // para el selector "Cuenta de pago" del modal de Pago Múltiple.
  useEffect(() => {
    const cargarCuentasCaja = async () => {
      if (!empresaId) return;
      const { data, error } = await supabase
        .from('cuentas_caja')
        .select('id, nombre, tipo_cuenta')
        .eq('empresa_id', empresaId)
        .eq('activo', true)
        .order('nombre');
      if (!error && data) setCuentasCaja(data);
    };
    cargarCuentasCaja();
  }, [empresaId]);

  const cargarProductos = async () => {
    if (!empresaId) return;
    setCargando(true);
    try {
      const { data, error } = await supabase.from('productos').select('*').eq('empresa_id', empresaId).order('nombre', { ascending: true });

      if (error && error.code !== '42P01') throw error;
      if (data) setProductos(data);
    } catch (error) {
      console.error('Error al cargar productos:', error.message);
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => {
    cargarProductos();
  }, [empresaId]);

  useEffect(() => {
    let vigente = true;
    const cargarMarcas = async () => {
      if (!empresaId) return;
      const { data, error } = await supabase
        .from('marcas')
        .select('id, nombre')
        .eq('empresa_id', empresaId)
        .order('nombre', { ascending: true });
      if (vigente && !error) setMarcasEmpresa(data || []);
    };
    cargarMarcas();
    return () => { vigente = false; };
  }, [empresaId]);

  useEffect(() => {
    if (!empresaId) return;
    try {
      const guardados = JSON.parse(localStorage.getItem(`gda_pos_campos_busqueda_${empresaId}`) || 'null');
      const validos = Array.isArray(guardados) ? guardados.filter((campo) => ['nombre', 'codigo'].includes(campo)) : [];
      if (validos.length) setCamposBusqueda(validos);
    } catch {
      setCamposBusqueda(['nombre', 'codigo']);
    }
  }, [empresaId]);

  useEffect(() => {
    if (cargando || cotizacionCargada) return;
    const pendiente = sessionStorage.getItem('pypos_cotizacion_pendiente');
    if (!pendiente) {
      setCotizacionCargada(true);
      return;
    }
    try {
      const cotizacion = JSON.parse(pendiente);
      const filas = (cotizacion.items || []).map((linea) => {
        const producto = productos.find((p) => String(p.id) === String(linea.id));
        if (!producto) return null;
        return {
          ...producto,
          precio_lista_base: Number(linea.precio_venta ?? linea.precio ?? producto.precio_venta) || 0,
          precio_venta: Number(linea.precio_venta ?? linea.precio ?? producto.precio_venta) || 0,
          precio: Number(linea.precio_venta ?? linea.precio ?? producto.precio_venta) || 0,
          cotizacion_precio_fijo: true,
          cantidad: Math.max(0.001, Number(linea.cantidad) || 1),
        };
      }).filter(Boolean);
      if (!filas.length) {
        notificar.error('No se pudo cargar la cotización: sus productos ya no están disponibles en el catálogo.');
      } else {
        setCarrito(filas);
        setCliente(cotizacion.cliente || 'Cliente Ocasional');
        setDescuento(String(Number(cotizacion.descuento) || ''));
      setFechaVencimientoPresupuesto(cotizacion.fecha_vencimiento || '');
      setCargoEmbalaje(String(Number(cotizacion.cargo_embalaje) || 0) || '');
        setNotaVenta([cotizacion.referencia, cotizacion.notas].filter(Boolean).join(' · '));
        if (filas.length !== (cotizacion.items || []).length) notificar.info('Se omitieron productos que ya no están en el catálogo.');
        else notificar.info(`Cotización ${cotizacion.referencia} cargada. Revisa stock y confirma la venta.`);
      }
    } catch (error) {
      console.error('No se pudo cargar la cotización al POS:', error);
      notificar.error('No se pudo leer la cotización pendiente.');
    }
    setCotizacionCargada(true);
  }, [cargando, cotizacionCargada, productos]);

  useEffect(() => {
    const actualizarStock = () => {
      cargarProductos();
      if (empresaId) cargarMapaStockPorUbicacion(empresaId).then(setMapaStockUbicacion);
    };
    window.addEventListener('stock-actualizado', actualizarStock);
    return () => window.removeEventListener('stock-actualizado', actualizarStock);
  }, [empresaId]);

    useEffect(() => {
      if (!empresaId) return;
      cargarMapaStockPorUbicacion(empresaId).then(setMapaStockUbicacion);
    }, [empresaId, productos.length]);

  const categorias = useMemo(() => {
    const unicas = Array.from(new Set(productos.filter((p) => p.tipo_producto !== 'Variable').map((p) => p.categoria).filter(Boolean)));
    return ['Todas las categorías', ...unicas];
  }, [productos]);

  const marcasPorId = useMemo(() => new Map(marcasEmpresa.map((marca) => [String(marca.id), marca.nombre])), [marcasEmpresa]);
  const marcas = useMemo(() => {
    const opciones = marcasEmpresa
      .filter((marca) => marca.nombre)
      .map((marca) => ({ valor: String(marca.id), nombre: marca.nombre }));
    const nombresExistentes = new Set(opciones.map((marca) => marca.nombre.trim().toLocaleLowerCase('es')));
    productos.forEach((producto) => {
      const nombre = String(producto.marca || producto.marca_nombre || '').trim();
      if (nombre && !nombresExistentes.has(nombre.toLocaleLowerCase('es'))) {
        opciones.push({ valor: `nombre:${nombre}`, nombre });
        nombresExistentes.add(nombre.toLocaleLowerCase('es'));
      }
    });
    return opciones.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  }, [marcasEmpresa, productos]);

  const clienteSeleccionado = useMemo(() => clientesDisponibles.find(
    (item) => (item.nombre_empresa || item.nombre) === cliente
  ) || null, [cliente, clientesDisponibles]);
  const grupoClienteSeleccionado = useMemo(() => gruposClientes.find(
    (grupo) => grupo.nombre === clienteSeleccionado?.grupo_clientes
  ) || null, [clienteSeleccionado, gruposClientes]);
  const nombreGrupoPrecioActivo = grupoClienteSeleccionado?.grupo_precios?.trim() || '';

  const precioDelGrupo = (producto, nombreGrupo = nombreGrupoPrecioActivo) => {
    if (!nombreGrupo || !Array.isArray(producto?.grupos_precio)) return null;
    const grupo = producto.grupos_precio.find((item) =>
      String(item.nombre || '').trim().toLocaleLowerCase('es') === nombreGrupo.trim().toLocaleLowerCase('es')
    );
    const precio = Number(grupo?.precioVenta ?? grupo?.precio_venta);
    if (!Number.isFinite(precio) || precio <= 0) return null;
    const monedaGrupo = grupo.moneda || producto.moneda_precio || 'PYG';
    return monedaGrupo === monedaVenta ? precio * (monedaVenta === 'PYG' ? 1 : tasaCambio) : Number(grupo.precioVentaPyg ?? precio);
  };

  const precioParaCliente = (producto) => {
    const precioGrupo = precioDelGrupo(producto);
    if (precioGrupo !== null) return precioGrupo;
    const monedaProducto = producto?.moneda_precio || 'PYG';
    const precioMoneda = Number(producto?.precio_venta_moneda);
    if (monedaProducto === monedaVenta && Number.isFinite(precioMoneda) && precioMoneda > 0) {
      return precioMoneda * (monedaVenta === 'PYG' ? 1 : tasaCambio);
    }
    return Number(producto?.precio_venta ?? producto?.precio) || 0;
  };

  useEffect(() => {
    if (carrito.length === 0) return;
    setCarrito((actual) => actual.map((item) => {
      if (item.cotizacion_precio_fijo) return item;
      const precioBase = Number(item.precio_lista_base ?? item.precio_venta ?? item.precio) || 0;
      const precioGrupo = precioDelGrupo(item);
      const precioAplicado = precioGrupo ?? precioBase;
      return {
        ...item,
        precio_lista_base: precioBase,
        precio_venta: precioAplicado,
        precio: precioAplicado,
        grupo_precio_aplicado: precioGrupo === null ? null : nombreGrupoPrecioActivo || null,
      };
    }));
    // Se recalcula al cambiar el cliente o al cargar su grupo de precios.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nombreGrupoPrecioActivo]);

  const agregarAlCarrito = (producto) => {
    if (producto?.tipo_producto === 'Variable' || producto?.activo === false) return;
    const itemExistente = carrito.find((item) => item.id === producto.id);
    const incremento = pasoCantidad(producto.unidad);
    const cantidadActual = itemExistente ? Number(itemExistente.cantidad) : 0;
    const stockDisponible = stockEnSucursal(producto);

    if (stockDisponible !== null && stockDisponible !== undefined && cantidadActual + incremento > Number(stockDisponible)) {
      alert(`No hay suficiente stock de "${producto.nombre}". Disponible: ${stockDisponible}`);
      return;
    }

    if (itemExistente) {
      setCarrito(carrito.map((item) =>
        item.id === producto.id ? { ...item, cantidad: Number((cantidadActual + incremento).toFixed(4)) } : item
      ));
    } else {
      const precioBase = Number(producto.precio_venta ?? producto.precio) || 0;
      const precioGrupo = precioDelGrupo(producto);
      const precioAplicado = precioGrupo ?? precioBase;
      setCarrito([{
        ...producto,
        precio_lista_base: precioBase,
        precio_venta: precioAplicado,
        precio: precioAplicado,
        grupo_precio_aplicado: precioGrupo === null ? null : nombreGrupoPrecioActivo || null,
        cantidad: cantidadInicial(producto.unidad, stockDisponible),
      }, ...carrito]);
    }
    setProductoAgregadoId(producto.id);
    setCicloResaltadoCarrito((ciclo) => ciclo + 1);
  };

  const eliminarDelCarrito = (id) => {
    const carritoRestante = carrito.filter((item) => item.id !== id);
    setCarrito(carritoRestante);
    if (productoAgregadoId === id) setProductoAgregadoId(null);
  };

  const cambiarCantidad = (id, nuevaCantidad) => {
    nuevaCantidad = Number(nuevaCantidad);
    if (!cantidadValida(nuevaCantidad)) return;
    const productoOriginal = productos.find((p) => p.id === id);
    const stockDisponible = productoOriginal ? stockEnSucursal(productoOriginal) : undefined;
    if (stockDisponible !== null && stockDisponible !== undefined && nuevaCantidad > stockDisponible) {
      alert(`Solo quedan ${stockDisponible} unidades de este producto en stock.`);
      if (stockDisponible <= 0) return;
      nuevaCantidad = stockDisponible;
    }
    setCarrito(carrito.map((item) =>
      item.id === id ? { ...item, cantidad: nuevaCantidad } : item
    ));
  };

  const productosPesables = productos.filter((producto) => /^(kg|kilo|kilos|kilogramo|kilogramos|g|gr|gramo|gramos)$/i.test(String(producto.unidad || '').trim()) && producto.tipo_producto !== 'Variable' && producto.activo !== false);
  const unidadEnGramos = (unidad) => /^(g|gr|gramo|gramos)$/i.test(String(unidad || '').trim());
  const productoPesado = productosPesables.find((producto) => String(producto.id) === String(productoBalanzaId));
  const seleccionarProductoPorCodigo = () => {
    const codigo = codigoBalanza.trim().toLocaleLowerCase('es');
    if (!codigo) { setErrorBalanza('Ingresá o escaneá el código del producto.'); return; }
    const producto = productosPesables.find((item) => String(item.codigo || '').trim().toLocaleLowerCase('es') === codigo);
    if (!producto) { setProductoBalanzaId(''); setLecturaBalanza(null); setErrorBalanza('No se encontró un producto pesable (kg/g) con ese código.'); return; }
    setProductoBalanzaId(String(producto.id)); setErrorBalanza(''); setLecturaBalanza(null);
  };
  const leerPesoBalanza = async () => {
    if (!balanzaConfig) { setErrorBalanza('Primero configurá una balanza en Configuración → Balanza por red.'); return; }
    setLeyendoBalanza(true); setErrorBalanza(''); setLecturaBalanza(null);
    try {
      const response = await fetch('http://127.0.0.1:8765/api/scale/read', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ip: balanzaConfig.ip, port: balanzaConfig.port || 502, unitId: balanzaConfig.unitId ?? 1 }), signal: AbortSignal.timeout(5000) });
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.error || 'No se pudo leer la balanza.');
      setLecturaBalanza(result);
    } catch (error) {
      setErrorBalanza(error.name === 'TypeError' ? 'No responde el puente local de balanza. Iniciá scale-bridge en esta computadora y revisá que la página permita acceder a localhost.' : error.message || 'Falló la lectura de la balanza.');
    } finally { setLeyendoBalanza(false); }
  };
  const agregarPesoAlCarrito = () => {
    if (!productoPesado || !lecturaBalanza) return;
    const unidad = String(productoPesado.unidad || '').trim().toLowerCase();
    const cantidad = unidad === 'g' || unidad === 'gr' || unidad.startsWith('gram') ? lecturaBalanza.kilograms * 1000 : lecturaBalanza.kilograms;
    const disponible = stockEnSucursal(productoPesado);
    const existente = carrito.find((item) => item.id === productoPesado.id);
    const cantidadFinal = cantidad + (existente ? Number(existente.cantidad) : 0);
    if (disponible !== null && disponible !== undefined && cantidadFinal > Number(disponible)) { setErrorBalanza(`Stock insuficiente. Disponible: ${disponible} ${productoPesado.unidad}.`); return; }
    const precioBase = Number(productoPesado.precio_venta ?? productoPesado.precio) || 0;
    const precioGrupo = precioDelGrupo(productoPesado);
    const precioAplicado = precioGrupo ?? precioBase;
    setCarrito((actual) => {
      const index = actual.findIndex((item) => item.id === productoPesado.id);
      if (index >= 0) return actual.map((item, i) => i === index ? { ...item, cantidad: Number((Number(item.cantidad) + cantidad).toFixed(4)) } : item);
      return [...actual, { ...productoPesado, precio_lista_base: precioBase, precio_venta: precioAplicado, precio: precioAplicado, grupo_precio_aplicado: precioGrupo === null ? null : nombreGrupoPrecioActivo || null, cantidad: Number(cantidad.toFixed(4)) }];
    });
    setLecturaBalanza(null); setMostrarBalanza(false); setProductoBalanzaId(''); setCodigoBalanza('');
  };

  const cambiarPrecioUnitario = (id, nuevoPrecio) => {
    const precio = Number(nuevoPrecio);
    if (Number.isNaN(precio) || precio < 0) return;
    setCarrito(carrito.map((item) =>
      item.id === id ? { ...item, precio_venta: precio, precio: precio } : item
    ));
  };

  const cambiarSubtotalManual = (id, nuevoSubtotal) => {
    const subtotal = Number(nuevoSubtotal);
    if (Number.isNaN(subtotal) || subtotal < 0) return;
    setCarrito(carrito.map((item) => {
      if (item.id !== id) return item;
      const precioUnitario = item.cantidad > 0 ? subtotal / item.cantidad : subtotal;
      return { ...item, precio_venta: precioUnitario, precio: precioUnitario };
    }));
  };

  const vaciarCarrito = () => {
    setCarrito([]);
    setMontoPagado('');
    setDescuento('');
    setCargoEmbalaje('');
    setNotaVenta('');
    setFechaVencimientoPresupuesto('');
    setNotaRemision('');
    setPersonalServicio('');
  };

  const subtotal = carrito.reduce((acc, item) => acc + (item.precio_venta || item.precio || 0) * item.cantidad, 0);
  const totalArticulos = carrito.reduce((acc, item) => acc + item.cantidad, 0);
  const resultadoCalculadora = useMemo(() => {
    const a = Number(calculadoraA);
    const b = Number(calculadoraB);
    if (calculadoraA === '' || calculadoraB === '' || !Number.isFinite(a) || !Number.isFinite(b)) return null;
    if (operacionCalculadora === '/' && b === 0) return null;
    const resultado = operacionCalculadora === '+' ? a + b
      : operacionCalculadora === '-' ? a - b
        : operacionCalculadora === '×' ? a * b
          : a / b;
    return Number.isFinite(resultado) ? resultado : null;
  }, [calculadoraA, calculadoraB, operacionCalculadora]);
  const descuentoPromocional = useMemo(() => {
    if (ajustesEmpresa.disable_discount) return 0;
    const ahora = Date.now();
    const normalizar = (valor) => String(valor || '').trim().toLocaleLowerCase('es');
    return carrito.reduce((total, item) => {
      // Al convertir una cotización, respetamos exactamente el precio y total aprobados.
      if (item.cotizacion_precio_fijo) return total;
      const precio = Number(item.precio_venta ?? item.precio) || 0;
      const bruto = Math.max(0, precio * Number(item.cantidad || 0));
      if (!bruto) return total;
      const candidatos = reglasDescuento.filter((regla) => {
        if (!regla.activo || (regla.fecha_inicio && new Date(regla.fecha_inicio).getTime() > ahora) || (regla.fecha_fin && new Date(regla.fecha_fin).getTime() <= ahora)) return false;
        if (regla.ubicacion_ids?.length && !regla.ubicacion_ids.includes(ubicacionActivaId)) return false;
        if (regla.producto_ids?.length && !regla.producto_ids.some((id) => String(id) === String(item.id))) return false;
        if (regla.marca && normalizar(regla.marca) !== normalizar(item.marca)) return false;
        if (regla.categoria && normalizar(regla.categoria) !== normalizar(item.categoria)) return false;
        return true;
      }).sort((a, b) => Number(b.prioridad || 0) - Number(a.prioridad || 0));
      const regla = candidatos[0];
      if (!regla) return total;
      const descuentoLinea = regla.tipo === 'porcentaje'
        ? bruto * Math.min(100, Math.max(0, Number(regla.valor) || 0)) / 100
        : Math.min(bruto, Math.max(0, Number(regla.valor) || 0) * Number(item.cantidad || 0));
      return total + descuentoLinea;
    }, 0);
  }, [carrito, reglasDescuento, ubicacionActivaId, ajustesEmpresa.disable_discount]);
  const descuentoPredeterminado = Math.max(0, Math.min(100, Number(ajustesEmpresa.default_sales_discount) || 0)) * subtotal / 100;
  const descuentoManual = ajustesEmpresa.disable_discount ? 0
    : String(descuento).trim() === '' ? descuentoPredeterminado : Math.max(0, Number(descuento) || 0);
  const descuentoAplicado = Math.min(descuentoManual + descuentoPromocional, subtotal);
  const cargoEmbalajeAplicado = Math.max(0, Number(cargoEmbalaje) || 0);
  const totalConAjustes = Math.max(0, subtotal - descuentoAplicado + cargoEmbalajeAplicado);
  const formatMoneda = (valor, moneda = monedaVenta) => {
    const numero = Number(valor || 0);
    const simbolos = { PYG: 'Gs', USD: 'USD', EUR: 'EUR', BRL: 'R$' };
    const precisionGuardada = Number(ajustesEmpresa.currency_precision);
    const decimals = moneda === 'PYG'
      ? (Number.isInteger(precisionGuardada) && precisionGuardada >= 0 && precisionGuardada <= 4 ? precisionGuardada : 0)
      : (Number.isInteger(precisionGuardada) && precisionGuardada >= 2 && precisionGuardada <= 4 ? precisionGuardada : 2);
    const simbolo = simbolos[moneda] || moneda;
    const cantidad = numero.toLocaleString('es-PY', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
    return ajustesEmpresa.currency_symbol_placement === 'Antes de la cantidad' ? `${simbolo} ${cantidad}` : `${cantidad} ${simbolo}`;
  };
  const zonaHoraria = ajustesEmpresa.time_zone || 'America/Asuncion';
  const formatearFechaEmpresa = (fecha) => {
    const partes = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: zonaHoraria, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(fecha).map((parte) => [parte.type, parte.value]));
    return String(ajustesEmpresa.date_format || 'dd/mm/yyyy').replace(/dd|mm|yyyy/g, (token) => ({ dd: partes.day, mm: partes.month, yyyy: partes.year })[token]);
  };
  const opcionesHora = { timeZone: zonaHoraria, hour: '2-digit', minute: '2-digit', hour12: ajustesEmpresa.time_format !== '24 horas' };
  const convertirDesdeGs = (valorEnGs, monedaDestino = monedaVenta) => {
    const valor = Number(valorEnGs || 0);
    if (monedaDestino === 'PYG' || !Number.isFinite(tasaCambio) || tasaCambio <= 0) return valor;
    return valor / tasaCambio;
  };
  const convertirAGs = (valorEnMoneda, monedaOrigen = monedaVenta) => {
    const valor = Number(valorEnMoneda || 0);
    if (monedaOrigen === 'PYG' || !Number.isFinite(tasaCambio) || tasaCambio <= 0) return valor;
    return valor * tasaCambio;
  };
  const totalEnMoneda = convertirDesdeGs(totalConAjustes);
  const montoPagadoEnGs = convertirAGs(Number(montoPagado) || 0);
  const vuelto = montoPagadoEnGs > totalConAjustes ? montoPagadoEnGs - totalConAjustes : 0;
  const saldoPendiente = montoPagadoEnGs < totalConAjustes && Number(montoPagado) > 0
    ? totalConAjustes - montoPagadoEnGs
    : 0;
  const vueltoEnMoneda = monedaVenta === 'PYG' ? vuelto : convertirDesdeGs(vuelto);
  const saldoPendienteEnMoneda = monedaVenta === 'PYG' ? saldoPendiente : convertirDesdeGs(saldoPendiente);

  const procesarVenta = async (tipoOperacion = 'venta', datosPagoMultiple = null, metodoForzado = null, notaForzada = null) => {
    if (carrito.length === 0) return alert('El carrito está vacío');
    if (monedaVenta !== 'PYG' && !monedaVentaPersistible) {
      alert('Para vender y guardar en otra moneda, primero aplica database/migration_ventas_multimoneda.sql en Supabase. La operación fue cancelada y no se descontó stock.');
      return null;
    }
    if (ajustesEmpresa.is_commission_agent_required && !personalServicio) {
      alert('La empresa requiere seleccionar un agente o personal de servicio antes de finalizar la venta.');
      return;
    }
    if (ajustesEmpresa.is_pay_term_required && tipoOperacion === 'credito' && !clienteSeleccionado?.termino_pago) {
      alert('Selecciona un cliente con plazo de pago configurado antes de registrar una venta a crédito.');
      return;
    }

    // Si viene del modal de Pago Múltiple, usamos esos valores; si no,
    // seguimos leyendo los mismos estados de siempre (montoPagado, metodoPago,
    // notaVenta) para no cambiar en nada el comportamiento de los botones existentes.
    let montoPagadoFinal = datosPagoMultiple ? convertirAGs(datosPagoMultiple.montoPagado) : convertirAGs(Number(montoPagado) || 0);
    
    // Si el usuario hace clic en "COBRAR" (tipoOperacion 'venta') sin escribir un monto, 
    // asumimos que pagó el total exacto.
    if (!datosPagoMultiple && tipoOperacion === 'venta' && (montoPagado === '' || montoPagado === undefined)) {
      montoPagadoFinal = totalConAjustes;
    } else if (!montoPagadoFinal) {
      montoPagadoFinal = 0;
    }

    const metodoPagoFinal = datosPagoMultiple ? datosPagoMultiple.metodoPago : (metodoForzado || metodoPago);
    const notaBase = datosPagoMultiple
      ? [notaVenta, datosPagoMultiple.notaPagos].filter(Boolean).join(' | ')
      : (notaForzada || notaVenta);
    const notaVentaFinal = [
      notaBase,
      notaRemision.trim() ? `Nota remisión: ${notaRemision.trim()}` : '',
      fechaVencimientoPresupuesto ? `Vencimiento: ${fechaVencimientoPresupuesto}` : '',
    ].filter(Boolean).join(' | ');

    // Verificación final de stock antes de cobrar (por si cambió algo mientras armabas el carrito)
    const sinStockSuficiente = carrito.filter((item) => {
      const productoActual = productos.find((p) => p.id === item.id);
      const stockDisponible = productoActual ? stockEnSucursal(productoActual) : undefined;
      return stockDisponible !== null && stockDisponible !== undefined && item.cantidad > stockDisponible;
    });
    if (sinStockSuficiente.length > 0) {
      alert(
        'No hay stock suficiente para: ' +
        sinStockSuficiente
          .map((i) => `${i.nombre} (pediste ${i.cantidad}, hay ${stockEnSucursal(productos.find((p) => p.id === i.id) || {})})`)
          .join(', ')
      );
      return;
    }

    let estadoPago = 'Pagado';
    if (tipoOperacion === 'credito') estadoPago = 'Credito';
    else if (tipoOperacion === 'cotizacion') estadoPago = 'Cotizacion';
    else if (tipoOperacion === 'pendiente') estadoPago = 'Pendiente';
    else if (montoPagadoFinal === 0 && totalConAjustes > 0) estadoPago = 'Credito';
    else if (montoPagadoFinal > 0 && montoPagadoFinal < totalConAjustes) estadoPago = 'Pago Parcial';

    const saldoPendienteFinal = datosPagoMultiple ? convertirAGs(datosPagoMultiple.saldoPendiente) : saldoPendiente;

    const nuevaVenta = {
      empresa_id: empresaId,
      usuario_nombre: [perfilUsuario?.nombre, perfilUsuario?.apellido].filter(Boolean).join(' ').trim() || perfilUsuario?.nombre_usuario || null,
      personal_servicio: personalServicio || null,
      cliente,
      grupo_precio: nombreGrupoPrecioActivo || null,
      total: totalConAjustes,
      total_moneda: totalEnMoneda,
      metodo_pago: metodoPagoFinal,
      estado_pago: estadoPago,
      monto_pagado: montoPagadoFinal,
      monto_pagado_moneda: datosPagoMultiple ? convertirDesdeGs(montoPagadoFinal) : (Number(montoPagado) || (tipoOperacion === 'venta' ? totalEnMoneda : 0)),
      saldo_pendiente: estadoPago === 'Credito' ? totalConAjustes : saldoPendienteFinal,
      saldo_pendiente_moneda: estadoPago === 'Credito' ? totalEnMoneda : convertirDesdeGs(saldoPendienteFinal),
      articulos: carrito.length,
      descuento: descuentoAplicado,
      cargo_embalaje: cargoEmbalajeAplicado,
      nota_venta: notaVentaFinal || null,
      moneda_venta: monedaVenta,
      tasa_referencia: tasaReferencia,
      margen_porcentaje: margenNegocio,
      tasa_negocio: tasaCambio,
      fecha: new Date().toISOString(),
      caja_id: cajaInfo?.id || null,
      ubicacion_id: ubicacionActivaId,
    };

    try {
      // Antes esto eran 4 llamadas sueltas (insert venta, insert detalle,
      // rpc descontar_stock, update stock por sucursal) sin transacción: si
      // una fallaba a mitad de camino, quedaba una venta guardada con stock
      // sin descontar (o viceversa). Ahora es una sola llamada atómica: la
      // función registrar_venta hace todo dentro de una transacción de
      // Postgres con bloqueo de fila, y si algo falla (ej. stock
      // insuficiente) no se guarda nada.
      const itemsParaRpc = carrito.map((item) => ({
        producto_id: item.id,
        nombre_producto: item.nombre,
        cantidad: item.cantidad,
        precio_unitario: item.precio_venta || item.precio || 0,
        precio_unitario_moneda: convertirDesdeGs(item.precio_venta || item.precio || 0),
        subtotal: (item.precio_venta || item.precio || 0) * item.cantidad,
        subtotal_moneda: convertirDesdeGs((item.precio_venta || item.precio || 0) * item.cantidad),
      }));

      const { data: ventaId, error } = await supabase.rpc('registrar_venta', {
        p_venta: nuevaVenta,
        p_items: itemsParaRpc,
        p_ubicacion_id: ubicacionActivaId || null,
      });
      if (error) throw error;

      const cotizacionPendiente = sessionStorage.getItem('pypos_cotizacion_pendiente');
      if (cotizacionPendiente) {
        try {
          const cotizacion = JSON.parse(cotizacionPendiente);
          if (cotizacion.id) {
            const { error: errorCotizacion } = await supabase.from('cotizaciones_ventas')
              .update({ estado: 'Convertida', venta_id: String(ventaId), actualizado_en: new Date().toISOString() })
              .eq('id', cotizacion.id).eq('empresa_id', empresaId).eq('estado', 'Pendiente');
            if (errorCotizacion) notificar.error(`La venta quedó registrada, pero no se actualizó el estado del presupuesto: ${errorCotizacion.message}`);
          }
        } catch (errorCotizacion) {
          console.error('No se pudo actualizar la cotización convertida:', errorCotizacion);
          notificar.error('La venta quedó registrada, pero no se actualizó el estado del presupuesto.');
        } finally {
          sessionStorage.removeItem('pypos_cotizacion_pendiente');
        }
      }

      const itemsCombo = carrito.filter(
        (item) => item.tipo_producto === 'Combo' && Array.isArray(item.combo_productos) && item.combo_productos.length > 0
      );

      window.dispatchEvent(new Event('stock-actualizado'));

      // Reflejamos el nuevo stock en la grilla al instante, sin esperar a recargar la página
      setProductos((prev) => {
        let updated = prev.map((p) => {
          const vendido = carrito.find((item) => item.id === p.id);
          if (!vendido || p.stock_actual === null || p.stock_actual === undefined) return p;
          return { ...p, stock_actual: Math.max(0, p.stock_actual - vendido.cantidad) };
        });

        // También actualizar en la grilla el stock de los sub-componentes de combos
        for (const itemCombo of itemsCombo) {
          const cantidadCombosVendidos = Number(itemCombo.cantidad) || 1;
          for (const comp of itemCombo.combo_productos) {
            const subProductoId = comp.id || comp.producto_id;
            const cantidadTotalADescontar = (Number(comp.cantidad) || 1) * cantidadCombosVendidos;
            updated = updated.map((p) => {
              if (p.id !== subProductoId || p.stock_actual === null || p.stock_actual === undefined) return p;
              return { ...p, stock_actual: Math.max(0, p.stock_actual - cantidadTotalADescontar) };
            });
          }
        }

        return updated;
      });

      sonidoExito();
      const clienteData = clientesDisponibles.find(
        (c) => (c.nombre_empresa || c.nombre) === cliente
      );
      const clienteRuc = clienteData?.documento_nro || '';
      const ventaParaTicket = {
        ...nuevaVenta,
        id: ventaId,
        cliente_nombre: cliente,
        cliente_ruc: clienteRuc,
        items: carrito.map((item) => ({
          ...item,
          precio_unitario_moneda: convertirDesdeGs(item.precio_venta || item.precio || 0),
          subtotal_moneda: convertirDesdeGs((item.precio_venta || item.precio || 0) * item.cantidad),
        })),
      };
      const empresaTicket = { nombre: nombreEmpresa, direccion: direccionEmpresa, telefono: telefonoEmpresa, ruc: rucEmpresa, logo_url: logoEmpresa };
      if (impresoraConfig?.connection === 'Network') {
        try {
          await checkPrinterBridge();
        } catch {
          // Si el agente no está instalado/iniciado, conserva la impresión estándar del navegador.
          generateReceipt(ventaParaTicket, empresaTicket, formatoTicket, true);
          notificar.info('Puente ESC/POS no disponible; se abrió la impresión del navegador.');
          vaciarCarrito();
          setCliente('Cliente Ocasional');
          return ventaId;
        }
        try {
          await printEscPos(impresoraConfig, ventaParaTicket, empresaTicket);
          notificar.exito('Ticket enviado a la impresora ESC/POS.');
        } catch (printError) {
          alert(`La venta se guardó, pero no se pudo enviar el ticket a la impresora ESC/POS.\n\n${printError.message}\n\nPodés reimprimir el comprobante desde el historial de ventas.`);
        }
      } else {
        generateReceipt(ventaParaTicket, empresaTicket, formatoTicket, true);
      }
      vaciarCarrito();
      setCliente('Cliente Ocasional');
      return ventaId;
    } catch (error) {
      sonidoError();
      console.error('Error al guardar venta:', error.message);
      if (error.message?.toLowerCase().includes('stock insuficiente')) {
        alert(error.message);
      } else {
        alert(
          'Error al procesar la venta. No se guardó nada (la operación es atómica).\n\nDetalle técnico: ' +
          (error.message || 'Error desconocido')
        );
      }
      return null;
    }
  };

  const cobrarConMetodo = (metodo) => {
    if (carrito.length === 0) return alert('El carrito está vacío');
    procesarVenta('venta', null, metodo);
  };

  const procesarDelivery = () => {
    if (carrito.length === 0) return alert('El carrito está vacío');
    const direccion = window.prompt('Dirección de entrega:');
    if (direccion === null) return;
    const contacto = window.prompt('Teléfono o referencia (opcional):') || '';
    const notaDelivery = `Delivery · Dirección: ${direccion}${contacto ? ` · Contacto: ${contacto}` : ''}`;
    procesarVenta('pendiente', null, metodoPago, [notaVenta, notaDelivery].filter(Boolean).join(' | '));
  };

  const guardarPresupuestoDesdePOS = async () => {
    if (guardandoPresupuesto) return;
    if (!carrito.length) { notificar.error('Agregá productos antes de guardar el presupuesto.'); return; }
    if (!empresaId) { notificar.error('No se encontró la empresa asociada a esta sesión.'); return; }
    setGuardandoPresupuesto(true);
    const referencia = `COT-${new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14)}-${Math.floor(Math.random() * 90 + 10)}`;
    const notas = [notaVenta.trim(), notaRemision.trim() ? `Nota de remisión: ${notaRemision.trim()}` : '', cargoEmbalajeAplicado > 0 ? `Cargo de embalaje: ${formatGs(cargoEmbalajeAplicado)}` : ''].filter(Boolean).join(' | ');
    const items = carrito.map((item, index) => ({ producto_id: item.id, nombre_producto: item.nombre, codigo: item.codigo || '', unidad: item.unidad || '', cantidad: Number(item.cantidad), precio_unitario: Number(item.precio_venta || item.precio) || 0, cargo_embalaje: index === 0 ? cargoEmbalajeAplicado : 0 }));
    const fecha = new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Asuncion' }).format(new Date());
    try {
      const { error } = await supabase.from('cotizaciones_ventas').insert([{ empresa_id: empresaId, referencia, cliente: cliente.trim() || 'Cliente Ocasional', fecha, fecha_vencimiento: fechaVencimientoPresupuesto || null, estado: 'Pendiente', items, subtotal, descuento: descuentoAplicado, total: totalConAjustes, notas: notas || null }]);
      if (error) { notificar.error(`No se pudo guardar el presupuesto: ${error.message}`); return; }
      notificar.info(`Presupuesto ${referencia} guardado sin afectar el stock.`);
      vaciarCarrito();
      setCliente('Cliente Ocasional');
    } catch (error) {
      notificar.error(`No se pudo guardar el presupuesto: ${error.message || 'error inesperado'}`);
    } finally { setGuardandoPresupuesto(false); }
  };

  const abrirTransaccionesRecientes = async () => {
    setMostrarTransaccionesRecientes(true); setCargandoTransaccionesRecientes(true); setErrorTransaccionesRecientes('');
    if (!empresaId) { setErrorTransaccionesRecientes('No se encontró la empresa asociada a esta sesión.'); setCargandoTransaccionesRecientes(false); return; }
    const { data, error } = await supabase.from('ventas').select('id,fecha,cliente,total,estado_pago,metodo_pago').eq('empresa_id', empresaId).order('fecha', { ascending: false }).limit(10);
    setCargandoTransaccionesRecientes(false);
    if (error) { setErrorTransaccionesRecientes(`No se pudieron cargar las transacciones: ${error.message}`); return; }
    setTransaccionesRecientes(data || []);
  };

  // El modal de Pago Múltiple ya calculó cuánto se pagó, con qué método(s) y
  // cuánto queda pendiente. Acá reusamos EXACTAMENTE la misma función de
  // siempre (procesarVenta) para que todo lo demás (RPC atómica, descuento
  // de stock, impresión de ticket, etc.) funcione idéntico a una venta normal.
  // Si el pago no cubre el total, procesarVenta ya sabe convertir el resto
  // en "Pago Parcial" / crédito del cliente (misma lógica de siempre).
  const finalizarPagoMultiple = async (resumen) => {
    const ventaId = await procesarVenta('venta', resumen);
    if (!ventaId) return; // la venta falló; procesarVenta ya mostró el error y el modal sigue abierto

    // Guardamos el desglose real de cada fila (monto, método, cuenta, nota)
    // para poder reportar por método de pago dentro de una misma venta.
    // Requiere haber corrido database/migration_detalle_pagos_venta.sql una
    // vez en Supabase. Si todavía no se corrió, la venta ya se guardó bien
    // igual (esto es un detalle adicional, no rompe el cobro).
    if (resumen.filas?.length > 0) {
      const filasParaGuardar = resumen.filas.map((f) => ({
        empresa_id: empresaId,
        venta_id: ventaId,
        monto: convertirAGs(f.cantidad),
        metodo_pago: f.metodo,
        cuenta_id: f.cuentaId || null,
        nota: f.nota || null,
      }));
      const { error: errorDetalle } = await supabase.from('detalle_pagos_venta').insert(filasParaGuardar);
      if (errorDetalle) {
        console.warn(
          'La venta se guardó bien, pero no se pudo guardar el desglose de pagos (¿corriste la migración?):',
          errorDetalle.message
        );
      }
    }

    setMostrarPagoMultiple(false);
  };

  const cerrarRegistro = () => {
    setMostrarCierreCaja(true);
  };

  const pantallaCompleta = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => { });
    } else {
      document.exitFullscreen();
    }
  };

  const marcaSeleccionada = marcas.find((marca) => marca.valor === marcaActiva);
  const productosFiltrados = productos.filter((p) => {
    if (p.tipo_producto === 'Variable' || p.activo === false) return false;
    const termino = busqueda.trim().toLocaleLowerCase('es');
    const coincideBusqueda = !termino || (
      (camposBusqueda.includes('nombre') && p.nombre?.toLocaleLowerCase('es').includes(termino)) ||
      (camposBusqueda.includes('codigo') && p.codigo?.toLocaleLowerCase('es').includes(termino))
    );
    const coincideCategoria =
      categoriaActiva === 'Todas las categorías' || p.categoria === categoriaActiva;
    const marcaId = String(p.marca_id || '');
    const marcaProducto = String(p.marca || p.marca_nombre || marcasPorId.get(marcaId) || '').trim();
    const coincideMarca = !marcaActiva || (marcaActiva.startsWith('nombre:')
      ? marcaProducto.toLocaleLowerCase('es') === marcaActiva.slice(7).toLocaleLowerCase('es')
      : marcaId === marcaActiva || (!marcaId && marcaSeleccionada && marcaProducto.toLocaleLowerCase('es') === marcaSeleccionada.nombre.toLocaleLowerCase('es')));
    return coincideBusqueda && coincideCategoria && coincideMarca;
  });

  // Al escanear un código de barras (o tipear y apretar Enter), busca y agrega directo
  const buscarYAgregarPorCodigo = (e) => {
    if (e.key !== 'Enter') return;
    const termino = busqueda.trim();
    if (!termino) return;

    // 1) Coincidencia exacta por código (así funciona como lector de código de barras)
    const porCodigo = camposBusqueda.includes('codigo') && productos.find((p) => p.tipo_producto !== 'Variable' && p.activo !== false && p.codigo && p.codigo.toLowerCase() === termino.toLowerCase());
    if (porCodigo) {
      agregarAlCarrito(porCodigo);
      setBusqueda('');
      return;
    }

    // 2) Coincidencia exacta por nombre completo
    const porNombre = camposBusqueda.includes('nombre') && productos.find((p) => p.tipo_producto !== 'Variable' && p.activo !== false && p.nombre && p.nombre.toLowerCase() === termino.toLowerCase());
    if (porNombre) {
      agregarAlCarrito(porNombre);
      setBusqueda('');
      return;
    }

    // 3) Si con lo que tipeaste solo queda un producto visible en la grilla, lo agregamos igual
    if (productosFiltrados.length === 1) {
      agregarAlCarrito(productosFiltrados[0]);
      setBusqueda('');
      return;
    }

    if (productosFiltrados.length === 0) {
      alert(`No se encontró ningún producto con "${termino}"`);
    }
    // Si hay varias coincidencias parciales, no hacemos nada: que elija de la grilla
  };

  return (
    <div className="flex flex-col h-screen bg-gray-100 font-sans overflow-hidden">

      <div data-guia-tour="operacion" className="bg-white border-b border-gray-200 px-4 py-2 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          <button onClick={() => onVolver && onVolver()} className="text-gray-500 hover:text-gray-800 font-medium text-sm">
            ← Volver
          </button>
          <button type="button" onClick={onAbrirGuia} className="rounded border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-bold text-slate-600 hover:border-orange-200 hover:text-orange-600" aria-label="Abrir guía de inicio">Ayuda</button>
          <span className="text-gray-800 font-bold text-sm">{perfilUsuario?.empresas?.nombre || 'Mi Negocio'}</span>
          <span className="text-gray-400 text-xs">
            {formatearFechaEmpresa(fechaHora)} {fechaHora.toLocaleTimeString('es-PY', opcionesHora)}
          </span>
          {ajustesEmpresa.enable_multicurrency && monedasDisponibles.length > 1 && (
            <label className="flex items-center gap-1 rounded border border-slate-200 bg-white px-2 py-1 text-[11px] font-semibold text-slate-600">
              Moneda
              <select aria-label="Moneda de la venta" value={monedaVenta} onChange={(event) => {
                const nuevaMoneda = event.target.value;
                setMonedaVenta(nuevaMoneda);
                guardarMonedaVenta(nuevaMoneda);
              }} className="bg-transparent py-0.5 text-xs font-bold text-slate-800 outline-none">
                {monedasDisponibles.map((moneda) => <option key={moneda} value={moneda}>{moneda}</option>)}
              </select>
            </label>
          )}
          {monedaVenta !== 'PYG' && !monedaVentaPersistible && <span role="status" className="rounded bg-amber-50 px-2 py-1 text-[10px] font-semibold text-amber-800">Aplica migration_ventas_multimoneda.sql antes de cobrar en {monedaVenta}</span>}
        </div>
        <div className="flex flex-wrap justify-end gap-1.5 text-[11px] font-bold">
          <button onClick={() => setMostrarDetalleCaja(true)} className="bg-emerald-50 text-emerald-700 border border-emerald-100 px-2.5 py-1.5 rounded hover:bg-emerald-100 whitespace-nowrap">
            ▣ Registrar detalles
          </button>
          <button onClick={cerrarRegistro} className="bg-red-50 text-red-600 border border-red-100 px-2.5 py-1.5 rounded hover:bg-red-100 whitespace-nowrap">
            🔒 Cerrar registro
          </button>
          <button onClick={() => { setAbrirFormularioGasto(false); setMostrarGastos(true); }} className="bg-orange-50 text-orange-700 border border-orange-100 px-2.5 py-1.5 rounded hover:bg-orange-100 whitespace-nowrap">
            🧾 Gastos
          </button>
          <button onClick={() => setMostrarCalculadora(true)} className="bg-gray-50 text-gray-700 border border-gray-200 px-2.5 py-1.5 rounded hover:bg-gray-100 whitespace-nowrap">
            ▣ Calculadora
          </button>
          <button onClick={() => notificar.info('La devolución se gestiona desde Todas las ventas.')} className="bg-red-50 text-red-700 border border-red-100 px-2.5 py-1.5 rounded hover:bg-red-100 whitespace-nowrap">
            ↩ Devolución de venta
          </button>
          <button onClick={procesarDelivery} className="bg-blue-50 text-blue-700 border border-blue-100 px-2.5 py-1.5 rounded hover:bg-blue-100 whitespace-nowrap">
            ◇ Delivery
          </button>
          <button onClick={pantallaCompleta} className="bg-gray-50 text-gray-700 border border-gray-200 px-2.5 py-1.5 rounded hover:bg-gray-100 whitespace-nowrap">
            ⛶ Pantalla completa
          </button>
          <button onClick={() => { setPersonalServicioCambio(personalServicio); setMostrarCambioPersonal(true); }} className="bg-indigo-50 text-indigo-700 border border-indigo-100 px-2.5 py-1.5 rounded hover:bg-indigo-100 whitespace-nowrap">
            ♙ Sustitución de personal
          </button>
          <button onClick={() => { setAbrirFormularioGasto(true); setMostrarGastos(true); }} className="bg-red-50 text-red-700 border border-red-100 px-2.5 py-1.5 rounded hover:bg-red-100 whitespace-nowrap">
            ⊖ Agregar gasto
          </button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">

        <div className="w-full lg:w-[56%] flex flex-col border-r border-gray-200 bg-white overflow-hidden">
          <div className="p-3 border-b border-gray-100 flex gap-2 items-center">
            <div className="relative">
              <input
                list="clientes-pos"
                value={cliente}
                onChange={(e) => setCliente(e.target.value)}
                onFocus={(e) => e.target.select()}
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm font-medium bg-white w-56"
                placeholder={`${t('search')} ${t('customers').toLowerCase()}...`}
                aria-label={`${t('search')} ${t('customers').toLowerCase()}`}
              />
              <datalist id="clientes-pos">
                <option value="Cliente Ocasional" />
                {clientesDisponibles.map((c) => {
                  const nombreCliente = c.nombre_empresa || c.nombre;
                  return <option key={c.id} value={nombreCliente}>{c.tipo_contacto || 'Cliente'}</option>;
                })}
              </datalist>
            </div>
            <button
              type="button"
              onClick={() => setMostrarNuevoCliente(true)}
              className="bg-blue-500 hover:bg-blue-600 text-white rounded-lg w-9 h-9 flex items-center justify-center text-lg font-bold shadow-sm"
              title={t('newCustomer')}
            >
              +
            </button>
            <button
              type="button"
              onClick={() => setMostrarFormularioProducto(true)}
              className="bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg px-3 h-9 flex items-center justify-center text-xs font-bold shadow-sm whitespace-nowrap"
              title="Registrar nuevo producto"
            >
              + Producto
            </button>
            <button
              type="button"
              onClick={() => setMostrarConfigBusqueda(true)}
              className="h-9 w-9 shrink-0 rounded-lg border border-gray-300 bg-white text-gray-600 hover:border-orange-400 hover:text-orange-600"
              title="Configurar campos de búsqueda"
              aria-label="Configurar campos de búsqueda"
            >
              ⚙
            </button>
            <input
              type="text"
              placeholder={t('searchProductSku')}
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              onKeyDown={buscarYAgregarPorCodigo}
              aria-label="Buscar productos por nombre o código"
              className="min-w-0 flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
            />
            {ajustesEmpresa.enable_weighing_scale !== false && <button type="button" onClick={() => { setMostrarBalanza(true); setLecturaBalanza(null); setCodigoBalanza(''); setProductoBalanzaId(''); setErrorBalanza(''); }} className="shrink-0 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-sm font-bold text-sky-800 hover:bg-sky-100" title="Leer el peso estable desde la balanza por red">⚖️ Balanza</button>}
            {mostrarBalanza && <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true" aria-labelledby="pos-balanza-titulo"><div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl"><div className="flex items-start justify-between gap-3"><div><h2 id="pos-balanza-titulo" className="text-lg font-black text-slate-900">Venta por peso</h2><p className="mt-1 text-sm text-slate-500">{balanzaConfig ? `${balanzaConfig.name}: ${balanzaConfig.ip}:${balanzaConfig.port || 502}` : 'Balanza de red no configurada'}</p></div><button type="button" onClick={() => setMostrarBalanza(false)} className="rounded-lg px-3 py-1 text-xl text-slate-500 hover:bg-slate-100" aria-label="Cerrar">×</button></div><label className="mt-4 block text-sm font-bold text-slate-700">Código del producto<input type="text" inputMode="text" autoComplete="off" placeholder="Escribí o escaneá el código y presioná Enter" value={codigoBalanza} onChange={(event) => { const codigo = event.target.value; setCodigoBalanza(codigo); setLecturaBalanza(null); const encontrado = productosPesables.find((producto) => String(producto.codigo || '').trim().toLocaleLowerCase('es') === codigo.trim().toLocaleLowerCase('es')); setProductoBalanzaId(encontrado ? String(encontrado.id) : ''); setErrorBalanza(''); }} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); seleccionarProductoPorCodigo(); } }} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5 font-normal" /></label><label className="mt-4 block text-sm font-bold text-slate-700">Producto cárnico<select className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5" value={productoBalanzaId} onChange={(event) => { setProductoBalanzaId(event.target.value); const producto = productosPesables.find((item) => String(item.id) === event.target.value); setCodigoBalanza(producto?.codigo || ''); setLecturaBalanza(null); setErrorBalanza(''); }}><option value="">Elegí carne vendida por kg o g</option>{productosPesables.map((producto) => <option key={producto.id} value={producto.id}>{producto.nombre} · {producto.unidad} · {formatGs(precioParaCliente(producto))}/{producto.unidad}</option>)}</select></label>{lecturaBalanza && <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4"><p className="text-xs font-bold uppercase tracking-wide text-emerald-800">Peso estable leído</p><p className="mt-1 text-3xl font-black text-emerald-950">{lecturaBalanza.kilograms.toLocaleString('es-PY', { minimumFractionDigits: 3, maximumFractionDigits: 3 })} kg</p>{productoPesado && <p className="mt-1 text-sm text-emerald-900">Importe estimado: {formatGs(precioParaCliente(productoPesado) * (unidadEnGramos(productoPesado.unidad) ? lecturaBalanza.kilograms * 1000 : lecturaBalanza.kilograms))}</p>}</div>}{errorBalanza && <p role="alert" className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-700">{errorBalanza}</p>}<div className="mt-5 flex flex-wrap justify-end gap-2"><button type="button" disabled={leyendoBalanza} onClick={leerPesoBalanza} className="rounded-lg bg-sky-700 px-4 py-2.5 font-bold text-white disabled:opacity-60">{leyendoBalanza ? 'Leyendo…' : 'Leer peso estable'}</button><button type="button" disabled={!lecturaBalanza || !productoPesado} onClick={agregarPesoAlCarrito} className="rounded-lg bg-orange-500 px-4 py-2.5 font-bold text-white disabled:opacity-40">Agregar al carrito</button></div><p className="mt-3 text-xs text-slate-500">La lectura solo prepara la línea de venta. Revisá el producto y el importe en el carrito antes de cobrar.</p></div></div>}
          </div>

          {nombreGrupoPrecioActivo && (
            <div className="px-3 py-1.5 border-b border-blue-100 bg-blue-50 text-[11px] text-blue-800">
              Lista aplicada: <strong>{nombreGrupoPrecioActivo}</strong>{clienteSeleccionado?.grupo_clientes ? ` · ${clienteSeleccionado.grupo_clientes}` : ''}
            </div>
          )}

          <button
            onClick={() => setMostrarOpciones(!mostrarOpciones)}
            className="text-left px-3 py-2 text-xs font-bold text-gray-500 hover:text-orange-600"
          >
            ☰ {t('advancedOptions')} {mostrarOpciones ? '▲' : '▼'}
          </button>

          {mostrarOpciones && (
            <div className="mx-3 mb-3 rounded-lg border border-gray-200 bg-gray-50 p-2 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-2 text-[11px]">
              <div className="min-w-0">
                <label className="font-bold text-gray-500 block mb-1 truncate">{t('serviceSeller')}</label>
                <select value={personalServicio} onChange={(e) => setPersonalServicio(e.target.value)} className="w-full h-8 border border-gray-300 rounded px-2 bg-white truncate">
                  <option value="">{t('selectServiceSeller')}</option>
                  {usuariosServicio.map((usuario) => {
                    const nombre = [usuario.nombre, usuario.apellido].filter(Boolean).join(' ').trim();
                    return <option key={usuario.id} value={nombre}>{nombre}</option>;
                  })}
                </select>
              </div>
            </div>
          )}

          <div className="flex-1 overflow-x-auto overflow-y-auto px-2 bg-gray-50/40">
            <table className="w-full min-w-[720px] text-sm border-separate border-spacing-0">
              <thead className="sticky top-0 z-10 bg-white text-gray-500 text-[10px] uppercase shadow-sm">
                <tr>
                  <th className="text-left py-2">{t('product')}</th>
                  <th className="text-center py-2">{t('quantityShort')}</th>
                  <th className="text-right py-2">{t('unitPriceShort')}</th>
                  <th className="text-right py-2">{t('subtotal')}</th>
                  <th className="w-6"></th>
                </tr>
              </thead>
              <tbody>
                {carrito.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="text-center text-gray-400 py-16">🛒 {t('emptyCart')}</td>
                  </tr>
                ) : (
                  carrito.map((item) => {
                    const precioGs = item.precio_venta || item.precio || 0;
                    const precio = monedaVenta === 'PYG' ? precioGs : convertirDesdeGs(precioGs);
                    const subtotalItem = monedaVenta === 'PYG' ? precioGs * item.cantidad : convertirDesdeGs(precioGs * item.cantidad);
                    const esCombo = item.tipo_producto === 'Combo' && Array.isArray(item.combo_productos) && item.combo_productos.length > 0;
                    const expandido = combosExpandidos[item.id];
                    const marcaProducto = String(item.marca_nombre || marcasPorId.get(String(item.marca_id || item.marca)) || (typeof item.marca === 'string' ? item.marca : '') || '').trim();
                    return (
                      <React.Fragment key={item.id}>
                        <tr className={`border-b border-gray-200 bg-white hover:bg-orange-50 ${productoAgregadoId === item.id ? `pos-cart-row-fade-${cicloResaltadoCarrito % 2}` : ''}`}>
                          <td className="py-2 pr-2 font-medium min-w-[245px]">
                            <div className="flex min-w-0 items-center gap-2 leading-tight">
                              <button type="button" onClick={() => setProductoImagenAmpliada(item)} aria-label={`Ampliar imagen y detalles de ${item.nombre}`} title="Ampliar imagen y ver detalles" className="flex h-10 w-10 flex-shrink-0 cursor-zoom-in items-center justify-center overflow-hidden rounded-md border border-slate-200 bg-slate-100 text-slate-400">
                                {item.imagen_url ? <img src={item.imagen_url} alt="" className="h-full w-full object-cover" /> : <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="8.5" cy="9" r="1.5" /><path d="m21 15-5-5L5 20" /></svg>}
                              </button>
                              <div className="min-w-0">
                                <div className="mb-0.5 font-mono text-[11px] text-slate-700">{item.codigo || 's/c'}</div>
                                <div className="flex items-center gap-1 text-[13px] font-bold text-sky-600">
                                  <span className="min-w-0 truncate" title={item.nombre}>{item.nombre}</span>
                                  <button type="button" title={item.descripcion || item.nombre} aria-label={`Info: ${item.nombre}`} className="flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full border border-sky-400 text-[10px] font-bold text-sky-600">i</button>
                                </div>
                                <div className="mt-0.5 text-[10px] font-semibold text-orange-600">
                                  {marcaProducto && <><span>{marcaProducto.toLocaleUpperCase('es')}</span><span className="mx-1">&middot;</span></>}
                                  <span>Stock: {formatearStock(stockEnSucursal(item), item.unidad)}</span>
                                </div>
                                {esCombo && <button onClick={() => toggleComboExpandido(item.id)} className="mt-1 rounded-full bg-orange-100 px-1.5 py-0.5 text-[10px] font-bold text-orange-600 hover:bg-orange-200">COMBO &middot; {expandido ? 'ocultar' : 'ver contenido'}</button>}
                              </div>
                            </div>
                          </td>
                          <td className="py-3 px-1 text-center whitespace-nowrap">
                            <div className="flex items-center justify-center gap-2">
                              <button type="button" aria-label={`Restar cantidad de ${item.nombre}`} onClick={() => cambiarCantidad(item.id, item.cantidad - pasoCantidad(item.unidad))} className="h-7 w-7 rounded-md border border-slate-200 bg-white text-slate-600 font-bold hover:bg-slate-50">&#8722;</button>
                              <input
                                type="number"
                                min={pasoVisible(item.unidad)}
                                step={pasoVisible(item.unidad)}
                                value={cantidadVisible(item.cantidad, item.unidad)}
                                onChange={(e) => cambiarCantidad(item.id, cantidadInterna(e.target.value, item.unidad))}
                                className="w-12 border-b border-slate-300 bg-transparent px-1 py-1 text-center font-semibold focus:outline-none focus:border-sky-500"
                                aria-label={`Cantidad de ${item.nombre} en ${etiquetaCantidad(item.unidad)}`}
                              />
                              <button type="button" aria-label={`Sumar cantidad de ${item.nombre}`} onClick={() => cambiarCantidad(item.id, item.cantidad + pasoCantidad(item.unidad))} className="h-7 w-7 rounded-md border border-slate-200 bg-white text-emerald-600 font-bold hover:bg-emerald-50">+</button>
                              <select value={item.unidad || 'UNID'} aria-label={`Unidad de ${item.nombre}`} title="Unidad base definida para este producto" disabled className="h-9 max-w-[76px] rounded-md border border-slate-200 bg-white px-2 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-100">
                                <option value={item.unidad || 'UNID'}>{String(item.unidad || 'UNID').toLocaleUpperCase('es')}</option>
                              </select>
                            </div>
                          </td>
                          <td className="py-3 px-1 text-right whitespace-nowrap">
                            <input
                              type="number"
                              value={precio}
                              onChange={(e) => cambiarPrecioUnitario(item.id, convertirAGs(Number(e.target.value) || 0))}
                              className="w-24 rounded-md border border-slate-200 px-2 py-2 text-right font-semibold text-slate-800 focus:outline-none focus:ring-1 focus:ring-sky-400"
                            />
                          </td>
                          <td className="py-3 px-1 text-right whitespace-nowrap">
                            <input
                              type="number"
                              value={subtotalItem}
                              onChange={(e) => cambiarSubtotalManual(item.id, convertirAGs(Number(e.target.value) || 0))}
                              className="w-24 rounded-md border border-slate-200 px-2 py-2 text-right font-bold text-slate-800 focus:outline-none focus:ring-1 focus:ring-sky-400"
                            />
                          </td>
                          <td className="py-3 pl-2 text-center whitespace-nowrap">
                            <button type="button" aria-label={`Quitar ${item.nombre} del carrito`} onClick={() => eliminarDelCarrito(item.id)} className="text-red-400 hover:text-red-600 font-bold">✕</button>
                          </td>
                        </tr>

                        {/* Fila de detalle del Combo (visible solo cuando está expandido) */}
                        {esCombo && expandido && (
                          <tr className="bg-orange-50/60 border-b border-orange-100">
                            <td colSpan={5} className="px-4 pb-3 pt-1">
                              <p className="text-[10px] font-bold text-orange-600 mb-1.5 uppercase tracking-wide">📋 Contenido del combo:</p>
                              <div className="flex flex-col gap-1">
                                {item.combo_productos.map((comp, idx) => (
                                  <div key={idx} className="flex items-center gap-2 text-xs text-gray-700">
                                    <span className="w-5 h-5 bg-orange-200 text-orange-700 rounded-full flex items-center justify-center font-bold text-[10px] flex-shrink-0">
                                      {Number(comp.cantidad) || 1}
                                    </span>
                                    <span className="font-medium">{comp.nombre}</span>
                                    {comp.unidad && <span className="text-gray-400 text-[10px]">({comp.unidad})</span>}
                                  </div>
                                ))}
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

        </div>

        <div className="hidden lg:flex flex-col flex-1 p-4 overflow-hidden">
          <div className="flex gap-2 overflow-x-auto pb-3">
            {categorias.map((cat) => (
              <button
                key={cat}
                onClick={() => setCategoriaActiva(cat)}
                className={`whitespace-nowrap px-4 py-2 rounded-full text-sm font-bold border transition-colors ${categoriaActiva === cat
                    ? 'bg-orange-500 text-white border-orange-500'
                    : 'bg-white text-gray-600 border-gray-200 hover:border-orange-300'
                  }`}
              >
                {cat}
              </button>
            ))}
          </div>

          <div className="pb-3">
            <label className="sr-only" htmlFor="pos-filtro-marca">Filtrar productos por marca</label>
            <select
              id="pos-filtro-marca"
              aria-label="Filtrar productos por marca"
              value={marcaActiva}
              onChange={(e) => setMarcaActiva(e.target.value)}
              className="h-10 w-full max-w-xs rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-700 shadow-sm focus:border-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-100"
            >
              <option value="">Todas las marcas</option>
              {marcas.length === 0 && <option disabled value="sin-marcas">No hay marcas registradas</option>}
              {marcas.map((marca) => <option key={marca.valor} value={marca.valor}>{marca.nombre}</option>)}
            </select>
          </div>

          <div className="flex-1 overflow-y-auto pr-1">
            {ajustesEmpresa.hide_product_suggestion ? (
              <div className="mx-auto mt-10 max-w-lg rounded-xl border border-amber-200 bg-amber-50 p-5 text-center text-sm text-amber-900">
                La lista de sugerencias está desactivada. Buscá el producto por nombre o código en el campo superior.
              </div>
            ) : (
            cargando ? (
              <div className="flex justify-center items-center h-full">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-500"></div>
              </div>
            ) : productosFiltrados.length === 0 ? (
              <div className="text-center text-gray-500 mt-10 font-medium bg-white p-10 rounded-xl shadow-sm">
                No hay productos disponibles en esta categoría.
              </div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
                {productosFiltrados.map((prod) => (
                  <div
                    key={prod.id}
                    onClick={() => agregarAlCarrito(prod)}
                    className="bg-white rounded-xl shadow-sm border border-gray-100 cursor-pointer hover:border-indigo-500 hover:shadow-md transition-all overflow-hidden flex flex-col"
                  >
                    <div className="w-full h-24 bg-gray-50 flex items-center justify-center overflow-hidden">
                      {prod.imagen_url ? (
                        <img src={prod.imagen_url} alt={prod.nombre} className="w-full h-full object-cover" />
                      ) : (
                        <span className="text-2xl text-gray-300">📦</span>
                      )}
                    </div>
                    <div className="p-3 flex flex-col justify-between flex-1">
                      <p className="font-bold text-gray-800 text-sm leading-tight line-clamp-2">{prod.nombre}</p>
                      <div className="mt-1">
                        <p className="text-[11px] text-gray-400 mb-1">{prod.codigo || '—'} · Stock: {formatearStock(stockEnSucursal(prod), prod.unidad)}</p>
                        {ajustesEmpresa.show_pricing_on_product_suggestion !== false && <p className="text-orange-600 font-black">{formatMoneda(convertirDesdeGs(precioParaCliente(prod)), monedaVenta)}</p>}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )
            )}
          </div>
        </div>
      </div>
      <section aria-label="Resumen y acciones de venta" className="shrink-0 border-t border-slate-300 bg-slate-100 px-3 py-2 shadow-[0_-3px_12px_rgba(15,23,42,0.10)]">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-7">
          <div className="flex items-center justify-between rounded-md border border-slate-200 bg-white px-3 py-2"><span className="text-xs font-bold text-slate-500">Artículos</span><strong className="text-lg text-slate-900">{totalArticulos}</strong></div>
          <div className="flex items-center justify-between rounded-md border border-slate-200 bg-white px-3 py-2"><span className="text-xs font-bold text-slate-500">Total</span><strong className="text-sm text-slate-900">{formatMoneda(totalEnMoneda, monedaVenta)}</strong></div>
          {!ajustesEmpresa.disable_discount && <label className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-bold text-slate-600">Descuento ({monedaVenta})<input type="number" min="0" max={convertirDesdeGs(Math.max(0, subtotal - descuentoPromocional))} step={monedaVenta === 'PYG' ? '1' : '0.01'} value={monedaVenta === 'PYG' ? descuento : descuento === '' ? '' : convertirDesdeGs(Number(descuento) || 0)} onChange={(event) => setDescuento(event.target.value === '' ? '' : convertirAGs(Number(event.target.value) || 0))} onBlur={() => { if (String(descuento).trim() !== '') setDescuento(String(Math.min(Number(descuento) || 0, Math.max(0, subtotal - descuentoPromocional)) || '')); }} className="mt-1 h-7 w-full rounded border border-slate-300 px-2 text-sm font-semibold text-slate-900" />{Number(ajustesEmpresa.default_sales_discount) > 0 && String(descuento).trim() === '' && <span className="mt-0.5 block text-[10px] text-slate-500">Predeterminado {Number(ajustesEmpresa.default_sales_discount)}%: {formatMoneda(convertirDesdeGs(descuentoPredeterminado), monedaVenta)}</span>}{descuentoPromocional > 0 && <span className="mt-0.5 block text-[10px] text-emerald-700">Promo: {formatMoneda(convertirDesdeGs(descuentoPromocional), monedaVenta)}</span>}</label>}
          <label className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-bold text-slate-600">Vencimiento<input type="date" value={fechaVencimientoPresupuesto} onChange={(event) => setFechaVencimientoPresupuesto(event.target.value)} className="mt-1 h-7 w-full rounded border border-slate-300 px-2 text-xs font-semibold text-slate-900" /></label>
          <label className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-bold text-slate-600">Nota de remisión<input type="text" value={notaRemision} onChange={(event) => setNotaRemision(event.target.value)} placeholder="Opcional" className="mt-1 h-7 w-full rounded border border-slate-300 px-2 text-xs font-normal text-slate-900" /></label>
          <label className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-bold text-slate-600">Nota de venta<input type="text" value={notaVenta} onChange={(event) => setNotaVenta(event.target.value)} placeholder="Opcional" className="mt-1 h-7 w-full rounded border border-slate-300 px-2 text-xs font-normal text-slate-900" /></label>
          <label className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-bold text-slate-600">Cargo de embalaje ({monedaVenta})<input type="number" min="0" step={monedaVenta === 'PYG' ? '1' : '0.01'} value={monedaVenta === 'PYG' ? cargoEmbalaje : cargoEmbalaje === '' ? '' : convertirDesdeGs(Number(cargoEmbalaje) || 0)} onChange={(event) => setCargoEmbalaje(event.target.value === '' ? '' : convertirAGs(Number(event.target.value) || 0))} onBlur={() => setCargoEmbalaje(String(cargoEmbalajeAplicado || ''))} className="mt-1 h-7 w-full rounded border border-slate-300 px-2 text-sm font-semibold text-slate-900" /></label>
        </div>
        <div className="mt-2 flex min-w-0 items-center gap-2">
          <div className="flex min-w-0 flex-1 items-center gap-2 overflow-x-auto pb-0.5">
          {!ajustesEmpresa.disable_draft && !ajustesEmpresa.disable_suspend && <button onClick={() => procesarVenta('pendiente')} disabled={carrito.length === 0} className="shrink-0 whitespace-nowrap rounded-md border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50">▧ Pedido pendiente</button>}
          <button onClick={guardarPresupuestoDesdePOS} disabled={carrito.length === 0 || guardandoPresupuesto} className="shrink-0 whitespace-nowrap rounded-md border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50">▧ {guardandoPresupuesto ? 'Guardando…' : 'Presupuesto'}</button>
          <button onClick={procesarDelivery} disabled={carrito.length === 0} className="shrink-0 whitespace-nowrap rounded-md bg-slate-200 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-300 disabled:opacity-50">▣ Delivery</button>
          {!ajustesEmpresa.disable_credit_sale_button && <button onClick={() => procesarVenta('credito')} disabled={carrito.length === 0} className="shrink-0 whitespace-nowrap rounded-md bg-slate-200 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-300 disabled:opacity-50">✓ Venta a crédito</button>}
          {!ajustesEmpresa.disable_pay_checkout && !ajustesEmpresa.disable_express_checkout && <button onClick={() => cobrarConMetodo('Tarjeta')} disabled={carrito.length === 0} className="shrink-0 whitespace-nowrap rounded-md bg-pink-600 px-3 py-2 text-xs font-bold text-white hover:bg-pink-700 disabled:opacity-50">▣ Tarjeta</button>}
          {!ajustesEmpresa.disable_pay_checkout && <button onClick={() => setMostrarPagoMultiple(true)} disabled={carrito.length === 0} className="shrink-0 whitespace-nowrap rounded-md bg-slate-900 px-3 py-2 text-xs font-bold text-white hover:bg-slate-800 disabled:opacity-50">▤ Pago múltiple</button>}
          {!ajustesEmpresa.disable_pay_checkout && !ajustesEmpresa.disable_express_checkout && <button onClick={() => cobrarConMetodo('Efectivo')} disabled={carrito.length === 0} className="shrink-0 whitespace-nowrap rounded-md bg-emerald-600 px-3 py-2 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-50">▣ Efectivo</button>}
          <button onClick={vaciarCarrito} className="shrink-0 whitespace-nowrap rounded-md bg-red-600 px-3 py-2 text-xs font-bold text-white hover:bg-red-700">× Cancelar</button>
          {!ajustesEmpresa.hide_recent_trans && <button onClick={abrirTransaccionesRecientes} className="shrink-0 whitespace-nowrap rounded-md bg-orange-600 px-3 py-2 text-xs font-bold text-white hover:bg-orange-700">◷ Transacciones recientes</button>}
          </div>
          <div className="flex min-w-[205px] shrink-0 flex-col items-end rounded-xl bg-slate-900 px-5 py-2 text-white shadow-lg"><span className="text-[10px] font-black tracking-[.16em] text-slate-300">TOTAL A PAGAR</span><strong className="text-2xl leading-tight">{formatMoneda(totalEnMoneda, monedaVenta)}</strong></div>
          <div aria-label="Marca PyPOS" className="flex shrink-0 items-center justify-center px-1"><LogoPyPos size={32} /></div>
        </div>
        {(vuelto > 0 || saldoPendiente > 0) && <div className="mt-1 flex flex-wrap gap-x-5 text-xs font-bold">{vuelto > 0 && <span className="text-emerald-700">Vuelto: {formatMoneda(vueltoEnMoneda, monedaVenta)} · {formatGs(vuelto)}</span>}{saldoPendiente > 0 && <span className="text-red-700">Saldo pendiente: {formatMoneda(saldoPendienteEnMoneda, monedaVenta)} · {formatGs(saldoPendiente)}</span>}</div>}
      </section>
      {productoImagenAmpliada && (() => {
        const producto = productoImagenAmpliada;
        const marca = String(producto.marca_nombre || marcasPorId.get(String(producto.marca_id || producto.marca)) || (typeof producto.marca === 'string' ? producto.marca : '') || '').trim();
        const precio = Number(producto.precio_venta ?? producto.precio) || 0;
        return (
          <div className="fixed inset-0 z-[11000] flex items-center justify-center bg-slate-950/70 p-4" role="dialog" aria-modal="true" aria-labelledby="pos-producto-zoom-titulo" onClick={(event) => { if (event.target === event.currentTarget) setProductoImagenAmpliada(null); }} onKeyDown={(event) => { if (event.key === 'Escape') setProductoImagenAmpliada(null); }} tabIndex={-1}>
            <section className="w-full max-w-[360px] overflow-hidden rounded-[20px] bg-white text-center shadow-[0_25px_80px_rgba(0,0,0,0.35)]">
              <div className="px-6 pb-6 pt-8">
                <div className="mx-auto mb-[18px] flex h-[248px] w-[248px] max-w-full items-center justify-center rounded-[18px] border-2 border-slate-200 bg-slate-50 p-3">
                  {producto.imagen_url ? <img src={producto.imagen_url} alt={producto.nombre} className="h-[220px] w-[220px] max-w-full rounded-xl object-contain" /> : <svg aria-hidden="true" viewBox="0 0 24 24" className="h-16 w-16 text-slate-400" fill="none" stroke="currentColor" strokeWidth="1.4"><rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="8.5" cy="9" r="1.5" /><path d="m21 15-5-5L5 20" /></svg>}
                </div>
                <h2 id="pos-producto-zoom-titulo" className="break-words text-xl font-black text-slate-900">{producto.nombre}</h2>
                <p className="mt-1 text-sm font-semibold text-indigo-500">SKU: {producto.codigo || '—'}</p>
                <div className="mt-4 grid grid-cols-3 gap-2 text-[10px] font-black uppercase tracking-wide">
                  <div className="rounded-xl border border-slate-200 bg-slate-100 px-2 py-3"><span className="block text-slate-400">Marca</span><span className="mt-1 block truncate text-slate-700" title={marca || '—'}>{marca || '—'}</span></div>
                  <div className="rounded-xl border border-rose-100 bg-rose-50 px-2 py-3"><span className="block text-rose-400">Precio</span><span className="mt-1 block text-rose-700">{formatMoneda(precio, monedaVenta)}</span></div>
                  <div className="rounded-xl border border-emerald-100 bg-emerald-50 px-2 py-3"><span className="block text-emerald-500">Stock</span><span className="mt-1 block text-emerald-800">{formatearStock(stockEnSucursal(producto), producto.unidad)}</span></div>
                </div>
                <button type="button" onClick={() => setProductoImagenAmpliada(null)} className="mt-5 rounded-lg bg-slate-900 px-6 py-2.5 text-sm font-bold text-white hover:bg-slate-800">Cerrar</button>
              </div>
            </section>
          </div>
        );
      })()}

      {mostrarTransaccionesRecientes && <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-slate-950/50 p-4"><section role="dialog" aria-modal="true" aria-labelledby="pos-transacciones-title" className="w-full max-w-2xl overflow-hidden rounded-xl bg-white shadow-2xl"><div className="flex items-center justify-between border-b px-5 py-4"><div><h2 id="pos-transacciones-title" className="font-bold text-slate-900">Transacciones recientes</h2><p className="text-xs text-slate-500">Últimas 10 ventas de esta empresa</p></div><button type="button" onClick={() => setMostrarTransaccionesRecientes(false)} className="rounded-lg px-3 py-1 text-xl text-slate-500 hover:bg-slate-100" aria-label="Cerrar">×</button></div>{errorTransaccionesRecientes ? <p role="alert" className="m-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{errorTransaccionesRecientes}</p> : cargandoTransaccionesRecientes ? <p className="p-8 text-center text-sm text-slate-500">Cargando transacciones…</p> : <div className="max-h-[60vh] overflow-y-auto"><table className="w-full text-left text-sm"><thead className="sticky top-0 bg-slate-50 text-xs text-slate-500"><tr><th className="px-4 py-3">Fecha</th><th className="px-4 py-3">Cliente</th><th className="px-4 py-3">Estado</th><th className="px-4 py-3 text-right">Total</th></tr></thead><tbody className="divide-y divide-slate-100">{transaccionesRecientes.map((venta) => <tr key={venta.id}><td className="whitespace-nowrap px-4 py-3">{venta.fecha ? new Date(venta.fecha).toLocaleString('es-PY') : '—'}</td><td className="px-4 py-3">{venta.cliente || 'Cliente Ocasional'}</td><td className="px-4 py-3">{venta.estado_pago || '—'} · {venta.metodo_pago || '—'}</td><td className="px-4 py-3 text-right font-bold">{formatGs(venta.total)}</td></tr>)}{transaccionesRecientes.length === 0 && <tr><td colSpan="4" className="p-8 text-center text-sm text-slate-500">No hay ventas recientes.</td></tr>}</tbody></table></div>}<div className="flex justify-end border-t p-3"><button type="button" onClick={() => setMostrarTransaccionesRecientes(false)} className="rounded-lg border px-4 py-2 text-sm font-semibold text-slate-700">Cerrar</button></div></section></div>}
      {mostrarGastos && (
        <GastosDelTurno cajaInfo={cajaInfo} abrirFormulario={abrirFormularioGasto} onClose={() => { setMostrarGastos(false); setAbrirFormularioGasto(false); }} />
      )}
      {mostrarDetalleCaja && (
        <DetalleCaja cajaInfo={cajaInfo} empresaId={empresaId} nombreEmpresa={nombreEmpresa} session={session} onClose={() => setMostrarDetalleCaja(false)} />
      )}
      {mostrarNuevoCliente && (
        <NuevoClientePOS
          onCerrar={() => setMostrarNuevoCliente(false)}
          onGuardado={(nuevoCliente) => {
            setClientesDisponibles((prev) => [...prev, nuevoCliente]);
            setCliente(nuevoCliente.nombre_empresa || nuevoCliente.nombre);
            setMostrarNuevoCliente(false);
          }}
        />
      )}
      <ModalPagoMultiple
        abierto={mostrarPagoMultiple}
        onCerrar={() => setMostrarPagoMultiple(false)}
        totalArticulos={totalArticulos}
        totalAPagar={totalEnMoneda}
        moneda={monedaVenta}
        cuentasCaja={cuentasCaja}
        ajustesEmpresa={ajustesEmpresa}
        onFinalizar={finalizarPagoMultiple}
      />
      {mostrarFormularioProducto && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-3 sm:p-4">
          <div className="w-full max-w-4xl max-h-[88vh] overflow-y-auto rounded-xl bg-white shadow-2xl border border-gray-200">
            <AgregarProducto
              ubicacionId={ubicacionActivaId}
              onGuardado={async () => {
                await cargarProductos();
                if (empresaId) await cargarMapaStockPorUbicacion(empresaId).then(setMapaStockUbicacion);
                setMostrarFormularioProducto(false);
              }}
              onCancelar={() => setMostrarFormularioProducto(false)}
            />
          </div>
        </div>
      )}
      {mostrarCalculadora && (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/50 p-4" onClick={() => setMostrarCalculadora(false)}>
          <section role="dialog" aria-modal="true" aria-label="Calculadora" className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl" onClick={(eventClick) => eventClick.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between"><div><p className="text-xs font-bold uppercase text-orange-600">Herramienta</p><h2 className="text-lg font-black">Calculadora</h2></div><button onClick={() => setMostrarCalculadora(false)} className="rounded-lg px-3 py-1 text-xl text-slate-500 hover:bg-slate-100" aria-label="Cerrar">×</button></div>
            <div className="grid grid-cols-[1fr_70px_1fr] items-end gap-2">
              <label className="text-xs font-bold text-slate-600">Número 1<input type="number" value={calculadoraA} onChange={(eventChange) => setCalculadoraA(eventChange.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-base" autoFocus /></label>
              <label className="text-xs font-bold text-slate-600">Operación<select value={operacionCalculadora} onChange={(eventChange) => setOperacionCalculadora(eventChange.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2 py-2 text-base"><option>+</option><option>-</option><option>×</option><option>/</option></select></label>
              <label className="text-xs font-bold text-slate-600">Número 2<input type="number" value={calculadoraB} onChange={(eventChange) => setCalculadoraB(eventChange.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-base" /></label>
            </div>
            <div className="mt-4 rounded-xl bg-slate-900 p-4 text-right"><p className="text-xs font-semibold text-slate-400">Resultado</p><p className="mt-1 min-h-8 text-2xl font-black text-white">{resultadoCalculadora === null ? '—' : resultadoCalculadora.toLocaleString('es-PY', { maximumFractionDigits: 6 })}</p></div>
            <p className="mt-3 text-xs text-slate-400">Solo calcula valores; no modifica el total ni los precios de la venta.</p>
          </section>
        </div>
      )}
      {mostrarCambioPersonal && (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/50 p-4" onClick={() => setMostrarCambioPersonal(false)}>
          <section role="dialog" aria-modal="true" aria-label="Cambiar personal de servicio" className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl" onClick={(eventClick) => eventClick.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between"><div><p className="text-xs font-bold uppercase text-indigo-600">Venta actual</p><h2 className="text-lg font-black">Cambiar personal de servicio</h2></div><button onClick={() => setMostrarCambioPersonal(false)} className="rounded-lg px-3 py-1 text-xl text-slate-500 hover:bg-slate-100" aria-label="Cerrar">×</button></div>
            <label className="block text-xs font-bold text-slate-600">Vendedor / personal asignado<select value={personalServicioCambio} onChange={(eventChange) => setPersonalServicioCambio(eventChange.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm"><option value="">Sin asignar</option>{usuariosServicio.map((usuario) => { const nombreCompleto = [usuario.nombre, usuario.apellido].filter(Boolean).join(' ').trim(); return <option key={usuario.id} value={nombreCompleto}>{nombreCompleto}</option>; })}</select></label>
            <p className="mt-3 text-xs text-slate-500">La persona elegida quedará asociada a la venta actual y a sus informes.</p>
            <div className="mt-5 flex justify-end gap-2 border-t border-slate-100 pt-4"><button onClick={() => setMostrarCambioPersonal(false)} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-bold text-slate-600">Cancelar</button><button onClick={() => { setPersonalServicio(personalServicioCambio); setMostrarCambioPersonal(false); }} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-bold text-white hover:bg-indigo-700">Aplicar cambio</button></div>
          </section>
        </div>
      )}
      {mostrarCierreCaja && (
        <CierreCaja
          cajaInfo={cajaInfo}
          session={session}
          perfilUsuario={perfilUsuario}
          onClose={() => setMostrarCierreCaja(false)}
          onCierreConfirmado={(reporte) => {
            setMostrarCierreCaja(false);
            if (onSolicitarCierre) onSolicitarCierre(reporte);
          }}
        />
      )}
      {mostrarConfigBusqueda && (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/50 p-4" onClick={() => setMostrarConfigBusqueda(false)}>
          <section role="dialog" aria-modal="true" aria-label="Configurar búsqueda de productos" className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl" onClick={(eventClick) => eventClick.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between"><div><p className="text-xs font-bold uppercase text-orange-600">Preferencias</p><h2 className="text-lg font-black">Buscar productos por</h2></div><button onClick={() => setMostrarConfigBusqueda(false)} className="rounded-lg px-3 py-1 text-xl text-slate-500 hover:bg-slate-100" aria-label="Cerrar">×</button></div>
            <div className="space-y-3">
              {[['nombre', 'Nombre del producto'], ['codigo', 'SKU / Código de barras']].map(([campo, etiqueta]) => (
                <label key={campo} className="flex cursor-pointer items-center gap-3 rounded-lg border border-slate-200 p-3 text-sm font-medium text-slate-700 hover:bg-slate-50">
                  <input
                    type="checkbox"
                    checked={camposBusqueda.includes(campo)}
                    disabled={camposBusqueda.length === 1 && camposBusqueda.includes(campo)}
                    onChange={(eventChange) => {
                      const nuevosCampos = eventChange.target.checked
                        ? [...new Set([...camposBusqueda, campo])]
                        : camposBusqueda.filter((item) => item !== campo);
                      if (!nuevosCampos.length) return;
                      setCamposBusqueda(nuevosCampos);
                      if (empresaId) localStorage.setItem(`gda_pos_campos_busqueda_${empresaId}`, JSON.stringify(nuevosCampos));
                    }}
                    className="h-4 w-4 accent-orange-500"
                  />
                  {etiqueta}
                </label>
              ))}
            </div>
            <p className="mt-4 text-xs text-slate-500">Se usa esta selección para filtrar productos y para leer códigos de barras con Enter. Dejá al menos un campo activo.</p>
            <div className="mt-5 flex justify-end"><button onClick={() => setMostrarConfigBusqueda(false)} className="rounded-lg bg-orange-500 px-4 py-2 text-sm font-bold text-white hover:bg-orange-600">Listo</button></div>
          </section>
        </div>
      )}
    </div>
  );
};

export default PuntoDeVenta;
