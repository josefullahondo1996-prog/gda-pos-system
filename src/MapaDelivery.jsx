import { useLayoutEffect, useMemo, useRef, useState } from 'react';

const TAM = 256;
const aRad = (d) => d * Math.PI / 180;
const aDeg = (r) => r * 180 / Math.PI;
export function zonaEnCoordenadas(punto, zonas = []) {
  if (!punto) return null;
  const [lat, lng] = punto;
  const radiales = zonas.flatMap((zona) => {
    const centroLat = Number(zona.centro_latitud);
    const centroLng = Number(zona.centro_longitud);
    const radio = Number(zona.radio_km);
    if (!Number.isFinite(centroLat) || !Number.isFinite(centroLng) || !Number.isFinite(radio) || radio <= 0) return [];
    const r = Math.PI / 180;
    const dLat = (lat - centroLat) * r;
    const dLng = (lng - centroLng) * r;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(centroLat * r) * Math.cos(lat * r) * Math.sin(dLng / 2) ** 2;
    const distanciaKm = 6371.0088 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return distanciaKm <= radio ? [{ ...zona, distancia_km: distanciaKm }] : [];
  }).sort((a, b) => Number(a.radio_km) - Number(b.radio_km));
  if (radiales.length) return radiales[0];
  return zonas.find((zona) => {
    const poligono = zona.poligono || []; if (poligono.length < 3) return false;
    let dentro = false;
    for (let i = 0, j = poligono.length - 1; i < poligono.length; j = i++) {
      const [yi, xi] = poligono[i]; const [yj, xj] = poligono[j];
      if ((yi > lat) !== (yj > lat) && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) dentro = !dentro;
    }
    return dentro;
  }) || null;
}
function proyectar([lat, lng], z) {
  const escala = TAM * 2 ** z; const x = (lng + 180) / 360 * escala;
  const sin = Math.sin(aRad(Math.max(-85.0511, Math.min(85.0511, lat))));
  const y = (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * escala;
  return [x, y];
}
function desProyectar([x, y], z) {
  const escala = TAM * 2 ** z;
  return [aDeg(Math.atan(Math.sinh(Math.PI * (1 - 2 * y / escala)))), x / escala * 360 - 180];
}

// Mapa raster interactivo de OpenStreetMap; dibuja el polígono por clics sin API key.
export default function MapaDelivery({ puntos = [], onChange, zonas = [], punto = null, selectedZoneId = null, onPuntoChange, modo = 'dibujar', radioKm = null }) {
  const latitudPunto = Array.isArray(punto) ? Number(punto[0]) : NaN;
  const longitudPunto = Array.isArray(punto) ? Number(punto[1]) : NaN;
  const puntoValido = Number.isFinite(latitudPunto) && Number.isFinite(longitudPunto);
  const [centro, setCentro] = useState(() => modo === 'pin' && puntoValido ? [latitudPunto, longitudPunto] : [-25.2867, -57.647]); const [zoom, setZoom] = useState(modo === 'pin' && puntoValido ? 16 : 13); const [medida, setMedida] = useState([900, 340]); const [dibujando, setDibujando] = useState(false);
  const arrastreRef = useRef(null); const ignorarClickRef = useRef(false); const arrastrandoPinRef = useRef(false);
  useLayoutEffect(() => {
    if (modo !== 'pin' || !puntoValido) return;
    if (arrastrandoPinRef.current) return;
    const latitud = latitudPunto;
    const longitud = longitudPunto;
    setCentro([latitud, longitud]);
    setZoom(16);
  }, [modo, latitudPunto, longitudPunto, puntoValido]);
  useLayoutEffect(() => {
    if (modo !== 'pin' || !puntoValido || !Number.isFinite(Number(radioKm)) || Number(radioKm) <= 0) return;
    const altoMapa = medida[1] || 340;
    const zoomAjustado = Math.floor(Math.log2((156543.03392 * Math.max(0.15, Math.cos(aRad(latitudPunto))) * altoMapa * 0.75) / (2 * Number(radioKm) * 1000)));
    setZoom(Math.max(3, Math.min(19, zoomAjustado)));
  }, [modo, puntoValido, latitudPunto, radioKm, medida]);
  const [ancho, alto] = medida; const centroMundo = proyectar(centro, zoom); const esquina = [centroMundo[0] - ancho / 2, centroMundo[1] - alto / 2];
  const tiles = useMemo(() => {
    const minX = Math.floor(esquina[0] / TAM); const maxX = Math.floor((esquina[0] + ancho) / TAM);
    const minY = Math.floor(esquina[1] / TAM); const maxY = Math.floor((esquina[1] + alto) / TAM); const lista = [];
    for (let x = minX; x <= maxX; x += 1) for (let y = minY; y <= maxY; y += 1) {
      const n = 2 ** zoom; const wrapX = ((x % n) + n) % n;
      if (y < 0 || y >= n) continue;
      lista.push({ x, y, url: `https://tile.openstreetmap.org/${zoom}/${wrapX}/${y}.png`, left: x * TAM - esquina[0], top: y * TAM - esquina[1] });
    }
    return lista;
  }, [zoom, ancho, alto, centro]);
  const pixeles = puntos.map((p) => { const xy = proyectar(p, zoom); return `${xy[0] - esquina[0]},${xy[1] - esquina[1]}`; }).join(' ');
  const puntoMapa = punto ? proyectar(punto, zoom) : null;
  const mover = (dx, dy) => setCentro(desProyectar([centroMundo[0] + dx, centroMundo[1] + dy], zoom));
  const agregarPunto = (event) => {
    if (ignorarClickRef.current) { ignorarClickRef.current = false; return; }
    const rect = event.currentTarget.getBoundingClientRect();
    const latLng = desProyectar([esquina[0] + (event.clientX - rect.left) * ancho / rect.width, esquina[1] + (event.clientY - rect.top) * alto / rect.height], zoom);
    if (modo === 'pin') { onPuntoChange?.(latLng); return; }
    if (dibujando) onChange?.([...puntos, latLng]);
  };
  const iniciarArrastre = (event) => {
    if (modo !== 'pin' || event.button !== 0) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const escalaX = ancho / rect.width; const escalaY = alto / rect.height;
    const x = (event.clientX - rect.left) * escalaX; const y = (event.clientY - rect.top) * escalaY;
    const pinX = puntoMapa ? puntoMapa[0] - esquina[0] : null;
    const pinY = puntoMapa ? puntoMapa[1] - esquina[1] : null;
    const arrastraPin = pinX != null && Math.hypot(x - pinX, y - pinY) <= 28;
    arrastrandoPinRef.current = arrastraPin;
    arrastreRef.current = { pointerId: event.pointerId, tipo: arrastraPin ? 'pin' : 'mapa', startX: event.clientX, startY: event.clientY, centroMundo };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const moverArrastre = (event) => {
    const arrastre = arrastreRef.current;
    if (!arrastre || arrastre.pointerId !== event.pointerId) return;
    const dxPantalla = event.clientX - arrastre.startX; const dyPantalla = event.clientY - arrastre.startY;
    if (Math.hypot(dxPantalla, dyPantalla) > 3) ignorarClickRef.current = true;
    if (!ignorarClickRef.current) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const escalaX = ancho / rect.width; const escalaY = alto / rect.height;
    if (arrastre.tipo === 'pin') {
      const x = (event.clientX - rect.left) * escalaX; const y = (event.clientY - rect.top) * escalaY;
      onPuntoChange?.(desProyectar([esquina[0] + x, esquina[1] + y], zoom));
    } else {
      setCentro(desProyectar([arrastre.centroMundo[0] - dxPantalla * escalaX, arrastre.centroMundo[1] - dyPantalla * escalaY], zoom));
    }
  };
  const finalizarArrastre = (event) => {
    if (arrastreRef.current?.pointerId !== event.pointerId) return;
    arrastreRef.current = null;
    arrastrandoPinRef.current = false;
    if (event.type === 'pointercancel') ignorarClickRef.current = false;
  };
  return <div className="overflow-hidden rounded-xl border border-slate-300 bg-slate-100">
    <div ref={(el) => { if (el) { const ro = new ResizeObserver((entries) => { const { width, height } = entries[0].contentRect; setMedida((m) => m[0] === Math.round(width) ? m : [Math.round(width), Math.round(height)]); }); ro.observe(el); el.__mapRo?.disconnect(); el.__mapRo = ro; } }} className="relative h-[340px] w-full touch-none overflow-hidden">
      {tiles.map((tile) => <img key={`${zoom}-${tile.x}-${tile.y}`} alt="" draggable="false" src={tile.url} className="pointer-events-none absolute max-w-none select-none" style={{ left: tile.left, top: tile.top, width: TAM, height: TAM }} onError={(e) => { e.currentTarget.style.opacity = '0'; }}/>) }
      <svg viewBox={`0 0 ${ancho} ${alto}`} preserveAspectRatio="none" onClick={agregarPunto} onPointerDown={iniciarArrastre} onPointerMove={moverArrastre} onPointerUp={finalizarArrastre} onPointerCancel={finalizarArrastre} className={`absolute inset-0 h-full w-full ${modo === 'pin' ? 'cursor-grab active:cursor-grabbing' : dibujando ? 'cursor-crosshair' : 'pointer-events-none'}`}>
        {zonas.filter((z) => z.poligono?.length > 2).map((zona) => { const pts = zona.poligono.map((p) => { const xy = proyectar(p, zoom); return `${xy[0]-esquina[0]},${xy[1]-esquina[1]}`; }).join(' '); return <polygon key={zona.id} points={pts} fill={zona.id === selectedZoneId ? 'rgba(16,185,129,.24)' : 'rgba(249,115,22,.12)'} stroke={zona.id === selectedZoneId ? '#059669' : '#ea580c'} strokeWidth="2" vectorEffect="non-scaling-stroke"/>; })}
        {zonas.filter((z) => Number.isFinite(Number(z.centro_latitud)) && Number.isFinite(Number(z.centro_longitud)) && Number(z.radio_km) > 0).map((zona) => { const centroZona = proyectar([Number(zona.centro_latitud), Number(zona.centro_longitud)], zoom); const bordeRadio = proyectar([Number(zona.centro_latitud) + Number(zona.radio_km) / 111.32, Number(zona.centro_longitud)], zoom); const radioPx = Math.abs(bordeRadio[1] - centroZona[1]); return <circle key={`radio-${zona.id}`} cx={centroZona[0] - esquina[0]} cy={centroZona[1] - esquina[1]} r={radioPx} fill={zona.id === selectedZoneId ? 'rgba(16,185,129,.12)' : 'rgba(249,115,22,.10)'} stroke={zona.id === selectedZoneId ? '#059669' : '#ea580c'} strokeWidth="2" vectorEffect="non-scaling-stroke"/>; })}
        {modo === 'pin' && puntoValido && Number(radioKm) > 0 && (() => { const centroZona = proyectar([latitudPunto, longitudPunto], zoom); const bordeRadio = proyectar([latitudPunto + Number(radioKm) / 111.32, longitudPunto], zoom); const radioPx = Math.abs(bordeRadio[1] - centroZona[1]); return <circle cx={centroZona[0] - esquina[0]} cy={centroZona[1] - esquina[1]} r={radioPx} fill="rgba(249,115,22,.10)" stroke="#ea580c" strokeWidth="2" vectorEffect="non-scaling-stroke"/>; })()}
        {puntos.length > 2 ? <polygon points={pixeles} fill="rgba(249,115,22,.20)" stroke="#ea580c" strokeWidth="3" vectorEffect="non-scaling-stroke"/> : puntos.length > 1 && <polyline points={pixeles} fill="none" stroke="#ea580c" strokeWidth="3" vectorEffect="non-scaling-stroke"/>}
        {puntos.map((p, i) => { const [x, y] = proyectar(p, zoom); return <circle key={`${i}-${p[0]}`} cx={x-esquina[0]} cy={y-esquina[1]} r="6" fill="#ea580c" stroke="white" strokeWidth="2" vectorEffect="non-scaling-stroke"/>; })}
        {puntoMapa && <><circle cx={puntoMapa[0]-esquina[0]} cy={puntoMapa[1]-esquina[1]} r="12" fill="rgba(37,99,235,.24)" stroke="#1d4ed8" strokeWidth="2" vectorEffect="non-scaling-stroke"/><circle cx={puntoMapa[0]-esquina[0]} cy={puntoMapa[1]-esquina[1]} r="5" fill="#1d4ed8" stroke="white" strokeWidth="2" vectorEffect="non-scaling-stroke"/></>}
      </svg>
      <div className="absolute right-3 top-3 grid overflow-hidden rounded-lg border bg-white shadow"><button type="button" onClick={() => setZoom((z) => Math.min(z + 1, 19))} className="px-3 py-1 font-black hover:bg-slate-100" aria-label="Acercar">+</button><button type="button" onClick={() => setZoom((z) => Math.max(z - 1, 3))} className="border-t px-3 py-1 font-black hover:bg-slate-100" aria-label="Alejar">−</button></div>
      <div className="absolute bottom-3 right-3 grid grid-cols-3 gap-0.5 rounded-lg border bg-white p-1 shadow"><span/><button type="button" onClick={() => mover(0, -alto/3)} aria-label="Mover mapa arriba">↑</button><span/><button type="button" onClick={() => mover(-ancho/3, 0)} aria-label="Mover mapa a la izquierda">←</button><span/><button type="button" onClick={() => mover(ancho/3, 0)} aria-label="Mover mapa a la derecha">→</button><span/><button type="button" onClick={() => mover(0, alto/3)} aria-label="Mover mapa abajo">↓</button><span/></div>
      <span className="absolute bottom-2 left-2 rounded bg-white/90 px-2 py-1 text-[10px] text-slate-700">© OpenStreetMap contributors</span>
    </div>
    {modo === 'pin' ? <div className="flex flex-wrap items-center justify-between gap-2 border-t bg-white px-3 py-2"><span className="text-xs text-slate-600">{punto ? `Ubicación marcada · ${punto[0].toFixed(5)}, ${punto[1].toFixed(5)}` : 'Tocá el mapa para marcar dónde se entrega'}</span>{punto&&<button type="button" onClick={()=>onPuntoChange?.(null)} className="rounded-lg border px-3 py-1.5 text-xs font-bold text-slate-600">Quitar ubicación</button>}</div>
      : <div className="flex flex-wrap items-center justify-between gap-2 border-t bg-white px-3 py-2"><span className="text-xs text-slate-500">{puntos.length} puntos · {centro[0].toFixed(4)}, {centro[1].toFixed(4)}</span><div className="flex gap-2"><button type="button" onClick={()=>{onChange([]);setDibujando(false);}} className="rounded-lg border px-3 py-1.5 text-xs font-bold text-slate-600">Limpiar</button><button type="button" onClick={()=>setDibujando((v)=>!v)} className={`rounded-lg px-3 py-1.5 text-xs font-bold ${dibujando?'bg-orange-100 text-orange-800':'bg-slate-900 text-white'}`}>{dibujando?'Terminar dibujo':'Dibujar zona'}</button></div></div>}
    <p className="px-3 pb-2 text-[11px] text-slate-500">{modo === 'pin' ? 'Arrastrá el pin para ajustar la ubicación; arrastrá el mapa para recorrerlo. La cobertura circular muestra hasta dónde llega el envío.' : puntos.length < 3 ? 'Opcional: activá “Dibujar zona” y marcá al menos 3 puntos sobre el mapa para delimitar la cobertura.' : 'Zona delimitada. El catálogo permite elegir esta zona y aplica su tarifa.'}</p>
  </div>;
}
