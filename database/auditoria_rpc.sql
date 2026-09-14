-- Auditoria de funciones RPC sensibles. Esta consulta es de solo lectura.

SELECT
    n.nspname AS esquema,
    p.proname AS funcion,
    pg_get_function_identity_arguments(p.oid) AS argumentos,
    pg_get_userbyid(p.proowner) AS propietario,
    p.prosecdef AS security_definer,
    p.proleakproof AS leakproof,
    pg_get_functiondef(p.oid) AS definicion
FROM pg_proc AS p
JOIN pg_namespace AS n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN (
      'registrar_venta',
      'registrar_compra',
      'registrar_o_editar_compra',
      'descontar_stock',
      'ajustar_stock_ubicacion_tx',
              'anular_venta',
              'devolver_venta',
              'revertir_venta',
      'tiene_permiso',
      'empresa_actual',
      'mi_empresa_id'
  )
ORDER BY p.proname, argumentos;

-- Permisos de ejecucion de las funciones sensibles.
SELECT
    routine_schema,
    routine_name,
    specific_name,
    grantee,
    privilege_type
FROM information_schema.routine_privileges
WHERE routine_schema = 'public'
  AND routine_name IN (
      'registrar_venta',
      'registrar_compra',
      'registrar_o_editar_compra',
      'descontar_stock',
      'ajustar_stock_ubicacion_tx',
      'anular_venta',
      'devolver_venta',
      'revertir_venta'
  )
ORDER BY routine_name, grantee, privilege_type;
