import { useEffect, useMemo, useState } from 'react';
import { CircleDollarSign, FileText, LoaderCircle, Printer, QrCode, Save, Trash2, Wrench, Wifi, Monitor, CheckCircle2 } from 'lucide-react';
import { supabase } from './supabaseClient';
import { generateReceipt } from './utils/generateReceipt';

const SECTIONS = [
  { id: 'facturas', label: 'Esquemas y diseños de factura', icon: FileText, fields: [['name','Nombre','text'],['prefix','Prefijo','text'],['start','Comenzar desde','number'],['digits','Dígitos','number'],['layout','Diseño de impresión','text']] },
  { id: 'barcodes', label: 'Códigos de barras', icon: QrCode, fields: [['name','Nombre de configuración','text'],['description','Descripción','text'],['width','Ancho de etiqueta (mm)','number'],['height','Alto de etiqueta (mm)','number'],['columns','Columnas','number'],['rows','Filas','number']] },
  { id: 'printers', label: 'Impresoras de tickets', icon: Printer, fields: [['name','Nombre de la impresora','text'],['connection','Tipo de conexión','select','Network,Windows,Linux'],['profile','Perfil de capacidad','select','Default,Simple,Star Branded,Epson Tep,P822D'],['characters','Caracteres por línea','number'],['ip','Dirección IP','text'],['port','Puerto','number'],['path','Ruta','text']] },
  { id: 'scales', label: 'Balanza por red', icon: Wifi, fields: [['name','Nombre de la balanza','text'],['protocol','Protocolo','select','Modbus TCP'],['ip','Dirección IP','text'],['port','Puerto Modbus TCP','number'],['unitId','ID de unidad Modbus','number']] },
  { id: 'taxes', label: 'Tasas de impuestos', icon: CircleDollarSign, fields: [['name','Nombre','text'],['rate','Tasa (%)','number']] },
  { id: 'taxGroups', label: 'Grupos de impuestos', icon: CircleDollarSign, fields: [['name','Nombre del grupo','text'],['rate','Tasa total (%)','number'],['subTaxes','Impuestos incluidos (separados por coma)','text']] },
  { id: 'services', label: 'Tipos de servicio', icon: Wrench, fields: [['name','Nombre','text'],['description','Descripción','text'],['packing','Cargo de embalaje','number']] },
];
const STORE_KEY = (id) => `pypos-config-empresa-${id}`;
const asArray = (v) => Array.isArray(v) ? v : [];
const emptyForm = (fields) => Object.fromEntries(fields.map(([key]) => [key, '']));

