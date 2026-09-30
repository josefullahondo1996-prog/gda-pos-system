import { supabase } from '../supabaseClient';

export async function registrarPagoCliente({
  empresaId,
  clienteId = null,
  ventaId = null,
  monto,
  metodoPago = 'Efectivo',
  nota = null,
  fecha = new Date().toISOString(),
  cuentaPago = null,
  cuentaId = null,
  documentoUrl = null,
}) {
  const { data, error } = await supabase.rpc('registrar_pago_cliente_y_aplicar', {
    p_empresa_id: empresaId,
    p_cliente_id: clienteId,
    p_venta_id: ventaId,
    p_monto: Number(monto),
    p_metodo_pago: metodoPago,
    p_nota: nota,
    p_fecha: fecha,
    p_cuenta_pago: cuentaPago,
    p_cuenta_id: cuentaId,
    p_documento_url: documentoUrl,
  });
  if (error) throw error;
  return data;
}
