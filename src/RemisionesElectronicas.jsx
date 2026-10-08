import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, FileCheck2, RefreshCw, Search, Truck, X } from 'lucide-react';
import { supabase } from './supabaseClient';
import { useEmpresaInfo } from './utils/useEmpresa';

const fechaHoy = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const dateTimeLocal = (date = new Date()) => {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
};
const moneda = (value) => `Gs ${Math.round(Number(value) || 0).toLocaleString('es-PY')}`;
const numeroRemision = (value) => (Number(value) || 0).toLocaleString('es-PY', { maximumFractionDigits: 3 });
const fecha = (value) => value ? new Date(value).toLocaleString('es-PY') : '—';
const estados = {
  EMITIDA: 'bg-emerald-100 text-emerald-800', RECHAZADA: 'bg-red-100 text-red-800',
  EN_PROCESO: 'bg-amber-100 text-amber-800', INCIERTA: 'bg-orange-100 text-orange-900',
};
const FORM_VACIO = {
  pointOfExpedition: '001', documentNumber: '', serieNumber: '', observation: '', fiscalDescription: '',
  client: { fantasyName: '', businessName: '', ruc: '', address: '', email: '', isContributor: false, houseNumber: '0', cityIdSifen: '', countryIdSifen: 'PRY', contributorType: '1', documentType: '1', documentNumber: '', phone: '', cellPhone: '', departmentOffice: '', addressReference: '', operationType: '2' },
  establishment: { address: '', houseNumber: '0', cityId: '' },
  transfer: { transferMotiveType: '1', transferMotiveTypeOtherDescription: '', responsibleOfEmissionType: '1', responsibleOfFreightType: '1', shouldAssociateDocument: false, futureDateOfTransfer: dateTimeLocal(), referencedCdc: '', modalityTransportType: '1', estimatedTransferStartDate: dateTimeLocal(), estimatedTransferFinishDate: dateTimeLocal(), transportType: '1', vehicleIdentificationType: '1', vehicleType: '', vehicleBrand: '', vehicleIdentificationNumber: '', vehicleLicensePlate: '' },
  originAndDestination: { originCityIdSifen: '', originAddress: '', originHouseNumber: '0', originAddressReference: '', destinationCityIdSifen: '', destinationAddress: '', destinationHouseNumber: '0', destinationAddressReference: '' },
  shipper: { isContributor: false, businessName: '', ruc: '', documentType: '1', documentNumber: '', driverDocumentNumber: '', driverFullName: '' },
};

