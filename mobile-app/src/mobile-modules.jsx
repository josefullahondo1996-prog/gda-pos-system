import { useEffect, useMemo, useRef, useState } from 'react';
import { Activity, ArrowDownLeft, ArrowLeft, Banknote, Building2, CalendarDays, Check, ChevronDown, CircleAlert, CircleMinus, CirclePlus, ClipboardList, Clock3, DoorOpen, Download, FileText, LoaderCircle, LockKeyhole, Package, Plus, Printer, RefreshCw, Search, Share2, SlidersHorizontal, Store, Trash2, TrendingUp, UserRound, Wallet, X } from 'lucide-react';
import { supabase } from './supabaseClient.js';
import { MobileClientForm } from './mobile-create-modules.jsx';

const money = (value) => `Gs ${Math.round(Number(value) || 0).toLocaleString('es-PY')}`;
const stamp = (value) => {
  if (!value) return 'Sin fecha';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? 'Sin fecha' : parsed.toLocaleDateString('es-PY', { day: '2-digit', month: 'short', year: 'numeric' });
};
const personName = (profile) => [profile?.nombre, profile?.apellido].filter(Boolean).join(' ').trim()
  || profile?.nombre_usuario || profile?.email || 'Equipo';
const startOfRange = (days) => {
  const date = new Date();
  date.setDate(date.getDate() - Number(days) + 1);
  date.setHours(0, 0, 0, 0);
  return date.toISOString();
};
const startDateOfRange = (days) => {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() - Number(days) + 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};
const localDateKey = (date = new Date()) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const localDateBounds = (day) => {
  const from = new Date(`${day}T00:00:00`);
  const to = new Date(from); to.setDate(to.getDate() + 1);
  return { from: from.toISOString(), to: to.toISOString() };
};
const dateLabel = (day, options = { day: '2-digit', month: 'short' }) => new Date(`${day}T12:00:00`).toLocaleDateString('es-PY', options);
const loadRows = async (makeQuery) => {
  const rows = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await makeQuery().range(from, from + 999);
    if (error) return { data: null, error };
    rows.push(...(data || []));
    if (!data || data.length < 1000) break;
  }
  return { data: rows, error: null };
};
const exportClients = (rows) => {
  const csv = ['Codigo,Nombre,Empresa,Documento,Celular,Correo,Grupo', ...rows.map((row) => [row.codigo_cliente || row.id, row.nombre, row.nombre_empresa, row.documento_nro, row.celular, row.email, row.grupo_clientes].map((value) => `"${String(value || '').replaceAll('"', '""')}"`).join(','))].join('\n');
  const url = URL.createObjectURL(new Blob(['\ufeff', csv], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a'); link.href = url; link.download = 'clientes.csv'; link.click(); URL.revokeObjectURL(url);
};

export default function MobileModules({ screen, empresaId, profile, cashBox, branches = [], products = [], allowCustomers, allowSuppliers, allowPurchases, allowExpenses, allowCashHistory, allowOpenCash, allowCloseCash, onCashChanged, allowReports, allowSales, allowAllSales, allowProducts, allowCreateCustomers, onClientSaved, onGoToScreen }) {
  const [data, setData] = useState({ loading: true, rows: [], sales: [], expenses: [], purchases: [], details: [], detailsUnavailable: false, collections: [], clientDebts: {}, error: '' });
  const [query, setQuery] = useState('');
  const [contactType, setContactType] = useState(screen === 'suppliers' ? 'suppliers' : 'customers');
  const [reload, setReload] = useState(0);
  const [reportDate, setReportDate] = useState(localDateKey());
  const [reportCategory, setReportCategory] = useState('all');
  const [salesDays, setSalesDays] = useState(30);
  const [clientFormOpen, setClientFormOpen] = useState(false);
  const [debtOnly, setDebtOnly] = useState(false);
  const [closedReport, setClosedReport] = useState(null);
  const isContacts = screen === 'contacts' || screen === 'suppliers';

  useEffect(() => {
    if (screen === 'suppliers') setContactType('suppliers');
    if (screen === 'contacts') setContactType('customers');
  }, [screen]);

  useEffect(() => {
    let live = true;
    const load = async () => {
      if (!empresaId) return;
      setData({ loading: true, rows: [], sales: [], expenses: [], purchases: [], details: [], detailsUnavailable: false, collections: [], clientDebts: {}, error: '' });
      let result = { data: [], error: null };
      if (isContacts) {
        const table = contactType === 'customers' ? 'clientes' : 'proveedores';
        const columns = contactType === 'customers'
          ? 'id, tipo_contacto, codigo_cliente, documento_nro, nombre, nombre_empresa, celular, email, grupo_clientes, saldo_apertura, estado'
          : 'id, empresa, nombre_contacto, email, ruc, termino_pago, saldo';
        result = await loadRows(() => {
          let contactQuery = supabase.from(table).select(columns).eq('empresa_id', empresaId);
          if (contactType === 'customers') contactQuery = contactQuery.or('tipo_contacto.is.null,tipo_contacto.neq.Proveedores');
          return contactQuery.order('id', { ascending: false });
        });
        if (contactType === 'customers' && !result.error) {
          const outstanding = await loadRows(() => supabase.from('ventas').select('cliente, saldo_pendiente').eq('empresa_id', empresaId).gt('saldo_pendiente', 0));
          if (outstanding.error) result = { ...result, error: outstanding.error };
          else {
            const clientDebts = {};
            for (const sale of outstanding.data || []) {
              const key = String(sale.cliente || '').trim().toLocaleLowerCase('es');
              if (key) clientDebts[key] = (clientDebts[key] || 0) + (Number(sale.saldo_pendiente) || 0);
            }
            result = { ...result, clientDebts };
          }
        }
      } else if (screen === 'purchases') {
        result = await supabase.from('compras').select('id, proveedor_nombre, nro_factura, total, saldo_pendiente, estado, estado_compra, fecha, ubicacion').eq('empresa_id', empresaId).order('fecha', { ascending: false }).limit(500);
      } else if (screen === 'expenses') {
        result = await supabase.from('gastos').select('id, descripcion, monto, categoria, metodo_pago, fecha').eq('empresa_id', empresaId).order('fecha', { ascending: false }).limit(500);
      } else if (screen === 'sales') {
        const start = salesDays ? startOfRange(salesDays) : null;
        let salesQuery = () => {
          let request = supabase.from('ventas')
            .select('id, usuario_nombre, cliente, total, metodo_pago, fecha, estado_pago')
            .eq('empresa_id', empresaId)
            .order('fecha', { ascending: false })
            .order('id', { ascending: false });
          if (start) request = request.gte('fecha', start);
          if (!allowAllSales) request = request.eq('usuario_nombre', personName(profile));
          return request;
        };
        const salesResult = await loadRows(salesQuery);
        result = salesResult.error
          ? { data: [], error: salesResult.error }
          : { data: [], error: null, sales: salesResult.data || [] };
      } else if (screen === 'cash') {
        result = await supabase.from('caja_registros').select('id, fecha_apertura, fecha_cierre, saldo_inicial, saldo_final, conteo_real, nota_cierre, estado, ubicacion_id, usuario, usuario_id, rendicion_final').eq('empresa_id', empresaId).order('fecha_apertura', { ascending: false }).limit(50);
        if (!result.error && !allowCashHistory) {
          const userId = String(profile?.auth_user_id || '');
          const name = personName(profile);
          result = { ...result, data: (result.data || []).filter((row) => row.estado === 'Abierta' && (String(row.usuario_id || '') === userId || (!row.usuario_id && row.usuario === name))) };
        }
      } else if (screen === 'reports') {
        const { from, to } = localDateBounds(reportDate);
        const makeSalesQuery = () => {
          let salesQuery = supabase.from('ventas').select('id, usuario_nombre, cliente, total, monto_pagado, saldo_pendiente, metodo_pago, fecha, caja_id, ubicacion_id, estado_pago').eq('empresa_id', empresaId).gte('fecha', from).lt('fecha', to).order('fecha', { ascending: true }).order('id', { ascending: true });
          if (!allowAllSales) salesQuery = salesQuery.eq('usuario_nombre', personName(profile));
          return salesQuery;
        };
        const [salesResult, expensesResult, purchasesResult, collectionsResult] = await Promise.all([
          allowReports && allowSales ? loadRows(makeSalesQuery) : Promise.resolve({ data: [], error: null }),
          allowExpenses ? loadRows(() => supabase.from('gastos').select('id, monto, fecha, descripcion, categoria, metodo_pago, caja_id, cuenta_pago').eq('empresa_id', empresaId).eq('fecha', reportDate).order('fecha', { ascending: true }).order('id', { ascending: true })) : Promise.resolve({ data: [], error: null }),
          allowPurchases ? loadRows(() => supabase.from('compras').select('id, total, fecha').eq('empresa_id', empresaId).gte('fecha', from).lt('fecha', to).order('fecha', { ascending: true }).order('id', { ascending: true })) : Promise.resolve({ data: [], error: null }),
          allowReports && allowSales ? loadRows(() => supabase.from('pagos_clientes').select('id, monto, metodo_pago, fecha, nota').eq('empresa_id', empresaId).gte('fecha', from).lt('fecha', to).order('fecha', { ascending: true }).order('id', { ascending: true })) : Promise.resolve({ data: [], error: null }),
        ]);
        let detailsUnavailable = false;
        let detailResult = salesResult.error || !salesResult.data?.length ? { data: [], error: null }
          : await loadRows(() => supabase.from('detalle_ventas').select('id, venta_id, nombre_producto, cantidad, precio_unitario, precio_costo, descuento, impuesto, subtotal').in('venta_id', salesResult.data.map((sale) => sale.id)));
        if (detailResult.error && salesResult.data?.length) {
          // Cost/tax columns are not present in every deployed schema revision.
          // Keep the sales report usable and retry with fields shared by older schemas.
          // Sale IDs were already read with empresa_id filtering above; they safely scope this detail lookup too.
          detailResult = await loadRows(() => supabase.from('detalle_ventas').select('venta_id, nombre_producto, cantidad, precio_unitario')
            .in('venta_id', salesResult.data.map((sale) => sale.id)));
          detailsUnavailable = true;
          if (detailResult.error) detailResult = { data: [], error: null };
        }
        const failure = [salesResult, expensesResult, purchasesResult].find((item) => item.error);
        if (failure) result = { data: [], error: failure.error };
        else result = { data: [], error: null, sales: salesResult.data || [], expenses: expensesResult.data || [], purchases: purchasesResult.data || [], details: detailResult.data || [], detailsUnavailable, collections: collectionsResult.error ? [] : collectionsResult.data || [], collectionsUnavailable: Boolean(collectionsResult.error) };
      }
      if (!live) return;
      setData({ loading: false, rows: result.data || [], sales: result.sales || [], expenses: result.expenses || [], purchases: result.purchases || [], details: result.details || [], detailsUnavailable: result.detailsUnavailable || false, collections: result.collections || [], collectionsUnavailable: result.collectionsUnavailable || false, clientDebts: result.clientDebts || {}, error: result.error?.message || '' });
    };
    load();
    return () => { live = false; };
  }, [screen, empresaId, contactType, reload, reportDate, salesDays, allowCashHistory, allowReports, allowSales, allowAllSales, allowExpenses, allowPurchases, profile, isContacts]);

  const filtered = useMemo(() => {
    const text = query.trim().toLocaleLowerCase('es');
    return data.rows.filter((row) => {
      const searchable = isContacts
        ? `${row.nombre || ''} ${row.nombre_empresa || row.empresa || ''} ${row.nombre_contacto || ''} ${row.celular || ''} ${row.email || ''} ${row.ruc || ''}`
        : screen === 'sales'
          ? `${row.id || ''} ${row.cliente || ''} ${row.usuario_nombre || ''} ${row.metodo_pago || ''} ${row.estado_pago || ''}`
        : screen === 'purchases'
          ? `${row.proveedor_nombre || ''} ${row.nro_factura || ''} ${row.estado || ''} ${row.estado_compra || ''}`
          : `${row.descripcion || ''} ${row.categoria || ''} ${row.metodo_pago || ''}`;
      const matchesText = searchable.toLocaleLowerCase('es').includes(text);
      const customerDebt = (data.clientDebts[String(row.nombre || '').trim().toLocaleLowerCase('es')] || 0)
        + (row.nombre_empresa && row.nombre_empresa !== row.nombre ? (data.clientDebts[String(row.nombre_empresa).trim().toLocaleLowerCase('es')] || 0) : 0);
      return matchesText && (!debtOnly || !isContacts || contactType !== 'customers' || customerDebt > 0);
    });
  }, [data.rows, query, screen, isContacts, debtOnly, data.clientDebts, contactType]);
  const filteredSales = useMemo(() => {
    const text = query.trim().toLocaleLowerCase('es');
    return data.sales.filter((sale) => `${sale.id || ''} ${sale.cliente || ''} ${sale.usuario_nombre || ''} ${sale.metodo_pago || ''} ${sale.estado_pago || ''}`.toLocaleLowerCase('es').includes(text));
  }, [data.sales, query]);
  const filteredSalesTotal = filteredSales.reduce((sum, sale) => sum + Number(sale.total || 0), 0);
  const title = isContacts ? (contactType === 'customers' ? 'Clientes' : 'Proveedores') : screen === 'sales' ? 'Histórico de ventas' : screen === 'purchases' ? 'Compras' : screen === 'expenses' ? 'Gastos' : screen === 'cash' ? 'Caja' : 'Reportes';
  const debtFor = (row) => (data.clientDebts[String(row.nombre || '').trim().toLocaleLowerCase('es')] || 0)
    + (row.nombre_empresa && row.nombre_empresa !== row.nombre ? (data.clientDebts[String(row.nombre_empresa).trim().toLocaleLowerCase('es')] || 0) : 0);
  const indebtedClients = data.rows.filter((row) => debtFor(row) > 0);
  const receivables = indebtedClients.reduce((sum, row) => sum + debtFor(row), 0);

  const activeCashBox = cashBox?.estado === 'Abierta' ? cashBox : null;
  const totalSales = data.sales.reduce((sum, sale) => sum + Number(sale.total || 0), 0);
  const totalExpenses = data.expenses.reduce((sum, expense) => sum + Number(expense.monto || 0), 0);
  const totalPurchases = data.purchases.reduce((sum, purchase) => sum + Number(purchase.total || 0), 0);
  const averageSale = data.sales.length ? totalSales / data.sales.length : 0;
  const reportDays = 1;
  const salesByMethod = data.sales.reduce((totals, sale) => {
    const method = sale.metodo_pago || 'Otro';
    totals[method] = (totals[method] || 0) + Number(sale.total || 0);
    return totals;
  }, {});
  const dailySales = new Map();
  data.sales.forEach((sale) => {
    const key = new Date(sale.fecha).toLocaleDateString('es-PY', { day: '2-digit', month: 'short' });
    dailySales.set(key, (dailySales.get(key) || 0) + Number(sale.total || 0));
  });
  const maxDailySales = Math.max(...dailySales.values(), 1);

  return <section className="screen-section">
    {screen !== 'reports' && <div className="screen-title"><div><span className="eyebrow">OPERACIÓN DEL NEGOCIO</span><h1>{title}</h1><p>{isContacts ? 'Consulta los datos existentes de tus contactos.' : screen === 'cash' ? 'Estado y actividad de las cajas de tu negocio.' : screen === 'sales' ? (allowAllSales ? 'Consulta las ventas guardadas en la base del negocio.' : 'Consulta el historial de tus ventas registradas.') : screen === 'purchases' ? 'Historial de compras registrado en GDA POS.' : 'Gastos registrados en la operación del negocio.'}</p></div>{screen === 'contacts' && allowCreateCustomers && <button className="button button-primary mobile-create-button" onClick={() => setClientFormOpen(true)}><Plus size={16} /> Nuevo cliente</button>}</div>}
    {isContacts && <div className="module-segments">
      {allowCustomers && <button className={contactType === 'customers' ? 'active' : ''} onClick={() => { setContactType('customers'); setQuery(''); }}>Clientes</button>}
      {allowSuppliers && <button className={contactType === 'suppliers' ? 'active' : ''} onClick={() => { setContactType('suppliers'); setQuery(''); }}>Proveedores</button>}
    </div>}
    {screen === 'reports' && <ReportScreen sales={data.sales} expenses={data.expenses} details={data.details} detailsUnavailable={data.detailsUnavailable} collections={data.collections} collectionsUnavailable={data.collectionsUnavailable} reportDate={reportDate} setReportDate={setReportDate} category={reportCategory} setCategory={setReportCategory} loading={data.loading} error={data.error} allowSales={allowSales} allowExpenses={allowExpenses} businessName={profile?.empresas?.nombre || 'Mi negocio'} empresaId={empresaId} cashBox={activeCashBox} onRefresh={() => setReload((value) => value + 1)} onNewSale={() => onGoToScreen?.('pos')} />}
    {screen === 'sales' && <div className="module-segments report-periods sales-history-periods"><button className={salesDays === 0 ? 'active' : ''} onClick={() => setSalesDays(0)}>Todo</button><button className={salesDays === 90 ? 'active' : ''} onClick={() => setSalesDays(90)}>90 días</button><button className={salesDays === 30 ? 'active' : ''} onClick={() => setSalesDays(30)}>30 días</button><button className={salesDays === 7 ? 'active' : ''} onClick={() => setSalesDays(7)}>7 días</button><button className={salesDays === 1 ? 'active' : ''} onClick={() => setSalesDays(1)}>Hoy</button></div>}
    {isContacts && contactType === 'customers' && <div className="client-receivables"><div className="client-receivables-icon"><Wallet size={23} /></div><div><span>Cuentas por cobrar</span><strong>{money(receivables)}</strong><small>{indebtedClients.length} clientes con deuda</small></div></div>}
    {(isContacts || screen === 'purchases' || screen === 'expenses' || screen === 'sales') && <div className="search-field"><Search size={18} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={isContacts ? 'Buscar por nombre, ID o teléfono' : screen === 'sales' ? 'Buscar por cliente, número o cajero' : screen === 'purchases' ? 'Buscar por proveedor o factura' : 'Buscar por descripción o categoría'} /><button className="module-refresh" onClick={() => setReload((value) => value + 1)} aria-label="Actualizar"><RefreshCw size={16} /></button></div>}
    {isContacts && contactType === 'customers' && <div className="client-list-filters"><button className={!debtOnly ? 'active' : ''} onClick={() => setDebtOnly(false)}>✓ Todos · {data.rows.length}</button><button className={debtOnly ? 'active' : ''} onClick={() => setDebtOnly(true)}>Con deuda · {indebtedClients.length}</button><button className="client-export" aria-label="Exportar clientes" onClick={() => exportClients(filtered)}><Download size={18} /></button></div>}
    {screen !== 'reports' && (data.loading ? <div className="empty-state"><LoaderCircle className="spin" size={24} /><strong>Consultando datos</strong></div>
      : data.error ? <div className="notice notice-error"><CircleAlert size={17} /><span>No se pudo cargar {title.toLocaleLowerCase('es')}: {data.error}</span></div>
        : isContacts || screen === 'purchases' || screen === 'expenses' ? <>
          <div className="module-summary"><span>{filtered.length} registros</span>{screen !== 'contacts' && screen !== 'suppliers' && <strong>{money(filtered.reduce((sum, row) => sum + Number(screen === 'purchases' ? row.total : row.monto || 0), 0))}</strong>}</div>
          {filtered.length === 0 ? <div className="empty-state"><Package size={28} /><strong>Sin resultados</strong><p>Ajusta la búsqueda o vuelve a intentarlo más tarde.</p></div>
            : <div className="inventory-list">{filtered.map((row) => {
              if (isContacts) {
                const customer = contactType === 'customers';
                const name = customer ? (row.nombre_empresa || row.nombre || 'Cliente sin nombre') : (row.empresa || row.nombre_contacto || 'Proveedor sin nombre');
                const detail = customer ? [row.nombre_empresa && row.nombre ? row.nombre : '', row.celular, row.email].filter(Boolean).join(' · ') : [row.nombre_contacto, row.ruc ? `RUC ${row.ruc}` : '', row.email].filter(Boolean).join(' · ');
                return <article className="inventory-row module-row client-list-row" key={row.id}><div className="inventory-art client-avatar">{customer ? <UserRound size={19} /> : <Building2 size={19} />}</div><div className="inventory-name"><strong>{name}</strong><span>{customer ? [row.codigo_cliente || `#${String(row.id).slice(0, 6)}`, row.celular].filter(Boolean).join(' · ') : detail || row.termino_pago || 'Sin datos adicionales'}</span></div>{customer && debtFor(row) > 0 && <div className="client-debt-badge">{money(debtFor(row))}</div>}</article>;
              }
              if (screen === 'purchases') return <article className="inventory-row module-row" key={row.id}><div className="inventory-art"><Package size={19} /></div><div className="inventory-name"><strong>{row.proveedor_nombre || 'Proveedor no indicado'}</strong><span>{stamp(row.fecha)}{row.nro_factura ? ` · Factura ${row.nro_factura}` : ''}</span></div><div className="stock-value"><strong>{money(row.total)}</strong><small>{Number(row.saldo_pendiente) > 0 ? `Pendiente ${money(row.saldo_pendiente)}` : row.estado_compra || row.estado || 'Registrada'}</small></div></article>;
              return <article className="inventory-row module-row" key={row.id}><div className="inventory-art"><Wallet size={19} /></div><div className="inventory-name"><strong>{row.descripcion || row.categoria || 'Gasto'}</strong><span>{row.categoria || 'Sin categoría'} · {stamp(row.fecha)}</span></div><div className="stock-value critical"><strong>{money(row.monto)}</strong></div></article>;
            })}</div>}
        </> : screen === 'sales' ? <>
          <div className="module-summary"><span>{filteredSales.length} ventas{salesDays ? ` · últimos ${salesDays} días` : ' · todo el historial'}</span><strong>{money(filteredSalesTotal)}</strong></div>
          {filteredSales.length === 0 ? <div className="empty-state"><Clock3 size={28} /><strong>{query ? 'Sin coincidencias' : 'No hay ventas en este período'}</strong><p>{query ? 'Prueba con otro cliente, número de venta o cajero.' : 'Las ventas nuevas aparecerán aquí al registrarse en el sistema.'}</p></div>
            : <div className="inventory-list sales-history-list">{filteredSales.map((sale) => <article className="inventory-row module-row sales-history-row" key={sale.id}><div className="inventory-art"><ArrowDownLeft size={19} /></div><div className="inventory-name"><strong>Venta #{sale.id} · {sale.cliente || 'Cliente ocasional'}</strong><span>{stamp(sale.fecha)} · {new Date(sale.fecha).toLocaleTimeString('es-PY', { hour: '2-digit', minute: '2-digit' })}</span><span>{sale.usuario_nombre || 'Cajero no indicado'} · {sale.metodo_pago || 'Medio no indicado'} · {sale.estado_pago || 'Registrada'}</span></div><div className="stock-value"><strong>{money(sale.total)}</strong></div></article>)}</div>}
        </> : screen === 'cash' ? <MobileCash
          empresaId={empresaId}
          profile={profile}
          branches={branches}
          cashBox={activeCashBox}
          history={allowCashHistory ? data.rows : []}
          allowOpen={allowOpenCash}
          allowClose={allowCloseCash}
          onChanged={(nextBox) => { onCashChanged?.(nextBox); setReload((value) => value + 1); }}
          onRefresh={() => setReload((value) => value + 1)}
          onReportReady={setClosedReport}
        /> : <>
          <div className="report-metrics">{allowSales && <><article className="metric-card"><div className="metric-icon gold"><Wallet size={18} /></div><span>Ventas</span><strong>{money(totalSales)}</strong><small>{data.sales.length} operaciones · {reportDays} días</small></article><article className="metric-card"><div className="metric-icon coral"><Activity size={18} /></div><span>Promedio por venta</span><strong>{money(averageSale)}</strong><small>Sobre las ventas del período</small></article></>}{allowExpenses && <article className="metric-card"><div className="metric-icon coral"><Wallet size={18} /></div><span>Gastos</span><strong>{money(totalExpenses)}</strong><small>{data.expenses.length} registros</small></article>}{allowPurchases && <article className="metric-card"><div className="metric-icon gold"><Package size={18} /></div><span>Compras</span><strong>{money(totalPurchases)}</strong><small>{data.purchases.length} registros</small></article>}{allowProducts && <article className="metric-card"><div className="metric-icon coral"><CircleAlert size={18} /></div><span>Stock bajo</span><strong>{products.filter((product) => Number(product.stock_actual) <= Number(product.stock_minimo || 0)).length}</strong><small>Productos activos</small></article>}</div>
          {allowSales && <><div className="section-heading"><div><span className="eyebrow">VENTAS POR MEDIO</span><h2>Pagos registrados</h2></div></div><div className="report-payment-grid">{Object.entries(salesByMethod).map(([method, amount]) => <div key={method}><span>{method}</span><strong>{money(amount)}</strong></div>)}{data.sales.length === 0 && <span className="report-no-data">No hay ventas en el período seleccionado.</span>}</div><div className="section-heading"><div><span className="eyebrow">VENTAS POR DÍA</span><h2>Últimos {reportDays} días</h2></div></div>{dailySales.size === 0 ? <div className="empty-state"><Clock3 size={26} /><strong>Sin ventas en este período</strong></div> : <div className="report-bars">{[...dailySales].map(([day, value]) => <div className="report-bar-row" key={day}><span>{day}</span><div><i style={{ width: `${Math.max(5, value / maxDailySales * 100)}%` }} /></div><strong>{money(value)}</strong></div>)}</div>}</>}{!allowSales && <div className="empty-state"><CircleAlert size={26} /><strong>No tienes permiso para consultar ventas</strong><p>Los reportes disponibles se muestran según los permisos de tu usuario.</p></div>}
        </>)}
    {closedReport && <div className="mobile-modal-backdrop cash-report-backdrop" onClick={() => setClosedReport(null)}><section className="cash-report-card" role="dialog" aria-modal="true" aria-label="Reporte de fin del turno" onClick={(event) => event.stopPropagation()}><button className="sheet-close cash-report-close" aria-label="Cerrar reporte" onClick={() => setClosedReport(null)}><X size={19} /></button><div className="cash-report-title"><FileText size={24} /><h2>Reporte de Fin del Turno</h2></div><article className="cash-report-printable"><header><strong>{closedReport.empresa}</strong><b>*** Fin del Día ***</b></header><div className="cash-report-meta"><span>Desde: {reportTimestamp(closedReport.desde)}</span><span>Hasta: {reportTimestamp(closedReport.hasta)}</span><span>Cajero: {closedReport.cajero}</span><span>Caja: #{closedReport.cajaId}</span></div><CashReportSection title="Ventas del turno"><CashReportRow label="Facturas" value={String(closedReport.cantidadVentas)} /><CashReportRow label="Total facturado" value={money(closedReport.ventas)} /><CashReportRow label="Promedio por factura" value={money(closedReport.promedioVenta)} /></CashReportSection><CashReportSection title="Pagos">{Object.entries(closedReport.pagos).map(([method, amount]) => <CashReportRow key={method} label={method} value={money(amount)} />)}<CashReportRow label="Gastos del turno" value={money(closedReport.gastos)} /></CashReportSection><CashReportSection title="Cierre de caja">{Object.entries(closedReport.metodos).map(([method, values]) => <div className="cash-report-method" key={method}><CashReportRow label={`${method} · sistema`} value={money(values.sistema)} /><CashReportRow label={`${method} · declarado`} value={money(values.contado)} /><CashReportRow label={`${method} · diferencia`} value={money(values.diferencia)} /></div>)}<CashReportRow label="Monto inicial" value={money(closedReport.montoInicial)} /><CashReportRow label="Monto cierre efectivo" value={money(closedReport.montoCierre)} />{closedReport.nota && <p className="cash-report-note">Nota: {closedReport.nota}</p>}</CashReportSection><CashReportSection title="Facturas del turno">{closedReport.ventasRows.length ? closedReport.ventasRows.map((sale) => <CashReportRow key={sale.id} label={`#${sale.id} · ${sale.cliente || 'Cliente ocasional'} · ${reportTimestamp(sale.fecha)}`} value={money(sale.total)} />) : <p className="cash-report-empty">No se registraron ventas en este turno.</p>}</CashReportSection></article><div className="cash-report-actions"><button onClick={() => shareCashReport(closedReport)}><Share2 size={17} /> Compartir</button><button onClick={() => downloadCashReport(closedReport)}><Download size={17} /> CSV</button><button className="button button-primary" onClick={() => window.print()}><Printer size={18} /> Imprimir</button><button className="cash-report-done" onClick={() => setClosedReport(null)}>Listo</button></div></section></div>}
    {clientFormOpen && <MobileClientForm empresaId={empresaId} onClose={() => setClientFormOpen(false)} onSaved={() => { setClientFormOpen(false); setReload((value) => value + 1); onClientSaved?.(); }} />}
  </section>;
}

function ReportScreen({ sales, expenses, details, detailsUnavailable, collections, collectionsUnavailable, reportDate, setReportDate, category, setCategory, loading, error, allowSales, allowExpenses, businessName, empresaId, cashBox, onRefresh, onNewSale }) {
  const [showProfit, setShowProfit] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [expenseOpen, setExpenseOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState('all');
  const datePicker = useRef(null);
  const dateOptions = Array.from({ length: 5 }, (_, index) => {
    const date = new Date(); date.setDate(date.getDate() - (4 - index));
    return localDateKey(date);
  });
  const totalSales = sales.reduce((sum, sale) => sum + Number(sale.total || 0), 0);
  const pending = sales.reduce((sum, sale) => sum + Number(sale.saldo_pendiente || 0), 0);
  const collected = sales.reduce((sum, sale) => sum + (sale.monto_pagado === null || sale.monto_pagado === undefined ? Math.max(0, Number(sale.total || 0) - Number(sale.saldo_pendiente || 0)) : Number(sale.monto_pagado || 0)), 0);
  const priorCollections = collections.reduce((sum, payment) => sum + Number(payment.monto || 0), 0);
  const totalExpenses = expenses.reduce((sum, expense) => sum + Number(expense.monto || 0), 0);
  const costOfSales = details.reduce((sum, item) => sum + Number(item.precio_costo || 0) * Number(item.cantidad || 0), 0);
  const grossProfit = details.reduce((sum, item) => sum + (Number(item.precio_unitario || 0) * Number(item.cantidad || 0)) - (Number(item.precio_costo || 0) * Number(item.cantidad || 0)) - Number(item.descuento || 0) + Number(item.impuesto || 0), 0);
  const netResult = grossProfit - totalExpenses;
  const saleHasDetails = new Set(details.map((item) => String(item.venta_id)));
  const salesWithoutDetails = sales.filter((sale) => !saleHasDetails.has(String(sale.id))).length;
  const itemBySale = details.reduce((map, item) => { const key = String(item.venta_id); map[key] ||= []; map[key].push(item); return map; }, {});
  const movements = [
    ...(allowSales ? sales.map((sale) => ({ id: `sale-${sale.id}`, kind: 'income', date: sale.fecha, label: (itemBySale[String(sale.id)] || []).map((item) => `${Number(item.cantidad) || 1} ${item.nombre_producto}`).slice(0, 2).join(', ') || `Venta #${sale.id}`, extra: `${sale.metodo_pago || 'Medio no indicado'} · ${sale.cliente || 'Cliente ocasional'}`, status: Number(sale.saldo_pendiente) > 0 ? 'Pago parcial' : 'Pagado', amount: Number(sale.total) || 0 } )) : []),
    ...(allowSales ? collections.map((payment) => ({ id: `payment-${payment.id}`, kind: 'income', date: payment.fecha, label: 'Cobro de deuda anterior', extra: payment.metodo_pago || 'Medio no indicado', status: 'Cobrado', amount: Number(payment.monto) || 0 })) : []),
    ...(allowExpenses ? expenses.map((expense) => ({ id: `expense-${expense.id}`, kind: 'expense', date: expense.fecha, label: expense.descripcion || expense.categoria || 'Gasto', extra: `${expense.metodo_pago || 'Medio no indicado'}${expense.categoria ? ` · ${expense.categoria}` : ''}`, status: 'Egreso', amount: Number(expense.monto) || 0 })) : []),
  ].sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
  const visible = movements.filter((item) => (category === 'all' || item.kind === category)
    && (statusFilter === 'all' || (statusFilter === 'paid' && item.status === 'Pagado') || (statusFilter === 'partial' && item.status === 'Pago parcial')));
  const count = sales.length + expenses.length;
  const now = new Date();
  const selectedDate = new Date(`${reportDate}T12:00:00`);
  const sameDayLastWeek = new Date(selectedDate); sameDayLastWeek.setDate(sameDayLastWeek.getDate() - 7);
  const monthDate = selectedDate.toLocaleDateString('es-PY', { month: 'long', day: 'numeric' });
  const shortTime = (value) => value ? new Date(value).toLocaleTimeString('es-PY', { hour: 'numeric', minute: '2-digit' }) : '';

  return <div className="mobile-report-screen">
    <div className="report-date-strip"><div className="report-date-chips">{dateOptions.map((day) => <button key={day} className={day === reportDate ? 'active' : ''} onClick={() => { setReportDate(day); setShowProfit(false); }}>{day === localDateKey() ? 'Hoy' : dateLabel(day)}</button>)}</div><button className="report-calendar-button" onClick={() => datePicker.current?.showPicker ? datePicker.current.showPicker() : datePicker.current?.click()} aria-label="Elegir fecha"><CalendarDays size={22}/></button><input ref={datePicker} className="report-date-input" type="date" value={reportDate} onChange={(event) => { setReportDate(event.target.value || localDateKey()); setShowProfit(false); }} /></div>
    <div className="report-type-tabs"><button className={category === 'all' ? 'active' : ''} onClick={() => setCategory('all')}>Todo</button><button className={category === 'income' ? 'active' : ''} onClick={() => setCategory('income')}>Ingresos</button><button className={category === 'expense' ? 'active' : ''} onClick={() => setCategory('expense')}>Egresos</button><button className="report-filter-button" aria-label="Filtros" onClick={() => setShowFilters((value) => !value)}><SlidersHorizontal size={21}/></button></div>
    {showFilters && <div className="report-extra-filters"><span>Estado de venta</span><button className={statusFilter === 'all' ? 'active' : ''} onClick={() => setStatusFilter('all')}>Todos</button><button className={statusFilter === 'paid' ? 'active' : ''} onClick={() => setStatusFilter('paid')}>Pagado</button><button className={statusFilter === 'partial' ? 'active' : ''} onClick={() => setStatusFilter('partial')}>Pago parcial</button></div>}
    {loading ? <div className="empty-state"><LoaderCircle className="spin" size={24}/><strong>Cargando movimientos del período…</strong></div> : error ? <div className="notice notice-error"><CircleAlert size={17}/><span>No se pudo cargar el reporte: {error}</span></div> : <>
      {showProfit ? <section className="report-profit-detail">
        <div className="report-filter-summary"><div><strong>{reportDate === localDateKey(now) ? 'Hoy' : dateLabel(reportDate, { weekday: 'long', day: 'numeric', month: 'long' })} · Todos los locales</strong><span>{dateLabel(reportDate, { weekday: 'long', day: 'numeric', month: 'long' })}</span></div><button onClick={() => setShowProfit(false)} aria-label="Volver al reporte"><ChevronDown size={21}/></button></div>
        <article className="report-sales-hero"><span>VENTAS</span><strong>{money(totalSales)}</strong><div className="report-comparison"><TrendingUp size={15}/> Período seleccionado · {sales.length} ventas</div><small>Ticket promedio {money(sales.length ? totalSales / sales.length : 0)}</small></article>
        <article className="report-detail-card"><h2><Wallet size={19}/> Cómo entró la plata</h2><ReportValue label="Facturado" value={money(totalSales)}/><ReportValue label="Vendido a crédito" value={`− ${money(pending)}`} detail="Saldo pendiente de cobro"/><ReportValue label="Deuda anterior cobrada" value={`+ ${money(priorCollections)}`} detail="Cobros registrados en el período"/><div className="report-total-line"><strong>Entró a la caja</strong><b>{money(collected + priorCollections)}</b></div>{collectionsUnavailable && <p className="report-detail-note">No se pudo consultar el historial de cobros de deuda anterior.</p>}</article>
        <article className="report-detail-card report-result-card"><button className="report-result-toggle" onClick={() => setShowProfit((value) => !value)}><strong><Activity size={19}/> Resultado del período</strong><b className={netResult < 0 ? 'negative' : ''}>{money(netResult)} <ChevronDown size={17}/></b></button><ReportValue label="Ventas netas" value={money(totalSales)} detail="Importe facturado en el período"/><ReportValue label="Costo de ventas" value={`− ${money(costOfSales)}`} detail="Costo guardado en cada detalle de venta"/><ReportValue label="Margen bruto" value={money(grossProfit)} detail="Ventas menos costo de los productos"/><ReportValue label="Gastos del período" value={`− ${money(totalExpenses)}`} detail={`${expenses.length} gastos registrados`}/><div className="report-total-line result"><strong>Resultado</strong><b className={netResult < 0 ? 'negative' : ''}>{money(netResult)}</b></div>{(detailsUnavailable || salesWithoutDetails > 0) && <p className="report-detail-note">{detailsUnavailable ? 'No se pudieron leer todos los campos del detalle de ventas. Los movimientos cargaron, pero el costo y la ganancia pueden estar incompletos.' : `${salesWithoutDetails} ventas no tienen detalle con costo guardado; la ganancia puede estar incompleta.`}</p>}</article>
        <button className="report-back-button" onClick={() => setShowProfit(false)}>Volver a movimientos</button>
      </section> : <>
        <article className="report-day-summary"><div className="report-balance-line"><span>Balance</span><strong className={totalSales - totalExpenses < 0 ? 'negative' : ''}>{money(totalSales - totalExpenses)}</strong></div><div className="report-income-expense"><div><span><i className="income-arrow">↗</i> Ingresos</span><strong>{money(totalSales)}</strong><small>{sales.length} movimientos</small></div><div><span><i className="expense-arrow">↙</i> Egresos</span><strong>{money(totalExpenses)}</strong><small>{expenses.length} movimientos</small></div></div>{pending > 0 && <div className="report-pending"><span><Clock3 size={17}/> Falta cobrar</span><strong>{money(pending)}</strong></div>}</article>
        <div className="report-movement-list">{visible.length ? visible.map((item) => <article className="report-movement" key={item.id}><div className={`report-movement-icon ${item.kind}`}><Banknote size={21}/></div><div className="report-movement-info"><strong>{item.label}</strong><span>{item.extra}{item.kind === 'income' && item.date ? ` · ${shortTime(item.date)}` : ''}</span><small>{businessName}</small></div><div className="report-movement-value"><strong>{money(item.amount)}</strong><span className={['Pagado', 'Cobrado'].includes(item.status) ? 'paid' : item.status === 'Pago parcial' ? 'partial' : 'expense'}>{item.status}</span></div></article>) : <div className="empty-state"><Clock3 size={26}/><strong>Sin movimientos para mostrar</strong><p>Prueba otra fecha o cambia el filtro.</p></div>}</div>
        <button className="report-profit-button" onClick={() => setShowProfit(true)}><TrendingUp size={18}/> Ver ganancia del período</button>
      </>}
    </>}
    <div className="report-action-bar">{allowSales && <button className="new-sale" onClick={onNewSale}><CirclePlus size={19}/> Nueva venta</button>}{allowExpenses && <button className="new-expense" onClick={() => setExpenseOpen(true)}><CircleMinus size={19}/> Nuevo gasto</button>}</div>
    {expenseOpen && <MobileExpenseEntry empresaId={empresaId} cashBox={cashBox} reportDate={reportDate} onClose={() => setExpenseOpen(false)} onSaved={() => { setExpenseOpen(false); onRefresh?.(); }} />}
  </div>;
}

function ReportValue({ label, value, detail }) { return <div className="report-value-row"><div><span>{label}</span>{detail && <small>{detail}</small>}</div><strong>{value}</strong></div>; }

function MobileExpenseEntry({ empresaId, cashBox, reportDate, onClose, onSaved }) {
  const [form, setForm] = useState({ categoria: '', metodo_pago: 'Efectivo', cuentaId: '', referencia: '', nota: '' });
  const [items, setItems] = useState([{ descripcion: '', cantidad: '1', iva: 'IVA 10%', costo: '' }]);
  const [accounts, setAccounts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const total = items.reduce((sum, item) => sum + (Number(item.cantidad) || 0) * (Number(item.costo) || 0), 0);
  useEffect(() => {
    let active = true;
    Promise.all([
      supabase.from('cuentas_caja').select('id,nombre,saldo,moneda').eq('empresa_id', empresaId).eq('activo', true).order('nombre'),
      supabase.from('categorias_gastos').select('nombre').eq('empresa_id', empresaId).order('nombre'),
    ]).then(([accountResult, categoryResult]) => {
      if (!active) return;
      if (accountResult.error) setError(`No se pudieron cargar las cuentas: ${accountResult.error.message}`);
      const nextAccounts = accountResult.data || [];
      setAccounts(nextAccounts);
      setForm((current) => ({ ...current, cuentaId: current.cuentaId || nextAccounts[0]?.id || '' }));
      if (!categoryResult.error) setCategories((categoryResult.data || []).map((row) => row.nombre));
      setLoading(false);
    });
    return () => { active = false; };
  }, [empresaId]);
  const updateForm = (field) => (event) => setForm((current) => ({ ...current, [field]: event.target.value }));
  const updateItem = (index, field, value) => setItems((current) => current.map((item, row) => row === index ? { ...item, [field]: value } : item));
  const addItem = () => setItems((current) => [...current, { descripcion: '', cantidad: '1', iva: 'IVA 10%', costo: '' }]);
  const removeItem = (index) => setItems((current) => current.length === 1 ? [{ descripcion: '', cantidad: '1', iva: 'IVA 10%', costo: '' }] : current.filter((_, row) => row !== index));
  const save = async (event) => {
    event.preventDefault();
    if (items.some((item) => !item.descripcion.trim() || !(Number(item.cantidad) > 0) || !(Number(item.costo) > 0))) return setError('Completa la descripción, cantidad y costo de cada ítem.');
    if (!(total > 0)) return setError('Ingresa un costo total válido.');
    const account = accounts.find((item) => String(item.id) === String(form.cuentaId));
    if (!account) return setError('Selecciona una cuenta de pago activa.');
    if (total > Number(account.saldo || 0)) return setError(`Saldo insuficiente en ${account.nombre}. Disponible: ${money(account.saldo)}.`);
    setSaving(true); setError('');
    const nextBalance = Number(account.saldo || 0) - total;
    const { data: updated, error: accountError } = await supabase.from('cuentas_caja').update({ saldo: nextBalance }).eq('id', account.id).eq('empresa_id', empresaId).gte('saldo', total).select('id').maybeSingle();
    if (accountError || !updated) { setSaving(false); return setError(accountError ? `No se pudo actualizar la cuenta: ${accountError.message}` : 'La cuenta ya no tiene saldo suficiente. Actualiza e intenta de nuevo.'); }
    const expenseItems = items.map((item) => ({ descripcion: item.descripcion.trim(), cantidad: Number(item.cantidad), iva: item.iva, costo: Number(item.costo), articulo_id: '' }));
    const description = items.map((item) => item.descripcion.trim()).join(', ');
    const { error: insertError } = await supabase.from('gastos').insert([{
      empresa_id: empresaId, descripcion: description, monto: Math.round(total), categoria: form.categoria || null,
      metodo_pago: form.metodo_pago, cuenta_pago: account.nombre, fecha: reportDate || localDateKey(),
      caja_id: cashBox?.id || null, nro_referencia: form.referencia.trim() || null, nota: form.nota.trim() || null, items: expenseItems,
    }]);
    if (insertError) {
      await supabase.from('cuentas_caja').update({ saldo: Number(account.saldo || 0) }).eq('id', account.id).eq('empresa_id', empresaId);
      setSaving(false); return setError(`No se pudo guardar el gasto: ${insertError.message}. Se restauró el saldo de la cuenta.`);
    }
    setSaving(false); onSaved?.();
  };
  return <div className="mobile-expense-page"><form className="mobile-expense-form" onSubmit={save}>
    <header className="mobile-expense-header"><button type="button" onClick={onClose} aria-label="Volver"><ArrowLeft size={23}/></button><h2>Nuevo gasto</h2></header>
    <div className="mobile-expense-content">
      {error && <div className="notice notice-error"><CircleAlert size={17}/><span>{error}</span></div>}
      {!cashBox?.id && <div className="notice notice-warning"><CircleAlert size={17}/><span>No hay caja abierta; el gasto se guardará en la cuenta y no se asociará al cierre de turno.</span></div>}
      <section className="expense-items-card"><h3><ClipboardList size={19}/> Detalle de ítems</h3>{items.map((item, index) => <div className="expense-item" key={index}>
        <div className="expense-item-description"><input aria-label={`Descripción del ítem ${index + 1}`} placeholder="Descripción" value={item.descripcion} onChange={(event) => updateItem(index, 'descripcion', event.target.value)}/><button type="button" onClick={() => removeItem(index)} aria-label="Eliminar ítem"><Trash2 size={21}/></button></div>
        <div className="expense-item-fields"><label><span>Cantidad</span><input inputMode="decimal" type="number" min="0.01" step="any" value={item.cantidad} onChange={(event) => updateItem(index, 'cantidad', event.target.value)}/></label><label><span>IVA</span><select value={item.iva} onChange={(event) => updateItem(index, 'iva', event.target.value)}><option>IVA 10%</option><option>IVA 5%</option><option>Exenta</option></select></label><label><span>Costo unit.</span><input inputMode="numeric" type="number" min="0" step="1" value={item.costo} onChange={(event) => updateItem(index, 'costo', event.target.value)} placeholder="Gs"/></label></div>
        <div className="expense-item-total">Total: {money((Number(item.cantidad) || 0) * (Number(item.costo) || 0))}</div>
      </div>)}<button className="expense-add-item" type="button" onClick={addItem}><Plus size={19}/> Agregar ítem</button><div className="expense-grand-total"><strong>TOTAL</strong><b>{money(total)}</b></div></section>
      <label className="expense-select-field"><span>Categoría (opcional)</span><select value={form.categoria} onChange={updateForm('categoria')}><option value="">Sin categoría</option>{categories.map((item) => <option key={item}>{item}</option>)}{!categories.length && ['Compra de mercadería', 'Servicios (luz, agua, internet)', 'Alquiler', 'Sueldos', 'Transporte', 'Mantenimiento', 'Otros'].map((item) => <option key={item}>{item}</option>)}</select></label>
      <label className="expense-select-field"><span>Método de pago</span><select value={form.metodo_pago} onChange={updateForm('metodo_pago')}><option>Efectivo</option><option>Tarjeta</option><option>Transferencia</option><option>QR/PIX</option></select></label>
      <label className="expense-select-field"><span>Cuenta</span><select value={form.cuentaId} onChange={updateForm('cuentaId')} required><option value="">{loading ? 'Cargando cuentas…' : 'Selecciona cuenta'}</option>{accounts.map((account) => <option key={account.id} value={account.id}>{account.nombre} · {money(account.saldo)}</option>)}</select></label>
      <input className="expense-reference-field" placeholder="Referencia (opcional)" value={form.referencia} onChange={updateForm('referencia')}/>
      <textarea className="expense-note-field" placeholder="Concepto / nota" value={form.nota} onChange={updateForm('nota')} rows="3"/>
    </div>
    <footer className="mobile-expense-footer"><button className="button button-primary" disabled={saving || loading || !accounts.length || total <= 0}>{saving ? <LoaderCircle className="spin" size={18}/> : <Check size={18}/>} Guardar gasto · {money(total)}</button></footer>
  </form></div>;
}
function MobileCash({ empresaId, profile, branches, cashBox, history, allowOpen, allowClose, onChanged, onRefresh, onReportReady }) {
  const [openingAmount, setOpeningAmount] = useState('0');
  const [selectedBranch, setSelectedBranch] = useState('');
  const [countedCash, setCountedCash] = useState('');
  const [countedCard, setCountedCard] = useState('');
  const [countedTransfer, setCountedTransfer] = useState('');
  const [countedQr, setCountedQr] = useState('');
  const [closingNote, setClosingNote] = useState('');
  const [summaryReload, setSummaryReload] = useState(0);
  const [reportLoadingId, setReportLoadingId] = useState(null);
  const [lastClosedReconciliation, setLastClosedReconciliation] = useState(null);
  const [summary, setSummary] = useState({ loading: false, error: '', sales: 0, cashSales: 0, cardSales: 0, transferSales: 0, qrSales: 0, expenses: 0, cashExpenses: 0, cardExpenses: 0, transferExpenses: 0, qrExpenses: 0, count: 0, salesRows: [] });
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState(null);
  const allLocations = profile?.todas_localizaciones !== false;
  const branchId = allLocations ? selectedBranch : profile?.ubicacion_id || '';
  const assignedBranch = branches.find((branch) => String(branch.id) === String(branchId));

  useEffect(() => {
    if (allLocations && !selectedBranch && branches.length === 1) setSelectedBranch(String(branches[0].id));
    if (!allLocations && profile?.ubicacion_id) setSelectedBranch(String(profile.ubicacion_id));
  }, [allLocations, branches, profile?.ubicacion_id, selectedBranch]);

  useEffect(() => {
    let live = true;
    const loadClosingSummary = async () => {
      if (!cashBox?.id) {
        setSummary({ loading: false, error: '', sales: 0, cashSales: 0, cardSales: 0, transferSales: 0, qrSales: 0, expenses: 0, cashExpenses: 0, cardExpenses: 0, transferExpenses: 0, qrExpenses: 0, count: 0, salesRows: [] });
        setCountedCash('');
        setCountedCard('');
        setCountedTransfer('');
        setCountedQr('');
        setClosingNote('');
        return;
      }
      setSummary((current) => ({ ...current, loading: true, error: '' }));
      const [salesResult, expenseResult] = await Promise.all([
        loadRows(() => supabase.from('ventas').select('id, cliente, total, metodo_pago, fecha, estado_pago').eq('empresa_id', empresaId).eq('caja_id', cashBox.id).order('fecha', { ascending: true })),
        loadRows(() => supabase.from('gastos').select('monto, metodo_pago').eq('empresa_id', empresaId).eq('caja_id', cashBox.id)),
      ]);
      if (!live) return;
      const failed = salesResult.error || expenseResult.error;
      if (failed) {
        setSummary((current) => ({ ...current, loading: false, error: failed.message || 'No se pudieron consultar los movimientos de la caja.' }));
        return;
      }
      const sales = salesResult.data || [];
      const expenses = expenseResult.data || [];
      setSummary({
        loading: false,
        error: '',
        sales: sales.reduce((total, sale) => total + Number(sale.total || 0), 0),
        cashSales: sales.filter((sale) => sale.metodo_pago === 'Efectivo').reduce((total, sale) => total + Number(sale.total || 0), 0),
        cardSales: sales.filter((sale) => sale.metodo_pago === 'Tarjeta').reduce((total, sale) => total + Number(sale.total || 0), 0),
        transferSales: sales.filter((sale) => sale.metodo_pago === 'Transferencia').reduce((total, sale) => total + Number(sale.total || 0), 0),
        qrSales: sales.filter((sale) => sale.metodo_pago === 'QR').reduce((total, sale) => total + Number(sale.total || 0), 0),
        expenses: expenses.reduce((total, expense) => total + Number(expense.monto || 0), 0),
        cashExpenses: expenses.filter((expense) => !expense.metodo_pago || expense.metodo_pago === 'Efectivo').reduce((total, expense) => total + Number(expense.monto || 0), 0),
        cardExpenses: expenses.filter((expense) => expense.metodo_pago === 'Tarjeta').reduce((total, expense) => total + Number(expense.monto || 0), 0),
        transferExpenses: expenses.filter((expense) => expense.metodo_pago === 'Transferencia').reduce((total, expense) => total + Number(expense.monto || 0), 0),
        qrExpenses: expenses.filter((expense) => expense.metodo_pago === 'QR').reduce((total, expense) => total + Number(expense.monto || 0), 0),
        count: sales.length,
        salesRows: sales,
      });
    };
    loadClosingSummary();
    return () => { live = false; };
  }, [cashBox?.id, empresaId, summaryReload]);

  const expectedCash = Number(cashBox?.saldo_inicial || 0) + summary.cashSales - summary.cashExpenses;
  const expectedMethods = {
    Efectivo: expectedCash,
    Tarjeta: summary.cardSales - summary.cardExpenses,
    Transferencia: summary.transferSales - summary.transferExpenses,
    QR: summary.qrSales - summary.qrExpenses,
  };
  const countedMethods = { Efectivo: countedCash, Tarjeta: countedCard, Transferencia: countedTransfer, QR: countedQr };
  const methodCounts = [
    ['Efectivo', countedCash, setCountedCash],
    ['Tarjeta', countedCard, setCountedCard],
    ['Transferencia', countedTransfer, setCountedTransfer],
    ['QR', countedQr, setCountedQr],
  ];
  const methodDifferences = Object.fromEntries(Object.entries(countedMethods).map(([method, value]) => [method, value === '' ? null : Number(value) - expectedMethods[method]]));
  const incompleteReconciliation = Object.values(countedMethods).some((value) => value === '');
  const openCash = async (event) => {
    event.preventDefault();
    const amount = Number(openingAmount);
    if (openingAmount === '' || !Number.isFinite(amount) || amount < 0) {
      setNotice({ type: 'error', message: 'Ingresa un monto inicial válido, igual o mayor a cero.' });
      return;
    }
    if (!branchId || !assignedBranch) {
      setNotice({ type: 'error', message: allLocations ? 'Selecciona una sucursal activa para abrir la caja.' : 'Tu usuario no tiene una sucursal activa asignada. Pide al administrador que la configure.' });
      return;
    }
    setSaving(true);
    setNotice(null);
    const displayName = personName(profile);
    try {
      const { data: opened, error: readError } = await supabase.from('caja_registros')
        .select('id, usuario_id, usuario, estado, ubicacion_id')
        .eq('empresa_id', empresaId).eq('ubicacion_id', branchId).eq('estado', 'Abierta');
      if (readError) throw readError;
      const alreadyOpen = (opened || []).find((row) => String(row.usuario_id || '') === String(profile?.auth_user_id || '')
        || (!row.usuario_id && row.usuario === displayName));
      if (alreadyOpen) {
        onChanged?.(alreadyOpen);
        setNotice({ type: 'error', message: 'Ya tienes una caja abierta en esta sucursal. Actualicé su estado.' });
        return;
      }
      const { data: created, error } = await supabase.from('caja_registros').insert({
        empresa_id: empresaId,
        saldo_inicial: amount,
        saldo_final: null,
        estado: 'Abierta',
        fecha_apertura: new Date().toISOString(),
        ubicacion_id: branchId,
        usuario: displayName,
        usuario_id: profile?.auth_user_id || null,
      }).select('id, empresa_id, saldo_inicial, saldo_final, estado, fecha_apertura, fecha_cierre, ubicacion_id, usuario, usuario_id').single();
      if (error) throw error;
      setOpeningAmount('0');
      setLastClosedReconciliation(null);
      onChanged?.(created);
      setNotice({ type: 'success', message: `Caja abierta en ${assignedBranch.nombre}.` });
    } catch (error) {
      setNotice({ type: 'error', message: error.code === '23505' ? 'Ya existe una caja abierta para tu usuario en esta sucursal.' : `No se pudo abrir la caja: ${error.message}` });
    } finally {
      setSaving(false);
    }
  };

  const closeCash = async () => {
    const invalidCount = Object.values(countedMethods).some((value) => value === '' || !Number.isFinite(Number(value)) || Number(value) < 0);
    if (invalidCount) {
      setNotice({ type: 'error', message: 'Ingresa el conteo real de efectivo, tarjeta, transferencia y QR. Usa 0 cuando no hubo movimientos.' });
      return;
    }
    if (summary.loading || summary.error) {
      setNotice({ type: 'error', message: 'Espera a que se carguen correctamente las ventas y gastos de esta caja.' });
      return;
    }
    if (!window.confirm(`¿Cerrar la caja #${cashBox.id} y guardar la rendición de los cuatro medios de pago?`)) return;
    const report = {
      cajaId: cashBox.id,
      empresa: profile?.empresas?.nombre || 'Negocio',
      cajero: cashBox.usuario || personName(profile),
      desde: cashBox.fecha_apertura,
      hasta: new Date().toISOString(),
      montoInicial: Number(cashBox.saldo_inicial || 0),
      montoCierre: Number(countedCash),
      ventas: summary.sales,
      cantidadVentas: summary.count,
      promedioVenta: summary.count ? summary.sales / summary.count : 0,
      ventasRows: summary.salesRows || [],
      gastos: summary.expenses,
      pagos: { Efectivo: summary.cashSales, Tarjeta: summary.cardSales, Transferencia: summary.transferSales, QR: summary.qrSales },
      metodos: Object.fromEntries(Object.entries(countedMethods).map(([method, value]) => [method, { sistema: expectedMethods[method], contado: Number(value), diferencia: Number(value) - expectedMethods[method] }])),
      nota: closingNote.trim(),
    };
    setSaving(true);
    setNotice(null);
    try {
      const rendicionFinal = {
        version: 1,
        moneda: 'PYG',
        metodos: Object.fromEntries(Object.entries(countedMethods).map(([method, value]) => [method, {
          sistema: expectedMethods[method],
          contado: Number(value),
          diferencia: Number(value) - expectedMethods[method],
        }])),
        ventas: { efectivo: summary.cashSales, tarjeta: summary.cardSales, transferencia: summary.transferSales, qr: summary.qrSales },
        gastos: { total: summary.expenses, efectivo: summary.cashExpenses, tarjeta: summary.cardExpenses, transferencia: summary.transferExpenses, qr: summary.qrExpenses },
      };
      const { data: closed, error } = await supabase.from('caja_registros').update({
        estado: 'Cerrada',
        fecha_cierre: new Date().toISOString(),
        conteo_real: Number(countedCash),
        saldo_final: Number(countedCash),
        rendicion_final: rendicionFinal,
        nota_cierre: closingNote.trim() || null,
      }).eq('id', cashBox.id).eq('empresa_id', empresaId).eq('estado', 'Abierta')
        .select('id, estado, saldo_final, fecha_cierre, rendicion_final').maybeSingle();
      if (error) throw error;
      if (!closed) throw new Error('La caja ya fue cerrada o tu usuario no tiene permiso para cerrarla.');
      onChanged?.(null);
      onRefresh?.();
      setCountedCash('');
      setCountedCard('');
      setCountedTransfer('');
      setCountedQr('');
      setClosingNote('');
      const differencesText = Object.entries(rendicionFinal.metodos).map(([method, values]) => `${method}: ${money(values.diferencia)}`).join(' · ');
      setLastClosedReconciliation({ cajaId: cashBox.id, metodos: rendicionFinal.metodos });
      onReportReady?.(report);
      setNotice({ type: 'success', message: `Caja cerrada. Diferencias por medio: ${differencesText}.` });
    } catch (error) {
      setNotice({ type: 'error', message: `No se pudo cerrar la caja: ${error.message}` });
    } finally {
      setSaving(false);
    }
  };

  const openSavedReport = async (row) => {
    setReportLoadingId(row.id);
    try {
      const { data: salesRows, error } = await loadRows(() => supabase.from('ventas')
        .select('id, cliente, total, metodo_pago, fecha, estado_pago')
        .eq('empresa_id', empresaId).eq('caja_id', row.id).order('fecha', { ascending: true }));
      if (error) throw error;
      const sales = salesRows || [];
      const rendicion = row.rendicion_final || {};
      const salesTotal = sales.reduce((sum, sale) => sum + Number(sale.total || 0), 0);
      const savedPayments = rendicion.ventas || {};
      const paymentTotals = {
        Efectivo: Number(savedPayments.efectivo ?? sales.filter((sale) => sale.metodo_pago === 'Efectivo').reduce((sum, sale) => sum + Number(sale.total || 0), 0)),
        Tarjeta: Number(savedPayments.tarjeta ?? sales.filter((sale) => sale.metodo_pago === 'Tarjeta').reduce((sum, sale) => sum + Number(sale.total || 0), 0)),
        Transferencia: Number(savedPayments.transferencia ?? sales.filter((sale) => sale.metodo_pago === 'Transferencia').reduce((sum, sale) => sum + Number(sale.total || 0), 0)),
        QR: Number(savedPayments.qr ?? sales.filter((sale) => sale.metodo_pago === 'QR').reduce((sum, sale) => sum + Number(sale.total || 0), 0)),
      };
      const savedMethods = rendicion.metodos || {};
      const metodos = Object.fromEntries(Object.entries(paymentTotals).map(([method, paymentTotal]) => {
        const saved = savedMethods[method] || {};
        const sistema = Number(saved.sistema ?? (method === 'Efectivo' ? Number(row.saldo_inicial || 0) + paymentTotal : paymentTotal));
        const countedFromBox = method === 'Efectivo' ? row.conteo_real ?? row.saldo_final : 0;
        const contado = Number(saved.contado ?? countedFromBox ?? 0);
        return [method, { sistema, contado, diferencia: Number(saved.diferencia ?? contado - sistema) }];
      }));
      onReportReady?.({
        cajaId: row.id,
        empresa: profile?.empresas?.nombre || 'Negocio',
        cajero: row.usuario || personName(profile),
        desde: row.fecha_apertura,
        hasta: row.fecha_cierre,
        montoInicial: Number(row.saldo_inicial || 0),
        montoCierre: Number(row.conteo_real ?? row.saldo_final ?? 0),
        ventas: salesTotal || Object.values(paymentTotals).reduce((sum, amount) => sum + amount, 0),
        cantidadVentas: sales.length,
        promedioVenta: sales.length ? salesTotal / sales.length : 0,
        ventasRows: sales,
        gastos: Number(rendicion.gastos?.total || 0),
        pagos: paymentTotals,
        metodos,
        nota: row.nota_cierre || '',
      });
    } catch (error) {
      setNotice({ type: 'error', message: `No se pudo cargar el reporte de la caja #${row.id}: ${error.message}` });
    } finally {
      setReportLoadingId(null);
    }
  };

  return <div className="cash-module">
    {notice && <div className={`notice notice-${notice.type}`}><span>{notice.message}</span><button aria-label="Cerrar aviso" onClick={() => setNotice(null)}>×</button></div>}
    {lastClosedReconciliation && <section className="cash-reconciliation cash-reconciliation-result"><div><span className="eyebrow">CIERRE CONFIRMADO · CAJA #{lastClosedReconciliation.cajaId}</span><h3>Rendición guardada</h3></div>{Object.entries(lastClosedReconciliation.metodos).map(([method, values]) => <div className="cash-reconciliation-result-row" key={method}><span>{method}</span><span>Sistema {money(values.sistema)}</span><span>Contado {money(values.contado)}</span><strong className={Math.abs(values.diferencia) < 1 ? 'matched' : 'mismatch'}>Diferencia {values.diferencia > 0 ? '+' : ''}{money(values.diferencia)}</strong></div>)}</section>}
    {cashBox ? <>
      <article className="cash-card"><div className="cash-card-top"><span className="open-state open"><span /><strong>Caja abierta</strong></span><span>#{cashBox.id}</span></div><div className="cash-card-value"><small>Fondo de apertura</small><strong>{money(cashBox.saldo_inicial)}</strong></div><div className="cash-card-details"><span><Clock3 size={15} /> Apertura {stamp(cashBox.fecha_apertura)} · {cashBox.ubicacion_id ? branches.find((branch) => String(branch.id) === String(cashBox.ubicacion_id))?.nombre || 'Sucursal' : 'Sin sucursal'}</span><span><UserRound size={15} /> {cashBox.usuario || personName(profile)}</span></div></article>
      <div className="section-heading"><div><span className="eyebrow">ARQUEO DEL TURNO</span><h2>Resumen de caja</h2></div><button className="text-action" onClick={() => { setSummaryReload((value) => value + 1); onRefresh?.(); }} disabled={summary.loading}>Actualizar <RefreshCw size={14} /></button></div>
      {summary.error && <div className="notice notice-error"><CircleAlert size={17} /><span>No se pudo preparar el cierre: {summary.error}</span></div>}
      <div className="report-metrics"><article className="metric-card"><div className="metric-icon gold"><ArrowDownLeft size={18} /></div><span>Ventas del turno</span><strong>{summary.loading ? '…' : money(summary.sales)}</strong><small>{summary.count} operaciones</small></article><article className="metric-card"><div className="metric-icon coral"><Wallet size={18} /></div><span>Efectivo esperado</span><strong>{summary.loading ? '…' : money(expectedCash)}</strong><small>Apertura + efectivo − gastos</small></article></div>
      <div className="cash-payment-totals"><strong>Ingresos por medio de pago</strong><span>Efectivo {money(summary.cashSales)}</span><span>Tarjeta {money(summary.cardSales)}</span><span>Transferencia {money(summary.transferSales)}</span><span>QR {money(summary.qrSales)}</span><span>Gastos del turno {money(summary.expenses)}</span></div>
      {allowClose && <div className="cash-close-form">
        <section className="cash-reconciliation" aria-label="Rendición final por medio de pago">
          <div><h3>Rendición final</h3><p>Compara el total esperado con el conteo o cierre de cada medio.</p></div>
          <div className="cash-reconciliation-heading"><span>Medio</span><span>Sistema</span><span>Contado</span></div>
          {methodCounts.map(([method, value, setValue]) => {
            const differenceForMethod = methodDifferences[method];
            return <div className="cash-reconciliation-row" key={method}>
              <strong>{method}</strong>
              <span>{money(expectedMethods[method])}</span>
              <label className="cash-reconciliation-input"><input aria-label={`Conteo real de ${method}`} type="number" min="0" step="1" inputMode="decimal" value={value} onChange={(event) => setValue(event.target.value)} placeholder="0" /><small className={differenceForMethod === null ? '' : Math.abs(differenceForMethod) < 1 ? 'matched' : 'mismatch'}>{differenceForMethod === null ? 'Falta contar' : `${differenceForMethod > 0 ? '+' : ''}${money(differenceForMethod)}`}</small></label>
            </div>;
          })}
          <div className="cash-reconciliation-foot">Efectivo esperado incluye el fondo inicial y descuenta los gastos en efectivo. Los demás medios muestran ventas menos gastos registrados con ese medio.</div>
        </section>
        <label className="auth-form">Nota de cierre<textarea value={closingNote} onChange={(event) => setClosingNote(event.target.value)} placeholder="Observaciones del turno" rows={3} /></label>
        <button className="button cash-close-button" disabled={saving || summary.loading || Boolean(summary.error) || (allowClose && incompleteReconciliation)} onClick={closeCash}>{saving ? <LoaderCircle className="spin" size={17} /> : <LockKeyhole size={17} />}{saving ? 'Cerrando caja…' : 'Cerrar caja'}</button>
      </div>}
    </> : allowOpen ? <div className="cash-card"><div className="cash-card-top"><span className="open-state closed"><span /><strong>Caja cerrada</strong></span><span><DoorOpen size={16} /></span></div><h2 className="cash-form-heading">Abrir caja</h2><p>Registra el fondo inicial del turno en la base compartida con el sistema de escritorio.</p>
      <form className="cash-open-form" onSubmit={openCash}>
        {allLocations ? <label className="auth-form">Sucursal<select value={selectedBranch} onChange={(event) => setSelectedBranch(event.target.value)} required><option value="">Selecciona una sucursal</option>{branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.nombre}{branch.codigo_ubicacion ? ` (${branch.codigo_ubicacion})` : ''}</option>)}</select></label>
          : <div className="cash-card-details"><span><Store size={15} /> Sucursal asignada</span><strong>{assignedBranch?.nombre || 'Sin sucursal asignada'}</strong></div>}
        <label className="auth-form">Fondo inicial (Gs)<input type="number" min="0" step="1" inputMode="decimal" value={openingAmount} onChange={(event) => setOpeningAmount(event.target.value)} placeholder="Ej. 500000" required /></label>
        <button className="button button-primary button-large" disabled={saving || branches.length === 0 || !branchId}>{saving ? <LoaderCircle className="spin" size={17} /> : <DoorOpen size={17} />}{saving ? 'Abriendo caja…' : 'Abrir caja'}</button>
        {branches.length === 0 && <p className="cash-hint">No hay sucursales activas disponibles para este negocio.</p>}
      </form>
    </div> : <div className="empty-state"><Wallet size={30} /><strong>No tienes una caja abierta</strong><p>Solicita al administrador el permiso para abrir caja.</p></div>}
    {history.length > 0 && <><div className="section-heading"><div><span className="eyebrow">MOVIMIENTOS</span><h2>Historial de cajas</h2></div><button className="text-action" onClick={() => { setSummaryReload((value) => value + 1); onRefresh?.(); }}>Actualizar <RefreshCw size={14} /></button></div><div className="inventory-list">{history.map((row) => <article className="inventory-row module-row" key={row.id}><div className="inventory-art"><Wallet size={19} /></div><div className="inventory-name"><strong>{row.usuario || 'Caja'}</strong><span>{stamp(row.fecha_apertura)}{row.fecha_cierre ? ` · Cierre ${stamp(row.fecha_cierre)}` : ''}</span>{row.rendicion_final?.metodos && <span className="cash-history-reconciliation">{Object.entries(row.rendicion_final.metodos).map(([method, values]) => `${method} ${money(values.contado)}`).join(' · ')}</span>}{row.estado !== 'Abierta' && <button className="text-action cash-report-history-button" disabled={reportLoadingId === row.id} onClick={() => openSavedReport(row)}>{reportLoadingId === row.id ? 'Cargando…' : 'Ver informe'} <FileText size={14} /></button>}</div><div className={`stock-value ${row.estado === 'Abierta' ? '' : 'critical'}`}><strong>{row.estado === 'Abierta' ? money(row.saldo_inicial) : money(row.saldo_final)}</strong><small>{row.estado || 'Registrada'}</small></div></article>)}</div></>}
  </div>;
}

function reportTimestamp(value) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString('es-PY', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false });
}

function CashReportSection({ title, children }) {
  return <section className="cash-report-section"><h3>{title}</h3>{children}</section>;
}

function CashReportRow({ label, value }) {
  return <div className="cash-report-row"><span>{label}</span><strong>{value}</strong></div>;
}

function cashReportCsv(report) {
  const rows = [
    ['Reporte de fin del turno'], ['Negocio', report.empresa], ['Caja', report.cajaId], ['Cajero', report.cajero],
    ['Desde', reportTimestamp(report.desde)], ['Hasta', reportTimestamp(report.hasta)], [],
    ['Ventas del turno'], ['Facturas', report.cantidadVentas], ['Total facturado', report.ventas], ['Promedio por factura', report.promedioVenta], [],
    ['Pagos por medio'], ...Object.entries(report.pagos).map(([method, amount]) => [method, amount]), ['Gastos del turno', report.gastos], [],
    ['Rendición final'], ['Medio', 'Sistema', 'Declarado', 'Diferencia'],
    ...Object.entries(report.metodos).map(([method, values]) => [method, values.sistema, values.contado, values.diferencia]),
    ['Monto inicial', report.montoInicial], ['Monto cierre efectivo', report.montoCierre], [],
    ['Ventas registradas'], ['ID', 'Fecha', 'Cliente', 'Medio de pago', 'Total'],
    ...report.ventasRows.map((sale) => [sale.id, reportTimestamp(sale.fecha), sale.cliente || 'Cliente ocasional', sale.metodo_pago || '', sale.total]),
  ];
  return rows.map((row) => row.map((cell) => `"${String(cell ?? '').replaceAll('"', '""')}"`).join(';')).join('\r\n');
}

function downloadCashReport(report) {
  const blob = new Blob([`\uFEFF${cashReportCsv(report)}`], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `cierre-caja-${report.cajaId}.csv`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

async function shareCashReport(report) {
  const text = [
    `Reporte de Fin del Turno · ${report.empresa}`,
    `Caja #${report.cajaId} · Cajero: ${report.cajero}`,
    `Desde ${reportTimestamp(report.desde)} · Hasta ${reportTimestamp(report.hasta)}`,
    `Ventas: ${report.cantidadVentas} · Total: ${money(report.ventas)} · Promedio: ${money(report.promedioVenta)}`,
    ...Object.entries(report.pagos).map(([method, amount]) => `${method}: ${money(amount)}`),
    ...Object.entries(report.metodos).map(([method, values]) => `${method} declarado: ${money(values.contado)} · Diferencia: ${money(values.diferencia)}`),
    `Monto inicial: ${money(report.montoInicial)} · Cierre efectivo: ${money(report.montoCierre)}`,
  ].join('\n');
  if (navigator.share) {
    try { await navigator.share({ title: 'Reporte de fin del turno', text }); return; } catch (error) { if (error?.name === 'AbortError') return; }
  }
  try {
    await navigator.clipboard.writeText(text);
    window.alert('Resumen copiado para compartir.');
  } catch {
    window.alert(text);
  }
}
