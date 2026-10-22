import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { supabase } from './supabaseClient';
import {
  LayoutDashboard, Users, Contact, Package, Factory, Wrench, ChevronLeft,
  ArrowDownToLine, ArrowUpFromLine, BarChart3, ShoppingCart, LogOut, Settings,
  MapPin, FileText, Barcode, Printer, Percent, ClipboardList, CreditCard, ArrowRightLeft,
  Menu, X, DollarSign, BookOpen, Truck, ShoppingBag, Clock3, Building2, CircleHelp, CalendarDays, ShieldCheck, Mail, ClipboardCheck, QrCode, Bell, AlertTriangle, CalendarClock, PackageX
} from 'lucide-react';
import { LanguageSelector, useLanguage } from './LanguageContext';
import LogoPyPos from './LogoPyPos';
import GuiaInicial from './GuiaInicial';

import { useUbicacionUsuario } from './utils/useUbicacion';
import { useEmpresaInfo } from './utils/useEmpresa';
import { useConfiguracionEmpresa } from './utils/useConfiguracionEmpresa';
import { useAlertasInventario } from './utils/useAlertasInventario';

// Las vistas del ERP se descargan al abrirlas para reducir el paquete inicial.
const ConfiguracionEmpresa = lazy(() => import('./ConfiguracionEmpresa'));
const ConfiguracionFacturaElectronica = lazy(() => import('./ConfiguracionFacturaElectronica'));
const ConfiguracionModulos = lazy(() => import('./ConfiguracionModulos'));
const OT = lazy(() => import('./OT'));
const UbicacionesComerciales = lazy(() => import('./UbicacionesComerciales'));
const ListaVentas = lazy(() => import('./ListaVentas'));
const TodasLasVentas = lazy(() => import('./TodasLasVentas'));
const DescuentosVentas = lazy(() => import('./DescuentosVentas'));
const DevolucionesCompras = lazy(() => import('./DevolucionesCompras'));
const DevolucionesVentas = lazy(() => import('./DevolucionesVentas'));
const ImportarVentas = lazy(() => import('./ImportarVentas'));
const Inicio = lazy(() => import('./Inicio'));
const GraficosDashboard = lazy(() => import('./GraficosDashboard'));
const PuntoDeVenta = lazy(() => import('./PuntoDeVenta'));
const ListaProductos = lazy(() => import('./ListaProductos'));
const HistorialExistencias = lazy(() => import('./HistorialExistencias'));
const Catalogo = lazy(() => import('./Catalogo'));
const AgregarProducto = lazy(() => import('./AgregarProducto'));
const Marcas = lazy(() => import('./Marcas'));
const Categorias = lazy(() => import('./Categorias'));
const Unidades = lazy(() => import('./Unidades'));
const GestorCompras = lazy(() => import('./GestorCompras'));
const CuentasPorCobrar = lazy(() => import('./CuentasPorCobrar'));
const Clientes = lazy(() => import('./Clientes'));
const AbrirCaja = lazy(() => import('./AbrirCaja'));
const AgregarCompra = lazy(() => import('./AgregarCompra'));
const Proveedores = lazy(() => import('./Proveedores'));
const NuevoGasto = lazy(() => import('./NuevoGasto'));
const ReporteCierreCaja = lazy(() => import('./ReporteCierreCaja'));
const CajaRegistradora = lazy(() => import('./CajaRegistradora'));
const GananciasPerdidas = lazy(() => import('./GananciasPerdidas'));
const Usuarios = lazy(() => import('./Usuarios'));
const Roles = lazy(() => import('./Roles'));
const ListaCajas = lazy(() => import('./Listacajas'));
const InformeCajaPago = lazy(() => import('./InformeCajaPago'));
const VentasPorProducto = lazy(() => import('./VentasPorProductoClonado'));
const ComprasPorProducto = lazy(() => import('./ComprasPorProductoDetalle'));
const CobroDeVentas = lazy(() => import('./CobroDeVentas'));
const GruposClientes = lazy(() => import('./GruposClientes'));
const Gastos = lazy(() => import('./Gastos'));
const CategoriasGastos = lazy(() => import('./CategoriasGastos'));
const VendedoresComisiones = lazy(() => import('./VendedoresComisiones'));
const PanelDesarrollador = lazy(() => import('./PanelDesarrollador'));
const VentasPorPersonal = lazy(() => import('./VentasPorPersonal'));
const Pedidos = lazy(() => import('./Pedidos'));
const InformesOperativos = lazy(() => import('./InformesOperativos'));
const InformesMicdepos = lazy(() => import('./InformesMicdepos'));
const TransferenciasStock = lazy(() => import('./TransferenciasStock'));
const AjustesStock = lazy(() => import('./AjustesStock'));
const ImportarDatos = lazy(() => import('./ImportarDatos'));
const Fabricacion = lazy(() => import('./Fabricacion'));
const PlantillasNotificacion = lazy(() => import('./PlantillasNotificacion'));
const VariacionesProductos = lazy(() => import('./VariacionesProductos'));
const Cotizaciones = lazy(() => import('./Cotizaciones'));
const FlujoFondos = lazy(() => import('./FlujoFondos'));
const Envios = lazy(() => import('./Envios'));
const RemisionesElectronicas = lazy(() => import('./RemisionesElectronicas'));
const CatalogoQR = lazy(() => import('./CatalogoQR'));
const ImprimirEtiquetasProductos = lazy(() => import('./ModulosProductos').then((m) => ({ default: m.ImprimirEtiquetasProductos })));
const ImportarStockInicial = lazy(() => import('./ModulosProductos').then((m) => ({ default: m.ImportarStockInicial })));
const GruposPreciosVenta = lazy(() => import('./ModulosProductos').then((m) => ({ default: m.GruposPreciosVenta })));
const GarantiasProductos = lazy(() => import('./ModulosProductos').then((m) => ({ default: m.GarantiasProductos })));

