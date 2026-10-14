-- Moneda original por operación. Los importes históricos y efectos de caja/stock
-- siguen en PYG en las columnas existentes; estas columnas conservan el valor y
-- tasa que vio/cobró el cliente para imprimir y consultar la venta correctamente.
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

CREATE OR REPLACE FUNCTION registrar_venta(
    p_venta jsonb,
    p_items jsonb,
    p_ubicacion_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_empresa_id uuid;
    v_venta_id uuid;
    v_ubicacion_id uuid;
    v_item jsonb;
    v_producto productos%ROWTYPE;
    v_producto_id uuid;
    v_cantidad numeric;
    v_precio numeric;
    v_componente jsonb;
    v_subproducto productos%ROWTYPE;
    v_subproducto_id uuid;
    v_cantidad_componente numeric;
    v_moneda text;
    v_tasa numeric;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Se requiere una sesión autenticada';
    END IF;

    v_empresa_id := NULLIF(p_venta->>'empresa_id', '')::uuid;
    v_moneda := upper(COALESCE(NULLIF(p_venta->>'moneda_venta', ''), 'PYG'));
    v_tasa := COALESCE(NULLIF(p_venta->>'tasa_negocio', '')::numeric, 1);
    v_ubicacion_id := COALESCE(p_ubicacion_id, NULLIF(p_venta->>'ubicacion_id', '')::uuid);
    IF v_empresa_id IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
        RAISE EXCEPTION 'Datos de venta incompletos';
    END IF;
    IF v_moneda NOT IN ('PYG', 'USD', 'EUR', 'BRL') OR v_tasa <= 0 THEN
        RAISE EXCEPTION 'Moneda o tasa de cambio inválida';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM usuarios
        WHERE auth_user_id = auth.uid()
          AND empresa_id = v_empresa_id
          AND activo = true
    ) THEN
        RAISE EXCEPTION 'No tenés acceso a esta empresa';
    END IF;

    INSERT INTO ventas (
        empresa_id, cliente, total, metodo_pago, estado_pago, monto_pagado,
        saldo_pendiente, articulos, descuento, cargo_embalaje, nota_venta,
        fecha, caja_id, usuario_nombre, personal_servicio, ubicacion_id,
        moneda_venta, tasa_negocio, total_moneda, monto_pagado_moneda, saldo_pendiente_moneda
    ) VALUES (
        v_empresa_id,
        p_venta->>'cliente',
        COALESCE((p_venta->>'total')::numeric, 0),
        p_venta->>'metodo_pago',
        p_venta->>'estado_pago',
        COALESCE((p_venta->>'monto_pagado')::numeric, 0),
        COALESCE((p_venta->>'saldo_pendiente')::numeric, 0),
        COALESCE((p_venta->>'articulos')::numeric, 0),
        COALESCE((p_venta->>'descuento')::numeric, 0),
        COALESCE((p_venta->>'cargo_embalaje')::numeric, 0),
        p_venta->>'nota_venta',
        COALESCE((p_venta->>'fecha')::timestamptz, now()),
        NULLIF(p_venta->>'caja_id', '')::uuid,
        p_venta->>'usuario_nombre',
        p_venta->>'personal_servicio',
        v_ubicacion_id,
        v_moneda, v_tasa,
        COALESCE(NULLIF(p_venta->>'total_moneda', '')::numeric, COALESCE((p_venta->>'total')::numeric, 0) / v_tasa),
        COALESCE(NULLIF(p_venta->>'monto_pagado_moneda', '')::numeric, COALESCE((p_venta->>'monto_pagado')::numeric, 0) / v_tasa),
        COALESCE(NULLIF(p_venta->>'saldo_pendiente_moneda', '')::numeric, COALESCE((p_venta->>'saldo_pendiente')::numeric, 0) / v_tasa)
    )
    RETURNING id INTO v_venta_id;

    FOR v_item IN SELECT value FROM jsonb_array_elements(p_items)
    LOOP
        v_producto_id := NULLIF(v_item->>'producto_id', '')::uuid;
        v_cantidad := COALESCE((v_item->>'cantidad')::numeric, 0);
        v_precio := COALESCE((v_item->>'precio_unitario')::numeric, 0);

        IF v_producto_id IS NULL OR v_cantidad <= 0 THEN
            RAISE EXCEPTION 'Ítem de venta inválido';
        END IF;

        SELECT * INTO v_producto
        FROM productos
        WHERE id = v_producto_id AND empresa_id = v_empresa_id
        FOR UPDATE;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Producto no encontrado en la empresa';
        END IF;
        IF v_producto.stock_actual < v_cantidad THEN
            RAISE EXCEPTION 'Stock insuficiente para el producto %', v_producto.nombre;
        END IF;

        UPDATE productos
        SET stock_actual = stock_actual - v_cantidad
        WHERE id = v_producto_id AND empresa_id = v_empresa_id;

        INSERT INTO detalle_ventas (
            empresa_id, venta_id, producto_id, nombre_producto, cantidad,
            precio_unitario, precio_costo, subtotal, moneda_venta,
            precio_unitario_moneda, subtotal_moneda
        ) VALUES (
            v_empresa_id, v_venta_id, v_producto_id,
            COALESCE(v_item->>'nombre_producto', v_producto.nombre),
            v_cantidad, v_precio, COALESCE(v_producto.precio_compra, 0),
            COALESCE((v_item->>'subtotal')::numeric, v_cantidad * v_precio),
            v_moneda,
            COALESCE(NULLIF(v_item->>'precio_unitario_moneda', '')::numeric, v_precio / v_tasa),
            COALESCE(NULLIF(v_item->>'subtotal_moneda', '')::numeric, COALESCE((v_item->>'subtotal')::numeric, v_cantidad * v_precio) / v_tasa)
        );

        PERFORM ajustar_stock_ubicacion_tx(v_empresa_id, v_producto_id, v_ubicacion_id, -v_cantidad);

        IF jsonb_typeof(v_producto.combo_productos) = 'array' THEN
            FOR v_componente IN SELECT value FROM jsonb_array_elements(v_producto.combo_productos)
            LOOP
                v_subproducto_id := NULLIF(COALESCE(v_componente->>'id', v_componente->>'producto_id'), '')::uuid;
                v_cantidad_componente := COALESCE((v_componente->>'cantidad')::numeric, 1) * v_cantidad;
                IF v_subproducto_id IS NULL OR v_cantidad_componente <= 0 THEN
                    RAISE EXCEPTION 'Componente de combo inválido';
                END IF;

                SELECT * INTO v_subproducto
                FROM productos
                WHERE id = v_subproducto_id AND empresa_id = v_empresa_id
                FOR UPDATE;

                IF NOT FOUND OR v_subproducto.stock_actual < v_cantidad_componente THEN
                    RAISE EXCEPTION 'Stock insuficiente para un componente del combo %', v_producto.nombre;
                END IF;

                UPDATE productos
                SET stock_actual = stock_actual - v_cantidad_componente
                WHERE id = v_subproducto_id AND empresa_id = v_empresa_id;
                PERFORM ajustar_stock_ubicacion_tx(v_empresa_id, v_subproducto_id, v_ubicacion_id, -v_cantidad_componente);
            END LOOP;
        END IF;
    END LOOP;

    RETURN v_venta_id;
END;
$$;
