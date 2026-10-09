import CierreCaja from './CierreCaja';
import GastosDelTurno from './GastosDelTurno';
import DetalleCaja from './DetalleCaja';
import NuevoClientePOS from './NuevoClientePOS';
import ModalPagoMultiple from './ModalPagoMultiple';
import AgregarProducto from './AgregarProducto';
import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from './supabaseClient';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { sonidoExito, sonidoError } from './utils/sonido';
import { generateReceipt } from './utils/generateReceipt';
import { useEmpresaInfo } from './utils/useEmpresa';
import { useUbicacionUsuario } from './utils/useUbicacion';
import { cargarMapaStockPorUbicacion } from './utils/stockUbicacion';
import { useNotificacion } from './NotificacionContext';
import { cantidadInicial, pasoCantidad, cantidadValida, cantidadVisible, cantidadInterna, pasoVisible, etiquetaCantidad, formatearStock } from './utils/cantidadProducto';
import { useLanguage } from './LanguageContext';

const formatGs = (valor) => `Gs ${Number(valor || 0).toLocaleString('es-PY')}`;

const PuntoDeVenta = ({ cajaInfo, session, perfilUsuario, onVolver, onSolicitarCierre, onNuevoGasto }) => {
  const { t } = useLanguage();
  const { id: empresaId, nombre: nombreEmpresa, direccion: direccionEmpresa, telefono: telefonoEmpresa, ruc: rucEmpresa } = useEmpresaInfo();
  const { notificar } = useNotificacion();
  const [formatoTicket, setFormatoTicket] = useState(() => localStorage.getItem('gda_formato_ticket') || '80mm');

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
  const [cotizacionCargada, setCotizacionCargada] = useState(false);
  const [busqueda, setBusqueda] = useState('');
  const [camposBusqueda, setCamposBusqueda] = useState(['nombre', 'codigo']);
  const [cargando, setCargando] = useState(true);
  const [categoriaActiva, setCategoriaActiva] = useState('Todas las categorías');
  const [marcaActiva, setMarcaActiva] = useState('');

  const [cliente, setCliente] = useState('Cliente Ocasional');
  const [metodoPago, setMetodoPago] = useState('Efectivo');
  const [montoPagado, setMontoPagado] = useState('');
  const [monedaVenta, setMonedaVenta] = useState(() => {
    if (typeof window === 'undefined') return 'PYG';
    return localStorage.getItem('gda_moneda_venta') || 'PYG';
  });
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

  const [fechaHora, setFechaHora] = useState(new Date());

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
        localStorage.setItem('gda_moneda_venta', 'PYG');
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
          localStorage.setItem('gda_moneda_venta', monedaVenta);
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
    return Number.isFinite(precio) && precio > 0 ? precio : null;
  };

  const precioParaCliente = (producto) => precioDelGrupo(producto) ?? (Number(producto?.precio_venta ?? producto?.precio) || 0);

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
      setCarrito([...carrito, {
        ...producto,
        precio_lista_base: precioBase,
        precio_venta: precioAplicado,
        precio: precioAplicado,
        grupo_precio_aplicado: precioGrupo === null ? null : nombreGrupoPrecioActivo || null,
        cantidad: cantidadInicial(producto.unidad, stockDisponible),
      }]);
    }
  };

  const eliminarDelCarrito = (id) => {
    setCarrito(carrito.filter((item) => item.id !== id));
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
  }, [carrito, reglasDescuento, ubicacionActivaId]);
  const descuentoManual = Math.max(0, Number(descuento) || 0);
  const descuentoAplicado = Math.min(descuentoManual + descuentoPromocional, subtotal);
  const cargoEmbalajeAplicado = Math.max(0, Number(cargoEmbalaje) || 0);
  const totalConAjustes = Math.max(0, subtotal - descuentoAplicado + cargoEmbalajeAplicado);
  const formatMoneda = (valor, moneda = monedaVenta) => {
    const numero = Number(valor || 0);
    const simbolos = { PYG: 'Gs', USD: 'USD', EUR: 'EUR', BRL: 'R$' };
    const decimals = moneda === 'PYG' ? 0 : 2;
    const simbolo = simbolos[moneda] || moneda;
    return `${simbolo} ${numero.toLocaleString('es-PY', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}`;
  };
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

    // Si viene del modal de Pago Múltiple, usamos esos valores; si no,
    // seguimos leyendo los mismos estados de siempre (montoPagado, metodoPago,
    // notaVenta) para no cambiar en nada el comportamiento de los botones existentes.
    let montoPagadoFinal = datosPagoMultiple ? datosPagoMultiple.montoPagado : convertirAGs(Number(montoPagado) || 0);
    
    // Si el usuario hace clic en "COBRAR" (tipoOperacion 'venta') sin escribir un monto, 
    // asumimos que pagó el total exacto.
    if (!datosPagoMultiple && tipoOperacion === 'venta' && (montoPagado === '' || montoPagado === undefined)) {
      montoPagadoFinal = totalConAjustes;
    } else if (!montoPagadoFinal) {
      montoPagadoFinal = 0;
    }

    const metodoPagoFinal = datosPagoMultiple ? datosPagoMultiple.metodoPago : (metodoForzado || metodoPago);
    const notaVentaFinal = datosPagoMultiple
      ? [notaVenta, datosPagoMultiple.notaPagos].filter(Boolean).join(' | ')
      : (notaForzada || notaVenta);

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

    const saldoPendienteFinal = datosPagoMultiple ? datosPagoMultiple.saldoPendiente : saldoPendiente;

    const nuevaVenta = {
      empresa_id: empresaId,
      usuario_nombre: [perfilUsuario?.nombre, perfilUsuario?.apellido].filter(Boolean).join(' ').trim() || perfilUsuario?.nombre_usuario || null,
      personal_servicio: personalServicio || null,
      cliente,
      grupo_precio: nombreGrupoPrecioActivo || null,
      total: totalConAjustes,
      metodo_pago: metodoPagoFinal,
      estado_pago: estadoPago,
      monto_pagado: montoPagadoFinal,
      saldo_pendiente: estadoPago === 'Credito' ? totalConAjustes : saldoPendienteFinal,
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
      const ventaParaTicket = { ...nuevaVenta, id: ventaId, cliente_nombre: cliente, cliente_ruc: clienteRuc, items: carrito };
      generateReceipt(
        ventaParaTicket,
        { nombre: nombreEmpresa, direccion: direccionEmpresa, telefono: telefonoEmpresa, ruc: rucEmpresa },
        formatoTicket,
        true
      );
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
        monto: f.cantidad,
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

      <div className="bg-white border-b border-gray-200 px-4 py-2 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          <button onClick={() => onVolver && onVolver()} className="text-gray-500 hover:text-gray-800 font-medium text-sm">
            ← Volver
          </button>
          <span className="text-gray-800 font-bold text-sm">{perfilUsuario?.empresas?.nombre || 'Mi Negocio'}</span>
          <span className="text-gray-400 text-xs">
            {fechaHora.toLocaleDateString('es-PY')} {fechaHora.toLocaleTimeString('es-PY', { hour: '2-digit', minute: '2-digit' })}
          </span>
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
                <label className="font-bold text-gray-500 block mb-1 truncate">{t('discount')} manual (Gs)</label>
                <input type="number" min="0" max={Math.max(0, subtotal - descuentoPromocional)} step="1" value={descuento} onChange={(e) => setDescuento(e.target.value)} onBlur={() => setDescuento(String(Math.min(descuentoManual, Math.max(0, subtotal - descuentoPromocional)) || ''))} className="w-full h-8 border border-gray-300 rounded px-2 bg-white" />
                {descuentoPromocional > 0 && <p className="mt-1 text-[10px] font-semibold text-emerald-700">Promoción automática: {formatGs(descuentoPromocional)}</p>}
              </div>
              <div className="min-w-0">
                <label className="font-bold text-gray-500 block mb-1 truncate">{t('packagingCharge')} (Gs)</label>
                <input type="number" min="0" step="1" value={cargoEmbalaje} onChange={(e) => setCargoEmbalaje(e.target.value)} onBlur={() => setCargoEmbalaje(String(cargoEmbalajeAplicado || ''))} className="w-full h-8 border border-gray-300 rounded px-2 bg-white" />
              </div>
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
              <div className="min-w-0">
                <label className="font-bold text-gray-500 block mb-1 truncate">{t('saleNote')}</label>
                <input type="text" value={notaVenta} onChange={(e) => setNotaVenta(e.target.value)} className="w-full h-8 border border-gray-300 rounded px-2 bg-white" />
              </div>
            </div>
          )}

          <div className="flex-1 overflow-y-auto px-2 bg-gray-50/40">
            <table className="w-full min-w-[560px] text-sm border-separate border-spacing-0">
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
                    return (
                      <React.Fragment key={item.id}>
                        <tr className="border-b border-gray-200 even:bg-white odd:bg-gray-50/70 hover:bg-orange-50">
                          <td className="py-3 pr-2 font-medium text-gray-800 min-w-[190px]">
                            <div className="flex items-center gap-2 min-w-0">
                              <div className="w-9 h-9 rounded bg-white border border-gray-200 flex-shrink-0 flex items-center justify-center overflow-hidden shadow-sm">
                                {item.imagen_url ? (
                                  <img src={item.imagen_url} alt={item.nombre} className="w-full h-full object-cover" />
                                ) : (
                                  <span className="text-xs text-gray-300">{esCombo ? '🎁' : '📦'}</span>
                                )}
                              </div>
                              <div className="min-w-0">
                                <span className="leading-tight line-clamp-2 break-words" title={item.nombre}>{item.nombre}</span>
                                {esCombo && (
                                  <button
                                    onClick={() => toggleComboExpandido(item.id)}
                                    className="mt-0.5 flex items-center gap-1 text-[10px] font-bold text-orange-500 hover:text-orange-700"
                                  >
                                    <span className="bg-orange-100 text-orange-600 px-1.5 py-0.5 rounded-full">COMBO</span>
                                    <span>{expandido ? '▲ ocultar' : '▼ ver contenido'}</span>
                                  </button>
                                )}
                              </div>
                            </div>
                          </td>
                          <td className="py-3 px-1 text-center whitespace-nowrap">
                            <div className="inline-flex items-center gap-1">
                              <button onClick={() => cambiarCantidad(item.id, item.cantidad - pasoCantidad(item.unidad))} className="bg-gray-100 w-6 h-6 rounded text-gray-600 font-bold hover:bg-gray-200">-</button>
                              <input
                                type="number"
                                min={pasoVisible(item.unidad)}
                                step={pasoVisible(item.unidad)}
                                value={cantidadVisible(item.cantidad, item.unidad)}
                                onChange={(e) => cambiarCantidad(item.id, cantidadInterna(e.target.value, item.unidad))}
                                className="w-16 text-center border border-gray-200 rounded px-1 py-0.5"
                                aria-label={`Cantidad de ${item.nombre} en ${etiquetaCantidad(item.unidad)}`}
                              />
                              <span className="text-[10px] text-gray-400">{etiquetaCantidad(item.unidad)}</span>
                              <button onClick={() => cambiarCantidad(item.id, item.cantidad + pasoCantidad(item.unidad))} className="bg-gray-100 w-6 h-6 rounded text-gray-600 font-bold hover:bg-gray-200">+</button>
                            </div>
                          </td>
                          <td className="py-3 px-1 text-right whitespace-nowrap">
                            <input
                              type="number"
                              value={precio}
                              onChange={(e) => cambiarPrecioUnitario(item.id, convertirAGs(Number(e.target.value) || 0))}
                              className="w-24 text-right border border-gray-200 rounded px-1.5 py-1 text-gray-700 focus:outline-none focus:ring-1 focus:ring-orange-400"
                            />
                          </td>
                          <td className="py-3 px-1 text-right whitespace-nowrap">
                            <input
                              type="number"
                              value={subtotalItem}
                              onChange={(e) => cambiarSubtotalManual(item.id, convertirAGs(Number(e.target.value) || 0))}
                              className="w-24 text-right border border-gray-200 rounded px-1.5 py-1 font-bold text-gray-800 focus:outline-none focus:ring-1 focus:ring-orange-400"
                            />
                          </td>
                          <td className="py-3 pl-2 text-center whitespace-nowrap">
                            <button onClick={() => eliminarDelCarrito(item.id)} className="text-red-400 hover:text-red-600 font-bold">✕</button>
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

          <div className="border-t border-gray-200 p-3 flex justify-between text-sm font-bold text-gray-600">
            <span>{t('items')}: {totalArticulos}</span>
            <span>{t('total')}: {formatMoneda(totalEnMoneda, monedaVenta)}</span>
          </div>

          <div className="shrink-0 border-t-2 border-gray-300 bg-white p-2 shadow-[0_-3px_10px_rgba(0,0,0,0.05)]">
            <div className="flex flex-wrap items-end gap-2">
              <div className="w-32 shrink-0 rounded-lg border border-gray-200 bg-gray-50 p-1.5">
                <label className="text-[10px] font-bold text-gray-500 block mb-1">Moneda</label>
                <select value={monedaVenta} onChange={(e) => setMonedaVenta(e.target.value)} className="w-full h-8 border border-gray-300 rounded px-2 text-xs font-bold bg-white" disabled={cargandoTasa}>
                  <option value="PYG">PYG</option>
                  <option value="USD">USD</option>
                  <option value="EUR">EUR</option>
                  <option value="BRL">BRL</option>
                </select>
              </div>
              <div className="w-28 shrink-0 rounded-lg border border-gray-200 bg-sky-50 p-1.5">
                <label className="text-[10px] font-bold text-sky-700 block mb-1">Mercado</label>
                <div className="h-8 rounded bg-white border border-sky-200 px-2 flex items-center justify-center text-[10px] font-black text-sky-800">
                  {cargandoTasa ? '...' : Number(tasaReferencia || 0).toLocaleString('es-PY', { maximumFractionDigits: 0 })}
                </div>
              </div>
              <div className="w-24 shrink-0 rounded-lg border border-gray-200 bg-amber-50 p-1.5">
                <label className="text-[10px] font-bold text-amber-700 block mb-1">Margen %</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={margenNegocio}
                  onChange={(e) => setMargenNegocio(Number(e.target.value) || 0)}
                  className="w-full h-8 border border-amber-200 rounded px-2 text-xs font-bold bg-white"
                />
              </div>
              <div className="w-28 shrink-0 rounded-lg border border-gray-200 bg-amber-50 p-1.5">
                <label className="text-[10px] font-bold text-amber-700 block mb-1">Tasa</label>
                <div className="h-8 rounded bg-white border border-amber-200 px-2 flex items-center justify-center text-[10px] font-black text-amber-800">
                  {cargandoTasa ? '...' : Number(tasaCambio || 0).toLocaleString('es-PY', { maximumFractionDigits: 0 })}
                </div>
              </div>
              <div className="w-36 shrink-0 rounded-lg border border-gray-200 bg-gray-50 p-1.5">
                <label className="text-[10px] font-bold text-gray-500 block mb-1">{t('paidWith')} ({monedaVenta})</label>
                <input type="number" placeholder={monedaVenta === 'PYG' ? 'Ej: 100000' : 'Ej: 100'} value={montoPagado} onChange={(e) => setMontoPagado(e.target.value)} className="w-full h-8 border border-gray-300 rounded px-2 font-bold text-sm" />
              </div>
              <div className="w-40 shrink-0 rounded-lg border border-gray-200 bg-gray-50 p-1.5">
                <label className="text-[10px] font-bold text-gray-500 block mb-1">{t('paymentMethod')}</label>
                <select value={metodoPago} onChange={(e) => setMetodoPago(e.target.value)} className="w-full h-8 border border-gray-300 rounded px-2 text-xs font-bold bg-white">
                  <option value="Efectivo">💵 {t('cash')}</option>
                  <option value="Tarjeta">💳 {t('card')}</option>
                  <option value="Transferencia">🏦 {t('transferShort')}</option>
                </select>
              </div>
              <button
                onClick={() => procesarVenta('venta')}
                disabled={carrito.length === 0}
                className={`h-11 flex-1 min-w-[170px] rounded-lg font-black text-sm text-white transition-all ${carrito.length === 0 ? 'bg-gray-300 cursor-not-allowed' : 'bg-orange-500 hover:bg-orange-600'}`}
              >
                {t('charge')} {formatMoneda(totalEnMoneda, monedaVenta)}
              </button>
            </div>

          {vuelto > 0 && (
            <div className="mt-2 bg-green-50 text-green-800 p-1.5 rounded flex justify-between font-bold border border-green-200 text-xs">
              <span>{t('change')}:</span><span>{formatMoneda(vueltoEnMoneda, monedaVenta)} · {formatGs(vuelto)}</span>
            </div>
          )}
          {saldoPendiente > 0 && (
            <div className="mt-2 bg-red-50 text-red-800 p-1.5 rounded flex justify-between font-bold border border-red-200 text-xs">
              <span>{t('remainingDebt')}:</span><span>{formatMoneda(saldoPendienteEnMoneda, monedaVenta)} · {formatGs(saldoPendiente)}</span>
            </div>
          )}

            <div className="mt-2 flex gap-1.5 overflow-x-auto text-[10px] font-bold pb-0.5">
            <button onClick={() => procesarVenta('pendiente')} disabled={carrito.length === 0} className="shrink-0 whitespace-nowrap bg-gray-100 text-gray-700 px-3 py-2 rounded-lg hover:bg-gray-200 disabled:opacity-50">📝 {t('pendingOrder')}</button>
            <button onClick={() => procesarVenta('cotizacion')} disabled={carrito.length === 0} className="shrink-0 whitespace-nowrap bg-gray-100 text-gray-700 px-3 py-2 rounded-lg hover:bg-gray-200 disabled:opacity-50">📄 {t('quote')}</button>
            <button onClick={procesarDelivery} disabled={carrito.length === 0} className="shrink-0 whitespace-nowrap bg-blue-50 text-blue-700 px-3 py-2 rounded-lg hover:bg-blue-100 disabled:opacity-50">🚚 Delivery</button>
            <button onClick={() => procesarVenta('credito')} disabled={carrito.length === 0} className="shrink-0 whitespace-nowrap bg-indigo-50 text-indigo-700 px-3 py-2 rounded-lg hover:bg-indigo-100 disabled:opacity-50">💳 {t('creditSale')}</button>
            <button onClick={() => cobrarConMetodo('Tarjeta')} disabled={carrito.length === 0} className="shrink-0 whitespace-nowrap bg-pink-50 text-pink-700 px-3 py-2 rounded-lg hover:bg-pink-100 disabled:opacity-50">💳 {t('card')}</button>
            <button onClick={() => setMostrarPagoMultiple(true)} disabled={carrito.length === 0} className="shrink-0 whitespace-nowrap bg-sky-50 text-sky-700 px-3 py-2 rounded-lg hover:bg-sky-100 disabled:opacity-50">▣ {t('multiplePayment')}</button>
            <button onClick={() => cobrarConMetodo('Efectivo')} disabled={carrito.length === 0} className="shrink-0 whitespace-nowrap bg-emerald-50 text-emerald-700 px-3 py-2 rounded-lg hover:bg-emerald-100 disabled:opacity-50">💵 {t('cash')}</button>
            <button onClick={vaciarCarrito} className="shrink-0 whitespace-nowrap bg-red-50 text-red-600 px-3 py-2 rounded-lg hover:bg-red-100">✕ {t('cancel')}</button>
            </div>
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
            {cargando ? (
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
                    className="bg-white rounded-xl shadow-sm border border-gray-100 cursor-pointer hover:border-orange-500 hover:shadow-md transition-all overflow-hidden flex flex-col"
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
                        <p className="text-orange-600 font-black">{formatMoneda(convertirDesdeGs(precioParaCliente(prod)), monedaVenta)}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
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
        totalAPagar={totalConAjustes}
        cuentasCaja={cuentasCaja}
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
