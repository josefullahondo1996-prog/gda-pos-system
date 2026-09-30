import { useMemo, useState } from 'react';
import { AlertCircle, CheckCircle2, FileUp, LoaderCircle, Upload } from 'lucide-react';
import { supabase } from './supabaseClient';
import { useEmpresaInfo } from './utils/useEmpresa';

const normalizar = (valor) => String(valor ?? '').trim().toLocaleLowerCase('es').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[\s-]+/g, '_');

function parsearCSV(texto) {
  const limpio = texto.replace(/^\uFEFF/, '');
  const primeraLinea = limpio.split(/\r?\n/, 1)[0] || '';
  const delimitador = [';', ',', '\t'].sort((a, b) => primeraLinea.split(b).length - primeraLinea.split(a).length)[0];
  const filas = [];
  let fila = [], celda = '', entreComillas = false;
  for (let i = 0; i < limpio.length; i += 1) {
    const caracter = limpio[i];
    if (caracter === '"') {
      if (entreComillas && limpio[i + 1] === '"') { celda += '"'; i += 1; }
      else entreComillas = !entreComillas;
    } else if (caracter === delimitador && !entreComillas) {
      fila.push(celda.trim()); celda = '';
    } else if ((caracter === '\n' || caracter === '\r') && !entreComillas) {
      if (caracter === '\r' && limpio[i + 1] === '\n') i += 1;
      fila.push(celda.trim());
      if (fila.some((valor) => valor !== '')) filas.push(fila);
      fila = []; celda = '';
    } else celda += caracter;
  }
  fila.push(celda.trim());
  if (fila.some((valor) => valor !== '')) filas.push(fila);
  if (filas.length < 2) return { encabezados: [], registros: [], error: 'El CSV debe tener encabezados y al menos una fila de datos.' };
  const encabezados = filas[0].map(normalizar);
  if (encabezados.some((encabezado) => !encabezado) || new Set(encabezados).size !== encabezados.length) {
    return { encabezados: [], registros: [], error: 'Los encabezados están vacíos o repetidos.' };
  }
  return { encabezados, registros: filas.slice(1).map((valores, indice) => ({ numero: indice + 2, datos: Object.fromEntries(encabezados.map((clave, columna) => [clave, valores[columna] ?? ''])) })) };
}

const valor = (datos, ...claves) => {
  for (const clave of claves) if (datos[clave] !== undefined) return String(datos[clave]).trim();
  return '';
};
const numero = (dato) => {
  if (dato === '') return 0;
  let texto = String(dato).replace(/\s/g, '');
  const ultimaComa = texto.lastIndexOf(','), ultimoPunto = texto.lastIndexOf('.');
  if (ultimaComa >= 0 && ultimoPunto >= 0) {
    const decimal = ultimaComa > ultimoPunto ? ',' : '.';
    texto = texto.replace(/[.,]/g, (separador) => separador === decimal ? '.' : '');
  } else if (ultimaComa >= 0) {
    texto = /,\d{1,2}$/.test(texto) ? texto.replace(',', '.') : texto.replaceAll(',', '');
  } else if ((texto.match(/\./g) || []).length > 1 || /\.\d{3}$/.test(texto)) {
    texto = texto.replaceAll('.', '');
  }
  return Number(texto);
};

