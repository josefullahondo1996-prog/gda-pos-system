-- Crea las RPC de anulacion y devolucion compatibles con el esquema real.
-- ventas.id y detalle_ventas.producto_id usan integer en Supabase.
-- Requiere los permisos de rol ventas_pos: Anular venta / Devolver venta.

CREATE OR REPLACE FUNCTION public.revertir_venta(
    p_venta_id integer,
    p_empresa_id uuid,
    p_estado text,
    p_motivo text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_venta ventas%ROWTYPE;
    v_item detalle_ventas%ROWTYPE;
BEGIN
    IF auth.uid() IS NULL OR mi_empresa_id() IS NULL OR p_empresa_id <> mi_empresa_id() THEN
        RAISE EXCEPTION 'No tenés acceso a esta empresa';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM usuarios
        WHERE auth_user_id = auth.uid()
          AND empresa_id = p_empresa_id
          AND activo = true
          AND permitir_acceso = true
    ) THEN
        RAISE EXCEPTION 'Usuario inactivo o sin permiso de acceso';
    END IF;

    IF p_estado = 'Anulada' THEN
        IF NOT tiene_permiso('ventas_pos', 'Anular venta')
           AND NOT EXISTS (
               SELECT 1 FROM usuarios u JOIN roles r ON r.id = u.rol_id
               WHERE u.auth_user_id = auth.uid() AND u.empresa_id = p_empresa_id
                 AND lower(r.nombre) LIKE '%admin%'
           ) THEN
            RAISE EXCEPTION 'No tenés permiso para anular ventas';
        END IF;
    ELSIF p_estado = 'Devuelta' THEN
        IF NOT tiene_permiso('ventas_pos', 'Devolver venta')
           AND NOT EXISTS (
               SELECT 1 FROM usuarios u JOIN roles r ON r.id = u.rol_id
               WHERE u.auth_user_id = auth.uid() AND u.empresa_id = p_empresa_id
                 AND lower(r.nombre) LIKE '%admin%'
           ) THEN
            RAISE EXCEPTION 'No tenés permiso para devolver ventas';
        END IF;
    ELSE
        RAISE EXCEPTION 'Estado de reversión inválido';
    END IF;

    SELECT * INTO v_venta
    FROM ventas
    WHERE id = p_venta_id
      AND empresa_id = p_empresa_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Venta no encontrada';
    END IF;

    IF v_venta.estado_pago IN ('Anulada', 'Devuelta') THEN
        RETURN;
    END IF;

    FOR v_item IN
        SELECT * FROM detalle_ventas
        WHERE venta_id = p_venta_id
          AND empresa_id = p_empresa_id
    LOOP
        IF v_item.producto_id IS NULL THEN
            CONTINUE;
        END IF;

        UPDATE productos
        SET stock_actual = COALESCE(stock_actual, 0) + v_item.cantidad
        WHERE id = v_item.producto_id
          AND empresa_id = p_empresa_id;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Producto de la venta no encontrado';
        END IF;

        IF v_venta.ubicacion_id IS NOT NULL THEN
            UPDATE producto_stock_ubicacion
            SET cantidad = cantidad + v_item.cantidad,
                actualizado_en = now()
            WHERE empresa_id = p_empresa_id
              AND producto_id = v_item.producto_id
              AND ubicacion_id = v_venta.ubicacion_id;

            IF NOT FOUND THEN
                INSERT INTO producto_stock_ubicacion (
                    empresa_id, producto_id, ubicacion_id, cantidad
                ) VALUES (
                    p_empresa_id, v_item.producto_id, v_venta.ubicacion_id, v_item.cantidad
                );
            END IF;
        END IF;
    END LOOP;

    UPDATE ventas
    SET estado_pago = p_estado,
        motivo_anulacion = CASE
            WHEN p_estado = 'Anulada' THEN p_motivo
            ELSE motivo_anulacion
        END
    WHERE id = p_venta_id
      AND empresa_id = p_empresa_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.anular_venta(
    p_venta_id integer,
    p_empresa_id uuid,
    p_motivo text DEFAULT NULL
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
    SELECT public.revertir_venta(p_venta_id, p_empresa_id, 'Anulada', p_motivo);
$function$;

CREATE OR REPLACE FUNCTION public.devolver_venta(
    p_venta_id integer,
    p_empresa_id uuid
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
    SELECT public.revertir_venta(p_venta_id, p_empresa_id, 'Devuelta', NULL);
$function$;

REVOKE ALL ON FUNCTION public.revertir_venta(integer, uuid, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.anular_venta(integer, uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.devolver_venta(integer, uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.revertir_venta(integer, uuid, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.anular_venta(integer, uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.devolver_venta(integer, uuid) TO authenticated, service_role;
