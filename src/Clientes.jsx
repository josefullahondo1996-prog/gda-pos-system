import { useEffect, useState } from 'react';
import { supabase } from './supabaseClient';

export default function Clientes() {
  const [clientes, setClientes] = useState([]);
  const [busqueda, setBusqueda] = useState('');
  
  // ESTADO PARA CONTROLAR EL MODAL
  const [mostrarModalAñadir, setMostrarModalAñadir] = useState(false);

  // ESTADOS PARA LOS ACORDEONES DEL FORMULARIO
  const [acordeonIdentificacion, setAcordeonIdentificacion] = useState(true); // Abierto por defecto en tu foto
  const [acordeonContacto, setAcordeonContacto] = useState(true); // Abierto por defecto en tu foto
  const [acordeonUbicacion, setAcordeonUbicacion] = useState(false);
  const [acordeonCredito, setAcordeonCredito] = useState(false);

  // ESTADOS DEL FORMULARIO
  const [tipoContacto, setTipoContacto] = useState('Clientes');
  const [esEmpresa, setEsEmpresa] = useState(false);
  const [codigo, setCodigo] = useState('');
  const [tipoDoc, setTipoDoc] = useState('RUC');
  const [nroDoc, setNroDoc] = useState('');
  
  // Datos Identificación
  const [prefijo, setPrefijo] = useState('');
  const [nombre, setNombre] = useState('');
  const [segundoNombre, setSegundoNombre] = useState('');
  const [apellido, setApellido] = useState('');
  
  // Datos Contacto
  const [telefono, setTelefono] = useState('');
  const [email, setEmail] = useState('');

  useEffect(() => {
    cargarClientes();
  }, []);

  const cargarClientes = async () => {
    const { data, error } = await supabase.from('clientes').select('*').order('id', { ascending: false });
    if (!error && data) setClientes(data);
  };

  const clientesFiltrados = clientes.filter(c => 
    c.nombre.toLowerCase().includes(busqueda.toLowerCase()) || 
    (c.codigo_cliente && c.codigo_cliente.toLowerCase().includes(busqueda.toLowerCase()))
  );

  const guardarCliente = async (e) => {
    e.preventDefault();
    alert('Estructura clonada. Aquí irá la lógica para guardar en Supabase en el siguiente paso.');
    // setMostrarModalAñadir(false);
  };

  return (
    <div className="bg-transparent text-sm text-gray-700 relative h-full">
      
      <h2 className="text-2xl font-bold mb-4 text-gray-800">
        Clientes <span className="text-sm font-normal text-gray-500">Administra tus Clientes</span>
      </h2>

      {/* 1. SECCIÓN DE FILTROS SUPERIORES */}
      <div className="bg-white p-4 rounded-lg shadow-sm border-t-2 border-[#004284] mb-4">
        <h3 className="text-xs font-bold text-gray-500 mb-4 flex items-center gap-1 uppercase">
          <span className="text-[#004284]"></span> Filtros
        </h3>
        <div className="flex flex-wrap gap-6 mb-4 font-bold text-gray-700 text-xs">
          <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" className="w-4 h-4" /> Creditos ortogados</label>
          <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" className="w-4 h-4" /> Devolución de Venta</label>
          <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" className="w-4 h-4" /> Pago Realizado</label>
          <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" className="w-4 h-4" /> Crédito a favor</label>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div><label className="block text-xs font-bold text-gray-700 mb-1">No tiene venta de:</label><select className="w-full border rounded p-2 bg-white outline-none"><option>Seleccione</option></select></div>
          <div><label className="block text-xs font-bold text-gray-700 mb-1">Grupo de clientes:</label><select className="w-full border rounded p-2 bg-white outline-none"><option>Ninguna</option></select></div>
          <div><label className="block text-xs font-bold text-gray-700 mb-1">Vendedor:</label><select className="w-full border rounded p-2 bg-white outline-none"><option>Ninguna</option></select></div>
          <div><label className="block text-xs font-bold text-gray-700 mb-1">Estado:</label><select className="w-full border rounded p-2 bg-white outline-none"><option>Ninguna</option></select></div>
        </div>
      </div>

      {/* 2. CONTENEDOR DE LA TABLA */}
      <div className="bg-white rounded-lg shadow-sm border-t-2 border-[#004284]">
        <div className="p-4 border-b flex justify-between items-center">
          <h3 className="text-base font-bold text-gray-700">Todos sus Clientes</h3>
          
          {/* EL BOTÓN QUE ABRE EL MODAL CLONADO */}
          <button 
            onClick={() => setMostrarModalAñadir(true)}
            className="bg-[#fd7e14] text-white px-3 py-1.5 rounded text-sm font-bold hover:bg-[#e86e04] transition flex items-center gap-1 shadow-sm"
          >
            + Añadir
          </button>
        </div>

        <div className="p-4">
          <div className="flex flex-wrap justify-between items-center gap-4 mb-4">
            <div className="flex items-center gap-2 text-gray-600 font-medium">
              <span>Mostrar</span><select className="border rounded p-1"><option>25</option></select><span>entradas</span>
            </div>
            <div className="flex gap-1 flex-wrap">
              <button className="bg-gray-50 border text-gray-600 px-3 py-1 rounded text-xs font-bold hover:bg-gray-100">📄 Exportar a CSV</button>
              <button className="bg-gray-50 border text-gray-600 px-3 py-1 rounded text-xs font-bold hover:bg-gray-100">📊 Exportar a Excel</button>
              <button className="bg-gray-50 border text-gray-600 px-3 py-1 rounded text-xs font-bold hover:bg-gray-100">🖨️ Imprimir</button>
              <button className="bg-gray-50 border text-gray-600 px-3 py-1 rounded text-xs font-bold hover:bg-gray-100">👁 Visibilidad de columnas</button>
              <button className="bg-gray-50 border text-gray-600 px-3 py-1 rounded text-xs font-bold hover:bg-gray-100">📕 Exportar a PDF</button>
            </div>
            <div className="flex items-center gap-2">
              <input type="text" className="border rounded p-1.5 w-64 outline-none focus:border-blue-500 text-xs" placeholder="Buscar ..." value={busqueda} onChange={(e) => setBusqueda(e.target.value)} />
            </div>
          </div>

          <div className="overflow-x-auto min-h-[400px] pb-32 custom-scrollbar border rounded">
            <table className="w-full text-left text-[11px] border-collapse whitespace-nowrap">
              <thead>
                <tr className="bg-gray-50 text-[#004284] font-black uppercase border-b-2">
                  <th className="p-3">ACCIÓN</th><th className="p-3">CODIGO CLIENTE ⇅</th><th className="p-3">NOMBRE DE LA EMPRESA ⇅</th>
                  <th className="p-3">NOMBRE ⇅</th><th className="p-3">EMAIL ⇅</th><th className="p-3">DOCUMENTO N.º ⇅</th>
                  <th className="p-3">LÍMITE DE CRÉDITO ⇅</th><th className="p-3">TÉRMINO DE PAGO</th><th className="p-3 text-right">SALDO DE APERTURA ⇅</th>
                  <th className="p-3 text-right">PAGO REALIZADO ⇅</th><th className="p-3 text-center">AÑADIDO ⇅</th><th className="p-3">GRUPO ⇅</th>
                  <th className="p-3">DIRECCIÓN</th><th className="p-3">CELULAR ⇅</th><th className="p-3 text-right">VENTA TOTAL DEBIDA</th>
                  <th className="p-3 text-right">TOTAL DE DEVOLUCIÓN</th>
                </tr>
              </thead>
              <tbody>
                {clientesFiltrados.length === 0 ? (
                  <tr><td colSpan="16" className="text-center py-10 text-gray-400 font-medium text-sm">No hay datos disponibles en la tabla</td></tr>
                ) : (
                  clientesFiltrados.map((cliente) => (
                    <tr key={cliente.id} className="border-b hover:bg-gray-50 text-gray-700">
                      <td className="p-2"><button className="bg-[#17a2b8] text-white px-2 py-1 rounded font-bold flex items-center gap-1 shadow-sm">Acciones <span>▼</span></button></td>
                      <td className="p-3">{cliente.codigo_cliente || '—'}</td><td className="p-3">{cliente.nombre_empresa || '—'}</td>
                      <td className="p-3 font-bold text-gray-800">{cliente.nombre}</td><td className="p-3">{cliente.email || '—'}</td>
                      <td className="p-3">{cliente.documento_nro || '—'}</td><td className="p-3">{cliente.limite_credito}</td>
                      <td className="p-3">{cliente.termino_pago || '—'}</td><td className="p-3 text-right">{Number(cliente.saldo_apertura).toLocaleString('es-PY')} Gs</td>
                      <td className="p-3 text-right">{Number(cliente.pago_realizado).toLocaleString('es-PY')} Gs</td><td className="p-3 text-center">{new Date(cliente.fecha_agregado).toLocaleDateString('es-PY')}</td>
                      <td className="p-3">{cliente.grupo_clientes || '—'}</td><td className="p-3">{cliente.direccion || '—'}</td>
                      <td className="p-3">{cliente.celular || '—'}</td><td className="p-3 text-right font-bold">{Number(cliente.venta_total_debida).toLocaleString('es-PY')} Gs</td>
                      <td className="p-3 text-right">{Number(cliente.total_devolucion_vencida).toLocaleString('es-PY')} Gs</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* ======================================================================= */}
      {/* 3. MODAL CLONADO: NUEVO (CLIENTE POTENCIAL, CLIENTE, PROVEEDOR)         */}
      {/* ======================================================================= */}
      {mostrarModalAñadir && (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-[9999] p-4 font-sans">
          
          <div className="bg-white w-full max-w-5xl rounded-lg shadow-2xl overflow-hidden flex flex-col max-h-[95vh] animate-fade-in-up">
            
            {/* Cabecera del Modal */}
            <div className="px-6 py-4 border-b flex justify-between items-center text-gray-800">
              <h3 className="text-lg font-bold flex items-center gap-2">
                <span className="text-[#004284]"></span> NUEVO (CLIENTE POTENCIAL, CLIENTE, PROVEEDOR)
              </h3>
              <button onClick={() => setMostrarModalAñadir(false)} className="text-gray-400 hover:text-gray-600 text-2xl font-bold">×</button>
            </div>

            {/* Cuerpo del Modal (Scrollable) */}
            <div className="p-6 overflow-y-auto bg-gray-50 flex-1">
              <form id="form-cliente" onSubmit={guardarCliente}>
                
                {/* Primera Fila: Tipo Contacto, Individual/Empresa, Código */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6 items-end">
                  <div>
                    <label className="block text-xs font-bold text-gray-700 uppercase mb-1">TIPO DE CONTACTO *</label>
                    <select className="w-full border rounded p-2.5 bg-white outline-none focus:border-blue-500" value={tipoContacto} onChange={(e) => setTipoContacto(e.target.value)}>
                      <option value="Clientes">Clientes</option>
                      <option value="Proveedores">Proveedores</option>
                      <option value="Ambos">Ambos (Proveedor y Cliente)</option>
                    </select>
                  </div>
                  
                  <div className="flex border rounded overflow-hidden shadow-sm h-[42px]">
                    <button type="button" onClick={() => setEsEmpresa(false)} className={`flex-1 text-sm font-bold flex items-center justify-center gap-2 transition-colors ${!esEmpresa ? 'bg-gray-200 text-gray-800 border-b-2 border-blue-500' : 'bg-white text-gray-500'}`}>
                      <span></span> Individual
                    </button>
                    <div className="w-px bg-gray-200"></div>
                    <button type="button" onClick={() => setEsEmpresa(true)} className={`flex-1 text-sm font-bold flex items-center justify-center gap-2 transition-colors ${esEmpresa ? 'bg-gray-200 text-gray-800 border-b-2 border-blue-500' : 'bg-white text-gray-500'}`}>
                      <span></span> Empresa
                    </button>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-gray-700 uppercase mb-1">CÓDIGO</label>
                    <input type="text" className="w-full border rounded p-2.5 bg-white outline-none focus:border-blue-500 placeholder-gray-400" placeholder="Automático" value={codigo} onChange={(e) => setCodigo(e.target.value)} />
                  </div>
                </div>

                {/* Sección Azul: BUSCAR O REGISTRAR CONTACTO */}
                <div className="border border-blue-100 bg-blue-50/30 p-4 rounded-lg mb-6">
                  <h4 className="text-[#004284] text-xs font-bold flex items-center gap-1 uppercase mb-3">
                    🔍 BUSCAR O REGISTRAR CONTACTO
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-[#004284] uppercase mb-1">TIPO DOC.</label>
                      <select className="w-full border rounded p-2 bg-white outline-none focus:border-blue-500" value={tipoDoc} onChange={(e) => setTipoDoc(e.target.value)}>
                        <option value="RUC">RUC</option>
                        <option value="CÉDULA DE IDENTIDAD">CÉDULA DE IDENTIDAD</option>
                        <option value="PASAPORTE">PASAPORTE</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-[#004284] uppercase mb-1">NRO. DOCUMENTO *</label>
                      <div className="flex">
                        <input type="text" className="w-full border rounded-l p-2 bg-white outline-none focus:border-blue-500 placeholder-gray-400" placeholder="Ej: 4671379-4 (RUC con dígito verificador)" required value={nroDoc} onChange={(e) => setNroDoc(e.target.value)} />
                        <button type="button" className="bg-[#fd7e14] text-white px-4 rounded-r font-bold hover:bg-[#e86e04] flex items-center justify-center">
                          🔍
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Acordeón: Identificación */}
                <div className="bg-white border rounded-lg mb-3 overflow-hidden shadow-sm">
                  <div className="p-3 bg-white flex justify-between items-center cursor-pointer border-b" onClick={() => setAcordeonIdentificacion(!acordeonIdentificacion)}>
                    <h4 className="text-sm font-bold text-[#004284]">Identificación</h4>
                    <span className="text-gray-400 font-bold">{acordeonIdentificacion ? '' : ''}</span>
                  </div>
                  {acordeonIdentificacion && (
                    <div className="p-4 grid grid-cols-1 md:grid-cols-4 gap-4">
                      <div>
                        <label className="block text-xs font-bold text-gray-700 uppercase mb-1">PREFIJO</label>
                        <input type="text" className="w-full border rounded p-2 bg-white placeholder-gray-400 outline-none" placeholder="—" value={prefijo} onChange={(e) => setPrefijo(e.target.value)} />
                        <span className="text-[10px] text-gray-400">Opcional (Sr., Sra.)</span>
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-gray-700 uppercase mb-1">NOMBRE *</label>
                        <input type="text" className="w-full border rounded p-2 bg-white placeholder-gray-400 outline-none" placeholder="Nombre" required value={nombre} onChange={(e) => setNombre(e.target.value)} />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-gray-700 uppercase mb-1">SEGUNDO NOMBRE</label>
                        <input type="text" className="w-full border rounded p-2 bg-white placeholder-gray-400 outline-none" placeholder="Segundo nombre" value={segundoNombre} onChange={(e) => setSegundoNombre(e.target.value)} />
                        <span className="text-[10px] text-gray-400">Opcional, no requerido</span>
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-gray-700 uppercase mb-1">APELLIDO</label>
                        <input type="text" className="w-full border rounded p-2 bg-white placeholder-gray-400 outline-none" placeholder="Apellido" value={apellido} onChange={(e) => setApellido(e.target.value)} />
                      </div>
                    </div>
                  )}
                </div>

                {/* Acordeones Secundarios */}
                <div className="bg-white border rounded-lg mb-3 overflow-hidden shadow-sm">
                  <div className="p-3 bg-white flex justify-between items-center cursor-pointer hover:bg-gray-50 transition">
                    <h4 className="text-sm font-bold text-gray-600 flex items-center gap-2"><span className="text-orange-500"></span> Foto del Cliente</h4>
                    <span className="text-gray-400 font-bold"></span>
                  </div>
                </div>

                <div className="bg-white border rounded-lg mb-3 overflow-hidden shadow-sm">
                  <div className="p-3 bg-white flex justify-between items-center cursor-pointer hover:bg-gray-50 transition">
                    <h4 className="text-sm font-bold text-gray-600">Cargar Documentos <span className="text-gray-400 font-normal text-xs">(CI, contratos, etc.)</span></h4>
                    <span className="text-gray-400 font-bold"></span>
                  </div>
                </div>

                {/* Acordeón: Contacto */}
                <div className="bg-white border rounded-lg mb-3 overflow-hidden shadow-sm">
                  <div className="p-3 bg-white flex justify-between items-center cursor-pointer border-b" onClick={() => setAcordeonContacto(!acordeonContacto)}>
                    <h4 className="text-sm font-bold text-green-600 flex items-center gap-2"><span>📞</span> Contacto</h4>
                    <span className="text-gray-400 font-bold">{acordeonContacto ? '' : ''}</span>
                  </div>
                  {acordeonContacto && (
                    <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-bold text-gray-700 uppercase mb-1">TELÉFONO</label>
                        <input type="text" className="w-full border rounded p-2 bg-white placeholder-gray-400 outline-none" placeholder="Celular / Teléfono" value={telefono} onChange={(e) => setTelefono(e.target.value)} />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-gray-700 uppercase mb-1">EMAIL</label>
                        <input type="email" className="w-full border rounded p-2 bg-white placeholder-gray-400 outline-none" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
                      </div>
                    </div>
                  )}
                </div>

                {/* Acordeón: Ubicación y Datos Fiscales */}
                <div className="bg-white border rounded-lg mb-3 overflow-hidden shadow-sm">
                  <div className="p-3 bg-white flex justify-between items-center cursor-pointer hover:bg-gray-50 transition" onClick={() => setAcordeonUbicacion(!acordeonUbicacion)}>
                    <h4 className="text-sm font-bold text-red-500 flex items-center gap-2"><span>📍</span> Ubicación y Datos Fiscales</h4>
                    <span className="text-gray-400 font-bold">{acordeonUbicacion ? '' : ''}</span>
                  </div>
                </div>

                {/* Acordeón: Crédito y Condiciones */}
                <div className="bg-white border rounded-lg mb-3 overflow-hidden shadow-sm">
                  <div className="p-3 bg-white flex justify-between items-center cursor-pointer hover:bg-gray-50 transition" onClick={() => setAcordeonCredito(!acordeonCredito)}>
                    <h4 className="text-sm font-bold text-purple-600 flex items-center gap-2"><span>💳</span> Crédito y Condiciones</h4>
                    <span className="text-gray-400 font-bold">{acordeonCredito ? '' : ''}</span>
                  </div>
                </div>

              </form>
            </div>

            {/* Footer del Modal (Botones) */}
            <div className="px-6 py-4 border-t bg-gray-50 flex justify-end items-center gap-3">
              <button 
                type="button" 
                onClick={() => setMostrarModalAñadir(false)}
                className="bg-white border border-gray-300 text-gray-700 px-5 py-2 rounded text-sm font-bold hover:bg-gray-100 transition shadow-sm"
              >
                Cerrar
              </button>
              <button 
                type="submit"
                form="form-cliente"
                className="bg-[#fd7e14] text-white px-5 py-2 rounded text-sm font-bold hover:bg-[#e86e04] transition flex items-center gap-2 shadow-sm"
              >
                <span>✔</span> Guardar
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
}