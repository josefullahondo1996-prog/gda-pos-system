import { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshCw, Truck } from 'lucide-react';
import { supabase } from './supabaseClient';
import { useEmpresaInfo } from './utils/useEmpresa';

const ESTADOS = ['Pendiente', 'Preparando', 'En tránsito', 'Entregado', 'Fallido', 'Cancelado'];
const fechaLocal = () => {
  const ahora = new Date();
  return `${ahora.getFullYear()}-${String(ahora.getMonth() + 1).padStart(2, '0')}-${String(ahora.getDate()).padStart(2, '0')}`;
};
const moneda = (monto) => `Gs ${Math.round(Number(monto) || 0).toLocaleString('es-PY')}`;
const etiquetaFecha = (fecha) => fecha ? new Date(fecha).toLocaleDateString('es-PY') : '—';

export default function Envios() {
  const { id: empresaId } = useEmpresaInfo();
  const [envios, setEnvios] = useState([]);
  const [ventas, setVentas] = useState([]);
  const [busqueda, setBusqueda] = useState('');
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');
  const [modal, setModal] = useState(false);
  const [ventaId, setVentaId] = useState('');
  const [direccion, setDireccion] = useState('');
  const [contacto, setContacto] = useState('');
  const [transportista, setTransportista] = useState('');
  const [codigo, setCodigo] = useState('');
  const [fechaEntrega, setFechaEntrega] = useState('');
  const [notas, setNotas] = useState('');

  const cargar = useCallback(async () => {
    if (!empresaId) return;
    setCargando(true); setError('');
    const [resEnvios, resVentas] = await Promise.all([
      supabase.from('envios_ventas').select('*').eq('empresa_id', empresaId).order('creado_en', { ascending: false }).limit(3000),
      supabase.from('ventas').select('id,cliente,total,fecha,estado_pago,nota_venta').eq('empresa_id', empresaId).order('fecha', { ascending: false }).limit(5000),
    ]);
    if (resEnvios.error) {
      const faltaMigracion = resEnvios.error.code === '42P01' || resEnvios.error.code === 'PGRST205';
      setError(faltaMigracion ? 'Falta aplicar database/migration_envios.sql en el proyecto Supabase conectado.' : `No se pudieron cargar los envíos: ${resEnvios.error.message}`);
      setEnvios([]);
    } else setEnvios(resEnvios.data || []);
    if (resVentas.error) setError((anterior) => [anterior, `No se pudieron cargar las ventas: ${resVentas.error.message}`].filter(Boolean).join(' '));
    else setVentas((resVentas.data || []).filter((venta) => String(venta.estado_pago || '').toLowerCase() !== 'cotizacion'));
    setCargando(false);
  }, [empresaId]);

  useEffect(() => { cargar(); }, [cargar]);

  const ventaPorId = useMemo(() => new Map(ventas.map((venta) => [String(venta.id), venta])), [ventas]);
  const ventasUsadas = useMemo(() => new Set(envios.map((envio) => String(envio.venta_id))), [envios]);
  const ventasDisponibles = ventas.filter((venta) => !ventasUsadas.has(String(venta.id)));
  const filtrados = envios.filter((envio) => {
    const venta = ventaPorId.get(String(envio.venta_id));
    return `${envio.referencia_venta || ''} ${envio.cliente || ''} ${envio.transportista || ''} ${envio.codigo_seguimiento || ''} ${envio.estado || ''}`.toLowerCase().includes(busqueda.trim().toLowerCase())
      || `${venta?.numero_factura || ''} ${venta?.cliente || ''}`.toLowerCase().includes(busqueda.trim().toLowerCase());
  });

  const nuevo = () => {
    if (!ventasDisponibles.length) { setError('No hay ventas sin envío asociado. Registra la venta en el POS y vuelve a intentarlo.'); return; }
    setVentaId(String(ventasDisponibles[0].id)); setDireccion(''); setContacto(''); setTransportista(''); setCodigo(''); setFechaEntrega(''); setNotas(''); setError(''); setModal(true);
  };

  const guardar = async (event) => {
    event.preventDefault();
    const venta = ventaPorId.get(String(ventaId));
    if (!venta) return setError('Selecciona una venta válida.');
    if (!direccion.trim()) return setError('Ingresa la dirección de entrega.');
    setGuardando(true); setError('');
    const { error: errorGuardar } = await supabase.from('envios_ventas').insert([{
      empresa_id: empresaId,
      venta_id: venta.id,
      referencia_venta: venta.numero_factura || String(venta.id),
      cliente: venta.cliente || 'Cliente Ocasional',
      direccion: direccion.trim(), contacto: contacto.trim() || null,
      transportista: transportista.trim() || null,
      codigo_seguimiento: codigo.trim() || null,
      estado: 'Pendiente', fecha_entrega: fechaEntrega || null,
      notas: notas.trim() || null,
    }]);
    if (errorGuardar) setError(`No se pudo crear el envío: ${errorGuardar.message}`);
    else { setModal(false); await cargar(); }
    setGuardando(false);
  };

  const cambiarEstado = async (envio, estado) => {
    const { error: errorEstado } = await supabase.from('envios_ventas').update({ estado, actualizado_en: new Date().toISOString() })
      .eq('id', envio.id).eq('empresa_id', empresaId);
    if (errorEstado) setError(`No se pudo actualizar el envío: ${errorEstado.message}`);
    else setEnvios((anterior) => anterior.map((fila) => fila.id === envio.id ? { ...fila, estado, actualizado_en: new Date().toISOString() } : fila));
  };

  return <main className="mx-auto w-full max-w-7xl space-y-5 p-4 md:p-6">
    <header className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="flex items-center gap-2 text-2xl font-bold text-slate-900"><Truck size={24} /> Envíos</h1><p className="mt-1 text-sm text-slate-500">Seguimiento de entregas asociado a ventas registradas.</p></div><div className="flex gap-2"><button onClick={cargar} className="inline-flex items-center gap-2 rounded-lg border bg-white px-3 py-2 text-sm font-semibold"><RefreshCw size={16} /> Actualizar</button><button onClick={nuevo} className="rounded-lg bg-orange-500 px-4 py-2 text-sm font-bold text-white hover:bg-orange-600">+ Nuevo envío</button></div></header>
    {error && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</div>}
    <section className="overflow-hidden rounded-xl border bg-white"><div className="flex flex-wrap items-center justify-between gap-3 border-b p-4"><h2 className="font-semibold">Seguimiento de envíos</h2><input aria-label="Buscar envíos" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Venta, cliente, transportista o seguimiento..." className="w-full rounded-lg border px-3 py-2 text-sm sm:max-w-sm" /></div><div className="overflow-x-auto"><table className="w-full min-w-[1000px] text-left text-sm"><thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="p-3">Venta</th><th className="p-3">Cliente / destino</th><th className="p-3">Transportista</th><th className="p-3">Seguimiento</th><th className="p-3">Entrega prevista</th><th className="p-3">Total venta</th><th className="p-3">Estado</th></tr></thead><tbody className="divide-y">{cargando ? <tr><td colSpan="7" className="p-10 text-center text-slate-500">Cargando envíos…</td></tr> : filtrados.length ? filtrados.map((envio) => { const venta = ventaPorId.get(String(envio.venta_id)); return <tr key={envio.id} className="align-top hover:bg-slate-50"><td className="p-3"><b>{envio.referencia_venta || venta?.numero_factura || String(envio.venta_id).slice(0, 8)}</b><div className="text-xs text-slate-500">{etiquetaFecha(venta?.fecha)}</div></td><td className="p-3"><b>{envio.cliente}</b><div className="max-w-xs text-xs text-slate-500">{envio.direccion}{envio.contacto ? ` · ${envio.contacto}` : ''}</div></td><td className="p-3">{envio.transportista || '—'}</td><td className="p-3">{envio.codigo_seguimiento || '—'}</td><td className="p-3">{etiquetaFecha(envio.fecha_entrega)}</td><td className="whitespace-nowrap p-3">{moneda(venta?.total)}</td><td className="p-3"><select aria-label={`Estado de envío ${envio.referencia_venta || envio.id}`} value={envio.estado} onChange={(e) => cambiarEstado(envio, e.target.value)} className="rounded-lg border bg-white px-2 py-1.5 text-xs font-semibold"><option value={envio.estado}>{envio.estado}</option>{ESTADOS.filter((estado) => estado !== envio.estado).map((estado) => <option key={estado}>{estado}</option>)}</select></td></tr>; }) : <tr><td colSpan="7" className="p-10 text-center text-slate-500">{busqueda ? 'No se encontraron envíos.' : 'Todavía no hay envíos. Crea uno desde una venta registrada.'}</td></tr>}</tbody></table></div></section>
    <p className="text-xs text-slate-500">El seguimiento logístico no altera el estado de pago, la caja ni las existencias de la venta.</p>
    {modal && <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/50 p-3"><form onSubmit={guardar} role="dialog" aria-modal="true" aria-labelledby="envio-title" className="max-h-[94vh] w-full max-w-2xl space-y-4 overflow-y-auto rounded-xl bg-white p-5 shadow-2xl"><div className="flex items-center justify-between"><h2 id="envio-title" className="text-lg font-bold">Nuevo envío</h2><button type="button" onClick={() => setModal(false)} className="rounded px-3 py-2 text-slate-500 hover:bg-slate-100" aria-label="Cerrar">✕</button></div>{error && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</div>}<label className="block text-sm font-semibold">Venta<select required value={ventaId} onChange={(e) => setVentaId(e.target.value)} className="mt-1 w-full rounded-lg border px-3 py-2 font-normal">{ventasDisponibles.map((venta) => <option key={venta.id} value={venta.id}>{venta.numero_factura || String(venta.id).slice(0, 8)} · {venta.cliente || 'Cliente Ocasional'} · {moneda(venta.total)} · {etiquetaFecha(venta.fecha)}</option>)}</select></label><label className="block text-sm font-semibold">Dirección de entrega<input required value={direccion} onChange={(e) => setDireccion(e.target.value)} className="mt-1 w-full rounded-lg border px-3 py-2 font-normal" placeholder="Dirección, ciudad y referencia" /></label><div className="grid gap-3 sm:grid-cols-2"><label className="text-sm font-semibold">Teléfono / contacto<input value={contacto} onChange={(e) => setContacto(e.target.value)} className="mt-1 w-full rounded-lg border px-3 py-2 font-normal" /></label><label className="text-sm font-semibold">Fecha prevista<input type="date" min={fechaLocal()} value={fechaEntrega} onChange={(e) => setFechaEntrega(e.target.value)} className="mt-1 w-full rounded-lg border px-3 py-2 font-normal" /></label><label className="text-sm font-semibold">Transportista<input value={transportista} onChange={(e) => setTransportista(e.target.value)} className="mt-1 w-full rounded-lg border px-3 py-2 font-normal" /></label><label className="text-sm font-semibold">Código de seguimiento<input value={codigo} onChange={(e) => setCodigo(e.target.value)} className="mt-1 w-full rounded-lg border px-3 py-2 font-normal" /></label></div><label className="block text-sm font-semibold">Notas<textarea rows={2} value={notas} onChange={(e) => setNotas(e.target.value)} className="mt-1 w-full rounded-lg border px-3 py-2 font-normal" /></label><div className="flex justify-end gap-2"><button type="button" onClick={() => setModal(false)} className="rounded-lg border px-4 py-2 text-sm">Cancelar</button><button disabled={guardando} className="rounded-lg bg-orange-500 px-4 py-2 text-sm font-bold text-white disabled:opacity-60">{guardando ? 'Guardando…' : 'Crear envío'}</button></div></form></div>}
  </main>;
}
