import { useEffect, useMemo, useState } from 'react';
import { Building2, CircleAlert, LoaderCircle, Package, RefreshCw, Search, Store, UserRound, Wallet } from 'lucide-react';
import { supabase } from './supabaseClient.js';

const money = (value) => `Gs ${Math.round(Number(value) || 0).toLocaleString('es-PY')}`;
const stamp = (value) => {
  if (!value) return 'Sin fecha';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? 'Sin fecha' : parsed.toLocaleDateString('es-PY', { day: '2-digit', month: 'short', year: 'numeric' });
};

export default function MobileModules({ screen, empresaId, allowCustomers, allowSuppliers, allowPurchases, allowExpenses }) {
  const [data, setData] = useState({ loading: true, rows: [], error: '' });
  const [query, setQuery] = useState('');
  const [contactType, setContactType] = useState(allowCustomers ? 'customers' : 'suppliers');
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let live = true;
    const load = async () => {
      if (!empresaId) return;
      setData({ loading: true, rows: [], error: '' });
      let result;
      if (screen === 'contacts') {
        const table = contactType === 'customers' ? 'clientes' : 'proveedores';
        const columns = contactType === 'customers'
          ? 'id, tipo_contacto, nombre, nombre_empresa, celular, email, grupo_clientes, saldo_apertura, estado'
          : 'id, empresa, nombre_contacto, email, ruc, termino_pago, saldo';
        let contactQuery = supabase.from(table).select(columns).eq('empresa_id', empresaId);
        if (contactType === 'customers') contactQuery = contactQuery.or('tipo_contacto.is.null,tipo_contacto.neq.Proveedores');
        result = await contactQuery.order('id', { ascending: false }).limit(500);
      } else if (screen === 'purchases') {
        result = await supabase.from('compras').select('id, proveedor_nombre, nro_factura, total, saldo_pendiente, estado, estado_compra, fecha, ubicacion').eq('empresa_id', empresaId).order('fecha', { ascending: false }).limit(500);
      } else {
        result = await supabase.from('gastos').select('id, descripcion, monto, categoria, metodo_pago, creado_en').eq('empresa_id', empresaId).order('creado_en', { ascending: false }).limit(500);
      }
      if (!live) return;
      setData({ loading: false, rows: result.data || [], error: result.error?.message || '' });
    };
    load();
    return () => { live = false; };
  }, [screen, empresaId, contactType, reload]);

  const filtered = useMemo(() => {
    const text = query.trim().toLocaleLowerCase('es');
    return data.rows.filter((row) => {
      const searchable = screen === 'contacts'
        ? `${row.nombre || ''} ${row.nombre_empresa || row.empresa || ''} ${row.nombre_contacto || ''} ${row.celular || ''} ${row.email || ''} ${row.ruc || ''}`
        : screen === 'purchases'
          ? `${row.proveedor_nombre || ''} ${row.nro_factura || ''} ${row.estado || ''} ${row.estado_compra || ''}`
          : `${row.descripcion || ''} ${row.categoria || ''} ${row.metodo_pago || ''}`;
      return searchable.toLocaleLowerCase('es').includes(text);
    });
  }, [data.rows, query, screen]);
  const total = filtered.reduce((sum, row) => sum + Number(screen === 'purchases' ? row.total : row.monto || 0), 0);

  const title = screen === 'contacts' ? 'Contactos' : screen === 'purchases' ? 'Compras' : 'Gastos';
  const subtitle = screen === 'contacts'
    ? 'Consulta los datos de tus clientes y proveedores.'
    : screen === 'purchases' ? 'Historial de compras registrado en GDA POS.' : 'Gastos registrados en la operación del negocio.';

  return <section className="screen-section">
    <div className="screen-title"><div><span className="eyebrow">OPERACIÓN DEL NEGOCIO</span><h1>{title}</h1><p>{subtitle}</p></div></div>
    {screen === 'contacts' && <div className="module-segments">
      {allowCustomers && <button className={contactType === 'customers' ? 'active' : ''} onClick={() => { setContactType('customers'); setQuery(''); }}>Clientes</button>}
      {allowSuppliers && <button className={contactType === 'suppliers' ? 'active' : ''} onClick={() => { setContactType('suppliers'); setQuery(''); }}>Proveedores</button>}
    </div>}
    <div className="search-field"><Search size={18} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={screen === 'contacts' ? 'Buscar por nombre, teléfono o correo' : screen === 'purchases' ? 'Buscar por proveedor o factura' : 'Buscar por descripción o categoría'} /><button className="module-refresh" onClick={() => setReload((value) => value + 1)} aria-label="Actualizar"><RefreshCw size={16} /></button></div>
    {data.loading ? <div className="empty-state"><LoaderCircle className="spin" size={24} /><strong>Consultando datos</strong></div>
      : data.error ? <div className="notice notice-error"><CircleAlert size={17} /><span>No se pudo cargar {title.toLocaleLowerCase('es')}: {data.error}</span></div>
        : <>
          <div className="module-summary"><span>{filtered.length} registros</span>{screen !== 'contacts' && <strong>{money(total)}</strong>}</div>
          {filtered.length === 0 ? <div className="empty-state"><Package size={28} /><strong>Sin resultados</strong><p>Ajusta la búsqueda o vuelve a intentarlo más tarde.</p></div>
            : <div className="inventory-list">{filtered.map((row) => {
              if (screen === 'contacts') {
                const customer = contactType === 'customers';
                const name = customer ? (row.nombre_empresa || row.nombre || 'Cliente sin nombre') : (row.empresa || row.nombre_contacto || 'Proveedor sin nombre');
                const detail = customer ? [row.nombre_empresa && row.nombre ? row.nombre : '', row.celular, row.email].filter(Boolean).join(' · ') : [row.nombre_contacto, row.ruc ? `RUC ${row.ruc}` : '', row.email].filter(Boolean).join(' · ');
                return <article className="inventory-row module-row" key={row.id}><div className="inventory-art">{customer ? <UserRound size={19} /> : <Building2 size={19} />}</div><div className="inventory-name"><strong>{name}</strong><span>{detail || (customer ? row.grupo_clientes : row.termino_pago) || 'Sin datos adicionales'}</span></div>{customer && Number(row.saldo_apertura) > 0 && <div className="stock-value"><small>Saldo inicial</small><strong>{money(row.saldo_apertura)}</strong></div>}</article>;
              }
              if (screen === 'purchases') {
                return <article className="inventory-row module-row" key={row.id}><div className="inventory-art"><Package size={19} /></div><div className="inventory-name"><strong>{row.proveedor_nombre || 'Proveedor no indicado'}</strong><span>{stamp(row.fecha)}{row.nro_factura ? ` · Factura ${row.nro_factura}` : ''}{row.ubicacion ? ` · ${row.ubicacion}` : ''}</span></div><div className="stock-value"><strong>{money(row.total)}</strong><small>{Number(row.saldo_pendiente) > 0 ? `Pendiente ${money(row.saldo_pendiente)}` : row.estado_compra || row.estado || 'Registrada'}</small></div></article>;
              }
              return <article className="inventory-row module-row" key={row.id}><div className="inventory-art"><Wallet size={19} /></div><div className="inventory-name"><strong>{row.descripcion || row.categoria || 'Gasto'}</strong><span>{row.categoria || 'Sin categoría'} · {stamp(row.creado_en)}{row.metodo_pago ? ` · ${row.metodo_pago}` : ''}</span></div><div className="stock-value critical"><strong>{money(row.monto)}</strong></div></article>;
            })}</div>}
        </>}
  </section>;
}
