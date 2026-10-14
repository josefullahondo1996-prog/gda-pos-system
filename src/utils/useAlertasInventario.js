import { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';

const fechaLocalSinHora = () => {
  const fecha = new Date();
  fecha.setHours(0, 0, 0, 0);
  return fecha;
};

const diasEntre = (desde, hasta) => Math.floor((hasta.getTime() - desde.getTime()) / 86_400_000);

export const useAlertasInventario = (empresaId, diasAvisoVencimiento = 30) => {
  const [estado, setEstado] = useState({ alertas: [], cargando: Boolean(empresaId), error: null });

  useEffect(() => {
    if (!empresaId) {
      setEstado({ alertas: [], cargando: false, error: null });
      return undefined;
    }

    let vigente = true;
    let temporizador;
    const cargar = async (inicial = false) => {
      if (inicial && vigente) setEstado((actual) => ({ ...actual, cargando: true, error: null }));
      try {
        const productos = [];
        const tamanoPagina = 1000;
        for (let inicio = 0; ; inicio += tamanoPagina) {
          const { data, error } = await supabase.from('productos')
            .select('id,nombre,codigo,stock_actual,alerta_stock_bajo,administra_stock,fecha_vencimiento,activo,tipo_producto')
            .eq('empresa_id', empresaId)
            .order('id', { ascending: true })
            .range(inicio, inicio + tamanoPagina - 1);
          if (error) throw error;
          productos.push(...(data || []));
          if (!data || data.length < tamanoPagina) break;
        }

        const hoy = fechaLocalSinHora();
        const limiteConfigurado = diasAvisoVencimiento !== null && diasAvisoVencimiento !== undefined && String(diasAvisoVencimiento).trim() !== ''
          ? Number(diasAvisoVencimiento) : NaN;
        const limiteDias = Number.isFinite(limiteConfigurado) && limiteConfigurado >= 0 ? limiteConfigurado : 30;
        const limiteVencimiento = new Date(hoy);
        limiteVencimiento.setDate(limiteVencimiento.getDate() + limiteDias);
        const alertas = [];

        productos.forEach((producto) => {
          if (producto.activo === false) return;
          const nombre = producto.nombre || 'Producto sin nombre';
          const codigo = producto.codigo || '';
          const stock = Number(producto.stock_actual);
          if (producto.administra_stock !== false && producto.stock_actual !== null && producto.stock_actual !== undefined && producto.stock_actual !== '' && Number.isFinite(stock)) {
            const umbral = producto.alerta_stock_bajo === null || producto.alerta_stock_bajo === undefined || producto.alerta_stock_bajo === ''
              ? 5 : Number(producto.alerta_stock_bajo);
            if (Number.isFinite(umbral) && stock <= umbral) {
              alertas.push({ id: `stock-${producto.id}`, tipo: 'stock', productoId: producto.id, nombre, codigo, stock, umbral, nivel: stock <= 0 ? 'critico' : 'aviso' });
            }
          }

          if (producto.fecha_vencimiento && Number.isFinite(stock) && stock > 0) {
            const soloFecha = String(producto.fecha_vencimiento).slice(0, 10);
            const partes = /^(\d{4})-(\d{2})-(\d{2})$/.exec(soloFecha);
            const fecha = partes ? new Date(Number(partes[1]), Number(partes[2]) - 1, Number(partes[3])) : new Date(producto.fecha_vencimiento);
            if (Number.isFinite(fecha.getTime()) && fecha <= limiteVencimiento) {
              const dias = diasEntre(hoy, fecha);
              alertas.push({ id: `vencimiento-${producto.id}`, tipo: 'vencimiento', productoId: producto.id, nombre, codigo, stock, fecha: soloFecha, dias, nivel: dias < 0 ? 'critico' : 'aviso' });
            }
          }
        });

        alertas.sort((a, b) => (a.nivel === b.nivel ? (a.tipo === b.tipo ? a.nombre.localeCompare(b.nombre) : a.tipo.localeCompare(b.tipo)) : a.nivel === 'critico' ? -1 : 1));
        if (vigente) setEstado({ alertas, cargando: false, error: null });
      } catch (error) {
        console.error('No se pudieron consultar las alertas de inventario:', error);
        if (vigente) setEstado((actual) => ({ ...actual, cargando: false, error: error?.message || 'Error al consultar productos.' }));
      }
    };

    const programarActualizacion = () => {
      clearTimeout(temporizador);
      temporizador = setTimeout(() => { cargar(); programarActualizacion(); }, 60_000);
    };
    const alVolver = () => { if (document.visibilityState === 'visible') cargar(); };
    cargar(true);
    programarActualizacion();
    document.addEventListener('visibilitychange', alVolver);
    return () => {
      vigente = false;
      clearTimeout(temporizador);
      document.removeEventListener('visibilitychange', alVolver);
    };
  }, [empresaId, diasAvisoVencimiento]);

  return estado;
};
