import AgregarProducto from './AgregarProducto';
import AperturaStock from './AperturaStock';
import DetalleProducto from './utils/DetalleProducto';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { createPortal } from 'react-dom';
import { jsPDF } from 'jspdf';
import { Check, ChevronDown, Image as ImageIcon, LoaderCircle, Pencil, X } from 'lucide-react';
import { supabase } from './supabaseClient';
import { useEmpresaInfo } from './utils/useEmpresa';
import { useConfiguracionEmpresa } from './utils/useConfiguracionEmpresa';
import { useUbicacionUsuario } from './utils/useUbicacion';
import { useSucursalActiva } from './utils/SucursalContext';
import { cargarMapaStockPorUbicacion } from './utils/stockUbicacion';
import { useNotificacion } from './NotificacionContext';
import { formatearStock } from './utils/cantidadProducto';
import { useLanguage } from './LanguageContext';

export default function ListaProductos() {
  const navigate = useNavigate();
  const { t } = useLanguage();
  const { id: empresaId, nombre: nombreEmpresa } = useEmpresaInfo();
  const { ajustes: ajustesEmpresa } = useConfiguracionEmpresa(empresaId);
  const monedaLista = ['PYG', 'USD', 'EUR', 'BRL'].includes(ajustesEmpresa.currency) ? ajustesEmpresa.currency : 'PYG';
  const formatoPrecioProducto = (producto, campoPyg, campoMoneda) => {
    const valorMoneda = producto?.moneda_precio === monedaLista ? producto?.[campoMoneda] : null;
    if (valorMoneda != null && Number.isFinite(Number(valorMoneda))) {
      const cantidad = Number(valorMoneda).toLocaleString(monedaLista === 'BRL' ? 'pt-BR' : 'es-PY', {
        minimumFractionDigits: monedaLista === 'PYG' ? 0 : 2,
        maximumFractionDigits: monedaLista === 'PYG' ? 0 : 2,
      });
      return monedaLista === 'BRL' ? `R$ ${cantidad}` : monedaLista === 'USD' ? `USD ${cantidad}` : monedaLista === 'EUR' ? `€ ${cantidad}` : `${cantidad} Gs`;
    }
    return `${Number(producto?.[campoPyg] || 0).toLocaleString('es-PY')} Gs`;
  };
  const { confirmar } = useNotificacion();
  const { id: ubicacionUsuarioId, nombre: nombreUbicacionUsuario, ve_todas: usuarioVeTodas } = useUbicacionUsuario();
  // sucursalActiva: la elegida en el selector global del header.
  // Si el usuario está fijo a una sola sucursal, el contexto ya la deja bloqueada acá también.
  const { sucursalActiva, nombreSucursalActiva } = useSucursalActiva();
  const [mapaStockUbicacion, setMapaStockUbicacion] = useState({});
  const [productos, setProductos] = useState([]);
  const [gruposPrecioVenta, setGruposPrecioVenta] = useState([]);
  const [precioGrupoEditando, setPrecioGrupoEditando] = useState(null);
  const [guardandoPrecioGrupo, setGuardandoPrecioGrupo] = useState(false);
  const [errorPrecioGrupo, setErrorPrecioGrupo] = useState('');
  const [busqueda, setBusqueda] = useState('');
  const [filtrosAbiertos, setFiltrosAbiertos] = useState(true);

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
  const [errorHistorial, setErrorHistorial] = useState('');
  const [paginaActual, setPaginaActual] = useState(1);
  const [porPagina, setPorPagina] = useState(25);
  useEffect(() => {
    const valor = ajustesEmpresa.default_datatable_page_entries;
    if (valor !== undefined && valor !== '') setPorPagina(valor === 'Todos' ? 0 : Math.max(1, Number(valor) || 25));
  }, [ajustesEmpresa.default_datatable_page_entries]);
  const [mostrarFormularioNuevo, setMostrarFormularioNuevo] = useState(false);
  const [productoEditando, setProductoEditando] = useState(null);
  const [productoDetalle, setProductoDetalle] = useState(null);
  const ubicacionParaNuevoProducto = sucursalActiva || ubicacionUsuarioId || null;

  useEffect(() => {
    cargarProductos();
  }, [empresaId]);

  useEffect(() => {
    if (!empresaId) return undefined;
    const cargarGruposPrecioVenta = async () => {
      const { data, error } = await supabase.from('grupos_precios_venta')
        .select('id,nombre,margen_default').eq('empresa_id', empresaId).eq('activo', true).order('nombre');
      if (error) {
        setErrorPrecioGrupo(`No se pudieron cargar los grupos de precio: ${error.message}`);
        return;
      }
      setErrorPrecioGrupo('');
      setGruposPrecioVenta(data || []);
    };
    cargarGruposPrecioVenta();
    window.addEventListener('grupos-precios-venta-actualizados', cargarGruposPrecioVenta);
    return () => window.removeEventListener('grupos-precios-venta-actualizados', cargarGruposPrecioVenta);
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

  // Si se eligió una sucursal en el filtro, el stock mostrado corresponde a esa
  // sucursal. Un saldo 0 también es un valor real; no debe caer al stock global.
  const ubicacionStockVisible = filtroUbicacionLista !== 'Todos' ? filtroUbicacionLista : sucursalActiva;
  const nombreUbicacionStockVisible = ubicacionStockVisible
    ? ubicacionesDisponibles.find((ubicacion) => String(ubicacion.id) === String(ubicacionStockVisible))?.nombre || nombreSucursalActiva
    : '';
  const stockVisible = (producto) => {
    if (ubicacionStockVisible) {
      return Number(mapaStockUbicacion[producto.id]?.[ubicacionStockVisible]) || 0;
    }
    return Number(producto.stock_actual) || 0;
  };

  const stockFormateado = (producto, cantidad) => formatearStock(cantidad, producto.unidad);

  const editarPrecioGrupo = (producto, grupo) => {
    const precioGuardado = (Array.isArray(producto.grupos_precio) ? producto.grupos_precio : [])
      .find((item) => String(item.nombre || '').trim().toLocaleLowerCase('es') === grupo.nombre.trim().toLocaleLowerCase('es'));
    setErrorPrecioGrupo('');
    setPrecioGrupoEditando({ productoId: producto.id, grupoNombre: grupo.nombre, valor: String(precioGuardado?.precioVenta ?? 0) });
  };

  const guardarPrecioGrupo = async (producto) => {
    if (guardandoPrecioGrupo) return;
    if (!precioGrupoEditando || String(precioGrupoEditando.productoId) !== String(producto.id)) return;
    if (precioGrupoEditando.valor === '') {
      setErrorPrecioGrupo('Ingresá un precio o cancelá la edición.');
      return;
    }
    const precio = Number(precioGrupoEditando.valor);
    if (!Number.isFinite(precio) || precio < 0) {
      setErrorPrecioGrupo('Ingresá un precio de grupo igual o mayor que cero.');
      return;
    }
    const grupo = gruposPrecioVenta.find((item) => item.nombre === precioGrupoEditando.grupoNombre);
    if (!grupo) {
      setErrorPrecioGrupo('Ese grupo ya no está activo. Actualizá la lista de productos.');
      return;
    }
    const preciosActuales = Array.isArray(producto.grupos_precio) ? producto.grupos_precio : [];
    const claveGrupo = grupo.nombre.trim().toLocaleLowerCase('es');
    const precioExistente = preciosActuales.some((item) => String(item.nombre || '').trim().toLocaleLowerCase('es') === claveGrupo);
    const preciosActualizados = precioExistente
      ? preciosActuales.map((item) => String(item.nombre || '').trim().toLocaleLowerCase('es') === claveGrupo
        ? { ...item, nombre: grupo.nombre, precioVenta: Math.round(precio) }
        : item)
      : [...preciosActuales, { nombre: grupo.nombre, margen: Number(grupo.margen_default) || 0, precioVenta: Math.round(precio) }];
    setGuardandoPrecioGrupo(true);
    setErrorPrecioGrupo('');
    const { error } = await supabase.from('productos').update({ grupos_precio: preciosActualizados })
      .eq('id', producto.id).eq('empresa_id', empresaId);
    setGuardandoPrecioGrupo(false);
    if (error) {
      setErrorPrecioGrupo(`No se pudo guardar el precio de ${grupo.nombre}: ${error.message}`);
      return;
    }
    setProductos((actuales) => actuales.map((item) => String(item.id) === String(producto.id)
      ? { ...item, grupos_precio: preciosActualizados }
      : item));
    setPrecioGrupoEditando(null);
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
    const coincideTab = tabActiva === 'todos' || (tabActiva === 'stock' && stockVisible(p) <= Number(p.alerta_stock_bajo || 5));
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
  const totalPaginas = porPagina === 0 ? 1 : Math.max(1, Math.ceil(productosFiltrados.length / porPagina));
  const paginaSegura = Math.min(paginaActual, totalPaginas);
  const productosPagina = porPagina === 0 ? productosFiltrados : productosFiltrados.slice((paginaSegura - 1) * porPagina, paginaSegura * porPagina);

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
      doc.text(formatoPrecioProducto(prod, 'precio_venta', 'precio_venta_moneda'), 3, 18);
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
    navigate(`/stock-history/${prod.id}`);
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
      ['Producto', 'Ubicación', 'Precio Compra', 'Precio Venta', ...gruposPrecioVenta.map((grupo) => `Precio ${grupo.nombre}`), 'Stock', 'Categoría', 'Marca', 'IVA', 'SKU'],
      ...productosFiltrados.map((p) => [
        p.nombre, nombreUbicacionStockVisible || nombreEmpresa, p.precio_compra || 0, p.precio_venta || 0,
        ...gruposPrecioVenta.map((grupo) => (p.grupos_precio || []).find((precio) => String(precio.nombre || '').trim().toLocaleLowerCase('es') === grupo.nombre.trim().toLocaleLowerCase('es'))?.precioVenta ?? ''),
        stockVisible(p), p.categoria || '', p.marca || '', p.iva || 'IVA 10%', p.codigo || '',
      ]),
    ];
    const csv = filas.map((f) => f.map((valor) => `"${String(valor ?? '').replaceAll('"', '""')}"`).join(',')).join('\n');
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
        ubicacionId={ubicacionParaNuevoProducto}
        onGuardado={() => {
          setMostrarFormularioNuevo(false);
          setProductoEditando(null);
          cargarProductos();
          window.dispatchEvent(new Event('stock-actualizado'));
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
        <button
          type="button"
          aria-expanded={filtrosAbiertos}
          aria-controls="filtros-productos-contenido"
          onClick={() => setFiltrosAbiertos((abiertos) => !abiertos)}
          className="mb-3 flex w-full items-center justify-between text-left text-xs font-bold uppercase tracking-wider text-gray-500 hover:text-[#004284]"
        >
          <span>🔻 {t('filters')}</span>
          <ChevronDown size={16} className={`transition-transform duration-200 ${filtrosAbiertos ? 'rotate-180' : ''}`} />
        </button>
        <div
          id="filtros-productos-contenido"
          aria-hidden={!filtrosAbiertos}
          className={`grid transition-[grid-template-rows] duration-300 ease-in-out ${filtrosAbiertos ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}
        >
        <div className="min-h-0 overflow-hidden">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div title="Tu sistema todavía no distingue tipos de producto (individual/combo/servicio)">
            <label className="block text-xs font-bold text-gray-400 mb-1">{t('productType')}:</label>
            <select disabled className="w-full border rounded p-1.5 bg-gray-50 text-gray-400 cursor-not-allowed"><option>Todos</option></select>
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-500 mb-1">{t('categories')}:</label>
            <select className="w-full border rounded p-1.5 bg-white" value={filtroCategoria} onChange={(e) => setFiltroCategoria(e.target.value)}>
              <option value="Todos">(Todos)</option>
              {categoriasDisponibles.map((c) => <option key={c.id} value={c.nombre}>{c.nombre}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-500 mb-1">{t('units')}:</label>
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
            <label className="block text-xs font-bold text-gray-500 mb-1">{t('brands')}:</label>
            <select className="w-full border rounded p-1.5 bg-white" value={filtroMarca} onChange={(e) => setFiltroMarca(e.target.value)}>
              <option value="Todos">(Todos)</option>
              {marcasDisponibles.map((m) => <option key={m.id} value={m.nombre}>{m.nombre}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-500 mb-1">{t('companyLocation')}:</label>
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
            <label className="block text-xs font-bold text-gray-500 mb-1">{t('stockStatus')}:</label>
            <select className="w-full border rounded p-1.5 bg-white" value={filtroEstadoStock} onChange={(e) => setFiltroEstadoStock(e.target.value)}>
              <option value="Todos">— Todos los productos</option>
              <option value="con_stock">{t('withStock')}</option>
              <option value="sin_stock">{t('withoutStock')}</option>
              <option value="stock_bajo">{t('lowStockThreshold')}</option>
            </select>
          </div>

          <div className="flex items-center gap-2 pt-5">
            <input type="checkbox" checked={filtroNoParaVender} onChange={(e) => setFiltroNoParaVender(e.target.checked)} />
            <label className="text-xs font-bold text-gray-600">{t('notForSale')}</label>
          </div>
          <div className="flex items-center gap-2 pt-5">
            <input type="checkbox" checked={filtroSoloAlerta} onChange={(e) => setFiltroSoloAlerta(e.target.checked)} />
            <label className="text-xs font-bold text-gray-600">{t('onlyBelowAlert')}</label>
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-500 mb-1">Rango de stock (qty):</label>
            <div className="flex items-center gap-1">
              <input type="number" placeholder={t('min')} value={stockMin} onChange={(e) => setStockMin(e.target.value)} className="w-full border rounded p-1.5 text-xs" />
              <span className="text-gray-400 text-xs">a</span>
              <input type="number" placeholder={t('max')} value={stockMax} onChange={(e) => setStockMax(e.target.value)} className="w-full border rounded p-1.5 text-xs" />
            </div>
            <p className="text-[10px] text-gray-400 mt-0.5">Ej: 1 a 10 para reposición</p>
          </div>
          <div className="flex items-center gap-2 pt-5" title="Tu sistema todavía no tiene sincronización con WooCommerce conectada">
            <input type="checkbox" disabled className="cursor-not-allowed" />
            <label className="text-xs font-bold text-gray-400 cursor-not-allowed">{t('woocommerceEnabled')}</label>
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
              {ajustesEmpresa.system_settings_explicit && ajustesEmpresa.is_enabled_export === false ? null : <button onClick={exportarCSV} className="bg-gray-100 border text-gray-600 px-2.5 py-1 rounded text-xs font-semibold hover:bg-gray-200">📄 {t('exportCsv')}</button>}
              <button onClick={() => window.print()} className="bg-gray-100 border text-gray-600 px-2.5 py-1 rounded text-xs font-semibold hover:bg-gray-200">🖨️ {t('print')}</button>
              <select value={porPagina} onChange={(e) => setPorPagina(Number(e.target.value))} className="border rounded p-1.5 text-xs font-semibold bg-white ml-2">
                <option value={10}>{t('show')} 10</option>
                <option value={25}>{t('show')} 25</option>
                <option value={50}>{t('show')} 50</option>
                <option value={100}>{t('show')} 100</option>
                <option value={200}>{t('show')} 200</option>
                <option value={500}>{t('show')} 500</option>
                <option value={1000}>{t('show')} 1.000</option>
                <option value={0}>Todos</option>
              </select>
            </div>

            <div className="flex items-center gap-3">
              <input
                type="text"
                className="border rounded p-1.5 w-64 outline-none focus:border-blue-500"
                placeholder={`${t('search')} ${t('name').toLowerCase()} o SKU...`}
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
              />
              <button
                onClick={() => setMostrarFormularioNuevo(true)}
                className="bg-orange-500 hover:bg-orange-600 text-white font-bold px-3 py-1.5 rounded text-xs whitespace-nowrap"
              >
                + {t('add')}
              </button>
            </div>
          </div>

          {/* 3. TABLA PRINCIPAL */}
          <div className="overflow-x-auto">
            <table className="product-list-table w-full min-w-[1380px] text-left text-xs border-collapse">
              <thead>
                <tr className="h-[52px] border-b border-[#e2e7ee] bg-[#f6f7f9] text-[10px] tracking-[0.035em] text-[#66748a] font-bold uppercase">
                  <th className="w-10 px-2 py-3 align-middle">
                    <input type="checkbox" checked={todosSeleccionadosEnPagina} onChange={toggleSeleccionarTodos} />
                  </th>
                  <th className="w-[76px] px-2 py-3 text-center align-middle">{t('image')}</th>
                  <th className="w-[112px] px-2 py-3 text-center align-middle">{t('action')}</th>
                  <th className="min-w-[220px] px-3 py-3 align-middle">{t('product')}</th>
                  <th className="min-w-[160px] px-3 py-3 align-middle">SKU / Código de barras</th>
                  <th className="min-w-[160px] px-3 py-3 align-middle">{t('companyLocation')}</th>
                  <th className="min-w-[140px] px-3 py-3 text-right align-middle">{t('unitPurchasePrice')}</th>
                  <th className="min-w-[130px] px-3 py-3 text-right align-middle">{t('salePrice')}</th>
                  {gruposPrecioVenta.map((grupo) => <th key={grupo.id} className="min-w-40 border-l border-slate-200 px-3 py-3 text-right align-middle">{grupo.nombre}</th>)}
                  <th className="min-w-[100px] px-3 py-3 text-center align-middle">{t('currentStock')}</th>
                  <th className="min-w-[170px] px-3 py-3 align-middle">{t('categories')}</th>
                  <th className="min-w-[120px] px-3 py-3 align-middle">{t('brands')}</th>
                  <th className="min-w-[76px] px-3 py-3 align-middle">IVA</th>
                </tr>
              </thead>
              <tbody>
                {productosPagina.length === 0 ? (
                  <tr>
                    <td colSpan={12 + gruposPrecioVenta.length} className="text-center py-8 text-gray-400 font-medium">
                      {t('noMatchingProducts')}
                    </td>
                  </tr>
                ) : (
                  productosPagina.map((prod) => (
                    <tr key={prod.id} className="h-[76px] border-b border-[#e8ecf1] text-[#34425a] font-medium odd:bg-white even:bg-[#fafbfc] transition-colors hover:bg-[#f1f7fc]">
                      <td className="px-2 py-2 align-middle text-center">
                        <input type="checkbox" checked={seleccionados.includes(prod.id)} onChange={() => toggleSeleccionarUno(prod.id)} />
                      </td>
                      <td className="px-2 py-2 align-middle">
                        <button
                          type="button"
                          onClick={() => setProductoDetalle(prod)}
                          className="group relative mx-auto flex h-[52px] w-[52px] items-center justify-center overflow-hidden rounded-md border border-[#dfe5ec] bg-[#f5f7fa] shadow-sm transition-all hover:border-[#24b8d2] hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#24b8d2]"
                          title={`Ver imagen de ${prod.nombre}`}
                        >
                          <ImageIcon size={19} strokeWidth={1.7} className="text-[#aeb8c5] transition-colors group-hover:text-[#24b8d2]" />
                          {prod.imagen_url && (
                            <img
                              src={prod.imagen_url}
                              alt={`Imagen de ${prod.nombre}`}
                              loading="lazy"
                              decoding="async"
                              onError={(event) => event.currentTarget.classList.add('hidden')}
                              className="absolute inset-0 h-full w-full bg-white object-contain p-0.5 transition-transform duration-200 group-hover:scale-[1.06]"
                            />
                          )}
                        </button>
                      </td>
                      <td className="relative px-2 py-2 align-middle text-center">
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
                          className="bg-[#20b8d2] hover:bg-[#159bb7] text-white px-2.5 py-1.5 rounded-[4px] text-[11px] font-bold inline-flex items-center gap-1 shadow-sm transition-colors"
                        >
                          Acciones <span className="text-[9px]">▼</span>
                        </button>
                      </td>
                      <td className="min-w-[220px] px-3 py-2 align-middle font-semibold leading-[1.35] text-[#202c3e]">
                        <span className="line-clamp-2">{prod.nombre}</span>
                        {prod.activo === false && (
                          <span className="block w-fit mt-1 bg-gray-200 text-gray-600 text-[10px] font-bold px-1.5 py-0.5 rounded">{t('notForSale')}</span>
                        )}
                      </td>
                      <td className="min-w-[160px] break-all px-3 py-2 align-middle font-mono text-[11px] font-semibold text-[#53627a]">{prod.codigo || '—'}</td>
                      <td className="min-w-[160px] px-3 py-2 align-middle text-gray-500">{!usuarioVeTodas && nombreUbicacionUsuario ? nombreUbicacionUsuario : (nombreUbicacionStockVisible || nombreEmpresa)}</td>
                      <td className="min-w-[140px] px-3 py-2 text-right align-middle font-semibold text-gray-600">
                        {formatoPrecioProducto(prod, 'precio_compra', 'precio_compra_moneda')}
                      </td>
                      <td className="min-w-[130px] px-3 py-2 text-right align-middle font-bold text-gray-800">
                        {formatoPrecioProducto(prod, 'precio_venta', 'precio_venta_moneda')}
                      </td>
                      {gruposPrecioVenta.map((grupo) => {
                        const precio = (Array.isArray(prod.grupos_precio) ? prod.grupos_precio : []).find((item) => String(item.nombre || '').trim().toLocaleLowerCase('es') === grupo.nombre.trim().toLocaleLowerCase('es'));
                        const editandoEste = String(precioGrupoEditando?.productoId) === String(prod.id) && precioGrupoEditando?.grupoNombre === grupo.nombre;
                        return <td key={grupo.id} className="min-w-40 border-l border-slate-100 p-2 text-right">
                          {editandoEste ? <div className="flex items-center justify-end gap-1"><input autoFocus aria-label={`Precio ${grupo.nombre} para ${prod.nombre}`} type="number" min="0" step="1" value={precioGrupoEditando.valor} disabled={guardandoPrecioGrupo} onChange={(event) => setPrecioGrupoEditando((actual) => ({ ...actual, valor: event.target.value }))} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); guardarPrecioGrupo(prod); } if (event.key === 'Escape' && !guardandoPrecioGrupo) setPrecioGrupoEditando(null); }} className="w-28 rounded border border-slate-300 px-2 py-1 text-right font-normal outline-none focus:border-orange-400"/><button type="button" aria-label={`Guardar precio ${grupo.nombre}`} disabled={guardandoPrecioGrupo} onClick={() => guardarPrecioGrupo(prod)} className="rounded bg-emerald-600 p-1.5 text-white hover:bg-emerald-700 disabled:opacity-50">{guardandoPrecioGrupo ? <LoaderCircle size={14} className="animate-spin"/> : <Check size={14}/>}</button><button type="button" aria-label="Cancelar edición" disabled={guardandoPrecioGrupo} onClick={() => setPrecioGrupoEditando(null)} className="rounded border border-slate-200 p-1.5 text-slate-500 hover:bg-slate-50"><X size={14}/></button></div>
                            : <div className="inline-flex items-center justify-end gap-1.5"><span className="font-semibold text-gray-700">{precio?.precioVenta !== undefined && precio?.precioVenta !== null ? `${Number(precio.precioVenta).toLocaleString('es-PY')} Gs` : '—'}</span><button type="button" aria-label={`Editar precio ${grupo.nombre} de ${prod.nombre}`} title={`Editar precio ${grupo.nombre}`} disabled={guardandoPrecioGrupo} onClick={() => editarPrecioGrupo(prod, grupo)} className="rounded p-1 text-slate-400 hover:bg-orange-50 hover:text-orange-600 disabled:opacity-50"><Pencil size={13}/></button></div>}
                        </td>;
                      })}
                      <td className="min-w-[100px] px-3 py-2 text-center align-middle">
                        <span className={`px-2 py-0.5 rounded-sm font-bold text-[11px] ${stockVisible(prod) <= Number(prod.alerta_stock_bajo || 5) ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-700'}`}>
                          {stockFormateado(prod, stockVisible(prod))}
                        </span>
                        {ubicacionStockVisible && (
                          <div className="text-[10px] text-gray-400 mt-1">
                            En {nombreUbicacionStockVisible}: <span className="font-bold text-gray-600">{stockFormateado(prod, stockVisible(prod))}</span>
                          </div>
                        )}
                      </td>
                      <td className="min-w-[170px] px-3 py-2 align-middle text-gray-500">{prod.categoria || '—'}</td>
                      <td className="min-w-[120px] px-3 py-2 align-middle font-semibold text-gray-600">{prod.marca || '—'}</td>
                      <td className="min-w-[76px] px-3 py-2 align-middle text-gray-500">{prod.iva || 'IVA 10%'}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {errorPrecioGrupo && <p role="alert" className="mt-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{errorPrecioGrupo}</p>}

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
                  <button onClick={() => imprimirEtiqueta(prod)} className="w-full text-left px-4 py-2 hover:bg-gray-50 flex items-center gap-2">🏷️ {t('labels')}</button>
                  <button onClick={() => { setProductoDetalle(prod); setAccionAbierta(null); }} className="w-full text-left px-4 py-2 hover:bg-gray-50 flex items-center gap-2">👁️ {t('view')}</button>
                  <button onClick={() => { setProductoEditando(prod); setMostrarFormularioNuevo(true); setAccionAbierta(null); }} className="w-full text-left px-4 py-2 hover:bg-gray-50 flex items-center gap-2">✏️ {t('edit')}</button>
                  <button onClick={() => eliminarProducto(prod.id)} className="w-full text-left px-4 py-2 hover:bg-red-50 text-red-600 flex items-center gap-2">🗑️ {t('delete')}</button>
                  <div className="border-t border-gray-100 my-1" />
                  <button onClick={() => { setProductoStockInicial(prod); setAccionAbierta(null); }} className="w-full text-left px-4 py-2 hover:bg-gray-50 flex items-center gap-2">📦 {t('initialStock')}</button>
                  <button onClick={() => abrirHistorialExistencias(prod)} className="w-full text-left px-4 py-2 hover:bg-gray-50 flex items-center gap-2">🕘 {t('stockHistory')}</button>
                  <button
                    onClick={() => { setAccionAbierta(null); navigate('/productos/precio-grupo', { state: { producto: prod } }); }}
                    className="w-full text-left px-4 py-2 hover:bg-gray-50 flex items-center gap-2"
                  >
                    💰 Agregar o editar precio de grupo
                  </button>
                  <button onClick={() => duplicarProducto(prod)} className="w-full text-left px-4 py-2 hover:bg-gray-50 flex items-center gap-2">📄 {t('duplicateProduct')}</button>
                </>
              );
            })()}
          </div>
        </>,
        document.body
      )}

      {/* Modal: Agregar o editar stock inicial de un producto puntual */}
      {productoStockInicial && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[9999] p-4" onClick={() => setProductoStockInicial(null)}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-[1220px] overflow-hidden max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="bg-gradient-to-r from-[#4338b8] to-[#4f46d0] px-5 py-3.5 flex justify-between items-center">
              <h3 className="text-white font-bold text-sm md:text-base">{t('initialStock')}</h3>
                  <button onClick={() => setProductoStockInicial(null)} className="text-white/70 hover:text-white text-xl leading-none">✕</button>
            </div>
            <div className="overflow-y-auto bg-white">
              <AperturaStock
                producto={productoStockInicial}
                ubicacionId={sucursalActiva}
                compacto
                onGuardado={async () => {
                  setProductoStockInicial(null);
                  await cargarProductos();
                  if (empresaId) cargarMapaStockPorUbicacion(empresaId).then(setMapaStockUbicacion);
                }}
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
              <h3 className="text-white font-bold text-lg">{t('stockHistory')} — {productoHistorial.nombre}</h3>
              <button onClick={() => setProductoHistorial(null)} className="text-white/80 hover:text-white text-xl leading-none">✕</button>
            </div>
            <div className="p-5 overflow-y-auto text-sm">
              {cargandoHistorial ? (
                <p className="text-gray-400 text-center py-6">Cargando...</p>
              ) : errorHistorial ? (
                <p className="text-red-600 text-center py-6">{errorHistorial}</p>
              ) : historialMovimientos.length === 0 ? (
                <p className="text-gray-400 text-center py-6">{t('noProductMovements')}</p>
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
