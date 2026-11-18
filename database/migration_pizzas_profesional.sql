-- Configuración de pizzas ligada al catálogo existente de productos.
-- Requiere la base instalada de ventas (productos.id/ventas.id/detalle_ventas.producto_id int4).
-- Aplicar después de migration_productos_datos_adicionales.sql y migration_catalogo_qr_carrito.sql.
DO $$
DECLARE v_tipo text;
BEGIN
  SELECT data_type INTO v_tipo FROM information_schema.columns
  WHERE table_schema='public' AND table_name='productos' AND column_name='id';
  IF v_tipo IS DISTINCT FROM 'integer' THEN
    RAISE EXCEPTION 'Migración de pizzas cancelada: se esperaba productos.id integer, se encontró %', coalesce(v_tipo,'ausente');
  END IF;
  SELECT data_type INTO v_tipo FROM information_schema.columns
  WHERE table_schema='public' AND table_name='detalle_ventas' AND column_name='id';
  IF v_tipo IS DISTINCT FROM 'integer' THEN
    RAISE EXCEPTION 'Migración de pizzas cancelada: se esperaba detalle_ventas.id integer, se encontró %', coalesce(v_tipo,'ausente');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.pizzas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  producto_id integer NOT NULL REFERENCES public.productos(id) ON DELETE RESTRICT,
  activo boolean NOT NULL DEFAULT true,
  destacado boolean NOT NULL DEFAULT false,
  visible_catalogo boolean NOT NULL DEFAULT true,
  permitir_mitad_mitad boolean NOT NULL DEFAULT true,
  max_sabores smallint NOT NULL DEFAULT 2 CHECK (max_sabores BETWEEN 1 AND 8),
  actualizado_en timestamptz NOT NULL DEFAULT now(),
  UNIQUE (empresa_id, producto_id)
);
CREATE TABLE IF NOT EXISTS public.pizza_presentaciones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  pizza_id uuid NOT NULL REFERENCES public.pizzas(id) ON DELETE CASCADE,
  nombre text NOT NULL CHECK (length(btrim(nombre)) BETWEEN 1 AND 60),
  diametro_cm numeric(6,2) CHECK (diametro_cm IS NULL OR diametro_cm BETWEEN 1 AND 100),
  precio_venta numeric(14,2) NOT NULL CHECK (precio_venta >= 0),
  costo_elaboracion numeric(14,2) NOT NULL DEFAULT 0 CHECK (costo_elaboracion >= 0),
  precio_promocional numeric(14,2) CHECK (precio_promocional IS NULL OR (precio_promocional >= 0 AND precio_promocional <= precio_venta)),
  disponible boolean NOT NULL DEFAULT true,
  orden smallint NOT NULL DEFAULT 0,
  UNIQUE (pizza_id, nombre)
);
CREATE TABLE IF NOT EXISTS public.pizza_ingredientes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  presentacion_id uuid NOT NULL REFERENCES public.pizza_presentaciones(id) ON DELETE CASCADE,
  producto_id integer NOT NULL REFERENCES public.productos(id) ON DELETE RESTRICT,
  unidad text NOT NULL,
  cantidad numeric(14,4) NOT NULL CHECK (cantidad > 0),
  costo_unitario numeric(14,4) NOT NULL DEFAULT 0 CHECK (costo_unitario >= 0),
  UNIQUE (presentacion_id, producto_id)
);
CREATE TABLE IF NOT EXISTS public.pizza_grupos_opciones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  pizza_id uuid NOT NULL REFERENCES public.pizzas(id) ON DELETE CASCADE,
  nombre text NOT NULL CHECK (length(btrim(nombre)) BETWEEN 1 AND 80),
  minimo smallint NOT NULL DEFAULT 0 CHECK (minimo BETWEEN 0 AND 20),
  maximo smallint NOT NULL DEFAULT 1 CHECK (maximo BETWEEN 1 AND 20 AND maximo >= minimo),
  obligatorio boolean NOT NULL DEFAULT false,
  permite_mitad_mitad boolean NOT NULL DEFAULT false,
  activo boolean NOT NULL DEFAULT true,
  orden smallint NOT NULL DEFAULT 0,
  UNIQUE (pizza_id, nombre)
);
CREATE TABLE IF NOT EXISTS public.pizza_adicionales (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  grupo_id uuid NOT NULL REFERENCES public.pizza_grupos_opciones(id) ON DELETE CASCADE,
  nombre text NOT NULL CHECK (length(btrim(nombre)) BETWEEN 1 AND 80),
  precio numeric(14,2) NOT NULL DEFAULT 0 CHECK (precio >= 0),
  activo boolean NOT NULL DEFAULT true,
  orden smallint NOT NULL DEFAULT 0,
  UNIQUE (grupo_id, nombre)
);
CREATE TABLE IF NOT EXISTS public.pizza_adicional_ingredientes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  adicional_id uuid NOT NULL REFERENCES public.pizza_adicionales(id) ON DELETE CASCADE,
  producto_id integer NOT NULL REFERENCES public.productos(id) ON DELETE RESTRICT,
  unidad text NOT NULL,
  cantidad numeric(14,4) NOT NULL CHECK (cantidad > 0),
  costo_unitario numeric(14,4) NOT NULL DEFAULT 0 CHECK (costo_unitario >= 0),
  UNIQUE (adicional_id, producto_id)
);
CREATE TABLE IF NOT EXISTS public.pizza_fotos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  pizza_id uuid NOT NULL REFERENCES public.pizzas(id) ON DELETE CASCADE,
  url text NOT NULL CHECK (url ~ '^https://'),
  orden smallint NOT NULL DEFAULT 0,
  principal boolean NOT NULL DEFAULT false
);
CREATE TABLE IF NOT EXISTS public.pizza_disponibilidad (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  presentacion_id uuid NOT NULL REFERENCES public.pizza_presentaciones(id) ON DELETE CASCADE,
  dia_semana smallint NOT NULL CHECK (dia_semana BETWEEN 0 AND 6),
  hora_desde time NOT NULL,
  hora_hasta time NOT NULL CHECK (hora_hasta > hora_desde),
  activo boolean NOT NULL DEFAULT true,
  UNIQUE (presentacion_id, dia_semana, hora_desde, hora_hasta)
);
ALTER TABLE public.detalle_ventas ADD COLUMN IF NOT EXISTS configuracion_pizza jsonb NOT NULL DEFAULT '{}'::jsonb;
CREATE TABLE IF NOT EXISTS public.pizza_consumos_venta (
  id bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  empresa_id uuid NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  venta_id integer NOT NULL,
  producto_id integer NOT NULL REFERENCES public.productos(id) ON DELETE RESTRICT,
  cantidad numeric(14,4) NOT NULL CHECK (cantidad > 0),
  ubicacion_id uuid,
  detalle_venta_id integer NOT NULL,
  detalle jsonb NOT NULL DEFAULT '{}'::jsonb,
  revertido_en timestamptz,
  creado_en timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS pizzas_empresa_producto_idx ON public.pizzas(empresa_id, producto_id);
CREATE INDEX IF NOT EXISTS pizza_presentaciones_pizza_idx ON public.pizza_presentaciones(pizza_id, disponible, orden);
CREATE INDEX IF NOT EXISTS pizza_ingredientes_presentacion_idx ON public.pizza_ingredientes(presentacion_id);
CREATE INDEX IF NOT EXISTS pizza_adicionales_grupo_idx ON public.pizza_adicionales(grupo_id, activo, orden);
CREATE INDEX IF NOT EXISTS pizza_consumos_venta_idx ON public.pizza_consumos_venta(empresa_id, venta_id) WHERE revertido_en IS NULL;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['pizzas','pizza_presentaciones','pizza_ingredientes','pizza_grupos_opciones','pizza_adicionales','pizza_adicional_ingredientes','pizza_fotos','pizza_disponibilidad','pizza_consumos_venta'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_select_empresa', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.usuarios u WHERE u.auth_user_id=auth.uid() AND u.empresa_id=%I.empresa_id AND u.activo IS TRUE AND u.permitir_acceso IS TRUE))', t || '_select_empresa', t, t);
    EXECUTE format('GRANT SELECT ON public.%I TO authenticated', t);
    EXECUTE format('REVOKE INSERT, UPDATE, DELETE ON public.%I FROM anon, authenticated', t);
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.guardar_pizza(p_producto_id integer, p_config jsonb)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog, public, auth
AS $$
DECLARE
  v_empresa uuid; v_pizza uuid; v_p jsonb; v_g jsonb; v_o jsonb; v_i jsonb;
  v_presentacion uuid; v_grupo uuid; v_adicional uuid; v_foto jsonb; v_index integer := 0;
  v_precio_desde numeric; v_costo_desde numeric;
BEGIN
  SELECT u.empresa_id INTO v_empresa FROM public.usuarios u
  WHERE u.auth_user_id=auth.uid() AND u.activo IS TRUE AND u.permitir_acceso IS TRUE ORDER BY u.id LIMIT 1;
  IF v_empresa IS NULL OR jsonb_typeof(p_config) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'PIZZA_DATOS_INVALIDOS'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.productos p WHERE p.id=p_producto_id AND p.empresa_id=v_empresa) THEN RAISE EXCEPTION 'PIZZA_PRODUCTO_NO_ENCONTRADO'; END IF;
  IF NOT public.tiene_permiso('productos','Agregar producto') AND NOT public.tiene_permiso('productos','Editar producto') AND NOT EXISTS (SELECT 1 FROM public.usuarios u JOIN public.roles r ON r.id=u.rol_id WHERE u.auth_user_id=auth.uid() AND u.empresa_id=v_empresa AND lower(r.nombre) LIKE '%admin%') THEN RAISE EXCEPTION 'PIZZA_SIN_PERMISO'; END IF;
  IF jsonb_typeof(p_config->'presentaciones') IS DISTINCT FROM 'array' OR jsonb_array_length(p_config->'presentaciones') NOT BETWEEN 1 AND 20 THEN RAISE EXCEPTION 'PIZZA_REQUIERE_PRESENTACIONES'; END IF;
  INSERT INTO public.pizzas(empresa_id,producto_id,activo,destacado,visible_catalogo,permitir_mitad_mitad,max_sabores,actualizado_en)
  VALUES(v_empresa,p_producto_id,coalesce((p_config->>'activo')::boolean,true),coalesce((p_config->>'destacado')::boolean,false),coalesce((p_config->>'visible_catalogo')::boolean,true),coalesce((p_config->>'permitir_mitad_mitad')::boolean,true),coalesce((p_config->>'max_sabores')::smallint,2),now())
  ON CONFLICT(empresa_id,producto_id) DO UPDATE SET activo=excluded.activo,destacado=excluded.destacado,visible_catalogo=excluded.visible_catalogo,permitir_mitad_mitad=excluded.permitir_mitad_mitad,max_sabores=excluded.max_sabores,actualizado_en=now()
  RETURNING id INTO v_pizza;
  UPDATE public.pizza_presentaciones SET disponible=false WHERE pizza_id=v_pizza;
  FOR v_p IN SELECT value FROM jsonb_array_elements(p_config->'presentaciones') LOOP
    v_presentacion := coalesce(nullif(v_p->>'id','')::uuid,gen_random_uuid());
    IF length(btrim(coalesce(v_p->>'nombre',''))) NOT BETWEEN 1 AND 60 OR coalesce((v_p->>'precio_venta')::numeric,-1)<0 THEN RAISE EXCEPTION 'PIZZA_PRESENTACION_INVALIDA'; END IF;
    INSERT INTO public.pizza_presentaciones(id,empresa_id,pizza_id,nombre,diametro_cm,precio_venta,costo_elaboracion,precio_promocional,disponible,orden)
    VALUES(v_presentacion,v_empresa,v_pizza,btrim(v_p->>'nombre'),nullif(v_p->>'diametro_cm','')::numeric,(v_p->>'precio_venta')::numeric,coalesce(nullif(v_p->>'costo_elaboracion','')::numeric,0),nullif(v_p->>'precio_promocional','')::numeric,coalesce((v_p->>'disponible')::boolean,true),v_index)
    ON CONFLICT(id) DO UPDATE SET nombre=excluded.nombre,diametro_cm=excluded.diametro_cm,precio_venta=excluded.precio_venta,costo_elaboracion=excluded.costo_elaboracion,precio_promocional=excluded.precio_promocional,disponible=excluded.disponible,orden=excluded.orden
    WHERE pizza_presentaciones.empresa_id=v_empresa AND pizza_presentaciones.pizza_id=v_pizza;
    DELETE FROM public.pizza_ingredientes WHERE presentacion_id=v_presentacion AND empresa_id=v_empresa;
    FOR v_i IN SELECT value FROM jsonb_array_elements(coalesce(v_p->'ingredientes','[]'::jsonb)) LOOP
      IF NOT EXISTS (SELECT 1 FROM public.productos p WHERE p.id=(v_i->>'producto_id')::integer AND p.empresa_id=v_empresa AND p.activo IS TRUE AND p.administra_stock IS TRUE AND lower(btrim(p.unidad))=lower(btrim(v_i->>'unidad'))) THEN RAISE EXCEPTION 'PIZZA_INGREDIENTE_INVALIDO_O_UNIDAD_NO_COMPATIBLE'; END IF;
      INSERT INTO public.pizza_ingredientes(empresa_id,presentacion_id,producto_id,unidad,cantidad,costo_unitario)
      SELECT v_empresa,v_presentacion,p.id,btrim(v_i->>'unidad'),(v_i->>'cantidad')::numeric,coalesce(p.precio_compra,0)
      FROM public.productos p WHERE p.id=(v_i->>'producto_id')::integer AND p.empresa_id=v_empresa;
    END LOOP;
    v_index := v_index+1;
  END LOOP;
  UPDATE public.pizza_grupos_opciones SET activo=false WHERE pizza_id=v_pizza;
  FOR v_g IN SELECT value FROM jsonb_array_elements(coalesce(p_config->'grupos','[]'::jsonb)) LOOP
    v_grupo := coalesce(nullif(v_g->>'id','')::uuid,gen_random_uuid());
    INSERT INTO public.pizza_grupos_opciones(id,empresa_id,pizza_id,nombre,minimo,maximo,obligatorio,permite_mitad_mitad,activo,orden)
    VALUES(v_grupo,v_empresa,v_pizza,btrim(v_g->>'nombre'),coalesce((v_g->>'minimo')::smallint,0),coalesce((v_g->>'maximo')::smallint,1),coalesce((v_g->>'obligatorio')::boolean,false),coalesce((v_g->>'permite_mitad_mitad')::boolean,false),coalesce((v_g->>'activo')::boolean,true),coalesce((v_g->>'orden')::smallint,0))
    ON CONFLICT(id) DO UPDATE SET nombre=excluded.nombre,minimo=excluded.minimo,maximo=excluded.maximo,obligatorio=excluded.obligatorio,permite_mitad_mitad=excluded.permite_mitad_mitad,activo=excluded.activo,orden=excluded.orden
    WHERE pizza_grupos_opciones.empresa_id=v_empresa AND pizza_grupos_opciones.pizza_id=v_pizza;
    UPDATE public.pizza_adicionales SET activo=false WHERE grupo_id=v_grupo;
    FOR v_o IN SELECT value FROM jsonb_array_elements(coalesce(v_g->'opciones','[]'::jsonb)) LOOP
      v_adicional := coalesce(nullif(v_o->>'id','')::uuid,gen_random_uuid());
      INSERT INTO public.pizza_adicionales(id,empresa_id,grupo_id,nombre,precio,activo,orden)
      VALUES(v_adicional,v_empresa,v_grupo,btrim(v_o->>'nombre'),coalesce((v_o->>'precio')::numeric,0),coalesce((v_o->>'activo')::boolean,true),coalesce((v_o->>'orden')::smallint,0))
      ON CONFLICT(id) DO UPDATE SET nombre=excluded.nombre,precio=excluded.precio,activo=excluded.activo,orden=excluded.orden
      WHERE pizza_adicionales.empresa_id=v_empresa AND pizza_adicionales.grupo_id=v_grupo;
      DELETE FROM public.pizza_adicional_ingredientes WHERE adicional_id=v_adicional AND empresa_id=v_empresa;
      FOR v_i IN SELECT value FROM jsonb_array_elements(coalesce(v_o->'ingredientes','[]'::jsonb)) LOOP
        IF NOT EXISTS (SELECT 1 FROM public.productos p WHERE p.id=(v_i->>'producto_id')::integer AND p.empresa_id=v_empresa AND p.activo IS TRUE AND p.administra_stock IS TRUE AND lower(btrim(p.unidad))=lower(btrim(v_i->>'unidad'))) THEN RAISE EXCEPTION 'PIZZA_INGREDIENTE_ADICIONAL_INVALIDO_O_UNIDAD_NO_COMPATIBLE'; END IF;
        INSERT INTO public.pizza_adicional_ingredientes(empresa_id,adicional_id,producto_id,unidad,cantidad,costo_unitario)
        SELECT v_empresa,v_adicional,p.id,btrim(v_i->>'unidad'),(v_i->>'cantidad')::numeric,coalesce(p.precio_compra,0)
        FROM public.productos p WHERE p.id=(v_i->>'producto_id')::integer AND p.empresa_id=v_empresa;
      END LOOP;
    END LOOP;
  END LOOP;
  DELETE FROM public.pizza_fotos WHERE pizza_id=v_pizza AND empresa_id=v_empresa;
  FOR v_foto IN SELECT value FROM jsonb_array_elements(coalesce(p_config->'fotos','[]'::jsonb)) LOOP
    INSERT INTO public.pizza_fotos(empresa_id,pizza_id,url,orden,principal)
    VALUES(v_empresa,v_pizza,v_foto->>'url',coalesce((v_foto->>'orden')::smallint,0),coalesce((v_foto->>'principal')::boolean,false));
  END LOOP;
  SELECT min(coalesce(precio_promocional,precio_venta)),min(costo_elaboracion) INTO v_precio_desde,v_costo_desde
  FROM public.pizza_presentaciones WHERE pizza_id=v_pizza AND disponible;
  UPDATE public.productos SET precio_venta=v_precio_desde,precio_compra=v_costo_desde
  WHERE id=p_producto_id AND empresa_id=v_empresa;
  RETURN v_pizza;
