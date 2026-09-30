-- Módulo de fabricación con recetas y producción transaccional.
-- Compatible con el esquema activo de PYpos: productos.id integer, roles.id bigint
-- y stock global entero. No reemplaza las RPC de ventas o compras.

CREATE TABLE IF NOT EXISTS public.fabricacion_centros_trabajo (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  nombre text NOT NULL,
  codigo text,
  activo boolean NOT NULL DEFAULT true,
  creado_en timestamptz NOT NULL DEFAULT now(),
  actualizado_en timestamptz NOT NULL DEFAULT now(),
  UNIQUE (empresa_id, nombre)
);

CREATE TABLE IF NOT EXISTS public.fabricacion_recetas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  producto_id bigint NOT NULL REFERENCES public.productos(id) ON DELETE RESTRICT,
  nombre text NOT NULL,
  rendimiento numeric(14,4) NOT NULL CHECK (rendimiento > 0),
  instrucciones text,
  activo boolean NOT NULL DEFAULT true,
  creado_por text,
  creado_en timestamptz NOT NULL DEFAULT now(),
  actualizado_en timestamptz NOT NULL DEFAULT now(),
  UNIQUE (empresa_id, producto_id)
);

CREATE TABLE IF NOT EXISTS public.fabricacion_receta_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  receta_id uuid NOT NULL REFERENCES public.fabricacion_recetas(id) ON DELETE CASCADE,
  producto_id bigint NOT NULL REFERENCES public.productos(id) ON DELETE RESTRICT,
  cantidad numeric(14,4) NOT NULL CHECK (cantidad > 0),
  creado_en timestamptz NOT NULL DEFAULT now(),
  UNIQUE (receta_id, producto_id)
);

CREATE TABLE IF NOT EXISTS public.fabricacion_producciones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  receta_id uuid NOT NULL REFERENCES public.fabricacion_recetas(id) ON DELETE RESTRICT,
  producto_id bigint NOT NULL REFERENCES public.productos(id) ON DELETE RESTRICT,
  ubicacion_id uuid NOT NULL REFERENCES public.ubicaciones_comerciales(id) ON DELETE RESTRICT,
  centro_trabajo_id uuid REFERENCES public.fabricacion_centros_trabajo(id) ON DELETE SET NULL,
  referencia text NOT NULL,
  fecha timestamptz NOT NULL DEFAULT now(),
  cantidad numeric(14,4) NOT NULL CHECK (cantidad > 0),
  cantidad_desperdiciada numeric(14,4) NOT NULL DEFAULT 0 CHECK (cantidad_desperdiciada >= 0),
  costo_total numeric(14,2) NOT NULL DEFAULT 0 CHECK (costo_total >= 0),
  costo_unitario numeric(14,4) NOT NULL DEFAULT 0 CHECK (costo_unitario >= 0),
  producto_nombre text NOT NULL,
  receta_nombre text NOT NULL,
  ubicacion_nombre text NOT NULL,
  centro_trabajo_nombre text,
  operario text,
  usuario_id text,
  insumos_detalle jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(insumos_detalle) = 'array'),
  notas text,
  creado_en timestamptz NOT NULL DEFAULT now(),
  UNIQUE (empresa_id, referencia)
);

CREATE INDEX IF NOT EXISTS fabricacion_recetas_empresa_activo_idx
  ON public.fabricacion_recetas (empresa_id, activo, nombre);
CREATE INDEX IF NOT EXISTS fabricacion_receta_items_receta_idx
  ON public.fabricacion_receta_items (empresa_id, receta_id);
CREATE INDEX IF NOT EXISTS fabricacion_producciones_empresa_fecha_idx
  ON public.fabricacion_producciones (empresa_id, fecha DESC);
CREATE INDEX IF NOT EXISTS fabricacion_producciones_ubicacion_fecha_idx
  ON public.fabricacion_producciones (empresa_id, ubicacion_id, fecha DESC);

