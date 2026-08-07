import React, { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';
import { useEmpresaInfo } from './utils/useEmpresa';
import AgregarUsuario from './AgregarUsuario';

const Usuarios = () => {
  const { id: empresaId } = useEmpresaInfo();
  const [usuarios, setUsuarios] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [busqueda, setBusqueda] = useState('');
  
  // Estado para mostrar/ocultar el formulario de agregar
  const [mostrarFormulario, setMostrarFormulario] = useState(false);
  const [usuarioEditando, setUsuarioEditando] = useState(null);
  const [nuevoUsuario, setNuevoUsuario] = useState({
    nombre_usuario: '',
    nombre: '',
    rol: 'Cajero',
    email: ''
  });

  // === CARGAR USUARIOS DESDE SUPABASE ===
  const cargarUsuarios = async () => {
    setCargando(true);
    try {
      if (!empresaId) {
        setUsuarios([]);
        return;
      }

      let query = supabase.from('usuarios').select('*, roles(nombre)').order('id', { ascending: false });
      query = query.eq('empresa_id', empresaId);
      const { data, error } = await query;

      if (error && error.code !== '42P01') throw error;
      
      if (data) setUsuarios(data);
    } catch (error) {
      console.error("Error al cargar usuarios:", error.message);
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => {
    cargarUsuarios();
  }, [empresaId]);

  // === GUARDAR NUEVO USUARIO ===
  const handleGuardarUsuario = async (e) => {
    e.preventDefault();
    try {
      const { data, error } = await supabase
        .from('usuarios')
        .insert([{ ...nuevoUsuario, empresa_id: empresaId }])
        .select();

      if (error) throw error;

      alert('Usuario agregado correctamente');
      setMostrarFormulario(false);
      setNuevoUsuario({ nombre_usuario: '', nombre: '', rol: 'Cajero', email: '' });
      cargarUsuarios(); 
    } catch (error) {
      console.error("Error al guardar usuario:", error.message);
      alert('Hubo un error al guardar. Verificá la consola.');
    }
  };

  // === ELIMINAR USUARIO PERMANENTEMENTE ===
  const handleEliminarUsuario = async (usuario) => {
    if (!window.confirm(`¿Eliminar permanentemente a "${usuario.nombre || usuario.nombre_usuario}"? Esta acción no se puede deshacer.`)) return;

    try {
      // 1) Si el usuario tiene acceso al sistema (login), borramos también su cuenta de Auth
      if (usuario.auth_user_id) {
        const { data: resultado, error: errorFuncion } = await supabase.functions.invoke('delete-user', {
          body: { auth_user_id: usuario.auth_user_id },
        });

        if (errorFuncion || resultado?.error) {
          let mensajeStr = resultado?.error;
          if (!mensajeStr && errorFuncion) {
            try {
              const errBody = await errorFuncion.context.json();
              mensajeStr = errBody.error || errBody.message;
            } catch (_) {
              mensajeStr = errorFuncion.message;
            }
          }
          throw new Error(mensajeStr || 'Error al invocar la función de eliminación de usuario');
        }
      }

      // 2) Borramos la ficha de la tabla "usuarios"
      const { error } = await supabase.from('usuarios').delete().eq('id', usuario.id).eq('empresa_id', empresaId);
      if (error) throw error;

      setUsuarios((prev) => prev.filter((u) => u.id !== usuario.id));
      alert('Usuario eliminado correctamente.');
    } catch (error) {
      console.error('Error al eliminar usuario:', error.message);
      alert('Hubo un error al eliminar el usuario: ' + error.message);
    }
  };

  // Filtrado de la barra de búsqueda
  const usuariosFiltrados = usuarios.filter(u => 
    u.nombre?.toLowerCase().includes(busqueda.toLowerCase()) || 
    u.nombre_usuario?.toLowerCase().includes(busqueda.toLowerCase()) ||
    u.email?.toLowerCase().includes(busqueda.toLowerCase())
  );

  if (mostrarFormulario) {
    return (
      <AgregarUsuario
        usuarioEditar={usuarioEditando}
        onGuardado={() => { setMostrarFormulario(false); setUsuarioEditando(null); cargarUsuarios(); }}
        onCancelar={() => { setMostrarFormulario(false); setUsuarioEditando(null); }}
      />
    );
  }

  return (
    <div className="p-4 bg-[#f4f6f9] min-h-screen w-full font-sans text-gray-800">
      
      {/* HEADER: Título y Subtítulo */}
      <div className="mb-4 flex items-baseline gap-2">
        <h1 className="text-2xl font-bold text-gray-800">Usuarios</h1>
        <span className="text-sm text-gray-500">Administrar usuarios</span>
      </div>

      {/* CONTENEDOR PRINCIPAL BLANCO */}
      <div className="bg-white rounded-t-lg shadow-sm border border-gray-200">
        
        {/* TOP BAR: Título de tabla y Botón Añadir */}
        <div className="p-4 border-b border-gray-200 flex justify-between items-center">
          <h3 className="text-md font-bold text-gray-700">Todos los usuarios</h3>
          <button 
            onClick={() => setMostrarFormulario(!mostrarFormulario)}
            className="bg-[#fd7e14] hover:bg-[#e86e04] text-white text-sm font-semibold py-1.5 px-3 rounded flex items-center gap-1 transition-colors shadow-sm"
          >
            {mostrarFormulario ? '✕ Cancelar' : '+ Añadir'}
          </button>
        </div>

        {/* FORMULARIO DESPLEGABLE (Se oculta por defecto) */}
        {mostrarFormulario && (
          <div className="p-4 bg-gray-50 border-b border-gray-200 animate-fade-in">
            <form onSubmit={handleGuardarUsuario} className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">Nombre de Usuario:*</label>
                <input type="text" required value={nuevoUsuario.nombre_usuario} onChange={(e) => setNuevoUsuario({...nuevoUsuario, nombre_usuario: e.target.value})} className="w-full border border-gray-300 rounded p-1.5 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">Nombre:*</label>
                <input type="text" required value={nuevoUsuario.nombre} onChange={(e) => setNuevoUsuario({...nuevoUsuario, nombre: e.target.value})} className="w-full border border-gray-300 rounded p-1.5 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">Email:*</label>
                <input type="email" required value={nuevoUsuario.email} onChange={(e) => setNuevoUsuario({...nuevoUsuario, email: e.target.value})} className="w-full border border-gray-300 rounded p-1.5 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">Rol:*</label>
                <select value={nuevoUsuario.rol} onChange={(e) => setNuevoUsuario({...nuevoUsuario, rol: e.target.value})} className="w-full border border-gray-300 rounded p-1.5 text-sm bg-white">
                  <option value="Admin">Admin</option>
                  <option value="Gerente">Gerente</option>
                  <option value="Cajero">Cajero</option>
                </select>
              </div>
              <div className="md:col-span-4 flex justify-end">
                <button type="submit" className="bg-[#fd7e14] text-white text-sm font-bold py-1.5 px-4 rounded shadow-sm hover:bg-[#e86e04]">Guardar Usuario</button>
              </div>
            </form>
          </div>
        )}

        {/* TOOLBAR: Paginación, Botones de Exportación y Buscador */}
        <div className="p-4 flex flex-col lg:flex-row justify-between items-center gap-4">
          
          <div className="flex items-center text-sm text-gray-600">
            <span>Mostrar</span>
            <select className="mx-2 border border-gray-300 rounded p-1 bg-white focus:outline-none focus:border-blue-500">
              <option>25</option>
              <option>50</option>
              <option>100</option>
            </select>
            <span>entradas</span>
          </div>

          <div className="flex flex-wrap justify-center gap-1">
            <button className="bg-gray-100 hover:bg-gray-200 border border-gray-300 text-gray-700 text-sm py-1 px-3 rounded flex items-center gap-1"><span className="text-gray-500">📄</span> Exportar a CSV</button>
            <button className="bg-gray-100 hover:bg-gray-200 border border-gray-300 text-gray-700 text-sm py-1 px-3 rounded flex items-center gap-1"><span className="text-gray-500">📊</span> Exportar a Excel</button>
            <button className="bg-gray-100 hover:bg-gray-200 border border-gray-300 text-gray-700 text-sm py-1 px-3 rounded flex items-center gap-1"><span className="text-gray-500">🖨️</span> Imprimir</button>
            <button className="bg-gray-100 hover:bg-gray-200 border border-gray-300 text-gray-700 text-sm py-1 px-3 rounded flex items-center gap-1"><span className="text-gray-500">👁️</span> Visibilidad de columnas</button>
            <button className="bg-gray-100 hover:bg-gray-200 border border-gray-300 text-gray-700 text-sm py-1 px-3 rounded flex items-center gap-1"><span className="text-gray-500">📕</span> Exportar a PDF</button>
          </div>

          <div className="flex items-center">
            <label className="text-sm text-gray-600 mr-2">Buscar:</label>
            <input 
              type="text" 
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              className="border border-gray-300 rounded p-1 text-sm focus:outline-none focus:border-blue-500 w-48"
            />
          </div>

        </div>

        {/* TABLA DE USUARIOS */}
        <div className="overflow-x-auto w-full">
          <table className="w-full text-sm text-left border-t border-gray-200">
            <thead className="text-xs text-gray-600 font-bold uppercase bg-white border-b-2 border-gray-200">
              <tr>
                <th className="p-3 border-r border-gray-200 w-1/5 cursor-pointer hover:bg-gray-50">Nombre de Usuario ⇅</th>
                <th className="p-3 border-r border-gray-200 w-1/5 cursor-pointer hover:bg-gray-50">Nombre ⇅</th>
                <th className="p-3 border-r border-gray-200 w-1/5 cursor-pointer hover:bg-gray-50">Rol ⇅</th>
                <th className="p-3 border-r border-gray-200 w-1/5 cursor-pointer hover:bg-gray-50">Email ⇅</th>
                <th className="p-3 text-center">Acción</th>
              </tr>
            </thead>
            <tbody>
              {cargando ? (
                <tr>
                  <td colSpan="5" className="p-8 text-center text-gray-500">Cargando usuarios...</td>
                </tr>
              ) : usuariosFiltrados.length === 0 ? (
                <tr>
                  <td colSpan="5" className="p-8 text-center text-gray-500 border-b border-gray-200">Ningún dato disponible en esta tabla</td>
                </tr>
              ) : (
                usuariosFiltrados.map((usuario, index) => (
                  <tr key={usuario.id} className={`border-b border-gray-200 hover:bg-gray-50 ${index % 2 === 0 ? 'bg-[#f9f9f9]' : 'bg-white'}`}>
                    <td className="p-3 border-r border-gray-200">{usuario.nombre_usuario}</td>
                    <td className="p-3 border-r border-gray-200">{usuario.nombre}</td>
                    <td className="p-3 border-r border-gray-200">{usuario.roles?.nombre || 'Sin Rol'}</td>
                    <td className="p-3 border-r border-gray-200">{usuario.email}</td>
                    <td className="p-3 flex justify-center gap-1">
                      <button 
                        onClick={() => { setUsuarioEditando(usuario); setMostrarFormulario(true); }}
                        className="bg-[#fd7e14] hover:bg-[#e86e04] text-white text-xs px-2 py-1 rounded flex items-center gap-1 shadow-sm"
                      >
                        <span className="text-[10px]">📝</span> Editar
                      </button>
                      <button className="bg-[#17a2b8] hover:bg-[#138496] text-white text-xs px-2 py-1 rounded flex items-center gap-1 shadow-sm">
                        <span className="text-[10px]">👁️</span> Ver
                      </button>
                      <button
                        onClick={() => handleEliminarUsuario(usuario)}
                        className="bg-[#dc3545] hover:bg-[#c82333] text-white text-xs px-2 py-1 rounded flex items-center gap-1 shadow-sm"
                      >
                        <span className="text-[10px]">🗑️</span> Borrar
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* FOOTER: Paginación */}
        <div className="p-4 flex justify-between items-center text-sm text-gray-600 bg-white rounded-b-lg">
          <div>
            Mostrando 1 a {usuariosFiltrados.length} de {usuariosFiltrados.length} entradas
          </div>
          <div className="flex rounded border border-gray-300 overflow-hidden">
            <button className="px-3 py-1.5 bg-white hover:bg-gray-100 border-r border-gray-300 text-gray-500 cursor-not-allowed">Anterior</button>
            <button className="px-3 py-1.5 bg-[#007bff] text-white font-bold">1</button>
            <button className="px-3 py-1.5 bg-white hover:bg-gray-100 border-l border-gray-300 text-blue-600">Siguiente</button>
          </div>
        </div>

      </div>
    </div>
  );
};

export default Usuarios;