END $$;

CREATE OR REPLACE FUNCTION public.obtener_pizza_producto(p_producto_id integer)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
  SELECT jsonb_build_object('id',z.id,'activo',z.activo,'destacado',z.destacado,'visible_catalogo',z.visible_catalogo,'permitir_mitad_mitad',z.permitir_mitad_mitad,'max_sabores',z.max_sabores,
    'presentaciones',coalesce((SELECT jsonb_agg(to_jsonb(s)||jsonb_build_object('ingredientes',coalesce((SELECT jsonb_agg(jsonb_build_object('producto_id',i.producto_id,'unidad',i.unidad,'cantidad',i.cantidad)) FROM public.pizza_ingredientes i WHERE i.presentacion_id=s.id),'[]'::jsonb)) ORDER BY s.orden) FROM public.pizza_presentaciones s WHERE s.pizza_id=z.id),'[]'::jsonb),
    'grupos',coalesce((SELECT jsonb_agg(to_jsonb(g)||jsonb_build_object('opciones',coalesce((SELECT jsonb_agg(to_jsonb(a)||jsonb_build_object('ingredientes',coalesce((SELECT jsonb_agg(jsonb_build_object('producto_id',ai.producto_id,'unidad',ai.unidad,'cantidad',ai.cantidad)) FROM public.pizza_adicional_ingredientes ai WHERE ai.adicional_id=a.id),'[]'::jsonb)) ORDER BY a.orden) FROM public.pizza_adicionales a WHERE a.grupo_id=g.id),'[]'::jsonb)) ORDER BY g.orden) FROM public.pizza_grupos_opciones g WHERE g.pizza_id=z.id),'[]'::jsonb),
    'fotos',coalesce((SELECT jsonb_agg(to_jsonb(f) ORDER BY f.orden) FROM public.pizza_fotos f WHERE f.pizza_id=z.id),'[]'::jsonb))
  FROM public.pizzas z WHERE z.producto_id=p_producto_id AND z.empresa_id=public.mi_empresa_id();
