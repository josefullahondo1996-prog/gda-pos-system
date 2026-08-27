import { useEffect, useMemo, useState } from 'react';
import { FileSpreadsheet, FileText, Filter, Printer, RefreshCw, Settings } from 'lucide-react';
import { supabase } from './supabaseClient';
import { useEmpresaInfo } from './utils/useEmpresa';
import { useUbicacionUsuario } from './utils/useUbicacion';
import { useLanguage } from './LanguageContext';

const SIN_VENDEDOR = 'Sin vendedor';
const formatGs = (valor) => `${Math.round(Number(valor) || 0).toLocaleString('es-PY')} Gs`;
const formatFecha = (fecha) => fecha ? `${new Date(fecha).toLocaleDateString('es-PY')} ${new Date(fecha).toLocaleTimeString('es-PY', { hour: '2-digit', minute: '2-digit' })}` : '—';
const estadoNormalizado = (estado) => String(estado || '').toLowerCase();

export default function VendedoresComisiones() {
  const { t } = useLanguage();
  const { id: empresaId } = useEmpresaInfo();
  const { id: ubicacionUsuarioId, ve_todas: usuarioVeTodas } = useUbicacionUsuario();
  const [ventas, setVentas] = useState([]);
  const [gastos, setGastos] = useState([]);
  const [usuarios, setUsuarios] = useState([]);
  const [ubicaciones, setUbicaciones] = useState([]);
  const [fechaInicio, setFechaInicio] = useState(() => new Date().toISOString().slice(0, 10));
  const [fechaFin, setFechaFin] = useState(() => new Date().toISOString().slice(0, 10));
  const [vendedorFiltro, setVendedorFiltro] = useState('Todos');
  const [ubicacionFiltro, setUbicacionFiltro] = useState('');
  const [pestana, setPestana] = useState('ventas');
  const [buscar, setBuscar] = useState('');
  const [porPagina, setPorPagina] = useState(25);
  const [pagina, setPagina] = useState(1);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [mostrarColumnas, setMostrarColumnas] = useState(false);

  const cargarDatos = async () => {
    if (!empresaId) return;
    setCargando(true);
    setError('');
    const [ventasResult, gastosResult, usuariosResult, ubicacionesResult] = await Promise.all([
      supabase.from('ventas').select('*').eq('empresa_id', empresaId).order('fecha', { ascending: false }),
      supabase.from('gastos').select('*').eq('empresa_id', empresaId).order('fecha', { ascending: false }),
      supabase.from('usuarios').select('id, nombre, apellido, comision_ventas, activo').eq('empresa_id', empresaId).order('nombre'),
      supabase.from('ubicaciones_comerciales').select('id, nombre').eq('empresa_id', empresaId).order('nombre'),
    ]);
    if (ventasResult.error) {
      setVentas([]);
      setError('No se pudieron cargar las ventas. Aplicá la migración de vendedores en Supabase y volvé a actualizar.');
    } else setVentas(ventasResult.data || []);
    setGastos(gastosResult.data || []);
    setUsuarios(usuariosResult.data || []);
    setUbicaciones(ubicacionesResult.data || []);
    setCargando(false);
  };

  useEffect(() => { cargarDatos(); }, [empresaId]);
  useEffect(() => {
    if (!usuarioVeTodas && ubicacionUsuarioId) setUbicacionFiltro(ubicacionUsuarioId);
  }, [usuarioVeTodas, ubicacionUsuarioId]);
  useEffect(() => { setPagina(1); }, [fechaInicio, fechaFin, vendedorFiltro, ubicacionFiltro, pestana, buscar, porPagina]);

  const nombresUsuarios = useMemo(() => {
    const mapa = new Map();
    usuarios.forEach((usuario) => {
      const nombre = [usuario.nombre, usuario.apellido].filter(Boolean).join(' ').trim();
      if (nombre) mapa.set(nombre, usuario);
      if (usuario.nombre) mapa.set(usuario.nombre, usuario);
    });
    return mapa;
  }, [usuarios]);

  const nombreUbicacion = (id) => ubicaciones.find((ubicacion) => String(ubicacion.id) === String(id))?.nombre || '—';
  const fechaEnRango = (fecha) => {
    if (!fecha) return false;
    const actual = new Date(fecha);
    if (fechaInicio && actual < new Date(`${fechaInicio}T00:00:00`)) return false;
    if (fechaFin && actual > new Date(`${fechaFin}T23:59:59.999`)) return false;
    return true;
  };

  const ventasRango = useMemo(() => ventas.filter((venta) => {
    if (!fechaEnRango(venta.fecha)) return false;
    if (ubicacionFiltro && String(venta.ubicacion_id) !== String(ubicacionFiltro)) return false;
    const vendedor = venta.personal_servicio || venta.usuario_nombre || SIN_VENDEDOR;
    return vendedorFiltro === 'Todos' || vendedor === vendedorFiltro;
  }), [ventas, fechaInicio, fechaFin, ubicacionFiltro, vendedorFiltro]);

  const ventasValidas = ventasRango.filter((venta) => !['anulada', 'devuelta', 'cotizacion'].includes(estadoNormalizado(venta.estado_pago)));
  const devoluciones = ventasRango.filter((venta) => ['anulada', 'devuelta'].includes(estadoNormalizado(venta.estado_pago)));
  const gastosRango = gastos.filter((gasto) => fechaEnRango(gasto.fecha) && (!ubicacionFiltro || String(gasto.ubicacion_id) === String(ubicacionFiltro)));

  const filasComisiones = useMemo(() => {
    const acumuladas = {};
    ventasValidas.forEach((venta) => {
      const nombre = venta.personal_servicio || venta.usuario_nombre || SIN_VENDEDOR;
      const usuario = nombresUsuarios.get(nombre);
      if (!acumuladas[nombre]) acumuladas[nombre] = { nombre, ventas: 0, total: 0, cobrado: 0, porcentaje: Number(usuario?.comision_ventas || 0) };
      acumuladas[nombre].ventas += 1;
      acumuladas[nombre].total += Number(venta.total || 0);
      acumuladas[nombre].cobrado += Number(venta.monto_pagado || 0);
    });
    return Object.values(acumuladas).map((fila) => ({ ...fila, comision: fila.total * fila.porcentaje / 100 })).sort((a, b) => b.total - a.total);
  }, [ventasValidas, nombresUsuarios]);

  const vendedores = [...new Set([...usuarios.map((usuario) => [usuario.nombre, usuario.apellido].filter(Boolean).join(' ').trim()).filter(Boolean), ...ventas.map((venta) => venta.personal_servicio || venta.usuario_nombre).filter(Boolean)])].sort((a, b) => a.localeCompare(b, 'es'));
  const ventasTexto = ventasValidas.filter((venta) => `${venta.id} ${venta.cliente || ''} ${venta.personal_servicio || ''} ${venta.usuario_nombre || ''} ${venta.estado_pago || ''}`.toLowerCase().includes(buscar.toLowerCase()));
  const gastosTexto = gastosRango.filter((gasto) => `${gasto.descripcion || ''} ${gasto.categoria || ''}`.toLowerCase().includes(buscar.toLowerCase()));
  const filasTabla = pestana === 'comisiones' ? filasComisiones : pestana === 'gastos' ? gastosTexto : ventasTexto;
  const totalPaginas = Math.max(1, Math.ceil(filasTabla.length / porPagina));
  const paginaSegura = Math.min(pagina, totalPaginas);
  const filasPagina = filasTabla.slice((paginaSegura - 1) * porPagina, paginaSegura * porPagina);

  const totalVentas = ventasValidas.reduce((total, venta) => total + Number(venta.total || 0), 0);
  const totalDevoluciones = devoluciones.reduce((total, venta) => total + Number(venta.total || 0), 0);
  const totalGastos = gastosRango.reduce((total, gasto) => total + Number(gasto.monto || 0), 0);
  const totalComisiones = filasComisiones.reduce((total, fila) => total + fila.comision, 0);

  const claseEstado = (estado) => {
    const valor = estadoNormalizado(estado);
    if (valor.includes('contado') || valor.includes('pagado')) return 'bg-lime-400 text-white';
    if (valor.includes('credito') || valor.includes('crédito')) return 'bg-amber-400 text-white';
    if (valor.includes('parcial')) return 'bg-cyan-500 text-white';
    if (valor.includes('anulada') || valor.includes('devuelta')) return 'bg-rose-500 text-white';
    return 'bg-slate-400 text-white';
  };

  const exportarCSV = (formato = 'csv') => {
    const encabezados = pestana === 'comisiones' ? ['Vendedor', 'Ventas', 'Total vendido', 'Cobrado', '% comisión', 'Comisión'] : pestana === 'gastos' ? ['Fecha', 'Descripción', 'Categoría', 'Monto'] : ['Fecha', 'Venta', 'Vendedor', 'Cliente', 'Ubicación', 'Estado', 'Total', 'Pagado', 'Saldo'];
    const datos = pestana === 'comisiones' ? filasComisiones.map((fila) => [fila.nombre, fila.ventas, fila.total, fila.cobrado, fila.porcentaje, fila.comision]) : pestana === 'gastos' ? gastosTexto.map((gasto) => [formatFecha(gasto.fecha), gasto.descripcion || '', gasto.categoria || '', gasto.monto || 0]) : ventasTexto.map((venta) => [formatFecha(venta.fecha), venta.id, venta.personal_servicio || venta.usuario_nombre || SIN_VENDEDOR, venta.cliente || 'Cliente ocasional', nombreUbicacion(venta.ubicacion_id), venta.estado_pago || '', venta.total || 0, venta.monto_pagado || 0, venta.saldo_pendiente || 0]);
    const contenido = [encabezados, ...datos].map((fila) => fila.map((valor) => `"${String(valor).replaceAll('"', '""')}"`).join(',')).join('\n');
    const tipo = formato === 'excel' ? 'application/vnd.ms-excel;charset=utf-8' : 'text/csv;charset=utf-8';
    const extension = formato === 'excel' ? 'xls' : 'csv';
    const url = URL.createObjectURL(new Blob([contenido], { type: tipo }));
    const enlace = document.createElement('a'); enlace.href = url; enlace.download = `vendedores-${pestana}-${new Date().toISOString().slice(0, 10)}.${extension}`; enlace.click(); URL.revokeObjectURL(url);
  };

  if (cargando) return <div className="p-10 text-center text-orange-500 font-bold">{t('loadingSellers')}</div>;
  return (
    <div className="mx-auto max-w-[1240px] text-[12px] text-slate-700">
      <h2 className="mb-5 text-[24px] font-bold tracking-tight text-slate-900">{t('sellersCommissions')}</h2>

      <section className="mb-6 overflow-hidden rounded-[10px] border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center gap-1 border-b border-slate-200 bg-slate-50 px-5 py-3 font-bold text-sky-600"><Filter size={15} fill="currentColor" /> {t('filters')}</div>
        <div className="grid grid-cols-1 gap-5 px-5 py-5 md:grid-cols-3">
          <label className="font-bold text-slate-800">Usuario:
            <select value={vendedorFiltro === 'Todos' ? 'Todos los usuarios' : vendedorFiltro} onChange={(e) => setVendedorFiltro(e.target.value === 'Todos los usuarios' ? 'Todos' : e.target.value)} className="mt-2 h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-[14px] font-normal text-slate-600 outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-100"><option>Todos los usuarios</option>{vendedores.map((vendedor) => <option key={vendedor}>{vendedor}</option>)}</select>
          </label>
          <label className="font-bold text-slate-800">Ubicación comercial:
            <select value={ubicacionFiltro} disabled={!usuarioVeTodas} onChange={(e) => setUbicacionFiltro(e.target.value)} className="mt-2 h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-[14px] font-normal text-slate-600 outline-none disabled:bg-slate-50"><option value="">Todas las localizaciones</option>{ubicaciones.map((ubicacion) => <option key={ubicacion.id} value={ubicacion.id}>{ubicacion.nombre}</option>)}</select>
          </label>
          <div className="font-bold text-slate-800">Rango de fechas:
            <div className="mt-2 grid grid-cols-2 overflow-hidden rounded-md border border-slate-200 bg-white text-[13px] font-normal">
              <input aria-label="Fecha desde" type="date" value={fechaInicio} onChange={(e) => setFechaInicio(e.target.value)} className="h-10 min-w-0 border-0 border-r border-slate-200 px-2 text-slate-600 outline-none" />
              <input aria-label="Fecha hasta" type="date" value={fechaFin} onChange={(e) => setFechaFin(e.target.value)} className="h-10 min-w-0 border-0 px-2 text-slate-600 outline-none" />
            </div>
          </div>
        </div>
      </section>
      {error && <div className="mb-4 p-3 rounded border border-red-200 bg-red-50 text-red-700">{error}</div>}
      <section className="mb-6 overflow-hidden rounded-[10px] border border-slate-200 bg-white shadow-sm"><div className="border-b border-slate-200 bg-slate-50 px-5 py-3 font-bold text-slate-800">Resumen</div><div className="space-y-3 px-5 py-6 text-[18px] text-slate-500"><p>Venta total - Total de devolución de ventas: <span className="font-medium">{formatGs(totalVentas)} - {formatGs(totalDevoluciones)} = {formatGs(totalVentas - totalDevoluciones)}</span></p><p>Gasto total: <span className="font-medium">{formatGs(totalGastos)}</span></p><p className="text-[13px]">Comisiones estimadas: <span className="font-bold text-orange-600">{formatGs(totalComisiones)}</span></p></div></section>

      <section className="overflow-hidden rounded-t-[8px] border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-wrap border-b border-slate-100">{[['ventas', 'Ventas agregadas'], ['comisiones', 'Ventas con comisión'], ['gastos', 'Gastos']].map(([clave, texto]) => <button key={clave} onClick={() => setPestana(clave)} className={`flex items-center gap-1.5 border-b-2 px-4 py-3 text-[15px] font-bold ${pestana === clave ? 'border-sky-500 text-slate-800' : 'border-transparent text-slate-700'}`}><Settings size={14} fill="currentColor" /> {texto}</button>)}</div>
        <div className="flex flex-wrap items-center justify-between gap-3 px-3 py-3">
          <label className="flex items-center gap-2 text-slate-600">Mostrar <select value={porPagina} onChange={(e) => setPorPagina(Number(e.target.value))} className="h-9 rounded border border-slate-200 bg-white px-2 outline-none"><option value="25">25</option><option value="50">50</option><option value="100">100</option></select> entradas</label>
          <div className="flex flex-1 flex-wrap items-center justify-end gap-1.5"><button onClick={exportarCSV} className="flex items-center gap-1 rounded border border-slate-200 bg-slate-50 px-2.5 py-1.5 font-medium text-slate-600"><FileSpreadsheet size={13} /> Exportar a CSV</button><button onClick={() => exportarCSV('excel')} className="flex items-center gap-1 rounded border border-slate-200 bg-slate-50 px-2.5 py-1.5 font-medium text-slate-600"><FileSpreadsheet size={13} /> Exportar a Excel</button><button onClick={() => window.print()} className="flex items-center gap-1 rounded border border-slate-200 bg-slate-50 px-2.5 py-1.5 font-medium text-slate-600"><Printer size={13} /> Imprimir</button><button onClick={() => setMostrarColumnas((actual) => !actual)} className={`flex items-center gap-1 rounded border px-2.5 py-1.5 font-medium ${mostrarColumnas ? 'border-sky-300 bg-sky-50 text-sky-700' : 'border-slate-200 bg-slate-50 text-slate-600'}`}><Settings size={13} /> Visibilidad de columnas</button><button onClick={() => window.print()} className="flex items-center gap-1 rounded border border-slate-200 bg-slate-50 px-2.5 py-1.5 font-medium text-slate-600"><FileText size={13} /> Exportar a PDF</button><button onClick={cargarDatos} title="Actualizar datos" className="rounded border border-slate-200 bg-white p-1.5 text-slate-500"><RefreshCw size={14} /></button><input value={buscar} onChange={(e) => setBuscar(e.target.value)} placeholder="Buscar ..." className="h-9 w-40 rounded-full border border-slate-200 px-3 text-[13px] outline-none focus:border-sky-400" /></div>
        </div>
        {mostrarColumnas && <div className="border-t border-slate-100 px-4 py-2 text-[11px] text-slate-500">La tabla muestra las columnas principales del informe. Podés desplazarte horizontalmente en pantallas pequeñas.</div>}

        <div className="overflow-x-auto border-t border-slate-100">{pestana === 'comisiones' ? <table className="w-full min-w-[700px] text-[13px]"><thead className="bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500"><tr><th className="p-3 text-left">Vendedor</th><th className="p-3">Ventas</th><th className="p-3 text-right">Total vendido</th><th className="p-3 text-right">Total pagado</th><th className="p-3">% comisión</th><th className="p-3 text-right">Comisión</th></tr></thead><tbody className="divide-y divide-slate-100">{filasPagina.map((fila) => <tr key={fila.nombre}><td className="p-3 font-semibold">{fila.nombre}</td><td className="p-3 text-center">{fila.ventas}</td><td className="p-3 text-right">{formatGs(fila.total)}</td><td className="p-3 text-right">{formatGs(fila.cobrado)}</td><td className="p-3 text-center">{fila.porcentaje.toFixed(2)}%</td><td className="p-3 text-right font-bold text-orange-600">{formatGs(fila.comision)}</td></tr>)}</tbody></table> : pestana === 'gastos' ? <table className="w-full min-w-[600px] text-[13px]"><thead className="bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500"><tr><th className="p-3 text-left">Fecha</th><th className="p-3 text-left">Descripción</th><th className="p-3 text-left">Categoría</th><th className="p-3 text-right">Monto</th></tr></thead><tbody className="divide-y divide-slate-100">{filasPagina.map((gasto) => <tr key={gasto.id}><td className="p-3">{formatFecha(gasto.fecha)}</td><td className="p-3">{gasto.descripcion || '—'}</td><td className="p-3">{gasto.categoria || '—'}</td><td className="p-3 text-right font-bold">{formatGs(gasto.monto)}</td></tr>)}</tbody></table> : <table className="w-full min-w-[920px] text-[13px]"><thead className="bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500"><tr><th className="p-3 text-left">Fecha</th><th className="p-3 text-left">Factura<br />N°</th><th className="p-3 text-left">Nombre del<br />cliente</th><th className="p-3 text-left">Ubicación</th><th className="p-3 text-left">Estado de<br />pago</th><th className="p-3 text-right">Cantidad<br />total</th><th className="p-3 text-right">Total<br />pagado</th><th className="p-3 text-right">Total<br />restante</th></tr></thead><tbody className="divide-y divide-slate-100">{filasPagina.map((venta) => <tr key={venta.id} className="hover:bg-slate-50"><td className="p-3 whitespace-nowrap">{formatFecha(venta.fecha)}</td><td className="p-3 font-medium">{String(venta.id).slice(0, 8)}</td><td className="p-3 font-medium">{venta.cliente || 'Cliente ocasional'}</td><td className="p-3">{nombreUbicacion(venta.ubicacion_id)}</td><td className="p-3"><span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold ${claseEstado(venta.estado_pago)}`}>{venta.estado_pago || '—'}</span></td><td className="p-3 text-right font-medium">{formatGs(venta.total)}</td><td className="p-3 text-right font-medium">{formatGs(venta.monto_pagado)}</td><td className="p-3 text-right font-medium">{formatGs(venta.saldo_pendiente)}</td></tr>)}</tbody><tfoot className="bg-slate-300 font-bold text-slate-800"><tr><td className="p-4 text-right" colSpan="5">Total:</td><td className="p-4 text-right">{formatGs(totalVentas)}</td><td className="p-4 text-right">{formatGs(ventasValidas.reduce((total, venta) => total + Number(venta.monto_pagado || 0), 0))}</td><td className="p-4 text-right">{formatGs(ventasValidas.reduce((total, venta) => total + Number(venta.saldo_pendiente || 0), 0))}</td></tr></tfoot></table>}{filasPagina.length === 0 && <div className="p-8 text-center text-slate-400">No hay datos para los filtros seleccionados.</div>}</div>
        <div className="flex items-center justify-between gap-3 border-t border-slate-100 px-3 py-4 text-slate-500"><span>Mostrando {filasPagina.length === 0 ? 0 : (paginaSegura - 1) * porPagina + 1} a {Math.min(paginaSegura * porPagina, filasTabla.length)} de {filasTabla.length} entradas</span><div className="flex overflow-hidden rounded border border-slate-200"><button disabled={paginaSegura === 1} onClick={() => setPagina((actual) => actual - 1)} className="border-r border-slate-200 bg-white px-3 py-1.5 disabled:opacity-40">Anterior</button><span className="bg-sky-600 px-3 py-1.5 font-bold text-white">{paginaSegura}</span><button disabled={paginaSegura === totalPaginas} onClick={() => setPagina((actual) => actual + 1)} className="border-l border-slate-200 bg-white px-3 py-1.5 disabled:opacity-40">Siguiente</button></div></div>
      </section>
    </div>
  );
}