export default function Dashboard({ session, perfilUsuario, initialView = 'inicio' }) {
  const { t, locale } = useLanguage();
  const empresaInfo = useEmpresaInfo();
  const { ajustes: ajustesEmpresa } = useConfiguracionEmpresa(empresaInfo.id);
  const { alertas: alertasInventario, cargando: cargandoAlertasInventario, error: errorAlertasInventario } = useAlertasInventario(empresaInfo.id, ajustesEmpresa.stock_expiry_alert_days);
  const formatoFechaEmpresa = ajustesEmpresa.date_format || 'dd/mm/yyyy';
  const fechaPartesEmpresa = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: ajustesEmpresa.time_zone || 'America/Asuncion', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date()).map((parte) => [parte.type, parte.value]));
  const fechaHeaderEmpresa = formatoFechaEmpresa.replace(/dd|mm|yyyy/g, (token) => ({ dd: fechaPartesEmpresa.day, mm: fechaPartesEmpresa.month, yyyy: fechaPartesEmpresa.year })[token]);
  // === CONTROL DE ACCESO POR ROL (va primero, vistaActiva lo necesita) ===
  const { id: ubicacionUsuarioId, ve_todas: usuarioVeTodas } = useUbicacionUsuario();
  const nombreRol = (perfilUsuario?.roles?.nombre || '').toLowerCase();
  const esAdmin = nombreRol.includes('admin');
  const esDesarrollador = perfilUsuario?.es_desarrollador === true || nombreRol.includes('desarrollador') || nombreRol.includes('developer');
  const permisosRol = perfilUsuario?.roles?.permisos || null;

  const tieneCategoria = (categoriaKey) => {
    if (esAdmin || !permisosRol) return true;
    const categoria = permisosRol[categoriaKey];
    if (!categoria) return false;
    return Object.values(categoria).some(Boolean);
  };

  const puedeVerVista = (vista) => {
    if (ajustesEmpresa.module_settings_explicit) {
      const moduloPorVista = {
        compras: 'module_1', agregar_compra: 'module_1', devoluciones_compra: 'module_1',
        todas_ventas: 'module_2', devoluciones_ventas: 'module_2', pedidos: 'module_2', cotizaciones: 'module_2', cobros: 'module_2', descuentos_ventas: 'module_2', importar_ventas: 'module_2',
        pos: 'module_3', transferencias_stock: 'module_4', ajustes_stock: 'module_5',
        gastos: 'module_6', agregar_gasto: 'module_6', categorias_gastos: 'module_6',
        cajas: 'module_7', caja_registradora: 'module_7', informe_caja_pago: 'module_7', flujo_fondos: 'module_7',
      };
      const modulo = moduloPorVista[vista];
      if (modulo && ajustesEmpresa[modulo] === false) return false;
    }
    if (esAdmin || !permisosRol) return true;
    const categoriaPorVista = {
      ot: 'ot', config_empresa: 'configuraciones', config_factura: 'configuraciones', config_modulos: 'configuraciones', admin_desarrollador: 'configuraciones',
      ubicaciones_comerciales: 'ubicaciones', clientes: 'clientes_proveedores',
      proveedores: 'clientes_proveedores', grupos_clientes: 'clientes_proveedores',
      catalogo: 'productos', stock_history: 'productos', agregar_producto: 'productos', marcas: 'productos',
      catalogo_qr: 'productos',
      categorias: 'productos', unidades: 'productos', compras: 'compras',
      agregar_compra: 'compras', devoluciones_compra: 'compras', gastos: 'gastos',
      agregar_gasto: 'gastos', categorias_gastos: 'gastos', todas_ventas: 'ventas_pos', devoluciones_ventas: 'ventas_pos',
      pos: 'ventas_pos', cobros: 'ventas_pos', cajas: 'caja', informe_caja_pago: 'caja',
      caja_registradora: 'informes', ganancias_perdidas: 'informes',
      ventas_por_producto: 'informes', compras_por_producto: 'informes', cobro_de_ventas: 'informes', vendedores_comisiones: 'informes', ventas_por_personal: 'informes', usuarios: 'usuarios', roles: 'roles',
      pedidos: 'ventas_pos',
      descuentos_ventas: 'ventas_pos',
      cotizaciones: 'ventas_pos',
      importar_ventas: 'ventas_pos',
      envios: 'ventas_pos',
      remisiones_electronicas: 'ventas_pos',
      flujo_fondos: 'informes',
      informes_operativos: 'informes',
      informes_micdepos: 'informes',
      plantillas_notificacion: 'configuraciones',
      variaciones_productos: 'productos',
      transferencias_stock: 'productos',
      ajustes_stock: 'productos',
      importar_productos: 'productos',
      imprimir_etiquetas: 'productos', importar_stock_inicial: 'productos', grupos_precios_venta: 'productos', garantias_productos: 'productos',
      importar_contactos: 'clientes_proveedores',
      fabricacion: 'productos',
    };
    if (vista === 'importar_productos' && !esAdmin && permisosRol) return permisosRol.productos?.['Agregar producto'] === true;
    if (vista === 'importar_contactos' && !esAdmin && permisosRol) {
      return permisosRol.clientes_proveedores?.['Agregar cliente'] === true
        || permisosRol.clientes_proveedores?.['Agregar proveedor'] === true;
    }
    const categoria = categoriaPorVista[vista];
    if (vista === 'transferencias_stock' && !esAdmin && permisosRol?.productos) {
      return permisosRol.productos['Transferir stock'] === true;
    }
    if (vista === 'ajustes_stock' && !esAdmin && permisosRol?.productos) {
      return permisosRol.productos['Ajustar stock'] === true;
    }
    if (vista === 'importar_stock_inicial' && !esAdmin && permisosRol?.productos) {
      return permisosRol.productos['Ajustar stock'] === true;
    }
    if (vista === 'fabricacion' && !esAdmin && permisosRol?.productos) {
      return permisosRol.productos['Ajustar stock'] === true;
    }
    return !categoria || tieneCategoria(categoria);
  };

  // Rol "cajero exclusivo": solo puede ver Abrir Caja y el Punto de Venta
  const soloPOS = !esAdmin && !!permisosRol?.ventas_pos?.['Solo Punto de Venta (bloquea todo lo demás)'];

  // Estados de navegación y control de caja
  const location = useLocation();
  const navigate = useNavigate();
  const [vistaActiva, setVistaActiva] = useState(soloPOS ? 'pos' : initialView);
  const [menuExpandido, setMenuExpandido] = useState('ventas');
  const [menuRenderizado, setMenuRenderizado] = useState('ventas');
  const submenuTimerRef = useRef(null);
  const [cajaActual, setCajaActual] = useState(null);
  const [cargandoCaja, setCargandoCaja] = useState(true);
  const [reporteCierre, setReporteCierre] = useState(null);
  const [refreshInicio, setRefreshInicio] = useState(0);
  const [refreshKey, setRefreshKey] = useState(0);
  const [cargandoNavegacion, setCargandoNavegacion] = useState(false);
  const timeoutNavegacionRef = useRef(null);
  const [guiaVisible, setGuiaVisible] = useState(false);

  // Navega a cualquier vista y fuerza que se recargue de cero, incluso si ya estabas ahí
  const irA = (vista, pathname) => {
    window.clearTimeout(timeoutNavegacionRef.current);
    setCargandoNavegacion(true);
    timeoutNavegacionRef.current = window.setTimeout(() => {
      setCargandoNavegacion(false);
      timeoutNavegacionRef.current = null;
    }, 700);
    setVistaActiva(vista);
    setRefreshKey((k) => k + 1);
    setMenuMovilAbierto(false); // Cierra el menú móvil al navegar
    if (pathname) navigate(pathname, { replace: true });
  };
  useEffect(() => () => window.clearTimeout(timeoutNavegacionRef.current), []);
  const [sidebarColapsado, setSidebarColapsado] = useState(false);
  const [menuMovilAbierto, setMenuMovilAbierto] = useState(false);
  const [configuracionesMovilAbiertas, setConfiguracionesMovilAbiertas] = useState(false);
  const [menuCuentaAbierto, setMenuCuentaAbierto] = useState(false);
  const [menuAccionesAbierto, setMenuAccionesAbierto] = useState(false);
  const [menuAlertasAbierto, setMenuAlertasAbierto] = useState(false);
  const [accionInicio, setAccionInicio] = useState(null);
  const [fechaHora, setFechaHora] = useState(new Date());

  const tituloModulo = ({
    inicio: t('home'),
    pos: t('pos'),
    reporte_cierre: 'Cierre',
    nuevo_gasto: 'Gasto',
    compras: t('purchases'),
    agregar_compra: t('addPurchase'),
    gastos: t('expenses'),
    agregar_gasto: t('addExpense'),
    categorias_gastos: t('expenseCategories'),
    devoluciones_compra: t('purchaseReturns'),
    cobros: t('pendingOrders'),
    catalogo: t('products'),
    catalogo_qr: 'Catálogo QR',
    stock_history: 'Historial de existencias',
    transferencias_stock: 'Transferencias de stock',
    ajustes_stock: 'Control de stock',
    agregar_producto: t('addProduct'),
    importar_productos: 'Importar productos',
    importar_contactos: 'Importar contactos',
    imprimir_etiquetas: 'Imprimir etiquetas',
    importar_stock_inicial: 'Importar stock inicial',
    grupos_precios_venta: 'Grupo de precios de venta',
    garantias_productos: 'Garantías',
    marcas: t('brands'),
    categorias: t('categories'),
    unidades: t('units'),
    clientes: t('customers'),
    proveedores: t('suppliers'),
    grupos_clientes: t('customerGroups'),
    caja_registradora: t('cashRegister'),
    ganancias_perdidas: t('profitLoss'),
    usuarios: t('users'),
    roles: t('roles'),
    config_empresa: t('companySettings'),
    config_factura: t('invoiceSettings'),
    config_modulos: t('settings'),
    admin_desarrollador: 'Panel de desarrollador',
    ubicaciones_comerciales: t('commercialLocations'),
    todas_ventas: t('allSales'),
    descuentos_ventas: 'Descuentos',
    devoluciones_ventas: 'Devoluciones de venta',
    importar_ventas: 'Importar ventas',
    cajas: t('cashBank'),
    informe_caja_pago: t('paymentReport'),
    ventas_por_producto: t('salesByProduct'),
    compras_por_producto: t('purchasesByProduct'),
    cobro_de_ventas: t('salesCollections'),
    vendedores_comisiones: t('sellersCommissions'),
    ventas_por_personal: 'Ventas por personal',
    pedidos: 'Pedidos',
    informes_operativos: 'Informes operativos',
    informes_micdepos: t('reports'),
    fabricacion: 'Fabricación',
    variaciones_productos: 'Variaciones de productos',
    cotizaciones: 'Presupuestos y cotizaciones',
    envios: 'Envíos',
    remisiones_electronicas: 'Remisiones electrónicas',
    flujo_fondos: 'Flujo de fondos',
    plantillas_notificacion: 'Plantillas de notificación',
    ot: t('workOrders'),
  })[vistaActiva] || 'GDA POS';
  const nombreEmpresa = perfilUsuario?.empresas?.nombre || empresaInfo.nombre;

  useEffect(() => {
    const ruta = location.pathname.toLowerCase();
    const titulosRuta = {
      '/invoice-schemes': 'Esquemas de facturación',
      '/barcodes': 'Configuración de códigos de barras',
      '/printers': 'Impresoras de tickets',
      '/scales': 'Configuración de balanzas',
      '/tax-rates': 'Tasas de impuestos',
      '/types-of-service': 'Tipos de servicio',
      '/subscription': 'Suscripción',
      '/informes/stock': 'Informe de stock',
      '/informes/deudas': 'Informe de deudas',
      '/informes/gastos': 'Informe de gastos',
      '/informes/iva': 'Informe de IVA',
      '/informes/vencimientos': 'Informe de vencimientos',
      '/informes/ajustes': 'Informe de ajustes',
    };
    const titulo = titulosRuta[ruta] || tituloModulo;
    document.title = nombreEmpresa ? `${titulo} - ${nombreEmpresa}` : `${titulo} - GDA POS`;
  }, [location.pathname, nombreEmpresa, tituloModulo]);

  useEffect(() => {
    const intervalo = setInterval(() => setFechaHora(new Date()), 30000);
    return () => clearInterval(intervalo);
  }, []);

  const cerrarSesion = async () => {
    await supabase.auth.signOut();
  };

  const abrirAccionInicio = (accion) => {
    setAccionInicio({ tipo: accion, id: Date.now() });
    irA('inicio', '/');
  };

  const posPantallaCompleta = vistaActiva === 'pos' && !!cajaActual;

  useEffect(() => {
    let activo = true;
    const recuperarCajaAbierta = async () => {
      const empresaId = perfilUsuario?.empresas?.id || perfilUsuario?.empresa_id;
      if (!empresaId) {
        if (activo) setCargandoCaja(false);
        return;
      }

      const nombreUsuario = [perfilUsuario?.nombre, perfilUsuario?.apellido].filter(Boolean).join(' ').trim()
        || perfilUsuario?.nombre_usuario || perfilUsuario?.email || '';
      const usuarioId = perfilUsuario?.auth_user_id || null;
      let consulta = supabase
        .from('caja_registros')
        .select('*')
        .eq('empresa_id', empresaId)
        .eq('estado', 'Abierta')
        .order('fecha_apertura', { ascending: false })
        .limit(10);

      if (!usuarioVeTodas && ubicacionUsuarioId) {
        consulta = consulta.eq('ubicacion_id', ubicacionUsuarioId);
      }

      const { data, error } = await consulta;
      if (!activo) return;
      if (error && error.code !== '42P01') {
        console.error('Error al recuperar la caja abierta:', error.message);
      } else {
        const cajaDelUsuario = (data || []).find((caja) => {
          const mismaUbicacion = String(caja.ubicacion_id) === String(ubicacionUsuarioId)
            || (usuarioVeTodas && !!caja.ubicacion_id);
          const mismoUsuario = usuarioId
            ? caja.usuario_id === usuarioId
              || (!caja.usuario_id && (caja.usuario === nombreUsuario || caja.usuario === perfilUsuario?.nombre_usuario))
            : caja.usuario === nombreUsuario || caja.usuario === perfilUsuario?.nombre_usuario;
          return mismaUbicacion && mismoUsuario;
        });
        setCajaActual(cajaDelUsuario || null);
      }
      setCargandoCaja(false);
    };

    recuperarCajaAbierta();
    return () => { activo = false; };
  }, [perfilUsuario, ubicacionUsuarioId, usuarioVeTodas]);

  // Para el cajero exclusivo, "volver a Inicio" en realidad vuelve al POS,
  // porque no tiene permiso para ver Inicio ni ningún otro módulo.
  const irAInicio = () => {
    if (soloPOS) {
      setVistaActiva('pos');
      return;
    }
    setRefreshInicio((prev) => prev + 1);
    setVistaActiva('inicio');
  };

  // Si el sidebar está colapsado y el usuario abre un submenú, expandimos primero
  const toggleMenu = (menu) => {
    if (sidebarColapsado) setSidebarColapsado(false);
    window.clearTimeout(submenuTimerRef.current);
    if (menuExpandido === menu) {
      setMenuExpandido(null);
      // Mantener el contenido montado hasta que termine el cierre visual.
      submenuTimerRef.current = window.setTimeout(() => setMenuRenderizado(null), 520);
    } else {
      setMenuRenderizado(menu);
      setMenuExpandido(menu);
    }
  };

  const estiloSubmenu = (menu) => ({
    // El menú vive dentro de una columna flex con scroll. Evitar flex-shrink
    // impide que el navegador aplaste el submenú hasta dejar visible una sola fila.
    maxHeight: menuExpandido === menu ? '720px' : '0px',
    opacity: menuExpandido === menu ? 1 : 0,
    transform: menuExpandido === menu ? 'translateY(0)' : 'translateY(-7px)',
    overflow: 'hidden',
    flexShrink: 0,
    transition: 'max-height 500ms cubic-bezier(0.22, 1, 0.36, 1), opacity 360ms ease, transform 420ms cubic-bezier(0.22, 1, 0.36, 1)',
    pointerEvents: menuExpandido === menu ? 'auto' : 'none',
  });

  useEffect(() => () => window.clearTimeout(submenuTimerRef.current), []);
  useEffect(() => {
    if (menuExpandido) setMenuRenderizado(menuExpandido);
  }, [menuExpandido]);

  useEffect(() => {
    const path = location.pathname.toLowerCase();
    if (soloPOS) {
      setVistaActiva('pos');
      return;
    }

    if (esDesarrollador && (path === '/' || path === '')) {
      setVistaActiva('admin_desarrollador');
      return;
    }

    if (path.startsWith('/stock-history/')) {
      setVistaActiva('stock_history');
      return;
    }
    if (path.startsWith('/transferencias-stock')) {
      setVistaActiva('transferencias_stock');
      setMenuExpandido('transferencias_stock');
      return;
    }
    if (path.startsWith('/control-stock') || path.startsWith('/ajustes-stock')) {
      setVistaActiva('ajustes_stock');
      setMenuExpandido('control_stock');
      return;
    }
    if (path.startsWith('/fabricacion')) {
      setVistaActiva('fabricacion');
      setMenuExpandido('fabricacion');
      return;
    }
    if (path.startsWith('/informes/')) {
      const informePath = path.split('/')[2];
      const informesOperativos = ['stock', 'deudas', 'gastos', 'iva', 'vencimientos', 'ajustes'];
      setVistaActiva(informesOperativos.includes(informePath) ? 'informes_operativos' : 'informes_micdepos');
      setMenuExpandido('informes');
      return;
    }

    switch (path) {
      case '/':
        setVistaActiva('inicio');
        break;
      case '/ot':
        setVistaActiva('ot');
        break;
      case '/configuracion':
      case '/config_empresa':
        setVistaActiva('config_empresa');
        break;
      case '/config_factura':
      case '/facturacion_electronica':
        setVistaActiva('config_factura');
        break;
      case '/configuracion/modulos':
        setVistaActiva('config_modulos');
        break;
      case '/invoice-schemes':
        setVistaActiva('config_modulos');
        break;
      case '/barcodes':
        setVistaActiva('config_modulos');
        break;
      case '/printers':
        setVistaActiva('config_modulos');
        break;
      case '/scales':
        setVistaActiva('config_modulos');
        break;
      case '/tax-rates':
        setVistaActiva('config_modulos');
        break;
      case '/types-of-service':
        setVistaActiva('config_modulos');
        break;
      case '/subscription':
        setVistaActiva('config_modulos');
        break;
      case '/admin-desarrollador':
        setVistaActiva('admin_desarrollador');
        break;
      case '/ubicaciones':
      case '/ubicaciones_comerciales':
        setVistaActiva('ubicaciones_comerciales');
        break;
      case '/ventas':
      case '/todas_ventas':
        setVistaActiva('todas_ventas');
        break;
      case '/pos':
      case '/punto-venta':
        setVistaActiva('pos');
        break;
      case '/compras':
        setVistaActiva('compras');
        break;
      case '/compras/agregar':
      case '/agregar_compra':
        setVistaActiva('agregar_compra');
        break;
      case '/gastos':
        setVistaActiva('gastos');
        break;
      case '/gastos/agregar':
      case '/agregar_gasto':
        setVistaActiva('agregar_gasto');
        break;
      case '/categorias_gastos':
      case '/gastos/categorias':
        setVistaActiva('categorias_gastos');
        break;
      case '/devoluciones_compra':
        setVistaActiva('devoluciones_compra');
        break;
      case '/descuentos':
        setVistaActiva('descuentos_ventas');
        break;
      case '/devoluciones-ventas':
        setVistaActiva('devoluciones_ventas');
        break;
      case '/importar-ventas':
        setVistaActiva('importar_ventas');
        break;
      case '/clientes':
        setVistaActiva('clientes');
        break;
      case '/proveedores':
        setVistaActiva('proveedores');
        break;
      case '/grupos_clientes':
        setVistaActiva('grupos_clientes');
        break;
      case '/cobros':
        setVistaActiva('cobros');
        break;
      case '/catalogo':
        setVistaActiva('catalogo');
        break;
      case '/catalogo-qr':
        setVistaActiva('catalogo_qr');
        break;
      case '/stock-history':
        setVistaActiva('stock_history');
        break;
      case '/transferencias-stock':
        setVistaActiva('transferencias_stock');
        break;
      case '/ajustes-stock':
        setVistaActiva('ajustes_stock');
        break;
      case '/control-stock':
      case '/control-stock/nuevo':
      case '/ajustes-stock/nuevo':
        setVistaActiva('ajustes_stock');
        setMenuExpandido('control_stock');
        break;
      case '/importar-productos':
        setVistaActiva('importar_productos');
        break;
      case '/importar-contactos':
        setVistaActiva('importar_contactos');
        break;
      case '/plantillas-notificacion':
        setVistaActiva('plantillas_notificacion');
        break;
      case '/presupuestos':
        setVistaActiva('cotizaciones');
        break;
      case '/envios':
      case '/shipments':
      case '/entregas':
        setVistaActiva('envios');
        break;
      case '/remisiones-electronicas':
      case '/remisiones':
        setVistaActiva('remisiones_electronicas');
        break;
      case '/variaciones-productos':
        setVistaActiva('variaciones_productos');
        setMenuExpandido('productos');
        break;
      case '/imprimir-etiquetas':
        setVistaActiva('imprimir_etiquetas');
        setMenuExpandido('productos');
        break;
      case '/importar-stock-inicial':
        setVistaActiva('importar_stock_inicial');
        setMenuExpandido('productos');
        break;
      case '/grupos-precios-venta':
        setVistaActiva('grupos_precios_venta');
        setMenuExpandido('productos');
        break;
      case '/garantias':
        setVistaActiva('garantias_productos');
        setMenuExpandido('productos');
        break;
      case '/agregar_producto':
        setVistaActiva('agregar_producto');
        break;
      case '/marcas':
        setVistaActiva('marcas');
        break;
      case '/categorias':
        setVistaActiva('categorias');
        break;
      case '/unidades':
        setVistaActiva('unidades');
        break;
      case '/usuarios':
        setVistaActiva('usuarios');
        break;
      case '/roles':
        setVistaActiva('roles');
        break;
      case '/caja_registradora':
      case '/caja-registradora':
        setVistaActiva('caja_registradora');
        setMenuExpandido('informes');
        break;
      case '/cajas':
      case '/caja_banco':
        setVistaActiva('cajas');
        break;
      case '/informe-caja-pago':
      case '/informe_caja_pago':
        setVistaActiva('informe_caja_pago');
        break;
      case '/ventas-por-producto':
      case '/ventas_por_producto':
        setVistaActiva('ventas_por_producto');
        setMenuExpandido('informes');
        break;
      case '/compras-por-producto':
      case '/compras_por_producto':
        setVistaActiva('compras_por_producto');
        setMenuExpandido('informes');
        break;
      case '/cobro-de-ventas':
      case '/cobro_de_ventas':
        setVistaActiva('cobro_de_ventas');
        setMenuExpandido('informes');
        break;
      case '/ganancias_perdidas':
      case '/ganancias-perdidas':
        setVistaActiva('ganancias_perdidas');
        setMenuExpandido('informes');
        break;
      case '/vendedores-comisiones':
      case '/vendedores_comisiones':
        setVistaActiva('vendedores_comisiones');
        setMenuExpandido('informes');
        break;
      case '/ventas-por-personal':
      case '/ventas_por_personal':
        setVistaActiva('ventas_por_personal');
        setMenuExpandido('informes');
        break;
      case '/pedidos':
        setVistaActiva('pedidos');
        break;
      case '/informes-operativos':
        setVistaActiva('informes_operativos');
        setMenuExpandido('informes');
        break;
      case '/flujo-fondos':
      case '/flujo_fondos':
        setVistaActiva('flujo_fondos');
        setMenuExpandido('informes');
        break;
      default:
        setVistaActiva(initialView);
        break;
    }
  }, [location.pathname, initialView, soloPOS, esDesarrollador]);

  // 2. ENRUTADOR DE VISTAS (Aquí se decide qué se dibuja a la derecha)
  const renderizarVista = () => {
    if (!puedeVerVista(vistaActiva)) {
      return (
        <div className="bg-white rounded-xl border border-red-100 p-8 text-center shadow-sm">
          <h2 className="text-lg font-bold text-gray-800">{t('restrictedAccess')}</h2>
          <p className="text-sm text-gray-500 mt-2">{t('noModulePermission')}</p>
          <button onClick={irAInicio} className="mt-4 bg-orange-500 text-white rounded px-4 py-2 text-sm font-bold">{t('backHome')}</button>
        </div>
      );
    }

    switch (vistaActiva) {
      case 'inicio':
        return <Inicio key={refreshInicio} perfilUsuario={perfilUsuario} accionInicial={accionInicio} />;

      case 'ot':
        return <OT key={refreshKey} perfilUsuario={perfilUsuario} />;

      case 'config_empresa':
        return <ConfiguracionEmpresa perfilUsuario={perfilUsuario} />;

      case 'config_factura':
        return <ConfiguracionFacturaElectronica />;

      case 'config_modulos':
        return <ConfiguracionModulos key={location.pathname} perfilUsuario={perfilUsuario} initialSection={{ '/configuracion/modulos':'facturas', '/invoice-schemes':'facturas', '/barcodes':'barcodes', '/printers':'printers', '/scales':'scales', '/tax-rates':'taxes', '/types-of-service':'services', '/subscription':'suscripcion' }[location.pathname.toLowerCase()] || 'facturas'} />;

      case 'admin_desarrollador':
        return <PanelDesarrollador />;

      case 'ubicaciones_comerciales':
        return <UbicacionesComerciales />;

      case 'todas_ventas':
        return <TodasLasVentas perfilUsuario={perfilUsuario} />;

      case 'descuentos_ventas':
        return <DescuentosVentas perfilUsuario={perfilUsuario} />;

      case 'devoluciones_ventas':
        return <DevolucionesVentas perfilUsuario={perfilUsuario} />;

      case 'importar_ventas':
        return <ImportarVentas perfilUsuario={perfilUsuario} />;

      case 'devoluciones_compra':
        return <DevolucionesCompras perfilUsuario={perfilUsuario} />;

      case 'pos':
        // Validación exclusiva: Si la caja está cerrada, obliga a abrirla antes del POS
        if (cargandoCaja) {
          return <div className="p-10 text-center text-gray-500 font-bold">{t('checkingOpenRegister')}</div>;
        }
        if (!cajaActual) {
          return <AbrirCaja onCajaAbierta={(caja) => setCajaActual(caja)} perfilUsuario={perfilUsuario} />;
        }
        return (
          <PuntoDeVenta
            cajaInfo={cajaActual}
            session={session}
            perfilUsuario={perfilUsuario}
            onVolver={irAInicio}
            onAbrirGuia={() => setGuiaVisible(true)}
            onSolicitarCierre={(reporte) => {
              setReporteCierre(reporte);
              setCajaActual(null);
              // Invalidar el caché de Inicio para que al volver muestre la caja ya cerrada
              setRefreshInicio((prev) => prev + 1);
              setVistaActiva('reporte_cierre');
            }}
            onNuevoGasto={() => setVistaActiva('nuevo_gasto')}
          />
        );
      case 'reporte_cierre':
        return (
          <ReporteCierreCaja
            reporte={reporteCierre}
            onVolver={irAInicio}
          />
        );
      case 'nuevo_gasto':
        return (
          <NuevoGasto
            onGastoCreado={() => setVistaActiva('pos')}
          />
        );

      case 'catalogo':
        return <ListaProductos />;

      case 'catalogo_qr':
        return <CatalogoQR key={refreshKey} />;

      case 'stock_history':
        return <HistorialExistencias key={refreshKey} />;

      case 'agregar_producto':
        return (
          <AgregarProducto
            onGuardado={() => setVistaActiva('catalogo')}
            onCancelar={() => setVistaActiva('catalogo')}
          />
        );

      case 'marcas':
        return <Marcas />;

      case 'categorias':
        return <Categorias />;

      case 'unidades':
        return <Unidades />;

      case 'imprimir_etiquetas':
        return <ImprimirEtiquetasProductos key={refreshKey} />;

      case 'importar_stock_inicial':
        return <ImportarStockInicial key={refreshKey} />;

      case 'grupos_precios_venta':
        return <GruposPreciosVenta key={refreshKey} />;

      case 'garantias_productos':
        return <GarantiasProductos key={refreshKey} />;

      case 'usuarios':
        return <Usuarios />;

      case 'roles':
        return <Roles />;

      case 'compras':
        return <GestorCompras />;

      case 'agregar_compra':
        return <GestorCompras vistaInicial="agregar" />;

      case 'gastos':
        return <Gastos />;

      case 'agregar_gasto':
        return <Gastos vistaInicial="agregar" />;

      case 'categorias_gastos':
        return <CategoriasGastos />;

      case 'clientes':
        return <Clientes />;

      case 'proveedores':
        return <Proveedores />;

      case 'grupos_clientes':
        return <GruposClientes />;

      case 'cobros':
        return <CuentasPorCobrar />;

      case 'caja_registradora':
        return <CajaRegistradora />;

      case 'ganancias_perdidas':
        return <GananciasPerdidas />;

      case 'cajas':
        return <ListaCajas perfilUsuario={perfilUsuario} />;

      case 'informe_caja_pago':
        return <InformeCajaPago perfilUsuario={perfilUsuario} />;

      case 'ventas_por_producto':
        return <VentasPorProducto perfilUsuario={perfilUsuario} />;

      case 'compras_por_producto':
        return <ComprasPorProducto />;

      case 'cobro_de_ventas':
        return <CobroDeVentas perfilUsuario={perfilUsuario} />;

      case 'vendedores_comisiones':
        return <VendedoresComisiones />;

      case 'ventas_por_personal':
        return <VentasPorPersonal />;

      case 'flujo_fondos':
        return <FlujoFondos key={refreshKey} />;

      case 'pedidos':
        return <Pedidos />;

      case 'informes_operativos':
        return <InformesOperativos key={location.pathname} initialReport={location.pathname.startsWith('/informes/') ? location.pathname.split('/')[2] : 'stock'} hideNavigation />;

      case 'informes_micdepos':
        return <InformesMicdepos key={location.pathname} initialReport={location.pathname.split('/')[2] || 'compras-ventas'} hideNavigation />;

      case 'transferencias_stock':
        return <TransferenciasStock />;

      case 'ajustes_stock':
        return <AjustesStock key={`${refreshKey}-${location.pathname}`} initialCreate={location.pathname.endsWith('/nuevo')} />;

      case 'importar_productos':
        return <ImportarDatos tipo="productos" />;

      case 'importar_contactos':
        return <ImportarDatos tipo="contactos" />;

      case 'fabricacion':
        return <Fabricacion key={refreshKey} initialTab={location.pathname.split('/')[2] || 'recetas'} perfilUsuario={perfilUsuario} />;

      case 'plantillas_notificacion':
        return <PlantillasNotificacion key={refreshKey} />;

      case 'variaciones_productos':
        return <VariacionesProductos key={refreshKey} />;

      case 'cotizaciones':
        return <Cotizaciones key={refreshKey} />;

      case 'envios':
        return <Envios key={refreshKey} />;

      case 'remisiones_electronicas':
        return <RemisionesElectronicas key={refreshKey} perfilUsuario={perfilUsuario} session={session} />;

      default:
        return <GraficosDashboard />;
    }
  };

  // Estilos de los botones del Sidebar
  const estiloBotonSimple = (vista) => `
    group relative w-full min-h-[42px] text-left text-[14px] font-semibold tracking-[0.01em] transition-all duration-300 ease-out flex items-center gap-3 overflow-hidden
    ${sidebarColapsado ? 'justify-center px-2 mx-1.5 rounded-xl' : 'justify-start px-3 py-2.5 mx-2 rounded-xl'}
    ${vistaActiva === vista
      ? 'text-[#ff4d00] bg-[#1e1f35] shadow-[0_8px_18px_rgba(15,23,42,0.16)]'
      : 'text-slate-600 hover:text-[#ff4d00] hover:bg-[#1e1f35] hover:shadow-[0_8px_18px_rgba(15,23,42,0.16)] active:bg-[#1e1f35]'}
  `;

  const estiloBotonDesplegable = (menuName) => `
    group relative w-full min-h-[42px] text-left text-[14px] font-semibold tracking-[0.01em] transition-all duration-300 ease-out flex items-center justify-between overflow-hidden
    ${sidebarColapsado ? 'justify-center px-2 mx-1.5 rounded-xl' : 'px-3 py-2.5 mx-2 rounded-xl'}
    ${menuExpandido === menuName
      ? 'text-[#ff4d00] bg-[#1e1f35] shadow-[0_8px_18px_rgba(15,23,42,0.16)]'
      : 'text-slate-600 hover:text-[#ff4d00] hover:bg-[#1e1f35] hover:shadow-[0_8px_18px_rgba(15,23,42,0.16)] active:bg-[#1e1f35]'}
  `;

  const estiloSubItem = (vista, ruta) => `
    w-full text-left pl-6 pr-3 py-2 text-[13px] font-medium transition-colors duration-200 flex items-center gap-2 rounded-none mx-0 border-0
    ${(ruta ? location.pathname === ruta || (ruta === '/informes/stock' && location.pathname === '/informes-operativos') : vistaActiva === vista) ? 'text-[#ff4d00] font-semibold bg-white/5' : 'text-slate-400 hover:text-[#ff4d00] hover:bg-[#ff4d00]/10'}
  `;

  return (
    <div className="flex h-screen bg-[#f3f4f6] font-sans flex-col md:flex-row overflow-hidden">

      {cargandoNavegacion && (
        <div className="gda-navigation-progress" role="progressbar" aria-label="Cargando módulo" aria-valuetext="Cargando módulo" />
      )}

      {/* Overlay para móvil */}
      {menuMovilAbierto && !posPantallaCompleta && (
        <div
          className="fixed inset-0 bg-black/50 z-20 md:hidden"
          onClick={() => setMenuMovilAbierto(false)}
        />
      )}

      {!posPantallaCompleta && menuMovilAbierto && (
        <aside className="fixed inset-y-0 left-0 z-30 w-[79vw] max-w-[570px] bg-white shadow-2xl flex flex-col md:hidden overflow-hidden">
          <div className="bg-[#fff0e9] px-8 pt-8 pb-7 flex items-center gap-5 shrink-0">
            <div className="w-[74px] h-[74px] rounded-full bg-[#f46b21] text-white flex items-center justify-center text-3xl font-bold">
              {(perfilUsuario?.empresas?.nombre || 'G').charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="text-[24px] leading-tight font-bold text-[#171717] truncate">
                {perfilUsuario?.empresas?.nombre || 'GDA Repuesto'}
              </h2>
              <p className="text-[20px] text-[#777] mt-1 truncate">CDEpos</p>
            </div>
            <span className="bg-[#f46b21] text-white rounded-full px-4 py-2 text-base font-bold">
              {perfilUsuario?.roles?.nombre || 'admin'}
            </span>
          </div>

          <nav className="flex-1 overflow-y-auto py-3">
            <button
              type="button"
              onClick={() => irA('plantillas_notificacion', '/plantillas-notificacion')}
              className="w-full min-h-[74px] px-8 flex items-center gap-6 text-left text-[21px] tracking-wide text-[#202020] hover:bg-[#fff5f0]"
            >
              <Mail size={32} strokeWidth={2.1} className="shrink-0" />
              <span>Plantillas de notificaciones</span>
            </button>
            <div className="border-b border-[#e5e5e5] mb-2 pb-2">
              <button
                type="button"
                onClick={() => setConfiguracionesMovilAbiertas((abiertas) => !abiertas)}
                className="w-full min-h-[74px] px-8 flex items-center gap-6 text-left text-[21px] tracking-wide text-[#202020] hover:bg-[#fff5f0]"
                aria-expanded={configuracionesMovilAbiertas}
                aria-controls="configuraciones-menu-movil"
              >
                <Settings size={32} strokeWidth={2.1} className="shrink-0" />
                <span className="flex-1">Configuraciones</span>
                <ChevronLeft size={22} className={`transition-transform ${configuracionesMovilAbiertas ? '-rotate-90' : ''}`} />
              </button>
              {configuracionesMovilAbiertas && (
                <div id="configuraciones-menu-movil" className="mx-6 mb-3 border-l-2 border-orange-400 bg-slate-50 py-1">
                  <button type="button" onClick={() => irA('config_empresa', '/config_empresa')} className="w-full min-h-[52px] px-5 text-left text-base text-slate-700 hover:bg-orange-50">
                    → Configuración de la empresa
                  </button>
                    <button type="button" onClick={() => irA('ubicaciones_comerciales', '/ubicaciones_comerciales')} className="w-full min-h-[52px] px-5 text-left text-base text-slate-700 hover:bg-orange-50">
                      → Ubicaciones comerciales
                    </button>
                    <button type="button" onClick={() => irA('config_modulos', '/invoice-schemes')} className="w-full min-h-[52px] px-5 text-left text-base text-slate-700 hover:bg-orange-50">
                      → Configuración de factura
                    </button>
                    <button type="button" onClick={() => irA('config_modulos', '/barcodes')} className="w-full min-h-[52px] px-5 text-left text-base text-slate-700 hover:bg-orange-50">
                      → Códigos de barras
                    </button>
                    <button type="button" onClick={() => irA('config_modulos', '/printers')} className="w-full min-h-[52px] px-5 text-left text-base text-slate-700 hover:bg-orange-50">
                      → Impresoras de tickets
                    </button>
                    <button type="button" onClick={() => irA('config_modulos', '/scales')} className="w-full min-h-[52px] px-5 text-left text-base text-slate-700 hover:bg-orange-50">
                      → Balanzas de red
                    </button>
                    <button type="button" onClick={() => irA('config_modulos', '/tax-rates')} className="w-full min-h-[52px] px-5 text-left text-base text-slate-700 hover:bg-orange-50">
                      → Tasas de impuestos
                    </button>
                    <button type="button" onClick={() => irA('config_modulos', '/types-of-service')} className="w-full min-h-[52px] px-5 text-left text-base text-slate-700 hover:bg-orange-50">
                      → Tipos de servicio
                    </button>
                    <button type="button" onClick={() => irA('config_modulos', '/subscription')} className="w-full min-h-[52px] px-5 text-left text-base text-slate-700 hover:bg-orange-50">
                      → Suscripción
                    </button>
                    <button type="button" onClick={() => irA('config_factura', '/config_factura')} className="w-full min-h-[52px] px-5 text-left text-base text-slate-700 hover:bg-orange-50">
                      → Facturación electrónica SIFEN
                    </button>
                </div>
              )}
            </div>
            {[
              ['Vender', '/pos', ShoppingCart],
              ['Productos', '/catalogo', Package],
              ['Histórico de ventas', '/todas_ventas', FileText],
              ['Presupuestos', '/presupuestos', ClipboardList],
              ['Pedidos pendientes', '/cobros', ClipboardList],
              ['Clientes', '/clientes', Users],
              ['Carta Online', '/carta-online', BookOpen],
              ['Mis entregas', '/entregas', Truck],
              ['Caja', '/caja_registradora', DollarSign],
              ['Caja / Banco', '/cajas', Building2],
              ['Flujo de fondos', '/flujo-fondos', BarChart3],
              ['Informe de cajas', '/informe-caja-pago', FileText],
              ['Gastos', '/gastos', FileText],
              ['Compras', '/compras', ShoppingBag],
              ['Stock', '/apertura-stock', Package],
              ['Devoluciones', '/devoluciones_compra', RotateCw],
              ['Asistencia', '/asistencia', Clock3],
              ['CRM / Follow-ups', '/crm', Users],
              ['Reportes', '/ganancias_perdidas', BarChart3],
            ].map(([etiqueta, ruta, Icono]) => (
              <button
                key={ruta}
                type="button"
                onClick={() => irA(etiqueta === 'Vender' ? 'pos' : etiqueta === 'Productos' ? 'catalogo' : etiqueta === 'Clientes' ? 'clientes' : etiqueta === 'Caja' ? 'caja_registradora' : etiqueta === 'Caja / Banco' ? 'cajas' : etiqueta === 'Gastos' ? 'gastos' : etiqueta === 'Compras' ? 'compras' : etiqueta === 'Reportes' ? 'ganancias_perdidas' : etiqueta === 'Informe de cajas' ? 'informe_caja_pago' : etiqueta === 'Devoluciones' ? 'devoluciones_compra' : etiqueta === 'Pedidos pendientes' ? 'cobros' : etiqueta === 'Histórico de ventas' ? 'todas_ventas' : etiqueta === 'Presupuestos' ? 'cotizaciones' : etiqueta === 'Flujo de fondos' ? 'flujo_fondos' : etiqueta === 'Mis entregas' ? 'envios' : 'inicio', ruta)}
                className="w-full min-h-[74px] px-8 flex items-center gap-6 text-left text-[21px] tracking-wide text-[#202020] hover:bg-[#fff5f0] active:bg-[#ffe9df]"
              >
                <Icono size={32} strokeWidth={2.1} className="shrink-0 text-[#161616]" />
                <span>{etiqueta}</span>
              </button>
            ))}

            <div className="border-t border-[#e5e5e5] mt-2 pt-2">
              <button type="button" onClick={() => irA('inicio', '/soporte')} className="w-full min-h-[74px] px-8 flex items-center gap-6 text-left text-[21px] tracking-wide text-[#202020] hover:bg-[#fff5f0]">
                <CircleHelp size={32} strokeWidth={2.1} className="shrink-0" />
                <span>Soporte</span>
              </button>
              <button type="button" onClick={cerrarSesion} className="w-full min-h-[74px] px-8 flex items-center gap-6 text-left text-[21px] tracking-wide text-[#e14c4c] hover:bg-red-50">
                <LogOut size={32} strokeWidth={2.1} className="shrink-0" />
                <span>Cerrar sesión</span>
              </button>
            </div>
          </nav>

          <div className="border-t border-[#e5e5e5] px-8 py-5 text-center text-[#999] text-base shrink-0">
            ⓘ CDEpos v0.4.47 (build 78)
          </div>
        </aside>
      )}

      {/* ========================================== */}
      {/* MENÚ LATERAL IZQUIERDO (SIDEBAR COMPLETO)  */}
      {/* ========================================== */}
      {!posPantallaCompleta && (
        <aside className={`
          ${sidebarColapsado ? 'w-[78px]' : 'w-[250px]'}
          transition-[width,transform] duration-300 ease-out bg-white text-slate-800 flex flex-col h-full shadow-[4px_0_12px_rgba(15,23,42,0.06)] z-30
          fixed inset-y-0 left-0 transform ${menuMovilAbierto ? 'translate-x-0' : '-translate-x-full'}
          hidden md:relative md:translate-x-0 md:flex
        `}>
          {/* Logo Superior con botón de cerrar para móvil */}
          <div className="relative z-10 h-16 flex items-center justify-between px-4 bg-gradient-to-r from-white via-slate-50/50 to-white shadow-[0_2px_6px_rgba(15,23,42,0.08)] backdrop-blur-sm overflow-hidden">
            <div className="flex-1 flex justify-center">
              <LogoPyPos variant={sidebarColapsado ? 'icon' : 'full'} size={sidebarColapsado ? 42 : 46} />
            </div>
            <button
              onClick={() => setMenuMovilAbierto(false)}
              className="md:hidden text-gray-500 hover:text-gray-800"
            >
              <X size={24} />
            </button>
          </div>

          {/* Lista de Navegación */}
          <nav className="flex-1 overflow-y-auto overflow-x-hidden py-3 px-1 flex flex-col bg-gradient-to-b from-[#f8fafc] to-[#f3f5f8] gap-0.5">
            {!soloPOS && tieneCategoria('ot') && (
                <Link to="/" onClick={() => irA('inicio', '/')} className={estiloBotonSimple('inicio')} title={t('home')}>
                  <LayoutDashboard size={18} strokeWidth={2} /> {!sidebarColapsado && t('home')}
                </Link>

            )}

            {/* MENÚ: GESTIÓN DE USUARIOS */}
            {(tieneCategoria('usuarios') || tieneCategoria('roles')) && (
              <>
                <button onClick={() => toggleMenu('usuarios')} className={estiloBotonDesplegable('usuarios')} title={t('userManagement')}>
                  <div className="flex items-center gap-3"><Users size={18} strokeWidth={2} /> {!sidebarColapsado && t('userManagement')}</div>
                  {!sidebarColapsado && (
                    <span className="ml-auto inline-flex shrink-0 items-center text-slate-500 group-hover:text-[#ff4d00]"><ChevronLeft size={14} strokeWidth={2} /></span>
                  )}
                </button>
                {menuRenderizado === 'usuarios' && !sidebarColapsado && (
                  <div aria-hidden={menuExpandido !== 'usuarios'} inert={menuExpandido !== 'usuarios'} style={estiloSubmenu('usuarios')} className="sidebar-submenu mx-1.5 flex flex-col rounded-b bg-[#1e1f35] py-1.5">
                    {tieneCategoria('usuarios') && (
                      <Link to="/usuarios" onClick={() => irA('usuarios', '/usuarios')} className={estiloSubItem('usuarios')}>🠖 {t('users')}</Link>
                    )}
                    {tieneCategoria('roles') && (
                      <Link to="/roles" onClick={() => irA('roles', '/roles')} className={estiloSubItem('roles')}>🠖 {t('roles')}</Link>
                    )}
                  </div>
                )}
              </>
            )}

            {/* MENÚ: CLIENTE / PROVEEDOR */}
            {tieneCategoria('clientes_proveedores') && (
              <>
                <button onClick={() => toggleMenu('contactos')} className={estiloBotonDesplegable('contactos')} title={t('contacts')}>
                  <div className="flex items-center gap-3"><Contact size={18} strokeWidth={2} /> {!sidebarColapsado && t('contacts')}</div>
                  {!sidebarColapsado && (
                    <span className="ml-auto inline-flex shrink-0 items-center text-slate-500 group-hover:text-[#ff4d00]"><ChevronLeft size={14} strokeWidth={2} /></span>
                  )}
                </button>
                {menuRenderizado === 'contactos' && !sidebarColapsado && (
                  <div aria-hidden={menuExpandido !== 'contactos'} inert={menuExpandido !== 'contactos'} style={estiloSubmenu('contactos')} className="sidebar-submenu mx-1.5 flex flex-col rounded-b bg-[#1e1f35] py-1.5">
                    <Link to="/proveedores" onClick={() => irA('proveedores', '/proveedores')} className={estiloSubItem('proveedores')}>🠖 {t('suppliers')}</Link>
                    <Link to="/clientes" onClick={() => irA('clientes', '/clientes')} className={estiloSubItem('clientes')}>🠖 {t('customers')}</Link>
                    <Link to="/grupos_clientes" onClick={() => irA('grupos_clientes', '/grupos_clientes')} className={estiloSubItem('grupos_clientes')}>🠖 {t('customerGroups')}</Link>
                    {(esAdmin || !permisosRol || permisosRol.clientes_proveedores?.['Agregar cliente'] === true || permisosRol.clientes_proveedores?.['Agregar proveedor'] === true) && <Link to="/importar-contactos" onClick={() => irA('importar_contactos', '/importar-contactos')} className={estiloSubItem('importar_contactos')}>🠖 Importar contactos</Link>}
                  </div>
                )}
              </>
            )}

            {/* MENÚ: PRODUCTOS */}
            {tieneCategoria('productos') && (
              <>
                <button onClick={() => toggleMenu('productos')} aria-expanded={menuExpandido === 'productos'} aria-controls="submenu-productos" className={estiloBotonDesplegable('productos')} title={t('products')}>
                  <div className="flex items-center gap-3"><Package size={18} strokeWidth={2} /> {!sidebarColapsado && t('products')}</div>
                  {!sidebarColapsado && (
                    <span className="ml-auto inline-flex shrink-0 items-center text-slate-500 group-hover:text-[#ff4d00]"><ChevronLeft size={14} strokeWidth={2} /></span>
                  )}
                </button>
                {menuRenderizado === 'productos' && !sidebarColapsado && (
                  <div id="submenu-productos" aria-hidden={menuExpandido !== 'productos'} inert={menuExpandido !== 'productos'} style={estiloSubmenu('productos')} className="sidebar-submenu mx-1.5 flex flex-col rounded-b bg-[#1e1f35] py-1.5">
                    <Link to="/catalogo" onClick={() => irA('catalogo', '/catalogo')} className={estiloSubItem('catalogo')}>🠖 {t('productList')}</Link>
                    <Link to="/agregar_producto" onClick={() => irA('agregar_producto', '/agregar_producto')} className={estiloSubItem('agregar_producto')}>🠖 {t('addProduct')}</Link>
                    <Link to="/imprimir-etiquetas" onClick={() => irA('imprimir_etiquetas', '/imprimir-etiquetas')} className={estiloSubItem('imprimir_etiquetas')}>🠖 Imprimir etiquetas</Link>
                    <Link to="/variaciones-productos" onClick={() => irA('variaciones_productos', '/variaciones-productos')} className={estiloSubItem('variaciones_productos')}>🠖 Variaciones</Link>
                    {(esAdmin || !permisosRol || permisosRol.productos?.['Agregar producto'] === true) && <Link to="/importar-productos" onClick={() => irA('importar_productos', '/importar-productos')} className={estiloSubItem('importar_productos')}>🠖 Importar productos</Link>}
                    {(esAdmin || !permisosRol || permisosRol.productos?.['Ajustar stock'] === true) && <Link to="/importar-stock-inicial" onClick={() => irA('importar_stock_inicial', '/importar-stock-inicial')} className={estiloSubItem('importar_stock_inicial')}>🠖 Importar stock inicial</Link>}
                    <Link to="/grupos-precios-venta" onClick={() => irA('grupos_precios_venta', '/grupos-precios-venta')} className={estiloSubItem('grupos_precios_venta')}>🠖 Grupo de precios de venta</Link>
                    <Link to="/unidades" onClick={() => irA('unidades', '/unidades')} className={estiloSubItem('unidades')}>🠖 {t('units')}</Link>
                    <Link to="/categorias" onClick={() => irA('categorias', '/categorias')} className={estiloSubItem('categorias')}>🠖 {t('categories')}</Link>
                    <Link to="/marcas" onClick={() => irA('marcas', '/marcas')} className={estiloSubItem('marcas')}>🠖 {t('brands')}</Link>
                    <Link to="/garantias" onClick={() => irA('garantias_productos', '/garantias')} className={estiloSubItem('garantias_productos')}>🠖 Garantías</Link>
                  </div>
                )}
              </>
            )}

            {/* Fabricación se abre como una sola sección; sus opciones viven dentro del módulo. */}
            {(esAdmin || !permisosRol || permisosRol.productos?.['Ajustar stock'] === true) && (
              <Link to="/fabricacion" onClick={() => irA('fabricacion', '/fabricacion')} className={estiloBotonDesplegable('fabricacion')} title="Fabricación">
                <div className="flex items-center gap-3"><Factory size={18} strokeWidth={2} /> {!sidebarColapsado && 'Fabricación'}</div>
              </Link>
            )}

            {!soloPOS && tieneCategoria('ot') && (
                <Link to="/ot" onClick={() => irA('ot', '/ot')} className={estiloBotonSimple('ot')} title={t('workOrders')}>
                  <Wrench size={18} strokeWidth={2} /> {!sidebarColapsado && t('workOrders')}
                </Link>
            )}

            {/* MENÚ: COMPRAS (RECONECTADO) */}
            {tieneCategoria('compras') && (
              <>
                <button onClick={() => toggleMenu('compras')} className={estiloBotonDesplegable('compras')} title={t('purchases')}>
                  <div className="flex items-center gap-3"><ArrowDownToLine size={18} strokeWidth={2} /> {!sidebarColapsado && t('purchases')}</div>
                  {!sidebarColapsado && (
                    <span className="ml-auto inline-flex shrink-0 items-center text-slate-500 group-hover:text-[#ff4d00]"><ChevronLeft size={14} strokeWidth={2} /></span>
                  )}
                </button>
                {menuRenderizado === 'compras' && !sidebarColapsado && (
                  <div aria-hidden={menuExpandido !== 'compras'} inert={menuExpandido !== 'compras'} style={estiloSubmenu('compras')} className="sidebar-submenu mx-1.5 flex flex-col rounded-b bg-[#1e1f35] py-1.5">
                    <Link to="/compras" onClick={() => irA('compras', '/compras')} className={estiloSubItem('compras')}>🠖 {t('purchaseList')}</Link>
                    <Link to="/agregar_compra" onClick={() => irA('agregar_compra', '/agregar_compra')} className={estiloSubItem('agregar_compra')}>🠖 {t('addPurchase')}</Link>
                    <Link to="/devoluciones_compra" onClick={() => irA('devoluciones_compra', '/devoluciones_compra')} className={estiloSubItem('devoluciones_compra')}>🠖 {t('purchaseReturns')}</Link>
                  </div>
                )}
              </>
            )}

            {/* MENÚ: VENTAS */}
            {tieneCategoria('ventas_pos') && !soloPOS && (
              <>
                <button onClick={() => toggleMenu('ventas')} className={estiloBotonDesplegable('ventas')} title={t('sales')}>
                  <div className="flex items-center gap-3"><ArrowUpFromLine size={18} strokeWidth={2} /> {!sidebarColapsado && t('sales')}</div>
                  {!sidebarColapsado && (
                    <span className="ml-auto inline-flex shrink-0 items-center text-slate-500 group-hover:text-[#ff4d00]"><ChevronLeft size={14} strokeWidth={2} /></span>
                  )}
                </button>
                {menuRenderizado === 'ventas' && !sidebarColapsado && (
                  <div aria-hidden={menuExpandido !== 'ventas'} inert={menuExpandido !== 'ventas'} style={estiloSubmenu('ventas')} className="sidebar-submenu mx-1.5 flex flex-col rounded-b bg-[#1e1f35] py-1.5">
                    <Link to="/todas_ventas" onClick={() => irA('todas_ventas', '/todas_ventas')} className={estiloSubItem('todas_ventas')}>🠖 {t('allSales')}</Link>
                    <Link to="/pos" onClick={() => irA('pos', '/pos')} className={estiloSubItem('pos')}>🠖 {t('pos')}</Link>
                    <Link to="/cobros" onClick={() => irA('cobros', '/cobros')} className={estiloSubItem('cobros')}>🠖 {t('pendingOrders')}</Link>
                    <Link to="/presupuestos" onClick={() => irA('cotizaciones', '/presupuestos')} className={estiloSubItem('cotizaciones')}>🠖 Presupuestos / Cotizaciones</Link>
                    <Link to="/envios" onClick={() => irA('envios', '/envios')} className={estiloSubItem('envios')}>🠖 Envíos</Link>
                    <Link to="/remisiones-electronicas" onClick={() => irA('remisiones_electronicas', '/remisiones-electronicas')} className={estiloSubItem('remisiones_electronicas')}>🠖 Remisiones electrónicas</Link>
                    <Link to="/descuentos" onClick={() => irA('descuentos_ventas', '/descuentos')} className={estiloSubItem('descuentos_ventas')}>🠖 Descuentos</Link>
                    <Link to="/devoluciones-ventas" onClick={() => irA('devoluciones_ventas', '/devoluciones-ventas')} className={estiloSubItem('devoluciones_ventas')}>🠖 Devoluciones</Link>
                    {(esAdmin || !permisosRol || permisosRol.ventas_pos?.['Acceder al Punto de Venta'] === true) && <Link to="/importar-ventas" onClick={() => irA('importar_ventas', '/importar-ventas')} className={estiloSubItem('importar_ventas')}>🠖 Importar ventas</Link>}
                  </div>
                )}
              </>
            )}

            {soloPOS && (
              <Link to="/pos" onClick={() => irA('pos', '/pos')} className={estiloBotonSimple('pos')} title="Punto de venta">
                <ArrowUpFromLine size={18} strokeWidth={2} /> {!sidebarColapsado && t('pos')}
              </Link>
            )}

            {!tieneCategoria('ventas_pos') && tieneCategoria('caja') && (
              <Link to="/pos" onClick={() => irA('pos', '/pos')} className={estiloBotonSimple('pos')} title="Caja registradora">
                <ArrowUpFromLine size={18} strokeWidth={2} /> {!sidebarColapsado && t('cashRegister')}
              </Link>
            )}

            {(esAdmin || !permisosRol || permisosRol.productos?.['Transferir stock'] === true) && (
              <>
                <button onClick={() => toggleMenu('transferencias_stock')} className={estiloBotonDesplegable('transferencias_stock')} title="Transferencias de stock">
                  <div className="flex items-center gap-3"><ArrowRightLeft size={18} strokeWidth={2} /> {!sidebarColapsado && 'Transferencias de stock'}</div>
                  {!sidebarColapsado && <span className="ml-auto inline-flex shrink-0 items-center text-slate-500 group-hover:text-[#ff4d00]"><ChevronLeft size={14} strokeWidth={2} /></span>}
                </button>
                {menuRenderizado === 'transferencias_stock' && !sidebarColapsado && <div aria-hidden={menuExpandido !== 'transferencias_stock'} inert={menuExpandido !== 'transferencias_stock'} style={estiloSubmenu('transferencias_stock')} className="sidebar-submenu mx-1.5 flex flex-col rounded-b bg-[#1e1f35] py-1.5">
                  <Link to="/transferencias-stock" onClick={() => irA('transferencias_stock', '/transferencias-stock')} className={estiloSubItem('transferencias_stock', '/transferencias-stock')}>🠖 Listar transferencias</Link>
                  <Link to="/transferencias-stock/nuevo" onClick={() => irA('transferencias_stock', '/transferencias-stock/nuevo')} className={estiloSubItem('', '/transferencias-stock/nuevo')}>🠖 Agregar transferencia</Link>
                </div>}
              </>
            )}

            {(esAdmin || !permisosRol || permisosRol.productos?.['Ajustar stock'] === true) && (
              <>
                <button onClick={() => toggleMenu('control_stock')} className={estiloBotonDesplegable('control_stock')} title="Control de stock">
                  <div className="flex items-center gap-3"><ClipboardCheck size={18} strokeWidth={2} /> {!sidebarColapsado && 'Control de stock'}</div>
                  {!sidebarColapsado && <span className="ml-auto inline-flex shrink-0 items-center text-slate-500 group-hover:text-[#ff4d00]"><ChevronLeft size={14} strokeWidth={2} /></span>}
                </button>
                {menuRenderizado === 'control_stock' && !sidebarColapsado && <div aria-hidden={menuExpandido !== 'control_stock'} inert={menuExpandido !== 'control_stock'} style={estiloSubmenu('control_stock')} className="sidebar-submenu mx-1.5 flex flex-col rounded-b bg-[#1e1f35] py-1.5">
                  <Link to="/control-stock" onClick={() => irA('ajustes_stock', '/control-stock')} className={estiloSubItem('ajustes_stock', '/control-stock')}>🠖 Listar controles de stock</Link>
                  <Link to="/control-stock/nuevo" onClick={() => irA('ajustes_stock', '/control-stock/nuevo')} className={estiloSubItem('', '/control-stock/nuevo')}>🠖 Nuevo control de stock</Link>
                </div>}
              </>
            )}

            {/* MENÚ: GASTOS */}
            {tieneCategoria('gastos') && (
              <>
                <button onClick={() => toggleMenu('gastos')} className={estiloBotonDesplegable('gastos')} title={t('expenses')}>
                  <div className="flex items-center gap-3"><ArrowDownToLine size={18} strokeWidth={2} /> {!sidebarColapsado && t('expenses')}</div>
                  {!sidebarColapsado && (
                    <span className="ml-auto inline-flex shrink-0 items-center text-slate-500 group-hover:text-[#ff4d00]"><ChevronLeft size={14} strokeWidth={2} /></span>
                  )}
                </button>
                {menuRenderizado === 'gastos' && !sidebarColapsado && (
                  <div aria-hidden={menuExpandido !== 'gastos'} inert={menuExpandido !== 'gastos'} style={estiloSubmenu('gastos')} className="sidebar-submenu mx-1.5 flex flex-col rounded-b bg-[#1e1f35] py-1.5">
                    <Link to="/gastos" onClick={() => irA('gastos', '/gastos')} className={estiloSubItem('gastos')}>🠖 {t('expenseList')}</Link>
                    <Link to="/gastos/agregar" onClick={() => irA('agregar_gasto', '/gastos/agregar')} className={estiloSubItem('agregar_gasto')}>🠖 {t('addExpense')}</Link>
                    <Link to="/gastos/categorias" onClick={() => irA('categorias_gastos', '/gastos/categorias')} className={estiloSubItem('categorias_gastos')}>🠖 {t('expenseCategories')}</Link>
                  </div>
                )}
              </>
            )}

            {/* MENÚ: CAJA / BANCO */}
            {tieneCategoria('caja') && (
              <>
                <button onClick={() => toggleMenu('caja_banco')} className={estiloBotonDesplegable('caja_banco')} title="Caja / Banco">
                  <div className="flex items-center gap-3"><CreditCard size={18} strokeWidth={2} /> {!sidebarColapsado && t('cashBank')}</div>
                  {!sidebarColapsado && (
                    <span className="ml-auto inline-flex shrink-0 items-center text-slate-500 group-hover:text-[#ff4d00]"><ChevronLeft size={14} strokeWidth={2} /></span>
                  )}
                </button>
                {menuRenderizado === 'caja_banco' && !sidebarColapsado && (
                  <div aria-hidden={menuExpandido !== 'caja_banco'} inert={menuExpandido !== 'caja_banco'} style={estiloSubmenu('caja_banco')} className="sidebar-submenu mx-1.5 flex flex-col rounded-b bg-[#1e1f35] py-1.5">
                    <Link to="/cajas" onClick={() => irA('cajas', '/cajas')} className={estiloSubItem('cajas')}>🠖 {t('cashRegisters')}</Link>
                    <Link to="/informe-caja-pago" onClick={() => irA('informe_caja-pago', '/informe-caja-pago')} className={estiloSubItem('informe_caja_pago')}>🠖 {t('paymentReport')}</Link>
                  </div>
                )}
              </>
            )}

            {/* Informes sigue el orden del submenú de Micdepos. */}
            {tieneCategoria('informes') && (
              <>
                <button onClick={() => toggleMenu('informes')} className={estiloBotonDesplegable('informes')} title="Informes">
                  <div className="flex items-center gap-3"><BarChart3 size={18} strokeWidth={2} /> {!sidebarColapsado && t('reports')}</div>
                  {!sidebarColapsado && <span className="ml-auto inline-flex shrink-0 items-center text-slate-500 group-hover:text-[#ff4d00]"><ChevronLeft size={14} strokeWidth={2} /></span>}
                </button>
                {menuRenderizado === 'informes' && !sidebarColapsado && <div aria-hidden={menuExpandido !== 'informes'} inert={menuExpandido !== 'informes'} style={estiloSubmenu('informes')} className="sidebar-submenu mx-1.5 flex flex-col rounded-b bg-[#1e1f35] py-1.5">
                  <Link to="/ganancias_perdidas" onClick={() => irA('ganancias_perdidas', '/ganancias_perdidas')} className={estiloSubItem('', '/ganancias_perdidas')}>🠖 Ganancias y Pérdidas</Link>
                  <Link to="/informes/compras-ventas" onClick={() => irA('informes_micdepos', '/informes/compras-ventas')} className={estiloSubItem('', '/informes/compras-ventas')}>🠖 Compras y Ventas</Link>
                  <Link to="/informes/iva" onClick={() => irA('informes_operativos', '/informes/iva')} className={estiloSubItem('', '/informes/iva')}>🠖 Informe Fiscal (IVA)</Link>
                  <Link to="/informes/rg-90" onClick={() => irA('informes_micdepos', '/informes/rg-90')} className={estiloSubItem('', '/informes/rg-90')}>🠖 RG 90 — Marangatu</Link>
                  <Link to="/informes/clientes-proveedores" onClick={() => irA('informes_micdepos', '/informes/clientes-proveedores')} className={estiloSubItem('', '/informes/clientes-proveedores')}>🠖 Proveedores y Clientes</Link>
                  <Link to="/informes/grupos-clientes" onClick={() => irA('informes_micdepos', '/informes/grupos-clientes')} className={estiloSubItem('', '/informes/grupos-clientes')}>🠖 Grupos de clientes</Link>
                  <Link to="/informes/stock" onClick={() => irA('informes_operativos', '/informes/stock')} className={estiloSubItem('', '/informes/stock')}>🠖 Inventario / Stock</Link>
                  <Link to="/informes/vencimientos" onClick={() => irA('informes_operativos', '/informes/vencimientos')} className={estiloSubItem('', '/informes/vencimientos')}>🠖 Vencimiento de productos</Link>
                  <Link to="/informes/ajustes" onClick={() => irA('informes_operativos', '/informes/ajustes')} className={estiloSubItem('', '/informes/ajustes')}>🠖 Ajustes de inventario</Link>
                  <Link to="/informes/productos-mas-vendidos" onClick={() => irA('informes_micdepos', '/informes/productos-mas-vendidos')} className={estiloSubItem('', '/informes/productos-mas-vendidos')}>🠖 Productos más vendidos</Link>
                  <Link to="/informes/detalle-articulo" onClick={() => irA('informes_micdepos', '/informes/detalle-articulo')} className={estiloSubItem('', '/informes/detalle-articulo')}>🠖 Detalle por artículo</Link>
                  <Link to="/compras-por-producto" onClick={() => irA('compras_por_producto', '/compras-por-producto')} className={estiloSubItem('', '/compras-por-producto')}>🠖 Compras por producto</Link>
                  <Link to="/ventas-por-producto" onClick={() => irA('ventas_por_producto', '/ventas-por-producto')} className={estiloSubItem('', '/ventas-por-producto')}>🠖 Ventas por producto</Link>
                  <Link to="/informes/pagos-compras" onClick={() => irA('informes_micdepos', '/informes/pagos-compras')} className={estiloSubItem('', '/informes/pagos-compras')}>🠖 Pagos de compra</Link>
                  <Link to="/cobro-de-ventas" onClick={() => irA('cobro_de_ventas', '/cobro-de-ventas')} className={estiloSubItem('', '/cobro-de-ventas')}>🠖 Cobros de venta</Link>
                  <Link to="/informes/gastos" onClick={() => irA('informes_operativos', '/informes/gastos')} className={estiloSubItem('', '/informes/gastos')}>🠖 Comprobantes de egresos</Link>
                  <Link to="/caja_registradora" onClick={() => irA('caja_registradora', '/caja_registradora')} className={estiloSubItem('', '/caja_registradora')}>🠖 Caja registradora</Link>
                  <Link to="/vendedores-comisiones" onClick={() => irA('vendedores_comisiones', '/vendedores-comisiones')} className={estiloSubItem('', '/vendedores-comisiones')}>🠖 Vendedores / Comisiones</Link>
                  <Link to="/ventas-por-personal" onClick={() => irA('ventas_por_personal', '/ventas-por-personal')} className={estiloSubItem('', '/ventas-por-personal')}>🠖 Ventas por personal</Link>
                  <Link to="/informes/actividad" onClick={() => irA('informes_micdepos', '/informes/actividad')} className={estiloSubItem('', '/informes/actividad')}>🠖 Historial de actividades</Link>
                </div>}
              </>
            )}
            {tieneCategoria('ventas_pos') && !soloPOS && (
              <Link to="/pedidos" onClick={() => irA('pedidos', '/pedidos')} className={estiloBotonSimple('pedidos')} title="Pedidos">
                <ClipboardList size={18} strokeWidth={2} /> {!sidebarColapsado && 'Pedidos'}
              </Link>
            )}

            <Link to="/plantillas-notificacion" onClick={() => irA('plantillas_notificacion', '/plantillas-notificacion')} className={estiloBotonSimple('plantillas_notificacion')} title="Plantillas de notificación">
              <Mail size={18} strokeWidth={2} /> {!sidebarColapsado && 'Plantillas de notificación'}
            </Link>
            {/* MENÚ: CONFIGURACIONES */}
            <>
              <button onClick={() => toggleMenu('configuraciones')} className={estiloBotonDesplegable('configuraciones')} title="Configuraciones">
                <div className="flex items-center gap-3"><Settings size={18} strokeWidth={2} /> {!sidebarColapsado && t('settings')}</div>
                {!sidebarColapsado && (
                  <span className="ml-auto inline-flex shrink-0 items-center text-slate-500 group-hover:text-[#ff4d00]"><ChevronLeft size={14} strokeWidth={2} /></span>
                )}
              </button>
              {menuRenderizado === 'configuraciones' && !sidebarColapsado && (
                <div aria-hidden={menuExpandido !== 'configuraciones'} inert={menuExpandido !== 'configuraciones'} style={estiloSubmenu('configuraciones')} className="sidebar-submenu mx-1.5 flex flex-col rounded-b bg-[#1e1f35] py-1.5">
                  <Link to="/config_empresa" onClick={() => irA('config_empresa', '/config_empresa')} className={estiloSubItem('config_empresa')}>🠖 {t('companySettings')}</Link>
                    <Link to="/ubicaciones_comerciales" onClick={() => irA('ubicaciones_comerciales', '/ubicaciones_comerciales')} className={estiloSubItem('ubicaciones_comerciales')}>🠖 {t('commercialLocations')}</Link>
                    <Link to="/invoice-schemes" onClick={() => irA('config_modulos', '/invoice-schemes')} className={estiloSubItem('config_modulos', '/invoice-schemes')}>🠖 Configuración de factura</Link>
                    <Link to="/barcodes" onClick={() => irA('config_modulos', '/barcodes')} className={estiloSubItem('config_modulos', '/barcodes')}>🠖 Configuraciones de código de barras</Link>
                    <Link to="/printers" onClick={() => irA('config_modulos', '/printers')} className={estiloSubItem('config_modulos', '/printers')}>🠖 Impresoras de tickets</Link>
                    <Link to="/scales" onClick={() => irA('config_modulos', '/scales')} className={estiloSubItem('config_modulos', '/scales')}>🠖 Balanzas de red</Link>
                    <Link to="/tax-rates" onClick={() => irA('config_modulos', '/tax-rates')} className={estiloSubItem('config_modulos', '/tax-rates')}>🠖 Tasas de impuestos</Link>
                    <Link to="/types-of-service" onClick={() => irA('config_modulos', '/types-of-service')} className={estiloSubItem('config_modulos', '/types-of-service')}>🠖 Tipos de servicio</Link>
                    <Link to="/subscription" onClick={() => irA('config_modulos', '/subscription')} className={estiloSubItem('config_modulos', '/subscription')}>🠖 Suscripción</Link>
                    <Link to="/config_factura" onClick={() => irA('config_factura', '/config_factura')} className={estiloSubItem('config_factura')}>🠖 Facturación electrónica SIFEN</Link>
                </div>
              )}
            </>

            {tieneCategoria('productos') && <Link to="/catalogo-qr" onClick={() => irA('catalogo_qr', '/catalogo-qr')} className={estiloBotonSimple('catalogo_qr')} title="Catálogo QR">
              <div className="flex items-center gap-3"><QrCode size={18} strokeWidth={2} /> {!sidebarColapsado && 'Catálogo QR'}</div>
            </Link>}

            {esDesarrollador && (
              <Link to="/admin-desarrollador" onClick={() => irA('admin_desarrollador', '/admin-desarrollador')} className={estiloBotonSimple('admin_desarrollador')} title="Panel de desarrollador">
                <ShieldCheck size={18} strokeWidth={2} /> {!sidebarColapsado && 'Panel desarrollador'}
              </Link>
            )}
          </nav>

        </aside>
      )}

      {/* ========================================== */}
      {/* ÁREA PRINCIPAL DERECHA (MAIN CONTENT)      */}
      {/* ========================================== */}
      <div className="flex-1 flex flex-col h-full overflow-hidden relative">

        {/* Header Superior */}
        {!posPantallaCompleta && (
          <header className="h-14 md:h-16 bg-gradient-to-r from-white via-slate-50/50 to-white shadow-[0_2px_8px_rgba(15,23,42,0.08)] flex items-center justify-between px-4 md:px-6 z-10 border-b border-slate-200/60 backdrop-blur-sm">
            <div className="flex items-center gap-3 flex-1">
              {/* BOTÓN HAMBURGUESA PARA MÓVIL */}
              <button
                onClick={() => setMenuMovilAbierto(true)}
                className="md:hidden flex items-center justify-center w-8 h-8 rounded-lg text-gray-500 hover:bg-gray-100 hover:text-[#f59e0b] transition-colors"
              >
                <Menu size={22} />
              </button>

              {/* BOTÓN PARA COLAPSAR/EXPANDIR EL MENÚ (Escritorio) */}
              <button
                onClick={() => setSidebarColapsado(!sidebarColapsado)}
                title={sidebarColapsado ? 'Expandir menú' : 'Colapsar menú'}
                className="hidden md:flex items-center justify-center w-10 h-10 rounded-xl border border-slate-200 bg-gradient-to-br from-white to-slate-50 text-slate-700 shadow-sm hover:bg-gradient-to-br hover:from-slate-50 hover:to-white hover:text-[#f59e0b] hover:shadow-[0_6px_16px_rgba(15,23,42,0.08)] transition-all duration-300"
                aria-label={sidebarColapsado ? 'Expandir menú' : 'Colapsar menú'}
              >
                <span className="relative flex flex-col items-center justify-center w-5 h-4">
                  <span className={`block h-0.5 w-5 rounded-full bg-current transition-all duration-300 ${sidebarColapsado ? 'translate-y-1.5 rotate-45' : 'translate-y-0 rotate-0'}`} />
                  <span className={`block h-0.5 w-5 rounded-full bg-current transition-all duration-300 my-0.5 ${sidebarColapsado ? 'opacity-0 scale-x-0' : 'opacity-100 scale-x-100'}`} />
                  <span className={`block h-0.5 w-5 rounded-full bg-current transition-all duration-300 ${sidebarColapsado ? '-translate-y-1.5 -rotate-45' : 'translate-y-0 rotate-0'}`} />
                </span>
              </button>
            </div>

            {/* TÍTULO CENTRADO */}
            <h2 className="text-gray-800 font-black text-base md:text-lg text-center flex-1 hidden md:block">
                {tituloModulo}
              </h2>
            <div className="flex-1"></div>
            <div className="hidden md:flex items-center gap-2 lg:gap-3">
                <LanguageSelector compact />
              <div className="relative">
                <button type="button" onClick={() => { setMenuAlertasAbierto((abierto) => !abierto); setMenuAccionesAbierto(false); setMenuCuentaAbierto(false); }} className="relative flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 shadow-sm transition hover:border-orange-200 hover:text-orange-600" aria-label={`Alertas de inventario: ${alertasInventario.length}`} aria-expanded={menuAlertasAbierto} aria-haspopup="menu">
                  <Bell size={18} />
                  {alertasInventario.length > 0 && <span className="absolute -right-1 -top-1 min-w-4 rounded-full bg-red-600 px-1 text-center text-[10px] font-bold leading-4 text-white shadow">{alertasInventario.length > 99 ? '99+' : alertasInventario.length}</span>}
                </button>
                {menuAlertasAbierto && <div className="absolute right-0 top-12 z-50 w-[min(92vw,390px)] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl" role="menu" aria-label="Alertas de inventario">
                  <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3"><div><p className="text-sm font-bold text-slate-800">Alertas de inventario</p><p className="text-xs text-slate-500">{alertasInventario.length} aviso{alertasInventario.length === 1 ? '' : 's'} activo{alertasInventario.length === 1 ? '' : 's'}</p></div><Bell size={17} className="text-orange-500" /></div>
                  <div className="max-h-[min(60vh,440px)] overflow-y-auto">
                    {cargandoAlertasInventario && <p className="p-5 text-center text-sm text-slate-500">Consultando stock y vencimientos…</p>}
                    {!cargandoAlertasInventario && errorAlertasInventario && <p className="p-5 text-sm text-red-700">No se pudieron consultar las alertas. Revisá la conexión y volvé a abrir la campana.</p>}
                    {!cargandoAlertasInventario && !errorAlertasInventario && alertasInventario.length === 0 && <div className="p-6 text-center"><span className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">✓</span><p className="text-sm font-semibold text-slate-700">Todo en orden</p><p className="mt-1 text-xs text-slate-500">No hay productos con stock bajo ni próximos a vencer.</p></div>}
                    {!cargandoAlertasInventario && !errorAlertasInventario && alertasInventario.slice(0, 20).map((alerta) => {
                      const esStock = alerta.tipo === 'stock';
                      const titulo = esStock ? (alerta.stock <= 0 ? 'Sin stock' : 'Stock bajo') : (alerta.dias < 0 ? 'Producto vencido' : 'Próximo a vencer');
                      const detalle = esStock
                        ? `Disponible: ${alerta.stock.toLocaleString('es-PY')} · mínimo: ${alerta.umbral.toLocaleString('es-PY')}`
                        : `${alerta.dias < 0 ? `Venció hace ${Math.abs(alerta.dias)} día(s)` : `Vence en ${alerta.dias} día(s)`} · ${new Date(`${alerta.fecha}T00:00:00`).toLocaleDateString('es-PY')}`;
                      return <button key={alerta.id} type="button" role="menuitem" onClick={() => { setMenuAlertasAbierto(false); irA(esStock ? 'catalogo' : 'informes_operativos', esStock ? '/catalogo' : '/informes/vencimientos'); }} className="flex w-full items-start gap-3 border-b border-slate-100 px-4 py-3 text-left transition hover:bg-slate-50">
                        <span className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${alerta.nivel === 'critico' ? 'bg-red-50 text-red-600' : 'bg-amber-50 text-amber-600'}`}>{esStock ? <PackageX size={16} /> : <CalendarClock size={16} />}</span>
                        <span className="min-w-0 flex-1"><span className="flex items-center justify-between gap-2"><span className="text-xs font-bold uppercase tracking-wide text-slate-500">{titulo}</span><span className="text-[10px] text-slate-400">{alerta.codigo || ''}</span></span><span className="mt-0.5 block truncate text-sm font-semibold text-slate-800">{alerta.nombre}</span><span className="mt-0.5 block text-xs text-slate-500">{detalle}</span></span>
                      </button>;
                    })}
                    {alertasInventario.length > 20 && !cargandoAlertasInventario && <p className="px-4 py-2 text-center text-xs text-slate-500">Se muestran 20 de {alertasInventario.length} avisos.</p>}
                  </div>
                  <div className="flex gap-2 border-t border-slate-100 bg-slate-50 px-3 py-2"><button type="button" onClick={() => { setMenuAlertasAbierto(false); irA('catalogo', '/catalogo'); }} className="flex-1 rounded-lg px-3 py-2 text-xs font-bold text-slate-600 hover:bg-white">Ver catálogo</button><button type="button" onClick={() => { setMenuAlertasAbierto(false); irA('informes_operativos', '/informes/vencimientos'); }} className="flex-1 rounded-lg bg-orange-500 px-3 py-2 text-xs font-bold text-white hover:bg-orange-600">Ver vencimientos</button></div>
                </div>}
              </div>
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setMenuAccionesAbierto((abierto) => !abierto)}
                  className="flex items-center justify-center w-9 h-9 rounded-xl border border-slate-200 bg-white text-slate-700 shadow-sm hover:border-orange-200 hover:text-orange-500 transition-all duration-200"
                  aria-label="Acciones rápidas"
                  aria-expanded={menuAccionesAbierto}
                  aria-haspopup="menu"
                >
                  <span className="text-xl leading-none">＋</span>
                </button>
                {menuAccionesAbierto && (
                  <div className="absolute left-0 top-12 z-50 w-48 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl" role="menu">
                    <button type="button" onClick={() => { setMenuAccionesAbierto(false); abrirAccionInicio('calendario'); }} className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm text-slate-700 hover:bg-slate-50" role="menuitem">
                      <CalendarDays size={16} className="text-slate-500" />
                      Calendario
                    </button>
                    <button type="button" onClick={() => { setMenuAccionesAbierto(false); abrirAccionInicio('tarea'); }} className="flex w-full items-center gap-3 border-t border-slate-100 px-4 py-3 text-left text-sm text-slate-700 hover:bg-slate-50" role="menuitem">
                      <ClipboardList size={16} className="text-orange-500" />
                      Agregar a hacer
                    </button>
                    <button type="button" onClick={() => { setMenuAccionesAbierto(false); abrirAccionInicio('solicitudes'); }} className="flex w-full items-center gap-3 border-t border-slate-100 px-4 py-3 text-left text-sm text-slate-700 hover:bg-slate-50" role="menuitem">
                      <CircleHelp size={16} className="text-sky-500" />
                      Recorrido de solicitud
                    </button>
                  </div>
                )}
              </div>
              <button className="flex items-center justify-center w-9 h-9 rounded-xl border border-slate-200 bg-white text-slate-700 shadow-sm hover:border-orange-200 hover:text-orange-500 transition-all duration-200">
                <ClipboardList size={17} />
              </button>
              <button
                onClick={() => irA('pos', '/pos')}
                className="flex items-center gap-2 bg-gradient-to-r from-[#f59e0b] to-[#f97316] text-white px-4 py-2.5 rounded-xl font-bold shadow-[0_10px_20px_rgba(245,158,11,0.28)] hover:shadow-[0_12px_22px_rgba(245,158,11,0.35)] transition-all duration-200"
              >
                <ShoppingCart size={17} />
                <span className="text-sm">Punto de venta</span>
              </button>
              <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm">
                <Clock3 size={16} className="text-slate-500" />
                <span>{fechaHeaderEmpresa}</span>
              </div>
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setMenuCuentaAbierto((abierto) => !abierto)}
                  className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-700 shadow-sm hover:border-orange-200 hover:text-orange-500 transition-all duration-200"
                  aria-expanded={menuCuentaAbierto}
                  aria-haspopup="menu"
                >
                  <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-gradient-to-br from-[#f59e0b] to-[#f97316] text-white text-[10px] font-black shadow-[0_6px_12px_rgba(245,158,11,0.25)]">
                    {(perfilUsuario?.empresas?.nombre || 'N').charAt(0).toUpperCase()}
                  </span>
                  <span>{perfilUsuario?.empresas?.nombre || 'Mi Negocio'}</span>
                  <span className="text-xs text-slate-400">{menuCuentaAbierto ? '▲' : '▼'}</span>
                </button>
                {menuCuentaAbierto && (
                  <div className="absolute right-0 top-12 z-50 w-72 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl" role="menu">
                    <div className="border-b border-slate-100 px-4 py-3">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Mi cuenta</p>
                      <p className="mt-1 text-sm font-bold text-slate-800">{perfilUsuario?.empresas?.nombre || 'Mi Negocio'}</p>
                      <p className="mt-1 truncate text-xs text-slate-500">{perfilUsuario?.email || session?.user?.email || ''}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setMenuCuentaAbierto(false)}
                      className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm text-slate-700 hover:bg-slate-50"
                      role="menuitem"
                    >
                      <Users size={16} className="text-slate-500" />
                      Perfil
                    </button>
                    <button
                      type="button"
                      onClick={() => { setMenuCuentaAbierto(false); irA('config_empresa', '/configuracion'); }}
                      className="flex w-full items-center gap-3 border-t border-slate-100 px-4 py-3 text-left text-sm text-slate-700 hover:bg-slate-50"
                      role="menuitem"
                    >
                      <Settings size={16} className="text-slate-500" />
                      Configuraciones
                    </button>
                    <button
                      type="button"
                      onClick={cerrarSesion}
                      className="flex w-full items-center gap-3 border-t border-slate-100 px-4 py-3 text-left text-sm text-red-600 hover:bg-red-50"
                      role="menuitem"
                    >
                      <LogOut size={16} />
                      Desconectar
                    </button>
                  </div>
                )}
              </div>
            </div>
          </header>
        )}

        {/* Inyección de los Módulos Activos */}
        <main className={`flex-1 overflow-y-auto bg-[#f3f4f6] pb-16 md:pb-0 ${posPantallaCompleta ? '' : 'p-3 md:p-6'}`}>
          <div key={`${vistaActiva}-${refreshKey}`}>
            <Suspense fallback={<div className="p-10 text-center text-gray-500">{t('loading')}</div>}>
              {renderizarVista()}
            </Suspense>
          </div>
        </main>

        {/* BARRA DE NAVEGACIÓN INFERIOR PARA MÓVIL */}
        {!posPantallaCompleta && (
          <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-300 h-16 flex items-center justify-around px-1 z-40">
            {/* VENDER */}
            <button
              onClick={() => irA('pos', '/pos')}
              className={`flex flex-col items-center justify-center gap-0.5 flex-1 py-2 px-2 rounded-2xl transition-all ${
                vistaActiva === 'pos'
                  ? 'bg-[#ffebe5] text-orange-600'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
              title="Vender"
            >
              <ShoppingCart size={22} />
              <span className="text-[10px] font-bold">Vender</span>
            </button>

            {/* PRODUCTOS */}
            <button
              onClick={() => irA('catalogo', '/catalogo')}
              className={`flex flex-col items-center justify-center gap-0.5 flex-1 py-2 px-2 rounded-2xl transition-all ${
                vistaActiva === 'catalogo'
                  ? 'bg-[#ffebe5] text-orange-600'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
              title="Productos"
            >
              <Package size={22} />
              <span className="text-[10px] font-bold">Productos</span>
            </button>

            {/* CAJA */}
            <button
              onClick={() => irA('cajas', '/cajas')}
              className={`flex flex-col items-center justify-center gap-0.5 flex-1 py-2 px-2 rounded-2xl transition-all ${
                vistaActiva === 'cajas'
                  ? 'bg-[#ffebe5] text-orange-600'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
              title="Caja"
            >
              <DollarSign size={22} />
              <span className="text-[10px] font-bold">Caja</span>
            </button>

            {/* CLIENTES */}
            <button
              onClick={() => irA('clientes', '/clientes')}
              className={`flex flex-col items-center justify-center gap-0.5 flex-1 py-2 px-2 rounded-2xl transition-all ${
                vistaActiva === 'clientes'
                  ? 'bg-[#ffebe5] text-orange-600'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
              title="Clientes"
            >
              <Users size={22} />
              <span className="text-[10px] font-bold">Clientes</span>
            </button>

            {/* REPORTES */}
            <button
              onClick={() => irA('ganancias_perdidas', '/ganancias_perdidas')}
              className={`flex flex-col items-center justify-center gap-0.5 flex-1 py-2 px-2 rounded-2xl transition-all ${
                vistaActiva === 'ganancias_perdidas'
                  ? 'bg-[#ffebe5] text-orange-600'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
              title="Reportes"
            >
              <BarChart3 size={22} />
              <span className="text-[10px] font-bold">Reportes</span>
            </button>
          </nav>
        )}

        {!posPantallaCompleta && <button type="button" onClick={() => setGuiaVisible(true)} className="fixed bottom-[4.75rem] right-4 z-40 inline-flex items-center gap-2 rounded-full bg-slate-900 px-4 py-3 text-sm font-bold text-white shadow-xl transition hover:bg-slate-700 md:bottom-5" aria-label="Abrir guía de inicio">
          <BookOpen size={17} /> <span>Guía</span>
        </button>}

        <GuiaInicial
          empresaId={empresaInfo.id}
          usuarioId={perfilUsuario?.auth_user_id || session?.user?.id}
          empresaNombre={empresaInfo.nombre || perfilUsuario?.empresas?.nombre}
          moneda={ajustesEmpresa.currency || 'PYG'}
          cajaAbierta={Boolean(cajaActual)}
          soloPOS={soloPOS}
          puedeAbrirVista={puedeVerVista}
          onNavegar={(vista, ruta) => irA(vista, ruta)}
          visible={guiaVisible}
          onCerrar={() => setGuiaVisible(false)}
          onAbrir={() => setGuiaVisible(true)}
        />

      </div>
    </div>
  );
}