$$;
REVOKE ALL ON FUNCTION public.guardar_pizza(integer,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.guardar_pizza(integer,jsonb) TO authenticated;
REVOKE ALL ON FUNCTION public.obtener_pizza_producto(integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.obtener_pizza_producto(integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.precio_pizza_linea(p_empresa_id uuid,p_producto_id integer,p_config jsonb)
RETURNS numeric LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE v_pizza public.pizzas%rowtype; v_presentacion public.pizza_presentaciones%rowtype; v_total numeric; v_ids uuid[]; v_conteo integer;
BEGIN
  IF jsonb_typeof(p_config) IS DISTINCT FROM 'object' OR jsonb_typeof(coalesce(p_config->'adicionales','[]'::jsonb)) IS DISTINCT FROM 'array'
     OR length(coalesce(p_config->>'observaciones',''))>300 THEN RAISE EXCEPTION 'PIZZA_CONFIGURACION_INVALIDA'; END IF;
  SELECT * INTO v_pizza FROM public.pizzas WHERE empresa_id=p_empresa_id AND producto_id=p_producto_id AND activo IS TRUE;
  IF NOT FOUND THEN RAISE EXCEPTION 'PIZZA_NO_DISPONIBLE'; END IF;
  BEGIN v_ids:=ARRAY(SELECT value::uuid FROM jsonb_array_elements_text(coalesce(p_config->'adicionales','[]'::jsonb)) AS a(value));
  EXCEPTION WHEN invalid_text_representation THEN RAISE EXCEPTION 'PIZZA_ADICIONAL_INVALIDO'; END;
  IF cardinality(v_ids)<>(SELECT count(DISTINCT x) FROM unnest(v_ids) x) THEN RAISE EXCEPTION 'PIZZA_ADICIONAL_REPETIDO'; END IF;
  BEGIN
    SELECT * INTO v_presentacion FROM public.pizza_presentaciones
    WHERE id=(p_config->>'presentacion_id')::uuid AND pizza_id=v_pizza.id AND empresa_id=p_empresa_id AND disponible IS TRUE;
  EXCEPTION WHEN invalid_text_representation THEN RAISE EXCEPTION 'PIZZA_TAMANO_INVALIDO'; END;
  IF NOT FOUND THEN RAISE EXCEPTION 'PIZZA_TAMANO_NO_DISPONIBLE'; END IF;
  IF EXISTS (SELECT 1 FROM unnest(v_ids) selected(id) LEFT JOIN public.pizza_adicionales a ON a.id=selected.id AND a.empresa_id=p_empresa_id AND a.activo IS TRUE LEFT JOIN public.pizza_grupos_opciones g ON g.id=a.grupo_id AND g.pizza_id=v_pizza.id AND g.activo IS TRUE WHERE a.id IS NULL OR g.id IS NULL) THEN RAISE EXCEPTION 'PIZZA_ADICIONAL_NO_DISPONIBLE'; END IF;
  IF EXISTS (
    SELECT 1 FROM public.pizza_grupos_opciones g
    LEFT JOIN LATERAL (SELECT count(*)::integer n FROM public.pizza_adicionales a WHERE a.grupo_id=g.id AND a.id=ANY(v_ids) AND a.activo IS TRUE) s ON true
    WHERE g.pizza_id=v_pizza.id AND g.activo IS TRUE AND (s.n<g.minimo OR s.n>g.maximo OR (g.obligatorio AND s.n=0))
  ) THEN RAISE EXCEPTION 'PIZZA_OPCIONES_REQUERIDAS_INVALIDAS'; END IF;
  IF coalesce((p_config->>'mitad_mitad')::boolean,false) THEN
    IF NOT v_pizza.permitir_mitad_mitad OR NOT EXISTS (
      SELECT 1 FROM public.pizza_grupos_opciones g WHERE g.pizza_id=v_pizza.id AND g.activo IS TRUE AND g.permite_mitad_mitad
        AND (SELECT count(*) FROM public.pizza_adicionales a WHERE a.grupo_id=g.id AND a.id=ANY(v_ids) AND a.activo IS TRUE) BETWEEN 2 AND v_pizza.max_sabores
    ) THEN RAISE EXCEPTION 'PIZZA_MITAD_MITAD_INVALIDA'; END IF;
  END IF;
  SELECT coalesce(sum(a.precio),0) INTO v_total FROM public.pizza_adicionales a WHERE a.id=ANY(v_ids) AND a.empresa_id=p_empresa_id AND a.activo IS TRUE;
  RETURN coalesce(v_presentacion.precio_promocional,v_presentacion.precio_venta)+v_total;
END $$;
REVOKE ALL ON FUNCTION public.precio_pizza_linea(uuid,integer,jsonb) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.consumir_pizza_linea(p_empresa_id uuid,p_venta_id integer,p_detalle_id integer,p_producto_id integer,p_cantidad numeric,p_ubicacion_id uuid,p_config jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE v_presentacion_id uuid; v_item record; v_stock numeric; v_stock_sucursal numeric; v_tiene_sucursal boolean;
BEGIN
  v_presentacion_id:=(p_config->>'presentacion_id')::uuid;
  FOR v_item IN
    SELECT ins.producto_id, sum(ins.cantidad)*p_cantidad AS cantidad, sum(ins.costo_unitario*ins.cantidad) AS costo
    FROM (
      SELECT i.producto_id,i.cantidad,i.costo_unitario FROM public.pizza_ingredientes i WHERE i.empresa_id=p_empresa_id AND i.presentacion_id=v_presentacion_id
      UNION ALL
      SELECT ai.producto_id,ai.cantidad,ai.costo_unitario FROM public.pizza_adicional_ingredientes ai
        JOIN public.pizza_adicionales a ON a.id=ai.adicional_id AND a.empresa_id=ai.empresa_id
      WHERE ai.empresa_id=p_empresa_id AND a.id IN (SELECT value::uuid FROM jsonb_array_elements_text(coalesce(p_config->'adicionales','[]'::jsonb)))
    ) ins GROUP BY ins.producto_id ORDER BY ins.producto_id
  LOOP
    PERFORM 1 FROM public.productos p WHERE p.id=v_item.producto_id AND p.empresa_id=p_empresa_id AND p.activo IS TRUE AND p.administra_stock IS TRUE FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'PIZZA_INGREDIENTE_NO_DISPONIBLE'; END IF;
    SELECT stock_actual INTO v_stock FROM public.productos WHERE id=v_item.producto_id AND empresa_id=p_empresa_id;
    IF v_stock IS NULL OR v_stock<v_item.cantidad THEN RAISE EXCEPTION 'PIZZA_INGREDIENTE_STOCK_INSUFICIENTE:%',v_item.producto_id; END IF;
    IF p_ubicacion_id IS NOT NULL THEN
      SELECT cantidad INTO v_stock_sucursal FROM public.producto_stock_ubicacion WHERE empresa_id=p_empresa_id AND producto_id=v_item.producto_id AND ubicacion_id=p_ubicacion_id FOR UPDATE;
      v_tiene_sucursal:=FOUND;
      IF FOUND AND v_stock_sucursal<v_item.cantidad THEN RAISE EXCEPTION 'PIZZA_INGREDIENTE_STOCK_SUCURSAL_INSUFICIENTE:%',v_item.producto_id; END IF;
    END IF;
    UPDATE public.productos SET stock_actual=stock_actual-v_item.cantidad WHERE id=v_item.producto_id AND empresa_id=p_empresa_id;
    IF p_ubicacion_id IS NOT NULL THEN
      IF v_tiene_sucursal THEN
        UPDATE public.producto_stock_ubicacion SET cantidad=cantidad-v_item.cantidad,actualizado_en=now() WHERE empresa_id=p_empresa_id AND producto_id=v_item.producto_id AND ubicacion_id=p_ubicacion_id;
      ELSE
        INSERT INTO public.producto_stock_ubicacion(empresa_id,producto_id,ubicacion_id,cantidad,actualizado_en) VALUES(p_empresa_id,v_item.producto_id,p_ubicacion_id,greatest(0,v_stock-v_item.cantidad),now());
      END IF;
    END IF;
    INSERT INTO public.pizza_consumos_venta(empresa_id,venta_id,producto_id,cantidad,ubicacion_id,detalle_venta_id,detalle)
    VALUES(p_empresa_id,p_venta_id,v_item.producto_id,v_item.cantidad,p_ubicacion_id,p_detalle_id,jsonb_build_object('producto_pizza_id',p_producto_id,'presentacion_id',v_presentacion_id,'adicionales',coalesce(p_config->'adicionales','[]'::jsonb)));
  END LOOP;
END $$;
REVOKE ALL ON FUNCTION public.consumir_pizza_linea(uuid,integer,integer,integer,numeric,uuid,jsonb) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.revertir_consumos_pizza(p_venta_id integer,p_empresa_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE v_item record;
BEGIN
  FOR v_item IN SELECT * FROM public.pizza_consumos_venta WHERE venta_id=p_venta_id AND empresa_id=p_empresa_id AND revertido_en IS NULL ORDER BY producto_id FOR UPDATE LOOP
    UPDATE public.productos SET stock_actual=stock_actual+v_item.cantidad WHERE id=v_item.producto_id AND empresa_id=p_empresa_id;
    IF v_item.ubicacion_id IS NOT NULL THEN
      UPDATE public.producto_stock_ubicacion SET cantidad=cantidad+v_item.cantidad,actualizado_en=now() WHERE empresa_id=p_empresa_id AND producto_id=v_item.producto_id AND ubicacion_id=v_item.ubicacion_id;
      IF NOT FOUND THEN INSERT INTO public.producto_stock_ubicacion(empresa_id,producto_id,ubicacion_id,cantidad,actualizado_en) VALUES(p_empresa_id,v_item.producto_id,v_item.ubicacion_id,v_item.cantidad,now()); END IF;
    END IF;
    UPDATE public.pizza_consumos_venta SET revertido_en=now() WHERE id=v_item.id;
  END LOOP;
END $$;
REVOKE ALL ON FUNCTION public.revertir_consumos_pizza(integer,uuid) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.revertir_consumos_pizza_venta_trigger()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
  IF TG_OP='DELETE' THEN
    PERFORM public.revertir_consumos_pizza(OLD.id,OLD.empresa_id);
    RETURN OLD;
  END IF;
  IF NEW.estado_pago IN ('Anulada','Devuelta') AND OLD.estado_pago NOT IN ('Anulada','Devuelta') THEN
    PERFORM public.revertir_consumos_pizza(NEW.id,NEW.empresa_id);
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.revertir_consumos_pizza_venta_trigger() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS pizzas_revertir_consumos_al_anular ON public.ventas;
CREATE TRIGGER pizzas_revertir_consumos_al_anular AFTER UPDATE OF estado_pago ON public.ventas
FOR EACH ROW EXECUTE FUNCTION public.revertir_consumos_pizza_venta_trigger();
DROP TRIGGER IF EXISTS pizzas_revertir_consumos_al_borrar ON public.ventas;
CREATE TRIGGER pizzas_revertir_consumos_al_borrar BEFORE DELETE ON public.ventas
FOR EACH ROW EXECUTE FUNCTION public.revertir_consumos_pizza_venta_trigger();


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
    v_detalle_id integer;
    v_cantidad numeric;
    v_precio numeric;
    v_precio_enviado numeric;
    v_config_pizza jsonb;
    v_es_pizza boolean;
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
        v_producto_id := NULLIF(v_item->>'producto_id', '')::integer;
        v_cantidad := COALESCE((v_item->>'cantidad')::numeric, 0);
        v_precio_enviado := COALESCE((v_item->>'precio_unitario')::numeric, 0);
        v_config_pizza := COALESCE(v_item->'configuracion_pizza', '{}'::jsonb);
        SELECT EXISTS (SELECT 1 FROM public.pizzas z WHERE z.empresa_id=v_empresa_id AND z.producto_id=v_producto_id) INTO v_es_pizza;
        IF v_es_pizza THEN
            v_precio := public.precio_pizza_linea(v_empresa_id,v_producto_id,v_config_pizza);
            IF abs(v_precio_enviado-v_precio)>0.01 THEN RAISE EXCEPTION 'PIZZA_PRECIO_MODIFICADO'; END IF;
            v_precio_moneda := v_precio / v_tasa;
        ELSE
            IF v_config_pizza <> '{}'::jsonb THEN RAISE EXCEPTION 'CONFIGURACION_PIZZA_INVALIDA'; END IF;
            v_precio := v_precio_enviado;
            v_precio_moneda := COALESCE(NULLIF(v_item->>'precio_unitario_moneda', '')::numeric, v_precio / v_tasa);
        END IF;
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
        v_config_pizza := COALESCE(v_item->'configuracion_pizza', '{}'::jsonb);
        SELECT EXISTS (SELECT 1 FROM public.pizzas z WHERE z.empresa_id=v_empresa_id AND z.producto_id=v_producto_id) INTO v_es_pizza;
        v_precio := CASE WHEN v_es_pizza THEN public.precio_pizza_linea(v_empresa_id,v_producto_id,v_config_pizza) ELSE COALESCE((v_item->>'precio_unitario')::numeric,0) END;
        v_precio_moneda := CASE WHEN v_es_pizza THEN v_precio / v_tasa ELSE COALESCE(NULLIF(v_item->>'precio_unitario_moneda', '')::numeric, v_precio / v_tasa) END;
        v_subtotal_moneda := CASE WHEN v_es_pizza THEN (v_cantidad * v_precio) / v_tasa ELSE COALESCE(NULLIF(v_item->>'subtotal_moneda', '')::numeric, (v_cantidad * v_precio) / v_tasa) END;

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
        IF NOT v_es_pizza THEN
            IF v_stock_actual IS NOT NULL AND v_stock_actual < v_cantidad THEN
                RAISE EXCEPTION 'Stock insuficiente para el producto %: disponible %, solicitado %', v_item->>'nombre_producto', v_stock_actual, v_cantidad;
            END IF;
            UPDATE public.productos SET stock_actual = stock_actual - v_cantidad WHERE id = v_producto_id AND empresa_id = v_empresa_id;
        END IF;

        INSERT INTO public.detalle_ventas (
            empresa_id, venta_id, producto_id, nombre_producto, cantidad,
            precio_unitario, subtotal, moneda_venta,
            precio_unitario_moneda, subtotal_moneda, configuracion_pizza
        ) VALUES (
            v_empresa_id, v_venta_id::integer, v_producto_id,
            v_item->>'nombre_producto', v_cantidad, v_precio,
            v_cantidad * v_precio, v_moneda, v_precio_moneda, v_subtotal_moneda, v_config_pizza
        ) RETURNING id INTO v_detalle_id;

        IF v_es_pizza THEN
            PERFORM public.consumir_pizza_linea(v_empresa_id,v_venta_id::integer,v_detalle_id,v_producto_id,v_cantidad,p_ubicacion_id,v_config_pizza);
        END IF;

        IF p_ubicacion_id IS NOT NULL AND NOT v_es_pizza THEN
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

REVOKE ALL ON FUNCTION public.registrar_venta(jsonb,jsonb,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.registrar_venta(jsonb,jsonb,uuid) TO authenticated;


-- PUBLICACIÓN Y PEDIDOS DE PIZZA EN CATÁLOGO QR
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
      WHEN EXISTS (SELECT 1 FROM public.pizzas z WHERE z.empresa_id=p.empresa_id AND z.producto_id=p.id)
        THEN EXISTS (SELECT 1 FROM public.pizzas z JOIN public.pizza_presentaciones pp ON pp.pizza_id=z.id WHERE z.empresa_id=p.empresa_id AND z.producto_id=p.id AND z.activo AND z.visible_catalogo AND pp.disponible)
      WHEN c.ubicacion_id IS NULL OR coalesce(ps.cantidad, 0) <= 0
        THEN coalesce(p.stock_actual, 0) > 0
      ELSE ps.cantidad > 0
    END,
    'pizza', (SELECT jsonb_build_object(
      'id', z.id, 'activo', z.activo, 'destacado', z.destacado,
      'permitir_mitad_mitad', z.permitir_mitad_mitad, 'max_sabores', z.max_sabores,
      'presentaciones', coalesce((SELECT jsonb_agg(jsonb_build_object('id',s.id,'nombre',s.nombre,'diametro_cm',s.diametro_cm,'precio_venta',s.precio_venta,'precio_promocional',s.precio_promocional,'disponible',s.disponible) ORDER BY s.orden) FROM public.pizza_presentaciones s WHERE s.pizza_id=z.id AND s.disponible),'[]'::jsonb),
      'grupos', coalesce((SELECT jsonb_agg(jsonb_build_object('id',g.id,'nombre',g.nombre,'minimo',g.minimo,'maximo',g.maximo,'obligatorio',g.obligatorio,'permite_mitad_mitad',g.permite_mitad_mitad,'activo',g.activo,'opciones',coalesce((SELECT jsonb_agg(jsonb_build_object('id',a.id,'nombre',a.nombre,'precio',a.precio,'activo',a.activo) ORDER BY a.orden) FROM public.pizza_adicionales a WHERE a.grupo_id=g.id AND a.activo),'[]'::jsonb)) ORDER BY g.orden) FROM public.pizza_grupos_opciones g WHERE g.pizza_id=z.id AND g.activo),'[]'::jsonb),
      'fotos', coalesce((SELECT jsonb_agg(jsonb_build_object('url',f.url,'principal',f.principal) ORDER BY f.orden) FROM public.pizza_fotos f WHERE f.pizza_id=z.id),'[]'::jsonb)
    ) FROM public.pizzas z WHERE z.empresa_id=p.empresa_id AND z.producto_id=p.id AND z.activo AND z.visible_catalogo)
  ) ORDER BY p.nombre), '[]'::jsonb)
  INTO productos_json
  FROM public.productos p
  LEFT JOIN public.producto_stock_ubicacion ps
    ON ps.producto_id = p.id
   AND ps.ubicacion_id = c.ubicacion_id
   AND ps.empresa_id = p.empresa_id
  WHERE p.empresa_id = c.empresa_id
    AND coalesce(p.activo, true) = true
    AND NOT EXISTS (SELECT 1 FROM public.pizzas z WHERE z.empresa_id=p.empresa_id AND z.producto_id=p.id AND (NOT z.activo OR NOT z.visible_catalogo))
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
  -- El ID puede llegar como UUID o como entero según la versión instalada
  -- del esquema. Se compara como texto y luego se usa el tipo nativo de p.id.
  v_producto_key text;
  v_producto public.productos%rowtype;
  v_stock numeric;
  v_cantidad numeric;
  v_precio numeric;
  v_subtotal numeric;
  v_total numeric := 0;
  v_items jsonb := '[]'::jsonb;
  v_ids text[] := '{}';
  v_nombre text;
  v_telefono text;
  v_numero text;
  v_pedido_id uuid;
  v_config_pizza jsonb;
  v_es_pizza boolean;
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
      v_producto_key := btrim(coalesce(v_item->>'producto_id', ''));
      v_cantidad := (v_item->>'cantidad')::numeric;
    EXCEPTION WHEN invalid_text_representation THEN
      RAISE EXCEPTION 'ITEM_INVALIDO';
    END;
    IF v_producto_key = '' OR length(v_producto_key) > 100 THEN
      RAISE EXCEPTION 'ITEM_INVALIDO';
    END IF;
    IF v_cantidad IS NULL OR v_cantidad <= 0 OR v_cantidad::text IN ('NaN', 'Infinity', '-Infinity') THEN
      RAISE EXCEPTION 'CANTIDAD_INVALIDA';
    END IF;
    IF v_producto_key = ANY(v_ids) THEN
      RAISE EXCEPTION 'PRODUCTO_REPETIDO';
    END IF;
    v_ids := array_append(v_ids, v_producto_key);

    SELECT p.* INTO v_producto
    FROM public.productos p
    WHERE p.id::text = v_producto_key
      AND p.empresa_id = c.empresa_id
      AND coalesce(p.activo, true) = true
      AND (cardinality(c.categoria) = 0 OR p.categoria = ANY(c.categoria))
      AND (cardinality(c.marca) = 0 OR p.marca = ANY(c.marca))
      AND (c.precio_min IS NULL OR coalesce(p.precio_venta, 0) >= c.precio_min)
      AND (c.precio_max IS NULL OR coalesce(p.precio_venta, 0) <= c.precio_max);
    IF NOT FOUND THEN
      RAISE EXCEPTION 'PRODUCTO_NO_DISPONIBLE';
    END IF;

    v_config_pizza := coalesce(v_item->'configuracion_pizza', '{}'::jsonb);
    SELECT EXISTS (SELECT 1 FROM public.pizzas z WHERE z.empresa_id=c.empresa_id AND z.producto_id::text=v_producto_key) INTO v_es_pizza;
    IF v_es_pizza AND NOT EXISTS (SELECT 1 FROM public.pizzas z WHERE z.empresa_id=c.empresa_id AND z.producto_id::text=v_producto_key AND z.activo AND z.visible_catalogo) THEN
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
    IF NOT v_es_pizza AND v_stock < v_cantidad THEN
      RAISE EXCEPTION 'STOCK_INSUFICIENTE:%', v_producto.nombre;
    END IF;

    IF v_es_pizza THEN
      v_precio := public.precio_pizza_linea(c.empresa_id,v_producto.id,v_config_pizza);
    ELSE
      IF v_config_pizza <> '{}'::jsonb THEN RAISE EXCEPTION 'CONFIGURACION_PIZZA_INVALIDA'; END IF;
      v_precio := greatest(coalesce(v_producto.precio_venta, 0), 0);
    END IF;
    v_subtotal := round(v_precio * v_cantidad, 2);
    v_total := v_total + v_subtotal;
    v_items := v_items || jsonb_build_array(jsonb_build_object(
      'producto_id', v_producto.id,
      'nombre', CASE WHEN v_es_pizza THEN v_producto.nombre || ' · ' || coalesce(v_config_pizza->>'presentacion_nombre','Pizza') || CASE WHEN coalesce(v_config_pizza->>'adicionales_nombre','')<>'' THEN ' · ' || left(v_config_pizza->>'adicionales_nombre',300) ELSE '' END || CASE WHEN coalesce(v_config_pizza->>'observaciones','')<>'' THEN ' · Nota: ' || left(v_config_pizza->>'observaciones',300) ELSE '' END ELSE v_producto.nombre END,
      'codigo', coalesce(v_producto.codigo, ''),
      'cantidad', v_cantidad,
      'precio_unitario', v_precio,
      'subtotal', v_subtotal,
      'unidad', coalesce(to_jsonb(v_producto)->>'unidad', ''),
      'configuracion_pizza', v_config_pizza
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
REVOKE ALL ON FUNCTION public.crear_pedido_catalogo_qr_publico(uuid,text,text,jsonb,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.crear_pedido_catalogo_qr_publico(uuid,text,text,jsonb,text) TO anon, authenticated;
