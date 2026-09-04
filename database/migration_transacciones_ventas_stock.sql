-- Operaciones atomicas de ventas, stock, anulaciones y devoluciones.
-- Aplicar en Supabase antes de quitar los updates de stock del frontend.

ALTER TABLE ventas ADD COLUMN IF NOT EXISTS ubicacion_id uuid;
ALTER TABLE ventas ADD COLUMN IF NOT EXISTS motivo_anulacion text;

CREATE TABLE IF NOT EXISTS producto_stock_ubicacion (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id uuid NOT NULL,
    producto_id uuid NOT NULL,
    ubicacion_id uuid NOT NULL,
    cantidad numeric NOT NULL DEFAULT 0,
    actualizado_en timestamptz NOT NULL DEFAULT now(),
    UNIQUE (empresa_id, producto_id, ubicacion_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_stock_ubicacion_unico
    ON producto_stock_ubicacion (empresa_id, producto_id, ubicacion_id);

ALTER TABLE producto_stock_ubicacion ADD COLUMN IF NOT EXISTS actualizado_en timestamptz NOT NULL DEFAULT now();

DROP FUNCTION IF EXISTS registrar_venta(jsonb, jsonb, uuid);

CREATE OR REPLACE FUNCTION ajustar_stock_ubicacion_tx(
    p_empresa_id uuid,
    p_producto_id uuid,
    p_ubicacion_id uuid,
    p_delta numeric
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF p_ubicacion_id IS NULL OR p_delta = 0 THEN
        RETURN;
    END IF;

    INSERT INTO producto_stock_ubicacion (empresa_id, producto_id, ubicacion_id, cantidad, actualizado_en)
    VALUES (p_empresa_id, p_producto_id, p_ubicacion_id, GREATEST(0, p_delta), now())
    ON CONFLICT (empresa_id, producto_id, ubicacion_id)
    DO UPDATE SET
        cantidad = GREATEST(0, producto_stock_ubicacion.cantidad + p_delta),
        actualizado_en = now();
END;
$$;

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
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Se requiere una sesión autenticada';
    END IF;

    v_empresa_id := NULLIF(p_venta->>'empresa_id', '')::uuid;
    v_ubicacion_id := COALESCE(p_ubicacion_id, NULLIF(p_venta->>'ubicacion_id', '')::uuid);
    IF v_empresa_id IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
        RAISE EXCEPTION 'Datos de venta incompletos';
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
        fecha, caja_id, usuario_nombre, personal_servicio, ubicacion_id
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
        v_ubicacion_id
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
            precio_unitario, precio_costo, subtotal
        ) VALUES (
            v_empresa_id, v_venta_id, v_producto_id,
            COALESCE(v_item->>'nombre_producto', v_producto.nombre),
            v_cantidad, v_precio, COALESCE(v_producto.precio_compra, 0),
            COALESCE((v_item->>'subtotal')::numeric, v_cantidad * v_precio)
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

CREATE OR REPLACE FUNCTION revertir_venta(
    p_venta_id uuid,
    p_empresa_id uuid,
    p_estado text,
    p_motivo text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_venta ventas%ROWTYPE;
    v_item detalle_ventas%ROWTYPE;
    v_producto productos%ROWTYPE;
    v_componente jsonb;
    v_subproducto productos%ROWTYPE;
    v_subproducto_id uuid;
    v_cantidad_componente numeric;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Se requiere una sesión autenticada';
    END IF;
    IF p_estado NOT IN ('Anulada', 'Devuelta') THEN
        RAISE EXCEPTION 'Estado de reversión inválido';
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM usuarios
        WHERE auth_user_id = auth.uid()
          AND empresa_id = p_empresa_id
          AND activo = true
    ) THEN
        RAISE EXCEPTION 'No tenés acceso a esta empresa';
    END IF;

    SELECT * INTO v_venta
    FROM ventas
    WHERE id = p_venta_id AND empresa_id = p_empresa_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Venta no encontrada';
    END IF;
    IF v_venta.estado_pago IN ('Anulada', 'Devuelta') THEN
        RETURN;
    END IF;

    FOR v_item IN
        SELECT * FROM detalle_ventas
        WHERE venta_id = p_venta_id AND empresa_id = p_empresa_id
    LOOP
        IF v_item.producto_id IS NULL THEN
            CONTINUE;
        END IF;

        SELECT * INTO v_producto
        FROM productos
        WHERE id = v_item.producto_id AND empresa_id = p_empresa_id
        FOR UPDATE;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Producto de la venta no encontrado';
        END IF;

        UPDATE productos
        SET stock_actual = stock_actual + v_item.cantidad
        WHERE id = v_item.producto_id AND empresa_id = p_empresa_id;

        PERFORM ajustar_stock_ubicacion_tx(
            p_empresa_id,
            v_item.producto_id,
            v_venta.ubicacion_id,
            v_item.cantidad
        );

        IF jsonb_typeof(v_producto.combo_productos) = 'array' THEN
            FOR v_componente IN SELECT value FROM jsonb_array_elements(v_producto.combo_productos)
            LOOP
                v_subproducto_id := NULLIF(COALESCE(v_componente->>'id', v_componente->>'producto_id'), '')::uuid;
                v_cantidad_componente := COALESCE((v_componente->>'cantidad')::numeric, 1) * v_item.cantidad;
                IF v_subproducto_id IS NULL OR v_cantidad_componente <= 0 THEN
                    RAISE EXCEPTION 'Componente de combo inválido';
                END IF;

                SELECT * INTO v_subproducto
                FROM productos
                WHERE id = v_subproducto_id AND empresa_id = p_empresa_id
                FOR UPDATE;

                IF NOT FOUND THEN
                    RAISE EXCEPTION 'Producto componente del combo no encontrado';
                END IF;

                UPDATE productos
                SET stock_actual = stock_actual + v_cantidad_componente
                WHERE id = v_subproducto_id AND empresa_id = p_empresa_id;
                PERFORM ajustar_stock_ubicacion_tx(
                    p_empresa_id,
                    v_subproducto_id,
                    v_venta.ubicacion_id,
                    v_cantidad_componente
                );
            END LOOP;
        END IF;
    END LOOP;

    UPDATE ventas
    SET estado_pago = p_estado,
        motivo_anulacion = CASE WHEN p_estado = 'Anulada' THEN p_motivo ELSE motivo_anulacion END
    WHERE id = p_venta_id AND empresa_id = p_empresa_id;
END;
$$;

CREATE OR REPLACE FUNCTION anular_venta(
    p_venta_id uuid,
    p_empresa_id uuid,
    p_motivo text DEFAULT NULL
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT revertir_venta(p_venta_id, p_empresa_id, 'Anulada', p_motivo);
$$;

CREATE OR REPLACE FUNCTION devolver_venta(
    p_venta_id uuid,
    p_empresa_id uuid
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT revertir_venta(p_venta_id, p_empresa_id, 'Devuelta', NULL);
$$;

REVOKE ALL ON FUNCTION ajustar_stock_ubicacion_tx(uuid, uuid, uuid, numeric) FROM PUBLIC;
REVOKE ALL ON FUNCTION revertir_venta(uuid, uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION registrar_venta(jsonb, jsonb, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION anular_venta(uuid, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION devolver_venta(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION registrar_venta(jsonb, jsonb, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION anular_venta(uuid, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION devolver_venta(uuid, uuid) TO authenticated;
