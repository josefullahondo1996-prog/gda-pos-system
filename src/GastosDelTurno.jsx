import React, { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';
import { useEmpresaInfo } from './utils/useEmpresa';

const formatGs = (valor) => `Gs ${Number(valor || 0).toLocaleString('es-PY')}`;

const CATEGORIAS = [
  'Compra de mercadería',
  'Servicios (luz, agua, internet)',
  'Alquiler',
  'Sueldos',
  'Transporte',
  'Mantenimiento',
  'Otros',
];

const CUENTAS_PAGO = [
  'Compra (PYG)',
  'Pago de credito efectivo (PYG)',
  'Pago de credito Transferencia (PYG)',
  'Caja venta (PYG)',
];

const GastosDelTurno = ({ cajaInfo, onClose }) => {
  const { id: empresaId } = useEmpresaInfo();
  const [gastos, setGastos] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [mostrarForm, setMostrarForm] = useState(false);
  const [guardando, setGuardando] = useState(false);

  // Campos del formulario
  const [descripcion, setDescripcion] = useState('');
  const [monto, setMonto] = useState('');
  const [categoria, setCategoria] = useState('');
  const [metodoPago, setMetodoPago] = useState('Efectivo');
  const [cuentaPago, setCuentaPago] = useState('');

  const cargarGastos = async () => {
    setCargando(true);
    try {
      let query = supabase.from('gastos').select('*').order('id', { ascending: false });
      if (empresaId) query = query.eq('empresa_id', empresaId);
      if (cajaInfo?.id) query = query.eq('caja_id', cajaInfo.id);
      const { data, error } = await query;
      if (error && error.code !== '42P01' && error.code !== '42703') throw error;
      setGastos(data || []);
    } catch (error) {
      console.error('Error al cargar gastos:', error.message);
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => {
    if (empresaId || cajaInfo?.id) cargarGastos();
  }, [empresaId, cajaInfo?.id]);

  const totalGastos = gastos.reduce((acc, g) => acc + Number(g.monto || 0), 0);

  const limpiarFormulario = () => {
    setDescripcion('');
    setMonto('');
    setCategoria('');
    setMetodoPago('Efectivo');
    setCuentaPago('');
  };

  const registrarGasto = async (e) => {
    e.preventDefault();
    if (!descripcion || !monto || !categoria || !cuentaPago) {
      return alert('Completá descripción, monto, categoría y cuenta de pago.');
    }
    setGuardando(true);
    try {
      const nuevoGasto = {
        descripcion,
        monto: parseFloat(monto),
        categoria,
        metodo_pago: metodoPago,
        cuenta_pago: cuentaPago,
      };
      if (empresaId) nuevoGasto.empresa_id = empresaId;
      if (cajaInfo?.id) nuevoGasto.caja_id = cajaInfo.id;

      const { error } = await supabase.from('gastos').insert([nuevoGasto]);
      if (error) throw error;

      limpiarFormulario();
      setMostrarForm(false);
      cargarGastos();
    } catch (error) {
      alert(
        'Error al registrar el gasto. Si menciona una columna (categoria, metodo_pago, cuenta_pago, caja_id), agregala a tu tabla "gastos" en Supabase.\n\n' +
        error.message
      );
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden max-h-[90vh] flex flex-col">

        {/* Header */}
        <div className="bg-[#1e2a4a] px-6 py-4 flex items-start justify-between flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="bg-orange-500 w-10 h-10 rounded-lg flex items-center justify-center text-lg">
              🧾
            </div>
            <div>
              <h2 className="text-white font-bold text-lg leading-tight">Gastos del Turno</h2>
              <p className="text-gray-300 text-xs">Registrar y controlar egresos de caja</p>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-300 hover:text-white text-xl leading-none">✕</button>
        </div>

        <div className="p-6 overflow-y-auto">

          {/* Totales (solo si no está el formulario abierto) */}
          {!mostrarForm && (
            <div className="grid grid-cols-2 gap-3 mb-6">
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 text-center">
                <p className="text-[11px] font-bold text-gray-400 uppercase mb-1">Total Gastos</p>
                <p className="text-red-600 font-black text-xl">{formatGs(totalGastos)}</p>
              </div>
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 text-center">
                <p className="text-[11px] font-bold text-gray-400 uppercase mb-1">Cantidad</p>
                <p className="text-gray-800 font-black text-xl">{gastos.length}</p>
              </div>
            </div>
          )}

          {/* Lista de gastos */}
          <div className="mb-4 max-h-40 overflow-y-auto">
            {cargando ? (
              <div className="flex justify-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-500"></div>
              </div>
            ) : gastos.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-6 text-gray-400">
                <span className="text-3xl mb-2">🧾</span>
                <p className="text-sm font-medium">No hay gastos registrados en este turno</p>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {gastos.map((g) => (
                  <div key={g.id} className="flex justify-between items-center bg-gray-50 border border-gray-100 rounded-lg px-3 py-2">
                    <div>
                      <p className="text-sm text-gray-700 font-medium">{g.descripcion}</p>
                      {g.categoria && <p className="text-[11px] text-gray-400">{g.categoria}</p>}
                    </div>
                    <span className="text-sm text-red-600 font-bold">{formatGs(g.monto)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Formulario Nuevo Gasto */}
          {mostrarForm ? (
            <form onSubmit={registrarGasto} className="border-2 border-dashed border-orange-400 rounded-lg p-5 flex flex-col gap-4">
              <h3 className="font-bold text-orange-500 text-sm">Nuevo Gasto</h3>

              <div>
                <label className="text-[11px] font-bold text-gray-500 uppercase block mb-1">Descripción</label>
                <input
                  className="w-full border border-gray-300 rounded-lg p-2.5 text-sm"
                  placeholder="Ej: Compra de papel para impresora"
                  value={descripcion}
                  onChange={(e) => setDescripcion(e.target.value)}
                  required
                  autoFocus
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-bold text-gray-500 uppercase block mb-1">Monto</label>
                  <div className="flex border border-gray-300 rounded-lg overflow-hidden">
                    <select className="bg-gray-50 text-sm px-2 border-r border-gray-300 outline-none">
                      <option>PYG</option>
                    </select>
                    <input
                      type="number"
                      className="w-full p-2.5 text-sm outline-none"
                      placeholder="0"
                      value={monto}
                      onChange={(e) => setMonto(e.target.value)}
                      required
                    />
                  </div>
                </div>
                <div>
                  <label className="text-[11px] font-bold text-gray-500 uppercase block mb-1">Categoría</label>
                  <select
                    className="w-full border border-gray-300 rounded-lg p-2.5 text-sm bg-white"
                    value={categoria}
                    onChange={(e) => setCategoria(e.target.value)}
                    required
                  >
                    <option value="">Seleccione</option>
                    {CATEGORIAS.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="text-[11px] font-bold text-gray-500 uppercase block mb-2">Método de Pago</label>
                <div className="grid grid-cols-4 gap-2">
                  {['Efectivo', 'Tarjeta', 'Transferencia', 'QR/PIX'].map((metodo) => (
                    <button
                      key={metodo}
                      type="button"
                      onClick={() => setMetodoPago(metodo)}
                      className={`text-xs font-bold py-2 rounded-lg border transition-colors ${
                        metodoPago === metodo
                          ? 'bg-orange-500 text-white border-orange-500'
                          : 'bg-white text-gray-600 border-gray-300 hover:border-orange-300'
                      }`}
                    >
                      {metodo}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-[11px] font-bold text-gray-500 uppercase block mb-1">Cuenta de Pago</label>
                <select
                  className="w-full border border-gray-300 rounded-lg p-2.5 text-sm bg-white"
                  value={cuentaPago}
                  onChange={(e) => setCuentaPago(e.target.value)}
                  required
                >
                  <option value="">-- Seleccione --</option>
                  {CUENTAS_PAGO.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>

              <div className="flex gap-3 mt-1">
                <button
                  type="button"
                  onClick={() => {
                    limpiarFormulario();
                    setMostrarForm(false);
                  }}
                  className="flex-1 border border-gray-300 text-gray-600 font-bold py-2.5 rounded-lg hover:bg-gray-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={guardando}
                  className={`flex-1 bg-orange-400 text-white font-bold py-2.5 rounded-lg hover:bg-orange-500 ${guardando ? 'opacity-70' : ''}`}
                >
                  {guardando ? 'Registrando...' : 'Registrar Gasto'}
                </button>
              </div>
            </form>
          ) : (
            <button
              onClick={() => setMostrarForm(true)}
              className="w-full bg-orange-500 hover:bg-orange-600 text-white font-bold py-3 rounded-lg transition-colors"
            >
              + Agregar Gasto
            </button>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-gray-100 flex-shrink-0">
          <button
            onClick={() => window.print()}
            className="w-full border border-gray-300 text-gray-700 font-bold py-3 rounded-lg hover:bg-gray-50 transition-colors"
          >
            🖶 Imprimir Reporte
          </button>
        </div>
      </div>
    </div>
  );
};

export default GastosDelTurno;