ALTER TABLE public.fabricacion_centros_trabajo ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fabricacion_recetas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fabricacion_receta_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fabricacion_producciones ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS fabricacion_centros_select_empresa ON public.fabricacion_centros_trabajo;
CREATE POLICY fabricacion_centros_select_empresa
  ON public.fabricacion_centros_trabajo FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.usuarios u
    WHERE u.auth_user_id = auth.uid()
      AND u.empresa_id = fabricacion_centros_trabajo.empresa_id
      AND u.activo = true AND u.permitir_acceso = true
      AND (
        u.rol_id IS NULL OR EXISTS (
          SELECT 1 FROM public.roles rr
          WHERE rr.id = u.rol_id AND rr.empresa_id = u.empresa_id
            AND (lower(COALESCE(rr.nombre, '')) LIKE '%admin%'
              OR rr.permisos IS NULL
              OR COALESCE(rr.permisos #>> ARRAY['productos', 'Ajustar stock'], 'false') = 'true')
        )
      )
  ));

DROP POLICY IF EXISTS fabricacion_recetas_select_empresa ON public.fabricacion_recetas;
CREATE POLICY fabricacion_recetas_select_empresa
  ON public.fabricacion_recetas FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.usuarios u
    WHERE u.auth_user_id = auth.uid()
      AND u.empresa_id = fabricacion_recetas.empresa_id
      AND u.activo = true AND u.permitir_acceso = true
      AND (
        u.rol_id IS NULL OR EXISTS (
          SELECT 1 FROM public.roles rr
          WHERE rr.id = u.rol_id AND rr.empresa_id = u.empresa_id
            AND (lower(COALESCE(rr.nombre, '')) LIKE '%admin%'
              OR rr.permisos IS NULL
              OR COALESCE(rr.permisos #>> ARRAY['productos', 'Ajustar stock'], 'false') = 'true')
        )
      )
  ));

DROP POLICY IF EXISTS fabricacion_receta_items_select_empresa ON public.fabricacion_receta_items;
CREATE POLICY fabricacion_receta_items_select_empresa
  ON public.fabricacion_receta_items FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.usuarios u
    WHERE u.auth_user_id = auth.uid()
      AND u.empresa_id = fabricacion_receta_items.empresa_id
      AND u.activo = true AND u.permitir_acceso = true
      AND (
        u.rol_id IS NULL OR EXISTS (
          SELECT 1 FROM public.roles rr
          WHERE rr.id = u.rol_id AND rr.empresa_id = u.empresa_id
            AND (lower(COALESCE(rr.nombre, '')) LIKE '%admin%'
              OR rr.permisos IS NULL
              OR COALESCE(rr.permisos #>> ARRAY['productos', 'Ajustar stock'], 'false') = 'true')
        )
      )
  ));

DROP POLICY IF EXISTS fabricacion_producciones_select_ubicacion ON public.fabricacion_producciones;
CREATE POLICY fabricacion_producciones_select_ubicacion
  ON public.fabricacion_producciones FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.usuarios u
    WHERE u.auth_user_id = auth.uid()
      AND u.empresa_id = fabricacion_producciones.empresa_id
      AND u.activo = true AND u.permitir_acceso = true
      AND (COALESCE(u.todas_localizaciones, false) OR u.ubicacion_id = fabricacion_producciones.ubicacion_id)
      AND (
        u.rol_id IS NULL OR EXISTS (
          SELECT 1 FROM public.roles rr
          WHERE rr.id = u.rol_id AND rr.empresa_id = u.empresa_id
            AND (lower(COALESCE(rr.nombre, '')) LIKE '%admin%'
              OR rr.permisos IS NULL
              OR COALESCE(rr.permisos #>> ARRAY['productos', 'Ajustar stock'], 'false') = 'true')
        )
      )
  ));

