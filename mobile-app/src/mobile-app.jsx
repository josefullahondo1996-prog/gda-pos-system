import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity, ArrowDownLeft, ArrowRight, Barcode, BarChart3, Camera, Check, ChevronRight, CircleAlert,
  CircleHelp, ClipboardList, Clock3, CreditCard, DoorOpen, LayoutDashboard, LoaderCircle,
  Download, LogOut, Menu, Minus, Package, Plus, RefreshCw, Search, ShoppingBag, ShoppingCart,
  SlidersHorizontal, Store,
  UserRound, Wallet, Wrench, X,
} from 'lucide-react';
import MobileModules from './mobile-modules.jsx';
import { MobileProductForm, MobileQuotes } from './mobile-create-modules.jsx';
import { supabase } from './supabaseClient.js';

const money = (value) => `Gs ${Math.round(Number(value) || 0).toLocaleString('es-PY')}`;
const todayStart = () => {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date.toISOString();
};
const userName = (profile) => [profile?.nombre, profile?.apellido].filter(Boolean).join(' ').trim()
  || profile?.nombre_usuario || profile?.email || 'Equipo';
const loadAllRows = async (makeQuery) => {
  const rows = [];
  for (let from = 0; from < 10000; from += 1000) {
    const { data, error } = await makeQuery().range(from, from + 999);
    if (error) return { data: null, error };
    rows.push(...(data || []));
    if (!data || data.length < 1000) break;
  }
  return { data: rows, error: null };
};
const roleCanSee = (profile, category, permission) => {
  const role = (profile?.roles?.nombre || '').toLowerCase();
  if (role.includes('admin') || role.includes('desarrollador')) return true;
  return Boolean(profile?.roles?.permisos?.[category]?.[permission]);
};

