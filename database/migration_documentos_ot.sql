-- Archivos privados adjuntos a órdenes de trabajo, aislados por empresa y OT.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('documentos-ot', 'documentos-ot', false, 5242880,
  ARRAY['application/pdf','text/csv','application/zip','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document','image/jpeg','image/png','application/x-pkcs12','application/octet-stream'])
ON CONFLICT (id) DO UPDATE
SET public = false,
    file_size_limit = 5242880,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS documentos_ot_select_empresa ON storage.objects;
CREATE POLICY documentos_ot_select_empresa ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'documentos-ot' AND EXISTS (
  SELECT 1 FROM public.usuarios u JOIN public.ordenes_trabajo o ON o.empresa_id = u.empresa_id
  WHERE u.auth_user_id = auth.uid() AND u.activo = true AND u.permitir_acceso = true
    AND o.id::text = (storage.foldername(name))[2] AND o.empresa_id::text = (storage.foldername(name))[1]
));

DROP POLICY IF EXISTS documentos_ot_insert_empresa ON storage.objects;
CREATE POLICY documentos_ot_insert_empresa ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'documentos-ot' AND EXISTS (
  SELECT 1 FROM public.usuarios u JOIN public.ordenes_trabajo o ON o.empresa_id = u.empresa_id
  WHERE u.auth_user_id = auth.uid() AND u.activo = true AND u.permitir_acceso = true
    AND o.id::text = (storage.foldername(name))[2] AND o.empresa_id::text = (storage.foldername(name))[1]
));

DROP POLICY IF EXISTS documentos_ot_delete_empresa ON storage.objects;
CREATE POLICY documentos_ot_delete_empresa ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'documentos-ot' AND EXISTS (
  SELECT 1 FROM public.usuarios u JOIN public.ordenes_trabajo o ON o.empresa_id = u.empresa_id
  WHERE u.auth_user_id = auth.uid() AND u.activo = true AND u.permitir_acceso = true
    AND o.id::text = (storage.foldername(name))[2] AND o.empresa_id::text = (storage.foldername(name))[1]
));
