import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Check, Download, Factory, FileSpreadsheet, LoaderCircle, Plus, RefreshCw, Save, Search, Trash2, Users, X } from 'lucide-react';
import { supabase } from './supabaseClient';
import { useEmpresaInfo } from './utils/useEmpresa';
import { useUbicacionUsuario } from './utils/useUbicacion';
import FabricacionOrdenes from './FabricacionOrdenes';

const moneda = (n) => Math.round(Number(n) || 0).toLocaleString('es-PY') + ' Gs';
const cantidad = (n) => Number(n || 0).toLocaleString('es-PY', { maximumFractionDigits: 4 });
const fecha = (n) => n ? new Date(n).toLocaleString('es-PY') : '—';
const textoError = (e) => e?.message || 'Ocurrió un error inesperado.';
const norm = (s) => String(s || '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[\s-]+/g, '_');

function leerCsv(texto) {
  const entrada = String(texto || '').replace(/^\uFEFF/, '');
  const primera = entrada.split(/\r?\n/, 1)[0] || '';
  const delimitador = [';', ',', '\t'].sort((a, b) => primera.split(b).length - primera.split(a).length)[0];
  const filas = []; let fila = []; let celda = ''; let comillas = false;
  for (let i = 0; i < entrada.length; i += 1) {
    const ch = entrada[i];
    if (ch === '"') { if (comillas && entrada[i + 1] === '"') { celda += '"'; i += 1; } else comillas = !comillas; }
    else if (ch === delimitador && !comillas) { fila.push(celda); celda = ''; }
    else if ((ch === '\n' || ch === '\r') && !comillas) { if (ch === '\r' && entrada[i + 1] === '\n') i += 1; fila.push(celda); if (fila.some((x) => String(x).trim())) filas.push(fila); fila = []; celda = ''; }
    else celda += ch;
  }
  fila.push(celda); if (fila.some((x) => String(x).trim())) filas.push(fila);
  if (filas.length < 2) return [];
  const encabezados = filas.shift().map(norm);
  return filas.map((valores) => Object.fromEntries(encabezados.map((k, i) => [k, String(valores[i] || '').trim()])));
}

function descargarCsv(nombre, filas) {
  const escapar = (x) => '"' + String(x ?? '').replace(/"/g, '""') + '"';
  const datos = filas.map((fila) => fila.map(escapar).join(';')).join('\r\n');
  const url = URL.createObjectURL(new Blob(['\uFEFF', datos], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a'); a.href = url; a.download = nombre; a.click(); URL.revokeObjectURL(url);
}

const TABS = [['recetas', 'Recetas'], ['importar', 'Importar recetas'], ['produccion', 'Producción'], ['ordenes', 'Órdenes de producción'], ['informe', 'Informe fabricación'], ['operarios', 'Productividad'], ['centros', 'Centros de trabajo'], ['etapas', 'Etapas de producción'], ['variaciones', 'Variaciones'], ['config', 'Configuración'], ['manual', 'Manual']];

export default function Fabricacion({ initialTab = 'recetas', perfilUsuario }) {
  const empresa = useEmpresaInfo();
  const ubicacion = useUbicacionUsuario();
  const [tab, setTab] = useState(TABS.some((x) => x[0] === initialTab) ? initialTab : 'recetas');
  const [productos, setProductos] = useState([]);
  const [ubicaciones, setUbicaciones] = useState([]);
  const [stocks, setStocks] = useState([]);
  const [recetas, setRecetas] = useState([]);
  const [centros, setCentros] = useState([]);
  const [etapas, setEtapas] = useState([]);
  const [producciones, setProducciones] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [sqlFaltante, setSqlFaltante] = useState(false);
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState('');
  const [busqueda, setBusqueda] = useState('');
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const [sucursalFiltro, setSucursalFiltro] = useState('');
  const [recetaModal, setRecetaModal] = useState(null);
  const [centroModal, setCentroModal] = useState(null);
  const [etapaModal, setEtapaModal] = useState(null);
  const [csvFilas, setCsvFilas] = useState([]);
  const [csvNombre, setCsvNombre] = useState('');
  const [csvResultado, setCsvResultado] = useState('');
  const [importando, setImportando] = useState(false);
  const nombreUsuario = [perfilUsuario?.nombre, perfilUsuario?.apellido].filter(Boolean).join(' ').trim() || perfilUsuario?.nombre_usuario || perfilUsuario?.email || '';
  const [form, setForm] = useState({
    receta_id: '', ubicacion_id: '', cantidad: '1', desperdicio: '0', costo_adicional: '0',
    centro_id: '', etapa_id: '', operario: nombreUsuario, referencia: '',
    fecha: new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16),
    notas: '', insumos: [],
  });
  const empresaId = empresa.id;
  const usuarioUbicacionId = ubicacion.id;
  const veTodas = ubicacion.ve_todas;

  const cargar = async () => {
    if (!empresaId) return;
    setCargando(true); setError(''); setSqlFaltante(false);
    const [p, u, s, r, ri, c, pr, et] = await Promise.all([
      supabase.from('productos').select('id,nombre,codigo,stock_actual,precio_compra,activo,administra_stock,unidad,tipo_producto').eq('empresa_id', empresaId).order('nombre').limit(5000),
      supabase.from('ubicaciones_comerciales').select('id,nombre,codigo_ubicacion,activo').eq('empresa_id', empresaId).eq('activo', true).order('nombre'),
      (() => { let q = supabase.from('producto_stock_ubicacion').select('producto_id,ubicacion_id,cantidad').eq('empresa_id', empresaId).limit(30000); if (!veTodas && usuarioUbicacionId) q = q.eq('ubicacion_id', usuarioUbicacionId); return q; })(),
      supabase.from('fabricacion_recetas').select('*').eq('empresa_id', empresaId).order('nombre').limit(5000),
      supabase.from('fabricacion_receta_items').select('*').eq('empresa_id', empresaId).limit(20000),
      supabase.from('fabricacion_centros_trabajo').select('*').eq('empresa_id', empresaId).order('nombre').limit(1000),
      supabase.from('fabricacion_producciones').select('*').eq('empresa_id', empresaId).order('fecha', { ascending: false }).limit(5000),
      supabase.from('fabricacion_etapas').select('*').eq('empresa_id', empresaId).order('orden').order('nombre').limit(1000),
    ]);
    const modErr = [r, ri, c, pr, et].find((x) => x.error);
    if (modErr) {
      const e = modErr.error;
      const requiere = ['42P01', 'PGRST202', 'PGRST205'].includes(e.code) || /fabricacion_|schema cache|Could not find the function/i.test(e.message || '');
      setSqlFaltante(requiere);
      setError(requiere ? 'Faltan tablas o funciones de fabricación. Aplicá database/migration_fabricacion.sql y database/migration_fabricacion_etapas.sql en el proyecto Supabase conectado.' : 'No se pudieron cargar datos: ' + textoError(e));
    }
    if (p.error) setError('No se pudieron cargar productos: ' + textoError(p.error)); else setProductos((p.data || []).filter((x) => x.activo !== false && x.administra_stock !== false && x.tipo_producto !== 'Variable'));
    if (u.error) setError('No se pudieron cargar sucursales: ' + textoError(u.error)); else setUbicaciones((u.data || []).filter((x) => veTodas || !usuarioUbicacionId || x.id === usuarioUbicacionId));
    if (s.error) setError('No se pudo consultar stock: ' + textoError(s.error)); else setStocks(s.data || []);
    if (!r.error) setRecetas((r.data || []).map((x) => ({ ...x, items: (ri.data || []).filter((i) => i.receta_id === x.id) })));
    if (!c.error) setCentros(c.data || []);
    if (!pr.error) setProducciones(pr.data || []);
    if (!et.error) setEtapas(et.data || []);
    setCargando(false);
  };

  useEffect(() => { cargar(); }, [empresaId, usuarioUbicacionId, veTodas]);
  useEffect(() => {
    if (usuarioUbicacionId) setForm((x) => ({ ...x, ubicacion_id: usuarioUbicacionId }));
    else if (ubicaciones.length && !ubicaciones.some((u) => u.id === form.ubicacion_id)) setForm((x) => ({ ...x, ubicacion_id: ubicaciones[0].id }));
  }, [usuarioUbicacionId, ubicaciones]);
  useEffect(() => { setSucursalFiltro(veTodas ? '' : usuarioUbicacionId || ''); }, [veTodas, usuarioUbicacionId]);
  useEffect(() => {
    const receta = recetas.find((x) => x.id === form.receta_id);
    if (!receta) { setForm((x) => ({ ...x, insumos: [] })); return; }
    const lote = Number(form.cantidad) + Number(form.desperdicio);
    setForm((actual) => ({ ...actual, insumos: receta.items.map((item) => {
      const p = productos.find((x) => x.id === item.producto_id);
      const anterior = actual.insumos.find((x) => x.producto_id === item.producto_id);
      const requerido = Math.round((lote * Number(item.cantidad) / Number(receta.rendimiento) + Number.EPSILON) * 10000) / 10000;
      return { producto_id: item.producto_id, nombre: p?.nombre || 'Producto', codigo: p?.codigo || '', requerido, cantidad: anterior?.modificado ? anterior.cantidad : String(requerido), modificado: anterior?.modificado || false, precio: Number(p?.precio_compra) || 0 };
    }) }));
  }, [form.receta_id, form.cantidad, form.desperdicio, recetas, productos]);

  const porId = useMemo(() => new Map(productos.map((x) => [x.id, x])), [productos]);
  const stockMap = useMemo(() => new Map(stocks.map((x) => [x.producto_id + ':' + x.ubicacion_id, Number(x.cantidad) || 0])), [stocks]);
  const recetasActivas = recetas.filter((x) => x.activo);
  const filtradas = useMemo(() => producciones.filter((x) => {
    const texto = [x.referencia, x.producto_nombre, x.receta_nombre, x.operario].join(' ').toLowerCase();
    if (busqueda && !texto.includes(busqueda.toLowerCase())) return false;
    const f = new Date(x.fecha);
    if (desde && f < new Date(desde + 'T00:00:00')) return false;
    if (hasta && f > new Date(hasta + 'T23:59:59.999')) return false;
    return !sucursalFiltro || x.ubicacion_id === sucursalFiltro;
  }), [producciones, busqueda, desde, hasta, sucursalFiltro]);
  const costoEstimado = form.insumos.reduce((a, x) => a + Number(x.cantidad || 0) * x.precio, Number(form.costo_adicional) || 0);
  const btn = 'inline-flex items-center justify-center gap-2 rounded-lg bg-orange-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-50';
  const btn2 = 'inline-flex items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50';
  const campo = 'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100';
  const etiqueta = 'mb-1.5 block text-xs font-semibold text-slate-600';
  const cambio = (k, v) => setForm((x) => ({ ...x, [k]: v }));
  const fallar = (e) => { setError(textoError(e)); setAviso(''); };

  const guardarReceta = async (e) => {
    e.preventDefault();
    const items = recetaModal.items.filter((x) => x.producto_id && Number(x.cantidad) > 0);
    if (!recetaModal.producto_id || !items.length || items.some((x) => x.producto_id === recetaModal.producto_id)) { setError('Elige salida e ingredientes válidos. El producto terminado no puede ser su propio ingrediente.'); return; }
    setGuardando(true); setError('');
    const { error: err } = await supabase.rpc('guardar_fabricacion_receta', {
      p_receta_id: recetaModal.id || null, p_producto_id: recetaModal.producto_id,
      p_nombre: recetaModal.nombre || porId.get(recetaModal.producto_id)?.nombre || 'Receta',
      p_rendimiento: Number(recetaModal.rendimiento),
      p_items: items.map((x) => ({ producto_id: x.producto_id, cantidad: Number(x.cantidad) })),
      p_instrucciones: recetaModal.instrucciones || null,
    });
    setGuardando(false);
    if (err) { fallar(err); return; }
    setRecetaModal(null); setAviso('Receta guardada correctamente.'); await cargar();
  };
  const archivarReceta = async (r) => {
    if (!window.confirm('¿Desactivar ' + r.nombre + '? El historial se conserva.')) return;
    setGuardando(true); const { error: err } = await supabase.rpc('archivar_fabricacion_receta', { p_receta_id: r.id }); setGuardando(false);
    if (err) fallar(err); else { setAviso('Receta desactivada; historial conservado.'); await cargar(); }
  };
  const producir = async (e) => {
    e.preventDefault();
    if (!recetasActivas.some((x) => x.id === form.receta_id) || !form.ubicacion_id) { setError('Selecciona una receta y sucursal activa.'); return; }
    const falta = form.insumos.some((x) => !Number.isFinite(Number(x.cantidad)) || Number(x.cantidad) <= 0 || !Number.isInteger(Number(x.cantidad)) || Number(x.cantidad) > (stockMap.get(x.producto_id + ':' + form.ubicacion_id) || 0));
    if (!Number.isInteger(Number(form.cantidad)) || !Number.isInteger(Number(form.desperdicio || 0))) { setError('En esta base de datos, las cantidades globales de stock son enteras. Usa cantidades enteras para la producción y el desperdicio.'); return; }
    if (falta) { setError('El consumo debe ser positivo y no superar el stock disponible por sucursal.'); return; }
    setGuardando(true); setError('');
    const { error: err } = await supabase.rpc('crear_fabricacion_produccion_con_etapa', {
      p_receta_id: form.receta_id, p_ubicacion_id: form.ubicacion_id, p_cantidad: Number(form.cantidad),
      p_items_real: form.insumos.map((x) => ({ producto_id: x.producto_id, cantidad: Number(x.cantidad) })),
      p_referencia: form.referencia || null, p_centro_trabajo_id: form.centro_id || null,
      p_operario: form.operario || null, p_costo_adicional: Number(form.costo_adicional) || 0,
      p_desperdicio: Number(form.desperdicio) || 0, p_fecha: form.fecha ? new Date(form.fecha).toISOString() : new Date().toISOString(),
      p_notas: form.notas || null, p_etapa_id: form.etapa_id || null,
    });
    setGuardando(false);
    if (err) { fallar(err); return; }
    setAviso('Producción registrada. Ingredientes consumidos y producto terminado agregado al stock.');
    setForm((x) => ({ ...x, referencia: '', cantidad: '1', desperdicio: '0', costo_adicional: '0', notas: '' }));
    await cargar();
  };
  const guardarCentro = async (e) => {
    e.preventDefault(); setGuardando(true); setError('');
    const { error: err } = await supabase.rpc('guardar_fabricacion_centro', { p_centro_id: centroModal.id || null, p_nombre: centroModal.nombre, p_codigo: centroModal.codigo || null, p_activo: centroModal.activo !== false });
    setGuardando(false);
    if (err) { fallar(err); return; }
    setCentroModal(null); setAviso('Centro de trabajo guardado.'); await cargar();
  };

  const guardarEtapa = async (e) => {
    e.preventDefault(); setGuardando(true); setError('');
    const { error: err } = await supabase.rpc('guardar_fabricacion_etapa', {
      p_etapa_id: etapaModal.id || null,
      p_nombre: etapaModal.nombre,
      p_orden: Number(etapaModal.orden) || 0,
      p_activo: etapaModal.activo !== false,
    });
    setGuardando(false);
    if (err) { fallar(err); return; }
    setEtapaModal(null); setAviso('Etapa de producción guardada.'); await cargar();
  };

  const importarCsv = async () => {
    const grupos = new Map(); const errores = [];
    csvFilas.forEach((fila, indice) => {
      const codigoP = fila.producto_codigo || fila.codigo_producto || fila.producto_sku || '';
      const nombreP = fila.producto_nombre || fila.producto || '';
      const salida = productos.find((p) => codigoP ? String(p.codigo || '').toLowerCase() === codigoP.toLowerCase() : p.nombre.toLowerCase() === nombreP.toLowerCase());
      const codigoI = fila.insumo_codigo || fila.ingrediente_codigo || fila.codigo_insumo || '';
      const nombreI = fila.insumo_nombre || fila.ingrediente || fila.insumo || '';
      const insumo = productos.find((p) => codigoI ? String(p.codigo || '').toLowerCase() === codigoI.toLowerCase() : p.nombre.toLowerCase() === nombreI.toLowerCase());
      const rendimiento = Number(fila.rendimiento || 1); const cantidadItem = Number(fila.cantidad || fila.cantidad_insumo);
      if (!salida || !insumo || !Number.isFinite(rendimiento) || rendimiento <= 0 || !Number.isFinite(cantidadItem) || cantidadItem <= 0) { errores.push('Fila ' + (indice + 2) + ': revisa productos, rendimiento y cantidad.'); return; }
      const grupo = grupos.get(salida.id) || { salida, rendimiento, items: [] };
      if (grupo.rendimiento !== rendimiento) { errores.push('Fila ' + (indice + 2) + ': rendimiento inconsistente para ' + salida.nombre + '.'); return; }
      grupo.items.push({ producto_id: insumo.id, cantidad: cantidadItem }); grupos.set(salida.id, grupo);
    });
    if (!grupos.size) { setCsvResultado(errores.join('\n') || 'No hay recetas válidas.'); return; }
    setImportando(true); let ok = 0;
    for (const grupo of grupos.values()) {
      const actual = recetas.find((r) => r.producto_id === grupo.salida.id); const sumas = new Map();
      grupo.items.forEach((i) => sumas.set(i.producto_id, (sumas.get(i.producto_id) || 0) + i.cantidad));
      const { error: err } = await supabase.rpc('guardar_fabricacion_receta', {
        p_receta_id: actual?.id || null, p_producto_id: grupo.salida.id, p_nombre: actual?.nombre || grupo.salida.nombre,
        p_rendimiento: grupo.rendimiento, p_items: Array.from(sumas, ([producto_id, cantidad]) => ({ producto_id, cantidad })),
        p_instrucciones: actual?.instrucciones || null,
      });
      if (err) errores.push(grupo.salida.nombre + ': ' + textoError(err)); else ok += 1;
    }
    setImportando(false); setCsvResultado(ok + ' receta(s) importada(s).' + (errores.length ? '\n\nPendientes:\n' + errores.join('\n') : ''));
    if (ok) await cargar();
  };

  const exportarInforme = () => descargarCsv('informe-fabricacion.csv', [
    ['Fecha', 'Referencia', 'Producto', 'Receta', 'Sucursal', 'Etapa', 'Cantidad', 'Desperdicio', 'Costo total', 'Costo unitario', 'Operario', 'Centro'],
    ...filtradas.map((x) => [fecha(x.fecha), x.referencia, x.producto_nombre, x.receta_nombre, x.ubicacion_nombre, x.etapa_nombre, x.cantidad, x.cantidad_desperdiciada, x.costo_total, x.costo_unitario, x.operario, x.centro_trabajo_nombre]),
  ]);
  const sumar = (k) => filtradas.reduce((a, x) => a + (Number(x[k]) || 0), 0);
  const productividad = useMemo(() => {
    const mapa = new Map();
    filtradas.forEach((x) => { const n = x.operario || 'Sin operario'; const a = mapa.get(n) || { nombre: n, lotes: 0, unidades: 0, desperdicio: 0, costo: 0 }; a.lotes += 1; a.unidades += Number(x.cantidad) || 0; a.desperdicio += Number(x.cantidad_desperdiciada) || 0; a.costo += Number(x.costo_total) || 0; mapa.set(n, a); });
    return Array.from(mapa.values()).sort((a, b) => b.unidades - a.unidades);
  }, [filtradas]);
  const variaciones = useMemo(() => filtradas.flatMap((x) => (Array.isArray(x.insumos_detalle) ? x.insumos_detalle : []).map((i) => ({ ...i, fecha: x.fecha, referencia: x.referencia, producto_nombre: x.producto_nombre }))), [filtradas]);

  const encabezado = <div className="flex flex-wrap items-center justify-between gap-3"><div className="flex items-center gap-3"><span className="rounded-xl bg-orange-50 p-2 text-orange-600"><Factory size={22} /></span><div><h1 className="text-xl font-bold">Fabricación</h1><p className="text-sm text-slate-500">Recetas, producción y consumo por sucursal</p></div></div><button className={btn2} onClick={cargar} disabled={cargando}>{cargando ? <LoaderCircle size={16} className="animate-spin" /> : <RefreshCw size={16} />} Actualizar</button></div>;
  const filtros = <div className="flex flex-wrap items-end gap-3 rounded-xl border bg-white p-3"><label className="min-w-32 flex-1"><span className={etiqueta}>Desde</span><input type="date" className={campo} value={desde} onChange={(e) => setDesde(e.target.value)} /></label><label className="min-w-32 flex-1"><span className={etiqueta}>Hasta</span><input type="date" className={campo} value={hasta} onChange={(e) => setHasta(e.target.value)} /></label>{veTodas && <label className="min-w-40 flex-1"><span className={etiqueta}>Sucursal</span><select className={campo} value={sucursalFiltro} onChange={(e) => setSucursalFiltro(e.target.value)}><option value="">Todas</option>{ubicaciones.map((u) => <option key={u.id} value={u.id}>{u.nombre}</option>)}</select></label>}<label className="min-w-40 flex-[2]"><span className={etiqueta}>Buscar</span><span className="relative block"><Search size={15} className="absolute left-3 top-2.5 text-slate-400" /><input className={campo + ' pl-9'} value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Referencia, producto u operario" /></span></label><button className={btn2} onClick={exportarInforme}><Download size={16} /> CSV</button></div>;
  const tablaProducciones = <div className="overflow-x-auto rounded-xl border bg-white"><table className="min-w-[1000px] w-full text-left text-sm"><thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr>{['Fecha', 'Referencia', 'Producto', 'Sucursal', 'Etapa', 'Cantidad', 'Desperdicio', 'Costo', 'Unitario', 'Operario'].map((x) => <th key={x} className="px-4 py-3">{x}</th>)}</tr></thead><tbody className="divide-y">{filtradas.map((x) => <tr key={x.id}><td className="whitespace-nowrap px-4 py-3">{fecha(x.fecha)}</td><td className="px-4 py-3 font-mono text-xs">{x.referencia}</td><td className="px-4 py-3 font-semibold">{x.producto_nombre}<div className="text-xs font-normal text-slate-500">{x.receta_nombre}</div></td><td className="px-4 py-3">{x.ubicacion_nombre}</td><td className="px-4 py-3">{x.etapa_nombre || '—'}</td><td className="px-4 py-3">{cantidad(x.cantidad)}</td><td className="px-4 py-3">{cantidad(x.cantidad_desperdiciada)}</td><td className="px-4 py-3">{moneda(x.costo_total)}</td><td className="px-4 py-3">{moneda(x.costo_unitario)}</td><td className="px-4 py-3">{x.operario || '—'}</td></tr>)}{!filtradas.length && <tr><td colSpan="10" className="p-10 text-center text-slate-500">Sin resultados para estos filtros.</td></tr>}</tbody></table></div>;

  return <main className="space-y-5">
    {encabezado}
    {error && <div role="alert" className={'flex gap-3 rounded-lg border p-3 text-sm ' + (sqlFaltante ? 'border-amber-200 bg-amber-50 text-amber-900' : 'border-red-200 bg-red-50 text-red-800')}><AlertTriangle size={18} className="shrink-0" /><div><b>{sqlFaltante ? 'Falta preparar la base de datos' : 'No se pudo completar'}</b><p className="mt-1 whitespace-pre-line">{error}</p></div></div>}
    {aviso && <div role="status" className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800"><Check size={17} />{aviso}<button className="ml-auto" onClick={() => setAviso('')} aria-label="Cerrar"><X size={16} /></button></div>}
    <nav aria-label="Secciones de fabricación" className="flex gap-1.5 overflow-x-auto rounded-xl border border-slate-200 bg-white p-2">
      {TABS.map(([id, nombre]) => <button key={id} type="button" onClick={() => { setTab(id); setError(''); setAviso(''); }} aria-current={tab === id ? 'page' : undefined} className={'shrink-0 rounded-lg px-3 py-2 text-sm font-semibold transition-colors ' + (tab === id ? 'bg-orange-500 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900')}>{nombre}</button>)}
    </nav>
    {cargando && <div className="flex items-center justify-center gap-2 rounded-xl border bg-white p-10 text-sm text-slate-500"><LoaderCircle size={18} className="animate-spin" />Cargando fabricación…</div>}

    {!cargando && tab === 'recetas' && <section className="space-y-4"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-lg font-bold">Recetas</h2><p className="text-sm text-slate-500">Fórmulas de los productos terminados.</p></div><button className={btn} disabled={sqlFaltante} onClick={() => setRecetaModal({ id: '', producto_id: '', nombre: '', rendimiento: '1', instrucciones: '', items: [{ producto_id: '', cantidad: '1' }] })}><Plus size={16} /> Nueva receta</button></div><label className="relative block max-w-md"><Search size={15} className="absolute left-3 top-2.5 text-slate-400" /><input className={campo + ' pl-9'} value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Buscar receta o producto" /></label><div className="overflow-x-auto rounded-xl border bg-white"><table className="min-w-[750px] w-full text-left text-sm"><thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr>{['Receta / producto', 'Rendimiento', 'Ingredientes', 'Costo base', 'Estado', 'Acciones'].map((x) => <th key={x} className="px-4 py-3">{x}</th>)}</tr></thead><tbody className="divide-y">{recetas.filter((r) => !busqueda || (r.nombre + ' ' + (porId.get(r.producto_id)?.nombre || '')).toLowerCase().includes(busqueda.toLowerCase())).map((r) => { const costo = r.items.reduce((a, i) => a + Number(i.cantidad) * Number(porId.get(i.producto_id)?.precio_compra || 0), 0); const prod = porId.get(r.producto_id); return <tr key={r.id}><td className="px-4 py-3 font-semibold">{r.nombre}<div className="text-xs font-normal text-slate-500">{prod?.codigo || 'Sin código'} · {prod?.nombre || 'Producto inactivo'}</div></td><td className="px-4 py-3">{cantidad(r.rendimiento)}</td><td className="px-4 py-3">{r.items.length}</td><td className="px-4 py-3">{moneda(costo)}</td><td className="px-4 py-3">{r.activo ? 'Activa' : 'Inactiva'}</td><td className="px-4 py-3 text-right"><button className={btn2} onClick={() => setRecetaModal({ ...r, nombre: r.nombre || prod?.nombre || '', items: r.items.map((i) => ({ ...i, cantidad: String(i.cantidad) })) })}>Editar</button>{r.activo && <button className="ml-2 rounded-lg border border-red-200 p-2 text-red-600" aria-label="Desactivar receta" disabled={guardando} onClick={() => archivarReceta(r)}><Trash2 size={16} /></button>}</td></tr>; })}{!recetas.length && <tr><td colSpan="6" className="p-10 text-center text-slate-500">No hay recetas creadas.</td></tr>}</tbody></table></div>{!productos.length && <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">Agrega productos con control de stock antes de crear recetas.</p>}</section>}

    {!cargando && tab === 'importar' && <section className="mx-auto max-w-4xl space-y-4 rounded-xl border bg-white p-5"><div className="flex gap-3"><FileSpreadsheet className="text-emerald-600" /><div><h2 className="text-lg font-bold">Importar recetas CSV</h2><p className="text-sm text-slate-500">Una fila por ingrediente; las recetas se guardan una por vez.</p></div></div><div className="rounded-lg bg-slate-50 p-4 text-sm">Encabezados: <code>producto_codigo; producto_nombre; rendimiento; insumo_codigo; insumo_nombre; cantidad</code><p className="mt-2 text-slate-600">Busca por código exacto, o por nombre exacto si el código está vacío. Si la receta ya existe, reemplaza sus ingredientes.</p></div><div className="flex flex-wrap items-center gap-2"><button className={btn2} onClick={() => descargarCsv('plantilla-recetas.csv', [['producto_codigo','producto_nombre','rendimiento','insumo_codigo','insumo_nombre','cantidad'],['PT-001','Producto terminado','1','MP-001','Materia prima','2']])}><Download size={15} /> Plantilla</button><label className={btn2 + ' cursor-pointer'}>Elegir CSV<input type="file" accept=".csv,text/csv" className="hidden" onChange={async (e) => { const f = e.target.files?.[0]; setCsvNombre(f?.name || ''); setCsvResultado(''); try { const rows = f ? leerCsv(await f.text()) : []; if (f && !rows.length) throw new Error('El CSV no tiene encabezados y filas válidos.'); setCsvFilas(rows); } catch (err) { fallar(err); setCsvFilas([]); } }} /></label>{csvNombre && <span className="text-sm text-slate-500">{csvNombre} · {csvFilas.length} filas</span>}</div>{csvFilas.length > 0 && <div className="overflow-x-auto rounded border"><table className="min-w-[600px] w-full text-xs"><thead className="bg-slate-50"><tr>{Object.keys(csvFilas[0]).slice(0, 6).map((x) => <th key={x} className="px-3 py-2 text-left">{x}</th>)}</tr></thead><tbody>{csvFilas.slice(0, 5).map((x, i) => <tr key={i} className="border-t">{Object.keys(csvFilas[0]).slice(0, 6).map((k) => <td key={k} className="truncate px-3 py-2">{x[k]}</td>)}</tr>)}</tbody></table></div>}<button className={btn} onClick={importarCsv} disabled={!csvFilas.length || importando || sqlFaltante}>{importando ? <LoaderCircle size={16} className="animate-spin" /> : <Download size={16} />} Importar {csvFilas.length} filas</button>{csvResultado && <pre className="whitespace-pre-wrap rounded bg-slate-50 p-3 text-sm">{csvResultado}</pre>}</section>}

    {!cargando && tab === 'ordenes' && <FabricacionOrdenes />}

    {!cargando && tab === 'produccion' && <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(300px,0.7fr)]"><form onSubmit={producir} className="space-y-4 rounded-xl border bg-white p-5"><div><h2 className="text-lg font-bold">Producción rápida</h2><p className="text-sm text-slate-500">Consume ingredientes y agrega el producto terminado a la sucursal. En esta base, el stock global se maneja en unidades enteras.</p></div><div className="grid gap-3 sm:grid-cols-2"><label className="sm:col-span-2"><span className={etiqueta}>Receta *</span><select className={campo} required value={form.receta_id} onChange={(e) => cambio('receta_id', e.target.value)}><option value="">Selecciona</option>{recetasActivas.map((r) => <option key={r.id} value={r.id}>{r.nombre} — {porId.get(r.producto_id)?.nombre || ''}</option>)}</select></label><label><span className={etiqueta}>Sucursal *</span><select className={campo} required value={form.ubicacion_id} onChange={(e) => cambio('ubicacion_id', e.target.value)}><option value="">Selecciona</option>{ubicaciones.map((u) => <option key={u.id} value={u.id}>{u.nombre}</option>)}</select></label><label><span className={etiqueta}>Fecha *</span><input className={campo} type="datetime-local" required value={form.fecha} onChange={(e) => cambio('fecha', e.target.value)} /></label><label><span className={etiqueta}>Etapa de producción</span><select className={campo} value={form.etapa_id} onChange={(e) => cambio('etapa_id', e.target.value)}><option value="">Sin asignar</option>{etapas.filter((x) => x.activo).map((x) => <option key={x.id} value={x.id}>{x.nombre}</option>)}</select></label><label><span className={etiqueta}>Cantidad terminada *</span><input className={campo} type="number" min="1" step="1" required value={form.cantidad} onChange={(e) => cambio('cantidad', e.target.value)} /></label><label><span className={etiqueta}>Desperdicio</span><input className={campo} type="number" min="0" step="1" value={form.desperdicio} onChange={(e) => cambio('desperdicio', e.target.value)} /></label><label><span className={etiqueta}>Referencia</span><input className={campo} maxLength="60" value={form.referencia} onChange={(e) => cambio('referencia', e.target.value)} placeholder="Automática si queda vacía" /></label><label><span className={etiqueta}>Centro de trabajo</span><select className={campo} value={form.centro_id} onChange={(e) => cambio('centro_id', e.target.value)}><option value="">Sin asignar</option>{centros.filter((c) => c.activo).map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}</select></label><label><span className={etiqueta}>Operario</span><input className={campo} maxLength="120" value={form.operario} onChange={(e) => cambio('operario', e.target.value)} /></label><label><span className={etiqueta}>Costo adicional total (Gs)</span><input className={campo} type="number" min="0" step="1" value={form.costo_adicional} onChange={(e) => cambio('costo_adicional', e.target.value)} /></label></div>{form.insumos.length > 0 && <div className="space-y-2"><div><b>Consumo de ingredientes</b><p className="text-xs text-slate-500">Se escala por cantidad más desperdicio. Ajusta el consumo real si hace falta.</p></div><div className="overflow-x-auto rounded border"><table className="min-w-[550px] w-full text-left text-xs"><thead className="bg-slate-50"><tr><th className="px-3 py-2">Ingrediente</th><th className="px-3 py-2">Plan</th><th className="px-3 py-2">Real</th><th className="px-3 py-2">Disponible</th></tr></thead><tbody className="divide-y">{form.insumos.map((x) => { const disp = stockMap.get(x.producto_id + ':' + form.ubicacion_id) || 0; return <tr key={x.producto_id}><td className="px-3 py-2">{x.nombre}<div className="text-slate-400">{x.codigo || 'Sin código'}</div></td><td className="px-3 py-2">{cantidad(x.requerido)}</td><td className="w-36 px-3 py-2"><input className={campo} type="number" min="1" step="1" value={x.cantidad} onChange={(e) => setForm((f) => ({ ...f, insumos: f.insumos.map((i) => i.producto_id === x.producto_id ? { ...i, cantidad: e.target.value, modificado: true } : i) }))} /></td><td className={'px-3 py-2 ' + (Number(x.cantidad) > disp ? 'text-red-600 font-bold' : '')}>{cantidad(disp)}</td></tr>; })}</tbody></table></div></div>}<label className="block"><span className={etiqueta}>Notas</span><textarea className={campo} rows="2" maxLength="1000" value={form.notas} onChange={(e) => cambio('notas', e.target.value)} /></label><button className={btn} disabled={guardando || sqlFaltante || !recetasActivas.length || !ubicaciones.length}>{guardando ? <LoaderCircle size={16} className="animate-spin" /> : <Factory size={16} />} Registrar producción</button></form><aside className="h-fit space-y-4 rounded-xl border bg-white p-5"><div><b>Resumen de costos</b><p className="text-sm text-slate-500">Costo de compra actual de los ingredientes.</p></div><div className="space-y-2 rounded-lg bg-slate-50 p-4 text-sm">{form.insumos.map((x) => <div key={x.producto_id} className="flex justify-between gap-2"><span>{x.nombre} × {cantidad(x.cantidad)}</span><b>{moneda(Number(x.cantidad) * x.precio)}</b></div>)}<div className="border-t pt-3"><div className="flex justify-between"><span>Total</span><b>{moneda(costoEstimado)}</b></div><div className="mt-1 flex justify-between"><span>Por unidad</span><b>{moneda(Number(form.cantidad) ? costoEstimado / Number(form.cantidad) : 0)}</b></div></div></div><p className="rounded-lg border border-blue-100 bg-blue-50 p-3 text-xs leading-5 text-blue-900">Stock e historial se guardan en una operación atómica. Si falla una validación, no se aplica ningún cambio.</p></aside></section>}

    {!cargando && ['informe', 'operarios', 'variaciones'].includes(tab) && <section className="space-y-4"><div><h2 className="text-lg font-bold">{TABS.find((x) => x[0] === tab)?.[1]}</h2><p className="text-sm text-slate-500">Producción completada para el periodo seleccionado.</p></div>{filtros}{tab === 'informe' && <><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{[['Producciones', filtradas.length], ['Unidades', cantidad(sumar('cantidad'))], ['Desperdicio', cantidad(sumar('cantidad_desperdiciada'))], ['Costo', moneda(sumar('costo_total'))]].map(([k,v]) => <article key={k} className="rounded-xl border bg-white p-4"><span className="text-xs uppercase text-slate-500">{k}</span><p className="mt-2 text-xl font-bold">{v}</p></article>)}</div>{tablaProducciones}</>}{tab === 'operarios' && <div className="overflow-x-auto rounded-xl border bg-white"><table className="min-w-[650px] w-full text-left text-sm"><thead className="bg-slate-50 text-xs uppercase"><tr>{['Operario','Producciones','Unidades','Desperdicio','Costo'].map((x) => <th key={x} className="px-4 py-3">{x}</th>)}</tr></thead><tbody className="divide-y">{productividad.map((x) => <tr key={x.nombre}><td className="px-4 py-3 font-semibold">{x.nombre}</td><td className="px-4 py-3">{x.lotes}</td><td className="px-4 py-3">{cantidad(x.unidades)}</td><td className="px-4 py-3">{cantidad(x.desperdicio)}</td><td className="px-4 py-3">{moneda(x.costo)}</td></tr>)}{!productividad.length && <tr><td colSpan="5" className="p-10 text-center text-slate-500">No hay producción en el periodo.</td></tr>}</tbody></table></div>}{tab === 'variaciones' && <div className="overflow-x-auto rounded-xl border bg-white"><table className="min-w-[850px] w-full text-left text-sm"><thead className="bg-slate-50 text-xs uppercase"><tr>{['Fecha / ref.','Producto final','Ingrediente','Plan','Consumido','Variación','Costo var.'].map((x) => <th key={x} className="px-4 py-3">{x}</th>)}</tr></thead><tbody className="divide-y">{variaciones.map((x,i) => <tr key={x.referencia + x.producto_id + i}><td className="px-4 py-3">{fecha(x.fecha)}<div className="font-mono text-xs text-slate-400">{x.referencia}</div></td><td className="px-4 py-3">{x.producto_nombre}</td><td className="px-4 py-3">{x.nombre}</td><td className="px-4 py-3">{cantidad(x.cantidad_planeada)}</td><td className="px-4 py-3">{cantidad(x.cantidad_consumida)}</td><td className="px-4 py-3">{Number(x.diferencia) > 0 ? '+' : ''}{cantidad(x.diferencia)}</td><td className="px-4 py-3">{moneda(Number(x.diferencia) * Number(x.costo_unitario))}</td></tr>)}{!variaciones.length && <tr><td colSpan="7" className="p-10 text-center text-slate-500">No hay variaciones en el periodo.</td></tr>}</tbody></table></div>}</section>}

    {!cargando && tab === 'centros' && <section className="space-y-4"><div className="flex items-center justify-between"><div><h2 className="text-lg font-bold">Centros de trabajo</h2><p className="text-sm text-slate-500">Estaciones asignables a las producciones.</p></div><button className={btn} disabled={sqlFaltante} onClick={() => setCentroModal({ nombre: '', codigo: '', activo: true })}><Plus size={16} /> Nuevo centro</button></div><div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{centros.map((c) => <article key={c.id} className="rounded-xl border bg-white p-4"><div className="flex justify-between"><div><b>{c.nombre}</b><div className="text-xs text-slate-500">{c.codigo || 'Sin código'}</div></div><span className="text-xs">{c.activo ? 'Activo' : 'Inactivo'}</span></div><div className="mt-4 flex gap-2"><button className={btn2} onClick={() => setCentroModal({ ...c })}>Editar</button><button className={btn2} onClick={() => setCentroModal({ ...c, activo: !c.activo })}>{c.activo ? 'Desactivar' : 'Reactivar'}</button></div></article>)}{!centros.length && <div className="rounded-xl border border-dashed p-10 text-center text-sm text-slate-500">No hay centros de trabajo.</div>}</div></section>}
    {!cargando && tab === 'etapas' && <section className="space-y-4"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-lg font-bold">Etapas de producción</h2><p className="text-sm text-slate-500">Organiza el flujo por etapas y asígnalas al registrar una producción.</p></div><button className={btn} disabled={sqlFaltante} onClick={() => setEtapaModal({ id: '', nombre: '', orden: String(etapas.length + 1), activo: true })}><Plus size={16} /> Nueva etapa</button></div><div className="overflow-x-auto rounded-xl border bg-white"><table className="min-w-[600px] w-full text-left text-sm"><thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr>{['Orden', 'Etapa', 'Estado', 'Acciones'].map((x) => <th key={x} className="px-4 py-3">{x}</th>)}</tr></thead><tbody className="divide-y">{etapas.map((etapa) => <tr key={etapa.id}><td className="px-4 py-3">{etapa.orden}</td><td className="px-4 py-3 font-semibold">{etapa.nombre}</td><td className="px-4 py-3">{etapa.activo ? 'Activa' : 'Inactiva'}</td><td className="px-4 py-3"><button className={btn2} onClick={() => setEtapaModal({ ...etapa, orden: String(etapa.orden) })}>Editar</button><button className="ml-2 rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold" onClick={() => setEtapaModal({ ...etapa, orden: String(etapa.orden), activo: !etapa.activo })}>{etapa.activo ? 'Desactivar' : 'Reactivar'}</button></td></tr>)}{!etapas.length && <tr><td colSpan="4" className="p-10 text-center text-slate-500">Todavía no hay etapas configuradas.</td></tr>}</tbody></table></div></section>}    {!cargando && tab === 'config' && <section className="grid gap-4 lg:grid-cols-2"><article className="rounded-xl border bg-white p-5"><h2 className="font-bold">Reglas de fabricación</h2><ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-slate-600"><li>La receta define cantidades para el rendimiento base.</li><li>El plan se escala por unidades terminadas más desperdicio.</li><li>El costo usa el costo actual de compra y actualiza el costo promedio de salida.</li><li>Stock, costo e historial se confirman juntos.</li></ul></article><article className="rounded-xl border bg-white p-5"><h2 className="flex items-center gap-2 font-bold"><Users size={18} /> Permisos</h2><p className="mt-3 text-sm leading-6 text-slate-600">Usa el permiso existente Productos → Ajustar stock. Cada operación valida usuario, empresa y acceso a sucursal desde la base de datos.</p><p className="mt-3 text-xs text-slate-500">La migración añade tablas y funciones protegidas; no reemplaza ventas, compras ni caja.</p></article></section>}
    {!cargando && tab === 'manual' && <section className="mx-auto max-w-3xl space-y-3 rounded-xl border bg-white p-5"><h2 className="text-lg font-bold">Manual de fabricación</h2><ol className="list-decimal space-y-2 pl-5 text-sm leading-6 text-slate-600"><li>Verifica que productos e ingredientes controlen stock y tengan saldo inicial en la sucursal.</li><li>Crea una receta con producto final, rendimiento e ingredientes.</li><li>Registra una producción rápida o crea una orden para planificarla antes de consumir stock.</li><li>Al confirmar se descuentan los ingredientes y se agrega el producto final en la misma transacción.</li><li>Consulta informes, productividad y variaciones para revisar resultados.</li></ol><div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"><b>Primer uso:</b> aplica en orden <code>database/migration_fabricacion.sql</code>, <code>database/migration_fabricacion_etapas.sql</code> y <code>database/migration_fabricacion_ordenes.sql</code> al Supabase conectado.</div></section>}

    {recetaModal && <div className="fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto bg-slate-950/50 p-3" role="dialog" aria-modal="true"><form onSubmit={guardarReceta} className="my-4 w-full max-w-3xl space-y-4 rounded-2xl bg-white p-5 shadow-2xl"><div className="flex justify-between"><div><h2 className="text-lg font-bold">{recetaModal.id ? 'Editar receta' : 'Nueva receta'}</h2><p className="text-sm text-slate-500">Solo productos activos con control de stock.</p></div><button type="button" onClick={() => setRecetaModal(null)} aria-label="Cerrar"><X size={18} /></button></div><div className="grid gap-3 sm:grid-cols-2"><label><span className={etiqueta}>Producto terminado *</span><select className={campo} required value={recetaModal.producto_id} onChange={(e) => setRecetaModal({ ...recetaModal, producto_id: e.target.value, nombre: recetaModal.nombre || porId.get(e.target.value)?.nombre || '' })}><option value="">Selecciona</option>{productos.map((p) => <option key={p.id} value={p.id}>{p.codigo ? p.codigo + ' — ' : ''}{p.nombre}</option>)}</select></label><label><span className={etiqueta}>Nombre *</span><input className={campo} required minLength="2" maxLength="120" value={recetaModal.nombre} onChange={(e) => setRecetaModal({ ...recetaModal, nombre: e.target.value })} /></label><label><span className={etiqueta}>Rendimiento base *</span><input className={campo} required type="number" min="0.0001" step="0.0001" value={recetaModal.rendimiento} onChange={(e) => setRecetaModal({ ...recetaModal, rendimiento: e.target.value })} /></label></div><div className="space-y-2"><div className="flex items-center justify-between"><b>Ingredientes</b><button type="button" className={btn2} onClick={() => setRecetaModal({ ...recetaModal, items: [...recetaModal.items, { producto_id: '', cantidad: '1' }] })}><Plus size={15} /> Agregar</button></div>{recetaModal.items.map((item,i) => <div key={i} className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_140px_40px]"><select className={campo} required value={item.producto_id} onChange={(e) => setRecetaModal({ ...recetaModal, items: recetaModal.items.map((x,j) => i === j ? { ...x, producto_id: e.target.value } : x) })}><option value="">Selecciona ingrediente</option>{productos.filter((p) => p.id !== recetaModal.producto_id).map((p) => <option key={p.id} value={p.id}>{p.codigo ? p.codigo + ' — ' : ''}{p.nombre}</option>)}</select><input className={campo} aria-label="Cantidad" type="number" min="0.0001" step="0.0001" required value={item.cantidad} onChange={(e) => setRecetaModal({ ...recetaModal, items: recetaModal.items.map((x,j) => i === j ? { ...x, cantidad: e.target.value } : x) })} /><button type="button" className="rounded border border-red-200 p-2 text-red-600 disabled:opacity-40" aria-label="Quitar ingrediente" disabled={recetaModal.items.length < 2} onClick={() => setRecetaModal({ ...recetaModal, items: recetaModal.items.filter((_,j) => i !== j) })}><X size={16} /></button></div>)}</div><label className="block"><span className={etiqueta}>Instrucciones</span><textarea className={campo} rows="3" maxLength="3000" value={recetaModal.instrucciones || ''} onChange={(e) => setRecetaModal({ ...recetaModal, instrucciones: e.target.value })} /></label><div className="flex justify-end gap-2 border-t pt-3"><button type="button" className={btn2} onClick={() => setRecetaModal(null)}>Cancelar</button><button className={btn} disabled={guardando || sqlFaltante}>{guardando ? <LoaderCircle size={16} className="animate-spin" /> : <Save size={16} />} Guardar receta</button></div></form></div>}

    {etapaModal && <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/50 p-3" role="dialog" aria-modal="true"><form onSubmit={guardarEtapa} className="w-full max-w-md space-y-4 rounded-2xl bg-white p-5 shadow-2xl"><div className="flex justify-between"><div><h2 className="text-lg font-bold">{etapaModal.id ? 'Editar etapa' : 'Nueva etapa'}</h2><p className="text-xs text-slate-500">La etapa se puede desactivar sin borrar el historial.</p></div><button type="button" onClick={() => setEtapaModal(null)} aria-label="Cerrar"><X size={18} /></button></div><label className="block"><span className={etiqueta}>Nombre *</span><input className={campo} required minLength="2" maxLength="100" value={etapaModal.nombre} onChange={(e) => setEtapaModal({ ...etapaModal, nombre: e.target.value })} /></label><label className="block"><span className={etiqueta}>Orden *</span><input className={campo} required type="number" min="0" max="9999" step="1" value={etapaModal.orden} onChange={(e) => setEtapaModal({ ...etapaModal, orden: e.target.value })} /></label><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={etapaModal.activo !== false} onChange={(e) => setEtapaModal({ ...etapaModal, activo: e.target.checked })} /> Activa para nuevas producciones</label><div className="flex justify-end gap-2 border-t pt-3"><button type="button" className={btn2} onClick={() => setEtapaModal(null)}>Cancelar</button><button className={btn} disabled={guardando || sqlFaltante}>{guardando ? <LoaderCircle size={16} className="animate-spin" /> : <Save size={16} />} Guardar etapa</button></div></form></div>}    {centroModal && <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/50 p-3" role="dialog" aria-modal="true"><form onSubmit={guardarCentro} className="w-full max-w-md space-y-4 rounded-2xl bg-white p-5 shadow-2xl"><div className="flex justify-between"><h2 className="text-lg font-bold">{centroModal.id ? 'Editar centro' : 'Nuevo centro'}</h2><button type="button" onClick={() => setCentroModal(null)} aria-label="Cerrar"><X size={18} /></button></div><label className="block"><span className={etiqueta}>Nombre *</span><input className={campo} required minLength="2" maxLength="100" value={centroModal.nombre} onChange={(e) => setCentroModal({ ...centroModal, nombre: e.target.value })} /></label><label className="block"><span className={etiqueta}>Código</span><input className={campo} maxLength="40" value={centroModal.codigo || ''} onChange={(e) => setCentroModal({ ...centroModal, codigo: e.target.value })} /></label><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={centroModal.activo !== false} onChange={(e) => setCentroModal({ ...centroModal, activo: e.target.checked })} /> Activo</label><div className="flex justify-end gap-2 border-t pt-3"><button type="button" className={btn2} onClick={() => setCentroModal(null)}>Cancelar</button><button className={btn} disabled={guardando || sqlFaltante}>{guardando ? <LoaderCircle size={16} className="animate-spin" /> : <Save size={16} />} Guardar</button></div></form></div>}
  </main>;
}