export default function ConfiguracionModulos({ perfilUsuario, initialSection = 'facturas' }) {
  const empresaId = perfilUsuario?.empresa_id || perfilUsuario?.empresas?.id;
  const [empresa, setEmpresa] = useState('');
  const section = initialSection;
  const [data, setData] = useState({});
  const [form, setForm] = useState(() => ['printers','scales'].includes(initialSection) ? { ...emptyForm(SECTIONS.find(s => s.id === initialSection).fields), ...(initialSection === 'printers' ? { connection: 'Network', profile: 'Default', characters: 42, port: 9100 } : { protocol: 'Modbus TCP', port: 502, unitId: 1 }) } : {});
  const [editing, setEditing] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [localOnly, setLocalOnly] = useState(false);
  const [message, setMessage] = useState('');
  const active = useMemo(() => SECTIONS.find(s => s.id === section) || SECTIONS[0], [section]);

  useEffect(() => {
    let alive = true;
    (async () => {
      if (!empresaId) { setMessage('No se encontró la empresa asociada al usuario.'); setLoading(false); return; }
      const { data: row, error } = await supabase.from('empresas').select('nombre,configuracion').eq('id', empresaId).maybeSingle();
      if (!alive) return;
      let config = row?.configuracion && typeof row.configuracion === 'object' ? row.configuracion : {};
      if (error || !row) {
        try { config = JSON.parse(localStorage.getItem(STORE_KEY(empresaId)) || '{}'); } catch { config = {}; }
        setLocalOnly(true);
        if (error) setMessage('La configuración se conservará en este navegador porque no se pudo leer el almacenamiento de empresa.');
      } else setEmpresa(row.nombre || '');
      const modulos = config.modulos && typeof config.modulos === 'object' ? config.modulos : {};
      if (Array.isArray(modulos.printers)) {
        modulos.printers = modulos.printers.map((p) => ({ ...p, connection: ({ Red: 'Network', 'USB/Serial': 'Windows', Navegador: 'Windows' })[p.connection] || p.connection || 'Network', profile: ({ '58 mm': 'Default', '80 mm': 'Default', A4: 'Simple', Personalizado: 'Default' })[p.profile] || p.profile || 'Default', characters: p.characters || 42, port: p.port || 9100 }));
      }
      setData(modulos);
      setLoading(false);
    })();
    return () => { alive = false; };
  }, [empresaId]);

  const rows = asArray(data[section]);
  const resetForm = () => { setForm(active.id === 'printers' ? { ...emptyForm(active.fields), connection: 'Network', profile: 'Default', characters: 42, port: 9100 } : active.id === 'scales' ? { ...emptyForm(active.fields), protocol: 'Modbus TCP', port: 502, unitId: 1 } : emptyForm(active.fields)); setEditing(null); };
  const save = async (event) => {
    event.preventDefault();
    const name = String(form.name || '').trim();
    if (!name) { setMessage('Ingresá un nombre para guardar.'); return; }
    const clean = { ...form, name };
    if (section === 'printers') {
      clean.port = clean.connection === 'Network' ? Number(clean.port || 9100) : '';
      clean.characters = Number(clean.characters || 42);
      clean.is_default = editing === null ? rows.length === 0 : Boolean(rows[editing]?.is_default);
      if (clean.connection === 'Network' && !String(clean.ip || '').trim()) { setMessage('Ingresá la dirección IP de la impresora de red.'); return; }
      if (clean.connection !== 'Network' && !String(clean.path || '').trim()) { setMessage('Ingresá la ruta de la impresora.'); return; }
      if (!Number.isFinite(clean.characters) || clean.characters < 1) { setMessage('Los caracteres por línea deben ser mayor que cero.'); return; }
      if (clean.connection === 'Network' && (!Number.isInteger(clean.port) || clean.port < 1 || clean.port > 65535)) { setMessage('El puerto debe ser un número entre 1 y 65535.'); return; }
    }
    if (section === 'scales') {
      clean.protocol = 'Modbus TCP';
      clean.port = Number(clean.port || 502);
      clean.unitId = Number(clean.unitId || 1);
      if (!String(clean.ip || '').trim()) { setMessage('Ingresá la IP de la balanza.'); return; }
      if (!Number.isInteger(clean.port) || clean.port < 1 || clean.port > 65535 || !Number.isInteger(clean.unitId) || clean.unitId < 0 || clean.unitId > 247) { setMessage('Revisá el puerto y el ID Modbus.'); return; }
    }
    for (const [key,,type] of active.fields) if (type === 'number') {
      const raw = String(form[key] ?? '').trim();
      clean[key] = raw === '' ? '' : Number(raw);
      if (raw && !Number.isFinite(clean[key])) { setMessage('Revisá los valores numéricos.'); return; }
    }
    const nextRows = editing === null ? [...rows, { id: crypto.randomUUID(), ...clean }] : rows.map((row, i) => i === editing ? { ...row, ...clean } : row);
    const next = { ...data, [section]: nextRows };
    setSaving(true); setMessage('');
    if (localOnly) {
      try {
        const cached = JSON.parse(localStorage.getItem(STORE_KEY(empresaId)) || '{}');
        localStorage.setItem(STORE_KEY(empresaId), JSON.stringify({ ...cached, version: 1, extra: next, modulos: next }));
        setData(next); setMessage('Cambios guardados en este navegador. Aplicá la migración de configuración para compartirlos entre dispositivos.');
      } catch { setMessage('No se pudo guardar en el almacenamiento local.'); }
      setSaving(false); resetForm(); return;
    }
    const { data: current, error: readError } = await supabase.from('empresas').select('configuracion').eq('id', empresaId).maybeSingle();
    if (readError || !current) { setSaving(false); setMessage(`No se pudo verificar la configuración actual: ${readError?.message || 'empresa no encontrada'}`); return; }
    const config = current.configuracion && typeof current.configuracion === 'object' ? current.configuracion : {};
    const { error } = await supabase.from('empresas').update({ configuracion: { ...config, version: 1, modulos: next } }).eq('id', empresaId);
    setSaving(false);
    if (error) { setMessage(`No se pudo guardar: ${error.message}`); return; }
    setData(next); setMessage('Cambios guardados para ' + (empresa || 'la empresa') + '.'); resetForm();
  };
  const edit = (row, index) => { setForm(Object.fromEntries(active.fields.map(([key]) => [key, row[key] ?? '']))); setEditing(index); setMessage(''); };
  const remove = async (index) => {
    const next = { ...data, [section]: rows.filter((_, i) => i !== index) };
    if (localOnly) {
      try { const cached = JSON.parse(localStorage.getItem(STORE_KEY(empresaId)) || '{}'); localStorage.setItem(STORE_KEY(empresaId), JSON.stringify({ ...cached, version: 1, extra: next, modulos: next })); setData(next); setMessage('Elemento quitado del almacenamiento local.'); }
      catch { setMessage('No se pudo guardar el cambio local.'); }
      return;
    }
    setSaving(true);
    const { data: current, error: readError } = await supabase.from('empresas').select('configuracion').eq('id', empresaId).maybeSingle();
    if (readError || !current) { setSaving(false); setMessage(`No se pudo verificar la configuración actual: ${readError?.message || 'empresa no encontrada'}`); return; }
    const config = current.configuracion && typeof current.configuracion === 'object' ? current.configuracion : {};
    const { error } = await supabase.from('empresas').update({ configuracion: { ...config, version: 1, modulos: next } }).eq('id', empresaId);
    setSaving(false);
    if (error) { setMessage(`No se pudo guardar: ${error.message}`); return; }
    setData(next); if (editing === index) resetForm(); setMessage('Elemento eliminado.');
  };

  if (loading) return <div className="flex items-center gap-2 p-8 text-sm text-slate-500"><LoaderCircle size={17} className="animate-spin"/>Cargando configuraciones...</div>;
  const printer = section === 'printers';
  const scale = section === 'scales';
  const printerFormat = (row) => Number(row?.characters || 42) <= 32 ? '58mm' : '80mm';
  const testPrinter = (row) => generateReceipt({ id: 'PRUEBA', cliente_nombre: 'Prueba de impresión', total: 1000, items: [{ nombre: 'Ticket de prueba', cantidad: 1, precio: 1000, subtotal: 1000 }] }, { nombre: empresa || 'GDA POS' }, printerFormat(row), true);
  const makeDefault = async (index) => {
    const nextRows = rows.map((row, i) => ({ ...row, is_default: i === index }));
    const next = { ...data, printers: nextRows };
    setData(next);
    setMessage('Impresora predeterminada actualizada. Guardá los cambios en la configuración de empresa si no se sincroniza.');
    if (localOnly) {
      try { const cached = JSON.parse(localStorage.getItem(STORE_KEY(empresaId)) || '{}'); localStorage.setItem(STORE_KEY(empresaId), JSON.stringify({ ...cached, version: 1, extra: next, modulos: next })); }
      catch { setMessage('No se pudo guardar la impresora predeterminada.'); }
      return;
    }
    const { data: current, error: readError } = await supabase.from('empresas').select('configuracion').eq('id', empresaId).maybeSingle();
    if (readError || !current) { setMessage(`No se pudo actualizar: ${readError?.message || 'empresa no encontrada'}`); return; }
    const config = current.configuracion && typeof current.configuracion === 'object' ? current.configuracion : {};
    const { error } = await supabase.from('empresas').update({ configuracion: { ...config, version: 1, modulos: next } }).eq('id', empresaId);
    setMessage(error ? `No se pudo actualizar: ${error.message}` : 'Impresora predeterminada guardada.');
  };
  return <div className="mx-auto max-w-7xl space-y-5 pb-8">
    <header><p className="text-xs font-bold uppercase tracking-[.16em] text-orange-600">Configuraciones</p><h2 className="mt-1 text-2xl font-bold text-slate-900">{section==='suscripcion'?'Suscripción':active.label}</h2><p className="mt-1 text-sm text-slate-500">{section==='suscripcion'?'Estado de la suscripción de ': 'Administrá la configuración de '}{empresa || 'tu empresa'}.</p></header>
    <section className="min-w-0 rounded-xl border border-slate-200 bg-white shadow-sm">
        {section==='suscripcion' ? <div className="p-6"><h3 className="font-bold text-slate-900">Suscripción</h3><p className="mt-2 text-sm text-slate-600">La cuenta y el estado del plan se administran desde el proveedor del sistema. Este proyecto no tiene una fuente local de planes, vencimientos ni pagos para mostrar o modificar.</p></div> : <>
          <div className="border-b border-slate-100 px-5 py-4"><h3 className="font-bold text-slate-900">{printer ? 'Todas las impresoras configuradas' : active.label}</h3><p className="mt-1 text-sm text-slate-500">{printer ? 'Administrá impresoras de red o conectadas a una estación.' : 'Administrá los registros de este módulo para tu empresa.'}</p></div>
          {printer && <div className="mx-5 mt-5 flex gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950"><Monitor size={20} className="mt-0.5 shrink-0"/><p><b>Alcance actual:</b> GDA guarda el nombre, conexión, perfil y ancho del ticket; el punto de venta toma ese ancho y el navegador abre su diálogo de impresión. La IP, el puerto y la ruta todavía no envían trabajos directamente a la impresora. Para impresión automática por red o USB hace falta un agente local emparejado.</p></div>}
          {scale && <div className="mx-5 mt-5 rounded-lg border border-sky-200 bg-sky-50 p-4 text-sm text-sky-950"><b>Lectura de peso:</b> requiere el servicio local <code>scale-bridge</code> en la computadora del POS y que el indicador esté configurado en Modbus TCP. Los indicadores X3 publican el peso en kg/g según su calibración.</div>}
          <form onSubmit={save} className="grid gap-3 border-b border-slate-100 p-5 sm:grid-cols-2 lg:grid-cols-3">{active.fields.filter(([key]) => !printer || (form.connection === 'Network' ? !['path'].includes(key) : !['ip','port'].includes(key))).map(([key,label,type,options])=><label key={key} className="text-sm font-semibold text-slate-700">{label}{type==='select'?<select className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 font-normal" value={form[key]|| (printer && key==='connection' ? 'Network' : '')} onChange={e=>setForm(v=>({...v,[key]:e.target.value}))} required={printer||scale}><option value="">Seleccionar</option>{options.split(',').map(o=><option key={o}>{o}</option>)}</select>:<input className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5 font-normal" type={type} min={type==='number'?0:undefined} step={type==='number'?'any':undefined} placeholder={printer && key==='ip'?'Ej.: 192.168.1.100':scale&&key==='ip'?'Ej.: 192.168.1.50':printer&&key==='port'?'9100':scale&&key==='port'?'502':printer&&key==='path'?(form.connection==='Windows'?'LPT1 o COM1':'/dev/usb/lp1'):''} value={form[key]??(printer&&key==='characters'?'42':printer&&key==='port'?'9100':scale&&key==='port'?'502':scale&&key==='unitId'?'1':'')} onChange={e=>setForm(v=>({...v,[key]:e.target.value}))} required={key==='name'||(printer&&(key==='characters'||(form.connection==='Network'&&key==='ip')||(form.connection!=='Network'&&key==='path')))||(scale&&['ip','port','unitId'].includes(key))} />}</label>)}<div className="flex items-end gap-2"><button disabled={saving} className="inline-flex items-center gap-2 rounded-lg bg-orange-500 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-60"><Save size={16}/>{editing===null?(printer?'Agregar impresora':scale?'Agregar balanza':'Agregar'):'Guardar'}</button>{editing!==null&&<button type="button" onClick={resetForm} className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold">Cancelar</button>}</div></form>
          <div className="overflow-x-auto p-5"><table className="w-full min-w-[850px] text-left text-sm"><thead><tr className="border-b text-xs uppercase tracking-wide text-slate-500">{active.fields.filter(([key])=>!printer||!['path','ip','port'].includes(key)).map(([key,label])=><th key={key} className="px-3 py-3">{label}</th>)}{printer&&<><th className="px-3 py-3">Conexión</th><th className="px-3 py-3">Acciones</th></>}{!printer&&<th className="px-3 py-3">Acciones</th>}</tr></thead><tbody>{rows.length===0?<tr><td colSpan={printer ? active.fields.filter(([key])=>!['path','ip','port'].includes(key)).length+2 : active.fields.length+1} className="px-3 py-8 text-center text-slate-500">Todavía no hay elementos configurados.</td></tr>:rows.map((row,index)=><tr key={row.id||index} className="border-b border-slate-100">{active.fields.filter(([key])=>!printer||!['path','ip','port'].includes(key)).map(([key])=><td key={key} className="px-3 py-3 text-slate-700">{key==='name'&&row.is_default&&<span className="mr-2 inline-flex items-center gap-1 text-emerald-700"><CheckCircle2 size={14}/>Predeterminada</span>}{row[key]??'—'}{key==='rate'?'%':''}</td>)}{printer&&<td className="px-3 py-3 text-slate-700">{row.connection==='Network'?<span className="inline-flex items-center gap-1"><Wifi size={14}/>{row.ip}:{row.port||9100}</span>:`${row.connection}: ${row.path}`}</td>}<td className="px-3 py-3"><div className="flex flex-wrap gap-2">{printer&&<><button type="button" onClick={()=>testPrinter(row)} title="Abre el diálogo del navegador con un ticket de prueba; no verifica la conexión de red" className="rounded-md border border-emerald-200 px-3 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-50">Imprimir ticket de prueba</button>{!row.is_default&&<button type="button" onClick={()=>makeDefault(index)} className="rounded-md border px-3 py-1.5 text-xs font-semibold hover:bg-slate-50">Predeterminada</button>}</>}<button type="button" onClick={()=>edit(row,index)} className="rounded-md border px-3 py-1.5 text-xs font-semibold hover:bg-slate-50">Editar</button><button type="button" disabled={saving} onClick={()=>remove(index)} aria-label={`Eliminar ${row.name||'elemento'}`} className="rounded-md border border-red-200 p-1.5 text-red-600 hover:bg-red-50"><Trash2 size={15}/></button></div></td></tr>)}</tbody></table></div>
        </>}
        {localOnly&&<p className="mx-5 mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">Este navegador está usando el almacenamiento local. Los cambios no se sincronizan con otros dispositivos hasta habilitar la columna configuracion en Supabase.</p>}
        {message&&<p role="status" className="mx-5 mb-5 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">{message}</p>}
    </section>
  </div>;
}
