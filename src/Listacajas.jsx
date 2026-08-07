import React, { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';
import { useEmpresaInfo } from './utils/useEmpresa';

const FORM_VACIO = {
  nombre: '',
  tipo_cuenta: 'EFECTIVO',
  subtipo_cuenta: '',
  numero_cuenta: '',
  nota: '',
  saldo: '0',
  moneda: 'Guarani (Gs)',
  detalles_cuenta: '',
};

const ListaCajas = ({ perfilUsuario }) => {
  const { id: empresaId } = useEmpresaInfo();
  const [tab, setTab] = useState('cajas'); // 'cajas' | 'tipos'
  const [cajas, setCajas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filtroEstado, setFiltroEstado] = useState('Activo');
  const [busqueda, setBusqueda] = useState('');

  const [mostrarFormulario, setMostrarFormulario] = useState(false);
  const [cajaEditando, setCajaEditando] = useState(null);
  const [form, setForm] = useState(FORM_VACIO);
  const [guardando, setGuardando] = useState(false);

  const [modalDepositar, setModalDepositar] = useState(null); // caja seleccionada
  const [montoDeposito, setMontoDeposito] = useState('');

  const nombreUsuarioActual = perfilUsuario?.nombre || perfilUsuario?.nombre_usuario || perfilUsuario?.empresas?.nombre || '—';

  const cargarCajas = async () => {
    if (!empresaId) return;
    setLoading(true);
    try {
      let query = supabase.from('cuentas_caja').select('*').eq('empresa_id', empresaId).order('creado_en', { ascending: true });
      if (filtroEstado === 'Activo') query = query.eq('activo', true);
      if (filtroEstado === 'Inactivo') query = query.eq('activo', false);
      const { data, error } = await query;
      if (error) throw error;
      setCajas(data || []);
    } catch (error) {
      console.error('Error al cargar cajas:', error.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (empresaId) cargarCajas();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empresaId, filtroEstado]);

  const abrirAñadir = () => {
    setCajaEditando(null);
    setForm(FORM_VACIO);
    setMostrarFormulario(true);
  };

  const abrirEditar = (caja) => {
    setCajaEditando(caja);
    setForm({
      nombre: caja.nombre || '',
      tipo_cuenta: caja.tipo_cuenta || 'EFECTIVO',
      subtipo_cuenta: caja.subtipo_cuenta || '',
      numero_cuenta: caja.numero_cuenta || '',
      nota: caja.nota || '',
      saldo: String(caja.saldo ?? 0),
      moneda: caja.moneda || 'Guarani (Gs)',
      detalles_cuenta: caja.detalles_cuenta || '',
    });
    setMostrarFormulario(true);
  };

  const guardarCaja = async (e) => {
    e.preventDefault();
    if (!form.nombre.trim()) { alert('Ingresá un nombre para la cuenta.'); return; }
    setGuardando(true);
    try {
      const datos = {
        nombre: form.nombre.trim(),
        tipo_cuenta: form.tipo_cuenta,
        subtipo_cuenta: form.subtipo_cuenta || null,
        numero_cuenta: form.numero_cuenta || null,
        nota: form.nota || null,
        moneda: form.moneda,
        detalles_cuenta: form.detalles_cuenta || null,
      };

      if (cajaEditando) {
        const { error } = await supabase.from('cuentas_caja').update(datos).eq('id', cajaEditando.id).eq('empresa_id', empresaId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('cuentas_caja').insert([{
          ...datos,
          saldo: Number(form.saldo) || 0,
          empresa_id: empresaId,
          activo: true,
          añadido_por: nombreUsuarioActual,
        }]);
        if (error) throw error;
      }

      setMostrarFormulario(false);
      cargarCajas();
    } catch (error) {
      alert('Error al guardar la cuenta: ' + error.message);
    } finally {
      setGuardando(false);
    }
  };

  const cerrarCaja = async (caja) => {
    if (!window.confirm(`¿Cerrar la cuenta "${caja.nombre}"? Vas a poder reactivarla después desde el filtro "Inactivo".`)) return;
    try {
      const { error } = await supabase.from('cuentas_caja').update({ activo: false }).eq('id', caja.id).eq('empresa_id', empresaId);
      if (error) throw error;
      cargarCajas();
    } catch (error) {
      alert('Error al cerrar la cuenta: ' + error.message);
    }
  };

  const reactivarCaja = async (caja) => {
    try {
      const { error } = await supabase.from('cuentas_caja').update({ activo: true }).eq('id', caja.id).eq('empresa_id', empresaId);
      if (error) throw error;
      cargarCajas();
    } catch (error) {
      alert('Error al reactivar la cuenta: ' + error.message);
    }
  };

  const confirmarDeposito = async () => {
    const monto = Number(montoDeposito);
    if (!monto || monto <= 0) { alert('Ingresá un monto válido.'); return; }
    try {
      const nuevoSaldo = Number(modalDepositar.saldo || 0) + monto;
      const { error } = await supabase.from('cuentas_caja').update({ saldo: nuevoSaldo }).eq('id', modalDepositar.id).eq('empresa_id', empresaId);
      if (error) throw error;
      setModalDepositar(null);
      setMontoDeposito('');
      cargarCajas();
    } catch (error) {
      alert('Error al depositar: ' + error.message);
    }
  };

  const cajasFiltradas = cajas.filter((c) =>
    !busqueda.trim() || c.nombre.toLowerCase().includes(busqueda.toLowerCase()) || (c.numero_cuenta || '').toLowerCase().includes(busqueda.toLowerCase())
  );

  // Agrupamos por moneda, igual que en la referencia
  const grupos = cajasFiltradas.reduce((acc, c) => {
    const moneda = c.moneda || 'Guarani (Gs)';
    if (!acc[moneda]) acc[moneda] = [];
    acc[moneda].push(c);
    return acc;
  }, {});

  const formatoGs = (n) => `${Number(n || 0).toLocaleString('es-PY')} Gs`;

  return (
    <div className="p-6 bg-gray-50 min-h-screen w-full font-sans text-gray-700">

      {/* Encabezado */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-800">Caja / Banco <span className="text-sm font-normal text-gray-500 ml-2">Maneja tu caja</span></h1>
      </div>

      {/* Pestañas */}
      <div className="flex gap-6 border-b border-gray-200 mb-6">
        <button
          onClick={() => setTab('cajas')}
          className={`pb-3 px-1 font-bold text-sm flex items-center gap-2 border-b-2 transition-colors ${tab === 'cajas' ? 'border-orange-500 text-gray-800' : 'border-transparent text-gray-400 hover:text-gray-600'}`}
        >
          📄 Cajas
        </button>
        <button
          onClick={() => setTab('tipos')}
          className={`pb-3 px-1 font-bold text-sm flex items-center gap-2 border-b-2 transition-colors ${tab === 'tipos' ? 'border-orange-500 text-gray-800' : 'border-transparent text-gray-400 hover:text-gray-600'}`}
        >
          📋 Tipos de cuenta
        </button>
      </div>

      {tab === 'tipos' ? (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-10 text-center text-gray-400">
          Módulo "Tipos de cuenta" en construcción.
        </div>
      ) : (
        <>
          {/* Filtro + Añadir */}
          <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200 mb-6 flex flex-col md:flex-row justify-between items-center gap-4">
            <select
              value={filtroEstado}
              onChange={(e) => setFiltroEstado(e.target.value)}
              className="border border-gray-300 rounded-md p-2.5 bg-white outline-none w-full md:w-56"
            >
              <option value="Activo">Activo</option>
              <option value="Inactivo">Inactivo</option>
              <option value="Todos">Todos</option>
            </select>
            <button
              onClick={abrirAñadir}
              className="bg-orange-500 hover:bg-orange-600 text-white font-bold py-2 px-6 rounded-lg flex items-center gap-2 transition-all shadow-md whitespace-nowrap"
            >
              <span className="text-xl">+</span> Añadir
            </button>
          </div>

          {/* Contenedor de tabla */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200">

            {/* Barra de herramientas */}
            <div className="p-4 flex flex-wrap items-center gap-2 bg-gray-50/50 border-b border-gray-100">
              <div className="flex items-center gap-2 mr-4">
                <span className="text-sm">Mostrar</span>
                <select className="border border-gray-300 rounded p-1 text-sm"><option>25</option></select>
                <span className="text-sm">entradas</span>
              </div>
              <button onClick={() => alert('Módulo en construcción')} className="bg-gray-200 hover:bg-gray-300 text-gray-700 px-3 py-1.5 rounded text-xs font-bold flex items-center gap-1">📄 Exportar a CSV</button>
              <button onClick={() => alert('Módulo en construcción')} className="bg-gray-200 hover:bg-gray-300 text-gray-700 px-3 py-1.5 rounded text-xs font-bold flex items-center gap-1">📊 Exportar a Excel</button>
              <button onClick={() => window.print()} className="bg-gray-200 hover:bg-gray-300 text-gray-700 px-3 py-1.5 rounded text-xs font-bold flex items-center gap-1">🖨️ Imprimir</button>
              <button onClick={() => alert('Módulo en construcción')} className="bg-gray-200 hover:bg-gray-300 text-gray-700 px-3 py-1.5 rounded text-xs font-bold flex items-center gap-1">📋 Visibilidad de columnas</button>
              <button onClick={() => alert('Módulo en construcción')} className="bg-gray-200 hover:bg-gray-300 text-gray-700 px-3 py-1.5 rounded text-xs font-bold flex items-center gap-1">📕 Exportar a PDF</button>
              <div className="ml-auto relative">
                <input
                  type="text"
                  placeholder="Buscar..."
                  value={busqueda}
                  onChange={(e) => setBusqueda(e.target.value)}
                  className="border border-gray-300 rounded-md py-1.5 px-4 text-sm focus:ring-1 focus:ring-orange-500 outline-none w-64"
                />
              </div>
            </div>

            {/* Tabla */}
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead className="bg-gray-50 text-gray-400 text-xs uppercase font-bold border-b border-gray-200">
                  <tr>
                    <th className="p-4 border-r">Nombre</th>
                    <th className="p-4 border-r">Tipo de cuenta</th>
                    <th className="p-4 border-r">Subtipo de cuenta</th>
                    <th className="p-4 border-r">Número de cuenta</th>
                    <th className="p-4 border-r">Nota</th>
                    <th className="p-4 border-r text-right">Saldo</th>
                    <th className="p-4 border-r">Moneda</th>
                    <th className="p-4 border-r">Detalles de la cuenta</th>
                    <th className="p-4 border-r">Añadido por</th>
                    <th className="p-4 w-64">Acción</th>
                  </tr>
                </thead>
                <tbody className="text-sm divide-y divide-gray-100">
                  {loading && (
                    <tr><td colSpan={10} className="p-6 text-center text-gray-400">Cargando...</td></tr>
                  )}
                  {!loading && cajasFiltradas.length === 0 && (
                    <tr><td colSpan={10} className="p-6 text-center text-gray-400">No hay cuentas registradas todavía.</td></tr>
                  )}
                  {!loading && Object.entries(grupos).map(([moneda, lista]) => (
                    <React.Fragment key={moneda}>
                      <tr className="bg-gray-100">
                        <td colSpan={10} className="p-2 px-4 font-bold text-gray-600 text-xs">🏳️ {moneda.toUpperCase()}</td>
                      </tr>
                      {lista.map((caja) => (
                        <tr key={caja.id} className="hover:bg-gray-50 align-top">
                          <td className="p-4 border-r font-semibold text-gray-700">{caja.nombre}</td>
                          <td className="p-4 border-r">{caja.tipo_cuenta}</td>
                          <td className="p-4 border-r">{caja.subtipo_cuenta || '—'}</td>
                          <td className="p-4 border-r">{caja.numero_cuenta || '—'}</td>
                          <td className="p-4 border-r">{caja.nota || '—'}</td>
                          <td className="p-4 border-r text-right font-bold">{formatoGs(caja.saldo)}</td>
                          <td className="p-4 border-r">{caja.moneda}</td>
                          <td className="p-4 border-r">{caja.detalles_cuenta || '—'}</td>
                          <td className="p-4 border-r">{caja.añadido_por || '—'}</td>
                          <td className="p-4">
                            <div className="flex flex-wrap gap-1.5">
                              <button onClick={() => abrirEditar(caja)} className="bg-orange-500 hover:bg-orange-600 text-white text-xs font-bold px-2.5 py-1.5 rounded">✎ Editar</button>
                              <button onClick={() => alert('Módulo "Libro de caja" en construcción')} className="bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold px-2.5 py-1.5 rounded">🗒 Libro de caja</button>
                              <button onClick={() => alert('Módulo "Transferencia de fondos" en construcción')} className="bg-sky-500 hover:bg-sky-600 text-white text-xs font-bold px-2.5 py-1.5 rounded">Transferencia de fondos</button>
                              {caja.activo ? (
                                <>
                                  <button onClick={() => { setModalDepositar(caja); setMontoDeposito(''); }} className="bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-bold px-2.5 py-1.5 rounded">📥 Depositar</button>
                                  <button onClick={() => cerrarCaja(caja)} className="bg-red-500 hover:bg-red-600 text-white text-xs font-bold px-2.5 py-1.5 rounded">⏻ Cerrar</button>
                                </>
                              ) : (
                                <button onClick={() => reactivarCaja(caja)} className="bg-gray-500 hover:bg-gray-600 text-white text-xs font-bold px-2.5 py-1.5 rounded">↺ Reactivar</button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* MODAL: Añadir / Editar cuenta */}
      {mostrarFormulario && (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-[9999] p-4">
          <div className="bg-white w-full max-w-2xl rounded-lg shadow-2xl overflow-hidden flex flex-col max-h-[95vh]">
            <div className="px-6 py-4 border-b flex justify-between items-center bg-[#1b2032] text-white">
              <h3 className="text-lg font-bold flex items-center gap-2">
                🏦 {cajaEditando ? 'EDITAR CUENTA' : 'NUEVA CUENTA DE CAJA / BANCO'}
              </h3>
              <button onClick={() => setMostrarFormulario(false)} className="text-white/70 hover:text-white text-2xl font-bold">×</button>
            </div>

            <form onSubmit={guardarCaja} className="p-6 overflow-y-auto bg-gray-50 flex-1 text-xs space-y-4">
              <div>
                <label className="block font-bold text-gray-700 uppercase mb-1">Nombre *</label>
                <input type="text" required className="w-full border rounded p-2.5 bg-white outline-none" value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} placeholder="Ej: Caja efectivo" />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block font-bold text-gray-700 uppercase mb-1">Tipo de cuenta</label>
                  <select className="w-full border rounded p-2.5 bg-white outline-none" value={form.tipo_cuenta} onChange={(e) => setForm({ ...form, tipo_cuenta: e.target.value })}>
                    <option value="EFECTIVO">Efectivo</option>
                    <option value="TRANSFERENCIA">Transferencia</option>
                    <option value="BANCO">Banco</option>
                    <option value="TARJETA">Tarjeta</option>
                  </select>
                </div>
                <div>
                  <label className="block font-bold text-gray-700 uppercase mb-1">Subtipo de cuenta</label>
                  <input type="text" className="w-full border rounded p-2.5 bg-white outline-none" value={form.subtipo_cuenta} onChange={(e) => setForm({ ...form, subtipo_cuenta: e.target.value })} />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block font-bold text-gray-700 uppercase mb-1">Número de cuenta</label>
                  <input type="text" className="w-full border rounded p-2.5 bg-white outline-none" value={form.numero_cuenta} onChange={(e) => setForm({ ...form, numero_cuenta: e.target.value })} />
                </div>
                <div>
                  <label className="block font-bold text-gray-700 uppercase mb-1">Moneda</label>
                  <select className="w-full border rounded p-2.5 bg-white outline-none" value={form.moneda} onChange={(e) => setForm({ ...form, moneda: e.target.value })}>
                    <option value="Guarani (Gs)">Guarani (Gs)</option>
                    <option value="Dólar (US$)">Dólar (US$)</option>
                    <option value="Real (R$)">Real (R$)</option>
                  </select>
                </div>
              </div>

              {!cajaEditando && (
                <div>
                  <label className="block font-bold text-gray-700 uppercase mb-1">Saldo inicial</label>
                  <input type="number" step="0.01" className="w-full border rounded p-2.5 bg-white outline-none" value={form.saldo} onChange={(e) => setForm({ ...form, saldo: e.target.value })} />
                </div>
              )}

              <div>
                <label className="block font-bold text-gray-700 uppercase mb-1">Nota</label>
                <input type="text" className="w-full border rounded p-2.5 bg-white outline-none" value={form.nota} onChange={(e) => setForm({ ...form, nota: e.target.value })} />
              </div>

              <div>
                <label className="block font-bold text-gray-700 uppercase mb-1">Detalles de la cuenta</label>
                <textarea rows={2} className="w-full border rounded p-2.5 bg-white outline-none" value={form.detalles_cuenta} onChange={(e) => setForm({ ...form, detalles_cuenta: e.target.value })} />
              </div>
            </form>

            <div className="px-6 py-4 border-t bg-white flex justify-end gap-3">
              <button onClick={() => setMostrarFormulario(false)} className="px-5 py-2 rounded-lg border font-bold text-gray-600 hover:bg-gray-100">Cancelar</button>
              <button onClick={guardarCaja} disabled={guardando} className="px-5 py-2 rounded-lg bg-orange-500 hover:bg-orange-600 text-white font-bold disabled:opacity-50">
                {guardando ? 'Guardando...' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Depositar */}
      {modalDepositar && (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-[9999] p-4">
          <div className="bg-white w-full max-w-md rounded-lg shadow-2xl overflow-hidden">
            <div className="px-6 py-4 border-b flex justify-between items-center bg-[#1b2032] text-white">
              <h3 className="text-lg font-bold">📥 Depositar en "{modalDepositar.nombre}"</h3>
              <button onClick={() => setModalDepositar(null)} className="text-white/70 hover:text-white text-2xl font-bold">×</button>
            </div>
            <div className="p-6 space-y-3">
              <p className="text-xs text-gray-500">Saldo actual: <b>{formatoGs(modalDepositar.saldo)}</b></p>
              <label className="block font-bold text-gray-700 uppercase text-xs mb-1">Monto a depositar</label>
              <input
                type="number"
                autoFocus
                step="0.01"
                className="w-full border rounded p-2.5 bg-white outline-none"
                value={montoDeposito}
                onChange={(e) => setMontoDeposito(e.target.value)}
                placeholder="0"
              />
            </div>
            <div className="px-6 py-4 border-t bg-gray-50 flex justify-end gap-3">
              <button onClick={() => setModalDepositar(null)} className="px-5 py-2 rounded-lg border font-bold text-gray-600 hover:bg-gray-100">Cancelar</button>
              <button onClick={confirmarDeposito} className="px-5 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white font-bold">Depositar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ListaCajas;
