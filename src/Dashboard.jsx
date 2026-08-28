import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { supabase } from './supabaseClient';
import {
  LayoutDashboard, Users, Contact, Package, Factory, Wrench,
  ArrowDownToLine, ArrowUpFromLine, BarChart3, ShoppingCart, LogOut, Settings,
  MapPin, FileText, Barcode, Printer, Percent, ClipboardList, CreditCard,
  Menu, X, Bell, DollarSign, RotateCw, BookOpen, Truck, ShoppingBag, Clock3, Building2
} from 'lucide-react';
import ConfiguracionEmpresa from './ConfiguracionEmpresa';
import ConfiguracionFacturaElectronica from './ConfiguracionFacturaElectronica';
import OT from './OT';
import UbicacionesComerciales from './UbicacionesComerciales';
import ListaVentas from './ListaVentas';
import { LanguageSelector, useLanguage } from './LanguageContext';

// 1. IMPORTACIÓN DE TODOS LOS MÓDULOS DEL ERP
import Inicio from './Inicio';
import GraficosDashboard from './GraficosDashboard';
import PuntoDeVenta from './PuntoDeVenta';
import ListaProductos from './ListaProductos';
import Catalogo from './Catalogo';
import AgregarProducto from './AgregarProducto';
import Marcas from './Marcas';
import Categorias from './Categorias';
import Unidades from './Unidades';
import GestorCompras from './GestorCompras';
import CuentasPorCobrar from './CuentasPorCobrar';
import Clientes from './Clientes';
import AbrirCaja from './AbrirCaja';
import AgregarCompra from './AgregarCompra';
import Proveedores from './Proveedores';
import NuevoGasto from './NuevoGasto';
import ReporteCierreCaja from './ReporteCierreCaja';
import CajaRegistradora from './CajaRegistradora';
import GananciasPerdidas from './GananciasPerdidas';
import Usuarios from './Usuarios';
import Roles from './Roles';
import ListaCajas from './Listacajas';
import InformeCajaPago from './InformeCajaPago';
import VentasPorProducto from './VentasPorProducto';
import CobroDeVentas from './CobroDeVentas';
import GruposClientes from './GruposClientes';
import Gastos from './Gastos';
import CategoriasGastos from './CategoriasGastos';
import VendedoresComisiones from './VendedoresComisiones';
import { useUbicacionUsuario } from './utils/useUbicacion';

