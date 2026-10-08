import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, AlertTriangle, ArrowLeft, BadgeCheck, Barcode, Building2, Camera, Check, Globe2, ImagePlus, LoaderCircle, Mail, MapPin, Plus, Ruler, Save, Search, Smartphone, Store, Tag, Trash2, UserRound, X } from 'lucide-react';
import { supabase } from './supabaseClient.js';

const money = (value) => `Gs ${Math.round(Number(value) || 0).toLocaleString('es-PY')}`;
const today = () => {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};
const dueDate = () => {
  const date = new Date();
  date.setDate(date.getDate() + 14);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};
const userName = (profile) => [profile?.nombre, profile?.apellido].filter(Boolean).join(' ').trim()
  || profile?.nombre_usuario || profile?.email || null;

export function MobileClientForm({ empresaId, onClose, onSaved }) {
  const [form, setForm] = useState({ tipoOperacion: 'B2C', nombre: '', apellido: '', nombre_empresa: '', documento_nro: '', tipo_documento: 'CI', grupo_clientes: 'Ninguna', celular: '', telefono: '', email: '', pais: 'Paraguay', departamento: '', ciudad: '', direccion: '', numeroCasa: '0' });
  const [groups, setGroups] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    supabase.from('clientes').select('grupo_clientes').eq('empresa_id', empresaId).not('grupo_clientes', 'is', null).limit(1000)
      .then(({ data }) => { if (active) setGroups([...new Set((data || []).map((row) => row.grupo_clientes).filter((value) => value && value !== 'Ninguna'))]); });
    return () => { active = false; };
  }, [empresaId]);
  const update = (field) => (event) => setForm((current) => ({ ...current, [field]: event.target.value }));
  const setOperation = (tipoOperacion) => setForm((current) => ({ ...current, tipoOperacion, tipo_documento: tipoOperacion === 'B2C' ? 'CI' : 'RUC' }));

  const save = async (event) => {
    event.preventDefault();
    const name = [form.nombre, form.apellido].map((part) => part.trim()).filter(Boolean).join(' ');
    if (!name) return setError('Ingresa el nombre del cliente.');
    setBusy(true); setError('');
    if (form.documento_nro.trim()) {
      const { data: found, error: lookupError } = await supabase.from('clientes').select('id')
        .eq('empresa_id', empresaId).eq('documento_nro', form.documento_nro.trim()).limit(1);
      if (lookupError) { setBusy(false); return setError(`No se pudo validar el documento: ${lookupError.message}`); }
      if (found?.length) { setBusy(false); return setError('Ya existe un cliente con ese documento.'); }
    }
    const { data, error: insertError } = await supabase.from('clientes').insert([{
      empresa_id: empresaId,
      tipo_contacto: 'Clientes',
      nombre: name,
      nombre_empresa: form.nombre_empresa.trim() || null,
      tipo_documento: form.tipo_documento,
      documento_nro: form.documento_nro.trim() || null,
      celular: form.celular.trim() || null,
      email: form.email.trim() || null,
      grupo_clientes: form.grupo_clientes || 'Ninguna',
      direccion: [form.direccion.trim(), form.numeroCasa && form.numeroCasa !== '0' ? `Nro ${form.numeroCasa}` : '', form.ciudad.trim(), form.departamento.trim(), form.pais.trim()].filter(Boolean).join(', ') || null,
      saldo_apertura: 0,
      estado: 'Activo',
    }]).select('id').single();
    setBusy(false);
    if (insertError) return setError(`No se pudo registrar el cliente: ${insertError.message}`);
    onSaved(data);
  };

  const departments = ['Alto Paraguay','Alto Paraná','Amambay','Boquerón','Caaguazú','Caazapá','Canindeyú','Central','Concepción','Cordillera','Guairá','Itapúa','Misiones','Ñeembucú','Paraguarí','Presidente Hayes','San Pedro','Asunción'];
  return <div className="mobile-client-page"><form className="mobile-client-form" onSubmit={save}>
    <div className="mobile-client-form-header"><button type="button" onClick={onClose} aria-label="Volver"><X size={21} /></button><h2>Nuevo cliente</h2><BadgeCheck size={22} /></div>
    <div className="mobile-client-form-content">
      {error && <div className="notice notice-error"><AlertCircle size={17} /><span>{error}</span></div>}
      <section className="client-form-section"><h3>¿QUIÉN ES?</h3><label className="client-field-caption">TIPO DE OPERACIÓN</label><div className="client-operation-grid">{[['B2B','Empresa a empresa',<Building2 size={21}/>],['B2C','Consumidor final',<UserRound size={21}/>],['B2G','Gobierno',<Building2 size={21}/>],['B2F','Exportación',<Globe2 size={21}/>]].map(([key, caption, icon])=><button type="button" key={key} className={form.tipoOperacion===key?'selected':''} onClick={()=>setOperation(key)}>{icon}<span><b>{key}</b><small>{caption}</small></span></button>)}</div><div className="client-invoice-ready"><BadgeCheck size={19}/><span>{form.documento_nro.trim() ? 'Documento cargado para el cliente' : 'Completa RUC / CI para identificar al cliente'}</span></div><div className="client-document-field"><input inputMode="text" placeholder="RUC / CI" value={form.documento_nro} onChange={update('documento_nro')}/><select aria-label="Tipo de documento" value={form.tipo_documento} onChange={update('tipo_documento')}><option>RUC</option><option>CI</option><option>Pasaporte</option></select><Search size={19}/></div><label className="client-field-caption">IDENTIDAD</label><input className="client-input" autoFocus placeholder="Nombre" value={form.nombre} onChange={update('nombre')} required/><input className="client-input" placeholder="Apellido" value={form.apellido} onChange={update('apellido')}/><input className="client-input" placeholder="Razón social (opcional)" value={form.nombre_empresa} onChange={update('nombre_empresa')}/><label className="client-select-label">Grupo de cliente<select value={form.grupo_clientes} onChange={update('grupo_clientes')}><option value="Ninguna">Sin grupo</option>{groups.map((group)=><option key={group}>{group}</option>)}</select></label></section>
      <section className="client-form-section"><h3>CONTACTO</h3><label className="client-input-icon"><Smartphone size={19}/><input inputMode="tel" placeholder="Celular" value={form.celular} onChange={update('celular')}/></label><label className="client-input-icon"><Phone size={19}/><input inputMode="tel" placeholder="Teléfono fijo" value={form.telefono} onChange={update('telefono')}/></label><label className="client-input-icon"><Mail size={19}/><input type="email" placeholder="Email" value={form.email} onChange={update('email')}/></label></section>
      <section className="client-form-section"><h3>UBICACIÓN</h3><label className="client-select-label">País<select value={form.pais} onChange={update('pais')}><option>Paraguay</option><option>Argentina</option><option>Brasil</option><option>Bolivia</option><option>Uruguay</option><option>Otro</option></select></label><label className="client-select-label"><select aria-label="Departamento" value={form.departamento} onChange={update('departamento')}><option value="">Departamento</option>{departments.map((dept)=><option key={dept}>{dept}</option>)}</select></label><input className="client-input" placeholder="Dirección (calle / barrio / referencia)" value={form.direccion} onChange={update('direccion')}/><label className="client-number-label">Número de casa<input inputMode="numeric" value={form.numeroCasa} onChange={update('numeroCasa')}/></label><label className="client-input-icon"><MapPin size={19}/><input placeholder="Ciudad" value={form.ciudad} onChange={update('ciudad')}/></label></section>
      <p className="client-schema-note">Los datos se guardan en la ficha de clientes de Supabase usando los campos compatibles con el sistema actual.</p>
    </div>
    <div className="mobile-client-form-footer"><button className="button button-primary" disabled={busy}>{busy ? <LoaderCircle className="spin" size={18}/> : <Save size={18}/>} Crear cliente</button></div>
  </form></div>;
}

