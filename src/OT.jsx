import { useEffect, useMemo, useState } from 'react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { supabase } from './supabaseClient';
import { useEmpresaInfo } from './utils/useEmpresa';
import { useNotificacion } from './NotificacionContext';

const ESTADOS_OT = ['Pendiente', 'Recibido', 'En proceso', 'Entregado', 'Completado'];

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

  const [subTab, setSubTab] = useState('lista');

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
      supabase.from('clientes').select('id, nombre').eq('empresa_id', empresaId).order('nombre'),
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
      <div className="flex flex-wrap gap-1 border-b border-gray-200 mb-5">
        {[
          { key: 'lista', label: 'Lista de OT' },
          { key: 'agregar', label: 'Agregar hoja de trabajo' },
          { key: 'facturas', label: 'Listar facturas' },
          { key: 'agregar_factura', label: 'Agregar factura' },
          { key: 'marcas', label: 'Marcas / Categorías' },
          { key: 'config', label: 'Configuraciones' },
        ].map((t) => (
          <button
            key={t.key}
            onClick={() => setSubTab(t.key)}
            className={`px-4 py-2 text-sm font-semibold rounded-t-lg border-b-2 -mb-px transition-colors ${
              subTab === t.key
                ? 'border-orange-500 text-orange-600 bg-orange-50'
                : 'border-transparent text-gray-500 hover:text-gray-700'
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

          {subTab === 'agregar' && (
            <AgregarHojaDeTrabajo
              clientes={clientes}
              ubicaciones={ubicaciones}
              marcasVehiculo={marcasVehiculo}
              categoriasArticulo={categoriasArticulo}
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
            <MarcasOT
              marcas={marcasVehiculo}
              categorias={categoriasArticulo}
              empresaId={empresaId}
              notificar={notificar}
              recargar={cargarTodo}
            />
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

  const filtradas = useMemo(() => {
    return ordenes.filter((o) => {
      if (tab === 'pendiente' && o.estado === 'Completado') return false;
      if (tab === 'completado' && o.estado !== 'Completado') return false;
      if (fUbicacion && o.ubicacion_id !== fUbicacion) return false;
      if (fCliente && String(o.cliente_id) !== String(fCliente)) return false;
      if (fTecnico && o.tecnico !== fTecnico) return false;
      if (fEstado && o.estado !== fEstado) return false;
      if (busqueda) {
        const q = busqueda.toLowerCase();
        const enTexto = `${o.numero_ot} ${o.cliente_nombre} ${o.vehiculo} ${o.marca} ${o.categoria_articulo} ${o.tecnico}`.toLowerCase();
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
    { key: 'cliente_nombre', label: 'Cliente' }, { key: 'categoria_articulo', label: 'Categoría' }, { key: 'vehiculo', label: 'Detalle' },
  ];

  const exportarCSV = () => {
    const filas = [columnasExport.map((c) => c.label).join(',')];
    filtradas.forEach((o) => filas.push(columnasExport.map((c) => `"${String(o[c.key] ?? '').replace(/"/g, '""')}"`).join(',')));
    descargarArchivo(filas.join('\n'), 'ordenes_de_trabajo.csv', 'text/csv;charset=utf-8;');
  };

  const exportarExcel = () => {
    let html = '<table><tr>' + columnasExport.map((c) => `<th>${c.label}</th>`).join('') + '</tr>';
    filtradas.forEach((o) => { html += '<tr>' + columnasExport.map((c) => `<td>${o[c.key] ?? ''}</td>`).join('') + '</tr>'; });
    html += '</table>';
    descargarArchivo(html, 'ordenes_de_trabajo.xls', 'application/vnd.ms-excel');
  };

  const exportarPDF = () => {
    const doc = new jsPDF();
    doc.text(`Órdenes de Trabajo - ${nombreDelNegocio || ''}`, 14, 12);
    autoTable(doc, {
      startY: 18,
      head: [columnasExport.map((c) => c.label)],
      body: filtradas.map((o) => columnasExport.map((c) => String(o[c.key] ?? ''))),
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
              {ESTADOS_OT.map((e) => <option key={e} value={e}>{e}</option>)}
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
              <th className="p-3 text-left">Detalle</th>
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
                      {ESTADOS_OT.filter((e) => e !== o.estado).map((e) => (
                        <button key={e} onClick={() => cambiarEstado(o, e)} className="block w-full text-left px-3 py-2 hover:bg-gray-50">Marcar como {e}</button>
                      ))}
                      <button onClick={() => eliminarOT(o)} className="block w-full text-left px-3 py-2 hover:bg-red-50 text-red-600 border-t border-gray-100">Eliminar</button>
                    </div>
                  )}
                </td>
                <td className="p-3">{o.tipo || 'Servicio'}</td>
                <td className="p-3 text-gray-500">{o.fecha_hora ? new Date(o.fecha_hora).toLocaleString('es-PY') : '—'}</td>
                <td className="p-3 font-semibold">{o.numero_ot}</td>
                <td className="p-3">{o.factura_numero || '—'}</td>
                <td className="p-3"><span className={`px-2 py-0.5 rounded-full text-xs font-bold ${badgeEstado(o.estado)}`}>{o.estado}</span></td>
                <td className="p-3">{o.tecnico || '—'}</td>
                <td className="p-3">{o.cliente_nombre || 'Cliente ocasional'}</td>
                <td className="p-3 text-gray-500">{nombreUbicacion(o.ubicacion_id)}</td>
                <td className="p-3">{o.categoria_articulo || '—'}</td>
                <td className="p-3">{o.marca || '—'}</td>
                <td className="p-3 text-gray-500">{o.vehiculo || '—'}</td>
              </tr>
            ))}
            {paginadas.length === 0 && (
              <tr><td colSpan={12} className="p-8 text-center text-gray-400">No hay órdenes de trabajo para mostrar.</td></tr>
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
function AgregarHojaDeTrabajo({ clientes, ubicaciones, marcasVehiculo, categoriasArticulo, empresaId, notificar, onGuardado }) {
  const marcasParaOT = marcasVehiculo.filter((m) => m.uso_reparacion);
  const [clienteId, setClienteId] = useState('');
  const [clienteNombreLibre, setClienteNombreLibre] = useState('');
  const [ubicacionId, setUbicacionId] = useState('');
  const [categoriaArticulo, setCategoriaArticulo] = useState('');
  const [vehiculo, setVehiculo] = useState('');
  const [marca, setMarca] = useState('');
  const [tecnico, setTecnico] = useState('');
  const [tipo, setTipo] = useState('Servicio');
  const [notas, setNotas] = useState('');
  const [guardando, setGuardando] = useState(false);

  const guardar = async (e) => {
    e.preventDefault();
    setGuardando(true);
    try {
      const { data: numeroOt, error: errorNumero } = await supabase.rpc('siguiente_numero_ot');
      if (errorNumero) throw errorNumero;

      const clienteSeleccionado = clientes.find((c) => String(c.id) === String(clienteId));
      const { error } = await supabase.from('ordenes_trabajo').insert([{
        empresa_id: empresaId,
        numero_ot: numeroOt,
        tipo,
        ubicacion_id: ubicacionId || null,
        cliente_id: clienteId || null,
        cliente_nombre: clienteSeleccionado?.nombre || clienteNombreLibre || 'Cliente ocasional',
        categoria_articulo: categoriaArticulo,
        vehiculo,
        marca,
        tecnico,
        estado: 'Pendiente',
        notas,
      }]);
      if (error) throw error;

      notificar.exito(`Orden ${numeroOt} creada con éxito.`);

      setClienteId(''); setClienteNombreLibre(''); setUbicacionId(''); setCategoriaArticulo(''); setVehiculo(''); setMarca(''); setTecnico(''); setNotas('');
      onGuardado();
    } catch (err) {
      notificar.error('Error al crear la orden: ' + err.message);
    } finally {
      setGuardando(false);
    }
  };

  return (
    <form onSubmit={guardar} className="bg-white border border-gray-200 rounded-xl p-5 max-w-3xl space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="text-xs text-gray-500">Tipo</label>
          <select value={tipo} onChange={(e) => setTipo(e.target.value)} className="w-full border border-gray-300 rounded p-2 text-sm mt-1">
            <option>Servicio</option>
            <option>Reparación</option>
            <option>Diagnóstico</option>
            <option>Mantenimiento</option>
            <option>Otro</option>
          </select>
        </div>
        <div>
          <label className="text-xs text-gray-500">Ubicación</label>
          <select value={ubicacionId} onChange={(e) => setUbicacionId(e.target.value)} className="w-full border border-gray-300 rounded p-2 text-sm mt-1">
            <option value="">Seleccionar...</option>
            {ubicaciones.map((u) => <option key={u.id} value={u.id}>{u.nombre}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs text-gray-500">Cliente registrado (opcional)</label>
          <select value={clienteId} onChange={(e) => setClienteId(e.target.value)} className="w-full border border-gray-300 rounded p-2 text-sm mt-1">
            <option value="">Cliente ocasional</option>
            {clientes.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
          </select>
        </div>
        {!clienteId && (
          <div>
            <label className="text-xs text-gray-500">Nombre del cliente ocasional</label>
            <input value={clienteNombreLibre} onChange={(e) => setClienteNombreLibre(e.target.value)} placeholder="Ej: CLIENTE OCASIONAL" className="w-full border border-gray-300 rounded p-2 text-sm mt-1" />
          </div>
        )}
        <div>
          <label className="text-xs text-gray-500">Categoría del artículo</label>
          <select value={categoriaArticulo} onChange={(e) => setCategoriaArticulo(e.target.value)} className="w-full border border-gray-300 rounded p-2 text-sm mt-1">
            <option value="">Seleccionar...</option>
            {categoriasArticulo.map((c) => <option key={c.id} value={c.nombre}>{c.nombre}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs text-gray-500">Detalle del artículo (vehículo, joya, reloj, accesorio, etc.)</label>
          <input value={vehiculo} onChange={(e) => setVehiculo(e.target.value)} placeholder="Ej: Toyota Vitz 2010 Azul / Anillo de oro 18k / Reloj Casio" className="w-full border border-gray-300 rounded p-2 text-sm mt-1" />
        </div>
        <div>
          <label className="text-xs text-gray-500">Marca / material</label>
          <select value={marca} onChange={(e) => setMarca(e.target.value)} className="w-full border border-gray-300 rounded p-2 text-sm mt-1">
            <option value="">Seleccionar...</option>
            {marcasParaOT.map((m) => <option key={m.id} value={m.nombre}>{m.nombre}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs text-gray-500">Técnico asignado</label>
          <input value={tecnico} onChange={(e) => setTecnico(e.target.value)} placeholder="Ej: Ruben" className="w-full border border-gray-300 rounded p-2 text-sm mt-1" />
        </div>
      </div>
      <div>
        <label className="text-xs text-gray-500">Notas / detalle del trabajo</label>
        <textarea value={notas} onChange={(e) => setNotas(e.target.value)} rows={4} className="w-full border border-gray-300 rounded p-2 text-sm mt-1" />
      </div>
      <button disabled={guardando} type="submit" className="bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white font-bold px-6 py-2.5 rounded-lg text-sm">
        {guardando ? 'Guardando...' : 'Crear orden de trabajo'}
      </button>
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
function ConfiguracionOT({ empresaId, notificar }) {
  const [contador, setContador] = useState(null);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    if (empresaId) cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empresaId]);

  const cargar = async () => {
    setCargando(true);
    const anioActual = new Date().getFullYear();
    const { data } = await supabase.from('ot_contadores').select('*').eq('empresa_id', empresaId).eq('anio', anioActual).maybeSingle();
    setContador(data);
    setCargando(false);
  };

  if (cargando) return <p className="text-sm text-gray-400">Cargando...</p>;

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5 max-w-xl">
      <h3 className="font-bold text-gray-800 mb-4">Numeración de órdenes de trabajo</h3>
      <p className="text-sm text-gray-600 mb-1">
        Prefijo actual: <strong>{contador?.prefijo || 'OT'}</strong>
      </p>
      <p className="text-sm text-gray-600 mb-4">
        Último número emitido este año: <strong>{contador?.ultimo_numero ?? 0}</strong>
      </p>
      <p className="text-xs text-gray-400">
        El próximo número se genera automáticamente al crear una hoja de trabajo (formato {contador?.prefijo || 'OT'}-{new Date().getFullYear()}/000X).
        Si necesitás cambiar el prefijo o reiniciar la numeración, pedíselo a tu desarrollador para hacerlo directo en la base de datos.
      </p>
    </div>
  );
}