import { useEffect, useMemo, useState } from 'react';
import { Building2, Calculator, Check, ChevronDown, CircleDollarSign, FileText, Gift, Image, LoaderCircle, Mail, Monitor, Package, Puzzle, Save, Settings, ShieldCheck, ShoppingCart, Smartphone, Store, Tags, Truck, Users } from 'lucide-react';
import { Link } from 'react-router-dom';
import { supabase } from './supabaseClient';
import { sonidoExito, sonidoError } from './utils/sonido';

const BASE_INPUT = 'w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-orange-400 focus:ring-4 focus:ring-orange-100 disabled:bg-slate-100';
const months = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
const currencyCodes = typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('currency').filter(code => code !== 'XXX') : ['PYG','USD','BRL','ARS','EUR','CLP','UYU','BOB','PEN','COP','MXN'];
const currencyNames = new Intl.DisplayNames(['es-PY'], { type: 'currency' });
const currencies = currencyCodes.map(value => ({ value, label: `${currencyNames.of(value)} (${value})` }));
const timeZones = [...new Set([...(typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone') : ['America/Asuncion']), 'UTC'])].sort();
const field = (label, key, type = 'text', options = [], extra = {}) => ({ label, key, type, options, ...extra });
const check = (label, key, extra = {}) => field(label, key, 'checkbox', [], extra);
const select = (label, key, options, extra = {}) => field(label, key, 'select', options, extra);
const group = (title, fields) => ({ title, fields });

const SECTION_DEFS = [
  { id: 'empresa', label: 'Empresa', icon: Building2, description: 'Identidad del negocio, moneda y parámetros generales.', groups: [
    group('Datos de la empresa', [field('Nombre de la empresa', 'nombre', 'company'), field('RUC', 'ruc', 'company-ruc'), field('Dirección', 'direccion', 'company-address'), field('Teléfono', 'telefono', 'company-phone'), field('Fecha de inicio', 'start_date', 'date'), field('Porcentaje de beneficio predeterminado', 'default_profit_percent', 'number', [], { min: 0, max: 100, suffix: '%' }), select('Moneda', 'currency', currencies), check('Habilitar multidivisa', 'enable_multicurrency'), field('Monedas extra activas', 'multicurrency_ids', 'multiselect', currencies), select('Colocación del símbolo de moneda', 'currency_symbol_placement', ['Antes de la cantidad', 'Después de la cantidad']), select('Zona horaria', 'time_zone', timeZones), field('Logotipo de la empresa', 'logo_url', 'logo'), select('Mes de inicio del año fiscal', 'fy_start_month', months), select('Método de contabilidad', 'accounting_method', ['FIFO (Primero en entrar, primero en salir)', 'LIFO (Último en entrar, primero en salir)']), field('Días de edición de transacción', 'transaction_edit_days', 'number', [], { min: 0 }), select('Formato de fecha', 'date_format', ['dd-mm-yyyy','mm-dd-yyyy','dd/mm/yyyy','mm/dd/yyyy']), select('Formato de tiempo', 'time_format', ['12 horas','24 horas']), select('Precisión de moneda', 'currency_precision', ['0','1','2','3','4']), select('Precisión de cantidad', 'quantity_precision', ['0','1','2','3','4'])]),
  ]},
  { id: 'impuesto', label: 'Impuesto', icon: Calculator, description: 'Nombres e identificadores fiscales y aplicación en las operaciones.', groups: [group('Datos fiscales', [field('Impuesto 1: nombre', 'tax_label_1'), field('Impuesto 1: número', 'tax_number_1'), field('Impuesto 2: nombre', 'tax_label_2'), field('Impuesto 2: número', 'tax_number_2'), check('Habilitar impuesto en línea en compras y ventas', 'enable_inline_tax')])]},
  { id: 'producto', label: 'Producto', icon: Package, description: 'Valores predeterminados y opciones de inventario.', groups: [group('Catálogo e inventario', [field('Prefijo SKU', 'sku_prefix'), check('Habilitar vencimiento del producto', 'enable_product_expiry'), select('Tipo de vencimiento', 'expiry_type', ['Lista de vencimientos','Fecha de fabricación y período de vencimiento']), select('Acción al vencer un producto', 'on_product_expiry', ['Seguir vendiendo','Dejar de vender antes del vencimiento']), field('Días antes para detener la venta', 'stop_selling_before', 'number', [], { min: 0 }), check('Habilitar marcas', 'enable_brand'), check('Habilitar categorías', 'enable_category'), check('Habilitar subcategorías', 'enable_sub_category'), check('Habilitar información de precio e impuestos', 'enable_price_tax'), select('Unidad predeterminada', 'default_unit', ['UNID (UNID)','LITROS (LS)','METROS (MT)','Servicios (S)','Kg (K)']), check('Habilitar subunidades', 'enable_sub_units'), check('Habilitar bastidores', 'enable_racks'), check('Habilitar filas', 'enable_row'), check('Habilitar posición', 'enable_position'), check('Habilitar garantía de producto', 'enable_product_warranty'), check('Habilitar unidad secundaria', 'enable_secondary_unit')])]},
  { id: 'contacto', label: 'Contacto', icon: Users, description: 'Límite de crédito predeterminado para clientes y proveedores.', groups: [group('Clientes y proveedores', [field('Límite de crédito predeterminado', 'default_credit_limit', 'number', [], { min: 0 })])]},
  { id: 'venta', label: 'Venta', icon: ShoppingCart, description: 'Valores predeterminados de venta, personal de servicio y comisiones.', groups: [group('Valores de venta', [field('Descuento de venta predeterminado', 'default_sales_discount', 'number', [], { min: 0, max: 100, suffix: '%' }), select('Impuesto de venta predeterminado', 'default_sales_tax', ['Ninguna','IVA 10%','IVA 5%','EXENTA']), select('Método para agregar artículos', 'item_addition_method', ['Agregar en una nueva fila','Aumentar la cantidad si el artículo ya existe']), select('Método de redondeo', 'amount_rounding_method', ['Ninguna','Número entero más cercano','Múltiplo de 0.05','Múltiplo de 0.1','Múltiplo de 0.5']), check('El precio de venta es el precio mínimo', 'enable_msp'), check('Permitir sobreventa', 'allow_overselling'), check('Habilitar órdenes de venta', 'enable_sales_order'), check('Exigir plazo de pago', 'is_pay_term_required')]), group('Personal y cobros', [select('Agente comercial', 'sales_cmsn_agnt', ['Desactivar','Usuario conectado','Seleccionar de la lista de usuarios','Seleccionar de la lista de agentes comerciales']), select('Cálculo de comisión', 'cmmsn_calculation_type', ['Valor de la factura','Pago recibido']), check('Exigir agente comercial', 'is_commission_agent_required'), check('Habilitar enlace de pago', 'enable_payment_link')]), group('Pasarelas de pago (opcional)', [field('Razorpay Key ID', 'razor_pay_key_id'), field('Razorpay Key Secret', 'razor_pay_key_secret', 'password'), field('Stripe public key', 'stripe_public_key'), field('Stripe secret key', 'stripe_secret_key', 'password')])]},
  { id: 'pos', label: 'Punto de venta', icon: Store, description: 'Atajos, opciones de caja, productos, tickets y balanza.', groups: [group('Atajos de teclado', [field('Venta rápida', 'shortcut_express_checkout'), field('Pagar y finalizar', 'shortcut_pay_checkout'), field('Guardar como borrador', 'shortcut_draft'), field('Cancelar', 'shortcut_cancel'), field('Cantidad de productos recientes', 'shortcut_recent_product_quantity'), field('Balanza', 'shortcut_weighing_scale'), field('Editar descuento', 'shortcut_edit_discount'), field('Editar impuesto de orden', 'shortcut_edit_order_tax'), field('Agregar fila de pago', 'shortcut_add_payment_row'), field('Finalizar pago', 'shortcut_finalize_payment'), field('Agregar producto nuevo', 'shortcut_add_new_product')]), group('Comportamiento del POS', [check('Desactivar finalizar compra', 'disable_pay_checkout'), check('Desactivar borradores', 'disable_draft'), check('Permitir nombre para cliente ocasional', 'enable_walk_in_name'), check('Usar nueva interfaz del POS', 'enable_new_pos_ui'), check('Habilitar caja central para vendedores', 'central_checkout'), check('Desactivar pago rápido', 'disable_express_checkout'), check('Ocultar sugerencias de productos', 'hide_product_suggestion'), check('Ocultar transacciones recientes', 'hide_recent_trans'), check('Deshabilitar descuentos', 'disable_discount'), check('Deshabilitar impuestos de orden', 'disable_order_tax'), check('Permitir editar subtotal', 'is_pos_subtotal_editable'), check('Desactivar ventas en espera', 'disable_suspend'), check('Habilitar fecha de transacción', 'enable_transaction_date'), check('Mostrar personal de servicio en cada línea', 'inline_service_staff'), check('Exigir personal de servicio', 'is_service_staff_required'), check('Deshabilitar venta a crédito', 'disable_credit_sale_button'), check('Habilitar balanza', 'enable_weighing_scale'), check('Mostrar esquema de factura', 'show_invoice_scheme'), check('Mostrar diseño de factura', 'show_invoice_layout'), check('Imprimir al suspender venta', 'print_on_suspend'), check('Mostrar precios en sugerencias', 'show_pricing_on_product_suggestion')]), group('Balanza', [field('Prefijo de etiqueta', 'scale_label_prefix'), select('Longitud SKU del producto', 'scale_product_sku_length', ['1','2','3','4','5','6','7','8','9']), select('Longitud entera de cantidad', 'scale_qty_length', ['1','2','3','4','5']), select('Decimales de cantidad', 'scale_qty_length_decimal', ['1','2','3','4']), select('Tipo de conexión', 'scale_connection_type', ['Ninguna','USB/Serial (Web Serial API)','Red (WebSocket)']), select('Velocidad de conexión serial', 'scale_baud_rate', ['9600','19200','38400','57600','115200']), field('Comando para leer peso', 'scale_weight_command'), field('Host de balanza de red', 'scale_network_host'), field('Puerto de balanza', 'scale_network_port', 'number', [], { min: 1, max: 65535 })])]},
  { id: 'compras', label: 'Compras', icon: Truck, description: 'Edición de precios, lotes, órdenes y validaciones fiscales.', groups: [group('Preferencias de compra', [check('Permitir editar el producto desde compras', 'enable_editing_product_from_purchase'), check('Permitir editar precios desde ajuste de stock', 'enable_editing_price_from_stock_adjustment'), check('Habilitar estado de compra', 'enable_purchase_status'), check('Habilitar lotes', 'enable_lot_number'), check('Habilitar órdenes de compra', 'enable_purchase_order'), check('Exigir datos fiscales completos (RG-90)', 'rg90_modo_estricto'), field('Exigir desde la fecha', 'rg90_estricto_desde', 'date')])]},
  { id: 'pago', label: 'Pago', icon: CircleDollarSign, description: 'Denominaciones y validación del efectivo recibido.', groups: [group('Denominaciones de efectivo', [field('Denominaciones (separadas por coma)', 'cash_denominations', 'textarea'), select('Mostrar denominaciones en', 'enable_cash_denomination_on', ['Pantalla POS','Todas las pantallas']), field('Métodos de pago para denominaciones', 'cash_denomination_methods', 'multiselect', ['Efectivo','Tarjeta','Cheque','Transferencia bancaria','Otro','Pago personalizado 1','Pago personalizado 2','Pago personalizado 3','Pago personalizado 4','Pago personalizado 5','Pago personalizado 6','Pago personalizado 7']), check('Exigir coincidencia exacta de denominaciones', 'cash_denomination_strict_check')])]},
  { id: 'tablero', label: 'Tablero', icon: Monitor, description: 'Avisos visibles en el tablero principal.', groups: [group('Alertas', [field('Avisar vencimiento de stock con anticipación (días)', 'stock_expiry_alert_days', 'number', [], { min: 0 })])]},
  { id: 'sistema', label: 'Sistema', icon: Settings, description: 'Apariencia y opciones generales de navegación.', groups: [group('Preferencias de interfaz', [select('Color del tema', 'theme_color', ['Blue','Black','Purple','Green','Red','Yellow','Blue Light','Black Light','Purple Light','Green Light','Red Light']), select('Filas predeterminadas por tabla', 'default_datatable_page_entries', ['25','50','100','200','500','1000','Todos']), check('Mostrar texto de ayuda', 'enable_tooltip'), check('Habilitar exportación de datos', 'is_enabled_export')])]},
  { id: 'prefijos', label: 'Prefijos', icon: FileText, description: 'Prefijos usados al generar números de referencia.', groups: [group('Numeración de documentos', ['purchase','purchase_return','purchase_order','stock_transfer','stock_adjustment','sell_return','expense','contacts','purchase_payment','sell_payment','expense_payment','business_location','username','subscription','draft','sales_order'].map((key,index)=>field(['Compra','Devolución de compra','Orden de compra','Transferencia de stock','Ajuste de stock','Devolución de venta','Gastos','Cliente/Proveedor','Pago de compra','Pago de venta','Pago de gastos','Ubicación comercial','Nombre de usuario','Suscripción','Borrador','Orden de venta'][index], `prefix_${key}`))) ]},
  { id: 'email', label: 'Ajustes del correo electrónico', icon: Mail, description: 'Configuración SMTP para los correos del negocio.', groups: [group('Servidor SMTP', [select('Controlador de correo', 'mail_driver', ['SMTP']), field('Anfitrión SMTP', 'mail_host'), field('Puerto SMTP', 'mail_port', 'number'), field('Nombre de usuario SMTP', 'mail_username'), field('Contraseña SMTP', 'mail_password', 'password'), select('Encriptación', 'mail_encryption', ['TLS','SSL','Ninguna']), field('Dirección remitente', 'mail_from_address', 'email'), field('Nombre remitente', 'mail_from_name')])]},
  { id: 'sms', label: 'Configuración de SMS', icon: Smartphone, description: 'Proveedor, endpoint, cabeceras y parámetros para enviar SMS.', groups: [group('Proveedor', [select('Servicio SMS', 'sms_service', ['Nexmo','Twilio','Otro']), field('Clave Nexmo', 'nexmo_key'), field('Secreto Nexmo', 'nexmo_secret', 'password'), field('Remitente Nexmo', 'nexmo_from'), field('Twilio Account SID', 'twilio_sid'), field('Twilio Access Token', 'twilio_token', 'password'), field('Remitente Twilio', 'twilio_from')]), group('Solicitud SMS personalizada', [field('URL del servicio', 'sms_url', 'url'), field('Nombre del parámetro de destino', 'sms_send_to_param_name'), field('Nombre del parámetro del mensaje', 'sms_msg_param_name'), select('Método de solicitud', 'sms_request_method', ['GET','POST']), ...Array.from({length:3},(_,i)=>[field(`Cabecera ${i+1}: nombre`, `sms_header_${i+1}`),field(`Cabecera ${i+1}: valor`, `sms_header_val_${i+1}`)]).flat(), ...Array.from({length:10},(_,i)=>[field(`Parámetro ${i+1}: nombre`, `sms_param_${i+1}`),field(`Parámetro ${i+1}: valor`, `sms_param_val_${i+1}`)]).flat(), field('Número para prueba', 'sms_test_number', 'tel')])]},
  { id: 'recompensa', label: 'Configuración del punto de recompensa', icon: Gift, description: 'Reglas para acumular y canjear puntos de recompensa.', groups: [group('Reglas de puntos', [check('Habilitar puntos de recompensa', 'enable_rp'), field('Nombre visible del punto', 'rp_name'), field('Importe gastado por punto', 'amount_for_unit_rp', 'number', [], { min: 0 }), field('Compra mínima para acumular puntos', 'min_order_total_for_rp', 'number', [], { min: 0 }), field('Máximo de puntos por pedido', 'max_rp_per_order', 'number', [], { min: 0 }), field('Importe de canje por punto', 'redeem_amount_per_unit_rp', 'number', [], { min: 0 }), field('Compra mínima para canjear', 'min_order_total_for_redeem', 'number', [], { min: 0 }), field('Mínimo de puntos para canje', 'min_redeem_point', 'number', [], { min: 0 }), field('Máximo de puntos por canje', 'max_redeem_point', 'number', [], { min: 0 }), field('Vencimiento después de', 'rp_expiry_period', 'number', [], { min: 0 }), select('Unidad de vencimiento', 'rp_expiry_type', ['Mes','Año'])])]},
  { id: 'modulos', label: 'Módulos', icon: Puzzle, description: 'Activación de módulos del sistema para la empresa.', groups: [group('Módulos disponibles', ['Compras','Nueva venta','Punto de venta','Transferencias de stock','Ajuste de stock','Gastos','Cuenta','Mesas','Modificadores','Personal de servicio','Reservas','Cocina','Restaurante Full','Suscripciones','Tipos de servicio'].map((label,index)=>check(label, `module_${index+1}`))) ]},
  { id: 'etiquetas', label: 'Etiquetas personalizadas', icon: Tags, description: 'Nombres de campos adicionales para registros y operaciones.', groups: [
    group('Pagos personalizados', Array.from({length:7},(_,i)=>field(`Pago personalizado ${i+1}`,`label_payment_${i+1}`))),
    group('Campos de contacto', Array.from({length:10},(_,i)=>field(`Campo de contacto ${i+1}`,`label_contact_${i+1}`))),
    group('Campos de producto', Array.from({length:4},(_,i)=>field(`Campo de producto ${i+1}`,`label_product_${i+1}`))),
    group('Campos de ubicación', Array.from({length:4},(_,i)=>field(`Campo de ubicación ${i+1}`,`label_location_${i+1}`))),
    group('Campos de usuario', Array.from({length:4},(_,i)=>field(`Campo de usuario ${i+1}`,`label_user_${i+1}`))),
    group('Campos de compra', Array.from({length:4},(_,i)=>[field(`Campo de compra ${i+1}`,`label_purchase_${i+1}`),check('Es requerido',`required_purchase_${i+1}`)]).flat()),
    group('Campos de envío de compra', Array.from({length:5},(_,i)=>[field(`Campo de envío de compra ${i+1}`,`label_purchase_shipping_${i+1}`),check('Es requerido',`required_purchase_shipping_${i+1}`)]).flat()),
    group('Campos de venta', Array.from({length:4},(_,i)=>[field(`Campo de venta ${i+1}`,`label_sell_${i+1}`),check('Es requerido',`required_sell_${i+1}`)]).flat()),
    group('Campos de envío de venta', Array.from({length:5},(_,i)=>[field(`Campo de envío ${i+1}`,`label_shipping_${i+1}`),check('Es requerido',`required_shipping_${i+1}`),check('Usar contacto como valor predeterminado',`shipping_contact_default_${i+1}`)]).flat()),
    group('Campos de tipo de servicio', Array.from({length:6},(_,i)=>field(`Campo de servicio ${i+1}`,`label_types_of_service_${i+1}`))),
  ]},
  { id: 'facturacion', label: 'Facturación Electrónica', icon: FileText, description: 'Configuración SIFEN ya disponible en el módulo de factura electrónica.', groups: [] },
];

const ALL_FIELDS = SECTION_DEFS.flatMap(section => section.groups.flatMap(g => g.fields));
const getDefaults = () => {
  const initial = {};
  for (const f of ALL_FIELDS) {
    if (f.type === 'checkbox') initial[f.key] = f.key === 'enable_inline_tax';
    else if (f.type === 'multiselect') initial[f.key] = [];
    else if (f.key === 'currency') initial[f.key] = 'PYG';
    else if (f.key === 'currency_symbol_placement') initial[f.key] = 'Después de la cantidad';
    else if (f.key === 'time_zone') initial[f.key] = 'America/Asuncion';
    else if (f.key === 'fy_start_month') initial[f.key] = 'Enero';
    else if (f.key === 'accounting_method') initial[f.key] = 'FIFO (Primero en entrar, primero en salir)';
    else if (f.key === 'transaction_edit_days') initial[f.key] = 350;
    else if (f.key === 'date_format') initial[f.key] = 'dd/mm/yyyy';
    else if (f.key === 'time_format') initial[f.key] = '12 horas';
    else if (f.key === 'currency_precision' || f.key === 'quantity_precision') initial[f.key] = '0';
    else if (f.key === 'default_profit_percent') initial[f.key] = 25;
    else if (f.type === 'number') initial[f.key] = '';
    else initial[f.key] = '';
  }
  return initial;
};

const parseImage = (file) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result || ''));
  reader.onerror = reject;
  reader.readAsDataURL(file);
});

