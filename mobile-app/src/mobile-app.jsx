import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity, ArrowDownLeft, ArrowRight, Barcode, Check, ChevronRight, CircleAlert,
  CircleHelp, ClipboardList, Clock3, CreditCard, DoorOpen, LayoutDashboard, LoaderCircle,
  LogOut, Minus, Package, Plus, RefreshCw, Search, ShoppingBag, ShoppingCart, Store,
  UserRound, Wallet, X,
} from 'lucide-react';
import { supabase } from '../../src/supabaseClient';

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
const roleCanSee = (profile, category) => {
  const role = (profile?.roles?.nombre || '').toLowerCase();
  if (role.includes('admin') || role.includes('desarrollador') || !profile?.roles?.permisos) return true;
  return Object.values(profile.roles.permisos[category] || {}).some(Boolean);
};

function MobileApp() {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [authBusy, setAuthBusy] = useState(true);
  const [authError, setAuthError] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [screen, setScreen] = useState('home');
  const [menuOpen, setMenuOpen] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const [data, setData] = useState({ loading: true, sales: [], products: [], customers: [], groups: [], box: null, branches: [] });
  const [query, setQuery] = useState('');
  const [customerId, setCustomerId] = useState('');
  const [cart, setCart] = useState([]);
  const [paying, setPaying] = useState(false);
  const [notice, setNotice] = useState(null);
  const [saleMethod, setSaleMethod] = useState('Efectivo');

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
  const permisoPOS = roleCanSee(profile, 'ventas_pos');
  const permisoProductos = roleCanSee(profile, 'productos');
  const permisoVentas = roleCanSee(profile, 'ventas_pos');
  const soloPOS = Boolean(profile && !['admin', 'desarrollador'].some((role) => (profile.roles?.nombre || '').toLowerCase().includes(role))
    && profile.roles?.permisos?.ventas_pos?.['Solo Punto de Venta (bloquea todo lo demás)']);

  useEffect(() => {
    if (soloPOS) setScreen('pos');
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
    const branchQuery = supabase.from('ubicaciones_comerciales').select('id, nombre').eq('empresa_id', empresaId).eq('activo', true).order('nombre');
    const boxQuery = supabase.from('caja_registros').select('*').eq('empresa_id', empresaId).eq('estado', 'Abierta').order('fecha_apertura', { ascending: false }).limit(20);
    const salesQuery = soloPOS
      ? Promise.resolve({ data: [], error: null })
      : loadAllRows(() => supabase.from('ventas').select('id, cliente, total, fecha, estado_pago').eq('empresa_id', empresaId).gte('fecha', start).order('fecha', { ascending: false }));
    const productsQuery = loadAllRows(() => supabase.from('productos').select('*').eq('empresa_id', empresaId).eq('activo', true).order('nombre'));
    const [branchesResult, boxesResult, salesResult, productsResult, customersResult, groupsResult] = await Promise.all([
      branchQuery,
      boxQuery,
      salesQuery,
      productsQuery,
      supabase.from('clientes').select('id, nombre, nombre_empresa, grupo_clientes').eq('empresa_id', empresaId).order('nombre').limit(1000),
      supabase.from('grupos_clientes').select('nombre, grupo_precios').eq('empresa_id', empresaId).eq('activo', true),
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
      const sameUser = candidate.usuario_id === profile.auth_user_id
        || (!candidate.usuario_id && (candidate.usuario === displayName || candidate.usuario === profile.nombre_usuario));
      const sameBranch = String(candidate.ubicacion_id) === String(userBranch)
        || (allBranches && Boolean(candidate.ubicacion_id));
      return sameUser && sameBranch;
    }) || null;
    setData({ loading: false, sales: salesResult.data || [], products: productsResult.data || [], customers: customersResult.data || [], groups: groupsResult.data || [], box, branches });
  }, [empresaId, profile, soloPOS]);

  useEffect(() => { loadData(); }, [loadData, refresh]);

  const filteredProducts = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase('es');
    return data.products.filter((product) => !normalized
      || product.nombre?.toLocaleLowerCase('es').includes(normalized)
      || product.codigo?.toLocaleLowerCase('es').includes(normalized));
  }, [data.products, query]);
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

  const processSale = async () => {
    if (!data.box) {
      setNotice({ type: 'error', message: 'Abre tu caja desde GDA POS antes de cobrar desde el móvil.' });
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
      setNotice({ type: 'error', message: error.message?.toLowerCase().includes('stock insuficiente')
        ? error.message : `No se registró la venta: ${error.message}` });
      return;
    }
    setCart([]);
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

  const tabs = [
    { id: 'home', title: 'Inicio', Icon: LayoutDashboard, allowed: true },
    { id: 'pos', title: 'Cobrar', Icon: ShoppingCart, allowed: permisoPOS },
    { id: 'stock', title: 'Productos', Icon: Package, allowed: permisoProductos },
    { id: 'sales', title: 'Ventas', Icon: ClipboardList, allowed: permisoVentas },
  ].filter((tab) => tab.allowed && (!soloPOS || tab.id === 'pos'));

  return <div className="app-shell">
    <header className="app-topbar"><div className="brand-lockup compact"><div className="brand-mark">G</div><div><strong>GDA POS</strong><span>{profile.empresas?.nombre || 'Mi negocio'}</span></div></div>
      <div className="topbar-actions"><button className="icon-button refresh-button" onClick={() => setRefresh((value) => value + 1)} aria-label="Actualizar"><RefreshCw size={18} /></button><button className="profile-button" onClick={() => setMenuOpen(true)} aria-label="Abrir menú"><span>{userName(profile).charAt(0).toUpperCase()}</span></button></div>
    </header>
    <main className="main-content">
      {notice && <div className={`notice notice-${notice.type}`}><span>{notice.message}</span><button aria-label="Cerrar aviso" onClick={() => setNotice(null)}><X size={17} /></button></div>}
      {data.loading ? <div className="content-loader"><LoaderCircle className="spin" size={24} /> Sincronizando datos</div> : <>
      {!soloPOS && screen === 'home' && <section className="screen-section">
          <div className="welcome-block"><div><span className="eyebrow">{new Date().toLocaleDateString('es-PY', { weekday: 'long', day: 'numeric', month: 'long' }).toUpperCase()}</span><h1>Hola, {userName(profile).split(' ')[0]}.</h1><p>Así está tu negocio hoy.</p></div><div className={`open-state ${data.box ? 'open' : 'closed'}`}><span /><div><strong>{data.box ? 'Caja abierta' : 'Caja cerrada'}</strong><small>{data.box ? data.box.usuario || 'Lista para cobrar' : 'Desde computadora, ábrela primero'}</small></div></div></div>
          <div className="hero-stat"><div className="hero-stat-top"><span>VENTAS DE HOY</span><span className="hero-stat-icon"><Activity size={19} /></span></div><strong>{money(totalToday)}</strong><div className="hero-stat-foot"><span>{data.sales.length} operaciones registradas</span><span className="live-indicator"><i /> ACTUALIZADO</span></div></div>
          <div className="metric-grid"><article className="metric-card"><div className="metric-icon gold"><Package size={18} /></div><span>Productos activos</span><strong>{data.products.length}</strong><small>En el catálogo</small></article><article className="metric-card"><div className="metric-icon coral"><CircleAlert size={18} /></div><span>Stock bajo</span><strong>{lowStock}</strong><small>Revisar inventario</small></article></div>
          <div className="section-heading"><div><span className="eyebrow">MOVIMIENTO RECIENTE</span><h2>Últimas ventas</h2></div><button className="text-action" onClick={() => setScreen('sales')}>Ver todas <ArrowRight size={15} /></button></div>
          <SalesList sales={data.sales.slice(0, 4)} />
          <div className="quick-note"><div className="quick-note-icon"><Store size={19} /></div><div><strong>Un solo inventario. En todos tus dispositivos.</strong><p>Las operaciones registradas desde aquí también aparecen en GDA POS.</p></div></div>
        </section>}
        {screen === 'pos' && <section className="screen-section pos-screen">
          <div className="screen-title"><div><span className="eyebrow">PUNTO DE VENTA</span><h1>Nueva venta</h1><p>Selecciona los productos que llevará tu cliente.</p></div><div className={`compact-status ${data.box ? 'open' : 'closed'}`}><i />{data.box ? 'Caja lista' : 'Caja cerrada'}</div></div>
          {!data.box && <div className="notice notice-error"><DoorOpen size={18} /><span>Abre tu caja en el sistema de escritorio para habilitar cobros móviles.</span></div>}
          <div className="search-field"><Search size={19} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar producto o código" /><Barcode size={19} /></div>
          {cart.length > 0 && <div className="cart-preview"><div className="cart-preview-heading"><span><ShoppingBag size={17} /> {cart.length} artículos</span><strong>{money(cartTotal)}</strong></div><label className="payment-select customer-select">Cliente<select value={customerId} onChange={(event) => setCustomerId(event.target.value)}><option value="">Cliente ocasional</option>{data.customers.map((client) => <option key={client.id} value={client.id}>{client.nombre_empresa || client.nombre || `Cliente ${client.id}`}</option>)}</select></label>{priceGroupName && <div className="price-group-note">Lista de precios: <strong>{priceGroupName}</strong></div>}{cart.map((item) => <div className="cart-line" key={item.id}><div><strong>{item.name}</strong><small>{money(item.price)} c/u</small></div><div className="quantity-control"><button onClick={() => updateCart({ id: item.id }, -1)} aria-label="Restar"><Minus size={14} /></button><span>{item.quantity}</span><button onClick={() => updateCart({ id: item.id, nombre: item.name, precio_venta: item.price }, 1)} aria-label="Sumar"><Plus size={14} /></button></div></div>)}<label className="payment-select">Medio de pago<select value={saleMethod} onChange={(event) => setSaleMethod(event.target.value)}><option>Efectivo</option><option>Tarjeta</option><option>Transferencia</option><option>QR</option></select></label><button className="button button-primary checkout-button" disabled={paying || !data.box} onClick={processSale}>{paying ? <><LoaderCircle className="spin" size={18} /> Registrando</> : <>Cobrar {money(cartTotal)} <ArrowRight size={17} /></>}</button></div>}
          <div className="product-grid">{filteredProducts.map((product) => { const price = Number(product.precio_venta || product.precio || 0); const count = cart.find((item) => item.id === product.id)?.quantity || 0; return <button className={`mobile-product ${count ? 'selected' : ''}`} key={product.id} onClick={() => updateCart(product, 1)}><div className="product-art">{product.imagen_url || product.imagen ? <img src={product.imagen_url || product.imagen} alt="" /> : <Package size={25} />}{count > 0 && <span className="product-count">{count}</span>}</div><div className="mobile-product-info"><strong>{product.nombre}</strong><span>{money(price)}</span></div><Plus className="product-add" size={18} /></button>; })}</div>
          {filteredProducts.length === 0 && <div className="empty-state"><Package size={32} /><strong>No hay productos para mostrar</strong><p>Prueba otro nombre o confirma que el producto esté activo.</p></div>}
        </section>}
        {screen === 'stock' && <section className="screen-section"><div className="screen-title"><div><span className="eyebrow">INVENTARIO</span><h1>Productos</h1><p>{data.products.length} artículos activos</p></div></div><div className="search-field"><Search size={19} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar por nombre o código" /></div><div className="inventory-list">{filteredProducts.map((product) => { const quantity = Number(product.stock_actual); const critical = Number.isFinite(quantity) && quantity <= Number(product.stock_minimo || 0); return <article className="inventory-row" key={product.id}><div className="inventory-art">{product.imagen_url || product.imagen ? <img src={product.imagen_url || product.imagen} alt="" /> : <Package size={20} />}</div><div className="inventory-name"><strong>{product.nombre}</strong><span>{product.codigo || product.categoria || 'Sin código'}</span></div><div className={`stock-value ${critical ? 'critical' : ''}`}><strong>{Number.isFinite(quantity) ? quantity.toLocaleString('es-PY') : '—'}</strong><small>{product.unidad || 'unid.'}</small></div></article>; })}</div></section>}
        {!soloPOS && screen === 'sales' && <section className="screen-section"><div className="screen-title"><div><span className="eyebrow">REGISTRO DEL DÍA</span><h1>Ventas</h1><p>{data.sales.length} movimientos recientes</p></div></div><SalesList sales={data.sales} /></section>}
      </>}
    </main>
    <nav className="bottom-nav">{tabs.map(({ id, title, Icon }) => <button className={screen === id ? 'active' : ''} key={id} onClick={() => { setScreen(id); setQuery(''); }}><Icon size={20} strokeWidth={screen === id ? 2.3 : 1.8} /><span>{title}</span></button>)}</nav>
    {menuOpen && <div className="sheet-backdrop" onClick={() => setMenuOpen(false)}><section className="account-sheet" onClick={(event) => event.stopPropagation()}><div className="sheet-handle" /><button className="sheet-close" aria-label="Cerrar menú" onClick={() => setMenuOpen(false)}><X size={19} /></button><div className="account-avatar">{userName(profile).charAt(0).toUpperCase()}</div><h2>{userName(profile)}</h2><p>{profile.email}</p><div className="account-business"><Store size={17} /><span>{profile.empresas?.nombre}</span></div><div className="account-detail"><UserRound size={17} /><span>{profile.roles?.nombre || 'Usuario'}</span></div><button className="signout-button" onClick={() => supabase.auth.signOut()}><LogOut size={17} /> Cerrar sesión</button><span className="version-label">GDA POS MÓVIL · INFORMACIÓN SINCRONIZADA</span></section></div>}
  </div>;
}

function SalesList({ sales }) {
  if (!sales.length) return <div className="empty-state"><Clock3 size={28} /><strong>Aún no hay ventas hoy</strong><p>Cuando registres una venta, aparecerá aquí.</p></div>;
  return <div className="sales-list">{sales.map((sale) => <article className="sale-row" key={sale.id}><div className="sale-icon"><ArrowDownLeft size={18} /></div><div className="sale-info"><strong>{sale.cliente || 'Cliente ocasional'}</strong><span>{new Date(sale.fecha).toLocaleTimeString('es-PY', { hour: '2-digit', minute: '2-digit' })} · Venta #{sale.id}</span></div><div className="sale-value"><strong>{money(sale.total)}</strong><span>{sale.estado_pago || 'Registrada'}</span></div><ChevronRight size={16} className="sale-chevron" /></article>)}</div>;
}

export default MobileApp;
