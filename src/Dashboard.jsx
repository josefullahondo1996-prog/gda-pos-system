import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { supabase } from './supabaseClient';
import { useNotificacion } from './NotificacionContext';
import {
  LayoutDashboard, Users, Contact, Package, Factory, Wrench,
  ArrowDownToLine, ArrowUpFromLine, BarChart3, ShoppingCart, LogOut, Settings,
  MapPin, FileText, Barcode, Printer, Percent, ClipboardList, CreditCard,
  Menu, X, Bell
} from 'lucide-react';
import ConfiguracionEmpresa from './ConfiguracionEmpresa';
import ConfiguracionFacturaElectronica from './ConfiguracionFacturaElectronica';
import OT from './OT';
import UbicacionesComerciales from './UbicacionesComerciales';
import ListaVentas from './ListaVentas';

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

export default function Dashboard({ session, perfilUsuario, initialView = 'inicio' }) {
  const { notificar } = useNotificacion();
  // === CONTROL DE ACCESO POR ROL (va primero, vistaActiva lo necesita) ===
  const nombreRol = (perfilUsuario?.roles?.nombre || '').toLowerCase();
  const esAdmin = nombreRol.includes('admin');
  const permisosRol = perfilUsuario?.roles?.permisos || null;

  const tieneCategoria = (categoriaKey) => {
    if (esAdmin || !permisosRol) return true;
    const categoria = permisosRol[categoriaKey];
    if (!categoria) return false;
    return Object.values(categoria).some(Boolean);
  };

  // Rol "cajero exclusivo": solo puede ver Abrir Caja y el Punto de Venta
  const soloPOS = !esAdmin && !!permisosRol?.ventas_pos?.['Solo Punto de Venta (bloquea todo lo demás)'];

  // Estados de navegación y control de caja
  const location = useLocation();
  const navigate = useNavigate();
  const [vistaActiva, setVistaActiva] = useState(soloPOS ? 'pos' : initialView);
  const [menuExpandido, setMenuExpandido] = useState('ventas');
  const [cajaActual, setCajaActual] = useState(null);
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

  useEffect(() => {
    const intervalo = setInterval(() => setFechaHora(new Date()), 30000);
    return () => clearInterval(intervalo);
  }, []);

  const cerrarSesion = async () => {
    await supabase.auth.signOut();
  };

  const posPantallaCompleta = vistaActiva === 'pos' && !!cajaActual;

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
      default:
        setVistaActiva(initialView);
        break;
    }
  }, [location.pathname, initialView, soloPOS]);

  // 2. ENRUTADOR DE VISTAS (Aquí se decide qué se dibuja a la derecha)
  const renderizarVista = () => {
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

      {/* ========================================== */}
      {/* MENÚ LATERAL IZQUIERDO (SIDEBAR COMPLETO)  */}
      {/* ========================================== */}
      {!posPantallaCompleta && (
        <aside className={`
          ${sidebarColapsado ? 'w-[76px]' : 'w-[260px]'}
          transition-all duration-300 bg-[#1e1e2d] text-white flex flex-col h-full shadow-xl z-30
          fixed inset-y-0 left-0 transform ${menuMovilAbierto ? 'translate-x-0' : '-translate-x-full'}
          md:relative md:translate-x-0 md:flex
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
            {!soloPOS && (
              <>
                <Link to="/" onClick={() => irA('inicio', '/')} className={estiloBotonSimple('inicio')} title="Inicio">
                  <LayoutDashboard size={18} strokeWidth={2} /> {!sidebarColapsado && 'Inicio'}
                </Link>

                <Link to="/ot" onClick={() => irA('ot', '/ot')} className={estiloBotonSimple('ot')} title="OT">
                  <Wrench size={18} strokeWidth={2} /> {!sidebarColapsado && 'OT'}
                </Link>
              </>
            )}

            {/* MENÚ: GESTIÓN DE USUARIOS */}
            {(tieneCategoria('usuarios') || tieneCategoria('roles')) && (
              <>
                <button onClick={() => toggleMenu('usuarios')} className={estiloBotonDesplegable('usuarios')} title="Gestión de usuarios">
                  <div className="flex items-center gap-3"><Users size={18} strokeWidth={2} /> {!sidebarColapsado && 'Gestión de usuarios'}</div>
                  {!sidebarColapsado && <span className="text-[10px]">{menuExpandido === 'usuarios' ? '▼' : '◀'}</span>}
                </button>
                {menuExpandido === 'usuarios' && !sidebarColapsado && (
                  <div className="bg-[#151521] py-1 flex flex-col">
                    {tieneCategoria('usuarios') && (
                      <Link to="/usuarios" onClick={() => irA('usuarios', '/usuarios')} className={estiloSubItem('usuarios')}>🠖 Usuarios</Link>
                    )}
                    {tieneCategoria('roles') && (
                      <Link to="/roles" onClick={() => irA('roles', '/roles')} className={estiloSubItem('roles')}>🠖 Roles</Link>
                    )}
                  </div>
                )}
              </>
            )}

            {/* MENÚ: CLIENTE / PROVEEDOR */}
            {tieneCategoria('clientes_proveedores') && (
              <>
                <button onClick={() => toggleMenu('contactos')} className={estiloBotonDesplegable('contactos')} title="Cliente/Proveedor">
                  <div className="flex items-center gap-3"><Contact size={18} strokeWidth={2} /> {!sidebarColapsado && 'Cliente/Proveedor'}</div>
                  {!sidebarColapsado && <span className="text-[10px]">{menuExpandido === 'contactos' ? '▼' : '◀'}</span>}
                </button>
                {menuExpandido === 'contactos' && !sidebarColapsado && (
                  <div className="bg-[#151521] py-1 flex flex-col">
                    <Link to="/proveedores" onClick={() => irA('proveedores', '/proveedores')} className={estiloSubItem('proveedores')}>🠖 Proveedores</Link>
                    <Link to="/clientes" onClick={() => irA('clientes', '/clientes')} className={estiloSubItem('clientes')}>🠖 Clientes</Link>
                    <Link to="/grupos_clientes" onClick={() => irA('grupos_clientes', '/grupos_clientes')} className={estiloSubItem('grupos_clientes')}>🠖 Grupos de clientes</Link>
                  </div>
                )}
              </>
            )}

            {/* MENÚ: PRODUCTOS */}
            {tieneCategoria('productos') && (
              <>
                <button onClick={() => toggleMenu('productos')} className={estiloBotonDesplegable('productos')} title="Productos">
                  <div className="flex items-center gap-3"><Package size={18} strokeWidth={2} /> {!sidebarColapsado && 'Productos'}</div>
                  {!sidebarColapsado && <span className="text-[10px]">{menuExpandido === 'productos' ? '▼' : '◀'}</span>}
                </button>
                {menuExpandido === 'productos' && !sidebarColapsado && (
                  <div className="bg-[#151521] py-1 flex flex-col">
                    <Link to="/catalogo" onClick={() => irA('catalogo', '/catalogo')} className={estiloSubItem('catalogo')}>🠖 Lista de productos</Link>
                    <Link to="/agregar_producto" onClick={() => irA('agregar_producto', '/agregar_producto')} className={estiloSubItem('agregar_producto')}>🠖 Agregar producto</Link>
                    <Link to="/marcas" onClick={() => irA('marcas', '/marcas')} className={estiloSubItem('marcas')}>🠖 Marcas</Link>
                    <Link to="/categorias" onClick={() => irA('categorias', '/categorias')} className={estiloSubItem('categorias')}>🠖 Categorías</Link>
                    <Link to="/unidades" onClick={() => irA('unidades', '/unidades')} className={estiloSubItem('unidades')}>🠖 Unidades</Link>
                  </div>
                )}
              </>
            )}

            {/* MENÚ: COMPRAS (RECONECTADO) */}
            {tieneCategoria('compras') && (
              <>
                <button onClick={() => toggleMenu('compras')} className={estiloBotonDesplegable('compras')} title="Compras">
                  <div className="flex items-center gap-3"><ArrowDownToLine size={18} strokeWidth={2} /> {!sidebarColapsado && 'Compras'}</div>
                  {!sidebarColapsado && <span className="text-[10px]">{menuExpandido === 'compras' ? '▼' : '◀'}</span>}
                </button>
                {menuExpandido === 'compras' && !sidebarColapsado && (
                  <div className="bg-[#151521] py-1 flex flex-col">
                    <Link to="/compras" onClick={() => irA('compras', '/compras')} className={estiloSubItem('compras')}>🠖 Lista de compras</Link>
                    <Link to="/agregar_compra" onClick={() => irA('agregar_compra', '/agregar_compra')} className={estiloSubItem('agregar_compra')}>🠖 Agregar compra</Link>
                    <Link to="/devoluciones_compra" onClick={() => irA('devoluciones_compra', '/devoluciones_compra')} className={estiloSubItem('devoluciones_compra')}>🠖 Lista de devoluciones de compra</Link>
                  </div>
                )}
              </>
            )}

            {/* MENÚ: GASTOS */}
            {tieneCategoria('gastos') && (
              <>
                <button onClick={() => toggleMenu('gastos')} className={estiloBotonDesplegable('gastos')} title="Gastos">
                  <div className="flex items-center gap-3"><ArrowDownToLine size={18} strokeWidth={2} /> {!sidebarColapsado && 'Gastos'}</div>
                  {!sidebarColapsado && <span className="text-[10px]">{menuExpandido === 'gastos' ? '▼' : '◀'}</span>}
                </button>
                {menuExpandido === 'gastos' && !sidebarColapsado && (
                  <div className="bg-[#151521] py-1 flex flex-col">
                    <Link to="/gastos" onClick={() => irA('gastos', '/gastos')} className={estiloSubItem('gastos')}>🠖 Lista de gastos</Link>
                    <Link to="/gastos/agregar" onClick={() => irA('agregar_gasto', '/gastos/agregar')} className={estiloSubItem('agregar_gasto')}>🠖 Agregar gasto</Link>
                    <Link to="/gastos/categorias" onClick={() => irA('categorias_gastos', '/gastos/categorias')} className={estiloSubItem('categorias_gastos')}>🠖 Categorías de gastos</Link>
                  </div>
                )}
              </>
            )}

            {/* MENÚ: VENTAS */}
            {tieneCategoria('ventas_pos') && !soloPOS && (
              <>
                <button onClick={() => toggleMenu('ventas')} className={estiloBotonDesplegable('ventas')} title="Ventas">
                  <div className="flex items-center gap-3"><ArrowUpFromLine size={18} strokeWidth={2} /> {!sidebarColapsado && 'Ventas'}</div>
                  {!sidebarColapsado && <span className="text-[10px]">{menuExpandido === 'ventas' ? '▼' : '◀'}</span>}
                </button>
                {menuExpandido === 'ventas' && !sidebarColapsado && (
                  <div className="bg-[#151521] py-1 flex flex-col">
                    <Link to="/todas_ventas" onClick={() => irA('todas_ventas', '/todas_ventas')} className={estiloSubItem('todas_ventas')}>🠖 Todas las ventas</Link>
                    <Link to="/pos" onClick={() => irA('pos', '/pos')} className={estiloSubItem('pos')}>🠖 Punto de venta</Link>
                    <Link to="/cobros" onClick={() => irA('cobros', '/cobros')} className={estiloSubItem('cobros')}>🠖 Pedidos Pendientes</Link>
                  </div>
                )}
              </>
            )}

            {soloPOS && (
              <Link to="/pos" onClick={() => irA('pos', '/pos')} className={estiloBotonSimple('pos')} title="Punto de venta">
                <ArrowUpFromLine size={18} strokeWidth={2} /> {!sidebarColapsado && 'Punto de venta'}
              </Link>
            )}

            {!tieneCategoria('ventas_pos') && tieneCategoria('caja') && (
              <Link to="/pos" onClick={() => irA('pos', '/pos')} className={estiloBotonSimple('pos')} title="Caja registradora">
                <ArrowUpFromLine size={18} strokeWidth={2} /> {!sidebarColapsado && 'Caja registradora'}
              </Link>
            )}

            {/* MENÚ: CAJA / BANCO */}
            {tieneCategoria('caja') && (
              <>
                <button onClick={() => toggleMenu('caja_banco')} className={estiloBotonDesplegable('caja_banco')} title="Caja / Banco">
                  <div className="flex items-center gap-3"><CreditCard size={18} strokeWidth={2} /> {!sidebarColapsado && 'Caja / Banco'}</div>
                  {!sidebarColapsado && <span className="text-[10px]">{menuExpandido === 'caja_banco' ? '▼' : '◀'}</span>}
                </button>
                {menuExpandido === 'caja_banco' && !sidebarColapsado && (
                  <div className="bg-[#151521] py-1 flex flex-col">
                    <Link to="/cajas" onClick={() => irA('cajas', '/cajas')} className={estiloSubItem('cajas')}>🠖 Lista de cajas</Link>
                    <Link to="/informe-caja-pago" onClick={() => irA('informe_caja_pago', '/informe-caja-pago')} className={estiloSubItem('informe_caja_pago')}>🠖 Informe de caja de pago</Link>
                  </div>
                )}
              </>
            )}

            {/* MENÚ: INFORMES */}
            {tieneCategoria('informes') && (
              <>
                <button onClick={() => toggleMenu('informes')} className={estiloBotonDesplegable('informes')} title="Informes">
                  <div className="flex items-center gap-3"><BarChart3 size={18} strokeWidth={2} /> {!sidebarColapsado && 'Informes'}</div>
                  {!sidebarColapsado && <span className="text-[10px]">{menuExpandido === 'informes' ? '▼' : '◀'}</span>}
                </button>
                {menuExpandido === 'informes' && !sidebarColapsado && (
                  <div className="bg-[#151521] py-1 flex flex-col">
                    <Link to="/ganancias_perdidas" onClick={() => irA('ganancias_perdidas', '/ganancias_perdidas')} className={estiloSubItem('ganancias_perdidas')}>🠖 Ganancias y Pérdidas</Link>
                    <Link to="/ventas-por-producto" onClick={() => irA('ventas_por_producto', '/ventas-por-producto')} className={estiloSubItem('ventas_por_producto')}>🠖 Ventas por producto</Link>
                    <Link to="/cobro-de-ventas" onClick={() => irA('cobro_de_ventas', '/cobro-de-ventas')} className={estiloSubItem('cobro_de_ventas')}>🠖 Cobros de venta</Link>
                    <Link to="/caja_registradora" onClick={() => irA('caja_registradora', '/caja_registradora')} className={estiloSubItem('caja_registradora')}>🠖 Caja registradora</Link>
                  </div>
                )}
              </>
            )}

            {/* MENÚ: CONFIGURACIONES */}
            {esAdmin && (
              <>
                <button onClick={() => toggleMenu('configuraciones')} className={estiloBotonDesplegable('configuraciones')} title="Configuraciones">
                  <div className="flex items-center gap-3"><Settings size={18} strokeWidth={2} /> {!sidebarColapsado && 'Configuraciones'}</div>
                  {!sidebarColapsado && <span className="text-[10px]">{menuExpandido === 'configuraciones' ? '▼' : '◀'}</span>}
                </button>
                {menuExpandido === 'configuraciones' && !sidebarColapsado && (
                  <div className="bg-[#151521] py-1 flex flex-col">
                    <Link to="/config_empresa" onClick={() => irA('config_empresa', '/config_empresa')} className={estiloSubItem('config_empresa')}>🠖 Configuración de la empresa</Link>
                    <Link to="/ubicaciones_comerciales" onClick={() => irA('ubicaciones_comerciales', '/ubicaciones_comerciales')} className={estiloSubItem('ubicaciones_comerciales')}>🠖 Ubicaciones comerciales</Link>
                    <Link to="/config_factura" onClick={() => irA('config_factura', '/config_factura')} className={estiloSubItem('config_factura')}>🠖 Configuración de factura</Link>
                  </div>
                )}
              </>
            )}
          </nav>

          {/* Footer del Sidebar */}
          <div className="p-4 border-t border-gray-700 bg-[#1e1e2d] flex flex-col gap-2">
            <button
              onClick={cerrarSesion}
              title="Cerrar sesión"
              className="w-full bg-red-600 hover:bg-red-700 text-white py-1.5 rounded text-sm font-bold transition flex items-center justify-center gap-2"
            >
              <LogOut size={16} strokeWidth={2} /> {!sidebarColapsado && 'Cerrar Sesión'}
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
          <header className="h-14 md:h-16 bg-white shadow-sm flex items-center justify-between px-4 md:px-6 z-10 border-b">
            <div className="flex items-center gap-3">
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

              <h2 className="text-gray-800 font-bold text-base md:text-lg truncate max-w-[150px] md:max-w-none">
                {vistaActiva === 'inicio' && 'Inicio'}
                {vistaActiva === 'pos' && 'Punto de Venta'}
                {vistaActiva === 'reporte_cierre' && 'Cierre'}
                {vistaActiva === 'nuevo_gasto' && 'Gasto'}
                {vistaActiva === 'compras' && 'Compras'}
                {vistaActiva === 'agregar_compra' && 'Nueva Compra'}
                {vistaActiva === 'gastos' && 'Gastos'}
                {vistaActiva === 'agregar_gasto' && 'Agregar gasto'}
                {vistaActiva === 'categorias_gastos' && 'Categorías de gastos'}
                {vistaActiva === 'devoluciones_compra' && 'Devoluciones'}
                {vistaActiva === 'cobros' && 'Pendientes'}
                {vistaActiva === 'catalogo' && 'Productos'}
                {vistaActiva === 'agregar_producto' && 'Nuevo Producto'}
                {vistaActiva === 'marcas' && 'Marcas'}
                {vistaActiva === 'unidades' && 'Unidades'}
                {vistaActiva === 'clientes' && 'Clientes'}
                {vistaActiva === 'caja_registradora' && 'Caja'}
                {vistaActiva === 'ganancias_perdidas' && 'G/P'}
                {vistaActiva === 'usuarios' && 'Usuarios'}
                {vistaActiva === 'roles' && 'Roles'}
                {vistaActiva === 'config_empresa' && 'Empresa'}
                {vistaActiva === 'config_factura' && 'Facturación'}
                {vistaActiva === 'ubicaciones_comerciales' && 'Ubicaciones'}
                {vistaActiva === 'todas_ventas' && 'Ventas'}
                {vistaActiva === 'cajas' && 'Banco'}
                {vistaActiva === 'informe_caja_pago' && 'Informe de Pago'}
                {vistaActiva === 'ventas_por_producto' && 'Ventas por Producto'}
                {vistaActiva === 'cobro_de_ventas' && 'Cobros de Venta'}
              </h2>
            </div>
            <div className="flex items-center gap-2 md:gap-3">
              <button
                onClick={() => irA('pos', '/pos')}
                className="bg-orange-500 hover:bg-orange-600 text-white rounded-md px-3 py-2 text-xs font-bold flex items-center gap-2 shadow-sm whitespace-nowrap"
                title="Punto de venta"
              >
                <ShoppingCart size={15} />
                <span className="hidden sm:inline">Punto de venta</span>
              </button>
              <span className="hidden md:inline text-xs font-medium text-gray-600 whitespace-nowrap">
                {fechaHora.toLocaleDateString('es-PY')}
              </span>
              <button
                type="button"
                onClick={() => notificar.info('No tienes notificaciones nuevas.')}
                className="w-8 h-8 rounded-md text-gray-500 hover:bg-gray-100 hover:text-orange-500 flex items-center justify-center"
                title="Notificaciones"
                aria-label="Notificaciones"
              >
                <Bell size={17} />
              </button>
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
          <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 h-16 flex items-center justify-around px-2 z-40">
            <button
              onClick={() => irA('inicio', '/')}
              className={`flex flex-col items-center gap-1 flex-1 ${vistaActiva === 'inicio' ? 'text-orange-500' : 'text-gray-500'}`}
            >
              <LayoutDashboard size={20} />
              <span className="text-[10px] font-medium">Inicio</span>
            </button>
            <button
              onClick={() => irA('pos', '/pos')}
              className={`flex flex-col items-center gap-1 flex-1 ${vistaActiva === 'pos' ? 'text-orange-500' : 'text-gray-500'}`}
            >
              <ShoppingCart size={20} />
              <span className="text-[10px] font-medium">POS</span>
            </button>
            <button
              onClick={() => irA('todas_ventas', '/todas_ventas')}
              className={`flex flex-col items-center gap-1 flex-1 ${vistaActiva === 'todas_ventas' ? 'text-orange-500' : 'text-gray-500'}`}
            >
              <ArrowUpFromLine size={20} />
              <span className="text-[10px] font-medium">Ventas</span>
            </button>
            <button
              onClick={() => irA('catalogo', '/catalogo')}
              className={`flex flex-col items-center gap-1 flex-1 ${vistaActiva === 'catalogo' ? 'text-orange-500' : 'text-gray-500'}`}
            >
              <Package size={20} />
              <span className="text-[10px] font-medium">Stock</span>
            </button>
            <button
              onClick={() => setMenuMovilAbierto(true)}
              className="flex flex-col items-center gap-1 flex-1 text-gray-500"
            >
              <Menu size={20} />
              <span className="text-[10px] font-medium">Más</span>
            </button>
          </nav>
        )}

      </div>
    </div>
  );
}