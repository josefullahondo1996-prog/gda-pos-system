import { useEffect, useMemo, useState } from 'react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Wrench } from 'lucide-react';
import Marcas from './Marcas';
import { supabase } from './supabaseClient';
import { useEmpresaInfo } from './utils/useEmpresa';
import { useNotificacion } from './NotificacionContext';

const ESTADOS_OT = [
  'Pendiente',
  'En proceso',
  'Recibido',
  'En diagnóstico',
  'Presupuesto enviado',
  'Aprobado, en trabajo',
  'En reparación',
  'Esperando repuesto',
  'Listo para entregar',
  'Entregado',
  'Listo para retirar',
  'No aprobado / sin reparación',
  'Completado',
  'En reparacion',
];
const ESTADOS_FINALIZADOS = new Set(['Entregado', 'Listo para retirar', 'No aprobado / sin reparación', 'Completado']);

const fechaLocalISO = (fecha) => {
  const d = new Date(fecha);
  if (Number.isNaN(d.getTime())) return '';
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
};

const monedaGs = (valor) => `Gs ${Number(valor || 0).toLocaleString('es-PY')}`;
const MARCADOR_DETALLE_OT = '\n\n[PY_POS_OT_DETALLE]';

const detalleDeOT = (orden) => {
  if (orden?.detalle_ot && typeof orden.detalle_ot === 'object') return orden.detalle_ot;
  const notas = String(orden?.notas || '');
  const posicion = notas.lastIndexOf(MARCADOR_DETALLE_OT);
  if (posicion < 0) return {};
  try { return JSON.parse(notas.slice(posicion + MARCADOR_DETALLE_OT.length)); } catch { return {}; }
};

const notaVisibleOT = (orden) => {
  const notas = String(orden?.notas || '');
  const posicion = notas.lastIndexOf(MARCADOR_DETALLE_OT);
  return posicion < 0 ? notas : notas.slice(0, posicion).trim();
};

const descargarArchivo = (contenido, nombreArchivo, tipo) => {
  const blob = new Blob([contenido], { type: tipo });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nombreArchivo;
  a.click();
  URL.revokeObjectURL(url);
};

const badgeEstado = (estado) => {
  const mapa = {
    Pendiente: 'bg-orange-100 text-orange-700 border border-orange-200',
    Recibido: 'bg-blue-100 text-blue-700 border border-blue-200',
    'En proceso': 'bg-yellow-100 text-yellow-700 border border-yellow-200',
    Entregado: 'bg-gray-200 text-gray-700 border border-gray-300',
    Completado: 'bg-green-100 text-green-700 border border-green-200',
  };
  return mapa[estado] || 'bg-gray-100 text-gray-600 border border-gray-200';
};

