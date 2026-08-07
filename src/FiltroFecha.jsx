import React, { useState, useRef, useEffect } from 'react';

const DIAS_SEMANA = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const MESES_NOMBRE = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];
const MESES_CORTO = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

const inicioDia = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
const finDia = (d) => { const x = new Date(d); x.setHours(23, 59, 59, 999); return x; };
const fmt = (d) => d
  ? `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`
  : '';

const generarPresets = () => {
  const hoy = inicioDia(new Date());
  const ayer = new Date(hoy); ayer.setDate(ayer.getDate() - 1);
  const hace7 = new Date(hoy); hace7.setDate(hace7.getDate() - 6);
  const hace30 = new Date(hoy); hace30.setDate(hace30.getDate() - 29);
  const inicioMes = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
  const inicioMesPasado = new Date(hoy.getFullYear(), hoy.getMonth() - 1, 1);
  const finMesPasado = new Date(hoy.getFullYear(), hoy.getMonth(), 0);
  const inicioMesAnioPasado = new Date(hoy.getFullYear() - 1, hoy.getMonth(), 1);
  const finMesAnioPasado = new Date(hoy.getFullYear() - 1, hoy.getMonth() + 1, 0);
  const inicioAnio = new Date(hoy.getFullYear(), 0, 1);
  const inicioAnioPasado = new Date(hoy.getFullYear() - 1, 0, 1);
  const finAnioPasado = new Date(hoy.getFullYear() - 1, 11, 31);

  // Ejercicio actual: enero del año fiscal hasta hoy
  const inicioEjercicio = new Date(hoy.getFullYear(), 0, 1);

  // Último ejercicio trimestral: trimestre anterior
  const mesActual = hoy.getMonth();
  const trimestreActual = Math.floor(mesActual / 3);
  const inicioTrimAnterior = new Date(hoy.getFullYear(), (trimestreActual - 1) * 3, 1);
  const finTrimAnterior = new Date(hoy.getFullYear(), trimestreActual * 3, 0);

  return [
    { label: 'Hoy', desde: hoy, hasta: hoy },
    { label: 'Ayer', desde: ayer, hasta: ayer },
    { label: 'Los últimos 7 días', desde: hace7, hasta: hoy },
    { label: 'Últimos 30 días', desde: hace30, hasta: hoy },
    { label: 'Este mes', desde: inicioMes, hasta: hoy },
    { label: 'El mes pasado', desde: inicioMesPasado, hasta: finMesPasado },
    { label: 'Este mes al año pasado', desde: inicioMesAnioPasado, hasta: finMesAnioPasado },
    { label: 'Este año', desde: inicioAnio, hasta: hoy },
    { label: 'El año pasado', desde: inicioAnioPasado, hasta: finAnioPasado },
    { label: 'Todo', desde: null, hasta: null },
    { label: 'Ejercicio actual', desde: inicioEjercicio, hasta: hoy },
    { label: 'Último ejercicio trimestral', desde: inicioTrimAnterior, hasta: finTrimAnterior },
  ];
};

