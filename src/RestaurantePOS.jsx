import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Bike, Bell, Check, ChefHat, ChevronDown, CircleDollarSign, ClipboardList, Clock3,
  LoaderCircle, MapPin, Minus, Plus, Search, ShoppingBag, ShoppingCart, Table2, Trash2,
  UtensilsCrossed, X, Maximize2,
} from 'lucide-react';
import { supabase } from './supabaseClient';
import { useEmpresaInfo } from './utils/useEmpresa';
import { useConfiguracionEmpresa } from './utils/useConfiguracionEmpresa';
import { useNotificacion } from './NotificacionContext';
import PizzaCustomizer from './PizzaCustomizer';
import MapaDelivery, { zonaEnCoordenadas } from './MapaDelivery';

const dinero = (valor) => `Gs ${Number(valor || 0).toLocaleString('es-PY', { maximumFractionDigits: 0 })}`;
const PESTANAS = [
  { label: 'Mesas', icon: Table2, path: '/restaurante/mapa' },
  { label: 'Órdenes', icon: ClipboardList, path: '/restaurante/pedidos' },
  { label: 'Pedidos web', icon: Bell, path: null },
  { label: 'Comanda', icon: ShoppingBag, path: '/restaurante/pos' },
  { label: 'Cocina', icon: ChefHat, path: '/restaurante/cocina-pro' },
  { label: 'Cuenta', icon: CircleDollarSign, path: '/restaurante/mapa' },
  { label: 'Turno', icon: Clock3, path: '/pos' },
];

function armarMenu({ productos, pizzas, presentaciones, grupos, adicionales, fotos, stocks, catalogo }) {
  const pizzaPorProducto = new Map((pizzas || []).map((pizza) => [String(pizza.producto_id), pizza]));
  return (productos || [])
    .filter((producto) => producto.activo !== false)
    .filter((producto) => !catalogo.categoria?.length || catalogo.categoria.includes(producto.categoria))
    .filter((producto) => !catalogo.marca?.length || catalogo.marca.includes(producto.marca))
    .filter((producto) => catalogo.precio_min == null || Number(producto.precio_venta || 0) >= Number(catalogo.precio_min))
    .filter((producto) => catalogo.precio_max == null || Number(producto.precio_venta || 0) <= Number(catalogo.precio_max))
    .filter((producto) => {
      const pizza = pizzaPorProducto.get(String(producto.id));
      return !pizza || (pizza.activo && pizza.visible_catalogo);
    })
    .map((producto) => {
      const pizza = pizzaPorProducto.get(String(producto.id));
      const stockSucursal = Number(stocks.get(String(producto.id)) || 0);
      const stock = stocks.has(String(producto.id)) && stockSucursal > 0
        ? stockSucursal
        : Math.max(0, Number(producto.stock_actual) || 0);
      if (!pizza) return {
        ...producto,
        precio: Number(producto.precio_venta) || 0,
        imagen: producto.imagen_url || '',
        stock_disponible: /servicio/i.test(producto.categoria || '') ? null : stock,
        disponible: /servicio/i.test(producto.categoria || '') || stock > 0,
        pizza: null,
      };
      const presentacionesPizza = (presentaciones || []).filter((item) => item.pizza_id === pizza.id && item.disponible);
      const gruposPizza = (grupos || []).filter((item) => item.pizza_id === pizza.id && item.activo).map((grupo) => ({
        ...grupo,
        opciones: (adicionales || []).filter((item) => item.grupo_id === grupo.id && item.activo),
      }));
      return {
        ...producto,
        precio: Number(producto.precio_venta) || 0,
        imagen: (fotos || []).find((foto) => foto.pizza_id === pizza.id && foto.principal)?.url || producto.imagen_url || '',
        stock_disponible: null,
        disponible: presentacionesPizza.length > 0,
        pizza: {
          ...pizza,
          nombre: producto.nombre,
          presentaciones: presentacionesPizza,
          grupos: gruposPizza,
          fotos: (fotos || []).filter((foto) => foto.pizza_id === pizza.id),
        },
      };
    });
}

function PedidoWebPOSCard({ pedido, alAceptar, alRechazar, guardando }) {
  const cancelado = pedido.estado === 'cancelado' || pedido.delivery_estado === 'cancelado';
  const estado = cancelado ? 'Rechazado' : pedido.delivery_estado === 'listo' ? 'Listo para retirar' : pedido.delivery_estado === 'recibido' ? 'Esperando respuesta' : 'Aceptado · en cocina';
  const estilo = cancelado ? 'bg-rose-100 text-rose-800' : pedido.delivery_estado === 'listo' ? 'bg-emerald-100 text-emerald-800' : pedido.delivery_estado === 'recibido' ? 'bg-amber-100 text-amber-900' : 'bg-blue-100 text-blue-800';
  return <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-black uppercase tracking-wide text-orange-700">Pedido web · Para llevar · {pedido.numero_pedido}</p><h3 className="mt-1 text-lg font-black text-slate-900">{pedido.cliente_nombre || 'Cliente sin nombre'}</h3><p className="mt-1 text-sm text-slate-600">{pedido.cliente_telefono || 'Sin teléfono'} · {new Date(pedido.creado_en).toLocaleString('es-PY')}</p></div><span className={`rounded-full px-3 py-1.5 text-xs font-black ${estilo}`}>{estado}</span></div>
    <div className="mt-3 divide-y divide-slate-100 rounded-lg border border-slate-100">{(Array.isArray(pedido.items) ? pedido.items : []).map((item, index) => <div key={`${pedido.id}-web-${index}`} className="flex justify-between gap-3 px-3 py-2 text-sm"><span><b>{item.cantidad}×</b> {item.nombre}</span><span className="text-slate-600">{dinero(item.subtotal)}</span></div>)}</div>
    {pedido.nota && <p className="mt-3 rounded-lg bg-amber-50 p-2.5 text-sm text-amber-900">Nota: {pedido.nota}</p>}{pedido.delivery_cancelado_motivo && <p className="mt-3 rounded-lg bg-rose-50 p-2.5 text-sm text-rose-800">Motivo: {pedido.delivery_cancelado_motivo}</p>}
    <div className="mt-3 flex flex-wrap items-center justify-between gap-2"><strong className="text-base font-black text-slate-900">Total {dinero(pedido.total)}</strong>{!cancelado && pedido.delivery_estado === 'recibido' && <div className="flex gap-2"><button type="button" disabled={guardando} onClick={() => alRechazar(pedido)} className="inline-flex items-center gap-1 rounded-lg border border-rose-200 px-3 py-2 text-sm font-bold text-rose-700 hover:bg-rose-50 disabled:opacity-50"><X size={15}/>Rechazar</button><button type="button" disabled={guardando} onClick={() => alAceptar(pedido)} className="inline-flex items-center gap-1 rounded-lg bg-emerald-700 px-3 py-2 text-sm font-bold text-white hover:bg-emerald-800 disabled:opacity-50"><Check size={15}/>{guardando ? 'Guardando…' : 'Aceptar'}</button></div>}</div>
  </article>;
}

