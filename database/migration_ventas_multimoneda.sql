-- Moneda original por producto y venta.
-- Esta variante coincide con el esquema activo de GDA POS: productos.id,
-- ventas.id, detalle_ventas.venta_id y detalle_ventas.producto_id son int4;
-- registrar_venta devuelve bigint. Aplicar después de la migración que creó
-- el RPC transaccional actual. El preflight aborta antes del DDL si eso cambió.

DO $$
DECLARE
    v_producto_id_type text;
    v_venta_id_type text;
    v_detalle_venta_id_type text;
    v_detalle_producto_id_type text;
    v_rpc_return_type text;
BEGIN
    SELECT udt_name INTO v_producto_id_type
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'productos' AND column_name = 'id';

    SELECT udt_name INTO v_venta_id_type
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'ventas' AND column_name = 'id';

    SELECT udt_name INTO v_detalle_venta_id_type
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'detalle_ventas' AND column_name = 'venta_id';

    SELECT udt_name INTO v_detalle_producto_id_type
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'detalle_ventas' AND column_name = 'producto_id';

    IF v_producto_id_type IS DISTINCT FROM 'int4'
       OR v_venta_id_type IS DISTINCT FROM 'int4'
       OR v_detalle_venta_id_type IS DISTINCT FROM 'int4'
       OR v_detalle_producto_id_type IS DISTINCT FROM 'int4' THEN
        RAISE EXCEPTION 'Migración multimoneda cancelada: requiere int4 en productos.id, ventas.id, detalle_ventas.venta_id y detalle_ventas.producto_id. Tipos actuales: productos.id=%, ventas.id=%, detalle_ventas.venta_id=%, detalle_ventas.producto_id=%. No se aplicaron cambios.',
            COALESCE(v_producto_id_type, 'no existe'),
            COALESCE(v_venta_id_type, 'no existe'),
            COALESCE(v_detalle_venta_id_type, 'no existe'),
            COALESCE(v_detalle_producto_id_type, 'no existe');
    END IF;

    SELECT pg_catalog.format_type(p.prorettype, NULL)
      INTO v_rpc_return_type
    FROM pg_catalog.pg_proc AS p
    JOIN pg_catalog.pg_namespace AS n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'registrar_venta'
      AND pg_catalog.pg_get_function_identity_arguments(p.oid) =
          'p_venta jsonb, p_items jsonb, p_ubicacion_id uuid';

    IF v_rpc_return_type IS DISTINCT FROM 'bigint' THEN
        RAISE EXCEPTION 'Migración multimoneda cancelada: se esperaba registrar_venta(... ) RETURNS bigint y se encontró %. No se aplicaron cambios.',
            COALESCE(v_rpc_return_type, 'función no encontrada');
    END IF;

    IF pg_catalog.to_regprocedure('public.mi_empresa_id()') IS NULL
       OR pg_catalog.to_regprocedure('public.tiene_permiso(text,text)') IS NULL THEN
        RAISE EXCEPTION 'Migración multimoneda cancelada: faltan las funciones de empresa/permisos que usa registrar_venta.';
    END IF;
END;
$$;

ALTER TABLE public.productos
    ADD COLUMN IF NOT EXISTS moneda_precio text NOT NULL DEFAULT 'PYG',
    ADD COLUMN IF NOT EXISTS precio_compra_moneda numeric(20,4),
    ADD COLUMN IF NOT EXISTS precio_venta_moneda numeric(20,4);

UPDATE public.productos
SET precio_compra_moneda = precio_compra,
    precio_venta_moneda = precio_venta
WHERE moneda_precio = 'PYG'
  AND (precio_compra_moneda IS NULL OR precio_venta_moneda IS NULL);

ALTER TABLE public.ventas
    ADD COLUMN IF NOT EXISTS moneda_venta text NOT NULL DEFAULT 'PYG',
    ADD COLUMN IF NOT EXISTS tasa_negocio numeric(20,8) NOT NULL DEFAULT 1,
    ADD COLUMN IF NOT EXISTS total_moneda numeric(20,4),
    ADD COLUMN IF NOT EXISTS monto_pagado_moneda numeric(20,4),
    ADD COLUMN IF NOT EXISTS saldo_pendiente_moneda numeric(20,4);