const PRODUCT_PRICE_GROUPS = [
  'Base de Cambio', 'Base de cambio Credito', 'Credito', 'P Compra', 'P CREDITO',
  'P Mayorista', 'P Venta', 'Precio con Entrega Batería',
];

const emptyProductForm = () => ({
  nombre: '', codigo: '', precio_venta: '', categoria: '', iva: '10', tipo_impuesto: 'Incluido',
  unidad: 'UNID', precio_compra: '', stock_inicial: '0', alerta_stock_bajo: '', descripcion: '',
});

export function MobileProductForm({ empresaId, profile, onClose, onSaved }) {
  const [form, setForm] = useState(emptyProductForm);
  const [units, setUnits] = useState([]);
  const [categories, setCategories] = useState([]);
  const [branchName, setBranchName] = useState('Stock general');
  const [priceGroups, setPriceGroups] = useState(() => PRODUCT_PRICE_GROUPS.map((nombre) => ({ nombre, margen: 25, precioVenta: '' })));
  const [newGroup, setNewGroup] = useState('');
  const [photo, setPhoto] = useState(null);
  const [photoPreview, setPhotoPreview] = useState('');
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [scannerOpen, setScannerOpen] = useState(false);
  const [scannerMessage, setScannerMessage] = useState('');
  const videoRef = useRef(null);
  const fileRef = useRef(null);
  const scannerRef = useRef(null);
  const stockLocationId = profile?.ubicacion_id || null;
  const stockValue = Number(form.stock_inicial) || 0;
  const unitOptions = useMemo(() => [...new Set(['UNID', ...units.map((unit) => unit.nombre).filter(Boolean)])], [units]);

  useEffect(() => {
    let active = true;
    const loadOptions = async () => {
      const [unitsResult, categoriesResult] = await Promise.all([
        supabase.from('unidades').select('*').eq('empresa_id', empresaId).order('nombre'),
        supabase.from('categorias_productos').select('*').eq('empresa_id', empresaId).order('nombre'),
      ]);
      if (!active) return;
      if (!unitsResult.error) setUnits((unitsResult.data || []).filter((unit) => unit.activo !== false));
      if (!categoriesResult.error) setCategories((categoriesResult.data || []).filter((category) => category.activo !== false));
      if (stockLocationId) {
        const { data: location } = await supabase.from('ubicaciones_comerciales').select('id,nombre,codigo_ubicacion')
          .eq('empresa_id', empresaId).eq('id', stockLocationId).maybeSingle();
        if (active && location) setBranchName(`${location.nombre}${location.codigo_ubicacion ? ` (${location.codigo_ubicacion})` : ''}`);
      } else if (profile?.todas_localizaciones === false) {
        setBranchName('Sucursal asignada');
      }
    };
    loadOptions();
    return () => { active = false; };
  }, [empresaId, profile?.ubicacion_id, profile?.todas_localizaciones, stockLocationId]);

  useEffect(() => {
    if (!scannerOpen) return undefined;
    let cancelled = false;
    (async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia || !videoRef.current) throw new Error('No se puede abrir la cámara en este dispositivo.');
        const { BrowserMultiFormatReader } = await import('@zxing/browser');
        if (cancelled || !videoRef.current) return;
        const reader = new BrowserMultiFormatReader();
        scannerRef.current = reader;
        const controls = await reader.decodeFromVideoDevice(undefined, videoRef.current, (result) => {
          if (!result) return;
          setForm((current) => ({ ...current, codigo: result.getText() }));
          setScannerOpen(false);
          setScannerMessage('Código leído correctamente.');
        });
        scannerRef.current = controls;
      } catch (scanError) {
        if (!cancelled) setScannerMessage(`${scanError.message} Puedes escribir o escanear el código con un lector conectado.`);
      }
    })();
    return () => {
      cancelled = true;
      scannerRef.current?.stop?.();
      scannerRef.current?.reset?.();
      scannerRef.current = null;
    };
  }, [scannerOpen]);

  const update = (field) => (event) => setForm((current) => ({ ...current, [field]: event.target.value }));
  const choosePhoto = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) { setError('Selecciona un archivo de imagen.'); return; }
    if (file.size > 5 * 1024 * 1024) { setError('La imagen no puede superar 5 MB.'); return; }
    setError(''); setPhoto(file); setPhotoPreview(URL.createObjectURL(file));
  };
  const addPriceGroup = () => {
    const name = newGroup.trim();
    if (!name || priceGroups.some((group) => group.nombre.toLocaleLowerCase('es') === name.toLocaleLowerCase('es'))) return;
    setPriceGroups((current) => [...current, { nombre: name, margen: 25, precioVenta: '' }]);
    setNewGroup('');
  };

  const save = async (event, addAnother = false) => {
    event?.preventDefault?.();
    const name = form.nombre.trim();
    const price = Number(form.precio_venta);
    const purchasePrice = Number(form.precio_compra) || 0;
    if (!name) { setError('Ingresa el nombre del producto.'); return; }
    if (!form.unidad.trim()) { setError('Selecciona la unidad del producto.'); return; }
    if (!Number.isFinite(price) || price < 0) { setError('Ingresa un precio de venta válido.'); return; }
    if (!Number.isFinite(stockValue) || stockValue < 0) { setError('El stock inicial no puede ser negativo.'); return; }
    setBusy(true); setError('');
    let uploadedPath = null;
    let insertedProductId = null;
    try {
      if (form.codigo.trim()) {
        const { data: found, error: lookupError } = await supabase.from('productos').select('id')
          .eq('empresa_id', empresaId).eq('codigo', form.codigo.trim()).limit(1);
        if (lookupError) throw new Error(`No se pudo validar el código: ${lookupError.message}`);
        if (found?.length) throw new Error('Ya existe un producto con ese código.');
      }

      let imageUrl = null;
      if (photo) {
        setUploading(true);
        const extension = photo.name.split('.').pop()?.toLowerCase() || 'jpg';
        uploadedPath = `${crypto.randomUUID()}.${extension}`;
        const { error: uploadError } = await supabase.storage.from('productos').upload(uploadedPath, photo, { contentType: photo.type, upsert: false });
        if (uploadError) throw new Error(`No se pudo subir la foto: ${uploadError.message}`);
        imageUrl = supabase.storage.from('productos').getPublicUrl(uploadedPath).data.publicUrl;
      }

      const values = {
        empresa_id: empresaId,
        nombre: name,
        codigo: form.codigo.trim() || null,
        unidad: form.unidad.trim(),
        categoria: form.categoria || null,
        descripcion: form.descripcion.trim() || null,
        imagen_url: imageUrl,
        precio_compra: Math.round(purchasePrice),
        precio_venta: Math.round(price),
        iva: form.iva === '0' ? 'Exento' : `IVA ${form.iva}%`,
        tipo_impuesto: form.tipo_impuesto,
        stock_actual: stockValue,
        alerta_stock_bajo: form.alerta_stock_bajo === '' ? 5 : Number(form.alerta_stock_bajo),
        administra_stock: true,
        tipo_producto: 'Individual',
        activo: true,
        grupos_precio: priceGroups.map((group) => ({
          nombre: group.nombre,
          margen: Number(group.margen) || 0,
          precioVenta: Math.round(Number(group.precioVenta) || 0),
        })),
      };
      const { data: product, error: insertError } = await supabase.from('productos').insert([values]).select('id').single();
      if (insertError) throw insertError;
      insertedProductId = product.id;

      if (stockLocationId && stockValue > 0) {
        const { error: stockError } = await supabase.from('producto_stock_ubicacion').insert([{
          empresa_id: empresaId, producto_id: product.id, ubicacion_id: stockLocationId, cantidad: stockValue,
        }]);
        if (stockError) throw new Error(`El producto se creó, pero no se pudo registrar el stock de ${branchName}: ${stockError.message}`);
      }

      window.dispatchEvent(new Event('stock-actualizado'));
      onSaved?.(product);
      if (addAnother) {
        setForm(emptyProductForm()); setPriceGroups(PRODUCT_PRICE_GROUPS.map((nombre) => ({ nombre, margen: 25, precioVenta: '' })));
        setPhoto(null); setPhotoPreview(''); setError('');
        if (fileRef.current) fileRef.current.value = '';
      } else onClose?.();
    } catch (saveError) {
      if (insertedProductId) {
        const { error: rollbackError } = await supabase.from('productos').delete().eq('id', insertedProductId).eq('empresa_id', empresaId);
        if (rollbackError) setError(`No se pudo completar el stock inicial y tampoco revertir el producto. Producto ${insertedProductId}: ${rollbackError.message}`);
        else setError(saveError.message);
      } else setError(`No se pudo registrar el producto: ${saveError.message}`);
      if (uploadedPath) await supabase.storage.from('productos').remove([uploadedPath]);
    } finally {
      setUploading(false); setBusy(false);
    }
  };

  return <div className="mobile-product-page"><form className="mobile-product-form" onSubmit={save}>
    <div className="mobile-product-form-header"><button type="button" onClick={onClose} aria-label="Volver"><ArrowLeft size={22} /></button><h2>Nuevo producto</h2></div>
    <div className="mobile-product-form-content">
      {error && <div className="notice notice-error"><AlertCircle size={17} /><span>{error}</span></div>}
      <button type="button" className="mobile-product-photo" onClick={() => fileRef.current?.click()} aria-label="Agregar foto del producto">
        {photoPreview ? <img src={photoPreview} alt="Vista previa del producto" /> : <ImagePlus size={68} strokeWidth={1.7} />}
      </button>
      <input ref={fileRef} className="mobile-product-file" type="file" accept="image/*" capture="environment" onChange={choosePhoto} />
      <button type="button" className="mobile-product-photo-action" onClick={() => fileRef.current?.click()} disabled={uploading}><Camera size={19} />{uploading ? 'Subiendo foto…' : photoPreview ? 'Cambiar foto' : 'Agregar foto'}</button>

      <label className="mobile-product-code-field"><Barcode size={22} /><input placeholder="Código de barras / SKU" value={form.codigo} onChange={update('codigo')} /><button type="button" aria-label="Escanear código de barras" onClick={() => { setScannerMessage('Apunta la cámara al código de barras.'); setScannerOpen(true); }}><Barcode size={23} /></button></label>
      <input className="mobile-product-input" autoFocus placeholder="Nombre del producto" value={form.nombre} onChange={update('nombre')} required />
      <input className="mobile-product-input" type="number" min="0" step="1" inputMode="numeric" placeholder="Precio venta" value={form.precio_venta} onChange={update('precio_venta')} required />
      <label className="mobile-product-select"><Tag size={21} /><select aria-label="Categoría" value={form.categoria} onChange={update('categoria')}><option value="">Sin categoría</option>{categories.map((category) => <option key={category.id} value={category.nombre}>{category.nombre}</option>)}</select><span>Categoría</span></label>
      <label className="mobile-product-select"><span className="mobile-product-select-icon">%</span><select aria-label="Impuesto IVA" value={form.iva} onChange={update('iva')}><option value="10">IVA 10% (10%)</option><option value="5">IVA 5% (5%)</option><option value="0">Exento (0%)</option></select><span>Impuesto (IVA)</span></label>
      <div className="mobile-product-tax-toggle"><span>El precio:</span><div role="group" aria-label="Tratamiento del IVA">{[['Incluido', 'Incluye IVA'], ['No incluido', 'Sin IVA']].map(([value, label]) => <button key={value} type="button" className={form.tipo_impuesto === value ? 'active' : ''} onClick={() => setForm((current) => ({ ...current, tipo_impuesto: value }))}>{label}</button>)}</div></div>

      <label className="mobile-product-select"><Ruler size={21} /><select aria-label="Unidad" value={form.unidad} onChange={update('unidad')}>{unitOptions.map((unit) => <option key={unit} value={unit}>{unit}</option>)}</select><span>Unidad</span></label>
      <input className="mobile-product-input" type="number" min="0" step="1" inputMode="numeric" placeholder="Precio compra con IVA (opcional)" value={form.precio_compra} onChange={update('precio_compra')} />
      <p className="mobile-product-help">Ingresa el precio de compra tal como figura en la factura, con IVA incluido.</p>
      <input className="mobile-product-input" type="number" min="0" step="any" inputMode="decimal" placeholder="Stock inicial (opcional)" value={form.stock_inicial} onChange={update('stock_inicial')} />
      <p className="mobile-product-help">Se carga en la sucursal: {branchName}</p>
      <section className="mobile-product-stock-card"><h3><Store size={19} /> Stock inicial</h3><div><strong>{branchName}</strong><span>{stockValue.toLocaleString('es-PY')} {form.unidad}</span></div></section>

      <section className="mobile-product-prices"><h3><Tag size={19} /> Otras listas de precio</h3><p>Opcional. Vacío = usa el precio normal.</p>{priceGroups.map((group, index) => <div className="mobile-product-price-row" key={`${group.nombre}-${index}`}><input aria-label={`Nombre de lista ${index + 1}`} value={group.nombre} onChange={(event) => setPriceGroups((current) => current.map((row, rowIndex) => rowIndex === index ? { ...row, nombre: event.target.value } : row))} /><input type="number" min="0" step="1" inputMode="numeric" aria-label={`Precio ${group.nombre}`} placeholder={group.nombre} value={group.precioVenta} onChange={(event) => setPriceGroups((current) => current.map((row, rowIndex) => rowIndex === index ? { ...row, precioVenta: event.target.value } : row))} /><button type="button" onClick={() => setPriceGroups((current) => current.filter((_, rowIndex) => rowIndex !== index))} aria-label={`Quitar lista ${group.nombre}`}><Trash2 size={17} /></button></div>)}<div className="mobile-product-add-group"><input placeholder="Nombre de otra lista" value={newGroup} onChange={(event) => setNewGroup(event.target.value)} /><button type="button" onClick={addPriceGroup} disabled={!newGroup.trim()}><Plus size={17} /> Agregar lista</button></div></section>

      <label className="mobile-product-input-label"><AlertTriangle size={19} /><input type="number" min="0" step="any" inputMode="decimal" placeholder="Alerta stock bajo (opcional)" value={form.alerta_stock_bajo} onChange={update('alerta_stock_bajo')} /></label>
      <textarea className="mobile-product-input mobile-product-description" rows="3" placeholder="Descripción (opcional)" value={form.descripcion} onChange={update('descripcion')} />
      <div className="mobile-product-form-actions"><button type="submit" disabled={busy || uploading}>{busy ? <LoaderCircle className="spin" size={20} /> : <Save size={20} />}{busy ? 'Guardando…' : 'Guardar'}</button><button type="button" onClick={(event) => save(event, true)} disabled={busy || uploading}>{busy ? <LoaderCircle className="spin" size={20} /> : <Plus size={20} />}{busy ? 'Guardando…' : 'Guardar y cargar otro'}</button></div>
      <p className="mobile-product-web-note"><AlertCircle size={17} /> Variantes y edición avanzada están disponibles en el catálogo web.</p>
    </div>
  </form>
  {scannerOpen && <div className="mobile-product-scanner-backdrop" onClick={() => setScannerOpen(false)}><section className="mobile-product-scanner" role="dialog" aria-modal="true" aria-label="Escanear código de barras" onClick={(event) => event.stopPropagation()}><header><strong>Escanear código</strong><button type="button" onClick={() => setScannerOpen(false)} aria-label="Cerrar"><X size={20} /></button></header><video ref={videoRef} autoPlay muted playsInline /><p>{scannerMessage}</p><button type="button" className="mobile-product-scanner-close" onClick={() => setScannerOpen(false)}>Cerrar escáner</button></section></div>}
  </div>;
}