export default function RemisionesElectronicas({ perfilUsuario, session }) {
  const { id: empresaId } = useEmpresaInfo();
  const esAdmin = (perfilUsuario?.roles?.nombre || '').toLowerCase().includes('admin');
  const permisos = perfilUsuario?.roles?.permisos;
  const puedeEmitir = esAdmin || permisos?.ventas_pos?.['Acceder al Punto de Venta'] === true || permisos?.productos?.['Transferir stock'] === true;
  const [registros, setRegistros] = useState([]);
  const [ventas, setVentas] = useState([]);
  const [transferencias, setTransferencias] = useState([]);
  const [ubicaciones, setUbicaciones] = useState([]);
  const [empresa, setEmpresa] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');
  const [resultado, setResultado] = useState(null);
  const [busqueda, setBusqueda] = useState('');
  const [modal, setModal] = useState(false);
  const [origenTipo, setOrigenTipo] = useState('venta');
  const [origenId, setOrigenId] = useState('');
  const [itemsOrigen, setItemsOrigen] = useState([]);
  const [cargandoItems, setCargandoItems] = useState(false);
  const [form, setForm] = useState(FORM_VACIO);
  const [aceptaEmisionReal, setAceptaEmisionReal] = useState(false);

  const cargar = useCallback(async () => {
    if (!empresaId) return;
    setCargando(true); setError('');
    const [r, v, t, u, e] = await Promise.all([
      supabase.from('remisiones_electronicas').select('id,origen_tipo,venta_id,transferencia_id,punto_expedicion,numero_documento,goekua_id,cdc,estado,origen_nombre,destino_nombre,motivo,fecha_traslado,creado_en,error_respuesta').eq('empresa_id', empresaId).order('creado_en', { ascending: false }).limit(1000),
      supabase.from('ventas').select('id,cliente,cliente_nombre,total,fecha,ubicacion_id').eq('empresa_id', empresaId).order('fecha', { ascending: false }).limit(3000),
      supabase.from('transferencias_stock').select('id,origen_ubicacion_id,destino_ubicacion_id,items,created_at').eq('empresa_id', empresaId).order('created_at', { ascending: false }).limit(1000),
      supabase.from('ubicaciones_comerciales').select('id,nombre,direccion,ciudad,departamento,pais,codigo_postal,activo').eq('empresa_id', empresaId).eq('activo', true).order('nombre'),
      supabase.from('empresas').select('id,nombre,ruc,direccion,telefono,fe_activa,fe_proveedor').eq('id', empresaId).maybeSingle(),
    ]);
    if (r.error) setError(r.error.code === '42P01' || r.error.code === 'PGRST205' ? 'Falta aplicar database/migration_remisiones_electronicas.sql en el proyecto Supabase conectado.' : `No se pudo cargar el historial: ${r.error.message}`);
    else setRegistros(r.data || []);
    if (v.error) setError((prior) => [prior, `No se pudieron cargar las ventas: ${v.error.message}`].filter(Boolean).join(' ')); else setVentas(v.data || []);
    if (t.error) setError((prior) => [prior, `No se pudieron cargar las transferencias: ${t.error.message}`].filter(Boolean).join(' ')); else setTransferencias(t.data || []);
    if (u.error) setError((prior) => [prior, `No se pudieron cargar las ubicaciones: ${u.error.message}`].filter(Boolean).join(' ')); else setUbicaciones(u.data || []);
    if (e.error) setError((prior) => [prior, `No se pudo leer la configuración de la empresa: ${e.error.message}`].filter(Boolean).join(' ')); else setEmpresa(e.data);
    setCargando(false);
  }, [empresaId]);

  useEffect(() => { cargar(); }, [cargar]);
  useEffect(() => {
    if (!modal || !origenId || !empresaId) { setItemsOrigen([]); return; }
    let vigente = true;
    setCargandoItems(true);
    (async () => {
      if (origenTipo === 'venta') {
        const { data, error: consultaError } = await supabase.from('detalle_ventas').select('producto_id,nombre_producto,cantidad,precio_unitario').eq('venta_id', Number(origenId)).eq('empresa_id', empresaId);
        if (vigente) { setItemsOrigen(data || []); if (consultaError) setError(`No se pudo leer el detalle de la venta: ${consultaError.message}`); }
      } else {
        const transferencia = transferencias.find((row) => String(row.id) === String(origenId));
        const items = Array.isArray(transferencia?.items) ? transferencia.items : [];
        const ids = items.map((item) => Number(item.producto_id)).filter((id) => Number.isSafeInteger(id) && id > 0);
        const { data: products, error: productsError } = ids.length ? await supabase.from('productos').select('id,precio_venta').eq('empresa_id', empresaId).in('id', ids) : { data: [], error: null };
        const priceById = new Map((products || []).map((product) => [Number(product.id), product.precio_venta]));
        if (vigente) { setItemsOrigen(items.map((item) => ({ producto_id: item.producto_id, nombre_producto: item.nombre, cantidad: item.cantidad, precio_unitario: priceById.get(Number(item.producto_id)) }))); if (productsError) setError(`No se pudo leer el precio de los productos: ${productsError.message}`); }
      }
      if (vigente) setCargandoItems(false);
    })();
    return () => { vigente = false; };
  }, [modal, origenId, origenTipo, empresaId, transferencias]);
  const locationName = useMemo(() => new Map(ubicaciones.map((u) => [String(u.id), u.nombre])), [ubicaciones]);
  const sources = origenTipo === 'venta' ? ventas : transferencias;
  const sourceLabel = (item) => origenTipo === 'venta'
    ? `${item.id} · ${item.cliente_nombre || item.cliente || 'Cliente Ocasional'} · ${moneda(item.total)} · ${fecha(item.fecha)}`
    : `${new Date(item.created_at).toLocaleDateString('es-PY')} · ${locationName.get(String(item.origen_ubicacion_id)) || 'Origen'} → ${locationName.get(String(item.destino_ubicacion_id)) || 'Destino'} · ${(item.items || []).length} artículos`;
  const filtered = registros.filter((item) => `${item.origen_nombre} ${item.destino_nombre} ${item.punto_expedicion}-${item.numero_documento} ${item.goekua_id || ''} ${item.cdc || ''} ${item.estado}`.toLowerCase().includes(busqueda.trim().toLowerCase()));

  const abrir = () => {
    if (!puedeEmitir) { setError('Tu rol necesita permiso de Punto de Venta o Transferir stock para emitir remisiones.'); return; }
    const nueva = structuredClone(FORM_VACIO);
    const ahora = dateTimeLocal();
    nueva.transfer.futureDateOfTransfer = ahora;
    nueva.transfer.estimatedTransferStartDate = ahora;
    nueva.transfer.estimatedTransferFinishDate = ahora;
    nueva.establishment.address = empresa?.direccion || '';
    nueva.shipper.businessName = empresa?.nombre || '';
    nueva.shipper.ruc = empresa?.ruc || '';
    const query = new URLSearchParams(window.location.search);
    const prefTipo = query.get('origen_tipo');
    const prefId = query.get('origen_id');
    if (['venta', 'transferencia'].includes(prefTipo)) setOrigenTipo(prefTipo);
    setForm(nueva); setOrigenId(prefId || ''); setAceptaEmisionReal(false); setResultado(null); setError(''); setModal(true);
  };

  const setRoot = (key, value) => setForm((actual) => ({ ...actual, [key]: value }));
  const setNested = (section, key, value) => setForm((actual) => ({ ...actual, [section]: { ...actual[section], [key]: value } }));

  const emitir = async (event) => {
    event.preventDefault();
    setError(''); setResultado(null);
    if (!empresaId || !origenId) return setError('Seleccioná una venta o transferencia de origen.');
    if (!aceptaEmisionReal) return setError('Confirmá que entendés que esta acción envía un documento electrónico real a Goekua/SIFEN.');
    if (!empresa?.fe_activa || empresa.fe_proveedor !== 'goekua') return setError('La facturación Goekua debe estar activa en la empresa.');
    const required = [form.documentNumber, form.client.businessName, form.client.address, form.client.cityIdSifen,
      form.establishment.address, form.establishment.cityId, form.originAndDestination.originCityIdSifen,
      form.originAndDestination.originAddress, form.originAndDestination.destinationCityIdSifen,
      form.originAndDestination.destinationAddress, form.shipper.businessName, form.shipper.driverFullName,
      form.fiscalDescription, form.transfer.futureDateOfTransfer, form.transfer.estimatedTransferStartDate,
      form.transfer.estimatedTransferFinishDate];
    if (required.some((value) => !String(value ?? '').trim())) return setError('Completá todos los datos fiscales, ubicaciones, conductor y fechas.');
    const inicio = new Date(form.transfer.estimatedTransferStartDate);
    const fin = new Date(form.transfer.estimatedTransferFinishDate);
    if (!Number.isFinite(inicio.getTime()) || !Number.isFinite(fin.getTime()) || fin < inicio) return setError('La fecha estimada de fin debe ser igual o posterior al inicio.');
    if (form.client.isContributor && !form.client.ruc.trim()) return setError('Ingresá el RUC del receptor contribuyente.');
    if (!form.client.isContributor && !form.client.documentNumber.trim()) return setError('Ingresá el documento del receptor no contribuyente.');
    setGuardando(true);
    try {
      const { data, error: invokeError } = await supabase.functions.invoke('generate-remission', {
        body: { empresaId, origenTipo, origenId, solicitudId: crypto.randomUUID(), pointOfExpedition: form.pointOfExpedition,
          documentNumber: form.documentNumber, serieNumber: form.serieNumber, observation: form.observation,
          fiscalDescription: form.fiscalDescription, client: form.client, establishment: form.establishment,
          transfer: { ...form.transfer, futureDateOfTransfer: new Date(form.transfer.futureDateOfTransfer).toISOString(), estimatedTransferStartDate: inicio.toISOString(), estimatedTransferFinishDate: fin.toISOString() }, originAndDestination: form.originAndDestination, shipper: form.shipper },
      });
      if (invokeError) throw new Error(invokeError.message || 'No se pudo invocar la función segura de remisiones.');
      if (data?.error) setError(data.error);
      if (data?.estado) setResultado(data);
      await cargar();
    } catch (err) { setError(err.message || 'No se pudo emitir la remisión. Revisá el historial antes de volver a intentarlo.'); }
    finally { setGuardando(false); }
  };

  const input = (label, section, key, props = {}) => <label className="block text-xs font-semibold text-slate-700">{label}<input {...props} value={section ? form[section][key] : form[key]} onChange={(e) => section ? setNested(section, key, e.target.value) : setRoot(key, e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-normal outline-none focus:border-orange-400" /></label>;

  return <main className="mx-auto w-full max-w-7xl space-y-5 p-4 md:p-6">
    <header className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="flex items-center gap-2 text-2xl font-bold text-slate-900"><Truck size={24}/>Remisiones electrónicas</h1><p className="mt-1 text-sm text-slate-500">Documentos SIFEN de traslado originados desde ventas o transferencias de stock.</p></div><div className="flex gap-2"><button type="button" onClick={cargar} className="inline-flex items-center gap-2 rounded-lg border bg-white px-3 py-2 text-sm font-semibold"><RefreshCw size={16}/>Actualizar</button><button type="button" onClick={abrir} className="rounded-lg bg-orange-500 px-4 py-2 text-sm font-bold text-white hover:bg-orange-600">+ Nueva remisión</button></div></header>
    <div className="flex gap-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950"><AlertTriangle size={18} className="shrink-0"/><p>Emitir crea y envía un documento tributario real a Goekua/SIFEN. Usá el siguiente número autorizado y los códigos SIFEN correctos. Si la respuesta queda incierta, no vuelvas a emitir hasta verificar Goekua.</p></div>
    {error && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</div>}
    <section className="overflow-hidden rounded-xl border bg-white"><div className="flex flex-wrap items-center justify-between gap-3 border-b p-4"><div><h2 className="font-semibold">Historial de remisiones</h2><p className="text-xs text-slate-500">No se crean ni alteran ventas o existencias.</p></div><label className="relative block w-full sm:max-w-sm"><Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"/><input aria-label="Buscar remisiones" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="N.º, origen, destino, CDC..." className="w-full rounded-lg border py-2 pl-9 pr-3 text-sm"/></label></div><div className="overflow-x-auto"><table className="w-full min-w-[950px] text-left text-sm"><thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="p-3">N.º</th><th className="p-3">Fecha</th><th className="p-3">Origen</th><th className="p-3">Destino</th><th className="p-3">Motivo SIFEN</th><th className="p-3">SIFEN / CDC</th><th className="p-3">Estado</th></tr></thead><tbody className="divide-y">{cargando ? <tr><td colSpan="7" className="p-10 text-center text-slate-500">Cargando historial…</td></tr> : filtered.length ? filtered.map((item) => <tr key={item.id} className="align-top hover:bg-slate-50"><td className="whitespace-nowrap p-3 font-mono text-xs">{item.punto_expedicion}-{String(item.numero_documento).padStart(7, '0')}</td><td className="whitespace-nowrap p-3">{fecha(item.fecha_traslado)}</td><td className="p-3"><b>{item.origen_nombre}</b><div className="text-xs text-slate-500">{item.origen_tipo === 'venta' ? 'Venta' : 'Transferencia'}</div></td><td className="p-3">{item.destino_nombre}</td><td className="p-3">{item.motivo}</td><td className="max-w-[220px] break-all p-3 text-xs">{item.cdc || item.goekua_id || 'Pendiente de respuesta'}{item.error_respuesta && <div className="mt-1 text-orange-800">{item.error_respuesta}</div>}</td><td className="p-3"><span className={`rounded-full px-2 py-1 text-xs font-bold ${estados[item.estado] || 'bg-slate-100 text-slate-700'}`}>{item.estado}</span></td></tr>) : <tr><td colSpan="7" className="p-10 text-center text-slate-500">{busqueda ? 'No hay remisiones que coincidan.' : 'Todavía no hay notas electrónicas emitidas.'}</td></tr>}</tbody></table></div></section>
    {resultado && <div role="status" className={`rounded-lg border p-3 text-sm ${resultado.estado === 'EMITIDA' ? 'border-emerald-200 bg-emerald-50 text-emerald-900' : 'border-amber-300 bg-amber-50 text-amber-950'}`}><b>{resultado.estado === 'EMITIDA' ? 'Documento enviado a Goekua.' : `Resultado: ${resultado.estado}.`}</b> {resultado.cdc || resultado.goekua_id || resultado.error || ''}</div>}

    {modal && <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/60 p-2 sm:p-5"><form onSubmit={emitir} role="dialog" aria-modal="true" aria-labelledby="remision-title" className="max-h-[96vh] w-full max-w-5xl space-y-5 overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl"><div className="flex items-start justify-between"><div><h2 id="remision-title" className="flex items-center gap-2 text-xl font-bold"><FileCheck2 size={20} className="text-orange-600"/>Emitir remisión electrónica</h2><p className="mt-1 text-xs text-slate-500">Los códigos, dirección, receptor, transporte y numeración deben coincidir con la autorización SIFEN.</p></div><button type="button" onClick={() => !guardando && setModal(false)} aria-label="Cerrar" className="rounded p-2 text-slate-500 hover:bg-slate-100"><X size={18}/></button></div>
      <section className="grid gap-3 rounded-xl border p-4 sm:grid-cols-3"><label className="text-xs font-semibold">Origen<select value={origenTipo} onChange={(e) => { setOrigenTipo(e.target.value); setOrigenId(''); }} className="mt-1 w-full rounded-lg border bg-white p-2.5 text-sm font-normal"><option value="venta">Venta</option><option value="transferencia">Transferencia de stock</option></select></label><label className="text-xs font-semibold sm:col-span-2">Documento de origen<select required value={origenId} onChange={(e) => setOrigenId(e.target.value)} className="mt-1 w-full rounded-lg border bg-white p-2.5 text-sm font-normal"><option value="">Seleccioná…</option>{sources.map((item) => <option key={item.id} value={item.id}>{sourceLabel(item)}</option>)}</select></label></section>
      <section className="rounded-xl border p-4"><h3 className="font-bold">Productos que se declararán</h3>{cargandoItems ? <p className="mt-2 text-xs text-slate-500">Cargando detalle de origen…</p> : itemsOrigen.length ? <div className="mt-2 max-h-36 divide-y overflow-y-auto">{itemsOrigen.map((item, index) => <div key={`${item.producto_id}-${index}`} className="flex flex-wrap justify-between gap-2 py-2 text-xs"><span className="font-medium">{item.nombre_producto || `Producto ${item.producto_id}`}</span><span>{numeroRemision(item.cantidad)} × {moneda(item.precio_unitario)}</span></div>)}</div> : <p className="mt-2 text-xs text-slate-500">Seleccioná una venta o transferencia con detalle de productos.</p>}<p className="mt-2 text-[10px] text-slate-500">Los artículos y cantidades se consultan de nuevo en el servidor al emitir. Si un producto no tiene IVA definido, se aplica el valor predeterminado actual del POS (10%); confirmá la tasa antes de emitir.</p></section>
      <section className="space-y-3 rounded-xl border p-4"><h3 className="font-bold">Numeración y traslado</h3><div className="grid gap-3 sm:grid-cols-4">{input('Punto de expedición', null, 'pointOfExpedition', { required: true, maxLength: 3 })}{input('Número autorizado', null, 'documentNumber', { required: true, inputMode: 'numeric', pattern: '[0-9]{1,7}', maxLength: 7 })}{input('Serie (si aplica)', null, 'serieNumber', { maxLength: 2 })}<label className="text-xs font-semibold">Motivo SIFEN<input type="number" min="1" step="1" required value={form.transfer.transferMotiveType} onChange={(e) => setNested('transfer', 'transferMotiveType', e.target.value)} className="mt-1 w-full rounded-lg border p-2 text-sm font-normal"/><span className="text-[10px] font-normal text-slate-500">Código definido por SIFEN/Goekua</span></label></div><div className="grid gap-3 sm:grid-cols-3"><label className="text-xs font-semibold">Responsable de emisión<input type="number" min="1" step="1" value={form.transfer.responsibleOfEmissionType} onChange={(e) => setNested('transfer', 'responsibleOfEmissionType', e.target.value)} className="mt-1 w-full rounded-lg border p-2 text-sm font-normal"/></label><label className="text-xs font-semibold">Responsable del flete<input type="number" min="1" step="1" value={form.transfer.responsibleOfFreightType} onChange={(e) => setNested('transfer', 'responsibleOfFreightType', e.target.value)} className="mt-1 w-full rounded-lg border p-2 text-sm font-normal"/></label><label className="text-xs font-semibold">Modalidad de transporte<input type="number" min="1" step="1" value={form.transfer.modalityTransportType} onChange={(e) => setNested('transfer', 'modalityTransportType', e.target.value)} className="mt-1 w-full rounded-lg border p-2 text-sm font-normal"/></label><label className="text-xs font-semibold">Tipo de transporte<input type="number" min="1" step="1" value={form.transfer.transportType} onChange={(e) => setNested('transfer', 'transportType', e.target.value)} className="mt-1 w-full rounded-lg border p-2 text-sm font-normal"/></label><label className="text-xs font-semibold">Identificación del vehículo<input type="number" min="1" step="1" value={form.transfer.vehicleIdentificationType} onChange={(e) => setNested('transfer', 'vehicleIdentificationType', e.target.value)} className="mt-1 w-full rounded-lg border p-2 text-sm font-normal"/></label><label className="flex items-center gap-2 self-end text-xs font-semibold"><input type="checkbox" checked={form.transfer.shouldAssociateDocument} onChange={(e) => setNested('transfer', 'shouldAssociateDocument', e.target.checked)}/>Asociar otro CDC</label></div>{form.transfer.shouldAssociateDocument && input('CDC relacionado', 'transfer', 'referencedCdc', { required: true })}<div className="grid gap-3 sm:grid-cols-3">{input('Fecha de traslado', 'transfer', 'futureDateOfTransfer', { type: 'datetime-local', required: true })}{input('Inicio estimado', 'transfer', 'estimatedTransferStartDate', { type: 'datetime-local', required: true })}{input('Fin estimado', 'transfer', 'estimatedTransferFinishDate', { type: 'datetime-local', required: true })}</div><div className="grid gap-3 sm:grid-cols-4">{input('Tipo de vehículo', 'transfer', 'vehicleType')}{input('Marca', 'transfer', 'vehicleBrand')}{input('Chasis / identificación', 'transfer', 'vehicleIdentificationNumber')}{input('Matrícula', 'transfer', 'vehicleLicensePlate')}</div><label className="block text-xs font-semibold">Descripción fiscal requerida<textarea value={form.fiscalDescription} onChange={(e) => setRoot('fiscalDescription', e.target.value)} required maxLength={300} rows={2} className="mt-1 w-full rounded-lg border p-2 text-sm font-normal"/></label></section>
      <section className="space-y-3 rounded-xl border p-4"><h3 className="font-bold">Origen, destino y receptor</h3><div className="grid gap-3 sm:grid-cols-2">{input('Dirección del establecimiento emisor', 'establishment', 'address', { required: true })}{input('Código ciudad SIFEN del emisor', 'establishment', 'cityId', { type: 'number', min: 1, required: true })}{input('N.º de casa del emisor', 'establishment', 'houseNumber', { type: 'number', min: 0, required: true })}{input('Ciudad SIFEN de origen', 'originAndDestination', 'originCityIdSifen', { type: 'number', min: 1, required: true })}{input('Dirección de origen', 'originAndDestination', 'originAddress', { required: true })}{input('N.º de casa de origen', 'originAndDestination', 'originHouseNumber', { type: 'number', min: 0 })}{input('Ciudad SIFEN de destino', 'originAndDestination', 'destinationCityIdSifen', { type: 'number', min: 1, required: true })}{input('Dirección de destino', 'originAndDestination', 'destinationAddress', { required: true })}{input('N.º de casa de destino', 'originAndDestination', 'destinationHouseNumber', { type: 'number', min: 0 })}{input('Referencia de origen', 'originAndDestination', 'originAddressReference')}{input('Referencia de destino', 'originAndDestination', 'destinationAddressReference')}</div><div className="grid gap-3 sm:grid-cols-3">{input('Nombre / razón social del receptor', 'client', 'businessName', { required: true })}{input('RUC (si es contribuyente)', 'client', 'ruc')}{input('Dirección del receptor', 'client', 'address', { required: true })}{input('Ciudad SIFEN receptor', 'client', 'cityIdSifen', { type: 'number', min: 1, required: true })}{input('N.º de casa receptor', 'client', 'houseNumber', { type: 'number', min: 0, required: true })}{input('Email receptor', 'client', 'email', { type: 'email' })}<label className="flex items-center gap-2 text-xs font-semibold"><input type="checkbox" checked={form.client.isContributor} onChange={(e) => setNested('client', 'isContributor', e.target.checked)}/>Receptor contribuyente</label>{input('Documento receptor (no contribuyente)', 'client', 'documentNumber')}{input('Teléfono receptor', 'client', 'phone')}{input('País SIFEN', 'client', 'countryIdSifen', { required: true, maxLength: 3 })}</div></section>
      <section className="space-y-3 rounded-xl border p-4"><h3 className="font-bold">Transportista y conductor</h3><div className="grid gap-3 sm:grid-cols-3">{input('Nombre / razón social del transportista', 'shipper', 'businessName', { required: true })}{input('RUC transportista', 'shipper', 'ruc')}{input('Nombre completo del conductor', 'shipper', 'driverFullName', { required: true })}{input('Documento del conductor', 'shipper', 'driverDocumentNumber', { required: true })}<label className="flex items-center gap-2 text-xs font-semibold"><input type="checkbox" checked={form.shipper.isContributor} onChange={(e) => setNested('shipper', 'isContributor', e.target.checked)}/>Transportista contribuyente</label></div>{input('Observación', null, 'observation', { maxLength: 300 })}</section>
      <label className="flex gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-950"><input type="checkbox" checked={aceptaEmisionReal} onChange={(e) => setAceptaEmisionReal(e.target.checked)} className="mt-0.5"/><span>Entiendo que al emitir se enviará una nota tributaria real y que el resultado puede requerir verificación con Goekua antes de cualquier reintento.</span></label>
      {resultado?.estado === 'INCIERTA' && <p role="alert" className="rounded border border-amber-400 bg-amber-50 p-3 text-sm">El resultado no está confirmado. Verificá el historial de Goekua antes de emitir otra vez.</p>}
      {error && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</div>}
      <div className="flex justify-end gap-2 border-t pt-4"><button type="button" onClick={() => !guardando && setModal(false)} disabled={guardando} className="rounded-lg border px-4 py-2 text-sm">Cerrar</button><button type="submit" disabled={guardando || !empresa?.fe_activa || empresa.fe_proveedor !== 'goekua'} className="rounded-lg bg-orange-500 px-5 py-2 text-sm font-bold text-white disabled:opacity-50">{guardando ? 'Enviando a Goekua…' : 'Emitir documento electrónico'}</button></div>
    </form></div>}
  </main>;
}
