import { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';

export default function PuntoDeVenta({ cajaInfo }) {
  const [productos, setProductos] = useState([]);
  const [carrito, setCarrito] = useState([]);
  const [cliente, setCliente] = useState('CLIENTE OCACIONAL');
  const [busqueda, setBusqueda] = useState('');
  const [categoriaActiva, setCategoriaActiva] = useState('Todas las categorías');

  // Categorías de ejemplo basadas en tu imagen
  const categorias = ['Todas las categorías', 'Bateria', 'Carrocería y Accesorios', 'Exterior', 'Interior', 'Motor', 'Frenos'];

  useEffect(() => {
    cargarProductos();
  }, []);

  const cargarProductos = async () => {
    const { data } = await supabase.from('productos').select('*').order('nombre');
    if (data) setProductos(data);
  };

  const productosFiltrados = productos.filter(p => {
    const matchNombre = p.nombre.toLowerCase().includes(busqueda.toLowerCase()) || 
                        (p.codigo && p.codigo.toLowerCase().includes(busqueda.toLowerCase()));
    const matchCat = categoriaActiva === 'Todas las categorías' || p.categoria === categoriaActiva;
    return matchNombre && matchCat;
  });

  const agregarAlCarrito = (producto) => {
    if (producto.stock_actual <= 0) return alert('¡Sin stock!');
    const itemExistente = carrito.find(item => item.id === producto.id);
    if (itemExistente) {
      if (itemExistente.cantidad >= producto.stock_actual) return alert('No hay más stock disponible');
      setCarrito(carrito.map(item => item.id === producto.id ? { ...item, cantidad: item.cantidad + 1 } : item));
    } else {
      setCarrito([...carrito, { ...producto, cantidad: 1 }]);
    }
  };

  const actualizarCantidad = (id, cantidad) => {
    if (cantidad < 1) return;
    setCarrito(carrito.map(item => item.id === id ? { ...item, cantidad: parseInt(cantidad) } : item));
  };

  const quitarItem = (id) => {
    setCarrito(carrito.filter(item => item.id !== id));
  };

  const totalCarrito = carrito.reduce((acc, item) => acc + (item.precio_venta * item.cantidad), 0);
  const totalArticulos = carrito.reduce((acc, item) => acc + item.cantidad, 0);

  const procesarVenta = async (metodoPago) => {
    if (carrito.length === 0) return alert('El carrito está vacío.');
    try {
      // 1. Guardar Venta
      const { data: ventaData, error } = await supabase.from('ventas').insert([{ 
        cliente_nombre: cliente, total: totalCarrito, saldo_pendiente: 0, estado: 'pagado'
      }]).select();
      
      if (error) throw error;

      // 2. Guardar Detalles
      const detallesData = carrito.map(item => ({
        venta_id: ventaData[0].id, producto_id: item.id, nombre_producto: item.nombre,
        cantidad: item.cantidad, precio_unitario: item.precio_venta, subtotal: item.precio_venta * item.cantidad
      }));
      await supabase.from('detalle_ventas').insert(detallesData);

      // 3. Descontar Stock
      for (const item of carrito) {
        await supabase.from('productos').update({ stock_actual: item.stock_actual - item.cantidad }).eq('id', item.id);
      }

      alert(`¡Venta procesada con éxito por ${metodoPago}!`);
      setCarrito([]); setCliente('CLIENTE OCACIONAL'); cargarProductos();
    } catch (error) {
      alert('Error: ' + error.message);
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] bg-white -m-4 md:-m-6 text-sm font-sans">
      
      {/* 1. BARRA SUPERIOR (HEADER CDEPOS) */}
      <div className="flex flex-wrap items-center justify-between border-b border-orange-500 px-4 py-2 bg-white">
        <div className="flex items-center gap-4 text-xs font-bold text-gray-700">
          <button className="text-blue-600 hover:underline">← Volver</button>
          <span className="flex items-center gap-1 text-[#004284]">📍 G.D.A - Repuestos y Servicios</span>
          <span className="bg-gray-800 text-white px-2 py-1 rounded flex items-center gap-1">🕒 {new Date().toLocaleString('es-PY', { hour12: true, hour: '2-digit', minute:'2-digit', day:'2-digit', month:'2-digit', year:'numeric'})}</span>
        </div>
        
        <div className="flex flex-wrap items-center gap-2 mt-2 md:mt-0">
          <button className="border border-green-200 text-green-600 px-3 py-1.5 rounded text-xs font-bold hover:bg-green-50">💼 Registrar detalles</button>
          <button className="border border-red-200 text-red-600 px-3 py-1.5 rounded text-xs font-bold hover:bg-red-50">🔒 Cerrar registro</button>
          <button className="border border-orange-200 text-orange-500 px-3 py-1.5 rounded text-xs font-bold hover:bg-orange-50">💰 Gastos</button>
          <button className="border border-green-200 text-green-600 px-3 py-1.5 rounded text-xs font-bold hover:bg-green-50">🖩 Calculadora</button>
          <button className="border border-red-200 text-red-600 px-3 py-1.5 rounded text-xs font-bold hover:bg-red-50">↩ Devolución de Venta</button>
          <button className="border border-gray-200 text-gray-600 px-3 py-1.5 rounded text-xs font-bold hover:bg-gray-50">🛵 Delivery</button>
          <button className="border border-blue-200 text-blue-600 px-3 py-1.5 rounded text-xs font-bold hover:bg-blue-50">⛶ Pantalla completa</button>
          <button className="bg-red-50 border border-red-200 text-red-600 px-3 py-1.5 rounded text-xs font-bold">⛔ Agregar gasto</button>
        </div>
      </div>

      {/* 2. ÁREA CENTRAL DIVIDIDA EN 2 COLUMNAS */}
      <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
        
        {/* === COLUMNA IZQUIERDA: CARRITO Y BÚSQUEDA === */}
        <div className="w-full md:w-1/2 flex flex-col border-r border-gray-200 bg-white">
          <div className="p-3 border-b flex flex-col gap-3 shadow-sm z-10">
            {/* Buscador de cliente */}
            <div className="flex gap-2">
              <div className="flex items-center border rounded w-1/3 overflow-hidden focus-within:border-blue-500">
                <span className="bg-gray-100 p-2 text-gray-500 border-r">👤</span>
                <input className="w-full p-2 outline-none text-xs font-bold uppercase" value={cliente} onChange={(e) => setCliente(e.target.value)} />
              </div>
              <button className="bg-blue-100 text-blue-600 px-3 rounded font-bold hover:bg-blue-200">+</button>
              
              {/* Buscador de producto (Código de barras) */}
              <div className="flex items-center border rounded flex-1 overflow-hidden focus-within:border-blue-500">
                <span className="bg-gray-100 p-2 text-gray-500 border-r">🔍</span>
                <input className="w-full p-2 outline-none text-xs" placeholder="Introduzca el nombre del producto / SKU / código..." value={busqueda} onChange={(e) => setBusqueda(e.target.value)} />
              </div>
              <button className="bg-blue-100 text-blue-600 px-3 rounded font-bold hover:bg-blue-200">+</button>
            </div>
            
            <button className="text-left text-xs font-bold text-gray-600 hover:text-blue-600 flex items-center gap-1">
              ⚙ Opciones Avanzadas (Comprobante, Mesas, Personal)
            </button>
          </div>

          {/* Tabla del carrito */}
          <div className="flex-1 overflow-y-auto bg-gray-50">
            <table className="w-full text-left border-collapse text-xs">
              <thead className="bg-white border-b text-blue-500 font-bold uppercase sticky top-0">
                <tr>
                  <th className="p-3 w-1/2">Producto ⓘ</th>
                  <th className="p-3 text-center">Cantidad</th>
                  <th className="p-3 text-right">P. Unit.</th>
                  <th className="p-3 text-right">Subtotal</th>
                  <th className="p-3 text-center">×</th>
                </tr>
              </thead>
              <tbody>
                {carrito.length === 0 ? (
                  <tr><td colSpan="5" className="text-center py-10 text-gray-400">Carrito vacío</td></tr>
                ) : (
                  carrito.map((item) => (
                    <tr key={item.id} className="border-b bg-white hover:bg-gray-50 font-medium">
                      <td className="p-3 text-gray-800">{item.nombre} <br/><span className="text-[10px] text-gray-400 font-mono">[{item.codigo}]</span></td>
                      <td className="p-3 text-center">
                        <input type="number" min="1" className="w-16 border rounded p-1 text-center font-bold" value={item.cantidad} onChange={(e) => actualizarCantidad(item.id, e.target.value)} />
                      </td>
                      <td className="p-3 text-right text-gray-600">Gs {Number(item.precio_venta).toLocaleString('es-PY')}</td>
                      <td className="p-3 text-right font-bold text-gray-800">Gs {(item.precio_venta * item.cantidad).toLocaleString('es-PY')}</td>
                      <td className="p-3 text-center text-red-500 cursor-pointer hover:text-red-700 text-lg font-bold" onClick={() => quitarItem(item.id)}>×</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Resumen de carrito (Campos extra) */}
          <div className="border-t bg-white p-3 shadow-inner z-10">
            <div className="flex gap-6 mb-3 font-bold text-gray-800">
              <span>Artículos: {totalArticulos}</span>
              <span>Total: {totalArticulos}</span>
            </div>
            <div className="grid grid-cols-5 gap-2 text-xs text-blue-600 font-bold border-t pt-3">
              <div className="cursor-pointer hover:underline">Descuento ⓘ (-): ✎ 0</div>
              <div className="cursor-pointer hover:underline">Vencimiento(+): ⓘ ✎ Seleccione</div>
              <div className="cursor-pointer hover:underline">Nota de remisión(+): ⓘ ✎</div>
              <div className="cursor-pointer hover:underline">Nota de venta(+): ✎</div>
              <div className="cursor-pointer hover:underline">Cargo de embalaje(+): ✎ 0</div>
            </div>
          </div>
        </div>

        {/* === COLUMNA DERECHA: CATÁLOGO DE PRODUCTOS === */}
        <div className="w-full md:w-1/2 flex flex-col bg-gray-50">
          
          {/* Filtros de Categorías y Marcas */}
          <div className="p-3 bg-white border-b shadow-sm z-10 flex flex-col gap-3">
            <div className="flex gap-2 overflow-x-auto pb-1 custom-scrollbar">
              {categorias.map(cat => (
                <button 
                  key={cat} 
                  onClick={() => setCategoriaActiva(cat)}
                  className={`px-4 py-1.5 rounded-full whitespace-nowrap font-bold text-xs border transition ${categoriaActiva === cat ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-100'}`}
                >
                  {cat}
                </button>
              ))}
            </div>
            <select className="border border-gray-300 p-1.5 rounded text-xs text-gray-700 w-48 outline-none">
              <option>Todas las marcas ▼</option>
            </select>
          </div>

          {/* Grilla de Tarjetas de Productos */}
          <div className="flex-1 p-3 overflow-y-auto">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              {productosFiltrados.map((prod) => (
                <div 
                  key={prod.id} 
                  onClick={() => agregarAlCarrito(prod)}
                  className="bg-white border border-gray-200 rounded-lg overflow-hidden shadow-sm hover:shadow-md cursor-pointer flex flex-col transition-all active:scale-95"
                >
                  {/* Mitad superior: Inicial / Placeholder celeste */}
                  <div className="bg-[#eef2fa] h-20 flex items-center justify-center">
                    <span className="text-[#89a3d4] text-3xl font-bold uppercase">{prod.nombre.charAt(0)}</span>
                  </div>
                  {/* Mitad inferior: Datos del producto */}
                  <div className="p-2 flex flex-col gap-1 items-center text-center flex-1">
                    <span className="text-[11px] font-bold text-gray-800 leading-tight line-clamp-2" title={prod.nombre}>
                      {prod.nombre}
                    </span>
                    <span className="bg-[#e6f4ea] text-[#137333] px-2 py-0.5 rounded font-bold text-[10px] mt-auto w-full">
                      {Number(prod.precio_venta).toLocaleString('es-PY')} Gs
                    </span>
                    <div className="flex justify-between w-full mt-1 text-[10px] text-gray-500 font-bold px-1">
                      <span>{prod.stock_actual}</span>
                      <span className="bg-green-100 text-green-700 px-1 rounded">0 Gs</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* 3. FOOTER / BOTONERA DE PAGOS */}
      <div className="bg-gray-300 p-2 flex flex-wrap lg:flex-nowrap justify-between items-center gap-2 border-t shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.1)] z-20">
        
        {/* Botones de acción (Izquierda) */}
        <div className="flex flex-wrap gap-1">
          <button className="bg-gray-100 border border-gray-300 text-gray-700 px-3 py-2 rounded text-xs font-bold hover:bg-white flex items-center gap-1 shadow-sm">📝 Pedido Pendiente</button>
          <button className="bg-gray-100 border border-gray-300 text-gray-700 px-3 py-2 rounded text-xs font-bold hover:bg-white flex items-center gap-1 shadow-sm">📄 Cotización</button>
          <button className="bg-gray-100 border border-gray-300 text-gray-700 px-3 py-2 rounded text-xs font-bold hover:bg-white flex items-center gap-1 shadow-sm">⏸ Delivery</button>
          <button className="bg-gray-100 border border-gray-300 text-gray-700 px-3 py-2 rounded text-xs font-bold hover:bg-white flex items-center gap-1 shadow-sm">✔ Venta a crédito</button>
          
          <button onClick={() => procesarVenta('Tarjeta')} className="bg-[#e83e8c] text-white px-4 py-2 rounded text-xs font-bold hover:bg-[#d82a7a] shadow-sm flex items-center gap-1">💳 Tarjeta</button>
          <button onClick={() => procesarVenta('Mixto')} className="bg-[#001f3f] text-white px-4 py-2 rounded text-xs font-bold hover:bg-[#00152b] shadow-sm flex items-center gap-1">💵 Pago múltiple</button>
          <button onClick={() => procesarVenta('Efectivo')} className="bg-[#28a745] text-white px-4 py-2 rounded text-xs font-bold hover:bg-[#218838] shadow-sm flex items-center gap-1">💵 Efectivo</button>
          
          <button onClick={() => setCarrito([])} className="bg-[#dc3545] text-white px-4 py-2 rounded text-xs font-bold hover:bg-[#c82333] shadow-sm flex items-center gap-1">✖ Cancelar</button>
        </div>

        {/* Panel de Totales y Recientes (Derecha) */}
        <div className="flex flex-col items-end gap-1 w-full lg:w-auto mt-2 lg:mt-0">
          <div className="bg-[#001f3f] text-white flex items-center rounded overflow-hidden shadow">
            <div className="px-4 py-2 text-xs font-bold uppercase tracking-wider text-right flex flex-col leading-tight border-r border-blue-900">
              <span>Total a</span>
              <span>pagar</span>
            </div>
            <div className="px-6 py-2 text-2xl font-black min-w-[150px] text-right tracking-tight">
              {totalCarrito.toLocaleString('es-PY')}
            </div>
          </div>
          <button className="bg-[#fd7e14] text-white px-4 py-1 rounded text-xs font-bold shadow hover:bg-[#e86e04] flex items-center gap-1 w-full justify-end">
            🕒 Transacciones Recientes
          </button>
        </div>
      </div>
    </div>
  );
}