export default function ImportarDatos({ tipo = 'productos' }) {
  const { id: empresaId } = useEmpresaInfo();
  const [tipoContacto, setTipoContacto] = useState('clientes');
  const esProducto = tipo === 'productos';
  const tipoImportacion = tipo === 'contactos' ? tipoContacto : tipo;
  const [archivo, setArchivo] = useState('');
  const [encabezados, setEncabezados] = useState([]);
  const [registros, setRegistros] = useState([]);
  const [error, setError] = useState('');
  const [resultado, setResultado] = useState(null);
  const [guardando, setGuardando] = useState(false);

  const preparados = useMemo(() => registros.map((registro) => {
    const d = registro.datos;
    const nombre = valor(d, 'nombre', 'producto', 'cliente', 'proveedor', 'nombre_contacto', 'empresa');
    const codigo = valor(d, 'codigo', 'sku', 'codigo_producto');
    const documento = valor(d, 'documento', 'ruc', 'documento_nro', 'cedula');
    const fila = esProducto
      ? { empresa_id: empresaId, nombre, codigo: codigo || null, descripcion: valor(d, 'descripcion', 'detalle') || null, categoria: valor(d, 'categoria') || null, marca: valor(d, 'marca') || null, unidad: valor(d, 'unidad') || 'UNID', precio_compra: numero(valor(d, 'precio_compra', 'costo')), precio_venta: numero(valor(d, 'precio_venta', 'precio')), stock_actual: 0, administra_stock: true }
      : tipoImportacion === 'clientes'
        ? { empresa_id: empresaId, tipo_contacto: 'Clientes', nombre, nombre_empresa: valor(d, 'nombre_empresa', 'empresa') || null, tipo_documento: valor(d, 'tipo_documento') || null, documento_nro: documento || null, celular: valor(d, 'celular', 'telefono', 'telefono_movil') || null, email: valor(d, 'email', 'correo') || null, direccion: valor(d, 'direccion') || null }
        : { empresa_id: empresaId, empresa: valor(d, 'empresa', 'nombre_empresa') || nombre, nombre_contacto: valor(d, 'nombre_contacto', 'nombre', 'proveedor') || nombre, email: valor(d, 'email', 'correo') || null, ruc: valor(d, 'ruc') || null, documento: documento || null, termino_pago: valor(d, 'termino_pago') || null };
    const errores = [];
    if (!nombre) errores.push('Falta el nombre.');
    if (esProducto && !Number.isFinite(fila.precio_compra + fila.precio_venta)) errores.push('Los precios deben ser números válidos.');
    if (esProducto && (fila.precio_compra < 0 || fila.precio_venta < 0)) errores.push('Los precios no pueden ser negativos.');
    return { numero: registro.numero, fila, errores };
  }), [registros, empresaId, esProducto, tipoImportacion]);

  const leerArchivo = async (event) => {
    const file = event.target.files?.[0];
    setError(''); setResultado(null); setRegistros([]); setEncabezados([]); setArchivo('');
    if (!file) return;
    if (!/\.csv$/i.test(file.name) && !['text/csv', 'application/vnd.ms-excel'].includes(file.type)) { setError('Elegí un archivo CSV.'); return; }
    const parsed = parsearCSV(await file.text());
    if (parsed.error) { setError(parsed.error); return; }
    const requeridos = esProducto ? ['nombre', 'producto'] : ['nombre', 'cliente', 'proveedor', 'nombre_contacto', 'empresa'];
    if (!parsed.encabezados.some((header) => requeridos.includes(header))) {
      setError(`No encuentro una columna de nombre. Encabezados admitidos: nombre, ${esProducto ? 'codigo, categoria, marca, unidad, precio_compra, precio_venta' : 'documento, celular, email, direccion'}.`); return;
    }
    setArchivo(file.name); setEncabezados(parsed.encabezados); setRegistros(parsed.registros);
  };

  const importar = async () => {
    if (!empresaId || !preparados.length) return;
    const validos = preparados.filter((fila) => fila.errores.length === 0);
    if (!validos.length) return setError('No hay filas válidas para importar.');
    setGuardando(true); setError('');
    try {
      const tabla = esProducto ? 'productos' : tipoImportacion === 'clientes' ? 'clientes' : 'proveedores';
      const { data: existentes, error: errorExistentes } = esProducto
        ? await supabase.from(tabla).select('codigo').eq('empresa_id', empresaId)
        : tipoImportacion === 'clientes'
          ? await supabase.from(tabla).select('documento_nro').eq('empresa_id', empresaId)
          : await supabase.from(tabla).select('documento, ruc').eq('empresa_id', empresaId);
      if (errorExistentes) throw errorExistentes;
      const clavesExistentes = new Set((existentes || []).flatMap((fila) => esProducto ? [fila.codigo] : tipoImportacion === 'clientes' ? [fila.documento_nro] : [fila.documento, fila.ruc]).filter(Boolean).map((clave) => String(clave).trim().toLocaleLowerCase('es')));
      const clavesArchivo = new Set();
      const aImportar = [];
      let duplicados = 0;
      for (const item of validos) {
        const clave = esProducto ? item.fila.codigo : tipoImportacion === 'clientes' ? item.fila.documento_nro : (item.fila.documento || item.fila.ruc);
        const normalizada = String(clave || '').trim().toLocaleLowerCase('es');
        if (normalizada && (clavesExistentes.has(normalizada) || clavesArchivo.has(normalizada))) { duplicados += 1; continue; }
        if (normalizada) clavesArchivo.add(normalizada);
        aImportar.push(item);
      }
      let insertados = 0; const fallidos = [];
      for (let inicio = 0; inicio < aImportar.length; inicio += 50) {
        const lote = aImportar.slice(inicio, inicio + 50);
        const { error: errorInsertar } = await supabase.from(tabla).insert(lote.map((item) => item.fila));
        if (errorInsertar) {
          // Reintentar de a una fila para conservar las filas válidas del lote e informar las rechazadas.
          for (let indice = 0; indice < lote.length; indice += 1) {
            const { error: errorFila } = await supabase.from(tabla).insert([lote[indice].fila]);
            if (errorFila) fallidos.push({ fila: lote[indice].numero, motivo: errorFila.message });
            else insertados += 1;
          }
        } else insertados += lote.length;
      }
      setResultado({ insertados, duplicados, invalidos: preparados.filter((fila) => fila.errores.length).length, fallidos });
    } catch (err) { setError(`No se pudo importar: ${err.message}`); }
    finally { setGuardando(false); }
  };

  return <div className="mx-auto max-w-6xl space-y-5">
    <div><p className="text-xs font-bold uppercase tracking-widest text-orange-600">Datos del negocio</p><h1 className="mt-1 text-2xl font-black text-slate-900">Importar {esProducto ? 'productos' : tipoImportacion}</h1><p className="mt-2 text-sm text-slate-500">Carga un CSV, revisa cada fila y confirma la importación. No se modifica el stock existente.</p></div>
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      {tipo === 'contactos' && <label className="mb-4 block max-w-sm text-xs font-bold text-slate-600">Tipo de contacto<select value={tipoContacto} onChange={(event) => { setTipoContacto(event.target.value); setRegistros([]); setResultado(null); }} className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm"><option value="clientes">Clientes</option><option value="proveedores">Proveedores</option></select></label>}
      <label className="flex min-h-40 cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-slate-300 bg-slate-50 p-5 text-center hover:border-orange-400 hover:bg-orange-50/30"><FileUp size={27} className="text-orange-500"/><span className="mt-2 text-sm font-bold text-slate-800">Seleccionar archivo CSV</span><span className="mt-1 text-xs text-slate-500">{archivo || 'Se acepta CSV separado por coma, punto y coma o tabulador.'}</span><input type="file" accept=".csv,text/csv" className="sr-only" onChange={leerArchivo}/></label>
      <p className="mt-3 text-xs text-slate-500">Columnas {esProducto ? 'recomendadas: nombre, codigo, descripcion, categoria, marca, unidad, precio_compra, precio_venta' : 'admitidas: nombre, empresa, documento, ruc, celular, email, direccion, termino_pago'}.</p>
    </section>
    {error && <div role="alert" className="flex gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700"><AlertCircle size={18} className="shrink-0"/>{error}</div>}
    {resultado && <div role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900"><div className="flex items-center gap-2 font-bold"><CheckCircle2 size={18}/>Importación procesada</div><p className="mt-2">Guardados: {resultado.insertados} · Duplicados omitidos: {resultado.duplicados} · Filas inválidas: {resultado.invalidos} · Rechazados por la base: {resultado.fallidos.length}</p>{resultado.fallidos.length > 0 && <ul className="mt-2 max-h-32 list-inside list-disc overflow-auto text-xs">{resultado.fallidos.map((fila) => <li key={`${fila.fila}-${fila.motivo}`}>Fila {fila.fila}: {fila.motivo}</li>)}</ul>}</div>}
    {!!preparados.length && <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm"><div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 p-4"><div><h2 className="font-bold text-slate-900">Vista previa</h2><p className="text-xs text-slate-500">{preparados.length} filas · {encabezados.join(', ')}</p></div><button type="button" onClick={importar} disabled={guardando || !empresaId || !preparados.some((fila) => !fila.errores.length)} className="inline-flex items-center gap-2 rounded-lg bg-orange-500 px-4 py-2.5 text-sm font-bold text-white hover:bg-orange-600 disabled:opacity-50">{guardando ? <><LoaderCircle size={16} className="animate-spin"/>Importando…</> : <><Upload size={16}/>Confirmar importación</>}</button></div><div className="max-h-[55vh] overflow-auto"><table className="w-full min-w-[680px] text-left text-sm"><thead className="sticky top-0 bg-slate-50 text-[10px] uppercase text-slate-500"><tr><th className="px-4 py-3">Fila</th><th className="px-4 py-3">Nombre</th><th className="px-4 py-3">Código / documento</th><th className="px-4 py-3">Estado</th></tr></thead><tbody className="divide-y divide-slate-100">{preparados.map((fila) => <tr key={fila.numero}><td className="px-4 py-2.5 text-slate-500">{fila.numero}</td><td className="px-4 py-2.5 font-medium">{fila.fila.nombre || fila.fila.empresa || '—'}</td><td className="px-4 py-2.5 text-slate-600">{fila.fila.codigo || fila.fila.documento_nro || fila.fila.documento || fila.fila.ruc || '—'}</td><td className="px-4 py-2.5">{fila.errores.length ? <span className="text-red-600">{fila.errores.join(' ')}</span> : <span className="text-emerald-700">Lista para importar</span>}</td></tr>)}</tbody></table></div></section>}
  </div>;
}
