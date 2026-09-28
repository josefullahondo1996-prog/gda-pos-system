import { useEffect, useState } from 'react';
import { AlertTriangle, Building2, CreditCard, Eye, History, Package, Pencil, Receipt, RefreshCw, Save, ShieldCheck, ShoppingBag, ShoppingCart, UserRoundCheck, UserRoundX, Users, X } from 'lucide-react';
import { supabase } from './supabaseClient';

const formatDate = (value) => value ? new Date(value).toLocaleDateString('es-PY') : '-';
const formatNumber = (value) => Number(value || 0).toLocaleString('es-PY');
const formatAction = (value) => String(value || '').replaceAll('_', ' ');
const formatAuditDetail = (detail) => Object.entries(detail || {}).map(([key, value]) => `${key}: ${value}`).join(' · ');

export default function PanelDesarrollador() {
  const [resumen, setResumen] = useState(null);
  const [empresas, setEmpresas] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [empresaSeleccionada, setEmpresaSeleccionada] = useState(null);
  const [cargandoDetalle, setCargandoDetalle] = useState(false);
  const [errorDetalle, setErrorDetalle] = useState('');
  const [actualizandoUsuario, setActualizandoUsuario] = useState(null);
  const [actualizandoEmpresa, setActualizandoEmpresa] = useState(null);
  const [editandoEmpresa, setEditandoEmpresa] = useState(false);
  const [guardandoEmpresa, setGuardandoEmpresa] = useState(false);
  const [formEmpresa, setFormEmpresa] = useState({ nombre: '', direccion: '', telefono: '' });
  const [actividad, setActividad] = useState([]);
  const [suscripciones, setSuscripciones] = useState([]);
  const [actualizandoSuscripcion, setActualizandoSuscripcion] = useState(null);
  const [busquedaEmpresa, setBusquedaEmpresa] = useState('');
  const [filtroPlan, setFiltroPlan] = useState('todos');
  const [filtroEstado, setFiltroEstado] = useState('todos');
  const [pagos, setPagos] = useState([]);
  const [empresaPago, setEmpresaPago] = useState('');
  const [mostrarPago, setMostrarPago] = useState(false);
  const [guardandoPago, setGuardandoPago] = useState(false);
  const [formPago, setFormPago] = useState({ monto: '', moneda: 'PYG', metodo: 'transferencia', fecha: new Date().toISOString().slice(0, 10), nota: '', comprobante: null });
  const [reporteDesde, setReporteDesde] = useState(() => { const date = new Date(); date.setDate(1); return date.toISOString().slice(0, 10); });
  const [reporteHasta, setReporteHasta] = useState(() => new Date().toISOString().slice(0, 10));
  const [reporte, setReporte] = useState(null);

  const cargarPanel = async () => {
    setCargando(true);
    setError('');
    const [resumenResponse, empresasResponse, actividadResponse, suscripcionesResponse, pagosResponse] = await Promise.all([
      supabase.rpc('admin_resumen_desarrollador'),
      supabase.rpc('admin_listar_empresas'),
      supabase.rpc('admin_listar_auditoria'),
      supabase.rpc('admin_listar_suscripciones'),
      supabase.rpc('admin_listar_pagos'),
    ]);

    if (resumenResponse.error || empresasResponse.error) {
      const errores = [resumenResponse.error, empresasResponse.error].filter(Boolean);
      const detalle = errores.map((item) => item.message).join(' | ');
      console.error('Error en RPC del panel de desarrollador:', errores);
      setError(`No se pudieron cargar los datos del panel. ${detalle}`);
      setResumen(null);
      setEmpresas([]);
    } else {
      setResumen(resumenResponse.data || {});
      setEmpresas(empresasResponse.data || []);
      if (actividadResponse.error) {
        console.warn('Auditoría todavía no disponible:', actividadResponse.error.message);
        setError('El resumen está disponible. Ejecutá la migración actualizada para habilitar la auditoría.');
        setActividad([]);
      } else {
        setActividad(actividadResponse.data || []);
      }
      if (suscripcionesResponse.error) {
        console.warn('Suscripciones todavía no disponibles:', suscripcionesResponse.error.message);
        setSuscripciones([]);
      } else {
        setSuscripciones(suscripcionesResponse.data || []);
      }
      if (!pagosResponse.error) setPagos(pagosResponse.data || []);
    }
    setCargando(false);
  };

  const abrirPago = () => {
    if (!empresaPago && empresas.length > 0) setEmpresaPago(empresas[0].id);
    setMostrarPago(true);
  };

  const guardarPago = async () => {
    if (!empresaPago || !Number(formPago.monto) || Number(formPago.monto) < 0) return setError('Seleccioná una empresa e ingresá un monto válido.');
    setGuardandoPago(true);
    let comprobanteUrl = null;
    try {
      if (formPago.comprobante) {
        const extension = formPago.comprobante.name.split('.').pop() || 'bin';
        const ruta = `${crypto.randomUUID()}.${extension}`;
        const { error: uploadError } = await supabase.storage.from('admin-comprobantes').upload(ruta, formPago.comprobante);
        if (uploadError) throw new Error(`No se pudo subir el comprobante: ${uploadError.message}`);
        comprobanteUrl = supabase.storage.from('admin-comprobantes').getPublicUrl(ruta).data.publicUrl;
      }
      const { error: pagoError } = await supabase.rpc('admin_registrar_pago', { p_empresa_id: empresaPago, p_monto: Number(formPago.monto), p_moneda: formPago.moneda, p_metodo: formPago.metodo, p_fecha_pago: formPago.fecha, p_comprobante_url: comprobanteUrl, p_nota: formPago.nota || null });
      if (pagoError) throw pagoError;
      setMostrarPago(false);
      setFormPago({ monto: '', moneda: 'PYG', metodo: 'transferencia', fecha: new Date().toISOString().slice(0, 10), nota: '', comprobante: null });
      await cargarPanel();
    } catch (pagoError) {
      setError(pagoError.message);
    } finally {
      setGuardandoPago(false);
    }
  };

  useEffect(() => {
    cargarPanel();
  }, []);

  const cargarReporte = async () => {
    const { data, error: reporteError } = await supabase.rpc('admin_reporte_ventas', { p_desde: reporteDesde, p_hasta: reporteHasta });
    if (reporteError) {
      console.error('Error en reporte de ventas:', reporteError);
      setError(reporteError.message);
    } else {
      setReporte(data);
    }
  };

  useEffect(() => {
    if (reporteDesde && reporteHasta) cargarReporte();
  }, [reporteDesde, reporteHasta]);

  const empresasVisibles = empresas.filter((empresa) => {
    const texto = busquedaEmpresa.trim().toLowerCase();
    if (!texto) return true;
    return [empresa.nombre, empresa.email, empresa.telefono].some((valor) => String(valor || '').toLowerCase().includes(texto));
  });

  const suscripcionesVisibles = suscripciones.filter((item) => (
    (filtroPlan === 'todos' || item.plan === filtroPlan)
    && (filtroEstado === 'todos' || item.estado === filtroEstado)
  ));

  const verEmpresa = async (empresa) => {
    setCargandoDetalle(true);
    setErrorDetalle('');
    const { data, error: detalleErrorResponse } = await supabase.rpc('admin_detalle_empresa', { p_empresa_id: empresa.id });
    if (detalleErrorResponse) {
      console.error('Error al cargar detalle de empresa:', detalleErrorResponse);
      setErrorDetalle(detalleErrorResponse.message);
    } else {
      setEmpresaSeleccionada(data);
      setFormEmpresa({
        nombre: data.empresa?.nombre || '',
        direccion: data.empresa?.direccion || '',
        telefono: data.empresa?.telefono || '',
      });
      setEditandoEmpresa(false);
    }
    setCargandoDetalle(false);
  };

  const guardarEmpresa = async () => {
    if (!formEmpresa.nombre.trim()) return setErrorDetalle('El nombre de la empresa es obligatorio.');
    setGuardandoEmpresa(true);
    const { error: guardarError } = await supabase.rpc('admin_actualizar_empresa', {
      p_empresa_id: empresaSeleccionada.empresa.id,
      p_nombre: formEmpresa.nombre.trim(),
      p_direccion: formEmpresa.direccion.trim() || null,
      p_telefono: formEmpresa.telefono.trim() || null,
    });
    if (guardarError) {
      setErrorDetalle(guardarError.message);
    } else {
      setEmpresaSeleccionada((actual) => actual ? { ...actual, empresa: { ...actual.empresa, ...formEmpresa } } : actual);
      setEmpresas((actual) => actual.map((item) => item.id === empresaSeleccionada.empresa.id ? { ...item, nombre: formEmpresa.nombre, telefono: formEmpresa.telefono } : item));
      setEditandoEmpresa(false);
    }
    setGuardandoEmpresa(false);
  };

  const cambiarAccesoUsuario = async (usuario) => {
    const permitir = !(usuario.activo && usuario.permitir_acceso);
    const nombreUsuario = [usuario.nombre, usuario.apellido].filter(Boolean).join(' ') || usuario.email || 'este usuario';
    const accion = permitir ? 'activar' : 'bloquear';
    if (!window.confirm(`¿Querés ${accion} a ${nombreUsuario}?`)) return;
    setActualizandoUsuario(usuario.id);
    const { error: accesoError } = await supabase.rpc('admin_cambiar_acceso_usuario', {
      p_usuario_id: usuario.id,
      p_permitir_acceso: permitir,
    });
    if (accesoError) {
      setErrorDetalle(accesoError.message);
    } else {
      setEmpresaSeleccionada((actual) => actual ? {
        ...actual,
        usuarios: actual.usuarios.map((item) => item.id === usuario.id ? { ...item, activo: permitir, permitir_acceso: permitir } : item),
      } : actual);
      await cargarPanel();
    }
    setActualizandoUsuario(null);
  };

  const cambiarEstadoEmpresa = async (empresa) => {
    const estadoNuevo = empresa.estado === 'suspendida' ? 'activa' : 'suspendida';
    const accion = estadoNuevo === 'activa' ? 'activar' : 'suspender';
    if (!window.confirm(`¿Querés ${accion} la empresa "${empresa.nombre}"?`)) return;
    setActualizandoEmpresa(empresa.id);
    const { error: estadoError } = await supabase.rpc('admin_cambiar_estado_empresa', {
      p_empresa_id: empresa.id,
      p_estado: estadoNuevo,
    });
    if (estadoError) {
      setError(estadoError.message);
    } else {
      await cargarPanel();
      setEmpresaSeleccionada((actual) => actual && actual.empresa?.id === empresa.id
        ? { ...actual, empresa: { ...actual.empresa, estado: estadoNuevo } }
        : actual);
    }
    setActualizandoEmpresa(null);
  };

  const actualizarSuscripcion = async (item, cambios) => {
    const siguiente = { ...item, ...cambios };
    if (!window.confirm(`¿Querés actualizar el plan de ${item.empresa}?`)) return;
    setActualizandoSuscripcion(item.empresa_id);
    const { error: suscripcionError } = await supabase.rpc('admin_actualizar_suscripcion_completa', {
      p_empresa_id: item.empresa_id,
      p_plan: siguiente.plan,
      p_estado: siguiente.estado,
      p_fecha_vencimiento: siguiente.fecha_vencimiento || null,
    });
    if (suscripcionError) setError(suscripcionError.message);
    else await cargarPanel();
    setActualizandoSuscripcion(null);
  };

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-orange-500">Control interno</p>
          <h1 className="mt-1 text-2xl font-black text-slate-900">Panel de desarrollador</h1>
          <p className="mt-1 text-sm text-slate-500">Supervisión general de negocios y cuentas registradas.</p>
        </div>
        <button type="button" onClick={cargarPanel} disabled={cargando} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700 shadow-sm hover:border-orange-300 hover:text-orange-600 disabled:opacity-60">
          <RefreshCw size={16} className={cargando ? 'animate-spin' : ''} /> Actualizar
        </button>
      </div>

      {error && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          <AlertTriangle size={18} className="mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          ['Empresas', resumen?.empresas, Building2],
          ['Usuarios', resumen?.usuarios, Users],
          ['Usuarios activos', resumen?.usuarios_activos, ShieldCheck],
          ['Productos', resumen?.productos, Package],
          ['Clientes', resumen?.clientes, Users],
          ['Ventas registradas', resumen?.ventas, ShoppingCart],
          ['Compras registradas', resumen?.compras, ShoppingBag],
        ].map(([label, value, Icon]) => (
          <div key={label} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-slate-500">{label}</span>
              <span className="rounded-xl bg-orange-50 p-2 text-orange-500"><Icon size={19} /></span>
            </div>
            <strong className="mt-3 block text-3xl font-black text-slate-900">{cargando ? '...' : formatNumber(value)}</strong>
          </div>
        ))}
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4"><div><h2 className="font-bold text-slate-900">Ingresos y ganancias</h2><p className="mt-1 text-xs text-slate-500">Ventas, cobros, pendientes y rentabilidad por cliente.</p></div><div className="flex items-center gap-2 text-xs"><input type="date" value={reporteDesde} onChange={(event) => setReporteDesde(event.target.value)} className="rounded-lg border border-slate-200 px-2 py-2" /><span className="text-slate-400">a</span><input type="date" value={reporteHasta} onChange={(event) => setReporteHasta(event.target.value)} className="rounded-lg border border-slate-200 px-2 py-2" /></div></div>
        <div className="grid grid-cols-1 gap-3 p-5 sm:grid-cols-2 lg:grid-cols-5">{[['Ingresos', reporte?.resumen?.ingresos, 'text-slate-900'], ['Ganancia', reporte?.resumen?.ganancia, 'text-emerald-600'], ['Cobrado', reporte?.resumen?.cobrado, 'text-blue-600'], ['Pendiente', reporte?.resumen?.pendiente, 'text-amber-600'], ['Ventas', reporte?.resumen?.cantidad_ventas, 'text-slate-700']].map(([label, value, color]) => <div key={label} className="rounded-xl border border-slate-100 bg-slate-50 p-3"><span className="text-xs font-semibold text-slate-500">{label}</span><strong className={`mt-1 block text-xl font-black ${color}`}>{value === undefined ? '...' : label === 'Ventas' ? formatNumber(value) : `${Number(value || 0).toLocaleString('es-PY')} Gs`}</strong></div>)}</div>
        <div className="overflow-x-auto border-t border-slate-100"><table className="w-full min-w-[620px] text-left text-sm"><thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="px-5 py-3">Cliente</th><th className="px-5 py-3">Ventas</th><th className="px-5 py-3">Ingresos</th><th className="px-5 py-3">Ganancia</th></tr></thead><tbody className="divide-y divide-slate-100">{(reporte?.clientes || []).map((cliente) => <tr key={cliente.cliente}><td className="px-5 py-3 font-bold text-slate-800">{cliente.cliente}</td><td className="px-5 py-3 text-slate-600">{formatNumber(cliente.ventas)}</td><td className="px-5 py-3 text-slate-600">{Number(cliente.ingresos || 0).toLocaleString('es-PY')} Gs</td><td className="px-5 py-3 font-bold text-emerald-600">{Number(cliente.ganancia || 0).toLocaleString('es-PY')} Gs</td></tr>)}{reporte && reporte.clientes?.length === 0 && <tr><td colSpan="4" className="px-5 py-8 text-center text-sm text-slate-400">No hay ventas en este rango.</td></tr>}</tbody></table></div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4"><div><h2 className="font-bold text-slate-900">Pagos manuales</h2><p className="mt-1 text-xs text-slate-500">Registro de pagos y comprobantes para revisión.</p></div><div className="flex gap-2"><select value={empresaPago} onChange={(event) => setEmpresaPago(event.target.value)} className="rounded-lg border border-slate-200 px-2 py-2 text-xs"><option value="">Seleccionar empresa</option>{empresas.map((empresa) => <option key={empresa.id} value={empresa.id}>{empresa.nombre}</option>)}</select><button type="button" onClick={abrirPago} className="inline-flex items-center gap-1.5 rounded-lg bg-orange-500 px-3 py-2 text-xs font-bold text-white hover:bg-orange-600"><CreditCard size={14} /> Registrar pago</button></div></div>
        <div className="overflow-x-auto"><table className="w-full min-w-[820px] text-left text-sm"><thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="px-5 py-3">Empresa</th><th className="px-5 py-3">Monto</th><th className="px-5 py-3">Método</th><th className="px-5 py-3">Estado</th><th className="px-5 py-3">Fecha</th><th className="px-5 py-3">Comprobante</th></tr></thead><tbody className="divide-y divide-slate-100">{pagos.map((pago) => <tr key={pago.id}><td className="px-5 py-3 font-bold text-slate-800">{pago.empresa}</td><td className="px-5 py-3 text-slate-600">{Number(pago.monto).toLocaleString('es-PY')} {pago.moneda}</td><td className="px-5 py-3 capitalize text-slate-600">{pago.metodo}</td><td className="px-5 py-3"><span className="rounded-full bg-amber-50 px-2 py-1 text-xs font-bold capitalize text-amber-700">{pago.estado}</span></td><td className="px-5 py-3 text-slate-600">{formatDate(pago.fecha_pago)}</td><td className="px-5 py-3">{pago.comprobante_url ? <a href={pago.comprobante_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-bold text-blue-600 hover:underline"><Receipt size={14} /> Abrir</a> : <span className="text-xs text-slate-400">Sin archivo</span>}</td></tr>)}{!cargando && pagos.length === 0 && <tr><td colSpan="6" className="px-5 py-8 text-center text-sm text-slate-400">No hay pagos registrados.</td></tr>}</tbody></table></div>
      </div>

      {mostrarPago && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4 backdrop-blur-sm" onClick={() => setMostrarPago(false)}>
          <div className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between"><h2 className="text-lg font-black text-slate-900">Registrar pago manual</h2><button type="button" onClick={() => setMostrarPago(false)} className="rounded-full p-2 text-slate-400 hover:bg-slate-100"><X size={18} /></button></div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2"><label className="text-xs font-bold text-slate-600">Monto<input type="number" min="0" value={formPago.monto} onChange={(event) => setFormPago({ ...formPago, monto: event.target.value })} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" /></label><label className="text-xs font-bold text-slate-600">Moneda<select value={formPago.moneda} onChange={(event) => setFormPago({ ...formPago, moneda: event.target.value })} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"><option value="PYG">PYG</option><option value="USD">USD</option></select></label><label className="text-xs font-bold text-slate-600">Método<select value={formPago.metodo} onChange={(event) => setFormPago({ ...formPago, metodo: event.target.value })} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"><option value="transferencia">Transferencia</option><option value="efectivo">Efectivo</option><option value="tarjeta">Tarjeta</option><option value="otro">Otro</option></select></label><label className="text-xs font-bold text-slate-600">Fecha<input type="date" value={formPago.fecha} onChange={(event) => setFormPago({ ...formPago, fecha: event.target.value })} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" /></label><label className="text-xs font-bold text-slate-600 sm:col-span-2">Comprobante<input type="file" accept="image/*,.pdf" onChange={(event) => setFormPago({ ...formPago, comprobante: event.target.files?.[0] || null })} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-xs" /></label><label className="text-xs font-bold text-slate-600 sm:col-span-2">Nota<textarea value={formPago.nota} onChange={(event) => setFormPago({ ...formPago, nota: event.target.value })} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" rows="3" /></label></div>
            <div className="mt-5 flex justify-end gap-2"><button type="button" onClick={() => setMostrarPago(false)} className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-bold text-slate-600">Cancelar</button><button type="button" onClick={guardarPago} disabled={guardandoPago} className="rounded-lg bg-orange-500 px-4 py-2 text-sm font-bold text-white hover:bg-orange-600 disabled:opacity-60">{guardandoPago ? 'Guardando...' : 'Guardar pago'}</button></div>
          </div>
        </div>
      )}

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4"><div><h2 className="font-bold text-slate-900">Planes y suscripciones</h2><p className="mt-1 text-xs text-slate-500">Estado comercial y límites actuales por empresa.</p></div><div className="flex gap-2"><select value={filtroPlan} onChange={(event) => setFiltroPlan(event.target.value)} className="rounded-lg border border-slate-200 px-2 py-2 text-xs"><option value="todos">Todos los planes</option><option value="prueba">Prueba</option><option value="basico">Básico</option><option value="profesional">Profesional</option><option value="empresarial">Empresarial</option></select><select value={filtroEstado} onChange={(event) => setFiltroEstado(event.target.value)} className="rounded-lg border border-slate-200 px-2 py-2 text-xs"><option value="todos">Todos los estados</option><option value="prueba">Prueba</option><option value="activa">Activa</option><option value="vencida">Vencida</option><option value="cancelada">Cancelada</option></select></div></div>
        <div className="overflow-x-auto"><table className="w-full min-w-[1060px] text-left text-sm"><thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="px-5 py-3">Empresa</th><th className="px-5 py-3">Plan</th><th className="px-5 py-3">Estado</th><th className="px-5 py-3">Vencimiento</th><th className="px-5 py-3">Uso usuarios</th><th className="px-5 py-3">Uso productos</th><th className="px-5 py-3">Límites</th><th className="px-5 py-3 text-right">Acción</th></tr></thead><tbody className="divide-y divide-slate-100">{suscripcionesVisibles.map((item) => <tr key={item.empresa_id}><td className="px-5 py-3 font-bold text-slate-800">{item.empresa}</td><td className="px-5 py-3"><select value={item.plan} onChange={(event) => setSuscripciones((actual) => actual.map((row) => row.empresa_id === item.empresa_id ? { ...row, plan: event.target.value } : row))} className="rounded-lg border border-slate-200 px-2 py-1 text-xs capitalize"><option value="prueba">Prueba</option><option value="basico">Básico</option><option value="profesional">Profesional</option><option value="empresarial">Empresarial</option></select></td><td className="px-5 py-3"><select value={item.estado} onChange={(event) => setSuscripciones((actual) => actual.map((row) => row.empresa_id === item.empresa_id ? { ...row, estado: event.target.value } : row))} className="rounded-lg border border-slate-200 px-2 py-1 text-xs capitalize"><option value="prueba">Prueba</option><option value="activa">Activa</option><option value="vencida">Vencida</option><option value="cancelada">Cancelada</option></select></td><td className="px-5 py-3"><input type="date" value={item.fecha_vencimiento ? String(item.fecha_vencimiento).slice(0, 10) : ''} onChange={(event) => setSuscripciones((actual) => actual.map((row) => row.empresa_id === item.empresa_id ? { ...row, fecha_vencimiento: event.target.value } : row))} className="rounded-lg border border-slate-200 px-2 py-1 text-xs" /></td><td className={`px-5 py-3 font-semibold ${item.usuarios > item.limite_usuarios ? 'text-red-600' : 'text-slate-600'}`}>{item.usuarios} / {item.limite_usuarios}</td><td className={`px-5 py-3 font-semibold ${item.productos > item.limite_productos ? 'text-red-600' : 'text-slate-600'}`}>{item.productos} / {item.limite_productos}</td><td className="px-5 py-3 text-xs text-slate-500">{item.limite_usuarios} usuarios / {item.limite_productos} productos</td><td className="px-5 py-3 text-right"><button type="button" onClick={() => actualizarSuscripcion(item, {})} disabled={actualizandoSuscripcion === item.empresa_id} className="rounded-lg bg-orange-500 px-3 py-1.5 text-xs font-bold text-white hover:bg-orange-600 disabled:opacity-60">Guardar</button></td></tr>)}{!cargando && suscripcionesVisibles.length === 0 && <tr><td colSpan="8" className="px-5 py-6 text-center text-sm text-slate-400">No hay suscripciones que coincidan con los filtros.</td></tr>}</tbody></table></div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center gap-3 border-b border-slate-100 px-5 py-4">
          <span className="rounded-xl bg-blue-50 p-2 text-blue-600"><History size={18} /></span>
          <div><h2 className="font-bold text-slate-900">Actividad administrativa</h2><p className="mt-1 text-xs text-slate-500">Últimos cambios realizados desde este panel.</p></div>
        </div>
        <div className="divide-y divide-slate-100">
          {actividad.map((evento) => (
            <div key={evento.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 text-sm">
              <div><span className="font-semibold capitalize text-slate-700">{formatAction(evento.accion)}</span><p className="mt-1 text-xs text-slate-500">{formatAuditDetail(evento.detalle) || 'Sin detalles adicionales'}</p></div>
              <span className="text-xs text-slate-500">{new Date(evento.creado_en).toLocaleString('es-PY')}</span>
            </div>
          ))}
          {!cargando && actividad.length === 0 && <p className="px-5 py-6 text-sm text-slate-400">Todavía no hay actividad registrada.</p>}
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <div><h2 className="font-bold text-slate-900">Empresas registradas</h2><p className="mt-1 text-xs text-slate-500">Datos resumidos; el acceso detallado debe mantenerse protegido por RPC.</p></div>
          <input value={busquedaEmpresa} onChange={(event) => setBusquedaEmpresa(event.target.value)} placeholder="Buscar empresa, correo o teléfono" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100 sm:w-72" />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-5 py-3">Empresa</th>
                <th className="px-5 py-3">Contacto</th>
                <th className="px-5 py-3">Usuarios</th>
                <th className="px-5 py-3">Registrada</th>
                <th className="px-5 py-3">Estado</th>
                <th className="px-5 py-3 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {empresasVisibles.map((empresa) => (
                <tr key={empresa.id} className="hover:bg-slate-50">
                  <td className="px-5 py-4 font-bold text-slate-800">{empresa.nombre || '-'}</td>
                  <td className="px-5 py-4 text-slate-600">{empresa.email || empresa.telefono || '-'}</td>
                  <td className="px-5 py-4 text-slate-600">{formatNumber(empresa.usuarios)}</td>
                  <td className="px-5 py-4 text-slate-600">{formatDate(empresa.creado_en)}</td>
                  <td className="px-5 py-4"><span className={`rounded-full px-2.5 py-1 text-xs font-bold ${empresa.estado === 'suspendida' ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-700'}`}>{empresa.estado === 'suspendida' ? 'Suspendida' : 'Activa'}</span></td>
                  <td className="px-5 py-4 text-right">
                    <div className="flex justify-end gap-2">
                      <button type="button" onClick={() => verEmpresa(empresa)} disabled={cargandoDetalle} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-bold text-slate-600 hover:border-orange-300 hover:text-orange-600 disabled:opacity-50"><Eye size={14} /> Ver</button>
                      <button type="button" onClick={() => cambiarEstadoEmpresa(empresa)} disabled={actualizandoEmpresa === empresa.id} className={`rounded-lg border px-2.5 py-1.5 text-xs font-bold ${empresa.estado === 'suspendida' ? 'border-emerald-200 text-emerald-700 hover:bg-emerald-50' : 'border-red-200 text-red-700 hover:bg-red-50'}`}>{empresa.estado === 'suspendida' ? 'Activar' : 'Suspender'}</button>
                    </div>
                  </td>
                </tr>
              ))}
              {!cargando && empresasVisibles.length === 0 && (
                <tr><td colSpan="6" className="px-5 py-10 text-center text-sm text-slate-400">No hay empresas que coincidan con la búsqueda.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {cargandoDetalle && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/30 backdrop-blur-sm">
          <div className="rounded-xl bg-white px-5 py-4 text-sm font-bold text-slate-700 shadow-xl">Cargando empresa...</div>
        </div>
      )}

      {empresaSeleccionada && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4 backdrop-blur-sm" onClick={() => setEmpresaSeleccionada(null)}>
          <div className="w-full max-w-2xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-center justify-between bg-gradient-to-r from-slate-900 to-slate-800 px-5 py-4 text-white">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-orange-300">Ficha de empresa</p>
                <h2 className="mt-1 text-lg font-black">{empresaSeleccionada.empresa?.nombre || '-'}</h2>
              </div>
              <button type="button" onClick={() => setEmpresaSeleccionada(null)} aria-label="Cerrar detalle" className="rounded-full p-2 text-white/70 hover:bg-white/10 hover:text-white"><X size={20} /></button>
            </div>
            <div className="max-h-[70vh] overflow-y-auto p-5">
              {errorDetalle && <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{errorDetalle}</div>}
              {!errorDetalle && (
                <>
                  <div className="mb-5 rounded-xl border border-slate-200 bg-white p-4">
                    <div className="mb-3 flex items-center justify-between">
                      <h3 className="font-bold text-slate-900">Datos básicos</h3>
                      <button type="button" onClick={() => setEditandoEmpresa((actual) => !actual)} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-bold text-slate-600 hover:border-orange-300 hover:text-orange-600"><Pencil size={13} /> {editandoEmpresa ? 'Cancelar' : 'Editar'}</button>
                    </div>
                    {editandoEmpresa ? (
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                        <input className="rounded-lg border border-slate-300 px-3 py-2 text-sm" placeholder="Nombre" value={formEmpresa.nombre} onChange={(event) => setFormEmpresa({ ...formEmpresa, nombre: event.target.value })} />
                        <input className="rounded-lg border border-slate-300 px-3 py-2 text-sm" placeholder="Dirección" value={formEmpresa.direccion} onChange={(event) => setFormEmpresa({ ...formEmpresa, direccion: event.target.value })} />
                        <div className="flex gap-2"><input className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm" placeholder="Teléfono" value={formEmpresa.telefono} onChange={(event) => setFormEmpresa({ ...formEmpresa, telefono: event.target.value })} /><button type="button" onClick={guardarEmpresa} disabled={guardandoEmpresa} className="rounded-lg bg-orange-500 px-3 text-white hover:bg-orange-600 disabled:opacity-60" title="Guardar"><Save size={16} /></button></div>
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-3"><div><span className="block text-xs text-slate-500">Nombre</span><strong className="text-slate-800">{empresaSeleccionada.empresa?.nombre || '-'}</strong></div><div><span className="block text-xs text-slate-500">Dirección</span><strong className="text-slate-800">{empresaSeleccionada.empresa?.direccion || '-'}</strong></div><div><span className="block text-xs text-slate-500">Teléfono</span><strong className="text-slate-800">{empresaSeleccionada.empresa?.telefono || '-'}</strong></div></div>
                    )}
                  </div>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3"><span className="text-xs text-slate-500">Fecha de registro</span><strong className="mt-1 block text-sm text-slate-800">{formatDate(empresaSeleccionada.empresa?.creado_en)}</strong></div>
                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3"><span className="text-xs text-slate-500">Usuarios</span><strong className="mt-1 block text-sm text-slate-800">{formatNumber(empresaSeleccionada.usuarios?.length)}</strong></div>
                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3"><span className="text-xs text-slate-500">Estado</span><strong className={`mt-1 block text-sm ${empresaSeleccionada.empresa?.estado === 'suspendida' ? 'text-red-700' : 'text-emerald-700'}`}>{empresaSeleccionada.empresa?.estado === 'suspendida' ? 'Suspendida' : 'Activa'}</strong></div>
                  </div>
                  <h3 className="mb-3 mt-6 font-bold text-slate-900">Usuarios asociados</h3>
                  <div className="divide-y divide-slate-100 rounded-xl border border-slate-200">
                    {(empresaSeleccionada.usuarios || []).map((usuario) => (
                      <div key={usuario.id} className="flex items-center justify-between gap-3 px-4 py-3">
                        <div><p className="font-bold text-slate-800">{[usuario.nombre, usuario.apellido].filter(Boolean).join(' ') || '-'}</p><p className="text-xs text-slate-500">{usuario.email || 'Sin correo'}</p></div>
                        <div className="flex items-center gap-2">
                          <span className={`rounded-full px-2 py-1 text-[10px] font-bold ${usuario.activo && usuario.permitir_acceso ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>{usuario.activo && usuario.permitir_acceso ? 'Activo' : 'Bloqueado'}</span>
                          <button type="button" onClick={() => cambiarAccesoUsuario(usuario)} disabled={actualizandoUsuario === usuario.id} className={`rounded-lg border p-1.5 transition ${usuario.activo && usuario.permitir_acceso ? 'border-red-200 text-red-600 hover:bg-red-50' : 'border-emerald-200 text-emerald-600 hover:bg-emerald-50'}`} title={usuario.activo && usuario.permitir_acceso ? 'Bloquear usuario' : 'Activar usuario'}>
                            {usuario.activo && usuario.permitir_acceso ? <UserRoundX size={14} /> : <UserRoundCheck size={14} />}
                          </button>
                        </div>
                      </div>
                    ))}
                    {(!empresaSeleccionada.usuarios || empresaSeleccionada.usuarios.length === 0) && <p className="px-4 py-6 text-center text-sm text-slate-400">No hay usuarios asociados.</p>}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
