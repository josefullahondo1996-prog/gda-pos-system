-- Elimina una venta y sus relaciones en una sola transaccion.
-- Requiere Borrar venta; si la venta esta activa tambien requiere Anular venta.

CREATE OR REPLACE FUNCTION public.eliminar_venta(
    p_venta_id integer,
    p_empresa_id uuid
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

    IF NOT tiene_permiso('ventas_pos', 'Borrar venta')
       AND NOT EXISTS (
           SELECT 1 FROM usuarios u JOIN roles r ON r.id = u.rol_id
           WHERE u.auth_user_id = auth.uid() AND u.empresa_id = p_empresa_id
             AND lower(r.nombre) LIKE '%admin%'
       ) THEN
        RAISE EXCEPTION 'No tenés permiso para borrar ventas';
    END IF;

    SELECT * INTO v_venta
    FROM ventas
    WHERE id = p_venta_id AND empresa_id = p_empresa_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Venta no encontrada';
    END IF;

    IF v_venta.estado_pago NOT IN ('Anulada', 'Devuelta') THEN
        IF NOT tiene_permiso('ventas_pos', 'Anular venta')
           AND NOT EXISTS (
               SELECT 1 FROM usuarios u JOIN roles r ON r.id = u.rol_id
               WHERE u.auth_user_id = auth.uid() AND u.empresa_id = p_empresa_id
                 AND lower(r.nombre) LIKE '%admin%'
           ) THEN
            RAISE EXCEPTION 'Se necesita permiso para anular la venta antes de borrarla';
        END IF;

        FOR v_item IN
            SELECT * FROM detalle_ventas
            WHERE venta_id = p_venta_id AND empresa_id = p_empresa_id
        LOOP
            IF v_item.producto_id IS NULL THEN
                CONTINUE;
            END IF;

            UPDATE productos
            SET stock_actual = COALESCE(stock_actual, 0) + v_item.cantidad
            WHERE id = v_item.producto_id AND empresa_id = p_empresa_id;

            IF NOT FOUND THEN
                RAISE EXCEPTION 'Producto de la venta no encontrado';
            END IF;

            IF v_venta.ubicacion_id IS NOT NULL THEN
                UPDATE producto_stock_ubicacion
                SET cantidad = cantidad + v_item.cantidad, actualizado_en = now()
                WHERE empresa_id = p_empresa_id
                  AND producto_id = v_item.producto_id
                  AND ubicacion_id = v_venta.ubicacion_id;

                IF NOT FOUND THEN
                    INSERT INTO producto_stock_ubicacion (empresa_id, producto_id, ubicacion_id, cantidad)
                    VALUES (p_empresa_id, v_item.producto_id, v_venta.ubicacion_id, v_item.cantidad);
                END IF;
            END IF;
        END LOOP;
    END IF;

    DELETE FROM detalle_pagos_venta WHERE venta_id = p_venta_id AND empresa_id = p_empresa_id;
    DELETE FROM detalle_ventas WHERE venta_id = p_venta_id AND empresa_id = p_empresa_id;
    DELETE FROM ventas WHERE id = p_venta_id AND empresa_id = p_empresa_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.eliminar_venta(integer, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.eliminar_venta(integer, uuid) TO authenticated, service_role;
