import { useEffect, useState } from 'react';
import { supabase } from './supabaseClient';
import { useNotificacion } from './NotificacionContext';
import { sonidoExito } from './utils/sonido';
import { useEmpresaInfo, useNombreEmpresa } from './utils/useEmpresa';
import { useUbicacionUsuario } from './utils/useUbicacion';

export default function GestorCompras({ vistaInicial = 'lista' }) {
  const nombreEmpresa = useNombreEmpresa();
  const { id: empresaId } = useEmpresaInfo();
  const { notificar, confirmar } = useNotificacion();
  const [compras, setCompras] = useState([]);
  const [mostrarFormulario, setMostrarFormulario] = useState(vistaInicial === 'agregar');
  const [menuAbierto, setMenuAbierto] = useState(null);
  const [modoEdicion, setModoEdicion] = useState(false);
  const [compraEditandoId, setCompraEditandoId] = useState(null);

  // --- ESTADOS DE LA LISTA ---
  const [busquedaLista, setBusquedaLista] = useState('');
  const [paginaActual, setPaginaActual] = useState(1);
  const [porPagina, setPorPagina] = useState(25);

  // --- ESTADOS DEL FORMULARIO DE AGREGAR COMPRA ---
  const [proveedor, setProveedor] = useState('');
  const [direccionProveedor, setDireccionProveedor] = useState('');
  const [nroFactura, setNroFactura] = useState('');
  const [fechaCompra, setFechaCompra] = useState(new Date().toISOString().slice(0, 16));
  const [estadoCompra, setEstadoCompra] = useState('Seleccione');
  const [ubicacionEmpresa, setUbicacionEmpresa] = useState('');
  const [ubicacionesDisponibles, setUbicacionesDisponibles] = useState([]);
  const [ubicacionIdCompra, setUbicacionIdCompra] = useState('');
  const { id: ubicacionUsuarioId, ve_todas: usuarioVeTodas } = useUbicacionUsuario();
  const [terminoPagoNum, setTerminoPagoNum] = useState('');
  const [terminoPagoTipo, setTerminoPagoTipo] = useState('Seleccione');
  
  const [productos, setProductos] = useState([]);
  const [itemsCompra, setItemsCompra] = useState([]);
  const [busquedaProd, setBusquedaProd] = useState('');
  const [filtrados, setFiltrados] = useState([]);

  const [tipoDescuento, setTipoDescuento] = useState('Ninguna');
  const [importeDescuento, setImporteDescuento] = useState(0);
  const [impuestoCompra, setImpuestoCompra] = useState('Ninguna');
  
  const [notasAdicionales, setNotasAdicionales] = useState('');
  const [detallesEnvio, setDetallesEnvio] = useState('');
  const [cargosEnvio, setCargosEnvio] = useState(0);

  const [pagoRealizado, setPagoRealizado] = useState(0);
  // Cuánto estaba pagado ANTES de esta edición (para saber cuánto dinero nuevo
  // sale de la caja al guardar, sin descontar dos veces el mismo pago)
  const [pagoRealizadoOriginal, setPagoRealizadoOriginal] = useState(0);
  const [cajasDisponibles, setCajasDisponibles] = useState([]);
  const [metodoPago, setMetodoPago] = useState('Efectivo');
  const [cuentaPago, setCuentaPago] = useState('-- Seleccione cuenta --');
  const [notaPago, setNotaPago] = useState('');

  const [listaProveedores, setListaProveedores] = useState([]);

  // --- ESTADOS DEL MODAL RÁPIDO DE PRODUCTO ---
  const [mostrarModalProducto, setMostrarModalProducto] = useState(false);
  const [nombreProdNuevo, setNombreProdNuevo] = useState('');
  const [skuProdNuevo, setSkuProdNuevo] = useState('');
  const [unidadProdNuevo, setUnidadProdNuevo] = useState('');
  const [marcaProdNuevo, setMarcaProdNuevo] = useState('');
  const [categoriaProdNuevo, setCategoriaProdNuevo] = useState('');
  const [subcategoriaProdNuevo, setSubcategoriaProdNuevo] = useState('');
  const [garantiaProdNuevo, setGarantiaProdNuevo] = useState('');
  const [pesoProdNuevo, setPesoProdNuevo] = useState('');
  const [descripcionProdNuevo, setDescripcionProdNuevo] = useState('');
  const [cantidadAlertaProdNuevo, setCantidadAlertaProdNuevo] = useState('');
  const [administraStockProdNuevo, setAdministraStockProdNuevo] = useState(true);
  const [tipoCodigoBarraProdNuevo, setTipoCodigoBarraProdNuevo] = useState('Code 128 (C128)');
  const [ivaPctProdNuevo, setIvaPctProdNuevo] = useState(10);
  const [tipoImpuestoProdNuevo, setTipoImpuestoProdNuevo] = useState('Incluido');
  const [imeiProdNuevo, setImeiProdNuevo] = useState(false);
  const [noVenderProdNuevo, setNoVenderProdNuevo] = useState(false);
  const [campoPersonalizado1, setCampoPersonalizado1] = useState('');
  const [campoPersonalizado2, setCampoPersonalizado2] = useState('');
  const [campoPersonalizado3, setCampoPersonalizado3] = useState('');
  const [campoPersonalizado4, setCampoPersonalizado4] = useState('');
  const [precioCompraSinIvaProdNuevo, setPrecioCompraSinIvaProdNuevo] = useState('');
  const [precioCompraConIvaProdNuevo, setPrecioCompraConIvaProdNuevo] = useState('');
  const [margenProdNuevo, setMargenProdNuevo] = useState(25);
  const [precioVentaConIvaProdNuevo, setPrecioVentaConIvaProdNuevo] = useState('');
  const [marcasDisponibles, setMarcasDisponibles] = useState([]);
  const [unidadesDisponibles, setUnidadesDisponibles] = useState([]);
  const [guardandoProducto, setGuardandoProducto] = useState(false);

  // --- ESTADOS DEL MODAL RÁPIDO DE PROVEEDOR ---
  const [mostrarModalProveedor, setMostrarModalProveedor] = useState(false);
  const [esEmpresaProv, setEsEmpresaProv] = useState(false);
  const [tipoDocProv, setTipoDocProv] = useState('RUC');
  const [nroDocProv, setNroDocProv] = useState('');
  const [prefijoProv, setPrefijoProv] = useState('');
  const [nombreProv, setNombreProv] = useState('');
  const [segundoNombreProv, setSegundoNombreProv] = useState('');
  const [apellidoProv, setApellidoProv] = useState('');
  const [nombreEmpresaProv, setNombreEmpresaProv] = useState('');
  const [representanteLegalProv, setRepresentanteLegalProv] = useState('');
  const [telefonoProv, setTelefonoProv] = useState('');
  const [emailProv, setEmailProv] = useState('');
  
  const [paisProv, setPaisProv] = useState('Paraguay');
  const [departamentoProv, setDepartamentoProv] = useState('-- Depto --');
  const [ciudadProv, setCiudadProv] = useState('');
  const [direccionCalleProv, setDireccionCalleProv] = useState('');
  const [nroCasaProv, setNroCasaProv] = useState('');
  const [edificioPisoProv, setEdificioPisoProv] = useState('');
  const [codPostalProv, setCodPostalProv] = useState('7700');
  
  const [vendedorAsignadoProv, setVendedorAsignadoProv] = useState('');
  const [saldoInicialProv, setSaldoInicialProv] = useState('0');
  const [terminoPagoNumProv, setTerminoPagoNumProv] = useState('');
  const [terminoPagoTipoProv, setTerminoPagoTipoProv] = useState('Dias');

  const [acordeonIdentificacionProv, setAcordeonIdentificacionProv] = useState(true);
  const [acordeonContactoProv, setAcordeonContactoProv] = useState(false);
  const [acordeonUbicacionProv, setAcordeonUbicacionProv] = useState(true);
  const [acordeonCreditoProv, setAcordeonCreditoProv] = useState(true);
  const [acordeonFotoProv, setAcordeonFotoProv] = useState(false);
  const [acordeonDocumentosProv, setAcordeonDocumentosProv] = useState(false);
  const [fechaNacimientoProv, setFechaNacimientoProv] = useState('');
  const [pasoProv, setPasoProv] = useState(1);

  useEffect(() => {
    if (nombreEmpresa && !ubicacionEmpresa) setUbicacionEmpresa(`${nombreEmpresa} (BL0001)`);
  }, [nombreEmpresa]);

  useEffect(() => {
    const cargarUbicaciones = async () => {
      if (!empresaId) return;
      const { data } = await supabase.from('ubicaciones_comerciales').select('id, nombre, codigo_ubicacion').eq('empresa_id', empresaId).order('creado_en');
      if (data) setUbicacionesDisponibles(data);
    };
    cargarUbicaciones();
  }, [empresaId]);

  useEffect(() => {
    if (ubicacionIdCompra || ubicacionesDisponibles.length === 0) return;
    const preferida = !usuarioVeTodas && ubicacionUsuarioId
      ? ubicacionesDisponibles.find((u) => u.id === ubicacionUsuarioId)
      : ubicacionesDisponibles[0];
    if (preferida) {
      setUbicacionIdCompra(preferida.id);
      setUbicacionEmpresa(`${preferida.nombre}${preferida.codigo_ubicacion ? ` (${preferida.codigo_ubicacion})` : ''}`);
    }
  }, [ubicacionesDisponibles, ubicacionUsuarioId, usuarioVeTodas]);

  useEffect(() => {
    setMostrarFormulario(vistaInicial === 'agregar');
  }, [vistaInicial]);

  useEffect(() => {
    if (empresaId) {
      cargarTodasLasCompras();
      cargarCatalogo();
      cargarProveedores();
      cargarMarcasYUnidades();
      cargarCajasDisponibles();
    }
  }, [empresaId]);

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

  const cargarMarcasYUnidades = async () => {
    if (!empresaId) return;
    const [rm, ru] = await Promise.all([
      supabase.from('marcas').select('*').eq('empresa_id', empresaId).order('nombre'),
      supabase.from('unidades').select('*').eq('empresa_id', empresaId).order('nombre'),
    ]);
    if (rm.data) setMarcasDisponibles(rm.data);
    if (ru.data) setUnidadesDisponibles(ru.data);
  };

  const cargarCatalogo = async () => {
    if (!empresaId) return;
    const { data } = await supabase.from('productos').select('*').eq('empresa_id', empresaId).order('nombre');
    if (data) setProductos(data);
  };

  const cargarTodasLasCompras = async () => {
    if (!empresaId) return;
    const { data, error } = await supabase.from('compras').select('*').eq('empresa_id', empresaId).order('fecha', { ascending: false });
    if (!error && data) setCompras(data);
  };

  const cargarProveedores = async () => {
    if (!empresaId) return;
    const { data } = await supabase.from('clientes').select('*').eq('empresa_id', empresaId).or('tipo_contacto.eq.Proveedores,tipo_contacto.eq.Ambos');
    if (data) setListaProveedores(data);
  };

  const manejarBusqueda = (texto) => {
    setBusquedaProd(texto);
    if (texto.trim() === '') return setFiltrados([]);
    const query = texto.toLowerCase();
    setFiltrados(productos.filter(p => p.nombre.toLowerCase().includes(query) || (p.codigo && p.codigo.toLowerCase().includes(query))).slice(0, 5));
  };

  const seleccionarProducto = (producto) => {
    if (itemsCompra.find(item => item.id === producto.id)) { notificar.info('Producto ya agregado.'); return; }
    setItemsCompra([...itemsCompra, { 
      id: producto.id, 
      nombre: producto.nombre, 
      codigo: producto.codigo || 'S/N', 
      cantidad: 1, 
      iva: 'IVA 10%', 
      costo: producto.precio_compra || 0, 
      subtotal: producto.precio_compra || 0, 
      margin: 25, 
      precio_venta: producto.precio_venta || 0,
      fecha_caducidad: ''
    }]);
    setBusquedaProd(''); setFiltrados([]);
  };

  const actualizarCeldaItem = (index, campo, valor) => {
    const copia = [...itemsCompra];
    copia[index][campo] = valor;
    if (campo === 'cantidad' || campo === 'costo') {
      copia[index].subtotal = (parseInt(copia[index].cantidad) || 0) * (parseFloat(copia[index].costo) || 0);
    }
    setItemsCompra(copia);
  };

  const totalArticulos = itemsCompra.reduce((acc, i) => acc + (parseInt(i.cantidad) || 0), 0);
  const totalNetoItems = itemsCompra.reduce((acc, i) => acc + i.subtotal, 0);
  const descuentoCalculado = tipoDescuento === 'Fijo' ? Number(importeDescuento) : (tipoDescuento === 'Porcentaje' ? (totalNetoItems * (Number(importeDescuento) / 100)) : 0);
  const totalCompraFinal = totalNetoItems - descuentoCalculado + Number(cargosEnvio);
  const saldoPendienteFinal = totalCompraFinal - Number(pagoRealizado);

  const guardarCompra = async (e) => {
    e.preventDefault();
    if (!proveedor) return notificar.info('Seleccione un Proveedor.');
    if (itemsCompra.length === 0) return notificar.info('Agregue al menos 1 producto.');

    try {
      const datosCompra = {
        proveedor_nombre: proveedor, nro_factura: nroFactura, total: totalCompraFinal,
        saldo_pendiente: saldoPendienteFinal, estado: saldoPendienteFinal <= 0 ? 'pagado' : 'pendiente', fecha: fechaCompra,
        estado_compra: estadoCompra === 'Seleccione' ? 'Recibido' : estadoCompra,
        ubicacion: ubicacionEmpresa,
      };

      const itemsParaRpc = itemsCompra.map((item) => ({
        producto_id: item.id,
        nombre_producto: item.nombre,
        codigo_sku: item.codigo,
        cantidad: item.cantidad,
        costo_unitario: item.costo,
      }));

      const { error } = await supabase.rpc('registrar_o_editar_compra', {
        p_compra: datosCompra,
        p_items: itemsParaRpc,
        p_compra_id: modoEdicion ? compraEditandoId : null,
        p_ubicacion_id: ubicacionIdCompra || null,
      });
      if (error) throw error;

      // Si eligieron una caja/cuenta real, le descontamos SOLO el pago nuevo
      // (la diferencia contra lo que ya estaba pagado antes de esta edición),
      // para no descontar dos veces el mismo pago si se vuelve a editar.
      const pagoNuevo = Number(pagoRealizado || 0) - Number(pagoRealizadoOriginal || 0);
      if (cuentaPago !== '-- Seleccione cuenta --' && pagoNuevo !== 0) {
        const cajaElegida = cajasDisponibles.find((c) => c.id === cuentaPago);
        if (cajaElegida) {
          const { error: errorCaja } = await supabase
            .from('cuentas_caja')
            .update({ saldo: Number(cajaElegida.saldo || 0) - pagoNuevo })
            .eq('id', cajaElegida.id)
            .eq('empresa_id', empresaId);
          if (errorCaja) throw errorCaja;
          await cargarCajasDisponibles();
        }
      }

      sonidoExito();
      notificar.exito(modoEdicion ? '¡Compra actualizada con éxito!' : '¡Compra registrada con éxito!');
      setMostrarFormulario(false);
      setModoEdicion(false);
      setCompraEditandoId(null);
      setItemsCompra([]); setProveedor(''); setNroFactura(''); setPagoRealizado(0);
      setPagoRealizadoOriginal(0);
      setCuentaPago('-- Seleccione cuenta --');
      cargarTodasLasCompras();
    } catch (err) { notificar.error('Error: ' + err.message); }
  };

  const handleGuardarProveedorRapido = async (e) => {
    e.preventDefault();
    const nombreCompleto = `${prefijoProv} ${nombreProv} ${segundoNombreProv} ${apellidoProv}`.replace(/\s+/g, ' ').trim();
    const nombreFinal = esEmpresaProv ? nombreEmpresaProv : nombreCompleto;
    const codigoGenerado = `PR${Math.floor(1000 + Math.random() * 9000)}`;
    const partesDireccion = [direccionCalleProv, nroCasaProv ? `Nro ${nroCasaProv}` : '', edificioPisoProv].filter(Boolean).join(' ');
    const direccionCompleta = `${partesDireccion}, ${ciudadProv}, ${departamentoProv}, ${paisProv} (CP: ${codPostalProv})`.replace(/^, /, '').trim();
    const terminoPagoFinal = terminoPagoNumProv ? `${terminoPagoNumProv} ${terminoPagoTipoProv}` : '';

    const { data, error } = await supabase
      .from('clientes')
      .insert([{
        empresa_id: empresaId,
        tipo_contacto: 'Proveedores', codigo_cliente: codigoGenerado, tipo_documento: tipoDocProv,
        documento_nro: nroDocProv || null, nombre_empresa: esEmpresaProv ? nombreEmpresaProv : null,
        nombre: nombreFinal, representante_legal: representanteLegalProv || null, celular: telefonoProv || null,
        email: emailProv || null, fecha_nacimiento: fechaNacimientoProv || null, direccion: direccionCompleta, vendedor_asignado: vendedorAsignadoProv || nombreEmpresa,
        saldo_apertura: parseFloat(saldoInicialProv) || 0, termino_pago: terminoPagoFinal, estado: 'Activo'
      }]).select();

    if (error) {
      notificar.error('Error al crear proveedor: ' + error.message);
    } else {
      notificar.exito('¡Proveedor creado y seleccionado automáticamente!');
      setMostrarModalProveedor(false);
      
      setNombreProv(''); setApellidoProv(''); setNombreEmpresaProv(''); setNroDocProv(''); setTelefonoProv(''); setEmailProv(''); setFechaNacimientoProv(''); setPasoProv(1);
      setDireccionCalleProv(''); setNroCasaProv(''); setEdificioPisoProv(''); setCiudadProv(''); setDepartamentoProv('-- Depto --');
      setVendedorAsignadoProv(''); setSaldoInicialProv('0'); setTerminoPagoNumProv('');
      
      await cargarProveedores();
      if (data && data[0]) {
        setProveedor(data[0].nombre);
        setDireccionProveedor(data[0].direccion);
      }
    }
  };

  const limpiarFormProductoNuevo = () => {
    setNombreProdNuevo(''); setSkuProdNuevo(''); setUnidadProdNuevo(''); setMarcaProdNuevo('');
    setCategoriaProdNuevo(''); setSubcategoriaProdNuevo(''); setGarantiaProdNuevo('');
    setPesoProdNuevo(''); setDescripcionProdNuevo(''); setCantidadAlertaProdNuevo('');
    setAdministraStockProdNuevo(true);
    setTipoCodigoBarraProdNuevo('Code 128 (C128)'); setIvaPctProdNuevo(10); setTipoImpuestoProdNuevo('Incluido');
    setImeiProdNuevo(false); setNoVenderProdNuevo(false);
    setCampoPersonalizado1(''); setCampoPersonalizado2(''); setCampoPersonalizado3(''); setCampoPersonalizado4('');
    setPrecioCompraSinIvaProdNuevo(''); setPrecioCompraConIvaProdNuevo(''); setMargenProdNuevo(25); setPrecioVentaConIvaProdNuevo('');
  };

  const handlePrecioCompraSinIvaProdNuevo = (valor) => {
    setPrecioCompraSinIvaProdNuevo(valor);
    const base = Number(valor) || 0;
    setPrecioCompraConIvaProdNuevo(base ? (base * (1 + ivaPctProdNuevo / 100)).toFixed(0) : '');
    recalcularVentaProdNuevo(base, margenProdNuevo);
  };

  const handlePrecioCompraConIvaProdNuevo = (valor) => {
    setPrecioCompraConIvaProdNuevo(valor);
    const conIva = Number(valor) || 0;
    const sinIva = conIva ? conIva / (1 + ivaPctProdNuevo / 100) : 0;
    setPrecioCompraSinIvaProdNuevo(sinIva ? sinIva.toFixed(0) : '');
    recalcularVentaProdNuevo(sinIva, margenProdNuevo);
  };

  const handleMargenProdNuevo = (valor) => {
    setMargenProdNuevo(valor);
    recalcularVentaProdNuevo(Number(precioCompraSinIvaProdNuevo) || 0, Number(valor) || 0);
  };

  const recalcularVentaProdNuevo = (compraSinIva, margen) => {
    const ventaSinIva = compraSinIva * (1 + margen / 100);
    const ventaConIva = ventaSinIva * (1 + ivaPctProdNuevo / 100);
    setPrecioVentaConIvaProdNuevo(ventaConIva ? ventaConIva.toFixed(0) : '');
  };

  const handlePrecioVentaConIvaProdNuevo = (valor) => {
    setPrecioVentaConIvaProdNuevo(valor);
    const ventaConIva = Number(valor) || 0;
    const ventaSinIva = ventaConIva / (1 + ivaPctProdNuevo / 100);
    const compraSinIva = Number(precioCompraSinIvaProdNuevo) || 0;
    if (compraSinIva > 0) {
      const nuevoMargen = ((ventaSinIva - compraSinIva) / compraSinIva) * 100;
      setMargenProdNuevo(nuevoMargen.toFixed(1));
    }
  };

  const handleIvaPctProdNuevo = (nuevoIva) => {
    setIvaPctProdNuevo(nuevoIva);
    const base = Number(precioCompraSinIvaProdNuevo) || 0;
    setPrecioCompraConIvaProdNuevo(base ? (base * (1 + nuevoIva / 100)).toFixed(0) : '');
    const ventaSinIva = base * (1 + margenProdNuevo / 100);
    setPrecioVentaConIvaProdNuevo(ventaSinIva ? (ventaSinIva * (1 + nuevoIva / 100)).toFixed(0) : '');
  };

  const guardarProductoNuevo = async (e) => {
    e.preventDefault();
    if (!nombreProdNuevo.trim()) return notificar.info('El nombre del producto es obligatorio.');
    if (!unidadProdNuevo) return notificar.info('Seleccioná la unidad.');

    setGuardandoProducto(true);
    try {
      const nuevoProducto = {
        nombre: nombreProdNuevo.trim(),
        codigo: skuProdNuevo || null,
        unidad: unidadProdNuevo,
        marca: marcaProdNuevo || null,
        categoria: categoriaProdNuevo || null,
        subcategoria: subcategoriaProdNuevo || null,
        garantia: garantiaProdNuevo || null,
        descripcion: descripcionProdNuevo || null,
        peso: pesoProdNuevo ? Number(pesoProdNuevo) : null,
        administra_stock: administraStockProdNuevo,
        alerta_stock_bajo: cantidadAlertaProdNuevo ? Number(cantidadAlertaProdNuevo) : 5,
        precio_compra: Number(precioCompraSinIvaProdNuevo) || 0,
        precio_venta: Math.round(Number(precioVentaConIvaProdNuevo)) || 0,
        stock_actual: 0,
        iva: `IVA ${ivaPctProdNuevo}%`,
        tipo_impuesto: tipoImpuestoProdNuevo,
        tipo_producto: 'Individual',
      };

      const { data, error } = await supabase.from('productos').insert([{ ...nuevoProducto, empresa_id: empresaId }]).select();
      if (error) throw error;

      const productoGuardado = data[0];
      setProductos((prev) => [...prev, productoGuardado]);

      // Lo agregamos automáticamente a la grilla de la compra actual
      setItemsCompra((prev) => [...prev, {
        id: productoGuardado.id,
        nombre: productoGuardado.nombre,
        codigo: productoGuardado.codigo || 'S/N',
        cantidad: 1,
        iva: `IVA ${ivaPctProdNuevo}%`,
        costo: Number(precioCompraConIvaProdNuevo) || 0,
        subtotal: Number(precioCompraConIvaProdNuevo) || 0,
        margin: Number(margenProdNuevo) || 25,
        precio_venta: Number(precioVentaConIvaProdNuevo) || 0,
        fecha_caducidad: '',
      }]);

      notificar.exito('¡Producto creado y agregado a la compra!');
      limpiarFormProductoNuevo();
      setMostrarModalProducto(false);
    } catch (error) {
      notificar.error('Error al guardar el producto: ' + error.message);
    } finally {
      setGuardandoProducto(false);
    }
  };

  const toggleMenu = (e, id) => {
    e.stopPropagation();
    setMenuAbierto(menuAbierto === id ? null : id);
  };

  const cargarCompraParaEditar = async (compra) => {
    const { data: detalles, error } = await supabase.from('detalle_compras').select('*').eq('compra_id', compra.id).eq('empresa_id', empresaId);
    if (error) return notificar.error('Error al cargar el detalle de la compra: ' + error.message);

    const provNombre = compra.proveedor_nombre?.trim() || '';
    setProveedor(provNombre);
    const prov = listaProveedores.find((p) => p.nombre?.trim() === provNombre);
    setDireccionProveedor(prov?.direccion || '');
    setNroFactura(compra.nro_factura || '');
    setFechaCompra(compra.fecha ? new Date(compra.fecha).toISOString().slice(0, 16) : new Date().toISOString().slice(0, 16));
    setEstadoCompra(compra.estado_compra || 'Recibido');
    setUbicacionEmpresa(compra.ubicacion || `${nombreEmpresa} (BL0001)`);

    if (!detalles || detalles.length === 0) {
      notificar.error(`ATENCIÓN: No se encontraron productos cargados para esta compra (ID: ${compra.id}). \n\nPosibles causas:\n1. La compra se guardó sin productos (o falló el guardado parcial).\n2. Permisos de Supabase (RLS) bloquean la lectura de 'detalle_compras'.`);
    }

    setItemsCompra(
      (detalles || []).map((d) => ({
        id: d.producto_id,
        nombre: d.nombre_producto,
        codigo: d.codigo_sku || 'S/N',
        cantidad: d.cantidad,
        iva: 'IVA 10%',
        costo: d.costo_unitario,
        subtotal: d.subtotal,
        margin: 25,
        precio_venta: 0,
        fecha_caducidad: '',
      }))
    );

    setTipoDescuento('Ninguna');
    setImporteDescuento(0);
    setImpuestoCompra('Ninguna');
    setNotasAdicionales('');
    setDetallesEnvio('');
    setCargosEnvio(0);
    setPagoRealizado(Number(compra.total || 0) - Number(compra.saldo_pendiente || 0));
    setPagoRealizadoOriginal(Number(compra.total || 0) - Number(compra.saldo_pendiente || 0));
    setMetodoPago('Efectivo');
    setNotaPago('');

    setModoEdicion(true);
    setCompraEditandoId(compra.id);
    setMostrarFormulario(true);
    setMenuAbierto(null);
  };

  const eliminarCompra = async (id) => {
    if (!(await confirmar('¿Eliminar esta compra? Esta acción no se puede deshacer.'))) return;
    const { error } = await supabase.from('compras').delete().eq('id', id).eq('empresa_id', empresaId);
    if (error) return notificar.error('Error al eliminar: ' + error.message);
    setCompras(compras.filter((c) => c.id !== id));
    setMenuAbierto(null);
  };

  const getEstadoPago = (c) => {
    const total = Number(c.total || 0);
    const saldo = Number(c.saldo_pendiente || 0);
    if (saldo <= 0) return { label: 'Contado', clase: 'bg-green-100 text-green-700 border border-green-200' };
    if (saldo >= total) return { label: 'Crédito', clase: 'bg-orange-100 text-orange-700 border border-orange-200' };
    return { label: 'Pago Parcial', clase: 'bg-blue-100 text-blue-700 border border-blue-200' };
  };

  const exportarComprasCSV = () => {
    const filas = [
      ['Fecha', 'Referencia', 'Ubicación', 'Proveedor', 'Estado de compra', 'Estado de pago', 'Total', 'Pagado', 'Saldo pendiente'],
      ...comprasFiltradas.map((c) => [
        new Date(c.fecha).toLocaleDateString('es-PY'), c.nro_factura || `PO-${c.id}`, c.ubicacion || nombreEmpresa,
        c.proveedor_nombre, c.estado_compra || 'Recibido', getEstadoPago(c).label,
        c.total, Number(c.total - c.saldo_pendiente), c.saldo_pendiente,
      ]),
    ];
    const csv = filas.map((f) => f.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'compras.csv'; a.click();
    URL.revokeObjectURL(url);
  };

  const comprasFiltradas = compras.filter(c => 
    c.proveedor_nombre?.toLowerCase().includes(busquedaLista.toLowerCase()) || 
    c.nro_factura?.toLowerCase().includes(busquedaLista.toLowerCase())
  );

  const granTotal = compras.reduce((acc, c) => acc + Number(c.total || 0), 0);
  const compraAdeudada = compras.reduce((acc, c) => acc + Number(c.saldo_pendiente || 0), 0);
  const pagadoPorMoneda = granTotal - compraAdeudada;

  const totalPaginasCompras = Math.max(1, Math.ceil(comprasFiltradas.length / porPagina));
  const paginaSegura = Math.min(paginaActual, totalPaginasCompras);
  const comprasPagina = comprasFiltradas.slice((paginaSegura - 1) * porPagina, paginaSegura * porPagina);

  const desgloseEstadoPago = comprasFiltradas.reduce((acc, c) => {
    const label = getEstadoPago(c).label;
    acc[label] = (acc[label] || 0) + 1;
    return acc;
  }, {});

  return (
    <div className="bg-transparent text-sm text-gray-700 h-full">
      
      {mostrarFormulario ? (
        /* ======================================================================= */
        /* VISTA 1: FORMULARIO DE AGREGAR COMPRA                                   */
        /* ======================================================================= */
        <div className="bg-white rounded-lg shadow-sm mb-6">
          <div className="p-4 border-b">
            <h2 className="text-xl font-bold text-gray-800">{modoEdicion ? 'Editar compra' : 'Agregar compra'}</h2>
          </div>
          
          <form onSubmit={guardarCompra} className="p-4">
            
            <div className="grid grid-cols-1 md:grid-cols-4 gap-x-6 gap-y-4 mb-6">
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">Proveedor:*</label>
                <div className="flex gap-1">
                  <div className="flex items-center border rounded w-full bg-white overflow-hidden">
                    <span className="px-2 text-gray-400 bg-gray-50 border-r">👤</span>
                    <select className="w-full p-2 outline-none text-xs" value={proveedor} onChange={(e) => {
                        setProveedor(e.target.value);
                        const p = listaProveedores.find(x => x.nombre === e.target.value);
                        setDireccionProveedor(p?.direccion || '');
                      }} required>
                      <option value="">Seleccione</option>
                      {/* Si el proveedor de esta compra no está en la lista filtrada, lo mostramos igual para no perderlo */}
                      {proveedor && !listaProveedores.some(p => p.nombre === proveedor) && (
                        <option value={proveedor}>{proveedor}</option>
                      )}
                      {listaProveedores.map(p => (<option key={p.id} value={p.nombre}>{p.nombre}</option>))}
                    </select>
                  </div>
                  <button type="button" onClick={() => { setPasoProv(1); setMostrarModalProveedor(true); }} className="bg-blue-500 text-white px-2.5 rounded hover:bg-blue-600 transition shadow-sm text-lg flex items-center justify-center">
                    +
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1 flex items-center gap-1">
                  Numero de referencia: <span className="text-blue-400 text-[10px] cursor-help">ⓘ</span>
                </label>
                <input className="w-full border rounded p-2 outline-none focus:border-blue-500 text-xs" value={nroFactura} onChange={(e) => setNroFactura(e.target.value)} />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">Fecha de compra:*</label>
                <div className="flex items-center border rounded w-full bg-white overflow-hidden">
                   <span className="px-2 text-gray-400 bg-gray-50 border-r">📅</span>
                   <input type="datetime-local" className="w-full p-2 outline-none text-xs" value={fechaCompra} onChange={(e) => setFechaCompra(e.target.value)} required />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1 flex items-center gap-1">
                  Estado de compra:* <span className="text-blue-400 text-[10px] cursor-help">ⓘ</span>
                </label>
                <select className="w-full border rounded p-2 bg-white outline-none text-xs" value={estadoCompra} onChange={(e) => setEstadoCompra(e.target.value)}>
                  <option value="Seleccione">Seleccione</option>
                  <option value="Recibido">Recibido</option>
                  <option value="Pendiente">Pendiente</option>
                  <option value="Solicitado">Solicitado</option>
                </select>
              </div>

              <div className="md:col-span-3">
                <label className="block text-xs font-bold text-gray-700 mb-1">Dirección:</label>
                <input className="w-full border-b border-gray-300 p-2 outline-none bg-transparent text-xs text-gray-500" value={direccionProveedor} placeholder="" disabled />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1 flex items-center gap-1">
                  Ubicación de la empresa:* <span className="text-blue-400 text-[10px] cursor-help">ⓘ</span>
                </label>
                <select
                  className="w-full border rounded p-2 bg-white outline-none text-xs"
                  value={ubicacionIdCompra}
                  onChange={(e) => {
                    const u = ubicacionesDisponibles.find((x) => x.id === e.target.value);
                    setUbicacionIdCompra(e.target.value);
                    if (u) setUbicacionEmpresa(`${u.nombre}${u.codigo_ubicacion ? ` (${u.codigo_ubicacion})` : ''}`);
                  }}
                >
                  <option value="">Seleccione</option>
                  {ubicacionesDisponibles.map((u) => (
                    <option key={u.id} value={u.id}>{u.nombre}{u.codigo_ubicacion ? ` (${u.codigo_ubicacion})` : ''}</option>
                  ))}
                </select>
              </div>

              <div className="md:col-span-2">
                <label className="block text-xs font-bold text-gray-700 mb-1 flex items-center gap-1">
                  Término de pago (Credito): <span className="text-blue-400 text-[10px] cursor-help">ⓘ</span>
                </label>
                <div className="flex gap-2">
                  <input type="number" className="w-1/2 border rounded p-2 outline-none text-xs" placeholder="Término de pago (Credito)" value={terminoPagoNum} onChange={(e) => setTerminoPagoNum(e.target.value)} />
                  <select className="w-1/2 border rounded p-2 bg-white outline-none text-xs" value={terminoPagoTipo} onChange={(e) => setTerminoPagoTipo(e.target.value)}>
                    <option value="Seleccione">Seleccione</option>
                    <option value="Dias">Dias</option>
                    <option value="Meses">Meses</option>
                  </select>
                </div>
              </div>

              <div className="md:col-span-2">
                <label className="block text-xs font-bold text-gray-700 mb-1">Documento adjunto:</label>
                <div className="flex gap-2 items-start">
                  <button type="button" className="bg-[#fd7e14] text-white px-4 py-2 rounded text-xs font-bold shadow-sm hover:bg-orange-600 flex items-center gap-2 whitespace-nowrap">
                    <span>📁</span> Examinar..
                  </button>
                  <div className="text-[10px] text-gray-500 leading-tight">
                    Tamaño máximo de archivo: 5MB<br/>
                    Archivo permitido: .pdf, .csv, .zip,<br/>
                    .doc, .docx, .jpeg, .jpg, .png, .p12
                  </div>
                </div>
              </div>
            </div>

            <div className="border-t border-b py-4 mb-6 flex flex-col md:flex-row gap-4 items-center justify-between">
              <div className="flex items-center gap-2 w-full md:w-2/3">
                <button type="button" className="bg-[#fd7e14] text-white px-4 py-2 rounded text-xs font-bold shadow-sm whitespace-nowrap">
                  Importar productos
                </button>
                <div className="relative flex-1">
                  <div className="flex items-center border rounded bg-white overflow-hidden">
                    <span className="px-3 text-gray-400 bg-gray-50 border-r">🔍</span>
                    <input className="w-full p-2 outline-none text-xs" placeholder="Introduzca el nombre del producto / SKU / código de barras de escaneo" value={busquedaProd} onChange={(e) => manejarBusqueda(e.target.value)} />
                  </div>
                  {filtrados.length > 0 && (
                    <div className="absolute left-0 right-0 bg-white border rounded shadow-2xl z-[50] max-h-48 overflow-y-auto mt-1">
                      {filtrados.map(p => (
                        <div key={p.id} onClick={() => seleccionarProducto(p)} className="p-2.5 hover:bg-blue-50 cursor-pointer border-b last:border-0 flex justify-between text-xs">
                          <span className="font-bold text-gray-800">{p.nombre}</span>
                          <span className="text-gray-500 font-mono">[{p.codigo || 'S/C'}]</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              
              <div className="flex items-center gap-4 text-xs font-bold w-full md:w-auto justify-end">
                <button type="button" onClick={() => setMostrarModalProducto(true)} className="text-blue-600 hover:underline flex items-center gap-1">
                  <span className="text-lg">+</span> Agregar nuevo producto
                </button>
                <button type="button" className="bg-[#fd7e14] text-white px-4 py-2 rounded shadow-sm flex items-center gap-1">
                  <span>🏷️</span> Agregar gasto
                </button>
              </div>
            </div>

            <div className="overflow-x-auto border rounded mb-6">
              <table className="w-full text-left text-[11px] border-collapse whitespace-nowrap">
                <thead className="bg-gray-50 border-b text-gray-700 font-black uppercase">
                  <tr>
                    <th className="p-3 text-center w-8">#</th>
                    <th className="p-3">NOMBRE DEL PRODUCTO</th>
                    <th className="p-3 w-16 text-center">CANT.</th>
                    <th className="p-3 w-20">IVA</th>
                    <th className="p-3 w-28 text-right">COSTO UNITARIO<br/>(CON IVA)</th>
                    <th className="p-3 w-28 text-right">LINEA TOTAL</th>
                    <th className="p-3 w-24 text-center">PROFIT<br/>MARGIN %</th>
                    <th className="p-3 w-32 text-center">PRECIO DE VENTA<br/>UNITARIO (IVA INCLUIDO)</th>
                    <th className="p-3 w-32 text-center">FECHA DE FABRICACIÓN /<br/>FECHA DE CADUCIDAD</th>
                    <th className="p-3 text-center w-10">🗑️</th>
                  </tr>
                </thead>
                <tbody>
                  {itemsCompra.length === 0 ? (
                    <tr><td colSpan="10" className="text-center py-10 text-gray-400">Ningún producto agregado a la grilla</td></tr>
                  ) : (
                    itemsCompra.map((item, idx) => (
                      <tr key={item.id} className="border-b hover:bg-gray-50 font-medium">
                        <td className="p-3 text-center text-gray-400">{idx + 1}</td>
                        <td className="p-3 font-bold text-gray-800">{item.nombre}</td>
                        <td className="p-3"><input type="number" min="1" className="w-full border rounded p-1 text-center" value={item.cantidad} onChange={(e) => actualizarCeldaItem(idx, 'cantidad', e.target.value)} /></td>
                        <td className="p-3 text-gray-500">{item.iva}</td>
                        <td className="p-3"><input type="number" className="w-full border rounded p-1 text-right" value={item.costo} onChange={(e) => actualizarCeldaItem(idx, 'costo', e.target.value)} /></td>
                        <td className="p-3 font-bold text-gray-800 text-right">{item.subtotal.toLocaleString('es-PY')}</td>
                        <td className="p-3"><input type="number" className="w-full border rounded p-1 text-center" value={item.margin} onChange={(e) => actualizarCeldaItem(idx, 'margin', e.target.value)} /></td>
                        <td className="p-3 text-center font-bold text-gray-800">{Number(item.precio_venta).toLocaleString('es-PY')}</td>
                        <td className="p-3"><input type="date" className="w-full border rounded p-1 text-gray-600" value={item.fecha_caducidad} onChange={(e) => actualizarCeldaItem(idx, 'fecha_caducidad', e.target.value)} /></td>
                        <td className="p-3 text-center"><button type="button" onClick={() => setItemsCompra(itemsCompra.filter(x => x.id !== item.id))} className="text-gray-400 hover:text-red-500 font-bold">🗑️</button></td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <div className="flex flex-col gap-4 text-xs text-gray-700 font-bold mb-6 border-b pb-6">
              <div className="flex justify-end gap-16 pr-4">
                <div>Total artículos: <span className="ml-2 font-normal">{totalArticulos}</span></div>
                <div>Total a Pagar con IVA: <span className="ml-2 font-normal">{totalNetoItems.toLocaleString('es-PY')}</span></div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-6 items-end mt-2">
                <div>
                  <label className="block mb-1">Tipo de descuento:</label>
                  <select className="w-full border rounded p-2 bg-white outline-none" value={tipoDescuento} onChange={(e) => setTipoDescuento(e.target.value)}>
                    <option value="Ninguna">Ninguna</option>
                    <option value="Fijo">Fijo</option>
                    <option value="Porcentaje">Porcentaje</option>
                  </select>
                </div>
                <div>
                  <label className="block mb-1">Importe de descuento:*</label>
                  <input type="number" className="w-full border rounded p-2 outline-none" value={importeDescuento} onChange={(e) => setImporteDescuento(e.target.value)} />
                </div>
                <div className="text-gray-500 font-normal self-center">Descuento: <span className="font-bold">(-) {descuentoCalculado.toLocaleString('es-PY')}</span></div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-6 items-end mt-2">
                <div>
                  <label className="block mb-1">Impuesto de compra:</label>
                  <select className="w-full border rounded p-2 bg-white outline-none" value={impuestoCompra} onChange={(e) => setImpuestoCompra(e.target.value)}>
                    <option value="Ninguna">Ninguna</option>
                    <option value="IVA 10%">IVA 10%</option>
                    <option value="IVA 5%">IVA 5%</option>
                  </select>
                </div>
                <div className="col-start-3 text-gray-500 font-normal self-center">Impuesto de compra: <span className="font-bold">(+) 0</span></div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6 pb-6 border-b text-xs font-bold text-gray-700">
              <div>
                <label className="block mb-1">Notas adicionales</label>
                <textarea className="w-full border rounded p-2 h-20 outline-none font-normal" value={notasAdicionales} onChange={(e) => setNotasAdicionales(e.target.value)}></textarea>
              </div>
              <div>
                <label className="block mb-1">Detalles de envío:</label>
                <textarea className="w-full border rounded p-2 h-20 outline-none font-normal" value={detallesEnvio} onChange={(e) => setDetallesEnvio(e.target.value)}></textarea>
              </div>
              <div className="flex flex-col gap-2">
                <div>
                  <label className="block mb-1">(+) Cargos de envío adicionales:*</label>
                  <input type="number" className="w-full border rounded p-2 outline-none font-normal" value={cargosEnvio} onChange={(e) => setCargosEnvio(e.target.value)} />
                </div>
                <div className="text-right text-sm mt-auto">Total compra: <span className="text-lg text-gray-900">{totalCompraFinal.toLocaleString('es-PY')} Gs</span></div>
              </div>
            </div>

            <div className="mb-6">
              <h3 className="text-base font-bold text-gray-800 mb-4">Monto total pagado o pago parcial</h3>
              <div className="bg-white border rounded p-4 shadow-inner">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-4">
                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1">Pago Realizado:*</label>
                    <div className="text-[10px] text-gray-500 mb-1">Cantidad (PYG) :*</div>
                    <div className="flex items-center border rounded w-full bg-white overflow-hidden">
                      <span className="px-3 text-gray-500 bg-gray-50 border-r font-bold">Gs</span>
                      <input type="number" className="w-full p-2 outline-none text-xs font-bold" value={pagoRealizado} onChange={(e) => setPagoRealizado(e.target.value)} />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1">Método de pago:*</label>
                    <div className="text-[10px] text-transparent mb-1">-</div>
                    <div className="flex items-center border rounded w-full bg-white overflow-hidden">
                      <span className="px-3 text-gray-400 bg-gray-50 border-r">💵</span>
                      <select className="w-full p-2 outline-none text-xs" value={metodoPago} onChange={(e) => setMetodoPago(e.target.value)}>
                        <option value="Efectivo">Efectivo</option>
                        <option value="Tarjeta">Tarjeta</option>
                        <option value="Transferencia">Transferencia</option>
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1">Cuenta de pago:</label>
                    <div className="text-[10px] text-transparent mb-1">-</div>
                    <div className="flex items-center border rounded w-full bg-white overflow-hidden">
                      <span className="px-3 text-gray-400 bg-gray-50 border-r">🏦</span>
                      <select className="w-full p-2 outline-none text-xs" value={cuentaPago} onChange={(e) => setCuentaPago(e.target.value)}>
                        <option value="-- Seleccione cuenta --">-- Seleccione cuenta --</option>
                        {cajasDisponibles.map((caja) => (
                          <option key={caja.id} value={caja.id}>
                            {caja.nombre} (Saldo: {Number(caja.saldo || 0).toLocaleString('es-PY')} {caja.moneda === 'Guarani (Gs)' ? 'Gs' : caja.moneda})
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-end">
                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1">Nota de pago:</label>
                    <textarea className="w-full border rounded p-2 h-10 outline-none text-xs" value={notaPago} onChange={(e) => setNotaPago(e.target.value)}></textarea>
                  </div>
                  <div className="text-right text-sm font-bold text-gray-700">
                    Saldo Pendiente de pago: <span className="text-red-600 ml-1">{saldoPendienteFinal.toLocaleString('es-PY')}</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex justify-end pt-4 gap-3">
              <button type="button" onClick={() => { setMostrarFormulario(false); setModoEdicion(false); setCompraEditandoId(null); }} className="bg-gray-500 text-white px-5 py-2 rounded text-sm font-bold hover:bg-gray-600 transition shadow-sm">Volver</button>
              <button type="submit" className="bg-[#fd7e14] text-white px-6 py-2 rounded text-sm font-bold hover:bg-[#e86e04] shadow-md transition">{modoEdicion ? 'Actualizar' : 'Guardar'}</button>
            </div>
          </form>
        </div>
      ) : (
        /* ======================================================================= */
        /* VISTA 2: LISTA MAESTRA DE COMPRAS                                       */
        /* ======================================================================= */
        <div>
          <div className="bg-white p-4 rounded-lg shadow-sm border-t-2 border-[#004284] mb-4">
            <div className="grid grid-cols-1 md:grid-cols-5 gap-4 text-xs font-bold text-gray-700">
              <div><label className="block mb-1">Ubicación de la empresa:</label><select className="w-full border rounded p-2 bg-white outline-none"><option>Todos</option></select></div>
              <div><label className="block mb-1">Proveedor:</label><select className="w-full border rounded p-2 bg-white outline-none"><option>Todos</option></select></div>
              <div><label className="block mb-1">Estado de compra:</label><select className="w-full border rounded p-2 bg-white outline-none"><option>Todos</option></select></div>
              <div><label className="block mb-1">Estado de pago:</label><select className="w-full border rounded p-2 bg-white outline-none"><option>Todos</option></select></div>
              <div><label className="block mb-1">Rango de fechas:</label><input type="text" className="w-full border rounded p-2 bg-gray-100 outline-none text-gray-500" value="01/01/2026 - 31/12/2026" readOnly /></div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow-sm border-t-2 border-[#004284]">
            <div className="p-4 border-b flex justify-between items-center">
              <h3 className="text-base font-bold text-gray-700">Todas las compras</h3>
              <button onClick={() => { setModoEdicion(false); setCompraEditandoId(null); setItemsCompra([]); setProveedor(''); setNroFactura(''); setPagoRealizado(0); setPagoRealizadoOriginal(0); setCuentaPago('-- Seleccione cuenta --'); setMostrarFormulario(true); }} className="bg-[#fd7e14] text-white px-4 py-1.5 rounded text-sm font-bold hover:bg-[#e86e04] shadow-sm flex items-center gap-1">+ Añadir</button>
            </div>

            <div className="p-4">
              <div className="flex flex-wrap justify-between items-center gap-4 mb-4 text-xs">
                <div className="flex items-center gap-2 text-gray-600 font-medium">
                  <span>Mostrar</span>
                  <select className="border rounded p-1 outline-none" value={porPagina} onChange={(e) => { setPorPagina(Number(e.target.value)); setPaginaActual(1); }}>
                    <option value={10}>10</option>
                    <option value={25}>25</option>
                    <option value={50}>50</option>
                  </select>
                  <span>entradas</span>
                  <button onClick={exportarComprasCSV} className="bg-gray-100 border text-gray-600 px-2.5 py-1 rounded text-xs font-semibold hover:bg-gray-200 ml-2">📄 Exportar a CSV</button>
                  <button onClick={() => window.print()} className="bg-gray-100 border text-gray-600 px-2.5 py-1 rounded text-xs font-semibold hover:bg-gray-200">🖨️ Imprimir</button>
                </div>
                <div className="flex items-center gap-2">
                  <input type="text" className="border rounded p-1.5 w-64 outline-none focus:border-blue-500" placeholder="Buscar ..." value={busquedaLista} onChange={(e) => { setBusquedaLista(e.target.value); setPaginaActual(1); }} />
                </div>
              </div>

              <div className="overflow-x-auto border rounded mb-4 min-h-[300px]">
                <table className="w-full text-left text-[11px] border-collapse whitespace-nowrap">
                  <thead>
                    <tr className="bg-gray-50 text-[#004284] font-black uppercase border-b-2">
                      <th className="p-3">ACCIÓN</th>
                      <th className="p-3">FECHA ⇅</th>
                      <th className="p-3">NÚMERO DE REFERENCIA ⇅</th>
                      <th className="p-3">UBICACIÓN ⇅</th>
                      <th className="p-3">PROVEEDOR ⇅</th>
                      <th className="p-3 text-center">ESTADO DE COMPRA</th>
                      <th className="p-3 text-center">ESTADO DE PAGO</th>
                      <th className="p-3 text-right">TOTAL MONEDA</th>
                      <th className="p-3 text-right">PAGADO</th>
                      <th className="p-3 text-right">SALDO PENDIENTE</th>
                    </tr>
                  </thead>
                  <tbody>
                    {comprasPagina.length === 0 ? (
                      <tr><td colSpan="10" className="text-center py-10 text-gray-400">No hay datos disponibles en la tabla</td></tr>
                    ) : (
                      comprasPagina.map((compra) => {
                        const estadoPago = getEstadoPago(compra);
                        return (
                          <tr key={compra.id} className="border-b hover:bg-gray-50 text-gray-700">
                            <td className="p-2 relative">
                              <button onClick={(e) => toggleMenu(e, compra.id)} className="bg-[#17a2b8] text-white px-2 py-1 rounded font-bold shadow-sm">
                                Acciones ▼
                              </button>
                              {menuAbierto === compra.id && (
                                <div className="absolute z-30 mt-1 bg-white border border-gray-200 rounded-lg shadow-xl w-56 py-1 text-left normal-case font-normal">
                                  <button onClick={() => { notificar.info(`Compra ${compra.nro_factura || compra.id}\nProveedor: ${compra.proveedor_nombre}\nTotal: ${Number(compra.total).toLocaleString('es-PY')} Gs\nSaldo pendiente: ${Number(compra.saldo_pendiente).toLocaleString('es-PY')} Gs`); setMenuAbierto(null); }} className="w-full text-left px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50 flex items-center gap-2">
                                    👁️ Ver
                                  </button>
                                  <button onClick={() => { window.print(); setMenuAbierto(null); }} className="w-full text-left px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50 flex items-center gap-2">
                                    🖨️ Impresión
                                  </button>
                                  <button onClick={() => cargarCompraParaEditar(compra)} className="w-full text-left px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50 flex items-center gap-2">
                                    ✏️ Editar
                                  </button>
                                  <button onClick={() => eliminarCompra(compra.id)} className="w-full text-left px-3 py-1.5 text-xs text-red-600 hover:bg-red-50 flex items-center gap-2">
                                    🗑️ Borrar
                                  </button>
                                </div>
                              )}
                            </td>
                            <td className="p-3">{new Date(compra.fecha).toLocaleDateString('es-PY')}</td>
                            <td className="p-3 font-mono">{compra.nro_factura || `PO-${compra.id}`}</td>
                            <td className="p-3">{compra.ubicacion || nombreEmpresa}</td>
                            <td className="p-3 font-bold">{compra.proveedor_nombre}</td>
                            <td className="p-3 text-center"><span className="bg-[#85c850] text-white px-2 py-0.5 rounded-sm font-bold text-[10px]">{compra.estado_compra || 'Recibido'}</span></td>
                            <td className="p-3 text-center"><span className={`px-2 py-0.5 rounded-sm font-bold text-[10px] ${estadoPago.clase}`}>{estadoPago.label}</span></td>
                            <td className="p-3 text-right font-medium">{Number(compra.total).toLocaleString('es-PY')}</td>
                            <td className="p-3 text-right">{Number(compra.total - compra.saldo_pendiente).toLocaleString('es-PY')}</td>
                            <td className="p-3 text-right text-red-600 font-bold">{Number(compra.saldo_pendiente).toLocaleString('es-PY')}</td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>

              <div className="flex flex-wrap justify-between items-center mb-4 text-xs">
                <span className="font-bold text-gray-500">
                  Mostrando {comprasPagina.length === 0 ? 0 : (paginaSegura - 1) * porPagina + 1} a {(paginaSegura - 1) * porPagina + comprasPagina.length} de {comprasFiltradas.length} entradas
                </span>
                <div className="flex gap-1">
                  <button onClick={() => setPaginaActual((p) => Math.max(1, p - 1))} disabled={paginaSegura === 1} className="px-3 py-1 text-xs font-bold border rounded disabled:opacity-40 hover:bg-gray-50">Anterior</button>
                  {Array.from({ length: totalPaginasCompras }, (_, i) => i + 1).map((n) => (
                    <button key={n} onClick={() => setPaginaActual(n)} className={`px-3 py-1 text-xs font-bold border rounded ${n === paginaSegura ? 'bg-[#004284] text-white border-[#004284]' : 'hover:bg-gray-50'}`}>{n}</button>
                  ))}
                  <button onClick={() => setPaginaActual((p) => Math.min(totalPaginasCompras, p + 1))} disabled={paginaSegura === totalPaginasCompras} className="px-3 py-1 text-xs font-bold border rounded disabled:opacity-40 hover:bg-gray-50">Siguiente</button>
                </div>
              </div>

              <div className="bg-gray-50 border border-gray-200 rounded p-4 flex flex-wrap gap-8 text-[11px] font-bold text-gray-600 uppercase mb-4">
                <div className="text-gray-900 text-sm flex items-center border-r pr-4">TOTAL</div>
                <div><div className="text-[10px] text-gray-400">GRAN TOTAL</div><div className="text-orange-500 text-sm">{granTotal.toLocaleString('es-PY')} Gs</div></div>
                <div><div className="text-[10px] text-gray-400">COMPRA ADEUDADA</div><div className="text-orange-500 text-sm">{compraAdeudada.toLocaleString('es-PY')} Gs</div></div>
                <div><div className="text-[10px] text-gray-400">PAGADO POR MONEDA</div><div className="text-gray-800 text-sm">{pagadoPorMoneda.toLocaleString('es-PY')} Gs</div></div>
                <div><div className="text-[10px] text-gray-400">DEVOLUCIÓN DE COMPRA</div><div className="text-gray-800 text-sm">0 Gs</div></div>
                <div>
                  <div className="text-[10px] text-gray-400">ESTADO DE PAGO</div>
                  <div className="text-gray-800 text-[11px] normal-case font-medium">
                    {Object.entries(desgloseEstadoPago).map(([label, cant]) => (
                      <div key={label}>{label} - {cant}</div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================================= */}
      {/* MODAL SOBREPUESTO: AGREGAR NUEVO PRODUCTO EN VIVO                       */}
      {/* ======================================================================= */}
      {mostrarModalProducto && (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-[99999] p-4">
          <div className="bg-white w-full max-w-3xl rounded-lg shadow-2xl overflow-hidden flex flex-col max-h-[95vh]">
            <div className="bg-[#5b4fcf] px-6 py-4 flex justify-between items-center">
              <h3 className="text-white text-lg font-bold">Agregar nuevo producto</h3>
              <button onClick={() => setMostrarModalProducto(false)} className="text-white/80 hover:text-white text-2xl font-bold leading-none">×</button>
            </div>

            <form onSubmit={guardarProductoNuevo} className="p-6 overflow-y-auto bg-white flex-1 text-xs">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                <div>
                  <label className="block font-bold text-gray-700 mb-1">Nombre del producto:* ℹ️</label>
                  <input className="w-full border rounded p-2 outline-none focus:border-blue-500" placeholder="Nombre del producto" value={nombreProdNuevo} onChange={(e) => setNombreProdNuevo(e.target.value)} required />
                </div>
                <div>
                  <label className="block font-bold text-gray-700 mb-1">SKU/Codigo de Barra: ℹ️</label>
                  <input className="w-full border rounded p-2 outline-none focus:border-blue-500" placeholder="SKU/Codigo de Barra" value={skuProdNuevo} onChange={(e) => setSkuProdNuevo(e.target.value)} />
                </div>
                <div>
                  <label className="block font-bold text-gray-700 mb-1">Tipo de código de barras:*</label>
                  <select className="w-full border rounded p-2 bg-white outline-none" value={tipoCodigoBarraProdNuevo} onChange={(e) => setTipoCodigoBarraProdNuevo(e.target.value)}>
                    <option>Code 128 (C128)</option>
                    <option>EAN-13</option>
                    <option>UPC-A</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="block font-bold text-gray-700 mb-1">Unidad:*</label>
                  <select className="w-full border rounded p-2 bg-white outline-none" value={unidadProdNuevo} onChange={(e) => setUnidadProdNuevo(e.target.value)} required>
                    <option value="">Seleccione</option>
                    {unidadesDisponibles.map((u) => <option key={u.id} value={u.nombre}>{u.nombre}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block font-bold text-gray-700 mb-1">Marca:</label>
                  <select className="w-full border rounded p-2 bg-white outline-none" value={marcaProdNuevo} onChange={(e) => setMarcaProdNuevo(e.target.value)}>
                    <option value="">Seleccione</option>
                    {marcasDisponibles.map((m) => <option key={m.id} value={m.nombre}>{m.nombre}</option>)}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="block font-bold text-gray-700 mb-1">Categoría:</label>
                  <input className="w-full border rounded p-2 outline-none focus:border-blue-500" placeholder="Categoría" value={categoriaProdNuevo} onChange={(e) => setCategoriaProdNuevo(e.target.value)} />
                </div>
                <div>
                  <label className="block font-bold text-gray-700 mb-1">Subcategoría:</label>
                  <input className="w-full border rounded p-2 outline-none focus:border-blue-500" placeholder="Subcategoría" value={subcategoriaProdNuevo} onChange={(e) => setSubcategoriaProdNuevo(e.target.value)} />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4 items-start">
                <div>
                  <label className="block font-bold text-gray-700 mb-1">Cantidad para alerta:</label>
                  <input type="number" className="w-full border rounded p-2 outline-none focus:border-blue-500" placeholder="Cantidad para alerta" value={cantidadAlertaProdNuevo} onChange={(e) => setCantidadAlertaProdNuevo(e.target.value)} />
                </div>
                <div>
                  <label className="block font-bold text-gray-700 mb-1">Garantía:</label>
                  <input className="w-full border rounded p-2 outline-none focus:border-blue-500" placeholder="Garantía" value={garantiaProdNuevo} onChange={(e) => setGarantiaProdNuevo(e.target.value)} />
                </div>
                <div className="flex items-center gap-2 mt-6">
                  <input type="checkbox" checked={administraStockProdNuevo} onChange={(e) => setAdministraStockProdNuevo(e.target.checked)} />
                  <label className="font-bold text-gray-700">¿Administrar Stock? ℹ️</label>
                </div>
              </div>

              <div className="mb-4">
                <label className="block font-bold text-gray-700 mb-1">Ubicaciones comerciales: ℹ️</label>
                <div className="border rounded p-2 flex flex-wrap gap-2 bg-gray-50">
                  <span className="bg-blue-500 text-white text-[11px] font-bold px-2 py-1 rounded flex items-center gap-1">
                    ✕ {ubicacionEmpresa || nombreEmpresa}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="block font-bold text-gray-700 mb-1">Peso:</label>
                  <input type="number" className="w-full border rounded p-2 outline-none focus:border-blue-500" placeholder="Peso" value={pesoProdNuevo} onChange={(e) => setPesoProdNuevo(e.target.value)} />
                </div>
              </div>

              <div className="mb-4">
                <label className="block font-bold text-gray-700 mb-1">Descripción del producto:</label>
                <textarea className="w-full border rounded p-2 h-24 outline-none focus:border-blue-500 font-normal" value={descripcionProdNuevo} onChange={(e) => setDescripcionProdNuevo(e.target.value)} />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4 items-end">
                <div>
                  <label className="block font-bold text-gray-700 mb-1">Impuesto aplicable:</label>
                  <select className="w-full border rounded p-2 bg-white outline-none" value={ivaPctProdNuevo} onChange={(e) => handleIvaPctProdNuevo(Number(e.target.value))}>
                    <option value={10}>IVA 10%</option>
                    <option value={5}>IVA 5%</option>
                    <option value={0}>Exento</option>
                  </select>
                </div>
                <div>
                  <label className="block font-bold text-gray-700 mb-1">Tipo de impuesto sobre el precio de venta:*</label>
                  <select className="w-full border rounded p-2 bg-white outline-none" value={tipoImpuestoProdNuevo} onChange={(e) => setTipoImpuestoProdNuevo(e.target.value)}>
                    <option>Incluido</option>
                    <option>No incluido</option>
                  </select>
                </div>
                <div className="flex items-center gap-2 mb-2">
                  <input type="checkbox" checked={imeiProdNuevo} onChange={(e) => setImeiProdNuevo(e.target.checked)} />
                  <label className="font-bold text-gray-700">Habilitar IMEI o número de serie ℹ️</label>
                </div>
              </div>

              <div className="flex items-center gap-2 mb-4">
                <input type="checkbox" checked={noVenderProdNuevo} onChange={(e) => setNoVenderProdNuevo(e.target.checked)} />
                <label className="font-bold text-gray-700">No para vender ℹ️</label>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                <div>
                  <label className="block font-bold text-gray-700 mb-1">Campo personalizado1:</label>
                  <input className="w-full border rounded p-2 outline-none focus:border-blue-500" placeholder="Campo personalizado" value={campoPersonalizado1} onChange={(e) => setCampoPersonalizado1(e.target.value)} />
                </div>
                <div>
                  <label className="block font-bold text-gray-700 mb-1">Campo personalizado2:</label>
                  <input className="w-full border rounded p-2 outline-none focus:border-blue-500" placeholder="Campo personalizado" value={campoPersonalizado2} onChange={(e) => setCampoPersonalizado2(e.target.value)} />
                </div>
                <div>
                  <label className="block font-bold text-gray-700 mb-1">Campo personalizado3:</label>
                  <input className="w-full border rounded p-2 outline-none focus:border-blue-500" placeholder="Campo personalizado" value={campoPersonalizado3} onChange={(e) => setCampoPersonalizado3(e.target.value)} />
                </div>
                <div>
                  <label className="block font-bold text-gray-700 mb-1">Campo personalizado4:</label>
                  <input className="w-full border rounded p-2 outline-none focus:border-blue-500" placeholder="Campo personalizado" value={campoPersonalizado4} onChange={(e) => setCampoPersonalizado4(e.target.value)} />
                </div>
              </div>

              <div className="border rounded-lg overflow-hidden mb-2">
                <div className="grid grid-cols-3 text-white font-bold">
                  <div className="bg-green-600 px-3 py-2">Precio de compra predeterminado</div>
                  <div className="bg-green-600 px-3 py-2 border-l border-green-500">x Margen (%) ℹ️</div>
                  <div className="bg-green-600 px-3 py-2 border-l border-green-500">Precio de venta predeterminado</div>
                </div>
                <div className="grid grid-cols-3 gap-4 p-4 bg-white">
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[10px] font-bold text-gray-500 mb-1">IVA no incluido:*</label>
                      <input type="number" className="w-full border rounded p-2 outline-none focus:border-blue-500" placeholder="IVA no incluido" value={precioCompraSinIvaProdNuevo} onChange={(e) => handlePrecioCompraSinIvaProdNuevo(e.target.value)} />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-gray-500 mb-1">IVA incluido:*</label>
                      <input type="number" className="w-full border rounded p-2 outline-none focus:border-blue-500" placeholder="IVA incluido" value={precioCompraConIvaProdNuevo} onChange={(e) => handlePrecioCompraConIvaProdNuevo(e.target.value)} />
                    </div>
                  </div>
                  <div>
                    <input type="number" className="w-full border rounded p-2 outline-none focus:border-blue-500" value={margenProdNuevo} onChange={(e) => handleMargenProdNuevo(e.target.value)} />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-gray-500 mb-1">IVA no incluido</label>
                    <input type="number" className="w-full border rounded p-2 outline-none focus:border-blue-500 font-bold text-green-700" placeholder="Precio de venta" value={precioVentaConIvaProdNuevo} onChange={(e) => handlePrecioVentaConIvaProdNuevo(e.target.value)} />
                  </div>
                </div>
              </div>
            </form>

            <div className="px-6 py-4 border-t bg-gray-50 flex justify-end gap-3">
              <button type="button" onClick={() => setMostrarModalProducto(false)} className="bg-white border px-5 py-2 rounded font-bold text-xs">Cerrar</button>
              <button type="button" onClick={guardarProductoNuevo} disabled={guardandoProducto} className="bg-[#fd7e14] text-white px-6 py-2 rounded font-bold text-xs hover:bg-[#e86e04] disabled:opacity-60">
                {guardandoProducto ? 'Guardando...' : '✔ Guardar y agregar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================================= */}
      {/* MODAL SOBREPUESTO: REGISTRAR NUEVO PROVEEDOR EN VIVO                    */}
      {/* ======================================================================= */}
      {mostrarModalProveedor && (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-[99999] p-4">
          <div className="bg-white w-full max-w-5xl rounded-lg shadow-2xl overflow-hidden flex flex-col max-h-[95vh]">
            <div className="px-6 py-4 border-b flex justify-between items-center text-gray-800">
              <h3 className="text-lg font-bold flex items-center gap-2"><span className="text-[#004284]"></span> NUEVO PROVEEDOR</h3>
              <button onClick={() => setMostrarModalProveedor(false)} className="text-gray-400 hover:text-gray-600 text-2xl font-bold">×</button>
            </div>
            
            <div className="p-6 overflow-y-auto bg-gray-50 flex-1 text-xs">
              <form id="form-prov-rapido" onSubmit={handleGuardarProveedorRapido}>
                
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6 items-end">
                  <div>
                    <label className="block font-bold text-gray-700 uppercase mb-1">TIPO DE CONTACTO *</label>
                    <select className="w-full border rounded p-2.5 bg-white outline-none cursor-not-allowed" disabled><option>Proveedores</option></select>
                  </div>
                  <div className="flex border rounded overflow-hidden shadow-sm h-[42px]">
                    <button type="button" onClick={() => setEsEmpresaProv(false)} className={`flex-1 font-bold flex items-center justify-center gap-2 transition-colors ${!esEmpresaProv ? 'bg-gray-200 text-gray-800 border-b-2 border-blue-500' : 'bg-white text-gray-500'}`}><span></span> Individual</button>
                    <button type="button" onClick={() => setEsEmpresaProv(true)} className={`flex-1 font-bold flex items-center justify-center gap-2 transition-colors ${esEmpresaProv ? 'bg-gray-200 text-gray-800 border-b-2 border-blue-500' : 'bg-white text-gray-500'}`}><span></span> Empresa</button>
                  </div>
                  <div>
                    <label className="block font-bold text-gray-700 uppercase mb-1">CÓDIGO</label>
                    <input type="text" className="w-full border rounded p-2.5 bg-gray-100 outline-none" placeholder="Automático" disabled />
                  </div>
                </div>

                <div className="border border-blue-100 bg-blue-50/40 p-4 rounded-lg mb-6">
                  <h4 className="text-[#004284] font-bold mb-3">🔍 BUSCAR O REGISTRAR CONTACTO</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block font-bold text-[#004284] uppercase mb-1">TIPO DOC.</label>
                      <select className="w-full border rounded p-2 bg-white" value={tipoDocProv} onChange={(e) => setTipoDocProv(e.target.value)}>
                        <option value="RUC">RUC</option>
                        <option value="CÉDULA DE IDENTIDAD">CÉDULA DE IDENTIDAD</option>
                      </select>
                    </div>
                    <div>
                      <label className="block font-bold text-[#004284] uppercase mb-1">NRO. DOCUMENTO *</label>
                      <input type="text" className="w-full border rounded p-2 bg-white outline-none focus:border-orange-500" placeholder="Ej: 80012345-6" required value={nroDocProv} onChange={(e) => setNroDocProv(e.target.value)} />
                    </div>
                  </div>
                </div>

                <div className="bg-white border rounded-lg mb-3 overflow-hidden shadow-sm">
                  <div className="p-3 bg-white flex justify-between items-center cursor-pointer border-b" onClick={() => setAcordeonIdentificacionProv(!acordeonIdentificacionProv)}>
                    <h4 className="font-bold text-[#004284]">Identificación</h4>
                    <span className="text-gray-400 font-bold">{acordeonIdentificacionProv ? '' : ''}</span>
                  </div>
                  {acordeonIdentificacionProv && (
                    <div className="p-4">
                      {esEmpresaProv ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div><label className="block font-bold text-gray-700 uppercase mb-1">RAZÓN SOCIAL / NOMBRE COMERCIAL *</label><input type="text" className="w-full border rounded p-2.5 bg-white outline-none focus:border-orange-500" required={esEmpresaProv} value={nombreEmpresaProv} onChange={(e) => setNombreEmpresaProv(e.target.value)} /></div>
                          <div><label className="block font-bold text-gray-700 uppercase mb-1">REPRESENTANTE LEGAL</label><input type="text" className="w-full border rounded p-2 bg-white outline-none focus:border-orange-500" value={representanteLegalProv} onChange={(e) => setRepresentanteLegalProv(e.target.value)} /></div>
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                          <div><label className="block font-bold text-gray-700 uppercase mb-1">PREFIJO</label><input type="text" className="w-full border rounded p-2 bg-white outline-none" value={prefijoProv} onChange={(e) => setPrefijoProv(e.target.value)} /></div>
                          <div><label className="block font-bold text-gray-700 uppercase mb-1">NOMBRE *</label><input type="text" className="w-full border rounded p-2 bg-white outline-none" required={!esEmpresaProv} value={nombreProv} onChange={(e) => setNombreProv(e.target.value)} /></div>
                          <div><label className="block font-bold text-gray-700 uppercase mb-1">SEGUNDO NOMBRE</label><input type="text" className="w-full border rounded p-2 bg-white outline-none" value={segundoNombreProv} onChange={(e) => setSegundoNombreProv(e.target.value)} /></div>
                          <div><label className="block font-bold text-gray-700 uppercase mb-1">APELLIDO *</label><input type="text" className="w-full border rounded p-2 bg-white outline-none" required={!esEmpresaProv} value={apellidoProv} onChange={(e) => setApellidoProv(e.target.value)} /></div>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <div className="bg-white border rounded-lg mb-3 overflow-hidden shadow-sm">
                  <div className="p-3 bg-white flex justify-between items-center cursor-pointer border-b" onClick={() => setAcordeonContactoProv(!acordeonContactoProv)}>
                    <h4 className="font-bold text-green-600 flex items-center gap-1"><span>📞</span> Contacto</h4>
                    <span className="text-gray-400 font-bold">{acordeonContactoProv ? '' : ''}</span>
                  </div>
                  {acordeonContactoProv && (
                    <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div><label className="block font-bold text-gray-700 uppercase mb-1">TELÉFONO</label><input type="text" className="w-full border rounded p-2 bg-white outline-none" value={telefonoProv} onChange={(e) => setTelefonoProv(e.target.value)} /></div>
                      <div><label className="block font-bold text-gray-700 uppercase mb-1">EMAIL</label><input type="email" className="w-full border rounded p-2 bg-white outline-none" value={emailProv} onChange={(e) => setEmailProv(e.target.value)} /></div>
                    </div>
                  )}
                </div>

                <div className="bg-white border rounded-lg mb-3 overflow-hidden shadow-sm">
                  <div className="p-3 bg-white flex justify-between items-center cursor-pointer border-b" onClick={() => setAcordeonUbicacionProv(!acordeonUbicacionProv)}>
                    <h4 className="font-bold text-red-500 flex items-center gap-1"><span>📍</span> Ubicación y Datos Fiscales</h4>
                    <span className="text-gray-400 font-bold">{acordeonUbicacionProv ? '' : ''}</span>
                  </div>
                  {acordeonUbicacionProv && (
                    <div className="p-4 grid grid-cols-1 md:grid-cols-4 gap-4">
                      <div><label className="block font-bold text-gray-700 uppercase mb-1">PAÍS</label><select className="w-full border rounded p-2 bg-white" value={paisProv} onChange={(e) => setPaisProv(e.target.value)}><option value="Paraguay">Paraguay</option></select></div>
                      <div><label className="block font-bold text-gray-700 uppercase mb-1">DEPARTAMENTO</label><select className="w-full border rounded p-2 bg-white" value={departamentoProv} onChange={(e) => setDepartamentoProv(e.target.value)}><option value="-- Depto --">-- Depto --</option><option value="ALTO PARANA">ALTO PARANA</option></select></div>
                      <div><label className="block font-bold text-gray-700 uppercase mb-1">CIUDAD</label><input type="text" className="w-full border rounded p-2 bg-white outline-none" value={ciudadProv} onChange={(e) => setCiudadProv(e.target.value)} /></div>
                      <div className="hidden md:block"></div>
                      <div className="md:col-span-2"><label className="block font-bold text-gray-700 uppercase mb-1">DIRECCIÓN</label><input type="text" className="w-full border rounded p-2 bg-white outline-none" value={direccionCalleProv} onChange={(e) => setDireccionCalleProv(e.target.value)} /></div>
                      <div><label className="block font-bold text-gray-700 uppercase mb-1">NRO. CASA</label><input type="text" className="w-full border rounded p-2 bg-white outline-none" value={nroCasaProv} onChange={(e) => setNroCasaProv(e.target.value)} /></div>
                      <div><label className="block font-bold text-gray-700 uppercase mb-1">EDIFICIO / PISO</label><input type="text" className="w-full border rounded p-2 bg-white outline-none" value={edificioPisoProv} onChange={(e) => setEdificioPisoProv(e.target.value)} /></div>
                    </div>
                  )}
                </div>

                <div className="bg-white border rounded-lg mb-3 overflow-hidden shadow-sm">
                  <div className="p-3 bg-white flex justify-between items-center cursor-pointer border-b" onClick={() => setAcordeonCreditoProv(!acordeonCreditoProv)}>
                    <h4 className="font-bold text-purple-600 flex items-center gap-1"><span>💳</span> Crédito y Condiciones</h4>
                    <span className="text-gray-400 font-bold">{acordeonCreditoProv ? '' : ''}</span>
                  </div>
                  {acordeonCreditoProv && (
                    <div className="p-4 grid grid-cols-1 md:grid-cols-4 gap-4">
                      <div className="md:col-span-4"><label className="block font-bold text-gray-700 uppercase mb-1">VENDEDOR ASIGNADO</label><input type="text" className="w-full border rounded p-2 bg-white outline-none" value={vendedorAsignadoProv} onChange={(e) => setVendedorAsignadoProv(e.target.value)} /></div>
                      <div className="md:col-span-2"><label className="block font-bold text-gray-700 uppercase mb-1">SALDO INICIAL</label><input type="number" className="w-full border rounded p-2 bg-white outline-none" value={saldoInicialProv} onChange={(e) => setSaldoInicialProv(e.target.value)} /></div>
                      <div className="md:col-span-2">
                        <label className="block font-bold text-gray-700 uppercase mb-1">TÉRMINO DE PAGO</label>
                        <div className="flex gap-2">
                          <input type="number" className="w-1/2 border rounded p-2 bg-white outline-none" value={terminoPagoNumProv} onChange={(e) => setTerminoPagoNumProv(e.target.value)} />
                          <select className="w-1/2 border rounded p-2 bg-white" value={terminoPagoTipoProv} onChange={(e) => setTerminoPagoTipoProv(e.target.value)}><option value="Dias">Días</option><option value="Meses">Meses</option></select>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </form>
            </div>

            <div className="px-6 py-4 border-t bg-gray-50 flex justify-end gap-3">
              <button type="button" onClick={() => setMostrarModalProveedor(false)} className="bg-white border px-5 py-2 rounded font-bold">Cerrar</button>
              <button type="submit" form="form-prov-rapido" className="bg-[#fd7e14] text-white px-6 py-2 rounded font-bold hover:bg-[#e86e04]">✔ Guardar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}