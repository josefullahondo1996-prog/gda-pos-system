import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, BookOpen, Check, CheckCircle2, ChevronLeft, ChevronRight, Circle, LoaderCircle, X } from 'lucide-react';
import { supabase } from './supabaseClient';

const ITEMS = [
  { id: 'empresa', title: 'Datos de la empresa', description: 'Revisa el nombre del negocio y la moneda principal.', view: 'config_empresa', path: '/config_empresa', anchor: 'empresa' },
  { id: 'sucursales', title: 'Sucursales', description: 'Crea al menos una ubicación para organizar cajas y existencias.', view: 'ubicaciones_comerciales', path: '/ubicaciones_comerciales', anchor: 'sucursal' },
  { id: 'productos', title: 'Productos', description: 'Registra productos y precios antes de vender.', view: 'agregar_producto', path: '/agregar_producto', anchor: 'producto' },
  { id: 'caja', title: 'Caja y ventas', description: 'Abre tu caja para entrar al Punto de venta y operar.', view: 'pos', path: '/pos', anchor: 'operacion' },
];

const GuiaInicial = ({ empresaId, usuarioId, empresaNombre, moneda, cajaAbierta, soloPOS, puedeAbrirVista, onNavegar, visible, onCerrar, onAbrir }) => {
  const [modo, setModo] = useState('inicio');
  const [paso, setPaso] = useState(0);
  const [conteos, setConteos] = useState({ sucursales: undefined, productos: undefined, cargando: true });
  const [rectangulo, setRectangulo] = useState(null);
  const autoAperturaRevisada = useRef(null);

  const claveVisto = empresaId && usuarioId ? `gda-guia-inicial-v1-${empresaId}-${usuarioId}` : null;
  const pasosTour = useMemo(() => soloPOS
    ? [ITEMS[3]]
    : ITEMS.filter(item => !puedeAbrirVista || puedeAbrirVista(item.view)), [soloPOS, puedeAbrirVista]);
  const pasoActual = pasosTour[paso];

  useEffect(() => {
    if (!empresaId) return undefined;
    let vigente = true;
    setConteos({ sucursales: undefined, productos: undefined, cargando: true });
    Promise.all([
      supabase.from('ubicaciones_comerciales').select('id', { count: 'exact', head: true }).eq('empresa_id', empresaId),
      supabase.from('productos').select('id', { count: 'exact', head: true }).eq('empresa_id', empresaId),
    ]).then(([sucursales, productos]) => {
      if (!vigente) return;
      setConteos({
        sucursales: sucursales.error ? null : Number(sucursales.count || 0),
        productos: productos.error ? null : Number(productos.count || 0),
        cargando: false,
      });
    }).catch(() => {
      if (vigente) setConteos({ sucursales: null, productos: null, cargando: false });
    });
    return () => { vigente = false; };
  }, [empresaId]);

  useEffect(() => {
    if (!claveVisto || soloPOS || autoAperturaRevisada.current === claveVisto) return;
    autoAperturaRevisada.current = claveVisto;
    try {
      if (!localStorage.getItem(claveVisto)) onAbrir();
    } catch { /* si el navegador bloquea el almacenamiento, la guía sigue disponible */ }
  }, [claveVisto, soloPOS, onAbrir]);

  useEffect(() => {
    if (!visible || modo !== 'tour' || !pasoActual) {
      setRectangulo(null);
      return undefined;
    }
    let cancelar = false;
    let temporizador;
    let intentos = 0;
    const medir = () => {
      if (cancelar) return;
      const elemento = document.querySelector(`[data-guia-tour="${pasoActual.anchor}"]`);
      if (!elemento && intentos++ < 30) {
        temporizador = window.setTimeout(medir, 120);
        return;
      }
      if (elemento) {
        elemento.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'smooth' });
        temporizador = window.setTimeout(() => {
          if (cancelar) return;
          const caja = elemento.getBoundingClientRect();
          setRectangulo({ top: caja.top - 7, left: caja.left - 7, width: caja.width + 14, height: caja.height + 14 });
        }, 180);
      } else setRectangulo(null);
    };
    medir();
    const actualizar = () => {
      const elemento = document.querySelector(`[data-guia-tour="${pasoActual.anchor}"]`);
      if (!elemento) return;
      const caja = elemento.getBoundingClientRect();
      setRectangulo({ top: caja.top - 7, left: caja.left - 7, width: caja.width + 14, height: caja.height + 14 });
    };
    window.addEventListener('resize', actualizar);
    window.addEventListener('scroll', actualizar, true);
    return () => {
      cancelar = true;
      window.clearTimeout(temporizador);
      window.removeEventListener('resize', actualizar);
      window.removeEventListener('scroll', actualizar, true);
    };
  }, [visible, modo, pasoActual?.anchor]);

  useEffect(() => {
    if (!visible) return undefined;
    const alPresionarEscape = event => { if (event.key === 'Escape') cerrar(); };
    window.addEventListener('keydown', alPresionarEscape);
    return () => window.removeEventListener('keydown', alPresionarEscape);
  }, [visible]);

  const cerrar = () => {
    if (claveVisto) {
      try { localStorage.setItem(claveVisto, '1'); } catch { /* la guía se puede volver a abrir desde el botón */ }
    }
    setRectangulo(null);
    setModo('inicio');
    setPaso(0);
    onCerrar();
  };

  const iniciarTour = () => {
    if (!pasosTour.length) return;
    setPaso(0);
    setModo('tour');
    onNavegar(pasosTour[0].view, pasosTour[0].path);
  };

  const cambiarPasoTour = indice => {
    const indiceSiguiente = Math.max(0, Math.min(indice, pasosTour.length - 1));
    const item = pasosTour[indiceSiguiente];
    if (!item) return;
    setPaso(indiceSiguiente);
    onNavegar(item.view, item.path);
  };

  const navegarDesdeLista = item => {
    if (puedeAbrirVista && !puedeAbrirVista(item.view)) return;
    cerrar();
    onNavegar(item.view, item.path);
  };

  if (!visible) return null;

  const listaChecklist = [
    { ...ITEMS[0], completado: Boolean(empresaNombre && moneda), estado: empresaNombre && moneda ? 'Configurado' : 'Pendiente' },
    { ...ITEMS[1], completado: conteos.sucursales > 0, estado: conteos.cargando ? 'Comprobando…' : conteos.sucursales === null ? 'No se pudo comprobar' : conteos.sucursales > 0 ? `${conteos.sucursales} creada${conteos.sucursales === 1 ? '' : 's'}` : 'Pendiente' },
    { ...ITEMS[2], completado: conteos.productos > 0, estado: conteos.cargando ? 'Comprobando…' : conteos.productos === null ? 'No se pudo comprobar' : conteos.productos > 0 ? `${conteos.productos} registrado${conteos.productos === 1 ? '' : 's'}` : 'Pendiente' },
    { ...ITEMS[3], completado: cajaAbierta, estado: cajaAbierta ? 'Caja abierta' : 'Pendiente' },
  ];
  const completados = listaChecklist.filter(item => item.completado).length;

  return (
    <div className="fixed inset-0 z-[120]" aria-live="polite">
      {modo === 'tour' && rectangulo ? <>
        <div className="fixed left-0 top-0 z-[120] bg-slate-950/65" style={{ width: '100vw', height: Math.max(0, rectangulo.top) }} />
        <div className="fixed z-[120] bg-slate-950/65" style={{ top: rectangulo.top, left: 0, width: Math.max(0, rectangulo.left), height: rectangulo.height }} />
        <div className="fixed z-[120] bg-slate-950/65" style={{ top: rectangulo.top, left: rectangulo.left + rectangulo.width, width: Math.max(0, window.innerWidth - rectangulo.left - rectangulo.width), height: rectangulo.height }} />
        <div className="fixed left-0 z-[120] bg-slate-950/65" style={{ top: rectangulo.top + rectangulo.height, width: '100vw', height: Math.max(0, window.innerHeight - rectangulo.top - rectangulo.height) }} />
      </> : <div className={`absolute inset-0 ${modo === 'tour' ? 'bg-slate-950/65' : 'bg-slate-950/55 backdrop-blur-[2px]'}`} />}
      {modo === 'tour' && rectangulo && <div aria-hidden="true" className="pointer-events-none fixed z-[121] rounded-xl border-2 border-orange-400 shadow-[0_0_0_9999px_rgba(15,23,42,0.66),0_0_28px_rgba(249,115,22,0.55)] transition-all duration-200" style={rectangulo} />}

      {modo === 'tour' && pasoActual ? (
        <section role="dialog" aria-modal="true" aria-labelledby="guia-tour-titulo" className="fixed bottom-4 left-1/2 z-[123] w-[calc(100%-2rem)] max-w-xl -translate-x-1/2 rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl sm:bottom-6 sm:p-6">
          <div className="flex items-start justify-between gap-4">
            <div><p className="text-xs font-black uppercase tracking-[.16em] text-orange-600">Tour guiado · Paso {paso + 1} de {pasosTour.length}</p><h2 id="guia-tour-titulo" className="mt-1 text-xl font-black text-slate-900">{pasoActual.title}</h2></div>
            <button type="button" onClick={cerrar} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" aria-label="Cerrar tour"><X size={19} /></button>
          </div>
          <p className="mt-3 text-sm leading-6 text-slate-600">{pasoActual.description}</p>
          <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
            <button type="button" onClick={cerrar} className="text-sm font-semibold text-slate-500 hover:text-slate-800">Omitir recorrido</button>
            <div className="flex gap-2">
              {paso > 0 && <button type="button" onClick={() => cambiarPasoTour(paso - 1)} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50"><ChevronLeft size={16} /> Anterior</button>}
              <button type="button" onClick={() => paso + 1 < pasosTour.length ? cambiarPasoTour(paso + 1) : cerrar()} className="inline-flex items-center gap-1 rounded-lg bg-orange-500 px-4 py-2 text-sm font-bold text-white hover:bg-orange-600">{paso + 1 < pasosTour.length ? 'Siguiente' : 'Terminar'}{paso + 1 < pasosTour.length ? <ChevronRight size={16} /> : <Check size={16} />}</button>
            </div>
          </div>
        </section>
      ) : (
        <section role="dialog" aria-modal="true" aria-labelledby="guia-inicio-titulo" className="fixed inset-0 z-[123] m-auto max-h-[min(92vh,850px)] w-[calc(100%-1.5rem)] max-w-2xl overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-2xl sm:w-[calc(100%-3rem)]">
          <header className="flex items-start justify-between gap-4 rounded-t-2xl bg-gradient-to-r from-orange-50 to-white px-5 py-5 sm:px-7">
            <div><span className="inline-flex items-center gap-2 rounded-full border border-orange-100 bg-white px-3 py-1 text-xs font-bold text-orange-700"><BookOpen size={14} /> Guía de inicio rápido</span><h2 id="guia-inicio-titulo" className="mt-3 text-2xl font-black tracking-tight text-slate-900">Prepara {empresaNombre || 'tu negocio'} para empezar</h2><p className="mt-1 text-sm text-slate-600">Completa estos pasos cuando estés listo. No se crearán ventas ni movimientos de prueba.</p></div>
            <button type="button" onClick={cerrar} className="rounded-lg p-2 text-slate-500 hover:bg-white" aria-label="Cerrar guía"><X size={20} /></button>
          </header>
          <div className="px-5 py-5 sm:px-7">
            <div className="mb-4 flex items-center justify-between text-xs font-bold text-slate-500"><span>Preparación inicial</span><span>{completados} de {listaChecklist.length} listos</span></div>
            <div className="mb-5 h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-orange-500 transition-all" style={{ width: `${(completados / listaChecklist.length) * 100}%` }} /></div>
            <div className="space-y-2">
              {listaChecklist.map(item => {
                const permitido = !puedeAbrirVista || puedeAbrirVista(item.view);
                return <div key={item.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 p-3 sm:flex-nowrap sm:p-4">
                  {item.completado ? <CheckCircle2 size={20} className="shrink-0 text-emerald-600" /> : conteos.cargando && ['sucursales','productos'].includes(item.id) ? <LoaderCircle size={20} className="shrink-0 animate-spin text-slate-400" /> : <Circle size={20} className="shrink-0 text-slate-300" />}
                  <div className="min-w-[180px] flex-1"><p className="text-sm font-bold text-slate-800">{item.title}</p><p className="mt-0.5 text-xs text-slate-500">{item.description}</p></div>
                  <span className={`text-xs font-semibold ${item.completado ? 'text-emerald-700' : item.estado === 'No se pudo comprobar' ? 'text-amber-700' : 'text-slate-500'}`}>{item.estado}</span>
                  {!item.completado && permitido && <button type="button" onClick={() => navegarDesdeLista(item)} className="inline-flex items-center gap-1 rounded-lg border border-orange-200 px-3 py-2 text-xs font-bold text-orange-700 hover:bg-orange-50">Abrir <ArrowRight size={14} /></button>}
                </div>;
              })}
            </div>
            <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-5">
              <button type="button" onClick={cerrar} className="text-sm font-semibold text-slate-500 hover:text-slate-800">Ahora no</button>
              <button type="button" onClick={iniciarTour} className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-bold text-white hover:bg-slate-800"><BookOpen size={16} /> Conocer las pantallas</button>
            </div>
          </div>
        </section>
      )}
    </div>
  );
};

export default GuiaInicial;
