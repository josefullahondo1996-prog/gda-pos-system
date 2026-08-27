import { useEffect, useState } from 'react';
import { supabase } from './supabaseClient';
import { useEmpresaInfo } from './utils/useEmpresa';
import { useLanguage } from './LanguageContext';

export default function Gestalo() {
  const { t, locale } = useLanguage();
  const { id: empresaId, nombre: nombreEmpresa } = useEmpresaInfo();
  const [compras, setCompras] = useState([]);
  const [mostrarFormulario, setMostrarFormulario] = useState(false);
  
  // Estados del Formulario (los que ya teníamos)
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
    if (!empresaId) return;
    const { data } = await supabase.from('productos').select('*').eq('empresa_id', empresaId).order('nombre');
    if (data) setProductos(data);
  };

  const cargarTodasLasCompras = async () => {
    let query = supabase
      .from('compras')
      .select('*')
      .order('fecha', { ascending: false });
    if (empresaId) query = query.eq('empresa_id', empresaId);
    const { data, error } = await query;
    if (!error && data) setCompras(data);
  };

  // --- Lógica del Formulario (Oculta por defecto) ---
  const agregarItem = () => {
    if (!prodSeleccionado || !cantidad || !costoUnitario) return alert('Completa los datos');
    const producto = productos.find(p => p.id === parseInt(prodSeleccionado));
    setItemsCompra([...itemsCompra, {
      id: producto.id, nombre: producto.nombre, stock_actual: producto.stock_actual,
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

    const { error } = await supabase.from('compras').insert([{
      empresa_id: empresaId,
      proveedor_nombre: proveedor, nro_factura: nroFactura,
      total: totalCalculado, saldo_pendiente: saldo, estado: estadoPago
    }]);

    if (!error) {
      for (const item of itemsCompra) {
        await supabase.from('productos').update({ stock_actual: item.stock_actual + item.cantidad }).eq('id', item.id).eq('empresa_id', empresaId);
      }
      alert('Compra registrada');
      setMostrarFormulario(false);
      setItemsCompra([]); setProveedor(''); setNroFactura('');
      cargarTodasLasCompras();
      if (onCompraRegistrada) onCompraRegistrada();
    }
  };

  // --- Cálculos para el Footer (Igual a la imagen) ---
  const granTotal = compras.reduce((acc, c) => acc + Number(c.total), 0);
  const compraAdeudada = compras.reduce((acc, c) => acc + Number(c.saldo_pendiente), 0);
  const pagadoTotal = granTotal - compraAdeudada;

  return (
    <div className="bg-transparent mt-2">
      <h2 className="text-2xl font-bold mb-4 text-gray-800">{t('purchases')}</h2>

      {/* ZONA DE FILTROS (Estructura visual) */}
      <div className="bg-white p-4 rounded-lg shadow-sm border-t-2 border-[#004284] mb-4">
        <h3 className="text-sm font-bold text-gray-600 mb-3 flex items-center gap-2">
          <span className="text-[#004284]"></span> {t('filters')}
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-sm">
          <div>
            <label className="block text-gray-500 font-bold mb-1">{t('companyLocation')}:</label>
            <select className="w-full border rounded p-1"><option>{nombreEmpresa}</option></select>
          </div>
          <div>
            <label className="block text-gray-500 font-bold mb-1">{t('suppliers')}:</label>
            <select className="w-full border rounded p-1"><option>Todos</option></select>
          </div>
          <div>
            <label className="block text-gray-500 font-bold mb-1">{t('purchaseStatus')}:</label>
            <select className="w-full border rounded p-1"><option>Todos</option></select>
          </div>
          <div>
            <label className="block text-gray-500 font-bold mb-1">{t('paymentStatus')}:</label>
            <select className="w-full border rounded p-1"><option>Todos</option></select>
          </div>
        </div>
      </div>

      {/* CONTENEDOR PRINCIPAL */}
      <div className="bg-white rounded-lg shadow-sm border-t-2 border-[#004284]">
        
        {/* Cabecera de la tabla */}
        <div className="p-4 border-b flex justify-between items-center">
          <h3 className="text-lg font-bold text-gray-700">{t('allPurchases')}</h3>
          <button 
            onClick={() => setMostrarFormulario(!mostrarFormulario)}
            className="bg-[#004284] text-white px-3 py-1.5 rounded text-sm font-bold hover:bg-blue-900 transition flex items-center gap-1"
          >
            {mostrarFormulario ? t('backToList') : ` ${t('add')}`}
          </button>
        </div>

        {/* FORMULARIO DE AÑADIR (Se muestra si se presiona el botón) */}
        {mostrarFormulario ? (
           <div className="p-6 bg-gray-50">
             {/* ... (Aquí va tu formulario de registro rápido) ... */}
             <h4 className="font-bold text-gray-700 mb-4">{t('registerNewPurchase')}</h4>
             <div className="grid grid-cols-2 gap-4 mb-4">
               <input className="border p-2 rounded" placeholder={t('suppliers')} value={proveedor} onChange={(e) => setProveedor(e.target.value)} />
               <input className="border p-2 rounded" placeholder="Nº Factura Ej. PO2026/0024" value={nroFactura} onChange={(e) => setNroFactura(e.target.value)} />
             </div>
             <div className="flex gap-2 mb-4">
               <select className="border p-2 rounded w-1/3" value={prodSeleccionado} onChange={(e) => setProdSeleccionado(e.target.value)}>
                 <option value="">{t('selectProduct')}</option>
                 {productos.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
               </select>
               <input type="number" className="border p-2 rounded w-1/4" placeholder="Cant." value={cantidad} onChange={(e) => setCantidad(e.target.value)} />
               <input type="number" className="border p-2 rounded w-1/4" placeholder="Costo Unit." value={costoUnitario} onChange={(e) => setCostoUnitario(e.target.value)} />
               <button onClick={agregarItem} className="bg-blue-600 text-white px-4 rounded font-bold">+</button>
             </div>
             {itemsCompra.map((item, i) => <div key={i} className="text-sm mb-1">{item.cantidad}x {item.nombre} - Gs {item.subtotal}</div>)}
             <select className="border p-2 rounded w-full mt-4 mb-4" value={estadoPago} onChange={(e) => setEstadoPago(e.target.value)}>
               <option value="pendiente">A Crédito</option>
               <option value="pagado">Contado</option>
             </select>
             <button onClick={registrarCompra} className="bg-[#004284] text-white p-2 rounded font-bold w-full">{t('saveAndAddStock')}</button>
           </div>
        ) : (
          /* TABLA EXACTA A LA IMAGEN */
          <div className="p-4">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm border-collapse">
                <thead>
                  <tr className="border-b-2 border-gray-200 text-gray-700 bg-gray-50">
                    <th className="p-3 font-bold">ACCIÓN</th>
                    <th className="p-3 font-bold">FECHA</th>
                    <th className="p-3 font-bold">NUMERO DE REFERENCIA</th>
                    <th className="p-3 font-bold">UBICACIÓN</th>
                    <th className="p-3 font-bold">PROVEEDOR</th>
                    <th className="p-3 font-bold">ESTADO DE COMPRA</th>
                    <th className="p-3 font-bold">ESTADO DE PAGO</th>
                    <th className="p-3 font-bold text-center">PAGADO</th>
                    <th className="p-3 font-bold text-center">SALDO PENDIENTE</th>
                    <th className="p-3 font-bold">AÑADIDO POR</th>
                  </tr>
                </thead>
                <tbody>
                  {compras.length === 0 ? (
                    <tr><td colSpan="10" className="text-center p-6 text-gray-500">{t('noPurchases')}</td></tr>
                  ) : (
                    compras.map(compra => {
                      const pagado = compra.total - compra.saldo_pendiente;
                      // Definir colores de los badges
                      const badgePago = compra.estado === 'pagado' ? 'bg-green-100 text-green-700 border-green-200' : 'bg-orange-100 text-orange-700 border-orange-200';
                      const textoPago = compra.estado === 'pagado' ? 'Contado' : 'Crédito';
                      
                      return (
                        <tr key={compra.id} className="border-b hover:bg-gray-50 text-gray-700">
                          <td className="p-3">
                            <button className="bg-[#17a2b8] text-white px-2 py-1 rounded text-xs flex items-center gap-1 hover:bg-[#138496]">
                              Acciones <span className="text-[10px]">▼</span>
                            </button>
                          </td>
                          <td className="p-3">{new Date(compra.fecha).toLocaleDateString(locale)}</td>
                          <td className="p-3">{compra.nro_factura || `PO2026/00${compra.id}`}</td>
                          <td className="p-3">{nombreEmpresa}</td>
                          <td className="p-3 font-medium">{compra.proveedor_nombre}</td>
                          <td className="p-3">
                            <span className="bg-[#85c850] text-white px-2 py-1 rounded-sm text-[11px] font-bold">Recibido</span>
                          </td>
                          <td className="p-3">
                            <span className={`${badgePago} border px-2 py-1 rounded-sm text-[11px] font-bold`}>{textoPago}</span>
                          </td>
                          <td className="p-3 text-center">{pagado > 0 ? `${pagado.toLocaleString('es-PY')} Gs` : '-'}</td>
                          <td className="p-3 text-center text-red-600 font-bold">
                            {compra.saldo_pendiente > 0 ? `Compra: ${Number(compra.saldo_pendiente).toLocaleString('es-PY')} Gs` : '-'}
                          </td>
                          <td className="p-3">{nombreEmpresa}</td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* FOOTER DE TOTALES (Igual a la imagen) */}
            <div className="mt-6 bg-gray-50 border p-4 rounded flex flex-wrap justify-between items-center text-sm">
              <div className="flex items-center gap-6">
                <span className="font-bold text-gray-800">TOTAL</span>
                <div>
                  <p className="text-gray-500 text-xs font-bold">GRAN TOTAL</p>
                  <p className="text-red-500 font-bold text-lg">{granTotal.toLocaleString('es-PY')} Gs</p>
                </div>
                <div>
                  <p className="text-gray-500 text-xs font-bold">COMPRA ADEUDADA</p>
                  <p className="text-red-500 font-bold text-lg">{compraAdeudada.toLocaleString('es-PY')} Gs</p>
                </div>
                <div>
                  <p className="text-gray-500 text-xs font-bold">PAGADO POR MONEDA</p>
                  <p className="text-gray-800 font-bold text-lg">{pagadoTotal.toLocaleString('es-PY')} Gs</p>
                </div>
              </div>
              <div className="flex gap-4">
                <div>
                  <p className="text-gray-500 text-xs font-bold">ESTADO DE COMPRA</p>
                </div>
                <div>
                  <p className="text-gray-500 text-xs font-bold">ESTADO DE PAGO</p>
                  <p className="font-bold text-gray-700 text-xs mt-1">Crédito - {compras.filter(c => c.estado !== 'pagado').length}</p>
                  <p className="font-bold text-gray-700 text-xs">Contado - {compras.filter(c => c.estado === 'pagado').length}</p>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}