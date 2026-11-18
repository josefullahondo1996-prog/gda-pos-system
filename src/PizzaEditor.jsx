import { Plus, Trash2 } from 'lucide-react';
import { cantidadVisible } from './utils/cantidadProducto';

const cantidadInternaIngrediente = (cantidad, unidad) => {
  const u = String(unidad || '').trim().toLowerCase();
  const valor = Number(cantidad) || 0;
  return ['g', 'gr', 'gramo', 'gramos'].includes(u) ? valor / 1000 : valor;
};

const idNuevo = () => crypto.randomUUID();
export const nuevaPizzaConfig = () => ({
  activo: true, destacado: false, visible_catalogo: true, permitir_mitad_mitad: true, max_sabores: 2,
  presentaciones: ['Personal', 'Mediana', 'Grande', 'Familiar'].map((nombre, orden) => ({ id: idNuevo(), nombre, diametro_cm: '', precio_venta: '', costo_elaboracion: 0, precio_promocional: '', disponible: true, orden, ingredientes: [] })),
  grupos: [{ id: idNuevo(), nombre: 'Condimentos y extras', minimo: 0, maximo: 8, obligatorio: false, permite_mitad_mitad: false, activo: true, orden: 0, opciones: ['Queso extra', 'Pepperoni', 'Jamón', 'Aceitunas', 'Champiñones', 'Borde relleno'].map((nombre, orden) => ({ id: idNuevo(), nombre, precio: 0, activo: true, orden, ingredientes: [] })) }],
  fotos: [], disponibilidad: [],
});

const MENU_EJEMPLO = [
  { nombre: 'Muzzarella', descripcion: 'Salsa de tomate, mozzarella y orégano.', precios: [45000, 70000, 95000, 120000], ingredientes: 'Masa, salsa de tomate, mozzarella y orégano' },
  { nombre: 'Napolitana', descripcion: 'Mozzarella, tomate fresco, ajo y orégano.', precios: [50000, 78000, 105000, 132000], ingredientes: 'Masa, salsa, mozzarella, tomate fresco, ajo y orégano' },
  { nombre: 'Pepperoni', descripcion: 'Mozzarella y pepperoni sobre salsa de tomate.', precios: [55000, 85000, 115000, 145000], ingredientes: 'Masa, salsa, mozzarella y pepperoni' },
  { nombre: 'Hawaiana', descripcion: 'Mozzarella, jamón y ananá.', precios: [52000, 82000, 110000, 138000], ingredientes: 'Masa, salsa, mozzarella, jamón y ananá' },
  { nombre: 'Cuatro quesos', descripcion: 'Mozzarella, parmesano, provolone y queso azul.', precios: [58000, 90000, 122000, 154000], ingredientes: 'Masa, salsa, mozzarella, parmesano, provolone y queso azul' },
  { nombre: 'Vegetariana', descripcion: 'Mozzarella, morrón, cebolla, aceitunas y champiñones.', precios: [52000, 82000, 110000, 138000], ingredientes: 'Masa, salsa, mozzarella, morrón, cebolla, aceitunas y champiñones' },
];

export const crearPizzaEjemplo = (ejemplo) => {
  const base = nuevaPizzaConfig();
  return {
    ...base,
    presentaciones: base.presentaciones.map((presentacion, index) => ({ ...presentacion, precio_venta: ejemplo.precios[index], ingredientes: [], ingredientes_sugeridos: ejemplo.ingredientes })),
    grupos: [{ ...base.grupos[0], opciones: base.grupos[0].opciones.map((opcion) => ({ ...opcion, precio: ({ 'Queso extra': 10000, Pepperoni: 12000, Jamón: 10000, Aceitunas: 7000, Champiñones: 9000, 'Borde relleno': 15000 })[opcion.nombre] || 0 })) }],
  };
};

const Campo = ({ label, children }) => <label className="block text-xs font-semibold text-slate-600">{label}{children}</label>;

