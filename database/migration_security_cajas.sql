-- Endurece el acceso a la tabla legacy public.cajas.
-- Aplicar en Supabase SQL Editor después de verificar que el módulo ya no depende
-- de la política abierta "Cajas".

ALTER TABLE public.cajas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Cajas" ON public.cajas;
DROP POLICY IF EXISTS cajas_select_own_company ON public.cajas;
DROP POLICY IF EXISTS cajas_insert_own_company ON public.cajas;
DROP POLICY IF EXISTS cajas_update_own_company ON public.cajas;
DROP POLICY IF EXISTS cajas_delete_own_company ON public.cajas;

CREATE POLICY cajas_select_own_company
ON public.cajas
FOR SELECT
TO authenticated
USING (empresa_id = mi_empresa_id());

CREATE POLICY cajas_insert_own_company
ON public.cajas
FOR INSERT
TO authenticated
WITH CHECK (empresa_id = mi_empresa_id());

CREATE POLICY cajas_update_own_company
ON public.cajas
FOR UPDATE
TO authenticated
USING (empresa_id = mi_empresa_id())
WITH CHECK (empresa_id = mi_empresa_id());

CREATE POLICY cajas_delete_own_company
ON public.cajas
FOR DELETE
TO authenticated
USING (empresa_id = mi_empresa_id());
