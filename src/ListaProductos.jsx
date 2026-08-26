import AgregarProducto from './AgregarProducto';
import AperturaStock from './AperturaStock';
import DetalleProducto from './utils/DetalleProducto';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { jsPDF } from 'jspdf';
import { supabase } from './supabaseClient';
import { useEmpresaInfo } from './utils/useEmpresa';
import { useUbicacionUsuario } from './utils/useUbicacion';
import { useSucursalActiva } from './utils/SucursalContext';
import { cargarMapaStockPorUbicacion } from './utils/stockUbicacion';
import { useNotificacion } from './NotificacionContext';

export default function ListaProductos() {
  const { id: empresaId, nombre: nombreEmpresa } = useEmpresaInfo();
  const { confirmar } = useNotificacion();
  const { nombre: nombreUbicacionUsuario, ve_todas: usuarioVeTodas } = useUbicacionUsuario();
  // sucursalActiva: la elegida en el selector global del header.
  // Si el usuario está fijo a una sola sucursal, el contexto ya la deja bloqueada acá también.
  const { sucursalActiva, nombreSucursalActiva } = useSucursalActiva();
  const [mapaStockUbicacion, setMapaStockUbicacion] = useState({});
  const [productos, setProductos] = useState([]);
  const [busqueda, setBusqueda] = useState('');

  // Estados para los Filtros Superiores (igual que antes)
  const [filtroCategoria, setFiltroCategoria] = useState('Todos');
  const [filtroMarca, setFiltroMarca] = useState('Todos');

  // Filtros nuevos, clonados de CDEpos (funcionales con datos reales)
  const [filtroUnidad, setFiltroUnidad] = useState('Todos');
  const [filtroIva, setFiltroIva] = useState('Todos');
  const [filtroUbicacionLista, setFiltroUbicacionLista] = useState('Todos');
  const [filtroEstadoStock, setFiltroEstadoStock] = useState('Todos');
  const [filtroNoParaVender, setFiltroNoParaVender] = useState(false);
  const [filtroSoloAlerta, setFiltroSoloAlerta] = useState(false);
  const [stockMin, setStockMin] = useState('');
  const [stockMax, setStockMax] = useState('');

  const [marcasDisponibles, setMarcasDisponibles] = useState([]);
  const [unidadesDisponibles, setUnidadesDisponibles] = useState([]);
  const [categoriasDisponibles, setCategoriasDisponibles] = useState([]);
  const [ubicacionesDisponibles, setUbicacionesDisponibles] = useState([]);

  // Estados nuevos para la estructura tipo CDEpos
  const [tabActiva, setTabActiva] = useState('todos');
  const [seleccionados, setSeleccionados] = useState([]);
  const [accionAbierta, setAccionAbierta] = useState(null);
  const [posicionMenu, setPosicionMenu] = useState({ top: 0, left: 0 });
  const [productoStockInicial, setProductoStockInicial] = useState(null);
  const [productoHistorial, setProductoHistorial] = useState(null);
  const [historialMovimientos, setHistorialMovimientos] = useState([]);
  const [cargandoHistorial, setCargandoHistorial] = useState(false);
  const [paginaActual, setPaginaActual] = useState(1);
  const [porPagina, setPorPagina] = useState(25);
  const [mostrarFormularioNuevo, setMostrarFormularioNuevo] = useState(false);
  const [productoEditando, setProductoEditando] = useState(null);
  const [productoDetalle, setProductoDetalle] = useState(null);

  useEffect(() => {
    cargarProductos();
  }, [empresaId]);

  useEffect(() => {
    const actualizarCuandoCambiaStock = () => {
      cargarProductos();
      if (empresaId) cargarMapaStockPorUbicacion(empresaId).then(setMapaStockUbicacion);
    };
    window.addEventListener('stock-actualizado', actualizarCuandoCambiaStock);
    window.addEventListener('focus', actualizarCuandoCambiaStock);
    return () => {
      window.removeEventListener('stock-actualizado', actualizarCuandoCambiaStock);
      window.removeEventListener('focus', actualizarCuandoCambiaStock);
    };
  }, [empresaId]);

  useEffect(() => {
    const cargarListasFiltro = async () => {
      if (!empresaId) return;
      const [rMarcas, rUnidades, rCategorias, rUbicaciones] = await Promise.all([
        supabase.from('marcas').select('id, nombre').eq('empresa_id', empresaId).order('nombre'),
        supabase.from('unidades').select('id, nombre').eq('empresa_id', empresaId).order('nombre'),
        supabase.from('categorias_productos').select('id, nombre').eq('empresa_id', empresaId).order('nombre'),
        supabase.from('ubicaciones_comerciales').select('id, nombre').eq('empresa_id', empresaId).eq('activo', true).order('nombre'),
      ]);
      if (rMarcas.data) setMarcasDisponibles(rMarcas.data);
      if (rUnidades.data) setUnidadesDisponibles(rUnidades.data);
      if (rCategorias.data) setCategoriasDisponibles(rCategorias.data);
      if (rUbicaciones.data) setUbicacionesDisponibles(rUbicaciones.data);
    };
    cargarListasFiltro();
  }, [empresaId]);

  const cargarProductos = async () => {
    let query = supabase
      .from('productos')
      .select('*')
      .order('nombre', { ascending: true });

    if (empresaId) query = query.eq('empresa_id', empresaId);

    const { data, error } = await query;

    if (!error && data) setProductos(data);
  };

  const stockVisible = (producto) => {
    const stockSucursal = sucursalActiva ? mapaStockUbicacion[producto.id]?.[sucursalActiva] : undefined;
    return stockSucursal !== undefined ? Number(stockSucursal) : Number(producto.stock_actual) || 0;
  };

  useEffect(() => {
    if (!empresaId) return;
    cargarMapaStockPorUbicacion(empresaId).then(setMapaStockUbicacion);
  }, [empresaId, productos.length]);

  // Filtrado en tiempo real (Buscador + Selects) — misma lógica que ya tenías, extendida
  const productosFiltrados = productos.filter(p => {
    const coincideBusqueda = p.nombre.toLowerCase().includes(busqueda.toLowerCase()) ||
      (p.codigo && p.codigo.toLowerCase().includes(busqueda.toLowerCase()));
    const coincideCategoria = filtroCategoria === 'Todos' || p.categoria === filtroCategoria;
    const coincideMarca = filtroMarca === 'Todos' || p.marca === filtroMarca;
    const coincideTab = tabActiva === 'todos' || (tabActiva === 'stock' && Number(p.stock_actual) <= Number(p.alerta_stock_bajo || 5));
    const coincideUnidad = filtroUnidad === 'Todos' || String(p.unidad_id) === filtroUnidad;
    const coincideIva = filtroIva === 'Todos' || p.iva === filtroIva;
    const coincideUbicacion = filtroUbicacionLista === 'Todos' || Number(mapaStockUbicacion[p.id]?.[filtroUbicacionLista] || 0) > 0;
    const stockActual = stockVisible(p);
    const umbral = Number(p.alerta_stock_bajo) || 5;
    const coincideEstadoStock =
      filtroEstadoStock === 'Todos' ||
      (filtroEstadoStock === 'con_stock' && stockActual > 0) ||
      (filtroEstadoStock === 'sin_stock' && stockActual <= 0) ||
      (filtroEstadoStock === 'stock_bajo' && stockActual > 0 && stockActual <= umbral);
    const coincideNoParaVender = !filtroNoParaVender || p.activo === false;
    const coincideSoloAlerta = !filtroSoloAlerta || (stockActual <= umbral);
    const coincideStockMin = stockMin === '' || stockActual >= Number(stockMin);
    const coincideStockMax = stockMax === '' || stockActual <= Number(stockMax);

    return coincideBusqueda && coincideCategoria && coincideMarca && coincideTab &&
      coincideUnidad && coincideIva && coincideUbicacion && coincideEstadoStock &&
      coincideNoParaVender && coincideSoloAlerta && coincideStockMin && coincideStockMax;
  });

  // Paginación (client-side, sobre el resultado ya filtrado)
  const totalPaginas = Math.max(1, Math.ceil(productosFiltrados.length / porPagina));
  const paginaSegura = Math.min(paginaActual, totalPaginas);
  const productosPagina = productosFiltrados.slice((paginaSegura - 1) * porPagina, paginaSegura * porPagina);

  useEffect(() => {
    setPaginaActual(1);
  }, [busqueda, filtroCategoria, filtroMarca, tabActiva, porPagina, filtroUnidad, filtroIva, filtroUbicacionLista, filtroEstadoStock, filtroNoParaVender, filtroSoloAlerta, stockMin, stockMax]);

  const todosSeleccionadosEnPagina = productosPagina.length > 0 && productosPagina.every((p) => seleccionados.includes(p.id));

  const toggleSeleccionarTodos = () => {
    if (todosSeleccionadosEnPagina) {
      setSeleccionados(seleccionados.filter((id) => !productosPagina.some((p) => p.id === id)));
    } else {
      const nuevos = productosPagina.map((p) => p.id).filter((id) => !seleccionados.includes(id));
      setSeleccionados([...seleccionados, ...nuevos]);
    }
  };

  const toggleSeleccionarUno = (id) => {
    setSeleccionados(seleccionados.includes(id) ? seleccionados.filter((x) => x !== id) : [...seleccionados, id]);
  };

  const eliminarProducto = async (id) => {
    if (!(await confirmar('Este producto será eliminado permanentemente.', { titulo: '¿Estás seguro?', textoConfirmar: 'Eliminar', textoCancelar: 'Cancelar', peligroso: true }))) return;
    const { error } = await supabase.from('productos').delete().eq('id', id).eq('empresa_id', empresaId);
    if (error) return alert('Error al eliminar: ' + error.message);
    setProductos(productos.filter((p) => p.id !== id));
    setSeleccionados(seleccionados.filter((x) => x !== id));
    setAccionAbierta(null);
  };

  const imprimirEtiqueta = (prod) => {
    setAccionAbierta(null);
    try {
      const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: [50, 30] });
      doc.setFont('Helvetica', 'bold');
      doc.setFontSize(8);
      doc.text(prod.nombre.slice(0, 40), 3, 6, { maxWidth: 44 });
      doc.setFontSize(11);
      doc.text(`Gs ${Number(prod.precio_venta || 0).toLocaleString('es-PY')}`, 3, 18);
      doc.setFont('Helvetica', 'normal');
      doc.setFontSize(9);
      doc.text(prod.codigo || '—', 3, 26);
      doc.save(`Etiqueta_${prod.codigo || prod.id}.pdf`);
    } catch (error) {
      alert('Error al generar la etiqueta: ' + error.message);
    }
  };

  const duplicarProducto = async (prod) => {
    setAccionAbierta(null);
    if (!window.confirm(`¿Duplicar "${prod.nombre}"? Se crea una copia nueva con stock en 0.`)) return;
    const { id, ...resto } = prod;
    const { error } = await supabase.from('productos').insert([{
      ...resto,
      empresa_id: empresaId,
      nombre: `${prod.nombre} (copia)`,
      stock_actual: 0,
      codigo: prod.codigo ? `${prod.codigo}-COPIA` : null,
    }]);
    if (error) return alert('Error al duplicar: ' + error.message);
    cargarProductos();
  };

  const abrirHistorialExistencias = async (prod) => {
    setAccionAbierta(null);
    setProductoHistorial(prod);
    setCargandoHistorial(true);
    const [rVentas, rCompras] = await Promise.all([
      supabase.from('detalle_ventas').select('cantidad, subtotal, ventas(fecha)').eq('producto_id', prod.id),
      supabase.from('detalle_compras').select('cantidad, costo_unitario, compras(fecha)').eq('producto_id', prod.id),
    ]);
    const movimientos = [
      ...(rVentas.data || []).map((v) => ({ tipo: 'Venta (salida)', fecha: v.ventas?.fecha, cantidad: -Number(v.cantidad || 0) })),
      ...(rCompras.data || []).map((c) => ({ tipo: 'Compra (entrada)', fecha: c.compras?.fecha, cantidad: Number(c.cantidad || 0) })),
    ]
      .filter((m) => m.fecha)
      .sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
    setHistorialMovimientos(movimientos);
    setCargandoHistorial(false);
  };

  const eliminarSeleccionados = async () => {
    if (seleccionados.length === 0) return alert('Seleccioná al menos un producto.');
    if (!(await confirmar(`${seleccionados.length} producto(s) serán eliminados permanentemente.`, { titulo: '¿Estás seguro?', textoConfirmar: 'Eliminar', textoCancelar: 'Cancelar', peligroso: true }))) return;
    const { error } = await supabase.from('productos').delete().in('id', seleccionados).eq('empresa_id', empresaId);
    if (error) return alert('Error al eliminar: ' + error.message);
    setProductos(productos.filter((p) => !seleccionados.includes(p.id)));
    setSeleccionados([]);
  };

  const toggleActivoSeleccionados = async () => {
    if (seleccionados.length === 0) return alert('Seleccioná al menos un producto.');
    const seleccionadosData = productos.filter((p) => seleccionados.includes(p.id));
    // Si todos los seleccionados ya están activos, los desactiva. Si hay alguno inactivo, los reactiva a todos.
    const todosActivos = seleccionadosData.every((p) => p.activo !== false);
    const nuevoValor = !todosActivos ? true : false;
    if (!window.confirm(`¿${nuevoValor ? 'Activar' : 'Desactivar (marcar como "No para vender")'} ${seleccionados.length} producto(s)?`)) return;
    const { error } = await supabase.from('productos').update({ activo: nuevoValor }).in('id', seleccionados).eq('empresa_id', empresaId);
    if (error) return alert('Error al actualizar: ' + error.message);
    setProductos(productos.map((p) => (seleccionados.includes(p.id) ? { ...p, activo: nuevoValor } : p)));
    setSeleccionados([]);
  };

  const agregarSeleccionadosAUbicacion = async () => {
    if (seleccionados.length === 0) return alert('Seleccioná al menos un producto.');
    if (ubicacionesDisponibles.length === 0) return alert('Todavía no tenés sucursales cargadas en Configuraciones → Ubicaciones comerciales.');
    const nombresUbicacion = ubicacionesDisponibles.map((u, i) => `${i + 1}) ${u.nombre}`).join('\n');
    const eleccion = prompt(`¿A qué sucursal agregás estos ${seleccionados.length} producto(s)? Escribí el número:\n${nombresUbicacion}`);
    const ubicacion = ubicacionesDisponibles[Number(eleccion) - 1];
    if (!ubicacion) return;
    for (const id of seleccionados) {
      const { data: filaExistente } = await supabase
        .from('producto_stock_ubicacion')
        .select('id')
        .eq('producto_id', id)
        .eq('ubicacion_id', ubicacion.id)
        .maybeSingle();
      if (!filaExistente) {
        await supabase.from('producto_stock_ubicacion').insert([{ empresa_id: empresaId, producto_id: id, ubicacion_id: ubicacion.id, cantidad: 0 }]);
      }
    }
    cargarMapaStockPorUbicacion(empresaId).then(setMapaStockUbicacion);
    alert(`Listo. Esos productos ya figuran en "${ubicacion.nombre}" (con 0 de stock inicial, cargalo desde Apertura de stock o una compra).`);
    setSeleccionados([]);
  };

  const quitarSeleccionadosDeUbicacion = async () => {
    if (seleccionados.length === 0) return alert('Seleccioná al menos un producto.');
    if (ubicacionesDisponibles.length === 0) return alert('Todavía no tenés sucursales cargadas.');
    const nombresUbicacion = ubicacionesDisponibles.map((u, i) => `${i + 1}) ${u.nombre}`).join('\n');
    const eleccion = prompt(`¿De qué sucursal quitás estos ${seleccionados.length} producto(s)? Escribí el número:\n${nombresUbicacion}`);
    const ubicacion = ubicacionesDisponibles[Number(eleccion) - 1];
    if (!ubicacion) return;
    if (!(await confirmar(`Se eliminará el registro de stock de esos productos en "${ubicacion.nombre}". No se borrarán los productos ni el stock de otras sucursales.`, { titulo: '¿Estás seguro?', textoConfirmar: 'Eliminar stock', textoCancelar: 'Cancelar', peligroso: true }))) return;
    const { error } = await supabase.from('producto_stock_ubicacion').delete().in('producto_id', seleccionados).eq('ubicacion_id', ubicacion.id).eq('empresa_id', empresaId);
    if (error) return alert('Error: ' + error.message);
    cargarMapaStockPorUbicacion(empresaId).then(setMapaStockUbicacion);
    setSeleccionados([]);
  };

  const exportarCSV = () => {
    const filas = [
      ['Producto', 'Ubicación', 'Precio Compra', 'Precio Venta', 'Stock', 'Categoría', 'Marca', 'IVA', 'SKU'],
      ...productosFiltrados.map((p) => [
        p.nombre, nombreEmpresa, p.precio_compra || 0, p.precio_venta || 0,
        p.stock_actual || 0, p.categoria || '', p.marca || '', p.iva || 'IVA 10%', p.codigo || '',
      ]),
    ];
    const csv = filas.map((f) => f.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'productos.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  if (mostrarFormularioNuevo) {
    return (
      <AgregarProducto
        productoEditar={productoEditando}
        onGuardado={() => {
          setMostrarFormularioNuevo(false);
          setProductoEditando(null);
          cargarProductos();
        }}
        onCancelar={() => {
          setMostrarFormularioNuevo(false);
          setProductoEditando(null);
        }}
      />
    );
  }

  return (
    <div className="bg-transparent text-sm text-gray-700">

      {/* 1. SECCIÓN DE FILTROS AVANZADOS (clonado de CDEpos, con datos reales donde existen) */}
      <div className="bg-white p-4 rounded-lg shadow-sm border-t-2 border-[#004284] mb-4">
        <h3 className="text-xs font-bold text-gray-500 mb-3 uppercase tracking-wider">🔻 Filtros</h3>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div title="Tu sistema todavía no distingue tipos de producto (individual/combo/servicio)">
            <label className="block text-xs font-bold text-gray-400 mb-1">Tipo de producto:</label>
            <select disabled className="w-full border rounded p-1.5 bg-gray-50 text-gray-400 cursor-not-allowed"><option>Todos</option></select>
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-500 mb-1">Categoría:</label>
            <select className="w-full border rounded p-1.5 bg-white" value={filtroCategoria} onChange={(e) => setFiltroCategoria(e.target.value)}>
              <option value="Todos">(Todos)</option>
              {categoriasDisponibles.map((c) => <option key={c.id} value={c.nombre}>{c.nombre}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-500 mb-1">Unidad:</label>
            <select className="w-full border rounded p-1.5 bg-white" value={filtroUnidad} onChange={(e) => setFiltroUnidad(e.target.value)}>
              <option value="Todos">(Todos)</option>
              {unidadesDisponibles.map((u) => <option key={u.id} value={u.id}>{u.nombre}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-500 mb-1">IVA:</label>
            <select className="w-full border rounded p-1.5 bg-white" value={filtroIva} onChange={(e) => setFiltroIva(e.target.value)}>
              <option value="Todos">(Todos)</option>
              {[...new Set(productos.map((p) => p.iva).filter(Boolean))].sort().map((iva) => <option key={iva} value={iva}>{iva}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-500 mb-1">Marca:</label>
            <select className="w-full border rounded p-1.5 bg-white" value={filtroMarca} onChange={(e) => setFiltroMarca(e.target.value)}>
              <option value="Todos">(Todos)</option>
              {marcasDisponibles.map((m) => <option key={m.id} value={m.nombre}>{m.nombre}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-500 mb-1">Ubicación de la empresa:</label>
            <select className="w-full border rounded p-1.5 bg-white" value={filtroUbicacionLista} onChange={(e) => setFiltroUbicacionLista(e.target.value)}>
              <option value="Todos">(Todos)</option>
              {ubicacionesDisponibles.map((u) => <option key={u.id} value={u.id}>{u.nombre}</option>)}
            </select>
          </div>
          <div title="Tu sistema todavía no vincula productos a servicios de OT desde acá">
            <label className="block text-xs font-bold text-gray-400 mb-1">Servicio a Ejecutar:</label>
            <select disabled className="w-full border rounded p-1.5 bg-gray-50 text-gray-400 cursor-not-allowed"><option>Todas</option></select>
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-500 mb-1">Estado del stock:</label>
            <select className="w-full border rounded p-1.5 bg-white" value={filtroEstadoStock} onChange={(e) => setFiltroEstadoStock(e.target.value)}>
              <option value="Todos">— Todos los productos</option>
              <option value="con_stock">Con stock</option>
              <option value="sin_stock">Sin stock</option>
              <option value="stock_bajo">Stock bajo (bajo umbral de alerta)</option>
            </select>
          </div>

          <div className="flex items-center gap-2 pt-5">
            <input type="checkbox" checked={filtroNoParaVender} onChange={(e) => setFiltroNoParaVender(e.target.checked)} />
            <label className="text-xs font-bold text-gray-600">No para vender</label>
          </div>
          <div className="flex items-center gap-2 pt-5">
            <input type="checkbox" checked={filtroSoloAlerta} onChange={(e) => setFiltroSoloAlerta(e.target.checked)} />
            <label className="text-xs font-bold text-gray-600">Solo bajo umbral de alerta</label>
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-500 mb-1">Rango de stock (qty):</label>
            <div className="flex items-center gap-1">
              <input type="number" placeholder="min" value={stockMin} onChange={(e) => setStockMin(e.target.value)} className="w-full border rounded p-1.5 text-xs" />
              <span className="text-gray-400 text-xs">a</span>
              <input type="number" placeholder="max" value={stockMax} onChange={(e) => setStockMax(e.target.value)} className="w-full border rounded p-1.5 text-xs" />
            </div>
            <p className="text-[10px] text-gray-400 mt-0.5">Ej: 1 a 10 para reposición</p>
          </div>
          <div className="flex items-center gap-2 pt-5" title="Tu sistema todavía no tiene sincronización con WooCommerce conectada">
            <input type="checkbox" disabled className="cursor-not-allowed" />
            <label className="text-xs font-bold text-gray-400 cursor-not-allowed">Woocommerce enabled</label>
          </div>
          <div title="Requiere cruzar el historial de ventas por producto y fecha — todavía no está armado">
            <label className="block text-xs font-bold text-gray-400 mb-1">Vendido en últimos:</label>
            <select disabled className="w-full border rounded p-1.5 bg-gray-50 text-gray-400 cursor-not-allowed"><option>— Sin filtro —</option></select>
          </div>
          <div title="Requiere cruzar el historial de ventas por producto y fecha — todavía no está armado">
            <label className="block text-xs font-bold text-gray-400 mb-1">Sin venta en últimos:</label>
            <select disabled className="w-full border rounded p-1.5 bg-gray-50 text-gray-400 cursor-not-allowed"><option>— Sin filtro —</option></select>
            <p className="text-[10px] text-gray-400 mt-0.5">Stock muerto</p>
          </div>

          {(filtroCategoria !== 'Todos' || filtroMarca !== 'Todos' || filtroUnidad !== 'Todos' || filtroIva !== 'Todos' || filtroUbicacionLista !== 'Todos' || filtroEstadoStock !== 'Todos' || filtroNoParaVender || filtroSoloAlerta || stockMin !== '' || stockMax !== '') && (
            <div className="flex items-end">
              <button
                onClick={() => {
                  setFiltroCategoria('Todos'); setFiltroMarca('Todos'); setFiltroUnidad('Todos'); setFiltroIva('Todos');
                  setFiltroUbicacionLista('Todos'); setFiltroEstadoStock('Todos'); setFiltroNoParaVender(false);
                  setFiltroSoloAlerta(false); setStockMin(''); setStockMax('');
                }}
                className="text-xs font-bold text-red-600 hover:underline"
              >
                ✕ Limpiar filtros
              </button>
            </div>
          )}
        </div>
      </div>

      {/* 2. TABS: TODOS LOS PRODUCTOS / INVENTARIO-STOCK */}
      <div className="bg-white rounded-lg shadow-sm border-t-2 border-[#004284]">
        <div className="flex gap-1 px-4 pt-3 border-b border-gray-100">
          <button
            onClick={() => setTabActiva('todos')}
            className={`px-4 py-2 text-xs font-bold border-b-2 transition-colors ${tabActiva === 'todos' ? 'border-[#004284] text-[#004284]' : 'border-transparent text-gray-400 hover:text-gray-600'
              }`}
          >
            🐾 Todos los productos
          </button>
          <button
            onClick={() => setTabActiva('stock')}
            className={`px-4 py-2 text-xs font-bold border-b-2 transition-colors ${tabActiva === 'stock' ? 'border-[#004284] text-[#004284]' : 'border-transparent text-gray-400 hover:text-gray-600'
              }`}
          >
            📊 Inventario / Stock
          </button>
        </div>

        <div className="p-4">
          {/* Barra de Acciones Superiores */}
          <div className="flex flex-wrap justify-between items-center gap-3 mb-4">
            <div className="flex gap-1 flex-wrap items-center">
              <button onClick={exportarCSV} className="bg-gray-100 border text-gray-600 px-2.5 py-1 rounded text-xs font-semibold hover:bg-gray-200">📄 Exportar a CSV</button>
              <button onClick={() => window.print()} className="bg-gray-100 border text-gray-600 px-2.5 py-1 rounded text-xs font-semibold hover:bg-gray-200">🖨️ Imprimir</button>
              <select value={porPagina} onChange={(e) => setPorPagina(Number(e.target.value))} className="border rounded p-1.5 text-xs font-semibold bg-white ml-2">
                <option value={10}>Mostrar 10</option>
                <option value={25}>Mostrar 25</option>
                <option value={50}>Mostrar 50</option>
                <option value={100}>Mostrar 100</option>
              </select>
            </div>

            <div className="flex items-center gap-3">
              <input
                type="text"
                className="border rounded p-1.5 w-64 outline-none focus:border-blue-500"
                placeholder="Buscar por nombre o SKU..."
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
              />
              <button
                onClick={() => setMostrarFormularioNuevo(true)}
                className="bg-orange-500 hover:bg-orange-600 text-white font-bold px-3 py-1.5 rounded text-xs whitespace-nowrap"
              >
                + Añadir
              </button>
            </div>
          </div>

          {/* 3. TABLA PRINCIPAL */}
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50 text-gray-600 font-bold uppercase">
                  <th className="p-3 w-8">
                    <input type="checkbox" checked={todosSeleccionadosEnPagina} onChange={toggleSeleccionarTodos} />
                  </th>
                  <th className="p-3 w-14">Imagen</th>
                  <th className="p-3 w-24">Acción</th>
                  <th className="p-3">Producto</th>
                  <th className="p-3">Ubicación de la Empresa</th>
                  <th className="p-3 text-right">Precio Compra Unitario</th>
                  <th className="p-3 text-right">Precio de Venta</th>
                  <th className="p-3 text-center">Stock Actual</th>
                  <th className="p-3">Categoría</th>
                  <th className="p-3">Marca</th>
                  <th className="p-3">IVA</th>
                  <th className="p-3">SKU / Código Barra</th>
                </tr>
              </thead>
              <tbody>
                {productosPagina.length === 0 ? (
                  <tr>
                    <td colSpan="11" className="text-center py-8 text-gray-400 font-medium">
                      Ningún producto coincide con los criterios de búsqueda.
                    </td>
                  </tr>
                ) : (
                  productosPagina.map((prod) => (
                    <tr key={prod.id} className="border-b hover:bg-gray-50 text-gray-700 font-medium">
                      <td className="p-3">
                        <input type="checkbox" checked={seleccionados.includes(prod.id)} onChange={() => toggleSeleccionarUno(prod.id)} />
                      </td>
                      <td className="p-3">
                        {prod.imagen_url ? (
                          <img
                            src={prod.imagen_url}
                            alt={prod.nombre}
                            onClick={() => setProductoDetalle(prod)}
                            className="w-9 h-9 rounded object-cover border border-gray-200 cursor-pointer hover:ring-2 hover:ring-orange-400 transition-all"
                          />
                        ) : (
                          <button
                            onClick={() => setProductoDetalle(prod)}
                            className="w-9 h-9 rounded bg-gray-50 border border-gray-200 flex items-center justify-center text-gray-300 hover:border-orange-400 hover:text-orange-400 transition-colors"
                            title="Ver detalle del producto"
                          >
                            🖼️
                          </button>
                        )}
                      </td>
                      <td className="p-3 relative">
                        <button
                          onClick={(e) => {
                            if (accionAbierta === prod.id) {
                              setAccionAbierta(null);
                              return;
                            }
                            const r = e.currentTarget.getBoundingClientRect();
                            const alturaEstimadaMenu = 340; // ~8 ítems del menú de Acciones
                            const espacioAbajo = window.innerHeight - r.bottom;
                            const abrirHaciaArriba = espacioAbajo < alturaEstimadaMenu && r.top > alturaEstimadaMenu;
                            const top = abrirHaciaArriba
                              ? Math.max(8, r.top + window.scrollY - alturaEstimadaMenu - 4)
                              : r.bottom + window.scrollY + 4;
                            setPosicionMenu({ top, left: r.left + window.scrollX });
                            setAccionAbierta(prod.id);
                          }}
                          className="bg-[#17a2b8] text-white px-2 py-1 rounded text-[11px] font-bold flex items-center gap-1"
                        >
                          Acciones <span className="text-[9px]">▼</span>
                        </button>
                      </td>
                      <td className="p-3 font-bold text-gray-900">
                        {prod.nombre}
                        {prod.activo === false && (
                          <span className="block w-fit mt-1 bg-gray-200 text-gray-600 text-[10px] font-bold px-1.5 py-0.5 rounded">No para vender</span>
                        )}
                      </td>
                      <td className="p-3 text-gray-500">{!usuarioVeTodas && nombreUbicacionUsuario ? nombreUbicacionUsuario : nombreEmpresa}</td>
                      <td className="p-3 text-right font-semibold text-gray-600">
                        {prod.precio_compra ? `${Number(prod.precio_compra).toLocaleString('es-PY')} Gs` : '0 Gs'}
                      </td>
                      <td className="p-3 text-right font-bold text-gray-800">
                        {Number(prod.precio_venta || 0).toLocaleString('es-PY')} Gs
                      </td>
                      <td className="p-3 text-center">
                        <span className={`px-2 py-0.5 rounded-sm font-bold text-[11px] ${stockVisible(prod) <= Number(prod.alerta_stock_bajo || 5) ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-700'}`}>
                          {stockVisible(prod)} {prod.unidad || 'UNID'}
                        </span>
                        {sucursalActiva && (
                          <div className="text-[10px] text-gray-400 mt-1">
                            En {nombreSucursalActiva}: <span className="font-bold text-gray-600">{mapaStockUbicacion[prod.id]?.[sucursalActiva] ?? 0} {prod.unidad || 'UNID'}</span>
                          </div>
                        )}
                      </td>
                      <td className="p-3 text-gray-500">{prod.categoria || '—'}</td>
                      <td className="p-3 text-gray-600 font-semibold">{prod.marca || '—'}</td>
                      <td className="p-3 text-gray-500">{prod.iva || 'IVA 10%'}</td>
                      <td className="p-3 font-mono text-gray-600 font-bold">{prod.codigo || '—'}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Barra de acciones masivas */}
          {seleccionados.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-4">
              <button onClick={eliminarSeleccionados} className="bg-red-600 hover:bg-red-700 text-white text-xs font-bold px-3 py-1.5 rounded">
                Eliminar seleccionados ({seleccionados.length})
              </button>
              <button onClick={agregarSeleccionadosAUbicacion} className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold px-3 py-1.5 rounded">
                Agregar a ubicación
              </button>
              <button onClick={quitarSeleccionadosDeUbicacion} className="bg-slate-800 hover:bg-slate-900 text-white text-xs font-bold px-3 py-1.5 rounded">
                Quitar de ubicación
              </button>
              <button onClick={toggleActivoSeleccionados} className="bg-orange-500 hover:bg-orange-600 text-white text-xs font-bold px-3 py-1.5 rounded">
                Activar / Desactivar seleccionados
              </button>
            </div>
          )}

          {/* Footer: entradas + paginación */}
          <div className="flex flex-wrap justify-between items-center mt-4 gap-2">
            <div className="text-xs font-bold text-gray-500">
              Mostrando {productosPagina.length === 0 ? 0 : (paginaSegura - 1) * porPagina + 1} a {(paginaSegura - 1) * porPagina + productosPagina.length} de {productosFiltrados.length} entradas
            </div>
            <div className="flex gap-1">
              <button
                onClick={() => setPaginaActual((p) => Math.max(1, p - 1))}
                disabled={paginaSegura === 1}
                className="px-3 py-1 text-xs font-bold border rounded disabled:opacity-40 hover:bg-gray-50"
              >
                Anterior
              </button>
              {Array.from({ length: totalPaginas }, (_, i) => i + 1)
                .filter((n) => n === 1 || n === totalPaginas || Math.abs(n - paginaSegura) <= 1)
                .reduce((acc, n, i, arr) => {
                  if (i > 0 && n - arr[i - 1] > 1) acc.push('...');
                  acc.push(n);
                  return acc;
                }, [])
                .map((n, i) =>
                  n === '...' ? (
                    <span key={`dots-${i}`} className="px-2 py-1 text-xs text-gray-400">...</span>
                  ) : (
                    <button
                      key={n}
                      onClick={() => setPaginaActual(n)}
                      className={`px-3 py-1 text-xs font-bold border rounded ${n === paginaSegura ? 'bg-[#004284] text-white border-[#004284]' : 'hover:bg-gray-50'}`}
                    >
                      {n}
                    </button>
                  )
                )}
              <button
                onClick={() => setPaginaActual((p) => Math.min(totalPaginas, p + 1))}
                disabled={paginaSegura === totalPaginas}
                className="px-3 py-1 text-xs font-bold border rounded disabled:opacity-40 hover:bg-gray-50"
              >
                Siguiente
              </button>
            </div>
          </div>
        </div>
      </div>
      {productoDetalle && (
        <DetalleProducto producto={productoDetalle} onClose={() => setProductoDetalle(null)} />
      )}

      {/* Menú "Acciones" renderizado vía portal a document.body: así nunca queda
          recortado por el overflow-x-auto de la tabla, sin importar el scroll. */}
      {accionAbierta && createPortal(
        <>
          <div className="fixed inset-0 z-40" onClick={() => setAccionAbierta(null)} />
          <div
            className="fixed z-50 bg-white border border-gray-200 rounded-lg shadow-xl w-56 py-1 text-sm"
            style={{ top: posicionMenu.top, left: posicionMenu.left, maxHeight: 'calc(100vh - 16px)', overflowY: 'auto' }}
          >
            {(() => {
              const prod = productos.find((p) => p.id === accionAbierta);
              if (!prod) return null;
              return (
                <>
                  <button onClick={() => imprimirEtiqueta(prod)} className="w-full text-left px-4 py-2 hover:bg-gray-50 flex items-center gap-2">🏷️ Etiquetas</button>
                  <button onClick={() => { setProductoDetalle(prod); setAccionAbierta(null); }} className="w-full text-left px-4 py-2 hover:bg-gray-50 flex items-center gap-2">👁️ Ver</button>
                  <button onClick={() => { setProductoEditando(prod); setMostrarFormularioNuevo(true); setAccionAbierta(null); }} className="w-full text-left px-4 py-2 hover:bg-gray-50 flex items-center gap-2">✏️ Editar</button>
                  <button onClick={() => eliminarProducto(prod.id)} className="w-full text-left px-4 py-2 hover:bg-red-50 text-red-600 flex items-center gap-2">🗑️ Borrar</button>
                  <div className="border-t border-gray-100 my-1" />
                  <button onClick={() => { setProductoStockInicial(prod); setAccionAbierta(null); }} className="w-full text-left px-4 py-2 hover:bg-gray-50 flex items-center gap-2">📦 Agregar o editar stock inicial</button>
                  <button onClick={() => abrirHistorialExistencias(prod)} className="w-full text-left px-4 py-2 hover:bg-gray-50 flex items-center gap-2">🕘 Historial de existencias</button>
                  <button
                    onClick={() => { setAccionAbierta(null); alert('Tu sistema todavía no tiene "grupos de precios" (precios distintos por tipo de cliente/canal) armados. Si te sirve, lo construimos.'); }}
                    className="w-full text-left px-4 py-2 hover:bg-gray-50 flex items-center gap-2"
                  >
                    💰 Precios de grupo
                  </button>
                  <button onClick={() => duplicarProducto(prod)} className="w-full text-left px-4 py-2 hover:bg-gray-50 flex items-center gap-2">📄 Producto duplicado</button>
                </>
              );
            })()}
          </div>
        </>,
        document.body
      )}

      {/* Modal: Agregar o editar stock inicial de un producto puntual */}
      {productoStockInicial && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[9999] p-4" onClick={() => setProductoStockInicial(null)}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl overflow-hidden max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="bg-[#004284] px-5 py-4 flex justify-between items-center">
              <h3 className="text-white font-bold text-lg">Stock inicial — {productoStockInicial.nombre}</h3>
              <button onClick={() => setProductoStockInicial(null)} className="text-white/80 hover:text-white text-xl leading-none">✕</button>
            </div>
            <div className="overflow-y-auto p-4">
              <AperturaStock
                producto={productoStockInicial}
                onGuardado={() => { setProductoStockInicial(null); cargarProductos(); }}
                onCancelar={() => setProductoStockInicial(null)}
              />
            </div>
          </div>
        </div>
      )}

      {/* Modal: Historial de existencias (entradas por compra, salidas por venta) */}
      {productoHistorial && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[9999] p-4" onClick={() => setProductoHistorial(null)}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="bg-[#004284] px-5 py-4 flex justify-between items-center">
              <h3 className="text-white font-bold text-lg">Historial — {productoHistorial.nombre}</h3>
              <button onClick={() => setProductoHistorial(null)} className="text-white/80 hover:text-white text-xl leading-none">✕</button>
            </div>
            <div className="p-5 overflow-y-auto text-sm">
              {cargandoHistorial ? (
                <p className="text-gray-400 text-center py-6">Cargando...</p>
              ) : historialMovimientos.length === 0 ? (
                <p className="text-gray-400 text-center py-6">Este producto todavía no tiene ventas ni compras registradas.</p>
              ) : (
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr className="text-gray-500 border-b"><th className="text-left py-1">Fecha</th><th className="text-left py-1">Movimiento</th><th className="text-right py-1">Cantidad</th></tr>
                  </thead>
                  <tbody>
                    {historialMovimientos.map((m, i) => (
                      <tr key={i} className="border-b border-gray-50">
                        <td className="py-1">{new Date(m.fecha).toLocaleDateString('es-PY')}</td>
                        <td className="py-1">{m.tipo}</td>
                        <td className={`py-1 text-right font-bold ${m.cantidad < 0 ? 'text-red-600' : 'text-green-600'}`}>{m.cantidad > 0 ? '+' : ''}{m.cantidad}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}