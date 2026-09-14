-- Deshabilita las sobrecargas legacy de descontar_stock.
-- El frontend usa registrar_venta, que actualiza stock dentro de una transaccion;
-- no hay llamadas directas a descontar_stock en src/.
-- Aplicar despues de migration_security_rpc.sql.

REVOKE EXECUTE ON FUNCTION public.descontar_stock(bigint, integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.descontar_stock(integer, numeric) FROM PUBLIC, anon, authenticated;

-- service_role queda disponible solo para tareas administrativas controladas.
GRANT EXECUTE ON FUNCTION public.descontar_stock(bigint, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.descontar_stock(integer, numeric) TO service_role;
