import { useEffect, useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from './supabaseClient';
import { sonidoExito, sonidoError } from './utils/sonido';
import { useEmpresaInfo } from './utils/useEmpresa';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

export default function Clientes() {
  const { id: empresaId, nombre: nombreDelNegocio, direccion: direccionEmpresa, telefono: telefonoEmpresa } = useEmpresaInfo();
  const [clientes, setClientes] = useState([]);
  const [ventasRaw, setVentasRaw] = useState([]);
  const [ubicacionesMap, setUbicacionesMap] = useState({});
  const [pagosRaw, setPagosRaw] = useState([]);
  const [busqueda, setBusqueda] = useState('');

  // Filtros tipo checkbox (reales, calculados desde tus ventas)
  const [filtroCreditosOtorgados, setFiltroCreditosOtorgados] = useState(false);
  const [filtroPagoRealizado, setFiltroPagoRealizado] = useState(false);
  const [filtroCreditoAFavor, setFiltroCreditoAFavor] = useState(false);

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
  const [libroMayorDesde, setLibroMayorDesde] = useState('');
  const [libroMayorHasta, setLibroMayorHasta] = useState('');
  const [libroMayorFormato, setLibroMayorFormato] = useState('Format 1');

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

  // Control de Acordeones
  const [acordeonIdentificacion, setAcordeonIdentificacion] = useState(true);
  const [acordeonContacto, setAcordeonContacto] = useState(true);
  const [acordeonUbicacion, setAcordeonUbicacion] = useState(false);
  const [acordeonCredito, setAcordeonCredito] = useState(false);
  const [acordeonFoto, setAcordeonFoto] = useState(false);
  const [acordeonDocumentos, setAcordeonDocumentos] = useState(false);

  // --- ESTADOS DEL FORMULARIO ---
  const [tipoContacto, setTipoContacto] = useState('Clientes');
  const [esEmpresa, setEsEmpresa] = useState(false);
  const [codigo, setCodigo] = useState('');
  const [tipoDoc, setTipoDoc] = useState('RUC');
  const [nroDoc, setNroDoc] = useState('');

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

  useEffect(() => {
    if (nombreDelNegocio) setVendedorAsignado((prev) => prev || nombreDelNegocio);
  }, [nombreDelNegocio]);

  useEffect(() => {
    cargarClientes();
    cargarVentas();
    cargarPagos();
    cargarUbicaciones();
  }, []);

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
      };
    });
  }, [clientes, ventasRaw, pagosRaw]);

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
      return true;
    });
  }, [clientesEnriquecidos, busqueda, filtroGrupo, filtroEstado, filtroCreditosOtorgados, filtroPagoRealizado, filtroCreditoAFavor]);

  // Paginación
  const totalPaginas = Math.max(1, Math.ceil(clientesFiltrados.length / entradasPorPagina));
  const paginaSegura = Math.min(paginaActual, totalPaginas);
  const clientesPagina = clientesFiltrados.slice(
    (paginaSegura - 1) * entradasPorPagina,
    paginaSegura * entradasPorPagina
  );

  const gruposDisponibles = [...new Set(clientes.map((c) => c.grupo_clientes).filter(Boolean))];
  const estadosDisponibles = [...new Set(clientes.map((c) => c.estado).filter(Boolean))];

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
  const guardarCliente = async (e) => {
    e.preventDefault();

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
    };

    // 5. Enviar a Supabase: actualizar si estamos editando, o crear si es nuevo
    const { error } = clienteEditando
      ? await supabase.from('clientes').update(datosCliente).eq('id', clienteEditando.id).eq('empresa_id', empresaId)
      : await supabase.from('clientes').insert([{ ...datosCliente, estado: 'Activo' }]);

    if (error) {
      alert('Error al guardar: ' + error.message);
    } else {
      sonidoExito();
      alert(clienteEditando ? '¡Cliente actualizado exitosamente!' : '¡Cliente registrado exitosamente con todos sus datos!');
      setMostrarModalAñadir(false);
      setClienteEditando(null);
      resetearFormulario();
      cargarClientes();
    }
  };

  const resetearFormulario = () => {
    setTipoContacto('Clientes'); setEsEmpresa(false); setCodigo(''); setTipoDoc('RUC'); setNroDoc('');
    setPrefijo(''); setNombre(''); setSegundoNombre(''); setApellido(''); setNombreEmpresa(''); setRepresentanteLegal('');
    setTelefono(''); setEmail(''); setFechaNacimiento('');
    setPais('Paraguay'); setDepartamento('-- Depto --'); setCiudad(''); setDireccionCalle(''); setNroCasa(''); setEdificioPiso(''); setCodPostal('7700');
    setVendedorAsignado(nombreDelNegocio); setGrupoClientes('Ninguna'); setSaldoInicial('0'); setTerminoPagoNum(''); setTerminoPagoTipo('Dias'); setLimiteCredito('0');
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
    setMostrarModalAñadir(true);
  };

  const handleEliminarCliente = async (cliente) => {
    if (!window.confirm(`¿Eliminar permanentemente a "${cliente.nombre}"? Esta acción no se puede deshacer.`)) return;

    try {
      const { error } = await supabase.from('clientes').delete().eq('id', cliente.id).eq('empresa_id', empresaId);
      if (error) throw error;

      setClientes((prev) => prev.filter((c) => c.id !== cliente.id));
      sonidoExito();
      alert('Cliente eliminado correctamente.');
    } catch (error) {
      sonidoError();
      console.error('Error al eliminar cliente:', error.message);
      alert('Hubo un error al eliminar el cliente: ' + error.message);
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
      // Buscamos el nombre de la caja elegida (guardamos el nombre en el historial,
      // como ya hacía este campo, que es de tipo texto)
      const cajaElegida = cuentaPago !== 'Ninguna' ? cajasDisponibles.find((c) => c.id === cuentaPago) : null;

      // 1) Dejamos registrado el pago (esto ya funcionaba y sirve como historial/comprobante)
      const { error: errorPago } = await supabase.from('pagos_clientes').insert([{
        empresa_id: empresaId,
        cliente_id: clientePagar.id,
        monto,
        metodo_pago: metodoPago,
        nota: notaPago || null,
        fecha: fechaPago ? new Date(fechaPago).toISOString() : new Date().toISOString(),
        cuenta_pago: cajaElegida ? cajaElegida.nombre : null,
        documento_url: documentoPago || null,
      }]);
      if (errorPago) throw errorPago;

      // 1.b) Si eligieron una caja/cuenta real, el pago del cliente entra como
      // dinero a esa caja: le sumamos el monto a su saldo.
      if (cajaElegida) {
        const { error: errorCaja } = await supabase
          .from('cuentas_caja')
          .update({ saldo: Number(cajaElegida.saldo || 0) + monto })
          .eq('id', cajaElegida.id)
          .eq('empresa_id', empresaId);
        if (errorCaja) throw errorCaja;
      }

      // 2) APLICAMOS EL PAGO DE VERDAD sobre las ventas a crédito del cliente,
      // de la más vieja a la más nueva (FIFO), actualizando saldo_pendiente y
      // estado_pago directamente en la tabla "ventas" de Supabase. Esto ya no
      // es un cálculo de pantalla: queda guardado en la base de datos.
      let queryVentasPendientes = supabase
        .from('ventas')
        .select('id, total, monto_pagado, saldo_pendiente, estado_pago, fecha')
        .in('cliente', [clientePagar.nombre, clientePagar.nombre_empresa].filter(Boolean))
        .gt('saldo_pendiente', 0)
        .order('fecha', { ascending: true });
      if (empresaId) queryVentasPendientes = queryVentasPendientes.eq('empresa_id', empresaId);
      const { data: ventasPendientes, error: errorVentas } = await queryVentasPendientes;
      if (errorVentas) throw errorVentas;

      let restante = monto;
      for (const venta of ventasPendientes || []) {
        if (restante <= 0) break;
        const saldoActualVenta = Number(venta.saldo_pendiente) || 0;
        const aplicado = Math.min(restante, saldoActualVenta);
        if (aplicado <= 0) continue;
        const nuevoSaldo = Math.max(0, saldoActualVenta - aplicado);
        const nuevoEstado = nuevoSaldo <= 0 ? 'Pagado' : 'Pago Parcial';
        const { error: errorUpdate } = await supabase
          .from('ventas')
          .update({ saldo_pendiente: nuevoSaldo, estado_pago: nuevoEstado })
          .eq('id', venta.id);
        if (errorUpdate) throw errorUpdate;
        restante -= aplicado;
      }

      sonidoExito();
      if (restante > 0) {
        alert(`Pago registrado. ${formatGs(restante)} quedaron como crédito a favor del cliente (no había más deuda pendiente a la cual aplicarlos).`);
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
        Clientes <span className="text-sm font-normal text-gray-500">Administra tus Clientes</span>
      </h2>

      {/* FILTROS SUPERIORES */}
      <div className="bg-white p-4 rounded-lg shadow-sm border-t-2 border-[#004284] mb-4">
        <h3 className="text-xs font-bold text-gray-500 mb-4 flex items-center gap-1 uppercase">
          Filtros
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
          <label className="flex items-center gap-2 text-xs font-bold text-gray-700 cursor-pointer">
            <input type="checkbox" checked={filtroCreditosOtorgados} onChange={(e) => { setFiltroCreditosOtorgados(e.target.checked); setPaginaActual(1); }} />
            Creditos otorgados
          </label>
          <label className="flex items-center gap-2 text-xs font-bold text-gray-400 cursor-not-allowed" title="Necesita el modulo de Devoluciones (todavia no existe en tu sistema)">
            <input type="checkbox" disabled />
            Devolucion de Venta
          </label>
          <label className="flex items-center gap-2 text-xs font-bold text-gray-700 cursor-pointer">
            <input type="checkbox" checked={filtroPagoRealizado} onChange={(e) => { setFiltroPagoRealizado(e.target.checked); setPaginaActual(1); }} />
            Pago Realizado
          </label>
          <label className="flex items-center gap-2 text-xs font-bold text-gray-700 cursor-pointer">
            <input type="checkbox" checked={filtroCreditoAFavor} onChange={(e) => { setFiltroCreditoAFavor(e.target.checked); setPaginaActual(1); }} />
            Credito a favor
          </label>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <label className="block text-xs font-bold text-gray-700 mb-1">Grupo de clientes:</label>
            <select className="w-full border rounded p-2 bg-white outline-none" value={filtroGrupo} onChange={(e) => { setFiltroGrupo(e.target.value); setPaginaActual(1); }}>
              <option>Ninguna</option>
              {gruposDisponibles.map((g) => <option key={g}>{g}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-700 mb-1">Estado:</label>
            <select className="w-full border rounded p-2 bg-white outline-none" value={filtroEstado} onChange={(e) => { setFiltroEstado(e.target.value); setPaginaActual(1); }}>
              <option>Ninguna</option>
              {estadosDisponibles.map((es) => <option key={es}>{es}</option>)}
            </select>
          </div>
        </div>
      </div>

      {/* TABLA PRINCIPAL DE ENTRADAS */}
      <div className="bg-white rounded-lg shadow-sm border-t-2 border-[#004284]">
        <div className="p-4 border-b flex justify-between items-center">
          <h3 className="text-base font-bold text-gray-700">Todos sus Clientes</h3>
          <button onClick={() => { setClienteEditando(null); resetearFormulario(); setMostrarModalAñadir(true); }} className="bg-[#fd7e14] text-white px-4 py-2 rounded text-sm font-bold hover:bg-[#e86e04] transition shadow-sm">
            + Añadir
          </button>
        </div>

        <div className="p-4">
          <div className="flex flex-wrap justify-between items-center gap-3 mb-4">
            <div className="flex items-center gap-2 text-gray-600 font-medium">
              <span>Mostrar</span>
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
              <span>entradas</span>
            </div>

            <div className="flex flex-wrap gap-2">
              <button onClick={exportarCSV} className="border rounded px-3 py-1.5 text-xs font-bold text-gray-600 hover:bg-gray-50">Exportar a CSV</button>
              <button onClick={exportarExcel} className="border rounded px-3 py-1.5 text-xs font-bold text-gray-600 hover:bg-gray-50">Exportar a Excel</button>
              <button onClick={() => window.print()} className="border rounded px-3 py-1.5 text-xs font-bold text-gray-600 hover:bg-gray-50">Imprimir</button>
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
              <button onClick={exportarPDF} className="border rounded px-3 py-1.5 text-xs font-bold text-gray-600 hover:bg-gray-50">Exportar a PDF</button>
            </div>

            <input type="text" className="border rounded p-1.5 w-64 outline-none focus:border-blue-500 text-xs" placeholder="Buscar ..." value={busqueda} onChange={(e) => { setBusqueda(e.target.value); setPaginaActual(1); }} />
          </div>

          <div className="overflow-x-auto border rounded">
            <table className="w-full text-left text-[11px] border-collapse whitespace-nowrap">
              <thead>
                <tr className="bg-gray-50 text-[#004284] font-black uppercase border-b-2">
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
                  <tr><td colSpan="17" className="text-center py-10 text-gray-400 font-medium text-sm">No hay datos disponibles en la tabla</td></tr>
                ) : (
                  clientesPagina.map((cliente) => (
                    <tr key={cliente.id} className="border-b hover:bg-gray-50 text-gray-700">
                      <td className="p-2 relative">
                        <button
                          onClick={(e) => {
                            if (menuAccionesAbierto === cliente.id) {
                              setMenuAccionesAbierto(null);
                            } else {
                              const rect = e.currentTarget.getBoundingClientRect();
                              const anchoMenu = 176; // w-44
                              const left = Math.min(rect.left, window.innerWidth - anchoMenu - 8);
                              const top = Math.min(rect.bottom + 4, window.innerHeight - 8);
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
                              style={{ top: menuAccionesPos.top, left: menuAccionesPos.left }}
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
                              ⏻ {cliente.estado === 'Inactivo' ? 'Activar' : 'Deactivate'}
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
                      <td className="p-3 font-bold text-gray-800">{cliente.nombre}</td>
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
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-[9999] p-4">
          <div className="bg-white w-full max-w-5xl rounded-lg shadow-2xl overflow-hidden flex flex-col max-h-[95vh]">

            <div className="px-6 py-4 border-b flex justify-between items-center bg-[#1b2032] text-white">
              <h3 className="text-lg font-bold flex items-center gap-2">
                👤 {clienteEditando ? 'EDITAR CLIENTE' : 'NUEVO CLIENTE'}
              </h3>
              <button onClick={() => { setMostrarModalAñadir(false); setClienteEditando(null); }} className="text-white/70 hover:text-white text-2xl font-bold">×</button>
            </div>

            <div className="p-6 overflow-y-auto bg-gray-50 flex-1 text-xs">
              <form id="form-cliente" onSubmit={guardarCliente}>

                {/* SELECTORES DE CABECERA */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6 items-end">
                  <div>
                    <label className="block font-bold text-gray-700 uppercase mb-1">TIPO DE CONTACTO *</label>
                    {/* Esta pantalla solo registra personas/clientes. Los proveedores
                        se registran desde la pantalla "Proveedores" para que no se mezclen. */}
                    <select className="w-full border rounded p-2.5 bg-gray-100 outline-none" value={tipoContacto} onChange={(e) => setTipoContacto(e.target.value)} disabled>
                      <option value="Clientes">Clientes</option>
                    </select>
                  </div>

                  <div className="flex border rounded overflow-hidden shadow-sm h-[42px]">
                    <button type="button" onClick={() => setEsEmpresa(false)} className={`flex-1 font-bold flex items-center justify-center gap-2 transition-colors ${!esEmpresa ? 'bg-gray-200 text-gray-800 border-b-2 border-blue-500' : 'bg-white text-gray-500'}`}>
                      <span></span> Individual
                    </button>
                    <button type="button" onClick={() => setEsEmpresa(true)} className={`flex-1 font-bold flex items-center justify-center gap-2 transition-colors ${esEmpresa ? 'bg-gray-200 text-gray-800 border-b-2 border-blue-500' : 'bg-white text-gray-500'}`}>
                      <span></span> Empresa
                    </button>
                  </div>

                  <div>
                    <label className="block font-bold text-gray-700 uppercase mb-1">CÓDIGO</label>
                    <input type="text" className="w-full border rounded p-2.5 bg-gray-100 outline-none" placeholder="Automático" value={codigo} onChange={(e) => setCodigo(e.target.value)} disabled />
                  </div>
                </div>

                {/* CAJA DE REGISTRO FISCAL */}
                <div className="border border-blue-100 bg-blue-50/40 p-4 rounded-lg mb-6">
                  <h4 className="text-[#004284] font-bold mb-3 flex items-center gap-1">🔍 BUSCAR O REGISTRAR CONTACTO</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block font-bold text-[#004284] uppercase mb-1">TIPO DOC.</label>
                      <select className="w-full border rounded p-2 bg-white" value={tipoDoc} onChange={(e) => setTipoDoc(e.target.value)}>
                        <option value="RUC">RUC</option>
                        <option value="CÉDULA DE IDENTIDAD">CÉDULA DE IDENTIDAD</option>
                        <option value="PASAPORTE">PASAPORTE</option>
                      </select>
                    </div>
                    <div>
                      <label className="block font-bold text-[#004284] uppercase mb-1">NRO. DOCUMENTO *</label>
                      <div className="flex gap-2">
                        <input type="text" className="w-full border rounded p-2 bg-white outline-none focus:border-orange-500" placeholder="Ej: 4671379-4" required value={nroDoc} onChange={(e) => setNroDoc(e.target.value)} />
                        <button type="button" title="Búsqueda automática de RUC (próximamente)" onClick={() => alert('La búsqueda automática de RUC todavía no está conectada a ningún padrón — cargá los datos a mano por ahora.')} className="bg-orange-500 hover:bg-orange-600 text-white rounded-full w-10 h-10 flex items-center justify-center shrink-0 shadow-sm">🔍</button>
                      </div>
                    </div>
                  </div>
                </div>

                {/* 1. ACORDEÓN: IDENTIFICACIÓN (DINÁMICO INDIVIDUAL / EMPRESA) */}
                <div className="bg-white border rounded-lg mb-3 overflow-hidden shadow-sm">
                  <div className="p-3 bg-white flex justify-between items-center cursor-pointer border-b" onClick={() => setAcordeonIdentificacion(!acordeonIdentificacion)}>
                    <h4 className="font-bold text-[#004284]">Identificación</h4>
                    <span className="text-gray-400 font-bold">{acordeonIdentificacion ? '' : ''}</span>
                  </div>

                  {acordeonIdentificacion && (
                    <div className="p-4">
                      {esEmpresa ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 animate-fade-in">
                          <div>
                            <label className="block font-bold text-gray-700 uppercase mb-1">RAZÓN SOCIAL / NOMBRE COMERCIAL *</label>
                            <input type="text" className="w-full border rounded p-2 bg-white outline-none focus:border-orange-500" placeholder="Nombre de la Empresa / Razón Social" required={esEmpresa} value={nombreEmpresa} onChange={(e) => setNombreEmpresa(e.target.value)} />
                          </div>
                          <div>
                            <label className="block font-bold text-gray-700 uppercase mb-1">REPRESENTANTE LEGAL</label>
                            <input type="text" className="w-full border rounded p-2 bg-white outline-none focus:border-orange-500" placeholder="Nombre del Representante" value={representanteLegal} onChange={(e) => setRepresentanteLegal(e.target.value)} />
                          </div>
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 animate-fade-in">
                          <div>
                            <label className="block font-bold text-gray-700 uppercase mb-1">PREFIJO</label>
                            <input type="text" className="w-full border rounded p-2 bg-white outline-none" placeholder="—" value={prefijo} onChange={(e) => setPrefijo(e.target.value)} />
                          </div>
                          <div>
                            <label className="block font-bold text-gray-700 uppercase mb-1">NOMBRE *</label>
                            <input type="text" className="w-full border rounded p-2 bg-white outline-none" placeholder="Nombre" required={!esEmpresa} value={nombre} onChange={(e) => setNombre(e.target.value)} />
                          </div>
                          <div>
                            <label className="block font-bold text-gray-700 uppercase mb-1">SEGUNDO NOMBRE</label>
                            <input type="text" className="w-full border rounded p-2 bg-white outline-none" placeholder="Segundo nombre" value={segundoNombre} onChange={(e) => setSegundoNombre(e.target.value)} />
                          </div>
                          <div>
                            <label className="block font-bold text-gray-700 uppercase mb-1">APELLIDO *</label>
                            <input type="text" className="w-full border rounded p-2 bg-white outline-none" placeholder="Apellido" required={!esEmpresa} value={apellido} onChange={(e) => setApellido(e.target.value)} />
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* ACORDEONES: FOTO Y DOCUMENTOS (visuales por ahora, sin subida real) */}
                <div className="bg-white border rounded-lg mb-3 overflow-hidden shadow-sm">
                  <div className="p-3 bg-white flex justify-between items-center cursor-pointer border-b" onClick={() => setAcordeonFoto(!acordeonFoto)}>
                    <h4 className="font-bold text-gray-600 flex items-center gap-1"><span>📷</span> Foto del Cliente</h4>
                    <span className="text-gray-400 font-bold">{acordeonFoto ? '▲' : '▼'}</span>
                  </div>
                  {acordeonFoto && (
                    <div className="p-4 text-gray-400 italic">La carga de fotos todavía no está conectada — próximamente.</div>
                  )}
                </div>

                <div className="bg-white border rounded-lg mb-3 overflow-hidden shadow-sm">
                  <div className="p-3 bg-white flex justify-between items-center cursor-pointer border-b" onClick={() => setAcordeonDocumentos(!acordeonDocumentos)}>
                    <h4 className="font-bold text-gray-600 flex items-center gap-1"><span>📎</span> Cargar Documentos <span className="text-[10px] font-normal normal-case text-gray-400">(CI, contratos, etc.)</span></h4>
                    <span className="text-gray-400 font-bold">{acordeonDocumentos ? '▲' : '▼'}</span>
                  </div>
                  {acordeonDocumentos && (
                    <div className="p-4 text-gray-400 italic">La carga de documentos todavía no está conectada — próximamente.</div>
                  )}
                </div>

                {/* 2. ACORDEÓN: CONTACTO */}
                <div className="bg-white border rounded-lg mb-3 overflow-hidden shadow-sm">
                  <div className="p-3 bg-white flex justify-between items-center cursor-pointer border-b" onClick={() => setAcordeonContacto(!acordeonContacto)}>
                    <h4 className="font-bold text-green-600 flex items-center gap-1"><span>📞</span> Contacto</h4>
                    <span className="text-gray-400 font-bold">{acordeonContacto ? '▲' : '▼'}</span>
                  </div>
                  {acordeonContacto && (
                    <div className="p-4 grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div>
                        <label className="block font-bold text-gray-700 uppercase mb-1">TELÉFONO</label>
                        <input type="text" className="w-full border rounded p-2 bg-white outline-none" placeholder="Celular / Teléfono" value={telefono} onChange={(e) => setTelefono(e.target.value)} />
                      </div>
                      <div>
                        <label className="block font-bold text-gray-700 uppercase mb-1">EMAIL</label>
                        <input type="email" className="w-full border rounded p-2 bg-white outline-none" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
                      </div>
                      <div>
                        <label className="block font-bold text-gray-700 uppercase mb-1">FECHA NACIMIENTO</label>
                        <input type="date" className="w-full border rounded p-2 bg-white outline-none" value={fechaNacimiento} onChange={(e) => setFechaNacimiento(e.target.value)} />
                      </div>
                    </div>
                  )}
                </div>

                {/* 3. ACORDEÓN: UBICACIÓN Y DATOS FISCALES */}
                <div className="bg-white border rounded-lg mb-3 overflow-hidden shadow-sm">
                  <div className="p-3 bg-white flex justify-between items-center cursor-pointer border-b hover:bg-gray-50" onClick={() => setAcordeonUbicacion(!acordeonUbicacion)}>
                    <h4 className="font-bold text-red-500 flex items-center gap-1"><span>📍</span> Ubicación y Datos Fiscales</h4>
                    <span className="text-gray-400 font-bold">{acordeonUbicacion ? '' : ''}</span>
                  </div>
                  {acordeonUbicacion && (
                    <div className="p-4 grid grid-cols-1 md:grid-cols-4 gap-4 animate-fade-in">
                      <div>
                        <label className="block font-bold text-gray-700 uppercase mb-1">PAÍS</label>
                        <select className="w-full border rounded p-2 bg-white" value={pais} onChange={(e) => setPais(e.target.value)}>
                          <option value="Paraguay">Paraguay</option>
                          <option value="Brasil">Brasil</option>
                          <option value="Argentina">Argentina</option>
                        </select>
                      </div>
                      <div>
                        <label className="block font-bold text-gray-700 uppercase mb-1">DEPARTAMENTO</label>
                        <select className="w-full border rounded p-2 bg-white" value={departamento} onChange={(e) => setDepartamento(e.target.value)}>
                          <option value="-- Depto --">-- Depto --</option>
                          <option value="ALTO PARANA">ALTO PARANA</option>
                          <option value="CENTRAL">CENTRAL</option>
                          <option value="ITAPUA">ITAPUA</option>
                          <option value="CAPITAL">CAPITAL</option>
                        </select>
                      </div>
                      <div>
                        <label className="block font-bold text-gray-700 uppercase mb-1">CIUDAD</label>
                        <input type="text" className="w-full border rounded p-2 bg-white outline-none" placeholder="Ciudad" value={ciudad} onChange={(e) => setCiudad(e.target.value)} />
                      </div>
                      <div>
                        <label className="block font-bold text-gray-700 uppercase mb-1">CÓD. POSTAL</label>
                        <input type="text" className="w-full border rounded p-2 bg-white outline-none" value={codPostal} onChange={(e) => setCodPostal(e.target.value)} />
                      </div>
                      <div className="md:col-span-2">
                        <label className="block font-bold text-gray-700 uppercase mb-1">DIRECCIÓN (CALLE / BARRIO / AV)</label>
                        <input type="text" className="w-full border rounded p-2 bg-white outline-none" placeholder="Calle / Barrio / Av / Referencia" value={direccionCalle} onChange={(e) => setDireccionCalle(e.target.value)} />
                      </div>
                      <div>
                        <label className="block font-bold text-gray-700 uppercase mb-1">NRO. CASA</label>
                        <input type="text" className="w-full border rounded p-2 bg-white outline-none" placeholder="Ej: 123" value={nroCasa} onChange={(e) => setNroCasa(e.target.value)} />
                      </div>
                      <div>
                        <label className="block font-bold text-gray-700 uppercase mb-1">EDIFICIO / PISO / DPTO</label>
                        <input type="text" className="w-full border rounded p-2 bg-white outline-none" placeholder="Opcional" value={edificioPiso} onChange={(e) => setEdificioPiso(e.target.value)} />
                      </div>
                    </div>
                  )}
                </div>

                {/* 4. ACORDEÓN: CRÉDITO Y CONDICIONES */}
                <div className="bg-white border rounded-lg mb-3 overflow-hidden shadow-sm">
                  <div className="p-3 bg-white flex justify-between items-center cursor-pointer border-b hover:bg-gray-50" onClick={() => setAcordeonCredito(!acordeonCredito)}>
                    <h4 className="font-bold text-purple-600 flex items-center gap-1"><span>💳</span> Crédito y Condiciones</h4>
                    <span className="text-gray-400 font-bold">{acordeonCredito ? '' : ''}</span>
                  </div>
                  {acordeonCredito && (
                    <div className="p-4 grid grid-cols-1 md:grid-cols-4 gap-4 animate-fade-in">
                      <div>
                        <label className="block font-bold text-gray-700 uppercase mb-1">VENDEDOR ASIGNADO</label>
                        <select className="w-full border rounded p-2 bg-white" value={vendedorAsignado} onChange={(e) => setVendedorAsignado(e.target.value)}>
                          <option value={nombreDelNegocio}>{nombreDelNegocio}</option>
                          <option value="Richard Richard">Richard Richard</option>
                          <option value="Fabian">Fabian</option>
                        </select>
                      </div>
                      <div>
                        <label className="block font-bold text-gray-700 uppercase mb-1">GRUPO DE CLIENTES</label>
                        <select className="w-full border rounded p-2 bg-white" value={grupoClientes} onChange={(e) => setGrupoClientes(e.target.value)}>
                          <option value="Ninguna">Ninguna</option>
                          <option value="Cliente Vip">Cliente Vip</option>
                          <option value="Regular">Regular</option>
                        </select>
                      </div>
                      <div>
                        <label className="block font-bold text-gray-700 uppercase mb-1">SALDO INICIAL</label>
                        <input type="number" className="w-full border rounded p-2 bg-white outline-none" value={saldoInicial} onChange={(e) => setSaldoInicial(e.target.value)} />
                      </div>
                      <div>
                        <label className="block font-bold text-gray-700 uppercase mb-1">LÍMITE DE CRÉDITO</label>
                        <input type="number" className="w-full border rounded p-2 bg-white outline-none" value={limiteCredito} onChange={(e) => setLimiteCredito(e.target.value)} />
                        <span className="text-[10px] text-gray-400">Dejar en 0 para "Sin límite"</span>
                      </div>
                      <div className="md:col-span-2">
                        <label className="block font-bold text-gray-700 uppercase mb-1">TÉRMINO DE PAGO</label>
                        <div className="flex gap-2">
                          <input type="number" className="w-1/2 border rounded p-2 bg-white outline-none" placeholder="N°" value={terminoPagoNum} onChange={(e) => setTerminoPagoNum(e.target.value)} />
                          <select className="w-1/2 border rounded p-2 bg-white" value={terminoPagoTipo} onChange={(e) => setTerminoPagoTipo(e.target.value)}>
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
            <div className="px-6 py-4 border-t bg-gray-50 flex justify-end items-center gap-3">
              <button type="button" onClick={() => { setMostrarModalAñadir(false); setClienteEditando(null); }} className="bg-white border text-gray-700 px-5 py-2 rounded font-bold hover:bg-gray-100 transition shadow-sm">Cerrar</button>
              <button type="submit" form="form-cliente" className="bg-[#fd7e14] text-white px-6 py-2 rounded font-bold hover:bg-[#e86e04] transition shadow-md flex items-center gap-1"><span></span> Guardar</button>
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

      {/* MODAL: Libro mayor (clon de la vista "Ver contacto" de CDEpos) */}
      {clienteLibroMayor && (() => {
        const cliente = clienteLibroMayor;
        const iniciales = (cliente.nombre || '?').trim().split(/\s+/).slice(0, 2).map((p) => p[0]).join('').toUpperCase();

        // Armamos los movimientos (ventas + pagos) para la tabla estilo "libro mayor"
        const movimientos = [
          ...cliente.ventasDelCliente.map((v) => ({
            fecha: v.fecha,
            referencia: v.id ? `#${String(v.id).slice(0, 8).toUpperCase()}` : '—',
            tipo: 'Ventas',
            ubicacion: nombreDelNegocio || '—',
            estadoPago: v.estado_pago || '—',
            debito: Number(v.total) || 0,
            credito: 0,
            metodoPago: v.metodo_pago || '—',
            otros: '',
          })),
          ...cliente.pagosManuales.map((p) => ({
            fecha: p.fecha,
            referencia: '—',
            tipo: 'Pago',
            ubicacion: nombreDelNegocio || '—',
            estadoPago: '—',
            debito: 0,
            credito: Number(p.monto) || 0,
            metodoPago: p.metodo_pago || '—',
            otros: p.nota ? `Nota: ${p.nota}` : '',
          })),
        ].sort((a, b) => new Date(a.fecha || 0) - new Date(b.fecha || 0));

        const movimientosFiltrados = movimientos.filter((m) => {
          if (!m.fecha) return true;
          const f = new Date(m.fecha).toISOString().slice(0, 10);
          if (libroMayorDesde && f < libroMayorDesde) return false;
          if (libroMayorHasta && f > libroMayorHasta) return false;
          return true;
        });

        let saldoAcumulado = 0;
        const filasConSaldo = movimientosFiltrados.map((m) => {
          saldoAcumulado += m.debito - m.credito;
          return { ...m, saldo: saldoAcumulado };
        });

        return (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[9999] p-4" onClick={() => setClienteLibroMayor(null)}>
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-5xl overflow-hidden max-h-[92vh] flex flex-col" onClick={(e) => e.stopPropagation()}>

              {/* Encabezado */}
              <div className="bg-[#004284] px-5 py-4 flex justify-between items-center flex-shrink-0">
                <h3 className="text-white font-bold text-lg">Ver contacto</h3>
                <button onClick={() => setClienteLibroMayor(null)} className="text-white/80 hover:text-white text-xl leading-none">✕</button>
              </div>

              <div className="overflow-y-auto p-5">
                {/* Tarjeta del contacto */}
                <div className="border rounded-lg p-4 flex flex-wrap justify-between items-center gap-4 mb-4">
                  <div className="flex items-center gap-4">
                    <div className="w-16 h-16 rounded-full bg-[#004284] text-white flex items-center justify-center font-bold text-xl flex-shrink-0">
                      {iniciales}
                    </div>
                    <div>
                      <p className="font-bold text-gray-800 text-base">{cliente.nombre}</p>
                      <p className="text-xs text-gray-500">{cliente.tipo_contacto || 'Cliente'}</p>
                      <p className="text-xs text-gray-500">{cliente.direccion || 'SIN DIRECCIÓN'}</p>
                      {cliente.celular && (
                        <p className="text-xs text-gray-600 flex items-center gap-1 mt-1">📱 {cliente.celular}</p>
                      )}
                    </div>
                  </div>
                  <span className="text-xs font-bold text-gray-500">{cliente.codigo_cliente}</span>
                </div>

                {/* Pestañas */}
                <div className="flex gap-6 border-b mb-4 text-sm font-bold text-gray-500 flex-wrap">
                  <button
                    onClick={() => setLibroMayorTab('libro')}
                    className={`pb-2 px-1 ${libroMayorTab === 'libro' ? 'text-[#004284] border-b-2 border-[#004284]' : 'hover:text-gray-700'}`}
                  >
                    📒 Libro mayor
                  </button>
                  <button
                    onClick={() => setLibroMayorTab('ventas')}
                    className={`pb-2 px-1 ${libroMayorTab === 'ventas' ? 'text-[#004284] border-b-2 border-[#004284]' : 'hover:text-gray-700'}`}
                  >
                    🧾 Ventas
                  </button>
                  <button
                    onClick={() => { setClienteLibroMayor(null); abrirDocumentosNotas(cliente); }}
                    className="pb-2 px-1 hover:text-gray-700"
                  >
                    📎 Documentos y notas
                  </button>
                  <button
                    onClick={() => setLibroMayorTab('pagos')}
                    className={`pb-2 px-1 ${libroMayorTab === 'pagos' ? 'text-[#004284] border-b-2 border-[#004284]' : 'hover:text-gray-700'}`}
                  >
                    💳 Pagos
                  </button>
                </div>

                {libroMayorTab === 'libro' && (
                  <>
                    {/* Controles: rango de fechas / formato / ubicación */}
                    <div className="flex flex-wrap gap-6 mb-5">
                      <div>
                        <p className="text-xs font-bold text-gray-600 mb-1">Rango de fechas:</p>
                        <div className="flex items-center gap-2">
                          <input type="date" value={libroMayorDesde} onChange={(e) => setLibroMayorDesde(e.target.value)} className="border rounded px-2 py-1 text-xs" />
                          <span className="text-xs text-gray-400">-</span>
                          <input type="date" value={libroMayorHasta} onChange={(e) => setLibroMayorHasta(e.target.value)} className="border rounded px-2 py-1 text-xs" />
                        </div>
                      </div>
                      <div>
                        <p className="text-xs font-bold text-gray-600 mb-1">Ledger format</p>
                        <div className="flex border rounded overflow-hidden">
                          {['Format 1', 'Format 2'].map((f) => (
                            <button
                              key={f}
                              onClick={() => setLibroMayorFormato(f)}
                              className={`px-3 py-1 text-xs font-bold ${libroMayorFormato === f ? 'bg-gray-200 text-gray-800' : 'bg-white text-gray-500 hover:bg-gray-50'}`}
                            >
                              {f}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div>
                        <p className="text-xs font-bold text-gray-600 mb-1">Ubicación de la empresa:</p>
                        <select className="border rounded px-2 py-1 text-xs" defaultValue="Todas">
                          <option value="Todas">Todas las localizaciones</option>
                        </select>
                      </div>
                    </div>

                    {/* Datos de empresa / cliente */}
                    <div className="flex flex-wrap justify-between gap-4 mb-4 text-xs">
                      <div>
                        <div className="bg-[#004284] text-white font-bold px-3 py-1 w-fit mb-2">A:</div>
                        <p className="font-bold text-gray-800">{cliente.nombre}</p>
                        <p className="text-gray-600">{cliente.direccion || 'SIN DIRECCIÓN'}</p>
                        {cliente.celular && <p className="text-gray-600">Celular: {cliente.celular}</p>}
                        {cliente.documento_nro && <p className="text-gray-600">Documento N.°: {cliente.documento_nro}</p>}
                      </div>
                      <div className="text-right">
                        <p className="font-bold text-gray-800">{nombreDelNegocio || 'Tu negocio'}</p>
                        {direccionEmpresa && <p className="text-gray-600">{direccionEmpresa}</p>}
                        {telefonoEmpresa && <p className="text-gray-600">Tel: {telefonoEmpresa}</p>}
                      </div>
                    </div>

                    {/* Resumen de la cuenta */}
                    <div className="border rounded-lg overflow-hidden mb-5">
                      <div className="bg-[#004284] text-white font-bold text-sm text-center py-2">
                        Resumen de la cuenta
                        <p className="text-[10px] font-normal text-white/70">{libroMayorDesde} a {libroMayorHasta}</p>
                      </div>
                      <div className="divide-y text-sm">
                        <div className="flex justify-between px-4 py-2"><span className="text-gray-600">Crédito a favor</span><span className="font-bold text-gray-800">{formatGs(cliente.creditoAFavor)}</span></div>
                        <div className="flex justify-between px-4 py-2"><span className="text-gray-600">Total de la factura</span><span className="font-bold text-gray-800">{formatGs(cliente.totalFacturado)}</span></div>
                        <div className="flex justify-between px-4 py-2"><span className="text-gray-600">Total pagado</span><span className="font-bold text-gray-800">{formatGs(cliente.pagoRealizado)}</span></div>
                        <div className="flex justify-between px-4 py-2"><span className="text-gray-600">Pago Realizado</span><span className="font-bold text-gray-800">{formatGs(cliente.pagoRealizadoManual)}</span></div>
                        <div className="flex justify-between px-4 py-2 bg-gray-50"><span className="font-bold text-gray-800">Saldo adeudado</span><span className="font-bold text-gray-800">{formatGs(cliente.creditoOtorgado)}</span></div>
                      </div>
                    </div>

                    <p className="text-xs font-bold text-gray-700 mb-2">
                      Mostrando todas las facturas y pagos entre {libroMayorDesde} y {libroMayorHasta}
                    </p>

                    {/* Tabla de movimientos */}
                    <div className="overflow-x-auto border rounded">
                      <table className="w-full text-[11px] border-collapse whitespace-nowrap">
                        <thead>
                          <tr className="bg-gray-50 text-gray-500 font-bold uppercase border-b">
                            <th className="p-2 text-left">Fecha</th>
                            <th className="p-2 text-left">Numero de Referencia</th>
                            <th className="p-2 text-left">Tipo</th>
                            <th className="p-2 text-left">Ubicación</th>
                            <th className="p-2 text-left">Estado de Pago</th>
                            <th className="p-2 text-right">Débito</th>
                            <th className="p-2 text-right">Crédito</th>
                            <th className="p-2 text-right">Saldo</th>
                            <th className="p-2 text-left">Método de Pago</th>
                            <th className="p-2 text-left">Otros</th>
                          </tr>
                        </thead>
                        <tbody>
                          {filasConSaldo.length === 0 ? (
                            <tr><td colSpan="10" className="text-center py-6 text-gray-400">No hay movimientos en el rango seleccionado.</td></tr>
                          ) : (
                            filasConSaldo.map((m, i) => (
                              <tr key={i} className="border-b hover:bg-gray-50 text-gray-700">
                                <td className="p-2">{m.fecha ? new Date(m.fecha).toLocaleString('es-PY') : '—'}</td>
                                <td className="p-2">{m.referencia}</td>
                                <td className="p-2">{m.tipo}</td>
                                <td className="p-2">{m.ubicacion}</td>
                                <td className="p-2">{m.estadoPago}</td>
                                <td className="p-2 text-right">{m.debito ? formatGs(m.debito) : '—'}</td>
                                <td className="p-2 text-right">{m.credito ? formatGs(m.credito) : '—'}</td>
                                <td className="p-2 text-right font-bold">{formatGs(m.saldo)}</td>
                                <td className="p-2">{m.metodoPago}</td>
                                <td className="p-2">{m.otros || '—'}</td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </>
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
                                      <div className="absolute z-50 mt-1 bg-white border rounded shadow-lg w-32 text-[11px] py-1">
                                        <button
                                          onClick={() => { setVentasAccionAbierta(null); setVentasVerDetalle(v); }}
                                          className="w-full text-left px-3 py-2 hover:bg-gray-100 text-gray-700 flex items-center gap-2"
                                        >
                                          👁️ Ver
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
                    <p className="text-gray-400 text-xs">Este cliente todavía no tiene pagos registrados.</p>
                  ) : (
                    <table className="w-full text-xs border-collapse">
                      <thead>
                        <tr className="text-gray-500 border-b"><th className="text-left py-1">Fecha</th><th className="text-left py-1">Método</th><th className="text-left py-1">Nota</th><th className="text-right py-1">Monto</th></tr>
                      </thead>
                      <tbody>
                        {cliente.pagosManuales.map((p) => (
                          <tr key={p.id} className="border-b border-gray-50">
                            <td className="py-1">{p.fecha ? new Date(p.fecha).toLocaleDateString('es-PY') : '—'}</td>
                            <td className="py-1">{p.metodo_pago || '—'}</td>
                            <td className="py-1">{p.nota || '—'}</td>
                            <td className="py-1 text-right">{formatGs(p.monto)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )
                )}
              </div>
            </div>
          </div>
        );
      })()}

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

    </div>
  );
}