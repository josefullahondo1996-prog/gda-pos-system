-- Cierra el acceso anonimo a anulaciones y devoluciones sin reemplazar
-- funciones cuya firma real aun no fue auditada.

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
          AND p.proname IN ('anular_venta', 'devolver_venta', 'revertir_venta')
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
