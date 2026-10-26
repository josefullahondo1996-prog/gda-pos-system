import { useEffect, useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Download, FileSpreadsheet, LoaderCircle, Pencil, Plus, Printer, Search, Upload, X } from 'lucide-react';
import { supabase } from './supabaseClient';
import { useEmpresaInfo } from './utils/useEmpresa';
import { useNotificacion } from './NotificacionContext';
import { PreciosPorProductoGrupo } from './ModulosProductos';

const money = (value) => `Gs ${Number(value || 0).toLocaleString('es-PY')}`;
const headersImport = ['ID del producto', 'Código', 'Producto', 'Grupo', 'Margen (%)', 'Precio de venta (Gs)'];
const normalizarClave = (value) => String(value || '').trim().toLocaleLowerCase('es');
const nombreColumna = (value) => normalizarClave(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

function descargarBlob(contenido, nombre, tipo) {
  const blob = new Blob([contenido], { type: tipo });
  const url = URL.createObjectURL(blob);
  const enlace = document.createElement('a');
  enlace.href = url;
  enlace.download = nombre;
  enlace.click();
  URL.revokeObjectURL(url);
}

function parsearArchivo(file) {
  return file.arrayBuffer().then((buffer) => {
    const libro = XLSX.read(buffer, { type: 'array' });
    const hoja = libro.Sheets[libro.SheetNames[0]];
    return XLSX.utils.sheet_to_json(hoja, { defval: '', raw: false });
  });
}

export default function GruposPreciosVenta() {
  const { id: empresaId } = useEmpresaInfo();
  const { notificar, confirmar } = useNotificacion();
  const [grupos, setGrupos] = useState([]);
  const [productos, setProductos] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [busqueda, setBusqueda] = useState('');
  const [pagina, setPagina] = useState(1);
  const [porPagina, setPorPagina] = useState(25);
  const [orden, setOrden] = useState({ columna: 'nombre', direccion: 'asc' });
  const [columnas, setColumnas] = useState({ descripcion: true, margen: true, estado: true });
  const [mostrarColumnas, setMostrarColumnas] = useState(false);
  const [vista, setVista] = useState('grupos');
  const [modalAbierto, setModalAbierto] = useState(false);
  const [editando, setEditando] = useState(null);
  const [nombre, setNombre] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [margen, setMargen] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [archivo, setArchivo] = useState(null);
  const [filasImportacion, setFilasImportacion] = useState([]);
  const [errorImportacion, setErrorImportacion] = useState('');
  const [importando, setImportando] = useState(false);

  const cargar = async () => {
    if (!empresaId) return;
    setCargando(true);
    const [resGrupos, resProductos] = await Promise.all([
      supabase.from('grupos_precios_venta').select('id,nombre,descripcion,margen_default,activo,creado_en').eq('empresa_id', empresaId).order('nombre'),
      supabase.from('productos').select('id,nombre,codigo,precio_venta,grupos_precio').eq('empresa_id', empresaId).order('nombre'),
    ]);
    if (resGrupos.error) setError(`No se pudo cargar el catálogo de grupos: ${resGrupos.error.message}. Aplicá database/migration_grupos_precios_venta.sql en Supabase.`);
    else { setError(''); setGrupos(resGrupos.data || []); }
    if (resProductos.error) setError((actual) => `${actual ? `${actual} ` : ''}No se pudieron cargar los precios de productos: ${resProductos.error.message}`);
    else setProductos(resProductos.data || []);
    setCargando(false);
  };

  useEffect(() => { cargar(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [empresaId]);

  const filtrados = useMemo(() => grupos
    .filter((g) => `${g.nombre} ${g.descripcion || ''}`.toLocaleLowerCase('es').includes(busqueda.toLocaleLowerCase('es')))
    .sort((a, b) => {
      const campo = orden.columna === 'margen' ? 'margen_default' : orden.columna;
      const av = a[campo] ?? '';
      const bv = b[campo] ?? '';
      const cmp = typeof av === 'number' ? av - Number(bv) : String(av).localeCompare(String(bv), 'es', { numeric: true, sensitivity: 'base' });
      return orden.direccion === 'asc' ? cmp : -cmp;
    }), [grupos, busqueda, orden]);
  const filasPorPagina = porPagina === 0 ? Math.max(1, filtrados.length) : porPagina;
  const paginas = porPagina === 0 ? 1 : Math.max(1, Math.ceil(filtrados.length / porPagina));
  const paginaSegura = Math.min(pagina, paginas);
  const visibles = filtrados.slice((paginaSegura - 1) * filasPorPagina, paginaSegura * filasPorPagina);
  useEffect(() => setPagina(1), [busqueda, porPagina]);

  const abrirNuevo = () => { setEditando(null); setNombre(''); setDescripcion(''); setMargen(''); setModalAbierto(true); };
  const abrirEditar = (grupo) => { setEditando(grupo); setNombre(grupo.nombre); setDescripcion(grupo.descripcion || ''); setMargen(String(grupo.margen_default ?? '')); setModalAbierto(true); };

  const guardar = async (event) => {
    event.preventDefault();
    const name = nombre.trim();
    const percent = margen === '' ? 0 : Number(margen);
    if (!name) return setError('El nombre del grupo es obligatorio.');
    if (!Number.isFinite(percent) || percent < 0 || percent > 10000) return setError('El margen debe ser un número entre 0 y 10000%.');
    if (grupos.some((g) => normalizarClave(g.nombre) === normalizarClave(name) && g.id !== editando?.id)) return setError('Ya existe un grupo con ese nombre en esta empresa.');
    setGuardando(true); setError('');
    const datos = { nombre: name, descripcion: descripcion.trim() || null, margen_default: percent };
    const { error: err } = editando
      ? await supabase.from('grupos_precios_venta').update(datos).eq('id', editando.id).eq('empresa_id', empresaId)
      : await supabase.from('grupos_precios_venta').insert({ ...datos, empresa_id: empresaId, activo: true });
    setGuardando(false);
    if (err) { setError(`No se pudo guardar el grupo: ${err.message}`); return; }
    setModalAbierto(false); notificar.exito(editando ? 'Grupo de precios actualizado.' : 'Grupo de precios creado.'); await cargar();
  };

  const alternarActivo = async (grupo) => {
    const { error: err } = await supabase.from('grupos_precios_venta').update({ activo: !grupo.activo }).eq('id', grupo.id).eq('empresa_id', empresaId);
    if (err) return setError(`No se pudo cambiar el estado del grupo: ${err.message}`);
    notificar.exito(grupo.activo ? 'Grupo desactivado.' : 'Grupo activado.'); await cargar();
  };

  const borrar = async (grupo) => {
    const productosUso = productos.filter((p) => (p.grupos_precio || []).some((g) => normalizarClave(g.nombre) === normalizarClave(grupo.nombre))).length;
    const { data: clientesUso, error: errorClientes } = await supabase.from('grupos_clientes').select('id').eq('empresa_id', empresaId).eq('grupo_precios', grupo.nombre).limit(1);
    if (errorClientes) return setError(`No se pudo comprobar si hay grupos de clientes vinculados: ${errorClientes.message}`);
    if (productosUso || clientesUso?.length) return setError(`No se puede borrar “${grupo.nombre}”: todavía se usa en precios de ${productosUso} producto(s)${clientesUso?.length ? ' o en un grupo de clientes' : ''}. Desactivalo para conservar el historial.`);
    if (!(await confirmar(`¿Borrar permanentemente el grupo “${grupo.nombre}”?`))) return;
    const { error: err } = await supabase.from('grupos_precios_venta').delete().eq('id', grupo.id).eq('empresa_id', empresaId);
    if (err) return setError(`No se pudo borrar el grupo: ${err.message}`);
    notificar.exito('Grupo de precios eliminado.'); await cargar();
  };

  const exportarGrupos = (formato) => {
    const filas = filtrados.map((g) => ({ Nombre: g.nombre, Descripcion: g.descripcion || '', 'Margen por defecto (%)': g.margen_default, Estado: g.activo ? 'Activo' : 'Inactivo' }));
    if (formato === 'xlsx') {
      const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(filas), 'Grupos'); XLSX.writeFile(wb, 'grupos-precios-venta.xlsx');
    } else {
      const ws = XLSX.utils.json_to_sheet(filas); descargarBlob(XLSX.utils.sheet_to_csv(ws), 'grupos-precios-venta.csv', 'text/csv;charset=utf-8');
    }
  };

  const exportarPDF = () => {
    const doc = new jsPDF({ orientation: 'landscape' });
    doc.text('Grupo de precios de venta', 14, 14);
    const head = [['Nombre', ...(columnas.descripcion ? ['Descripción'] : []), ...(columnas.margen ? ['Margen por defecto (%)'] : []), ...(columnas.estado ? ['Estado'] : [])]];
    const body = filtrados.map((g) => [g.nombre, ...(columnas.descripcion ? [g.descripcion || '—'] : []), ...(columnas.margen ? [`${Number(g.margen_default || 0)}%`] : []), ...(columnas.estado ? [g.activo ? 'Activo' : 'Inactivo'] : [])]);
    autoTable(doc, { head, body, startY: 20, styles: { fontSize: 9 } });
    doc.save('grupos-precios-venta.pdf');
  };

  const cambiarOrden = (columna) => setOrden((prev) => ({ columna, direccion: prev.columna === columna && prev.direccion === 'asc' ? 'desc' : 'asc' }));

  const exportarPrecios = () => {
    const rows = productos.flatMap((p) => {
      const items = Array.isArray(p.grupos_precio) ? p.grupos_precio : [];
      if (!items.length) return [{ [headersImport[0]]: p.id, [headersImport[1]]: p.codigo || '', [headersImport[2]]: p.nombre, [headersImport[3]]: '', [headersImport[4]]: '', [headersImport[5]]: '' }];
      return items.map((g) => ({ [headersImport[0]]: p.id, [headersImport[1]]: p.codigo || '', [headersImport[2]]: p.nombre, [headersImport[3]]: g.nombre || '', [headersImport[4]]: g.margen ?? 0, [headersImport[5]]: g.precioVenta ?? '' }));
    });
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows, { header: headersImport }), 'Precios por grupo'); XLSX.writeFile(wb, 'precios-por-grupo.xlsx');
  };

  const seleccionarArchivo = async (file) => {
    setArchivo(file || null); setFilasImportacion([]); setErrorImportacion('');
    if (!file) return;
    try {
      const rows = await parsearArchivo(file);
      const keys = Object.keys(rows[0] || {});
      const lookup = Object.fromEntries(keys.map((k) => [nombreColumna(k), k]));
      const keyId = lookup['id del producto'] || lookup['producto id'] || lookup['id producto'];
      const keyGroup = lookup.grupo || lookup['grupo de precio'];
      const keyPrice = lookup['precio de venta gs'] || lookup['precio venta gs'] || lookup['precio de venta'] || lookup['precio venta'];
      const keyMargin = lookup['margen'] || lookup['margen'];
      if (!keyId || !keyGroup || !keyPrice) throw new Error(`El archivo debe incluir las columnas “${headersImport[0]}”, “${headersImport[3]}” y “${headersImport[5]}”. Descargá la plantilla con Exportar precios.`);
      const items = rows.map((r, i) => ({ fila: i + 2, id: String(r[keyId] || '').trim(), grupo: String(r[keyGroup] || '').trim(), margen: keyMargin ? r[keyMargin] : '', precio: String(r[keyPrice] ?? '').trim() })).filter((r) => r.id);
      if (!items.length) throw new Error('El archivo no tiene filas con un ID de producto.');
      setFilasImportacion(items);
    } catch (err) { setErrorImportacion(err.message || 'No se pudo leer el archivo.'); }
  };

  const aplicarImportacion = async () => {
    if (!filasImportacion.length) return;
    const errores = [];
    const porProducto = new Map();
    filasImportacion.forEach((row) => {
      const producto = productos.find((p) => p.id === row.id);
      if (!producto) { errores.push(`Fila ${row.fila}: ID de producto no encontrado en esta empresa.`); return; }
      if (!porProducto.has(row.id)) porProducto.set(row.id, { producto, precios: [], vistos: new Set() });
      if (!row.grupo) {
        if (row.precio) errores.push(`Fila ${row.fila}: indicá un grupo o dejá precio y grupo vacíos.`);
        return;
      }
      const grupo = grupos.find((g) => g.activo && normalizarClave(g.nombre) === normalizarClave(row.grupo));
      if (!grupo) { errores.push(`Fila ${row.fila}: el grupo “${row.grupo}” no existe o está desactivado.`); return; }
      const key = normalizarClave(grupo.nombre);
      const item = porProducto.get(row.id);
      if (item.vistos.has(key)) { errores.push(`Fila ${row.fila}: grupo duplicado para el mismo producto.`); return; }
      item.vistos.add(key);
      if (!row.precio) return; // Una celda de precio vacía elimina ese precio de grupo.
      const precio = Number(row.precio.replace(/\./g, '').replace(',', '.'));
      const margenImportado = row.margen === '' ? Number(grupo.margen_default) || 0 : Number(String(row.margen).replace(',', '.'));
      if (!Number.isFinite(precio) || precio < 0 || !Number.isFinite(margenImportado) || margenImportado < 0) { errores.push(`Fila ${row.fila}: el precio y el margen deben ser valores no negativos.`); return; }
      item.precios.push({ nombre: grupo.nombre, margen: margenImportado, precioVenta: Math.round(precio) });
    });
    if (errores.length) { setErrorImportacion(errores.slice(0, 8).join(' ')); return; }
    if (!(await confirmar(`Se actualizarán precios de ${porProducto.size} producto(s). En cada producto del archivo, los precios de grupo que no aparezcan o queden vacíos se eliminarán. ¿Aplicar la importación?`))) return;
    setImportando(true); setErrorImportacion('');
    let guardados = 0;
    for (const { producto, precios } of porProducto.values()) {
      const { error: err } = await supabase.from('productos').update({ grupos_precio: precios }).eq('id', producto.id).eq('empresa_id', empresaId);
      if (err) { errores.push(`${producto.nombre}: ${err.message}`); break; }
      guardados += 1;
    }
    setImportando(false);
    if (errores.length) { setErrorImportacion(`Se guardaron ${guardados} producto(s); la importación se detuvo: ${errores[0]}`); await cargar(); return; }
    setArchivo(null); setFilasImportacion([]); notificar.exito(`Precios importados para ${guardados} producto(s).`); await cargar();
  };

  if (vista === 'productos') return <div className="space-y-4 p-4 md:p-6"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-widest text-blue-600">Productos</p><h1 className="text-2xl font-bold text-slate-900">Grupo de precios de venta</h1></div><button type="button" onClick={() => setVista('grupos')} className="rounded-lg border bg-white px-4 py-2 text-sm font-semibold text-slate-700">← Volver a grupos</button></div><PreciosPorProductoGrupo/></div>;

  return <div className="space-y-5 p-4 md:p-6">
    <header className="flex flex-wrap items-end justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-widest text-blue-600">Productos</p><h1 className="text-2xl font-bold text-slate-900">Grupo de precios de venta</h1><p className="mt-1 text-sm text-slate-500">Administrá los grupos, el margen predeterminado y sus precios por producto.</p></div><div className="flex gap-2"><button type="button" onClick={() => setVista('productos')} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700">Precios por producto</button><button type="button" onClick={abrirNuevo} className="inline-flex items-center gap-2 rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-600"><Plus size={16}/> Añadir</button></div></header>
    {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm"><div className="border-b px-4 py-4"><h2 className="font-bold text-slate-800">Precios de grupo de precios de venta de importación / exportación</h2><p className="mt-1 text-sm text-slate-500">Descargá la planilla, editá los precios y volvé a importarla para actualizar los productos.</p></div><div className="grid gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_minmax(280px,0.9fr)]"><div className="flex flex-wrap items-center gap-2"><button type="button" onClick={exportarPrecios} disabled={cargando} className="inline-flex items-center gap-2 rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-50"><Download size={16}/> Exportar precios de grupos</button><label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"><FileSpreadsheet size={16}/>{archivo ? archivo.name : 'Seleccionar archivo'}<input type="file" accept=".csv,.xls,.xlsx" className="sr-only" onChange={(e) => seleccionarArchivo(e.target.files?.[0])}/></label><button type="button" onClick={aplicarImportacion} disabled={!filasImportacion.length || importando} className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-700 disabled:opacity-50">{importando ? <LoaderCircle size={16} className="animate-spin"/> : <Upload size={16}/>}Importar precios{filasImportacion.length ? ` (${new Set(filasImportacion.map((f) => f.id)).size})` : ''}</button></div><div className="rounded-lg bg-slate-50 p-3 text-xs leading-5 text-slate-600"><strong>Instrucciones</strong><ul className="ml-4 list-disc"><li>Exportá la hoja, editá el mismo archivo y conservá el ID del producto.</li><li>Solo se actualizarán precios por grupo; el precio base y el stock no se modifican.</li><li>Un precio vacío elimina ese precio de grupo del producto.</li></ul></div></div>{errorImportacion && <p role="alert" className="mx-4 mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{errorImportacion}</p>}{filasImportacion.length > 0 && <p className="mx-4 mb-4 rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800">Archivo listo: {new Set(filasImportacion.map((f) => f.id)).size} producto(s), {filasImportacion.length} fila(s). Los grupos no incluidos en cada producto se quitarán al importar.</p>}</section>

    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm"><div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-4"><h2 className="font-bold text-slate-800">Grupo de precios de venta total</h2><button type="button" onClick={abrirNuevo} className="inline-flex items-center gap-2 rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-600"><Plus size={16}/> Añadir</button></div><div className="p-4"><div className="mb-4 flex flex-wrap items-center justify-between gap-3"><div className="flex flex-wrap items-center gap-2"><label className="flex items-center gap-2 text-xs text-slate-600">Mostrar <select value={porPagina || 'all'} onChange={(e) => setPorPagina(e.target.value === 'all' ? 0 : Number(e.target.value))} className="rounded border px-2 py-1.5 text-xs"><option value={10}>10</option><option value={25}>25</option><option value={50}>50</option><option value={100}>100</option><option value="all">Todas</option></select> entradas</label><button type="button" onClick={() => exportarGrupos('csv')} className="rounded border px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50">Exportar a CSV</button><button type="button" onClick={() => exportarGrupos('xlsx')} className="rounded border px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50">Exportar a Excel</button><button type="button" onClick={() => window.print()} className="inline-flex items-center gap-1 rounded border px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"><Printer size={13}/> Imprimir</button><div className="relative"><button type="button" onClick={() => setMostrarColumnas((v) => !v)} className="rounded border px-2.5 py-1.5 text-xs font-semibold text-slate-600">Visibilidad de columnas</button>{mostrarColumnas && <div className="absolute z-20 mt-1 min-w-48 rounded-lg border bg-white p-2 shadow-lg">{[['descripcion','Descripción'],['margen','Margen por defecto'],['estado','Estado']].map(([key,label]) => <label key={key} className="flex items-center gap-2 p-1.5 text-xs"><input type="checkbox" checked={columnas[key]} onChange={(e) => setColumnas((c) => ({ ...c, [key]: e.target.checked }))}/>{label}</label>)}</div>}</div><button type="button" onClick={exportarPDF} className="rounded border px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50">Exportar a PDF</button></div><label className="flex items-center gap-2 rounded-lg border px-3"><Search size={15} className="text-slate-400"/><input value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Buscar..." className="w-48 border-0 py-2 text-sm outline-none"/></label></div>
      <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="p-3"><button type="button" onClick={() => cambiarOrden('nombre')}>Nombre {orden.columna === 'nombre' ? (orden.direccion === 'asc' ? '↑' : '↓') : ''}</button></th>{columnas.descripcion && <th className="p-3"><button type="button" onClick={() => cambiarOrden('descripcion')}>Descripción {orden.columna === 'descripcion' ? (orden.direccion === 'asc' ? '↑' : '↓') : ''}</button></th>}{columnas.margen && <th className="p-3"><button type="button" onClick={() => cambiarOrden('margen')}>Margen por defecto (%) {orden.columna === 'margen' ? (orden.direccion === 'asc' ? '↑' : '↓') : ''}</button></th>}{columnas.estado && <th className="p-3"><button type="button" onClick={() => cambiarOrden('activo')}>Estado {orden.columna === 'activo' ? (orden.direccion === 'asc' ? '↑' : '↓') : ''}</button></th>}<th className="p-3">Acción</th></tr></thead><tbody className="divide-y">{cargando ? <tr><td colSpan={2 + Number(columnas.descripcion) + Number(columnas.margen) + Number(columnas.estado)} className="p-8 text-center text-slate-400">Cargando grupos...</td></tr> : visibles.length ? visibles.map((g) => <tr key={g.id} className={`hover:bg-slate-50 ${!g.activo ? 'opacity-60' : ''}`}><td className="p-3 font-medium text-slate-800">{g.nombre}</td>{columnas.descripcion && <td className="p-3 text-slate-600">{g.descripcion || '—'}</td>}{columnas.margen && <td className="p-3 text-slate-600">{Number(g.margen_default || 0)}%</td>}{columnas.estado && <td className="p-3"><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${g.activo ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>{g.activo ? 'Activo' : 'Inactivo'}</span></td>}<td className="p-3"><div className="flex flex-wrap gap-2"><button type="button" onClick={() => abrirEditar(g)} className="inline-flex items-center gap-1 rounded bg-orange-500 px-3 py-1.5 text-xs font-bold text-white hover:bg-orange-600"><Pencil size={13}/> Editar</button><button type="button" onClick={() => borrar(g)} className="rounded bg-rose-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-rose-700">Borrar</button><button type="button" onClick={() => alternarActivo(g)} className="rounded bg-slate-700 px-3 py-1.5 text-xs font-bold text-white hover:bg-slate-800">{g.activo ? 'Desactivar' : 'Activar'}</button></div></td></tr>) : <tr><td colSpan={2 + Number(columnas.descripcion) + Number(columnas.margen) + Number(columnas.estado)} className="p-8 text-center text-slate-400">{grupos.length ? 'No hay resultados para esta búsqueda.' : 'No hay grupos de precios registrados.'}</td></tr>}</tbody></table></div><div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-xs font-semibold text-slate-500"><span>Mostrando {visibles.length ? (paginaSegura - 1) * porPagina + 1 : 0} a {(paginaSegura - 1) * porPagina + visibles.length} de {filtrados.length} entradas</span><div className="flex items-center gap-2"><button type="button" disabled={paginaSegura <= 1} onClick={() => setPagina((p) => p - 1)} className="rounded border px-3 py-1.5 disabled:opacity-40">Anterior</button><span>{paginaSegura} / {paginas}</span><button type="button" disabled={paginaSegura >= paginas} onClick={() => setPagina((p) => p + 1)} className="rounded border px-3 py-1.5 disabled:opacity-40">Siguiente</button></div></div></div></section>

    {modalAbierto && <div className="fixed inset-0 z-[90] grid place-items-center overflow-y-auto bg-slate-950/50 p-3"><form onSubmit={guardar} className="my-auto w-full max-w-xl overflow-hidden rounded-2xl bg-white shadow-2xl"><div className="flex items-center justify-between bg-[#5b4fcf] px-5 py-4"><h2 className="text-lg font-bold text-white">{editando ? 'Editar grupo de precios de venta' : 'Agregar grupo de precios de venta'}</h2><button type="button" aria-label="Cerrar" onClick={() => setModalAbierto(false)} className="text-xl text-white/80 hover:text-white"><X size={20}/></button></div><div className="space-y-4 p-6"><label className="block text-sm font-bold text-slate-700">Nombre:*<input required autoFocus value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Nombre" className="mt-1 w-full rounded border border-slate-300 px-3 py-2.5 text-sm font-normal"/></label><label className="block text-sm font-bold text-slate-700">Descripción:<textarea value={descripcion} onChange={(e) => setDescripcion(e.target.value)} placeholder="Descripción" rows={3} className="mt-1 w-full resize-y rounded border border-slate-300 px-3 py-2.5 text-sm font-normal"/></label><label className="block text-sm font-bold text-slate-700">Margen por defecto (%):<div className="mt-1 flex overflow-hidden rounded border border-slate-300"><input type="number" min="0" max="10000" step="0.01" value={margen} onChange={(e) => setMargen(e.target.value)} placeholder="Ej.: 25" className="w-full px-3 py-2.5 text-sm font-normal outline-none"/><span className="border-l bg-slate-50 px-3 py-2.5">%</span></div><small className="mt-1 block font-normal text-slate-500">Porcentaje de ganancia aplicado al cargar un producto nuevo. Se puede cambiar por producto.</small></label>{error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}</div><div className="flex justify-end gap-2 border-t bg-slate-50 px-5 py-4"><button type="submit" disabled={guardando} className="inline-flex items-center gap-2 rounded-lg bg-orange-500 px-5 py-2.5 text-sm font-bold text-white disabled:opacity-60">{guardando && <LoaderCircle size={15} className="animate-spin"/>}{guardando ? 'Guardando...' : 'Guardar'}</button><button type="button" onClick={() => setModalAbierto(false)} className="rounded-lg border border-slate-300 bg-white px-5 py-2.5 text-sm font-bold text-slate-600">Cerrar</button></div></form></div>}
  </div>;
}
