-- Importa una factura completa mediante el mismo flujo atómico del punto de venta,
-- y conserva el número externo de factura dentro de la misma transacción.
BEGIN;

CREATE OR REPLACE FUNCTION public.registrar_venta_importada(
  p_venta jsonb,
  p_items jsonb,
  p_ubicacion_id uuid DEFAULT NULL
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'auth'
AS $function$
DECLARE
  v_empresa_id uuid := public.mi_empresa_id();
  v_numero_factura_text text := NULLIF(btrim(p_venta->>'numero_factura'), '');
  v_numero_factura integer;
  v_numero_factura_numerico numeric;
  v_venta_id bigint;
  v_row_count integer;
BEGIN
  IF auth.uid() IS NULL OR v_empresa_id IS NULL THEN
    RAISE EXCEPTION 'Se requiere una sesión autenticada con empresa';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.usuarios u
    WHERE u.auth_user_id = auth.uid() AND u.empresa_id = v_empresa_id
      AND u.activo = true AND u.permitir_acceso = true
  ) THEN
    RAISE EXCEPTION 'Usuario inactivo o sin permiso de acceso';
  END IF;
  IF NOT public.tiene_permiso('ventas_pos', 'Acceder al Punto de Venta') AND NOT EXISTS (
    SELECT 1 FROM public.usuarios u JOIN public.roles r ON r.id = u.rol_id
    WHERE u.auth_user_id = auth.uid() AND u.empresa_id = v_empresa_id
      AND lower(r.nombre) LIKE '%admin%'
  ) THEN
    RAISE EXCEPTION 'No tenés permiso para registrar ventas';
  END IF;
  IF v_numero_factura_text IS NULL OR v_numero_factura_text !~ '^[0-9]+$' OR length(v_numero_factura_text) > 10 THEN
    RAISE EXCEPTION 'El número de factura debe ser un entero positivo de hasta 2.147.483.647';
  END IF;
  v_numero_factura_numerico := v_numero_factura_text::numeric;
  IF v_numero_factura_numerico < 1 OR v_numero_factura_numerico > 2147483647 THEN
    RAISE EXCEPTION 'El número de factura debe ser un entero positivo de hasta 2.147.483.647';
  END IF;
  v_numero_factura := v_numero_factura_numerico::integer;

  -- Evita duplicados por concurrencia sin crear un índice que pudiera fallar
  -- por números históricos repetidos ya existentes.
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_empresa_id::text || ':' || v_numero_factura::text, 0)
  );
  IF EXISTS (
    SELECT 1 FROM public.ventas
    WHERE empresa_id = v_empresa_id AND numero_factura = v_numero_factura
  ) THEN
    RAISE EXCEPTION 'La factura % ya existe en esta empresa', v_numero_factura;
  END IF;

  -- Este RPC valida acceso y permiso, registra la venta, descuenta existencias
  -- y crea sus detalles. Cualquier error cancela también esta operación.
  v_venta_id := public.registrar_venta(p_venta, p_items, p_ubicacion_id);
  UPDATE public.ventas
  SET numero_factura = v_numero_factura
  WHERE id = v_venta_id AND empresa_id = v_empresa_id;
  GET DIAGNOSTICS v_row_count = ROW_COUNT;
  IF v_row_count <> 1 THEN
    RAISE EXCEPTION 'No se pudo asignar el número de factura importado';
  END IF;
  RETURN v_venta_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.registrar_venta_importada(jsonb, jsonb, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.registrar_venta_importada(jsonb, jsonb, uuid) TO authenticated;

COMMIT;