ALTER TABLE public.detalle_ventas
    ADD COLUMN IF NOT EXISTS moneda_venta text NOT NULL DEFAULT 'PYG',
    ADD COLUMN IF NOT EXISTS precio_unitario_moneda numeric(20,4),
    ADD COLUMN IF NOT EXISTS subtotal_moneda numeric(20,4);

CREATE OR REPLACE FUNCTION public.registrar_venta(
    p_venta jsonb,
    p_items jsonb,
    p_ubicacion_id uuid DEFAULT NULL::uuid
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    v_empresa_id uuid := public.mi_empresa_id();
    v_venta_id bigint;
    v_item jsonb;
    v_producto_id integer;
    v_cantidad numeric;
    v_precio numeric;
    v_precio_moneda numeric;
    v_subtotal_moneda numeric;
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
    v_moneda text := upper(COALESCE(NULLIF(p_venta->>'moneda_venta', ''), 'PYG'));
    v_tasa numeric := COALESCE(NULLIF(p_venta->>'tasa_negocio', '')::numeric, 1);
    v_total_moneda numeric;
    v_monto_pagado_moneda numeric;
    v_saldo_pendiente_moneda numeric;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Se requiere una sesión autenticada';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM public.usuarios
        WHERE auth_user_id = auth.uid()
          AND empresa_id = v_empresa_id
          AND activo = true
          AND permitir_acceso = true
    ) THEN
        RAISE EXCEPTION 'Usuario inactivo o sin permiso de acceso';
    END IF;

    IF NOT public.tiene_permiso('ventas_pos', 'Acceder al Punto de Venta')
       AND NOT EXISTS (
            SELECT 1
            FROM public.usuarios AS u
            JOIN public.roles AS r ON r.id = u.rol_id
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
    IF v_moneda NOT IN ('PYG', 'USD', 'EUR', 'BRL') OR v_tasa <= 0 THEN
        RAISE EXCEPTION 'Moneda o tasa de cambio inválida';
    END IF;
    IF v_descuento < 0 OR v_cargo_embalaje < 0 THEN
        RAISE EXCEPTION 'Descuento o cargo de embalaje inválido';
    END IF;

    FOR v_item IN SELECT value FROM jsonb_array_elements(p_items)
    LOOP
        v_cantidad := COALESCE((v_item->>'cantidad')::numeric, 0);
        v_precio := COALESCE((v_item->>'precio_unitario')::numeric, 0);
        v_precio_moneda := COALESCE(NULLIF(v_item->>'precio_unitario_moneda', '')::numeric, v_precio / v_tasa);
        IF NULLIF(v_item->>'producto_id', '')::integer IS NULL
           OR v_cantidad <= 0 OR v_precio < 0 OR v_precio_moneda < 0 THEN
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

    v_total_moneda := COALESCE(NULLIF(p_venta->>'total_moneda', '')::numeric, v_total_calculado / v_tasa);
    v_monto_pagado_moneda := COALESCE(NULLIF(p_venta->>'monto_pagado_moneda', '')::numeric, v_monto_pagado / v_tasa);
    v_saldo_pendiente_moneda := COALESCE(NULLIF(p_venta->>'saldo_pendiente_moneda', '')::numeric, v_saldo_calculado / v_tasa);
    IF v_total_moneda < 0 OR v_monto_pagado_moneda < 0 OR v_saldo_pendiente_moneda < 0 THEN
        RAISE EXCEPTION 'Los importes en la moneda de venta no pueden ser negativos';
    END IF;

    IF p_ubicacion_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM public.ubicaciones_comerciales
        WHERE id = p_ubicacion_id AND empresa_id = v_empresa_id AND activo = true
    ) THEN
        RAISE EXCEPTION 'Ubicación no válida para esta empresa';
    END IF;

    INSERT INTO public.ventas (
        empresa_id, cliente, total, metodo_pago, estado_pago, monto_pagado,
        saldo_pendiente, articulos, descuento, cargo_embalaje, nota_venta,
        fecha, caja_id, grupo_precio, tipo_servicio, personal_servicio,
        detalle_pagos, ubicacion_id, moneda_venta, tasa_negocio, total_moneda,
        monto_pagado_moneda, saldo_pendiente_moneda
    ) VALUES (
        v_empresa_id,
        p_venta->>'cliente',
        v_total_calculado,
        p_venta->>'metodo_pago',
        p_venta->>'estado_pago',
        v_monto_pagado,
        v_saldo_calculado,
        COALESCE((p_venta->>'articulos')::int, 0),
        v_descuento,
        v_cargo_embalaje,
        p_venta->>'nota_venta',
        COALESCE((p_venta->>'fecha')::timestamptz, now()),
        NULLIF(p_venta->>'caja_id', '')::bigint,
        p_venta->>'grupo_precio',
        p_venta->>'tipo_servicio',
        p_venta->>'personal_servicio',
        p_venta->'detalle_pagos',
        p_ubicacion_id,
        v_moneda,
        v_tasa,
        v_total_moneda,
        v_monto_pagado_moneda,
        v_saldo_pendiente_moneda
    ) RETURNING id INTO v_venta_id;

    FOR v_item IN SELECT value FROM jsonb_array_elements(p_items)
    LOOP
        v_producto_id := NULLIF(v_item->>'producto_id', '')::integer;
        v_cantidad := COALESCE((v_item->>'cantidad')::numeric, 0);
        v_precio := COALESCE((v_item->>'precio_unitario')::numeric, 0);
        v_precio_moneda := COALESCE(NULLIF(v_item->>'precio_unitario_moneda', '')::numeric, v_precio / v_tasa);
        v_subtotal_moneda := COALESCE(NULLIF(v_item->>'subtotal_moneda', '')::numeric, (v_cantidad * v_precio) / v_tasa);

        IF v_producto_id IS NULL OR v_cantidad <= 0 THEN
            RAISE EXCEPTION 'Ítem de venta inválido';
        END IF;

        SELECT stock_actual INTO v_stock_actual
        FROM public.productos
        WHERE id = v_producto_id AND empresa_id = v_empresa_id
        FOR UPDATE;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'Producto no encontrado en la empresa';
        END IF;
        IF v_stock_actual IS NOT NULL AND v_stock_actual < v_cantidad THEN
            RAISE EXCEPTION 'Stock insuficiente para el producto %: disponible %, solicitado %',
                v_item->>'nombre_producto', v_stock_actual, v_cantidad;
        END IF;

        UPDATE public.productos
        SET stock_actual = stock_actual - v_cantidad
        WHERE id = v_producto_id AND empresa_id = v_empresa_id;

        INSERT INTO public.detalle_ventas (
            empresa_id, venta_id, producto_id, nombre_producto, cantidad,
            precio_unitario, subtotal, moneda_venta,
            precio_unitario_moneda, subtotal_moneda
        ) VALUES (
            v_empresa_id, v_venta_id::integer, v_producto_id,
            v_item->>'nombre_producto', v_cantidad, v_precio,
            v_cantidad * v_precio, v_moneda, v_precio_moneda, v_subtotal_moneda
        );

        IF p_ubicacion_id IS NOT NULL THEN
            SELECT id, cantidad INTO v_fila_ubicacion_id, v_cantidad_ubicacion
            FROM public.producto_stock_ubicacion
            WHERE empresa_id = v_empresa_id
              AND producto_id = v_producto_id
              AND ubicacion_id = p_ubicacion_id
            FOR UPDATE;

            IF v_fila_ubicacion_id IS NULL THEN
                INSERT INTO public.producto_stock_ubicacion (
                    empresa_id, producto_id, ubicacion_id, cantidad, actualizado_en
                ) VALUES (
                    v_empresa_id, v_producto_id, p_ubicacion_id,
                    GREATEST(0, COALESCE(v_stock_actual, 0) - v_cantidad), now()
                );
            ELSE
                UPDATE public.producto_stock_ubicacion
                SET cantidad = GREATEST(0, v_cantidad_ubicacion - v_cantidad),
                    actualizado_en = now()
                WHERE id = v_fila_ubicacion_id AND empresa_id = v_empresa_id;
            END IF;
        END IF;
    END LOOP;

    RETURN v_venta_id;
END;
$$;

REVOKE ALL ON FUNCTION public.registrar_venta(jsonb, jsonb, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.registrar_venta(jsonb, jsonb, uuid) TO authenticated;