const FiltroFecha = ({ value, onChange }) => {
  const [abierto, setAbierto] = useState(false);
  const [panelPos, setPanelPos] = useState({ top: 0, left: 0 });
  const [mesBase, setMesBase] = useState(() => {
    const hoy = new Date();
    return new Date(hoy.getFullYear(), hoy.getMonth(), 1);
  });
  const [selInicio, setSelInicio] = useState(value?.desde || null);
  const [selFin, setSelFin] = useState(value?.hasta || null);
  const contenedorRef = useRef(null);
  const buttonRef = useRef(null);
  const presets = generarPresets();

  useEffect(() => {
    const cerrar = (e) => {
      if (
        contenedorRef.current && !contenedorRef.current.contains(e.target) &&
        buttonRef.current && !buttonRef.current.contains(e.target)
      ) setAbierto(false);
    };
    document.addEventListener('mousedown', cerrar);
    return () => document.removeEventListener('mousedown', cerrar);
  }, []);

  const abrirPanel = () => {
    if (buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      setPanelPos({
        top: rect.bottom + window.scrollY + 6,
        right: window.innerWidth - rect.right,
      });
    }
    setAbierto((prev) => !prev);
  };

  const aplicarPreset = (preset) => {
    const desde = preset.desde ? inicioDia(preset.desde) : null;
    const hasta = preset.hasta ? finDia(preset.hasta) : null;
    setSelInicio(desde);
    setSelFin(hasta);
    onChange({ desde, hasta, label: preset.label });
    setAbierto(false);
  };

  const clickDia = (fecha) => {
    if (!selInicio || (selInicio && selFin)) {
      setSelInicio(fecha);
      setSelFin(null);
    } else {
      if (fecha < selInicio) {
        setSelFin(selInicio);
        setSelInicio(fecha);
      } else {
        setSelFin(fecha);
      }
    }
  };

  const aplicar = () => {
    if (!selInicio) return;
    const desde = inicioDia(selInicio);
    const hasta = finDia(selFin || selInicio);
    onChange({ desde, hasta, label: `${fmt(desde)} - ${fmt(hasta)}` });
    setAbierto(false);
  };

  const limpiar = () => {
    setSelInicio(null);
    setSelFin(null);
    onChange({ desde: null, hasta: null, label: 'Todo' });
  };

  const irMesAnterior = () => setMesBase(new Date(mesBase.getFullYear(), mesBase.getMonth() - 1, 1));
  const irMesSiguiente = () => setMesBase(new Date(mesBase.getFullYear(), mesBase.getMonth() + 1, 1));
  const mesSiguiente = new Date(mesBase.getFullYear(), mesBase.getMonth() + 1, 1);

  const renderCalendario = (mes, showLeft, showRight) => {
    const anio = mes.getFullYear();
    const mesIdx = mes.getMonth();
    const primerDia = new Date(anio, mesIdx, 1).getDay();
    const diasEnMes = new Date(anio, mesIdx + 1, 0).getDate();
    const celdas = [];

    // días vacíos antes
    for (let i = 0; i < primerDia; i++) {
      const d = new Date(anio, mesIdx, 1 - (primerDia - i));
      celdas.push({ fecha: d, fueraDeMes: true });
    }
    // días del mes
    for (let d = 1; d <= diasEnMes; d++) {
      celdas.push({ fecha: new Date(anio, mesIdx, d), fueraDeMes: false });
    }
    // relleno final
    while (celdas.length % 7 !== 0) {
      const last = celdas[celdas.length - 1].fecha;
      const next = new Date(last); next.setDate(last.getDate() + 1);
      celdas.push({ fecha: next, fueraDeMes: true });
    }

    return (
      <div className="w-[200px]">
        {/* Header del mes con flechas */}
        <div className="flex items-center justify-between mb-3">
          {showLeft ? (
            <button
              onClick={irMesAnterior}
              className="w-6 h-6 flex items-center justify-center rounded hover:bg-gray-100 text-gray-500 hover:text-gray-800 text-base font-bold"
            >
              ‹
            </button>
          ) : <span className="w-6" />}

          <span className="text-sm font-bold text-gray-700">
            {MESES_NOMBRE[mesIdx]} {anio}
          </span>

          {showRight ? (
            <button
              onClick={irMesSiguiente}
              className="w-6 h-6 flex items-center justify-center rounded hover:bg-gray-100 text-gray-500 hover:text-gray-800 text-base font-bold"
            >
              ›
            </button>
          ) : <span className="w-6" />}
        </div>

        {/* Cabecera días de semana */}
        <div className="grid grid-cols-7 mb-1">
          {DIAS_SEMANA.map((d) => (
            <span key={d} className="text-center text-[10px] font-bold text-gray-400">{d}</span>
          ))}
        </div>

        {/* Días */}
        <div className="grid grid-cols-7 gap-y-0.5">
          {celdas.map(({ fecha, fueraDeMes }, i) => {
            const t = inicioDia(fecha).getTime();
            const esInicio = selInicio && t === inicioDia(selInicio).getTime();
            const esFin = selFin && t === inicioDia(selFin).getTime();
            const enRango = selInicio && selFin && fecha > selInicio && fecha < selFin;
            const esHoy = t === inicioDia(new Date()).getTime();

            let cls = 'text-[11px] h-7 w-full flex items-center justify-center rounded cursor-pointer transition-colors select-none ';
            if (fueraDeMes) {
              cls += 'text-gray-300 ';
            } else if (esInicio || esFin) {
              cls += 'bg-orange-500 text-white font-bold ';
            } else if (enRango) {
              cls += 'bg-orange-100 text-orange-700 ';
            } else {
              cls += 'text-gray-700 hover:bg-gray-100 ';
              if (esHoy) cls += 'ring-1 ring-orange-400 ';
            }

            return (
              <button key={i} onClick={() => !fueraDeMes && clickDia(fecha)} className={cls}>
                {fecha.getDate()}
              </button>
            );
          })}
        </div>
      </div>
    );
  };

  // Etiqueta del botón
  const labelBoton = value?.label && value.label !== 'Todo'
    ? value.label
    : 'Filtrar por fecha';

  return (
    <div className="relative inline-block" ref={contenedorRef}>
      {/* Botón trigger */}
      <button
        ref={buttonRef}
        onClick={abrirPanel}
        className="flex items-center gap-2 bg-orange-500 hover:bg-orange-600 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors shadow-sm"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
        {labelBoton}
        <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d={abierto ? 'M5 15l7-7 7 7' : 'M19 9l-7 7-7-7'} />
        </svg>
      </button>

      {/* Panel desplegable — fixed para escapar de cualquier overflow:hidden del padre */}
      {abierto && (
        <div
          ref={contenedorRef}
          className="fixed z-[9999] bg-white rounded-xl shadow-2xl border border-gray-200 flex overflow-hidden"
          style={{ minWidth: '560px', top: panelPos.top, right: panelPos.right }}
        >
          {/* Columna de presets */}
          <div className="w-44 border-r border-gray-100 py-1 flex-shrink-0 overflow-y-auto">
            {presets.map((p) => {
              const activo = value?.label === p.label;
              return (
                <button
                  key={p.label}
                  onClick={() => aplicarPreset(p)}
                  className={`w-full text-left px-4 py-2 text-[13px] transition-colors ${
                    activo
                      ? 'bg-blue-50 text-blue-600 font-semibold'
                      : 'text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  {p.label}
                </button>
              );
            })}
            {/* Separador + Rango personalizado */}
            <div className="border-t border-gray-100 mt-1 pt-1">
              <button
                onClick={() => {}} // El rango personalizado se selecciona con los calendarios
                className="w-full text-left px-4 py-2 text-[13px] text-gray-600 hover:bg-gray-50 transition-colors"
              >
                Rango personalizado
              </button>
            </div>
          </div>

          {/* Área de calendarios */}
          <div className="flex flex-col p-4 flex-1">
            {/* Dos calendarios lado a lado */}
            <div className="flex gap-6">
              {renderCalendario(mesBase, true, false)}
              {renderCalendario(mesSiguiente, false, true)}
            </div>

            {/* Footer: rango seleccionado + botones */}
            <div className="flex items-center justify-between mt-4 pt-3 border-t border-gray-100">
              <span className="text-xs text-gray-500 font-medium">
                {selInicio ? fmt(selInicio) : '—'}
                {' - '}
                {selFin ? fmt(selFin) : selInicio ? fmt(selInicio) : '—'}
              </span>
              <div className="flex gap-2">
                <button
                  onClick={limpiar}
                  className="text-xs font-semibold px-4 py-1.5 rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50 transition-colors"
                >
                  Limpiar
                </button>
                <button
                  onClick={aplicar}
                  disabled={!selInicio}
                  className="text-xs font-semibold px-4 py-1.5 rounded-lg bg-orange-500 text-white hover:bg-orange-600 disabled:opacity-40 transition-colors"
                >
                  Aplicar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default FiltroFecha;