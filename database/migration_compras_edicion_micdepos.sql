-- Campos complementarios del editor de compras, en formato JSON para mantener
-- compatibilidad con los registros y las RPC existentes.
ALTER TABLE public.compras
  ADD COLUMN IF NOT EXISTS datos_edicion jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.detalle_compras
  ADD COLUMN IF NOT EXISTS datos_edicion jsonb NOT NULL DEFAULT '{}'::jsonb;

-- La RPC existente conserva validaciones y ajuste transaccional de stock.
-- Esta envoltura persiste los campos nuevos dentro de la misma transacción.
CREATE OR REPLACE FUNCTION public.registrar_compra_completa(
  p_compra jsonb,
  p_items jsonb,
  p_compra_id bigint DEFAULT NULL,
  p_ubicacion_id uuid DEFAULT NULL,
  p_datos_edicion jsonb DEFAULT '{}'::jsonb
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_compra_id bigint;
  v_item jsonb;
BEGIN
  v_compra_id := public.registrar_o_editar_compra(
    p_compra,
    p_items,
    p_compra_id,
    p_ubicacion_id
  );

  UPDATE public.compras
  SET datos_edicion = COALESCE(p_datos_edicion, '{}'::jsonb)
  WHERE id::text = v_compra_id::text
    AND empresa_id = public.mi_empresa_id();

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_items)
  LOOP
    UPDATE public.detalle_compras d
    SET datos_edicion = jsonb_build_object(
      'iva', COALESCE(v_item->>'iva', 'IVA 10%'),
      'margen_ganancia', COALESCE(v_item->'margen_ganancia', '25'::jsonb),
      'precio_venta_unitario', COALESCE(v_item->'precio_venta_unitario', '0'::jsonb),
      'fecha_caducidad', v_item->'fecha_caducidad'
    )
    WHERE d.compra_id::text = v_compra_id::text
      AND d.empresa_id = public.mi_empresa_id()
      AND d.producto_id::text = v_item->>'producto_id';

    UPDATE public.productos p
    SET precio_venta = COALESCE((v_item->>'precio_venta_unitario')::numeric, p.precio_venta),
        iva = COALESCE(v_item->>'iva', p.iva),
        fecha_vencimiento = NULLIF(v_item->>'fecha_caducidad', '')::date
    WHERE p.id::text = v_item->>'producto_id'
      AND p.empresa_id = public.mi_empresa_id();
  END LOOP;

  RETURN v_compra_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.registrar_compra_completa(jsonb, jsonb, bigint, uuid, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.registrar_compra_completa(jsonb, jsonb, bigint, uuid, jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.registrar_compra_completa(jsonb, jsonb, bigint, uuid, jsonb) TO authenticated;

-- Adjuntos privados con acceso limitado a usuarios activos de la empresa.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'documentos-compras',
  'documentos-compras',
  false,
  5242880,
  ARRAY[
    'application/pdf','text/csv','application/zip','application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'image/jpeg','image/png','application/x-pkcs12','application/octet-stream'
  ]
)
ON CONFLICT (id) DO UPDATE
SET public = false,
    file_size_limit = 5242880,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS documentos_compras_select_empresa ON storage.objects;
CREATE POLICY documentos_compras_select_empresa ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'documentos-compras'
  AND EXISTS (
    SELECT 1 FROM public.usuarios u
    WHERE u.auth_user_id = auth.uid()
      AND u.empresa_id::text = (storage.foldername(name))[1]
      AND u.activo = true AND u.permitir_acceso = true
  )
);

DROP POLICY IF EXISTS documentos_compras_insert_empresa ON storage.objects;
CREATE POLICY documentos_compras_insert_empresa ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'documentos-compras'
  AND EXISTS (
    SELECT 1 FROM public.usuarios u
    WHERE u.auth_user_id = auth.uid()
      AND u.empresa_id::text = (storage.foldername(name))[1]
      AND u.activo = true AND u.permitir_acceso = true
  )
);

DROP POLICY IF EXISTS documentos_compras_delete_empresa ON storage.objects;
CREATE POLICY documentos_compras_delete_empresa ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'documentos-compras'
  AND EXISTS (
    SELECT 1 FROM public.usuarios u
    WHERE u.auth_user_id = auth.uid()
      AND u.empresa_id::text = (storage.foldername(name))[1]
      AND u.activo = true AND u.permitir_acceso = true
  )
);

NOTIFY pgrst, 'reload schema';
