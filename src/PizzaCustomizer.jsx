import { useMemo, useState } from 'react';
import { Plus, X } from 'lucide-react';

const moneda = (valor) => `${Number(valor || 0).toLocaleString('es-PY')} Gs`;

export default function PizzaCustomizer({ pizza, onClose, onConfirm }) {
  const [presentacionId, setPresentacionId] = useState(pizza?.presentaciones?.find((x) => x.disponible)?.id || '');
  const [adicionales, setAdicionales] = useState([]);
  const [mitadMitad, setMitadMitad] = useState(false);
  const [observaciones, setObservaciones] = useState('');
  const presentacion = pizza?.presentaciones?.find((x) => x.id === presentacionId);
  const precioBase = Number(presentacion?.precio_promocional ?? presentacion?.precio_venta) || 0;
  const precioExtras = useMemo(() => (pizza?.grupos || []).flatMap((g) => g.opciones || []).filter((o) => adicionales.includes(o.id)).reduce((suma, o) => suma + Number(o.precio || 0), 0), [pizza, adicionales]);
  const total = precioBase + precioExtras;
  const cambiarAdicional = (grupo, opcion, checked) => {
    const elegidosGrupo = adicionales.filter((id) => grupo.opciones.some((x) => x.id === id));
    if (checked && elegidosGrupo.length >= Number(grupo.maximo || 1)) return;
    if (!checked && grupo.obligatorio && elegidosGrupo.length <= Number(grupo.minimo || 1)) return;
    setAdicionales((actuales) => checked ? [...new Set([...actuales, opcion.id])] : actuales.filter((id) => id !== opcion.id));
  };
  const confirmar = () => {
    if (!presentacion || !presentacion.disponible) return;
    for (const grupo of pizza.grupos || []) {
      const cantidad = adicionales.filter((id) => grupo.opciones.some((o) => o.id === id)).length;
      if (grupo.activo && (cantidad < Number(grupo.minimo || 0) || (grupo.obligatorio && cantidad === 0))) return;
    }
    onConfirm({
      precio: total,
      configuracion_pizza: { presentacion_id: presentacion.id, presentacion_nombre: presentacion.nombre, adicionales, adicionales_nombre: adicionales.map((id) => (pizza.grupos || []).flatMap((g) => g.opciones || []).find((o) => o.id === id)?.nombre).filter(Boolean).join(', '), mitad_mitad: mitadMitad, observaciones: observaciones.trim() },
      nombre: `${pizza.nombre} · ${presentacion.nombre}${adicionales.length ? ` · ${adicionales.map((id) => (pizza.grupos || []).flatMap((g) => g.opciones || []).find((o) => o.id === id)?.nombre).filter(Boolean).join(', ')}` : ''}${observaciones.trim() ? ` · Nota: ${observaciones.trim()}` : ''}`,
    });
  };
  const gruposMitad = (pizza?.grupos || []).filter((g) => g.activo && g.permite_mitad_mitad);

  return <div className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-950/60 p-3 backdrop-blur-sm" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section role="dialog" aria-modal="true" aria-labelledby="pizza-customizer-title" className="max-h-[92dvh] w-full max-w-xl overflow-y-auto rounded-2xl bg-white shadow-2xl">
    <header className="sticky top-0 z-10 flex items-start justify-between border-b bg-white px-5 py-4"><div><p className="text-xs font-bold uppercase tracking-widest text-orange-600">Personalizar pizza</p><h2 id="pizza-customizer-title" className="mt-1 text-xl font-black text-slate-900">{pizza.nombre}</h2><p className="text-xs text-slate-500">Elegí un tamaño y los adicionales.</p></div><button type="button" onClick={onClose} aria-label="Cerrar" className="rounded-lg p-2 text-slate-400 hover:bg-slate-100"><X size={19}/></button></header>
    <div className="space-y-5 p-5">
      <div><h3 className="mb-2 text-sm font-bold text-slate-800">Tamaño</h3><div className="grid gap-2 sm:grid-cols-2">{(pizza.presentaciones || []).filter((x) => x.disponible).map((item) => <label key={item.id} className={`flex cursor-pointer items-center justify-between rounded-xl border p-3 ${presentacionId === item.id ? 'border-orange-400 bg-orange-50 ring-1 ring-orange-300' : 'border-slate-200'}`}><span><input type="radio" name="pizza-presentacion" checked={presentacionId === item.id} onChange={() => setPresentacionId(item.id)} className="mr-2 accent-orange-600"/><strong>{item.nombre}</strong>{item.diametro_cm && <small className="ml-1 text-slate-500">{item.diametro_cm} cm</small>}</span><span className="text-sm font-bold">{moneda(item.precio_promocional ?? item.precio_venta)}</span></label>)}</div></div>
      {(pizza.grupos || []).filter((g) => g.activo).map((grupo) => <fieldset key={grupo.id} className="space-y-2"><legend className="mb-2 text-sm font-bold text-slate-800">{grupo.nombre}{grupo.obligatorio && <span className="ml-1 text-rose-600">*</span>}<span className="ml-2 text-xs font-normal text-slate-500">Elegí hasta {grupo.maximo}</span></legend><div className="grid gap-2 sm:grid-cols-2">{grupo.opciones.filter((o) => o.activo).map((opcion) => <label key={opcion.id} className="flex cursor-pointer items-center justify-between rounded-lg border border-slate-200 px-3 py-2 text-sm"><span><input type="checkbox" checked={adicionales.includes(opcion.id)} onChange={(event) => cambiarAdicional(grupo, opcion, event.target.checked)} className="mr-2 accent-orange-600"/>{opcion.nombre}</span><span className="text-xs font-semibold text-slate-600">{Number(opcion.precio)>0?`+ ${moneda(opcion.precio)}`:'Sin costo'}</span></label>)}</div></fieldset>)}
      {gruposMitad.length > 0 && <label className="flex items-center gap-2 rounded-lg border border-orange-200 bg-orange-50 p-3 text-sm font-semibold"><input type="checkbox" checked={mitadMitad} onChange={(event) => setMitadMitad(event.target.checked)} className="accent-orange-600"/>Preparar mitad y mitad (requiere dos sabores)</label>}
      <label className="block text-sm font-semibold text-slate-700">Observaciones para cocina<textarea maxLength="300" value={observaciones} onChange={(event) => setObservaciones(event.target.value)} rows="2" className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2.5 font-normal" placeholder="Sin cebolla, masa fina…"/></label>
      <div className="flex items-center justify-between border-t pt-4"><span className="font-bold text-slate-600">Precio de esta pizza</span><strong className="text-xl">{moneda(total)}</strong></div>
    </div>
    <footer className="sticky bottom-0 flex justify-end gap-2 border-t bg-slate-50 p-4"><button type="button" onClick={onClose} className="rounded-lg border bg-white px-4 py-2 text-sm font-bold text-slate-600">Cancelar</button><button type="button" disabled={!presentacion} onClick={confirmar} className="inline-flex items-center gap-2 rounded-lg bg-orange-600 px-5 py-2.5 text-sm font-bold text-white disabled:opacity-50"><Plus size={16}/>Agregar al pedido</button></footer>
  </section></div>;
}