export default function ConfiguracionEmpresa({ perfilUsuario }) {
  const empresaId = perfilUsuario?.empresa_id;
  const [empresa, setEmpresa] = useState({ nombre: '', ruc: '', direccion: '', telefono: '', logo_url: '' });
  const [valores, setValores] = useState(() => getDefaults());
  const [seccionActiva, setSeccionActiva] = useState('empresa');
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [errorCarga, setErrorCarga] = useState('');
  const [avisoLocal, setAvisoLocal] = useState(false);
  const [logoError, setLogoError] = useState(false);
  const [mensaje, setMensaje] = useState('');

  useEffect(() => {
    let activo = true;
    const cargar = async () => {
      setCargando(true);
      setErrorCarga('');
      if (!empresaId) {
        if (activo) { setErrorCarga('No se encontró una empresa asociada a este usuario.'); setCargando(false); }
        return;
      }
      const { data, error } = await supabase.from('empresas').select('nombre,ruc,direccion,telefono,logo_url,configuracion').eq('id', empresaId).maybeSingle();
      if (!activo) return;
      if (error) {
        const { data: base, error: baseError } = await supabase.from('empresas').select('nombre,ruc,direccion,telefono,logo_url').eq('id', empresaId).maybeSingle();
        if (!activo) return;
        if (baseError || !base) setErrorCarga(`No se pudieron cargar los datos de la empresa: ${(baseError || error).message}`);
        else {
          setEmpresa({ nombre: base.nombre || '', ruc: base.ruc || '', direccion: base.direccion || '', telefono: base.telefono || '', logo_url: base.logo_url || '' });
          try {
            const saved = JSON.parse(localStorage.getItem(`pypos-config-empresa-${empresaId}`) || '{}');
            setValores({ ...getDefaults(), ...(saved.ajustes || {}) });
          } catch { setValores(getDefaults()); }
          setAvisoLocal(true);
        }
      } else if (data) {
        setEmpresa({ nombre: data.nombre || '', ruc: data.ruc || '', direccion: data.direccion || '', telefono: data.telefono || '', logo_url: data.logo_url || '' });
        const saved = data.configuracion && typeof data.configuracion === 'object' ? data.configuracion : {};
        setValores({ ...getDefaults(), ...(saved.ajustes || {}) });
        setAvisoLocal(false);
      } else setErrorCarga('No se encontraron los datos de la empresa.');
      setCargando(false);
    };
    cargar();
    return () => { activo = false; };
  }, [empresaId]);

  const actualizarValor = (key, value) => setValores(current => ({ ...current, [key]: value }));
  const actualizarEmpresa = (key, value) => setEmpresa(current => ({ ...current, [key]: value }));

  const guardar = async (event) => {
    event?.preventDefault();
    if (!empresaId || !empresa.nombre.trim()) return;
    setGuardando(true);
    setMensaje('');
    const datosEmpresa = { nombre: empresa.nombre.trim(), ruc: empresa.ruc.trim() || null, direccion: empresa.direccion.trim() || null, telefono: empresa.telefono.trim() || null, logo_url: empresa.logo_url || null };
    const { error: errorCompleto } = await supabase.from('empresas').update({ ...datosEmpresa, configuracion: { version: 1, ajustes: valores } }).eq('id', empresaId);
    if (errorCompleto) {
      const { error: errorBase } = await supabase.from('empresas').update(datosEmpresa).eq('id', empresaId);
      if (errorBase) {
        setGuardando(false);
        sonidoError();
        setMensaje(`No se pudieron guardar los datos de la empresa: ${errorBase.message}`);
        return;
      }
      setGuardando(false);
      try { localStorage.setItem(`pypos-config-empresa-${empresaId}`, JSON.stringify({ version: 1, ajustes: valores })); } catch { /* el servidor conserva los datos principales */ }
      setAvisoLocal(true);
      setMensaje('Se guardaron los datos principales. Para guardar todas las pestañas en Supabase, aplicá database/migration_configuracion_empresa.sql; por ahora los ajustes se guardaron en este navegador.');
    } else {
      setAvisoLocal(false);
      try { localStorage.removeItem(`pypos-config-empresa-${empresaId}`); } catch { /* sin acción */ }
      setMensaje('Configuración de empresa guardada.');
    }
    setGuardando(false);
    sonidoExito();
  };

  const activeSection = useMemo(() => SECTION_DEFS.find(section => section.id === seccionActiva) || SECTION_DEFS[0], [seccionActiva]);

  const renderField = (f) => {
    const common = { id: `empresa-${f.key}`, className: BASE_INPUT, disabled: guardando };
    const value = valores[f.key] ?? (f.type === 'multiselect' ? [] : '');
    if (f.type === 'company') return <input {...common} value={empresa.nombre} onChange={e => actualizarEmpresa('nombre', e.target.value)} maxLength={120} required />;
    if (f.type === 'company-ruc') return <input {...common} value={empresa.ruc} onChange={e => actualizarEmpresa('ruc', e.target.value)} maxLength={30} placeholder="Número de RUC" />;
    if (f.type === 'company-address') return <input {...common} value={empresa.direccion} onChange={e => actualizarEmpresa('direccion', e.target.value)} maxLength={200} placeholder="Dirección comercial" />;
    if (f.type === 'company-phone') return <input {...common} type="tel" value={empresa.telefono} onChange={e => actualizarEmpresa('telefono', e.target.value)} maxLength={40} placeholder="+595 ..." />;
    if (f.type === 'logo') return (
      <div className="space-y-3">
        <input id="empresa-logo-file" type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" className="block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-orange-50 file:px-3 file:py-2 file:font-semibold file:text-orange-700 hover:file:bg-orange-100" disabled={guardando} onChange={async (e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          if (!file.type.startsWith('image/')) { setMensaje('El logotipo debe ser una imagen.'); e.target.value = ''; return; }
          if (file.size > 1_500_000) { setMensaje('La imagen debe pesar menos de 1,5 MB.'); e.target.value = ''; return; }
          try { actualizarEmpresa('logo_url', await parseImage(file)); setLogoError(false); setMensaje(''); } catch { setMensaje('No se pudo leer la imagen elegida.'); }
        }} />
        <div className="flex items-center gap-3">
          <input {...common} type="url" value={empresa.logo_url.startsWith('data:') ? '' : empresa.logo_url} onChange={e => { actualizarEmpresa('logo_url', e.target.value); setLogoError(false); }} placeholder="O pegá una URL pública https://..." />
          <div className="flex h-12 w-20 shrink-0 items-center justify-center overflow-hidden rounded-md border border-slate-200 bg-white p-1">{empresa.logo_url && !logoError ? <img src={empresa.logo_url} alt="Vista previa del logotipo" className="max-h-full max-w-full object-contain" onError={() => setLogoError(true)} /> : <Image size={18} className="text-slate-300" />}</div>
        </div>
        <p className="text-xs text-slate-500">Almacenamos la imagen en la configuración de esta empresa. Máximo 1,5 MB.</p>
      </div>
    );
    if (f.type === 'checkbox') return <label htmlFor={common.id} className="flex min-h-10 cursor-pointer items-center gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2.5 hover:border-orange-200"><input {...common} type="checkbox" checked={Boolean(value)} onChange={e => actualizarValor(f.key, e.target.checked)} className="h-4 w-4 accent-orange-500" /><span className="text-sm text-slate-700">{f.label}</span></label>;
    if (f.type === 'multiselect') return <div className="flex flex-wrap gap-2">{f.options.map(option => { const optionValue = typeof option === 'string' ? option : option.value; const optionLabel = typeof option === 'string' ? option : option.label; const selected = value.includes(optionValue); return <label key={optionValue} className={`cursor-pointer rounded-full border px-3 py-1.5 text-xs font-semibold ${selected ? 'border-orange-300 bg-orange-50 text-orange-700' : 'border-slate-200 bg-white text-slate-600'}`}><input type="checkbox" className="sr-only" checked={selected} onChange={e => actualizarValor(f.key, e.target.checked ? [...value, optionValue] : value.filter(item => item !== optionValue))} />{optionLabel}</label>; })}</div>;
    if (f.type === 'select') return <select {...common} value={value} onChange={e => actualizarValor(f.key, e.target.value)}><option value="">Seleccionar...</option>{f.options.map(option => <option key={typeof option === 'string' ? option : option.value} value={typeof option === 'string' ? option : option.value}>{typeof option === 'string' ? option : option.label}</option>)}</select>;
    if (f.type === 'textarea') return <textarea {...common} rows={3} value={value} onChange={e => actualizarValor(f.key, e.target.value)} placeholder={f.placeholder || ''} />;
    const type = ['number','date','email','tel','url','password'].includes(f.type) ? f.type : 'text';
    return <div className="relative"><input {...common} type={type} value={value} onChange={e => actualizarValor(f.key, type === 'number' ? e.target.value === '' ? '' : Number(e.target.value) : e.target.value)} min={f.min} max={f.max} placeholder={f.placeholder || ''} autoComplete={type === 'password' ? 'new-password' : undefined} />{f.suffix && <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400">{f.suffix}</span>}</div>;
  };

  if (cargando) return <div className="flex items-center justify-center gap-2 p-10 text-sm text-slate-500"><LoaderCircle size={17} className="animate-spin" /> Cargando ajustes de la empresa...</div>;

  return (
    <div className="mx-auto w-full max-w-7xl space-y-5 pb-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div><p className="mb-1 text-xs font-bold uppercase tracking-[0.16em] text-orange-600">Configuraciones</p><h2 className="text-2xl font-bold tracking-tight text-slate-900">Configuración de la empresa</h2><p className="mt-1 text-sm text-slate-500">Ajustes generales organizados por sección para {empresa.nombre || 'tu negocio'}.</p></div>
        <div className="inline-flex items-center gap-2 rounded-full border border-emerald-100 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700"><ShieldCheck size={15} /> Configuración por empresa</div>
      </header>

      {errorCarga ? <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{errorCarga}</div> : (
        <div className="grid gap-5 lg:grid-cols-[250px_minmax(0,1fr)]">
          <nav aria-label="Secciones de configuración" className="flex gap-1 overflow-x-auto rounded-xl border border-slate-200 bg-white p-2 shadow-sm lg:block lg:space-y-1 lg:overflow-visible lg:self-start">
            {SECTION_DEFS.map(section => { const Icon = section.icon; return <button key={section.id} type="button" onClick={() => { setSeccionActiva(section.id); setMensaje(''); }} aria-current={seccionActiva === section.id ? 'page' : undefined} className={`flex shrink-0 items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-semibold transition lg:w-full ${seccionActiva === section.id ? 'bg-orange-50 text-orange-700' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'}`}><Icon size={17} /><span className="whitespace-nowrap lg:whitespace-normal">{section.label}</span>{seccionActiva === section.id && <Check size={15} className="ml-auto hidden lg:block" />}</button>; })}
          </nav>

          <form onSubmit={guardar} className="min-w-0 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 px-5 py-4 sm:px-7"><h3 className="text-base font-bold text-slate-800">{activeSection.label}</h3><p className="mt-1 text-sm text-slate-500">{activeSection.description}</p></div>
            {activeSection.id === 'facturacion' ? <div className="m-5 rounded-xl border border-amber-200 bg-amber-50 p-5"><h4 className="font-bold text-amber-900">Facturación electrónica</h4><p className="mt-1 text-sm text-amber-800">La referencia indica que esta opción depende del plan. PyPOS tiene un módulo específico para la configuración SIFEN.</p><Link to="/config_factura" className="mt-4 inline-flex items-center gap-2 rounded-lg bg-orange-500 px-4 py-2 text-sm font-bold text-white hover:bg-orange-600">Abrir configuración de factura electrónica <ChevronDown size={15} className="-rotate-90" /></Link></div> : (
              <div className="space-y-6 px-5 py-6 sm:px-7">{activeSection.groups.map((g,index) => <section key={`${activeSection.id}-${index}`} className="space-y-4"><div className="border-b border-slate-100 pb-2"><h4 className="text-sm font-bold text-slate-800">{g.title}</h4></div><div className="grid gap-x-5 gap-y-4 sm:grid-cols-2">{g.fields.map(f => f.type === 'checkbox' ? <div key={f.key} className="sm:col-span-2">{renderField(f)}</div> : <div key={f.key} className={`block ${f.type === 'logo' || f.type === 'multiselect' ? 'sm:col-span-2' : ''}`}><label htmlFor={`empresa-${f.key}`} className="mb-1.5 block text-sm font-semibold text-slate-700">{f.label}{f.key === 'nombre' && <span className="text-red-500"> *</span>}</label>{renderField(f)}</div>)}</div></section>)}</div>
            )}
            {activeSection.id !== 'facturacion' && <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 bg-slate-50/70 px-5 py-4 sm:px-7"><p className="text-xs text-slate-500">Los cambios aplican solo a {empresa.nombre || 'esta empresa'}.</p><button type="submit" disabled={guardando || !empresa.nombre.trim()} className="inline-flex items-center gap-2 rounded-lg bg-orange-500 px-4 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-60">{guardando ? <LoaderCircle size={16} className="animate-spin" /> : <Save size={16} />}{guardando ? 'Guardando...' : 'Guardar cambios'}</button></div>}
          </form>
        </div>
      )}
      {mensaje && <div role="status" className={`rounded-xl border p-3 text-sm ${mensaje.startsWith('No se pudieron') ? 'border-red-200 bg-red-50 text-red-700' : avisoLocal ? 'border-amber-200 bg-amber-50 text-amber-800' : 'border-emerald-200 bg-emerald-50 text-emerald-800'}`}>{mensaje}</div>}
      {avisoLocal && !mensaje && <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">La columna de configuración aún no está creada; las pestañas se guardarán en este navegador hasta aplicar la migración de Supabase.</div>}
    </div>
  );
}
