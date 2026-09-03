import { useEffect, useState, useMemo } from 'react';
import { supabase } from './supabaseClient';
import { useEmpresaInfo } from './utils/useEmpresa';
import { generateReceipt } from './utils/generateReceipt';
import { useNotificacion } from './NotificacionContext';

export default function ListaVentas() {
  const { id: empresaId, nombre: nombreEmpresa, direccion: direccionEmpresa, telefono: telefonoEmpresa, ruc: rucEmpresa } = useEmpresaInfo();
  const { confirmar, notificar } = useNotificacion();
  const [ventas, setVentas] = useState([]);
  const [ubicaciones, setUbicaciones] = useState([]);
  const [cargando, setCargando] = useState(false);

  // Estados de Filtros estilo POS
  const [filtroUbicacion, setFiltroUbicacion] = useState('Todos');
  const [filtroCliente, setFiltroCliente] = useState('Todos');
  const [filtroEstado, setFiltroEstado] = useState('Todos');
  const [tipoRangoFecha, setTipoRangoFecha] = useState('hoy'); // por defecto hoy o todos
  const [busqueda, setBusqueda] = useState('');

  // useEffect para cargar ventas y ubicaciones al iniciar
  useEffect(() => {
    if (empresaId) {
      obtenerVentas();
      obtenerUbicaciones();
    }
  }, [empresaId]);

  const obtenerUbicaciones = async () => {
    const { data } = await supabase.from('ubicaciones_comerciales').select('id, nombre').eq('empresa_id', empresaId);
    if (data) setUbicaciones(data);
  };

  const obtenerVentas = async () => {
    if (!empresaId) {
      setVentas([]);
      return;
    }
    setCargando(true);
    const query = supabase
      .from('ventas')
      .select('*')
      .eq('empresa_id', empresaId)
      .order('fecha', { ascending: false });
    
    const { data, error } = await query;

    if (error) {
      console.error('Error al cargar ventas:', error.message);
    } else {
      setVentas(data || []);
    }
    setCargando(false);
  };

  const borrarVenta = async (venta) => {
    if (!(await confirmar(`La venta #${venta.id} será eliminada y se repondrá el stock de sus productos.`, { titulo: '¿Estás seguro?', textoConfirmar: 'Eliminar venta', textoCancelar: 'Cancelar', peligroso: true }))) return;
      notificar.exito('Venta eliminada y stock devuelto correctamente.');
    setCargando(true);
    try {
      if ((venta.estado_pago || venta.estado) !== 'Anulada') {
        const { error: errorReversion } = await supabase.rpc('anular_venta', {
          p_venta_id: venta.id,
          p_empresa_id: empresaId,
          p_motivo: 'Eliminación manual de venta',
        });
        if (errorReversion) throw errorReversion;
      }
      await supabase.from('detalle_ventas').delete().eq('venta_id', venta.id);
      await supabase.from('pagos_clientes').delete().eq('venta_id', venta.id);
      
      const { error } = await supabase.from('ventas').delete().eq('id', venta.id).eq('empresa_id', empresaId);
      if (error) throw error;
      
      alert(`Venta eliminada y stock devuelto correctamente.`);
      obtenerVentas();
    } catch (err) {
      alert('Error al borrar: ' + err.message);
      setCargando(false);
    }
  };

  // Listas únicas para los desplegables de filtro basados en los datos reales
  const clientesUnicos = useMemo(() => {
    const set = new Set(ventas.map((v) => v.cliente || v.cliente_nombre).filter(Boolean));
    return Array.from(set);
  }, [ventas]);

  // Lógica de filtrado avanzada (Fechas + Ubicación + Cliente + Estado + Búsqueda)
  const ventasFiltradas = useMemo(() => {
    return ventas.filter((venta) => {
      // 1. Filtro por Ubicación
      if (filtroUbicacion !== 'Todos' && venta.ubicacion_id !== filtroUbicacion) return false;

      // 2. Filtro por Cliente
      const nombreCliente = venta.cliente || venta.cliente_nombre || '';
      if (filtroCliente !== 'Todos' && nombreCliente !== filtroCliente) return false;

      // 3. Filtro por Estado de Pago
      const estadoVenta = venta.estado_pago || venta.estado || '';
      if (filtroEstado !== 'Todos' && estadoVenta.toLowerCase() !== filtroEstado.toLowerCase()) return false;

      // 4. Filtro por Rango de Fechas
      if (tipoRangoFecha !== 'todos' && venta.fecha) {
        const fechaVenta = new Date(venta.fecha);
        const hoy = new Date();
        hoy.setHours(0, 0, 0, 0);

        const diffTime = hoy - new Date(fechaVenta.setHours(0, 0, 0, 0));
        const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

        if (tipoRangoFecha === 'hoy' && diffDays !== 0) return false;
        if (tipoRangoFecha === 'ayer' && diffDays !== 1) return false;
        if (tipoRangoFecha === '7dias' && (diffDays < 0 || diffDays > 7)) return false;
        if (tipoRangoFecha === '30dias' && (diffDays < 0 || diffDays > 30)) return false;
        if (tipoRangoFecha === 'este_mes') {
          if (fechaVenta.getMonth() !== new Date().getMonth() || fechaVenta.getFullYear() !== new Date().getFullYear()) return false;
        }
      }

      // 5. Búsqueda libre
      if (busqueda) {
        const q = busqueda.toLowerCase();
        const texto = `${nombreCliente} ${venta.nota_venta || ''} ${venta.id}`.toLowerCase();
        if (!texto.includes(q)) return false;
      }

      return true;
    });
  }, [ventas, filtroUbicacion, filtroCliente, filtroEstado, tipoRangoFecha, busqueda]);

  // Cálculo de totales dinámicos según lo filtrado
  const totalMontoFiltrado = useMemo(() => {
    return ventasFiltradas.reduce((acc, curr) => acc + Number(curr.total || 0), 0);
  }, [ventasFiltradas]);

  return (
    <div className="bg-white p-6 rounded-lg shadow-md mt-6">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-bold text-[#004284]">Todas las Ventas</h2>
        <button 
          onClick={obtenerVentas}
          className="text-sm bg-blue-100 text-blue-700 px-3 py-1.5 rounded-lg hover:bg-blue-200 font-semibold transition"
        >
          ↻ Actualizar
        </button>
      </div>

      {/* PANEL DE FILTROS AVANZADO (Clonado del diseño de referencia) */}
      <div className="bg-gray-50 border border-gray-200 p-4 rounded-xl mb-6">
        <p className="text-xs font-bold text-blue-600 mb-3 uppercase tracking-wider">▼ Filtros</p>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          
          {/* Ubicación de la empresa */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">Ubicación de la empresa:</label>
            <select 
              value={filtroUbicacion} 
              onChange={(e) => setFiltroUbicacion(e.target.value)}
              className="w-full border border-gray-300 bg-white rounded-lg p-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
            >
              <option value="Todos">Todos</option>
              {ubicaciones.map((u) => (
                <option key={u.id} value={u.id}>{u.nombre}</option>
              ))}
            </select>
          </div>

          {/* Cliente */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">Cliente:</label>
            <select 
              value={filtroCliente} 
              onChange={(e) => setFiltroCliente(e.target.value)}
              className="w-full border border-gray-300 bg-white rounded-lg p-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
            >
              <option value="Todos">Todos</option>
              {clientesUnicos.map((c, idx) => (
                <option key={idx} value={c}>{c}</option>
              ))}
            </select>
          </div>

          {/* Estado de pago */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">Estado de pago:</label>
            <select 
              value={filtroEstado} 
              onChange={(e) => setFiltroEstado(e.target.value)}
              className="w-full border border-gray-300 bg-white rounded-lg p-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
            >
              <option value="Todos">Todos</option>
              <option value="pagado">Pagado</option>
              <option value="pendiente">Pendiente</option>
            </select>
          </div>

          {/* Rango de Fechas */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">Rango de fechas:</label>
            <select 
              value={tipoRangoFecha} 
              onChange={(e) => setTipoRangoFecha(e.target.value)}
              className="w-full border border-gray-300 bg-white rounded-lg p-2 text-sm font-semibold text-blue-700 focus:ring-2 focus:ring-blue-500 outline-none"
            >
              <option value="todos">Histórico completo (Todas)</option>
              <option value="hoy">Hoy</option>
              <option value="ayer">Ayer</option>
              <option value="7dias">Últimos 7 días</option>
              <option value="30dias">Últimos 30 días</option>
              <option value="este_mes">Este mes</option>
            </select>
          </div>

        </div>
      </div>

      {/* TARJETAS DE RESUMEN RÁPIDO */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <div className="bg-blue-50 border border-blue-100 p-4 rounded-xl flex items-center justify-between">
          <div>
            <p className="text-xs text-blue-600 font-bold uppercase">Total Monto Filtrado</p>
            <p className="text-2xl font-black text-blue-900">Gs {totalMontoFiltrado.toLocaleString()}</p>
          </div>
          <span className="text-2xl">💰</span>
        </div>
        <div className="bg-orange-50 border border-orange-100 p-4 rounded-xl flex items-center justify-between">
          <div>
            <p className="text-xs text-orange-600 font-bold uppercase">Transacciones encontradas</p>
            <p className="text-2xl font-black text-orange-900">{ventasFiltradas.length}</p>
          </div>
          <span className="text-2xl">📊</span>
        </div>
      </div>

      {/* BARRA DE BÚSQUEDA Y ACCIONES DE TABLA */}
      <div className="flex justify-between items-center mb-4">
        <p className="text-sm font-bold text-gray-700">Listado de Ventas</p>
        <input 
          type="text"
          placeholder="Buscar por cliente o factura..."
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm w-64 focus:ring-2 focus:ring-blue-500 outline-none"
        />
      </div>
      
      {/* TABLA DE VENTAS */}
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b-2 text-gray-600 text-xs uppercase bg-gray-50">
              <th className="p-3">Fecha y Hora</th>
              <th className="p-3">Cliente</th>
              <th className="p-3">Método Pago</th>
              <th className="p-3">Total</th>
              <th className="p-3">Estado</th>
              <th className="p-3">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {cargando ? (
              <tr>
                <td colSpan="6" className="text-center py-8 text-gray-400">Cargando ventas...</td>
              </tr>
            ) : ventasFiltradas.length === 0 ? (
              <tr>
                <td colSpan="6" className="text-center py-8 text-gray-500">
                  No se encontraron ventas con los filtros seleccionados.
                </td>
              </tr>
            ) : (
              ventasFiltradas.map((venta) => (
                <tr key={venta.id} className="border-b hover:bg-gray-50 text-sm">
                  <td className="p-3 text-gray-600">{venta.fecha ? new Date(venta.fecha).toLocaleString('es-PY') : '—'}</td>
                  <td className="p-3 font-medium text-gray-800">{venta.cliente || venta.cliente_nombre || 'Cliente Ocasional'}</td>
                  <td className="p-3 text-gray-600">{venta.metodo_pago || 'Efectivo'}</td>
                  <td className="p-3 font-bold text-gray-900">Gs {Number(venta.total || 0).toLocaleString()}</td>
                  <td className="p-3">
                    <span className={`px-2 py-1 rounded-full text-xs font-bold ${
                      (venta.estado_pago || venta.estado)?.toLowerCase() === 'pagado' 
                        ? 'bg-green-100 text-green-700' 
                        : 'bg-yellow-100 text-yellow-700'
                    }`}>
                      {(venta.estado_pago || venta.estado || 'Pagado').toUpperCase()}
                    </span>
                  </td>
                  <td className="p-3 flex items-center gap-2">
                    <button 
                      onClick={() => generateReceipt(venta, { nombre: nombreEmpresa, direccion: direccionEmpresa, telefono: telefonoEmpresa, ruc: rucEmpresa })}
                      className="bg-blue-50 text-[#004284] border border-blue-200 px-3 py-1 rounded text-xs font-bold hover:bg-blue-100 flex items-center gap-1 transition shadow-sm"
                    >
                      🖨️ Imprimir
                    </button>
                    <button 
                      onClick={() => borrarVenta(venta)}
                      className="bg-red-50 text-red-600 border border-red-200 px-3 py-1 rounded text-xs font-bold hover:bg-red-100 flex items-center gap-1 transition shadow-sm"
                    >
                      🗑️ Borrar
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}