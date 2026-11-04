-- Catálogo QR con stock visible y pedidos públicos por carrito.
-- Aplicar después de migration_catalogo_qr.sql, migration_pedidos.sql y
-- migration_transacciones_ventas_stock.sql. Los pedidos no cobran ni reservan stock.

ALTER TABLE public.pedidos
  ADD COLUMN IF NOT EXISTS ubicacion_id uuid,
  ADD COLUMN IF NOT EXISTS origen text NOT NULL DEFAULT 'interno';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.pedidos'::regclass
      AND conname = 'pedidos_ubicacion_id_fkey'
  ) THEN
    ALTER TABLE public.pedidos
      ADD CONSTRAINT pedidos_ubicacion_id_fkey
      FOREIGN KEY (ubicacion_id)
      REFERENCES public.ubicaciones_comerciales(id)
      ON DELETE SET NULL;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.obtener_catalogo_qr_publico(p_token uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  c public.catalogos_qr%rowtype;
  empresa_nombre text;
  productos_json jsonb;
BEGIN
  SELECT * INTO c
  FROM public.catalogos_qr
  WHERE public_token = p_token AND estado = 'Activo';

  IF NOT FOUND OR (c.expira_el IS NOT NULL AND c.expira_el < current_date) THEN
    RETURN NULL;
  END IF;

  SELECT nombre INTO empresa_nombre FROM public.empresas WHERE id = c.empresa_id;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id', p.id,
    'nombre', p.nombre,
    'codigo', p.codigo,
    'descripcion', p.descripcion,
    'precio', p.precio_venta,
    'imagen', p.imagen_url,
    'categoria', p.categoria,
    'marca', p.marca,
    'stock_disponible', CASE
      -- Igual que el POS: si no hay stock positivo registrado para la sucursal,
      -- usar stock_actual como respaldo para productos antiguos o no migrados.
      WHEN c.ubicacion_id IS NULL OR coalesce(ps.cantidad, 0) <= 0
        THEN greatest(coalesce(p.stock_actual, 0), 0)
      ELSE greatest(ps.cantidad, 0)
    END,
    'disponible', CASE
      WHEN c.ubicacion_id IS NULL OR coalesce(ps.cantidad, 0) <= 0
        THEN coalesce(p.stock_actual, 0) > 0
      ELSE ps.cantidad > 0
    END
  ) ORDER BY p.nombre), '[]'::jsonb)
  INTO productos_json
  FROM public.productos p
  LEFT JOIN public.producto_stock_ubicacion ps
    ON ps.producto_id = p.id
   AND ps.ubicacion_id = c.ubicacion_id
   AND ps.empresa_id = p.empresa_id
  WHERE p.empresa_id = c.empresa_id
    AND coalesce(p.activo, true) = true
    AND (cardinality(c.categoria) = 0 OR p.categoria = ANY(c.categoria))
    AND (cardinality(c.marca) = 0 OR p.marca = ANY(c.marca))
    AND (c.precio_min IS NULL OR coalesce(p.precio_venta, 0) >= c.precio_min)
    AND (c.precio_max IS NULL OR coalesce(p.precio_venta, 0) <= c.precio_max)
    AND (c.ubicacion_id IS NULL OR EXISTS (
      SELECT 1 FROM public.ubicaciones_comerciales uc
      WHERE uc.id = c.ubicacion_id
        AND uc.empresa_id = c.empresa_id
        AND uc.activo IS TRUE
    ));

  UPDATE public.catalogos_qr SET vistas = vistas + 1 WHERE id = c.id;
  RETURN jsonb_build_object(
    'nombre', c.nombre,
    'empresa', empresa_nombre,
    'descripcion', c.descripcion,
    'bienvenida', c.mensaje_bienvenida,
    'whatsapp', c.whatsapp,
    'color', c.color,
    'productos', productos_json
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.crear_pedido_catalogo_qr_publico(
  p_token uuid,
  p_cliente_nombre text,
  p_cliente_telefono text,
  p_items jsonb,
  p_nota text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  c public.catalogos_qr%rowtype;
  v_item jsonb;
  v_producto_id uuid;
  v_producto public.productos%rowtype;
  v_stock numeric;
  v_cantidad numeric;
  v_precio numeric;
  v_subtotal numeric;
  v_total numeric := 0;
  v_items jsonb := '[]'::jsonb;
  v_ids uuid[] := '{}';
  v_nombre text;
  v_telefono text;
  v_numero text;
  v_pedido_id uuid;
BEGIN
  v_nombre := btrim(coalesce(p_cliente_nombre, ''));
  v_telefono := btrim(coalesce(p_cliente_telefono, ''));
  IF length(v_nombre) < 2 OR length(v_nombre) > 120 THEN
    RAISE EXCEPTION 'NOMBRE_INVALIDO';
  END IF;
  IF length(regexp_replace(v_telefono, '[^0-9]', '', 'g')) < 8 OR length(v_telefono) > 30 THEN
    RAISE EXCEPTION 'TELEFONO_INVALIDO';
  END IF;
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' THEN
    RAISE EXCEPTION 'ITEMS_INVALIDOS';
  END IF;
  IF jsonb_array_length(p_items) < 1 OR jsonb_array_length(p_items) > 50 THEN
    RAISE EXCEPTION 'CANTIDAD_DE_ITEMS_INVALIDA';
  END IF;
  IF length(btrim(coalesce(p_nota, ''))) > 500 THEN
    RAISE EXCEPTION 'NOTA_MUY_LARGA';
  END IF;

  SELECT * INTO c
  FROM public.catalogos_qr
  WHERE public_token = p_token AND estado = 'Activo';
  IF NOT FOUND OR (c.expira_el IS NOT NULL AND c.expira_el < current_date) THEN
    RAISE EXCEPTION 'CATALOGO_NO_DISPONIBLE';
  END IF;
  IF c.ubicacion_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.ubicaciones_comerciales uc
    WHERE uc.id = c.ubicacion_id AND uc.empresa_id = c.empresa_id AND uc.activo IS TRUE
  ) THEN
    RAISE EXCEPTION 'SUCURSAL_NO_DISPONIBLE';
  END IF;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_items)
  LOOP
    BEGIN
      v_producto_id := (v_item->>'producto_id')::uuid;
      v_cantidad := (v_item->>'cantidad')::numeric;
    EXCEPTION WHEN invalid_text_representation THEN
      RAISE EXCEPTION 'ITEM_INVALIDO';
    END;
    IF v_producto_id IS NULL OR v_cantidad IS NULL OR v_cantidad <= 0 OR v_cantidad::text IN ('NaN', 'Infinity', '-Infinity') THEN
      RAISE EXCEPTION 'CANTIDAD_INVALIDA';
    END IF;
    IF v_producto_id = ANY(v_ids) THEN
      RAISE EXCEPTION 'PRODUCTO_REPETIDO';
    END IF;
    v_ids := array_append(v_ids, v_producto_id);

    SELECT p.* INTO v_producto
    FROM public.productos p
    WHERE p.id = v_producto_id
      AND p.empresa_id = c.empresa_id
      AND coalesce(p.activo, true) = true
      AND (cardinality(c.categoria) = 0 OR p.categoria = ANY(c.categoria))
      AND (cardinality(c.marca) = 0 OR p.marca = ANY(c.marca))
      AND (c.precio_min IS NULL OR coalesce(p.precio_venta, 0) >= c.precio_min)
      AND (c.precio_max IS NULL OR coalesce(p.precio_venta, 0) <= c.precio_max);
    IF NOT FOUND THEN
      RAISE EXCEPTION 'PRODUCTO_NO_DISPONIBLE';
    END IF;

    IF c.ubicacion_id IS NULL THEN
      v_stock := greatest(coalesce(v_producto.stock_actual, 0), 0);
    ELSE
      SELECT ps.cantidad INTO v_stock
      FROM public.producto_stock_ubicacion ps
      WHERE ps.producto_id = v_producto.id
        AND ps.empresa_id = c.empresa_id
        AND ps.ubicacion_id = c.ubicacion_id;
      -- Mantener el mismo respaldo que stockEnSucursal() en PuntoDeVenta.jsx.
      IF NOT FOUND OR coalesce(v_stock, 0) <= 0 THEN
        v_stock := greatest(coalesce(v_producto.stock_actual, 0), 0);
      ELSE
        v_stock := greatest(v_stock, 0);
      END IF;
    END IF;
    IF v_stock < v_cantidad THEN
      RAISE EXCEPTION 'STOCK_INSUFICIENTE:%', v_producto.nombre;
    END IF;

    v_precio := greatest(coalesce(v_producto.precio_venta, 0), 0);
    v_subtotal := round(v_precio * v_cantidad, 2);
    v_total := v_total + v_subtotal;
    v_items := v_items || jsonb_build_array(jsonb_build_object(
      'producto_id', v_producto.id,
      'nombre', v_producto.nombre,
      'codigo', coalesce(v_producto.codigo, ''),
      'cantidad', v_cantidad,
      'precio_unitario', v_precio,
      'subtotal', v_subtotal,
      'unidad', coalesce(to_jsonb(v_producto)->>'unidad', '')
    ));
  END LOOP;

  v_numero := 'WEB-' || to_char(current_timestamp, 'YYYYMMDD') || '-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));
  INSERT INTO public.pedidos (
    empresa_id, numero_pedido, cliente_nombre, cliente_telefono,
    estado, items, total, nota, ubicacion_id, origen
  ) VALUES (
    c.empresa_id, v_numero, v_nombre, v_telefono,
    'pendiente', v_items, v_total, nullif(btrim(coalesce(p_nota, '')), ''), c.ubicacion_id, 'catalogo_qr'
  ) RETURNING id INTO v_pedido_id;

  RETURN jsonb_build_object('id', v_pedido_id, 'numero_pedido', v_numero, 'total', v_total);
END;
$$;

REVOKE ALL ON FUNCTION public.obtener_catalogo_qr_publico(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.obtener_catalogo_qr_publico(uuid) TO anon, authenticated;
REVOKE ALL ON FUNCTION public.crear_pedido_catalogo_qr_publico(uuid, text, text, jsonb, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.crear_pedido_catalogo_qr_publico(uuid, text, text, jsonb, text) TO anon, authenticated;
