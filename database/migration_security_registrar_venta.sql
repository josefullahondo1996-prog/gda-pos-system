-- Endurece registrar_venta usando los tipos reales del proyecto Supabase.
-- Mantiene la firma consumida por PuntoDeVenta.jsx.

CREATE OR REPLACE FUNCTION public.registrar_venta(
    p_venta jsonb,
    p_items jsonb,
    p_ubicacion_id uuid DEFAULT NULL::uuid
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_empresa_id uuid := mi_empresa_id();
    v_venta_id bigint;
    v_item jsonb;
    v_producto_id integer;
    v_cantidad numeric;
    v_precio numeric;
    v_stock_actual numeric;
    v_fila_ubicacion_id uuid;
    v_cantidad_ubicacion numeric;
    v_subtotal_calculado numeric := 0;
    v_descuento numeric := COALESCE((p_venta->>'descuento')::numeric, 0);
    v_cargo_embalaje numeric := COALESCE((p_venta->>'cargo_embalaje')::numeric, 0);
    v_total_enviado numeric := COALESCE((p_venta->>'total')::numeric, 0);
    v_total_calculado numeric;
    v_monto_pagado numeric := COALESCE((p_venta->>'monto_pagado')::numeric, 0);
    v_saldo_calculado numeric;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Se requiere una sesión autenticada';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM usuarios
        WHERE auth_user_id = auth.uid()
          AND empresa_id = v_empresa_id
          AND activo = true
          AND permitir_acceso = true
    ) THEN
        RAISE EXCEPTION 'Usuario inactivo o sin permiso de acceso';
    END IF;

    IF NOT tiene_permiso('ventas_pos', 'Acceder al Punto de Venta')
       AND NOT EXISTS (
           SELECT 1
           FROM usuarios u
           JOIN roles r ON r.id = u.rol_id
           WHERE u.auth_user_id = auth.uid()
             AND u.empresa_id = v_empresa_id
             AND lower(r.nombre) LIKE '%admin%'
       ) THEN
        RAISE EXCEPTION 'No tenés permiso para registrar ventas';
    END IF;

    IF v_empresa_id IS NULL
       OR jsonb_typeof(p_items) <> 'array'
       OR jsonb_array_length(p_items) = 0 THEN
        RAISE EXCEPTION 'Datos de venta incompletos';
    END IF;

    IF v_descuento < 0 OR v_cargo_embalaje < 0 THEN
        RAISE EXCEPTION 'Descuento o cargo de embalaje inválido';
    END IF;

    FOR v_item IN SELECT value FROM jsonb_array_elements(p_items)
    LOOP
        v_cantidad := COALESCE((v_item->>'cantidad')::numeric, 0);
        v_precio := COALESCE((v_item->>'precio_unitario')::numeric, 0);
        IF NULLIF(v_item->>'producto_id', '')::integer IS NULL OR v_cantidad <= 0 OR v_precio < 0 THEN
            RAISE EXCEPTION 'Ítem de venta inválido';
        END IF;
        v_subtotal_calculado := v_subtotal_calculado + (v_cantidad * v_precio);
    END LOOP;

    IF v_descuento > v_subtotal_calculado THEN
        RAISE EXCEPTION 'El descuento no puede superar el subtotal';
    END IF;

    v_total_calculado := GREATEST(0, v_subtotal_calculado - v_descuento + v_cargo_embalaje);
    IF abs(v_total_enviado - v_total_calculado) > 0.01 THEN
        RAISE EXCEPTION 'El total de la venta no coincide con sus líneas';
    END IF;

    IF v_monto_pagado < 0 THEN
        RAISE EXCEPTION 'El monto pagado no puede ser negativo';
    END IF;
    v_saldo_calculado := GREATEST(0, v_total_calculado - v_monto_pagado);

    IF p_ubicacion_id IS NOT NULL AND NOT EXISTS (
        SELECT 1
        FROM ubicaciones_comerciales
        WHERE id = p_ubicacion_id
          AND empresa_id = v_empresa_id
          AND activo = true
    ) THEN
        RAISE EXCEPTION 'Ubicación no válida para esta empresa';
    END IF;

    INSERT INTO ventas (
        empresa_id, cliente, total, metodo_pago, estado_pago, monto_pagado,
        saldo_pendiente, articulos, descuento, cargo_embalaje, nota_venta,
        fecha, caja_id, grupo_precio, tipo_servicio, personal_servicio,
        detalle_pagos, ubicacion_id
    )
    VALUES (
        v_empresa_id,
        p_venta->>'cliente',
        v_total_calculado,
        p_venta->>'metodo_pago',
        p_venta->>'estado_pago',
        v_monto_pagado,
        v_saldo_calculado,
        COALESCE((p_venta->>'articulos')::int, 0),
        COALESCE((p_venta->>'descuento')::numeric, 0),
        COALESCE((p_venta->>'cargo_embalaje')::numeric, 0),
        p_venta->>'nota_venta',
        COALESCE((p_venta->>'fecha')::timestamptz, now()),
        NULLIF(p_venta->>'caja_id', '')::bigint,
        p_venta->>'grupo_precio',
        p_venta->>'tipo_servicio',
        p_venta->>'personal_servicio',
        p_venta->'detalle_pagos',
        p_ubicacion_id
    )
    RETURNING id INTO v_venta_id;

    FOR v_item IN SELECT value FROM jsonb_array_elements(p_items)
    LOOP
        v_producto_id := NULLIF(v_item->>'producto_id', '')::integer;
        v_cantidad := COALESCE((v_item->>'cantidad')::numeric, 0);

        IF v_producto_id IS NULL OR v_cantidad <= 0 THEN
            RAISE EXCEPTION 'Ítem de venta inválido';
        END IF;

        SELECT stock_actual INTO v_stock_actual
        FROM productos
        WHERE id = v_producto_id
          AND empresa_id = v_empresa_id
        FOR UPDATE;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Producto no encontrado en la empresa';
        END IF;

        IF v_stock_actual IS NOT NULL AND v_stock_actual < v_cantidad THEN
            RAISE EXCEPTION 'Stock insuficiente para el producto %: disponible %, solicitado %',
                v_item->>'nombre_producto', v_stock_actual, v_cantidad;
        END IF;

        UPDATE productos
        SET stock_actual = stock_actual - v_cantidad
        WHERE id = v_producto_id
          AND empresa_id = v_empresa_id;

        INSERT INTO detalle_ventas (
            empresa_id, venta_id, producto_id, nombre_producto, cantidad,
            precio_unitario, subtotal
        )
        VALUES (
            v_empresa_id,
            v_venta_id,
            v_producto_id,
            v_item->>'nombre_producto',
            v_cantidad,
            COALESCE((v_item->>'precio_unitario')::numeric, 0),
            v_cantidad * COALESCE((v_item->>'precio_unitario')::numeric, 0)
        );

        IF p_ubicacion_id IS NOT NULL THEN
            SELECT id, cantidad INTO v_fila_ubicacion_id, v_cantidad_ubicacion
            FROM producto_stock_ubicacion
            WHERE empresa_id = v_empresa_id
              AND producto_id = v_producto_id
              AND ubicacion_id = p_ubicacion_id
            FOR UPDATE;

            IF v_fila_ubicacion_id IS NULL THEN
                INSERT INTO producto_stock_ubicacion (
                    empresa_id,
                    producto_id,
                    ubicacion_id,
                    cantidad,
                    actualizado_en
                )
                VALUES (
                    v_empresa_id,
                    v_producto_id,
                    p_ubicacion_id,
                    GREATEST(0, COALESCE(v_stock_actual, 0) - v_cantidad),
                    now()
                );
            ELSE
                UPDATE producto_stock_ubicacion
                SET cantidad = GREATEST(0, v_cantidad_ubicacion - v_cantidad),
                    actualizado_en = now()
                WHERE id = v_fila_ubicacion_id
                  AND empresa_id = v_empresa_id;
            END IF;
        END IF;
    END LOOP;

    RETURN v_venta_id;
END;
$function$;
