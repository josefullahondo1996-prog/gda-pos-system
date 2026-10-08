-- Archivos privados por cliente, aislados por empresa.
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('documentos-clientes', 'documentos-clientes', false, 20971520)
ON CONFLICT (id) DO UPDATE
SET public = false,
    file_size_limit = 20971520;

DROP POLICY IF EXISTS documentos_clientes_select_empresa ON storage.objects;
CREATE POLICY documentos_clientes_select_empresa
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'documentos-clientes'
  AND EXISTS (
    SELECT 1
    FROM public.usuarios u
    JOIN public.clientes c ON c.empresa_id = u.empresa_id
    WHERE u.auth_user_id = auth.uid()
      AND u.activo = true
      AND u.permitir_acceso = true
      AND c.id::text = (storage.foldername(name))[2]
      AND c.empresa_id::text = (storage.foldername(name))[1]
  )
);

DROP POLICY IF EXISTS documentos_clientes_insert_empresa ON storage.objects;
CREATE POLICY documentos_clientes_insert_empresa
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'documentos-clientes'
  AND EXISTS (
    SELECT 1
    FROM public.usuarios u
    JOIN public.clientes c ON c.empresa_id = u.empresa_id
    WHERE u.auth_user_id = auth.uid()
      AND u.activo = true
      AND u.permitir_acceso = true
      AND c.id::text = (storage.foldername(name))[2]
      AND c.empresa_id::text = (storage.foldername(name))[1]
  )
);

DROP POLICY IF EXISTS documentos_clientes_delete_empresa ON storage.objects;
CREATE POLICY documentos_clientes_delete_empresa
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'documentos-clientes'
  AND EXISTS (
    SELECT 1
    FROM public.usuarios u
    JOIN public.clientes c ON c.empresa_id = u.empresa_id
    WHERE u.auth_user_id = auth.uid()
      AND u.activo = true
      AND u.permitir_acceso = true
      AND c.id::text = (storage.foldername(name))[2]
      AND c.empresa_id::text = (storage.foldername(name))[1]
  )
);
