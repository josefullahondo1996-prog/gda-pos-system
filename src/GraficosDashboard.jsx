import { useEffect, useState } from 'react';
import { supabase } from './supabaseClient';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

export default function GraficosDashboard() {
  const [datosVentas, setDatosVentas] = useState([]);

  useEffect(() => {
    cargarDatosGrafico();
  }, []);

  const cargarDatosGrafico = async () => {
    // Traemos las ventas reales de Supabase
    const { data, error } = await supabase
      .from('ventas')
      .select('fecha, total')
      .order('fecha', { ascending: true });

    if (!error && data) {
      // Agrupamos las ventas por día para el gráfico
      const ventasAgrupadas = data.reduce((acc, venta) => {
        const fechaCorta = new Date(venta.fecha).toLocaleDateString('es-PY', { day: '2-digit', month: 'short' });
        
        if (!acc[fechaCorta]) {
          acc[fechaCorta] = { fecha: fechaCorta, total: 0 };
        }
        acc[fechaCorta].total += Number(venta.total);
        return acc;
      }, {});

      setDatosVentas(Object.values(ventasAgrupadas));
    }
  };

  // Datos de demostración para el Top 5 
  // (Para hacerlo real más adelante, necesitaremos una tabla "detalle_ventas")
  const topProductos = [
    { id: 1, nombre: "Mano de obra", monto: "9.580.000" },
    { id: 2, nombre: "Bateria CL-60VD 12V", monto: "4.820.000" },
    { id: 3, nombre: "Aceite Super 20w50", monto: "3.400.000" },
    { id: 4, nombre: "Bateria CL95HDI", monto: "3.150.000" },
    { id: 5, nombre: "Limpiaparabrisas 18\"", monto: "1.200.000" },
  ];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-6">
      
      {/* Gráfico Principal (Ocupa 2 columnas) */}
      <div className="lg:col-span-2 bg-white p-6 rounded-lg shadow-md border-t-4 border-[#004284]">
        <h2 className="text-lg font-bold text-[#004284] mb-4 flex items-center gap-2">
          📊 Evolución de Ventas
        </h2>
        <div className="h-72 w-full">
          {datosVentas.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={datosVentas} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorTotal" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#004284" stopOpacity={0.8}/>
                    <stop offset="95%" stopColor="#004284" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <XAxis dataKey="fecha" stroke="#8884d8" fontSize={12} />
                <YAxis stroke="#8884d8" fontSize={12} />
                <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.5} />
                <Tooltip formatter={(value) => `Gs ${value.toLocaleString('es-PY')}`} />
                <Area type="monotone" dataKey="total" stroke="#004284" fillOpacity={1} fill="url(#colorTotal)" />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex h-full items-center justify-center text-gray-400">
              Registra más ventas para ver la evolución de la gráfica.
            </div>
          )}
        </div>
      </div>

      {/* Top 5 Productos (Ocupa 1 columna) */}
      <div className="lg:col-span-1 bg-white p-6 rounded-lg shadow-md border-t-4 border-yellow-500">
        <h2 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
          🏆 Top 5 Productos
        </h2>
        <div className="flex flex-col gap-4">
          {topProductos.map((prod, index) => (
            <div key={prod.id} className="flex justify-between items-center border-b pb-2 last:border-0">
              <div className="flex items-center gap-3">
                <span className={`font-bold text-sm w-6 h-6 flex items-center justify-center rounded-full text-white ${index === 0 ? 'bg-yellow-500' : index === 1 ? 'bg-gray-400' : index === 2 ? 'bg-orange-400' : 'bg-gray-200 text-gray-600'}`}>
                  {index + 1}
                </span>
                <p className="text-sm font-medium text-gray-700 w-32 truncate" title={prod.nombre}>
                  {prod.nombre}
                </p>
              </div>
              <span className="text-sm font-bold text-[#28a745]">Gs {prod.monto}</span>
            </div>
          ))}
        </div>
      </div>

    </div>
  );
}