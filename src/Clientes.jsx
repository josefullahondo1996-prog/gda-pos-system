import { useEffect, useState, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from './supabaseClient';
import { sonidoExito, sonidoError } from './utils/sonido';
import { useEmpresaInfo } from './utils/useEmpresa';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { generateReceipt } from './utils/generateReceipt';
import { useNotificacion } from './NotificacionContext';
import { useLanguage } from './LanguageContext';
import { registrarPagoCliente } from './utils/registrarPagoCliente';

export default function Clientes() {
  const { t } = useLanguage();
  const { id: empresaId, nombre: nombreDelNegocio, direccion: direccionEmpresa, telefono: telefonoEmpresa } = useEmpresaInfo();
  const { notificar, confirmar } = useNotificacion();
  const [clientes, setClientes] = useState([]);
  const [ventasRaw, setVentasRaw] = useState([]);
  const [ubicacionesMap, setUbicacionesMap] = useState({});
  const [pagosRaw, setPagosRaw] = useState([]);
  const [pagosAplicacionesRaw, setPagosAplicacionesRaw] = useState([]);
  const [errorAplicacionesPagos, setErrorAplicacionesPagos] = useState(false);
  const [busqueda, setBusqueda] = useState('');

  // Filtros tipo checkbox (reales, calculados desde tus ventas)
  const [filtroCreditosOtorgados, setFiltroCreditosOtorgados] = useState(false);
  const [filtroPagoRealizado, setFiltroPagoRealizado] = useState(false);
  const [filtroCreditoAFavor, setFiltroCreditoAFavor] = useState(false);
  const [filtroSaldoInicial, setFiltroSaldoInicial] = useState(false);
  const [filtroSinVenta, setFiltroSinVenta] = useState('');
  const [filtroVendedor, setFiltroVendedor] = useState('Ninguna');

  // Filtros tipo dropdown
  const [filtroGrupo, setFiltroGrupo] = useState('Ninguna');
  const [filtroEstado, setFiltroEstado] = useState('Ninguna');

  // Tabla: paginación y columnas visibles
  const [entradasPorPagina, setEntradasPorPagina] = useState(25);
  const [paginaActual, setPaginaActual] = useState(1);
  const [mostrarMenuColumnas, setMostrarMenuColumnas] = useState(false);
  const [columnasVisibles, setColumnasVisibles] = useState({
    empresa: true,
    email: true,
    documento: true,
    limiteCredito: true,
    terminoPago: true,
    saldoApertura: true,
    pagoRealizado: true,
    añadido: true,
    grupoClientes: true,
    direccion: true,
    celular: true,
    ventaTotal: true,
    devolucionVencida: true,
    creditosOtorgados: true,
  });

  // Control del Modal
  const [mostrarModalAñadir, setMostrarModalAñadir] = useState(false);
  const [clienteEditando, setClienteEditando] = useState(null);
  const [menuAccionesAbierto, setMenuAccionesAbierto] = useState(null);
  const [menuAccionesPos, setMenuAccionesPos] = useState({ top: 0, left: 0 });
  const [clienteVer, setClienteVer] = useState(null);
  const [clientePagar, setClientePagar] = useState(null);
  const [montoPago, setMontoPago] = useState('');
  const [metodoPago, setMetodoPago] = useState('Efectivo');
  const [notaPago, setNotaPago] = useState('');
  const [fechaPago, setFechaPago] = useState('');
  const [cuentaPago, setCuentaPago] = useState('Ninguna');
  const [cajasDisponibles, setCajasDisponibles] = useState([]);
  const [documentoPago, setDocumentoPago] = useState(null);
  const [nombreDocumentoPago, setNombreDocumentoPago] = useState('');
  const [subiendoDocumento, setSubiendoDocumento] = useState(false);
  const [guardandoPago, setGuardandoPago] = useState(false);
  const [clienteLibroMayor, setClienteLibroMayor] = useState(null);
  const [libroMayorTab, setLibroMayorTab] = useState('libro');
  const [historialCliente, setHistorialCliente] = useState([]);
  const [cargandoHistorialCliente, setCargandoHistorialCliente] = useState(false);
  const [documentosCliente, setDocumentosCliente] = useState([]);
  const [cargandoDocumentosCliente, setCargandoDocumentosCliente] = useState(false);
  const [subiendoDocumentoCliente, setSubiendoDocumentoCliente] = useState(false);
  const [errorDocumentosCliente, setErrorDocumentosCliente] = useState('');
  const [libroMayorDesde, setLibroMayorDesde] = useState('');
  const [libroMayorHasta, setLibroMayorHasta] = useState('');
  const [libroMayorFormato, setLibroMayorFormato] = useState('Format 1');
  const [libroMayorUbicacion, setLibroMayorUbicacion] = useState('Todas');
  const [correoLibroMayorAbierto, setCorreoLibroMayorAbierto] = useState(false);
  const [cargandoPlantillaLibroMayor, setCargandoPlantillaLibroMayor] = useState(false);
  const [paraLibroMayor, setParaLibroMayor] = useState('');
  const [ccLibroMayor, setCcLibroMayor] = useState('');
  const [bccLibroMayor, setBccLibroMayor] = useState('');
  const [asuntoLibroMayor, setAsuntoLibroMayor] = useState('');
  const [cuerpoLibroMayor, setCuerpoLibroMayor] = useState('');
  const [formatoCorreoLibroMayor, setFormatoCorreoLibroMayor] = useState('Format 1');
  const [descargarPdfCorreo, setDescargarPdfCorreo] = useState(true);
  const [fotoAmpliada, setFotoAmpliada] = useState(null);
  const [pagoSeleccionado, setPagoSeleccionado] = useState(null);
  const [pagoAccion, setPagoAccion] = useState(null);
  const [editandoPago, setEditandoPago] = useState(false);
  const [pagoEditandoMetodo, setPagoEditandoMetodo] = useState('Efectivo');
  const [pagoEditandoNota, setPagoEditandoNota] = useState('');
  const [pagoEditandoFecha, setPagoEditandoFecha] = useState('');

  // Controles de la pestaña "Ventas" dentro del modal (clon de app.micdepos.com)
  const [ventasFiltroEstado, setVentasFiltroEstado] = useState('Todos');
  const [ventasDesde, setVentasDesde] = useState('');
  const [ventasHasta, setVentasHasta] = useState('');
  const [ventasSuscripciones, setVentasSuscripciones] = useState(false);
  const [ventasBusqueda, setVentasBusqueda] = useState('');
  const [ventasEntradasPorPagina, setVentasEntradasPorPagina] = useState(25);
  const [ventasPaginaActual, setVentasPaginaActual] = useState(1);
  const [ventasMostrarMenuColumnas, setVentasMostrarMenuColumnas] = useState(false);
  const [ventasAccionAbierta, setVentasAccionAbierta] = useState(null);
  const [ventasVerDetalle, setVentasVerDetalle] = useState(null);
  const [ventasColumnasVisibles, setVentasColumnasVisibles] = useState({
    facturaNo: true, numeroContacto: true, ubicacion: true, metodoPago: true,
    creditosOtorgados: true, creditoDevolucion: true, estadoEnvio: true,
    totalArticulos: true, añadidoPor: true, notaVenta: true, notaPersonal: true,
  });
  const [clienteVentas, setClienteVentas] = useState(null);
  const [clienteDocumentos, setClienteDocumentos] = useState(null);
  const [notasDoc, setNotasDoc] = useState('');
  const [guardandoNotas, setGuardandoNotas] = useState(false);

  // Modal de pago para Libro Mayor > Ventas
  const [ventaPagar, setVentaPagar] = useState(null);
  const [montoPagoVenta, setMontoPagoVenta] = useState('');
  const [metodoPagoVenta, setMetodoPagoVenta] = useState('Efectivo');
  const [notaPagoVenta, setNotaPagoVenta] = useState('');
  const [fechaPagoVenta, setFechaPagoVenta] = useState('');
  const [cuentaPagoVenta, setCuentaPagoVenta] = useState('Ninguna');
  const [documentoPagoVenta, setDocumentoPagoVenta] = useState(null);
  const [guardandoPagoVenta, setGuardandoPagoVenta] = useState(false);

  // Control de Acordeones
  const [acordeonIdentificacion, setAcordeonIdentificacion] = useState(true);
  const [acordeonContacto, setAcordeonContacto] = useState(true);
  const [acordeonUbicacion, setAcordeonUbicacion] = useState(false);
  const [acordeonCredito, setAcordeonCredito] = useState(false);
  const [acordeonFoto, setAcordeonFoto] = useState(false);
  const [imagenClientePreview, setImagenClientePreview] = useState(null);
  const [subiendoImagenCliente, setSubiendoImagenCliente] = useState(false);
  const [camaraClienteAbierta, setCamaraClienteAbierta] = useState(false);
  const videoClienteRef = useRef(null);
  const canvasClienteRef = useRef(null);
  const streamClienteRef = useRef(null);
  const [acordeonDocumentos, setAcordeonDocumentos] = useState(false);

  // --- ESTADOS DEL FORMULARIO ---
  const [tipoContacto, setTipoContacto] = useState('Clientes');
  const [esEmpresa, setEsEmpresa] = useState(false);
  const [codigo, setCodigo] = useState('');
  const [tipoDoc, setTipoDoc] = useState('RUC');
  const [nroDoc, setNroDoc] = useState('');
  const [cargandoRuc, setCargandoRuc] = useState(false);
  const [resultadosRuc, setResultadosRuc] = useState([]);
  const [mostrarModalRuc, setMostrarModalRuc] = useState(false);

  // 1. Identificación
  const [prefijo, setPrefijo] = useState('');
  const [nombre, setNombre] = useState('');
  const [segundoNombre, setSegundoNombre] = useState('');
  const [apellido, setApellido] = useState('');
  const [nombreEmpresa, setNombreEmpresa] = useState('');
  const [representanteLegal, setRepresentanteLegal] = useState('');

  // 2. Contacto
  const [telefono, setTelefono] = useState('');
  const [email, setEmail] = useState('');
  const [fechaNacimiento, setFechaNacimiento] = useState('');

  // 3. Ubicación y Datos Fiscales
  const [pais, setPais] = useState('Paraguay');
  const [departamento, setDepartamento] = useState('-- Depto --');
  const [ciudad, setCiudad] = useState('');
  const [direccionCalle, setDireccionCalle] = useState('');
  const [nroCasa, setNroCasa] = useState('');
  const [edificioPiso, setEdificioPiso] = useState('');
  const [codPostal, setCodPostal] = useState('7700');

  // 4. Crédito y Condiciones
  const [vendedorAsignado, setVendedorAsignado] = useState('');
  const [grupoClientes, setGrupoClientes] = useState('Ninguna');
  const [saldoInicial, setSaldoInicial] = useState('0');
  const [terminoPagoNum, setTerminoPagoNum] = useState('');
  const [terminoPagoTipo, setTerminoPagoTipo] = useState('Dias');
  const [limiteCredito, setLimiteCredito] = useState('0');

  const manejarCambioTipoDoc = (nuevoTipoDoc) => {
    setTipoDoc(nuevoTipoDoc);
    setEsEmpresa(nuevoTipoDoc === 'RUC');
  };

  useEffect(() => {
    if (nombreDelNegocio) setVendedorAsignado((prev) => prev || nombreDelNegocio);
  }, [nombreDelNegocio]);

  useEffect(() => {
    if (!empresaId) return;
    cargarClientes();
    cargarVentas();
    cargarPagos();
    cargarUbicaciones();
  }, [empresaId]);

  // Cajas/cuentas de Caja-Banco disponibles para elegir al registrar un pago
  const cargarCajasDisponibles = async () => {
    if (!empresaId) return;
    const { data, error } = await supabase
      .from('cuentas_caja')
      .select('id, nombre, saldo, moneda')
      .eq('empresa_id', empresaId)
      .eq('activo', true)
      .order('nombre');
    if (!error && data) setCajasDisponibles(data);
  };

  useEffect(() => {
    if (empresaId) cargarCajasDisponibles();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empresaId]);

  useEffect(() => {
    let vigente = true;
    const cargarHistorial = async () => {
      if (!clienteLibroMayor || libroMayorTab !== 'historial' || !empresaId) return;
      setCargandoHistorialCliente(true);
      const { data, error } = await supabase
        .from('eventos_auditoria')
        .select('id, ocurrido_en, accion, usuario_nombre, detalle')
        .eq('empresa_id', empresaId)
        .eq('tabla', 'clientes')
        .eq('registro_id', String(clienteLibroMayor.id))
        .order('ocurrido_en', { ascending: false })
        .limit(200);
      if (vigente) {
        setHistorialCliente(error ? [] : (data || []));
        setCargandoHistorialCliente(false);
      }
    };
    cargarHistorial();
    return () => { vigente = false; };
  }, [clienteLibroMayor, libroMayorTab, empresaId]);

  useEffect(() => {
    let vigente = true;
    const cargarDocumentos = async () => {
      if (!clienteLibroMayor || libroMayorTab !== 'documentos' || !empresaId) return;
      setCargandoDocumentosCliente(true);
      setErrorDocumentosCliente('');
      const ruta = `${empresaId}/${clienteLibroMayor.id}`;
      const { data, error } = await supabase.storage.from('documentos-clientes').list(ruta, {
        limit: 100,
        sortBy: { column: 'created_at', order: 'desc' },
      });
      if (!vigente) return;
      if (error) {
        setDocumentosCliente([]);
        setErrorDocumentosCliente('No se pudieron cargar los documentos. Verificá que esté aplicada la migración de documentos de clientes.');
      } else {
        setDocumentosCliente((data || []).filter((item) => item.id));
      }
      setCargandoDocumentosCliente(false);
    };
    cargarDocumentos();
    return () => { vigente = false; };
  }, [clienteLibroMayor, libroMayorTab, empresaId]);

  const subirDocumentoCliente = async (event) => {
    const archivo = event.target.files?.[0];
    event.target.value = '';
    if (!archivo || !clienteLibroMayor || !empresaId) return;
    if (archivo.size > 20 * 1024 * 1024) {
      notificar.error('El archivo supera el límite de 20 MB.');
      return;
    }
    const nombreSeguro = archivo.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const ruta = `${empresaId}/${clienteLibroMayor.id}/${crypto.randomUUID()}-${nombreSeguro}`;
    setSubiendoDocumentoCliente(true);
    setErrorDocumentosCliente('');
    const { error } = await supabase.storage.from('documentos-clientes').upload(ruta, archivo, {
      contentType: archivo.type || 'application/octet-stream',
      upsert: false,
    });
    setSubiendoDocumentoCliente(false);
    if (error) {
      setErrorDocumentosCliente('No se pudo subir el archivo. Verificá que esté aplicada la migración de documentos de clientes.');
      return;
    }
    const { data } = await supabase.storage.from('documentos-clientes').list(`${empresaId}/${clienteLibroMayor.id}`, {
      limit: 100,
      sortBy: { column: 'created_at', order: 'desc' },
    });
    setDocumentosCliente((data || []).filter((item) => item.id));
  };

  const abrirDocumentoCliente = async (documento) => {
    const ruta = `${empresaId}/${clienteLibroMayor.id}/${documento.name}`;
    const { data, error } = await supabase.storage.from('documentos-clientes').createSignedUrl(ruta, 120);
    if (error || !data?.signedUrl) {
      notificar.error('No se pudo abrir el documento.');
      return;
    }
    window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
  };

  const borrarDocumentoCliente = async (documento) => {
    const confirmado = await confirmar(`¿Eliminar el archivo “${documento.name}”?`, {
      titulo: 'Eliminar documento', textoConfirmar: 'Eliminar', textoCancelar: 'Cancelar', peligroso: true,
    });
    if (!confirmado) return;
    const ruta = `${empresaId}/${clienteLibroMayor.id}/${documento.name}`;
    const { error } = await supabase.storage.from('documentos-clientes').remove([ruta]);
    if (error) {
      notificar.error('No se pudo eliminar el documento.');
      return;
    }
    setDocumentosCliente((actuales) => actuales.filter((item) => item.name !== documento.name));
  };

  const cargarClientes = async () => {
    // Solo traemos personas/clientes. Los que están marcados puramente como
    // "Proveedores" quedan afuera de esta pantalla (esos se ven en Compras).
    // Se incluyen "Ambos" y los registros viejos sin tipo definido (null),
    // para no perder datos existentes.
    let query = supabase
      .from('clientes')
      .select('*')
      .or('tipo_contacto.is.null,tipo_contacto.neq.Proveedores')
      .order('id', { ascending: false });
    if (empresaId) query = query.eq('empresa_id', empresaId);
    const { data, error } = await query;
    if (!error && data) setClientes(data);
  };

  const cargarVentas = async () => {
    let query = supabase.from('ventas').select('id, cliente, total, monto_pagado, saldo_pendiente, fecha, estado_pago, metodo_pago, articulos, nota_venta, ubicacion_id');
    if (empresaId) query = query.eq('empresa_id', empresaId);
    const { data, error } = await query;
    if (!error && data) setVentasRaw(data);
  };

  const cargarUbicaciones = async () => {
    let query = supabase.from('ubicaciones_comerciales').select('id, nombre');
    if (empresaId) query = query.eq('empresa_id', empresaId);
    const { data, error } = await query;
    if (!error && data) {
      const mapa = {};
      data.forEach((u) => { mapa[u.id] = u.nombre; });
      setUbicacionesMap(mapa);
    }
  };

  const cargarPagos = async () => {
    let query = supabase.from('pagos_clientes').select('*').order('fecha', { ascending: false });
    if (empresaId) query = query.eq('empresa_id', empresaId);
    const { data, error } = await query;
    if (!error && data) setPagosRaw(data);
    if (!empresaId) return;
    const { data: aplicaciones, error: errorAplicaciones } = await supabase
      .from('pagos_clientes_aplicaciones')
      .select('pago_id, venta_id, monto_aplicado')
      .eq('empresa_id', empresaId);
    setPagosAplicacionesRaw(errorAplicaciones ? [] : (aplicaciones || []));
    setErrorAplicacionesPagos(Boolean(errorAplicaciones));
  };

  const abrirDetallePagoLibroMayor = (pago) => {
    setPagoSeleccionado(pago);
    setPagoAccion('ver');
    setEditandoPago(false);
  };

  const abrirEdicionPagoLibroMayor = (pago) => {
    setPagoSeleccionado(pago);
    setPagoAccion('editar');
    setEditandoPago(true);
    setPagoEditandoMetodo(pago.metodo_pago || 'Efectivo');
    setPagoEditandoNota(pago.nota || '');
    setPagoEditandoFecha(pago.fecha ? new Date(pago.fecha).toISOString().slice(0, 10) : '');
  };

  const cerrarAccionPago = () => {
    setPagoSeleccionado(null);
    setPagoAccion(null);
    setEditandoPago(false);
  };

  const guardarEdicionPagoLibroMayor = async () => {
    if (!pagoSeleccionado) return;
    const { error } = await supabase
      .from('pagos_clientes')
      .update({
        metodo_pago: pagoEditandoMetodo,
        nota: pagoEditandoNota || null,
        fecha: pagoEditandoFecha ? new Date(pagoEditandoFecha).toISOString() : pagoSeleccionado.fecha,
      })
      .eq('id', pagoSeleccionado.id)
      .eq('empresa_id', empresaId);
    if (error) return alert('Error al editar el pago: ' + error.message);
    sonidoExito();
    cerrarAccionPago();
    await cargarPagos();
  };

  const borrarPagoLibroMayor = async (pago) => {
    if (!window.confirm(`¿Borrar el pago de ${formatGs(pago.monto)}?`)) return;
    const { error } = await supabase
      .from('pagos_clientes')
      .delete()
      .eq('id', pago.id)
      .eq('empresa_id', empresaId);
    if (error) return alert('Error al borrar el pago: ' + error.message);
    sonidoExito();
    cerrarAccionPago();
    await cargarPagos();
  };

  const cargarDetalleVenta = async (venta) => {
    const { data } = await supabase.from('detalle_ventas').select('*').eq('venta_id', venta.id);
    return data || [];
  };

  const imprimirFactura = async (venta) => {
    setVentasAccionAbierta(null);
    const items = await cargarDetalleVenta(venta);
    const clienteRuc = clienteLibroMayor?.documento_nro || '';
    generateReceipt(
      { ...venta, cliente_nombre: venta.cliente, cliente_ruc: clienteRuc, items },
      { nombre: nombreDelNegocio, direccion: direccionEmpresa, telefono: telefonoEmpresa },
      '80mm',
      true
    );
  };

  const abrirModalPagoLibroMayor = (venta) => {
    setVentasAccionAbierta(null);
    setVentaPagar(venta);
    setMontoPagoVenta('');
    setMetodoPagoVenta('Efectivo');
    setNotaPagoVenta('');
    setFechaPagoVenta(new Date().toISOString().split('T')[0]);
    setCuentaPagoVenta('Ninguna');
    setDocumentoPagoVenta(null);
  };

  const guardarPagoLibroMayor = async () => {
    if (!ventaPagar) return;
    const monto = Number(montoPagoVenta);
    if (!monto || monto <= 0) return alert('Ingresá un monto válido.');
    setGuardandoPagoVenta(true);
    try {
      const cajaElegida = cuentaPagoVenta !== 'Ninguna' ? cajasDisponibles.find((c) => c.id === cuentaPagoVenta) : null;
      const resultado = await registrarPagoCliente({
        empresaId,
        clienteId: clienteLibroMayor?.id || null,
        monto,
        metodoPago: metodoPagoVenta,
        nota: notaPagoVenta,
        fecha: fechaPagoVenta ? new Date(fechaPagoVenta).toISOString() : new Date().toISOString(),
        cuentaPago: cajaElegida?.nombre || null,
        cuentaId: cajaElegida?.id || null,
        documentoUrl: documentoPagoVenta,
      });

      sonidoExito();
      if (Number(resultado?.monto_sin_aplicar) > 0) {
        alert(`Pago registrado y aplicado a las facturas pendientes. ${formatGs(resultado.monto_sin_aplicar)} quedaron como crédito sin aplicar.`);
      }
      setVentaPagar(null);
      await cargarPagos();
      await cargarVentas();
      await cargarCajasDisponibles();
    } catch (error) {
      alert('Error al registrar el pago: ' + error.message);
    } finally {
      setGuardandoPagoVenta(false);
    }
  };

  // Cruce cliente <-> ventas por nombre. OJO: esto depende de que el nombre que
  // se tipeó en Punto de Venta coincida exacto con el nombre del cliente acá.
  // Hoy tu Punto de Venta no deja elegir un cliente real de esta lista (usa
  // "Cliente Ocasional" fijo), así que estas columnas van a estar en 0 hasta
  // que conectemos ambas pantallas. Te lo dejo funcionando para cuando lo hagamos.
  const clientesEnriquecidos = useMemo(() => {
    return clientes.map((c) => {
      const ventasDelCliente = ventasRaw.filter(
        (v) => v.cliente && (v.cliente === c.nombre || v.cliente === c.nombre_empresa)
      );
      const pagosManuales = pagosRaw.filter((p) => p.cliente_id === c.id);
      const idsPagosCliente = new Set(pagosManuales.map((p) => p.id));
      const idsVentasCliente = new Set(ventasDelCliente.map((v) => v.id));
      const aplicacionesCliente = pagosAplicacionesRaw.filter((aplicacion) => (
        idsPagosCliente.has(aplicacion.pago_id) && idsVentasCliente.has(aplicacion.venta_id)
      ));
      const pagoRealizadoManual = pagosManuales.reduce((acc, p) => acc + (Number(p.monto) || 0), 0);
      const totalFacturado = ventasDelCliente.reduce((acc, v) => acc + (Number(v.total) || 0), 0);

      // A PARTIR DE ACÁ TODO ES REAL: saldo_pendiente ya viene actualizado desde
      // Supabase cada vez que se registra un pago (ver confirmarPago), así que acá
      // solo LEEMOS los datos, no los volvemos a calcular ni simular.
      // "Total pagado" de cada venta = Total - saldo_pendiente actual (ya real).
      const ventasDelClienteConSaldo = ventasDelCliente.map((v) => {
        const saldoActual = Number(v.saldo_pendiente) || 0;
        const montoPagadoActual = Math.max(0, (Number(v.total) || 0) - saldoActual);
        return { ...v, saldoActual, montoPagadoActual };
      });

      const saldoPendienteVentas = ventasDelClienteConSaldo.reduce((acc, v) => acc + v.saldoActual, 0);
      const pagoRealizadoVentas = ventasDelClienteConSaldo.reduce((acc, v) => acc + v.montoPagadoActual, 0);
      const creditoOtorgado = saldoPendienteVentas; // ya es el saldo real, no hace falta restar nada más

      // Cuánto de los pagos manuales (Acciones -> Pagar) efectivamente se aplicó a
      // alguna venta, comparando el saldo original de cada venta (Total - pago del
      // momento de la venta, que nunca se toca) contra su saldo actual ya real.
      const totalManualAplicado = ventasDelClienteConSaldo.reduce((acc, v) => {
        const saldoOriginalVenta = Math.max(0, (Number(v.total) || 0) - (Number(v.monto_pagado) || 0));
        return acc + Math.max(0, saldoOriginalVenta - v.saldoActual);
      }, 0);
      // Lo que sobró de pagos manuales sin poder aplicarse a ninguna venta
      // (el cliente pagó más de lo que debía) es crédito real a favor.
      const creditoAFavor = Math.max(0, pagoRealizadoManual - totalManualAplicado);
      const pagoRealizado = pagoRealizadoVentas + creditoAFavor;

      // Tu sistema todavía no registra devoluciones de venta, así que esta columna
      // queda en 0 hasta que armemos esa función. La dejo lista para conectar.
      const devolucionVencida = 0;

      return {
        ...c,
        pagoRealizado,
        pagoRealizadoManual,
        creditoOtorgado,
        creditoAFavor,
        totalFacturado,
        devolucionVencida,
        ventasDelCliente: ventasDelClienteConSaldo,
        pagosManuales,
        aplicacionesCliente,
        aplicacionesPagosDisponibles: !errorAplicacionesPagos,
      };
    });
  }, [clientes, ventasRaw, pagosRaw, pagosAplicacionesRaw, errorAplicacionesPagos]);

  const clientesFiltrados = useMemo(() => {
    const termino = busqueda.toLowerCase();
    return clientesEnriquecidos.filter((c) => {
      const coincideBusqueda =
        (c.nombre && c.nombre.toLowerCase().includes(termino)) ||
        (c.nombre_empresa && c.nombre_empresa.toLowerCase().includes(termino)) ||
        (c.codigo_cliente && c.codigo_cliente.toLowerCase().includes(termino));
      if (!coincideBusqueda) return false;
      if (filtroGrupo !== 'Ninguna' && c.grupo_clientes !== filtroGrupo) return false;
      if (filtroEstado !== 'Ninguna' && c.estado !== filtroEstado) return false;
      if (filtroCreditosOtorgados && !(c.creditoOtorgado > 0)) return false;
      if (filtroPagoRealizado && !(c.pagoRealizado > 0)) return false;
      if (filtroCreditoAFavor && !(c.creditoAFavor > 0)) return false;
      if (filtroSaldoInicial && Number(c.saldo_apertura || 0) === 0) return false;
      if (filtroVendedor !== 'Ninguna' && c.vendedor_asignado !== filtroVendedor) return false;
      if (filtroSinVenta) {
        const corte = new Date();
        corte.setMonth(corte.getMonth() - Number(filtroSinVenta));
        const tuvoVentaReciente = c.ventasDelCliente.some((v) => v.fecha && new Date(v.fecha) >= corte);
        if (tuvoVentaReciente) return false;
      }
      return true;
    });
  }, [clientesEnriquecidos, busqueda, filtroGrupo, filtroEstado, filtroCreditosOtorgados, filtroPagoRealizado, filtroCreditoAFavor, filtroSaldoInicial, filtroSinVenta, filtroVendedor]);

  // Paginación
  const totalPaginas = Math.max(1, Math.ceil(clientesFiltrados.length / entradasPorPagina));
  const paginaSegura = Math.min(paginaActual, totalPaginas);
  const clientesPagina = clientesFiltrados.slice(
    (paginaSegura - 1) * entradasPorPagina,
    paginaSegura * entradasPorPagina
  );

  const gruposDisponibles = [...new Set(clientes.map((c) => c.grupo_clientes).filter(Boolean))];
  const estadosDisponibles = [...new Set(clientes.map((c) => c.estado).filter(Boolean))];
  const vendedoresDisponibles = [...new Set(clientes.map((c) => c.vendedor_asignado).filter(Boolean))];

  const formatGs = (v) => `${Number(v || 0).toLocaleString('es-PY')} Gs`;

  const columnasExport = [
    { key: 'codigo_cliente', label: 'Codigo Cliente' },
    { key: 'nombre_empresa', label: 'Nombre de la Empresa' },
    { key: 'nombre', label: 'Nombre' },
    { key: 'email', label: 'Email' },
    { key: 'documento_nro', label: 'Documento N.' },
    { key: 'limite_credito', label: 'Limite de Credito' },
    { key: 'termino_pago', label: 'Termino de Pago' },
    { key: 'saldo_apertura', label: 'Saldo de Apertura' },
    { key: 'pagoRealizado', label: 'Pago Realizado' },
    { key: 'creado_en', label: 'Añadido' },
    { key: 'grupo_clientes', label: 'Grupo de Clientes' },
    { key: 'direccion', label: 'Direccion' },
    { key: 'celular', label: 'Celular' },
    { key: 'totalFacturado', label: 'Venta Total' },
    { key: 'devolucionVencida', label: 'Total de Devolucion de Venta Vencida' },
    { key: 'creditoOtorgado', label: 'Creditos Otorgados' },
  ];

  const descargarArchivo = (contenido, nombreArchivo, tipo) => {
    const blob = new Blob([contenido], { type: tipo });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = nombreArchivo;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportarCSV = () => {
    const filas = [columnasExport.map((c) => c.label).join(',')];
    clientesFiltrados.forEach((c) => {
      filas.push(columnasExport.map((col) => `"${String(c[col.key] ?? '').replace(/"/g, '""')}"`).join(','));
    });
    descargarArchivo(filas.join('\n'), 'clientes.csv', 'text/csv;charset=utf-8;');
  };

  const exportarExcel = () => {
    let html = '<table><tr>' + columnasExport.map((c) => `<th>${c.label}</th>`).join('') + '</tr>';
    clientesFiltrados.forEach((c) => {
      html += '<tr>' + columnasExport.map((col) => `<td>${c[col.key] ?? ''}</td>`).join('') + '</tr>';
    });
    html += '</table>';
    descargarArchivo(html, 'clientes.xls', 'application/vnd.ms-excel');
  };

  const exportarPDF = () => {
    const doc = new jsPDF();
    doc.text(`Clientes - ${nombreDelNegocio}`, 14, 12);
    autoTable(doc, {
      startY: 18,
      head: [columnasExport.map((c) => c.label)],
      body: clientesFiltrados.map((c) => columnasExport.map((col) => String(c[col.key] ?? ''))),
      styles: { fontSize: 7 },
    });
    doc.save('clientes.pdf');
  };

  // ==========================================
  // FUNCIÓN MAESTRA DE GUARDADO (INSERT / UPDATE)
  // ==========================================
  // Sube la foto elegida al bucket "clientes" en Supabase Storage y guarda
  // la URL pública en imagenClientePreview (mismo patrón que ya funciona
  // en AgregarProducto.jsx con el bucket "productos").
  const manejarImagenCliente = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) return alert('La imagen supera los 5MB.');

    setSubiendoImagenCliente(true);
    try {
      const extension = file.name.split('.').pop();
      const nombreArchivo = `${crypto.randomUUID()}.${extension}`;

      const { error: errorSubida } = await supabase.storage.from('clientes').upload(nombreArchivo, file);
      if (errorSubida) throw errorSubida;

      const { data: urlData } = supabase.storage.from('clientes').getPublicUrl(nombreArchivo);
      setImagenClientePreview(urlData.publicUrl);
    } catch (error) {
      console.error(error);
      alert('Error al subir la imagen: ' + error.message + '\n\n¿Ya creaste el bucket "clientes" en Supabase Storage (público)?');
    } finally {
      setSubiendoImagenCliente(false);
    }
  };

  const abrirCamaraCliente = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } });
      streamClienteRef.current = stream;
      setCamaraClienteAbierta(true);
      setTimeout(() => { if (videoClienteRef.current) videoClienteRef.current.srcObject = stream; }, 0);
    } catch (error) {
      alert('No se pudo acceder a la cámara: ' + error.message);
    }
  };

  const cerrarCamaraCliente = () => {
    streamClienteRef.current?.getTracks().forEach((t) => t.stop());
    streamClienteRef.current = null;
    setCamaraClienteAbierta(false);
  };

  const capturarFotoCliente = () => {
    const video = videoClienteRef.current;
    const canvas = canvasClienteRef.current;
    if (!video || !canvas) return;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d').drawImage(video, 0, 0);
    canvas.toBlob(async (blob) => {
      if (!blob) return;
      cerrarCamaraCliente();
      setSubiendoImagenCliente(true);
      try {
        const nombreArchivo = `${crypto.randomUUID()}.jpg`;
        const { error: errorSubida } = await supabase.storage.from('clientes').upload(nombreArchivo, blob);
        if (errorSubida) throw errorSubida;
        const { data: urlData } = supabase.storage.from('clientes').getPublicUrl(nombreArchivo);
        setImagenClientePreview(urlData.publicUrl);
      } catch (error) {
        alert('Error al subir la foto: ' + error.message);
      } finally {
        setSubiendoImagenCliente(false);
      }
    }, 'image/jpeg', 0.9);
  };

  const guardarCliente = async (e) => {
    e.preventDefault();

    // Foto: sube el archivo al bucket público "clientes" en Supabase Storage
    // (mismo mecanismo que ya usa AgregarProducto.jsx con el bucket "productos")
    // y devuelve la URL pública lista para guardar.
    // 1. Formatear Nombres (Evita espacios dobles si no tiene segundo nombre)
    const nombreCompleto = `${prefijo} ${nombre} ${segundoNombre} ${apellido}`.replace(/\s+/g, ' ').trim();
    const nombreFinal = esEmpresa ? nombreEmpresa : nombreCompleto;

    // 2. Generar Código si está vacío
    const codigoGenerado = codigo || `CO${Math.floor(1000 + Math.random() * 9000)}`;

    // 3. Armar Dirección Completa Inteligente
    // (En edición, el campo "Calle" ya trae la dirección completa como texto,
    // porque la tabla "clientes" no guarda calle/ciudad/depto por separado)
    const partesDireccion = [direccionCalle, nroCasa ? `Nro ${nroCasa}` : '', edificioPiso].filter(Boolean).join(' ');
    const direccionCompleta = clienteEditando
      ? direccionCalle
      : `${partesDireccion}, ${ciudad}, ${departamento}, ${pais} (CP: ${codPostal})`.replace(/^, /, '').trim();

    // 4. Formatear Término de Pago
    const terminoPagoFinal = terminoPagoNum ? `${terminoPagoNum} ${terminoPagoTipo}` : '';

    const datosCliente = {
      empresa_id: empresaId,
      tipo_contacto: tipoContacto,
      codigo_cliente: codigoGenerado,
      tipo_documento: tipoDoc,
      documento_nro: nroDoc || null,
      nombre_empresa: esEmpresa ? nombreEmpresa : null,
      nombre: nombreFinal,
      representante_legal: representanteLegal || null,
      email: email || null,
      celular: telefono || null,
      fecha_nacimiento: fechaNacimiento || null,
      direccion: direccionCompleta,
      vendedor_asignado: vendedorAsignado,
      grupo_clientes: grupoClientes,
      saldo_apertura: parseFloat(saldoInicial) || 0,
      limite_credito: limiteCredito === '0' || !limiteCredito ? 'Sin límite' : `${limiteCredito} Gs`,
      termino_pago: terminoPagoFinal,
      imagen_url: imagenClientePreview || null,
    };

    // 5. Verificar duplicados antes de insertar o actualizar.
    // En edición se excluye el contacto actual para permitir guardar sus propios datos.
    {
      let duplicadoEncontrado = null;

      if (nroDoc && nroDoc.trim()) {
        // Buscar por número de documento (RUC / CI)
        let consultaDocumento = supabase
          .from('clientes')
          .select('id, nombre, documento_nro')
          .eq('empresa_id', empresaId)
          .eq('documento_nro', nroDoc.trim());
        if (clienteEditando) consultaDocumento = consultaDocumento.neq('id', clienteEditando.id);
        const { data: existentesDoc } = await consultaDocumento.limit(1);
        const existenteDoc = existentesDoc?.[0];
        if (existenteDoc) duplicadoEncontrado = existenteDoc;
      }

      if (!duplicadoEncontrado) {
        // Buscar por nombre exacto (ignora mayúsculas/minúsculas)
        let consultaNombre = supabase
          .from('clientes')
          .select('id, nombre')
          .eq('empresa_id', empresaId)
          .ilike('nombre', nombreFinal);
        if (clienteEditando) consultaNombre = consultaNombre.neq('id', clienteEditando.id);
        const { data: existentesNombre } = await consultaNombre.limit(1);
        const existenteNombre = existentesNombre?.[0];
        if (existenteNombre) duplicadoEncontrado = existenteNombre;
      }

      if (duplicadoEncontrado) {
        sonidoError();
        const detalle = duplicadoEncontrado.documento_nro
          ? `Documento: ${duplicadoEncontrado.documento_nro}`
          : `Nombre: ${duplicadoEncontrado.nombre}`;
        notificar.aviso(
          `"${duplicadoEncontrado.nombre}" ya existe en el sistema.\n${detalle}.\n\nNo se cambió el tipo de contacto para evitar duplicarlo.`,
          { titulo: 'Contacto ya registrado' }
        );
        return;
      }
    }

    // 6. Enviar a Supabase: actualizar si estamos editando, o crear si es nuevo
    const { error } = clienteEditando
      ? await supabase.from('clientes').update(datosCliente).eq('id', clienteEditando.id).eq('empresa_id', empresaId)
      : await supabase.from('clientes').insert([{ ...datosCliente, estado: 'Activo' }]);

    if (error) {
      notificar.error(`No se pudo ${clienteEditando ? 'actualizar' : 'registrar'} el contacto. ${error.message}`);
    } else {
      sonidoExito();
      notificar.exito(clienteEditando ? 'Contacto actualizado correctamente.' : 'Cliente registrado correctamente.');
      setMostrarModalAñadir(false);
      setClienteEditando(null);
      resetearFormulario();
      cargarClientes();
    }
  };

  const buscarRuc = async () => {
    if (!nroDoc || !nroDoc.trim()) {
      alert('Ingresá un RUC o nombre para buscar.');
      return;
    }
    setCargandoRuc(true);
    const query = nroDoc.trim();
    const targetUrl = `https://ruc.sun.com.py/api/search?q=${encodeURIComponent(query)}`;

    try {
      const res = await fetch(targetUrl);
      if (!res.ok) {
        if (res.status === 429) throw new Error('Too Many Requests');
        throw new Error(`Error del servidor: ${res.status}`);
      }
      const data = await res.json();
      procesarResultadosRuc(data, query);
    } catch (error) {
      console.warn('Direct RUC search failed, trying proxy...', error);
      if (error.message === 'Too Many Requests') {
        alert('Demasiadas consultas al servidor. Por favor, aguardá unos segundos antes de volver a intentar.');
        setCargandoRuc(false);
        return;
      }
      try {
        const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(targetUrl)}`;
        const res = await fetch(proxyUrl);
        if (!res.ok) throw new Error(`Error de proxy: ${res.status}`);
        const data = await res.json();
        procesarResultadosRuc(data, query);
      } catch (proxyError) {
        console.error('Proxy RUC search failed too:', proxyError);
        alert('No se pudo conectar con el servicio de búsqueda de RUC. Intente ingresar los datos manualmente.');
      }
    } finally {
      setCargandoRuc(false);
    }
  };

  const procesarResultadosRuc = (data, query) => {
    if (data.ok === false) {
      if (data.error === 'Too Many Requests') {
        alert('Demasiadas consultas al servidor. Por favor, aguardá unos segundos antes de volver a intentar.');
      } else {
        alert(`Error al buscar RUC: ${data.error || 'Error desconocido'}`);
      }
      return;
    }
    
    const results = data.results || [];
    if (results.length === 0) {
      alert(`No se encontraron resultados para: "${query}"`);
      return;
    }

    if (results.length === 1) {
      seleccionarResultadoRuc(results[0]);
    } else {
      setResultadosRuc(results);
      setMostrarModalRuc(true);
    }
  };

  const seleccionarResultadoRuc = (item) => {
    const esEmpresaDetectado = /\b(S\.?R\.?L\.?|S\.?A\.?|E\.?A\.?S\.?|S\.?A\.?C\.?I\.?|S\.?A\.?C\.?A\.?|LTDA|LIMITADA|CONDOMINIO|ASOCIACION|ASOC\.?|CLUB|COOPERATIVA|EMPRESA)\b/i.test(item.name);
    
    setTipoDoc('RUC');
    setNroDoc(item.fullRuc || `${item.ruc}-${item.dv}`);
    
    if (esEmpresaDetectado) {
      setEsEmpresa(true);
      setNombreEmpresa(item.name);
      setNombre('');
      setSegundoNombre('');
      setApellido('');
    } else {
      setEsEmpresa(false);
      setNombreEmpresa('');
      const words = item.name.trim().split(/\s+/);
      if (words.length === 1) {
        setNombre(words[0]);
        setApellido('.');
      } else if (words.length === 2) {
        setNombre(words[0]);
        setApellido(words[1]);
      } else if (words.length === 3) {
        setNombre(words[0]);
        setApellido(words[1] + ' ' + words[2]);
      } else {
        setNombre(words[0] + ' ' + words[1]);
        setApellido(words.slice(2).join(' '));
      }
      setSegundoNombre('');
    }
    setMostrarModalRuc(false);
  };

  const resetearFormulario = () => {
    setTipoContacto('Clientes'); setEsEmpresa(false); setCodigo(''); setTipoDoc('RUC'); setNroDoc('');
    setPrefijo(''); setNombre(''); setSegundoNombre(''); setApellido(''); setNombreEmpresa(''); setRepresentanteLegal('');
    setTelefono(''); setEmail(''); setFechaNacimiento('');
    setPais('Paraguay'); setDepartamento('-- Depto --'); setCiudad(''); setDireccionCalle(''); setNroCasa(''); setEdificioPiso(''); setCodPostal('7700');
    setVendedorAsignado(nombreDelNegocio); setGrupoClientes('Ninguna'); setSaldoInicial('0'); setTerminoPagoNum(''); setTerminoPagoTipo('Dias'); setLimiteCredito('0');
    setImagenClientePreview(null);
  };

  const abrirEdicionCliente = (cliente) => {
    setClienteEditando(cliente);
    setTipoContacto(cliente.tipo_contacto || 'Clientes');
    setEsEmpresa(!!cliente.nombre_empresa);
    setCodigo(cliente.codigo_cliente || '');
    setTipoDoc(cliente.tipo_documento || 'RUC');
    setNroDoc(cliente.documento_nro || '');
    setPrefijo('');
    setNombre(cliente.nombre_empresa ? '' : (cliente.nombre || ''));
    setSegundoNombre('');
    setApellido('');
    setNombreEmpresa(cliente.nombre_empresa || '');
    setRepresentanteLegal(cliente.representante_legal || '');
    setTelefono(cliente.celular || '');
    setEmail(cliente.email || '');
    setFechaNacimiento(cliente.fecha_nacimiento || '');
    setPais('Paraguay');
    setDepartamento('-- Depto --');
    setCiudad('');
    setDireccionCalle(cliente.direccion || '');
    setNroCasa('');
    setEdificioPiso('');
    setCodPostal('7700');
    setVendedorAsignado(cliente.vendedor_asignado || nombreDelNegocio);
    setGrupoClientes(cliente.grupo_clientes || 'Ninguna');
    setSaldoInicial(String(cliente.saldo_apertura ?? '0'));
    const partesTermino = (cliente.termino_pago || '').split(' ');
    setTerminoPagoNum(cliente.termino_pago ? partesTermino[0] : '');
    setTerminoPagoTipo(cliente.termino_pago ? (partesTermino.slice(1).join(' ') || 'Dias') : 'Dias');
    setLimiteCredito(cliente.limite_credito && cliente.limite_credito !== 'Sin límite' ? cliente.limite_credito.replace(' Gs', '') : '0');
    setImagenClientePreview(cliente.imagen_url || null);
    setMostrarModalAñadir(true);
  };

  const handleEliminarCliente = async (cliente) => {
    const nombreContacto = cliente.nombre_empresa || cliente.nombre || 'este contacto';
    const confirmarEliminacion = await confirmar(
      `Este contacto será eliminado permanentemente:\n\n${nombreContacto}\n\nEsta acción no se puede deshacer.`,
      {
        titulo: '¿Estás seguro?',
        textoConfirmar: 'Eliminar',
        textoCancelar: 'Cancelar',
        peligroso: true,
      }
    );
    if (!confirmarEliminacion) return;

    try {
      const { error } = await supabase.from('clientes').delete().eq('id', cliente.id).eq('empresa_id', empresaId);
      if (error) throw error;

      setClientes((prev) => prev.filter((c) => c.id !== cliente.id));
      sonidoExito();
      notificar.exito('Cliente eliminado correctamente.');
    } catch (error) {
      sonidoError();
      console.error('Error al eliminar cliente:', error.message);
      notificar.error('No se pudo eliminar el cliente. ' + error.message);
    }
  };

  const handleDesactivarCliente = async (cliente) => {
    const nuevoEstado = cliente.estado === 'Inactivo' ? 'Activo' : 'Inactivo';
    if (!window.confirm(`¿${nuevoEstado === 'Inactivo' ? 'Desactivar' : 'Reactivar'} a "${cliente.nombre}"?`)) return;
    const { error } = await supabase.from('clientes').update({ estado: nuevoEstado }).eq('id', cliente.id).eq('empresa_id', empresaId);
    if (error) return alert('Error al cambiar el estado: ' + error.message);
    sonidoExito();
    cargarClientes();
  };

  const abrirModalPagar = (cliente) => {
    setMenuAccionesAbierto(null);
    setMontoPago(cliente.creditoOtorgado > 0 ? String(cliente.creditoOtorgado) : '');
    setMetodoPago('Efectivo');
    setNotaPago('');
    setFechaPago(new Date().toISOString().slice(0, 10));
    setCuentaPago('Ninguna');
    setDocumentoPago(null);
    setNombreDocumentoPago('');
    setClientePagar(cliente);
  };

  const manejarDocumentoPago = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) return alert('El archivo supera los 5MB.');
    setSubiendoDocumento(true);
    try {
      const extension = file.name.split('.').pop();
      const nombreArchivo = `${crypto.randomUUID()}.${extension}`;
      const { error: errorSubida } = await supabase.storage.from('comprobantes-pago').upload(nombreArchivo, file);
      if (errorSubida) throw errorSubida;
      const { data: urlData } = supabase.storage.from('comprobantes-pago').getPublicUrl(nombreArchivo);
      setDocumentoPago(urlData.publicUrl);
      setNombreDocumentoPago(file.name);
    } catch (error) {
      alert('Error al subir el documento: ' + error.message + '\n\n¿Ya creaste el bucket "comprobantes-pago" en Supabase Storage?');
    } finally {
      setSubiendoDocumento(false);
    }
  };

  const confirmarPago = async () => {
    if (!clientePagar) return;
    const monto = parseFloat(montoPago);
    if (!monto || monto <= 0) return alert('Ingresá un monto válido.');
    setGuardandoPago(true);
    try {
      const cajaElegida = cuentaPago !== 'Ninguna' ? cajasDisponibles.find((c) => c.id === cuentaPago) : null;
      const resultado = await registrarPagoCliente({
        empresaId,
        clienteId: clientePagar.id,
        monto,
        metodoPago,
        nota: notaPago,
        fecha: fechaPago ? new Date(fechaPago).toISOString() : new Date().toISOString(),
        cuentaPago: cajaElegida?.nombre || null,
        cuentaId: cajaElegida?.id || null,
        documentoUrl: documentoPago,
      });

      sonidoExito();
      if (Number(resultado?.monto_sin_aplicar) > 0) {
        alert(`Pago registrado y aplicado a las facturas pendientes. ${formatGs(resultado.monto_sin_aplicar)} quedaron como crédito sin aplicar.`);
      }
      setClientePagar(null);
      await cargarPagos();
      await cargarVentas();
      await cargarCajasDisponibles();
    } catch (error) {
      alert('Error al registrar el pago: ' + error.message);
    } finally {
      setGuardandoPago(false);
    }
  };

  const abrirDocumentosNotas = (cliente) => {
    setMenuAccionesAbierto(null);
    setNotasDoc(cliente.notas || '');
    setClienteDocumentos(cliente);
  };

  const guardarNotas = async () => {
    if (!clienteDocumentos) return;
    setGuardandoNotas(true);
    try {
      const { error } = await supabase.from('clientes').update({ notas: notasDoc }).eq('id', clienteDocumentos.id).eq('empresa_id', empresaId);
      if (error) throw error;
      sonidoExito();
      setClienteDocumentos(null);
      cargarClientes();
    } catch (error) {
      alert('Error al guardar la nota: ' + error.message);
    } finally {
      setGuardandoNotas(false);
    }
  };

  return (
    <div className="bg-transparent text-sm text-gray-700 relative h-full">

      <h2 className="text-2xl font-bold mb-4 text-gray-800">
        {t('customers')} <span className="text-sm font-normal text-gray-500">{t('manageCustomers')}</span>
      </h2>

      {/* FILTROS SUPERIORES */}
      <div className="bg-white p-5 md:p-6 rounded-2xl shadow-sm border border-slate-200/80 mb-5">
        <div className="flex items-center justify-between mb-5">
          <div><h3 className="text-sm font-extrabold text-slate-800">{t('filters')}</h3><p className="text-xs text-slate-500 mt-1">Refina la lista con el estado y actividad de tus clientes.</p></div>
          <span className="rounded-full bg-blue-50 px-3 py-1 text-[11px] font-bold text-blue-700">{clientesFiltrados.length} resultados</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 mb-5">
          <label className="flex items-center gap-2 text-xs font-bold text-gray-700 cursor-pointer">
            <input type="checkbox" checked={filtroCreditosOtorgados} onChange={(e) => { setFiltroCreditosOtorgados(e.target.checked); setPaginaActual(1); }} />
            {t('creditGranted')}
          </label>
          <label className="flex items-center gap-2 text-xs font-bold text-gray-400 cursor-not-allowed" title="Necesita el modulo de Devoluciones (todavia no existe en tu sistema)">
            <input type="checkbox" disabled />
            {t('salesReturn')}
          </label>
          <label className="flex items-center gap-2 text-xs font-bold text-gray-700 cursor-pointer">
            <input type="checkbox" checked={filtroPagoRealizado} onChange={(e) => { setFiltroPagoRealizado(e.target.checked); setPaginaActual(1); }} />
            {t('paymentCompleted')}
          </label>
          <label className="flex items-center gap-2 text-xs font-bold text-gray-700 cursor-pointer">
            <input type="checkbox" checked={filtroCreditoAFavor} onChange={(e) => { setFiltroCreditoAFavor(e.target.checked); setPaginaActual(1); }} />
            {t('creditBalance')}
          </label>
          <label className="flex items-center gap-2 text-xs font-bold text-gray-700 cursor-pointer">
            <input type="checkbox" checked={filtroSaldoInicial} onChange={(e) => { setFiltroSaldoInicial(e.target.checked); setPaginaActual(1); }} />
            Saldo inicial
          </label>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          <div>
            <label className="block text-xs font-bold text-gray-700 mb-1">{t('customerGroup')}:</label>
            <select className="w-full border rounded p-2 bg-white outline-none" value={filtroGrupo} onChange={(e) => { setFiltroGrupo(e.target.value); setPaginaActual(1); }}>
              <option>Ninguna</option>
              {gruposDisponibles.map((g) => <option key={g}>{g}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-700 mb-1">{t('status')}:</label>
            <select className="w-full border rounded p-2 bg-white outline-none" value={filtroEstado} onChange={(e) => { setFiltroEstado(e.target.value); setPaginaActual(1); }}>
              <option>Ninguna</option>
              {estadosDisponibles.map((es) => <option key={es}>{es}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-700 mb-1">Sin ventas durante:</label>
            <select className="w-full border rounded p-2 bg-white outline-none" value={filtroSinVenta} onChange={(e) => { setFiltroSinVenta(e.target.value); setPaginaActual(1); }}>
              <option value="">Cualquier período</option><option value="1">1 mes</option><option value="3">3 meses</option><option value="6">6 meses</option><option value="12">1 año</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-700 mb-1">Vendedor:</label>
            <select className="w-full border rounded p-2 bg-white outline-none" value={filtroVendedor} onChange={(e) => { setFiltroVendedor(e.target.value); setPaginaActual(1); }}>
              <option>Ninguna</option>{vendedoresDisponibles.map((vendedor) => <option key={vendedor}>{vendedor}</option>)}
            </select>
          </div>
        </div>
      </div>

      {/* TABLA PRINCIPAL DE ENTRADAS */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200/80 overflow-hidden">
        <div className="p-5 md:px-6 border-b border-slate-100 flex justify-between items-center">
          <div><h3 className="text-base font-extrabold text-slate-800">{t('allCustomers')}</h3><p className="text-xs text-slate-500 mt-1">Consulta saldos, ventas y datos de contacto desde cada ficha.</p></div>
          <button onClick={() => { setClienteEditando(null); resetearFormulario(); setMostrarModalAñadir(true); }} className="bg-orange-500 text-white px-4 py-2.5 rounded-xl text-sm font-bold hover:bg-orange-600 transition shadow-sm shadow-orange-500/20">
            + {t('add')}
          </button>
        </div>

        <div className="p-4">
          <div className="flex flex-wrap justify-between items-center gap-3 mb-4">
            <div className="flex items-center gap-2 text-gray-600 font-medium">
              <span>{t('show')}</span>
              <select
                className="border rounded p-1"
                value={entradasPorPagina}
                onChange={(e) => { setEntradasPorPagina(Number(e.target.value)); setPaginaActual(1); }}
              >
                <option value={10}>10</option>
                <option value={25}>25</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
              <span>{t('entries')}</span>
            </div>

            <div className="flex flex-wrap gap-2">
              <button onClick={exportarCSV} className="border rounded px-3 py-1.5 text-xs font-bold text-gray-600 hover:bg-gray-50">Exportar a CSV</button>
              <button onClick={exportarExcel} className="border rounded px-3 py-1.5 text-xs font-bold text-gray-600 hover:bg-gray-50">{t('exportExcel')}</button>
              <button onClick={() => window.print()} className="border rounded px-3 py-1.5 text-xs font-bold text-gray-600 hover:bg-gray-50">{t('print')}</button>
              <div className="relative">
                <button onClick={() => setMostrarMenuColumnas(!mostrarMenuColumnas)} className="border rounded px-3 py-1.5 text-xs font-bold text-gray-600 hover:bg-gray-50">Visibilidad de columnas</button>
                {mostrarMenuColumnas && (
                  <div className="absolute right-0 mt-1 bg-white border rounded shadow-lg p-3 z-20 w-56">
                    {Object.entries({
                      empresa: 'Nombre de la Empresa', email: 'Email', documento: 'Documento N.',
                      limiteCredito: 'Limite de Credito', terminoPago: 'Termino de Pago',
                      saldoApertura: 'Saldo de Apertura', pagoRealizado: 'Pago Realizado',
                      añadido: 'Añadido', grupoClientes: 'Grupo de Clientes',
                      direccion: 'Dirección', celular: 'Celular',
                      ventaTotal: 'Venta Total', devolucionVencida: 'Total de Devolución de Venta Vencida',
                      creditosOtorgados: 'Creditos Otorgados',
                    }).map(([key, label]) => (
                      <label key={key} className="flex items-center gap-2 text-xs py-1 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={columnasVisibles[key]}
                          onChange={() => setColumnasVisibles((prev) => ({ ...prev, [key]: !prev[key] }))}
                        />
                        {label}
                      </label>
                    ))}
                  </div>
                )}
              </div>
              <button onClick={exportarPDF} className="border border-slate-200 rounded-lg px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50">{t('exportPdf')}</button>
            </div>

            <label className="relative block w-full sm:w-64">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden="true">⌕</span>
              <input type="search" className="w-full border border-slate-200 rounded-lg py-2 pl-9 pr-3 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 text-xs" placeholder={`${t('search')} clientes...`} value={busqueda} onChange={(e) => { setBusqueda(e.target.value); setPaginaActual(1); }} aria-label="Buscar clientes" />
            </label>
          </div>

          <div className="overflow-x-auto border border-slate-200 rounded-xl">
            <table className="w-full text-left text-xs border-collapse whitespace-nowrap">
              <thead>
                <tr className="bg-slate-50 text-slate-500 font-extrabold uppercase border-b border-slate-200 tracking-wide text-[10px]">
                  <th className="p-3">ACCION</th>
                  <th className="p-3">CODIGO CLIENTE</th>
                  {columnasVisibles.empresa && <th className="p-3">NOMBRE DE LA EMPRESA</th>}
                  <th className="p-3">NOMBRE</th>
                  {columnasVisibles.email && <th className="p-3">EMAIL</th>}
                  {columnasVisibles.documento && <th className="p-3">DOCUMENTO N.</th>}
                  {columnasVisibles.limiteCredito && <th className="p-3">LIMITE DE CREDITO</th>}
                  {columnasVisibles.terminoPago && <th className="p-3">TERMINO DE PAGO (CREDITO)</th>}
                  {columnasVisibles.saldoApertura && <th className="p-3 text-right">SALDO DE APERTURA</th>}
                  {columnasVisibles.pagoRealizado && <th className="p-3 text-right">PAGO REALIZADO</th>}
                  {columnasVisibles.añadido && <th className="p-3">AÑADIDO</th>}
                  {columnasVisibles.grupoClientes && <th className="p-3">GRUPO DE CLIENTES</th>}
                  {columnasVisibles.direccion && <th className="p-3">DIRECCIÓN</th>}
                  {columnasVisibles.celular && <th className="p-3">CELULAR</th>}
                  {columnasVisibles.ventaTotal && <th className="p-3 text-right">VENTA TOTAL</th>}
                  {columnasVisibles.devolucionVencida && <th className="p-3 text-right">TOTAL DE DEVOLUCIÓN DE VENTA VENCIDA</th>}
                  {columnasVisibles.creditosOtorgados && <th className="p-3 text-right">CREDITOS OTORGADOS</th>}
                </tr>
              </thead>
              <tbody>
                {clientesPagina.length === 0 ? (
                  <tr><td colSpan="17" className="text-center py-10 text-gray-400 font-medium text-sm">{t('noData')}</td></tr>
                ) : (
                  clientesPagina.map((cliente) => (
                    <tr key={cliente.id} className="border-b border-slate-100 hover:bg-blue-50/40 text-slate-700 transition-colors">
                      <td className="p-2 relative">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            if (menuAccionesAbierto === cliente.id) {
                              setMenuAccionesAbierto(null);
                            } else {
                              const rect = e.currentTarget.getBoundingClientRect();
                              const anchoMenu = 176; // w-44
                              const alturaEstimadaMenu = 320; // 8 ítems + un divisor
                              const espacioAbajo = window.innerHeight - rect.bottom;
                              const abrirHaciaArriba = espacioAbajo < alturaEstimadaMenu && rect.top > alturaEstimadaMenu;
                              const left = Math.min(rect.left, window.innerWidth - anchoMenu - 8);
                              const top = abrirHaciaArriba
                                ? Math.max(8, rect.top - alturaEstimadaMenu - 4)
                                : Math.min(rect.bottom + 4, window.innerHeight - 8);
                              setMenuAccionesPos({ top, left });
                              setMenuAccionesAbierto(cliente.id);
                            }
                          }}
                          className="bg-[#17a2b8] text-white px-2 py-1 rounded font-bold text-[10px]"
                        >
                          Acciones ▾
                        </button>
                        {menuAccionesAbierto === cliente.id && createPortal(
                          <>
                            {/* Fondo invisible para cerrar el menú al hacer clic afuera */}
                            <div className="fixed inset-0 z-[9998]" onClick={() => setMenuAccionesAbierto(null)} />
                            <div
                              className="fixed z-[9999] bg-white border rounded shadow-lg w-44 text-[11px] py-1"
                              style={{ top: menuAccionesPos.top, left: menuAccionesPos.left, maxHeight: 'calc(100vh - 16px)', overflowY: 'auto' }}
                            >
                              <button
                                onClick={() => { setMenuAccionesAbierto(null); abrirModalPagar(cliente); }}
                                className="w-full text-left px-3 py-2 hover:bg-gray-100 text-gray-700 flex items-center gap-2"
                              >
                                💳 Pagar
                              </button>
                              <button
                                onClick={() => { setMenuAccionesAbierto(null); setClienteVer(cliente); }}
                                className="w-full text-left px-3 py-2 hover:bg-gray-100 text-gray-700 flex items-center gap-2"
                              >
                                👁️ Ver
                              </button>
                              <button
                                onClick={() => { setMenuAccionesAbierto(null); abrirEdicionCliente(cliente); }}
                                className="w-full text-left px-3 py-2 hover:bg-gray-100 text-gray-700 flex items-center gap-2"
                              >
                                ✏️ Editar
                              </button>
                              <button
                                onClick={() => { setMenuAccionesAbierto(null); handleEliminarCliente(cliente); }}
                                className="w-full text-left px-3 py-2 hover:bg-gray-100 text-red-600 flex items-center gap-2"
                              >
                                🗑️ Borrar
                              </button>
                              <button
                                onClick={() => { setMenuAccionesAbierto(null); handleDesactivarCliente(cliente); }}
                                className="w-full text-left px-3 py-2 hover:bg-gray-100 text-gray-700 flex items-center gap-2"
                              >
                                ⏻ {cliente.estado === 'Inactivo' ? 'Activar' : 'Desactivar'}
                              </button>
                              <div className="border-t my-1" />
                              <button
                                onClick={() => {
                                  setMenuAccionesAbierto(null);
                                  setLibroMayorTab('libro');
                                  const hoy = new Date().toISOString().slice(0, 10);
                                  setLibroMayorDesde(hoy);
                                  setLibroMayorHasta(hoy);
                                  const anio = new Date().getFullYear();
                                  setVentasDesde(`${anio}-01-01`);
                                  setVentasHasta(`${anio}-12-31`);
                                  setVentasFiltroEstado('Todos');
                                  setVentasBusqueda('');
                                  setVentasPaginaActual(1);
                                  setLibroMayorUbicacion('Todas');
                                  setClienteLibroMayor(cliente);
                                }}
                                className="w-full text-left px-3 py-2 hover:bg-gray-100 text-gray-700 flex items-center gap-2"
                              >
                                📒 Libro mayor
                              </button>
                              <button
                                onClick={() => { setMenuAccionesAbierto(null); setClienteVentas(cliente); }}
                                className="w-full text-left px-3 py-2 hover:bg-gray-100 text-gray-700 flex items-center gap-2"
                              >
                                🧾 Ventas
                              </button>
                              <button
                                onClick={() => { abrirDocumentosNotas(cliente); }}
                                className="w-full text-left px-3 py-2 hover:bg-gray-100 text-gray-700 flex items-center gap-2"
                              >
                                📎 Documentos y notas
                              </button>
                            </div>
                          </>,
                          document.body
                        )}
                      </td>
                      <td className="p-3 font-mono">{cliente.codigo_cliente}</td>
                      {columnasVisibles.empresa && <td className="p-3">{cliente.nombre_empresa || '-'}</td>}
                      <td className="p-3 font-bold text-gray-800">
                        <div className="flex items-center gap-2">
                          {cliente.imagen_url ? (
                            <img src={cliente.imagen_url} alt={cliente.nombre} className="w-7 h-7 rounded-full object-cover flex-shrink-0" />
                          ) : (
                            <span className="w-7 h-7 rounded-full bg-orange-100 text-orange-600 text-[10px] font-bold flex items-center justify-center flex-shrink-0">
                              {(cliente.nombre || '?').charAt(0).toUpperCase()}
                            </span>
                          )}
                          {cliente.nombre}
                        </div>
                      </td>
                      {columnasVisibles.email && <td className="p-3">{cliente.email || '-'}</td>}
                      {columnasVisibles.documento && <td className="p-3">{cliente.documento_nro || '-'}</td>}
                      {columnasVisibles.limiteCredito && <td className="p-3">{cliente.limite_credito}</td>}
                      {columnasVisibles.terminoPago && <td className="p-3">{cliente.termino_pago || '-'}</td>}
                      {columnasVisibles.saldoApertura && <td className="p-3 text-right">{formatGs(cliente.saldo_apertura)}</td>}
                      {columnasVisibles.pagoRealizado && <td className="p-3 text-right font-bold text-gray-600">{formatGs(cliente.pagoRealizado)}</td>}
                      {columnasVisibles.añadido && <td className="p-3">{cliente.creado_en ? new Date(cliente.creado_en).toLocaleDateString('es-PY') : '-'}</td>}
                      {columnasVisibles.grupoClientes && <td className="p-3">{cliente.grupo_clientes || '-'}</td>}
                      {columnasVisibles.direccion && <td className="p-3">{cliente.direccion || '-'}</td>}
                      {columnasVisibles.celular && <td className="p-3">{cliente.celular || '-'}</td>}
                      {columnasVisibles.ventaTotal && <td className="p-3 text-right">{formatGs(cliente.totalFacturado)}</td>}
                      {columnasVisibles.devolucionVencida && <td className="p-3 text-right">{formatGs(cliente.devolucionVencida)}</td>}
                      {columnasVisibles.creditosOtorgados && <td className="p-3 text-right font-bold text-red-600">{formatGs(cliente.creditoOtorgado)}</td>}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap justify-between items-center gap-3 mt-4 text-xs text-gray-500 font-medium">
            <span>
              Mostrando {clientesFiltrados.length === 0 ? 0 : (paginaSegura - 1) * entradasPorPagina + 1} a{' '}
              {Math.min(paginaSegura * entradasPorPagina, clientesFiltrados.length)} de {clientesFiltrados.length} entradas
            </span>
            <div className="flex gap-1">
              <button
                disabled={paginaSegura <= 1}
                onClick={() => setPaginaActual(paginaSegura - 1)}
                className="border rounded px-3 py-1 font-bold hover:bg-gray-50 disabled:opacity-40"
              >
                Anterior
              </button>
              {Array.from({ length: totalPaginas }, (_, i) => i + 1)
                .filter((n) => n === 1 || n === totalPaginas || Math.abs(n - paginaSegura) <= 1)
                .reduce((acc, n, i, arr) => {
                  if (i > 0 && n - arr[i - 1] > 1) acc.push('...');
                  acc.push(n);
                  return acc;
                }, [])
                .map((n, i) =>
                  n === '...' ? (
                    <span key={`dots-${i}`} className="px-2 py-1">...</span>
                  ) : (
                    <button
                      key={n}
                      onClick={() => setPaginaActual(n)}
                      className={`border rounded px-3 py-1 font-bold ${n === paginaSegura ? 'bg-blue-600 text-white' : 'hover:bg-gray-50'}`}
                    >
                      {n}
                    </button>
                  )
                )}
              <button
                disabled={paginaSegura >= totalPaginas}
                onClick={() => setPaginaActual(paginaSegura + 1)}
                className="border rounded px-3 py-1 font-bold hover:bg-gray-50 disabled:opacity-40"
              >
                Siguiente
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ======================================================================= */}
      {/* MODAL AVANZADO DE APERTURA: CLON TOTAL PYpos                            */}
      {/* ======================================================================= */}
      {mostrarModalAñadir && (
        <div className="fixed inset-0 bg-slate-950/30 backdrop-blur-[2px] flex items-center justify-center z-[9999] p-4">
          <div className="bg-white w-full max-w-5xl rounded-2xl shadow-[0_0_0_1px_rgba(255,255,255,0.06),0_30px_90px_rgba(15,23,42,0.42)] overflow-hidden flex flex-col max-h-[95vh] ring-1 ring-slate-200/70">

            <div className="px-6 py-5 border-b flex justify-between items-center bg-gradient-to-r from-[#1f2937] via-[#1d2434] to-[#111827] text-white">
              <h3 className="text-xl font-bold flex items-center gap-3">
                <span className="text-2xl">👤</span> 
                <span>{clienteEditando ? 'EDITAR CLIENTE' : 'NUEVO CLIENTE'}</span>
              </h3>
              <button onClick={() => { setMostrarModalAñadir(false); setClienteEditando(null); }} className="text-white/60 hover:text-white text-3xl font-bold transition-colors hover:bg-white/10 w-8 h-8 rounded flex items-center justify-center">×</button>
            </div>

            <div className="p-6 overflow-y-auto bg-gradient-to-b from-[#f8fafc] via-[#f5f7fa] to-[#f1f3f7] flex-1 text-xs">
              <form id="form-cliente" onSubmit={guardarCliente}>

                {/* SELECTORES DE CABECERA */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6 items-end">
                  <div>
                    <label className="block font-bold text-gray-700 uppercase mb-2 text-xs">TIPO DE CONTACTO *</label>
                    <select className="w-full border border-gray-300 rounded-lg p-3 bg-white outline-none focus:border-[#f59e0b] focus:ring-2 focus:ring-[#f59e0b]/30 transition-all shadow-sm">
                      <option value="Clientes">Clientes</option>
                      <option value="Proveedores">Proveedores</option>
                      <option value="Ambos">Ambos (Proveedor y Cliente)</option>
                    </select>
                  </div>

                  <div className="flex border border-gray-300 rounded-lg overflow-hidden shadow-sm h-[42px] bg-white">
                    <button type="button" onClick={() => setEsEmpresa(false)} className={`flex-1 font-bold flex items-center justify-center gap-2 transition-all ${!esEmpresa ? 'bg-gradient-to-r from-[#fbbf24] to-[#f59e0b] text-white shadow-md' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>
                      <span>👤</span> Individual
                    </button>
                    <button type="button" onClick={() => setEsEmpresa(true)} className={`flex-1 font-bold flex items-center justify-center gap-2 transition-all ${esEmpresa ? 'bg-gradient-to-r from-[#fbbf24] to-[#f59e0b] text-white shadow-md' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>
                      <span>🏢</span> Empresa
                    </button>
                  </div>

                  <div>
                    <label className="block font-bold text-gray-700 uppercase mb-2 text-xs">CÓDIGO</label>
                    <input type="text" className="w-full border border-gray-300 rounded-lg p-3 bg-gray-100 outline-none text-gray-600" placeholder="Automático" value={codigo} onChange={(e) => setCodigo(e.target.value)} disabled />
                  </div>
                </div>

                {/* CAJA DE REGISTRO FISCAL */}
                <div className="border border-blue-200 bg-gradient-to-br from-blue-50/60 to-blue-50/30 p-4 rounded-xl mb-6 shadow-sm">
                  <h4 className="text-[#004284] font-bold mb-3 flex items-center gap-2">🔍 BUSCAR O REGISTRAR CONTACTO</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block font-bold text-[#004284] uppercase mb-2 text-xs">TIPO DOC.</label>
                      <select className="w-full border border-blue-300 rounded-lg p-3 bg-white focus:border-[#f59e0b] focus:ring-2 focus:ring-[#f59e0b]/30 outline-none transition-all" value={tipoDoc} onChange={(e) => manejarCambioTipoDoc(e.target.value)}>
                        <option value="RUC">RUC</option>
                        <option value="CÉDULA DE IDENTIDAD">CÉDULA DE IDENTIDAD</option>
                        <option value="PASAPORTE">PASAPORTE</option>
                      </select>
                    </div>
                    <div>
                      <label className="block font-bold text-[#004284] uppercase mb-2 text-xs">NRO. DOCUMENTO *</label>
                      <div className="flex gap-2">
                        <input type="text" className="w-full border border-blue-300 rounded-lg p-3 bg-white outline-none focus:border-[#f59e0b] focus:ring-2 focus:ring-[#f59e0b]/30 transition-all" placeholder="Ej: 4671379-4" required value={nroDoc} onChange={(e) => setNroDoc(e.target.value)} />
                        <button
                          type="button"
                          onClick={buscarRuc}
                          disabled={cargandoRuc}
                          title="Buscar RUC"
                          className="bg-gradient-to-r from-[#f59e0b] to-[#f97316] hover:from-[#ea8c13] hover:to-[#f07c00] disabled:from-gray-400 disabled:to-gray-500 text-white rounded-lg w-12 h-12 flex items-center justify-center shrink-0 shadow-md transition-all font-bold"
                        >
                          {cargandoRuc ? (
                            <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                            </svg>
                          ) : (
                            "🔍"
                          )}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                {/* 1. ACORDEÓN: IDENTIFICACIÓN (DINÁMICO INDIVIDUAL / EMPRESA) */}
                <div className="bg-white border border-gray-200 rounded-xl mb-3 overflow-hidden shadow-sm hover:shadow-md transition-shadow">
                  <div className="p-4 bg-gradient-to-r from-blue-50 to-blue-100 flex justify-between items-center cursor-pointer border-b hover:from-blue-100 hover:to-blue-150 transition-colors" onClick={() => setAcordeonIdentificacion(!acordeonIdentificacion)}>
                    <h4 className="font-bold text-blue-700 flex items-center gap-2">ℹ️ Identificación</h4>
                    <span className={`text-blue-400 font-bold transition-transform ${acordeonIdentificacion ? 'rotate-180' : ''}`}>▼</span>
                  </div>

                  {acordeonIdentificacion && (
                    <div className="p-5 bg-gradient-to-br from-blue-50/30 to-white">
                      {esEmpresa ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 animate-fade-in">
                          <div>
                            <label className="block font-bold text-gray-700 uppercase mb-2 text-xs">RAZÓN SOCIAL / NOMBRE COMERCIAL *</label>
                            <input type="text" className="w-full border border-gray-300 rounded-lg p-3 bg-white outline-none focus:border-[#f59e0b] focus:ring-2 focus:ring-[#f59e0b]/30 transition-all" placeholder="Nombre de la Empresa / Razón Social" required={esEmpresa} value={nombreEmpresa} onChange={(e) => setNombreEmpresa(e.target.value)} />
                          </div>
                          <div>
                            <label className="block font-bold text-gray-700 uppercase mb-2 text-xs">REPRESENTANTE LEGAL</label>
                            <input type="text" className="w-full border border-gray-300 rounded-lg p-3 bg-white outline-none focus:border-[#f59e0b] focus:ring-2 focus:ring-[#f59e0b]/30 transition-all" placeholder="Nombre del Representante" value={representanteLegal} onChange={(e) => setRepresentanteLegal(e.target.value)} />
                          </div>
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 animate-fade-in">
                          <div>
                            <label className="block font-bold text-gray-700 uppercase mb-2 text-xs">PREFIJO</label>
                            <input type="text" className="w-full border border-gray-300 rounded-lg p-3 bg-white outline-none focus:border-[#f59e0b] focus:ring-2 focus:ring-[#f59e0b]/30 transition-all" placeholder="—" value={prefijo} onChange={(e) => setPrefijo(e.target.value)} />
                          </div>
                          <div>
                            <label className="block font-bold text-gray-700 uppercase mb-2 text-xs">NOMBRE *</label>
                            <input type="text" className="w-full border border-gray-300 rounded-lg p-3 bg-white outline-none focus:border-[#f59e0b] focus:ring-2 focus:ring-[#f59e0b]/30 transition-all" placeholder="Nombre" required={!esEmpresa} value={nombre} onChange={(e) => setNombre(e.target.value)} />
                          </div>
                          <div>
                            <label className="block font-bold text-gray-700 uppercase mb-2 text-xs">SEGUNDO NOMBRE</label>
                            <input type="text" className="w-full border border-gray-300 rounded-lg p-3 bg-white outline-none focus:border-[#f59e0b] focus:ring-2 focus:ring-[#f59e0b]/30 transition-all" placeholder="Segundo nombre" value={segundoNombre} onChange={(e) => setSegundoNombre(e.target.value)} />
                          </div>
                          <div>
                            <label className="block font-bold text-gray-700 uppercase mb-2 text-xs">APELLIDO *</label>
                            <input type="text" className="w-full border border-gray-300 rounded-lg p-3 bg-white outline-none focus:border-[#f59e0b] focus:ring-2 focus:ring-[#f59e0b]/30 transition-all" placeholder="Apellido" required={!esEmpresa} value={apellido} onChange={(e) => setApellido(e.target.value)} />
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* ACORDEONES: FOTO Y DOCUMENTOS */}
                <div className="bg-white border border-gray-200 rounded-xl mb-3 overflow-hidden shadow-sm hover:shadow-md transition-shadow">
                  <div className="p-4 bg-gradient-to-r from-gray-50 to-gray-100 flex justify-between items-center cursor-pointer border-b hover:from-gray-100 hover:to-gray-150 transition-colors" onClick={() => setAcordeonFoto(!acordeonFoto)}>
                    <h4 className="font-bold text-gray-700 flex items-center gap-2"><span>📷</span> Foto del Cliente</h4>
                    <span className={`text-gray-400 font-bold transition-transform ${acordeonFoto ? 'rotate-180' : ''}`}>▼</span>
                  </div>
                  {acordeonFoto && (
                    <div className="p-5 bg-gradient-to-br from-gray-50/50 to-white">
                      <div className="flex flex-col items-center gap-4">
                        <div className="w-28 h-28 rounded-full bg-gradient-to-br from-gray-100 to-gray-200 border-2 border-gray-300 flex items-center justify-center overflow-hidden shadow-md">
                          {imagenClientePreview ? (
                            <img src={imagenClientePreview} alt="preview" className="w-full h-full object-cover" />
                          ) : (
                            <span className="text-5xl">👤</span>
                          )}
                        </div>

                        <div className="flex gap-2 flex-wrap justify-center">
                          <label className={`border border-gray-300 rounded-lg px-4 py-2 text-xs font-bold text-gray-700 cursor-pointer hover:bg-orange-50 hover:border-[#f59e0b] flex items-center gap-2 transition-all ${subiendoImagenCliente ? 'opacity-60 pointer-events-none' : ''}`}>
                            ⬆️ {subiendoImagenCliente ? 'Subiendo...' : 'Subir archivo'}
                            <input type="file" accept="image/jpeg,image/png" className="hidden" onChange={manejarImagenCliente} disabled={subiendoImagenCliente} />
                          </label>
                          <button type="button" onClick={abrirCamaraCliente} className="border border-gray-300 rounded-lg px-4 py-2 text-xs font-bold text-gray-700 hover:bg-blue-50 hover:border-blue-400 flex items-center gap-2 transition-all" disabled={subiendoImagenCliente}>
                            📷 Cámara Web
                          </button>
                          {imagenClientePreview && (
                            <button type="button" onClick={() => setImagenClientePreview(null)} className="bg-gray-200 hover:bg-red-200 text-gray-600 hover:text-red-600 text-xs font-bold px-4 py-2 rounded-lg transition-all">
                              ✕ Quitar
                            </button>
                          )}
                        </div>

                        <label className="w-full max-w-xs border-2 border-dashed border-gray-300 rounded-lg py-6 text-center cursor-pointer hover:border-[#f59e0b] hover:bg-orange-50/40 transition-all duration-200">
                          <span className="text-xs font-bold text-gray-500">🖼️ Seleccionar imagen</span>
                          <input type="file" accept="image/jpeg,image/png" className="hidden" onChange={manejarImagenCliente} disabled={subiendoImagenCliente} />
                        </label>
                        <p className="text-[10px] text-gray-400">JPG o PNG, máx 5MB</p>
                      </div>

                      {/* Modal de cámara web */}
                      {camaraClienteAbierta && (
                        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[10000] p-4 backdrop-blur-sm">
                          <div className="bg-white rounded-2xl shadow-2xl p-5 flex flex-col items-center gap-4 max-w-sm w-full">
                            <h4 className="font-bold text-gray-800">Captura desde cámara web</h4>
                            <video ref={videoClienteRef} autoPlay playsInline className="w-full rounded-xl bg-black" />
                            <canvas ref={canvasClienteRef} className="hidden" />
                            <div className="flex gap-2 w-full">
                              <button type="button" onClick={capturarFotoCliente} className="flex-1 bg-gradient-to-r from-[#f59e0b] to-[#f97316] hover:from-[#ea8c13] hover:to-[#f07c00] text-white font-bold py-2 rounded-lg text-sm shadow-md transition-all">📸 Capturar</button>
                              <button type="button" onClick={cerrarCamaraCliente} className="flex-1 border border-gray-300 text-gray-600 font-bold py-2 rounded-lg text-sm hover:bg-gray-50 transition-all">Cancelar</button>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <div className="bg-white border border-gray-200 rounded-xl mb-3 overflow-hidden shadow-sm hover:shadow-md transition-shadow">
                  <div className="p-4 bg-gradient-to-r from-gray-50 to-gray-100 flex justify-between items-center cursor-pointer border-b hover:from-gray-100 hover:to-gray-150 transition-colors" onClick={() => setAcordeonDocumentos(!acordeonDocumentos)}>
                    <h4 className="font-bold text-gray-700 flex items-center gap-2"><span>📎</span> Cargar Documentos <span className="text-[9px] font-normal text-gray-500">(CI, contratos, etc.)</span></h4>
                    <span className={`text-gray-400 font-bold transition-transform ${acordeonDocumentos ? 'rotate-180' : ''}`}>▼</span>
                  </div>
                  {acordeonDocumentos && (
                    <div className="p-5 bg-gray-50 text-gray-500 italic text-sm">La carga de documentos todavía no está conectada — próximamente.</div>
                  )}
                </div>

                {/* 2. ACORDEÓN: CONTACTO */}
                <div className="bg-white border border-gray-200 rounded-xl mb-3 overflow-hidden shadow-sm hover:shadow-md transition-shadow">
                  <div className="p-4 bg-gradient-to-r from-green-50 to-green-100 flex justify-between items-center cursor-pointer border-b hover:from-green-100 hover:to-green-150 transition-colors" onClick={() => setAcordeonContacto(!acordeonContacto)}>
                    <h4 className="font-bold text-green-700 flex items-center gap-2">📞 Contacto</h4>
                    <span className={`text-green-400 font-bold transition-transform ${acordeonContacto ? 'rotate-180' : ''}`}>▼</span>
                  </div>
                  {acordeonContacto && (
                    <div className="p-5 bg-gradient-to-br from-green-50/30 to-white grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div>
                        <label className="block font-bold text-gray-700 uppercase mb-2 text-xs">TELÉFONO</label>
                        <input type="text" className="w-full border border-gray-300 rounded-lg p-3 bg-white outline-none focus:border-[#f59e0b] focus:ring-2 focus:ring-[#f59e0b]/30 transition-all" placeholder="Celular / Teléfono" value={telefono} onChange={(e) => setTelefono(e.target.value)} />
                      </div>
                      <div>
                        <label className="block font-bold text-gray-700 uppercase mb-2 text-xs">EMAIL</label>
                        <input type="email" className="w-full border border-gray-300 rounded-lg p-3 bg-white outline-none focus:border-[#f59e0b] focus:ring-2 focus:ring-[#f59e0b]/30 transition-all" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
                      </div>
                      <div>
                        <label className="block font-bold text-gray-700 uppercase mb-2 text-xs">FECHA NACIMIENTO</label>
                        <input type="date" className="w-full border border-gray-300 rounded-lg p-3 bg-white outline-none focus:border-[#f59e0b] focus:ring-2 focus:ring-[#f59e0b]/30 transition-all" value={fechaNacimiento} onChange={(e) => setFechaNacimiento(e.target.value)} />
                      </div>
                    </div>
                  )}
                </div>

                {/* 3. ACORDEÓN: UBICACIÓN Y DATOS FISCALES */}
                <div className="bg-white border border-gray-200 rounded-xl mb-3 overflow-hidden shadow-sm hover:shadow-md transition-shadow">
                  <div className="p-4 bg-gradient-to-r from-red-50 to-red-100 flex justify-between items-center cursor-pointer border-b hover:from-red-100 hover:to-red-150 transition-colors" onClick={() => setAcordeonUbicacion(!acordeonUbicacion)}>
                    <h4 className="font-bold text-red-700 flex items-center gap-2">📍 Ubicación y Datos Fiscales</h4>
                    <span className={`text-red-400 font-bold transition-transform ${acordeonUbicacion ? 'rotate-180' : ''}`}>▼</span>
                  </div>
                  {acordeonUbicacion && (
                    <div className="p-5 bg-gradient-to-br from-red-50/30 to-white grid grid-cols-1 md:grid-cols-4 gap-4 animate-fade-in">
                      <div>
                        <label className="block font-bold text-gray-700 uppercase mb-2 text-xs">PAÍS</label>
                        <select className="w-full border border-gray-300 rounded-lg p-3 bg-white focus:border-[#f59e0b] focus:ring-2 focus:ring-[#f59e0b]/30 outline-none transition-all" value={pais} onChange={(e) => setPais(e.target.value)}>
                          <option value="Paraguay">Paraguay</option>
                          <option value="Brasil">Brasil</option>
                          <option value="Argentina">Argentina</option>
                        </select>
                      </div>
                      <div>
                        <label className="block font-bold text-gray-700 uppercase mb-2 text-xs">DEPARTAMENTO</label>
                        <select className="w-full border border-gray-300 rounded-lg p-3 bg-white focus:border-[#f59e0b] focus:ring-2 focus:ring-[#f59e0b]/30 outline-none transition-all" value={departamento} onChange={(e) => setDepartamento(e.target.value)}>
                          <option value="-- Depto --">-- Depto --</option>
                          <option value="ALTO PARANA">ALTO PARANA</option>
                          <option value="CENTRAL">CENTRAL</option>
                          <option value="ITAPUA">ITAPUA</option>
                          <option value="CAPITAL">CAPITAL</option>
                        </select>
                      </div>
                      <div>
                        <label className="block font-bold text-gray-700 uppercase mb-2 text-xs">CIUDAD</label>
                        <input type="text" className="w-full border border-gray-300 rounded-lg p-3 bg-white outline-none focus:border-[#f59e0b] focus:ring-2 focus:ring-[#f59e0b]/30 transition-all" placeholder="Ciudad" value={ciudad} onChange={(e) => setCiudad(e.target.value)} />
                      </div>
                      <div>
                        <label className="block font-bold text-gray-700 uppercase mb-2 text-xs">CÓD. POSTAL</label>
                        <input type="text" className="w-full border border-gray-300 rounded-lg p-3 bg-white outline-none focus:border-[#f59e0b] focus:ring-2 focus:ring-[#f59e0b]/30 transition-all" value={codPostal} onChange={(e) => setCodPostal(e.target.value)} />
                      </div>
                      <div className="md:col-span-2">
                        <label className="block font-bold text-gray-700 uppercase mb-2 text-xs">DIRECCIÓN (CALLE / BARRIO / AV)</label>
                        <input type="text" className="w-full border border-gray-300 rounded-lg p-3 bg-white outline-none focus:border-[#f59e0b] focus:ring-2 focus:ring-[#f59e0b]/30 transition-all" placeholder="Calle / Barrio / Av / Referencia" value={direccionCalle} onChange={(e) => setDireccionCalle(e.target.value)} />
                      </div>
                      <div>
                        <label className="block font-bold text-gray-700 uppercase mb-2 text-xs">NRO. CASA</label>
                        <input type="text" className="w-full border border-gray-300 rounded-lg p-3 bg-white outline-none focus:border-[#f59e0b] focus:ring-2 focus:ring-[#f59e0b]/30 transition-all" placeholder="Ej: 123" value={nroCasa} onChange={(e) => setNroCasa(e.target.value)} />
                      </div>
                      <div>
                        <label className="block font-bold text-gray-700 uppercase mb-2 text-xs">EDIFICIO / PISO / DPTO</label>
                        <input type="text" className="w-full border border-gray-300 rounded-lg p-3 bg-white outline-none focus:border-[#f59e0b] focus:ring-2 focus:ring-[#f59e0b]/30 transition-all" placeholder="Opcional" value={edificioPiso} onChange={(e) => setEdificioPiso(e.target.value)} />
                      </div>
                    </div>
                  )}
                </div>

                {/* 4. ACORDEÓN: CRÉDITO Y CONDICIONES */}
                <div className="bg-white border border-gray-200 rounded-xl mb-3 overflow-hidden shadow-sm hover:shadow-md transition-shadow">
                  <div className="p-4 bg-gradient-to-r from-purple-50 to-purple-100 flex justify-between items-center cursor-pointer border-b hover:from-purple-100 hover:to-purple-150 transition-colors" onClick={() => setAcordeonCredito(!acordeonCredito)}>
                    <h4 className="font-bold text-purple-700 flex items-center gap-2">💳 Crédito y Condiciones</h4>
                    <span className={`text-purple-400 font-bold transition-transform ${acordeonCredito ? 'rotate-180' : ''}`}>▼</span>
                  </div>
                  {acordeonCredito && (
                    <div className="p-5 bg-gradient-to-br from-purple-50/30 to-white grid grid-cols-1 md:grid-cols-4 gap-4 animate-fade-in">
                      <div>
                        <label className="block font-bold text-gray-700 uppercase mb-2 text-xs">VENDEDOR ASIGNADO</label>
                        <select className="w-full border border-gray-300 rounded-lg p-3 bg-white focus:border-[#f59e0b] focus:ring-2 focus:ring-[#f59e0b]/30 outline-none transition-all" value={vendedorAsignado} onChange={(e) => setVendedorAsignado(e.target.value)}>
                          <option value={nombreDelNegocio}>{nombreDelNegocio}</option>
                          <option value="Richard Richard">Richard Richard</option>
                          <option value="Fabian">Fabian</option>
                        </select>
                      </div>
                      <div>
                        <label className="block font-bold text-gray-700 uppercase mb-2 text-xs">GRUPO DE CLIENTES</label>
                        <select className="w-full border border-gray-300 rounded-lg p-3 bg-white focus:border-[#f59e0b] focus:ring-2 focus:ring-[#f59e0b]/30 outline-none transition-all" value={grupoClientes} onChange={(e) => setGrupoClientes(e.target.value)}>
                          <option value="Ninguna">Ninguna</option>
                          <option value="Cliente Vip">Cliente Vip</option>
                          <option value="Regular">Regular</option>
                        </select>
                      </div>
                      <div>
                        <label className="block font-bold text-gray-700 uppercase mb-2 text-xs">SALDO INICIAL</label>
                        <input type="number" className="w-full border border-gray-300 rounded-lg p-3 bg-white outline-none focus:border-[#f59e0b] focus:ring-2 focus:ring-[#f59e0b]/30 transition-all" value={saldoInicial} onChange={(e) => setSaldoInicial(e.target.value)} />
                      </div>
                      <div>
                        <label className="block font-bold text-gray-700 uppercase mb-2 text-xs">LÍMITE DE CRÉDITO</label>
                        <input type="number" className="w-full border border-gray-300 rounded-lg p-3 bg-white outline-none focus:border-[#f59e0b] focus:ring-2 focus:ring-[#f59e0b]/30 transition-all" value={limiteCredito} onChange={(e) => setLimiteCredito(e.target.value)} />
                        <span className="text-[9px] text-gray-500 block mt-1">Dejar en 0 para "Sin límite"</span>
                      </div>
                      <div className="md:col-span-2">
                        <label className="block font-bold text-gray-700 uppercase mb-2 text-xs">TÉRMINO DE PAGO</label>
                        <div className="flex gap-2">
                          <input type="number" className="w-1/2 border border-gray-300 rounded-lg p-3 bg-white outline-none focus:border-[#f59e0b] focus:ring-2 focus:ring-[#f59e0b]/30 transition-all" placeholder="N°" value={terminoPagoNum} onChange={(e) => setTerminoPagoNum(e.target.value)} />
                          <select className="w-1/2 border border-gray-300 rounded-lg p-3 bg-white focus:border-[#f59e0b] focus:ring-2 focus:ring-[#f59e0b]/30 outline-none transition-all" value={terminoPagoTipo} onChange={(e) => setTerminoPagoTipo(e.target.value)}>
                            <option value="Dias">Días</option>
                            <option value="Meses">Meses</option>
                          </select>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

              </form>
            </div>

            {/* BOTONES INFERIORES */}
            <div className="px-6 py-4 border-t bg-gradient-to-r from-[#f8fafc] via-[#f5f7fa] to-[#f1f3f7] flex justify-end items-center gap-3">
              <button type="button" onClick={() => { setMostrarModalAñadir(false); setClienteEditando(null); }} className="border border-gray-300 text-gray-700 px-6 py-2.5 rounded-lg font-bold hover:bg-gray-100 transition-all shadow-sm">
                Cancelar
              </button>
              <button type="submit" form="form-cliente" className="bg-gradient-to-r from-[#f59e0b] to-[#f97316] hover:from-[#ea8c13] hover:to-[#f07c00] text-white px-8 py-2.5 rounded-lg font-bold shadow-md hover:shadow-lg transition-all flex items-center gap-2">
                <span>💾</span> Guardar Cliente
              </button>
            </div>

          </div>
        </div>
      )}

      {/* MODAL: Pagar (clon de "Monto total pagado o pago parcial") */}
      {clientePagar && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[9999] p-4" onClick={() => !guardandoPago && setClientePagar(null)}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden max-h-[95vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="bg-gradient-to-r from-[#6f5ff0] to-[#5b4fcf] px-6 py-5 flex justify-between items-center">
              <h3 className="text-white font-bold text-lg">Monto total pagado o pago parcial</h3>
              <button onClick={() => setClientePagar(null)} className="text-white/80 hover:text-white text-xl leading-none">✕</button>
            </div>

            <div className="p-6 overflow-y-auto flex flex-col gap-4 text-sm">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="bg-gray-50 border border-gray-100 rounded-lg p-3">
                  <p className="font-bold text-gray-700">Nombre del cliente: <span className="font-normal">{clientePagar.nombre}</span></p>
                </div>
                <div className="bg-gray-50 border border-gray-100 rounded-lg p-3 text-xs leading-relaxed">
                  <p><span className="font-bold text-gray-700">Venta total:</span> {formatGs(clientePagar.totalFacturado)}</p>
                  <p><span className="font-bold text-gray-700">Total pagado:</span> {formatGs(clientePagar.pagoRealizado)}</p>
                  <p><span className="font-bold text-gray-700">Venta total debida:</span> {formatGs(clientePagar.creditoOtorgado)}</p>
                  <p><span className="font-bold text-gray-700">Crédito a favor:</span> {formatGs(clientePagar.creditoAFavor)}</p>
                  <p><span className="font-bold text-gray-700">Saldo inicial pendiente:</span> {formatGs(clientePagar.saldo_apertura)}</p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">Método de pago:*</label>
                  <select className="w-full border border-gray-300 rounded p-2.5 text-sm bg-white" value={metodoPago} onChange={(e) => setMetodoPago(e.target.value)}>
                    <option>Efectivo</option>
                    <option>Transferencia</option>
                    <option>Tarjeta</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">Pagado el:*</label>
                  <input type="date" className="w-full border border-gray-300 rounded p-2.5 text-sm" value={fechaPago} onChange={(e) => setFechaPago(e.target.value)} />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">Cantidad:*</label>
                  <input autoFocus type="number" className="w-full border border-gray-300 rounded p-2.5 text-sm" value={montoPago} onChange={(e) => setMontoPago(e.target.value)} placeholder="0" />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">Documento adjunto:</label>
                  <div className="flex items-center gap-2">
                    <label className="border border-gray-300 rounded px-3 py-2 text-xs font-bold text-gray-600 cursor-pointer hover:bg-gray-50">
                      Seleccionar archivo
                      <input type="file" className="hidden" accept=".pdf,.csv,.zip,.doc,.docx,.jpeg,.jpg,.png,.p12" onChange={manejarDocumentoPago} />
                    </label>
                    <span className="text-xs text-gray-500 truncate">{subiendoDocumento ? 'Subiendo...' : (nombreDocumentoPago || 'Ningún archivo seleccionado')}</span>
                  </div>
                  <p className="text-[10px] text-gray-400 mt-1">Archivo permitido: .pdf, .csv, .zip, .doc, .docx, .jpeg, .jpg, .png, .p12</p>
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">Cuenta de pago:</label>
                  <select className="w-full border border-gray-300 rounded p-2.5 text-sm bg-white" value={cuentaPago} onChange={(e) => setCuentaPago(e.target.value)}>
                    <option value="Ninguna">Ninguna</option>
                    {cajasDisponibles.map((caja) => (
                      <option key={caja.id} value={caja.id}>
                        {caja.nombre} (Saldo: {Number(caja.saldo || 0).toLocaleString('es-PY')} {caja.moneda === 'Guarani (Gs)' ? 'Gs' : caja.moneda})
                      </option>
                    ))}
                  </select>
                  {cajasDisponibles.length === 0 && (
                    <p className="text-[10px] text-gray-400 mt-1">Todavía no tenés cuentas cargadas en Caja/Banco. Registrá una desde el menú "Caja / Banco → Lista de cajas".</p>
                  )}
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">Nota de pago:</label>
                <textarea className="w-full border border-gray-300 rounded p-2.5 text-sm" rows={3} value={notaPago} onChange={(e) => setNotaPago(e.target.value)} />
              </div>
            </div>

            <div className="px-6 py-4 border-t bg-gray-50 flex justify-end gap-3">
              <button type="button" disabled={guardandoPago || subiendoDocumento} onClick={confirmarPago} className="bg-orange-500 hover:bg-orange-600 text-white font-bold text-sm px-6 py-2 rounded disabled:opacity-60">
                {guardandoPago ? 'Guardando...' : 'Guardar'}
              </button>
              <button type="button" disabled={guardandoPago} onClick={() => setClientePagar(null)} className="bg-white border text-gray-600 font-bold text-sm px-6 py-2 rounded hover:bg-gray-100">Cerrar</button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Ver */}
      {clienteVer && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[9999] p-4" onClick={() => setClienteVer(null)}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="bg-[#004284] px-5 py-4 flex justify-between items-center">
              <h3 className="text-white font-bold text-lg">Ficha del cliente</h3>
              <button onClick={() => setClienteVer(null)} className="text-white/80 hover:text-white text-xl leading-none">✕</button>
            </div>
            <div className="p-6 overflow-y-auto flex flex-col gap-2 text-sm">
              <p><span className="font-bold text-gray-600">Código:</span> {clienteVer.codigo_cliente}</p>
              <p><span className="font-bold text-gray-600">Nombre:</span> {clienteVer.nombre}</p>
              {clienteVer.nombre_empresa && <p><span className="font-bold text-gray-600">Empresa:</span> {clienteVer.nombre_empresa}</p>}
              <p><span className="font-bold text-gray-600">Documento:</span> {clienteVer.tipo_documento} {clienteVer.documento_nro || '—'}</p>
              <p><span className="font-bold text-gray-600">Email:</span> {clienteVer.email || '—'}</p>
              <p><span className="font-bold text-gray-600">Celular:</span> {clienteVer.celular || '—'}</p>
              <p><span className="font-bold text-gray-600">Dirección:</span> {clienteVer.direccion || '—'}</p>
              <p><span className="font-bold text-gray-600">Grupo:</span> {clienteVer.grupo_clientes || '—'}</p>
              <p><span className="font-bold text-gray-600">Estado:</span> {clienteVer.estado || 'Activo'}</p>
              <p><span className="font-bold text-gray-600">Límite de crédito:</span> {clienteVer.limite_credito}</p>
              <p><span className="font-bold text-gray-600">Término de pago:</span> {clienteVer.termino_pago || '—'}</p>
              <p><span className="font-bold text-gray-600">Pago realizado:</span> {formatGs(clienteVer.pagoRealizado)}</p>
              <p><span className="font-bold text-gray-600">Debe actualmente:</span> {formatGs(clienteVer.creditoOtorgado)}</p>
              {clienteVer.notas && <p><span className="font-bold text-gray-600">Notas:</span> {clienteVer.notas}</p>}
            </div>
          </div>
        </div>
      )}

      {/* PANTALLA COMPLETA: Libro mayor (clon de la vista "Ver contacto" de CDEpos) */}
      {clienteLibroMayor && (() => {
        const cliente = clienteLibroMayor;
        const iniciales = (cliente.nombre || '?').trim().split(/\s+/).slice(0, 2).map((p) => p[0]).join('').toUpperCase();
        const estadoNormalizado = (estado) => String(estado || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
        const ventaEstaAnulada = (venta) => ['anulada', 'anulado', 'devuelta', 'devolucion'].includes(estadoNormalizado(venta.estado_pago));
        const ventasLibroMayor = cliente.ventasDelCliente.filter((venta) => !ventaEstaAnulada(venta));
        const pagosAplicadosPorVenta = new Map();
        cliente.aplicacionesCliente.forEach((aplicacion) => {
          pagosAplicadosPorVenta.set(
            aplicacion.venta_id,
            (pagosAplicadosPorVenta.get(aplicacion.venta_id) || 0) + (Number(aplicacion.monto_aplicado) || 0)
          );
        });

        // Las ventas anuladas no crean deuda. Los pagos aplicados se descuentan
        // del pago inicial para no volver a contabilizarlos en la fecha de venta.
        const movimientos = [
          ...ventasLibroMayor.flatMap((v) => {
            const base = {
              fecha: v.fecha,
              referencia: v.id ? String(v.id).slice(-4) : '—',
              ubicacionId: v.ubicacion_id || null,
              ubicacion: (v.ubicacion_id && ubicacionesMap[v.ubicacion_id]) || nombreDelNegocio || '—',
              estadoPago: v.estado_pago || '—',
              metodoPago: v.metodo_pago || '—',
            };
            const totalPagadoActual = Math.max(0, Number(v.montoPagadoActual ?? ((Number(v.total) || 0) - (Number(v.saldoActual) || 0))) || 0);
            const pagoInicial = Math.max(0, totalPagadoActual - (pagosAplicadosPorVenta.get(v.id) || 0));
            return [
              { ...base, tipo: 'Ventas', debito: Number(v.total) || 0, credito: 0 },
              ...(pagoInicial > 0 ? [{ ...base, tipo: 'Pago inicial', debito: 0, credito: pagoInicial }] : []),
            ];
          }),
          ...cliente.pagosManuales.map((p) => ({
            fecha: p.fecha,
            referencia: p.id ? `SP${new Date(p.fecha || Date.now()).getFullYear()}/${String(p.id).slice(-4)}` : '—',
            tipo: 'Pago',
            ubicacionId: null,
            ubicacion: nombreDelNegocio || '—',
            estadoPago: '—',
            debito: 0,
            credito: Number(p.monto) || 0,
            pagadoInicial: 0,
            metodoPago: p.metodo_pago || '—',
          })),
        ].sort((a, b) => {
          const porFecha = new Date(a.fecha || 0) - new Date(b.fecha || 0);
          if (porFecha) return porFecha;
          const orden = { Ventas: 0, 'Pago inicial': 1, Pago: 2 };
          return (orden[a.tipo] ?? 3) - (orden[b.tipo] ?? 3);
        });

        const fechaLocal = (fecha) => {
          if (!fecha) return '';
          const d = new Date(fecha);
          return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        };
        const saldoApertura = Number(cliente.saldo_apertura) || 0;

        const movimientosPorUbicacion = movimientos.filter((m) => (
          libroMayorUbicacion === 'Todas'
          || m.tipo === 'Pago'
          || m.ubicacionId === libroMayorUbicacion
        ));

        const movimientosAntesDelRango = movimientosPorUbicacion.filter((m) => {
          if (!m.fecha || !libroMayorDesde) return false;
          return fechaLocal(m.fecha) < libroMayorDesde;
        });

        const saldoInicialRango = movimientosAntesDelRango.reduce(
          (saldo, m) => saldo + m.debito - m.credito,
          saldoApertura
        );

        const movimientosFiltrados = movimientosPorUbicacion.filter((m) => {
          if (!m.fecha) return true;
          const f = fechaLocal(m.fecha);
          if (libroMayorDesde && f < libroMayorDesde) return false;
          if (libroMayorHasta && f > libroMayorHasta) return false;
          return true;
        });

        let saldoAcumulado = saldoInicialRango;
        const filasConSaldo = movimientosFiltrados.map((m) => {
          saldoAcumulado += m.debito - m.credito;
          return { ...m, saldo: saldoAcumulado };
        });
        const mostrarSaldoAnterior = Math.abs(saldoInicialRango) > 0;
        const filasLibroMayor = mostrarSaldoAnterior
          ? [{
              fecha: libroMayorDesde ? `${libroMayorDesde}T00:00:00` : null,
              referencia: '—', tipo: 'Saldo anterior', ubicacion: '—', estadoPago: '—',
              debito: Math.max(0, saldoInicialRango), credito: Math.max(0, -saldoInicialRango),
              saldo: saldoInicialRango, metodoPago: '—',
            }, ...filasConSaldo]
          : filasConSaldo;

        const totalFacturaRango = movimientosFiltrados.reduce((total, m) => total + m.debito, 0);
        const totalCreditoRango = movimientosFiltrados.reduce((total, m) => total + m.credito, 0);
        const totalPagadoRango = totalCreditoRango;
        const saldoAdeudadoRango = saldoAcumulado;
        const creditoAFavorRango = Math.max(0, -saldoAdeudadoRango);

        const hoyLocal = new Date();
        const fechaCorteAntiguedad = new Date(hoyLocal.getFullYear(), hoyLocal.getMonth(), hoyLocal.getDate());
        const plazoPagoPartes = String(cliente.termino_pago || '').match(/(\d+)\s*(dias?|mes(?:es)?)/i);
        const plazoPagoCantidad = plazoPagoPartes ? Number(plazoPagoPartes[1]) : 0;
        const plazoPagoEnMeses = Boolean(plazoPagoPartes && /^mes/i.test(plazoPagoPartes[2]));
        const calcularVencimientoEstimado = (fechaVenta) => {
          if (!fechaVenta) return null;
          const fecha = new Date(fechaVenta);
          if (Number.isNaN(fecha.getTime())) return null;
          const diaOriginal = fecha.getDate();
          if (plazoPagoEnMeses) {
            fecha.setDate(1);
            fecha.setMonth(fecha.getMonth() + plazoPagoCantidad);
            const ultimoDiaMes = new Date(fecha.getFullYear(), fecha.getMonth() + 1, 0).getDate();
            fecha.setDate(Math.min(diaOriginal, ultimoDiaMes));
          } else {
            fecha.setDate(fecha.getDate() + plazoPagoCantidad);
          }
          return new Date(fecha.getFullYear(), fecha.getMonth(), fecha.getDate());
        };
        const diferenciaDias = (desde, hasta) => Math.floor((Date.UTC(hasta.getFullYear(), hasta.getMonth(), hasta.getDate()) - Date.UTC(desde.getFullYear(), desde.getMonth(), desde.getDate())) / 86400000);
        const antiguedad = { vigente: 0, dias30: 0, dias60: 0, dias90: 0, mas90: 0, saldoInicialSinFecha: libroMayorUbicacion === 'Todas' ? Math.max(0, saldoApertura) : 0 };
        ventasLibroMayor
          .filter((venta) => libroMayorUbicacion === 'Todas' || venta.ubicacion_id === libroMayorUbicacion)
          .forEach((venta) => {
            const saldoPendiente = Math.max(0, Number(venta.saldoActual ?? venta.saldo_pendiente) || 0);
            if (!saldoPendiente) return;
            const vencimiento = calcularVencimientoEstimado(venta.fecha);
            if (!vencimiento) {
              antiguedad.saldoInicialSinFecha += saldoPendiente;
              return;
            }
            const diasVencidos = diferenciaDias(vencimiento, fechaCorteAntiguedad);
            if (diasVencidos <= 0) antiguedad.vigente += saldoPendiente;
            else if (diasVencidos <= 30) antiguedad.dias30 += saldoPendiente;
            else if (diasVencidos <= 60) antiguedad.dias60 += saldoPendiente;
            else if (diasVencidos <= 90) antiguedad.dias90 += saldoPendiente;
            else antiguedad.mas90 += saldoPendiente;
          });
        antiguedad.total = antiguedad.vigente + antiguedad.dias30 + antiguedad.dias60 + antiguedad.dias90 + antiguedad.mas90 + antiguedad.saldoInicialSinFecha;
        const saldoCuentaActual = movimientosPorUbicacion.reduce((saldo, movimiento) => saldo + movimiento.debito - movimiento.credito, saldoApertura);
        const creditoNetoEnCuenta = Math.min(antiguedad.total, Math.max(0, antiguedad.total - Math.max(0, saldoCuentaActual)));
        const saldoNetoAntiguedad = Math.max(0, antiguedad.total - creditoNetoEnCuenta);
        const saldoAFavorCuenta = Math.max(0, -saldoCuentaActual);
        const idsPagosConAplicacion = new Set(cliente.aplicacionesCliente.map((aplicacion) => aplicacion.pago_id));
        const hayPagosSinAsignacion = cliente.pagosManuales.some((pago) => !idsPagosConAplicacion.has(pago.id));

        const crearLibroMayorPDF = (formato = libroMayorFormato) => {
          const doc = new jsPDF('landscape');
          doc.text(`Libro mayor - ${cliente.nombre}`, 14, 12);
          doc.setFontSize(8);
          doc.text(`Período: ${libroMayorDesde || 'Inicio'} a ${libroMayorHasta || 'Actual'}`, 14, 18);
          autoTable(doc, {
            startY: 23,
            head: [['Vigente', '1–30 días', '31–60 días', '61–90 días', 'Más de 90 días', 'Saldo sin vencimiento', 'Deuda abierta']],
            body: [[formatGs(antiguedad.vigente), formatGs(antiguedad.dias30), formatGs(antiguedad.dias60), formatGs(antiguedad.dias90), formatGs(antiguedad.mas90), formatGs(antiguedad.saldoInicialSinFecha), formatGs(antiguedad.total)], ['Crédito neto en cuenta', formatGs(creditoNetoEnCuenta), 'Saldo neto adeudado', formatGs(saldoNetoAntiguedad), 'Saldo a favor', formatGs(saldoAFavorCuenta), '']],
            styles: { fontSize: 7 },
            headStyles: { fillColor: [15, 23, 42] },
          });
          autoTable(doc, {
            startY: doc.lastAutoTable.finalY + 4,
            head: [formato === 'Format 2'
              ? ['Fecha', 'Transaction', 'Cantidad', 'Saldo']
              : ['Fecha', 'Referencia', 'Tipo', 'Ubicación', 'Estado', 'Débito', 'Crédito', 'Saldo', 'Método']],
            body: filasLibroMayor.map((m) => formato === 'Format 2'
              ? [m.fecha ? new Date(m.fecha).toLocaleDateString('es-PY') : '—', `${m.tipo}${m.referencia !== '—' ? ` #${m.referencia}` : ''}`, formatGs(m.debito - m.credito), formatGs(Math.abs(m.saldo))]
              : [
                  m.fecha ? new Date(m.fecha).toLocaleString('es-PY') : '—', m.referencia, m.tipo, m.ubicacion,
                  m.estadoPago, formatGs(m.debito), formatGs(m.credito), formatGs(Math.abs(m.saldo)), m.metodoPago,
                ]),
            styles: { fontSize: 7 },
            headStyles: { fillColor: [249, 115, 22] },
          });
          return doc;
        };

        const exportarLibroMayorPDF = () => {
          const doc = crearLibroMayorPDF();
          doc.save(`libro_mayor_${cliente.codigo_cliente || cliente.id}.pdf`);
        };

        const reemplazarEtiquetasCorreo = (texto) => String(texto || '')
          .replaceAll('{business_name}', nombreDelNegocio || 'Mi negocio')
          .replaceAll('{business_logo}', '')
          .replaceAll('{contact_name}', cliente.nombre || '')
          .replaceAll('{balance_due}', formatGs(Math.max(0, saldoCuentaActual)))
          .replaceAll('{due_amount}', formatGs(Math.max(0, saldoCuentaActual)))
          .replaceAll('{cumulative_due_amount}', formatGs(Math.max(0, saldoCuentaActual)))
          .replaceAll('{date_from}', libroMayorDesde || 'Inicio')
          .replaceAll('{date_to}', libroMayorHasta || 'Actual');

        const abrirCorreoLibroMayor = async () => {
          setParaLibroMayor(cliente.email || '');
          setFormatoCorreoLibroMayor(libroMayorFormato);
          setDescargarPdfCorreo(true);
          const plantillaBase = {
            asunto: 'Estado de cuenta · {business_name}',
            cc: '',
            bcc: '',
            contenido: 'Estimado/a {contact_name},\n\nLe enviamos su estado de cuenta actualizado de {business_name}.\n\nSaldo pendiente: {balance_due}\nPeríodo: {date_from} a {date_to}\n\nAnte cualquier consulta, comuníquese con nuestra administración.\n\nAtentamente,\n{business_name}',
          };
          setAsuntoLibroMayor(reemplazarEtiquetasCorreo(plantillaBase.asunto));
          setCcLibroMayor('');
          setBccLibroMayor('');
          setCuerpoLibroMayor(reemplazarEtiquetasCorreo(plantillaBase.contenido));
          setCorreoLibroMayorAbierto(true);
          if (!empresaId) return;
          setCargandoPlantillaLibroMayor(true);
          const { data, error } = await supabase
            .from('plantillas_notificacion')
            .select('asunto, cc, bcc, contenido, activo')
            .eq('empresa_id', empresaId)
            .eq('evento', 'send_ledger')
            .eq('canal', 'email')
            .maybeSingle();
          if (!error && data?.activo !== false && data) {
            setAsuntoLibroMayor(reemplazarEtiquetasCorreo(data.asunto || plantillaBase.asunto));
            setCcLibroMayor(data.cc || '');
            setBccLibroMayor(data.bcc || '');
            setCuerpoLibroMayor(reemplazarEtiquetasCorreo(data.contenido || plantillaBase.contenido));
          }
          setCargandoPlantillaLibroMayor(false);
        };

        const prepararCorreoLibroMayor = (event) => {
          event.preventDefault();
          const normalizarDestinatarios = (valor) => String(valor || '').split(/[;,\s]+/).filter(Boolean);
          const validarDestinatarios = (valor) => normalizarDestinatarios(valor).every((correo) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo));
          if (!validarDestinatarios(paraLibroMayor) || !normalizarDestinatarios(paraLibroMayor).length) {
            notificar.error('Ingresá al menos un correo válido en el campo Para.');
            return;
          }
          if (!validarDestinatarios(ccLibroMayor) || !validarDestinatarios(bccLibroMayor)) {
            notificar.error('Revisá los correos de CC y CCO.');
            return;
          }
          const parametros = new URLSearchParams();
          if (asuntoLibroMayor.trim()) parametros.set('subject', asuntoLibroMayor.trim());
          if (ccLibroMayor.trim()) parametros.set('cc', normalizarDestinatarios(ccLibroMayor).join(','));
          if (bccLibroMayor.trim()) parametros.set('bcc', normalizarDestinatarios(bccLibroMayor).join(','));
          parametros.set('body', cuerpoLibroMayor);
          if (descargarPdfCorreo) crearLibroMayorPDF(formatoCorreoLibroMayor).save(`libro_mayor_${cliente.codigo_cliente || cliente.id}.pdf`);
          window.location.href = `mailto:${encodeURIComponent(normalizarDestinatarios(paraLibroMayor).join(','))}?${parametros.toString()}`;
          setCorreoLibroMayorAbierto(false);
        };

        return (
          <div className="libro-mayor-scroll absolute inset-x-0 top-14 md:top-16 bottom-16 md:bottom-0 bg-white z-[9999] overflow-y-auto overflow-x-hidden flex flex-col">
              <style>{`
                .libro-mayor-table th, .libro-mayor-table td { padding: 10px; }
                .libro-mayor-table[data-formato="Format 2"] th,
                .libro-mayor-table[data-formato="Format 2"] td { padding: 5px 7px; }
                @media print {
                  body * { visibility: hidden !important; }
                  .libro-mayor-scroll, .libro-mayor-scroll * { visibility: visible !important; }
                  .libro-mayor-scroll { position: static !important; width: 100% !important; height: auto !important; overflow: visible !important; }
                  .libro-mayor-header, .libro-mayor-controls, .libro-mayor-tabs { display: none !important; }
                }
              `}</style>

              {/* Encabezado con nombre y código del cliente */}
              <div className="libro-mayor-header sticky top-0 z-20 bg-white border-b border-gray-200 px-4 md:px-6 py-3 flex justify-between items-center flex-shrink-0">
                <h3 className="text-[#1f2937] font-bold text-lg">Ver contacto</h3>
                <div className="flex items-center gap-3">
                  <div className="border border-gray-200 rounded-md bg-white px-3 py-2 min-w-[220px] text-sm text-gray-700 shadow-sm">
                    {cliente.nombre} - ({cliente.codigo_cliente || `CO${String(cliente.id).padStart(4, '0')}`})
                  </div>
                  <button onClick={() => setClienteLibroMayor(null)} aria-label="Cerrar Libro mayor" className="text-gray-400 hover:text-gray-700 text-xl leading-none px-1">✕</button>
                </div>
              </div>

              <div className="p-4 md:p-6 max-w-[1400px] w-full mx-auto">
                {/* Avatar independiente y tarjeta de datos del contacto */}
                <div className="flex items-center gap-4 md:gap-6 mb-5">
                  <div className="relative flex-shrink-0 flex flex-col items-center">
                      {cliente.imagen_url ? (
                        <img
                          src={cliente.imagen_url}
                          alt={cliente.nombre}
                          className="w-20 h-20 md:w-24 md:h-24 rounded-full object-cover border-2 border-gray-200 shadow-sm cursor-zoom-in hover:opacity-90 transition-opacity"
                          onClick={() => setFotoAmpliada(cliente.imagen_url)}
                          title="Clic para ampliar foto"
                          onError={(e) => { e.target.onerror = null; e.target.style.display = 'none'; e.target.nextSibling.style.display = 'flex'; }}
                        />
                      ) : null}
                      <div
                        className="w-20 h-20 md:w-24 md:h-24 rounded-full bg-gray-200 text-gray-500 flex items-center justify-center font-bold text-2xl shadow-sm"
                        style={{ display: cliente.imagen_url ? 'none' : 'flex' }}
                      >
                        {iniciales}
                      </div>
                      <span className="mt-1 bg-orange-500 text-white text-[9px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap shadow-sm">
                        {cliente.tipo_contacto || 'Cliente'}
                      </span>
                  </div>
                  <div className="border border-gray-200 rounded-lg p-4 md:p-5 flex flex-1 flex-wrap justify-between items-start gap-4 shadow-sm bg-white min-h-[104px]">
                    {/* Info del contacto */}
                    <div className="pt-1">
                      <h4 className="font-bold text-gray-900 text-lg leading-tight">{cliente.nombre} <span className="font-normal text-xs text-gray-500">{cliente.tipo_contacto || 'Cliente'}</span></h4>
                      <p className="text-xs text-gray-500 mt-0.5">
                        <span className="inline-block w-2 h-2 rounded-full bg-orange-400 mr-1"></span>
                        {cliente.nombre}
                      </p>
                      <p className="text-xs text-gray-500">{cliente.direccion || 'SIN DIRECCION'},</p>
                      <p className="text-xs text-gray-500">{cliente.departamento || 'Paraguay'},</p>
                      <p className="text-xs text-gray-500">{cliente.cod_postal || '0000'}</p>
                      {cliente.celular && (
                        <p className="text-xs text-gray-600 flex items-center gap-1 mt-1">
                          <span className="inline-block w-3 h-3 bg-red-500 rounded-sm"></span> {cliente.celular}
                        </p>
                      )}
                    </div>
                  </div>
                </div>

                {/* Pestañas - estilo CDEpos con iconos */}
                <div className="libro-mayor-tabs flex gap-0 border-b border-gray-200 mb-4 text-sm font-bold text-gray-500 overflow-x-auto">
                  <button
                    onClick={() => setLibroMayorTab('libro')}
                    className={`whitespace-nowrap pb-3 px-4 flex items-center gap-2 transition-colors ${libroMayorTab === 'libro' ? 'text-[#004284] border-b-3 border-[#004284]' : 'hover:text-gray-700'}`}
                    style={libroMayorTab === 'libro' ? { borderBottomWidth: '3px' } : {}}
                  >
                    📒 Libro mayor
                  </button>
                  <button
                    onClick={() => setLibroMayorTab('ventas')}
                    className={`whitespace-nowrap pb-3 px-4 flex items-center gap-2 transition-colors ${libroMayorTab === 'ventas' ? 'text-[#004284] border-b-3 border-[#004284]' : 'hover:text-gray-700'}`}
                    style={libroMayorTab === 'ventas' ? { borderBottomWidth: '3px' } : {}}
                  >
                    💰 Ventas
                  </button>
                  <button
                    onClick={() => setLibroMayorTab('documentos')}
                    className={`whitespace-nowrap pb-3 px-4 flex items-center gap-2 transition-colors ${libroMayorTab === 'documentos' ? 'text-[#004284] border-b-3 border-[#004284]' : 'hover:text-gray-700'}`}
                    style={libroMayorTab === 'documentos' ? { borderBottomWidth: '3px' } : {}}
                  >
                    📎 Documentos y notas
                  </button>
                  <button
                    onClick={() => setLibroMayorTab('pagos')}
                    className={`whitespace-nowrap pb-3 px-4 flex items-center gap-2 transition-colors ${libroMayorTab === 'pagos' ? 'text-[#004284] border-b-3 border-[#004284]' : 'hover:text-gray-700'}`}
                    style={libroMayorTab === 'pagos' ? { borderBottomWidth: '3px' } : {}}
                  >
                    💳 Pagos
                  </button>
                  <button
                    onClick={() => setLibroMayorTab('historial')}
                    className={`whitespace-nowrap pb-3 px-4 flex items-center gap-2 transition-colors ${libroMayorTab === 'historial' ? 'text-[#004284] border-b-3 border-[#004284]' : 'hover:text-gray-700'}`}
                    style={libroMayorTab === 'historial' ? { borderBottomWidth: '3px' } : {}}
                  >
                    🕘 Historial de cambios
                  </button>
                </div>

                {libroMayorTab === 'libro' && (
                  <>
                    {/* Controles: rango de fechas / formato / ubicación + acciones */}
                    <div className="libro-mayor-controls bg-white border border-gray-200 rounded-lg p-3 md:p-4 flex flex-col xl:flex-row xl:items-end justify-between gap-4 mb-4 shadow-sm">
                      <div className="flex flex-wrap gap-4 items-end">
                        <div>
                          <p className="text-xs font-bold text-gray-600 mb-1">Rango de fechas:</p>
                          <div className="bg-gray-50 border rounded-lg px-3 py-2 flex items-center gap-2">
                            <input type="date" value={libroMayorDesde} onChange={(e) => setLibroMayorDesde(e.target.value)} className="bg-transparent text-xs outline-none" />
                            <span className="text-xs text-gray-400">-</span>
                            <input type="date" value={libroMayorHasta} onChange={(e) => setLibroMayorHasta(e.target.value)} className="bg-transparent text-xs outline-none" />
                          </div>
                        </div>
                        <div>
                          <p className="text-xs font-bold text-gray-600 mb-1">Formato del libro</p>
                          <div className="flex border rounded-lg overflow-hidden">
                            {['Format 1', 'Format 2'].map((f) => (
                              <button
                                key={f}
                                onClick={() => setLibroMayorFormato(f)}
                                className={`px-4 py-2 text-xs font-bold transition-colors ${libroMayorFormato === f ? 'bg-gray-200 text-gray-800' : 'bg-white text-gray-500 hover:bg-gray-50'}`}
                              >
                                {f === 'Format 1' ? 'Formato 1' : 'Formato 2'}
                              </button>
                            ))}
                          </div>
                        </div>
                        <div>
                          <p className="text-xs font-bold text-gray-600 mb-1">Ubicación de la empresa:</p>
                          <select
                            className="border rounded-lg px-3 py-2 text-xs bg-white"
                            value={libroMayorUbicacion}
                            onChange={(e) => setLibroMayorUbicacion(e.target.value)}
                          >
                            <option value="Todas">Todas las localizaciones</option>
                            {Object.entries(ubicacionesMap).map(([id, nombre]) => (
                              <option key={id} value={id}>{nombre}</option>
                            ))}
                          </select>
                        </div>
                      </div>
                      {/* Iconos de impresión y email */}
                      <div className="flex items-center gap-2">
                        <button
                          className="w-9 h-9 border rounded-lg flex items-center justify-center text-gray-500 hover:bg-gray-50 hover:text-gray-700 transition-colors"
                          title="Imprimir"
                          onClick={() => window.print()}
                        >
                          🖨️
                        </button>
                        <button
                          className="w-9 h-9 border rounded-lg flex items-center justify-center text-gray-500 hover:bg-gray-50 hover:text-gray-700 transition-colors"
                          title="Exportar Libro mayor a PDF"
                          aria-label="Exportar Libro mayor a PDF"
                          onClick={exportarLibroMayorPDF}
                        >
                          📄
                        </button>
                        <button
                          className="w-9 h-9 border rounded-lg flex items-center justify-center text-gray-500 hover:bg-gray-50 hover:text-gray-700 transition-colors"
                          title="Enviar por email"
                          aria-label="Enviar Libro mayor por email"
                          onClick={abrirCorreoLibroMayor}
                        >
                          ✉️
                        </button>
                      </div>
                    </div>

                    {/* Datos de empresa (derecha) */}
                    <div className={`flex ${libroMayorFormato === 'Format 2' ? 'justify-between' : 'justify-end'} mb-1 gap-4`}>
                      <div className={`${libroMayorFormato === 'Format 2' ? 'text-left' : 'text-right'} text-xs`}>
                        <p className="font-bold text-gray-900">{nombreDelNegocio || 'Tu negocio'}</p>
                        {direccionEmpresa && <p className="text-gray-600">{direccionEmpresa}</p>}
                        {telefonoEmpresa && <p className="text-gray-600">{telefonoEmpresa}</p>}
                      </div>
                      {libroMayorFormato === 'Format 2' && (
                        <div className="text-right text-sm">
                          <p className="font-extrabold tracking-wide text-slate-800">Statement</p>
                          <p className="text-xs text-slate-500">Fecha</p>
                          <p className="text-xs font-semibold text-slate-700">{libroMayorDesde || 'Inicio'} A {libroMayorHasta || 'Actual'}</p>
                        </div>
                      )}
                    </div>

                    {/* Datos del cliente (izquierda) + Resumen de la cuenta (derecha) */}
                    <div className={`grid grid-cols-1 ${libroMayorFormato === 'Format 1' ? 'lg:grid-cols-[minmax(0,1fr)_minmax(300px,400px)]' : ''} items-start gap-6 mb-5`}>
                      {/* Cliente destinatario */}
                      <div className="text-xs">
                        <div className="bg-orange-500 text-white font-bold px-3 py-1 w-fit mb-2 rounded-sm text-sm">A:</div>
                        <p className="font-bold text-gray-900 text-sm">{cliente.nombre}</p>
                        <p className="text-gray-600">{cliente.nombre},</p>
                        <p className="text-gray-600">{cliente.direccion || 'SIN DIRECCION'}, {cliente.departamento || 'Paraguay'},</p>
                        <p className="text-gray-600">{cliente.cod_postal || '0000'}</p>
                        {cliente.celular && <p className="text-gray-600 mt-1">Celular: {cliente.celular}</p>}
                        {cliente.documento_nro && <p className="text-gray-600">Documento N.°: {cliente.documento_nro}</p>}
                      </div>

                      {/* Resumen de la cuenta - estilo CDEpos con naranja */}
                      {libroMayorFormato === 'Format 1' && <div className="border rounded-lg overflow-hidden min-w-[300px] max-w-[400px] flex-1">
                        <div className="bg-orange-500 text-white font-bold text-sm py-1.5 px-3 flex justify-between items-center">
                          <span>Resumen de la cuenta</span>
                          <span className="text-[10px] font-normal text-white/80">{libroMayorDesde} A {libroMayorHasta}</span>
                        </div>
                        <div className="divide-y text-sm">
                          <div className="flex justify-between px-3 py-1.5">
                            <span className="text-gray-600">Saldo anterior</span>
                            <span className="font-bold text-gray-800">{formatGs(saldoInicialRango)}</span>
                          </div>
                          <div className="flex justify-between px-3 py-1.5">
                            <span className="text-gray-600">Total de la factura</span>
                            <span className="font-bold text-gray-800">{formatGs(totalFacturaRango)}</span>
                          </div>
                          <div className="flex justify-between px-3 py-1.5">
                            <span className="text-gray-600">Total pagado</span>
                            <span className="font-bold text-gray-800">{formatGs(totalPagadoRango)}</span>
                          </div>
                          <div className="flex justify-between px-3 py-1.5">
                            <span className="text-gray-600">Crédito a favor</span>
                            <span className="font-bold text-gray-800">{formatGs(creditoAFavorRango)}</span>
                          </div>
                          <div className="flex justify-between px-3 py-1.5 bg-gray-50">
                            <span className="font-bold text-gray-900">Saldo adeudado</span>
                            <span className="font-bold text-gray-900">{formatGs(Math.max(0, saldoAdeudadoRango))}</span>
                          </div>
                        </div>
                      </div>}
                    </div>

                    <section className="mb-5 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm print:break-inside-avoid">
                      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-slate-900 px-4 py-3 text-white">
                        <div><h4 className="text-xs font-extrabold uppercase tracking-wider">Antigüedad de saldos pendientes</h4><p className="mt-1 text-[10px] text-slate-300">Corte {fechaCorteAntiguedad.toLocaleDateString('es-PY')} · vencimiento calculado con el plazo de pago actual</p></div>
                        <div className="text-right"><span className="block text-[10px] uppercase tracking-wide text-slate-300">Deuda abierta por factura</span><strong className="text-lg font-extrabold">{formatGs(antiguedad.total)}</strong></div>
                      </div>
                      <div className="grid grid-cols-2 divide-x divide-y divide-slate-200 sm:grid-cols-3 xl:grid-cols-6 xl:divide-y-0">
                        {[
                          { label: 'Vigente', value: antiguedad.vigente, tone: 'text-emerald-700' },
                          { label: '1–30 días', value: antiguedad.dias30, tone: 'text-amber-700' },
                          { label: '31–60 días', value: antiguedad.dias60, tone: 'text-orange-700' },
                          { label: '61–90 días', value: antiguedad.dias90, tone: 'text-rose-700' },
                          { label: 'Más de 90 días', value: antiguedad.mas90, tone: 'text-red-700' },
                          { label: 'Saldo inicial / sin fecha', value: antiguedad.saldoInicialSinFecha, tone: 'text-slate-700' },
                        ].map((tramo) => <div key={tramo.label} className="min-h-[76px] px-3 py-3 xl:border-r xl:last:border-r-0">
                          <p className="text-[10px] font-bold uppercase leading-4 tracking-wide text-slate-500">{tramo.label}</p>
                          <p className={`mt-2 text-sm font-extrabold tabular-nums ${tramo.tone}`}>{formatGs(tramo.value)}</p>
                        </div>)}
                      </div>
                      <div className="grid grid-cols-1 gap-2 border-t border-slate-200 bg-slate-50 px-4 py-3 text-xs sm:grid-cols-3">
                        <p className="flex justify-between gap-2"><span className="text-slate-600">Crédito neto en cuenta</span><strong className="text-slate-800">{formatGs(creditoNetoEnCuenta)}</strong></p>
                        <p className="flex justify-between gap-2"><span className="text-slate-600">Saldo neto adeudado</span><strong className="text-slate-900">{formatGs(saldoNetoAntiguedad)}</strong></p>
                        <p className="flex justify-between gap-2"><span className="text-slate-600">Saldo a favor</span><strong className="text-emerald-700">{formatGs(saldoAFavorCuenta)}</strong></p>
                      </div>
                    </section>

                    {(errorAplicacionesPagos || hayPagosSinAsignacion) && (
                      <div role="status" className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-5 text-amber-900">
                        <strong>Conciliación histórica pendiente.</strong>{' '}
                        {errorAplicacionesPagos
                          ? 'No está disponible el detalle de aplicaciones de pagos a facturas. Los pagos se muestran, pero no se pueden asignar con certeza a cada saldo.'
                          : 'Hay pagos sin aplicación registrada a factura. Se muestran por su fecha de cobro y no se inventa una asignación para calcular vencimientos.'}
                        {' '}La antigüedad se calcula sobre el saldo pendiente actual y el plazo configurado hoy; los cambios históricos del plazo no están guardados por venta.
                      </div>
                    )}

                    <p className="text-xs font-bold text-gray-700 mb-3 text-center border-y border-gray-100 py-2">
                      Mostrando todas las facturas y pagos entre {libroMayorDesde} y {libroMayorHasta}
                    </p>

                    {/* Tabla de movimientos - estilo CDEpos */}
                    <div className="overflow-x-auto border border-gray-200 rounded-lg shadow-sm mt-2">
                      <table data-formato={libroMayorFormato} className={`libro-mayor-table min-w-[900px] w-full border-collapse whitespace-nowrap ${libroMayorFormato === 'Format 2' ? 'text-[10px]' : 'text-[11px]'}`}>
                        <thead>
                          <tr className="bg-gray-100 text-gray-500 font-bold uppercase border-b text-[10px]">
                            {libroMayorFormato === 'Format 2' ? <>
                              <th className="p-2.5 text-left">Fecha</th><th className="p-2.5 text-left">Transaction</th>
                              <th className="p-2.5 text-right">Cantidad</th><th className="p-2.5 text-right">Saldo</th>
                            </> : <>
                              <th className="p-2.5 text-left">Fecha</th><th className="p-2.5 text-left">Numero de Referencia</th>
                              <th className="p-2.5 text-left">Tipo</th><th className="p-2.5 text-left">Ubicación</th>
                              <th className="p-2.5 text-center">Estado de Pago</th><th className="p-2.5 text-right">Débito</th>
                              <th className="p-2.5 text-right">Crédito</th><th className="p-2.5 text-right">Saldo</th>
                              <th className="p-2.5 text-left">Método de Pago</th>
                            </>}
                          </tr>
                        </thead>
                        <tbody>
                          {/* Fila especial: Crédito a favor */}
                          {creditoAFavorRango > 0 && filasLibroMayor.length === 0 && (
                            <tr className="border-b bg-orange-50/50 text-gray-700">
                              <td className="p-2.5 text-gray-500">{libroMayorDesde}<br/><span className="text-[10px] text-gray-400">12:00 AM</span></td>
                              <td className="p-2.5"></td>
                              <td className="p-2.5 font-medium text-orange-600">Crédito a favor</td>
                              <td className="p-2.5"></td>
                              <td className="p-2.5 text-center"></td>
                              <td className="p-2.5 text-right">{formatGs(0)}</td>
                              <td className="p-2.5 text-right"></td>
                              <td className="p-2.5 text-right font-bold">0</td>
                              <td className="p-2.5"></td>
                            </tr>
                          )}
                          {filasLibroMayor.length === 0 ? (
                            <tr><td colSpan={libroMayorFormato === 'Format 2' ? 4 : 9} className="text-center py-8 text-gray-400">No hay movimientos en el rango seleccionado.</td></tr>
                          ) : (
                            filasLibroMayor.map((m, i) => (
                              libroMayorFormato === 'Format 2' ? (
                                <tr key={i} className="border-b hover:bg-gray-50/80 text-gray-700 transition-colors">
                                  <td className="p-2.5 whitespace-nowrap">{m.fecha ? new Date(m.fecha).toLocaleDateString('es-PY') : '—'}</td>
                                  <td className="p-2.5">{m.tipo}{m.referencia !== '—' ? ` #${m.referencia}` : ''}</td>
                                  <td className="p-2.5 text-right">{formatGs(m.debito - m.credito)}</td>
                                  <td className="p-2.5 text-right font-bold">{formatGs(Math.abs(m.saldo))} {m.saldo < 0 ? 'CR' : m.saldo > 0 ? 'DR' : ''}</td>
                                </tr>
                              ) : (
                              <tr key={i} className="border-b hover:bg-gray-50/80 text-gray-700 transition-colors">
                                <td className="p-2.5">
                                  {m.fecha ? (
                                    <>
                                      {new Date(m.fecha).toLocaleDateString('es-PY', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                                      <br/>
                                      <span className="text-[10px] text-gray-400">{new Date(m.fecha).toLocaleTimeString('es-PY', { hour: '2-digit', minute: '2-digit', hour12: true })}</span>
                                    </>
                                  ) : '—'}
                                </td>
                                <td className="p-2.5 font-medium">{m.referencia}</td>
                                <td className="p-2.5">{m.tipo}</td>
                                <td className="p-2.5 text-[10px]">{m.ubicacion}</td>
                                <td className="p-2.5 text-center">
                                  {m.estadoPago && m.estadoPago !== '—' && (
                                    <span className={`inline-block px-2.5 py-1 rounded-full text-[10px] font-bold ${
                                      m.estadoPago === 'Pagado' ? 'bg-green-100 text-green-700' :
                                      m.estadoPago === 'Pago Parcial' ? 'bg-yellow-100 text-yellow-700' :
                                      ['Pendiente', 'Credito'].includes(m.estadoPago) ? 'bg-red-100 text-red-700' :
                                      'bg-gray-100 text-gray-600'
                                    }`}>
                                      {m.estadoPago}
                                    </span>
                                  )}
                                </td>
                                <td className="p-2.5 text-right">{m.debito ? formatGs(m.debito) : ''}</td>
                                <td className="p-2.5 text-right">{m.credito ? formatGs(m.credito) : ''}</td>
                                <td className="p-2.5 text-right font-bold">{formatGs(Math.abs(m.saldo))} {m.saldo < 0 ? 'CR' : m.saldo > 0 ? 'DR' : ''}</td>
                                <td className="p-2.5">{m.metodoPago !== '—' ? m.metodoPago : ''}</td>
                              </tr>
                              )
                            ))
                          )}
                        </tbody>
                        {filasLibroMayor.length > 0 && (
                          <tfoot>
                            <tr className="bg-gray-100 border-t-2 border-gray-200 font-bold text-gray-800">
                              {libroMayorFormato === 'Format 2' ? <>
                                <td className="p-2.5" colSpan="2">Totales del período</td>
                                <td className="p-2.5 text-right">{formatGs(totalFacturaRango - totalCreditoRango)}</td>
                                <td className="p-2.5 text-right">{formatGs(Math.abs(saldoAdeudadoRango))}</td>
                              </> : <>
                                <td className="p-2.5" colSpan="5">Totales del período</td>
                                <td className="p-2.5 text-right">{formatGs(totalFacturaRango)}</td>
                                <td className="p-2.5 text-right">{formatGs(totalCreditoRango)}</td>
                                <td className="p-2.5 text-right">{formatGs(Math.abs(saldoAdeudadoRango))}</td>
                                <td className="p-2.5" />
                              </>}
                            </tr>
                          </tfoot>
                        )}
                      </table>
                    </div>
                  </>
                )}

                {libroMayorTab === 'documentos' && (
                  <section className="rounded-2xl border border-slate-200 bg-white p-5 md:p-6 shadow-sm">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div><h4 className="font-bold text-slate-800">Documentos y notas</h4><p className="mt-1 text-xs text-slate-500">Información interna guardada en la ficha de este cliente.</p></div>
                      <button onClick={() => { setClienteLibroMayor(null); abrirDocumentosNotas(cliente); }} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50">Editar nota</button>
                    </div>
                    <div className="mt-4 min-h-24 rounded-xl bg-slate-50 p-4 text-sm leading-6 text-slate-700 whitespace-pre-wrap">
                      {cliente.notas?.trim() || <span className="text-slate-400">Todavía no hay notas guardadas para este cliente.</span>}
                    </div>
                    <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
                      <div><h5 className="text-sm font-bold text-slate-800">Archivos adjuntos</h5><p className="mt-1 text-xs text-slate-500">Archivos privados visibles solo para usuarios de esta empresa; máximo 20 MB por archivo.</p></div>
                      <label className={`cursor-pointer rounded-lg bg-blue-700 px-3 py-2 text-xs font-bold text-white hover:bg-blue-800 ${subiendoDocumentoCliente ? 'pointer-events-none opacity-60' : ''}`}>
                        {subiendoDocumentoCliente ? 'Subiendo…' : 'Añadir archivo'}
                        <input type="file" className="sr-only" onChange={subirDocumentoCliente} disabled={subiendoDocumentoCliente} />
                      </label>
                    </div>
                    {errorDocumentosCliente && <p role="alert" className="mt-3 rounded-lg bg-amber-50 p-3 text-xs text-amber-800">{errorDocumentosCliente}</p>}
                    {cargandoDocumentosCliente ? <p className="py-6 text-center text-xs text-slate-500">Cargando archivos…</p> : documentosCliente.length === 0 ? (
                      <p className="mt-3 rounded-xl border border-dashed border-slate-200 p-5 text-center text-xs text-slate-400">Todavía no hay archivos adjuntos.</p>
                    ) : (
                      <ul className="mt-3 divide-y divide-slate-100 rounded-xl border border-slate-200">
                        {documentosCliente.map((documento) => <li key={documento.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                          <div className="min-w-0"><p className="truncate text-sm font-semibold text-slate-700">{documento.name.replace(/^[0-9a-f-]{36}-/i, '')}</p><p className="mt-1 text-[11px] text-slate-400">{documento.created_at ? new Date(documento.created_at).toLocaleString('es-PY') : ''} · {Math.max(1, Math.round((documento.metadata?.size || 0) / 1024))} KB</p></div>
                          <div className="flex gap-2"><button onClick={() => abrirDocumentoCliente(documento)} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">Abrir</button><button onClick={() => borrarDocumentoCliente(documento)} className="rounded-lg border border-red-100 px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50">Eliminar</button></div>
                        </li>)}
                      </ul>
                    )}
                  </section>
                )}

                {libroMayorTab === 'historial' && (
                  <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                    <div className="border-b border-slate-100 px-5 py-4"><h4 className="font-bold text-slate-800">Historial de cambios</h4><p className="mt-1 text-xs text-slate-500">Registro de altas y modificaciones de esta ficha.</p></div>
                    {cargandoHistorialCliente ? <p className="p-8 text-center text-sm text-slate-500">Cargando historial…</p> : historialCliente.length === 0 ? (
                      <p className="p-8 text-center text-sm text-slate-500">No hay eventos de historial disponibles para este cliente.</p>
                    ) : (
                      <div className="overflow-x-auto"><table className="w-full min-w-[620px] text-left text-sm">
                        <thead className="bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500"><tr><th className="px-5 py-3">Fecha</th><th className="px-5 py-3">Acción</th><th className="px-5 py-3">Usuario</th><th className="px-5 py-3">Detalle</th></tr></thead>
                        <tbody>{historialCliente.map((evento) => <tr key={evento.id} className="border-t border-slate-100 align-top"><td className="whitespace-nowrap px-5 py-3 text-slate-600">{new Date(evento.ocurrido_en).toLocaleString('es-PY')}</td><td className="px-5 py-3 font-semibold text-slate-700">{{ INSERT: 'Agregado', UPDATE: 'Actualizado', DELETE: 'Borrado' }[evento.accion] || evento.accion}</td><td className="px-5 py-3 text-slate-600">{evento.usuario_nombre || '—'}</td><td className="max-w-sm px-5 py-3 text-xs text-slate-500">{evento.detalle?.actual?.nombre || evento.detalle?.anterior?.nombre || 'Cambio en los datos del contacto'}</td></tr>)}</tbody>
                      </table></div>
                    )}
                  </section>
                )}

                {libroMayorTab === 'ventas' && (() => {
                  const ventasFiltradas = cliente.ventasDelCliente.filter((v) => {
                    if (ventasFiltroEstado !== 'Todos' && v.estado_pago !== ventasFiltroEstado) return false;
                    if (v.fecha) {
                      const f = new Date(v.fecha).toISOString().slice(0, 10);
                      if (ventasDesde && f < ventasDesde) return false;
                      if (ventasHasta && f > ventasHasta) return false;
                    }
                    if (ventasBusqueda) {
                      const term = ventasBusqueda.toLowerCase();
                      const facturaNo = String(v.id || '').slice(0, 8).toLowerCase();
                      if (!facturaNo.includes(term) && !(v.nota_venta || '').toLowerCase().includes(term)) return false;
                    }
                    return true;
                  });

                  const totalPaginasVentas = Math.max(1, Math.ceil(ventasFiltradas.length / ventasEntradasPorPagina));
                  const paginaSeguraVentas = Math.min(ventasPaginaActual, totalPaginasVentas);
                  const ventasPagina = ventasFiltradas.slice(
                    (paginaSeguraVentas - 1) * ventasEntradasPorPagina,
                    paginaSeguraVentas * ventasEntradasPorPagina
                  );

                  const totalCantidad = ventasFiltradas.reduce((acc, v) => acc + (Number(v.total) || 0), 0);
                  const totalPagado = ventasFiltradas.reduce((acc, v) => acc + (Number(v.montoPagadoActual ?? v.monto_pagado) || 0), 0);
                  const totalArticulos = ventasFiltradas.reduce((acc, v) => acc + (Number(v.articulos) || 0), 0);
                  const totalCreditosOtorgados = ventasFiltradas.reduce((acc, v) => acc + (Number(v.saldoActual ?? v.saldo_pendiente) || 0), 0);
                  const conteoPorMetodo = ventasFiltradas.reduce((acc, v) => {
                    const m = v.metodo_pago || '—';
                    acc[m] = (acc[m] || 0) + 1;
                    return acc;
                  }, {});
                  const conteoPorEstado = ventasFiltradas.reduce((acc, v) => {
                    const e = v.estado_pago || '—';
                    acc[e] = (acc[e] || 0) + 1;
                    return acc;
                  }, {});

                  const columnasVentasExport = [
                    { key: 'fecha', label: 'Fecha' },
                    { key: 'facturaNo', label: 'Factura No.' },
                    { key: 'nombreCliente', label: 'Nombre del Cliente' },
                    { key: 'numeroContacto', label: 'Numero de Contacto' },
                    { key: 'ubicacion', label: 'Ubicacion' },
                    { key: 'estado_pago', label: 'Estado de Pago' },
                    { key: 'metodo_pago', label: 'Metodo de Pago' },
                    { key: 'total', label: 'Cantidad Total' },
                    { key: 'monto_pagado', label: 'Total Pagado' },
                    { key: 'creditosOtorgados', label: 'Creditos Otorgados' },
                    { key: 'creditoDevolucion', label: 'Credito por Devolucion' },
                    { key: 'estadoEnvio', label: 'Estado del Envio' },
                    { key: 'articulos', label: 'Total Articulos' },
                    { key: 'añadidoPor', label: 'Añadido Por' },
                    { key: 'nota_venta', label: 'Nota de Venta' },
                    { key: 'notaPersonal', label: 'Nota del Personal' },
                  ];

                  const filaExport = (v) => ({
                    fecha: v.fecha ? new Date(v.fecha).toLocaleString('es-PY') : '',
                    facturaNo: v.id ? String(v.id).slice(0, 8).toUpperCase() : '',
                    nombreCliente: cliente.nombre,
                    numeroContacto: cliente.celular || '',
                    ubicacion: ubicacionesMap[v.ubicacion_id] || nombreDelNegocio || '',
                    estado_pago: v.estado_pago || '',
                    metodo_pago: v.metodo_pago || '',
                    total: v.total ?? 0,
                    monto_pagado: v.montoPagadoActual ?? v.monto_pagado ?? 0,
                    creditosOtorgados: v.saldoActual ?? v.saldo_pendiente ?? 0,
                    creditoDevolucion: 0,
                    estadoEnvio: '',
                    articulos: v.articulos ?? 0,
                    añadidoPor: '',
                    nota_venta: v.nota_venta || '',
                    notaPersonal: '',
                  });

                  const descargarVentas = (contenido, nombreArchivo, tipo) => {
                    const blob = new Blob([contenido], { type: tipo });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = nombreArchivo;
                    a.click();
                    URL.revokeObjectURL(url);
                  };

                  const exportarVentasCSV = () => {
                    const filas = [columnasVentasExport.map((c) => c.label).join(',')];
                    ventasFiltradas.forEach((v) => {
                      const fila = filaExport(v);
                      filas.push(columnasVentasExport.map((col) => `"${String(fila[col.key] ?? '').replace(/"/g, '""')}"`).join(','));
                    });
                    descargarVentas(filas.join('\n'), `ventas_${cliente.codigo_cliente || cliente.id}.csv`, 'text/csv;charset=utf-8;');
                  };

                  const exportarVentasExcel = () => {
                    let html = '<table><tr>' + columnasVentasExport.map((c) => `<th>${c.label}</th>`).join('') + '</tr>';
                    ventasFiltradas.forEach((v) => {
                      const fila = filaExport(v);
                      html += '<tr>' + columnasVentasExport.map((col) => `<td>${fila[col.key] ?? ''}</td>`).join('') + '</tr>';
                    });
                    html += '</table>';
                    descargarVentas(html, `ventas_${cliente.codigo_cliente || cliente.id}.xls`, 'application/vnd.ms-excel');
                  };

                  const exportarVentasPDF = () => {
                    const doc = new jsPDF();
                    doc.text(`Ventas - ${cliente.nombre}`, 14, 12);
                    autoTable(doc, {
                      startY: 18,
                      head: [columnasVentasExport.map((c) => c.label)],
                      body: ventasFiltradas.map((v) => {
                        const fila = filaExport(v);
                        return columnasVentasExport.map((col) => String(fila[col.key] ?? ''));
                      }),
                      styles: { fontSize: 6 },
                    });
                    doc.save(`ventas_${cliente.codigo_cliente || cliente.id}.pdf`);
                  };

                  return (
                    <>
                      {/* Filtros */}
                      <div className="flex flex-wrap gap-6 mb-4">
                        <div>
                          <p className="text-xs font-bold text-gray-600 mb-1">Estado de pago:</p>
                          <select
                            className="border rounded px-2 py-1.5 text-xs w-40"
                            value={ventasFiltroEstado}
                            onChange={(e) => { setVentasFiltroEstado(e.target.value); setVentasPaginaActual(1); }}
                          >
                            <option value="Todos">Todos</option>
                            <option value="Pagado">Pagado</option>
                            <option value="Pago Parcial">Pago Parcial</option>
                            <option value="Credito">Credito</option>
                            <option value="Cotizacion">Cotizacion</option>
                            <option value="Pendiente">Pendiente</option>
                          </select>
                        </div>
                        <div>
                          <p className="text-xs font-bold text-gray-600 mb-1">Rango de fechas:</p>
                          <div className="flex items-center gap-2">
                            <input type="date" value={ventasDesde} onChange={(e) => { setVentasDesde(e.target.value); setVentasPaginaActual(1); }} className="border rounded px-2 py-1 text-xs" />
                            <span className="text-xs text-gray-400">-</span>
                            <input type="date" value={ventasHasta} onChange={(e) => { setVentasHasta(e.target.value); setVentasPaginaActual(1); }} className="border rounded px-2 py-1 text-xs" />
                          </div>
                        </div>
                        <label className="flex items-center gap-2 text-xs font-bold text-gray-600 self-end pb-1.5 cursor-not-allowed opacity-60" title="Tu sistema todavía no maneja ventas por suscripción">
                          <input type="checkbox" checked={ventasSuscripciones} onChange={() => setVentasSuscripciones((v) => !v)} disabled />
                          Suscripciones
                        </label>
                      </div>

                      {/* Barra de herramientas */}
                      <div className="flex flex-wrap justify-between items-center gap-3 mb-3">
                        <div className="flex items-center gap-2 text-gray-600 font-medium text-xs">
                          <span>Mostrar</span>
                          <select
                            className="border rounded p-1"
                            value={ventasEntradasPorPagina}
                            onChange={(e) => { setVentasEntradasPorPagina(Number(e.target.value)); setVentasPaginaActual(1); }}
                          >
                            <option value={10}>10</option>
                            <option value={25}>25</option>
                            <option value={50}>50</option>
                            <option value={100}>100</option>
                          </select>
                          <span>entradas</span>
                        </div>

                        <div className="flex flex-wrap gap-2">
                          <button onClick={exportarVentasCSV} className="border rounded px-3 py-1.5 text-xs font-bold text-gray-600 hover:bg-gray-50">Exportar a CSV</button>
                          <button onClick={exportarVentasExcel} className="border rounded px-3 py-1.5 text-xs font-bold text-gray-600 hover:bg-gray-50">Exportar a Excel</button>
                          <button onClick={() => window.print()} className="border rounded px-3 py-1.5 text-xs font-bold text-gray-600 hover:bg-gray-50">Imprimir</button>
                          <div className="relative">
                            <button onClick={() => setVentasMostrarMenuColumnas((v) => !v)} className="border rounded px-3 py-1.5 text-xs font-bold text-gray-600 hover:bg-gray-50">Visibilidad de columnas</button>
                            {ventasMostrarMenuColumnas && (
                              <div className="absolute right-0 mt-1 bg-white border rounded shadow-lg p-3 z-20 w-56 max-h-64 overflow-y-auto">
                                {Object.entries({
                                  facturaNo: 'Factura No.', numeroContacto: 'Número de Contacto', ubicacion: 'Ubicación',
                                  metodoPago: 'Método de Pago', creditosOtorgados: 'Creditos Ortogados',
                                  creditoDevolucion: 'Credito por Devolucion', estadoEnvio: 'Estado del Envío',
                                  totalArticulos: 'Total Artículos', añadidoPor: 'Añadido Por',
                                  notaVenta: 'Nota de Venta', notaPersonal: 'Nota del Personal',
                                }).map(([key, label]) => (
                                  <label key={key} className="flex items-center gap-2 text-xs py-1 cursor-pointer">
                                    <input
                                      type="checkbox"
                                      checked={ventasColumnasVisibles[key]}
                                      onChange={() => setVentasColumnasVisibles((prev) => ({ ...prev, [key]: !prev[key] }))}
                                    />
                                    {label}
                                  </label>
                                ))}
                              </div>
                            )}
                          </div>
                          <button onClick={exportarVentasPDF} className="border rounded px-3 py-1.5 text-xs font-bold text-gray-600 hover:bg-gray-50">Exportar a PDF</button>
                        </div>

                        <input
                          type="text"
                          className="border rounded p-1.5 w-56 outline-none focus:border-blue-500 text-xs"
                          placeholder="Buscar ..."
                          value={ventasBusqueda}
                          onChange={(e) => { setVentasBusqueda(e.target.value); setVentasPaginaActual(1); }}
                        />
                      </div>

                      {/* Tabla */}
                      <div className="overflow-x-auto border rounded">
                        <table className="w-full text-left text-[11px] border-collapse whitespace-nowrap">
                          <thead>
                            <tr className="bg-gray-50 text-[#004284] font-black uppercase border-b-2">
                              <th className="p-3">ACCION</th>
                              <th className="p-3">FECHA</th>
                              {ventasColumnasVisibles.facturaNo && <th className="p-3">FACTURA NO.</th>}
                              <th className="p-3">NOMBRE DEL CLIENTE</th>
                              {ventasColumnasVisibles.numeroContacto && <th className="p-3">NÚMERO DE CONTACTO</th>}
                              {ventasColumnasVisibles.ubicacion && <th className="p-3">UBICACIÓN</th>}
                              <th className="p-3">ESTADO DE PAGO</th>
                              {ventasColumnasVisibles.metodoPago && <th className="p-3">MÉTODO DE PAGO</th>}
                              <th className="p-3 text-right">CANTIDAD TOTAL</th>
                              <th className="p-3 text-right">TOTAL PAGADO</th>
                              {ventasColumnasVisibles.creditosOtorgados && <th className="p-3 text-right">CREDITOS ORTOGADOS</th>}
                              {ventasColumnasVisibles.creditoDevolucion && <th className="p-3 text-right">CREDITO POR DEVOLUCION</th>}
                              {ventasColumnasVisibles.estadoEnvio && <th className="p-3">ESTADO DEL ENVÍO</th>}
                              {ventasColumnasVisibles.totalArticulos && <th className="p-3 text-right">TOTAL ARTÍCULOS</th>}
                              {ventasColumnasVisibles.añadidoPor && <th className="p-3">AÑADIDO POR</th>}
                              {ventasColumnasVisibles.notaVenta && <th className="p-3">NOTA DE VENTA</th>}
                              {ventasColumnasVisibles.notaPersonal && <th className="p-3">NOTA DEL PERSONAL</th>}
                            </tr>
                          </thead>
                          <tbody>
                            {ventasPagina.length === 0 ? (
                              <tr><td colSpan="16" className="text-center py-8 text-gray-400 font-medium text-sm">No hay datos disponibles en la tabla</td></tr>
                            ) : (
                              ventasPagina.map((v) => (
                                <tr key={v.id} className="border-b hover:bg-gray-50 text-gray-700">
                                  <td className="p-2 relative">
                                    <button
                                      onClick={() => setVentasAccionAbierta(ventasAccionAbierta === v.id ? null : v.id)}
                                      className="bg-[#17a2b8] text-white px-2 py-1 rounded font-bold text-[10px]"
                                    >
                                      Acciones ▾
                                    </button>
                                    {ventasAccionAbierta === v.id && (
                                      <div className="absolute z-50 mt-1 bg-white border rounded shadow-lg w-48 text-[11px] py-1">
                                        <button
                                          onClick={() => { setVentasAccionAbierta(null); setVentasVerDetalle(v); }}
                                          className="w-full text-left px-3 py-2 hover:bg-gray-100 text-gray-700 flex items-center gap-2"
                                        >
                                          👁️ Ver
                                        </button>
                                        <button
                                          onClick={() => imprimirFactura(v)}
                                          className="w-full text-left px-3 py-2 hover:bg-gray-100 text-gray-700 flex items-center gap-2"
                                        >
                                          🖨️ Imprimir Factura
                                        </button>
                                        <button
                                          onClick={() => abrirModalPagoLibroMayor(v)}
                                          className="w-full text-left px-3 py-2 hover:bg-gray-100 text-gray-700 flex items-center gap-2"
                                        >
                                          💰 Monto total pagado o pago parcial
                                        </button>
                                      </div>
                                    )}
                                  </td>
                                  <td className="p-3">{v.fecha ? new Date(v.fecha).toLocaleString('es-PY') : '—'}</td>
                                  {ventasColumnasVisibles.facturaNo && <td className="p-3 font-mono">{v.id ? String(v.id).slice(0, 8).toUpperCase() : '—'}</td>}
                                  <td className="p-3 font-bold text-gray-800">{cliente.nombre}</td>
                                  {ventasColumnasVisibles.numeroContacto && <td className="p-3">{cliente.celular || '—'}</td>}
                                  {ventasColumnasVisibles.ubicacion && <td className="p-3">{ubicacionesMap[v.ubicacion_id] || nombreDelNegocio || '—'}</td>}
                                  <td className="p-3">
                                    <span className={`px-2 py-0.5 rounded-full text-white text-[10px] font-bold ${v.estado_pago === 'Credito' ? 'bg-red-500' : v.estado_pago === 'Pago Parcial' ? 'bg-yellow-500' : 'bg-green-600'}`}>
                                      {v.estado_pago || '—'}
                                    </span>
                                  </td>
                                  {ventasColumnasVisibles.metodoPago && <td className="p-3">{v.metodo_pago || '—'}</td>}
                                  <td className="p-3 text-right">{formatGs(v.total)}</td>
                                  <td className="p-3 text-right">{formatGs(v.montoPagadoActual ?? v.monto_pagado)}</td>
                                  {ventasColumnasVisibles.creditosOtorgados && <td className="p-3 text-right">{formatGs(v.saldoActual ?? v.saldo_pendiente)}</td>}
                                  {ventasColumnasVisibles.creditoDevolucion && <td className="p-3 text-right">{formatGs(0)}</td>}
                                  {ventasColumnasVisibles.estadoEnvio && <td className="p-3">—</td>}
                                  {ventasColumnasVisibles.totalArticulos && <td className="p-3 text-right">{v.articulos ?? 0}</td>}
                                  {ventasColumnasVisibles.añadidoPor && <td className="p-3">{nombreDelNegocio || '—'}</td>}
                                  {ventasColumnasVisibles.notaVenta && <td className="p-3">{v.nota_venta || '—'}</td>}
                                  {ventasColumnasVisibles.notaPersonal && <td className="p-3">—</td>}
                                </tr>
                              ))
                            )}
                          </tbody>
                          {ventasFiltradas.length > 0 && (
                            <tfoot>
                              <tr className="bg-gray-100 font-bold text-gray-700 border-t-2">
                                <td className="p-3" colSpan={2}>Total:</td>
                                {ventasColumnasVisibles.facturaNo && <td className="p-3" />}
                                <td className="p-3" />
                                {ventasColumnasVisibles.numeroContacto && <td className="p-3" />}
                                {ventasColumnasVisibles.ubicacion && <td className="p-3" />}
                                <td className="p-3">{Object.entries(conteoPorEstado).map(([k, n]) => `${k} - ${n}`).join(', ')}</td>
                                {ventasColumnasVisibles.metodoPago && <td className="p-3">{Object.entries(conteoPorMetodo).map(([k, n]) => `${k} - ${n}`).join(', ')}</td>}
                                <td className="p-3 text-right">{formatGs(totalCantidad)}</td>
                                <td className="p-3 text-right">{formatGs(totalPagado)}</td>
                                {ventasColumnasVisibles.creditosOtorgados && <td className="p-3 text-right">{formatGs(totalCreditosOtorgados)}</td>}
                                {ventasColumnasVisibles.creditoDevolucion && <td className="p-3 text-right">{formatGs(0)}</td>}
                                {ventasColumnasVisibles.estadoEnvio && <td className="p-3" />}
                                {ventasColumnasVisibles.totalArticulos && <td className="p-3 text-right">{totalArticulos}</td>}
                                {ventasColumnasVisibles.añadidoPor && <td className="p-3" />}
                                {ventasColumnasVisibles.notaVenta && <td className="p-3" />}
                                {ventasColumnasVisibles.notaPersonal && <td className="p-3" />}
                              </tr>
                            </tfoot>
                          )}
                        </table>
                      </div>

                      {/* Paginación */}
                      <div className="flex flex-wrap justify-between items-center gap-3 mt-4 text-xs text-gray-500 font-medium">
                        <span>
                          Mostrando {ventasFiltradas.length === 0 ? 0 : (paginaSeguraVentas - 1) * ventasEntradasPorPagina + 1} a{' '}
                          {Math.min(paginaSeguraVentas * ventasEntradasPorPagina, ventasFiltradas.length)} de {ventasFiltradas.length} entradas
                        </span>
                        <div className="flex items-center gap-1">
                          <button
                            disabled={paginaSeguraVentas === 1}
                            onClick={() => setVentasPaginaActual((p) => Math.max(1, p - 1))}
                            className="border rounded px-3 py-1 disabled:opacity-40 hover:bg-gray-50"
                          >
                            Anterior
                          </button>
                          <span className="bg-[#004284] text-white rounded px-3 py-1">{paginaSeguraVentas}</span>
                          <button
                            disabled={paginaSeguraVentas === totalPaginasVentas}
                            onClick={() => setVentasPaginaActual((p) => Math.min(totalPaginasVentas, p + 1))}
                            className="border rounded px-3 py-1 disabled:opacity-40 hover:bg-gray-50"
                          >
                            Siguiente
                          </button>
                        </div>
                      </div>

                      {/* Mini modal: Ver detalle de una venta */}
                      {ventasVerDetalle && (
                        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[10000] p-4" onClick={() => setVentasVerDetalle(null)}>
                          <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm overflow-hidden" onClick={(e) => e.stopPropagation()}>
                            <div className="bg-[#004284] px-5 py-3 flex justify-between items-center">
                              <h4 className="text-white font-bold text-sm">Detalle de venta</h4>
                              <button onClick={() => setVentasVerDetalle(null)} className="text-white/80 hover:text-white text-lg leading-none">✕</button>
                            </div>
                            <div className="p-5 text-sm flex flex-col gap-1.5">
                              <p><span className="font-bold text-gray-600">Factura N.°:</span> {String(ventasVerDetalle.id).slice(0, 8).toUpperCase()}</p>
                              <p><span className="font-bold text-gray-600">Fecha:</span> {ventasVerDetalle.fecha ? new Date(ventasVerDetalle.fecha).toLocaleString('es-PY') : '—'}</p>
                              <p><span className="font-bold text-gray-600">Estado de pago:</span> {ventasVerDetalle.estado_pago || '—'}</p>
                              <p><span className="font-bold text-gray-600">Método de pago:</span> {ventasVerDetalle.metodo_pago || '—'}</p>
                              <p><span className="font-bold text-gray-600">Total:</span> {formatGs(ventasVerDetalle.total)}</p>
                              <p><span className="font-bold text-gray-600">Pagado en la venta (inicial):</span> {formatGs(ventasVerDetalle.monto_pagado)}</p>
                              <p><span className="font-bold text-gray-600">Total pagado (con pagos a cuenta):</span> {formatGs(ventasVerDetalle.montoPagadoActual ?? ventasVerDetalle.monto_pagado)}</p>
                              <p><span className="font-bold text-gray-600">Saldo original:</span> {formatGs(ventasVerDetalle.saldo_pendiente)}</p>
                              <p><span className="font-bold text-gray-600">Saldo actual (ya con pagos aplicados):</span> {formatGs(ventasVerDetalle.saldoActual ?? ventasVerDetalle.saldo_pendiente)}</p>
                              <p><span className="font-bold text-gray-600">Artículos:</span> {ventasVerDetalle.articulos ?? 0}</p>
                              {ventasVerDetalle.nota_venta && <p><span className="font-bold text-gray-600">Nota:</span> {ventasVerDetalle.nota_venta}</p>}
                            </div>
                          </div>
                        </div>
                      )}
                    </>
                  );
                })()}

                {libroMayorTab === 'pagos' && (
                  cliente.pagosManuales.length === 0 ? (
                    <div className="border border-gray-200 rounded-lg bg-white py-12 text-center text-gray-400 text-sm">
                      Este cliente todavía no tiene pagos registrados.
                    </div>
                  ) : (
                    <div className="overflow-x-auto border border-gray-200 rounded-lg shadow-sm">
                      <table className="min-w-[820px] w-full text-[11px] border-collapse">
                        <thead>
                          <tr className="bg-gray-100 text-gray-500 font-bold uppercase border-b text-[10px]">
                            <th className="p-3 text-left">Pagado el</th>
                            <th className="p-3 text-left">Número de referencia</th>
                            <th className="p-3 text-right">Cantidad</th>
                            <th className="p-3 text-left">Método de pago</th>
                            <th className="p-3 text-left">Pago por</th>
                            <th className="p-3 text-center">Acción</th>
                          </tr>
                        </thead>
                        <tbody>
                          {cliente.pagosManuales.map((pago) => (
                            <tr key={pago.id} className="border-b border-gray-100 hover:bg-gray-50 text-gray-700">
                              <td className="p-3">{pago.fecha ? new Date(pago.fecha).toLocaleString('es-PY') : '—'}</td>
                              <td className="p-3 font-mono">{pago.id ? `SP${new Date(pago.fecha || Date.now()).getFullYear()}/${String(pago.id).slice(-4)}` : '—'}</td>
                              <td className="p-3 text-right font-bold">{formatGs(pago.monto)}</td>
                              <td className="p-3">{pago.metodo_pago || '—'}</td>
                              <td className="p-3">{pago.cuenta_pago || nombreDelNegocio || '—'}</td>
                              <td className="p-3">
                                <div className="flex justify-center gap-1.5">
                                  <button
                                    type="button"
                                    onClick={() => abrirDetallePagoLibroMayor(pago)}
                                    className="bg-orange-500 hover:bg-orange-600 text-white px-2.5 py-1 rounded text-[10px] font-bold"
                                  >
                                    Ver
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => abrirEdicionPagoLibroMayor(pago)}
                                    className="bg-cyan-500 hover:bg-cyan-600 text-white px-2.5 py-1 rounded text-[10px] font-bold"
                                  >
                                    Editar
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => borrarPagoLibroMayor(pago)}
                                    className="bg-red-500 hover:bg-red-600 text-white px-2.5 py-1 rounded text-[10px] font-bold"
                                  >
                                    Borrar
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )
                )}
              </div>
              {correoLibroMayorAbierto && (
                <div className="fixed inset-0 z-[10001] flex items-center justify-center bg-slate-950/55 p-4" onClick={() => !cargandoPlantillaLibroMayor && setCorreoLibroMayorAbierto(false)}>
                  <form role="dialog" aria-modal="true" aria-label="Enviar Libro mayor por correo" onSubmit={prepararCorreoLibroMayor} onClick={(event) => event.stopPropagation()} className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
                    <header className="flex items-start justify-between gap-4 bg-slate-900 px-5 py-4 text-white">
                      <div><p className="text-[10px] font-bold uppercase tracking-[0.18em] text-orange-300">Comunicación con el cliente</p><h3 className="mt-1 text-lg font-extrabold">Enviar Libro mayor</h3><p className="mt-1 text-xs text-slate-300">Prepará el mensaje y el estado de cuenta en PDF.</p></div>
                      <button type="button" onClick={() => setCorreoLibroMayorAbierto(false)} className="rounded-lg px-2 py-1 text-xl text-slate-300 hover:bg-white/10 hover:text-white" aria-label="Cerrar">×</button>
                    </header>
                    <div className="space-y-4 overflow-y-auto p-5">
                      {cargandoPlantillaLibroMayor && <p className="text-xs text-slate-500">Cargando la plantilla de envío…</p>}
                      <div className="grid gap-4 sm:grid-cols-2">
                        <label className="block text-xs font-bold text-slate-600">Para
                          <input type="text" value={paraLibroMayor} onChange={(event) => setParaLibroMayor(event.target.value)} placeholder="cliente@correo.com" autoComplete="email" className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm font-normal text-slate-800 outline-none focus:border-orange-400 focus:ring-4 focus:ring-orange-100" />
                        </label>
                        <label className="block text-xs font-bold text-slate-600">Formato del Libro mayor
                          <select value={formatoCorreoLibroMayor} onChange={(event) => setFormatoCorreoLibroMayor(event.target.value)} className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm font-normal text-slate-800 outline-none focus:border-orange-400">
                            <option value="Format 1">Formato 1</option><option value="Format 2">Formato 2</option>
                          </select>
                        </label>
                        <label className="block text-xs font-bold text-slate-600">CC
                          <input type="text" value={ccLibroMayor} onChange={(event) => setCcLibroMayor(event.target.value)} placeholder="correo@ejemplo.com" className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm font-normal text-slate-800 outline-none focus:border-orange-400" />
                        </label>
                        <label className="block text-xs font-bold text-slate-600">CCO
                          <input type="text" value={bccLibroMayor} onChange={(event) => setBccLibroMayor(event.target.value)} placeholder="correo@ejemplo.com" className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm font-normal text-slate-800 outline-none focus:border-orange-400" />
                        </label>
                      </div>
                      <label className="block text-xs font-bold text-slate-600">Asunto
                        <input type="text" value={asuntoLibroMayor} onChange={(event) => setAsuntoLibroMayor(event.target.value)} maxLength={180} className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm font-normal text-slate-800 outline-none focus:border-orange-400" />
                      </label>
                      <label className="block text-xs font-bold text-slate-600">Mensaje
                        <textarea value={cuerpoLibroMayor} onChange={(event) => setCuerpoLibroMayor(event.target.value)} rows={9} maxLength={12000} className="mt-1 block w-full resize-y rounded-lg border border-slate-300 px-3 py-3 text-sm font-normal leading-relaxed text-slate-800 outline-none focus:border-orange-400" />
                      </label>
                      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                        <label className="flex items-start gap-2 text-xs font-semibold text-slate-700"><input type="checkbox" checked={descargarPdfCorreo} onChange={(event) => setDescargarPdfCorreo(event.target.checked)} className="mt-0.5 accent-orange-500" /><span>Descargar el PDF para adjuntarlo al correo</span></label>
                        <span className="text-[11px] text-slate-500">Etiquetas: {'{business_name}'} · {'{contact_name}'} · {'{balance_due}'}</span>
                      </div>
                      <p className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2.5 text-xs leading-5 text-sky-900">GDA abrirá un borrador en la aplicación de correo del equipo. El navegador descarga el PDF, pero por seguridad no puede adjuntarlo automáticamente; adjuntalo al borrador antes de enviarlo. El mensaje no se envía hasta que lo confirmes allí.</p>
                    </div>
                    <footer className="flex flex-wrap justify-end gap-2 border-t border-slate-200 px-5 py-4">
                      <button type="button" onClick={() => setCorreoLibroMayorAbierto(false)} className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-bold text-slate-700 hover:bg-slate-50">Cancelar</button>
                      <button type="submit" disabled={cargandoPlantillaLibroMayor} className="rounded-lg bg-orange-500 px-5 py-2.5 text-sm font-extrabold text-white hover:bg-orange-600 disabled:cursor-wait disabled:opacity-60">{descargarPdfCorreo ? 'Descargar PDF y preparar correo' : 'Preparar correo'}</button>
                    </footer>
                  </form>
                </div>
              )}
          </div>
        );
      })()}

      {pagoSeleccionado && pagoAccion && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[10000] p-4" onClick={cerrarAccionPago}>
          <div className="bg-white rounded-lg shadow-2xl w-full max-w-md overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="bg-[#004284] px-5 py-4 flex justify-between items-center">
              <h3 className="text-white font-bold text-base">
                {pagoAccion === 'ver' ? 'Detalle del pago' : 'Editar pago'}
              </h3>
              <button type="button" onClick={cerrarAccionPago} className="text-white/80 hover:text-white text-xl leading-none" aria-label="Cerrar">✕</button>
            </div>

            {pagoAccion === 'ver' ? (
              <div className="p-5 text-sm flex flex-col gap-2">
                <p><span className="font-bold text-gray-600">Pagado el:</span> {pagoSeleccionado.fecha ? new Date(pagoSeleccionado.fecha).toLocaleString('es-PY') : '—'}</p>
                <p><span className="font-bold text-gray-600">Número de referencia:</span> {pagoSeleccionado.id ? String(pagoSeleccionado.id) : '—'}</p>
                <p><span className="font-bold text-gray-600">Cantidad:</span> {formatGs(pagoSeleccionado.monto)}</p>
                <p><span className="font-bold text-gray-600">Método de pago:</span> {pagoSeleccionado.metodo_pago || '—'}</p>
                <p><span className="font-bold text-gray-600">Pago por:</span> {pagoSeleccionado.cuenta_pago || nombreDelNegocio || '—'}</p>
                <p><span className="font-bold text-gray-600">Nota:</span> {pagoSeleccionado.nota || '—'}</p>
                <div className="flex justify-end pt-3 border-t mt-2">
                  <button type="button" onClick={cerrarAccionPago} className="border border-gray-300 text-gray-600 font-bold text-xs px-4 py-2 rounded hover:bg-gray-50">Cerrar</button>
                </div>
              </div>
            ) : (
              <div className="p-5 flex flex-col gap-4 text-sm">
                <div className="bg-gray-50 border border-gray-100 rounded p-3 text-xs">
                  <span className="font-bold text-gray-600">Cantidad:</span> {formatGs(pagoSeleccionado.monto)}
                  <p className="text-gray-400 mt-1">El monto no se edita aquí porque ya fue aplicado a las ventas del cliente.</p>
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">Pagado el:</label>
                  <input type="date" value={pagoEditandoFecha} onChange={(e) => setPagoEditandoFecha(e.target.value)} className="w-full border border-gray-300 rounded p-2.5 text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">Método de pago:</label>
                  <select value={pagoEditandoMetodo} onChange={(e) => setPagoEditandoMetodo(e.target.value)} className="w-full border border-gray-300 rounded p-2.5 text-sm bg-white">
                    <option>Efectivo</option>
                    <option>Transferencia</option>
                    <option>Tarjeta</option>
                    <option>Cheque</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">Nota:</label>
                  <textarea value={pagoEditandoNota} onChange={(e) => setPagoEditandoNota(e.target.value)} rows={3} className="w-full border border-gray-300 rounded p-2.5 text-sm" />
                </div>
                <div className="flex justify-end gap-2 pt-3 border-t">
                  <button type="button" onClick={cerrarAccionPago} className="border border-gray-300 text-gray-600 font-bold text-xs px-4 py-2 rounded hover:bg-gray-50">Cancelar</button>
                  <button type="button" onClick={guardarEdicionPagoLibroMayor} className="bg-cyan-500 hover:bg-cyan-600 text-white font-bold text-xs px-4 py-2 rounded">Guardar cambios</button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* MODAL: Pago de venta desde Libro Mayor */}
      {ventaPagar && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[9999] p-4" onClick={() => !guardandoPagoVenta && setVentaPagar(null)}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden max-h-[95vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="bg-gradient-to-r from-[#6f5ff0] to-[#5b4fcf] px-6 py-5 flex justify-between items-center">
              <h3 className="text-white font-bold text-lg">Registrar pago de venta</h3>
              <button onClick={() => setVentaPagar(null)} className="text-white/80 hover:text-white text-xl leading-none">✕</button>
            </div>

            <div className="p-6 overflow-y-auto flex flex-col gap-4 text-sm">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="bg-gray-50 border border-gray-100 rounded-lg p-3">
                  <p className="font-bold text-gray-700">Cliente: <span className="font-normal">{clienteLibroMayor?.nombre}</span></p>
                </div>
                <div className="bg-gray-50 border border-gray-100 rounded-lg p-3 text-xs leading-relaxed">
                  <p><span className="font-bold text-gray-700">Venta N.°:</span> {ventaPagar?.id ? String(ventaPagar.id).slice(0, 8).toUpperCase() : '—'}</p>
                  <p><span className="font-bold text-gray-700">Total:</span> {formatGs(ventaPagar?.total)}</p>
                  <p><span className="font-bold text-gray-700">Pagado:</span> {formatGs(ventaPagar?.montoPagadoActual ?? ventaPagar?.monto_pagado)}</p>
                  <p><span className="font-bold text-gray-700">Saldo adeudado:</span> {formatGs(ventaPagar?.saldoActual ?? ventaPagar?.saldo_pendiente)}</p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">Método de pago:*</label>
                  <select className="w-full border border-gray-300 rounded p-2.5 text-sm bg-white" value={metodoPagoVenta} onChange={(e) => setMetodoPagoVenta(e.target.value)}>
                    <option>Efectivo</option>
                    <option>Transferencia</option>
                    <option>Tarjeta</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">Pagado el:*</label>
                  <input type="date" className="w-full border border-gray-300 rounded p-2.5 text-sm" value={fechaPagoVenta} onChange={(e) => setFechaPagoVenta(e.target.value)} />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1">Cantidad:*</label>
                  <input autoFocus type="number" className="w-full border border-gray-300 rounded p-2.5 text-sm" value={montoPagoVenta} onChange={(e) => setMontoPagoVenta(e.target.value)} placeholder="0" />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">Cuenta de pago:</label>
                <select className="w-full border border-gray-300 rounded p-2.5 text-sm bg-white" value={cuentaPagoVenta} onChange={(e) => setCuentaPagoVenta(e.target.value)}>
                  <option value="Ninguna">Ninguna</option>
                  {cajasDisponibles.map((caja) => (
                    <option key={caja.id} value={caja.id}>
                      {caja.nombre} (Saldo: {Number(caja.saldo || 0).toLocaleString('es-PY')} {caja.moneda === 'Guarani (Gs)' ? 'Gs' : caja.moneda})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">Nota de pago:</label>
                <textarea className="w-full border border-gray-300 rounded p-2.5 text-sm" rows={3} value={notaPagoVenta} onChange={(e) => setNotaPagoVenta(e.target.value)} />
              </div>
            </div>

            <div className="px-6 py-4 border-t bg-gray-50 flex justify-end gap-3">
              <button type="button" disabled={guardandoPagoVenta} onClick={guardarPagoLibroMayor} className="bg-orange-500 hover:bg-orange-600 text-white font-bold text-sm px-6 py-2 rounded disabled:opacity-60">
                {guardandoPagoVenta ? 'Guardando...' : 'Guardar'}
              </button>
              <button type="button" disabled={guardandoPagoVenta} onClick={() => setVentaPagar(null)} className="bg-white border text-gray-600 font-bold text-sm px-6 py-2 rounded hover:bg-gray-100">Cerrar</button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Ventas del cliente */}
      {clienteVentas && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[9999] p-4" onClick={() => setClienteVentas(null)}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="bg-[#004284] px-5 py-4 flex justify-between items-center">
              <h3 className="text-white font-bold text-lg">Ventas — {clienteVentas.nombre}</h3>
              <button onClick={() => setClienteVentas(null)} className="text-white/80 hover:text-white text-xl leading-none">✕</button>
            </div>
            <div className="p-6 overflow-y-auto text-sm">
              {clienteVentas.ventasDelCliente.length === 0 ? (
                <p className="text-gray-400 text-xs">Este cliente todavía no tiene ventas registradas.</p>
              ) : (
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr className="text-gray-500 border-b"><th className="text-left py-1">Fecha</th><th className="text-left py-1">Estado</th><th className="text-right py-1">Total</th><th className="text-right py-1">Saldo</th></tr>
                  </thead>
                  <tbody>
                    {clienteVentas.ventasDelCliente.map((v) => (
                      <tr key={v.id} className="border-b border-gray-50">
                        <td className="py-1">{v.fecha ? new Date(v.fecha).toLocaleDateString('es-PY') : '—'}</td>
                        <td className="py-1">{v.estado_pago || '—'}</td>
                        <td className="py-1 text-right">{formatGs(v.total)}</td>
                        <td className="py-1 text-right">{formatGs(v.saldoActual ?? v.saldo_pendiente)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Documentos y notas */}
      {clienteDocumentos && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[9999] p-4" onClick={() => !guardandoNotas && setClienteDocumentos(null)}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="bg-[#004284] px-5 py-4 flex justify-between items-center">
              <h3 className="text-white font-bold text-lg">Documentos y notas</h3>
              <button onClick={() => setClienteDocumentos(null)} className="text-white/80 hover:text-white text-xl leading-none">✕</button>
            </div>
            <div className="p-6 flex flex-col gap-3 text-sm">
              <p className="text-[11px] text-gray-400">
                Tu sistema todavía no tiene un lugar para subir archivos adjuntos por cliente (contratos, comprobantes, etc.) — si querés que lo armemos, avisame. Por ahora podés dejar notas de texto acá:
              </p>
              <textarea
                className="w-full border border-gray-300 rounded p-2.5 text-sm"
                rows={5}
                placeholder="Notas internas sobre este cliente..."
                value={notasDoc}
                onChange={(e) => setNotasDoc(e.target.value)}
              />
              <div className="flex gap-2 justify-end pt-2 border-t">
                <button type="button" disabled={guardandoNotas} onClick={guardarNotas} className="bg-orange-500 hover:bg-orange-600 text-white font-bold text-sm px-5 py-2 rounded disabled:opacity-60">
                  {guardandoNotas ? 'Guardando...' : 'Guardar'}
                </button>
                <button type="button" disabled={guardandoNotas} onClick={() => setClienteDocumentos(null)} className="border text-gray-600 font-bold text-sm px-5 py-2 rounded hover:bg-gray-50">Cerrar</button>
              </div>
            </div>
          </div>
        </div>
      )}
      {/* LIGHTBOX: Foto ampliada del cliente */}
      {fotoAmpliada && (
        <div
          className="fixed inset-0 bg-black/80 flex items-center justify-center z-[99999] p-4"
          onClick={() => setFotoAmpliada(null)}
        >
          <div className="relative max-w-lg w-full" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={() => setFotoAmpliada(null)}
              className="absolute -top-10 right-0 text-white text-3xl font-bold hover:text-gray-300"
              title="Cerrar"
            >
              ✕
            </button>
            <img
              src={fotoAmpliada}
              alt="Foto del cliente"
              className="w-full max-h-[80vh] object-contain rounded-xl shadow-2xl"
            />
          </div>
        </div>
      )}

      {/* MODAL: Resultados Búsqueda RUC */}
      {mostrarModalRuc && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100000] p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl overflow-hidden max-h-[85vh] flex flex-col">
            <div className="bg-[#004284] px-5 py-4 flex justify-between items-center text-white">
              <h3 className="font-bold text-base flex items-center gap-2">🔍 Resultados de búsqueda RUC</h3>
              <button onClick={() => setMostrarModalRuc(false)} className="text-white/80 hover:text-white text-xl leading-none">✕</button>
            </div>
            <div className="p-6 overflow-y-auto text-xs flex-1">
              <p className="text-gray-500 mb-4 font-medium">Se encontraron múltiples registros coincidentes. Seleccioná el correcto para autocompletar:</p>
              <div className="border rounded overflow-hidden">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-gray-50 text-[#004284] font-bold border-b">
                      <th className="p-3">RUC</th>
                      <th className="p-3">Razón Social / Nombre</th>
                      <th className="p-3">Estado</th>
                      <th className="p-3 text-center">Acción</th>
                    </tr>
                  </thead>
                  <tbody>
                    {resultadosRuc.map((item, idx) => (
                      <tr key={idx} className="border-b hover:bg-gray-50">
                        <td className="p-3 font-mono font-bold text-gray-700">{item.fullRuc || `${item.ruc}-${item.dv}`}</td>
                        <td className="p-3 font-bold text-gray-800">{item.name}</td>
                        <td className="p-3">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                            item.state === 'ACTIVO' 
                              ? 'bg-green-100 text-green-800 border-green-200' 
                              : item.state === 'CANCELADO' 
                              ? 'bg-red-100 text-red-800 border-red-200' 
                              : 'bg-orange-100 text-orange-800 border-orange-200'
                          }`}>
                            {item.state}
                          </span>
                        </td>
                        <td className="p-3 text-center">
                          <button
                            type="button"
                            onClick={() => seleccionarResultadoRuc(item)}
                            className="bg-blue-600 hover:bg-blue-700 text-white font-bold px-3 py-1.5 rounded transition shadow-sm text-[11px]"
                          >
                            Seleccionar
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <div className="bg-gray-50 px-6 py-4 flex justify-end border-t">
              <button
                type="button"
                onClick={() => setMostrarModalRuc(false)}
                className="border text-gray-600 font-bold px-5 py-2 rounded hover:bg-gray-100 text-xs"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
