import { useCallback, useEffect, useState } from 'react';
import { History, RefreshCw } from 'lucide-react';
import { supabase } from './supabaseClient';
import { useEmpresaInfo } from './utils/useEmpresa';

const ESTADO = { recibido: 'Recibido', preparando: 'Preparando', listo: 'Listo', asignado: 'Repartidor asignado', en_camino: 'En camino', entregado: 'Entregado', cancelado: 'Cancelado' };
const EVENTO = { pedido_recibido: 'Pedido recibido', estado_cambiado: 'Estado actualizado', pedido_cancelado: 'Pedido cancelado', repartidor_cambiado: 'Repartidor reasignado' };

export default function HistorialDelivery({ empresaId: empresaIdProp }) {
  const empresa = useEmpresaInfo();
  const empresaId = empresaIdProp || empresa?.id;
  const [eventos, setEventos] = useState([]);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState('');
  const cargar = useCallback(async () => {
    if (!empresaId) return;
    setCargando(true); setError('');
    const { data, error: consultaError } = await supabase.from('pedidos_delivery_eventos').select('*').eq('empresa_id', empresaId).order('creado_en', { ascending: false }).limit(250);
    if (consultaError) { setError(`No se pudo cargar el historial de Delivery. Aplicá database/migration_restaurante_delivery_operacion_segura.sql. ${consultaError.message}`); setEventos([]); setCargando(false); return; }
    const ids = [...new Set((data || []).flatMap((item) => [item.repartidor_anterior_id, item.repartidor_nuevo_id, item.usuario_id]).filter(Boolean))];
    const { data: usuarios, error: usuariosError } = ids.length ? await supabase.from('usuarios').select('auth_user_id,nombre,apellido').eq('empresa_id', empresaId).in('auth_user_id', ids) : { data: [], error: null };
    if (usuariosError) setError(`No se pudieron resolver los usuarios del historial: ${usuariosError.message}`);
    const nombres = new Map((usuarios || []).map((u) => [u.auth_user_id, [u.nombre, u.apellido].filter(Boolean).join(' ')]));
    setEventos((data || []).map((item) => ({ ...item, usuario: nombres.get(item.usuario_id) || 'Sistema', repartidorAnterior: nombres.get(item.repartidor_anterior_id), repartidorNuevo: nombres.get(item.repartidor_nuevo_id) })));
    setCargando(false);
  }, [empresaId]);
  useEffect(() => { cargar(); }, [cargar]);

  return <section className="space-y-3 rounded-xl border border-indigo-200 bg-white p-4">
    <header className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="flex items-center gap-2 font-black text-indigo-950"><History size={17}/>Historial de Delivery</h3><p className="text-sm text-slate-500">Recepción, cambios de estado, reasignaciones y cancelaciones con motivo.</p></div><button type="button" onClick={cargar} disabled={cargando} className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-bold"><RefreshCw size={14} className={cargando ? 'animate-spin' : ''}/>Actualizar</button></header>
    {error && <p role="alert" className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">{error}</p>}
    {cargando ? <p className="p-6 text-center text-sm text-slate-500">Cargando historial…</p> : eventos.length ? <div className="max-h-[60vh] space-y-2 overflow-y-auto">{eventos.map((item) => <article key={item.id} className="rounded-lg border border-slate-200 p-3"><div className="flex flex-wrap justify-between gap-2"><p className="font-bold text-slate-900">{EVENTO[item.evento] || item.evento} · pedido {item.numero_pedido}</p><time className="text-xs text-slate-500">{new Date(item.creado_en).toLocaleString('es-PY')}</time></div><p className="mt-1 text-sm text-slate-600">{item.estado_anterior ? `${ESTADO[item.estado_anterior] || item.estado_anterior} → ` : ''}{ESTADO[item.estado_nuevo] || item.estado_nuevo || ''} · por {item.usuario}</p>{(item.repartidorAnterior || item.repartidorNuevo) && <p className="mt-1 text-sm text-slate-600">Repartidor: {item.repartidorAnterior || 'Sin asignar'} → {item.repartidorNuevo || 'Sin asignar'}</p>}{item.motivo && <p className="mt-2 rounded bg-rose-50 p-2 text-sm text-rose-900">Motivo: {item.motivo}</p>}</article>)}</div> : !error && <p className="rounded-lg border border-dashed p-6 text-center text-sm text-slate-500">Todavía no hay eventos de Delivery.</p>}
  </section>;
}