export default function OT({ perfilUsuario }) {
  const { id: empresaId, nombre: nombreDelNegocio } = useEmpresaInfo();
  const { notificar, confirmar } = useNotificacion();

  const [subTab, setSubTab] = useState('tablero');

  const [ordenes, setOrdenes] = useState([]);
  const [clientes, setClientes] = useState([]);
  const [ubicaciones, setUbicaciones] = useState([]);
  const [marcasVehiculo, setMarcasVehiculo] = useState([]);
  const [categoriasArticulo, setCategoriasArticulo] = useState([]);
  const [facturas, setFacturas] = useState([]);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    if (empresaId) cargarTodo();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empresaId]);

  const cargarTodo = async () => {
    setCargando(true);
    const [rOrdenes, rClientes, rUbicaciones, rMarcas, rCategorias, rFacturas] = await Promise.all([
      supabase.from('ordenes_trabajo').select('*').eq('empresa_id', empresaId).order('id', { ascending: false }),
      supabase.from('clientes').select('id, nombre, nombre_empresa, celular, email').eq('empresa_id', empresaId).order('nombre'),
      supabase.from('ubicaciones_comerciales').select('id, nombre').eq('empresa_id', empresaId).order('nombre'),
      supabase.from('marcas').select('*').eq('empresa_id', empresaId).order('nombre'),
      supabase.from('categorias_productos').select('*').eq('empresa_id', empresaId).order('nombre'),
      supabase.from('ot_facturas').select('*').eq('empresa_id', empresaId).order('id', { ascending: false }),
    ]);
    setOrdenes(rOrdenes.data || []);
    setClientes(rClientes.data || []);
    setUbicaciones(rUbicaciones.data || []);
    setMarcasVehiculo(rMarcas.data || []);
    setCategoriasArticulo(rCategorias.data || []);
    setFacturas(rFacturas.data || []);
    setCargando(false);
  };

  const tecnicosDisponibles = useMemo(() => {
    const set = new Set(ordenes.map((o) => o.tecnico).filter(Boolean));
    return Array.from(set).sort();
  }, [ordenes]);

  return (
    <div className="p-4 md:p-6">
      <h1 className="text-xl font-bold text-gray-800 mb-1">Órdenes de Trabajo</h1>
      <p className="text-sm text-gray-500 mb-4">Gestión de reparaciones, servicios y trabajos de tu negocio (taller, joyería, relojería, electrónica, etc.).</p>

      {/* Pestañas superiores */}
      <div className="flex flex-wrap gap-0 border-b border-gray-200 mb-5">
        {[
          { key: 'tablero', label: <><Wrench size={16} className="inline-block mr-1.5" />Taller / OT</> },
          { key: 'lista', label: 'Órdenes de trabajo' },
          { key: 'agregar', label: 'Nueva OT' },
          { key: 'facturas', label: 'Listar facturas' },
          { key: 'agregar_factura', label: 'Agregar factura' },
          { key: 'marcas', label: 'Marcas' },
          { key: 'config', label: 'Configuraciones' },
        ].map((t) => (
          <button
            key={t.key}
            onClick={() => setSubTab(t.key)}
            className={`px-4 py-2.5 text-sm font-semibold border-b-2 -mb-px transition-colors ${
              subTab === t.key
                ? 'border-orange-500 text-white bg-orange-500'
                : 'border-transparent text-gray-600 bg-white hover:bg-gray-50 hover:text-gray-800'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {cargando ? (
        <p className="text-sm text-gray-400">Cargando...</p>
      ) : (
        <>
          {subTab === 'lista' && (
            <ListaOT
              ordenes={ordenes}
              clientes={clientes}
              ubicaciones={ubicaciones}
              tecnicos={tecnicosDisponibles}
              nombreDelNegocio={nombreDelNegocio}
              empresaId={empresaId}
              notificar={notificar}
              confirmar={confirmar}
              recargar={cargarTodo}
              irAAgregar={() => setSubTab('agregar')}
            />
          )}

          {subTab === 'tablero' && (
            <TableroOT
              ordenes={ordenes}
              facturas={facturas}
              clientes={clientes}
              empresaId={empresaId}
              irALista={() => setSubTab('lista')}
            />
          )}

          {subTab === 'agregar' && (
            <AgregarHojaDeTrabajo
              clientes={clientes}
              ubicaciones={ubicaciones}
              marcasVehiculo={marcasVehiculo}
              categoriasArticulo={categoriasArticulo}
              tecnicos={tecnicosDisponibles}
              empresaId={empresaId}
              notificar={notificar}
              onGuardado={() => { recargarYVolver(); }}
            />
          )}

          {subTab === 'facturas' && (
            <ListarFacturas
              facturas={facturas}
              ordenes={ordenes}
              nombreDelNegocio={nombreDelNegocio}
              notificar={notificar}
              confirmar={confirmar}
              empresaId={empresaId}
              recargar={cargarTodo}
            />
          )}

          {subTab === 'agregar_factura' && (
            <AgregarFactura
              ordenes={ordenes}
              empresaId={empresaId}
              notificar={notificar}
              onGuardado={() => { cargarTodo(); setSubTab('facturas'); }}
            />
          )}

          {subTab === 'marcas' && (
            <Marcas />
          )}

          {subTab === 'config' && <ConfiguracionOT empresaId={empresaId} notificar={notificar} />}
        </>
      )}
    </div>
  );

  function recargarYVolver() {
    cargarTodo();
    setSubTab('lista');
  }
}

// ============================================================================
// TABLERO DEL TALLER
// ============================================================================
function TableroOT({ ordenes, facturas, clientes, empresaId, irALista }) {
  const hoy = fechaLocalISO(new Date());
  const hace30 = new Date();
  hace30.setDate(hace30.getDate() - 29);
  const [desde, setDesde] = useState(fechaLocalISO(hace30));
  const [hasta, setHasta] = useState(hoy);
  const [periodo, setPeriodo] = useState({ desde: fechaLocalISO(hace30), hasta: hoy });
  const [estadosConfig, setEstadosConfig] = useState([]);
  useEffect(() => {
    supabase.from('empresas').select('configuracion').eq('id', empresaId).maybeSingle().then(({ data }) => {
      const estados = data?.configuracion?.modulos?.ot?.estados;
      if (Array.isArray(estados)) setEstadosConfig(estados);
    });
  }, [empresaId]);

  const dentroDelPeriodo = (fecha, inicio = periodo.desde, fin = periodo.hasta) => {
    if (!fecha) return false;
    const dia = fechaLocalISO(fecha);
    return dia && dia >= inicio && dia <= fin;
  };
  const estadoFinal = (o) => estadosConfig.find((e) => e.nombre === o.estado)?.finalizado ?? ESTADOS_FINALIZADOS.has(o.estado);
  const ordenesPeriodo = ordenes.filter((o) => dentroDelPeriodo(o.fecha_hora || o.creado_en || o.created_at));
  const recibidasHoy = ordenes.filter((o) => dentroDelPeriodo(o.fecha_hora || o.creado_en || o.created_at, hoy, hoy)).length;
  const enTaller = ordenes.filter((o) => !estadoFinal(o)).length;
  const atrasadas = ordenes.filter((o) => {
    const detalle = detalleDeOT(o);
    const prometida = o.fecha_prometida || detalle.fecha_prometida || o.fecha_entrega_prometida || o.fecha_entrega;
    return prometida && fechaLocalISO(prometida) < hoy && !estadoFinal(o);
  }).sort((a, b) => String(a.fecha_prometida || a.fecha_entrega_prometida || a.fecha_entrega).localeCompare(String(b.fecha_prometida || b.fecha_entrega_prometida || b.fecha_entrega)));
  const paraEntregarHoy = ordenes.filter((o) => {
    const fecha = o.fecha_prometida || detalleDeOT(o).fecha_prometida || o.fecha_entrega_prometida || o.fecha_entrega;
    return fecha && fechaLocalISO(fecha) === hoy && !estadoFinal(o);
  });
  const terminadas = ordenesPeriodo.filter(estadoFinal);
  const ordenesConFactura = new Set(facturas.map((f) => String(f.ot_id)).filter((id) => id && id !== 'null'));
  const sinFacturar = terminadas.filter((o) => !o.factura_numero && !ordenesConFactura.has(String(o.id)));
  const facturasPeriodo = facturas.filter((f) => dentroDelPeriodo(f.fecha || f.fecha_hora || f.creado_en || f.created_at));
  const totalFacturado = facturasPeriodo.reduce((suma, f) => suma + (Number(f.monto) || 0), 0);
  const diasCierre = terminadas.map((o) => {
    const inicio = new Date(o.fecha_hora || o.creado_en || o.created_at || '');
    const fin = new Date(o.fecha_salida || detalleDeOT(o).fecha_salida || o.fecha_entrega_real || o.actualizado_en || o.updated_at || '');
    const dias = (fin - inicio) / 86400000;
    return Number.isFinite(dias) && dias >= 0 ? dias : null;
  }).filter((d) => d !== null);
  const promedioDias = diasCierre.length ? (diasCierre.reduce((a, b) => a + b, 0) / diasCierre.length).toFixed(1) : '—';

  const porTecnico = useMemo(() => {
    const grupos = new Map();
    ordenesPeriodo.forEach((o) => {
      const nombre = o.tecnico || 'Sin asignar';
      const grupo = grupos.get(nombre) || { nombre, abiertas: 0, terminadas: 0, facturado: 0 };
      if (estadoFinal(o)) grupo.terminadas += 1;
      else grupo.abiertas += 1;
      grupo.facturado += facturasPeriodo.filter((f) => String(f.ot_id) === String(o.id)).reduce((s, f) => s + (Number(f.monto) || 0), 0);
      grupos.set(nombre, grupo);
    });
    return [...grupos.values()].sort((a, b) => b.abiertas - a.abiertas || a.nombre.localeCompare(b.nombre));
  }, [ordenesPeriodo, facturasPeriodo]);

  const porEstado = useMemo(() => {
    const grupos = new Map();
    ordenesPeriodo.forEach((o) => grupos.set(o.estado || 'Sin estado', (grupos.get(o.estado || 'Sin estado') || 0) + 1));
    return [...grupos.entries()].sort((a, b) => b[1] - a[1]);
  }, [ordenesPeriodo]);

  const porCategoria = useMemo(() => {
    const grupos = new Map();
    ordenesPeriodo.forEach((o) => {
      const nombre = o.categoria_articulo || o.categoria_servicio || o.servicio || 'Sin categoría';
      grupos.set(nombre, (grupos.get(nombre) || 0) + 1);
    });
    return [...grupos.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
  }, [ordenesPeriodo]);

  const aplicarPeriodo = () => {
    if (!desde || !hasta || desde > hasta) return;
    setPeriodo({ desde, hasta });
  };
  const clienteNombre = (o) => o.cliente_nombre || clientes.find((c) => String(c.id) === String(o.cliente_id))?.nombre || 'Cliente ocasional';
  const fechaPrometida = (o) => o.fecha_prometida || detalleDeOT(o).fecha_prometida || o.fecha_entrega_prometida || o.fecha_entrega;
  const card = (label, value, color, note) => (
    <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm min-h-28">
      <p className="text-[11px] font-bold uppercase tracking-wide text-gray-500">{label}</p>
      <p className={`text-2xl font-extrabold mt-2 ${color}`}>{value}</p>
      {note && <p className="text-xs text-gray-400 mt-1">{note}</p>}
    </div>
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3 bg-white border border-gray-200 rounded-xl p-4">
        <div>
          <h2 className="text-lg font-bold text-gray-800">Taller / OT · Tablero</h2>
          <p className="text-xs text-gray-500 mt-1">Resumen y estadísticas de las órdenes de trabajo</p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-xs text-gray-500">Desde<input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} className="block border border-gray-300 rounded p-2 mt-1 text-sm" /></label>
          <label className="text-xs text-gray-500">Hasta<input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} className="block border border-gray-300 rounded p-2 mt-1 text-sm" /></label>
          <button onClick={aplicarPeriodo} className="bg-orange-500 hover:bg-orange-600 text-white font-bold px-4 py-2 rounded-lg text-sm">Ver</button>
          <button onClick={irALista} className="border border-gray-300 hover:bg-gray-50 text-gray-700 font-semibold px-4 py-2 rounded-lg text-sm">Ver órdenes</button>
        </div>
      </div>

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
        {card('Recibidas hoy', recibidasHoy, 'text-blue-600')}
        {card('En el taller ahora', enTaller, 'text-orange-600')}
        {card('Atrasadas', atrasadas.length, atrasadas.length ? 'text-red-600' : 'text-green-600', 'Pasó la fecha prometida')}
        {card('Terminadas en el período', terminadas.length, 'text-emerald-600')}
        {card('Facturado en el período', monedaGs(totalFacturado), 'text-violet-700', `${facturasPeriodo.length} factura(s)`)}
        {card('Terminadas sin facturar', sinFacturar.length, sinFacturar.length ? 'text-amber-600' : 'text-green-600')}
        {card('Días promedio en el taller', promedioDias, 'text-sky-700', 'Para las OT con fecha de salida')}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <section className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="p-4 border-b border-gray-100"><h3 className="font-bold text-gray-800">Para entregar hoy</h3></div>
          <div className="overflow-x-auto"><table className="w-full text-sm"><thead className="bg-gray-50 text-[11px] uppercase text-gray-500"><tr><th className="p-3 text-left">N° de OT</th><th className="p-3 text-left">Cliente</th><th className="p-3 text-left">Vehículo / artículo</th><th className="p-3 text-left">Técnico</th><th className="p-3 text-left">Estado</th></tr></thead>
            <tbody>{paraEntregarHoy.slice(0, 8).map((o) => <tr key={o.id} className="border-t border-gray-100"><td className="p-3 font-semibold">{o.numero_ot || '—'}</td><td className="p-3">{clienteNombre(o)}</td><td className="p-3">{o.vehiculo || '—'}</td><td className="p-3">{o.tecnico || 'Sin asignar'}</td><td className="p-3">{o.estado || '—'}</td></tr>)}
              {paraEntregarHoy.length === 0 && <tr><td colSpan={5} className="p-7 text-center text-gray-400">No hay entregas prometidas para hoy.</td></tr>}</tbody>
          </table></div>
        </section>

        <section className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="p-4 border-b border-gray-100"><h3 className="font-bold text-gray-800">Terminadas en el período que todavía no se facturaron</h3></div>
          <div className="overflow-x-auto"><table className="w-full text-sm"><thead className="bg-gray-50 text-[11px] uppercase text-gray-500"><tr><th className="p-3 text-left">N° de OT</th><th className="p-3 text-left">Cliente</th><th className="p-3 text-left">Vehículo / artículo</th><th className="p-3 text-left">Técnico</th><th className="p-3 text-left">Estado</th></tr></thead>
            <tbody>{sinFacturar.slice(0, 8).map((o) => <tr key={o.id} className="border-t border-gray-100"><td className="p-3 font-semibold">{o.numero_ot || '—'}</td><td className="p-3">{clienteNombre(o)}</td><td className="p-3">{o.vehiculo || '—'}</td><td className="p-3">{o.tecnico || 'Sin asignar'}</td><td className="p-3">{o.estado || '—'}</td></tr>)}
              {sinFacturar.length === 0 && <tr><td colSpan={5} className="p-7 text-center text-gray-400">Todo lo terminado en el período ya está facturado.</td></tr>}</tbody>
          </table></div>
        </section>

        <section className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="p-4 border-b border-gray-100"><h3 className="font-bold text-gray-800">Atrasadas: pasó la fecha prometida</h3></div>
          <div className="overflow-x-auto"><table className="w-full text-sm"><thead className="bg-gray-50 text-[11px] uppercase text-gray-500"><tr><th className="p-3 text-left">N° de OT</th><th className="p-3 text-left">Cliente</th><th className="p-3 text-left">Vehículo / artículo</th><th className="p-3 text-left">Técnico</th><th className="p-3 text-left">Prometida</th><th className="p-3 text-left">Estado</th></tr></thead>
            <tbody>{atrasadas.slice(0, 8).map((o) => <tr key={o.id} className="border-t border-gray-100"><td className="p-3 font-semibold">{o.numero_ot || '—'}</td><td className="p-3">{clienteNombre(o)}</td><td className="p-3">{o.vehiculo || '—'}</td><td className="p-3">{o.tecnico || 'Sin asignar'}</td><td className="p-3 text-red-600">{fechaPrometida(o) ? new Date(fechaPrometida(o)).toLocaleDateString('es-PY') : '—'}</td><td className="p-3">{o.estado || '—'}</td></tr>)}
              {atrasadas.length === 0 && <tr><td colSpan={6} className="p-7 text-center text-gray-400">No hay órdenes atrasadas con fecha prometida registrada.</td></tr>}</tbody>
          </table></div>
        </section>

        <section className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="p-4 border-b border-gray-100"><h3 className="font-bold text-gray-800">Por técnico</h3></div>
          <div className="overflow-x-auto"><table className="w-full text-sm"><thead className="bg-gray-50 text-[11px] uppercase text-gray-500"><tr><th className="p-3 text-left">Técnico</th><th className="p-3 text-right">Abiertas</th><th className="p-3 text-right">Terminadas</th><th className="p-3 text-right">Facturado</th></tr></thead>
            <tbody>{porTecnico.map((t) => <tr key={t.nombre} className="border-t border-gray-100"><td className="p-3">{t.nombre}</td><td className="p-3 text-right">{t.abiertas}</td><td className="p-3 text-right">{t.terminadas}</td><td className="p-3 text-right">{monedaGs(t.facturado)}</td></tr>)}
              {porTecnico.length === 0 && <tr><td colSpan={4} className="p-7 text-center text-gray-400">No hay órdenes en este período.</td></tr>}</tbody>
          </table></div>
        </section>

        <section className="bg-white border border-gray-200 rounded-xl p-4">
          <h3 className="font-bold text-gray-800 mb-3">OT por estado</h3>
          <div className="space-y-3">{porEstado.map(([estado, cantidad]) => <div key={estado} className="grid grid-cols-[minmax(8rem,1fr)_3fr_2rem] items-center gap-3 text-sm"><span className="truncate" title={estado}>{estado}</span><div className="h-2.5 bg-gray-100 rounded-full overflow-hidden"><div className="h-full bg-orange-500 rounded-full transition-all duration-500" style={{ width: `${Math.max(4, (cantidad / Math.max(1, ordenesPeriodo.length)) * 100)}%` }} /></div><strong className="text-right">{cantidad}</strong></div>)}
            {porEstado.length === 0 && <p className="text-sm text-gray-400">No hay datos para el período.</p>}</div>
        </section>

        <section className="bg-white border border-gray-200 rounded-xl p-4">
          <h3 className="font-bold text-gray-800 mb-3">Servicios y categorías más frecuentes</h3>
          <div className="space-y-3">{porCategoria.map(([nombre, cantidad], i) => <div key={nombre} className="flex items-center justify-between border-b border-gray-100 pb-2 text-sm"><span className="truncate pr-3"><span className="text-orange-500 font-bold mr-2">{i + 1}.</span>{nombre}</span><strong>{cantidad}</strong></div>)}
            {porCategoria.length === 0 && <p className="text-sm text-gray-400">No hay categorías registradas en este período.</p>}</div>
        </section>
      </div>
    </div>
  );
}

// ============================================================================
// LISTA DE OT
// ============================================================================
function ListaOT({ ordenes, clientes, ubicaciones, tecnicos, nombreDelNegocio, empresaId, notificar, confirmar, recargar, irAAgregar }) {
  const [tab, setTab] = useState('pendiente');
  const [fUbicacion, setFUbicacion] = useState('');
  const [fCliente, setFCliente] = useState('');
  const [fTecnico, setFTecnico] = useState('');
  const [fEstado, setFEstado] = useState('');
  const [busqueda, setBusqueda] = useState('');
  const [pagina, setPagina] = useState(1);
  const porPagina = 25;
  const [menuAbierto, setMenuAbierto] = useState(null);
  const [estadosOT, setEstadosOT] = useState(ESTADOS_OT.map((nombre, i) => ({ nombre, orden: i + 1, activo: true, finalizado: ESTADOS_FINALIZADOS.has(nombre) })));
  useEffect(() => {
    supabase.from('empresas').select('configuracion').eq('id', empresaId).maybeSingle().then(({ data }) => {
      const estados = data?.configuracion?.modulos?.ot?.estados;
      if (Array.isArray(estados) && estados.length) setEstadosOT(estados.map((e) => ({ ...e, finalizado: e.finalizado ?? ESTADOS_FINALIZADOS.has(e.nombre) })));
    });
  }, [empresaId]);
  const valorOT = (o, key) => {
    const detalle = detalleDeOT(o);
    const ampliados = {
      servicio: detalle.servicio,
      placa: detalle.chapa || detalle.placa,
      presupuesto_estimado: detalle.presupuesto_estimado,
      fecha_prometida: detalle.fecha_prometida,
      color: detalle.color,
      chasis: detalle.chasis,
    };
    return ampliados[key] ?? o[key] ?? '';
  };

  const filtradas = useMemo(() => {
    return ordenes.filter((o) => {
      const finalizado = estadosOT.find((e) => e.nombre === o.estado)?.finalizado ?? ESTADOS_FINALIZADOS.has(o.estado);
      if (tab === 'pendiente' && finalizado) return false;
      if (tab === 'completado' && !finalizado) return false;
      if (fUbicacion && o.ubicacion_id !== fUbicacion) return false;
      if (fCliente && String(o.cliente_id) !== String(fCliente)) return false;
      if (fTecnico && o.tecnico !== fTecnico) return false;
      if (fEstado && o.estado !== fEstado) return false;
      if (busqueda) {
        const q = busqueda.toLowerCase();
        const d = detalleDeOT(o);
        const enTexto = `${o.numero_ot} ${o.cliente_nombre} ${o.vehiculo} ${o.marca} ${o.categoria_articulo} ${o.tecnico} ${d.servicio} ${d.placa} ${d.chasis}`.toLowerCase();
        if (!enTexto.includes(q)) return false;
      }
      return true;
    });
  }, [ordenes, tab, fUbicacion, fCliente, fTecnico, fEstado, busqueda]);

  const totalPaginas = Math.max(1, Math.ceil(filtradas.length / porPagina));
  const paginadas = filtradas.slice((pagina - 1) * porPagina, pagina * porPagina);

  const nombreUbicacion = (id) => ubicaciones.find((u) => u.id === id)?.nombre || '—';

  const columnasExport = [
    { key: 'tipo', label: 'Tipo' }, { key: 'fecha_hora', label: 'Fecha' }, { key: 'numero_ot', label: 'ID N°' },
    { key: 'factura_numero', label: 'Factura' }, { key: 'estado', label: 'Estado' }, { key: 'tecnico', label: 'Técnico' },
    { key: 'cliente_nombre', label: 'Cliente' }, { key: 'categoria_articulo', label: 'Categoría' }, { key: 'marca', label: 'Marca' },
    { key: 'servicio', label: 'Servicio' }, { key: 'vehiculo', label: 'Vehículo / artículo' }, { key: 'placa', label: 'Placa' },
    { key: 'presupuesto_estimado', label: 'Presupuesto (Gs)' }, { key: 'fecha_prometida', label: 'Fecha prometida' }, { key: 'color', label: 'Color' }, { key: 'chasis', label: 'Chasis / VIN' },
  ];

  const exportarCSV = () => {
    const filas = [columnasExport.map((c) => c.label).join(',')];
    filtradas.forEach((o) => filas.push(columnasExport.map((c) => `"${String(valorOT(o, c.key)).replace(/"/g, '""')}"`).join(',')));
    descargarArchivo(filas.join('\n'), 'ordenes_de_trabajo.csv', 'text/csv;charset=utf-8;');
  };

  const exportarExcel = () => {
    let html = '<table><tr>' + columnasExport.map((c) => `<th>${c.label}</th>`).join('') + '</tr>';
    filtradas.forEach((o) => { html += '<tr>' + columnasExport.map((c) => `<td>${valorOT(o, c.key)}</td>`).join('') + '</tr>'; });
    html += '</table>';
    descargarArchivo(html, 'ordenes_de_trabajo.xls', 'application/vnd.ms-excel');
  };

  const exportarPDF = () => {
    const doc = new jsPDF();
    doc.text(`Órdenes de Trabajo - ${nombreDelNegocio || ''}`, 14, 12);
    autoTable(doc, {
      startY: 18,
      head: [columnasExport.map((c) => c.label)],
      body: filtradas.map((o) => columnasExport.map((c) => String(valorOT(o, c.key)))),
      styles: { fontSize: 7 },
    });
    doc.save('ordenes_de_trabajo.pdf');
  };

  const eliminarOT = async (orden) => {
    if (!(await confirmar(`¿Eliminar la orden "${orden.numero_ot}"? Esta acción no se puede deshacer.`))) return;
    const { error } = await supabase.from('ordenes_trabajo').delete().eq('id', orden.id).eq('empresa_id', empresaId);
    if (error) return notificar.error('Error al eliminar: ' + error.message);
    notificar.exito('Orden eliminada.');
    recargar();
    setMenuAbierto(null);
  };

  const cambiarEstado = async (orden, nuevoEstado) => {
    const { error } = await supabase.from('ordenes_trabajo').update({ estado: nuevoEstado, actualizado_en: new Date().toISOString() }).eq('id', orden.id).eq('empresa_id', empresaId);
    if (error) return notificar.error('Error al actualizar estado: ' + error.message);
    notificar.exito(`Orden marcada como "${nuevoEstado}".`);
    recargar();
    setMenuAbierto(null);
  };

  return (
    <div>
      {/* Filtros */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 mb-4">
        <p className="text-xs font-bold text-gray-500 mb-3 uppercase tracking-wide">Filtros</p>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div>
            <label className="text-xs text-gray-500">Ubicación de la empresa</label>
            <select value={fUbicacion} onChange={(e) => setFUbicacion(e.target.value)} className="w-full border border-gray-300 rounded p-2 text-sm mt-1">
              <option value="">Todos</option>
              {ubicaciones.map((u) => <option key={u.id} value={u.id}>{u.nombre}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-500">Cliente</label>
            <select value={fCliente} onChange={(e) => setFCliente(e.target.value)} className="w-full border border-gray-300 rounded p-2 text-sm mt-1">
              <option value="">Todos</option>
              {clientes.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-500">Técnico</label>
            <select value={fTecnico} onChange={(e) => setFTecnico(e.target.value)} className="w-full border border-gray-300 rounded p-2 text-sm mt-1">
              <option value="">Todos</option>
              {tecnicos.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-500">Estado</label>
            <select value={fEstado} onChange={(e) => setFEstado(e.target.value)} className="w-full border border-gray-300 rounded p-2 text-sm mt-1">
              <option value="">Todos</option>
              {estadosOT.filter((e) => e.activo !== false).map((e) => <option key={e.nombre} value={e.nombre}>{e.nombre}</option>)}
            </select>
          </div>
        </div>
      </div>

      {/* Sub-tabs Pendiente / Completado */}
      <div className="flex gap-6 border-b border-gray-200 mb-4">
        <button onClick={() => { setTab('pendiente'); setPagina(1); }} className={`pb-2 text-sm font-semibold border-b-2 -mb-px ${tab === 'pendiente' ? 'border-orange-500 text-orange-600' : 'border-transparent text-gray-500'}`}>
          ● Pendiente
        </button>
        <button onClick={() => { setTab('completado'); setPagina(1); }} className={`pb-2 text-sm font-semibold border-b-2 -mb-px ${tab === 'completado' ? 'border-green-500 text-green-600' : 'border-transparent text-gray-500'}`}>
          ✓ Completado
        </button>
      </div>

      {/* Barra de acciones */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <div className="flex flex-wrap gap-2">
          <button onClick={exportarCSV} className="border rounded px-3 py-1.5 text-xs font-bold text-gray-600 hover:bg-gray-50">📄 Exportar a CSV</button>
          <button onClick={exportarExcel} className="border rounded px-3 py-1.5 text-xs font-bold text-gray-600 hover:bg-gray-50">📊 Exportar a Excel</button>
          <button onClick={() => window.print()} className="border rounded px-3 py-1.5 text-xs font-bold text-gray-600 hover:bg-gray-50">🖨️ Imprimir</button>
          <button onClick={exportarPDF} className="border rounded px-3 py-1.5 text-xs font-bold text-gray-600 hover:bg-gray-50">📄 Exportar a PDF</button>
        </div>
        <div className="flex gap-2 items-center">
          <input value={busqueda} onChange={(e) => { setBusqueda(e.target.value); setPagina(1); }} placeholder="Buscar..." className="border border-gray-300 rounded px-3 py-1.5 text-sm w-48" />
          <button onClick={irAAgregar} className="bg-orange-500 hover:bg-orange-600 text-white text-sm font-bold px-4 py-2 rounded-lg">+ Añadir</button>
        </div>
      </div>

      {/* Tabla */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
            <tr>
              <th className="p-3 text-left">Acción</th>
              <th className="p-3 text-left">Tipo</th>
              <th className="p-3 text-left">Fecha y hora</th>
              <th className="p-3 text-left">ID N°</th>
              <th className="p-3 text-left">Factura No.</th>
              <th className="p-3 text-left">Estado</th>
              <th className="p-3 text-left">Técnico</th>
              <th className="p-3 text-left">Cliente</th>
              <th className="p-3 text-left">Ubicación</th>
              <th className="p-3 text-left">Categoría</th>
              <th className="p-3 text-left">Marca</th>
              <th className="p-3 text-left">Servicio</th>
              <th className="p-3 text-left">Detalle</th>
              <th className="p-3 text-left">Placa</th>
              <th className="p-3 text-left">Presupuesto</th>
              <th className="p-3 text-left">Prometida</th>
              <th className="p-3 text-left">Color</th>
              <th className="p-3 text-left">Chasis / VIN</th>
            </tr>
          </thead>
          <tbody>
            {paginadas.map((o) => (
              <tr key={o.id} className="border-t border-gray-100 hover:bg-gray-50">
                <td className="p-3 relative">
                  <button onClick={() => setMenuAbierto(menuAbierto === o.id ? null : o.id)} className="bg-sky-500 hover:bg-sky-600 text-white text-xs font-bold px-2.5 py-1 rounded">
                    Acción ▾
                  </button>
                  {menuAbierto === o.id && (
                    <div className="absolute z-20 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg w-48 text-xs">
                      {estadosOT.filter((e) => e.activo !== false && e.nombre !== o.estado).map((e) => (
                        <button key={e.nombre} onClick={() => cambiarEstado(o, e.nombre)} className="block w-full text-left px-3 py-2 hover:bg-gray-50">Marcar como {e.nombre}</button>
                      ))}
                      <button onClick={() => eliminarOT(o)} className="block w-full text-left px-3 py-2 hover:bg-red-50 text-red-600 border-t border-gray-100">Eliminar</button>
                    </div>
                  )}
                </td>
                <td className="p-3">{o.tipo || 'Servicio'}</td>
                <td className="p-3 text-gray-500">{o.fecha_hora ? new Date(o.fecha_hora).toLocaleString('es-PY') : '—'}</td>
                <td className="p-3 font-semibold">{o.numero_ot}</td>
                <td className="p-3">{o.factura_numero || '—'}</td>
                <td className="p-3"><span style={estadosOT.find((e) => e.nombre === o.estado)?.color ? { backgroundColor: `${estadosOT.find((e) => e.nombre === o.estado).color}22`, color: estadosOT.find((e) => e.nombre === o.estado).color, borderColor: estadosOT.find((e) => e.nombre === o.estado).color } : undefined} className={`px-2 py-0.5 rounded-full text-xs font-bold ${badgeEstado(o.estado)}`}>{o.estado}</span></td>
                <td className="p-3">{o.tecnico || '—'}</td>
                <td className="p-3">{o.cliente_nombre || 'Cliente ocasional'}</td>
                <td className="p-3 text-gray-500">{nombreUbicacion(o.ubicacion_id)}</td>
                <td className="p-3">{o.categoria_articulo || '—'}</td>
                <td className="p-3">{o.marca || '—'}</td>
                <td className="p-3">{valorOT(o, 'servicio') || '—'}</td>
                <td className="p-3 text-gray-500" title={notaVisibleOT(o) || undefined}>
                  <div>{o.vehiculo || '—'}</div>
                  {(detalleDeOT(o).servicio || detalleDeOT(o).placa) && <div className="text-[11px] text-gray-400 mt-1">{[detalleDeOT(o).servicio, detalleDeOT(o).placa].filter(Boolean).join(' · ')}</div>}
                </td>
                <td className="p-3">{valorOT(o, 'placa') || '—'}</td>
                <td className="p-3">{Number(valorOT(o, 'presupuesto_estimado')) ? monedaGs(valorOT(o, 'presupuesto_estimado')) : '—'}</td>
                <td className="p-3">{valorOT(o, 'fecha_prometida') ? new Date(valorOT(o, 'fecha_prometida')).toLocaleDateString('es-PY') : '—'}</td>
                <td className="p-3">{valorOT(o, 'color') || '—'}</td>
                <td className="p-3">{valorOT(o, 'chasis') || '—'}</td>
              </tr>
            ))}
            {paginadas.length === 0 && (
              <tr><td colSpan={19} className="p-8 text-center text-gray-400">No hay órdenes de trabajo para mostrar.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Paginación */}
      <div className="flex items-center justify-between mt-3 text-sm text-gray-500">
        <span>Mostrando {paginadas.length} de {filtradas.length} entradas</span>
        <div className="flex gap-2">
          <button disabled={pagina <= 1} onClick={() => setPagina((p) => p - 1)} className="px-3 py-1 border rounded disabled:opacity-40">Anterior</button>
          <span className="px-3 py-1">{pagina} / {totalPaginas}</span>
          <button disabled={pagina >= totalPaginas} onClick={() => setPagina((p) => p + 1)} className="px-3 py-1 border rounded disabled:opacity-40">Siguiente</button>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// AGREGAR HOJA DE TRABAJO
// ============================================================================
function AgregarHojaDeTrabajo({ clientes, ubicaciones, marcasVehiculo, categoriasArticulo, tecnicos, empresaId, notificar, onGuardado }) {
  const marcasParaOT = marcasVehiculo.filter((m) => m.uso_reparacion);
  const [clientesLocales, setClientesLocales] = useState(clientes);
  const [clienteId, setClienteId] = useState('');
  const [clienteNombreLibre, setClienteNombreLibre] = useState('');
  const [ubicacionId, setUbicacionId] = useState('');
  const [categoriaArticulo, setCategoriaArticulo] = useState('');
  const [vehiculo, setVehiculo] = useState('');
  const [marca, setMarca] = useState('');
  const [tecnico, setTecnico] = useState('');
  const [tipo, setTipo] = useState('Servicio');
  const [notas, setNotas] = useState('');
  const [estado, setEstado] = useState('Recibido');
  const [archivo, setArchivo] = useState(null);
  const [notificarSMS, setNotificarSMS] = useState(false);
  const [notificarEmail, setNotificarEmail] = useState(false);
  const [resultadoCreacion, setResultadoCreacion] = useState(null);
  const [clienteLibreContacto, setClienteLibreContacto] = useState({ celular: '', email: '' });
  const [mostrarAltaCliente, setMostrarAltaCliente] = useState(false);
  const [nuevoCliente, setNuevoCliente] = useState({ nombre: '', celular: '', email: '' });
  const [guardandoCliente, setGuardandoCliente] = useState(false);
  const [mostrarLlaves, setMostrarLlaves] = useState(false);
  const [configuracionOT, setConfiguracionOT] = useState(null);
  const [detalle, setDetalle] = useState({ servicio: '', chapa: '', llaves_alarma: '', kilometraje: '', combustible: '', color: '', chasis: '', solicitud_cliente: '', falla_reportada: '', condicion_recepcion: '', diagnostico_trabajo: '', presupuesto_estimado: '', tarifa_diagnostico: '', limite_autorizado: '', fecha_prometida: '', fecha_salida: '', modalidad: 'Lo trae el cliente', notificacion_sms: false, notificacion_email: false });
  const [guardando, setGuardando] = useState(false);

  useEffect(() => setClientesLocales(clientes), [clientes]);

  const cambiarDetalle = (campo, valor) => setDetalle((anterior) => ({ ...anterior, [campo]: valor }));
  const cambiarServicioOT = (valor) => {
    cambiarDetalle('servicio', valor);
    const servicio = (configuracionOT?.servicios || []).find((s) => s.nombre.toLowerCase() === valor.trim().toLowerCase());
    if (servicio?.revision && !detalle.condicion_recepcion.trim()) cambiarDetalle('condicion_recepcion', servicio.revision);
  };
  useEffect(() => {
    if (!ubicacionId && ubicaciones.length) setUbicacionId(String(ubicaciones[0].id));
  }, [ubicaciones, ubicacionId]);
  useEffect(() => {
    if (!empresaId) return;
    supabase.from('empresas').select('configuracion').eq('id', empresaId).maybeSingle().then(({ data }) => {
      const cfg = data?.configuracion?.modulos?.ot || {};
      setConfiguracionOT(cfg);
      if (cfg.estadoPredeterminado) setEstado(cfg.estadoPredeterminado);
      if (cfg.productoServicioId) supabase.from('productos').select('nombre').eq('id', cfg.productoServicioId).eq('empresa_id', empresaId).maybeSingle().then(({ data: producto }) => {
        if (producto?.nombre) setDetalle((actual) => ({ ...actual, servicio: producto.nombre }));
      });
    });
  }, [empresaId]);
  const categoriasServicioOT = Array.from(new Set([...categoriasArticulo.map((c) => c.nombre), ...(configuracionOT?.categoriasServicio || [])]));
  const estadosDisponiblesOT = (configuracionOT?.estados || ESTADOS_OT.map((nombre, i) => ({ nombre, orden: i + 1, activo: true }))).filter((e) => e.activo !== false).sort((a,b) => (a.orden || 0) - (b.orden || 0));

  const registrarCliente = async () => {
    const nombre = nuevoCliente.nombre.trim();
    if (!nombre) return notificar.info('Ingresá el nombre del cliente.');
    setGuardandoCliente(true);
    try {
      const { data: existente, error: errorBusqueda } = await supabase.from('clientes').select('id, nombre, nombre_empresa, celular, email').eq('empresa_id', empresaId).ilike('nombre', nombre).limit(1).maybeSingle();
      if (errorBusqueda) throw errorBusqueda;
      if (existente) {
        setMostrarAltaCliente(false);
        setClienteId(String(existente.id));
        return notificar.info('Ya existe un cliente con ese nombre; se seleccionó el registro existente.');
      }
      const { data, error } = await supabase.from('clientes').insert([{ empresa_id: empresaId, tipo_contacto: 'Cliente', nombre, celular: nuevoCliente.celular.trim() || null, email: nuevoCliente.email.trim() || null, estado: 'Activo' }]).select('id, nombre, nombre_empresa, celular, email').single();
      if (error) throw error;
      setClientesLocales((actuales) => [...actuales, data].sort((a, b) => a.nombre.localeCompare(b.nombre)));
      setClienteId(String(data.id));
      setNuevoCliente({ nombre: '', celular: '', email: '' });
      setMostrarAltaCliente(false);
      notificar.exito('Cliente registrado y seleccionado.');
    } catch (error) {
      notificar.error(`No se pudo registrar el cliente: ${error.message}`);
    } finally {
      setGuardandoCliente(false);
    }
  };

  const guardar = async (e, accion = 'guardar') => {
    e?.preventDefault?.();
    if (!ubicacionId) return notificar.info('Seleccioná la ubicación comercial.');
    const clienteSeleccionado = clientesLocales.find((c) => String(c.id) === String(clienteId));
    if (!clienteSeleccionado && !clienteNombreLibre.trim()) return notificar.info('Seleccioná un cliente o ingresá el nombre del cliente ocasional.');
    if (!detalle.chapa.trim()) return notificar.info('Ingresá la chapa o identificación del artículo.');
    if (archivo && archivo.size > 5 * 1024 * 1024) return notificar.error('El documento supera el máximo de 5 MB.');
    setGuardando(true);
    try {
      const { data: numeroOt, error: errorNumero } = await supabase.rpc('siguiente_numero_ot');
      if (errorNumero) throw errorNumero;

      const nombreCliente = clienteSeleccionado?.nombre_empresa || clienteSeleccionado?.nombre || clienteNombreLibre.trim() || 'Cliente ocasional';
      const detalleOT = {
        ...Object.fromEntries(Object.entries(detalle).map(([k, v]) => [k, typeof v === 'string' ? v.trim() : v])),
        contacto_celular: clienteSeleccionado?.celular || clienteLibreContacto.celular.trim(),
        contacto_email: clienteSeleccionado?.email || clienteLibreContacto.email.trim(),
        notificacion_sms: notificarSMS,
        notificacion_email: notificarEmail,
      };
      const notaConDetalle = `${notas.trim()}${MARCADOR_DETALLE_OT}${JSON.stringify(detalleOT)}`;
      const numeroOtFinal = configuracionOT?.prefijo
        ? `${configuracionOT.prefijo}${String(numeroOt).replace(/^[^-]+-/, '')}`
        : numeroOt;
      const nuevaOrden = {
        empresa_id: empresaId,
        numero_ot: numeroOtFinal,
        tipo,
        ubicacion_id: ubicacionId || null,
        cliente_id: clienteId || null,
        cliente_nombre: nombreCliente,
        categoria_articulo: categoriaArticulo,
        vehiculo,
        marca,
        tecnico,
        estado,
        notas: notaConDetalle,
        detalle_ot: detalleOT,
      };
      let resultado = await supabase.from('ordenes_trabajo').insert([nuevaOrden]).select('id').single();
      if (resultado.error && (resultado.error.code === '42703' || resultado.error.code === 'PGRST204' || /detalle_ot|column.*does not exist/i.test(resultado.error.message || ''))) {
        const { detalle_ot: _detalleNoMigrado, ...ordenCompatible } = nuevaOrden;
        resultado = await supabase.from('ordenes_trabajo').insert([ordenCompatible]).select('id').single();
      }
      if (resultado.error) throw resultado.error;
      const ordenId = resultado.data?.id;
      let documento = null;
      let errorDocumento = '';
      if (archivo) {
        const nombreSeguro = archivo.name.normalize('NFKD').replace(/[^a-zA-Z0-9._-]/g, '_').slice(-100);
        const ruta = `${empresaId}/${ordenId}/${Date.now()}-${nombreSeguro}`;
        const { error: errorSubida } = await supabase.storage.from('documentos-ot').upload(ruta, archivo, { upsert: false, contentType: archivo.type || undefined });
        if (errorSubida) errorDocumento = errorSubida.message;
        else {
          documento = { nombre: archivo.name, ruta };
          detalleOT.documento = documento;
          const notasActualizadas = `${notas.trim()}${MARCADOR_DETALLE_OT}${JSON.stringify(detalleOT)}`;
          let actualizacion = await supabase.from('ordenes_trabajo').update({ detalle_ot: detalleOT, notas: notasActualizadas }).eq('id', ordenId).eq('empresa_id', empresaId);
          if (actualizacion.error && /detalle_ot|column.*does not exist|schema cache/i.test(actualizacion.error.message || '')) actualizacion = await supabase.from('ordenes_trabajo').update({ notas: notasActualizadas }).eq('id', ordenId).eq('empresa_id', empresaId);
          if (actualizacion.error) errorDocumento = `Se subió el archivo, pero no se vinculó a la OT: ${actualizacion.error.message}`;
        }
      }
      setResultadoCreacion({ numeroOt: numeroOtFinal, nombreCliente, ordenId, email: detalleOT.contacto_email, celular: detalleOT.contacto_celular, notificarEmail, notificarSMS, documento, errorDocumento, accion });
      notificar.exito(`Orden ${numeroOtFinal} creada con éxito.`);
    } catch (err) {
      notificar.error('Error al crear la orden: ' + err.message);
    } finally {
      setGuardando(false);
    }
  };

  const label = 'mb-1 block text-xs font-semibold text-gray-600';
  const input = 'w-full rounded border border-gray-300 bg-white p-2.5 text-sm focus:border-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-100';
  const linkCorreo = resultadoCreacion?.email ? `mailto:${encodeURIComponent(resultadoCreacion.email)}?subject=${encodeURIComponent(`Orden de trabajo ${resultadoCreacion.numeroOt}`)}&body=${encodeURIComponent(`Hola ${resultadoCreacion.nombreCliente}, registramos tu orden ${resultadoCreacion.numeroOt}. Estado: ${estado}.`)}` : '';
  const linkSMS = resultadoCreacion?.celular ? `sms:${resultadoCreacion.celular.replace(/[^+\d]/g, '')}?body=${encodeURIComponent(`Hola ${resultadoCreacion.nombreCliente}, registramos tu orden ${resultadoCreacion.numeroOt}. Estado: ${estado}.`)}` : '';
  if (resultadoCreacion) return <div className="max-w-4xl rounded-xl border border-emerald-200 bg-white p-6 shadow-sm"><h2 className="text-xl font-bold text-emerald-700">Orden {resultadoCreacion.numeroOt} creada</h2><p className="mt-2 text-sm text-gray-600">La OT quedó registrada. El stock no se modifica al crear la hoja de trabajo.</p>{resultadoCreacion.documento && <p className="mt-3 text-sm">Documento adjunto: <strong>{resultadoCreacion.documento.nombre}</strong></p>}{resultadoCreacion.errorDocumento && <p className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">No se pudo vincular el documento: {resultadoCreacion.errorDocumento}. Verificá que esté aplicada la migración de documentos OT.</p>}{(resultadoCreacion.notificarEmail || resultadoCreacion.notificarSMS) && <div className="mt-4 rounded-lg bg-sky-50 p-4 text-sm text-sky-900"><p className="font-semibold">Preparar notificación</p><p className="mt-1 text-xs">Se abre un borrador en tu equipo; el mensaje no se envía hasta que lo confirmes.</p><div className="mt-3 flex flex-wrap gap-2">{resultadoCreacion.notificarEmail && (linkCorreo ? <a href={linkCorreo} className="rounded bg-white px-3 py-2 font-semibold text-sky-800">Abrir correo</a> : <span className="text-xs">El cliente no tiene correo registrado.</span>)}{resultadoCreacion.notificarSMS && (linkSMS ? <a href={linkSMS} className="rounded bg-white px-3 py-2 font-semibold text-sky-800">Abrir SMS</a> : <span className="text-xs">El cliente no tiene celular registrado.</span>)}</div></div>}<button onClick={onGuardado} className="mt-5 rounded-lg bg-orange-500 px-5 py-2.5 text-sm font-bold text-white">Volver a órdenes de trabajo</button></div>;

  return (
    <form onSubmit={guardar} className="bg-white border border-gray-200 rounded-xl p-5 max-w-full space-y-5">
      <h2 className="text-lg font-bold text-gray-800">Nueva orden de trabajo</h2>
      <section className="grid grid-cols-1 md:grid-cols-3 gap-4 rounded-xl border border-gray-200 p-5">
        <div><label className={label}>Ubicación comercial:*</label><select required value={ubicacionId} onChange={(e) => setUbicacionId(e.target.value)} className={input}><option value="">Seleccione</option>{ubicaciones.map((u) => <option key={u.id} value={u.id}>{u.nombre}</option>)}</select></div>
        <div><label className={label}>Cliente:*</label><div className="flex gap-2"><select value={clienteId} onChange={(e) => setClienteId(e.target.value)} className={input}><option value="">Cliente ocasional</option>{clientesLocales.map((c) => <option key={c.id} value={c.id}>{c.nombre_empresa || c.nombre}</option>)}</select><button type="button" title="Agregar cliente" onClick={() => setMostrarAltaCliente((v) => !v)} className="rounded border border-sky-300 px-3 font-bold text-sky-600">＋</button></div>
          {mostrarAltaCliente && <div className="mt-2 space-y-2 rounded-lg border border-sky-100 bg-sky-50 p-3"><input className={input} placeholder="Nombre del cliente" value={nuevoCliente.nombre} onChange={(e) => setNuevoCliente((v) => ({ ...v, nombre: e.target.value }))} /><input className={input} placeholder="Celular" value={nuevoCliente.celular} onChange={(e) => setNuevoCliente((v) => ({ ...v, celular: e.target.value }))} /><input className={input} type="email" placeholder="Email" value={nuevoCliente.email} onChange={(e) => setNuevoCliente((v) => ({ ...v, email: e.target.value }))} /><button type="button" disabled={guardandoCliente} onClick={registrarCliente} className="rounded bg-sky-600 px-3 py-2 text-xs font-bold text-white">{guardandoCliente ? 'Guardando…' : 'Guardar cliente'}</button></div>}
        </div>
        <fieldset><legend className={label}>Cómo llega:*</legend><div className="flex flex-wrap gap-x-4 gap-y-2 pt-2 text-sm">{['Lo trae el cliente', 'Lo buscamos', 'Vamos al lugar'].map((valor) => <label key={valor} className="flex items-center gap-2"><input type="radio" name="modalidad_ot" checked={detalle.modalidad === valor} onChange={() => cambiarDetalle('modalidad', valor)} />{valor}</label>)}</div></fieldset>
        {!clienteId && <><div><label className={label}>Nombre del cliente ocasional:*</label><input required value={clienteNombreLibre} onChange={(e) => setClienteNombreLibre(e.target.value)} placeholder="Nombre" className={input} /></div><div><label className={label}>Celular</label><input value={clienteLibreContacto.celular} onChange={(e) => setClienteLibreContacto((v) => ({ ...v, celular: e.target.value }))} className={input} /></div><div><label className={label}>Email</label><input type="email" value={clienteLibreContacto.email} onChange={(e) => setClienteLibreContacto((v) => ({ ...v, email: e.target.value }))} className={input} /></div></>}
      </section>
      <section className="rounded-xl border border-gray-200 p-5 space-y-4">
        <h3 className="font-bold text-gray-700">Datos del servicio</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div><label className={label}>Marca</label><select value={marca} onChange={(e) => setMarca(e.target.value)} className={input}><option value="">Seleccionar...</option>{marcasParaOT.map((m) => <option key={m.id} value={m.nombre}>{m.nombre}</option>)}</select></div>
          <div><label className={label}>Categoría de servicio</label><select value={categoriaArticulo} onChange={(e) => setCategoriaArticulo(e.target.value)} className={input}><option value="">Seleccionar...</option>{categoriasServicioOT.map((nombre) => <option key={nombre} value={nombre}>{nombre}</option>)}</select></div>
          <div><label className={label}>Servicio</label><input list="servicios-ot-configurados" value={detalle.servicio} onChange={(e) => cambiarServicioOT(e.target.value)} placeholder="Ej.: mantenimiento, reparación" className={input} /><datalist id="servicios-ot-configurados">{(configuracionOT?.servicios || []).map((s,i) => <option key={`${s.nombre}-${i}`} value={s.nombre}>{s.revision}</option>)}</datalist></div>
          <div><label className={label}>Artículo / vehículo</label><input value={vehiculo} onChange={(e) => setVehiculo(e.target.value)} placeholder="Descripción del artículo" className={input} /></div>
          <div><label className={label}>Técnico asignado</label><select value={tecnico} onChange={(e) => setTecnico(e.target.value)} className={input}><option value="">Seleccionar técnico...</option>{tecnicos.map((t) => <option key={t} value={t}>{t}</option>)}</select></div>
          <div><label className={label}>Estado:*</label><select required value={estado} onChange={(e) => setEstado(e.target.value)} className={input}>{estadosDisponiblesOT.map((e) => <option key={e.nombre} value={e.nombre}>{e.nombre}</option>)}</select></div>
        </div>
      </section>
      <section className="rounded-xl border border-gray-200 p-5 space-y-4">
        <h3 className="font-bold text-gray-700">Lista de recepción y datos del artículo</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div><label className={label}>{configuracionOT?.camposPersonalizados?.[2] || 'Chapa / identificación'}:*</label><input required value={detalle.chapa} onChange={(e) => cambiarDetalle('chapa', e.target.value)} className={input} /></div>
          <div><label className={label}>Llaves / alarma</label><div className="flex gap-2"><input type={mostrarLlaves ? 'text' : 'password'} value={detalle.llaves_alarma} onChange={(e) => cambiarDetalle('llaves_alarma', e.target.value)} className={input} /><button type="button" onClick={() => setMostrarLlaves((v) => !v)} className="text-xs text-sky-700">{mostrarLlaves ? 'Ocultar' : 'Ver'}</button></div></div>
          <div><label className={label}>{configuracionOT?.camposPersonalizados?.[0] || 'Kilometraje / horas'}</label><input value={detalle.kilometraje} onChange={(e) => cambiarDetalle('kilometraje', e.target.value)} className={input} /></div>
          <div><label className={label}>{configuracionOT?.camposPersonalizados?.[1] || 'Combustible'}</label><input value={detalle.combustible} onChange={(e) => cambiarDetalle('combustible', e.target.value)} className={input} placeholder="Nivel de combustible u otro dato" /></div>
          <div><label className={label}>{configuracionOT?.camposPersonalizados?.[3] || 'Color'}</label><input value={detalle.color} onChange={(e) => cambiarDetalle('color', e.target.value)} className={input} /></div>
          <div><label className={label}>{configuracionOT?.camposPersonalizados?.[4] || 'Chasis / VIN'}</label><input value={detalle.chasis} onChange={(e) => cambiarDetalle('chasis', e.target.value)} className={input} /></div>
          <div><label className={label}>Fecha prometida de entrega</label><input type="datetime-local" value={detalle.fecha_prometida} onChange={(e) => cambiarDetalle('fecha_prometida', e.target.value)} className={input} /></div>
          <div><label className={label}>Fecha de salida</label><input type="datetime-local" value={detalle.fecha_salida} onChange={(e) => cambiarDetalle('fecha_salida', e.target.value)} className={input} /></div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[['solicitud_cliente','Solicitud del cliente',configuracionOT?.preguntaCliente],['falla_reportada','Falla reportada por el cliente',configuracionOT?.fallaReportada],['condicion_recepcion','Condición al recibir',configuracionOT?.condicionRecepcion],['diagnostico_trabajo','Diagnóstico / trabajo realizado','']].map(([campo, titulo, ayuda]) => <div key={campo}><label className={label}>{titulo}</label><textarea value={detalle[campo]} onChange={(e) => cambiarDetalle(campo, e.target.value)} placeholder={ayuda || ''} rows={3} className={input} /></div>)}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">{[['presupuesto_estimado','Presupuesto estimado'],['tarifa_diagnostico','Tarifa de diagnóstico'],['limite_autorizado','Límite autorizado']].map(([campo,titulo]) => <div key={campo}><label className={label}>{titulo} (Gs)</label><input type="number" min="0" value={detalle[campo]} onChange={(e) => cambiarDetalle(campo,e.target.value)} className={input} /></div>)}</div>
      </section>
      <section className="rounded-xl border border-gray-200 p-5 space-y-4">
        <h3 className="font-bold text-gray-700">Documentos y notificaciones</h3>
        <div><label className={label}>Adjuntar documento (máximo 5 MB)</label><input type="file" accept=".pdf,.csv,.zip,.doc,.docx,.jpg,.jpeg,.png,.p12" onChange={(e) => setArchivo(e.target.files?.[0] || null)} className={input} /></div>
        <div className="flex flex-wrap gap-5 text-sm"><label className="flex items-center gap-2"><input type="checkbox" checked={notificarSMS} onChange={(e) => setNotificarSMS(e.target.checked)} />Preparar notificación SMS</label><label className="flex items-center gap-2"><input type="checkbox" checked={notificarEmail} onChange={(e) => setNotificarEmail(e.target.checked)} />Preparar notificación por email</label></div>
        <div><label className={label}>Notas adicionales</label><textarea value={notas} onChange={(e) => setNotas(e.target.value)} rows={3} className={input} /></div>
      </section>
      <div className="flex flex-wrap gap-3"><button disabled={guardando} type="button" onClick={(e) => guardar(e, 'repuestos')} className="rounded-lg border border-orange-500 px-5 py-2.5 text-sm font-bold text-orange-600 disabled:opacity-50">{guardando ? 'Guardando…' : 'Guardar y cargar repuestos'}</button><button disabled={guardando} type="submit" className="rounded-lg bg-orange-500 px-6 py-2.5 text-sm font-bold text-white disabled:opacity-50">{guardando ? 'Guardando…' : 'Guardar'}</button><button disabled={guardando || !archivo} type="button" onClick={(e) => guardar(e, 'documentos')} className="rounded-lg border border-gray-300 px-5 py-2.5 text-sm font-bold text-gray-700 disabled:opacity-50">Guardar y cargar documentos</button></div>
    </form>
  );
}

// ============================================================================
// LISTAR FACTURAS
// ============================================================================
function ListarFacturas({ facturas, ordenes, nombreDelNegocio, notificar, confirmar, empresaId, recargar }) {
  const numeroOtDe = (id) => ordenes.find((o) => o.id === id)?.numero_ot || '—';

  const eliminarFactura = async (f) => {
    if (!(await confirmar(`¿Eliminar la factura "${f.numero_factura}"?`))) return;
    const { error } = await supabase.from('ot_facturas').delete().eq('id', f.id).eq('empresa_id', empresaId);
    if (error) return notificar.error('Error al eliminar: ' + error.message);
    notificar.exito('Factura eliminada.');
    recargar();
  };

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
          <tr>
            <th className="p-3 text-left">N° Factura</th>
            <th className="p-3 text-left">OT relacionada</th>
            <th className="p-3 text-left">Cliente</th>
            <th className="p-3 text-left">Monto</th>
            <th className="p-3 text-left">Fecha</th>
            <th className="p-3 text-left">Acción</th>
          </tr>
        </thead>
        <tbody>
          {facturas.map((f) => (
            <tr key={f.id} className="border-t border-gray-100">
              <td className="p-3 font-semibold">{f.numero_factura}</td>
              <td className="p-3">{numeroOtDe(f.ot_id)}</td>
              <td className="p-3">{f.cliente_nombre || '—'}</td>
              <td className="p-3">{Number(f.monto || 0).toLocaleString('es-PY')}</td>
              <td className="p-3 text-gray-500">{f.fecha ? new Date(f.fecha).toLocaleDateString('es-PY') : '—'}</td>
              <td className="p-3">
                <button onClick={() => eliminarFactura(f)} className="text-red-600 text-xs font-bold hover:underline">Eliminar</button>
              </td>
            </tr>
          ))}
          {facturas.length === 0 && (
            <tr><td colSpan={6} className="p-8 text-center text-gray-400">Todavía no hay facturas cargadas.</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

// ============================================================================
// AGREGAR FACTURA (Con impacto en Ventas Generales)
// ============================================================================
function AgregarFactura({ ordenes, empresaId, notificar, onGuardado }) {
  const [otId, setOtId] = useState('');
  const [numeroFactura, setNumeroFactura] = useState('');
  const [monto, setMonto] = useState('');
  const [metodoPago, setMetodoPago] = useState('Efectivo');
  const [notas, setNotas] = useState('');
  const [guardando, setGuardando] = useState(false);

  const guardar = async (e) => {
    e.preventDefault();
    if (!numeroFactura.trim()) return notificar.info('Ingresá el número de factura.');
    setGuardando(true);
    
    try {
      const orden = ordenes.find((o) => String(o.id) === String(otId));
      const montoNum = Number(monto) || 0;

      // 1. Guardar en ot_facturas
      const { error: errorFactura } = await supabase.from('ot_facturas').insert([{
        empresa_id: empresaId,
        ot_id: otId || null,
        numero_factura: numeroFactura,
        cliente_nombre: orden?.cliente_nombre || null,
        monto: montoNum,
        notas,
      }]);
      if (errorFactura) throw errorFactura;

      // 2. Guardar en la tabla general de VENTAS
      const { error: errorVenta } = await supabase.from('ventas').insert([{
        empresa_id: empresaId,
        cliente: orden?.cliente_nombre || 'Cliente Ocasional',
        total: montoNum,
        metodo_pago: metodoPago,
        estado_pago: 'Pagado',
        monto_pagado: montoNum,
        saldo_pendiente: 0,
        articulos: 1,
        nota_venta: `Factura de Taller N° ${numeroFactura} - OT N° ${orden?.numero_ot || 'S/N'}`,
        fecha: new Date().toISOString()
      }]);
      if (errorVenta) throw errorVenta;

      // 3. Actualizar la orden de trabajo con el número de factura
      if (otId) {
        await supabase.from('ordenes_trabajo')
          .update({ factura_numero: numeroFactura })
          .eq('id', otId)
          .eq('empresa_id', empresaId);
      }

      notificar.exito('Factura registrada y añadida a las ventas con éxito.');
      setOtId(''); setNumeroFactura(''); setMonto(''); setNotas(''); setMetodoPago('Efectivo');
      onGuardado();
    } catch (err) {
      notificar.error('Error al guardar: ' + err.message);
    } finally {
      setGuardando(false);
    }
  };

  return (
    <form onSubmit={guardar} className="bg-white border border-gray-200 rounded-xl p-5 max-w-xl space-y-4">
      <div>
        <label className="text-xs font-semibold text-gray-500">Orden de trabajo relacionada</label>
        <select value={otId} onChange={(e) => setOtId(e.target.value)} className="w-full border border-gray-300 rounded p-2 text-sm mt-1">
          <option value="">Sin relacionar</option>
          {ordenes.map((o) => <option key={o.id} value={o.id}>{o.numero_ot} — {o.cliente_nombre}</option>)}
        </select>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="text-xs font-semibold text-gray-500">Número de factura</label>
          <input value={numeroFactura} onChange={(e) => setNumeroFactura(e.target.value)} className="w-full border border-gray-300 rounded p-2 text-sm mt-1" required />
        </div>
        <div>
          <label className="text-xs font-semibold text-gray-500">Monto total a cobrar (Gs)</label>
          <input type="number" value={monto} onChange={(e) => setMonto(e.target.value)} className="w-full border border-gray-300 rounded p-2 text-sm mt-1" required />
        </div>
      </div>

      <div>
        <label className="text-xs font-semibold text-gray-500">Método de pago</label>
        <select value={metodoPago} onChange={(e) => setMetodoPago(e.target.value)} className="w-full border border-gray-300 rounded p-2 text-sm mt-1">
          <option value="Efectivo">Efectivo</option>
          <option value="Tarjeta de Crédito">Tarjeta de Crédito</option>
          <option value="Tarjeta de Débito">Tarjeta de Débito</option>
          <option value="Transferencia Bancaria">Transferencia Bancaria</option>
          <option value="QR">Pago con QR</option>
        </select>
      </div>

      <div>
        <label className="text-xs font-semibold text-gray-500">Notas adicionales</label>
        <textarea value={notas} onChange={(e) => setNotas(e.target.value)} rows={2} className="w-full border border-gray-300 rounded p-2 text-sm mt-1" />
      </div>

      <button disabled={guardando} type="submit" className="bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white font-bold px-6 py-3 rounded-lg text-sm w-full transition-colors mt-2">
        {guardando ? 'Guardando y registrando...' : 'Registrar Factura y Cobrar'}
      </button>
    </form>
  );
}

// ============================================================================
// MARCAS DE VEHÍCULO
// ============================================================================
function MarcasOT({ marcas, categorias, empresaId, notificar, recargar }) {
  const toggleUso = async (m) => {
    const { error } = await supabase.from('marcas').update({ uso_reparacion: !m.uso_reparacion }).eq('id', m.id).eq('empresa_id', empresaId);
    if (error) return notificar.error('Error: ' + error.message);
    notificar.exito(m.uso_reparacion ? 'Marca quitada de OT.' : 'Marca habilitada para OT.');
    recargar();
  };

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h3 className="font-bold text-gray-700 text-sm mb-1">Marcas disponibles para Órdenes de Trabajo</h3>
        <p className="text-xs text-gray-400 mb-3">
          Son las mismas marcas que usás en Productos. Activá el interruptor en las que también querés poder elegir al crear una orden de trabajo. Para agregar una marca nueva, andá a <strong>Productos → Marcas</strong>.
        </p>
        <div className="bg-white border border-gray-200 rounded-xl divide-y divide-gray-100">
          {marcas.map((m) => (
            <div key={m.id} className="flex items-center justify-between p-3">
              <span className="text-sm">{m.nombre}</span>
              <button
                onClick={() => toggleUso(m)}
                className={`w-11 h-6 rounded-full transition-colors relative ${m.uso_reparacion ? 'bg-orange-500' : 'bg-gray-300'}`}
                title={m.uso_reparacion ? 'Usada en OT — click para quitar' : 'No usada en OT — click para agregar'}
              >
                <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${m.uso_reparacion ? 'translate-x-5' : 'translate-x-0.5'}`} />
              </button>
            </div>
          ))}
          {marcas.length === 0 && <p className="p-6 text-center text-sm text-gray-400">Todavía no cargaste ninguna marca en Productos.</p>}
        </div>
      </div>

      <div>
        <h3 className="font-bold text-gray-700 text-sm mb-1">Categorías disponibles para Órdenes de Trabajo</h3>
        <p className="text-xs text-gray-400 mb-3">
          Se comparten todas las categorías de Productos. Para agregar una nueva, andá a <strong>Productos → Categorías</strong>.
        </p>
        <div className="bg-white border border-gray-200 rounded-xl divide-y divide-gray-100">
          {categorias.map((c) => (
            <div key={c.id} className="p-3 text-sm">{c.nombre}</div>
          ))}
          {categorias.length === 0 && <p className="p-6 text-center text-sm text-gray-400">Todavía no cargaste ninguna categoría en Productos.</p>}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// CONFIGURACIONES
// ============================================================================
const PLANTILLAS_OT = [
  { nombre: 'Taller mecánico de autos', descripcion: 'Autos, camionetas y utilitarios: mecánica, frenos, electricidad y service.', categorias: ['Mecánica general','Frenos','Tren delantero y suspensión','Electricidad del auto','Mantenimiento preventivo','Aire acondicionado'], servicios: ['Service completo (aceite y filtros)','Revisión eléctrica','Revisión de tren delantero','Rectificación de discos','Escaneo computarizado','Diagnóstico de motor','Carga de gas del aire','Cambio de pastillas','Cambio de aceite','Alineación y balanceo'], campos: ['Modelo del vehículo','Año','Kilometraje','Color','Chasis / VIN'] },
  { nombre: 'Taller de motos', descripcion: 'Motos y motocargas: service, motor, frenos, transmisión y electricidad.', categorias: ['Motor','Frenos','Transmisión','Electricidad','Service'], servicios: ['Service de moto','Revisión de frenos','Revisión de transmisión','Diagnóstico eléctrico','Reparación de motor'], campos: ['Modelo de la moto','Año','Kilometraje','Color','Nº de chasis'] },
  { nombre: 'Refrigeración y aire acondicionado', descripcion: 'Instalación y reparación de aires, heladeras, freezers y cámaras de frío.', categorias: ['Aire acondicionado','Refrigeración','Instalación'], servicios: ['Diagnóstico de refrigeración','Carga de gas','Limpieza de equipo','Reparación de compresor'], campos: ['Modelo del equipo','Capacidad','Tipo de gas','Ubicación del equipo','Garantía hasta'] },
  { nombre: 'Electricista', descripcion: 'Instalaciones eléctricas, tableros y mantenimiento.', categorias: ['Instalación','Reparación','Tableros','Mantenimiento'], servicios: ['Revisión eléctrica','Instalación de tablero','Reparación de instalación'], campos: ['Dirección del trabajo','Tipo de inmueble','Potencia contratada','Nº de medidor','Contacto en el lugar'] },
  { nombre: 'Servicio técnico', descripcion: 'Celulares, tablets, computadoras, impresoras y electrodomésticos.', categorias: ['Celulares y tablets','Computadoras','Impresoras','Electrodomésticos'], servicios: ['Diagnóstico de equipo','Cambio de pantalla','Reparación electrónica','Limpieza y mantenimiento'], campos: ['Modelo del equipo','Accesorios que deja','Clave / patrón','Garantía hasta','Color'] },
];

const CONFIG_OT_BASE = {
  rubro: 'Como está ahora (textos actuales)', prefijo: 'OT-', estadoPredeterminado: 'Recibido',
  estados: ESTADOS_OT.map((nombre, i) => ({ nombre, color: ['#0000ff','#ffa500','#00a65a','#605ca8','#f39c12','#d81b60','#008000','#777777'][i % 8], orden: i + 1, activo: true, finalizado: ESTADOS_FINALIZADOS.has(nombre) })),
  categoriasServicio: [], servicios: [], camposPersonalizados: ['Kilometraje / Horas de uso','Nivel de combustible','Placa / Matrícula','Color','Chasis / VIN'],
  preguntaCliente: '', fallaReportada: '', condicionRecepcion: '', terminosServicio: '',
  documento: { incluirPagina2: true, condiciones: '', avisoAdicionales: '', declaracion: '' }, productoServicioId: ''
};

function ConfiguracionOT({ empresaId, notificar }) {
  const [config, setConfig] = useState(CONFIG_OT_BASE);
  const [pestana, setPestana] = useState('plantilla');
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [nuevoNombre, setNuevoNombre] = useState('');
  const [nuevoDetalle, setNuevoDetalle] = useState('');
  const [nuevoServicioCategoria, setNuevoServicioCategoria] = useState('');
  const [productoPredeterminado, setProductoPredeterminado] = useState('');
  const pestanas = [
    ['plantilla','Empezar: plantilla de rubro'], ['estados','Estados'], ['categorias','Categorías de servicio'],
    ['servicios','Servicios'], ['marcas','Marcas'], ['ajustes','Configuración del servicio'],
  ];

  useEffect(() => { if (empresaId) cargar(); }, [empresaId]);
  const cargar = async () => {
    setCargando(true);
    const [{ data: empresa, error }, { data: productos }] = await Promise.all([
      supabase.from('empresas').select('configuracion').eq('id', empresaId).maybeSingle(),
      supabase.from('productos').select('id,nombre').eq('empresa_id', empresaId).order('nombre'),
    ]);
    if (!error) setConfig({ ...CONFIG_OT_BASE, ...(empresa?.configuracion?.modulos?.ot || {}), documento: { ...CONFIG_OT_BASE.documento, ...(empresa?.configuracion?.modulos?.ot?.documento || {}) } });
    else notificar.error(`No se pudieron cargar las configuraciones: ${error.message}`);
    setProductoPredeterminado(productos || []);
    setCargando(false);
  };
  const actualizar = (campo, valor) => setConfig((actual) => ({ ...actual, [campo]: valor }));
  const guardar = async () => {
    const estadosValidos = (config.estados || []).filter((e) => e.activo !== false && e.nombre.trim());
    if (!estadosValidos.length) return notificar.error('Debe quedar al menos un estado activo con nombre.');
    if (!estadosValidos.some((e) => e.nombre === config.estadoPredeterminado)) return notificar.error('Seleccioná un estado predeterminado que esté activo.');
    setGuardando(true);
    try {
      const { data: empresa, error: errorLectura } = await supabase.from('empresas').select('configuracion').eq('id', empresaId).maybeSingle();
      if (errorLectura) throw errorLectura;
      const actual = empresa?.configuracion || {};
      const modulos = actual.modulos || {};
      const { error } = await supabase.from('empresas').update({ configuracion: { ...actual, modulos: { ...modulos, ot: config } } }).eq('id', empresaId);
      if (error) throw error;
      notificar.exito('Configuración de OT guardada.');
    } catch (error) { notificar.error(`No se pudo guardar la configuración: ${error.message}`); }
    finally { setGuardando(false); }
  };
  const aplicarPlantilla = (plantilla) => {
    setConfig((actual) => ({ ...actual, rubro: plantilla.nombre, categoriasServicio: Array.from(new Set([...(actual.categoriasServicio || []), ...plantilla.categorias])), servicios: [...(actual.servicios || []), ...plantilla.servicios.filter((nombre) => !(actual.servicios || []).some((s) => s.nombre === nombre)).map((nombre) => ({ nombre, categoria: plantilla.categorias[0] || '', revision: '' }))], camposPersonalizados: plantilla.campos.map((campo, i) => actual.camposPersonalizados?.[i] && actual.camposPersonalizados[i] !== CONFIG_OT_BASE.camposPersonalizados[i] ? actual.camposPersonalizados[i] : campo) }));
    notificar.info('Plantilla cargada en pantalla: agrega opciones sin borrar las que ya tenías. Pulsa Guardar para aplicarla.');
  };
  const agregarCategoria = () => { const nombre = nuevoNombre.trim(); if (!nombre) return; if ((config.categoriasServicio || []).includes(nombre)) return notificar.info('Esa categoría ya existe.'); actualizar('categoriasServicio', [...(config.categoriasServicio || []), nombre]); setNuevoNombre(''); };
  const agregarServicio = () => { const nombre = nuevoNombre.trim(); if (!nombre) return; if ((config.servicios || []).some((s) => s.nombre.toLowerCase() === nombre.toLowerCase())) return notificar.info('Ese servicio ya existe.'); actualizar('servicios', [...(config.servicios || []), { nombre, categoria: nuevoServicioCategoria, revision: nuevoDetalle.trim() }]); setNuevoNombre(''); setNuevoDetalle(''); };
  const agregarEstado = () => { const nombre = nuevoNombre.trim(); if (!nombre) return; if ((config.estados || []).some((e) => e.nombre.toLowerCase() === nombre.toLowerCase())) return notificar.info('Ese estado ya existe.'); actualizar('estados', [...(config.estados || []), { nombre, color: '#64748b', orden: (config.estados || []).length + 1, activo: true, finalizado: false }]); setNuevoNombre(''); };
  const cambiarEstadoConfig = (index, campo, valor) => {
    const anterior = config.estados[index];
    if (campo === 'activo' && !valor && config.estados.filter((e) => e.activo !== false).length <= 1) return notificar.info('Debe quedar al menos un estado activo.');
    const estados = config.estados.map((estado, i) => i === index ? { ...estado, [campo]: valor } : estado);
    actualizar('estados', estados);
    if (campo === 'nombre' && config.estadoPredeterminado === anterior.nombre) actualizar('estadoPredeterminado', valor);
    if (campo === 'activo' && !valor && config.estadoPredeterminado === anterior.nombre) actualizar('estadoPredeterminado', estados.find((e) => e.activo !== false)?.nombre || 'Recibido');
  };
  const eliminarEstadoConfig = (index) => {
    if (config.estados.length <= 1) return notificar.info('Debe quedar al menos un estado activo.');
    const removido = config.estados[index];
    const estados = config.estados.filter((_, i) => i !== index);
    actualizar('estados', estados);
    if (config.estadoPredeterminado === removido.nombre) actualizar('estadoPredeterminado', estados.find((e) => e.activo !== false)?.nombre || estados[0]?.nombre || 'Recibido');
  };
  const label = 'block text-xs font-semibold text-gray-600 mb-1';
  const input = 'w-full rounded border border-gray-300 bg-white p-2.5 text-sm focus:border-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-100';
  if (cargando) return <p className="text-sm text-gray-400">Cargando configuraciones...</p>;
  return <div className="space-y-4">
    <h2 className="text-lg font-bold text-gray-800">Configuraciones de OT</h2>
    <div className="flex flex-wrap border-b border-gray-200">{pestanas.map(([key,titulo]) => <button key={key} onClick={() => setPestana(key)} className={`border-b-2 px-3 py-2 text-sm font-semibold ${pestana === key ? 'border-orange-500 bg-orange-500 text-white' : 'border-transparent text-gray-600 hover:bg-gray-50'}`}>{titulo}</button>)}</div>
    {pestana === 'plantilla' && <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">{PLANTILLAS_OT.map((p) => <article key={p.nombre} className="rounded-xl border bg-white p-5 shadow-sm"><h3 className="font-bold text-gray-800">{p.nombre}</h3><p className="mt-2 text-sm text-gray-500">{p.descripcion}</p><ul className="mt-3 space-y-1 text-xs text-gray-600"><li>✓ {p.categorias.length} categorías de servicio</li><li>✓ {p.servicios.length} servicios con revisión editable</li><li>✓ Campos extra: {p.campos.join(', ')}</li></ul><button onClick={() => aplicarPlantilla(p)} className="mt-4 rounded-lg bg-orange-500 px-4 py-2 text-sm font-bold text-white">Aplicar plantilla</button></article>)}<p className="lg:col-span-2 rounded-lg bg-sky-50 p-3 text-xs text-sky-800">La plantilla añade las categorías y servicios que aún no existen y propone etiquetas de campos para el rubro. Los cambios quedan en borrador hasta pulsar Guardar configuración. Las marcas se administran en la pestaña Marcas.</p></section>}
    {pestana === 'estados' && <section className="rounded-xl border bg-white p-5"><div className="mb-4 grid grid-cols-1 gap-2 md:grid-cols-[1fr_auto]"><input className={input} value={nuevoNombre} onChange={(e) => setNuevoNombre(e.target.value)} placeholder="Nombre del nuevo estado" /><button onClick={agregarEstado} className="rounded bg-orange-500 px-4 py-2 text-sm font-bold text-white">＋ Añadir</button></div><div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="bg-gray-50 text-left text-xs uppercase text-gray-500"><th className="p-3">Nombre de estado</th><th className="p-3">Color</th><th className="p-3">Orden</th><th className="p-3">Finalizado</th><th className="p-3">Activo</th><th className="p-3">Acción</th></tr></thead><tbody>{(config.estados || []).map((estado,i) => <tr key={`${estado.nombre}-${i}`} className="border-t"><td className="p-3"><input className={input} value={estado.nombre} onChange={(e) => cambiarEstadoConfig(i,'nombre',e.target.value)} /></td><td className="p-3"><input aria-label={`Color ${estado.nombre}`} type="color" value={estado.color || '#64748b'} onChange={(e) => cambiarEstadoConfig(i,'color',e.target.value)} /></td><td className="p-3"><input aria-label={`Orden ${estado.nombre}`} type="number" min="1" className="w-20 rounded border p-2" value={estado.orden || i+1} onChange={(e) => cambiarEstadoConfig(i,'orden',Number(e.target.value))} /></td><td className="p-3"><input aria-label={`Marcar ${estado.nombre} como finalizado`} type="checkbox" checked={estado.finalizado ?? ESTADOS_FINALIZADOS.has(estado.nombre)} onChange={(e) => cambiarEstadoConfig(i,'finalizado',e.target.checked)} /></td><td className="p-3"><input type="checkbox" checked={estado.activo !== false} onChange={(e) => cambiarEstadoConfig(i,'activo',e.target.checked)} /></td><td className="p-3"><button onClick={() => eliminarEstadoConfig(i)} className="font-bold text-red-600">Eliminar</button></td></tr>)}</tbody></table></div></section>}
    {pestana === 'categorias' && <section className="rounded-xl border bg-white p-5"><h3 className="mb-3 font-bold">Categorías de servicio</h3><div className="mb-4 flex gap-2"><input className={input} value={nuevoNombre} onChange={(e) => setNuevoNombre(e.target.value)} placeholder="Nueva categoría" /><button onClick={agregarCategoria} className="shrink-0 rounded bg-orange-500 px-4 py-2 text-sm font-bold text-white">＋ Añadir</button></div><div className="divide-y">{(config.categoriasServicio || []).map((c,i) => <div key={`${c}-${i}`} className="flex items-center justify-between py-3 text-sm"><span>{c}</span><button onClick={() => actualizar('categoriasServicio', config.categoriasServicio.filter((_,j) => j !== i))} className="text-red-600">Eliminar</button></div>)}{!config.categoriasServicio?.length && <p className="py-6 text-center text-sm text-gray-400">Todavía no hay categorías personalizadas. Puedes cargar una plantilla de rubro.</p>}</div></section>}
    {pestana === 'servicios' && <section className="rounded-xl border bg-white p-5"><h3 className="mb-3 font-bold">Servicios y lista de revisión al recibir</h3><div className="grid grid-cols-1 gap-2 md:grid-cols-3"><input className={input} value={nuevoNombre} onChange={(e) => setNuevoNombre(e.target.value)} placeholder="Nombre del servicio" /><select className={input} value={nuevoServicioCategoria} onChange={(e) => setNuevoServicioCategoria(e.target.value)}><option value="">Categoría</option>{(config.categoriasServicio || []).map((c) => <option key={c}>{c}</option>)}</select><input className={input} value={nuevoDetalle} onChange={(e) => setNuevoDetalle(e.target.value)} placeholder="Revisiones, separadas por coma" /></div><button onClick={agregarServicio} className="mt-2 rounded bg-orange-500 px-4 py-2 text-sm font-bold text-white">＋ Añadir servicio</button><div className="mt-4 space-y-3">{(config.servicios || []).map((s,i) => <div key={`${s.nombre}-${i}`} className="grid grid-cols-1 items-center gap-2 rounded-lg border p-3 md:grid-cols-[1fr_1fr_2fr_auto]"><input aria-label="Nombre del servicio" className={input} value={s.nombre} onChange={(e) => actualizar('servicios', config.servicios.map((x,j) => j === i ? { ...x, nombre:e.target.value } : x))} /><select aria-label="Categoría de servicio" className={input} value={s.categoria || ''} onChange={(e) => actualizar('servicios', config.servicios.map((x,j) => j === i ? { ...x, categoria:e.target.value } : x))}><option value="">Sin categoría</option>{(config.categoriasServicio || []).map((c) => <option key={c}>{c}</option>)}</select><input aria-label="Checklist del servicio" className={input} value={s.revision || ''} onChange={(e) => actualizar('servicios', config.servicios.map((x,j) => j === i ? { ...x, revision:e.target.value } : x))} placeholder="Checklist / revisión al recibir" /><button onClick={() => actualizar('servicios', config.servicios.filter((_,j) => j !== i))} className="text-sm text-red-600">Eliminar</button></div>)}{!config.servicios?.length && <p className="py-5 text-center text-sm text-gray-400">No hay servicios personalizados; puedes cargar una plantilla.</p>}</div></section>}
    {pestana === 'marcas' && <section className="rounded-xl border bg-white p-5"><h3 className="font-bold">Marcas para OT</h3><p className="mt-2 text-sm text-gray-600">Las marcas se gestionan en la pestaña Marcas. Edita una marca y activa “Uso para reparación” para que aparezca en Nueva OT.</p></section>}
    {pestana === 'ajustes' && <section className="space-y-5 rounded-xl border bg-white p-5"><h3 className="font-bold">Configuración del servicio</h3><div className="grid grid-cols-1 gap-4 md:grid-cols-2"><div><label className={label}>Rubro del taller</label><select className={input} value={config.rubro} onChange={(e) => actualizar('rubro',e.target.value)}><option>Como está ahora (textos actuales)</option>{PLANTILLAS_OT.map((p) => <option key={p.nombre}>{p.nombre}</option>)}</select></div><div><label className={label}>Mano de obra / servicio por defecto</label><select className={input} value={config.productoServicioId || ''} onChange={(e) => actualizar('productoServicioId',e.target.value)}><option value="">Sin producto predeterminado</option>{(productoPredeterminado || []).map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}</select></div><div><label className={label}>Estado de OT predeterminado</label><select className={input} value={config.estadoPredeterminado} onChange={(e) => actualizar('estadoPredeterminado',e.target.value)}>{config.estados.filter((e) => e.activo !== false).map((e) => <option key={e.nombre}>{e.nombre}</option>)}</select></div><div><label className={label}>Prefijo de número de OT</label><input className={input} value={config.prefijo} onChange={(e) => actualizar('prefijo',e.target.value)} /></div></div><div className="grid grid-cols-1 gap-4 md:grid-cols-2">{[['preguntaCliente','Qué pide el cliente'],['fallaReportada','Falla que reporta el cliente'],['condicionRecepcion','Estado al recibir (golpes, rayones, faltantes, combustible)']].map(([key,titulo]) => <div key={key}><label className={label}>{titulo}</label><textarea rows={4} className={input} value={config[key] || ''} onChange={(e) => actualizar(key,e.target.value)} placeholder="Escribe texto inicial o sugerencias, una por línea" /></div>)}</div><div><h4 className="mb-2 font-semibold text-gray-700">Etiquetas para campos personalizados</h4><div className="grid grid-cols-1 gap-3 md:grid-cols-2">{(config.camposPersonalizados || []).map((campo,i) => <div key={i}><label className={label}>Campo {i+1}</label><input className={input} value={campo} onChange={(e) => actualizar('camposPersonalizados',config.camposPersonalizados.map((x,j) => j === i ? e.target.value : x))} /></div>)}</div></div><div><label className={label}>Términos y condiciones del servicio</label><textarea rows={7} className={input} value={config.terminosServicio || ''} onChange={(e) => actualizar('terminosServicio',e.target.value)} /></div><div className="border-t pt-4"><h4 className="font-semibold">Documento “Orden de servicio”</h4><label className="mt-3 flex items-center gap-2 text-sm"><input type="checkbox" checked={config.documento.incluirPagina2} onChange={(e) => actualizar('documento',{...config.documento,incluirPagina2:e.target.checked})} />Incluir página 2 con condiciones del servicio</label><div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">{[['condiciones','Condiciones del servicio (página 2)'],['avisoAdicionales','Aviso de trabajos adicionales (página 1)'],['declaracion','Declaración del cliente (página 1)']].map(([key,titulo]) => <div key={key}><label className={label}>{titulo}</label><textarea rows={5} className={input} value={config.documento[key] || ''} onChange={(e) => actualizar('documento',{...config.documento,[key]:e.target.value})} /></div>)}</div></div></section>}
    <div className="flex justify-end"><button disabled={guardando} onClick={guardar} className="rounded-lg bg-orange-500 px-6 py-2.5 text-sm font-bold text-white disabled:opacity-50">{guardando ? 'Guardando…' : 'Guardar configuración'}</button></div>
  </div>;
}
