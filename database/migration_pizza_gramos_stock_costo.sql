-- Normaliza recetas expresadas en gramos a la unidad interna (kg) que PyPOS
-- almacena para productos cuya unidad es Gramo. Mantiene costo por unidad
-- interna y evita comparar 180 g contra 10 kg como si fueran magnitudes iguales.
-- La columna era integer y redondeaba 1,5 kg a 2 kg al registrar gramos.
ALTER TABLE public.productos
  ALTER COLUMN stock_actual TYPE numeric USING stock_actual::numeric;

CREATE OR REPLACE FUNCTION public.consumir_pizza_linea(
  p_empresa_id uuid,
  p_venta_id integer,
  p_detalle_id integer,
  p_producto_id integer,
  p_cantidad numeric,
  p_ubicacion_id uuid,
  p_config jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=pg_catalog,public
AS $$
DECLARE
  v_presentacion_id uuid;
  v_item record;
  v_stock numeric;
  v_stock_sucursal numeric;
  v_tiene_sucursal boolean;
BEGIN
  v_presentacion_id := (p_config->>'presentacion_id')::uuid;

  FOR v_item IN
    SELECT
      ins.producto_id,
      sum(ins.cantidad_interna) * p_cantidad AS cantidad,
      sum(ins.costo_unitario * ins.cantidad_interna) * p_cantidad AS costo
    FROM (
      SELECT
        i.producto_id,
        CASE WHEN lower(btrim(i.unidad)) IN ('g','gr','gramo','gramos')
          THEN i.cantidad / 1000 ELSE i.cantidad END AS cantidad_interna,
        i.costo_unitario
      FROM public.pizza_ingredientes i
      WHERE i.empresa_id=p_empresa_id AND i.presentacion_id=v_presentacion_id
      UNION ALL
      SELECT
        ai.producto_id,
        CASE WHEN lower(btrim(ai.unidad)) IN ('g','gr','gramo','gramos')
          THEN ai.cantidad / 1000 ELSE ai.cantidad END AS cantidad_interna,
        ai.costo_unitario
      FROM public.pizza_adicional_ingredientes ai
      JOIN public.pizza_adicionales a
        ON a.id=ai.adicional_id AND a.empresa_id=ai.empresa_id
      WHERE ai.empresa_id=p_empresa_id
        AND a.id IN (
          SELECT value::uuid
          FROM jsonb_array_elements_text(coalesce(p_config->'adicionales','[]'::jsonb))
        )
    ) ins
    GROUP BY ins.producto_id
    ORDER BY ins.producto_id
  LOOP
    PERFORM 1
    FROM public.productos p
    WHERE p.id=v_item.producto_id
      AND p.empresa_id=p_empresa_id
      AND p.activo IS TRUE
      AND p.administra_stock IS TRUE
    FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'PIZZA_INGREDIENTE_NO_DISPONIBLE'; END IF;

    SELECT stock_actual INTO v_stock
    FROM public.productos
    WHERE id=v_item.producto_id AND empresa_id=p_empresa_id;
    IF v_stock IS NULL OR v_stock<v_item.cantidad THEN
      RAISE EXCEPTION 'PIZZA_INGREDIENTE_STOCK_INSUFICIENTE:%',v_item.producto_id;
    END IF;

    IF p_ubicacion_id IS NOT NULL THEN
      SELECT cantidad INTO v_stock_sucursal
      FROM public.producto_stock_ubicacion
      WHERE empresa_id=p_empresa_id
        AND producto_id=v_item.producto_id
        AND ubicacion_id=p_ubicacion_id
      FOR UPDATE;
      v_tiene_sucursal := FOUND;
      IF FOUND AND v_stock_sucursal<v_item.cantidad THEN
        RAISE EXCEPTION 'PIZZA_INGREDIENTE_STOCK_SUCURSAL_INSUFICIENTE:%',v_item.producto_id;
      END IF;
    END IF;

    UPDATE public.productos
    SET stock_actual=stock_actual-v_item.cantidad
    WHERE id=v_item.producto_id AND empresa_id=p_empresa_id;

    IF p_ubicacion_id IS NOT NULL THEN
      IF v_tiene_sucursal THEN
        UPDATE public.producto_stock_ubicacion
        SET cantidad=cantidad-v_item.cantidad, actualizado_en=now()
        WHERE empresa_id=p_empresa_id
          AND producto_id=v_item.producto_id
          AND ubicacion_id=p_ubicacion_id;
      ELSE
        INSERT INTO public.producto_stock_ubicacion(
          empresa_id,producto_id,ubicacion_id,cantidad,actualizado_en
        ) VALUES (
          p_empresa_id,v_item.producto_id,p_ubicacion_id,
          greatest(0,v_stock-v_item.cantidad),now()
        );
      END IF;
    END IF;

    INSERT INTO public.pizza_consumos_venta(
      empresa_id,venta_id,producto_id,cantidad,ubicacion_id,detalle_venta_id,detalle
    ) VALUES (
      p_empresa_id,p_venta_id,v_item.producto_id,v_item.cantidad,p_ubicacion_id,p_detalle_id,
      jsonb_build_object(
        'producto_pizza_id',p_producto_id,
        'presentacion_id',v_presentacion_id,
        'adicionales',coalesce(p_config->'adicionales','[]'::jsonb)
      )
    );
  END LOOP;
END $$;

REVOKE ALL ON FUNCTION public.consumir_pizza_linea(uuid,integer,integer,integer,numeric,uuid,jsonb)
  FROM PUBLIC,anon,authenticated;
