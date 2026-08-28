import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from './supabaseClient';
import FiltroFecha from './FiltroFecha';
import { useEmpresaInfo } from './utils/useEmpresa';
import { useSucursalActiva } from './utils/SucursalContext';
import {
  ShoppingCart, TrendingUp, FileWarning, MinusCircle, Package,
  AlertTriangle, Handshake, LineChart, PieChart as PieChartIcon,
  BarChart3, Trophy, Lightbulb, CalendarRange, Wallet, Boxes,
  Clock, Receipt,
  Menu, Bell, Search, Store, RefreshCw,
} from 'lucide-react';
import {
  AreaChart, Area, BarChart, Bar, XAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, CartesianGrid,
} from 'recharts';
import { useLanguage } from './LanguageContext';

const formatCurrency = (value) => `Gs ${Math.round(Number(value) || 0).toLocaleString('es-PY')}`;

const getNumericValue = (row, keys) => {
  for (const key of keys) {
    const value = row?.[key];
    if (value === null || value === undefined || value === '') continue;
    const parsed = Number(value);
    if (!Number.isNaN(parsed)) return parsed;
  }
  return 0;
};

const getTextValue = (row, keys, fallback = '—') => {
  for (const key of keys) {
    const value = row?.[key];
    if (value !== null && value !== undefined && value !== '') return value;
  }
  return fallback;
};

const toDate = (value) => {
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime()) ? date : null;
};

const MESES_CORTOS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
const COLORS = ['#3b82f6', '#f59e0b', '#ef4444', '#10b981', '#8b5cf6'];