export default function RestaurantePOS() {
  const navigate = useNavigate();
  const empresa = useEmpresaInfo();
  const empresaId = empresa?.id;
  const { ajustes } = useConfiguracionEmpresa(empresaId);
  const { notificar } = useNotificacion();
  const [catalogos, setCatalogos] = useState([]);
  const [catalogoId, setCatalogoId] = useState('');
  const [mesas, setMesas] = useState([]);
  const [pedidosAbiertos, setPedidosAbiertos] = useState([]);
  const [mesaId, setMesaId] = useState('');
  const [tipoDestino, setTipoDestino] = useState('');
  const [modalDestino, setModalDestino] = useState(false);
  const [filtroMesas, setFiltroMesas] = useState('todas');
  const [busquedaMesa, setBusquedaMesa] = useState('');
  const [vistaProductos, setVistaProductos] = useState('menu');
  const [nombreCliente, setNombreCliente] = useState('');
  const [telefonoCliente, setTelefonoCliente] = useState('');
  const [direccionDelivery, setDireccionDelivery] = useState('');
  const [ubicacionDelivery, setUbicacionDelivery] = useState(null);
  const [zonasDelivery, setZonasDelivery] = useState([]);
  const [zonaElegidaId, setZonaElegidaId] = useState('');
  const [metodoPagoDelivery, setMetodoPagoDelivery] = useState('efectivo');
  const [pagosDelivery, setPagosDelivery] = useState({ acepta_efectivo: true, acepta_tarjeta: false });
  const [productos, setProductos] = useState([]);
  const [carrito, setCarrito] = useState([]);
  const [categoria, setCategoria] = useState('Todas');
  const [busqueda, setBusqueda] = useState('');
  const [nota, setNota] = useState('');
  const [pizzaConfig, setPizzaConfig] = useState(null);
  const [error, setError] = useState('');
  const [cargando, setCargando] = useState(true);
  const [enviando, setEnviando] = useState(false);
  const [pedidoCreado, setPedidoCreado] = useState(null);
  const [vistaPOS, setVistaPOS] = useState('comanda');
  const [pedidosWeb, setPedidosWeb] = useState([]);
  const [cargandoPedidosWeb, setCargandoPedidosWeb] = useState(false);
  const [errorPedidosWeb, setErrorPedidosWeb] = useState('');
  const [guardandoPedidoWeb, setGuardandoPedidoWeb] = useState('');
  const [pedidoWebRechazo, setPedidoWebRechazo] = useState(null);
  const [motivoRechazoWeb, setMotivoRechazoWeb] = useState('');

  const cargarPedidosWeb = async () => {
    if (!empresaId) return;
    setCargandoPedidosWeb(true);
    setErrorPedidosWeb('');
    const { data, error: consultaError } = await supabase.from('pedidos').select('*')
      .eq('empresa_id', empresaId).eq('origen', 'catalogo_qr').eq('delivery_tipo', 'retiro')
      .order('creado_en', { ascending: false }).limit(100);
    if (consultaError) setErrorPedidosWeb(`No se pudieron cargar pedidos web: ${consultaError.message}`);
    else setPedidosWeb(data || []);
    setCargandoPedidosWeb(false);
  };

  useEffect(() => {
    if (!empresaId) return undefined;
    cargarPedidosWeb();
    const canal = supabase.channel(`pos-pedidos-web-${empresaId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pedidos', filter: `empresa_id=eq.${empresaId}` }, cargarPedidosWeb)
      .subscribe();
    return () => { supabase.removeChannel(canal); };
  }, [empresaId]);

  const actualizarPedidoWeb = async (pedido, cambios, mensaje) => {
    setGuardandoPedidoWeb(pedido.id);
    const ahora = new Date().toISOString();
    const { error: updateError } = await supabase.from('pedidos').update({ ...cambios, delivery_actualizado_en: ahora, actualizado_en: ahora })
      .eq('id', pedido.id).eq('empresa_id', empresaId).eq('origen', 'catalogo_qr').eq('delivery_tipo', 'retiro');
    setGuardandoPedidoWeb('');
    if (updateError) return notificar.error(`No se pudo actualizar el pedido web: ${updateError.message}`);
    setPedidosWeb((actuales) => actuales.map((item) => item.id === pedido.id ? { ...item, ...cambios, delivery_actualizado_en: ahora, actualizado_en: ahora } : item));
    setPedidoWebRechazo(null);
    setMotivoRechazoWeb('');
    notificar.exito(mensaje);
  };

  const rechazarPedidoWeb = (event) => {
    event.preventDefault();
    if (!pedidoWebRechazo || motivoRechazoWeb.trim().length < 3) return;
    actualizarPedidoWeb(pedidoWebRechazo, { estado: 'cancelado', delivery_estado: 'cancelado', delivery_cancelado_motivo: motivoRechazoWeb.trim() }, 'Pedido web rechazado y cancelado.');
  };

  useEffect(() => {
    if (!empresaId) return;
    let vigente = true;
    (async () => {
      setCargando(true);
      setError('');
      const { data, error: catalogoError } = await supabase.from('catalogos_qr')
        .select('id,nombre,public_token,ubicacion_id,categoria,marca,precio_min,precio_max,color')
        .eq('empresa_id', empresaId).eq('estado', 'Activo').order('nombre');
      if (!vigente) return;
      if (catalogoError) {
        setError(`No se pudieron cargar los menús del restaurante: ${catalogoError.message}`);
        setCatalogos([]);
        setCargando(false);
        return;
      }
      const list = data || [];
      setCatalogos(list);
      const seleccionado = list.find((item) => String(item.id) === String(ajustes.restaurant_catalogo_qr_id)) || list[0];
      setCatalogoId(seleccionado ? String(seleccionado.id) : '');
      setCargando(false);
    })();
    return () => { vigente = false; };
  }, [empresaId, ajustes.restaurant_catalogo_qr_id]);

  const catalogo = catalogos.find((item) => String(item.id) === String(catalogoId)) || null;

  useEffect(() => {
    if (!empresaId || !catalogo) {
      setMesas([]);
      setMesaId('');
      setProductos([]);
      return;
    }
    let vigente = true;
    const cargarMenu = async () => {
      setCargando(true);
      setError('');
      const consultas = [
        supabase.from('catalogos_qr_mesas').select('id,nombre,public_token,activo').eq('empresa_id', empresaId).eq('catalogo_id', catalogo.id).eq('activo', true).order('nombre'),
        supabase.from('pedidos').select('id,mesa_id,mesa_nombre,estado,total,creado_en').eq('empresa_id', empresaId).eq('origen', 'catalogo_qr_mesa').neq('estado', 'cancelado').order('creado_en', { ascending: false }).limit(250),
        supabase.from('pedidos_qr_ventas').select('pedido_id').eq('empresa_id', empresaId),
        supabase.from('productos').select('id,nombre,codigo,descripcion,precio_venta,stock_actual,imagen_url,categoria,marca,activo').eq('empresa_id', empresaId).eq('activo', true).order('nombre').limit(1000),
        supabase.from('pizzas').select('id,producto_id,activo,destacado,visible_catalogo,permitir_mitad_mitad,max_sabores').eq('empresa_id', empresaId),
        supabase.from('pizza_presentaciones').select('id,pizza_id,nombre,diametro_cm,precio_venta,precio_promocional,disponible,orden').eq('empresa_id', empresaId).eq('disponible', true).order('orden'),
        supabase.from('pizza_grupos_opciones').select('id,pizza_id,nombre,minimo,maximo,obligatorio,permite_mitad_mitad,activo,orden').eq('empresa_id', empresaId).eq('activo', true).order('orden'),
        supabase.from('pizza_adicionales').select('id,grupo_id,nombre,precio,activo,orden').eq('empresa_id', empresaId).eq('activo', true).order('orden'),
        supabase.from('pizza_fotos').select('id,pizza_id,url,orden,principal').eq('empresa_id', empresaId).order('orden'),
      ];
      if (catalogo.ubicacion_id) consultas.push(supabase.from('producto_stock_ubicacion').select('producto_id,cantidad').eq('empresa_id', empresaId).eq('ubicacion_id', catalogo.ubicacion_id));
      const results = await Promise.all(consultas);
      if (!vigente) return;
      const [rMesas, rPedidos, rCobros, rProductos, rPizzas, rPresentaciones, rGrupos, rAdicionales, rFotos, rStock] = results;
      const failure = rMesas.error || rProductos.error;
      if (failure) {
        setError(`No se pudo preparar el menú: ${failure.message}`);
        setMesas([]);
        setProductos([]);
      } else {
        const stockMap = new Map((rStock?.data || []).map((item) => [String(item.producto_id), item.cantidad]));
        const menu = armarMenu({
          productos: rProductos.data,
          pizzas: rPizzas.error ? [] : rPizzas.data,
          presentaciones: rPresentaciones.error ? [] : rPresentaciones.data,
          grupos: rGrupos.error ? [] : rGrupos.data,
          adicionales: rAdicionales.error ? [] : rAdicionales.data,
          fotos: rFotos.error ? [] : rFotos.data,
          stocks: stockMap,
          catalogo,
        });
        setMesas(rMesas.data || []);
        const cobrados = new Set((rCobros?.data || []).map((item) => String(item.pedido_id)));
        setPedidosAbiertos((rPedidos?.data || []).filter((pedido) => !cobrados.has(String(pedido.id))));
        setMesaId((actual) => (rMesas.data || []).some((mesa) => String(mesa.id) === String(actual)) ? actual : '');
        setProductos(menu);
      }
      setCargando(false);
    };
    cargarMenu();
    return () => { vigente = false; };
  }, [empresaId, catalogo]);

  useEffect(() => {
    if (!catalogo?.public_token) { setZonasDelivery([]); return; }
    let vigente = true;
    Promise.all([
      supabase.rpc('listar_zonas_delivery_qr_publico', { p_token: catalogo.public_token }),
      supabase.rpc('obtener_pago_delivery_qr_publico', { p_token: catalogo.public_token }),
    ]).then(([rZonas, rPagos]) => {
      if (!vigente) return;
      setZonasDelivery(rZonas.error ? [] : rZonas.data || []);
      if (!rPagos.error && rPagos.data) {
        setPagosDelivery(rPagos.data);
        setMetodoPagoDelivery(rPagos.data.acepta_efectivo ? 'efectivo' : rPagos.data.acepta_tarjeta ? 'tarjeta' : 'efectivo');
      }
    });
    return () => { vigente = false; };
  }, [catalogo?.public_token]);

  const productosDeVista = useMemo(() => productos.filter((producto) => vistaProductos === 'servicios'
    ? /servicio/i.test(producto.categoria || '')
    : !/servicio/i.test(producto.categoria || '')), [productos, vistaProductos]);
  const categorias = useMemo(() => ['Todas', ...new Set(productosDeVista.map((producto) => producto.categoria).filter(Boolean))], [productosDeVista]);
  const productosFiltrados = useMemo(() => {
    const q = busqueda.trim().toLocaleLowerCase('es');
    return productosDeVista.filter((producto) => (categoria === 'Todas' || producto.categoria === categoria)
      && (!q || `${producto.nombre} ${producto.codigo || ''} ${producto.categoria || ''}`.toLocaleLowerCase('es').includes(q)));
  }, [productosDeVista, busqueda, categoria]);
  const total = carrito.reduce((suma, item) => suma + Number(item.precio_unitario || 0) * Number(item.cantidad || 0), 0);
  const mesaSeleccionada = mesas.find((mesa) => String(mesa.id) === String(mesaId));
  const cantidadProductos = carrito.reduce((suma, item) => suma + Number(item.cantidad || 0), 0);
  const zonaDetectada = zonaEnCoordenadas(ubicacionDelivery, zonasDelivery);
  const zonaPlana = zonasDelivery.length === 1 && !(Number(zonasDelivery[0]?.radio_km) > 0) && (zonasDelivery[0]?.poligono || []).length < 3 ? zonasDelivery[0] : null;
  const zonaDelivery = zonaDetectada || (zonaPlana && ubicacionDelivery ? zonaPlana : null) || zonasDelivery.find((zona) => String(zona.id) === String(zonaElegidaId)) || null;
  const centroMapaDelivery = useMemo(() => {
    const candidatas = [...(zonaDelivery ? [zonaDelivery] : []), ...zonasDelivery.filter((zona) => String(zona.id) !== String(zonaDelivery?.id))];
    for (const zona of candidatas) {
      const lat = Number(zona.centro_latitud);
      const lng = Number(zona.centro_longitud);
      if (zona.centro_latitud != null && zona.centro_longitud != null && Number.isFinite(lat) && Number.isFinite(lng)) return [lat, lng];
      const puntos = Array.isArray(zona.poligono) ? zona.poligono : [];
      if (puntos.length >= 3) {
        const latitudes = puntos.map((punto) => Number(punto[0])).filter(Number.isFinite);
        const longitudes = puntos.map((punto) => Number(punto[1])).filter(Number.isFinite);
        if (latitudes.length === puntos.length && longitudes.length === puntos.length) {
          return [latitudes.reduce((suma, valor) => suma + valor, 0) / latitudes.length, longitudes.reduce((suma, valor) => suma + valor, 0) / longitudes.length];
        }
      }
    }
    return null;
  }, [zonaDelivery, zonasDelivery]);
  const pedidosPorMesa = useMemo(() => {
    const agrupados = new Map();
    pedidosAbiertos.forEach((pedido) => {
      if (!pedido.mesa_id) return;
      agrupados.set(pedido.mesa_id, [...(agrupados.get(pedido.mesa_id) || []), pedido]);
    });
    return agrupados;
  }, [pedidosAbiertos]);
  const mesasFiltradas = mesas.filter((mesa) => {
    const ocupada = pedidosPorMesa.has(mesa.id);
    return (filtroMesas === 'todas' || (filtroMesas === 'ocupadas' ? ocupada : !ocupada))
      && mesa.nombre.toLocaleLowerCase('es').includes(busquedaMesa.trim().toLocaleLowerCase('es'));
  });

  const elegirDestino = (tipo, mesa = null) => {
    setTipoDestino(tipo);
    setMesaId(mesa?.id ? String(mesa.id) : '');
    setPedidoCreado(null);
    setError('');
    if (tipo !== 'mesa') setMesaId('');
    if (tipo !== 'delivery') { setDireccionDelivery(''); setUbicacionDelivery(null); setZonaElegidaId(''); }
    setModalDestino(false);
  };

  const agregarProducto = (producto, seleccion = null) => {
    if (producto.pizza) {
      setPizzaConfig(producto);
      return;
    }
    setCarrito((actual) => {
      const existente = actual.find((item) => String(item.producto_id) === String(producto.id));
      if (existente) {
        if (producto.stock_disponible != null && existente.cantidad >= producto.stock_disponible) return actual;
        return actual.map((item) => String(item.producto_id) === String(producto.id) ? { ...item, cantidad: item.cantidad + 1 } : item);
      }
      return [...actual, { producto_id: producto.id, nombre: producto.nombre, codigo: producto.codigo, precio_unitario: Number(producto.precio) || 0, cantidad: 1, stock_disponible: producto.stock_disponible, configuracion_pizza: seleccion?.configuracion_pizza || null }];
    });
  };
  const agregarPizza = (seleccion) => {
    const producto = pizzaConfig;
    if (!producto) return;
    setCarrito((actual) => {
      const existente = actual.find((item) => String(item.producto_id) === String(producto.id));
      const linea = {
        linea_id: crypto.randomUUID(),
        producto_id: producto.id,
        nombre: seleccion.nombre,
        codigo: producto.codigo,
        precio_unitario: Number(seleccion.precio) || 0,
        cantidad: (existente?.cantidad || 0) + 1,
        stock_disponible: null,
        configuracion_pizza: seleccion.configuracion_pizza,
      };
      return existente ? actual.map((item) => String(item.producto_id) === String(producto.id) ? linea : item) : [...actual, linea];
    });
    setPizzaConfig(null);
  };
  const cambiarCantidad = (lineaId, cambio) => setCarrito((actual) => actual.flatMap((item) => {
    if (String(item.linea_id || item.producto_id) !== String(lineaId)) return [item];
    const cantidad = item.cantidad + cambio;
    if (cantidad <= 0) return [];
    if (item.stock_disponible != null && cantidad > item.stock_disponible) return [item];
    return [{ ...item, cantidad }];
  }));

  const enviarComanda = async (event) => {
    event.preventDefault();
    setError('');
    setPedidoCreado(null);
    if (!catalogo) return setError('Configurá y activá un catálogo QR para restaurante antes de tomar pedidos.');
    if (!tipoDestino) return setError('Elegí si el pedido es para mesa, para llevar o delivery.');
    if (tipoDestino === 'mesa' && !mesaSeleccionada) return setError('Elegí la mesa que recibirá esta comanda.');
    if (tipoDestino !== 'mesa' && (nombreCliente.trim().length < 2 || telefonoCliente.replace(/\D/g, '').length < 8)) return setError('Ingresá el nombre del cliente y un teléfono válido.');
    if (tipoDestino === 'delivery' && direccionDelivery.trim().length < 5) return setError('Ingresá la dirección de entrega con una referencia.');
    if (tipoDestino === 'delivery' && !centroMapaDelivery) return setError('Configurá el centro o polígono de cobertura en Restaurante → Delivery para ubicar correctamente el mapa.');
    if (tipoDestino === 'delivery' && (!ubicacionDelivery || !zonaDelivery)) return setError('Marcá el domicilio en el mapa dentro de una zona de cobertura.');
    if (tipoDestino === 'delivery' && metodoPagoDelivery === 'tarjeta' && !pagosDelivery.acepta_tarjeta) return setError('Este negocio no tiene habilitado el cobro con tarjeta para delivery.');
    if (tipoDestino === 'delivery' && metodoPagoDelivery === 'efectivo' && !pagosDelivery.acepta_efectivo) return setError('Este negocio no tiene habilitado el pago en efectivo para delivery.');
    if (!carrito.length) return setError('Agregá al menos un producto a la comanda.');
    setEnviando(true);
    const items = carrito.map((item) => ({ producto_id: item.producto_id, cantidad: item.cantidad, ...(item.configuracion_pizza ? { configuracion_pizza: item.configuracion_pizza } : {}) }));
    const { data, error: rpcError } = tipoDestino === 'mesa'
      ? await supabase.rpc('crear_pedido_mesa_qr_publico', { p_token: mesaSeleccionada.public_token, p_items: items, p_nota: nota.trim() || null })
      : tipoDestino === 'delivery'
        ? await supabase.rpc('crear_pedido_delivery_qr_publico', { p_token: catalogo.public_token, p_cliente_nombre: nombreCliente.trim(), p_cliente_telefono: telefonoCliente.trim(), p_items: items, p_nota: nota.trim() || null, p_direccion: direccionDelivery.trim(), p_zona_id: zonaDelivery?.id || null, p_latitud: ubicacionDelivery?.[0] ?? null, p_longitud: ubicacionDelivery?.[1] ?? null, p_sin_ubicacion: false, p_destinatario: null, p_destinatario_telefono: null, p_pago_con: null, p_metodo_pago: metodoPagoDelivery, p_comprobante_path: null })
        : await supabase.rpc('crear_pedido_catalogo_qr_publico', { p_token: catalogo.public_token, p_cliente_nombre: nombreCliente.trim(), p_cliente_telefono: telefonoCliente.trim(), p_items: items, p_nota: nota.trim() || null });
    setEnviando(false);
    if (rpcError) {
      const message = rpcError.message || 'Error desconocido';
      setError(message.includes('STOCK_INSUFICIENTE')
        ? 'No hay existencias suficientes para uno de los productos. Actualizá el menú y revisá la cantidad.'
        : message.includes('ZONA_FUERA_DE_COBERTURA') || message.includes('UBICACION_REQUERIDA')
          ? 'El punto marcado no está cubierto por una zona de delivery activa. Mové el pin o revisá las tarifas.'
        : `No se pudo enviar la comanda: ${message}`);
      return;
    }
    setPedidoCreado(data);
    if (data?.id && tipoDestino === 'mesa' && mesaSeleccionada) setPedidosAbiertos((actuales) => [{ id: data.id, mesa_id: mesaSeleccionada.id, mesa_nombre: mesaSeleccionada.nombre, total: data.total, estado: 'pendiente', creado_en: new Date().toISOString() }, ...actuales]);
    setCarrito([]);
    setNota('');
    if (tipoDestino !== 'mesa') { setNombreCliente(''); setTelefonoCliente(''); setDireccionDelivery(''); setUbicacionDelivery(null); setZonaElegidaId(''); }
    notificar.exito(`Comanda ${data?.numero_pedido || ''} enviada a cocina.`);
  };

  const nombreDestino = tipoDestino === 'mesa' ? mesaSeleccionada?.nombre : tipoDestino === 'delivery' ? 'Delivery' : tipoDestino === 'retiro' ? 'Para llevar' : 'Sin destino';

  const [horaPOS, setHoraPOS] = useState(() => new Date());
  useEffect(() => {
    const timer = window.setInterval(() => setHoraPOS(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  const empresaPOSNombre = empresa?.nombre || empresa?.nombre_empresa || empresa?.razon_social || 'Mi negocio';
  const abrirPantallaCompleta = async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen?.();
    } catch { /* El navegador puede impedir fullscreen; el POS sigue operativo. */ }
  };

  return <main className="flex h-full min-h-0 w-full flex-col overflow-hidden bg-[#0b1220] text-slate-100">
    <header className="flex h-11 shrink-0 items-center justify-between gap-3 border-b border-white/10 bg-slate-950 px-4 text-xs">
      <div className="flex min-w-0 items-center gap-2"><strong className="text-sm tracking-tight">PyPos</strong><span className="rounded bg-orange-600 px-2 py-1 text-[10px] font-bold">Restaurante</span><span className="truncate text-slate-300">{empresaPOSNombre}</span></div>
      <div className="flex shrink-0 items-center gap-3"><span className="hidden text-slate-300 sm:inline">{empresa?.nombre_usuario || empresa?.usuario_nombre || 'Operación'}</span><span className="hidden font-mono text-emerald-300 sm:inline">{horaPOS.toLocaleTimeString('es-PY')}</span><button type="button" onClick={abrirPantallaCompleta} className="inline-flex items-center gap-1.5 rounded bg-slate-800 px-2.5 py-1.5 font-bold hover:bg-slate-700"><Maximize2 size={13}/>Pantalla completa</button></div>
    </header>
    <nav aria-label="Operación de restaurante" className="grid shrink-0 grid-cols-3 gap-1 border-b border-white/10 bg-[#111b2d] px-2 py-1 sm:grid-cols-4 lg:grid-cols-7">
      {PESTANAS.map(({ label, icon: Icon, path }) => { const activa = label === 'Pedidos web' ? vistaPOS === 'pedidos-web' : vistaPOS === 'comanda' && label === 'Comanda'; const pendientesWeb = pedidosWeb.filter((pedido) => pedido.estado !== 'cancelado' && pedido.delivery_estado === 'recibido').length; return <button key={label} type="button" onClick={() => { if (label === 'Pedidos web') setVistaPOS('pedidos-web'); else if (label === 'Comanda') setVistaPOS('comanda'); else if (path) navigate(path); }} aria-current={activa ? 'page' : undefined} className={`relative flex items-center justify-center gap-1.5 rounded-md px-2 py-2.5 text-xs font-bold transition sm:text-sm ${activa ? 'bg-orange-600 text-white shadow-sm' : 'text-slate-300 hover:bg-white/10 hover:text-white'}`}><Icon size={16}/><span>{label}</span>{label === 'Comanda' && vistaPOS === 'comanda' && <span className="rounded-full bg-white/20 px-1.5">{carrito.length}</span>}{label === 'Pedidos web' && pendientesWeb > 0 && <span className="absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-rose-600 px-1 text-[10px] text-white">{pendientesWeb > 99 ? '99+' : pendientesWeb}</span>}</button>; })}
    </nav>

    {vistaPOS === 'pedidos-web' ? <section className="min-h-0 flex-1 space-y-4 overflow-y-auto bg-slate-100 p-4 text-slate-900">
      <div className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="text-xl font-black text-slate-900">Pedidos web · Comanda</h1><p className="text-sm text-slate-600">Solicitudes para llevar recibidas desde la carta online de este negocio.</p></div><button type="button" onClick={cargarPedidosWeb} disabled={cargandoPedidosWeb} className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-bold"><LoaderCircle size={15} className={cargandoPedidosWeb ? 'animate-spin' : ''}/>Actualizar</button></div>
      {errorPedidosWeb && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{errorPedidosWeb}</p>}
      <div className="grid gap-3 sm:grid-cols-3"><div className="rounded-xl border border-amber-200 bg-amber-50 p-4"><p className="text-xs font-bold uppercase text-amber-700">Esperando respuesta</p><p className="mt-1 text-2xl font-black text-amber-900">{pedidosWeb.filter((p) => p.estado !== 'cancelado' && p.delivery_estado === 'recibido').length}</p></div><div className="rounded-xl border border-blue-200 bg-blue-50 p-4"><p className="text-xs font-bold uppercase text-blue-700">Aceptados / en cocina</p><p className="mt-1 text-2xl font-black text-blue-900">{pedidosWeb.filter((p) => p.estado !== 'cancelado' && ['preparando', 'listo'].includes(p.delivery_estado)).length}</p></div><div className="rounded-xl border border-rose-200 bg-rose-50 p-4"><p className="text-xs font-bold uppercase text-rose-700">Rechazados</p><p className="mt-1 text-2xl font-black text-rose-900">{pedidosWeb.filter((p) => p.estado === 'cancelado' || p.delivery_estado === 'cancelado').length}</p></div></div>
      {cargandoPedidosWeb ? <p className="rounded-xl bg-white p-10 text-center text-slate-500">Cargando pedidos web…</p> : <><section className="space-y-3"><h2 className="flex items-center gap-2 text-sm font-black uppercase tracking-wide text-amber-900"><Clock3 size={16}/>Solicitudes nuevas</h2>{pedidosWeb.filter((p) => p.estado !== 'cancelado' && p.delivery_estado === 'recibido').length ? <div className="grid gap-3 lg:grid-cols-2">{pedidosWeb.filter((p) => p.estado !== 'cancelado' && p.delivery_estado === 'recibido').map((pedido) => <PedidoWebPOSCard key={pedido.id} pedido={pedido} guardando={guardandoPedidoWeb === pedido.id} alAceptar={(p) => actualizarPedidoWeb(p, { delivery_estado: 'preparando' }, 'Pedido aceptado y enviado a cocina.')} alRechazar={(p) => { setPedidoWebRechazo(p); setMotivoRechazoWeb(''); }}/>)}</div> : <p className="rounded-xl border border-dashed border-amber-200 bg-white p-7 text-center text-sm text-slate-500">No hay solicitudes nuevas esperando respuesta.</p>}</section>
      {pedidosWeb.some((p) => p.estado !== 'cancelado' && ['preparando', 'listo'].includes(p.delivery_estado)) && <section className="space-y-3"><h2 className="text-sm font-black uppercase tracking-wide text-blue-900">Aceptados · seguimiento de cocina</h2><div className="grid gap-3 lg:grid-cols-2">{pedidosWeb.filter((p) => p.estado !== 'cancelado' && ['preparando', 'listo'].includes(p.delivery_estado)).map((pedido) => <PedidoWebPOSCard key={pedido.id} pedido={pedido}/>)}</div></section>}
      {pedidosWeb.some((p) => p.estado === 'cancelado' || p.delivery_estado === 'cancelado') && <details className="rounded-xl border border-slate-200 bg-white p-4"><summary className="cursor-pointer font-bold text-slate-700">Rechazados ({pedidosWeb.filter((p) => p.estado === 'cancelado' || p.delivery_estado === 'cancelado').length})</summary><div className="mt-3 grid gap-3 lg:grid-cols-2">{pedidosWeb.filter((p) => p.estado === 'cancelado' || p.delivery_estado === 'cancelado').map((pedido) => <PedidoWebPOSCard key={pedido.id} pedido={pedido}/>)}</div></details>}</>}
      {pedidoWebRechazo && <div role="dialog" aria-modal="true" aria-labelledby="pedido-web-rechazo-pos" className="fixed inset-0 z-[130] grid place-items-center bg-slate-950/60 p-4"><form onSubmit={rechazarPedidoWeb} className="w-full max-w-md space-y-4 rounded-2xl bg-white p-5 shadow-2xl"><div><h2 id="pedido-web-rechazo-pos" className="text-lg font-black">Rechazar {pedidoWebRechazo.numero_pedido}</h2><p className="text-sm text-slate-500">El motivo quedará guardado en el pedido.</p></div><label className="block text-sm font-bold">Motivo<textarea required minLength={3} maxLength={500} value={motivoRechazoWeb} onChange={(e) => setMotivoRechazoWeb(e.target.value)} className="mt-1.5 min-h-24 w-full rounded-lg border border-slate-300 p-3 text-sm font-normal"/></label><div className="flex justify-end gap-2"><button type="button" onClick={() => setPedidoWebRechazo(null)} className="rounded-lg border px-4 py-2 text-sm font-bold">Volver</button><button type="submit" disabled={guardandoPedidoWeb === pedidoWebRechazo.id || motivoRechazoWeb.trim().length < 3} className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">{guardandoPedidoWeb === pedidoWebRechazo.id ? 'Guardando…' : 'Confirmar rechazo'}</button></div></form></div>}
    </section> : <section className="min-h-0 flex-1 overflow-hidden bg-[#111b2d]">
      <div className="grid h-full min-h-0 grid-cols-1 lg:grid-cols-[minmax(0,1fr)_376px]">
        <section className="flex min-h-0 min-w-0 flex-col overflow-hidden border-r border-white/10">
          <div className="flex shrink-0 items-center gap-3 border-b border-white/10 px-3 py-1.5">
            <div className="flex gap-4"><button type="button" onClick={() => { setVistaProductos('menu'); setCategoria('Todas'); }} className={`border-b-2 px-2 py-2 text-sm font-bold ${vistaProductos === 'menu' ? 'border-orange-500 text-orange-300' : 'border-transparent text-slate-400'}`}>Menú</button><button type="button" onClick={() => { setVistaProductos('servicios'); setCategoria('Todas'); }} className={`border-b-2 px-2 py-2 text-sm font-bold ${vistaProductos === 'servicios' ? 'border-orange-500 text-orange-300' : 'border-transparent text-slate-400'}`}>Servicios</button></div>
            <label className="ml-auto flex items-center gap-2 text-xs font-semibold text-slate-300">Carta<select aria-label="Menú del restaurante" value={catalogoId} onChange={(event) => { setCatalogoId(event.target.value); setCarrito([]); setPedidoCreado(null); }} className="max-w-48 rounded bg-slate-800 px-2 py-1.5 text-xs text-white"><option value="">Elegir menú</option>{catalogos.map((item) => <option key={item.id} value={item.id}>{item.nombre}</option>)}</select></label>
          </div>
          <label className="relative block shrink-0 border-b border-white/10 p-2"><Search size={17} className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-400"/><input value={busqueda} onChange={(event) => setBusqueda(event.target.value)} placeholder="Buscar producto…" className="w-full border border-slate-500 bg-transparent px-4 py-3 pl-11 text-sm font-semibold text-white outline-none placeholder:text-slate-400 focus:border-blue-400"/></label>
          <div className="flex shrink-0 gap-2 overflow-x-auto border-b border-white/10 px-2 py-2">{categorias.map((item) => <button key={item} type="button" onClick={() => setCategoria(item)} className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-bold ${categoria === item ? 'border-orange-500 bg-orange-600 text-white' : 'border-slate-600 bg-slate-900 text-slate-200 hover:border-orange-400'}`}>{item}</button>)}</div>
          <div className="min-h-0 flex-1 overflow-y-auto p-2">
          {error && <div role="alert" className="mb-2 rounded-lg border border-rose-300 bg-rose-950/80 px-3 py-2.5 text-sm text-rose-100">{error}</div>}
          {pedidoCreado && <div role="status" className="mb-2 flex items-start gap-2 rounded-lg border border-emerald-300 bg-emerald-950/80 px-3 py-2.5 text-sm text-emerald-100"><Check size={17} className="mt-0.5 shrink-0"/><span><b>{pedidoCreado.numero_pedido}</b> se envió a cocina · {dinero(pedidoCreado.total)}. Podés tomar la siguiente comanda.</span><button type="button" aria-label="Cerrar confirmación" onClick={() => setPedidoCreado(null)} className="ml-auto rounded p-1 hover:bg-emerald-100/20"><X size={15}/></button></div>}

          {cargando ? <div className="grid min-h-64 place-items-center text-sm text-slate-500"><span><LoaderCircle className="mx-auto mb-2 animate-spin"/>Cargando menú…</span></div>
            : !catalogo ? <div className="mt-6 rounded-xl border border-dashed border-slate-600 p-10 text-center text-sm text-slate-300">No hay un menú activo. Configurá el catálogo QR en Restaurante → Configuración.</div>
              : !productosFiltrados.length ? <div className="mt-6 rounded-xl border border-dashed border-slate-600 p-10 text-center text-sm text-slate-300">{vistaProductos === 'servicios' ? 'No hay productos en la categoría Servicios. Clasificá tus servicios con esa categoría para mostrarlos aquí.' : 'No hay productos disponibles para este menú o búsqueda.'}</div>
                : <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6 2xl:grid-cols-8">{productosFiltrados.map((producto) => <article key={producto.id} className="group h-[180px] overflow-hidden rounded-xl border border-slate-300 bg-white transition hover:border-orange-300 hover:shadow-md">
                  <button type="button" onClick={() => agregarProducto(producto)} disabled={!producto.disponible} aria-label={producto.pizza ? `Personalizar ${producto.nombre}` : `Agregar ${producto.nombre}`} className="block w-full text-left disabled:cursor-not-allowed disabled:opacity-60">
                    <div className="relative grid h-[88px] place-items-center overflow-hidden bg-[#671f22]">{producto.imagen ? <img src={producto.imagen} alt="" loading="lazy" className="h-full w-full object-cover transition group-hover:scale-[1.03]"/> : <span className="text-2xl font-black text-white/80">{producto.nombre?.slice(0, 1) || '?'}</span>}{producto.categoria && <span className="absolute left-1 top-1 max-w-[90%] truncate rounded-full bg-white/90 px-1.5 py-0.5 text-[9px] font-bold text-slate-600 shadow-sm">{producto.categoria}</span>}</div>
                    <div className="flex h-[92px] flex-col p-2"><h2 className="line-clamp-2 min-h-8 text-xs font-bold leading-4 text-slate-800">{producto.nombre}</h2><div className="mt-auto flex items-end justify-between gap-1"><span className="truncate text-xs font-black text-emerald-700">{producto.pizza ? `Desde ${dinero(Math.min(...producto.pizza.presentaciones.map((item) => Number(item.precio_promocional ?? item.precio_venta) || 0)))}` : dinero(producto.precio)}</span><span className={`shrink-0 text-[9px] font-bold ${producto.pizza || producto.disponible ? 'text-slate-500' : 'text-rose-600'}`}>{producto.pizza ? 'Receta' : producto.stock_disponible == null ? 'Servicio' : producto.disponible ? `${producto.stock_disponible}` : 'Sin stock'}</span></div></div>
                  </button>
                </article>)}</div>}
          </div>
        </section>

        <aside className="flex min-h-[430px] min-w-0 flex-col border-t border-slate-300 bg-white text-slate-900 lg:min-h-0 lg:border-l lg:border-t-0">
          <div className="flex shrink-0 items-center gap-2 bg-slate-950 px-3 py-2 text-white"><strong className="mr-auto text-xs">{nombreDestino}</strong><button type="button" onClick={() => setModalDestino(true)} className="inline-flex items-center gap-1 rounded bg-blue-600 px-2 py-1.5 text-[10px] font-black"><MapPin size={12}/>Elegir</button><select aria-label="Seleccionar mesa" value={tipoDestino === 'mesa' ? mesaId : ''} onChange={(event) => { const mesa = mesas.find((item) => String(item.id) === String(event.target.value)); if (mesa) elegirDestino('mesa', mesa); }} className="max-w-28 rounded border border-slate-600 bg-slate-900 px-2 py-1.5 text-[10px] text-white"><option value="">Mesa…</option>{mesas.map((mesa) => <option key={mesa.id} value={mesa.id}>{mesa.nombre}</option>)}</select></div>
          <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-3">{carrito.length ? carrito.map((item) => { const lineaId = item.linea_id || item.producto_id; return <article key={lineaId} className="rounded-lg border border-slate-200 bg-white p-3"><div className="flex items-start justify-between gap-2"><div className="min-w-0"><p className="font-bold text-slate-800">{item.nombre}</p><p className="mt-0.5 text-xs text-slate-500">{dinero(item.precio_unitario)} c/u</p></div><button type="button" aria-label={`Quitar ${item.nombre}`} onClick={() => setCarrito((actual) => actual.filter((linea) => String(linea.linea_id || linea.producto_id) !== String(lineaId)))} className="rounded p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600"><Trash2 size={15}/></button></div><div className="mt-2 flex items-center justify-between"><span className="text-sm font-black text-slate-900">{dinero(item.precio_unitario * item.cantidad)}</span><div className="flex items-center gap-2"><button type="button" aria-label="Quitar uno" onClick={() => cambiarCantidad(lineaId, -1)} className="grid h-7 w-7 place-items-center rounded-md border border-slate-300 bg-white"><Minus size={13}/></button><span className="min-w-5 text-center text-sm font-bold">{item.cantidad}</span><button type="button" aria-label="Agregar uno" disabled={item.stock_disponible != null && item.cantidad >= item.stock_disponible} onClick={() => cambiarCantidad(lineaId, 1)} className="grid h-7 w-7 place-items-center rounded-md bg-slate-900 text-white disabled:opacity-40"><Plus size={13}/></button></div></div></article>; }) : <div className="m-auto grid min-h-44 w-full place-items-center rounded-lg border border-dashed border-slate-300 bg-white p-5 text-center text-sm text-slate-500"><span><ShoppingCart size={24} className="mx-auto mb-2 text-slate-300"/>Sin pedido activo<br/><small>Elegí un destino y agregá productos.</small></span></div>}
          </div>
          <form onSubmit={enviarComanda} className="space-y-3 border-t border-slate-200 bg-white p-4">
            {tipoDestino !== 'mesa' && <div className="grid gap-2"><label className="block text-xs font-bold text-slate-600">Cliente<input required minLength={2} maxLength={120} value={nombreCliente} onChange={(event) => setNombreCliente(event.target.value)} placeholder="Nombre del cliente" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm font-normal"/></label><label className="block text-xs font-bold text-slate-600">Teléfono<input required minLength={8} maxLength={30} value={telefonoCliente} onChange={(event) => setTelefonoCliente(event.target.value)} placeholder="Ej.: 0981 234 567" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm font-normal"/></label></div>}
            {tipoDestino === 'delivery' && <div className="space-y-2 rounded-lg border border-blue-100 bg-blue-50 p-3"><label className="block text-xs font-bold text-blue-950">Dirección y referencia<textarea required minLength={5} maxLength={300} rows={2} value={direccionDelivery} onChange={(event) => setDireccionDelivery(event.target.value)} placeholder="Calle, número, barrio y referencia" className="mt-1 w-full rounded-lg border border-blue-200 bg-white p-2.5 text-sm font-normal"/></label>{zonasDelivery.length ? centroMapaDelivery ? <><p className="text-[11px] font-semibold text-blue-900">El mapa se centra en la cobertura configurada. Marcá la ubicación exacta del cliente para validar tarifa.</p><MapaDelivery modo="pin" zonas={zonasDelivery} punto={ubicacionDelivery} centroInicial={centroMapaDelivery} selectedZoneId={zonaDelivery?.id} onPuntoChange={(punto) => { setUbicacionDelivery(punto); const zona = zonaEnCoordenadas(punto, zonasDelivery); const plana = zonasDelivery.length === 1 && !(Number(zonasDelivery[0]?.radio_km) > 0) && (zonasDelivery[0]?.poligono || []).length < 3 ? zonasDelivery[0] : null; setZonaElegidaId(zona?.id || plana?.id || ''); }}/>{zonaDelivery ? <p className="rounded-lg bg-emerald-100 p-2 text-xs font-bold text-emerald-900">Cobertura: {zonaDelivery.nombre} · Envío {dinero(zonaDelivery.costo)}{zonaDelivery.distancia_km != null ? ` · ${Number(zonaDelivery.distancia_km).toFixed(1)} km` : ''}</p> : <p className="rounded-lg bg-amber-100 p-2 text-xs font-semibold text-amber-950">El punto debe quedar dentro de una zona de delivery activa.</p>}</> : <p className="rounded-lg bg-amber-100 p-2 text-xs font-semibold text-amber-950">Tus zonas no tienen centro ni polígono guardado. Configurá su ubicación en Restaurante → Delivery antes de registrar pedidos.</p> : <p className="rounded-lg bg-amber-100 p-2 text-xs font-semibold text-amber-950">Configurá al menos una zona de envío para registrar delivery desde este POS.</p>}{pagosDelivery.acepta_efectivo || pagosDelivery.acepta_tarjeta ? <label className="block text-xs font-bold text-blue-950">Pago al recibir<select value={metodoPagoDelivery} onChange={(event) => setMetodoPagoDelivery(event.target.value)} className="mt-1 w-full rounded-lg border border-blue-200 bg-white px-3 py-2.5 text-sm">{pagosDelivery.acepta_efectivo && <option value="efectivo">Efectivo</option>}{pagosDelivery.acepta_tarjeta && <option value="tarjeta">Tarjeta</option>}</select></label> : null}</div>}
            <label className="block text-xs font-bold text-slate-600">Nota para cocina<textarea value={nota} onChange={(event) => setNota(event.target.value)} maxLength={500} rows={2} placeholder="Sin cebolla, bebida fría…" className="mt-1.5 w-full resize-y rounded-lg border border-slate-300 p-2.5 text-sm font-normal outline-none focus:border-orange-400"/></label><div className="flex items-center justify-between border-t border-slate-100 pt-2"><span className="text-sm font-bold text-slate-600">Total{tipoDestino === 'delivery' && zonaDelivery ? ' con envío' : ''}</span><strong className="text-lg font-black text-slate-950">{dinero(total + (tipoDestino === 'delivery' ? Number(zonaDelivery?.costo || 0) : 0))}</strong></div><button type="submit" disabled={enviando || !carrito.length || !catalogo || !tipoDestino || (tipoDestino === 'mesa' && !mesaSeleccionada) || (tipoDestino === 'delivery' && (!centroMapaDelivery || !ubicacionDelivery || !zonaDelivery))} className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-orange-500 px-4 py-3 text-sm font-black text-white shadow-sm hover:bg-orange-600 disabled:cursor-not-allowed disabled:bg-slate-300">{enviando ? <LoaderCircle size={17} className="animate-spin"/> : <ChefHat size={17}/>} {enviando ? 'Enviando a cocina…' : 'Enviar comanda'}</button><p className="text-center text-[11px] text-slate-500">Enviar una comanda no cobra ni descuenta stock. Las ventas y el cobro se registran desde el flujo de Caja/POS.</p></form>
        </aside>
      </div>
    </section>}

    {modalDestino && vistaPOS === 'comanda' && <div className="fixed inset-0 z-[120] grid place-items-center bg-slate-950/60 p-3 backdrop-blur-sm" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setModalDestino(false); }}><section role="dialog" aria-modal="true" aria-labelledby="destino-pedido-titulo" className="max-h-[90dvh] w-full max-w-3xl overflow-hidden rounded-2xl bg-white shadow-2xl"><header className="flex items-center justify-between bg-slate-950 px-5 py-4 text-white"><h2 id="destino-pedido-titulo" className="text-lg font-black">¿Dónde va este pedido?</h2><button type="button" onClick={() => setModalDestino(false)} aria-label="Cerrar" className="rounded-lg p-1.5 text-slate-300 hover:bg-white/10"><X size={19}/></button></header><div className="max-h-[calc(90dvh-64px)] space-y-4 overflow-y-auto p-4 md:p-5"><div className="grid gap-3 sm:grid-cols-3"><button type="button" onClick={() => { setTipoDestino('mesa'); setMesaId(''); setFiltroMesas('todas'); }} className={`rounded-xl border p-4 text-left ${tipoDestino === 'mesa' ? 'border-orange-400 bg-orange-50' : 'border-slate-200 hover:border-orange-300'}`}><span className="flex items-center gap-2 font-black text-slate-900"><Table2 size={18}/>Mesa</span><span className="mt-1 block text-xs text-slate-500">Elegí una mesa y agregá la comanda a su cuenta.</span></button><button type="button" onClick={() => elegirDestino('retiro')} className={`rounded-xl border p-4 text-left ${tipoDestino === 'retiro' ? 'border-orange-400 bg-orange-50' : 'border-slate-200 hover:border-orange-300'}`}><span className="flex items-center gap-2 font-black text-slate-900"><ShoppingBag size={18}/>Para llevar</span><span className="mt-1 block text-xs text-slate-500">El cliente retira el pedido en el local.</span></button><button type="button" onClick={() => elegirDestino('delivery')} className={`rounded-xl border p-4 text-left ${tipoDestino === 'delivery' ? 'border-orange-400 bg-orange-50' : 'border-slate-200 hover:border-orange-300'}`}><span className="flex items-center gap-2 font-black text-slate-900"><Bike size={18}/>Delivery</span><span className="mt-1 block text-xs text-slate-500">Registrá dirección, cobertura y tarifa de envío.</span></button></div>{tipoDestino === 'mesa' && <><div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]"><label className="relative"><Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"/><input value={busquedaMesa} onChange={(event) => setBusquedaMesa(event.target.value)} placeholder="Buscar mesa…" className="w-full rounded-lg border border-slate-300 py-2.5 pl-9 pr-3 text-sm"/></label><div className="flex gap-1 rounded-lg bg-slate-100 p-1">{[['todas','Todas'],['libres','Libres'],['ocupadas','Ocupadas']].map(([id,label])=><button key={id} type="button" onClick={() => setFiltroMesas(id)} className={`rounded-md px-3 py-1.5 text-xs font-bold ${filtroMesas === id ? 'bg-amber-500 text-white' : 'text-slate-600'}`}>{label}</button>)}</div></div><p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Mesas · {mesas.length}</p><div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">{mesasFiltradas.map((mesa) => { const pedidos = pedidosPorMesa.get(mesa.id) || []; const totalMesa = pedidos.reduce((sum, pedido) => sum + Number(pedido.total || 0), 0); const ocupada = pedidos.length > 0; return <button key={mesa.id} type="button" onClick={() => elegirDestino('mesa', mesa)} className={`rounded-xl border p-3 text-left ${String(mesaId) === String(mesa.id) ? 'border-orange-500 bg-orange-50' : ocupada ? 'border-rose-200 bg-rose-50' : 'border-emerald-200 bg-emerald-50'}`}><span className="block truncate font-black text-slate-900">{mesa.nombre}</span><span className={`mt-1 block text-[10px] font-bold ${ocupada ? 'text-rose-700' : 'text-emerald-700'}`}>{ocupada ? `${pedidos.length} pedido${pedidos.length === 1 ? '' : 's'} abierto${pedidos.length === 1 ? '' : 's'}` : 'Libre'}</span>{ocupada && <span className="mt-1 block text-xs font-black text-slate-800">{dinero(totalMesa)}</span>}</button>; })}{!mesasFiltradas.length && <p className="col-span-full rounded-lg bg-slate-50 p-6 text-center text-sm text-slate-500">No hay mesas que coincidan con el filtro.</p>}</div></>}</div></section></div>}
    {pizzaConfig?.pizza && <PizzaCustomizer pizza={pizzaConfig.pizza} onClose={() => setPizzaConfig(null)} onConfirm={agregarPizza}/>}
  </main>;
}