function MobileApp() {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [authBusy, setAuthBusy] = useState(true);
  const [authError, setAuthError] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [screen, setScreen] = useState('home');
  const [accountOpen, setAccountOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [productFormOpen, setProductFormOpen] = useState(false);
  const [productFiltersOpen, setProductFiltersOpen] = useState(false);
  const [productCategoryFilter, setProductCategoryFilter] = useState('Todos');
  const [productStockFilter, setProductStockFilter] = useState('Todos');
  const [productsSyncedAt, setProductsSyncedAt] = useState(null);
  const [refresh, setRefresh] = useState(0);
  const [data, setData] = useState({ loading: true, sales: [], products: [], customers: [], groups: [], box: null, branches: [] });
  const [query, setQuery] = useState('');
  const [customerId, setCustomerId] = useState('');
  const [cart, setCart] = useState([]);
  const [paying, setPaying] = useState(false);
  const [notice, setNotice] = useState(null);
  const [saleMethod, setSaleMethod] = useState('Efectivo');
  const [categoryFilter, setCategoryFilter] = useState('Todos');
  const [cartExpanded, setCartExpanded] = useState(false);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [scannerCode, setScannerCode] = useState('');
  const [scannerMessage, setScannerMessage] = useState('');
  const scannerVideoRef = useRef(null);
  const scannerActionRef = useRef(null);

  useEffect(() => {
    let live = true;
    const applySession = async (currentSession) => {
      if (!live) return;
      setSession(currentSession);
      if (!currentSession?.user) {
        setProfile(null);
        setAuthBusy(false);
        return;
      }
      const { data: user, error } = await supabase.from('usuarios')
        .select('*, roles(nombre, permisos), empresas(id, nombre, estado, logo_url)')
        .eq('auth_user_id', currentSession.user.id).maybeSingle();
      if (!live) return;
      if (error) {
        setProfile(null);
        setAuthError('No se pudo verificar el acceso. Comprueba tu conexión e inténtalo otra vez.');
      } else if (!user?.empresas || user.activo === false || user.permitir_acceso === false) {
        setProfile(null);
        setAuthError(user?.empresas ? 'Tu usuario no tiene acceso activo. Contacta al administrador.' : 'Esta cuenta no está vinculada a un negocio activo.');
        await supabase.auth.signOut();
      } else if (user.empresas.estado === 'suspendida') {
        setProfile(null);
        setAuthError('Este negocio está suspendido. Contacta al soporte del sistema.');
        await supabase.auth.signOut();
      } else {
        setProfile({ ...user, email: currentSession.user.email, auth_user_id: currentSession.user.id });
        setAuthError('');
      }
      setAuthBusy(false);
    };
    supabase.auth.getSession().then(({ data: result }) => applySession(result.session));
    const { data: listener } = supabase.auth.onAuthStateChange((_event, next) => {
      if (_event === 'SIGNED_IN' || _event === 'SIGNED_OUT') applySession(next);
    });
    return () => { live = false; listener.subscription.unsubscribe(); };
  }, []);

  const empresaId = profile?.empresa_id || profile?.empresas?.id;
  const permisoPOS = roleCanSee(profile, 'ventas_pos', 'Acceder al Punto de Venta');
  const permisoProductos = roleCanSee(profile, 'productos', 'Ver productos');
  const permisoVentas = permisoPOS;
  const permisoClientes = roleCanSee(profile, 'clientes_proveedores', 'Ver clientes');
  const permisoCrearCliente = roleCanSee(profile, 'clientes_proveedores', 'Agregar cliente');
  const permisoCrearProducto = roleCanSee(profile, 'productos', 'Agregar producto');
  const permisoProveedores = roleCanSee(profile, 'clientes_proveedores', 'Ver proveedores');
  const permisoCompras = roleCanSee(profile, 'compras', 'Ver compras');
  const permisoGastos = roleCanSee(profile, 'gastos', 'Ver gastos');
  const permisoCajaHistorial = roleCanSee(profile, 'caja', 'Ver caja registradora (histórico)');
  const permisoCaja = permisoCajaHistorial || roleCanSee(profile, 'caja', 'Abrir caja') || roleCanSee(profile, 'caja', 'Cerrar caja');
  const permisoReportes = roleCanSee(profile, 'informes', 'Ver Ganancias y Pérdidas')
    || roleCanSee(profile, 'informes', 'Ver Caja registradora');
  const permisoVerOtrasVentas = roleCanSee(profile, 'ventas_pos', 'Ver ventas de otros usuarios');
  const soloPOS = Boolean(profile && !['admin', 'desarrollador'].some((role) => (profile.roles?.nombre || '').toLowerCase().includes(role))
    && profile.roles?.permisos?.ventas_pos?.['Solo Punto de Venta (bloquea todo lo demás)']);

  useEffect(() => {
    if (soloPOS && !['quotes', 'cash'].includes(screen)) setScreen('pos');
    else if (screen === 'pos' && !permisoPOS) setScreen('home');
  }, [soloPOS, permisoPOS, screen]);

  useEffect(() => {
    setCart([]);
    setCustomerId('');
    setScreen('home');
    setData({ loading: true, sales: [], products: [], customers: [], groups: [], box: null, branches: [] });
  }, [profile?.auth_user_id, empresaId]);

  const loadData = useCallback(async () => {
    if (!empresaId || !profile) return;
    setData((current) => ({ ...current, loading: true }));
    const start = todayStart();
    const emptyResult = Promise.resolve({ data: [], error: null });
    const branchQuery = permisoCaja ? supabase.from('ubicaciones_comerciales').select('id, nombre, codigo_ubicacion').eq('empresa_id', empresaId).eq('activo', true).order('nombre') : emptyResult;
    // POS users need to discover their server-side cash box even when they do not
    // have permission to open or close one themselves.
    const boxQuery = (permisoCaja || permisoPOS) ? supabase.from('caja_registros').select('*').eq('empresa_id', empresaId).eq('estado', 'Abierta').order('fecha_apertura', { ascending: false }).limit(50) : emptyResult;
    let salesQuery = !permisoVentas || soloPOS
      ? emptyResult
      : loadAllRows(() => {
          let query = supabase.from('ventas').select('id, cliente, total, fecha, estado_pago').eq('empresa_id', empresaId).gte('fecha', start).order('fecha', { ascending: false });
          if (!roleCanSee(profile, 'ventas_pos', 'Ver ventas de otros usuarios')) query = query.eq('usuario_nombre', userName(profile));
          return query;
        });
    const productsQuery = permisoProductos || permisoPOS
      ? loadAllRows(() => supabase.from('productos').select('*').eq('empresa_id', empresaId).eq('activo', true).order('nombre'))
      : emptyResult;
    const customersQuery = permisoClientes || permisoPOS
      ? supabase.from('clientes').select('id, nombre, nombre_empresa, grupo_clientes').eq('empresa_id', empresaId).order('nombre').limit(1000)
      : emptyResult;
    const groupsQuery = permisoPOS
      ? (async () => {
          const result = await supabase.from('grupos_clientes').select('nombre, grupo_precios').eq('empresa_id', empresaId).eq('activo', true);
          if (!result.error || result.error.code !== '42703') return result;
          const fallback = await supabase.from('grupos_clientes').select('nombre').eq('empresa_id', empresaId).eq('activo', true);
          if (!fallback.error) {
            setNotice({ type: 'warning', message: 'La base de datos no tiene la columna de precios por grupo. Se usará el precio estándar hasta aplicar la migración de base de datos.' });
          }
          return fallback.error ? fallback : {
            data: (fallback.data || []).map((group) => ({ ...group, grupo_precios: null })),
            error: null,
          };
        })()
      : emptyResult;
    const [branchesResult, boxesResult, salesResult, productsResult, customersResult, groupsResult] = await Promise.all([
      branchQuery, boxQuery, salesQuery, productsQuery, customersQuery, groupsQuery,
    ]);
    const failure = [branchesResult, boxesResult, salesResult, productsResult, customersResult, groupsResult].find((result) => result.error);
    if (failure) {
      setNotice({ type: 'error', message: failure.error.message || 'No se pudieron cargar los datos.' });
      setData((current) => ({ ...current, loading: false }));
      return;
    }
    const branches = branchesResult.data || [];
    const openBoxes = boxesResult.data || [];
    const allBranches = profile.todas_localizaciones !== false;
    const userBranch = profile.ubicacion_id;
    const displayName = userName(profile);
    const box = openBoxes.find((candidate) => {
      const sameUser = String(candidate.usuario_id || '') === String(profile.auth_user_id || '')
        || (!candidate.usuario_id && (candidate.usuario === displayName || candidate.usuario === profile.nombre_usuario));
      const sameBranch = String(candidate.ubicacion_id) === String(userBranch)
        || (allBranches && Boolean(candidate.ubicacion_id));
      return sameUser && sameBranch;
    }) || null;
    setData({ loading: false, sales: salesResult.data || [], products: productsResult.data || [], customers: customersResult.data || [], groups: groupsResult.data || [], box, branches });
    if (productsResult.data) setProductsSyncedAt(new Date());
  }, [empresaId, profile, soloPOS, permisoPOS, permisoCaja, permisoProductos, permisoVentas, permisoClientes]);

  useEffect(() => { loadData(); }, [loadData, refresh]);

  const filteredProducts = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase('es');
    return data.products.filter((product) => !normalized
      || product.nombre?.toLocaleLowerCase('es').includes(normalized)
      || product.codigo?.toLocaleLowerCase('es').includes(normalized)
      || product.categoria?.toLocaleLowerCase('es').includes(normalized)
      || product.subcategoria?.toLocaleLowerCase('es').includes(normalized));
  }, [data.products, query]);
  const inventoryCategories = useMemo(() => ['Todos', ...new Set(data.products
    .map((product) => product.categoria?.trim()).filter(Boolean).sort((a, b) => a.localeCompare(b, 'es')))], [data.products]);
  const inventoryProducts = useMemo(() => filteredProducts.filter((product) => {
    const stock = Number(product.stock_actual);
    const minimum = Number(product.stock_minimo || 0);
    const categoryMatches = productCategoryFilter === 'Todos' || product.categoria === productCategoryFilter;
    const stockMatches = productStockFilter === 'Todos'
      || (productStockFilter === 'Con stock' && stock > 0)
      || (productStockFilter === 'Stock bajo' && stock > 0 && stock <= minimum)
      || (productStockFilter === 'Sin stock' && stock <= 0);
    return categoryMatches && stockMatches;
  }), [filteredProducts, productCategoryFilter, productStockFilter]);
  const saleProducts = useMemo(() => filteredProducts.filter((product) => product.activo !== false && product.tipo_producto !== 'Variable'
    && (categoryFilter === 'Todos' || product.categoria === categoryFilter)), [filteredProducts, categoryFilter]);
  const productCategories = useMemo(() => ['Todos', ...new Set(data.products
    .filter((product) => product.activo !== false && product.tipo_producto !== 'Variable')
    .map((product) => product.categoria).filter(Boolean))], [data.products]);
  const totalToday = data.sales.reduce((sum, sale) => sum + Number(sale.total || 0), 0);
  const lowStock = data.products.filter((product) => Number(product.stock_actual) <= Number(product.stock_minimo || 0)).length;
  const cartTotal = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const customer = data.customers.find((item) => String(item.id) === String(customerId)) || null;
  const priceGroupName = data.groups.find((item) => item.nombre === customer?.grupo_clientes)?.grupo_precios?.trim() || '';
  const priceForProduct = (product) => {
    if (priceGroupName && Array.isArray(product?.grupos_precio)) {
      const group = product.grupos_precio.find((item) => String(item.nombre || '').trim().toLocaleLowerCase('es') === priceGroupName.toLocaleLowerCase('es'));
      const groupPrice = Number(group?.precioVenta ?? group?.precio_venta);
      if (Number.isFinite(groupPrice) && groupPrice > 0) return groupPrice;
    }
    return Number(product?.precio_venta ?? product?.precio) || 0;
  };

  useEffect(() => {
    if (!cart.length) return;
    setCart((current) => current.map((item) => {
      const product = data.products.find((candidate) => candidate.id === item.id);
      return product ? { ...item, price: priceForProduct(product) } : item;
    }));
  }, [customerId, data.customers, data.groups, data.products]);

  const updateCart = (product, delta) => setCart((current) => {
    const existing = current.find((item) => item.id === product.id);
    if (!existing && delta > 0) return [...current, { id: product.id, name: product.nombre, price: priceForProduct(product), quantity: 1 }];
    return current.map((item) => item.id === product.id ? { ...item, quantity: item.quantity + delta } : item).filter((item) => item.quantity > 0);
  });

  const addProductByCode = (code) => {
    const value = String(code || '').trim().toLocaleLowerCase('es');
    if (!value) return;
    const match = data.products.find((product) => product.activo !== false && product.tipo_producto !== 'Variable'
      && String(product.codigo || '').trim().toLocaleLowerCase('es') === value);
    if (!match) {
      setNotice({ type: 'error', message: `No encontré un producto con el código ${code}.` });
      return;
    }
    updateCart(match, 1);
    setQuery('');
    setScannerCode('');
    setScannerOpen(false);
    setNotice({ type: 'success', message: `${match.nombre} agregado a la venta.` });
  };
  const handleProductSearchKeyDown = (event) => {
    if (event.key !== 'Enter') return;
    const code = query.trim().toLocaleLowerCase('es');
    const exactProduct = data.products.find((product) => product.activo !== false && product.tipo_producto !== 'Variable'
      && String(product.codigo || '').trim().toLocaleLowerCase('es') === code);
    if (exactProduct) {
      event.preventDefault();
      addProductByCode(code);
    }
  };
  scannerActionRef.current = addProductByCode;

  useEffect(() => {
    if (!scannerOpen) return undefined;
    let controls;
    let cancelled = false;
    const startCameraScanner = async () => {
      if (!navigator.mediaDevices?.getUserMedia || !scannerVideoRef.current) {
        setScannerMessage('Este navegador no permite usar la cámara. Puedes conectar un lector o escribir el código.');
        return;
      }
      try {
        const { BrowserMultiFormatReader } = await import('@zxing/browser');
        if (cancelled) return;
        const reader = new BrowserMultiFormatReader();
        setScannerMessage('Apunta la cámara al código de barras.');
        controls = await reader.decodeFromVideoDevice(undefined, scannerVideoRef.current, (result) => {
          const code = result?.getText();
          if (code) {
            scannerActionRef.current?.(code);
            controls?.stop();
          }
        });
        if (cancelled) controls?.stop();
      } catch (error) {
        setScannerMessage(error?.name === 'NotAllowedError'
          ? 'Permite el acceso a la cámara para escanear, o escribe el código manualmente.'
          : 'No se pudo activar la cámara. Puedes conectar un lector o escribir el código.');
      }
    };
    startCameraScanner();
    return () => { cancelled = true; controls?.stop(); };
  }, [scannerOpen]);

  const processSale = async () => {
    if (!data.box) {
      setNotice({ type: 'error', message: 'Abre una caja desde Caja en el móvil o desde GDA POS antes de cobrar.' });
      return;
    }
    if (!cart.length || paying) return;
    setPaying(true);
    const now = new Date().toISOString();
    const sale = {
      empresa_id: empresaId,
      usuario_nombre: userName(profile),
      personal_servicio: null,
      cliente: customer?.nombre_empresa || customer?.nombre || 'Cliente Ocasional',
      grupo_precio: priceGroupName || null,
      total: cartTotal,
      metodo_pago: saleMethod,
      estado_pago: 'Pagado',
      monto_pagado: cartTotal,
      saldo_pendiente: 0,
      articulos: cart.reduce((count, item) => count + item.quantity, 0),
      descuento: 0,
      cargo_embalaje: 0,
      nota_venta: 'Venta desde GDA POS Móvil',
      moneda_venta: 'PYG',
      tasa_referencia: null,
      margen_porcentaje: null,
      tasa_negocio: null,
      fecha: now,
      caja_id: data.box.id,
      ubicacion_id: data.box.ubicacion_id,
    };
    const items = cart.map((item) => ({ producto_id: item.id, nombre_producto: item.name, cantidad: item.quantity, precio_unitario: item.price }));
    const { data: saleId, error } = await supabase.rpc('registrar_venta', {
      p_venta: sale,
      p_items: items,
      p_ubicacion_id: data.box.ubicacion_id || null,
    });
    setPaying(false);
    if (error) {
      setCartExpanded(false);
      setNotice({ type: 'error', message: error.message?.toLowerCase().includes('stock insuficiente')
        ? error.message : `No se registró la venta: ${error.message}` });
      return;
    }
    setCart([]);
    setCartExpanded(false);
    setScreen(soloPOS ? 'pos' : 'sales');
    setNotice({ type: 'success', message: `Venta #${saleId} registrada y stock actualizado.` });
    setRefresh((value) => value + 1);
  };

  const submitLogin = async (event) => {
    event.preventDefault(); setAuthBusy(true); setAuthError('');
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) { setAuthError('No se pudo iniciar sesión. Revisa el correo y la contraseña.'); setAuthBusy(false); }
  };

  if (authBusy) return <div className="loading-screen"><LoaderCircle className="spin" size={25} /><span>Conectando con tu negocio</span></div>;
  if (!session || !profile) return <main className="auth-screen"><div className="auth-card">
    <div className="brand-lockup"><div className="brand-mark">G</div><div><strong>GDA POS</strong><span>NEGOCIOS, EN MOVIMIENTO</span></div></div>
    <div className="auth-heading"><span className="eyebrow">ACCESO SEGURO</span><h1>Tu operación,<br />en el bolsillo.</h1><p>Inicia sesión con las mismas credenciales de tu sistema.</p></div>
    {authError && <div className="notice notice-error"><CircleAlert size={18} />{authError}</div>}
    <form className="auth-form" onSubmit={submitLogin}>
      <label>Correo electrónico<input autoComplete="username" type="email" value={email} onChange={(event) => setEmail(event.target.value)} required placeholder="nombre@negocio.com" /></label>
      <label>Contraseña<input autoComplete="current-password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} required placeholder="Tu contraseña" /></label>
      <button className="button button-primary button-large" disabled={authBusy}>Entrar a mi negocio <ArrowRight size={17} /></button>
    </form>
    <p className="auth-footnote"><CircleHelp size={15} /> Si no puedes acceder, solicita ayuda al administrador de tu empresa.</p>
  </div><div className="auth-visual"><div className="visual-orb orb-one" /><div className="visual-orb orb-two" /><div className="visual-copy"><span>UNA SOLA OPERACIÓN</span><h2>La misma información.<br />Donde estés.</h2><p>Ventas e inventario sincronizados con GDA POS.</p></div><div className="visual-card"><div className="visual-card-top"><span>VENTA DE HOY</span><span className="status-dot">EN VIVO</span></div><strong>Gs 4.850.000</strong><div className="mini-bars"><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /></div></div></div></main>;

  const screenTitles = { home: 'Inicio', pos: 'Vender', stock: 'Productos', repuestos: 'Repuestos', cash: 'Caja', contacts: 'Clientes', suppliers: 'Proveedores', reports: 'Reportes', quotes: 'Presupuestos', sales: 'Histórico de ventas', purchases: 'Compras', expenses: 'Gastos' };
  const tabs = [
    { id: 'pos', title: 'Vender', Icon: ShoppingCart, allowed: permisoPOS },
    { id: 'stock', title: 'Productos', Icon: Package, allowed: permisoProductos },
    { id: 'cash', title: 'Caja', Icon: Wallet, allowed: permisoCaja },
    { id: 'contacts', title: 'Clientes', Icon: UserRound, allowed: permisoClientes },
    { id: 'reports', title: 'Reportes', Icon: BarChart3, allowed: permisoReportes },
  ].filter((tab) => tab.allowed && (!soloPOS || tab.id === 'pos'));
  const drawerItems = [
    { id: 'home', title: 'Inicio', Icon: LayoutDashboard, allowed: !soloPOS },
    { id: 'pos', title: 'Vender', Icon: ShoppingCart, allowed: permisoPOS },
    { id: 'stock', title: 'Productos', Icon: Package, allowed: permisoProductos },
    { id: 'repuestos', title: 'Repuestos', Icon: Wrench, allowed: permisoProductos },
    { id: 'quotes', title: 'Presupuestos', Icon: ClipboardList, allowed: permisoPOS },
    { id: 'cash', title: 'Caja', Icon: Wallet, allowed: permisoCaja },
    { id: 'contacts', title: 'Clientes', Icon: UserRound, allowed: permisoClientes },
    { id: 'reports', title: 'Reportes', Icon: BarChart3, allowed: permisoReportes },
    { id: 'sales', title: 'Histórico de ventas', Icon: ClipboardList, allowed: permisoVentas },
    { id: 'suppliers', title: 'Proveedores', Icon: Store, allowed: permisoProveedores },
    { id: 'purchases', title: 'Compras', Icon: ShoppingBag, allowed: permisoCompras },
    { id: 'expenses', title: 'Gastos', Icon: Wallet, allowed: permisoGastos },
  ].filter((item) => item.allowed && (!soloPOS || ['pos', 'quotes', 'cash'].includes(item.id)));
  const cambiarPantalla = (nextScreen) => { setScreen(nextScreen); setQuery(''); setDrawerOpen(false); };
  const exportProducts = () => {
    const escapeCsv = (value) => `"${String(value ?? '').replaceAll('"', '""')}"`;
    const columns = [
      ['Código', 'codigo'], ['Producto', 'nombre'], ['Categoría', 'categoria'],
      ['Subcategoría', 'subcategoria'], ['Precio de venta', 'precio_venta'],
      ['Costo', 'precio_compra'], ['Stock', 'stock_actual'], ['Unidad', 'unidad'],
    ];
    const csv = [columns.map(([label]) => escapeCsv(label)).join(';'), ...inventoryProducts.map((product) =>
      columns.map(([, key]) => escapeCsv(key === 'precio_venta' ? (product.precio_venta ?? product.precio) : product[key])).join(';'))].join('\r\n');
    const url = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `productos-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return <div className="app-shell">
    <header className="app-topbar">
      <div className="topbar-leading"><button className="hamburger-button" onClick={() => setDrawerOpen(true)} aria-label="Abrir menú principal"><Menu size={21} /></button><div className="topbar-page-title"><strong>{screenTitles[screen] || 'GDA POS'}</strong><span>{profile.empresas?.nombre || 'Mi negocio'}</span></div></div>
      <div className="topbar-actions"><button className="icon-button refresh-button" onClick={() => setRefresh((value) => value + 1)} aria-label="Actualizar"><RefreshCw size={18} /></button><button className="profile-button" onClick={() => setAccountOpen(true)} aria-label="Abrir cuenta"><span>{userName(profile).charAt(0).toUpperCase()}</span></button></div>
    </header>
    <main className="main-content">
      {notice && <div className={`notice notice-${notice.type}`}><span>{notice.message}</span><button aria-label="Cerrar aviso" onClick={() => setNotice(null)}><X size={17} /></button></div>}
      {data.loading ? <div className="content-loader"><LoaderCircle className="spin" size={24} /> Sincronizando datos</div> : <>
      {!soloPOS && screen === 'home' && <section className="screen-section">
          <div className="welcome-block"><div><span className="eyebrow">{new Date().toLocaleDateString('es-PY', { weekday: 'long', day: 'numeric', month: 'long' }).toUpperCase()}</span><h1>Hola, {userName(profile).split(' ')[0]}.</h1><p>Así está tu negocio hoy.</p></div><div className={`open-state ${data.box ? 'open' : 'closed'}`}><span /><div><strong>{data.box ? 'Caja abierta' : 'Caja cerrada'}</strong><small>{data.box ? data.box.usuario || 'Lista para cobrar' : 'Ábrela desde Caja en el móvil'}</small></div></div></div>
          <div className="hero-stat"><div className="hero-stat-top"><span>VENTAS DE HOY</span><span className="hero-stat-icon"><Activity size={19} /></span></div><strong>{money(totalToday)}</strong><div className="hero-stat-foot"><span>{data.sales.length} operaciones registradas</span><span className="live-indicator"><i /> ACTUALIZADO</span></div></div>
          <div className="metric-grid"><article className="metric-card"><div className="metric-icon gold"><Package size={18} /></div><span>Productos activos</span><strong>{data.products.length}</strong><small>En el catálogo</small></article><article className="metric-card"><div className="metric-icon coral"><CircleAlert size={18} /></div><span>Stock bajo</span><strong>{lowStock}</strong><small>Revisar inventario</small></article></div>
          <div className="section-heading"><div><span className="eyebrow">MOVIMIENTO RECIENTE</span><h2>Últimas ventas</h2></div><button className="text-action" onClick={() => setScreen('sales')}>Ver todas <ArrowRight size={15} /></button></div>
          <SalesList sales={data.sales.slice(0, 4)} />
          <div className="quick-note"><div className="quick-note-icon"><Store size={19} /></div><div><strong>Un solo inventario. En todos tus dispositivos.</strong><p>Las operaciones registradas desde aquí también aparecen en GDA POS.</p></div></div>
        </section>}
        {screen === 'pos' && !data.box && <section className="screen-section pos-locked-screen"><div className="pos-context"><span className="compact-status closed"><i />Caja cerrada</span></div><div className="empty-state"><span className="pos-locked-icon"><DoorOpen size={35} /></span><strong>No hay caja abierta</strong><p>Para vender, abre una caja desde esta app o desde el sistema web. Si acabas de abrirla, búscala en el servidor.</p><div className="pos-locked-actions">{permisoCaja && <button className="button button-primary" onClick={() => setScreen('cash')}><DoorOpen size={17} /> Abrir caja ahora</button>}<button className="button button-secondary" onClick={() => setRefresh((value) => value + 1)}><RefreshCw size={17} /> Buscar caja en servidor</button></div>{!permisoCaja && <span>Si todavía no hay una caja abierta, solicita al encargado que la abra para tu usuario.</span>}</div></section>}
        {screen === 'pos' && data.box && <section className={`screen-section pos-screen ${cart.length ? 'has-cart' : ''}`}>
          <div className="pos-context"><span className={`compact-status ${data.box ? 'open' : 'closed'}`}><i />{data.box ? `Caja #${data.box.id} lista` : 'Caja cerrada'}</span>{data.box?.ubicacion_id && <span className="pos-branch">{data.branches.find((branch) => String(branch.id) === String(data.box.ubicacion_id))?.nombre || 'Sucursal'}</span>}</div>
          <div className="pos-search-row"><div className="search-field"><Search size={19} /><input value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={handleProductSearchKeyDown} placeholder="Buscar producto o escanear código…" /><button className="pos-scan-button" onClick={() => { setScannerCode(''); setScannerMessage(''); setScannerOpen(true); }}><Barcode size={17} /><span>Escanear</span></button></div></div>
          <div className="pos-category-strip" aria-label="Categorías de productos">{productCategories.map((category) => <button key={category} className={categoryFilter === category ? 'active' : ''} onClick={() => setCategoryFilter(category)}>{category === 'Todos' ? <ShoppingCart size={15} /> : <Package size={14} />}{category}</button>)}</div>
          <div className="product-grid pos-product-grid">{saleProducts.map((product) => { const price = priceForProduct(product); const count = cart.find((item) => item.id === product.id)?.quantity || 0; const hasStock = product.stock_actual !== null && product.stock_actual !== undefined && product.stock_actual !== ''; const stock = hasStock ? Number(product.stock_actual) : null; const outOfStock = hasStock && Number.isFinite(stock) && stock <= 0; return <button className={`pos-product-card ${count ? 'selected' : ''} ${outOfStock ? 'out-of-stock' : ''}`} key={product.id} onClick={() => updateCart(product, 1)} disabled={outOfStock}><div className="pos-product-art"><CatalogProductImage product={product} />{count > 0 && <span className="pos-product-count">{count}</span>}</div><div className="pos-product-info"><strong>{product.nombre}</strong><div><span>{money(price)}</span><small className={hasStock && stock <= Number(product.stock_minimo || 0) ? 'low-stock' : ''}>{hasStock && Number.isFinite(stock) ? stock.toLocaleString('es-PY') : '—'}</small></div></div></button>; })}</div>
          {saleProducts.length === 0 && <div className="empty-state"><Package size={32} /><strong>No hay productos para mostrar</strong><p>Prueba otra búsqueda o categoría, o confirma que haya productos activos.</p></div>}
        </section>}
        {screen === 'pos' && data.box && cart.length > 0 && <div className="mobile-cart-bar"><button className="mobile-cart-summary" onClick={() => setCartExpanded(true)}><span><ShoppingCart size={16} /> {cart.reduce((count, item) => count + item.quantity, 0)} {cart.reduce((count, item) => count + item.quantity, 0) === 1 ? 'producto' : 'productos'} <ChevronRight size={14} /></span><strong>{money(cartTotal)}</strong></button><button className="mobile-cart-checkout" onClick={() => setCartExpanded(true)}><CreditCard size={19} /> Cobrar</button></div>}
        {screen === 'pos' && cartExpanded && <div className="cart-sheet-backdrop" onClick={() => setCartExpanded(false)}><section className="cart-sheet" role="dialog" aria-modal="true" aria-label="Carrito de venta" onClick={(event) => event.stopPropagation()}><div className="cart-sheet-heading"><div><span className="eyebrow">VENTA ACTUAL</span><h2>Carrito</h2></div><button className="sheet-close" aria-label="Cerrar carrito" onClick={() => setCartExpanded(false)}><X size={19} /></button></div><div className="cart-sheet-lines">{cart.map((item) => { const product = data.products.find((candidate) => candidate.id === item.id); return <div className="cart-line" key={item.id}><div><strong>{item.name}</strong><small>{money(item.price)} c/u</small></div><div className="quantity-control"><button onClick={() => updateCart(product || { id: item.id }, -1)} aria-label={`Quitar una unidad de ${item.name}`}><Minus size={14} /></button><span>{item.quantity}</span><button onClick={() => updateCart(product || { id: item.id, nombre: item.name, precio_venta: item.price }, 1)} aria-label={`Agregar una unidad de ${item.name}`}><Plus size={14} /></button></div></div>; })}</div><label className="payment-select customer-select">Cliente<select value={customerId} onChange={(event) => setCustomerId(event.target.value)}><option value="">Cliente ocasional</option>{data.customers.map((client) => <option key={client.id} value={client.id}>{client.nombre_empresa || client.nombre || `Cliente ${client.id}`}</option>)}</select></label>{priceGroupName && <div className="price-group-note">Lista de precios: <strong>{priceGroupName}</strong></div>}<label className="payment-select">Medio de pago<select value={saleMethod} onChange={(event) => setSaleMethod(event.target.value)}><option>Efectivo</option><option>Tarjeta</option><option>Transferencia</option><option>QR</option></select></label><div className="cart-sheet-total"><span>Total de la venta</span><strong>{money(cartTotal)}</strong></div><button className="button button-primary checkout-button" disabled={paying || !data.box} onClick={processSale}>{paying ? <><LoaderCircle className="spin" size={18} /> Registrando</> : <>Cobrar {money(cartTotal)} <ArrowRight size={17} /></>}</button>{!data.box && <p className="cart-cash-hint">Abre una caja antes de registrar el cobro.</p>}</section></div>}
        {screen === 'pos' && scannerOpen && <div className="mobile-modal-backdrop scanner-backdrop" onClick={() => setScannerOpen(false)}><section className="mobile-form-card scanner-card" role="dialog" aria-modal="true" aria-label="Escanear producto" onClick={(event) => event.stopPropagation()}><div className="mobile-form-heading"><div><span className="eyebrow">LECTOR DE CÓDIGO</span><h2>Escanear producto</h2></div><button className="sheet-close" aria-label="Cerrar escáner" onClick={() => setScannerOpen(false)}><X size={19} /></button></div><div className="scanner-camera"><video ref={scannerVideoRef} autoPlay muted playsInline /><span><Camera size={20} /> Escáner de cámara</span></div><p className="form-footnote">{scannerMessage || 'Si la cámara no detecta el código, usa el campo manual o un lector conectado.'}</p><form className="scanner-manual-form" onSubmit={(event) => { event.preventDefault(); addProductByCode(scannerCode); }}><label>Código del producto<input autoFocus value={scannerCode} onChange={(event) => setScannerCode(event.target.value)} placeholder="Escanea aquí o escribe el código" /></label><button className="button button-primary" type="submit" disabled={!scannerCode.trim()}><Barcode size={17} /> Agregar producto</button></form></section></div>}
        {['stock', 'repuestos'].includes(screen) && <section className={`screen-section ${screen === 'stock' ? 'mobile-products-screen' : ''}`}>
          <div className="screen-title"><div><span className="eyebrow">INVENTARIO</span><h1>{screen === 'repuestos' ? 'Repuestos' : 'Productos'}</h1><p>{data.products.length.toLocaleString('es-PY')} productos · {productsSyncedAt ? `actualizado ${productsSyncedAt.toLocaleTimeString('es-PY', { hour: '2-digit', minute: '2-digit' })}` : 'sin sincronizar'}</p></div>{permisoCrearProducto && screen !== 'stock' && <button className="button button-primary mobile-create-button" onClick={() => setProductFormOpen(true)}><Plus size={16} /> Nuevo</button>}</div>
          <div className="mobile-products-tools"><label className="search-field"><Search size={19} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar por nombre o código" /></label><button className={`mobile-products-icon-button ${productFiltersOpen ? 'active' : ''}`} aria-label="Filtrar productos" aria-expanded={productFiltersOpen} onClick={() => setProductFiltersOpen((open) => !open)}><SlidersHorizontal size={20} /></button><button className="mobile-products-icon-button" aria-label="Exportar productos filtrados a CSV" onClick={exportProducts}><Download size={20} /></button></div>
          {productFiltersOpen && <div className="mobile-products-filter-panel"><label>Categoría<select value={productCategoryFilter} onChange={(event) => setProductCategoryFilter(event.target.value)}>{inventoryCategories.map((category) => <option key={category}>{category}</option>)}</select></label><label>Disponibilidad<select value={productStockFilter} onChange={(event) => setProductStockFilter(event.target.value)}>{['Todos', 'Con stock', 'Stock bajo', 'Sin stock'].map((filter) => <option key={filter}>{filter}</option>)}</select></label><button onClick={() => { setProductCategoryFilter('Todos'); setProductStockFilter('Todos'); }}>Limpiar filtros</button></div>}
          <div className="mobile-products-categories" aria-label="Categorías de productos">{inventoryCategories.map((category) => <button key={category} className={productCategoryFilter === category ? 'active' : ''} onClick={() => setProductCategoryFilter(category)}>{category === 'Todos' ? <><Check size={15} /><ShoppingCart size={15} /></> : <Package size={16} />}{category}</button>)}</div>
          <div className="mobile-products-count"><RefreshCw size={15} />{inventoryProducts.length.toLocaleString('es-PY')} productos{query || productCategoryFilter !== 'Todos' || productStockFilter !== 'Todos' ? ' encontrados' : ''} · {productsSyncedAt ? `sync ${productsSyncedAt.toLocaleTimeString('es-PY', { hour: '2-digit', minute: '2-digit' })}` : 'sin sincronizar'}</div>
          <div className="inventory-list mobile-products-list">{inventoryProducts.map((product) => { const quantity = Number(product.stock_actual); const critical = Number.isFinite(quantity) && quantity <= Number(product.stock_minimo || 0); const image = product.imagen_url || product.imagen; return <article className="inventory-row mobile-product-row" key={product.id}><div className="inventory-art">{image ? <img src={image} alt={product.nombre || ''} loading="lazy" /> : <Package size={21} />}</div><div className="inventory-name"><strong>{product.nombre}</strong><span>{[product.categoria, product.subcategoria].filter(Boolean).join(' · ') || 'Sin categoría'}</span><small>#{product.codigo || 'Sin código'} · Stock: {Number.isFinite(quantity) ? quantity.toLocaleString('es-PY') : '—'}{product.unidad ? ` ${product.unidad}` : ''}</small></div><div className={`mobile-product-price ${critical ? 'critical' : ''}`}>{money(product.precio_venta ?? product.precio)}</div></article>; })}{inventoryProducts.length === 0 && <div className="empty-state"><Package size={32} /><strong>No hay productos para mostrar</strong><p>Ajusta la búsqueda o los filtros y vuelve a intentar.</p></div>}</div>
          {permisoCrearProducto && screen === 'stock' && <button className="mobile-products-create" onClick={() => setProductFormOpen(true)}><Plus size={23} /> Nuevo producto</button>}
        </section>}
        {(screen === 'cash' || (!soloPOS && ['sales', 'contacts', 'suppliers', 'purchases', 'expenses', 'reports'].includes(screen))) && <MobileModules
          screen={screen}
          empresaId={empresaId}
          profile={profile}
          cashBox={data.box}
          branches={data.branches}
          products={data.products}
          allowCustomers={permisoClientes}
          allowCreateCustomers={permisoCrearCliente}
          onClientSaved={() => setRefresh((value) => value + 1)}
          allowSuppliers={permisoProveedores}
          allowPurchases={permisoCompras}
          allowExpenses={permisoGastos}
          allowCashHistory={permisoCajaHistorial}
          allowOpenCash={roleCanSee(profile, 'caja', 'Abrir caja')}
          allowCloseCash={roleCanSee(profile, 'caja', 'Cerrar caja')}
          onCashChanged={(box) => { setData((current) => ({ ...current, box })); if (box?.estado === 'Abierta') setScreen('pos'); }}
          allowReports={permisoReportes}
          allowSales={permisoVentas}
          allowAllSales={permisoVerOtrasVentas || roleCanSee(profile, 'informes', 'Ver Ganancias y Pérdidas')}
          allowProducts={permisoProductos}
          onGoToScreen={cambiarPantalla}
        />}
        {screen === 'quotes' && permisoPOS && <MobileQuotes empresaId={empresaId} profile={profile} />}
      </>}
    </main>
    {productFormOpen && <MobileProductForm empresaId={empresaId} profile={profile} onClose={() => setProductFormOpen(false)} onSaved={() => setRefresh((value) => value + 1)} />}
    <nav className="bottom-nav" aria-label="Acceso rápido">{tabs.map(({ id, title, Icon }) => <button className={screen === id ? 'active' : ''} key={id} onClick={() => cambiarPantalla(id)}><Icon size={20} strokeWidth={screen === id ? 2.3 : 1.8} /><span>{title}</span></button>)}</nav>
    {drawerOpen && <div className="drawer-backdrop" onClick={() => setDrawerOpen(false)}><nav className="drawer-panel" aria-label="Menú principal" onClick={(event) => event.stopPropagation()}><div className="drawer-header"><div className="brand-lockup compact"><div className="brand-mark">G</div><div><strong>GDA POS</strong><span>{profile.empresas?.nombre || 'Mi negocio'}</span></div></div><button className="sheet-close" aria-label="Cerrar menú" onClick={() => setDrawerOpen(false)}><X size={19} /></button></div><span className="drawer-section-label">MENÚ</span><div className="drawer-links">{drawerItems.map(({ id, title, Icon }) => <button key={id} className={screen === id ? 'active' : ''} onClick={() => cambiarPantalla(id)}><Icon size={19} /><span>{title}</span></button>)}</div><button className="drawer-profile" onClick={() => { setDrawerOpen(false); setAccountOpen(true); }}><span className="account-avatar">{userName(profile).charAt(0).toUpperCase()}</span><span><strong>{userName(profile)}</strong><small>{profile.roles?.nombre || 'Usuario'}</small></span><ChevronRight size={17} /></button></nav></div>}
    {accountOpen && <div className="sheet-backdrop" onClick={() => setAccountOpen(false)}><section className="account-sheet" onClick={(event) => event.stopPropagation()}><div className="sheet-handle" /><button className="sheet-close" aria-label="Cerrar cuenta" onClick={() => setAccountOpen(false)}><X size={19} /></button><div className="account-avatar">{userName(profile).charAt(0).toUpperCase()}</div><h2>{userName(profile)}</h2><p>{profile.email}</p><div className="account-business"><Store size={17} /><span>{profile.empresas?.nombre}</span></div><div className="account-detail"><UserRound size={17} /><span>{profile.roles?.nombre || 'Usuario'}</span></div><button className="signout-button" onClick={() => supabase.auth.signOut()}><LogOut size={17} /> Cerrar sesión</button><span className="version-label">GDA POS MÓVIL · INFORMACIÓN SINCRONIZADA</span></section></div>}
  </div>;
}

function SalesList({ sales }) {
  if (!sales.length) return <div className="empty-state"><Clock3 size={28} /><strong>Aún no hay ventas hoy</strong><p>Cuando registres una venta, aparecerá aquí.</p></div>;
  return <div className="sales-list">{sales.map((sale) => <article className="sale-row" key={sale.id}><div className="sale-icon"><ArrowDownLeft size={18} /></div><div className="sale-info"><strong>{sale.cliente || 'Cliente ocasional'}</strong><span>{new Date(sale.fecha).toLocaleTimeString('es-PY', { hour: '2-digit', minute: '2-digit' })} · Venta #{sale.id}</span></div><div className="sale-value"><strong>{money(sale.total)}</strong><span>{sale.estado_pago || 'Registrada'}</span></div><ChevronRight size={16} className="sale-chevron" /></article>)}</div>;
}

function CatalogProductImage({ product }) {
  const [failed, setFailed] = useState(false);
  const source = product.imagen_url || product.imagen;
  if (!source || failed) return <Package size={42} strokeWidth={1.5} />;
  return <img src={source} alt={product.nombre || 'Producto'} loading="lazy" onError={() => setFailed(true)} />;
}

export default MobileApp;