export function MobileQuotes({ empresaId, profile }) {
  const [quotes, setQuotes] = useState([]);
  const [products, setProducts] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [modal, setModal] = useState(false);
  const [busy, setBusy] = useState(false);
  const [client, setClient] = useState('Cliente Ocasional');
  const [expiry, setExpiry] = useState(dueDate());
  const [notes, setNotes] = useState('');
  const [discount, setDiscount] = useState('');
  const [search, setSearch] = useState('');
  const [items, setItems] = useState([]);
  const [revision, setRevision] = useState(0);

  const load = async () => {
    if (!empresaId) return;
    setLoading(true); setError('');
    const [quoteResult, productResult, customerResult] = await Promise.all([
      supabase.from('cotizaciones_ventas').select('*').eq('empresa_id', empresaId).order('creado_en', { ascending: false }).limit(250),
      supabase.from('productos').select('id, nombre, codigo, unidad, precio_venta, activo, tipo_producto').eq('empresa_id', empresaId).eq('activo', true).order('nombre').limit(3000),
      supabase.from('clientes').select('id, nombre, nombre_empresa, documento_nro').eq('empresa_id', empresaId).order('nombre').limit(2000),
    ]);
    if (quoteResult.error) {
      setError(['42P01', 'PGRST205'].includes(quoteResult.error.code)
        ? 'Falta aplicar database/migration_cotizaciones.sql en el Supabase del sistema.'
        : `No se pudieron cargar los presupuestos: ${quoteResult.error.message}`);
    } else setQuotes(quoteResult.data || []);
    if (!productResult.error) setProducts((productResult.data || []).filter((row) => row.tipo_producto !== 'Variable'));
    if (!customerResult.error) setCustomers(customerResult.data || []);
    if (productResult.error) setError((current) => current || `No se pudieron cargar productos: ${productResult.error.message}`);
    if (customerResult.error) setError((current) => current || `No se pudieron cargar clientes: ${customerResult.error.message}`);
    setLoading(false);
  };

  useEffect(() => { load(); }, [empresaId, revision]);
  const subtotal = items.reduce((sum, item) => sum + (Number(item.cantidad) || 0) * (Number(item.precio_unitario) || 0), 0);
  const appliedDiscount = Math.min(Math.max(0, Number(discount) || 0), subtotal);
  const total = Math.max(0, subtotal - appliedDiscount);
  const suggestions = useMemo(() => {
    const value = search.trim().toLocaleLowerCase('es');
    if (!value) return [];
    return products.filter((product) => `${product.nombre || ''} ${product.codigo || ''}`.toLocaleLowerCase('es').includes(value)).slice(0, 8);
  }, [products, search]);

  const addProduct = (product) => {
    setItems((current) => {
      const found = current.find((item) => String(item.producto_id) === String(product.id));
      if (found) return current.map((item) => String(item.producto_id) === String(product.id) ? { ...item, cantidad: Number(item.cantidad) + 1 } : item);
      return [...current, { producto_id: product.id, nombre_producto: product.nombre, codigo: product.codigo || '', unidad: product.unidad || '', cantidad: 1, precio_unitario: Number(product.precio_venta) || 0 }];
    });
    setSearch('');
  };

  const saveQuote = async (event) => {
    event.preventDefault();
    if (!items.length) return setError('Agrega al menos un producto al presupuesto.');
    if (total <= 0) return setError('El total debe ser mayor que cero.');
    setBusy(true); setError(''); setNotice('');
    const reference = `COT-${new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14)}-${Math.floor(Math.random() * 90 + 10)}`;
    const { error: saveError } = await supabase.from('cotizaciones_ventas').insert([{
      empresa_id: empresaId,
      referencia: reference,
      cliente: client.trim() || 'Cliente Ocasional',
      fecha: today(),
      fecha_vencimiento: expiry || null,
      estado: 'Pendiente',
      items: items.map((item) => ({ ...item, cantidad: Number(item.cantidad), precio_unitario: Number(item.precio_unitario) })),
      subtotal,
      descuento: appliedDiscount,
      total,
      notas: notes.trim() || null,
      creado_por: userName(profile),
    }]);
    setBusy(false);
    if (saveError) return setError(`No se pudo guardar el presupuesto: ${saveError.message}`);
    setModal(false); setNotice(`Presupuesto ${reference} guardado.`); setItems([]); setDiscount(''); setNotes('');
    setRevision((value) => value + 1);
  };

  const shareQuote = async (quote) => {
    const lines = (quote.items || []).map((item) => `• ${item.nombre_producto || 'Producto'} × ${item.cantidad} — ${money(Number(item.cantidad) * Number(item.precio_unitario))}`);
    const text = [
      `PRESUPUESTO ${quote.referencia}`,
      `Cliente: ${quote.cliente || 'Cliente Ocasional'}`,
      `Fecha: ${quote.fecha || today()}${quote.fecha_vencimiento ? ` · Válido hasta: ${quote.fecha_vencimiento}` : ''}`,
      '', ...lines,
      '', `Subtotal: ${money(quote.subtotal)}`,
      Number(quote.descuento) > 0 ? `Descuento: ${money(quote.descuento)}` : '',
      `TOTAL: ${money(quote.total)}`,
      quote.notas ? `Notas: ${quote.notas}` : '',
    ].filter(Boolean).join('\n');
    setNotice('');
    try {
      if (navigator.share) await navigator.share({ title: `Presupuesto ${quote.referencia}`, text });
      else if (navigator.clipboard?.writeText) { await navigator.clipboard.writeText(text); setNotice('Presupuesto copiado. Ya puedes pegarlo en WhatsApp o en otro mensaje.'); }
      else { window.prompt('Copia y comparte este presupuesto:', text); }
    } catch (shareError) {
      if (shareError.name !== 'AbortError') setError(`No se pudo compartir el presupuesto: ${shareError.message}`);
    }
  };

  const openModal = () => { setClient('Cliente Ocasional'); setExpiry(dueDate()); setNotes(''); setDiscount(''); setSearch(''); setItems([]); setError(''); setModal(true); };

  return <section className="screen-section">
    <div className="screen-title"><div><span className="eyebrow">VENTAS</span><h1>Presupuestos</h1><p>Arma propuestas sin mover caja ni stock y compártelas desde el teléfono.</p></div><button className="button button-primary" onClick={openModal}><Plus size={17} /> Nuevo</button></div>
    {notice && <div className="notice notice-success"><Check size={17} /><span>{notice}</span></div>}
    {error && <div className="notice notice-error"><AlertCircle size={17} /><span>{error}</span></div>}
    {loading ? <div className="empty-state"><LoaderCircle className="spin" size={24} /><strong>Cargando presupuestos</strong></div>
      : quotes.length ? <div className="inventory-list quote-list">{quotes.map((quote) => <article className="quote-card" key={quote.id}><div className="quote-card-top"><div><strong>{quote.referencia}</strong><span>{quote.cliente} · {quote.fecha || 'Sin fecha'}</span></div><span className={`quote-state ${quote.estado === 'Pendiente' ? 'pending' : ''}`}>{quote.estado}</span></div><div className="quote-card-total"><strong>{money(quote.total)}</strong><span>{(quote.items || []).length} productos{quote.fecha_vencimiento ? ` · Vence ${quote.fecha_vencimiento}` : ''}</span></div><button className="button button-secondary quote-share" onClick={() => shareQuote(quote)}><Share2 size={16} /> Compartir</button></article>)}</div>
        : <div className="empty-state"><Share2 size={28} /><strong>Aún no hay presupuestos</strong><p>Crea una propuesta para guardarla y compartirla.</p></div>}

    {modal && <div className="mobile-modal-backdrop" onClick={() => !busy && setModal(false)}><form className="mobile-form-card quote-form-card" onClick={(event) => event.stopPropagation()} onSubmit={saveQuote}>
      <div className="mobile-form-heading"><div><span className="eyebrow">NUEVA PROPUESTA</span><h2>Crear presupuesto</h2></div><button type="button" className="sheet-close" onClick={() => setModal(false)} aria-label="Cerrar"><X size={19} /></button></div>
      {error && <div className="notice notice-error"><AlertCircle size={17} /><span>{error}</span></div>}
      <div className="mobile-form-grid"><label>Cliente<select value={client} onChange={(event) => setClient(event.target.value)}><option>Cliente Ocasional</option>{customers.map((row) => <option key={row.id} value={row.nombre_empresa || row.nombre}>{row.nombre_empresa || row.nombre}{row.documento_nro ? ` · ${row.documento_nro}` : ''}</option>)}</select></label><label>Válido hasta<input type="date" min={today()} value={expiry} onChange={(event) => setExpiry(event.target.value)} /></label></div>
      <div className="quote-product-search"><label>Agregar producto<input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar por nombre o código" /></label>{suggestions.length > 0 && <div className="quote-suggestions">{suggestions.map((product) => <button type="button" key={product.id} onClick={() => addProduct(product)}><span>{product.nombre}<small>{product.codigo || 'Sin código'}</small></span><strong>{money(product.precio_venta)}</strong></button>)}</div>}</div>
      <div className="quote-lines">{items.length ? items.map((item) => <div className="quote-line" key={item.producto_id}><div className="quote-line-name"><strong>{item.nombre_producto}</strong><small>{money(item.precio_unitario)} c/u</small></div><input aria-label={`Cantidad de ${item.nombre_producto}`} type="number" min="0.001" step="0.001" value={item.cantidad} onChange={(event) => setItems((current) => current.map((row) => row.producto_id === item.producto_id ? { ...row, cantidad: Math.max(0.001, Number(event.target.value) || 0.001) } : row))} /><strong>{money(item.cantidad * item.precio_unitario)}</strong><button type="button" onClick={() => setItems((current) => current.filter((row) => row.producto_id !== item.producto_id))} aria-label="Quitar producto"><Trash2 size={16} /></button></div>) : <p>Busca un producto para agregarlo al presupuesto.</p>}</div>
      <div className="mobile-form-grid"><label>Descuento (Gs)<input type="number" min="0" max={subtotal} step="1" value={discount} onChange={(event) => setDiscount(event.target.value)} /></label><label>Notas<input value={notes} onChange={(event) => setNotes(event.target.value)} /></label></div>
      <div className="quote-total-row"><span>Subtotal {money(subtotal)} · Descuento {money(appliedDiscount)}</span><strong>Total {money(total)}</strong></div>
      <div className="mobile-form-actions"><button type="button" className="button button-secondary" disabled={busy} onClick={() => setModal(false)}>Cancelar</button><button className="button button-primary" disabled={busy || !items.length}>{busy ? <LoaderCircle className="spin" size={17} /> : <Check size={17} />} Guardar presupuesto</button></div>
    </form></div>}
  </section>;
}