const Inicio = ({ perfilUsuario }) => {
    const { t, locale } = useLanguage();
  const { id: empresaId, nombre: nombreDelNegocio } = useEmpresaInfo();
  // Sucursal elegida en el selector global del header (compartida con toda la app)
  const { sucursalActiva: filtroUbicacion } = useSucursalActiva();
  const [ventas, setVentas] = useState([]);
  const [gastos, setGastos] = useState([]);
  const [compras, setCompras] = useState([]);
  const [productos, setProductos] = useState([]);
  const [detalleVentas, setDetalleVentas] = useState([]);
  const [hayDetalleVentas, setHayDetalleVentas] = useState(true);
  const [hayCaducidad, setHayCaducidad] = useState(true);
  const [cajasAbiertas, setCajasAbiertas] = useState([]);
  const [ubicacionesMapa, setUbicacionesMapa] = useState({});

  const [tabActiva, setTabActiva] = useState('cobrar');

  // === FILTRO DE FECHA — arranca en "Hoy" por defecto ===
  const [rango, setRango] = useState(() => {
    const hoy = new Date();
    const inicioHoy = new Date(hoy); inicioHoy.setHours(0, 0, 0, 0);
    const finHoy = new Date(hoy); finHoy.setHours(23, 59, 59, 999);
    return { desde: inicioHoy, hasta: finHoy, label: 'Hoy' };
  });

  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);

  // ==========================================================
  // MODAL "Monto total pagado o pago parcial"
  // Clon funcional de app.micdepos.com/home (tabla Deudas por Cobrar)
  // ==========================================================
  const [deudaPagar, setDeudaPagar] = useState(null);
  const [metodoPagoInicio, setMetodoPagoInicio] = useState('Efectivo');
  const [fechaPagoInicio, setFechaPagoInicio] = useState('');
  const [cantidadPagoInicio, setCantidadPagoInicio] = useState('');
  const [cuentaPagoInicio, setCuentaPagoInicio] = useState('Ninguna');
  const [notaPagoInicio, setNotaPagoInicio] = useState('');
  const [documentoPagoInicio, setDocumentoPagoInicio] = useState(null);
  const [nombreDocumentoPagoInicio, setNombreDocumentoPagoInicio] = useState('');
  const [subiendoDocumentoInicio, setSubiendoDocumentoInicio] = useState(false);
  const [guardandoPagoInicio, setGuardandoPagoInicio] = useState(false);

  const abrirModalPagoInicio = (deuda) => {
    setDeudaPagar(deuda);
    setMetodoPagoInicio('Efectivo');
    setFechaPagoInicio(new Date().toISOString().slice(0, 10));
    setCantidadPagoInicio(String(deuda.monto));
    setCuentaPagoInicio('Ninguna');
    setNotaPagoInicio('');
    setDocumentoPagoInicio(null);
    setNombreDocumentoPagoInicio('');
  };

  const manejarDocumentoPagoInicio = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) return alert('El archivo supera los 5MB.');
    setSubiendoDocumentoInicio(true);
    try {
      const extension = file.name.split('.').pop();
      const nombreArchivo = `${crypto.randomUUID()}.${extension}`;
      const { error: errorSubida } = await supabase.storage.from('comprobantes-pago').upload(nombreArchivo, file);
      if (errorSubida) throw errorSubida;
      const { data: urlData } = supabase.storage.from('comprobantes-pago').getPublicUrl(nombreArchivo);
      setDocumentoPagoInicio(urlData.publicUrl);
      setNombreDocumentoPagoInicio(file.name);
    } catch (error) {
      alert('Error al subir el documento: ' + error.message + '\n\n¿Ya creaste el bucket "comprobantes-pago" en Supabase Storage?');
    } finally {
      setSubiendoDocumentoInicio(false);
    }
  };

  const confirmarPagoInicio = async () => {
    if (!deudaPagar) return;
    const monto = parseFloat(cantidadPagoInicio);
    if (!monto || monto <= 0) return alert('Ingresá un monto válido.');
    if (monto > deudaPagar.monto) {
      if (!window.confirm(`El monto ingresado (${formatCurrency(monto)}) es mayor a la deuda pendiente (${formatCurrency(deudaPagar.monto)}). ¿Igual querés continuar? Se dejará el saldo en 0.`)) {
        return;
      }
    }
    setGuardandoPagoInicio(true);
    try {
      const nuevoSaldo = Math.max(0, deudaPagar.monto - monto);
      const nuevoEstado = nuevoSaldo <= 0 ? 'Pagado' : 'Pago Parcial';

      // 1) ESTO ES LO REAL: actualizamos la venta específica en Supabase.
      const { error: errorUpdate } = await supabase
        .from('ventas')
        .update({ saldo_pendiente: nuevoSaldo, estado_pago: nuevoEstado })
        .eq('id', deudaPagar.id);
      if (errorUpdate) throw errorUpdate;

      // 2) Buscamos si el cliente existe en tu tabla "clientes" para dejar
      // también el pago registrado en su historial (Libro Mayor -> Pagos).
      // Si no lo encuentra (venta antigua sin cliente registrado), no pasa
      // nada: el paso 1 ya es lo que realmente importa (saldo actualizado).
      try {
        let qCliente = supabase.from('clientes').select('id').eq('nombre', deudaPagar.cliente);
        if (empresaId) qCliente = qCliente.eq('empresa_id', empresaId);
        const { data: clienteEncontrado } = await qCliente.maybeSingle();
        if (clienteEncontrado) {
          await supabase.from('pagos_clientes').insert([{
            empresa_id: empresaId,
            cliente_id: clienteEncontrado.id,
            monto,
            metodo_pago: metodoPagoInicio,
            nota: notaPagoInicio || null,
            fecha: fechaPagoInicio ? new Date(fechaPagoInicio).toISOString() : new Date().toISOString(),
            cuenta_pago: cuentaPagoInicio !== 'Ninguna' ? cuentaPagoInicio : null,
            documento_url: documentoPagoInicio || null,
          }]);
        }
      } catch (errorSecundario) {
        console.warn('No se pudo registrar el pago en el historial del cliente:', errorSecundario.message);
      }

      // Reflejamos el cambio al instante en pantalla, sin esperar una recarga completa.
      setVentas((prev) => prev.map((v) => (
        v.id === deudaPagar.id ? { ...v, saldo_pendiente: nuevoSaldo, estado_pago: nuevoEstado } : v
      )));

      setDeudaPagar(null);
    } catch (error) {
      alert('Error al registrar el pago: ' + error.message);
    } finally {
      setGuardandoPagoInicio(false);
    }
  };

  const hora = new Date().getHours();
  const saludo = hora < 12 ? 'Buenos días' : hora < 19 ? 'Buenas tardes' : 'Buenas noches';
  const fechaHoy = new Date().toLocaleDateString('es-PY', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });

  useEffect(() => {
    let isMounted = true;
    const cargarDatos = async () => {
      if (!empresaId) return;
      setCargando(true);
      setError(null);
      try {
        let qVentas = supabase.from('ventas').select('*').eq('empresa_id', empresaId);
        let qGastos = supabase.from('gastos').select('*').eq('empresa_id', empresaId);
        let qCompras = supabase.from('compras').select('*').eq('empresa_id', empresaId);
        if (filtroUbicacion) {
          qVentas = qVentas.eq('ubicacion_id', filtroUbicacion);
          qGastos = qGastos.eq('ubicacion_id', filtroUbicacion);
          qCompras = qCompras.eq('ubicacion_id', filtroUbicacion);
        }
        let qCajas = supabase.from('caja_registros').select('*').eq('empresa_id', empresaId).eq('estado', 'Abierta');
        if (filtroUbicacion) qCajas = qCajas.eq('ubicacion_id', filtroUbicacion);
        const [rv, rg, rc, rp, rd, rcajas, rubic] = await Promise.all([
          qVentas,
          qGastos,
          qCompras,
          supabase.from('productos').select('*').eq('empresa_id', empresaId),
          supabase.from('detalle_ventas').select('*').eq('empresa_id', empresaId),
          qCajas,
          supabase.from('ubicaciones_comerciales').select('id, nombre').eq('empresa_id', empresaId),
        ]);
        if (!isMounted) return;

        setVentas(rv.data || []);
        setGastos(rg.data || []);
        setCompras(rc.data || []);
        setProductos(rp.data || []);
        setDetalleVentas(rd.data || []);
        setCajasAbiertas(rcajas.data || []);
        setUbicacionesMapa(Object.fromEntries((rubic.data || []).map((u) => [u.id, u.nombre])));
        if (rd.error) setHayDetalleVentas(false);
        setHayCaducidad((rp.data || []).some((p) => p.fecha_vencimiento));
      } catch (err) {
        console.error(err);
        if (isMounted) setError('No se pudieron cargar los datos desde Supabase.');
      } finally {
        if (isMounted) setCargando(false);
      }
    };
    cargarDatos();
    return () => { isMounted = false; };
  }, [empresaId, filtroUbicacion]);

  // === CAJAS ABIERTAS EN VIVO: se actualiza sola cada 20s, sin recargar todo ===
  // Así, si otro cajero cierra su caja desde otra máquina, desaparece de acá
  // sin que este usuario tenga que recargar la página.
  useEffect(() => {
    if (!empresaId) return;
    let cancelado = false;

    const actualizarCajasEnVivo = async () => {
      let q = supabase.from('caja_registros').select('*').eq('empresa_id', empresaId).eq('estado', 'Abierta');
      if (filtroUbicacion) q = q.eq('ubicacion_id', filtroUbicacion);
      const { data: cajas } = await q;
      if (cancelado) return;
      setCajasAbiertas(cajas || []);

      // Traemos también las ventas de esas cajas puntuales, para que
      // Ventas/Efectivo/Tarjeta/Transacc. de cada tarjeta estén al día.
      if (cajas && cajas.length > 0) {
        const { data: ventasDeCajas } = await supabase
          .from('ventas')
          .select('*')
          .in('caja_id', cajas.map((c) => c.id));
        if (cancelado || !ventasDeCajas) return;
        setVentas((prev) => {
          const idsCajasAbiertas = new Set(cajas.map((c) => c.id));
          const restoDeVentas = prev.filter((v) => !idsCajasAbiertas.has(v.caja_id));
          return [...restoDeVentas, ...ventasDeCajas];
        });
      }
    };

    actualizarCajasEnVivo(); // primera carga inmediata
    const intervalo = setInterval(actualizarCajasEnVivo, 20000); // y después, cada 20s

    return () => { cancelado = true; clearInterval(intervalo); };
  }, [empresaId, filtroUbicacion]);

  const dentroDelRango = (fecha) => {
    if (!rango.desde && !rango.hasta) return true;
    const f = toDate(fecha);
    if (!f) return false;
    if (rango.desde && f < rango.desde) return false;
    if (rango.hasta && f > rango.hasta) return false;
    return true;
  };

  const ventasF = useMemo(() => ventas.filter((v) => dentroDelRango(v.fecha)), [ventas, rango]);
  const gastosF = useMemo(() => gastos.filter((g) => dentroDelRango(g.fecha)), [gastos, rango]);
  const comprasF = useMemo(() => compras.filter((c) => dentroDelRango(c.fecha)), [compras, rango]);

  // === TOTALES DEL PERÍODO ===
  const totalVentas = ventasF.reduce((a, v) => a + getNumericValue(v, ['total', 'monto', 'valor']), 0);
  const totalGastos = gastosF.reduce((a, g) => a + getNumericValue(g, ['monto', 'total']), 0);
  const totalCompras = comprasF.reduce((a, c) => a + getNumericValue(c, ['total', 'total_compra']), 0);
  const neto = totalVentas - totalCompras - totalGastos;

  // === SALDOS ACTUALES (no dependen del filtro de fecha) ===
  const deudaCompras = compras.reduce((a, c) => a + getNumericValue(c, ['saldo_pendiente', 'saldo']), 0);
  const ventasConCredito = ventas.filter((v) => getNumericValue(v, ['saldo_pendiente', 'saldo']) > 0);
  const deudaVentas = ventasConCredito.reduce((a, v) => a + getNumericValue(v, ['saldo_pendiente', 'saldo']), 0);

  // === VARIACIÓN vs período anterior de igual duración ===
  const variacionVsAnterior = useMemo(() => {
    if (!rango.desde || !rango.hasta) return null;
    const duracion = rango.hasta.getTime() - rango.desde.getTime();
    const finAnterior = new Date(rango.desde.getTime() - 1);
    const inicioAnterior = new Date(finAnterior.getTime() - duracion);
    const ventasAnterior = ventas.reduce((a, v) => {
      const f = toDate(v.fecha);
      if (!f || f < inicioAnterior || f > finAnterior) return a;
      return a + getNumericValue(v, ['total', 'monto', 'valor']);
    }, 0);
    if (!ventasAnterior) return null;
    return ((totalVentas - ventasAnterior) / ventasAnterior) * 100;
  }, [rango, ventas, totalVentas]);

  // === GRÁFICO: VENTAS DEL PERÍODO, POR DÍA ===
  const datosLinea = useMemo(() => {
    const desde = rango.desde || (() => { const d = new Date(); d.setDate(d.getDate() - 29); d.setHours(0, 0, 0, 0); return d; })();
    const hasta = rango.hasta || new Date();
    const cantDias = Math.min(90, Math.max(1, Math.round((hasta - desde) / 86400000) + 1));
    const mapa = {};
    const orden = [];
    for (let i = 0; i < cantDias; i++) {
      const d = new Date(desde); d.setDate(d.getDate() + i);
      if (d > hasta) break;
      const key = d.toLocaleDateString(locale, { day: '2-digit', month: 'short' });
      mapa[key] = 0;
      orden.push(key);
    }
    ventasF.forEach((v) => {
      const f = toDate(v.fecha);
      if (!f) return;
      const key = f.toLocaleDateString(locale, { day: '2-digit', month: 'short' });
      if (mapa[key] !== undefined) mapa[key] += getNumericValue(v, ['total', 'monto', 'valor']);
    });
    return orden.map((name) => ({ name, total: mapa[name] }));
  }, [ventasF, rango]);

  // === PIE: COMPOSICIÓN VENTAS/COMPRAS/GASTOS DEL PERÍODO ===
  const datosPie = [
    { name: 'Ventas', value: totalVentas },
    { name: 'Compras', value: totalCompras },
    { name: 'Gastos', value: totalGastos },
  ].filter((d) => d.value > 0);

  // === BARRAS: VENTAS VS COMPRAS VS GASTOS (6 MESES, siempre histórico reciente) ===
  const datos6meses = useMemo(() => {
    const ahora = new Date();
    const mapa = {};
    for (let i = 5; i >= 0; i--) {
      const d = new Date(ahora.getFullYear(), ahora.getMonth() - i, 1);
      const key = MESES_CORTOS[d.getMonth()];
      mapa[key] = { name: key, Ventas: 0, Compras: 0, Gastos: 0 };
    }
    const acumular = (lista, campo, keys) => {
      lista.forEach((item) => {
        const f = toDate(item.fecha);
        if (!f) return;
        const key = MESES_CORTOS[f.getMonth()];
        if (mapa[key]) mapa[key][campo] += getNumericValue(item, keys);
      });
    };
    acumular(ventas, 'Ventas', ['total', 'monto', 'valor']);
    acumular(compras, 'Compras', ['total', 'total_compra']);
    acumular(gastos, 'Gastos', ['monto', 'total']);
    return Object.values(mapa);
  }, [ventas, compras, gastos]);

  // === BARRAS: AÑO FISCAL ACTUAL ===
  const datosAnioFiscal = useMemo(() => {
    const ahora = new Date();
    const inicioAnio = new Date(ahora.getFullYear(), 0, 1);
    const mapa = {};
    MESES_CORTOS.forEach((m) => { mapa[m] = { name: `${m} ${ahora.getFullYear()}`, total: 0 }; });
    ventas.forEach((v) => {
      const f = toDate(v.fecha);
      if (!f || f < inicioAnio) return;
      mapa[MESES_CORTOS[f.getMonth()]].total += getNumericValue(v, ['total', 'monto', 'valor']);
    });
    return Object.values(mapa);
  }, [ventas]);

  // === TOP 5 PRODUCTOS (del período elegido) ===
  const idsVentasF = new Set(ventasF.map((v) => v.id));
  const detalleF = detalleVentas.filter((d) => idsVentasF.has(d.venta_id));
  const topProductos = useMemo(() => {
    const acum = {};
    detalleF.forEach((d) => {
      const nombre = getTextValue(d, ['nombre_producto'], 'Producto');
      acum[nombre] = (acum[nombre] || 0) + getNumericValue(d, ['cantidad']);
    });
    return Object.entries(acum)
      .map(([nombre, cantidad]) => ({ nombre, cantidad }))
      .sort((a, b) => b.cantidad - a.cantidad)
      .slice(0, 5);
  }, [detalleF]);

  // === CAJAS ABIERTAS: ventas/efectivo/tarjeta/transacciones de cada una ===
  const cajasAbiertasConDatos = useMemo(() => {
    const formatDuracion = (fechaApertura) => {
      // Forzar que se trate como UTC si no tiene la Z al final
      const apStr = fechaApertura?.endsWith('Z') ? fechaApertura : `${fechaApertura}Z`;
      const ap = new Date(apStr);
      if (isNaN(ap.getTime())) return '';
      const ms = Date.now() - ap.getTime();
      const horas = Math.floor(Math.abs(ms) / 3600000);
      const minutos = Math.floor((Math.abs(ms) % 3600000) / 60000);
      const hora = ap.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
      return `Abierta hace ${horas}h ${minutos}min (desde ${hora})`;
    };
    return cajasAbiertas.map((caja) => {
      const ventasDeCaja = ventas.filter((v) => v.caja_id === caja.id);
      const totalVentasCaja = ventasDeCaja.reduce((a, v) => a + getNumericValue(v, ['total', 'monto', 'valor']), 0);
      const totalEfectivo = ventasDeCaja.filter((v) => (v.metodo_pago || '').toLowerCase() === 'efectivo').reduce((a, v) => a + getNumericValue(v, ['total']), 0);
      const totalTarjeta = ventasDeCaja.filter((v) => (v.metodo_pago || '').toLowerCase() === 'tarjeta').reduce((a, v) => a + getNumericValue(v, ['total']), 0);
      return {
        ...caja,
        usuarioMostrado: caja.usuario || 'Sin usuario registrado',
        ubicacionNombre: ubicacionesMapa[caja.ubicacion_id] || nombreDelNegocio || '—',
        duracion: formatDuracion(caja.fecha_apertura),
        totalVentasCaja,
        totalEfectivo,
        totalTarjeta,
        transacciones: ventasDeCaja.length,
      };
    });
  }, [cajasAbiertas, ventas, ubicacionesMapa, nombreDelNegocio]);

  const forzarCierreCaja = async (idCaja) => {
    if (!window.confirm("¿Estás seguro de forzar el cierre de esta caja? (Usar solo si quedó atascada)")) return;
    try {
      const { error } = await supabase.from('caja_registros').update({ estado: 'Cerrada', nota_cierre: 'Cierre forzado desde Inicio' }).eq('id', idCaja);
      if (error) throw error;
      setCajasAbiertas(prev => prev.filter(c => c.id !== idCaja));
      alert("Caja cerrada correctamente.");
    } catch (err) {
      alert("Error al cerrar la caja: " + err.message);
    }
  };

  // === DEUDAS POR COBRAR / PAGAR / STOCK BAJO (estado actual) ===
  const deudasCobrar = ventasConCredito
    .map((v) => ({
      id: v.id,
      cliente: getTextValue(v, ['cliente', 'cliente_nombre'], 'Cliente Ocasional'),
      factura: getTextValue(v, ['id', 'nro_factura']),
      monto: getNumericValue(v, ['saldo_pendiente', 'saldo']),
      total: getNumericValue(v, ['total']),
      nota: getTextValue(v, ['nota_venta'], ''),
    }))
    .sort((a, b) => b.monto - a.monto)
    .slice(0, 10);

  const deudasPagar = compras
    .filter((c) => getNumericValue(c, ['saldo_pendiente', 'saldo']) > 0)
    .map((c) => ({
      proveedor: getTextValue(c, ['proveedor_nombre', 'proveedor'], 'Proveedor'),
      factura: getTextValue(c, ['nro_factura', 'id']),
      monto: getNumericValue(c, ['saldo_pendiente', 'saldo']),
    }))
    .sort((a, b) => b.monto - a.monto)
    .slice(0, 10);

  const UMBRAL_STOCK_BAJO = 5;
  const stockBajo = productos
    .filter((p) => getNumericValue(p, ['stock_actual', 'stock']) <= UMBRAL_STOCK_BAJO)
    .map((p) => ({
      nombre: getTextValue(p, ['nombre'], 'Producto'),
      sku: getTextValue(p, ['sku', 'codigo'], '—'),
      stock: getNumericValue(p, ['stock_actual', 'stock']),
    }))
    .sort((a, b) => a.stock - b.stock)
    .slice(0, 15);

  // === ALERTA DE CADUCIDAD ===
  const alertaCaducidad = useMemo(() => {
    if (!hayCaducidad) return [];
    const en90dias = new Date(); en90dias.setDate(en90dias.getDate() + 90);
    return productos
      .filter((p) => p.fecha_vencimiento && toDate(p.fecha_vencimiento) && toDate(p.fecha_vencimiento) <= en90dias)
      .map((p) => ({
        nombre: getTextValue(p, ['nombre'], 'Producto'),
        ubicacion: getTextValue(p, ['ubicacion'], perfilUsuario?.empresas?.nombre || 'Mi Negocio'),
        stock: getNumericValue(p, ['stock_actual', 'stock']),
        expira: p.fecha_vencimiento,
      }))
      .sort((a, b) => new Date(a.expira) - new Date(b.expira))
      .slice(0, 25);
  }, [productos, hayCaducidad]);

  // === ÓRDENES DE VENTA (pedidos pendientes) ===
  const ordenesVenta = ventas
    .filter((v) => getTextValue(v, ['estado_pago'], '') === 'Pendiente')
    .map((v) => ({
      fecha: v.fecha,
      cliente: getTextValue(v, ['cliente', 'cliente_nombre'], 'Cliente Ocasional'),
      estado: getTextValue(v, ['estado_pago'], '—'),
      cantidad: getNumericValue(v, ['articulos']),
    }))
    .sort((a, b) => new Date(b.fecha) - new Date(a.fecha));

  // === RECOMENDACIONES ===
  const recomendaciones = useMemo(() => {
    const lista = [];
    if (variacionVsAnterior !== null && variacionVsAnterior > 0) {
      lista.push({ tipo: 'ok', titulo: '¡Ventas en alza!', texto: `Tus ventas de este período superan al anterior en ${variacionVsAnterior.toFixed(1)}%.` });
    } else if (variacionVsAnterior !== null && variacionVsAnterior < 0) {
      lista.push({ tipo: 'warn', titulo: 'Ventas en baja', texto: `Tus ventas de este período bajaron ${Math.abs(variacionVsAnterior).toFixed(1)}% respecto al anterior.` });
    }
    if (totalGastos === 0) {
      lista.push({ tipo: 'info', titulo: 'Sin gastos registrados este mes', texto: 'Registrá gastos (alquiler, servicios, sueldos) para conocer tu ganancia neta real.' });
    }
    if (stockBajo.length > 0) {
      lista.push({ tipo: 'danger', titulo: `${stockBajo.length} producto(s) con stock bajo`, texto: 'Revisá inventario y realizá pedidos a proveedores para evitar faltantes.' });
    }
    if (deudasCobrar.length > 0) {
      lista.push({ tipo: 'warn', titulo: `${deudasCobrar.length} factura(s) pendientes de cobro`, texto: 'Realizá el seguimiento de cobros para mejorar tu flujo de caja.' });
    }
    return lista;
  }, [variacionVsAnterior, totalGastos, stockBajo, deudasCobrar]);

  const iconoRecomendacion = (tipo) => ({ ok: '✅', warn: '⚠️', danger: '🛑', info: 'ℹ️' }[tipo] || 'ℹ️');
  const colorRecomendacion = (tipo) => ({
    ok: 'bg-green-50 border-green-100 text-green-700',
    warn: 'bg-orange-50 border-orange-100 text-orange-700',
    danger: 'bg-red-50 border-red-100 text-red-700',
    info: 'bg-blue-50 border-blue-100 text-blue-700',
  }[tipo] || 'bg-gray-50 border-gray-100 text-gray-700');

  const CardKpi = ({ icon: Icon, gradient, label, value, sublabel, trend }) => (
    <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 flex items-center gap-4 hover:shadow-md transition-shadow">
      <div className={`bg-gradient-to-br ${gradient} p-3.5 rounded-2xl text-white shadow-lg`}>
        <Icon size={24} strokeWidth={2.2} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">{label}</p>
        <h3 className="text-xl font-black text-gray-800 tracking-tight">{formatCurrency(value)}</h3>
        {trend !== undefined && trend !== null ? (
          <p className={`text-xs font-bold flex items-center gap-1 ${trend < 0 ? 'text-red-500' : 'text-green-500'}`}>
            {trend < 0 ? '↓' : '↑'} {Math.abs(trend).toFixed(1)}% <span className="text-gray-400 font-normal">{t('vsPreviousPeriod')}</span>
          </p>
        ) : sublabel && <p className="text-xs text-gray-400">{sublabel}</p>}
      </div>
    </div>
  );

  if (cargando) return <div className="p-10 text-center font-bold text-orange-500">{t('loadingData')}</div>;
  if (error) return <div className="p-10 text-center font-bold text-red-500">{error}</div>;

  return (
    <>
      <div className="bg-[#f4f7fa] min-h-screen w-full">

        {/* HEADER */}
        <div className="bg-[#1e293b] p-4 sm:p-6 lg:p-8 rounded-3xl text-white mb-6 relative overflow-hidden shadow-xl">
          <div className="relative z-10 flex flex-col sm:flex-row sm:flex-wrap justify-between sm:items-end gap-4">
            <div>
              <h1 className="text-2xl sm:text-3xl font-extrabold mb-1 break-words">{saludo}, {perfilUsuario?.empresas?.nombre || 'tu negocio'} 👋</h1>
              <p className="text-slate-400 text-sm font-medium">{t('businessSummary')} — <span className="capitalize">{fechaHoy}</span></p>
            </div>
            <FiltroFecha value={rango} onChange={(nuevoRango) => setRango(nuevoRango)} />
          </div>
          <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full -mr-20 -mt-20 blur-3xl"></div>
        </div>

        {/* KPIs FILA 1 */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
          <CardKpi icon={ShoppingCart} gradient="from-blue-500 to-blue-700" label={t('totalSales')} value={totalVentas} trend={variacionVsAnterior} />
          <CardKpi icon={TrendingUp} gradient="from-teal-400 to-emerald-600" label={t('profit')} value={neto} sublabel={t('salesMinusCosts')} />
          <CardKpi icon={FileWarning} gradient="from-orange-400 to-amber-600" label={t('billToPay')} value={deudaCompras} sublabel={t('pendingSuppliers')} />
          <CardKpi icon={MinusCircle} gradient="from-red-500 to-rose-600" label={t('expenses')} value={totalGastos} sublabel={t('period')} />
        </div>

        {/* KPIs FILA 2 */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
          <div className="bg-white p-4 rounded-2xl flex items-center gap-4 shadow-sm border border-gray-50 hover:shadow-md transition-shadow">
            <div className="bg-indigo-50 text-indigo-600 p-2.5 rounded-xl"><Package size={20} strokeWidth={2.2} /></div>
            <div>
              <p className="text-[10px] font-bold text-gray-400 uppercase">{t('totalPurchases')}</p>
              <h4 className="font-bold text-gray-800">{formatCurrency(totalCompras)}</h4>
            </div>
          </div>
          <div className="bg-white p-4 rounded-2xl flex items-center gap-4 shadow-sm border border-gray-50 hover:shadow-md transition-shadow">
            <div className="bg-orange-50 text-orange-600 p-2.5 rounded-xl"><AlertTriangle size={20} strokeWidth={2.2} /></div>
            <div>
              <p className="text-[10px] font-bold text-gray-400 uppercase">{t('purchaseDebt')}</p>
              <h4 className="font-bold text-gray-800">{formatCurrency(deudaCompras)}</h4>
            </div>
          </div>
          <div className="bg-white p-4 rounded-2xl flex items-center justify-between shadow-sm border border-gray-50 hover:shadow-md transition-shadow">
            <div className="flex items-center gap-4">
              <div className="bg-purple-50 text-purple-600 p-2.5 rounded-xl"><Handshake size={20} strokeWidth={2.2} /></div>
              <div>
                <p className="text-[10px] font-bold text-gray-400 uppercase">{t('creditsGranted')}</p>
                <h4 className="font-bold text-gray-800">{formatCurrency(deudaVentas)}</h4>
              </div>
            </div>
            <button onClick={() => setTabActiva('cobrar')} className="text-xs font-bold text-blue-600 hover:underline">
              {ventasConCredito.length} ventas · Ver
            </button>
          </div>
        </div>

        {/* CAJAS ABIERTAS */}
        <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-50 mb-6 transition-all duration-300 hover:shadow-xl hover:border-gray-200">
          <h3 className="font-black text-gray-800 mb-1 flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block animate-pulse" />
            <Wallet size={20} className="text-emerald-600" /> {t('openRegisters')}
            {cajasAbiertasConDatos.length > 0 && (
              <span className="bg-emerald-100 text-emerald-700 text-xs font-black px-2 py-0.5 rounded-full">{cajasAbiertasConDatos.length}</span>
            )}
          </h3>
          <p className="text-[10px] text-gray-400 mb-4">{t('autoRefresh')}</p>
          {cajasAbiertasConDatos.length === 0 ? (
            <p className="text-center text-gray-400 text-sm py-8">{t('noOpenRegisters')}</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {cajasAbiertasConDatos.map((caja) => (
                <div key={caja.id} className="border border-emerald-100 bg-emerald-50/40 rounded-2xl p-4">
                  <p className="font-bold text-gray-800 text-sm flex items-center gap-1.5">
                    <span className="text-emerald-600">👤</span> {caja.usuarioMostrado}
                  </p>
                  <div className="flex justify-between items-start mt-0.5">
                    <div>
                      <p className="text-xs text-gray-500 flex items-center gap-1">📍 {caja.ubicacionNombre}</p>
                      <p className="text-[11px] text-gray-400 mt-1">⏱ {caja.duracion}</p>
                    </div>
                    <button 
                      onClick={() => forzarCierreCaja(caja.id)}
                      className="text-[10px] bg-red-100 text-red-600 px-2 py-1 rounded hover:bg-red-200 transition-colors font-bold"
                      title={t('forceCloseHelp')}
                    >
                      {t('forceClose')}
                    </button>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-3 pt-3 border-t border-emerald-100">
                    <div>
                      <p className="text-[9px] font-bold text-gray-400 uppercase">{t('sales')}</p>
                      <p className="text-xs font-bold text-gray-800">{formatCurrency(caja.totalVentasCaja)}</p>
                    </div>
                    <div>
                      <p className="text-[9px] font-bold text-gray-400 uppercase">{t('cash')}</p>
                      <p className="text-xs font-bold text-gray-800">{formatCurrency(caja.totalEfectivo)}</p>
                    </div>
                    <div>
                      <p className="text-[9px] font-bold text-gray-400 uppercase">{t('card')}</p>
                      <p className="text-xs font-bold text-gray-800">{formatCurrency(caja.totalTarjeta)}</p>
                    </div>
                    <div>
                      <p className="text-[9px] font-bold text-gray-400 uppercase">Transacc.</p>
                      <p className="text-xs font-bold text-gray-800">{caja.transacciones}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* GRÁFICO ÚLTIMOS DÍAS + COMPOSICIÓN */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
          <div className="lg:col-span-2 bg-white p-6 rounded-3xl shadow-sm border border-gray-50 transition-all duration-300 hover:shadow-xl hover:border-gray-200">
            <h3 className="font-black text-gray-800 mb-6 flex items-center gap-2"><LineChart size={20} className="text-blue-500" /> Ventas ({rango.label})</h3>
            <div className="h-[240px] sm:h-[300px] w-full min-w-0">
              {datosLinea.some((d) => d.total > 0) ? (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={datosLinea}>
                    <defs>
                      <linearGradient id="colorUv" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 10 }} interval="preserveStartEnd" />
                    <Tooltip formatter={(value) => formatCurrency(value)} />
                    <Area type="monotone" dataKey="total" stroke="#3b82f6" strokeWidth={3} fillOpacity={1} fill="url(#colorUv)" />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex h-full items-center justify-center text-gray-400">{t('noSalesPeriod')}</div>
              )}
            </div>
          </div>

          <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-50 transition-all duration-300 hover:shadow-xl hover:border-gray-200">
            <h3 className="font-black text-gray-800 mb-6 flex items-center gap-2"><PieChartIcon size={20} className="text-blue-500" /> {t('composition')}</h3>
            <div className="h-[240px] sm:h-[300px] w-full min-w-0">
              {datosPie.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={datosPie} innerRadius={60} outerRadius={80} paddingAngle={5} dataKey="value">
                      {datosPie.map((entry, index) => <Cell key={entry.name} fill={COLORS[index % COLORS.length]} />)}
                    </Pie>
                    <Tooltip formatter={(value) => formatCurrency(value)} />
                    <Legend verticalAlign="bottom" height={36} />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex h-full items-center justify-center text-gray-400">{t('noDataPeriod')}</div>
              )}
            </div>
          </div>
        </div>

        {/* VENTAS VS COMPRAS VS GASTOS + TOP PRODUCTOS */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
          <div className="lg:col-span-2 bg-white p-6 rounded-3xl shadow-sm border border-gray-50 transition-all duration-300 hover:shadow-xl hover:border-gray-200">
            <h3 className="font-black text-gray-800 mb-6 flex items-center gap-2"><BarChart3 size={20} className="text-blue-500" /> {t('salesPurchasesExpenses')} (6 meses)</h3>
            <div className="h-[230px] sm:h-[280px] w-full min-w-0">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={datos6meses}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(value) => formatCurrency(value)} />
                  <Legend />
                  <Bar dataKey="Ventas" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="Compras" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="Gastos" fill="#ef4444" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-50 transition-all duration-300 hover:shadow-xl hover:border-gray-200">
            <h3 className="font-black text-gray-800 mb-4 flex items-center gap-2"><Trophy size={20} className="text-yellow-500" /> {t('topProducts')}</h3>
            {!hayDetalleVentas || topProductos.length === 0 ? (
              <div className="text-center text-gray-400 text-sm py-10">
                {t('noDetailedSales')}
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {topProductos.map((p, i) => (
                  <div key={p.nombre} className="flex items-center gap-3 p-2 -mx-2 rounded-xl transition-all duration-200 hover:bg-slate-50 hover:translate-x-1 cursor-pointer">
                    <span className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-black text-white ${i === 0 ? 'bg-yellow-400' : i === 1 ? 'bg-gray-400' : i === 2 ? 'bg-orange-400' : 'bg-gray-300'
                      }`}>{i + 1}</span>
                    <span className="text-sm font-medium text-gray-700 flex-1 truncate">{p.nombre}</span>
                    <span className="text-xs font-bold text-gray-400">{p.cantidad} u.</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* RECOMENDACIONES */}
        {recomendaciones.length > 0 && (
          <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-50 mb-6 transition-all duration-300 hover:shadow-xl hover:border-gray-200">
            <h3 className="font-black text-gray-800 mb-4 flex items-center gap-2"><Lightbulb size={20} className="text-amber-500" /> {t('recommendations')}</h3>
            <div className="flex flex-col gap-2">
              {recomendaciones.map((r, i) => (
                <div key={i} className={`border rounded-lg px-4 py-3 transition-all duration-300 hover:shadow-md hover:-translate-y-1 cursor-pointer ${colorRecomendacion(r.tipo)}`}>
                  <p className="font-bold text-sm flex items-center gap-2">{iconoRecomendacion(r.tipo)} {r.titulo}</p>
                  <p className="text-xs mt-0.5">{r.texto}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* AÑO FISCAL ACTUAL */}
        <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-50 mb-6 transition-all duration-300 hover:shadow-xl hover:border-gray-200">
          <h3 className="font-black text-gray-800 mb-6 flex items-center gap-2"><CalendarRange size={20} className="text-blue-500" /> {t('currentFiscalYear')}</h3>
          <div className="h-[280px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={datosAnioFiscal}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 10 }} />
                <Tooltip formatter={(value) => formatCurrency(value)} />
                <Bar dataKey="total" fill="#3b82f6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* TABS: DEUDAS POR COBRAR / PAGAR / STOCK BAJO */}
        <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-50 mb-6 transition-all duration-300 hover:shadow-xl hover:border-gray-200">
          <div className="flex gap-2 mb-4 border-b border-gray-100">
            {[
              { key: 'cobrar', label: t('accountsReceivable'), icon: Wallet, count: deudasCobrar.length },
              { key: 'pagar', label: t('accountsPayable'), icon: FileWarning, count: deudasPagar.length },
              { key: 'stock', label: t('lowStock'), icon: Boxes, count: stockBajo.length },
            ].map((tab) => (
              <button
                key={tab.key}
                onClick={() => setTabActiva(tab.key)}
                className={`px-4 py-2 text-sm font-bold border-b-2 transition-colors flex items-center gap-2 ${tabActiva === tab.key ? 'border-orange-500 text-orange-600' : 'border-transparent text-gray-400 hover:text-gray-600'
                  }`}
              >
                <tab.icon size={16} /> {tab.label} {tab.count > 0 && <span className="ml-1 text-xs">({tab.count})</span>}
              </button>
            ))}
          </div>

          {tabActiva === 'cobrar' && (
            deudasCobrar.length === 0 ? (
              <p className="text-center text-gray-400 text-sm py-8">{t('noReceivables')} 🎉</p>
            ) : (
              <table className="w-full text-sm">
                <thead className="text-gray-400 text-xs uppercase">
                  <tr>
                    <th className="text-left py-2">{t('customers')}</th>
                    <th className="text-left py-2">{t('invoiceNumber')}</th>
                    <th className="text-right py-2">{t('amountDue')}</th>
                    <th className="text-right py-2">{t('action')}</th>
                  </tr>
                </thead>
                <tbody>
                  {deudasCobrar.map((d, i) => (
                    <tr key={i} className="border-t border-gray-50 hover:bg-slate-50 transition-colors">
                      <td className="py-2 font-medium text-gray-700">{d.cliente}</td>
                      <td className="py-2 text-blue-600 font-semibold">{String(d.factura).slice(0, 8).toUpperCase()}</td>
                      <td className="py-2 text-right font-bold text-red-600">{formatCurrency(d.monto)}</td>
                      <td className="py-2 text-right">
                        <button
                          onClick={() => abrirModalPagoInicio(d)}
                          className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold px-3 py-2 rounded-md inline-flex items-center gap-1.5 transition-colors"
                        >
                          💵 Monto total pagado o pago parcial
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )
          )}

          {tabActiva === 'pagar' && (
            deudasPagar.length === 0 ? (
              <p className="text-center text-gray-400 text-sm py-8">{t('noPayables')} 🎉</p>
            ) : (
              <table className="w-full text-sm">
                <thead className="text-gray-400 text-xs uppercase">
                  <tr><th className="text-left py-2">{t('suppliers')}</th><th className="text-left py-2">{t('invoice')}</th><th className="text-right py-2">{t('amount')}</th></tr>
                </thead>
                <tbody>
                  {deudasPagar.map((d, i) => (
                    <tr key={i} className="border-t border-gray-50 hover:bg-slate-50 transition-colors cursor-pointer">
                      <td className="py-2 font-medium text-gray-700">{d.proveedor}</td>
                      <td className="py-2 text-gray-500">{d.factura}</td>
                      <td className="py-2 text-right font-bold text-orange-600">{formatCurrency(d.monto)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )
          )}

          {tabActiva === 'stock' && (
            stockBajo.length === 0 ? (
              <p className="text-center text-gray-400 text-sm py-8">{t('stockGood')} 🎉</p>
            ) : (
              <table className="w-full text-sm">
                <thead className="text-gray-400 text-xs uppercase">
                  <tr><th className="text-left py-2">{t('products')}</th><th className="text-left py-2">SKU</th><th className="text-right py-2">{t('stock')}</th></tr>
                </thead>
                <tbody>
                  {stockBajo.map((p, i) => (
                    <tr key={i} className="border-t border-gray-50 hover:bg-slate-50 transition-colors cursor-pointer">
                      <td className="py-2 font-medium text-gray-700">{p.nombre}</td>
                      <td className="py-2 text-gray-500">{p.sku}</td>
                      <td className="py-2 text-right font-bold text-red-600">{p.stock} u.</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )
          )}
        </div>

        {/* ALERTA DE CADUCIDAD */}
        <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-50 mb-6 transition-all duration-300 hover:shadow-xl hover:border-gray-200">
          <h3 className="font-black text-gray-800 mb-4 flex items-center gap-2"><Clock size={20} className="text-orange-500" /> Alerta de caducidad</h3>
          {!hayCaducidad ? (
            <p className="text-center text-gray-400 text-sm py-8">
              Tus productos todavía no tienen fecha de vencimiento cargada.
            </p>
          ) : alertaCaducidad.length === 0 ? (
            <p className="text-center text-gray-400 text-sm py-8">No hay productos por vencer en los próximos 90 días. 🎉</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-gray-400 text-xs uppercase">
                <tr><th className="text-left py-2">Producto</th><th className="text-left py-2">Ubicación</th><th className="text-center py-2">Stock</th><th className="text-right py-2">Expira</th></tr>
              </thead>
              <tbody>
                {alertaCaducidad.map((p, i) => (
                  <tr key={i} className="border-t border-gray-50 hover:bg-slate-50 transition-colors cursor-pointer">
                    <td className="py-2 font-medium text-gray-700">{p.nombre}</td>
                    <td className="py-2 text-gray-500">{p.ubicacion}</td>
                    <td className="py-2 text-center">{p.stock} u.</td>
                    <td className="py-2 text-right font-bold text-orange-600">{new Date(p.expira).toLocaleDateString('es-PY')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* ÓRDENES DE VENTA */}
        <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-50 transition-all duration-300 hover:shadow-xl hover:border-gray-200">
          <h3 className="font-black text-gray-800 mb-4 flex items-center gap-2"><Receipt size={20} className="text-blue-500" /> Órdenes de venta (pedidos pendientes)</h3>
          {ordenesVenta.length === 0 ? (
            <p className="text-center text-gray-400 text-sm py-8">No hay órdenes pendientes.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-gray-400 text-xs uppercase">
                <tr><th className="text-left py-2">Fecha</th><th className="text-left py-2">Cliente</th><th className="text-left py-2">Estado</th><th className="text-right py-2">Artículos</th></tr>
              </thead>
              <tbody>
                {ordenesVenta.map((o, i) => (
                  <tr key={i} className="border-t border-gray-50 hover:bg-slate-50 transition-colors cursor-pointer">
                    <td className="py-2 text-gray-500">{o.fecha ? new Date(o.fecha).toLocaleDateString('es-PY') : '—'}</td>
                    <td className="py-2 font-medium text-gray-700">{o.cliente}</td>
                    <td className="py-2"><span className="bg-yellow-50 text-yellow-700 text-xs font-bold px-2 py-1 rounded">{o.estado}</span></td>
                    <td className="py-2 text-right">{o.cantidad}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

      </div>

      {/* MODAL: Monto total pagado o pago parcial */}
      {deudaPagar && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[9999] p-4" onClick={() => setDeudaPagar(null)}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden max-h-[92vh] flex flex-col" onClick={(e) => e.stopPropagation()}>

            {/* Encabezado */}
            <div className="bg-gradient-to-r from-blue-600 to-indigo-600 px-6 py-4 flex justify-between items-center flex-shrink-0">
              <h3 className="text-white font-bold text-base">Monto total pagado o pago parcial</h3>
              <button onClick={() => setDeudaPagar(null)} className="text-white/80 hover:text-white text-xl leading-none">✕</button>
            </div>

            <div className="overflow-y-auto p-6 text-sm">

              {/* Resumen: Cliente / Factura / Cantidad total */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-5">
                <div className="bg-gray-50 rounded-lg p-3 border border-gray-100">
                  <p className="text-xs font-bold text-gray-400 uppercase mb-1">Cliente</p>
                  <p className="font-bold text-gray-800">{deudaPagar.cliente}</p>
                  <p className="text-xs text-gray-500 mt-1">Empresa: {nombreDelNegocio || '—'}</p>
                </div>
                <div className="bg-gray-50 rounded-lg p-3 border border-gray-100">
                  <p className="text-xs font-bold text-gray-400 uppercase mb-1">Factura no.</p>
                  <p className="font-bold text-gray-800">{String(deudaPagar.factura).slice(0, 8).toUpperCase()}</p>
                  <p className="text-xs text-gray-500 mt-1">Ubicación: {nombreDelNegocio || '—'}</p>
                  <p className="text-xs text-gray-500">Nota de pago: {deudaPagar.nota || '--'}</p>
                </div>
                <div className="bg-gray-50 rounded-lg p-3 border border-gray-100">
                  <p className="text-xs font-bold text-gray-400 uppercase mb-1">Cantidad total</p>
                  <p className="font-bold text-gray-800">{formatCurrency(deudaPagar.total)}</p>
                </div>
              </div>

              <p className="text-xs font-bold text-gray-500 mb-4">
                Pago Realizado: <span className="text-emerald-600">{formatCurrency(deudaPagar.total - deudaPagar.monto)}</span>
              </p>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                <div>
                  <label className="block text-xs font-bold text-gray-600 mb-1">Método de pago:*</label>
                  <select
                    value={metodoPagoInicio}
                    onChange={(e) => setMetodoPagoInicio(e.target.value)}
                    className="w-full border border-gray-300 rounded-md p-2.5 text-sm bg-white outline-none focus:ring-1 focus:ring-blue-500"
                  >
                    <option value="Efectivo">Efectivo</option>
                    <option value="Transferencia">Transferencia</option>
                    <option value="Tarjeta">Tarjeta</option>
                    <option value="Cheque">Cheque</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-600 mb-1">Pagado el:*</label>
                  <input
                    type="date"
                    value={fechaPagoInicio}
                    onChange={(e) => setFechaPagoInicio(e.target.value)}
                    className="w-full border border-gray-300 rounded-md p-2.5 text-sm outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-600 mb-1">Cantidad:*</label>
                  <input
                    type="number"
                    value={cantidadPagoInicio}
                    onChange={(e) => setCantidadPagoInicio(e.target.value)}
                    className="w-full border border-gray-300 rounded-md p-2.5 text-sm outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="block text-xs font-bold text-gray-600 mb-1">Cuenta de pago:</label>
                  <select
                    value={cuentaPagoInicio}
                    onChange={(e) => setCuentaPagoInicio(e.target.value)}
                    className="w-full border border-gray-300 rounded-md p-2.5 text-sm bg-white outline-none focus:ring-1 focus:ring-blue-500"
                  >
                    <option value="Ninguna">Ninguna</option>
                    <option value="Caja">Caja</option>
                    <option value="Banco">Cuenta bancaria</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-600 mb-1">Documento adjunto:</label>
                  <label className="flex items-center gap-2 border border-gray-300 rounded-md p-2.5 text-sm cursor-pointer hover:bg-gray-50">
                    <span className="bg-orange-500 text-white text-xs font-bold px-2 py-1 rounded">Seleccionar archivo</span>
                    <span className="text-gray-400 text-xs truncate">{nombreDocumentoPagoInicio || (subiendoDocumentoInicio ? 'Subiendo...' : 'Ningún archivo seleccionado')}</span>
                    <input type="file" onChange={manejarDocumentoPagoInicio} className="hidden" />
                  </label>
                  <p className="text-[10px] text-gray-400 mt-1">Archivo permitido: .pdf, .csv, .zip, .doc, .docx, .jpeg, .jpg, .png, .p12</p>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-600 mb-1">Nota de pago:</label>
                <textarea
                  value={notaPagoInicio}
                  onChange={(e) => setNotaPagoInicio(e.target.value)}
                  rows={3}
                  className="w-full border border-gray-300 rounded-md p-2.5 text-sm outline-none focus:ring-1 focus:ring-blue-500 resize-none"
                />
              </div>
            </div>

            {/* Footer */}
            <div className="border-t px-6 py-4 flex justify-end gap-3 flex-shrink-0 bg-white">
              <button onClick={() => setDeudaPagar(null)} className="bg-gray-200 text-gray-700 px-6 py-2.5 rounded-md font-medium hover:bg-gray-300">
                Cerrar
              </button>
              <button
                onClick={confirmarPagoInicio}
                disabled={guardandoPagoInicio}
                className="bg-orange-500 hover:bg-orange-600 text-white px-8 py-2.5 rounded-md font-bold disabled:opacity-60"
              >
                {guardandoPagoInicio ? 'Guardando...' : '✓ Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default Inicio;