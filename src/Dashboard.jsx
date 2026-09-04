import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { supabase } from './supabaseClient';
import {
  LayoutDashboard, Users, Contact, Package, Factory, Wrench,
  ArrowDownToLine, ArrowUpFromLine, BarChart3, ShoppingCart, LogOut, Settings,
  MapPin, FileText, Barcode, Printer, Percent, ClipboardList, CreditCard,
  Menu, X, DollarSign, BookOpen, Truck, ShoppingBag, Clock3, Building2, CircleHelp, CalendarDays
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
  const [menuCuentaAbierto, setMenuCuentaAbierto] = useState(false);
  const [menuAccionesAbierto, setMenuAccionesAbierto] = useState(false);
  const [accionInicio, setAccionInicio] = useState(null);
  const [fechaHora, setFechaHora] = useState(new Date());

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
          const mismaUbicacion = !ubicacionUsuarioId || Number(caja.ubicacion_id) === Number(ubicacionUsuarioId);
          const mismoUsuario = !caja.usuario || caja.usuario === nombreUsuario || caja.usuario === perfilUsuario?.nombre_usuario;
          return mismaUbicacion && mismoUsuario;
        });
        setCajaActual(cajaDelUsuario || (data && data[0]) || null);
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
        return <Inicio key={refreshInicio} perfilUsuario={perfilUsuario} accionInicial={accionInicio} />;

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
    group relative w-full min-h-[42px] text-left text-[13px] font-semibold tracking-[0.01em] transition-all duration-300 ease-out flex items-center gap-3 overflow-hidden
    ${sidebarColapsado ? 'justify-center px-2 mx-1.5 rounded-2xl' : 'justify-start px-3 py-2.5 mx-2 rounded-2xl'}
    ${vistaActiva === vista
      ? 'text-white bg-gradient-to-r from-[#1f2937] via-[#1d2434] to-[#111827] shadow-[0_16px_32px_rgba(15,23,42,0.28)] ring-1 ring-[#f59e0b]/40 before:absolute before:left-0 before:top-1.5 before:bottom-1.5 before:w-1 before:rounded-r-full before:bg-gradient-to-b before:from-[#fbbf24] before:to-[#f59e0b]'
      : 'text-slate-600 hover:text-[#f59e0b] hover:bg-gradient-to-r hover:from-white hover:to-slate-50 hover:shadow-[0_8px_20px_rgba(15,23,42,0.08)] active:bg-slate-100'}
  `;

  const estiloBotonDesplegable = (menuName) => `
    group relative w-full min-h-[42px] text-left text-[13px] font-semibold tracking-[0.01em] transition-all duration-300 ease-out flex items-center justify-between overflow-hidden
    ${sidebarColapsado ? 'justify-center px-2 mx-1.5 rounded-2xl' : 'px-3 py-2.5 mx-2 rounded-2xl'}
    ${menuExpandido === menuName
      ? 'text-white bg-gradient-to-r from-[#1f2937] via-[#1d2434] to-[#111827] shadow-[0_16px_32px_rgba(15,23,42,0.28)] ring-1 ring-[#f59e0b]/40 before:absolute before:left-0 before:top-1.5 before:bottom-1.5 before:w-1 before:rounded-r-full before:bg-gradient-to-b before:from-[#fbbf24] before:to-[#f59e0b]'
      : 'text-slate-600 hover:text-[#f59e0b] hover:bg-gradient-to-r hover:from-white hover:to-slate-50 hover:shadow-[0_8px_20px_rgba(15,23,42,0.08)] active:bg-slate-100'}
  `;

  const estiloSubItem = (vista) => `
    w-full text-left pl-10 pr-3 py-1.5 text-[11px] font-medium transition-all duration-300 ease-out flex items-center gap-2 rounded-xl mx-2 border border-transparent
    ${vistaActiva === vista ? 'text-white font-bold bg-gradient-to-r from-[#1f2937] to-[#111827] shadow-[0_8px_16px_rgba(15,23,42,0.15)] border-[#374151] ring-1 ring-[#f59e0b]/30' : 'text-slate-500 hover:text-[#f59e0b] hover:bg-white hover:border-slate-200 hover:shadow-[0_4px_12px_rgba(15,23,42,0.05)]'}
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
          transition-[width,transform] duration-300 ease-out bg-gradient-to-b from-[#f8fafc] via-[#f5f7fa] to-[#f1f3f7] text-slate-800 flex flex-col h-full shadow-[0_0_0_1px_rgba(148,163,184,0.15),12px_0_40px_rgba(15,23,42,0.12)] border-r border-gradient-to-b from-slate-200 to-slate-100 z-30
          fixed inset-y-0 left-0 transform ${menuMovilAbierto ? 'translate-x-0' : '-translate-x-full'}
          hidden md:relative md:translate-x-0 md:flex
        `}>
          {/* Logo Superior con botón de cerrar para móvil */}
          <div className="h-16 flex items-center justify-between px-4 border-b border-gradient-to-r from-slate-200 via-slate-150 to-slate-200 bg-gradient-to-r from-white via-slate-50/50 to-white backdrop-blur-sm overflow-hidden">
            <div className="flex-1 flex justify-center">
              <h1 className="text-[1.7rem] font-black tracking-[0.18em] whitespace-nowrap text-slate-800">
                {sidebarColapsado ? (
                  <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-[#f59e0b] via-[#fb923c] to-[#f97316] text-white shadow-[0_10px_20px_rgba(245,158,11,0.35)] text-lg tracking-normal">P</span>
                ) : (
                  <span className="tracking-[0.14em]">PY<span className="text-transparent bg-clip-text bg-gradient-to-r from-[#f59e0b] to-[#f97316]">POS</span></span>
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
          <nav className="flex-1 overflow-y-auto overflow-x-hidden py-3 px-1 flex flex-col bg-gradient-to-b from-[#f8fafc] to-[#f3f5f8] gap-0.5">
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
                  {!sidebarColapsado && (
                    <span className={`inline-flex items-center justify-center w-5 h-5 rounded-md text-[10px] transition-colors ${menuExpandido === 'usuarios' ? 'bg-[#1f2937] text-[#f59e0b]' : 'text-slate-500 hover:bg-[#1f2937] hover:text-[#f59e0b]'}`}>
                      {menuExpandido === 'usuarios' ? '▼' : '◀'}
                    </span>
                  )}
                </button>
                {menuExpandido === 'usuarios' && !sidebarColapsado && (
                  <div className="bg-transparent py-1 flex flex-col border-l border-slate-200 ml-5">
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
                    <span className={`inline-flex items-center justify-center w-5 h-5 rounded-md text-[10px] transition-colors ${menuExpandido === 'contactos' ? 'bg-[#1f2937] text-[#f59e0b]' : 'text-slate-500 hover:bg-[#1f2937] hover:text-[#f59e0b]'}`}>
                      {menuExpandido === 'contactos' ? '▼' : '◀'}
                    </span>
                  )}
                </button>
                {menuExpandido === 'contactos' && !sidebarColapsado && (
                  <div className="bg-transparent py-1 flex flex-col border-l border-slate-200 ml-5">
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
                  {!sidebarColapsado && (
                    <span className={`inline-flex items-center justify-center w-5 h-5 rounded-md text-[10px] transition-colors ${menuExpandido === 'productos' ? 'bg-[#1f2937] text-[#f59e0b]' : 'text-slate-500 hover:bg-[#1f2937] hover:text-[#f59e0b]'}`}>
                      {menuExpandido === 'productos' ? '▼' : '◀'}
                    </span>
                  )}
                </button>
                {menuExpandido === 'productos' && !sidebarColapsado && (
                  <div className="bg-transparent py-1 flex flex-col border-l border-slate-200 ml-5">
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
                  {!sidebarColapsado && (
                    <span className={`inline-flex items-center justify-center w-5 h-5 rounded-md text-[10px] transition-colors ${menuExpandido === 'compras' ? 'bg-[#1f2937] text-[#f59e0b]' : 'text-slate-500 hover:bg-[#1f2937] hover:text-[#f59e0b]'}`}>
                      {menuExpandido === 'compras' ? '▼' : '◀'}
                    </span>
                  )}
                </button>
                {menuExpandido === 'compras' && !sidebarColapsado && (
                  <div className="bg-transparent py-1 flex flex-col border-l border-slate-200 ml-5">
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
                  {!sidebarColapsado && (
                    <span className={`inline-flex items-center justify-center w-5 h-5 rounded-md text-[10px] transition-colors ${menuExpandido === 'gastos' ? 'bg-[#1f2937] text-[#f59e0b]' : 'text-slate-500 hover:bg-[#1f2937] hover:text-[#f59e0b]'}`}>
                      {menuExpandido === 'gastos' ? '▼' : '◀'}
                    </span>
                  )}
                </button>
                {menuExpandido === 'gastos' && !sidebarColapsado && (
                  <div className="bg-transparent py-1 flex flex-col border-l border-slate-200 ml-5">
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
                  {!sidebarColapsado && (
                    <span className={`inline-flex items-center justify-center w-5 h-5 rounded-md text-[10px] transition-colors ${menuExpandido === 'ventas' ? 'bg-[#1f2937] text-[#f59e0b]' : 'text-slate-500 hover:bg-[#1f2937] hover:text-[#f59e0b]'}`}>
                      {menuExpandido === 'ventas' ? '▼' : '◀'}
                    </span>
                  )}
                </button>
                {menuExpandido === 'ventas' && !sidebarColapsado && (
                  <div className="bg-transparent py-1 flex flex-col border-l border-slate-200 ml-5">
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
                  {!sidebarColapsado && (
                    <span className={`inline-flex items-center justify-center w-5 h-5 rounded-md text-[10px] transition-colors ${menuExpandido === 'caja_banco' ? 'bg-[#1f2937] text-[#f59e0b]' : 'text-slate-500 hover:bg-[#1f2937] hover:text-[#f59e0b]'}`}>
                      {menuExpandido === 'caja_banco' ? '▼' : '◀'}
                    </span>
                  )}
                </button>
                {menuExpandido === 'caja_banco' && !sidebarColapsado && (
                  <div className="bg-transparent py-1 flex flex-col border-l border-slate-200 ml-5">
                    <Link to="/cajas" onClick={() => irA('cajas', '/cajas')} className={estiloSubItem('cajas')}>🠖 {t('cashRegisters')}</Link>
                    <Link to="/informe-caja-pago" onClick={() => irA('informe_caja-pago', '/informe-caja-pago')} className={estiloSubItem('informe_caja_pago')}>🠖 {t('paymentReport')}</Link>
                  </div>
                )}
              </>
            )}

            {/* MENÚ: INFORMES */}
            {tieneCategoria('informes') && (
              <>
                <button onClick={() => toggleMenu('informes')} className={estiloBotonDesplegable('informes')} title="Informes">
                  <div className="flex items-center gap-3"><BarChart3 size={18} strokeWidth={2} /> {!sidebarColapsado && t('reports')}</div>
                  {!sidebarColapsado && (
                    <span className={`inline-flex items-center justify-center w-5 h-5 rounded-md text-[10px] transition-colors ${menuExpandido === 'informes' ? 'bg-[#1f2937] text-[#f59e0b]' : 'text-slate-500 hover:bg-[#1f2937] hover:text-[#f59e0b]'}`}>
                      {menuExpandido === 'informes' ? '▼' : '◀'}
                    </span>
                  )}
                </button>
                {menuExpandido === 'informes' && !sidebarColapsado && (
                  <div className="bg-transparent py-1 flex flex-col border-l border-slate-200 ml-5">
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
                  {!sidebarColapsado && (
                    <span className={`inline-flex items-center justify-center w-5 h-5 rounded-md text-[10px] transition-colors ${menuExpandido === 'configuraciones' ? 'bg-[#1f2937] text-[#f59e0b]' : 'text-slate-500 hover:bg-[#1f2937] hover:text-[#f59e0b]'}`}>
                      {menuExpandido === 'configuraciones' ? '▼' : '◀'}
                    </span>
                  )}
                </button>
                {menuExpandido === 'configuraciones' && !sidebarColapsado && (
                  <div className="bg-transparent py-1 flex flex-col border-l border-slate-200 ml-5">
                    <Link to="/config_empresa" onClick={() => irA('config_empresa', '/config_empresa')} className={estiloSubItem('config_empresa')}>🠖 {t('companySettings')}</Link>
                    <Link to="/ubicaciones_comerciales" onClick={() => irA('ubicaciones_comerciales', '/ubicaciones_comerciales')} className={estiloSubItem('ubicaciones_comerciales')}>🠖 {t('commercialLocations')}</Link>
                    <Link to="/config_factura" onClick={() => irA('config_factura', '/config_factura')} className={estiloSubItem('config_factura')}>🠖 {t('invoiceSettings')}</Link>
                  </div>
                )}
              </>
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
            <div className="hidden md:flex items-center gap-2 lg:gap-3">
                <LanguageSelector compact />
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
                <span>{new Date().toLocaleDateString('es-PY', { day: '2-digit', month: '2-digit', year: 'numeric' })}</span>
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