export default function Dashboard({ session, perfilUsuario, initialView = 'inicio' }) {
  const { t, locale } = useLanguage();
  // === CONTROL DE ACCESO POR ROL (va primero, vistaActiva lo necesita) ===
  const { id: ubicacionUsuarioId, ve_todas: usuarioVeTodas } = useUbicacionUsuario();
  const nombreRol = (perfilUsuario?.roles?.nombre || '').toLowerCase();
  const esAdmin = nombreRol.includes('admin');
  const permisosRol = perfilUsuario?.roles?.permisos || null;

  const tieneCategoria = (categoriaKey) => {
    if (esAdmin || !permisosRol) return true;
    const categoria = permisosRol[categoriaKey];
    if (!categoria) return false;
    return Object.values(categoria).some(Boolean);
  };

  const puedeVerVista = (vista) => {
    if (esAdmin || !permisosRol) return true;
    const categoriaPorVista = {
      ot: 'ot', config_empresa: 'configuraciones', config_factura: 'configuraciones',
      ubicaciones_comerciales: 'ubicaciones', clientes: 'clientes_proveedores',
      proveedores: 'clientes_proveedores', grupos_clientes: 'clientes_proveedores',
      catalogo: 'productos', agregar_producto: 'productos', marcas: 'productos',
      categorias: 'productos', unidades: 'productos', compras: 'compras',
      agregar_compra: 'compras', devoluciones_compra: 'compras', gastos: 'gastos',
      agregar_gasto: 'gastos', categorias_gastos: 'gastos', todas_ventas: 'ventas_pos',
      pos: 'ventas_pos', cobros: 'ventas_pos', cajas: 'caja', informe_caja_pago: 'caja',
      caja_registradora: 'informes', ganancias_perdidas: 'informes',
      ventas_por_producto: 'informes', cobro_de_ventas: 'informes', vendedores_comisiones: 'informes', usuarios: 'usuarios', roles: 'roles',
    };
    const categoria = categoriaPorVista[vista];
    return !categoria || tieneCategoria(categoria);
  };

  // Rol "cajero exclusivo": solo puede ver Abrir Caja y el Punto de Venta
  const soloPOS = !esAdmin && !!permisosRol?.ventas_pos?.['Solo Punto de Venta (bloquea todo lo demás)'];

  // Estados de navegación y control de caja
  const location = useLocation();
  const navigate = useNavigate();
  const [vistaActiva, setVistaActiva] = useState(soloPOS ? 'pos' : initialView);
  const [menuExpandido, setMenuExpandido] = useState('ventas');
  const [cajaActual, setCajaActual] = useState(null);
  const [cargandoCaja, setCargandoCaja] = useState(true);
  const [reporteCierre, setReporteCierre] = useState(null);
  const [refreshInicio, setRefreshInicio] = useState(0);
  const [refreshKey, setRefreshKey] = useState(0);

  // Navega a cualquier vista y fuerza que se recargue de cero, incluso si ya estabas ahí
  const irA = (vista, pathname) => {
    setVistaActiva(vista);
    setRefreshKey((k) => k + 1);
    setMenuMovilAbierto(false); // Cierra el menú móvil al navegar
    if (pathname) navigate(pathname, { replace: true });
  };
  const [sidebarColapsado, setSidebarColapsado] = useState(false);
  const [menuMovilAbierto, setMenuMovilAbierto] = useState(false);
  const [fechaHora, setFechaHora] = useState(new Date());
  const [notificacionesSistema, setNotificacionesSistema] = useState([]);
  const [mostrarNotificaciones, setMostrarNotificaciones] = useState(false);

  useEffect(() => {
    const intervalo = setInterval(() => setFechaHora(new Date()), 30000);
    return () => clearInterval(intervalo);
  }, []);

  const cargarNotificacionesSistema = async () => {
    const empresaId = perfilUsuario?.empresas?.id || perfilUsuario?.empresa_id;
    if (!empresaId) return;

    const [comprasResult, cajasResult, productosResult] = await Promise.all([
      supabase.from('compras').select('id, proveedor_nombre, saldo_pendiente').eq('empresa_id', empresaId).gt('saldo_pendiente', 0).limit(5),
      supabase.from('caja_registros').select('id, usuario, fecha_apertura').eq('empresa_id', empresaId).eq('estado', 'Abierta').limit(5),
      supabase.from('productos').select('id, nombre, stock_actual, alerta_stock_bajo').eq('empresa_id', empresaId).limit(100),
    ]);

    const avisos = [];
    (comprasResult.data || []).forEach((compra) => avisos.push({
      id: `compra-${compra.id}`, tipo: 'warning', titulo: t('purchasePending'),
      texto: `${compra.proveedor_nombre || 'Proveedor'} · ${Number(compra.saldo_pendiente || 0).toLocaleString('es-PY')} Gs`,
    }));
    (cajasResult.data || []).forEach((caja) => avisos.push({
      id: `caja-${caja.id}`, tipo: 'info', titulo: t('openRegister'),
      texto: caja.usuario ? `${t('openedBy')} ${caja.usuario}` : t('registerOpen'),
    }));
    (productosResult.data || []).filter((producto) => Number(producto.stock_actual || 0) <= Number(producto.alerta_stock_bajo ?? 5)).slice(0, 5).forEach((producto) => avisos.push({
      id: `stock-${producto.id}`, tipo: 'danger', titulo: t('lowStock'),
      texto: `${producto.nombre} · ${Number(producto.stock_actual || 0)} ${t('unitsLabel')}`,
    }));
    setNotificacionesSistema(avisos.slice(0, 12));
  };

  useEffect(() => {
    cargarNotificacionesSistema();
    const intervalo = setInterval(cargarNotificacionesSistema, 60000);
    return () => clearInterval(intervalo);
  }, [perfilUsuario?.empresas?.id, perfilUsuario?.empresa_id]);

  const cerrarSesion = async () => {
    await supabase.auth.signOut();
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
        const cajaDelUsuario = (data || []).find((caja) => !caja.usuario || caja.usuario === nombreUsuario);
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
    if (menuExpandido === menu) setMenuExpandido(null);
    else setMenuExpandido(menu);
  };

  useEffect(() => {
    const path = location.pathname.toLowerCase();
    if (soloPOS) {
      setVistaActiva('pos');
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
        break;
      case '/cobro-de-ventas':
      case '/cobro_de_ventas':
        setVistaActiva('cobro_de_ventas');
        break;
      case '/ganancias_perdidas':
      case '/ganancias-perdidas':
        setVistaActiva('ganancias_perdidas');
        break;
      case '/vendedores-comisiones':
      case '/vendedores_comisiones':
        setVistaActiva('vendedores_comisiones');
        break;
      default:
        setVistaActiva(initialView);
        break;
    }
  }, [location.pathname, initialView, soloPOS]);

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
        return <Inicio key={refreshInicio} perfilUsuario={perfilUsuario} />;

      case 'ot':
        return <OT key={refreshKey} perfilUsuario={perfilUsuario} />;

      case 'config_empresa':
        return <ConfiguracionEmpresa perfilUsuario={perfilUsuario} />;

      case 'config_factura':
        return <ConfiguracionFacturaElectronica />;

      case 'ubicaciones_comerciales':
        return <UbicacionesComerciales />;

      case 'todas_ventas':
        return <ListaVentas />;

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

      case 'devoluciones_compra':
        return <GestorCompras />;

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

      case 'cobro_de_ventas':
        return <CobroDeVentas perfilUsuario={perfilUsuario} />;

      case 'vendedores_comisiones':
        return <VendedoresComisiones />;

      default:
        return <GraficosDashboard />;
    }
  };

  // Estilos de los botones del Sidebar
  const estiloBotonSimple = (vista) => `
    w-full text-left px-6 py-2.5 text-sm font-medium transition-colors flex items-center gap-3
    ${sidebarColapsado ? 'justify-center px-0' : ''}
    ${vistaActiva === vista ? 'bg-[#2b2b3f] text-white border-l-4 border-orange-500' : 'text-white hover:bg-[#252536] hover:text-orange-500'}
  `;

  const estiloBotonDesplegable = (menuName) => `
    w-full text-left px-6 py-2.5 text-sm font-medium transition-colors flex justify-between items-center
    ${sidebarColapsado ? 'justify-center px-0' : ''}
    ${menuExpandido === menuName ? 'bg-[#2b2b3f] text-white border-l-4 border-orange-500' : 'text-white hover:bg-[#252536] hover:text-orange-500'}
  `;

  const estiloSubItem = (vista) => `
    w-full text-left pl-12 pr-4 py-2 text-xs transition-colors flex items-center gap-2
    ${vistaActiva === vista ? 'text-white font-bold bg-[#252536]' : 'text-white hover:text-orange-500 hover:bg-[#252536]'}
  `;

  return (
    <div className="flex h-screen bg-[#f3f4f6] font-sans flex-col md:flex-row overflow-hidden">

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
                onClick={() => irA(etiqueta === 'Vender' ? 'pos' : etiqueta === 'Productos' ? 'catalogo' : etiqueta === 'Clientes' ? 'clientes' : etiqueta === 'Caja' ? 'caja_registradora' : etiqueta === 'Caja / Banco' ? 'cajas' : etiqueta === 'Gastos' ? 'gastos' : etiqueta === 'Compras' ? 'compras' : etiqueta === 'Reportes' ? 'ganancias_perdidas' : etiqueta === 'Informe de cajas' ? 'informe_caja_pago' : etiqueta === 'Devoluciones' ? 'devoluciones_compra' : etiqueta === 'Pedidos pendientes' ? 'cobros' : etiqueta === 'Histórico de ventas' ? 'todas_ventas' : 'inicio', ruta)}
                className="w-full min-h-[74px] px-8 flex items-center gap-6 text-left text-[21px] tracking-wide text-[#202020] hover:bg-[#fff5f0] active:bg-[#ffe9df]"
              >
                <Icono size={32} strokeWidth={2.1} className="shrink-0 text-[#161616]" />
                <span>{etiqueta}</span>
              </button>
            ))}

            <div className="border-t border-[#e5e5e5] mt-2 pt-2">
              <button type="button" onClick={() => irA('config_empresa', '/configuracion')} className="w-full min-h-[74px] px-8 flex items-center gap-6 text-left text-[21px] tracking-wide text-[#202020] hover:bg-[#fff5f0]">
                <Settings size={32} strokeWidth={2.1} className="shrink-0" />
                <span>Configuración</span>
              </button>
              <button type="button" onClick={() => irA('inicio', '/soporte')} className="w-full min-h-[74px] px-8 flex items-center gap-6 text-left text-[21px] tracking-wide text-[#202020] hover:bg-[#fff5f0]">
                <Bell size={32} strokeWidth={2.1} className="shrink-0" />
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
          ${sidebarColapsado ? 'w-[76px]' : 'w-[260px]'}
          transition-all duration-300 bg-[#1e1e2d] text-white flex flex-col h-full shadow-xl z-30
          fixed inset-y-0 left-0 transform ${menuMovilAbierto ? 'translate-x-0' : '-translate-x-full'}
          hidden md:relative md:translate-x-0 md:flex
        `}>
          {/* Logo Superior con botón de cerrar para móvil */}
          <div className="h-16 flex items-center justify-between px-4 border-b border-gray-700 bg-white overflow-hidden">
            <div className="flex-1 flex justify-center">
              <h1 className="text-2xl font-bold tracking-wider text-[#004284] whitespace-nowrap">
                {sidebarColapsado ? (
                  <span className="text-orange-500">P</span>
                ) : (
                  <>PY<span className="text-orange-500">POS</span></>
                )}
              </h1>
            </div>
            <button
              onClick={() => setMenuMovilAbierto(false)}
              className="md:hidden text-gray-500 hover:text-gray-800"
            >
              <X size={24} />
            </button>
          </div>

          {/* Lista de Navegación */}
          <nav className="flex-1 overflow-y-auto overflow-x-hidden py-2 flex flex-col bg-[#1e1e2d]">
            {!soloPOS && tieneCategoria('ot') && (
              <>
                <Link to="/" onClick={() => irA('inicio', '/')} className={estiloBotonSimple('inicio')} title={t('home')}>
                  <LayoutDashboard size={18} strokeWidth={2} /> {!sidebarColapsado && t('home')}
                </Link>

                <Link to="/ot" onClick={() => irA('ot', '/ot')} className={estiloBotonSimple('ot')} title={t('workOrders')}>
                  <Wrench size={18} strokeWidth={2} /> {!sidebarColapsado && t('workOrders')}
                </Link>
              </>
            )}

            {/* MENÚ: GESTIÓN DE USUARIOS */}
            {(tieneCategoria('usuarios') || tieneCategoria('roles')) && (
              <>
                <button onClick={() => toggleMenu('usuarios')} className={estiloBotonDesplegable('usuarios')} title={t('userManagement')}>
                  <div className="flex items-center gap-3"><Users size={18} strokeWidth={2} /> {!sidebarColapsado && t('userManagement')}</div>
                  {!sidebarColapsado && <span className="text-[10px]">{menuExpandido === 'usuarios' ? '▼' : '◀'}</span>}
                </button>
                {menuExpandido === 'usuarios' && !sidebarColapsado && (
                  <div className="bg-[#151521] py-1 flex flex-col">
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
                  {!sidebarColapsado && <span className="text-[10px]">{menuExpandido === 'contactos' ? '▼' : '◀'}</span>}
                </button>
                {menuExpandido === 'contactos' && !sidebarColapsado && (
                  <div className="bg-[#151521] py-1 flex flex-col">
                    <Link to="/proveedores" onClick={() => irA('proveedores', '/proveedores')} className={estiloSubItem('proveedores')}>🠖 {t('suppliers')}</Link>
                    <Link to="/clientes" onClick={() => irA('clientes', '/clientes')} className={estiloSubItem('clientes')}>🠖 {t('customers')}</Link>
                    <Link to="/grupos_clientes" onClick={() => irA('grupos_clientes', '/grupos_clientes')} className={estiloSubItem('grupos_clientes')}>🠖 {t('customerGroups')}</Link>
                  </div>
                )}
              </>
            )}

            {/* MENÚ: PRODUCTOS */}
            {tieneCategoria('productos') && (
              <>
                <button onClick={() => toggleMenu('productos')} className={estiloBotonDesplegable('productos')} title={t('products')}>
                  <div className="flex items-center gap-3"><Package size={18} strokeWidth={2} /> {!sidebarColapsado && t('products')}</div>
                  {!sidebarColapsado && <span className="text-[10px]">{menuExpandido === 'productos' ? '▼' : '◀'}</span>}
                </button>
                {menuExpandido === 'productos' && !sidebarColapsado && (
                  <div className="bg-[#151521] py-1 flex flex-col">
                    <Link to="/catalogo" onClick={() => irA('catalogo', '/catalogo')} className={estiloSubItem('catalogo')}>🠖 {t('productList')}</Link>
                    <Link to="/agregar_producto" onClick={() => irA('agregar_producto', '/agregar_producto')} className={estiloSubItem('agregar_producto')}>🠖 {t('addProduct')}</Link>
                    <Link to="/marcas" onClick={() => irA('marcas', '/marcas')} className={estiloSubItem('marcas')}>🠖 {t('brands')}</Link>
                    <Link to="/categorias" onClick={() => irA('categorias', '/categorias')} className={estiloSubItem('categorias')}>🠖 {t('categories')}</Link>
                    <Link to="/unidades" onClick={() => irA('unidades', '/unidades')} className={estiloSubItem('unidades')}>🠖 {t('units')}</Link>
                  </div>
                )}
              </>
            )}

            {/* MENÚ: COMPRAS (RECONECTADO) */}
            {tieneCategoria('compras') && (
              <>
                <button onClick={() => toggleMenu('compras')} className={estiloBotonDesplegable('compras')} title={t('purchases')}>
                  <div className="flex items-center gap-3"><ArrowDownToLine size={18} strokeWidth={2} /> {!sidebarColapsado && t('purchases')}</div>
                  {!sidebarColapsado && <span className="text-[10px]">{menuExpandido === 'compras' ? '▼' : '◀'}</span>}
                </button>
                {menuExpandido === 'compras' && !sidebarColapsado && (
                  <div className="bg-[#151521] py-1 flex flex-col">
                    <Link to="/compras" onClick={() => irA('compras', '/compras')} className={estiloSubItem('compras')}>🠖 {t('purchaseList')}</Link>
                    <Link to="/agregar_compra" onClick={() => irA('agregar_compra', '/agregar_compra')} className={estiloSubItem('agregar_compra')}>🠖 {t('addPurchase')}</Link>
                    <Link to="/devoluciones_compra" onClick={() => irA('devoluciones_compra', '/devoluciones_compra')} className={estiloSubItem('devoluciones_compra')}>🠖 {t('purchaseReturns')}</Link>
                  </div>
                )}
              </>
            )}

            {/* MENÚ: GASTOS */}
            {tieneCategoria('gastos') && (
              <>
                <button onClick={() => toggleMenu('gastos')} className={estiloBotonDesplegable('gastos')} title={t('expenses')}>
                  <div className="flex items-center gap-3"><ArrowDownToLine size={18} strokeWidth={2} /> {!sidebarColapsado && t('expenses')}</div>
                  {!sidebarColapsado && <span className="text-[10px]">{menuExpandido === 'gastos' ? '▼' : '◀'}</span>}
                </button>
                {menuExpandido === 'gastos' && !sidebarColapsado && (
                  <div className="bg-[#151521] py-1 flex flex-col">
                    <Link to="/gastos" onClick={() => irA('gastos', '/gastos')} className={estiloSubItem('gastos')}>🠖 {t('expenseList')}</Link>
                    <Link to="/gastos/agregar" onClick={() => irA('agregar_gasto', '/gastos/agregar')} className={estiloSubItem('agregar_gasto')}>🠖 {t('addExpense')}</Link>
                    <Link to="/gastos/categorias" onClick={() => irA('categorias_gastos', '/gastos/categorias')} className={estiloSubItem('categorias_gastos')}>🠖 {t('expenseCategories')}</Link>
                  </div>
                )}
              </>
            )}

            {/* MENÚ: VENTAS */}
            {tieneCategoria('ventas_pos') && !soloPOS && (
              <>
                <button onClick={() => toggleMenu('ventas')} className={estiloBotonDesplegable('ventas')} title={t('sales')}>
                  <div className="flex items-center gap-3"><ArrowUpFromLine size={18} strokeWidth={2} /> {!sidebarColapsado && t('sales')}</div>
                  {!sidebarColapsado && <span className="text-[10px]">{menuExpandido === 'ventas' ? '▼' : '◀'}</span>}
                </button>
                {menuExpandido === 'ventas' && !sidebarColapsado && (
                  <div className="bg-[#151521] py-1 flex flex-col">
                    <Link to="/todas_ventas" onClick={() => irA('todas_ventas', '/todas_ventas')} className={estiloSubItem('todas_ventas')}>🠖 {t('allSales')}</Link>
                    <Link to="/pos" onClick={() => irA('pos', '/pos')} className={estiloSubItem('pos')}>🠖 {t('pos')}</Link>
                    <Link to="/cobros" onClick={() => irA('cobros', '/cobros')} className={estiloSubItem('cobros')}>🠖 {t('pendingOrders')}</Link>
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

            {/* MENÚ: CAJA / BANCO */}
            {tieneCategoria('caja') && (
              <>
                <button onClick={() => toggleMenu('caja_banco')} className={estiloBotonDesplegable('caja_banco')} title="Caja / Banco">
                  <div className="flex items-center gap-3"><CreditCard size={18} strokeWidth={2} /> {!sidebarColapsado && t('cashBank')}</div>
                  {!sidebarColapsado && <span className="text-[10px]">{menuExpandido === 'caja_banco' ? '▼' : '◀'}</span>}
                </button>
                {menuExpandido === 'caja_banco' && !sidebarColapsado && (
                  <div className="bg-[#151521] py-1 flex flex-col">
                    <Link to="/cajas" onClick={() => irA('cajas', '/cajas')} className={estiloSubItem('cajas')}>🠖 {t('cashRegisters')}</Link>
                    <Link to="/informe-caja-pago" onClick={() => irA('informe_caja_pago', '/informe-caja-pago')} className={estiloSubItem('informe_caja_pago')}>🠖 {t('paymentReport')}</Link>
                  </div>
                )}
              </>
            )}

            {/* MENÚ: INFORMES */}
            {tieneCategoria('informes') && (
              <>
                <button onClick={() => toggleMenu('informes')} className={estiloBotonDesplegable('informes')} title="Informes">
                  <div className="flex items-center gap-3"><BarChart3 size={18} strokeWidth={2} /> {!sidebarColapsado && t('reports')}</div>
                  {!sidebarColapsado && <span className="text-[10px]">{menuExpandido === 'informes' ? '▼' : '◀'}</span>}
                </button>
                {menuExpandido === 'informes' && !sidebarColapsado && (
                  <div className="bg-[#151521] py-1 flex flex-col">
                    <Link to="/ganancias_perdidas" onClick={() => irA('ganancias_perdidas', '/ganancias_perdidas')} className={estiloSubItem('ganancias_perdidas')}>🠖 {t('profitLoss')}</Link>
                    <Link to="/ventas-por-producto" onClick={() => irA('ventas_por_producto', '/ventas-por-producto')} className={estiloSubItem('ventas_por_producto')}>🠖 {t('salesByProduct')}</Link>
                    <Link to="/cobro-de-ventas" onClick={() => irA('cobro_de_ventas', '/cobro-de-ventas')} className={estiloSubItem('cobro_de_ventas')}>🠖 {t('salesCollections')}</Link>
                    <Link to="/caja_registradora" onClick={() => irA('caja_registradora', '/caja_registradora')} className={estiloSubItem('caja_registradora')}>🠖 {t('cashRegister')}</Link>
                    <Link to="/vendedores-comisiones" onClick={() => irA('vendedores_comisiones', '/vendedores-comisiones')} className={estiloSubItem('vendedores_comisiones')}>🠖 {t('sellersCommissions')}</Link>
                  </div>
                )}
              </>
            )}

            {/* MENÚ: CONFIGURACIONES */}
            {esAdmin && (
              <>
                <button onClick={() => toggleMenu('configuraciones')} className={estiloBotonDesplegable('configuraciones')} title="Configuraciones">
                  <div className="flex items-center gap-3"><Settings size={18} strokeWidth={2} /> {!sidebarColapsado && t('settings')}</div>
                  {!sidebarColapsado && <span className="text-[10px]">{menuExpandido === 'configuraciones' ? '▼' : '◀'}</span>}
                </button>
                {menuExpandido === 'configuraciones' && !sidebarColapsado && (
                  <div className="bg-[#151521] py-1 flex flex-col">
                    <Link to="/config_empresa" onClick={() => irA('config_empresa', '/config_empresa')} className={estiloSubItem('config_empresa')}>🠖 {t('companySettings')}</Link>
                    <Link to="/ubicaciones_comerciales" onClick={() => irA('ubicaciones_comerciales', '/ubicaciones_comerciales')} className={estiloSubItem('ubicaciones_comerciales')}>🠖 {t('commercialLocations')}</Link>
                    <Link to="/config_factura" onClick={() => irA('config_factura', '/config_factura')} className={estiloSubItem('config_factura')}>🠖 {t('invoiceSettings')}</Link>
                  </div>
                )}
              </>
            )}
          </nav>

          {/* Footer del Sidebar */}
          <div className="p-4 border-t border-gray-700 bg-[#1e1e2d] flex flex-col gap-2">
            <button
              onClick={cerrarSesion}
              title={t('logout')}
              className="w-full bg-red-600 hover:bg-red-700 text-white py-1.5 rounded text-sm font-bold transition flex items-center justify-center gap-2"
            >
              <LogOut size={16} strokeWidth={2} /> {!sidebarColapsado && t('logout')}
            </button>
          </div>
        </aside>
      )}

      {/* ========================================== */}
      {/* ÁREA PRINCIPAL DERECHA (MAIN CONTENT)      */}
      {/* ========================================== */}
      <div className="flex-1 flex flex-col h-full overflow-hidden relative">

        {/* Header Superior */}
        {!posPantallaCompleta && (
          <header className="h-14 md:h-16 bg-white shadow-sm flex items-center justify-between px-4 md:px-6 z-10 border-b border-gray-200">
            <div className="flex items-center gap-3 flex-1">
              {/* BOTÓN HAMBURGUESA PARA MÓVIL */}
              <button
                onClick={() => setMenuMovilAbierto(true)}
                className="md:hidden flex items-center justify-center w-8 h-8 rounded-lg text-gray-500 hover:bg-gray-100 transition-colors"
              >
                <Menu size={22} />
              </button>

              {/* BOTÓN PARA COLAPSAR/EXPANDIR EL MENÚ (Escritorio) */}
              <button
                onClick={() => setSidebarColapsado(!sidebarColapsado)}
                title={sidebarColapsado ? 'Expandir menú' : 'Colapsar menú'}
                className="hidden md:flex items-center justify-center w-9 h-9 rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-800 transition-colors"
              >
                {sidebarColapsado ? '☰' : '◀'}
              </button>
            </div>

            {/* TÍTULO CENTRADO */}
            <h2 className="text-gray-800 font-black text-base md:text-lg text-center flex-1 hidden md:block">
                {vistaActiva === 'inicio' && t('home')}
                {vistaActiva === 'pos' && t('pos')}
                {vistaActiva === 'reporte_cierre' && 'Cierre'}
                {vistaActiva === 'nuevo_gasto' && 'Gasto'}
                {vistaActiva === 'compras' && t('purchases')}
                {vistaActiva === 'agregar_compra' && t('addPurchase')}
                {vistaActiva === 'gastos' && t('expenses')}
                {vistaActiva === 'agregar_gasto' && t('addExpense')}
                {vistaActiva === 'categorias_gastos' && t('expenseCategories')}
                {vistaActiva === 'devoluciones_compra' && t('purchaseReturns')}
                {vistaActiva === 'cobros' && t('pendingOrders')}
                {vistaActiva === 'catalogo' && t('products')}
                {vistaActiva === 'agregar_producto' && t('addProduct')}
                {vistaActiva === 'marcas' && t('brands')}
                {vistaActiva === 'unidades' && t('units')}
                {vistaActiva === 'clientes' && t('customers')}
                {vistaActiva === 'caja_registradora' && t('cashRegister')}
                {vistaActiva === 'ganancias_perdidas' && t('profitLoss')}
                {vistaActiva === 'usuarios' && t('users')}
                {vistaActiva === 'roles' && t('roles')}
                {vistaActiva === 'config_empresa' && t('companySettings')}
                {vistaActiva === 'config_factura' && t('invoiceSettings')}
                {vistaActiva === 'ubicaciones_comerciales' && t('commercialLocations')}
                {vistaActiva === 'todas_ventas' && t('allSales')}
                {vistaActiva === 'cajas' && t('cashBank')}
                {vistaActiva === 'informe_caja_pago' && t('paymentReport')}
                {vistaActiva === 'ventas_por_producto' && t('salesByProduct')}
                {vistaActiva === 'cobro_de_ventas' && t('salesCollections')}
                {vistaActiva === 'vendedores_comisiones' && t('sellersCommissions')}
              </h2>
            <div className="flex-1"></div>
            <div className="flex items-center gap-2 md:gap-3">
              <LanguageSelector compact />
              {/* BOTÓN ACTUALIZAR */}
              <button
                onClick={() => setRefreshKey(k => k + 1)}
                className="relative w-8 h-8 rounded-md text-gray-500 hover:bg-gray-100 hover:text-orange-500 flex items-center justify-center"
                title="Actualizar"
              >
                <RotateCw size={17} />
              </button>

              {/* BOTÓN NOTIFICACIONES */}
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setMostrarNotificaciones((actual) => !actual)}
                  className="relative w-8 h-8 rounded-md text-gray-500 hover:bg-gray-100 hover:text-orange-500 flex items-center justify-center"
                  title={t('notificationLabel')}
                  aria-label={t('notificationLabel')}
                >
                  <Bell size={17} />
                  {notificacionesSistema.length > 0 && <span className="absolute -top-1 -right-1 min-w-4 h-4 px-1 rounded-full bg-red-500 text-white text-[9px] font-black flex items-center justify-center">{notificacionesSistema.length}</span>}
                </button>
                {mostrarNotificaciones && (
                  <div className="absolute right-0 top-10 z-50 w-80 max-w-[calc(100vw-2rem)] bg-white border border-gray-200 rounded-xl shadow-xl overflow-hidden">
                    <div className="px-4 py-3 border-b flex items-center justify-between"><span className="font-bold text-gray-800">{t('notifications')}</span><span className="text-[10px] text-gray-400">{t('realtimeData')}</span></div>
                    <div className="max-h-80 overflow-y-auto">
                      {notificacionesSistema.length === 0 ? <p className="p-5 text-center text-sm text-gray-400">{t('noNotifications')}</p> : notificacionesSistema.map((aviso) => <div key={aviso.id} className="px-4 py-3 border-b last:border-0 hover:bg-gray-50"><p className={`text-xs font-bold ${aviso.tipo === 'danger' ? 'text-red-600' : aviso.tipo === 'warning' ? 'text-orange-600' : 'text-blue-600'}`}>{aviso.titulo}</p><p className="text-xs text-gray-600 mt-0.5">{aviso.texto}</p></div>)}
                    </div>
                  </div>
                )}
              </div>
              <span className="text-xs md:text-sm font-medium text-gray-700 flex items-center gap-2">
                <span className="bg-orange-500 text-white rounded-full w-6 h-6 flex items-center justify-center text-[10px] font-bold">
                  {(perfilUsuario?.empresas?.nombre || 'N').charAt(0).toUpperCase()}
                </span>
                <span className="hidden sm:inline">{perfilUsuario?.empresas?.nombre || 'Mi Negocio'}</span>
              </span>
            </div>
          </header>
        )}

        {/* Inyección de los Módulos Activos */}
        <main className={`flex-1 overflow-y-auto bg-[#f3f4f6] pb-16 md:pb-0 ${posPantallaCompleta ? '' : 'p-3 md:p-6'}`}>
          <div key={`${vistaActiva}-${refreshKey}`}>
            {renderizarVista()}
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

      </div>
    </div>
  );
}