export default function PizzaEditor({ value, onChange, productos = [], unidades = [], onAplicarEjemplo }) {
  const config = value || nuevaPizzaConfig();
  const update = (patch) => onChange({ ...config, ...patch });
  const ingredientesValidos = productos.filter((p) => p.activo !== false && p.administra_stock !== false && p.tipo_producto !== 'Variable');
  const cambiarPresentacion = (id, patch) => update({ presentaciones: config.presentaciones.map((p) => p.id === id ? { ...p, ...patch } : p) });
  const cambiarIngrediente = (presentacionId, ingredienteId, patch) => update({ presentaciones: config.presentaciones.map((p) => {
    if (p.id !== presentacionId) return p;
    const ingredientes = p.ingredientes.map((i) => i.id === ingredienteId ? { ...i, ...patch } : i);
    const costo = ingredientes.reduce((suma, i) => suma + (Number(ingredientesValidos.find((producto) => String(producto.id) === String(i.producto_id))?.precio_compra) || 0) * cantidadInternaIngrediente(i.cantidad, i.unidad), 0);
    return { ...p, ingredientes, costo_elaboracion: Number(costo.toFixed(2)) };
  }) });
  const agregarIngrediente = (presentacionId) => cambiarPresentacion(presentacionId, { ingredientes: [...(config.presentaciones.find((p) => p.id === presentacionId)?.ingredientes || []), { id: idNuevo(), producto_id: '', unidad: '', cantidad: 1 }] });
  const cambiarGrupo = (id, patch) => update({ grupos: config.grupos.map((g) => g.id === id ? { ...g, ...patch } : g) });
  const cambiarOpcion = (grupoId, opcionId, patch) => update({ grupos: config.grupos.map((g) => g.id === grupoId ? { ...g, opciones: g.opciones.map((o) => o.id === opcionId ? { ...o, ...patch } : o) } : g) });
  const agregarIngredienteOpcion = (grupoId, opcionId) => update({ grupos: config.grupos.map((g) => g.id === grupoId ? { ...g, opciones: g.opciones.map((o) => o.id === opcionId ? { ...o, ingredientes: [...(o.ingredientes || []), { id: idNuevo(), producto_id: '', unidad: '', cantidad: 1 }] } : o) } : g) });

  return <div className="space-y-5 border-t border-orange-100 p-5 sm:p-6">
    <section className="rounded-xl border border-orange-200 bg-orange-50/60 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3"><div><h4 className="font-bold text-slate-800">Menú de ejemplo</h4><p className="mt-1 text-xs text-slate-600">Precios demostrativos en guaraníes. Elegí una pizza para cargarla en este producto.</p></div><span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-bold text-orange-700">6 recetas modelo</span></div>
      <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{MENU_EJEMPLO.map((ejemplo) => <button key={ejemplo.nombre} type="button" onClick={() => onAplicarEjemplo?.({ ...ejemplo, config: crearPizzaEjemplo(ejemplo) })} className="rounded-lg border border-orange-100 bg-white p-3 text-left transition hover:border-orange-300 hover:bg-orange-50"><span className="block text-sm font-bold text-slate-800">{ejemplo.nombre}</span><span className="mt-1 block text-xs text-slate-500">Personal desde {ejemplo.precios[0].toLocaleString('es-PY')} Gs</span><span className="mt-1 block text-[11px] text-slate-500">Receta sugerida: {ejemplo.ingredientes}</span></button>)}</div>
      <p className="mt-3 rounded-lg bg-white/80 p-2.5 text-xs text-amber-900">Después de cargarla, vinculá cada ingrediente sugerido con productos reales del inventario. No se podrá guardar activa hasta completar esas recetas.</p>
    </section>
    <div className="grid gap-3 sm:grid-cols-2">
      <label className="flex items-center gap-2 rounded-lg border p-3 text-sm"><input type="checkbox" checked={config.activo} onChange={(e) => update({ activo: e.target.checked })}/>Pizza activa</label>
      <label className="flex items-center gap-2 rounded-lg border p-3 text-sm"><input type="checkbox" checked={config.destacado} onChange={(e) => update({ destacado: e.target.checked })}/>Producto destacado</label>
      <label className="flex items-center gap-2 rounded-lg border p-3 text-sm"><input type="checkbox" checked={config.visible_catalogo} onChange={(e) => update({ visible_catalogo: e.target.checked })}/>Publicar en el catálogo digital</label>
      <label className="flex items-center gap-2 rounded-lg border p-3 text-sm"><input type="checkbox" checked={config.permitir_mitad_mitad} onChange={(e) => update({ permitir_mitad_mitad: e.target.checked })}/>Permitir mitad y mitad</label>
      <Campo label="Máximo de sabores por pizza"><input type="number" min="1" max="8" value={config.max_sabores} onChange={(e) => update({ max_sabores: Number(e.target.value) })} className="mt-1 w-full rounded-lg border p-2.5 text-sm"/></Campo>
    </div>

    <section className="space-y-3 rounded-xl border border-slate-200 p-4">
      <header className="flex flex-wrap items-center justify-between gap-2"><div><h4 className="font-bold text-slate-800">Tamaños, precios y recetas</h4><p className="text-xs text-slate-500">Cada tamaño tiene precio, costo y consumo de ingredientes propios.</p></div><button type="button" onClick={() => update({ presentaciones: [...config.presentaciones, { id: idNuevo(), nombre: '', diametro_cm: '', precio_venta: '', costo_elaboracion: 0, precio_promocional: '', disponible: true, orden: config.presentaciones.length, ingredientes: [] }] })} className="inline-flex items-center gap-1 rounded-lg bg-orange-50 px-3 py-2 text-xs font-bold text-orange-700"><Plus size={15}/>Tamaño personalizado</button></header>
      {config.presentaciones.map((p) => <article key={p.id} className="space-y-3 rounded-lg border bg-slate-50 p-3">
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5"><Campo label="Nombre"><input value={p.nombre} maxLength="60" onChange={(e)=>cambiarPresentacion(p.id,{nombre:e.target.value})} placeholder="Personal, Mediana…" className="mt-1 w-full rounded border p-2 text-sm"/></Campo><Campo label="Diámetro (cm)"><input type="number" min="1" max="100" step="0.5" value={p.diametro_cm ?? ''} onChange={(e)=>cambiarPresentacion(p.id,{diametro_cm:e.target.value})} className="mt-1 w-full rounded border p-2 text-sm"/></Campo><Campo label="Precio de venta (Gs)"><input type="number" min="0" value={p.precio_venta} onChange={(e)=>cambiarPresentacion(p.id,{precio_venta:e.target.value})} className="mt-1 w-full rounded border p-2 text-sm"/></Campo><Campo label="Precio promocional (Gs)"><input type="number" min="0" value={p.precio_promocional ?? ''} onChange={(e)=>cambiarPresentacion(p.id,{precio_promocional:e.target.value})} className="mt-1 w-full rounded border p-2 text-sm"/></Campo><div><span className="block text-xs font-semibold text-slate-600">Costo receta</span><span className="mt-1 block rounded border bg-white p-2 text-sm">{Number(p.costo_elaboracion || 0).toLocaleString('es-PY')} Gs</span></div></div>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={p.disponible} onChange={(e)=>cambiarPresentacion(p.id,{disponible:e.target.checked})}/>Disponible para vender</label>
        <div className="space-y-2"><div className="flex items-center justify-between"><h5 className="text-xs font-bold text-slate-700">Receta e ingredientes</h5><button type="button" onClick={()=>agregarIngrediente(p.id)} className="text-xs font-bold text-orange-700">+ Ingrediente</button></div>{p.ingredientes_sugeridos && <p className="rounded bg-orange-50 p-2 text-xs text-orange-900">Sugerencia del ejemplo: {p.ingredientes_sugeridos}</p>}{p.ingredientes.map((i)=><div key={i.id} className="grid gap-2 sm:grid-cols-[1fr_1fr_120px_auto]"><select value={i.producto_id} onChange={(e)=>{const producto=ingredientesValidos.find((x)=>String(x.id)===e.target.value);cambiarIngrediente(p.id,i.id,{producto_id:e.target.value,unidad:producto?.unidad || ''});}} className="rounded border bg-white p-2 text-sm"><option value="">Seleccionar ingrediente de inventario</option>{ingredientesValidos.map((x)=><option key={x.id} value={x.id}>{x.nombre} · stock {cantidadVisible(x.stock_actual,x.unidad)} {x.unidad || ''}</option>)}</select><select value={i.unidad || ''} onChange={(e)=>cambiarIngrediente(p.id,i.id,{unidad:e.target.value})} className="rounded border bg-white p-2 text-sm"><option value="">Unidad del ingrediente</option>{unidades.map((u)=><option key={u.id} value={u.nombre}>{u.nombre}</option>)}</select><input type="number" min="0.0001" step="0.0001" value={i.cantidad} onChange={(e)=>cambiarIngrediente(p.id,i.id,{cantidad:e.target.value})} className="rounded border p-2 text-sm" aria-label="Cantidad del ingrediente"/><button type="button" onClick={()=>cambiarPresentacion(p.id,{ingredientes:p.ingredientes.filter((x)=>x.id!==i.id)})} className="rounded p-2 text-rose-600" aria-label="Quitar ingrediente"><Trash2 size={16}/></button></div>)}{p.ingredientes.length===0&&<p className="text-xs text-amber-700">Agregá los ingredientes para calcular el costo y descontarlos al confirmar la venta.</p>}</div>
      </article>)}
    </section>

    <section className="space-y-3 rounded-xl border border-slate-200 p-4">
      <header className="flex items-center justify-between"><div><h4 className="font-bold text-slate-800">Grupos de adicionales</h4><p className="text-xs text-slate-500">Condimentos, bordes, masas y otras opciones con receta opcional.</p></div><button type="button" onClick={()=>update({grupos:[...config.grupos,{id:idNuevo(),nombre:'',minimo:0,maximo:1,obligatorio:false,permite_mitad_mitad:false,activo:true,orden:config.grupos.length,opciones:[]}]})} className="text-xs font-bold text-orange-700">+ Grupo</button></header>
      {config.grupos.map((g)=><article key={g.id} className="space-y-3 rounded-lg border bg-slate-50 p-3"><div className="grid gap-2 sm:grid-cols-4"><Campo label="Grupo"><input value={g.nombre} onChange={(e)=>cambiarGrupo(g.id,{nombre:e.target.value})} className="mt-1 w-full rounded border p-2 text-sm" placeholder="Condimentos"/></Campo><Campo label="Mínimo"><input type="number" min="0" max="20" value={g.minimo} onChange={(e)=>cambiarGrupo(g.id,{minimo:Number(e.target.value)})} className="mt-1 w-full rounded border p-2 text-sm"/></Campo><Campo label="Máximo"><input type="number" min="1" max="20" value={g.maximo} onChange={(e)=>cambiarGrupo(g.id,{maximo:Number(e.target.value)})} className="mt-1 w-full rounded border p-2 text-sm"/></Campo><div className="flex flex-col justify-end gap-1 text-xs"><label><input type="checkbox" checked={g.obligatorio} onChange={(e)=>cambiarGrupo(g.id,{obligatorio:e.target.checked})}/> Obligatorio</label><label><input type="checkbox" checked={g.permite_mitad_mitad} onChange={(e)=>cambiarGrupo(g.id,{permite_mitad_mitad:e.target.checked})}/> Mitad y mitad</label></div></div>
        <div className="space-y-2">{g.opciones.map((o)=><div key={o.id} className="rounded-lg border bg-white p-3"><div className="grid gap-2 sm:grid-cols-[1fr_150px_auto]"><input value={o.nombre} onChange={(e)=>cambiarOpcion(g.id,o.id,{nombre:e.target.value})} placeholder="Queso extra, Pepperoni…" className="rounded border p-2 text-sm"/><input type="number" min="0" value={o.precio} onChange={(e)=>cambiarOpcion(g.id,o.id,{precio:e.target.value})} aria-label="Precio del adicional" placeholder="Precio (Gs)" className="rounded border p-2 text-sm"/><button type="button" onClick={()=>cambiarGrupo(g.id,{opciones:g.opciones.filter((x)=>x.id!==o.id)})} className="rounded p-2 text-rose-600" aria-label="Quitar adicional"><Trash2 size={16}/></button></div><div className="mt-2"><button type="button" onClick={()=>agregarIngredienteOpcion(g.id,o.id)} className="text-xs font-semibold text-orange-700">+ Receta para descontar inventario</button>{(o.ingredientes||[]).map((i)=><div key={i.id} className="mt-2 grid gap-2 sm:grid-cols-[1fr_1fr_120px_auto]"><select value={i.producto_id} onChange={(e)=>{const producto=ingredientesValidos.find((x)=>String(x.id)===e.target.value);cambiarOpcion(g.id,o.id,{ingredientes:o.ingredientes.map((x)=>x.id===i.id?{...x,producto_id:e.target.value,unidad:producto?.unidad||''}:x)});}} className="rounded border bg-white p-2 text-sm"><option value="">Ingrediente de inventario</option>{ingredientesValidos.map((x)=><option key={x.id} value={x.id}>{x.nombre}</option>)}</select><select value={i.unidad||''} onChange={(e)=>cambiarOpcion(g.id,o.id,{ingredientes:o.ingredientes.map((x)=>x.id===i.id?{...x,unidad:e.target.value}:x)})} className="rounded border bg-white p-2 text-sm"><option value="">Unidad</option>{unidades.map((u)=><option key={u.id} value={u.nombre}>{u.nombre}</option>)}</select><input type="number" min="0.0001" step="0.0001" value={i.cantidad} onChange={(e)=>cambiarOpcion(g.id,o.id,{ingredientes:o.ingredientes.map((x)=>x.id===i.id?{...x,cantidad:e.target.value}:x)})} className="rounded border p-2 text-sm"/><button type="button" onClick={()=>cambiarOpcion(g.id,o.id,{ingredientes:o.ingredientes.filter((x)=>x.id!==i.id)})} aria-label="Quitar ingrediente" className="p-2 text-rose-600"><Trash2 size={15}/></button></div>)}</div></div>)}</div>
        <button type="button" onClick={()=>cambiarGrupo(g.id,{opciones:[...g.opciones,{id:idNuevo(),nombre:'',precio:0,activo:true,orden:g.opciones.length,ingredientes:[]}]})} className="text-xs font-bold text-orange-700">+ Opción</button>
      </article>)}
    </section>
    {config.presentaciones.some((p)=>!p.nombre.trim() || Number(p.precio_venta)<0 || !p.ingredientes.length) && <p className="rounded-lg bg-amber-50 p-3 text-xs text-amber-900">Completa cada tamaño e incluye al menos un ingrediente por receta antes de publicar la pizza.</p>}
  </div>;
}
