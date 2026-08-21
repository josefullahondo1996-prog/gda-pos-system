import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from './supabaseClient';
import { useEmpresaInfo } from './utils/useEmpresa';

const FORM_VACIO = {
  tipo_contacto: 'Proveedores',
  nombre_empresa: '',
  representante_legal: '',
  documento_nro: '',
  email: '',
  celular: '',
  direccion: '',
  termino_pago: '',
  saldo_apertura: '',
  estado: 'Activo',
};

const Proveedores = () => {
  const { id: empresaId } = useEmpresaInfo();
  const [proveedores, setProveedores] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busqueda, setBusqueda] = useState('');

  // === Formulario de Añadir / Editar ===
  const [mostrarFormulario, setMostrarFormulario] = useState(false);
  const [proveedorEditando, setProveedorEditando] = useState(null);
  const [form, setForm] = useState(FORM_VACIO);
  const [guardando, setGuardando] = useState(false);

  // === Ver detalle ===
  const [proveedorVer, setProveedorVer] = useState(null);

  // === Menú de Acciones (con portal para que no quede recortado por el scroll de la tabla) ===
  const [menuAccionesAbierto, setMenuAccionesAbierto] = useState(null);
  const [menuAccionesPos, setMenuAccionesPos] = useState({ top: 0, left: 0 });

  // === CARGA DE DATOS REALES ===
  const fetchProveedores = async () => {
    if (!empresaId) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('clientes')
        .select('*')
        .eq('empresa_id', empresaId)
        .in('tipo_contacto', ['Proveedores', 'Ambos'])
        .order('nombre', { ascending: true });

      if (error) throw error;
      setProveedores(data || []);
    } catch (error) {
      console.error('Error cargando proveedores:', error.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (empresaId) fetchProveedores();
  }, [empresaId]);

  // Filtro de búsqueda en tiempo real
  const proveedoresFiltrados = proveedores.filter(p =>
    p.nombre_empresa?.toLowerCase().includes(busqueda.toLowerCase()) ||
    p.nombre?.toLowerCase().includes(busqueda.toLowerCase()) ||
    p.codigo_cliente?.toLowerCase().includes(busqueda.toLowerCase())
  );

  // === Abrir formulario para AÑADIR ===
  const abrirAñadir = () => {
    setProveedorEditando(null);
    setForm(FORM_VACIO);
    setMostrarFormulario(true);
  };

  // === Abrir formulario para EDITAR (precargado) ===
  const abrirEditar = (proveedor) => {
    setMenuAccionesAbierto(null);
    setProveedorEditando(proveedor);
    setForm({
      tipo_contacto: proveedor.tipo_contacto || 'Proveedores',
      nombre_empresa: proveedor.nombre_empresa || '',
      representante_legal: proveedor.representante_legal || proveedor.nombre || '',
      documento_nro: proveedor.documento_nro || '',
      email: proveedor.email || '',
      celular: proveedor.celular || '',
      direccion: proveedor.direccion || '',
      termino_pago: proveedor.termino_pago || '',
      saldo_apertura: proveedor.saldo_apertura ?? '',
      estado: proveedor.estado || 'Activo',
    });
    setMostrarFormulario(true);
  };

  // === Guardar (INSERT o UPDATE) ===
  const guardarProveedor = async (e) => {
    e.preventDefault();
    if (!form.nombre_empresa.trim() && !form.representante_legal.trim()) {
      alert('Ingresá al menos el nombre de la empresa o del representante.');
      return;
    }
    setGuardando(true);
    try {
      const datos = {
        empresa_id: empresaId,
        tipo_contacto: form.tipo_contacto,
        nombre_empresa: form.nombre_empresa || null,
        nombre: form.representante_legal || form.nombre_empresa,
        representante_legal: form.representante_legal || null,
        documento_nro: form.documento_nro || null,
        email: form.email || null,
        celular: form.celular || null,
        direccion: form.direccion || null,
        termino_pago: form.termino_pago || null,
        saldo_apertura: form.saldo_apertura ? Number(form.saldo_apertura) : 0,
        estado: form.estado || 'Activo',
      };

      if (proveedorEditando) {
        const { error } = await supabase
          .from('clientes')
          .update(datos)
          .eq('id', proveedorEditando.id);
        if (error) throw error;
      } else {
        const codigoGenerado = `PR${Math.floor(1000 + Math.random() * 9000)}`;
        const { error } = await supabase
          .from('clientes')
          .insert([{ ...datos, codigo_cliente: codigoGenerado }]);
        if (error) throw error;
      }

      setMostrarFormulario(false);
      setProveedorEditando(null);
      await fetchProveedores();
    } catch (error) {
      alert('Error al guardar el proveedor: ' + error.message);
    } finally {
      setGuardando(false);
    }
  };

  // === Borrar ===
  const borrarProveedor = async (proveedor) => {
    setMenuAccionesAbierto(null);
    if (!window.confirm(`¿Seguro que querés borrar a "${proveedor.nombre_empresa || proveedor.nombre}"? Esta acción no se puede deshacer.`)) {
      return;
    }
    try {
      const { error } = await supabase.from('clientes').delete().eq('id', proveedor.id);
      if (error) throw error;
      await fetchProveedores();
    } catch (error) {
      alert('Error al borrar el proveedor: ' + error.message);
    }
  };

  // === Abrir menú de Acciones (con posición fija, para que no quede recortado) ===
  const abrirMenuAcciones = (e, proveedorId) => {
    if (menuAccionesAbierto === proveedorId) {
      setMenuAccionesAbierto(null);
      return;
    }
    const rect = e.currentTarget.getBoundingClientRect();
    const anchoMenu = 176;
    const left = Math.min(rect.left, window.innerWidth - anchoMenu - 8);
    const top = Math.min(rect.bottom + 4, window.innerHeight - 8);
    setMenuAccionesPos({ top, left });
    setMenuAccionesAbierto(proveedorId);
  };

  return (
    <div className="p-6 bg-gray-50 min-h-screen w-full font-sans text-gray-700">

      {/* Encabezado */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-800">Proveedores <span className="text-sm font-normal text-gray-500 ml-2">Administra tus Proveedores</span></h1>
      </div>

      {/* SECCIÓN DE FILTROS (Clonada de la imagen) */}
      <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200 mb-6">
        <div className="flex items-center gap-2 text-blue-600 font-bold mb-4">
          <i className="fa-solid fa-filter"></i> Filtros
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" className="rounded text-orange-500" /> Compra adeudada</label>
          <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" className="rounded text-orange-500" /> Devolución de compra</label>
          <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" className="rounded text-orange-500" /> Pago Realizado</label>
          <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" className="rounded text-orange-500" /> Crédito a favor</label>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-bold mb-1">Vendedor:</label>
            <select className="w-full border border-gray-300 rounded-md p-2 bg-gray-50 outline-none">
              <option>Ninguna</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-bold mb-1">Estado:</label>
            <select className="w-full border border-gray-300 rounded-md p-2 bg-gray-50 outline-none">
              <option>Ninguna</option>
              <option>Activo</option>
              <option>Inactivo</option>
            </select>
          </div>
        </div>
      </div>

      {/* CONTENEDOR DE TABLA */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200">

        {/* Barra de herramientas superior */}
        <div className="p-4 border-b border-gray-100 flex flex-col md:flex-row justify-between items-center gap-4">
          <h3 className="font-bold text-gray-700">Todos sus Proveedores</h3>
          <button
            onClick={abrirAñadir}
            className="bg-orange-500 hover:bg-orange-600 text-white font-bold py-2 px-6 rounded-lg flex items-center gap-2 transition-all shadow-md"
          >
            <span className="text-xl">+</span> Añadir
          </button>
        </div>

        {/* Botones de Exportación */}
        <div className="p-4 flex flex-wrap items-center gap-2 bg-gray-50/50">
          <div className="flex items-center gap-2 mr-4">
            <span className="text-sm">Mostrar</span>
            <select className="border border-gray-300 rounded p-1 text-sm"><option>25</option></select>
            <span className="text-sm">entradas</span>
          </div>
          <button className="bg-gray-200 hover:bg-gray-300 text-gray-700 px-3 py-1.5 rounded text-xs font-bold flex items-center gap-1">📄 Exportar a CSV</button>
          <button className="bg-gray-200 hover:bg-gray-300 text-gray-700 px-3 py-1.5 rounded text-xs font-bold flex items-center gap-1">📊 Exportar a Excel</button>
          <button className="bg-gray-200 hover:bg-gray-300 text-gray-700 px-3 py-1.5 rounded text-xs font-bold flex items-center gap-1">🖨️ Imprimir</button>
          <button className="bg-gray-200 hover:bg-gray-300 text-gray-700 px-3 py-1.5 rounded text-xs font-bold flex items-center gap-1">📋 Visibilidad de columnas</button>
          <button className="bg-gray-200 hover:bg-gray-300 text-gray-700 px-3 py-1.5 rounded text-xs font-bold flex items-center gap-1">📕 Exportar a PDF</button>

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

        {/* TABLA DE DATOS */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead className="bg-gray-50 text-gray-400 text-xs uppercase font-bold border-b border-gray-200">
              <tr>
                <th className="p-4 border-r w-32">ACCIÓN</th>
                <th className="p-4 border-r">CÓDIGO</th>
                <th className="p-4 border-r">NOMBRE DE LA EMPRESA</th>
                <th className="p-4 border-r">NOMBRE</th>
                <th className="p-4 border-r">EMAIL</th>
                <th className="p-4 border-r">DOCUMENTO N°</th>
                <th className="p-4 border-r text-center">TÉRMINO PAGO</th>
                <th className="p-4 text-right">SALDO APERTU.</th>
              </tr>
            </thead>
            <tbody className="text-sm">
              {loading ? (
                <tr><td colSpan="8" className="p-10 text-center">Cargando proveedores...</td></tr>
              ) : proveedoresFiltrados.length === 0 ? (
                <tr><td colSpan="8" className="p-10 text-center">No se encontraron proveedores.</td></tr>
              ) : (
                proveedoresFiltrados.map((item) => (
                  <tr key={item.id} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                    <td className="p-4">
                      <button
                        onClick={(e) => abrirMenuAcciones(e, item.id)}
                        className="bg-cyan-400 hover:bg-cyan-500 text-white text-xs font-bold py-1.5 px-3 rounded flex items-center gap-1"
                      >
                        Acciones <i className="fa-solid fa-caret-down"></i>
                      </button>
                      {menuAccionesAbierto === item.id && createPortal(
                        <>
                          {/* Fondo invisible para cerrar el menú al hacer clic afuera */}
                          <div className="fixed inset-0 z-[9998]" onClick={() => setMenuAccionesAbierto(null)} />
                          <div
                            className="fixed z-[9999] bg-white border rounded shadow-lg w-44 text-xs py-1"
                            style={{ top: menuAccionesPos.top, left: menuAccionesPos.left }}
                          >
                            <button
                              onClick={() => { setMenuAccionesAbierto(null); setProveedorVer(item); }}
                              className="w-full text-left px-3 py-2 hover:bg-gray-100 text-gray-700 flex items-center gap-2"
                            >
                              👁️ Ver
                            </button>
                            <button
                              onClick={() => abrirEditar(item)}
                              className="w-full text-left px-3 py-2 hover:bg-gray-100 text-gray-700 flex items-center gap-2"
                            >
                              ✏️ Editar
                            </button>
                            <button
                              onClick={() => borrarProveedor(item)}
                              className="w-full text-left px-3 py-2 hover:bg-gray-100 text-red-600 flex items-center gap-2"
                            >
                              🗑️ Borrar
                            </button>
                          </div>
                        </>,
                        document.body
                      )}
                    </td>
                    <td className="p-4 text-gray-500">{item.codigo_cliente || 'S/N'}</td>
                    <td className="p-4 font-bold text-gray-800">{item.nombre_empresa || item.nombre}</td>
                    <td className="p-4 text-gray-600">{item.representante_legal || item.nombre}</td>
                    <td className="p-4 text-blue-500 hover:underline cursor-pointer">{item.email}</td>
                    <td className="p-4 text-gray-600">{item.documento_nro}</td>
                    <td className="p-4 text-center">{item.termino_pago || '0'} días</td>
                    <td className="p-4 text-right font-bold">Gs {item.saldo_apertura?.toLocaleString('es-PY') || '0'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Footer de Tabla */}
        <div className="p-4 bg-gray-50 flex justify-between items-center text-sm text-gray-500">
          <span>Mostrando {proveedoresFiltrados.length} de {proveedores.length} entradas</span>
          <div className="flex gap-1">
            <button className="px-3 py-1 border rounded bg-white hover:bg-gray-100">Anterior</button>
            <button className="px-3 py-1 border rounded bg-orange-500 text-white">1</button>
            <button className="px-3 py-1 border rounded bg-white hover:bg-gray-100">Siguiente</button>
          </div>
        </div>
      </div>

      {/* MODAL: Añadir / Editar proveedor */}
      {mostrarFormulario && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[9999] p-4" onClick={() => setMostrarFormulario(false)}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="bg-orange-500 px-5 py-4 flex justify-between items-center flex-shrink-0">
              <h3 className="text-white font-bold text-lg">{proveedorEditando ? 'Editar proveedor' : 'Añadir proveedor'}</h3>
              <button onClick={() => setMostrarFormulario(false)} className="text-white/80 hover:text-white text-xl leading-none">✕</button>
            </div>
            <form onSubmit={guardarProveedor} className="p-5 overflow-y-auto flex flex-col gap-4 text-sm">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="md:col-span-2">
                  <label className="block font-bold mb-1">Tipo de contacto:*</label>
                  <select required value={form.tipo_contacto} onChange={(e) => setForm({ ...form, tipo_contacto: e.target.value })} className="w-full border rounded-md p-2 bg-white outline-none focus:ring-1 focus:ring-orange-500">
                    <option value="Proveedores">Proveedores</option>
                    <option value="Ambos">Ambos (Proveedor y Cliente)</option>
                    <option value="Clientes">Clientes</option>
                  </select>
                </div>
                <div>
                  <label className="block font-bold mb-1">Nombre de la empresa</label>
                  <input
                    type="text"
                    value={form.nombre_empresa}
                    onChange={(e) => setForm({ ...form, nombre_empresa: e.target.value })}
                    className="w-full border rounded-md p-2 outline-none focus:ring-1 focus:ring-orange-500"
                    placeholder="Ej: Repuestos Paraguay S.A."
                  />
                </div>
                <div>
                  <label className="block font-bold mb-1">Nombre del representante</label>
                  <input
                    type="text"
                    value={form.representante_legal}
                    onChange={(e) => setForm({ ...form, representante_legal: e.target.value })}
                    className="w-full border rounded-md p-2 outline-none focus:ring-1 focus:ring-orange-500"
                    placeholder="Ej: Juan Pérez"
                  />
                </div>
                <div>
                  <label className="block font-bold mb-1">Documento N°</label>
                  <input
                    type="text"
                    value={form.documento_nro}
                    onChange={(e) => setForm({ ...form, documento_nro: e.target.value })}
                    className="w-full border rounded-md p-2 outline-none focus:ring-1 focus:ring-orange-500"
                  />
                </div>
                <div>
                  <label className="block font-bold mb-1">Email</label>
                  <input
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    className="w-full border rounded-md p-2 outline-none focus:ring-1 focus:ring-orange-500"
                  />
                </div>
                <div>
                  <label className="block font-bold mb-1">Celular</label>
                  <input
                    type="text"
                    value={form.celular}
                    onChange={(e) => setForm({ ...form, celular: e.target.value })}
                    className="w-full border rounded-md p-2 outline-none focus:ring-1 focus:ring-orange-500"
                  />
                </div>
                <div>
                  <label className="block font-bold mb-1">Término de pago (días)</label>
                  <input
                    type="text"
                    value={form.termino_pago}
                    onChange={(e) => setForm({ ...form, termino_pago: e.target.value })}
                    className="w-full border rounded-md p-2 outline-none focus:ring-1 focus:ring-orange-500"
                    placeholder="Ej: 30"
                  />
                </div>
                <div>
                  <label className="block font-bold mb-1">Saldo de apertura</label>
                  <input
                    type="number"
                    value={form.saldo_apertura}
                    onChange={(e) => setForm({ ...form, saldo_apertura: e.target.value })}
                    className="w-full border rounded-md p-2 outline-none focus:ring-1 focus:ring-orange-500"
                  />
                </div>
                <div>
                  <label className="block font-bold mb-1">Estado</label>
                  <select
                    value={form.estado}
                    onChange={(e) => setForm({ ...form, estado: e.target.value })}
                    className="w-full border rounded-md p-2 outline-none focus:ring-1 focus:ring-orange-500"
                  >
                    <option value="Activo">Activo</option>
                    <option value="Inactivo">Inactivo</option>
                  </select>
                </div>
                <div className="md:col-span-2">
                  <label className="block font-bold mb-1">Dirección</label>
                  <input
                    type="text"
                    value={form.direccion}
                    onChange={(e) => setForm({ ...form, direccion: e.target.value })}
                    className="w-full border rounded-md p-2 outline-none focus:ring-1 focus:ring-orange-500"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 mt-2 flex-shrink-0">
                <button
                  type="button"
                  onClick={() => setMostrarFormulario(false)}
                  className="px-4 py-2 rounded-md border border-gray-300 text-gray-600 hover:bg-gray-50 font-bold"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={guardando}
                  className="px-4 py-2 rounded-md bg-orange-500 hover:bg-orange-600 text-white font-bold disabled:opacity-60"
                >
                  {guardando ? 'Guardando...' : proveedorEditando ? 'Guardar cambios' : 'Añadir proveedor'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Ver proveedor */}
      {proveedorVer && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[9999] p-4" onClick={() => setProveedorVer(null)}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="bg-orange-500 px-5 py-4 flex justify-between items-center">
              <h3 className="text-white font-bold text-lg">Detalle del proveedor</h3>
              <button onClick={() => setProveedorVer(null)} className="text-white/80 hover:text-white text-xl leading-none">✕</button>
            </div>
            <div className="p-5 text-sm flex flex-col gap-2">
              <p><span className="font-bold text-gray-600">Código:</span> {proveedorVer.codigo_cliente || 'S/N'}</p>
              <p><span className="font-bold text-gray-600">Empresa:</span> {proveedorVer.nombre_empresa || '-'}</p>
              <p><span className="font-bold text-gray-600">Representante:</span> {proveedorVer.representante_legal || proveedorVer.nombre || '-'}</p>
              <p><span className="font-bold text-gray-600">Documento N°:</span> {proveedorVer.documento_nro || '-'}</p>
              <p><span className="font-bold text-gray-600">Email:</span> {proveedorVer.email || '-'}</p>
              <p><span className="font-bold text-gray-600">Celular:</span> {proveedorVer.celular || '-'}</p>
              <p><span className="font-bold text-gray-600">Dirección:</span> {proveedorVer.direccion || '-'}</p>
              <p><span className="font-bold text-gray-600">Término de pago:</span> {proveedorVer.termino_pago || '0'} días</p>
              <p><span className="font-bold text-gray-600">Saldo de apertura:</span> Gs {proveedorVer.saldo_apertura?.toLocaleString('es-PY') || '0'}</p>
              <p><span className="font-bold text-gray-600">Estado:</span> {proveedorVer.estado || 'Activo'}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Proveedores;
