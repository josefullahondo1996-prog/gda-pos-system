-- Consulta publica y limitada del estado de un pedido creado desde un catalogo QR.
-- Aplicar despues de migration_restaurante_editar_pedidos_qr.sql y migration_pedidos_qr_mesa.sql.
-- La UUID del pedido ya se devuelve al cliente que acaba de enviarlo y actua como enlace no adivinable.

CREATE OR REPLACE FUNCTION public.obtener_estado_pedido_qr_publico(p_pedido_id uuid)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT jsonb_build_object(
    'numero_pedido',p.numero_pedido,
    'mesa',p.mesa_nombre,
    'estado',p.estado,
    'total',p.total,
    'ultima_correccion_en',(SELECT max(c.creado_en) FROM public.pedidos_qr_cambios c WHERE c.pedido_id=p.id),
    'creado_en',p.creado_en,
    'actualizado_en',p.actualizado_en
  )
  FROM public.pedidos p
  WHERE p.id=p_pedido_id
    AND p.origen IN ('catalogo_qr','catalogo_qr_mesa')
$$;
REVOKE ALL ON FUNCTION public.obtener_estado_pedido_qr_publico(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.obtener_estado_pedido_qr_publico(uuid) TO anon, authenticated;
