-- Endurece registrar_compra y registrar_o_editar_compra con los tipos reales de Supabase.
-- Mantiene las firmas usadas por AgregarCompra.jsx y GestorCompras.jsx.

CREATE OR REPLACE FUNCTION public.registrar_compra(
    p_compra jsonb,
    p_items jsonb
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_empresa_id uuid := mi_empresa_id();
    v_compra_id bigint;
    v_item jsonb;
    v_producto_id integer;
    v_cantidad numeric;
    v_costo numeric;
    v_ubicacion_id uuid := NULLIF(p_compra->>'ubicacion_id', '')::uuid;
BEGIN
    IF auth.uid() IS NULL OR v_empresa_id IS NULL THEN
        RAISE EXCEPTION 'Se requiere un usuario autenticado con empresa';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM usuarios
        WHERE auth_user_id = auth.uid()
          AND empresa_id = v_empresa_id
          AND activo = true
          AND permitir_acceso = true
    ) THEN
        RAISE EXCEPTION 'Usuario inactivo o sin permiso de acceso';
    END IF;

    IF jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
        RAISE EXCEPTION 'La compra debe tener al menos un producto';
    END IF;

    IF v_ubicacion_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM ubicaciones_comerciales
        WHERE id = v_ubicacion_id AND empresa_id = v_empresa_id AND activo = true
    ) THEN
        RAISE EXCEPTION 'Ubicación no válida para esta empresa';
    END IF;

    INSERT INTO compras (
        empresa_id, proveedor_nombre, nro_factura, total, saldo_pendiente,
        estado, estado_compra, fecha, ubicacion, ubicacion_id
    ) VALUES (
        v_empresa_id,
        p_compra->>'proveedor_nombre',
        p_compra->>'nro_factura',
        COALESCE((p_compra->>'total')::numeric, 0),
        COALESCE((p_compra->>'saldo_pendiente')::numeric, 0),
        p_compra->>'estado',
        p_compra->>'estado_compra',
        COALESCE((p_compra->>'fecha')::timestamptz, now()),
        p_compra->>'ubicacion',
        v_ubicacion_id
    )
    RETURNING id INTO v_compra_id;

    FOR v_item IN SELECT value FROM jsonb_array_elements(p_items)
    LOOP
        v_producto_id := NULLIF(v_item->>'producto_id', '')::integer;
        v_cantidad := COALESCE((v_item->>'cantidad')::numeric, 0);
        v_costo := COALESCE((v_item->>'costo_unitario')::numeric, 0);

        IF v_producto_id IS NULL OR v_cantidad <= 0 OR v_costo < 0 THEN
            RAISE EXCEPTION 'Ítem de compra inválido';
        END IF;

        PERFORM 1
        FROM productos
        WHERE id = v_producto_id AND empresa_id = v_empresa_id
        FOR UPDATE;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'Producto no encontrado en la empresa';
        END IF;

        INSERT INTO detalle_compras (
            empresa_id, compra_id, producto_id, nombre_producto, codigo_sku,
            cantidad, costo_unitario, subtotal
        ) VALUES (
            v_empresa_id, v_compra_id, v_producto_id,
            v_item->>'nombre_producto', v_item->>'codigo_sku',
            v_cantidad, v_costo, v_cantidad * v_costo
        );

        UPDATE productos
        SET stock_actual = GREATEST(0, stock_actual + v_cantidad),
            precio_compra = v_costo
        WHERE id = v_producto_id AND empresa_id = v_empresa_id;
    END LOOP;

    RETURN v_compra_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.registrar_o_editar_compra(
    p_compra jsonb,
    p_items jsonb,
    p_compra_id bigint DEFAULT NULL::bigint,
    p_ubicacion_id uuid DEFAULT NULL::uuid
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_empresa_id uuid := mi_empresa_id();
    v_compra_id bigint;
    v_item jsonb;
    v_detalle_viejo record;
    v_producto_id integer;
    v_cantidad numeric;
    v_costo numeric;
    v_ajustes jsonb := '{}'::jsonb;
    v_ubicacion_id uuid := p_ubicacion_id;
    v_ubicacion_anterior uuid;
    v_fila_id uuid;
    v_stock numeric;
BEGIN
    IF auth.uid() IS NULL OR v_empresa_id IS NULL THEN
        RAISE EXCEPTION 'Se requiere un usuario autenticado con empresa';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM usuarios
        WHERE auth_user_id = auth.uid()
          AND empresa_id = v_empresa_id
          AND activo = true
          AND permitir_acceso = true
    ) THEN
        RAISE EXCEPTION 'Usuario inactivo o sin permiso de acceso';
    END IF;

    IF jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
        RAISE EXCEPTION 'La compra debe tener al menos un producto';
    END IF;

    IF v_ubicacion_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM ubicaciones_comerciales
        WHERE id = v_ubicacion_id AND empresa_id = v_empresa_id AND activo = true
    ) THEN
        RAISE EXCEPTION 'Ubicación no válida para esta empresa';
    END IF;

    IF p_compra_id IS NULL THEN
        INSERT INTO compras (
            empresa_id, proveedor_nombre, nro_factura, total, saldo_pendiente,
            estado, estado_compra, fecha, ubicacion, ubicacion_id
        ) VALUES (
            v_empresa_id, p_compra->>'proveedor_nombre', p_compra->>'nro_factura',
            COALESCE((p_compra->>'total')::numeric, 0),
            COALESCE((p_compra->>'saldo_pendiente')::numeric, 0),
            p_compra->>'estado', p_compra->>'estado_compra',
            COALESCE((p_compra->>'fecha')::timestamptz, now()),
            p_compra->>'ubicacion', v_ubicacion_id
        ) RETURNING id INTO v_compra_id;
    ELSE
        SELECT id, ubicacion_id INTO v_compra_id, v_ubicacion_anterior
        FROM compras
        WHERE id = p_compra_id AND empresa_id = v_empresa_id
        FOR UPDATE;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'Compra no encontrada en la empresa';
        END IF;

        FOR v_detalle_viejo IN
            SELECT producto_id, cantidad FROM detalle_compras
            WHERE compra_id = v_compra_id AND empresa_id = v_empresa_id
        LOOP
            IF v_detalle_viejo.producto_id IS NOT NULL THEN
                v_ajustes := jsonb_set(
                    v_ajustes,
                    ARRAY[v_detalle_viejo.producto_id::text],
                    to_jsonb(COALESCE((v_ajustes->>v_detalle_viejo.producto_id::text)::numeric, 0) - v_detalle_viejo.cantidad)
                );

                IF v_ubicacion_anterior IS NOT NULL THEN
                    UPDATE producto_stock_ubicacion
                    SET cantidad = GREATEST(0, cantidad - v_detalle_viejo.cantidad),
                        actualizado_en = now()
                    WHERE empresa_id = v_empresa_id
                      AND producto_id = v_detalle_viejo.producto_id
                      AND ubicacion_id = v_ubicacion_anterior;
                END IF;
            END IF;
        END LOOP;

        DELETE FROM detalle_compras
        WHERE compra_id = v_compra_id AND empresa_id = v_empresa_id;

        UPDATE compras SET
            proveedor_nombre = p_compra->>'proveedor_nombre',
            nro_factura = p_compra->>'nro_factura',
            total = COALESCE((p_compra->>'total')::numeric, 0),
            saldo_pendiente = COALESCE((p_compra->>'saldo_pendiente')::numeric, 0),
            estado = p_compra->>'estado',
            estado_compra = p_compra->>'estado_compra',
            fecha = COALESCE((p_compra->>'fecha')::timestamptz, fecha),
            ubicacion = p_compra->>'ubicacion',
            ubicacion_id = COALESCE(v_ubicacion_id, v_ubicacion_anterior)
        WHERE id = v_compra_id AND empresa_id = v_empresa_id;
    END IF;

    FOR v_item IN SELECT value FROM jsonb_array_elements(p_items)
    LOOP
        v_producto_id := NULLIF(v_item->>'producto_id', '')::integer;
        v_cantidad := COALESCE((v_item->>'cantidad')::numeric, 0);
        v_costo := COALESCE((v_item->>'costo_unitario')::numeric, 0);
        IF v_producto_id IS NULL OR v_cantidad <= 0 OR v_costo < 0 THEN
            RAISE EXCEPTION 'Ítem de compra inválido';
        END IF;

        PERFORM 1
        FROM productos
        WHERE id = v_producto_id AND empresa_id = v_empresa_id
        FOR UPDATE;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'Producto no encontrado en la empresa';
        END IF;

        INSERT INTO detalle_compras (
            empresa_id, compra_id, producto_id, nombre_producto, codigo_sku,
            cantidad, costo_unitario, subtotal
        ) VALUES (
            v_empresa_id, v_compra_id, v_producto_id,
            v_item->>'nombre_producto', v_item->>'codigo_sku',
            v_cantidad, v_costo, v_cantidad * v_costo
        );

        UPDATE productos
        SET precio_compra = v_costo
        WHERE id = v_producto_id AND empresa_id = v_empresa_id;

        v_ajustes := jsonb_set(
            v_ajustes,
            ARRAY[v_producto_id::text],
            to_jsonb(COALESCE((v_ajustes->>v_producto_id::text)::numeric, 0) + v_cantidad)
        );
    END LOOP;

    FOR v_producto_id IN SELECT key::integer FROM jsonb_each(v_ajustes)
    LOOP
        v_cantidad := (v_ajustes->>v_producto_id::text)::numeric;
        UPDATE productos
        SET stock_actual = GREATEST(0, stock_actual + v_cantidad)
        WHERE id = v_producto_id AND empresa_id = v_empresa_id;

        IF v_ubicacion_id IS NOT NULL AND v_cantidad <> 0 THEN
            SELECT id, cantidad INTO v_fila_id, v_stock
            FROM producto_stock_ubicacion
            WHERE empresa_id = v_empresa_id
              AND producto_id = v_producto_id
              AND ubicacion_id = v_ubicacion_id
            FOR UPDATE;

            IF v_fila_id IS NULL THEN
                INSERT INTO producto_stock_ubicacion (empresa_id, producto_id, ubicacion_id, cantidad)
                VALUES (v_empresa_id, v_producto_id, v_ubicacion_id, GREATEST(0, v_cantidad));
            ELSE
                UPDATE producto_stock_ubicacion
                SET cantidad = GREATEST(0, v_stock + v_cantidad), actualizado_en = now()
                WHERE id = v_fila_id AND empresa_id = v_empresa_id;
            END IF;
        END IF;
    END LOOP;

    RETURN v_compra_id;
END;
$function$;
