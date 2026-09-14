-- Restringe la ejecucion de RPCs que modifican ventas, compras y stock.
-- La aplicacion usa usuarios autenticados; anon no debe poder ejecutar estas funciones.

DO $$
DECLARE
    funcion record;
BEGIN
    FOR funcion IN
        SELECT
            n.nspname AS esquema,
            p.proname AS nombre,
            pg_get_function_identity_arguments(p.oid) AS argumentos
        FROM pg_proc AS p
        JOIN pg_namespace AS n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public'
          AND p.proname IN (
              'registrar_venta',
              'registrar_compra',
              'registrar_o_editar_compra',
              'descontar_stock',
              'ajustar_stock_ubicacion_tx'
          )
    LOOP
        EXECUTE format(
            'REVOKE EXECUTE ON FUNCTION %I.%I(%s) FROM PUBLIC, anon',
            funcion.esquema,
            funcion.nombre,
            funcion.argumentos
        );

        EXECUTE format(
            'GRANT EXECUTE ON FUNCTION %I.%I(%s) TO authenticated, service_role',
            funcion.esquema,
            funcion.nombre,
            funcion.argumentos
        );
    END LOOP;
END;
$$;
