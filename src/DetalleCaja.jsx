import { useEffect, useState } from 'react';
import { supabase } from './supabaseClient';

const formatGs = (valor) => `${Number(valor || 0).toLocaleString('es-PY')} Gs`;
const formatFecha = (fecha) => fecha
  ? `${new Date(fecha).toLocaleDateString('es-PY')} ${new Date(fecha).toLocaleTimeString('es-PY', { hour: '2-digit', minute: '2-digit' })}`
  : '—';

const DetalleCaja = ({ cajaInfo, empresaId, nombreEmpresa, session, onClose }) => {
  const [ventas, setVentas] = useState([]);
  const [gastos, setGastos] = useState([]);
  const [detalles, setDetalles] = useState([]);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    const cargarDetalle = async () => {
      setCargando(true);
      const ventasQuery = supabase.from('ventas').select('*').eq('empresa_id', empresaId);
      const gastosQuery = supabase.from('gastos').select('*').eq('empresa_id', empresaId);
      const [ventasRespuesta, gastosRespuesta] = await Promise.all([
        cajaInfo?.id ? ventasQuery.eq('caja_id', cajaInfo.id) : ventasQuery,
        cajaInfo?.id ? gastosQuery.eq('caja_id', cajaInfo.id) : gastosQuery,
      ]);
      setVentas(ventasRespuesta.error ? [] : ventasRespuesta.data || []);
      setGastos(gastosRespuesta.error ? [] : gastosRespuesta.data || []);
      const idsVentas = (ventasRespuesta.data || []).map((venta) => venta.id).filter(Boolean);
      if (idsVentas.length) {
        const { data } = await supabase.from('detalle_ventas').select('*').in('venta_id', idsVentas);
        setDetalles(data || []);
      } else {
        setDetalles([]);
      }
      setCargando(false);
    };
    if (empresaId) cargarDetalle();
  }, [empresaId, cajaInfo?.id]);

  const totalVentas = ventas.reduce((total, venta) => total + Number(venta.total || 0), 0);
  const totalGastos = gastos.reduce((total, gasto) => total + Number(gasto.monto || 0), 0);
  const efectivoInicial = Number(cajaInfo?.monto_inicial || cajaInfo?.saldo_inicial || cajaInfo?.efectivo_inicial || 0);
  const efectivoVentas = ventas.filter((venta) => (venta.metodo_pago || '').toLowerCase() === 'efectivo').reduce((total, venta) => total + Number(venta.total || 0), 0);
  const efectivoGastos = gastos.filter((gasto) => (gasto.metodo_pago || 'Efectivo').toLowerCase() === 'efectivo').reduce((total, gasto) => total + Number(gasto.monto || 0), 0);
  const efectivoActual = efectivoInicial + efectivoVentas - efectivoGastos;
  const metodos = ['Efectivo', 'Tarjeta', 'Transferencia', 'QR'];
  const productos = detalles.reduce((lista, item) => {
    const nombre = item.nombre_producto || item.nombre || item.producto_nombre || 'Producto';
    const existente = lista.find((producto) => producto.nombre === nombre);
    const cantidad = Number(item.cantidad || 1);
    const subtotal = Number(item.subtotal || item.total || (item.precio_venta || item.precio || 0) * cantidad);
    if (existente) { existente.cantidad += cantidad; existente.total += subtotal; }
    else lista.push({ nombre, cantidad, total: subtotal });
    return lista;
  }, []);

  const imprimir = () => window.print();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-3 print:bg-white print:p-0">
      <div className="flex max-h-[94vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl bg-white shadow-2xl print:max-h-none print:shadow-none">
        <div className="flex items-start justify-between bg-[#1e2a4a] px-5 py-4 text-white">
          <div><h2 className="text-base font-bold">▣ Detalle de Caja</h2><p className="mt-1 text-xs text-blue-100">{formatFecha(cajaInfo?.fecha_apertura)} · {cajaInfo?.estado || 'Abierta'}</p><p className="mt-1 text-[11px] text-gray-300">♟ {nombreEmpresa || 'Mi Negocio'} · {cajaInfo?.usuario || session?.user?.email || 'Usuario'}</p></div>
          <button onClick={onClose} className="text-2xl font-bold leading-none text-gray-300 hover:text-white" aria-label="Cerrar">×</button>
        </div>
        <div className="overflow-y-auto bg-[#f5f7fb] p-4">
          {cargando ? <div className="py-16 text-center text-sm text-gray-400">Cargando detalle...</div> : <>
            <div className="mb-3 grid grid-cols-2 gap-3"><div className="rounded-lg border border-gray-200 bg-white p-4"><p className="text-[10px] font-bold uppercase text-gray-400">▥ Total ventas</p><p className="text-xl font-black text-blue-600">{formatGs(totalVentas)}</p></div><div className="rounded-lg border border-gray-200 bg-white p-4"><p className="text-[10px] font-bold uppercase text-gray-400">↓ Gastos</p><p className="text-xl font-black text-red-500">{formatGs(totalGastos)}</p></div></div>
            <section className="mb-3 rounded-lg border border-gray-200 bg-white p-4"><h3 className="mb-3 text-xs font-bold uppercase text-[#1e2a4a]">▣ Efectivo actual en caja</h3><div className="rounded-lg bg-blue-50 px-3 py-2 text-xs text-blue-700"><div>Gs PYG</div><div className="mt-2 flex justify-between"><span>Inicial:</span><b>{formatGs(efectivoInicial)}</b></div><div className="flex justify-between"><span>+ Ventas efectivo:</span><b>{formatGs(efectivoVentas)}</b></div><div className="mt-1 flex justify-between border-t border-blue-200 pt-1 font-black"><span>Total:</span><b>{formatGs(efectivoActual)}</b></div></div></section>
            <section className="mb-3 rounded-lg border border-gray-200 bg-white p-4"><h3 className="mb-3 text-xs font-bold uppercase text-[#1e2a4a]">▤ Resumen por método de pago</h3><div className="grid grid-cols-3 border-b bg-gray-50 px-2 py-2 text-[10px] font-bold uppercase text-gray-500"><span>Método</span><span className="text-right">Ventas</span><span className="text-right">Gastos</span></div>{metodos.map((metodo) => <div key={metodo} className="grid grid-cols-3 px-2 py-2 text-xs"><span>{metodo}</span><b className="text-right text-green-600">{formatGs(ventas.filter((v) => (v.metodo_pago || '').toLowerCase().includes(metodo.toLowerCase().replace('qr', ''))).reduce((a, v) => a + Number(v.total || 0), 0))}</b><span className="text-right text-red-500">{formatGs(gastos.filter((g) => (g.metodo_pago || 'Efectivo').toLowerCase().includes(metodo.toLowerCase().replace('qr', ''))).reduce((a, g) => a + Number(g.monto || 0), 0))}</span></div>)}<div className="grid grid-cols-3 border-t px-2 pt-2 text-xs font-black"><span>Total PYG</span><span className="text-right text-green-600">{formatGs(totalVentas)}</span><span className="text-right text-red-500">{formatGs(totalGastos)}</span></div></section>
            <section className="rounded-lg border border-gray-200 bg-white p-4"><h3 className="mb-3 text-xs font-bold uppercase text-[#1e2a4a]">▥ Productos vendidos</h3>{productos.length ? productos.map((producto) => <div key={producto.nombre} className="flex justify-between border-b py-2 text-xs"><span>{producto.nombre} <b className="text-gray-400">×{producto.cantidad}</b></span><b>{formatGs(producto.total)}</b></div>) : <div className="py-6 text-center text-xs text-gray-400">▱<br />Sin productos vendidos</div>}</section>
          </>}
        </div>
        <div className="flex justify-end gap-2 border-t bg-gray-50 px-5 py-3"><button onClick={imprimir} className="rounded bg-orange-500 px-3 py-2 text-xs font-bold text-white hover:bg-orange-600">▤ Ticket 80mm</button><button onClick={imprimir} className="rounded bg-cyan-500 px-3 py-2 text-xs font-bold text-white hover:bg-cyan-600">▤ Imprimir A4</button><button onClick={onClose} className="rounded border bg-white px-3 py-2 text-xs font-semibold text-gray-600 hover:bg-gray-100">Cancelar</button></div>
      </div>
    </div>
  );
};

export default DetalleCaja;