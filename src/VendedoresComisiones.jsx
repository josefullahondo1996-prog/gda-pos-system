import { useEffect, useMemo, useState } from 'react';
import { Download, FileSpreadsheet, Filter, Printer, RefreshCw, Settings, Users } from 'lucide-react';
import { supabase } from './supabaseClient';
import { useEmpresaInfo } from './utils/useEmpresa';
import { useUbicacionUsuario } from './utils/useUbicacion';

const SIN_VENDEDOR = 'Sin vendedor';
const formatGs = (valor) => `${Math.round(Number(valor) || 0).toLocaleString('es-PY')} Gs`;
const formatFecha = (fecha) => fecha ? `${new Date(fecha).toLocaleDateString('es-PY')} ${new Date(fecha).toLocaleTimeString('es-PY', { hour: '2-digit', minute: '2-digit' })}` : '—';
const estadoNormalizado = (estado) => String(estado || '').toLowerCase();

export default function VendedoresComisiones() {
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

  const exportarCSV = () => {
    const encabezados = pestana === 'comisiones' ? ['Vendedor', 'Ventas', 'Total vendido', 'Cobrado', '% comisión', 'Comisión'] : pestana === 'gastos' ? ['Fecha', 'Descripción', 'Categoría', 'Monto'] : ['Fecha', 'Venta', 'Vendedor', 'Cliente', 'Ubicación', 'Estado', 'Total', 'Pagado', 'Saldo'];
    const datos = pestana === 'comisiones' ? filasComisiones.map((fila) => [fila.nombre, fila.ventas, fila.total, fila.cobrado, fila.porcentaje, fila.comision]) : pestana === 'gastos' ? gastosTexto.map((gasto) => [formatFecha(gasto.fecha), gasto.descripcion || '', gasto.categoria || '', gasto.monto || 0]) : ventasTexto.map((venta) => [formatFecha(venta.fecha), venta.id, venta.personal_servicio || venta.usuario_nombre || SIN_VENDEDOR, venta.cliente || 'Cliente ocasional', nombreUbicacion(venta.ubicacion_id), venta.estado_pago || '', venta.total || 0, venta.monto_pagado || 0, venta.saldo_pendiente || 0]);
    const contenido = [encabezados, ...datos].map((fila) => fila.map((valor) => `"${String(valor).replaceAll('"', '""')}"`).join(',')).join('\n');
    const url = URL.createObjectURL(new Blob([contenido], { type: 'text/csv;charset=utf-8' }));
    const enlace = document.createElement('a'); enlace.href = url; enlace.download = `vendedores-${pestana}-${new Date().toISOString().slice(0, 10)}.csv`; enlace.click(); URL.revokeObjectURL(url);
  };

  if (cargando) return <div className="p-10 text-center text-orange-500 font-bold">Cargando vendedores y comisiones...</div>;
  return (
    <div className="text-[11px] text-gray-700 max-w-[1180px] mx-auto">
      <h2 className="text-2xl font-bold text-gray-800 mb-4 flex items-center gap-2"><Users size={22} className="text-blue-600" /> Vendedores / Comisiones</h2>
      <section className="bg-white border border-gray-200 rounded-lg mb-4 overflow-hidden"><div className="px-4 py-2 bg-gray-50 border-b border-gray-200 font-bold flex items-center gap-2"><Filter size={14} className="text-blue-500" /> Filtros</div><div className="p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3"><label className="font-bold">Usuario<select value={vendedorFiltro === 'Todos' ? 'Todos los usuarios' : vendedorFiltro} onChange={(e) => setVendedorFiltro(e.target.value === 'Todos los usuarios' ? 'Todos' : e.target.value)} className="mt-1 w-full border border-gray-200 rounded p-2 font-normal"><option>Todos los usuarios</option>{vendedores.map((vendedor) => <option key={vendedor}>{vendedor}</option>)}</select></label><label className="font-bold">Ubicación comercial<select value={ubicacionFiltro} disabled={!usuarioVeTodas} onChange={(e) => setUbicacionFiltro(e.target.value)} className="mt-1 w-full border border-gray-200 rounded p-2 font-normal"><option value="">Todas las localizaciones</option>{ubicaciones.map((ubicacion) => <option key={ubicacion.id} value={ubicacion.id}>{ubicacion.nombre}</option>)}</select></label><label className="font-bold">Fecha desde<input type="date" value={fechaInicio} onChange={(e) => setFechaInicio(e.target.value)} className="mt-1 w-full border border-gray-200 rounded p-2 font-normal" /></label><label className="font-bold">Fecha hasta<input type="date" value={fechaFin} onChange={(e) => setFechaFin(e.target.value)} className="mt-1 w-full border border-gray-200 rounded p-2 font-normal" /></label></div></section>
      {error && <div className="mb-4 p-3 rounded border border-red-200 bg-red-50 text-red-700">{error}</div>}
      <section className="bg-white border border-gray-200 rounded-lg mb-4 overflow-hidden"><div className="px-4 py-2 bg-gray-50 border-b border-gray-200 font-bold">Resumen</div><div className="p-4 space-y-2 text-gray-600">Venta total - Total de devolución de ventas: <b>{formatGs(totalVentas)} - {formatGs(totalDevoluciones)} = {formatGs(totalVentas - totalDevoluciones)}</b><br />Gasto total: <b>{formatGs(totalGastos)}</b><br />Comisiones estimadas: <b className="text-orange-600">{formatGs(totalComisiones)}</b></div></section>
      <div className="flex flex-wrap items-center gap-1 border-b border-gray-200 mb-3">{[['ventas', 'Ventas agregadas'], ['comisiones', 'Ventas con comisión'], ['gastos', 'Gastos']].map(([clave, texto]) => <button key={clave} onClick={() => setPestana(clave)} className={`px-4 py-2 font-bold border-b-2 flex items-center gap-1 ${pestana === clave ? 'border-blue-500 text-gray-800' : 'border-transparent text-gray-500'}`}><Settings size={13} /> {texto}</button>)}</div>
      <div className="flex flex-wrap justify-between items-center gap-2 mb-3"><label className="flex items-center gap-2">Mostrar<select value={porPagina} onChange={(e) => setPorPagina(Number(e.target.value))} className="border rounded p-1"><option value="25">25</option><option value="50">50</option><option value="100">100</option></select> entradas</label><div className="flex gap-1"><button onClick={exportarCSV} className="border rounded px-2 py-1 bg-white flex items-center gap-1"><FileSpreadsheet size={13} /> Exportar a CSV</button><button onClick={() => window.print()} className="border rounded px-2 py-1 bg-white flex items-center gap-1"><Printer size={13} /> Imprimir</button><button onClick={cargarDatos} title="Actualizar" className="border rounded p-1 bg-white"><RefreshCw size={15} /></button><input value={buscar} onChange={(e) => setBuscar(e.target.value)} placeholder="Buscar ..." className="border rounded px-2 py-1 w-36" /></div></div>
      <div className="bg-white border border-gray-200 overflow-x-auto">{pestana === 'comisiones' ? <table className="w-full min-w-[700px]"><thead className="bg-gray-50 uppercase text-[10px]"><tr><th className="p-3 text-left">Vendedor</th><th className="p-3">Ventas</th><th className="p-3">Total vendido</th><th className="p-3">Total pagado</th><th className="p-3">% comisión</th><th className="p-3">Comisión</th></tr></thead><tbody className="divide-y">{filasPagina.map((fila) => <tr key={fila.nombre}><td className="p-3 font-bold">{fila.nombre}</td><td className="p-3 text-center">{fila.ventas}</td><td className="p-3 text-right">{formatGs(fila.total)}</td><td className="p-3 text-right">{formatGs(fila.cobrado)}</td><td className="p-3 text-center">{fila.porcentaje.toFixed(2)}%</td><td className="p-3 text-right font-bold text-orange-600">{formatGs(fila.comision)}</td></tr>)}</tbody></table> : pestana === 'gastos' ? <table className="w-full min-w-[600px]"><thead className="bg-gray-50 uppercase text-[10px]"><tr><th className="p-3 text-left">Fecha</th><th className="p-3 text-left">Descripción</th><th className="p-3 text-left">Categoría</th><th className="p-3 text-right">Monto</th></tr></thead><tbody className="divide-y">{filasPagina.map((gasto) => <tr key={gasto.id}><td className="p-3">{formatFecha(gasto.fecha)}</td><td className="p-3">{gasto.descripcion || '—'}</td><td className="p-3">{gasto.categoria || '—'}</td><td className="p-3 text-right font-bold">{formatGs(gasto.monto)}</td></tr>)}</tbody></table> : <table className="w-full min-w-[1050px]"><thead className="bg-gray-50 uppercase text-[10px]"><tr><th className="p-3 text-left">Fecha</th><th className="p-3 text-left">Venta</th><th className="p-3 text-left">Vendedor</th><th className="p-3 text-left">Nombre del cliente</th><th className="p-3 text-left">Ubicación</th><th className="p-3 text-left">Estado de pago</th><th className="p-3 text-right">Cantidad total</th><th className="p-3 text-right">Total pagado</th><th className="p-3 text-right">Total restante</th></tr></thead><tbody className="divide-y">{filasPagina.map((venta) => <tr key={venta.id} className="hover:bg-gray-50"><td className="p-3">{formatFecha(venta.fecha)}</td><td className="p-3">#{String(venta.id).slice(0, 8)}</td><td className="p-3">{venta.personal_servicio || venta.usuario_nombre || SIN_VENDEDOR}</td><td className="p-3">{venta.cliente || 'Cliente ocasional'}</td><td className="p-3">{nombreUbicacion(venta.ubicacion_id)}</td><td className="p-3">{venta.estado_pago || '—'}</td><td className="p-3 text-right">{formatGs(venta.total)}</td><td className="p-3 text-right">{formatGs(venta.monto_pagado)}</td><td className="p-3 text-right">{formatGs(venta.saldo_pendiente)}</td></tr>)}</tbody></table>}{filasPagina.length === 0 && <div className="p-8 text-center text-gray-400">No hay datos para los filtros seleccionados.</div>}</div>
      <div className="flex justify-between items-center mt-3 text-gray-500"><span>Mostrando {filasPagina.length} de {filasTabla.length} entradas</span><div className="flex gap-1"><button disabled={paginaSegura === 1} onClick={() => setPagina((actual) => actual - 1)} className="border rounded px-2 py-1 disabled:opacity-40">Anterior</button><span className="bg-blue-600 text-white rounded px-2 py-1">{paginaSegura}</span><button disabled={paginaSegura === totalPaginas} onClick={() => setPagina((actual) => actual + 1)} className="border rounded px-2 py-1 disabled:opacity-40">Siguiente</button></div></div>
    </div>
  );
}
