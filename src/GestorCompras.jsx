import { useEffect, useState } from 'react';
import { supabase } from './supabaseClient';

export default function GestorCompras({ onCompraRegistrada }) {
  const [compras, setCompras] = useState([]);
  const [mostrarFormulario, setMostrarFormulario] = useState(false);
  const [menuAbierto, setMenuAbierto] = useState(null);
  
  // Estados para el Modal de "Ver Detalles"
  const [modalCompra, setModalCompra] = useState(null);
  const [detallesModal, setDetallesModal] = useState([]);

  // Estados del Formulario
  const [proveedor, setProveedor] = useState('');
  const [nroFactura, setNroFactura] = useState('');
  const [estadoPago, setEstadoPago] = useState('pendiente');
  const [productos, setProductos] = useState([]);
  const [itemsCompra, setItemsCompra] = useState([]);
  const [prodSeleccionado, setProdSeleccionado] = useState('');
  const [cantidad, setCantidad] = useState('');
  const [costoUnitario, setCostoUnitario] = useState('');

  useEffect(() => {
    cargarTodasLasCompras();
    cargarCatalogo();
  }, []);

  const cargarCatalogo = async () => {
    const { data } = await supabase.from('productos').select('*').order('nombre');
    if (data) setProductos(data);
  };

  const cargarTodasLasCompras = async () => {
    const { data, error } = await supabase
      .from('compras')
      .select('*')
      .order('fecha', { ascending: false });
    if (!error && data) setCompras(data);
  };

  const agregarItem = () => {
    if (!prodSeleccionado || !cantidad || !costoUnitario) return alert('Completa los datos');
    const producto = productos.find(p => p.id === parseInt(prodSeleccionado));
    setItemsCompra([...itemsCompra, {
      id: producto.id, nombre: producto.nombre, codigo: producto.codigo || 'S/N',
      cantidad: parseInt(cantidad), costo: parseFloat(costoUnitario),
      subtotal: parseInt(cantidad) * parseFloat(costoUnitario)
    }]);
    setProdSeleccionado(''); setCantidad(''); setCostoUnitario('');
  };

  const registrarCompra = async (e) => {
    e.preventDefault();
    if (itemsCompra.length === 0) return alert('Agrega al menos un repuesto.');
    const totalCalculado = itemsCompra.reduce((acc, item) => acc + item.subtotal, 0);
    const saldo = estadoPago === 'pagado' ? 0 : totalCalculado;

    const { data: compraData, error: compraError } = await supabase
      .from('compras')
      .insert([{
        proveedor_nombre: proveedor, nro_factura: nroFactura,
        total: totalCalculado, saldo_pendiente: saldo, estado: estadoPago
      }])
      .select();

    if (!compraError && compraData) {
      const nuevaCompra = compraData[0];

      const detallesInsercion = itemsCompra.map(item => ({
        compra_id: nuevaCompra.id,
        producto_id: item.id,
        nombre_producto: item.nombre,
        codigo_sku: item.codigo,
        cantidad: item.cantidad,
        costo_unitario: item.costo,
        subtotal: item.subtotal
      }));

      await supabase.from('detalle_compras').insert(detallesInsercion);

      for (const item of itemsCompra) {
        const prodFisico = productos.find(p => p.id === item.id);
        await supabase.from('productos').update({ stock_actual: prodFisico.stock_actual + item.cantidad }).eq('id', item.id);
      }

      alert('Compra registrada y stock actualizado con éxito.');
      setMostrarFormulario(false);
      setItemsCompra([]); setProveedor(''); setNroFactura('');
      cargarTodasLasCompras();
      if (onCompraRegistrada) onCompraRegistrada();
    }
  };

  const abrirDetallesCompra = async (compra) => {
    setMenuAbierto(null);
    setModalCompra(compra);

    const { data } = await supabase
      .from('detalle_compras')
      .select('*')
      .eq('compra_id', compra.id);

    if (data) setDetallesModal(data);
  };

  const toggleMenu = (e, id) => {
    e.stopPropagation();
    if (menuAbierto === id) setMenuAbierto(null);
    else setMenuAbierto(id);
  };

  const borrarCompra = async (id) => {
    if (window.confirm('¿Estás seguro de que deseas eliminar este registro de compra?')) {
      await supabase.from('compras').delete().eq('id', id);
      setMenuAbierto(null);
      cargarTodasLasCompras();
    }
  };

  const registrarPago = async (compra) => {
    setMenuAbierto(null);
    if (compra.saldo_pendiente <= 0) return alert('Esta factura ya está totalmente pagada.');

    const montoStr = window.prompt(`Saldo pendiente: Gs ${compra.saldo_pendiente.toLocaleString('es-PY')}\n\nIngresa el monto a entregar:`);
    if (!montoStr) return;

    const abono = parseFloat(montoStr.replace(/\./g, ''));
    if (isNaN(abono) || abono <= 0) return alert('Monto inválido.');

    const nuevoSaldo = compra.saldo_pendiente - abono;
    const saldoFinal = nuevoSaldo <= 0 ? 0 : nuevoSaldo;
    const nuevoEstado = saldoFinal === 0 ? 'pagado' : 'pendiente';

    await supabase.from('compras').update({ saldo_pendiente: saldoFinal, estado: nuevoEstado }).eq('id', compra.id);
    alert(saldoFinal === 0 ? '¡Deuda cancelada!' : 'Pago parcial registrado.');
    cargarTodasLasCompras();
  };

  const granTotal = compras.reduce((acc, c) => acc + Number(c.total), 0);
  const compraAdeudada = compras.reduce((acc, c) => acc + Number(c.saldo_pendiente), 0);
  const pagadoTotal = granTotal - compraAdeudada;

  return (
    <div className="bg-transparent mt-2 pb-20">
      <h2 className="text-2xl font-bold mb-4 text-gray-800">Compras</h2>

      {/* FILTROS */}
      <div className="bg-white p-4 rounded-lg shadow-sm border-t-2 border-[#004284] mb-4">
        <h3 className="text-sm font-bold text-gray-600 mb-3"> Filtros</h3>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-sm">
          <div><label className="block text-gray-500 font-bold mb-1">Ubicación:</label><select className="w-full border rounded p-1"><option>G.D.A - Repuestos y Servicios</option></select></div>
          <div><label className="block text-gray-500 font-bold mb-1">Proveedor:</label><select className="w-full border rounded p-1"><option>Todos</option></select></div>
          <div><label className="block text-gray-500 font-bold mb-1">Estado de compra:</label><select className="w-full border rounded p-1"><option>Todos</option></select></div>
          <div><label className="block text-gray-500 font-bold mb-1">Estado de pago:</label><select className="w-full border rounded p-1"><option>Todos</option></select></div>
        </div>
      </div>

      {/* TABLA PRINCIPAL */}
      <div className="bg-white rounded-lg shadow-sm border-t-2 border-[#004284]">
        <div className="p-4 border-b flex justify-between items-center">
          <h3 className="text-lg font-bold text-gray-700">Todas las compras</h3>
          <button onClick={() => setMostrarFormulario(!mostrarFormulario)} className="bg-[#004284] text-white px-3 py-1.5 rounded text-sm font-bold hover:bg-blue-900 transition">
            {mostrarFormulario ? 'Volver a la lista' : ' Añadir'}
          </button>
        </div>

        {mostrarFormulario ? (
           <div className="p-6 bg-gray-50">
             <h4 className="font-bold text-gray-700 mb-4">Registrar Nueva Compra</h4>
             <div className="grid grid-cols-2 gap-4 mb-4">
               <input className="border p-2 rounded" placeholder="Proveedor" value={proveedor} onChange={(e) => setProveedor(e.target.value)} />
               <input className="border p-2 rounded" placeholder="Nº Factura Ej. PO2026/0024" value={nroFactura} onChange={(e) => setNroFactura(e.target.value)} />
             </div>
             <div className="flex gap-2 mb-4">
               <select className="border p-2 rounded w-1/3 text-sm" value={prodSeleccionado} onChange={(e) => setProdSeleccionado(e.target.value)}>
                 <option value="">Seleccionar Repuesto</option>
                 {productos.map(p => <option key={p.id} value={p.id}>{p.nombre} ({p.codigo || 'S/C'})</option>)}
               </select>
               <input type="number" className="border p-2 rounded w-1/4" placeholder="Cant." value={cantidad} onChange={(e) => setCantidad(e.target.value)} />
               <input type="number" className="border p-2 rounded w-1/4" placeholder="Costo Unit." value={costoUnitario} onChange={(e) => setCostoUnitario(e.target.value)} />
               <button onClick={agregarItem} type="button" className="bg-blue-600 text-white px-4 rounded font-bold">+</button>
             </div>
             {itemsCompra.map((item, i) => <div key={i} className="text-sm mb-1 font-medium">{item.cantidad}x {item.nombre} [{item.codigo}] - Gs {item.subtotal.toLocaleString('es-PY')}</div>)}
             <select className="border p-2 rounded w-full mt-4 mb-4 bg-white" value={estadoPago} onChange={(e) => setEstadoPago(e.target.value)}>
               <option value="pendiente">A Crédito</option>
               <option value="pagado">Contado</option>
             </select>
             <button onClick={registrarCompra} className="w-full bg-[#004284] text-white p-3 rounded font-bold hover:bg-blue-950">Guardar y Sumar Stock</button>
           </div>
        ) : (
          <div className="p-4">
            <div className="overflow-visible min-h-[400px] pb-48">
              <table className="w-full text-left text-sm border-collapse">
                <thead>
                  <tr className="border-b-2 border-gray-200 text-gray-700 bg-gray-50">
                    <th className="p-3 font-bold w-32">ACCIÓN</th>
                    <th className="p-3 font-bold">FECHA</th>
                    <th className="p-3 font-bold">REFERENCIA</th>
                    <th className="p-3 font-bold">PROVEEDOR</th>
                    <th className="p-3 font-bold">ESTADO</th>
                    <th className="p-3 font-bold">PAGO</th>
                    <th className="p-3 font-bold text-center">TOTAL</th>
                    <th className="p-3 font-bold text-center">PENDIENTE</th>
                  </tr>
                </thead>
                <tbody>
                  {compras.map(compra => {
                    const badgePago = compra.estado === 'pagado' ? 'bg-green-100 text-green-700 border-green-200' : 'bg-orange-100 text-orange-700 border-orange-200';
                    return (
                      <tr key={compra.id} className="border-b hover:bg-gray-50 text-gray-700">
                        <td className="p-3 relative">
                          <button type="button" onClick={(e) => toggleMenu(e, compra.id)} className="bg-[#17a2b8] text-white px-3 py-1.5 rounded text-xs font-bold flex items-center gap-1 relative z-10">
                            Acciones <span className="text-[10px]">▼</span>
                          </button>

                          {menuAbierto === compra.id && (
                            <div className="absolute left-3 top-10 mt-1 w-64 bg-white border border-gray-200 rounded shadow-2xl z-[9999] py-2 font-medium text-gray-700">
                              <button onClick={() => abrirDetallesCompra(compra)} className="w-full text-left px-4 py-2 hover:bg-gray-100 text-sm flex items-center gap-3">
                                <span>👁️</span> Ver
                              </button>
                              <button onClick={() => { alert('Módulo Impresión en construcción'); setMenuAbierto(null); }} className="w-full text-left px-4 py-2 hover:bg-gray-100 text-sm flex items-center gap-3">
                                <span>🖨️</span> Impresión
                              </button>
                              <button onClick={() => { alert('Módulo Editar en construcción'); setMenuAbierto(null); }} className="w-full text-left px-4 py-2 hover:bg-gray-100 text-sm flex items-center gap-3">
                                <span>📝</span> Editar
                              </button>
                              <button onClick={() => borrarCompra(compra.id)} className="w-full text-left px-4 py-2 hover:bg-red-50 text-sm text-red-600 flex items-center gap-3">
                                <span>🗑️</span> Borrar
                              </button>
                              <button onClick={() => { alert('Módulo Etiquetas en construcción'); setMenuAbierto(null); }} className="w-full text-left px-4 py-2 hover:bg-gray-100 text-sm flex items-center gap-3">
                                <span>🏷️</span>固定 Etiquetas
                              </button>
                              <div className="border-t my-1"></div>
                              <button onClick={() => registrarPago(compra)} className="w-full text-left px-4 py-2 hover:bg-green-50 text-sm text-[#004284] font-bold flex items-center gap-3">
                                <span>💵</span> Monto total pagado o pago parcial
                              </button>
                              <button onClick={() => { alert('Módulo Historial en construcción'); setMenuAbierto(null); }} className="w-full text-left px-4 py-2 hover:bg-gray-100 text-sm flex items-center gap-3">
                                <span>📋</span> Ver pagos
                              </button>
                              <button onClick={() => { alert('Módulo Devoluciones en construcción'); setMenuAbierto(null); }} className="w-full text-left px-4 py-2 hover:bg-gray-100 text-sm flex items-center gap-3">
                                <span>↩️</span> Devolución de compra
                              </button>
                              <div className="border-t my-1"></div>
                              <button onClick={() => { alert('Módulo Status en construcción'); setMenuAbierto(null); }} className="w-full text-left px-4 py-2 hover:bg-gray-100 text-sm flex items-center gap-3">
                                <span>🔄</span> Update Status
                              </button>
                              <button onClick={() => { alert('Módulo Notificaciones en construcción'); setMenuAbierto(null); }} className="w-full text-left px-4 py-2 hover:bg-gray-100 text-sm flex items-center gap-3">
                                <span>✉️</span> Elementos recibidos de notificación
                              </button>
                            </div>
                          )}
                        </td>
                        <td className="p-3">{new Date(compra.fecha).toLocaleDateString('es-PY')}</td>
                        <td className="p-3">{compra.nro_factura || `PO2026/00${compra.id}`}</td>
                        <td className="p-3 font-semibold">{compra.proveedor_nombre}</td>
                        <td className="p-3"><span className="bg-[#85c850] text-white px-2 py-0.5 rounded-sm text-[11px] font-bold">Recibido</span></td>
                        <td className="p-3"><span className={`${badgePago} border px-2 py-0.5 rounded-sm text-[11px] font-bold`}>{compra.estado === 'pagado' ? 'Contado' : 'Crédito'}</span></td>
                        <td className="p-3 text-center font-medium">{Number(compra.total).toLocaleString('es-PY')} Gs</td>
                        <td className="p-3 text-center text-red-600 font-bold">{compra.saldo_pendiente > 0 ? `${Number(compra.saldo_pendiente).toLocaleString('es-PY')} Gs` : '-'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* FOOTER */}
            <div className="mt-6 bg-gray-50 border p-4 rounded flex justify-between items-center text-sm">
              <div className="flex items-center gap-6">
                <span className="font-bold text-gray-800">TOTAL</span>
                <div><p className="text-gray-500 text-xs font-bold">GRAN TOTAL</p><p className="text-red-500 font-bold text-lg">{granTotal.toLocaleString('es-PY')} Gs</p></div>
                <div><p className="text-gray-500 text-xs font-bold">COMPRA ADEUDADA</p><p className="text-red-500 font-bold text-lg">{compraAdeudada.toLocaleString('es-PY')} Gs</p></div>
                <div><p className="text-gray-500 text-xs font-bold">PAGADO POR MONEDA</p><p className="text-gray-800 font-bold text-lg">{pagadoTotal.toLocaleString('es-PY')} Gs</p></div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* MODAL DETALLES */}
      {modalCompra && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[99999] p-4 overflow-y-auto">
          <div className="bg-white w-full max-w-4xl rounded-lg shadow-2xl overflow-hidden my-8">
            <div className="bg-[#4e44e3] text-white p-4 flex justify-between items-center">
              <h3 className="text-lg font-bold">
                Detalles de la compra ( Número de referencia: #{modalCompra.nro_factura || `PO2026/00${modalCompra.id}`})
              </h3>
              <button onClick={() => setModalCompra(null)} className="text-white hover:text-gray-200 font-bold text-xl">×</button>
            </div>
            <div className="p-6 text-sm text-gray-700 max-h-[75vh] overflow-y-auto">
              <div className="text-right text-gray-500 font-bold mb-4">Fecha: {new Date(modalCompra.fecha).toLocaleDateString('es-PY')}</div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 border-b pb-6 mb-6">
                <div>
                  <p className="font-bold text-gray-600 mb-1">Proveedor:</p>
                  <p className="font-semibold text-gray-800">{modalCompra.proveedor_nombre}</p>
                  <p className="text-gray-400 text-xs">Paraguay</p>
                </div>
                <div>
                  <p className="font-bold text-gray-600 mb-1">Empresa:</p>
                  <p className="font-bold text-[#004284]">G.D.A - Repuestos y Servicios</p>
                  <p className="text-gray-400 text-xs">Minga Guazú, Alto Paraná</p>
                </div>
                <div>
                  <p className="font-bold text-gray-800">Número de referencia: <span className="font-normal text-gray-600">#{modalCompra.nro_factura || `PO2026/00${modalCompra.id}`}</span></p>
                  <p className="font-bold text-gray-800 mt-1">Estado de compra: <span className="bg-[#85c850] text-white px-1.5 py-0.5 rounded text-[11px]">Recibido</span></p>
                  <p className="font-bold text-gray-800 mt-1">Estado de pago: <span className="text-blue-600">{modalCompra.estado === 'pagado' ? 'Contado' : 'Crédito'}</span></p>
                </div>
              </div>
              <h4 className="font-bold text-gray-800 uppercase tracking-wider mb-3">Productos Comprados</h4>
              <div className="overflow-x-auto border rounded-lg mb-6">
                <table className="w-full text-left border-collapse">
                  <thead className="bg-gray-50 border-b">
                    <tr className="text-gray-500 font-bold text-xs uppercase">
                      <th className="p-3 w-10">#</th>
                      <th className="p-3">Nombre del Producto</th>
                      <th className="p-3">SKU/Código de Barra</th>
                      <th className="p-3 text-center">Cant.</th>
                      <th className="p-3 text-right">Costo Unitario</th>
                      <th className="p-3 text-right">Subtotal</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detallesModal.map((item, index) => (
                      <tr key={item.id} className="border-b last:border-0 hover:bg-gray-50">
                        <td className="p-3 text-gray-400 font-bold">{index + 1}</td>
                        <td className="p-3 font-medium text-gray-800">{item.nombre_producto}</td>
                        <td className="p-3 text-gray-500 font-mono text-xs">{item.codigo_sku}</td>
                        <td className="p-3 text-center font-bold">{item.cantidad} UNID</td>
                        <td className="p-3 text-right font-medium">Gs {Number(item.costo_unitario).toLocaleString('es-PY')}</td>
                        <td className="p-3 text-right font-bold text-gray-800">Gs {Number(item.subtotal).toLocaleString('es-PY')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="w-full md:w-1/2 ml-auto border rounded-lg bg-gray-50 p-4 font-medium flex flex-col gap-2">
                <div className="flex justify-between border-b pb-1"><span className="text-gray-500">Total Compra Neto:</span><span className="font-bold text-gray-800">Gs {Number(modalCompra.total).toLocaleString('es-PY')}</span></div>
                <div className="flex justify-between text-red-600 font-bold pt-1 text-base"><span>Total Compra:</span><span>Gs {Number(modalCompra.total).toLocaleString('es-PY')}</span></div>
              </div>
            </div>
            <div className="bg-gray-100 p-4 border-t flex justify-end gap-3">
              <button onClick={() => window.print()} className="bg-blue-600 text-white font-bold px-4 py-2 rounded shadow hover:bg-blue-700 transition text-sm">🖨️ Impresión</button>
              <button onClick={() => setModalCompra(null)} className="bg-gray-500 text-white font-bold px-4 py-2 rounded shadow hover:bg-gray-600 transition text-sm">Cerrar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}