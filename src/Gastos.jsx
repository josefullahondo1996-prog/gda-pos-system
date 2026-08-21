import { useEffect, useState } from 'react';
import { supabase } from './supabaseClient';
import { useEmpresaInfo } from './utils/useEmpresa';
import { useNotificacion } from './NotificacionContext';
import { sonidoExito } from './utils/sonido';

const CATEGORIAS = [
  'Compra de mercadería',
  'Servicios (luz, agua, internet)',
  'Alquiler',
  'Sueldos',
  'Transporte',
  'Mantenimiento',
  'Otros',
];

const FORM_VACIO = {
  descripcion: '',
  monto: '',
  categoria: '',
  metodoPago: 'Efectivo',
  cuentaPago: '',
  fecha: new Date().toISOString().slice(0, 10),
  proveedor: '',
  referencia: '',
  nota: '',
};

const formatGs = (value) => `${Number(value || 0).toLocaleString('es-PY')} Gs`;

export default function Gastos({ vistaInicial = 'lista' }) {
  const { id: empresaId, nombre: nombreEmpresa } = useEmpresaInfo();
  const { notificar, confirmar } = useNotificacion();
  const [vista, setVista] = useState(vistaInicial);
  const [gastos, setGastos] = useState([]);
  const [cajas, setCajas] = useState([]);
  const [contactos, setContactos] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [busqueda, setBusqueda] = useState('');
  const [filtroCategoria, setFiltroCategoria] = useState('');
  const [filtroContacto, setFiltroContacto] = useState('');
  const [filtroMetodo, setFiltroMetodo] = useState('');
  const [menuAbierto, setMenuAbierto] = useState(null);
  const [porPagina, setPorPagina] = useState(25);
  const [pagina, setPagina] = useState(1);
  const [form, setForm] = useState(FORM_VACIO);
  const [categoriasDisponibles, setCategoriasDisponibles] = useState(CATEGORIAS);
  const [items, setItems] = useState([{ cantidad: 1, descripcion: '', iva: 'IVA 10%', costo: '' }]);
  const [mostrarOpciones, setMostrarOpciones] = useState(false);
  const [esRecurrente, setEsRecurrente] = useState(false);
  const [intervaloRecurrente, setIntervaloRecurrente] = useState('Dias');
  const [repeticiones, setRepeticiones] = useState('');

  const cargarDatos = async () => {
    if (!empresaId) return;
    setCargando(true);
    const [gastosResult, cajasResult, categoriasResult, contactosResult] = await Promise.all([
      supabase.from('gastos').select('*').eq('empresa_id', empresaId),
      supabase.from('cuentas_caja').select('id, nombre, saldo, moneda').eq('empresa_id', empresaId).eq('activo', true).order('nombre'),
      supabase.from('categorias_gastos').select('nombre').eq('empresa_id', empresaId).order('nombre'),
      supabase.from('clientes').select('id, nombre, nombre_empresa, tipo_contacto').eq('empresa_id', empresaId).in('tipo_contacto', ['Clientes', 'Proveedores', 'Ambos']).order('nombre'),
    ]);
    if (gastosResult.error) notificar.error('Error al cargar gastos: ' + gastosResult.error.message);
    if (cajasResult.error) notificar.error('Error al cargar cajas: ' + cajasResult.error.message);
    if (!categoriasResult.error && categoriasResult.data?.length) setCategoriasDisponibles(categoriasResult.data.map((item) => item.nombre));
    if (!contactosResult.error) {
      const contactosUnicos = (contactosResult.data || []).filter((contacto, indice, lista) => {
        const nombreContacto = contacto.nombre_empresa || contacto.nombre || '';
        return nombreContacto && lista.findIndex((item) => (item.nombre_empresa || item.nombre || '') === nombreContacto) === indice;
      });
      setContactos(contactosUnicos);
    }
    const gastosOrdenados = [...(gastosResult.data || [])].sort((a, b) => {
      const fechaA = new Date(a.fecha || 0).getTime();
      const fechaB = new Date(b.fecha || 0).getTime();
      return fechaB - fechaA;
    });
    setGastos(gastosOrdenados);
    setCajas(cajasResult.data || []);
    setCargando(false);
  };

  useEffect(() => {
    setVista(vistaInicial);
  }, [vistaInicial]);

  useEffect(() => {
    cargarDatos();
  }, [empresaId]);

  const actualizarForm = (campo, valor) => setForm((actual) => ({ ...actual, [campo]: valor }));

  const limpiarForm = () => {
    setForm({ ...FORM_VACIO, fecha: new Date().toISOString().slice(0, 10) });
    setItems([{ cantidad: 1, descripcion: '', iva: 'IVA 10%', costo: '' }]);
    setMostrarOpciones(false);
    setEsRecurrente(false);
    setIntervaloRecurrente('Dias');
    setRepeticiones('');
  };

  const guardarGasto = async (event) => {
    event.preventDefault();
    const monto = items.reduce((total, item) => total + (Number(item.cantidad) || 0) * (Number(item.costo) || 0), 0);
    const caja = cajas.find((item) => item.id === form.cuentaPago);
    if (items.some((item) => !item.descripcion.trim() || !Number(item.costo))) return notificar.info('Complete la descripción y el costo de cada ítem.');
    if (!monto || monto <= 0) return notificar.info('Ingrese un monto válido.');
    if (!form.categoria) return notificar.info('Seleccione una categoría.');
    if (!caja) return notificar.info('Seleccione la cuenta de pago.');
    if (monto > Number(caja.saldo || 0)) return notificar.info('La caja no tiene saldo suficiente.');

    setGuardando(true);
    try {
      const { error } = await supabase.from('gastos').insert([{
        empresa_id: empresaId,
        descripcion: form.descripcion.trim() || items.map((item) => item.descripcion.trim()).join(', '),
        monto,
        categoria: form.categoria,
        proveedor: form.proveedor.trim() || null,
        nro_referencia: form.referencia.trim() || null,
        nota: form.nota.trim() || null,
        fecha: form.fecha || null,
        metodo_pago: form.metodoPago,
        cuenta_pago: caja.nombre,
      }]);
      if (error) throw error;

      const { error: errorCaja } = await supabase.from('cuentas_caja')
        .update({ saldo: Number(caja.saldo || 0) - monto })
        .eq('id', caja.id)
        .eq('empresa_id', empresaId);
      if (errorCaja) throw errorCaja;

      sonidoExito();
      notificar.exito('¡Gasto registrado y descontado de la caja!');
      limpiarForm();
      await cargarDatos();
      setVista('lista');
    } catch (error) {
      notificar.error('Error al registrar el gasto: ' + error.message);
    } finally {
      setGuardando(false);
    }
  };

  const borrarGasto = async (gasto) => {
    if (!(await confirmar(`¿Borrar el gasto "${gasto.descripcion}"? El importe será devuelto a la caja.`))) return;
    try {
      const { error } = await supabase.from('gastos').delete().eq('id', gasto.id).eq('empresa_id', empresaId);
      if (error) throw error;
      if (gasto.cuenta_pago) {
        const caja = cajas.find((item) => item.nombre === gasto.cuenta_pago);
        if (caja) {
          const { error: errorCaja } = await supabase.from('cuentas_caja')
            .update({ saldo: Number(caja.saldo || 0) + Number(gasto.monto || 0) })
            .eq('id', caja.id).eq('empresa_id', empresaId);
          if (errorCaja) throw errorCaja;
        }
      }
      notificar.exito('Gasto eliminado y saldo de caja restaurado.');
      await cargarDatos();
    } catch (error) {
      notificar.error('Error al borrar el gasto: ' + error.message);
    }
  };

  const actualizarItem = (indice, campo, valor) => {
    setItems((actuales) => actuales.map((item, index) => index === indice ? { ...item, [campo]: valor } : item));
  };

  const agregarItem = () => setItems((actuales) => [...actuales, { cantidad: 1, descripcion: '', iva: 'IVA 10%', costo: '' }]);

  const eliminarItem = (indice) => setItems((actuales) => actuales.length === 1 ? actuales : actuales.filter((_, index) => index !== indice));

  const totalItems = items.reduce((total, item) => total + (Number(item.cantidad) || 0) * (Number(item.costo) || 0), 0);

  const gastosFiltrados = gastos.filter((gasto) => {
    const texto = `${gasto.descripcion || ''} ${gasto.proveedor || ''} ${gasto.cuenta_pago || ''}`.toLowerCase();
    return texto.includes(busqueda.toLowerCase())
      && (!filtroCategoria || gasto.categoria === filtroCategoria)
      && (!filtroContacto || gasto.proveedor === filtroContacto)
      && (!filtroMetodo || gasto.metodo_pago === filtroMetodo);
  });
  const total = gastosFiltrados.reduce((sum, gasto) => sum + Number(gasto.monto || 0), 0);
  const totalPaginas = Math.max(1, Math.ceil(gastosFiltrados.length / porPagina));
  const paginaSegura = Math.min(pagina, totalPaginas);
  const gastosPagina = gastosFiltrados.slice((paginaSegura - 1) * porPagina, paginaSegura * porPagina);

  useEffect(() => { setPagina(1); }, [busqueda, filtroCategoria, filtroContacto, filtroMetodo, porPagina]);

  const exportarCSV = () => {
    const filas = [
      ['Fecha', 'Referencia', 'Detalle', 'Categoría', 'Método', 'Cantidad total', 'Saldo pendiente', 'Contacto', 'Nota'],
      ...gastosFiltrados.map((gasto) => [
        gasto.fecha || '', gasto.nro_referencia || '', gasto.descripcion || '', gasto.categoria || '',
        gasto.metodo_pago || '', gasto.monto || 0, 0, gasto.proveedor || '', gasto.nota || '',
      ]),
    ];
    const csv = filas.map((fila) => fila.map((valor) => `"${String(valor).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const enlace = document.createElement('a');
    enlace.href = url; enlace.download = 'gastos.csv'; enlace.click();
    URL.revokeObjectURL(url);
  };

  if (vista === 'agregar') {
    return (
      <div className="max-w-5xl mx-auto">
        <form onSubmit={guardarGasto} className="space-y-4 text-xs text-gray-700">
          <div className="bg-white rounded-lg shadow-sm border-t-2 border-[#004284] p-4">
            <div className="flex justify-between items-center border-b pb-3 mb-4"><h1 className="text-xl font-bold text-gray-800">Agregar gasto</h1><button type="button" onClick={() => setVista('lista')} className="border rounded px-4 py-2 font-bold">Volver</button></div>
            <h2 className="font-bold border-b pb-2 mb-4">▣ Datos del gasto</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div><label className="block font-bold mb-1">Ubicación de la empresa:*</label><input readOnly className="w-full border rounded p-2 bg-gray-50" value={nombreEmpresa || 'Mi negocio'} /></div>
              <div><label className="block font-bold mb-1">Proveedor:</label><select className="w-full border rounded p-2 bg-white" value={form.proveedor} onChange={(e) => actualizarForm('proveedor', e.target.value)}><option value="">Ninguna</option>{contactos.map((contacto) => { const nombreContacto = contacto.nombre_empresa || contacto.nombre; return <option key={contacto.id} value={nombreContacto}>{nombreContacto} ({contacto.tipo_contacto})</option>; })}</select></div>
              <div><label className="block font-bold mb-1">Fecha:*</label><input required type="date" className="w-full border rounded p-2" value={form.fecha} onChange={(e) => actualizarForm('fecha', e.target.value)} /></div>
              <div><label className="block font-bold mb-1">Categoría de gastos:*</label><select required className="w-full border rounded p-2 bg-white" value={form.categoria} onChange={(e) => actualizarForm('categoria', e.target.value)}><option value="">Seleccione</option>{categoriasDisponibles.map((categoria) => <option key={categoria}>{categoria}</option>)}</select></div>
              <div><label className="block font-bold mb-1">Subcategoría:</label><input className="w-full border rounded p-2" placeholder="Seleccione" /></div>
              <div><label className="block font-bold mb-1">Número de referencia:</label><input className="w-full border rounded p-2" value={form.referencia} onChange={(e) => actualizarForm('referencia', e.target.value)} placeholder="Nro. factura proveedor" /></div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow-sm border-t-2 border-[#004284] p-4">
            <div className="flex justify-between items-center border-b pb-2 mb-3"><h2 className="font-bold">▣ Detalle de ítems</h2><button type="button" onClick={agregarItem} className="bg-emerald-500 text-white rounded px-3 py-1.5 font-bold">+ Agregar ítem</button></div>
            <div className="overflow-x-auto"><table className="w-full min-w-[650px] text-left"><thead className="bg-gray-50 text-[10px] uppercase"><tr><th className="p-2">Cant.</th><th className="p-2">Descripción</th><th className="p-2">IVA</th><th className="p-2">Costo unit.</th><th className="p-2 text-right">Total</th><th className="p-2"></th></tr></thead><tbody>{items.map((item, index) => <tr key={index} className="border-b"><td className="p-2"><input min="1" type="number" className="w-16 border rounded p-2" value={item.cantidad} onChange={(e) => actualizarItem(index, 'cantidad', e.target.value)} /></td><td className="p-2"><input className="w-full border rounded p-2" placeholder="Descripción del ítem" value={item.descripcion} onChange={(e) => actualizarItem(index, 'descripcion', e.target.value)} /></td><td className="p-2"><select className="border rounded p-2" value={item.iva} onChange={(e) => actualizarItem(index, 'iva', e.target.value)}><option>IVA 10%</option><option>IVA 5%</option><option>Exento</option></select></td><td className="p-2"><input min="0" type="number" className="w-24 border rounded p-2" value={item.costo} onChange={(e) => actualizarItem(index, 'costo', e.target.value)} /></td><td className="p-2 text-right font-bold">{formatGs((Number(item.cantidad) || 0) * (Number(item.costo) || 0))}</td><td className="p-2"><button type="button" onClick={() => eliminarItem(index)} className="bg-red-500 text-white rounded px-2 py-1">×</button></td></tr>)}</tbody></table></div>
            <div className="flex justify-end mt-3 font-bold">TOTAL: <span className="text-orange-600 ml-3">{formatGs(totalItems)}</span></div>
          </div>

          <button type="button" onClick={() => setMostrarOpciones((actual) => !actual)} className="w-full bg-white rounded-lg shadow-sm border-t-2 border-[#004284] p-3 text-left font-bold">⚙ Opciones adicionales <span className="float-right">{mostrarOpciones ? '−' : '+'}</span></button>
          {mostrarOpciones && <div className="bg-white rounded-lg shadow-sm p-4 grid grid-cols-1 md:grid-cols-3 gap-4"><label className="flex items-center gap-2"><input type="checkbox" checked={esRecurrente} onChange={(e) => setEsRecurrente(e.target.checked)} /> Es recurrente</label><div><label className="block font-bold mb-1">Intervalo recurrente:</label><select className="w-full border rounded p-2" disabled={!esRecurrente} value={intervaloRecurrente} onChange={(e) => setIntervaloRecurrente(e.target.value)}><option>Días</option><option>Semanas</option><option>Meses</option></select></div><div><label className="block font-bold mb-1">No. de repeticiones:</label><input type="number" min="1" disabled={!esRecurrente} className="w-full border rounded p-2" value={repeticiones} onChange={(e) => setRepeticiones(e.target.value)} /></div></div>}

          <div className="bg-white rounded-lg shadow-sm border-t-2 border-[#004284] p-4"><div className="flex justify-between items-center border-b pb-2 mb-4"><h2 className="font-bold">Monto total pagado o pago parcial</h2><span className="bg-gray-100 rounded px-3 py-1 font-bold">{formatGs(totalItems)}</span></div><div className="grid grid-cols-1 md:grid-cols-3 gap-4"><div><label className="block font-bold mb-1">Cantidad (PYG):*</label><div className="flex border rounded overflow-hidden"><span className="bg-gray-50 px-3 py-2 border-r">Gs</span><input readOnly className="w-full p-2 bg-gray-50 font-bold" value={totalItems || ''} /></div></div><div><label className="block font-bold mb-1">Método de pago:*</label><select className="w-full border rounded p-2 bg-white" value={form.metodoPago} onChange={(e) => actualizarForm('metodoPago', e.target.value)}><option>Efectivo</option><option>Tarjeta</option><option>Transferencia</option><option>QR/PIX</option></select></div><div><label className="block font-bold mb-1">Cuenta de pago:*</label><select required className="w-full border rounded p-2 bg-white" value={form.cuentaPago} onChange={(e) => actualizarForm('cuentaPago', e.target.value)}><option value="">Seleccione una cuenta</option>{cajas.map((caja) => <option key={caja.id} value={caja.id}>{caja.nombre} ({formatGs(caja.saldo)})</option>)}</select></div></div><div className="mt-4"><label className="block font-bold mb-1">Nota de pago:</label><textarea className="w-full border rounded p-2 h-20" value={form.nota} onChange={(e) => actualizarForm('nota', e.target.value)} /></div><div className="flex justify-between mt-3 font-bold"><span>Total pagado: {formatGs(totalItems)}</span><span>Saldo pendiente: <span className="text-orange-600">0 Gs</span></span></div></div>
          <div className="flex justify-center gap-3"><button type="button" onClick={() => { limpiarForm(); setVista('lista'); }} className="border rounded px-5 py-2 font-bold">Cancelar</button><button type="submit" disabled={guardando} className="bg-orange-500 hover:bg-orange-600 text-white rounded px-7 py-2 font-bold disabled:opacity-60">{guardando ? 'Guardando...' : 'Guardar'}</button></div>
        </form>
      </div>
    );
  }

  return (
    <div className="bg-transparent text-sm text-gray-700">
      <h1 className="text-2xl font-bold text-gray-800 mb-1">Gastos</h1>
      <div className="bg-white rounded-lg shadow-sm border-t-2 border-[#004284] mb-4">
        <div className="p-4 border-b font-bold text-blue-500">⚙ Filtros</div>
        <div className="p-4 grid grid-cols-1 md:grid-cols-4 gap-4 text-xs font-bold">
          <div><label className="block mb-1">Ubicación de la empresa:</label><select className="w-full border rounded p-2 bg-white"><option>{nombreEmpresa || 'Todas las localizaciones'}</option></select></div>
          <div><label className="block mb-1">Gasto por:</label><select className="w-full border rounded p-2 bg-white" value={filtroMetodo} onChange={(e) => setFiltroMetodo(e.target.value)}><option value="">Todos</option><option>Efectivo</option><option>Tarjeta</option><option>Transferencia</option><option>QR/PIX</option></select></div>
          <div><label className="block mb-1">Contacto:</label><select className="w-full border rounded p-2 bg-white" value={filtroContacto} onChange={(e) => setFiltroContacto(e.target.value)}><option value="">Ninguna</option>{contactos.map((contacto) => { const nombreContacto = contacto.nombre_empresa || contacto.nombre; return <option key={contacto.id} value={nombreContacto}>{nombreContacto}</option>; })}</select></div>
          <div><label className="block mb-1">Categoría de gastos:</label><select className="w-full border rounded p-2 bg-white" value={filtroCategoria} onChange={(e) => setFiltroCategoria(e.target.value)}><option value="">Todas</option>{categoriasDisponibles.map((categoria) => <option key={categoria}>{categoria}</option>)}</select></div>
          <div><label className="block mb-1">Subcategoría:</label><select className="w-full border rounded p-2 bg-white"><option>Todas</option></select></div>
          <div><label className="block mb-1">Rango de fechas:</label><input type="text" readOnly className="w-full border rounded p-2 bg-gray-100" value={new Date().toLocaleDateString('es-PY')} /></div>
          <div><label className="block mb-1">Estado de pago:</label><select className="w-full border rounded p-2 bg-white"><option>Todos</option><option>Contado</option><option>Crédito</option></select></div>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-sm border-t-2 border-[#004284]">
        <div className="p-4 border-b flex justify-between items-center"><h2 className="font-bold text-gray-700">Todos los gastos</h2><button type="button" onClick={() => { limpiarForm(); setVista('agregar'); }} className="bg-orange-500 hover:bg-orange-600 text-white rounded px-4 py-2 font-bold">+ Añadir</button></div>
        <div className="p-4">
          <div className="flex flex-wrap justify-between items-center gap-3 mb-4 text-xs"><div className="flex items-center gap-2"><span>Mostrar</span><select className="border rounded p-1.5 bg-white" value={porPagina} onChange={(e) => setPorPagina(Number(e.target.value))}><option value={10}>10</option><option value={25}>25</option><option value={50}>50</option></select><span>entradas</span><button onClick={exportarCSV} className="bg-gray-100 border rounded px-2.5 py-1.5 font-semibold">📄 Exportar a CSV</button><button onClick={() => window.print()} className="bg-gray-100 border rounded px-2.5 py-1.5 font-semibold">🖨️ Imprimir</button></div><input className="border rounded p-2 w-64" placeholder="Buscar ..." value={busqueda} onChange={(e) => setBusqueda(e.target.value)} /></div>
          <div className="overflow-x-auto border rounded"><table className="w-full min-w-[1250px] text-left text-[11px] border-collapse"><thead><tr className="bg-gray-50 text-[#004284] font-black uppercase border-b-2"><th className="p-3">Acción</th><th className="p-3">Fecha</th><th className="p-3">Número de referencia</th><th className="p-3">Detalles recurrentes</th><th className="p-3">Categoría de gastos</th><th className="p-3">Subcategoría</th><th className="p-3">Ubicación</th><th className="p-3">Estado de pago</th><th className="p-3">IVA</th><th className="p-3 text-right">Cantidad total</th><th className="p-3 text-right">Saldo pendiente de pago</th><th className="p-3">Gasto por</th><th className="p-3">Contacto</th><th className="p-3">Nota de gastos</th><th className="p-3">Añadido por</th></tr></thead><tbody>{cargando ? <tr><td colSpan="15" className="p-8 text-center text-gray-400">Cargando gastos...</td></tr> : gastosPagina.length === 0 ? <tr><td colSpan="15" className="p-8 text-center text-gray-400">No hay datos disponibles en la tabla</td></tr> : gastosPagina.map((gasto) => { const pagado = Number(gasto.monto || 0); return <tr key={gasto.id} className="border-b hover:bg-gray-50"><td className="p-2 relative"><button type="button" onClick={() => setMenuAbierto(menuAbierto === gasto.id ? null : gasto.id)} className="bg-cyan-500 text-white px-2 py-1 rounded font-bold">Acciones⌄</button>{menuAbierto === gasto.id && <div className="absolute z-30 mt-1 bg-white border rounded shadow-xl w-40 py-1"><button type="button" onClick={() => { notificar.info(`${gasto.descripcion}\nMonto: ${formatGs(gasto.monto)}\nCuenta: ${gasto.cuenta_pago || '—'}`); setMenuAbierto(null); }} className="block w-full text-left px-3 py-2 hover:bg-gray-50">👁️ Ver</button><button type="button" onClick={() => { setMenuAbierto(null); borrarGasto(gasto); }} className="block w-full text-left px-3 py-2 text-red-600 hover:bg-red-50">🗑️ Borrar</button></div>}</td><td className="p-3">{gasto.fecha ? new Date(gasto.fecha).toLocaleDateString('es-PY') : '—'}</td><td className="p-3 font-mono">{gasto.nro_referencia || '—'}</td><td className="p-3">{gasto.es_recurrente ? 'Sí' : '—'}</td><td className="p-3">{gasto.categoria || '—'}</td><td className="p-3">{gasto.subcategoria || '—'}</td><td className="p-3">{nombreEmpresa || '—'}</td><td className="p-3"><span className="bg-green-100 text-green-700 px-2 py-0.5 rounded font-bold">Contado</span></td><td className="p-3">{gasto.iva || '—'}</td><td className="p-3 text-right font-bold">{formatGs(pagado)}</td><td className="p-3 text-right">0 Gs</td><td className="p-3">{gasto.metodo_pago || '—'}</td><td className="p-3">{gasto.proveedor || '—'}</td><td className="p-3">{gasto.nota || '—'}</td><td className="p-3">{nombreEmpresa || '—'}</td></tr>; })}</tbody><tfoot><tr className="bg-gray-200 font-bold"><td colSpan="9" className="p-3 text-right">Total:</td><td className="p-3 text-right">{formatGs(total)}</td><td className="p-3 text-right">0 Gs</td><td colSpan="4"></td></tr></tfoot></table></div>
          <div className="flex flex-wrap justify-between items-center mt-4 text-xs"><span>Mostrando {gastosPagina.length === 0 ? 0 : (paginaSegura - 1) * porPagina + 1} a {(paginaSegura - 1) * porPagina + gastosPagina.length} de {gastosFiltrados.length} entradas</span><div className="flex gap-1"><button onClick={() => setPagina((actual) => Math.max(1, actual - 1))} disabled={paginaSegura === 1} className="px-3 py-1 border rounded disabled:opacity-40">Anterior</button><span className="px-3 py-1 bg-blue-600 text-white rounded">{paginaSegura}</span><button onClick={() => setPagina((actual) => Math.min(totalPaginas, actual + 1))} disabled={paginaSegura === totalPaginas} className="px-3 py-1 border rounded disabled:opacity-40">Siguiente</button></div></div>
        </div>
      </div>
    </div>
  );
}
