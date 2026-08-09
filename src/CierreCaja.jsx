import React, { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';
import { useEmpresaInfo } from './utils/useEmpresa';
import { sonidoExito, sonidoError } from './utils/sonido';

const formatGs = (v) => `Gs ${Number(v || 0).toLocaleString('es-PY')}`;

const formatDuracion = (inicio) => {
  const ms = Date.now() - new Date(inicio).getTime();
  const horas = Math.floor(ms / 3600000);
  const min = Math.floor((ms % 3600000) / 60000);
  return `${horas}h ${min}min`;
};

const CierreCaja = ({ cajaInfo, session, perfilUsuario, onClose, onCierreConfirmado }) => {
  const { id: empresaId, nombre: nombreEmpresa } = useEmpresaInfo();
  const [nombreSucursal, setNombreSucursal] = useState('');
  const [paso, setPaso] = useState(1);
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);

  const [ventasEfectivo, setVentasEfectivo] = useState(0);
  const [ventasTarjeta, setVentasTarjeta] = useState(0);
  const [ventasTransferencia, setVentasTransferencia] = useState(0);
  const [cantVentas, setCantVentas] = useState(0);
  const [totalGastos, setTotalGastos] = useState(0);
  const [gastosEfectivo, setGastosEfectivo] = useState(0);

  const [conteoReal, setConteoReal] = useState('');
  const [totalTarjetasReal, setTotalTarjetasReal] = useState('');
  const [notaCierre, setNotaCierre] = useState('');

  const fondoApertura = Number(cajaInfo?.saldo_inicial || 0);

  useEffect(() => {
    const cargarDatos = async () => {
      setCargando(true);
      try {
        const { data: ventas } = await supabase
          .from('ventas')
          .select('*')
          .eq('empresa_id', empresaId)
          .eq('caja_id', cajaInfo?.id);

        const { data: gastos } = await supabase
          .from('gastos')
          .select('*')
          .eq('empresa_id', empresaId)
          .eq('caja_id', cajaInfo?.id);

        if (cajaInfo?.ubicacion_id) {
          const { data: ubicacion } = await supabase
            .from('ubicaciones_comerciales')
            .select('nombre')
            .eq('id', cajaInfo.ubicacion_id)
            .maybeSingle();
          if (ubicacion?.nombre) setNombreSucursal(ubicacion.nombre);
        }

        const v = ventas || [];
        setVentasEfectivo(v.filter(x => x.metodo_pago === 'Efectivo').reduce((a, x) => a + Number(x.total || 0), 0));
        setVentasTarjeta(v.filter(x => x.metodo_pago === 'Tarjeta').reduce((a, x) => a + Number(x.total || 0), 0));
        setVentasTransferencia(v.filter(x => x.metodo_pago === 'Transferencia').reduce((a, x) => a + Number(x.total || 0), 0));
        setCantVentas(v.length);

        const g = gastos || [];
        setTotalGastos(g.reduce((a, x) => a + Number(x.monto || 0), 0));
        setGastosEfectivo(g.filter(x => !x.metodo_pago || x.metodo_pago === 'Efectivo').reduce((a, x) => a + Number(x.monto || 0), 0));
      } catch (error) {
        console.error('Error al cargar datos de cierre:', error.message);
      } finally {
        setCargando(false);
      }
    };
    if (cajaInfo?.id && empresaId) cargarDatos();
    else if (!cajaInfo?.id) setCargando(false);
  }, [cajaInfo, empresaId]);

  const totalVentas = ventasEfectivo + ventasTarjeta + ventasTransferencia;
  const saldoTeorico = fondoApertura + ventasEfectivo - gastosEfectivo;
  const diferencia = Number(conteoReal || 0) - saldoTeorico;
  const cajaEsConteoCompleto = conteoReal !== '';
  const cajaCuadrada = cajaEsConteoCompleto && Math.abs(diferencia) < 1;

  const confirmarCierre = async () => {
    setGuardando(true);
    try {
      const { data, error } = await supabase
        .from('caja_registros')
        .update({
          estado: 'Cerrada',
          fecha_cierre: new Date().toISOString(),
          conteo_real: Number(conteoReal || 0),
          saldo_final: Number(conteoReal || 0),
          nota_cierre: notaCierre || null,
          usuario: session?.user?.email || null,
        })
        .eq('id', cajaInfo.id)
        .eq('empresa_id', empresaId)
        .select();

      if (error && error.code !== '42P01') throw error;
      
      if (!data || data.length === 0) {
        throw new Error("No se pudo actualizar la caja en la base de datos (puede que ya estuviera cerrada o no tengas permisos).");
      }

      const reporte = {
        cajaId: cajaInfo.id,
        sucursal: nombreSucursal || perfilUsuario?.empresas?.nombre || nombreEmpresa || 'Mi Negocio',
        operador: session?.user?.email || 'Operador',
        fechaApertura: cajaInfo.fecha_apertura,
        fechaCierre: new Date().toISOString(),
        fondoApertura,
        ventasEfectivo,
        ventasTarjeta,
        ventasTransferencia,
        totalVentas,
        cantVentas,
        totalGastos,
        conteoReal: Number(conteoReal || 0),
        totalTarjetasReal: Number(totalTarjetasReal || 0),
        saldoTeorico,
        diferencia,
        cajaCuadrada,
        notaCierre,
      };

      sonidoExito();
      onCierreConfirmado(reporte);
    } catch (error) {
      sonidoError();
      alert('Error al cerrar la caja: ' + error.message);
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden max-h-[90vh] flex flex-col">

        {/* Header */}
        <div className="bg-[#1e2a4a] px-6 py-4 flex-shrink-0">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className="bg-orange-500 w-10 h-10 rounded-lg flex items-center justify-center text-lg">🏧</div>
              <div>
                <h2 className="text-white font-bold text-lg leading-tight">Cierre de Caja</h2>
                <p className="text-gray-300 text-xs">
                  {cajaInfo?.fecha_apertura && new Date(cajaInfo.fecha_apertura).toLocaleString('es-PY')} — {new Date().toLocaleString('es-PY')}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="bg-[#2b3a5c] text-white text-xs font-bold px-3 py-1 rounded-full">
                🕐 {cajaInfo?.fecha_apertura ? formatDuracion(cajaInfo.fecha_apertura) : '—'}
              </span>
              <button onClick={onClose} className="text-gray-300 hover:text-white text-xl leading-none">✕</button>
            </div>
          </div>

          {/* Progreso de pasos */}
          <div className="flex mt-4 gap-1">
            <div className={`h-1 flex-1 rounded ${paso >= 1 ? 'bg-orange-500' : 'bg-gray-600'}`}></div>
            <div className={`h-1 flex-1 rounded ${paso >= 2 ? 'bg-orange-500' : 'bg-gray-600'}`}></div>
          </div>
          <div className="flex justify-between mt-1 text-[11px] font-bold">
            <span className={paso === 1 ? 'text-orange-400' : 'text-gray-400'}>1. ARQUEO FÍSICO</span>
            <span className={paso === 2 ? 'text-orange-400' : 'text-gray-400'}>2. CONFIRMAR</span>
          </div>
        </div>

        <div className="p-6 overflow-y-auto">
          {cargando ? (
            <div className="flex justify-center py-14">
              <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-orange-500"></div>
            </div>
          ) : paso === 1 ? (
            <>
              <div className="flex items-center gap-2 mb-4 text-sm text-gray-500">
                <span>🔓</span> <span className="font-bold">FONDO DE APERTURA</span>
                <span className="ml-auto font-bold text-gray-700">{formatGs(fondoApertura)}</span>
              </div>

              <div className="border border-gray-200 rounded-lg p-4 mb-4">
                <p className="text-sm font-bold text-gray-700 mb-3">🏧 Arqueo Físico — ingrese el conteo real de cada moneda</p>
                <div className="grid grid-cols-5 gap-2 text-[10px] font-bold text-gray-400 uppercase mb-1">
                  <span>Moneda</span>
                  <span>Apertura</span>
                  <span>Ventas</span>
                  <span>Teórico</span>
                  <span>Conteo Real</span>
                </div>
                <div className="grid grid-cols-5 gap-2 items-center">
                  <span className="text-sm font-bold text-gray-700">Gs PYG</span>
                  <span className="text-sm text-gray-600">{formatGs(fondoApertura)}</span>
                  <span className="text-sm text-green-600 font-medium">+{formatGs(ventasEfectivo)}</span>
                  <span className="text-sm font-bold text-blue-600">{formatGs(saldoTeorico)}</span>
                  <input
                    type="number"
                    value={conteoReal}
                    onChange={(e) => setConteoReal(e.target.value)}
                    placeholder="0"
                    className="border border-gray-300 rounded p-1.5 text-sm w-full"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 mb-4">
                <div className="border border-gray-200 rounded-lg p-3">
                  <p className="text-[11px] font-bold text-gray-400 uppercase mb-2">💳 Total Tarjetas</p>
                  <input
                    type="number"
                    value={totalTarjetasReal}
                    onChange={(e) => setTotalTarjetasReal(e.target.value)}
                    placeholder="0"
                    className="border border-gray-300 rounded p-1.5 text-sm w-full mb-1"
                  />
                  <p className="text-[11px] text-gray-400">Sistema: {formatGs(ventasTarjeta)}</p>
                </div>
                <div className="border border-gray-200 rounded-lg p-3">
                  <p className="text-[11px] font-bold text-gray-400 uppercase mb-2">🏦 Transferencias</p>
                  <p className="text-sm font-bold text-gray-700 p-1.5">{formatGs(ventasTransferencia)}</p>
                  <p className="text-[11px] text-gray-400">Sistema: {formatGs(ventasTransferencia)}</p>
                </div>
              </div>

              {cajaEsConteoCompleto && (
                <div className={`rounded-lg p-3 mb-4 text-sm font-bold flex items-center gap-2 ${
                  cajaCuadrada ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'
                }`}>
                  {cajaCuadrada ? '✅ Caja cuadrada' : `⚠️ Diferencia de ${formatGs(Math.abs(diferencia))} (${diferencia > 0 ? 'sobra' : 'falta'})`}
                </div>
              )}

              <div className="mb-2">
                <p className="text-sm font-bold text-gray-700 mb-2">📊 Ingresos del turno por método de pago</p>
                {[
                  { label: 'Efectivo PYG', valor: ventasEfectivo },
                  { label: 'Tarjeta', valor: ventasTarjeta },
                  { label: 'Transferencia', valor: ventasTransferencia },
                ].filter(m => m.valor > 0).map((m) => (
                  <div key={m.label} className="mb-2">
                    <div className="flex justify-between text-xs font-medium text-gray-600 mb-1">
                      <span>{m.label}</span>
                      <span>{formatGs(m.valor)} {totalVentas > 0 ? `${Math.round((m.valor / totalVentas) * 100)}%` : ''}</span>
                    </div>
                    <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div className="h-full bg-green-500" style={{ width: `${totalVentas > 0 ? (m.valor / totalVentas) * 100 : 0}%` }}></div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex justify-between items-center border-t border-gray-100 pt-3 mb-4">
                <span className="font-bold text-gray-700">TOTAL VENTAS</span>
                <span className="font-black text-blue-600 text-lg">{formatGs(totalVentas)}</span>
              </div>

              <button
                onClick={() => setPaso(2)}
                className="w-full bg-orange-500 hover:bg-orange-600 text-white font-bold py-3 rounded-lg"
              >
                Siguiente: Confirmar →
              </button>
            </>
          ) : (
            <>
              <div className="grid grid-cols-3 gap-3 mb-4">
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 text-center">
                  <p className="text-[10px] font-bold text-gray-400 uppercase mb-1">Ventas PYG</p>
                  <p className="text-blue-600 font-black text-sm">{formatGs(ventasEfectivo + ventasTarjeta + ventasTransferencia)}</p>
                </div>
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 text-center">
                  <p className="text-[10px] font-bold text-gray-400 uppercase mb-1">Fondo Apertura</p>
                  <p className="text-green-600 font-black text-sm">{formatGs(fondoApertura)}</p>
                </div>
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 text-center">
                  <p className="text-[10px] font-bold text-gray-400 uppercase mb-1">Total Gastos</p>
                  <p className="text-red-600 font-black text-sm">{formatGs(totalGastos)}</p>
                </div>
              </div>

              <div className={`rounded-lg p-3 mb-4 text-sm font-bold flex items-center gap-2 ${
                cajaCuadrada ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'
              }`}>
                {cajaCuadrada ? '✅ Caja cuadrada' : `⚠️ Diferencia de ${formatGs(Math.abs(diferencia))}`}
              </div>

              <div className="border border-gray-200 rounded-lg p-4 mb-4">
                <p className="text-sm font-bold text-gray-700 mb-3">✅ Resumen del cierre</p>
                <div className="flex flex-col gap-2.5 text-sm">
                  <div className="flex justify-between"><span className="text-gray-500">🕐 Turno activo</span><span className="font-medium text-gray-700">{formatDuracion(cajaInfo.fecha_apertura)}</span></div>
                  <div className="flex justify-between"><span className="text-gray-500">👤 Operador</span><span className="font-medium text-gray-700">{session?.user?.email || 'Operador'}</span></div>
                  <div className="flex justify-between"><span className="text-gray-500">📍 Sucursal</span><span className="font-medium text-gray-700">{nombreSucursal || perfilUsuario?.empresas?.nombre || nombreEmpresa || 'Mi Negocio'}</span></div>
                  <div className="flex justify-between"><span className="text-gray-500">📈 Ventas cobradas</span><span className="font-bold text-blue-600">{formatGs(totalVentas)}</span></div>
                  <div className="flex justify-between"><span className="text-gray-500">💵 Efectivo teórico</span><span className="font-medium text-gray-700">{formatGs(saldoTeorico)}</span></div>
                  <div className="flex justify-between"><span className="text-gray-500">🔢 Conteo real</span><span className="font-medium text-gray-700">{formatGs(conteoReal)}</span></div>
                </div>
              </div>

              <div className="mb-4">
                <label className="text-[11px] font-bold text-gray-500 uppercase block mb-1">📝 Nota de cierre</label>
                <textarea
                  value={notaCierre}
                  onChange={(e) => setNotaCierre(e.target.value)}
                  placeholder="Observaciones del turno..."
                  className="w-full border border-gray-300 rounded-lg p-2.5 text-sm h-20"
                />
              </div>

              <div className="flex gap-3">
                <button onClick={() => setPaso(1)} className="flex-1 border border-gray-300 text-gray-600 font-bold py-2.5 rounded-lg hover:bg-gray-50">
                  ← Volver
                </button>
                <button
                  onClick={confirmarCierre}
                  disabled={guardando}
                  className={`flex-1 bg-red-600 hover:bg-red-700 text-white font-bold py-2.5 rounded-lg ${guardando ? 'opacity-70' : ''}`}
                >
                  {guardando ? 'Cerrando...' : '🔒 Cerrar Caja'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default CierreCaja;