GRANT SELECT ON public.fabricacion_centros_trabajo TO authenticated;
GRANT SELECT ON public.fabricacion_recetas TO authenticated;
GRANT SELECT ON public.fabricacion_receta_items TO authenticated;
GRANT SELECT ON public.fabricacion_producciones TO authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.fabricacion_centros_trabajo,
  public.fabricacion_recetas, public.fabricacion_receta_items,
  public.fabricacion_producciones FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.guardar_fabricacion_receta(
  p_receta_id uuid,
  p_producto_id bigint,
  p_nombre text,
  p_rendimiento numeric,
  p_items jsonb,
  p_instrucciones text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $$
DECLARE
  v_usuario_id text;
  v_empresa_id uuid;
  v_rol_id bigint;
  v_permiso jsonb;
  v_rol_nombre text;
  v_receta_id uuid;
  v_item jsonb;
  v_producto_id bigint;
  v_producto_ids bigint[] := ARRAY[]::bigint[];
  v_cantidad numeric;
  v_cantidad_productos integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Debes iniciar sesión para administrar recetas';
  END IF;

  SELECT u.id::text, u.empresa_id, u.rol_id
    INTO v_usuario_id, v_empresa_id, v_rol_id
  FROM public.usuarios u
  WHERE u.auth_user_id = auth.uid()
    AND u.activo = true AND u.permitir_acceso = true
  ORDER BY u.id LIMIT 1;

  IF v_usuario_id IS NULL THEN
    RAISE EXCEPTION 'No se encontró un usuario activo asociado a esta empresa';
  END IF;

  SELECT r.nombre, r.permisos INTO v_rol_nombre, v_permiso
  FROM public.roles r WHERE r.id = v_rol_id;
  IF COALESCE(v_rol_nombre, '') NOT ILIKE '%admin%'
     AND v_permiso IS NOT NULL
     AND COALESCE(v_permiso #>> ARRAY['productos', 'Ajustar stock'], 'false') <> 'true' THEN
    RAISE EXCEPTION 'Tu rol no tiene permiso para administrar fabricación';
  END IF;

  IF p_producto_id IS NULL OR p_nombre IS NULL OR length(btrim(p_nombre)) < 2
     OR length(p_nombre) > 120 OR p_rendimiento IS NULL OR p_rendimiento <= 0
     OR p_rendimiento >= 9999999999.9999 OR p_rendimiento <> round(p_rendimiento, 4) THEN
    RAISE EXCEPTION 'Completa el producto, el nombre y un rendimiento válido';
  END IF;
  IF p_items IS NULL OR jsonb_typeof(p_items) IS DISTINCT FROM 'array'
     OR jsonb_array_length(p_items) = 0 OR jsonb_array_length(p_items) > 200 THEN
    RAISE EXCEPTION 'Agrega entre 1 y 200 ingredientes a la receta';
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_items) AS i(value)
    GROUP BY NULLIF(i.value->>'producto_id', '')
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Cada ingrediente debe aparecer una sola vez';
  END IF;

  IF p_receta_id IS NOT NULL THEN
    SELECT r.id INTO v_receta_id
    FROM public.fabricacion_recetas r
    WHERE r.id = p_receta_id AND r.empresa_id = v_empresa_id
    FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'La receta no existe o no pertenece a tu empresa';
    END IF;
  END IF;

  v_producto_ids := array_append(v_producto_ids, p_producto_id);
  FOR v_item IN SELECT value FROM jsonb_array_elements(p_items)
  LOOP
    v_producto_id := NULLIF(v_item->>'producto_id', '')::bigint;
    v_cantidad := NULLIF(v_item->>'cantidad', '')::numeric;
    IF v_producto_id IS NULL OR v_producto_id = p_producto_id
       OR v_cantidad IS NULL OR v_cantidad <= 0 OR v_cantidad >= 9999999999.9999
       OR v_cantidad <> round(v_cantidad, 4) THEN
      RAISE EXCEPTION 'El producto o la cantidad de un ingrediente no es válida';
    END IF;
    v_producto_ids := array_append(v_producto_ids, v_producto_id);
  END LOOP;

  SELECT array_agg(DISTINCT x ORDER BY x) INTO v_producto_ids
  FROM unnest(v_producto_ids) AS ids(x);

  PERFORM p.id
  FROM public.productos p
  WHERE p.id = ANY(v_producto_ids) AND p.empresa_id = v_empresa_id
  ORDER BY p.id
  FOR UPDATE;
  SELECT count(*) INTO v_cantidad_productos
  FROM public.productos p
  WHERE p.id = ANY(v_producto_ids)
    AND p.empresa_id = v_empresa_id
    AND COALESCE(p.activo, true) = true
    AND COALESCE(p.administra_stock, true) = true;
  IF v_cantidad_productos <> cardinality(v_producto_ids) THEN
    RAISE EXCEPTION 'La receta solo puede usar productos activos con control de stock de tu empresa';
  END IF;

  IF v_receta_id IS NULL THEN
    INSERT INTO public.fabricacion_recetas
      (empresa_id, producto_id, nombre, rendimiento, instrucciones, creado_por)
    VALUES
      (v_empresa_id, p_producto_id, btrim(p_nombre), p_rendimiento,
       NULLIF(btrim(p_instrucciones), ''), v_usuario_id)
    RETURNING id INTO v_receta_id;
  ELSE
    UPDATE public.fabricacion_recetas
    SET producto_id = p_producto_id,
        nombre = btrim(p_nombre),
        rendimiento = p_rendimiento,
        instrucciones = NULLIF(btrim(p_instrucciones), ''),
        activo = true,
        actualizado_en = now()
    WHERE id = v_receta_id AND empresa_id = v_empresa_id;
  END IF;

  DELETE FROM public.fabricacion_receta_items
  WHERE receta_id = v_receta_id AND empresa_id = v_empresa_id;
  INSERT INTO public.fabricacion_receta_items
    (empresa_id, receta_id, producto_id, cantidad)
  SELECT v_empresa_id, v_receta_id, NULLIF(i.value->>'producto_id', '')::bigint,
         NULLIF(i.value->>'cantidad', '')::numeric
  FROM jsonb_array_elements(p_items) AS i(value);

  RETURN v_receta_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.archivar_fabricacion_receta(p_receta_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $$
DECLARE
  v_empresa_id uuid;
  v_usuario_id text;
  v_rol_id bigint;
  v_permiso jsonb;
  v_rol_nombre text;
BEGIN
  SELECT u.empresa_id, u.id::text, u.rol_id
    INTO v_empresa_id, v_usuario_id, v_rol_id
  FROM public.usuarios u
  WHERE u.auth_user_id = auth.uid() AND u.activo = true AND u.permitir_acceso = true
  ORDER BY u.id LIMIT 1;
  IF v_usuario_id IS NULL THEN RAISE EXCEPTION 'Usuario no autorizado'; END IF;
  SELECT r.nombre, r.permisos INTO v_rol_nombre, v_permiso
  FROM public.roles r WHERE r.id = v_rol_id;
  IF COALESCE(v_rol_nombre, '') NOT ILIKE '%admin%'
     AND v_permiso IS NOT NULL
     AND COALESCE(v_permiso #>> ARRAY['productos', 'Ajustar stock'], 'false') <> 'true' THEN
    RAISE EXCEPTION 'Tu rol no tiene permiso para administrar fabricación';
  END IF;
  UPDATE public.fabricacion_recetas SET activo = false, actualizado_en = now()
  WHERE id = p_receta_id AND empresa_id = v_empresa_id AND activo = true;
  RETURN FOUND;
END;
$$;

CREATE OR REPLACE FUNCTION public.guardar_fabricacion_centro(
  p_centro_id uuid,
  p_nombre text,
  p_codigo text,
  p_activo boolean DEFAULT true
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $$
DECLARE
  v_empresa_id uuid;
  v_usuario_id text;
  v_rol_id bigint;
  v_permiso jsonb;
  v_rol_nombre text;
  v_centro_id uuid;
BEGIN
  SELECT u.empresa_id, u.id::text, u.rol_id
    INTO v_empresa_id, v_usuario_id, v_rol_id
  FROM public.usuarios u
  WHERE u.auth_user_id = auth.uid() AND u.activo = true AND u.permitir_acceso = true
  ORDER BY u.id LIMIT 1;
  IF v_usuario_id IS NULL THEN RAISE EXCEPTION 'Usuario no autorizado'; END IF;
  SELECT r.nombre, r.permisos INTO v_rol_nombre, v_permiso
  FROM public.roles r WHERE r.id = v_rol_id;
  IF COALESCE(v_rol_nombre, '') NOT ILIKE '%admin%'
     AND v_permiso IS NOT NULL
     AND COALESCE(v_permiso #>> ARRAY['productos', 'Ajustar stock'], 'false') <> 'true' THEN
    RAISE EXCEPTION 'Tu rol no tiene permiso para administrar centros de trabajo';
  END IF;
  IF p_nombre IS NULL OR length(btrim(p_nombre)) < 2 OR length(p_nombre) > 100
     OR length(COALESCE(p_codigo, '')) > 40 THEN
    RAISE EXCEPTION 'Indica un nombre de centro de trabajo válido';
  END IF;
  IF p_centro_id IS NULL THEN
    INSERT INTO public.fabricacion_centros_trabajo (empresa_id, nombre, codigo, activo)
    VALUES (v_empresa_id, btrim(p_nombre), NULLIF(btrim(p_codigo), ''), COALESCE(p_activo, true))
    RETURNING id INTO v_centro_id;
  ELSE
    UPDATE public.fabricacion_centros_trabajo
    SET nombre = btrim(p_nombre), codigo = NULLIF(btrim(p_codigo), ''),
        activo = COALESCE(p_activo, true), actualizado_en = now()
    WHERE id = p_centro_id AND empresa_id = v_empresa_id
    RETURNING id INTO v_centro_id;
    IF v_centro_id IS NULL THEN RAISE EXCEPTION 'El centro no existe o no pertenece a tu empresa'; END IF;
  END IF;
  RETURN v_centro_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.crear_fabricacion_produccion(
  p_receta_id uuid,
  p_ubicacion_id uuid,
  p_cantidad numeric,
  p_items_real jsonb,
  p_referencia text DEFAULT NULL,
  p_centro_trabajo_id uuid DEFAULT NULL,
  p_operario text DEFAULT NULL,
  p_costo_adicional numeric DEFAULT 0,
  p_desperdicio numeric DEFAULT 0,
  p_fecha timestamptz DEFAULT now(),
  p_notas text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $$
DECLARE
  v_usuario_id text;
  v_empresa_id uuid;
  v_rol_id bigint;
  v_ubicacion_usuario_id uuid;
  v_todas_localizaciones boolean;
  v_permiso jsonb;
  v_rol_nombre text;
  v_receta public.fabricacion_recetas%ROWTYPE;
  v_producto_nombre text;
  v_producto_codigo text;
  v_stock_global numeric;
  v_stock_local numeric;
  v_fila_stock uuid;
  v_precio_compra numeric;
  v_nuevo_costo numeric;
  v_costo_total numeric := COALESCE(p_costo_adicional, 0);
  v_costo_unitario numeric;
  v_cantidad_producida numeric;
  v_cantidad_desperdiciada numeric := COALESCE(p_desperdicio, 0);
  v_cantidad_consumida numeric;
  v_cantidad_esperada numeric;
  v_ubicacion_nombre text;
  v_centro_nombre text;
  v_referencia text;
  v_produccion_id uuid;
  v_item jsonb;
  v_detalle jsonb := '[]'::jsonb;
  v_producto_ids bigint[] := ARRAY[]::bigint[];
  v_producto_id bigint;
  v_conteo integer;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Debes iniciar sesión para registrar producción'; END IF;

  SELECT u.id::text, u.empresa_id, u.rol_id, u.ubicacion_id, u.todas_localizaciones
    INTO v_usuario_id, v_empresa_id, v_rol_id, v_ubicacion_usuario_id, v_todas_localizaciones
  FROM public.usuarios u
  WHERE u.auth_user_id = auth.uid() AND u.activo = true AND u.permitir_acceso = true
  ORDER BY u.id LIMIT 1;
  IF v_usuario_id IS NULL THEN RAISE EXCEPTION 'No se encontró un usuario activo asociado a esta empresa'; END IF;

  SELECT r.nombre, r.permisos INTO v_rol_nombre, v_permiso
  FROM public.roles r WHERE r.id = v_rol_id;
  IF COALESCE(v_rol_nombre, '') NOT ILIKE '%admin%'
     AND v_permiso IS NOT NULL
     AND COALESCE(v_permiso #>> ARRAY['productos', 'Ajustar stock'], 'false') <> 'true' THEN
    RAISE EXCEPTION 'Tu rol no tiene permiso para registrar producción';
  END IF;

  IF p_cantidad IS NULL OR p_cantidad <= 0 OR p_cantidad >= 9999999999.9999
     OR p_cantidad <> round(p_cantidad, 0)
     OR v_cantidad_desperdiciada < 0 OR v_cantidad_desperdiciada >= 9999999999.9999
     OR v_cantidad_desperdiciada <> round(v_cantidad_desperdiciada, 0)
     OR COALESCE(p_costo_adicional, 0) < 0 OR COALESCE(p_costo_adicional, 0) >= 1000000000000 THEN
    RAISE EXCEPTION 'La cantidad, desperdicio o costo adicional no es válido';
  END IF;
  IF p_ubicacion_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.ubicaciones_comerciales l
    WHERE l.id = p_ubicacion_id AND l.empresa_id = v_empresa_id AND l.activo = true
  ) THEN RAISE EXCEPTION 'Selecciona una sucursal activa de tu empresa'; END IF;
  IF NOT COALESCE(v_todas_localizaciones, false)
     AND p_ubicacion_id <> v_ubicacion_usuario_id THEN
    RAISE EXCEPTION 'Tu usuario no tiene acceso a esa sucursal';
  END IF;

  SELECT * INTO v_receta
  FROM public.fabricacion_recetas r
  WHERE r.id = p_receta_id AND r.empresa_id = v_empresa_id AND r.activo = true
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'La receta no existe o está archivada'; END IF;

  IF p_items_real IS NULL OR jsonb_typeof(p_items_real) IS DISTINCT FROM 'array'
     OR jsonb_array_length(p_items_real) = 0 THEN
    RAISE EXCEPTION 'Faltan las cantidades reales de consumo';
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_items_real) AS i(value)
    GROUP BY NULLIF(i.value->>'producto_id', '')
    HAVING count(*) > 1
  ) THEN RAISE EXCEPTION 'Cada ingrediente debe aparecer una sola vez en el consumo'; END IF;

  SELECT count(*) INTO v_conteo FROM public.fabricacion_receta_items i
  WHERE i.empresa_id = v_empresa_id AND i.receta_id = v_receta.id;
  IF v_conteo = 0 OR v_conteo <> jsonb_array_length(p_items_real) THEN
    RAISE EXCEPTION 'El consumo debe incluir todos los ingredientes de la receta';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_items_real) AS x(value)
    LEFT JOIN public.fabricacion_receta_items i
      ON i.empresa_id = v_empresa_id
     AND i.receta_id = v_receta.id
     AND i.producto_id = NULLIF(x.value->>'producto_id', '')::bigint
    WHERE i.producto_id IS NULL
  ) THEN RAISE EXCEPTION 'El consumo incluye un ingrediente que no pertenece a esta receta'; END IF;

  IF p_centro_trabajo_id IS NOT NULL THEN
    SELECT c.nombre INTO v_centro_nombre
    FROM public.fabricacion_centros_trabajo c
    WHERE c.id = p_centro_trabajo_id AND c.empresa_id = v_empresa_id AND c.activo = true;
    IF NOT FOUND THEN RAISE EXCEPTION 'El centro de trabajo no existe o está inactivo'; END IF;
  END IF;
  SELECT l.nombre INTO v_ubicacion_nombre
  FROM public.ubicaciones_comerciales l
  WHERE l.id = p_ubicacion_id AND l.empresa_id = v_empresa_id AND l.activo = true;

  SELECT p.nombre, p.codigo INTO v_producto_nombre, v_producto_codigo
  FROM public.productos p
  WHERE p.id = v_receta.producto_id AND p.empresa_id = v_empresa_id
    AND COALESCE(p.activo, true) = true AND COALESCE(p.administra_stock, true) = true;
  IF NOT FOUND THEN RAISE EXCEPTION 'El producto de salida no está activo o no controla stock'; END IF;

  v_producto_ids := array_append(v_producto_ids, v_receta.producto_id);
  FOR v_item IN
    SELECT jsonb_build_object('producto_id', i.producto_id)
    FROM public.fabricacion_receta_items i
    WHERE i.empresa_id = v_empresa_id AND i.receta_id = v_receta.id
  LOOP
    v_producto_ids := array_append(v_producto_ids, (v_item->>'producto_id')::bigint);
  END LOOP;
  SELECT array_agg(DISTINCT x ORDER BY x) INTO v_producto_ids
  FROM unnest(v_producto_ids) AS ids(x);

  PERFORM p.id FROM public.productos p
  WHERE p.id = ANY(v_producto_ids) AND p.empresa_id = v_empresa_id
  ORDER BY p.id FOR UPDATE;
  SELECT count(*) INTO v_conteo
  FROM public.productos p
  WHERE p.id = ANY(v_producto_ids) AND p.empresa_id = v_empresa_id
    AND COALESCE(p.activo, true) = true AND COALESCE(p.administra_stock, true) = true;
  IF v_conteo <> cardinality(v_producto_ids) THEN
    RAISE EXCEPTION 'Un ingrediente o el producto final está inactivo, fuera de la empresa o sin control de stock';
  END IF;

  FOR v_item IN
    SELECT jsonb_build_object(
      'producto_id', i.producto_id,
      'cantidad', i.cantidad,
      'nombre', p.nombre,
      'codigo', p.codigo,
      'precio_compra', COALESCE(p.precio_compra, 0)
    )
    FROM public.fabricacion_receta_items i
    JOIN public.productos p ON p.id = i.producto_id AND p.empresa_id = v_empresa_id
    WHERE i.empresa_id = v_empresa_id AND i.receta_id = v_receta.id
    ORDER BY i.producto_id
  LOOP
    v_producto_id := (v_item->>'producto_id')::bigint;
    v_cantidad_esperada := ((p_cantidad + v_cantidad_desperdiciada) * (v_item->>'cantidad')::numeric) / v_receta.rendimiento;
    SELECT NULLIF(x.value->>'cantidad', '')::numeric INTO v_cantidad_consumida
    FROM jsonb_array_elements(p_items_real) AS x(value)
    WHERE NULLIF(x.value->>'producto_id', '')::bigint = v_producto_id;
    IF v_cantidad_consumida IS NULL OR v_cantidad_consumida <= 0
       OR v_cantidad_consumida >= 1000000000000 THEN
      RAISE EXCEPTION 'La cantidad real de consumo de \"%\" debe ser mayor que cero', v_item->>'nombre';
    END IF;
    IF v_cantidad_consumida <> round(v_cantidad_consumida, 0) THEN
      RAISE EXCEPTION 'El consumo de \"%\" debe ser entero porque el stock global admite unidades enteras', v_item->>'nombre';
    END IF;

    SELECT s.id, s.cantidad INTO v_fila_stock, v_stock_local
    FROM public.producto_stock_ubicacion s
    WHERE s.empresa_id = v_empresa_id
      AND s.producto_id = v_producto_id AND s.ubicacion_id = p_ubicacion_id
    FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'El ingrediente \"%\" no tiene saldo en esta sucursal; registra primero la apertura de stock', v_item->>'nombre';
    END IF;
    SELECT p.stock_actual INTO v_stock_global
    FROM public.productos p
    WHERE p.id = v_producto_id AND p.empresa_id = v_empresa_id;
    IF COALESCE(v_stock_local, 0) < v_cantidad_consumida
       OR COALESCE(v_stock_global, 0) < v_cantidad_consumida THEN
      RAISE EXCEPTION 'Stock insuficiente de \"%\": disponible en sucursal %, consumo solicitado %',
        v_item->>'nombre', COALESCE(v_stock_local, 0), v_cantidad_consumida;
    END IF;

    UPDATE public.producto_stock_ubicacion
    SET cantidad = v_stock_local - v_cantidad_consumida, actualizado_en = now()
    WHERE id = v_fila_stock;
    UPDATE public.productos
    SET stock_actual = stock_actual - v_cantidad_consumida
    WHERE id = v_producto_id AND empresa_id = v_empresa_id;

    v_precio_compra := COALESCE((v_item->>'precio_compra')::numeric, 0);
    v_costo_total := v_costo_total + v_cantidad_consumida * v_precio_compra;
    v_detalle := v_detalle || jsonb_build_array(jsonb_build_object(
      'producto_id', v_producto_id,
      'nombre', v_item->>'nombre',
      'codigo', v_item->>'codigo',
      'cantidad_planeada', round(v_cantidad_esperada, 4),
      'cantidad_consumida', round(v_cantidad_consumida, 4),
      'diferencia', round(v_cantidad_consumida - v_cantidad_esperada, 4),
      'costo_unitario', v_precio_compra,
      'costo_total', round(v_cantidad_consumida * v_precio_compra, 2)
    ));
  END LOOP;

  v_costo_total := round(v_costo_total, 2);
  v_costo_unitario := v_costo_total / p_cantidad;
  SELECT p.stock_actual, COALESCE(p.precio_compra, 0)
    INTO v_stock_global, v_precio_compra
  FROM public.productos p
  WHERE p.id = v_receta.producto_id AND p.empresa_id = v_empresa_id;
  IF COALESCE(v_stock_global, 0) < 0 THEN
    RAISE EXCEPTION 'El stock global del producto terminado es inválido';
  END IF;
  IF COALESCE(v_stock_global, 0) + p_cantidad > 0 THEN
    v_nuevo_costo := (
      COALESCE(v_stock_global, 0) * COALESCE(v_precio_compra, 0)
      + p_cantidad * v_costo_unitario
    ) / (COALESCE(v_stock_global, 0) + p_cantidad);
  ELSE
    v_nuevo_costo := v_costo_unitario;
  END IF;
  UPDATE public.productos
  SET stock_actual = COALESCE(stock_actual, 0) + p_cantidad,
      precio_compra = round(v_nuevo_costo, 2)
  WHERE id = v_receta.producto_id AND empresa_id = v_empresa_id;
  INSERT INTO public.producto_stock_ubicacion
    (empresa_id, producto_id, ubicacion_id, cantidad, actualizado_en)
  VALUES (v_empresa_id, v_receta.producto_id, p_ubicacion_id, p_cantidad, now())
  ON CONFLICT (empresa_id, producto_id, ubicacion_id)
  DO UPDATE SET cantidad = public.producto_stock_ubicacion.cantidad + EXCLUDED.cantidad,
                actualizado_en = now();

  v_referencia := NULLIF(btrim(p_referencia), '');
  IF v_referencia IS NULL THEN
    v_referencia := 'FAB-' || to_char(COALESCE(p_fecha, now()), 'YYYYMMDD')
      || '-' || upper(substr(gen_random_uuid()::text, 1, 8));
  END IF;
  IF length(v_referencia) > 60 OR length(COALESCE(p_operario, '')) > 120
     OR length(COALESCE(p_notas, '')) > 1000 THEN
    RAISE EXCEPTION 'La referencia, el operario o las notas superan el límite permitido';
  END IF;

  INSERT INTO public.fabricacion_producciones (
    empresa_id, receta_id, producto_id, ubicacion_id, centro_trabajo_id,
    referencia, fecha, cantidad, cantidad_desperdiciada, costo_total, costo_unitario,
    producto_nombre, receta_nombre, ubicacion_nombre, centro_trabajo_nombre,
    operario, usuario_id, insumos_detalle, notas
  )
  VALUES (
    v_empresa_id, v_receta.id, v_receta.producto_id, p_ubicacion_id, p_centro_trabajo_id,
    v_referencia, COALESCE(p_fecha, now()), p_cantidad, v_cantidad_desperdiciada,
    round(v_costo_total, 2), round(v_costo_unitario, 4),
    v_producto_nombre, v_receta.nombre, v_ubicacion_nombre, v_centro_nombre,
    NULLIF(btrim(p_operario), ''), v_usuario_id, v_detalle, NULLIF(btrim(p_notas), '')
  )
  RETURNING id INTO v_produccion_id;

  RETURN v_produccion_id;
END;
$$;

REVOKE ALL ON FUNCTION public.guardar_fabricacion_receta(uuid, bigint, text, numeric, jsonb, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.archivar_fabricacion_receta(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.guardar_fabricacion_centro(uuid, text, text, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.crear_fabricacion_produccion(uuid, uuid, numeric, jsonb, text, uuid, text, numeric, numeric, timestamptz, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.guardar_fabricacion_receta(uuid, bigint, text, numeric, jsonb, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.archivar_fabricacion_receta(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.guardar_fabricacion_centro(uuid, text, text, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.crear_fabricacion_produccion(uuid, uuid, numeric, jsonb, text, uuid, text, numeric, numeric, timestamptz, text) TO authenticated;
