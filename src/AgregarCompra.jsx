import React, { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';
import { sonidoExito } from './utils/sonido';
import { useEmpresaInfo } from './utils/useEmpresa';
import { useNotificacion } from './NotificacionContext';

const AgregarCompra = () => {
    const { id: empresaId, nombre: nombreEmpresa } = useEmpresaInfo();
    const { notificar, confirmar } = useNotificacion();
    // === ESTADOS SUPERIORES (DATOS DEL PROVEEDOR) ===
    const [proveedor, setProveedor] = useState('');
    const [direccionProveedor, setDireccionProveedor] = useState('');
    const [referencia, setReferencia] = useState('');
    const [fechaCompra, setFechaCompra] = useState(new Date().toISOString().slice(0, 16));
    const [estadoCompra, setEstadoCompra] = useState('');
    const [ubicacion, setUbicacion] = useState('');
    const [terminoPagoNum, setTerminoPagoNum] = useState('');
    const [terminoPagoTipo, setTerminoPagoTipo] = useState('');

    // === CATÁLOGO Y BÚSQUEDA DE PRODUCTOS REALES ===
    const [catalogoProductos, setCatalogoProductos] = useState([]);
    const [listaProveedores, setListaProveedores] = useState([]);
    const [busquedaProd, setBusquedaProd] = useState('');
    const [filtrados, setFiltrados] = useState([]);

    // === ITEMS DE LA COMPRA (productos agregados a la grilla) ===
    const [itemsCompra, setItemsCompra] = useState([]);

    // === ESTADOS DE TOTALES Y PAGOS ===
    const [tipoDescuento, setTipoDescuento] = useState('Ninguna');
    const [descuentoValor, setDescuentoValor] = useState(0);
    const [impuestoCompra, setImpuestoCompra] = useState('Ninguna');
    const [notas, setNotas] = useState('');
    const [detallesEnvio, setDetallesEnvio] = useState('');
    const [envio, setEnvio] = useState(0);

    const [pagoRealizado, setPagoRealizado] = useState(0);
    const [metodoPago, setMetodoPago] = useState('Efectivo');
    const [cuentaPago, setCuentaPago] = useState('');
    const [notaPago, setNotaPago] = useState('');

    // === ESTADO DE GUARDADO ===
    const [guardando, setGuardando] = useState(false);

    useEffect(() => {
        if (nombreEmpresa && !ubicacion) setUbicacion(`${nombreEmpresa} (BL0001)`);
    }, [nombreEmpresa]);

    // === CARGAR DATOS INICIALES DESDE SUPABASE ===
    useEffect(() => {
        cargarCatalogo();
        cargarProveedores();
    }, []);

    const cargarCatalogo = async () => {
        let query = supabase.from('productos').select('*').order('nombre');
        if (empresaId) query = query.eq('empresa_id', empresaId);
        const { data } = await query;
        if (data) setCatalogoProductos(data);
    };

    const cargarProveedores = async () => {
        let query = supabase.from('clientes').select('*').or('tipo_contacto.eq.Proveedores,tipo_contacto.eq.Ambos');
        if (empresaId) query = query.eq('empresa_id', empresaId);
        const { data } = await query;
        if (data) setListaProveedores(data);
    };

    // === BÚSQUEDA DE PRODUCTOS EN TIEMPO REAL ===
    const manejarBusqueda = (texto) => {
        setBusquedaProd(texto);
        if (texto.trim() === '') return setFiltrados([]);
        const query = texto.toLowerCase();
        setFiltrados(
            catalogoProductos
                .filter(p => p.nombre.toLowerCase().includes(query) || (p.codigo && p.codigo.toLowerCase().includes(query)))
                .slice(0, 5)
        );
    };

    // === SELECCIONAR PRODUCTO DEL BUSCADOR ===
    const seleccionarProducto = (producto) => {
        if (itemsCompra.find(item => item.id === producto.id)) {
            notificar.info('Este producto ya fue agregado.');
            return;
        }
        setItemsCompra([...itemsCompra, {
            id: producto.id,
            nombre: producto.nombre,
            codigo: producto.codigo || 'S/N',
            cantidad: 1,
            iva: 'IVA 10%',
            costo: producto.precio_compra || 0,
            subtotal: producto.precio_compra || 0,
            margen: 25,
            precioVenta: producto.precio_venta || 0,
            fecha_caducidad: ''
        }]);
        setBusquedaProd('');
        setFiltrados([]);
    };

    // === ACTUALIZAR CELDAS EDITABLES DE LA TABLA ===
    const actualizarCeldaItem = (index, campo, valor) => {
        const copia = [...itemsCompra];
        copia[index][campo] = valor;
        if (campo === 'cantidad' || campo === 'costo') {
            copia[index].subtotal = (parseInt(copia[index].cantidad) || 0) * (parseFloat(copia[index].costo) || 0);
        }
        setItemsCompra(copia);
    };

    const eliminarProducto = (id) => {
        setItemsCompra(itemsCompra.filter(p => p.id !== id));
    };

    // === CÁLCULOS AUTOMÁTICOS DE TOTALES ===
    const totalArticulos = itemsCompra.reduce((acc, i) => acc + (parseInt(i.cantidad) || 0), 0);
    const totalNetoItems = itemsCompra.reduce((acc, i) => acc + i.subtotal, 0);
    const descuentoCalculado = tipoDescuento === 'Fijo'
        ? Number(descuentoValor)
        : (tipoDescuento === 'Porcentaje' ? (totalNetoItems * (Number(descuentoValor) / 100)) : 0);

    let baseImponible = totalNetoItems - descuentoCalculado;
    let impuestoCalc = 0;
    if (impuestoCompra === 'IVA 10%') impuestoCalc = baseImponible * 0.10;
    if (impuestoCompra === 'IVA 5%') impuestoCalc = baseImponible * 0.05;

    const totalCompraFinal = baseImponible + impuestoCalc + Number(envio);
    const saldoPendienteFinal = totalCompraFinal - Number(pagoRealizado);

    // === GUARDAR COMPRA EN SUPABASE (MISMA LÓGICA QUE GestorCompras) ===
    const handleGuardar = async (e) => {
        e.preventDefault();
        if (!proveedor) return notificar.info('Seleccione un Proveedor.');
        if (itemsCompra.length === 0) return notificar.info('Agregue al menos 1 producto a la grilla.');

        setGuardando(true);
        try {
            const itemsParaRpc = itemsCompra.map((item) => ({
                producto_id: item.id,
                nombre_producto: item.nombre,
                codigo_sku: item.codigo,
                cantidad: item.cantidad,
                costo_unitario: item.costo,
            }));

            const { error } = await supabase.rpc('registrar_compra', {
                p_compra: {
                    proveedor_nombre: proveedor,
                    nro_factura: referencia,
                    total: totalCompraFinal,
                    saldo_pendiente: saldoPendienteFinal,
                    estado: saldoPendienteFinal <= 0 ? 'pagado' : 'pendiente',
                    fecha: fechaCompra,
                },
                p_items: itemsParaRpc,
            });
            if (error) throw error;

            sonidoExito();
            notificar.exito('¡Compra registrada con éxito y stock actualizado!');

            setProveedor(''); setDireccionProveedor(''); setReferencia('');
            setFechaCompra(new Date().toISOString().slice(0, 16));
            setEstadoCompra(''); setItemsCompra([]);
            setPagoRealizado(0); setDescuentoValor(0);
            setTipoDescuento('Ninguna'); setImpuestoCompra('Ninguna');
            setEnvio(0); setNotas(''); setDetallesEnvio('');
            setNotaPago(''); setCuentaPago('');
        } catch (err) {
            notificar.error('Error al guardar la compra: ' + err.message);
        } finally {
            setGuardando(false);
        }
    };

    // === SELECCIONAR PROVEEDOR Y CARGAR SU DIRECCIÓN ===
    const handleProveedorChange = (e) => {
        const nombre = e.target.value;
        setProveedor(nombre);
        const prov = listaProveedores.find(x => x.nombre === nombre);
        setDireccionProveedor(prov?.direccion || '');
    };

    // ==========================================================
    // MODAL "NUEVO (CLIENTE POTENCIAL, CLIENTE, PROVEEDOR)"
    // Se abre con el botón "+" junto a Proveedor y guarda de
    // verdad en la tabla "clientes" (misma tabla que usa la
    // pantalla de Proveedores), sin tocar nada de lo que ya
    // funcionaba en esta pantalla.
    // ==========================================================
    const [mostrarModalContacto, setMostrarModalContacto] = useState(false);
    const [guardandoContacto, setGuardandoContacto] = useState(false);

    const [tipoPersona, setTipoPersona] = useState('Individual'); // 'Individual' | 'Empresa'
    const [tipoContacto, setTipoContacto] = useState('Proveedores');
    const [codigoContacto, setCodigoContacto] = useState('');
    const [tipoDocContacto, setTipoDocContacto] = useState('RUC');
    const [nroDocContacto, setNroDocContacto] = useState('');
    const [buscandoDocumento, setBuscandoDocumento] = useState(false);

    // Sub-secciones colapsables (igual que en la referencia)
    const [seccionIdentificacion, setSeccionIdentificacion] = useState(true);
    const [seccionFoto, setSeccionFoto] = useState(false);
    const [seccionDocumentos, setSeccionDocumentos] = useState(false);
    const [seccionContacto, setSeccionContacto] = useState(true);
    const [seccionUbicacion, setSeccionUbicacion] = useState(true);
    const [seccionCredito, setSeccionCredito] = useState(true);

    // Acordeones del modal de contacto
    const [acordeonFotoProv, setAcordeonFotoProv] = useState(false);
    const [acordeonDocumentosProv, setAcordeonDocumentosProv] = useState(false);
    const [acordeonContactoProv, setAcordeonContactoProv] = useState(true);
    const [acordeonCreditoProv, setAcordeonCreditoProv] = useState(true);

    // Identificación
    const [prefijoContacto, setPrefijoContacto] = useState('');
    const [nombreContacto, setNombreContacto] = useState('');
    const [segundoNombreContacto, setSegundoNombreContacto] = useState('');
    const [apellidoContacto, setApellidoContacto] = useState('');
    const [nombreEmpresaContacto, setNombreEmpresaContacto] = useState('');
    const [fotoClienteFile, setFotoClienteFile] = useState(null);
    const [documentosFiles, setDocumentosFiles] = useState([]);

    // Contacto
    const [telefonoContacto, setTelefonoContacto] = useState('');
    const [emailContacto, setEmailContacto] = useState('');
    const [fechaNacimientoProv, setFechaNacimientoProv] = useState('');

    // Ubicación y Datos Fiscales
    const [paisContacto, setPaisContacto] = useState('Paraguay');
    const [departamentoContacto, setDepartamentoContacto] = useState('');
    const [ciudadContacto, setCiudadContacto] = useState('');
    const [calleContacto, setCalleContacto] = useState('');
    const [nroCasaContacto, setNroCasaContacto] = useState('');
    const [edificioPisoContacto, setEdificioPisoContacto] = useState('');
    const [codPostalContacto, setCodPostalContacto] = useState('7700');

    // Crédito y Condiciones
    const [vendedorAsignadoContacto, setVendedorAsignadoContacto] = useState('');
    const [saldoInicialContacto, setSaldoInicialContacto] = useState('0');
    const [terminoPagoNumContacto, setTerminoPagoNumContacto] = useState('');
    const [terminoPagoTipoContacto, setTerminoPagoTipoContacto] = useState('Días');

    const limpiarFormularioContacto = () => {
        setTipoPersona('Individual');
        setCodigoContacto('');
        setTipoDocContacto('RUC');
        setNroDocContacto('');
        setPrefijoContacto(''); setNombreContacto(''); setSegundoNombreContacto(''); setApellidoContacto('');
        setNombreEmpresaContacto('');
        setFotoClienteFile(null); setDocumentosFiles([]);
        setTelefonoContacto(''); setEmailContacto(''); setFechaNacimientoProv('');
        setPaisContacto('Paraguay'); setDepartamentoContacto(''); setCiudadContacto('');
        setCalleContacto(''); setNroCasaContacto(''); setEdificioPisoContacto(''); setCodPostalContacto('7700');
        setVendedorAsignadoContacto(''); setSaldoInicialContacto('0');
        setTerminoPagoNumContacto(''); setTerminoPagoTipoContacto('Días');
    };

    const abrirModalContacto = () => {
        limpiarFormularioContacto();
        setMostrarModalContacto(true);
    };

    // Busca si ya existe un contacto con ese documento, para no duplicar
    // (reemplaza la validación de RUC de la referencia, que necesitaría un
    // servicio externo al que no tenemos acceso desde acá).
    const buscarContactoPorDocumento = async () => {
        if (!nroDocContacto.trim()) return notificar.info('Ingresá un número de documento para buscar.');
        setBuscandoDocumento(true);
        try {
            let query = supabase.from('clientes').select('*').eq('documento_nro', nroDocContacto.trim());
            if (empresaId) query = query.eq('empresa_id', empresaId);
            const { data, error } = await query;
            if (error) throw error;
            if (data && data.length > 0) {
                const existente = data[0];
                if (!(await confirmar(`Ya existe un contacto registrado con ese documento: "${existente.nombre_empresa || existente.nombre}". ¿Querés cargar sus datos en el formulario?`))) {
                    return;
                }
                setTipoPersona(existente.nombre_empresa ? 'Empresa' : 'Individual');
                setCodigoContacto(existente.codigo_cliente || '');
                setNombreEmpresaContacto(existente.nombre_empresa || '');
                setNombreContacto(existente.nombre_empresa ? '' : (existente.nombre || ''));
                setTelefonoContacto(existente.celular || '');
                setEmailContacto(existente.email || '');
                setCalleContacto(existente.direccion || '');
                setVendedorAsignadoContacto(existente.vendedor_asignado || '');
                setSaldoInicialContacto(String(existente.saldo_apertura ?? '0'));
            } else {
                notificar.info('No se encontró ningún contacto con ese documento. Podés continuar registrándolo como nuevo.');
            }
        } catch (error) {
            notificar.error('Error al buscar el documento: ' + error.message);
        } finally {
            setBuscandoDocumento(false);
        }
    };

    const guardarNuevoContacto = async () => {
        const nombreCompleto = `${prefijoContacto} ${nombreContacto} ${segundoNombreContacto} ${apellidoContacto}`.replace(/\s+/g, ' ').trim();
        const nombreFinal = tipoPersona === 'Empresa' ? nombreEmpresaContacto.trim() : nombreCompleto;

        if (!nombreFinal) {
            notificar.info(tipoPersona === 'Empresa' ? 'Ingresá el nombre de la empresa.' : 'Ingresá al menos el nombre del contacto.');
            return;
        }

        setGuardandoContacto(true);
        try {
            const codigoGenerado = codigoContacto.trim() || `PR${Math.floor(1000 + Math.random() * 9000)}`;
            const partesDireccion = [calleContacto, nroCasaContacto ? `Nro ${nroCasaContacto}` : '', edificioPisoContacto].filter(Boolean).join(' ');
            const direccionCompleta = [partesDireccion, ciudadContacto, departamentoContacto, paisContacto, codPostalContacto ? `(CP: ${codPostalContacto})` : '']
                .filter(Boolean).join(', ');
            const terminoPagoFinal = terminoPagoNumContacto ? `${terminoPagoNumContacto} ${terminoPagoTipoContacto}` : '';

            const { data, error } = await supabase.from('clientes').insert([{
                empresa_id: empresaId,
                tipo_contacto: tipoContacto,
                codigo_cliente: codigoGenerado,
                tipo_documento: tipoDocContacto,
                documento_nro: nroDocContacto || null,
                nombre_empresa: tipoPersona === 'Empresa' ? nombreEmpresaContacto : null,
                nombre: nombreFinal,
                representante_legal: tipoPersona === 'Empresa' ? null : nombreFinal,
                celular: telefonoContacto || null,
                email: emailContacto || null,
                fecha_nacimiento: fechaNacimientoProv || null,
                direccion: direccionCompleta || null,
                vendedor_asignado: vendedorAsignadoContacto || null,
                saldo_apertura: saldoInicialContacto ? Number(saldoInicialContacto) : 0,
                termino_pago: terminoPagoFinal || null,
                estado: 'Activo',
            }]).select();

            if (error) throw error;

            // Nota: "Foto del Cliente" y "Cargar Documentos" quedan visibles y
            // seleccionables en el formulario, pero tu tabla "clientes" todavía
            // no tiene columnas para guardar esas URLs. Si querés que también
            // se guarden asociadas al contacto, agregamos esas columnas y lo
            // conecto sin problema.

            sonidoExito();

            // Refrescamos la lista de proveedores y dejamos el recién creado
            // seleccionado en el campo "Proveedor" de la compra.
            await cargarProveedores();
            if (data && data[0]) {
                setProveedor(data[0].nombre);
                setDireccionProveedor(data[0].direccion || '');
            }

            limpiarFormularioContacto();
            setMostrarModalContacto(false);
        } catch (error) {
            notificar.error('Error al guardar el contacto: ' + error.message);
        } finally {
            setGuardandoContacto(false);
        }
    };

    return (
        <>
        <form onSubmit={handleGuardar} className="p-4 bg-gray-50 w-full">
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">

                <h2 className="text-2xl font-bold text-gray-800 mb-6">Agregar compra</h2>

                {/* === SECCIÓN SUPERIOR: DATOS === */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-6">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Proveedor:*</label>
                        <div className="flex">
                            <select required value={proveedor} onChange={handleProveedorChange} className="w-full border border-gray-300 rounded-l-md p-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-orange-500 bg-white">
                                <option value="">Seleccione</option>
                                {listaProveedores.map(p => (
                                    <option key={p.id} value={p.nombre}>{p.nombre}</option>
                                ))}
                            </select>
                            <button type="button" onClick={abrirModalContacto} className="bg-blue-500 text-white px-3 rounded-r-md hover:bg-blue-600 font-bold">+</button>
                        </div>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Numero de referencia: ℹ️</label>
                        <input type="text" value={referencia} onChange={(e) => setReferencia(e.target.value)} className="w-full border border-gray-300 rounded-md p-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-orange-500" />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Fecha de compra:*</label>
                        <input type="datetime-local" required value={fechaCompra} onChange={(e) => setFechaCompra(e.target.value)} className="w-full border border-gray-300 rounded-md p-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-orange-500" />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Estado de compra:* ℹ️</label>
                        <select required value={estadoCompra} onChange={(e) => setEstadoCompra(e.target.value)} className="w-full border border-gray-300 rounded-md p-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-orange-500 bg-white">
                            <option value="">Seleccione</option>
                            <option value="Recibido">Recibido</option>
                            <option value="Pendiente">Pendiente</option>
                            <option value="Solicitado">Solicitado</option>
                        </select>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Dirección:</label>
                        <input type="text" value={direccionProveedor} className="w-full border border-gray-300 rounded-md p-2.5 text-sm bg-gray-50" readOnly />
                    </div>
                    <div className="md:col-span-2"></div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Ubicación de la empresa:* ℹ️</label>
                        <select value={ubicacion} onChange={(e) => setUbicacion(e.target.value)} className="w-full border border-gray-300 rounded-md p-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-orange-500 bg-white">
                            <option value={`${nombreEmpresa} (BL0001)`}>{nombreEmpresa} (BL0001)</option>
                        </select>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Término de pago (Credito): ℹ️</label>
                        <div className="flex gap-2">
                            <input type="number" placeholder="Término" value={terminoPagoNum} onChange={(e) => setTerminoPagoNum(e.target.value)} className="w-1/2 border border-gray-300 rounded-md p-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-orange-500" />
                            <select value={terminoPagoTipo} onChange={(e) => setTerminoPagoTipo(e.target.value)} className="w-1/2 border border-gray-300 rounded-md p-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-orange-500 bg-white">
                                <option value="">Seleccione</option>
                                <option value="Dias">Dias</option>
                                <option value="Meses">Meses</option>
                            </select>
                        </div>
                    </div>
                    <div className="md:col-span-2">
                        <label className="block text-sm font-medium text-gray-700 mb-1">Documento adjunto:</label>
                        <div className="flex items-center gap-3">
                            <label className="bg-orange-500 text-white px-4 py-2 rounded-md cursor-pointer text-sm font-medium hover:bg-orange-600 transition-colors shadow-sm flex items-center gap-2">
                                📁 Examinar..
                                <input type="file" className="hidden" />
                            </label>
                            <span className="text-xs text-gray-500">
                                Tamaño máximo de archivo: 5MB<br />
                                Archivos permitidos: .pdf, .csv, .zip, .doc, .docx, .jpeg, .png
                            </span>
                        </div>
                    </div>
                </div>

                <hr className="my-8 border-gray-100" />

                {/* === SECCIÓN MEDIA: BUSCADOR Y TABLA COMPLETA === */}
                <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 mb-4">
                    <div className="flex w-full lg:w-1/2">
                        <button type="button" className="bg-orange-500 text-white px-4 py-2.5 rounded-l-md text-sm font-medium hover:bg-orange-600 shadow-sm whitespace-nowrap">
                            Importar productos
                        </button>
                        <div className="relative flex-1">
                            <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-gray-400">🔍</span>
                            <input
                                type="text"
                                placeholder="Introduzca el nombre del producto / SKU / código de barras..."
                                value={busquedaProd}
                                onChange={(e) => manejarBusqueda(e.target.value)}
                                className="w-full border border-gray-300 rounded-r-md py-2.5 pl-10 pr-4 text-sm focus:outline-none focus:ring-1 focus:ring-orange-500 bg-white"
                            />
                            {/* Dropdown de resultados */}
                            {filtrados.length > 0 && (
                                <div className="absolute left-0 right-0 bg-white border rounded shadow-2xl z-[50] max-h-48 overflow-y-auto mt-1">
                                    {filtrados.map(p => (
                                        <div key={p.id} onClick={() => seleccionarProducto(p)} className="p-2.5 hover:bg-blue-50 cursor-pointer border-b last:border-0 flex justify-between text-sm">
                                            <span className="font-bold text-gray-800">{p.nombre}</span>
                                            <span className="text-gray-500 font-mono text-xs">[{p.codigo || 'S/C'}] - Gs {(p.precio_compra || 0).toLocaleString('es-PY')}</span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                    <div className="flex items-center gap-4">
                        <button type="button" className="text-blue-600 font-medium text-sm hover:text-blue-800">
                            + Agregar nuevo producto
                        </button>
                        <button type="button" className="bg-yellow-500 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-yellow-600 shadow-sm flex items-center gap-2">
                            🏷️ Agregar gasto
                        </button>
                    </div>
                </div>

                <div className="overflow-x-auto mb-8 border border-gray-200 rounded-md">
                    <table className="w-full text-sm text-left">
                        <thead className="text-xs text-gray-700 uppercase bg-gray-50 border-b border-gray-200">
                            <tr>
                                <th className="p-3 border-r text-center">#</th>
                                <th className="p-3 border-r">NOMBRE DEL PRODUCTO</th>
                                <th className="p-3 border-r text-center">CANT.</th>
                                <th className="p-3 border-r text-center">IVA</th>
                                <th className="p-3 border-r">COSTO UNITARIO</th>
                                <th className="p-3 border-r">LINEA TOTAL</th>
                                <th className="p-3 border-r">PROFIT %</th>
                                <th className="p-3 border-r">PRECIO VENTA</th>
                                <th className="p-3 border-r">VENCIMIENTO</th>
                                <th className="p-3 text-center">🗑️</th>
                            </tr>
                        </thead>
                        <tbody>
                            {itemsCompra.length === 0 ? (
                                <tr className="bg-white">
                                    <td colSpan="10" className="p-8 text-center text-gray-500">
                                        Ningún producto agregado a la grilla
                                    </td>
                                </tr>
                            ) : (
                                itemsCompra.map((item, index) => (
                                    <tr key={item.id} className="bg-white border-b hover:bg-gray-50">
                                        <td className="p-3 border-r text-center text-gray-400">{index + 1}</td>
                                        <td className="p-3 border-r font-bold text-gray-800">{item.nombre}</td>
                                        <td className="p-3 border-r text-center">
                                            <input type="number" min="1" value={item.cantidad} onChange={(e) => actualizarCeldaItem(index, 'cantidad', e.target.value)} className="w-16 border border-gray-300 rounded p-1 text-center" />
                                        </td>
                                        <td className="p-3 border-r text-center text-gray-500">{item.iva}</td>
                                        <td className="p-3 border-r">
                                            <input type="number" value={item.costo} onChange={(e) => actualizarCeldaItem(index, 'costo', e.target.value)} className="w-28 border border-gray-300 rounded p-1 text-right" />
                                        </td>
                                        <td className="p-3 border-r font-bold text-gray-800">Gs {item.subtotal.toLocaleString('es-PY')}</td>
                                        <td className="p-3 border-r text-center">
                                            <input type="number" value={item.margen} onChange={(e) => actualizarCeldaItem(index, 'margen', e.target.value)} className="w-16 border border-gray-300 rounded p-1 text-center" />
                                        </td>
                                        <td className="p-3 border-r font-bold text-gray-800">Gs {Number(item.precioVenta).toLocaleString('es-PY')}</td>
                                        <td className="p-3 border-r">
                                            <input type="date" value={item.fecha_caducidad} onChange={(e) => actualizarCeldaItem(index, 'fecha_caducidad', e.target.value)} className="w-32 border border-gray-300 rounded p-1 text-gray-600" />
                                        </td>
                                        <td className="p-3 text-center">
                                            <button type="button" onClick={() => eliminarProducto(item.id)} className="text-red-500 hover:text-red-700 font-bold">🗑️</button>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>

                <hr className="my-8 border-gray-100" />

                {/* === SECCIÓN INFERIOR: TOTALES EXACTA === */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 mb-8 border-b border-gray-200 pb-8">
                    <div className="space-y-4">
                        <div className="flex items-center gap-4">
                            <label className="text-sm font-medium text-gray-700 w-1/3">Tipo de descuento:</label>
                            <select value={tipoDescuento} onChange={(e) => setTipoDescuento(e.target.value)} className="flex-1 border border-gray-300 rounded-md p-2 text-sm focus:outline-none focus:ring-1 focus:ring-orange-500 bg-white">
                                <option value="Ninguna">Ninguna</option>
                                <option value="Fijo">Fijo</option>
                                <option value="Porcentaje">Porcentaje</option>
                            </select>
                        </div>
                        <div className="flex items-center gap-4">
                            <label className="text-sm font-medium text-gray-700 w-1/3">Importe de descuento:*</label>
                            <input type="number" value={descuentoValor} onChange={(e) => setDescuentoValor(e.target.value)} disabled={tipoDescuento === 'Ninguna'} className="flex-1 border border-gray-300 rounded-md p-2 text-sm disabled:bg-gray-100" />
                        </div>
                        <div className="flex items-center gap-4">
                            <label className="text-sm font-medium text-gray-700 w-1/3">Impuesto de compra:</label>
                            <select value={impuestoCompra} onChange={(e) => setImpuestoCompra(e.target.value)} className="flex-1 border border-gray-300 rounded-md p-2 text-sm focus:outline-none focus:ring-1 focus:ring-orange-500 bg-white">
                                <option value="Ninguna">Ninguna</option>
                                <option value="IVA 10%">IVA 10%</option>
                                <option value="IVA 5%">IVA 5%</option>
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1 mt-4">Notas adicionales</label>
                            <textarea value={notas} onChange={(e) => setNotas(e.target.value)} className="w-full border border-gray-300 rounded-md p-2 text-sm" rows="3"></textarea>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Detalles de envío</label>
                            <textarea value={detallesEnvio} onChange={(e) => setDetallesEnvio(e.target.value)} className="w-full border border-gray-300 rounded-md p-2 text-sm" rows="2"></textarea>
                        </div>
                        <div className="flex items-center gap-4">
                            <label className="text-sm font-medium text-gray-700 w-2/3">(+) Cargos de envío adicionales:*</label>
                            <input type="number" value={envio} onChange={(e) => setEnvio(e.target.value)} className="flex-1 border border-gray-300 rounded-md p-2 text-sm" />
                        </div>
                    </div>

                    <div className="flex flex-col justify-start text-right space-y-3 bg-gray-50 p-6 rounded-lg border border-gray-100 h-fit">
                        <p className="text-sm text-gray-600 flex justify-between"><span>Total artículos:</span> <span className="font-bold text-gray-800">{totalArticulos}</span></p>
                        <p className="text-sm text-gray-600 flex justify-between"><span>Total a Pagar con IVA:</span> <span className="font-bold text-gray-800">Gs {totalNetoItems.toLocaleString('es-PY')}</span></p>
                        <p className="text-sm text-gray-600 flex justify-between"><span>Descuento:</span> <span className="font-bold text-red-500">(-) Gs {descuentoCalculado.toLocaleString('es-PY')}</span></p>
                        <p className="text-sm text-gray-600 flex justify-between"><span>Impuesto de compra:</span> <span className="font-bold text-gray-800">(+) Gs {impuestoCalc.toLocaleString('es-PY')}</span></p>
                        <div className="border-t border-gray-200 mt-4 pt-4">
                            <p className="text-xl font-bold text-gray-800 flex justify-between"><span>Total compra:</span> <span>Gs {totalCompraFinal.toLocaleString('es-PY')}</span></p>
                        </div>
                    </div>
                </div>

                {/* === SECCIÓN PAGOS EXACTA === */}
                <h3 className="text-lg font-bold text-gray-800 mb-4 border-l-4 border-orange-500 pl-2">Monto total pagado o pago parcial</h3>
                <div className="bg-gray-50 p-6 rounded-lg border border-gray-200 mb-8">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Cantidad (PYG):*</label>
                            <div className="relative">
                                <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-gray-500 font-medium">Gs</span>
                                <input type="number" required value={pagoRealizado} onChange={(e) => setPagoRealizado(e.target.value)} className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-orange-500 bg-white" />
                            </div>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Método de pago:*</label>
                            <div className="flex items-center">
                                <span className="bg-gray-200 border border-gray-300 border-r-0 rounded-l-md px-3 py-2">💵</span>
                                <select value={metodoPago} onChange={(e) => setMetodoPago(e.target.value)} className="w-full border border-gray-300 rounded-r-md p-2 text-sm focus:outline-none focus:ring-1 focus:ring-orange-500 bg-white">
                                    <option value="Efectivo">Efectivo</option>
                                    <option value="Tarjeta">Tarjeta</option>
                                    <option value="Transferencia">Transferencia</option>
                                </select>
                            </div>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Cuenta de pago:</label>
                            <div className="flex items-center">
                                <span className="bg-gray-200 border border-gray-300 border-r-0 rounded-l-md px-3 py-2">🏦</span>
                                <select value={cuentaPago} onChange={(e) => setCuentaPago(e.target.value)} className="w-full border border-gray-300 rounded-r-md p-2 text-sm focus:outline-none focus:ring-1 focus:ring-orange-500 bg-white">
                                    <option value="">-- Seleccione cuenta --</option>
                                    <option value="Caja Venta">Caja venta (Saldo: Gs 1.750.000)</option>
                                </select>
                            </div>
                        </div>
                    </div>
                    <div className="mt-4">
                        <label className="block text-sm font-medium text-gray-700 mb-1">Nota de pago:</label>
                        <textarea value={notaPago} onChange={(e) => setNotaPago(e.target.value)} className="w-full border border-gray-300 rounded-md p-2 text-sm focus:outline-none focus:ring-1 focus:ring-orange-500 bg-white" rows="2"></textarea>
                    </div>
                    <div className="mt-6 flex justify-end">
                        <p className="text-sm font-bold text-gray-700 bg-white px-4 py-2 rounded-md border border-gray-200 shadow-sm">
                            Saldo Pendiente de pago:
                            <span className={saldoPendienteFinal > 0 ? "text-red-500 text-lg ml-2" : "text-green-500 text-lg ml-2"}>
                                Gs {saldoPendienteFinal.toLocaleString('es-PY')}
                            </span>
                        </p>
                    </div>
                </div>

                {/* === BOTONES DE ACCIÓN FINAL === */}
                <div className="flex justify-end gap-3">
                    <button type="button" className="bg-gray-200 text-gray-700 px-6 py-2.5 rounded-md font-medium hover:bg-gray-300 transition-colors">Volver</button>
                    <button type="submit" disabled={guardando} className="bg-blue-600 text-white px-8 py-2.5 rounded-md font-medium hover:bg-blue-700 transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed">
                        {guardando ? 'Guardando...' : 'Guardar'}
                    </button>
                </div>

            </div>
        </form>

        {/* ============================================================
            MODAL: NUEVO (CLIENTE POTENCIAL, CLIENTE, PROVEEDOR)
            Clon funcional de app.micdepos.com/purchases/create
           ============================================================ */}
        {mostrarModalContacto && (
            <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[9999] p-4" onClick={() => setMostrarModalContacto(false)}>
                <div className="bg-gradient-to-b from-orange-50/60 to-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden max-h-[92vh] flex flex-col" onClick={(e) => e.stopPropagation()}>

                    {/* Encabezado */}
                    <div className="px-6 py-4 border-b flex justify-between items-center bg-[#1b2032] text-white">
                        <h3 className="text-lg font-bold flex items-center gap-2">👤 NUEVO (CLIENTE POTENCIAL, CLIENTE, PROVEEDOR)</h3>
                        <button onClick={() => setMostrarModalContacto(false)} className="text-white/70 hover:text-white text-2xl font-bold">×</button>
                    </div>

                    <div className="overflow-y-auto p-6 text-sm">

                        {/* Individual / Empresa + Código */}
                        <div className="flex flex-wrap justify-between items-start gap-4 mb-5">
                            <div className="w-56">
                                <label className="block text-xs font-bold text-orange-700/80 mb-1 tracking-wide">TIPO DE CONTACTO *</label>
                                <select value={tipoContacto} onChange={(e) => setTipoContacto(e.target.value)} className="w-full border-2 border-orange-100 rounded-lg p-2 text-sm bg-white">
                                    <option value="Clientes">Clientes</option>
                                    <option value="Proveedores">Proveedores</option>
                                    <option value="Ambos">Ambos (Proveedor y Cliente)</option>
                                </select>
                            </div>
                            <div className="flex bg-orange-100/60 p-1 rounded-full">
                                <button
                                    type="button"
                                    onClick={() => setTipoPersona('Individual')}
                                    className={`px-5 py-2 text-sm font-bold flex items-center gap-2 rounded-full transition-all ${tipoPersona === 'Individual' ? 'bg-gradient-to-r from-orange-500 to-amber-400 text-white shadow-md' : 'text-orange-700/70 hover:text-orange-700'}`}
                                >
                                    👤 Individual
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setTipoPersona('Empresa')}
                                    className={`px-5 py-2 text-sm font-bold flex items-center gap-2 rounded-full transition-all ${tipoPersona === 'Empresa' ? 'bg-gradient-to-r from-orange-500 to-amber-400 text-white shadow-md' : 'text-orange-700/70 hover:text-orange-700'}`}
                                >
                                    🏢 Empresa
                                </button>
                            </div>
                            <div className="w-48">
                                <label className="block text-xs font-bold text-orange-700/80 mb-1 tracking-wide">CÓDIGO</label>
                                <input
                                    type="text"
                                    value={codigoContacto}
                                    onChange={(e) => setCodigoContacto(e.target.value)}
                                    placeholder="Automático"
                                    className="w-full border-2 border-orange-100 rounded-lg p-2 text-sm outline-none focus:ring-2 focus:ring-orange-400 focus:border-orange-400 transition-colors"
                                />
                            </div>
                        </div>

                        {/* Buscar o registrar contacto */}
                        <div className="border-2 border-amber-200 bg-gradient-to-br from-amber-50 to-orange-50 rounded-xl p-4 mb-5 shadow-sm">
                            <p className="text-xs font-extrabold text-amber-700 mb-3 flex items-center gap-1 tracking-wide">🔍 BUSCAR O REGISTRAR CONTACTO</p>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-bold text-gray-600 mb-1">TIPO DOC.</label>
                                    <select
                                        value={tipoDocContacto}
                                        onChange={(e) => setTipoDocContacto(e.target.value)}
                                        className="w-full border-2 border-amber-200 rounded-lg p-2 text-sm bg-white outline-none focus:ring-2 focus:ring-amber-400 transition-colors"
                                    >
                                        <option value="RUC">RUC</option>
                                        <option value="CI">Cédula de Identidad</option>
                                        <option value="Pasaporte">Pasaporte</option>
                                        <option value="Otro">Otro</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-gray-600 mb-1">NRO. DOCUMENTO *</label>
                                    <div className="flex gap-2">
                                        <input
                                            type="text"
                                            value={nroDocContacto}
                                            onChange={(e) => setNroDocContacto(e.target.value)}
                                            placeholder="Ej: 4671379-4 (RUC con dígito verificador)"
                                            className="w-full border-2 border-amber-200 rounded-lg p-2 text-sm outline-none focus:ring-2 focus:ring-amber-400 transition-colors"
                                        />
                                        <button
                                            type="button"
                                            title="Búsqueda automática de RUC (próximamente)"
                                            onClick={() => notificar.info('La búsqueda automática de RUC todavía no está conectada a ningún padrón — cargá los datos a mano por ahora.')}
                                            className="bg-orange-500 hover:bg-orange-600 text-white rounded-full w-10 h-10 flex items-center justify-center shrink-0 shadow-sm"
                                        >🔍</button>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Identificación */}
                        <div className="border-2 border-sky-100 bg-white rounded-xl mb-3 shadow-sm overflow-hidden">
                            <button type="button" onClick={() => setSeccionIdentificacion((v) => !v)} className="w-full flex justify-between items-center px-4 py-3 font-bold text-gray-700 bg-sky-50/70 hover:bg-sky-50 transition-colors">
                                <span className="flex items-center gap-2"><span className="bg-sky-500 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs">🪪</span> Identificación</span>
                                <span className="text-sky-500">{seccionIdentificacion ? '▾' : '▸'}</span>
                            </button>
                            {seccionIdentificacion && (
                                <div className="px-4 pb-4 pt-3">
                                    {tipoPersona === 'Individual' ? (
                                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                            <div>
                                                <label className="block text-xs font-bold text-gray-600 mb-1">PREFIJO</label>
                                                <input type="text" value={prefijoContacto} onChange={(e) => setPrefijoContacto(e.target.value)} placeholder="—" className="w-full border-2 border-gray-200 rounded-lg p-2 text-sm outline-none focus:ring-2 focus:ring-sky-400 focus:border-sky-400 transition-colors" />
                                                <p className="text-[10px] text-gray-400 mt-1">Opcional (Sr., Sra.)</p>
                                            </div>
                                            <div>
                                                <label className="block text-xs font-bold text-gray-600 mb-1">NOMBRE *</label>
                                                <input type="text" value={nombreContacto} onChange={(e) => setNombreContacto(e.target.value)} placeholder="Nombre" className="w-full border-2 border-gray-200 rounded-lg p-2 text-sm outline-none focus:ring-2 focus:ring-sky-400 focus:border-sky-400 transition-colors" />
                                            </div>
                                            <div>
                                                <label className="block text-xs font-bold text-gray-600 mb-1">SEGUNDO NOMBRE</label>
                                                <input type="text" value={segundoNombreContacto} onChange={(e) => setSegundoNombreContacto(e.target.value)} placeholder="Segundo nombre" className="w-full border-2 border-gray-200 rounded-lg p-2 text-sm outline-none focus:ring-2 focus:ring-sky-400 focus:border-sky-400 transition-colors" />
                                                <p className="text-[10px] text-gray-400 mt-1">Opcional, no requerido</p>
                                            </div>
                                            <div>
                                                <label className="block text-xs font-bold text-gray-600 mb-1">APELLIDO</label>
                                                <input type="text" value={apellidoContacto} onChange={(e) => setApellidoContacto(e.target.value)} placeholder="Apellido" className="w-full border-2 border-gray-200 rounded-lg p-2 text-sm outline-none focus:ring-2 focus:ring-sky-400 focus:border-sky-400 transition-colors" />
                                            </div>
                                        </div>
                                    ) : (
                                        <div>
                                            <label className="block text-xs font-bold text-gray-600 mb-1">NOMBRE DE EMPRESA</label>
                                            <input type="text" value={nombreEmpresaContacto} onChange={(e) => setNombreEmpresaContacto(e.target.value)} placeholder="Nombre de la empresa" className="w-full border-2 border-gray-200 rounded-lg p-2 text-sm outline-none focus:ring-2 focus:ring-sky-400 focus:border-sky-400 transition-colors" />
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>

                        {/* Foto del Cliente */}
                        <div className="border-2 border-rose-100 bg-white rounded-xl mb-3 shadow-sm overflow-hidden">
                            <button type="button" onClick={() => setAcordeonFotoProv((v) => !v)} className="w-full flex justify-between items-center px-4 py-3 font-bold text-gray-700 bg-rose-50/70 hover:bg-rose-50 transition-colors">
                                <span className="flex items-center gap-2"><span className="bg-rose-500 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs">📷</span> Foto del Cliente</span>
                                <span className="text-rose-500">{acordeonFotoProv ? '▲' : '▼'}</span>
                            </button>
                            {acordeonFotoProv && (
                                <div className="px-4 pb-4 pt-3 text-gray-400 italic">La carga de fotos todavía no está conectada — próximamente.</div>
                            )}
                        </div>

                        {/* Cargar Documentos */}
                        <div className="border-2 border-fuchsia-100 bg-white rounded-xl mb-3 shadow-sm overflow-hidden">
                            <button type="button" onClick={() => setAcordeonDocumentosProv((v) => !v)} className="w-full flex justify-between items-center px-4 py-3 font-bold text-gray-700 bg-fuchsia-50/70 hover:bg-fuchsia-50 transition-colors">
                                <span className="flex items-center gap-2">
                                    <span className="bg-fuchsia-500 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs">📎</span>
                                    Cargar Documentos <span className="text-xs font-normal text-gray-400">(CI, contratos, etc.)</span>
                                </span>
                                <span className="text-fuchsia-500">{acordeonDocumentosProv ? '▲' : '▼'}</span>
                            </button>
                            {acordeonDocumentosProv && (
                                <div className="px-4 pb-4 pt-3 text-gray-400 italic">La carga de documentos todavía no está conectada — próximamente.</div>
                            )}
                        </div>

                        {/* Contacto */}
                        <div className="border-2 border-emerald-100 bg-white rounded-xl mb-3 shadow-sm overflow-hidden">
                            <button type="button" onClick={() => setAcordeonContactoProv((v) => !v)} className="w-full flex justify-between items-center px-4 py-3 font-bold text-gray-700 bg-emerald-50/70 hover:bg-emerald-50 transition-colors">
                                <span className="flex items-center gap-2"><span className="bg-emerald-500 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs">📞</span> Contacto</span>
                                <span className="text-emerald-500">{acordeonContactoProv ? '▲' : '▼'}</span>
                            </button>
                            {acordeonContactoProv && (
                                <div className="px-4 pb-4 pt-3 grid grid-cols-1 md:grid-cols-3 gap-4">
                                    <div>
                                        <label className="block text-xs font-bold text-gray-600 mb-1">TELÉFONO</label>
                                        <input type="text" value={telefonoContacto} onChange={(e) => setTelefonoContacto(e.target.value)} placeholder="Celular / Teléfono" className="w-full border-2 border-gray-200 rounded-lg p-2 text-sm outline-none focus:ring-2 focus:ring-emerald-400 focus:border-emerald-400 transition-colors" />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-gray-600 mb-1">EMAIL</label>
                                        <input type="email" value={emailContacto} onChange={(e) => setEmailContacto(e.target.value)} placeholder="Email" className="w-full border-2 border-gray-200 rounded-lg p-2 text-sm outline-none focus:ring-2 focus:ring-emerald-400 focus:border-emerald-400 transition-colors" />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-gray-600 mb-1">FECHA NACIMIENTO</label>
                                        <input type="date" value={fechaNacimientoProv} onChange={(e) => setFechaNacimientoProv(e.target.value)} className="w-full border-2 border-gray-200 rounded-lg p-2 text-sm outline-none focus:ring-2 focus:ring-emerald-400 focus:border-emerald-400 transition-colors" />
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Ubicación y Datos Fiscales */}
                        <div className="border-2 border-orange-100 bg-white rounded-xl mb-3 shadow-sm overflow-hidden">
                            <button type="button" onClick={() => setSeccionUbicacion((v) => !v)} className="w-full flex justify-between items-center px-4 py-3 font-bold text-gray-700 bg-orange-50/70 hover:bg-orange-50 transition-colors">
                                <span className="flex items-center gap-2"><span className="bg-orange-500 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs">📍</span> Ubicación y Datos Fiscales</span>
                                <span className="text-orange-500">{seccionUbicacion ? '▾' : '▸'}</span>
                            </button>
                            {seccionUbicacion && (
                                <div className="px-4 pb-4 pt-3">
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                                        <div>
                                            <label className="block text-xs font-bold text-gray-600 mb-1">PAÍS</label>
                                            <select value={paisContacto} onChange={(e) => setPaisContacto(e.target.value)} className="w-full border-2 border-gray-200 rounded-lg p-2 text-sm bg-white outline-none focus:ring-2 focus:ring-orange-400 focus:border-orange-400 transition-colors">
                                                <option value="Paraguay">Paraguay</option>
                                                <option value="Argentina">Argentina</option>
                                                <option value="Brasil">Brasil</option>
                                                <option value="Otro">Otro</option>
                                            </select>
                                        </div>
                                        <div>
                                            <label className="block text-xs font-bold text-gray-600 mb-1">DEPARTAMENTO</label>
                                            <input type="text" value={departamentoContacto} onChange={(e) => setDepartamentoContacto(e.target.value)} placeholder="-- Depto --" className="w-full border-2 border-gray-200 rounded-lg p-2 text-sm outline-none focus:ring-2 focus:ring-orange-400 focus:border-orange-400 transition-colors" />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-bold text-gray-600 mb-1">CIUDAD</label>
                                            <input type="text" value={ciudadContacto} onChange={(e) => setCiudadContacto(e.target.value)} placeholder="-- Seleccionar ciudad --" className="w-full border-2 border-gray-200 rounded-lg p-2 text-sm outline-none focus:ring-2 focus:ring-orange-400 focus:border-orange-400 transition-colors" />
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                                        <div className="md:col-span-2">
                                            <label className="block text-xs font-bold text-gray-600 mb-1">DIRECCIÓN (CALLE / BARRIO / AV)</label>
                                            <input type="text" value={calleContacto} onChange={(e) => setCalleContacto(e.target.value)} placeholder="Calle / Barrio / Av / Referencia" className="w-full border-2 border-gray-200 rounded-lg p-2 text-sm outline-none focus:ring-2 focus:ring-orange-400 focus:border-orange-400 transition-colors" />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-bold text-gray-600 mb-1">NRO. CASA</label>
                                            <input type="text" value={nroCasaContacto} onChange={(e) => setNroCasaContacto(e.target.value)} placeholder="Ej: 123" className="w-full border-2 border-gray-200 rounded-lg p-2 text-sm outline-none focus:ring-2 focus:ring-orange-400 focus:border-orange-400 transition-colors" />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-bold text-gray-600 mb-1">EDIFICIO / PISO / DPTO</label>
                                            <input type="text" value={edificioPisoContacto} onChange={(e) => setEdificioPisoContacto(e.target.value)} placeholder="Opcional" className="w-full border-2 border-gray-200 rounded-lg p-2 text-sm outline-none focus:ring-2 focus:ring-orange-400 focus:border-orange-400 transition-colors" />
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mt-4">
                                        <div>
                                            <label className="block text-xs font-bold text-gray-600 mb-1">CÓD. POSTAL</label>
                                            <input type="text" value={codPostalContacto} onChange={(e) => setCodPostalContacto(e.target.value)} className="w-full border-2 border-gray-200 rounded-lg p-2 text-sm outline-none focus:ring-2 focus:ring-orange-400 focus:border-orange-400 transition-colors" />
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Crédito y Condiciones */}
                        <div className="border-2 border-violet-100 bg-white rounded-xl mb-3 shadow-sm overflow-hidden">
                            <button type="button" onClick={() => setSeccionCredito((v) => !v)} className="w-full flex justify-between items-center px-4 py-3 font-bold text-gray-700 bg-violet-50/70 hover:bg-violet-50 transition-colors">
                                <span className="flex items-center gap-2"><span className="bg-violet-500 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs">💳</span> Crédito y Condiciones</span>
                                <span className="text-violet-500">{seccionCredito ? '▾' : '▸'}</span>
                            </button>
                            {seccionCredito && (
                                <div className="px-4 pb-4 pt-3">
                                    <div className="mb-4">
                                        <label className="block text-xs font-bold text-gray-600 mb-1">VENDEDOR ASIGNADO</label>
                                        <input type="text" value={vendedorAsignadoContacto} onChange={(e) => setVendedorAsignadoContacto(e.target.value)} className="w-full border-2 border-gray-200 rounded-lg p-2 text-sm outline-none focus:ring-2 focus:ring-violet-400 focus:border-violet-400 transition-colors" />
                                    </div>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-xs font-bold text-gray-600 mb-1">SALDO INICIAL</label>
                                            <input type="number" value={saldoInicialContacto} onChange={(e) => setSaldoInicialContacto(e.target.value)} className="w-full border-2 border-gray-200 rounded-lg p-2 text-sm outline-none focus:ring-2 focus:ring-violet-400 focus:border-violet-400 transition-colors" />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-bold text-gray-600 mb-1">TÉRMINO DE PAGO</label>
                                            <div className="flex gap-2">
                                                <input type="number" value={terminoPagoNumContacto} onChange={(e) => setTerminoPagoNumContacto(e.target.value)} placeholder="N°" className="w-20 border-2 border-gray-200 rounded-lg p-2 text-sm outline-none focus:ring-2 focus:ring-violet-400 focus:border-violet-400 transition-colors" />
                                                <select value={terminoPagoTipoContacto} onChange={(e) => setTerminoPagoTipoContacto(e.target.value)} className="flex-1 border-2 border-gray-200 rounded-lg p-2 text-sm bg-white outline-none focus:ring-2 focus:ring-violet-400 focus:border-violet-400 transition-colors">
                                                    <option value="Días">Días</option>
                                                    <option value="Meses">Meses</option>
                                                </select>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Footer */}
                    <div className="border-t border-orange-100 px-6 py-4 flex justify-end gap-3 flex-shrink-0 bg-white">
                        <button type="button" onClick={() => setMostrarModalContacto(false)} className="bg-gray-100 text-gray-600 px-6 py-2.5 rounded-lg font-bold hover:bg-gray-200 transition-colors">
                            Cerrar
                        </button>
                        <button
                            type="button"
                            onClick={guardarNuevoContacto}
                            disabled={guardandoContacto}
                            className="bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white px-8 py-2.5 rounded-lg font-bold shadow-md hover:shadow-lg disabled:opacity-60 transition-all"
                        >
                            {guardandoContacto ? 'Guardando...' : '✓ Guardar'}
                        </button>
                    </div>
                </div>
            </div>
        )}
        </>
    );
};

export default AgregarCompra;