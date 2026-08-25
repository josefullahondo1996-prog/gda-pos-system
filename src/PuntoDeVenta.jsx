import CierreCaja from './CierreCaja';
import GastosDelTurno from './GastosDelTurno';
import DetalleCaja from './DetalleCaja';
import NuevoClientePOS from './NuevoClientePOS';
import ModalPagoMultiple from './ModalPagoMultiple';
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

const formatGs = (valor) => `Gs ${Number(valor || 0).toLocaleString('es-PY')}`;

const PuntoDeVenta = ({ cajaInfo, session, perfilUsuario, onVolver, onSolicitarCierre, onNuevoGasto }) => {
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
    if (ubicacionActivaId && mapaStockUbicacion[producto.id]?.[ubicacionActivaId] !== undefined) {
      return mapaStockUbicacion[producto.id][ubicacionActivaId];
    }
    return producto.stock_actual;
  };
  const [mostrarCierreCaja, setMostrarCierreCaja] = useState(false);
  const [mostrarNuevoCliente, setMostrarNuevoCliente] = useState(false);
  const [mostrarPagoMultiple, setMostrarPagoMultiple] = useState(false);
  const [cuentasCaja, setCuentasCaja] = useState([]);
  const [clientesDisponibles, setClientesDisponibles] = useState([]);
  const [personalServicio, setPersonalServicio] = useState('');
  const [usuariosServicio, setUsuariosServicio] = useState([]);
  // === ESTADOS PRINCIPALES ===
  const [productos, setProductos] = useState([]);
  const [carrito, setCarrito] = useState([]);
  const [busqueda, setBusqueda] = useState('');
  const [cargando, setCargando] = useState(true);
  const [categoriaActiva, setCategoriaActiva] = useState('Todas las categorías');

  const [cliente, setCliente] = useState('Cliente Ocasional');
  const [metodoPago, setMetodoPago] = useState('Efectivo');
  const [montoPagado, setMontoPagado] = useState('');

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
    const cargarClientes = async () => {
      let query = supabase.from('clientes').select('*').order('nombre');
      if (empresaId) query = query.eq('empresa_id', empresaId);
      const { data } = await query;
      if (data) setClientesDisponibles(data);
    };
    if (empresaId) cargarClientes();
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

  useEffect(() => {
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
      cargarProductos();
    }, [empresaId]);

    useEffect(() => {
      if (!empresaId) return;
      cargarMapaStockPorUbicacion(empresaId).then(setMapaStockUbicacion);
    }, [empresaId, productos.length]);

  const categorias = useMemo(() => {
    const unicas = Array.from(new Set(productos.map((p) => p.categoria).filter(Boolean)));
    return ['Todas las categorías', ...unicas];
  }, [productos]);

  const agregarAlCarrito = (producto) => {
    const itemExistente = carrito.find((item) => item.id === producto.id);
    const cantidadActual = itemExistente ? itemExistente.cantidad : 0;
    const stockDisponible = stockEnSucursal(producto);

    if (stockDisponible !== null && stockDisponible !== undefined && cantidadActual + 1 > stockDisponible) {
      alert(`No hay suficiente stock de "${producto.nombre}". Disponible: ${stockDisponible}`);
      return;
    }

    if (itemExistente) {
      setCarrito(carrito.map((item) =>
        item.id === producto.id ? { ...item, cantidad: item.cantidad + 1 } : item
      ));
    } else {
      setCarrito([...carrito, { ...producto, cantidad: 1 }]);
    }
  };

  const eliminarDelCarrito = (id) => {
    setCarrito(carrito.filter((item) => item.id !== id));
  };

  const cambiarCantidad = (id, nuevaCantidad) => {
    if (nuevaCantidad < 1) return;
    const productoOriginal = productos.find((p) => p.id === id);
    const stockDisponible = productoOriginal ? stockEnSucursal(productoOriginal) : undefined;
    if (stockDisponible !== null && stockDisponible !== undefined && nuevaCantidad > stockDisponible) {
      alert(`Solo quedan ${stockDisponible} unidades de este producto en stock.`);
      if (stockDisponible < 1) return;
      nuevaCantidad = stockDisponible;
    }
    setCarrito(carrito.map((item) =>
      item.id === id ? { ...item, cantidad: Number(nuevaCantidad) } : item
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
  const descuentoAplicado = Math.min(Math.max(0, Number(descuento) || 0), subtotal);
  const cargoEmbalajeAplicado = Math.max(0, Number(cargoEmbalaje) || 0);
  const totalConAjustes = Math.max(0, subtotal - descuentoAplicado + cargoEmbalajeAplicado);
  const vuelto = Number(montoPagado) > totalConAjustes ? Number(montoPagado) - totalConAjustes : 0;
  const saldoPendiente = Number(montoPagado) < totalConAjustes && Number(montoPagado) > 0
    ? totalConAjustes - Number(montoPagado)
    : 0;

  const procesarVenta = async (tipoOperacion = 'venta', datosPagoMultiple = null, metodoForzado = null, notaForzada = null) => {
    if (carrito.length === 0) return alert('El carrito está vacío');

    // Si viene del modal de Pago Múltiple, usamos esos valores; si no,
    // seguimos leyendo los mismos estados de siempre (montoPagado, metodoPago,
    // notaVenta) para no cambiar en nada el comportamiento de los botones existentes.
    let montoPagadoFinal = datosPagoMultiple ? datosPagoMultiple.montoPagado : Number(montoPagado);
    
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
      total: totalConAjustes,
      metodo_pago: metodoPagoFinal,
      estado_pago: estadoPago,
      monto_pagado: montoPagadoFinal,
      saldo_pendiente: estadoPago === 'Credito' ? totalConAjustes : saldoPendienteFinal,
      articulos: totalArticulos,
      descuento: descuentoAplicado,
      cargo_embalaje: cargoEmbalajeAplicado,
      nota_venta: notaVentaFinal || null,
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

      // Reflejamos el nuevo stock en la grilla al instante, sin esperar a recargar la página
      setProductos((prev) =>
        prev.map((p) => {
          const vendido = carrito.find((item) => item.id === p.id);
          if (!vendido || p.stock_actual === null || p.stock_actual === undefined) return p;
          return { ...p, stock_actual: Math.max(0, p.stock_actual - vendido.cantidad) };
        })
      );

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
          'Error al procesar la venta. No se guardó nada (la operación es atómica). Revisá la consola para más detalle.'
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

  const productosFiltrados = productos.filter((p) => {
    const coincideBusqueda =
      p.nombre?.toLowerCase().includes(busqueda.toLowerCase()) ||
      p.codigo?.toLowerCase().includes(busqueda.toLowerCase());
    const coincideCategoria =
      categoriaActiva === 'Todas las categorías' || p.categoria === categoriaActiva;
    return coincideBusqueda && coincideCategoria;
  });

  // Al escanear un código de barras (o tipear y apretar Enter), busca y agrega directo
  const buscarYAgregarPorCodigo = (e) => {
    if (e.key !== 'Enter') return;
    const termino = busqueda.trim();
    if (!termino) return;

    // 1) Coincidencia exacta por código (así funciona como lector de código de barras)
    const porCodigo = productos.find((p) => p.codigo && p.codigo.toLowerCase() === termino.toLowerCase());
    if (porCodigo) {
      agregarAlCarrito(porCodigo);
      setBusqueda('');
      return;
    }

    // 2) Coincidencia exacta por nombre completo
    const porNombre = productos.find((p) => p.nombre && p.nombre.toLowerCase() === termino.toLowerCase());
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
          <button onClick={() => notificar.info('Calculadora disponible próximamente.')} className="bg-gray-50 text-gray-700 border border-gray-200 px-2.5 py-1.5 rounded hover:bg-gray-100 whitespace-nowrap">
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
          <button onClick={() => notificar.info('La sustitución de personal aún no está habilitada.')} className="bg-indigo-50 text-indigo-700 border border-indigo-100 px-2.5 py-1.5 rounded hover:bg-indigo-100 whitespace-nowrap">
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
                placeholder="Buscar cliente..."
                aria-label="Buscar cliente"
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
              title="Nuevo cliente"
            >
              +
            </button>
            <input
              type="text"
              placeholder="Introduzca el nombre del producto / SKU / código de barras"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              onKeyDown={buscarYAgregarPorCodigo}
              className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
            />
          </div>

          <button
            onClick={() => setMostrarOpciones(!mostrarOpciones)}
            className="text-left px-3 py-2 text-xs font-bold text-gray-500 hover:text-orange-600"
          >
            ☰ Opciones Avanzadas (Nota de venta, descuento, embalaje) {mostrarOpciones ? '▲' : '▼'}
          </button>

          {mostrarOpciones && (
            <div className="mx-3 mb-3 rounded-lg border border-gray-200 bg-gray-50 p-2 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-2 text-[11px]">
              <div className="min-w-0">
                <label className="font-bold text-gray-500 block mb-1 truncate">Descuento (Gs)</label>
                <input type="number" min="0" max={subtotal} step="1" value={descuento} onChange={(e) => setDescuento(e.target.value)} onBlur={() => setDescuento(String(descuentoAplicado || ''))} className="w-full h-8 border border-gray-300 rounded px-2 bg-white" />
              </div>
              <div className="min-w-0">
                <label className="font-bold text-gray-500 block mb-1 truncate">Cargo de embalaje (Gs)</label>
                <input type="number" min="0" step="1" value={cargoEmbalaje} onChange={(e) => setCargoEmbalaje(e.target.value)} onBlur={() => setCargoEmbalaje(String(cargoEmbalajeAplicado || ''))} className="w-full h-8 border border-gray-300 rounded px-2 bg-white" />
              </div>
              <div className="min-w-0">
                <label className="font-bold text-gray-500 block mb-1 truncate">Personal de servicio / vendedor</label>
                <select value={personalServicio} onChange={(e) => setPersonalServicio(e.target.value)} className="w-full h-8 border border-gray-300 rounded px-2 bg-white truncate">
                  <option value="">Seleccionar personal de servicio</option>
                  {usuariosServicio.map((usuario) => {
                    const nombre = [usuario.nombre, usuario.apellido].filter(Boolean).join(' ').trim();
                    return <option key={usuario.id} value={nombre}>{nombre}</option>;
                  })}
                </select>
              </div>
              <div className="min-w-0">
                <label className="font-bold text-gray-500 block mb-1 truncate">Nota de venta</label>
                <input type="text" value={notaVenta} onChange={(e) => setNotaVenta(e.target.value)} className="w-full h-8 border border-gray-300 rounded px-2 bg-white" />
              </div>
            </div>
          )}

          <div className="flex-1 overflow-y-auto px-2 bg-gray-50/40">
            <table className="w-full min-w-[560px] text-sm border-separate border-spacing-0">
              <thead className="sticky top-0 z-10 bg-white text-gray-500 text-[10px] uppercase shadow-sm">
                <tr>
                  <th className="text-left py-2">Producto</th>
                  <th className="text-center py-2">Cant.</th>
                  <th className="text-right py-2">P. Unit.</th>
                  <th className="text-right py-2">Subtotal</th>
                  <th className="w-6"></th>
                </tr>
              </thead>
              <tbody>
                {carrito.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="text-center text-gray-400 py-16">🛒 El carrito está vacío</td>
                  </tr>
                ) : (
                  carrito.map((item) => {
                    const precio = item.precio_venta || item.precio || 0;
                    return (
                      <tr key={item.id} className="border-b border-gray-200 even:bg-white odd:bg-gray-50/70 hover:bg-orange-50">
                        <td className="py-3 pr-2 font-medium text-gray-800 min-w-[190px]">
                          <div className="flex items-center gap-2 min-w-0">
                            <div className="w-9 h-9 rounded bg-white border border-gray-200 flex-shrink-0 flex items-center justify-center overflow-hidden shadow-sm">
                              {item.imagen_url ? (
                                <img src={item.imagen_url} alt={item.nombre} className="w-full h-full object-cover" />
                              ) : (
                                <span className="text-xs text-gray-300">📦</span>
                              )}
                            </div>
                            <span className="leading-tight line-clamp-2 break-words" title={item.nombre}>{item.nombre}</span>
                          </div>
                        </td>
                        <td className="py-3 px-1 text-center whitespace-nowrap">
                          <div className="inline-flex items-center gap-1">
                            <button onClick={() => cambiarCantidad(item.id, item.cantidad - 1)} className="bg-gray-100 w-6 h-6 rounded text-gray-600 font-bold hover:bg-gray-200">-</button>
                            <span className="w-6 text-center">{item.cantidad}</span>
                            <button onClick={() => cambiarCantidad(item.id, item.cantidad + 1)} className="bg-gray-100 w-6 h-6 rounded text-gray-600 font-bold hover:bg-gray-200">+</button>
                          </div>
                        </td>
                        <td className="py-3 px-1 text-right whitespace-nowrap">
                          <input
                            type="number"
                            value={precio}
                            onChange={(e) => cambiarPrecioUnitario(item.id, e.target.value)}
                            className="w-24 text-right border border-gray-200 rounded px-1.5 py-1 text-gray-700 focus:outline-none focus:ring-1 focus:ring-orange-400"
                          />
                        </td>
                        <td className="py-3 px-1 text-right whitespace-nowrap">
                          <input
                            type="number"
                            value={(precio * item.cantidad).toFixed(0)}
                            onChange={(e) => cambiarSubtotalManual(item.id, e.target.value)}
                            className="w-24 text-right border border-gray-200 rounded px-1.5 py-1 font-bold text-gray-800 focus:outline-none focus:ring-1 focus:ring-orange-400"
                          />
                        </td>
                        <td className="py-3 pl-2 text-center whitespace-nowrap">
                          <button onClick={() => eliminarDelCarrito(item.id)} className="text-red-400 hover:text-red-600 font-bold">✕</button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          <div className="border-t border-gray-200 p-3 flex justify-between text-sm font-bold text-gray-600">
            <span>Artículos: {totalArticulos}</span>
            <span>Total: {formatGs(totalConAjustes)}</span>
          </div>

          <div className="shrink-0 border-t-2 border-gray-300 bg-white p-2 shadow-[0_-3px_10px_rgba(0,0,0,0.05)]">
            <div className="flex flex-wrap items-end gap-2">
              <div className="w-36 shrink-0">
                <label className="text-[10px] font-bold text-gray-500 block mb-1">Paga con (Gs)</label>
                <input type="number" placeholder="Ej: 100000" value={montoPagado} onChange={(e) => setMontoPagado(e.target.value)} className="w-full h-8 border border-gray-300 rounded px-2 font-bold text-sm" />
              </div>
              <div className="w-40 shrink-0">
                <label className="text-[10px] font-bold text-gray-500 block mb-1">Método de pago</label>
                <select value={metodoPago} onChange={(e) => setMetodoPago(e.target.value)} className="w-full h-8 border border-gray-300 rounded px-2 text-xs font-bold bg-white">
                  <option value="Efectivo">💵 Efectivo</option>
                  <option value="Tarjeta">💳 Tarjeta</option>
                  <option value="Transferencia">🏦 Transf.</option>
                </select>
              </div>
              <button
                onClick={() => procesarVenta('venta')}
                disabled={carrito.length === 0}
                className={`h-8 flex-1 min-w-[150px] rounded-lg font-black text-sm text-white transition-all ${carrito.length === 0 ? 'bg-gray-300 cursor-not-allowed' : 'bg-orange-500 hover:bg-orange-600'}`}
              >
                COBRAR {formatGs(totalConAjustes)}
              </button>
            </div>

          {vuelto > 0 && (
            <div className="mt-2 bg-green-50 text-green-800 p-1.5 rounded flex justify-between font-bold border border-green-200 text-xs">
              <span>Vuelto:</span><span>{formatGs(vuelto)}</span>
            </div>
          )}
          {saldoPendiente > 0 && (
            <div className="mt-2 bg-red-50 text-red-800 p-1.5 rounded flex justify-between font-bold border border-red-200 text-xs">
              <span>Queda debiendo:</span><span>{formatGs(saldoPendiente)}</span>
            </div>
          )}

            <div className="mt-2 flex gap-1.5 overflow-x-auto text-[10px] font-bold pb-0.5">
            <button onClick={() => procesarVenta('pendiente')} disabled={carrito.length === 0} className="shrink-0 whitespace-nowrap bg-gray-100 text-gray-700 px-3 py-2 rounded-lg hover:bg-gray-200 disabled:opacity-50">📝 Pedido Pendiente</button>
            <button onClick={() => procesarVenta('cotizacion')} disabled={carrito.length === 0} className="shrink-0 whitespace-nowrap bg-gray-100 text-gray-700 px-3 py-2 rounded-lg hover:bg-gray-200 disabled:opacity-50">📄 Cotización</button>
            <button onClick={procesarDelivery} disabled={carrito.length === 0} className="shrink-0 whitespace-nowrap bg-blue-50 text-blue-700 px-3 py-2 rounded-lg hover:bg-blue-100 disabled:opacity-50">🚚 Delivery</button>
            <button onClick={() => procesarVenta('credito')} disabled={carrito.length === 0} className="shrink-0 whitespace-nowrap bg-indigo-50 text-indigo-700 px-3 py-2 rounded-lg hover:bg-indigo-100 disabled:opacity-50">💳 Venta a crédito</button>
            <button onClick={() => cobrarConMetodo('Tarjeta')} disabled={carrito.length === 0} className="shrink-0 whitespace-nowrap bg-pink-50 text-pink-700 px-3 py-2 rounded-lg hover:bg-pink-100 disabled:opacity-50">💳 Tarjeta</button>
            <button onClick={() => setMostrarPagoMultiple(true)} disabled={carrito.length === 0} className="shrink-0 whitespace-nowrap bg-sky-50 text-sky-700 px-3 py-2 rounded-lg hover:bg-sky-100 disabled:opacity-50">▣ Pago múltiple</button>
            <button onClick={() => cobrarConMetodo('Efectivo')} disabled={carrito.length === 0} className="shrink-0 whitespace-nowrap bg-emerald-50 text-emerald-700 px-3 py-2 rounded-lg hover:bg-emerald-100 disabled:opacity-50">💵 Efectivo</button>
            <button onClick={vaciarCarrito} className="shrink-0 whitespace-nowrap bg-red-50 text-red-600 px-3 py-2 rounded-lg hover:bg-red-100">✕ Cancelar</button>
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
                        <p className="text-[11px] text-gray-400 mb-1">{prod.codigo || '—'} · Stock: {stockEnSucursal(prod) ?? 0}</p>
                        <p className="text-orange-600 font-black">{formatGs(prod.precio_venta || prod.precio)}</p>
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
    </div>
  );
};

export default PuntoDeVenta;