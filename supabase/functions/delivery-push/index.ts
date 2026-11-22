import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import webpush from 'npm:web-push@3.6.7';
import { getAuthenticatedUser, unauthorized } from '../_shared/auth.ts';

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Método no permitido.' }, 405);
  const { user, error } = await getAuthenticatedUser(req);
  if (!user) return unauthorized(error || 'No autorizado.', cors);
  const body = await req.json().catch(() => null);
  const action = String(body?.action || '');
  const vapidPublicKey = Deno.env.get('DELIVERY_VAPID_PUBLIC_KEY') || '';
  const vapidPrivateKey = Deno.env.get('DELIVERY_VAPID_PRIVATE_KEY') || '';
  const vapidContact = Deno.env.get('DELIVERY_VAPID_CONTACT') || '';
  if (action === 'public-key') {
    if (!vapidPublicKey || !vapidPrivateKey || !vapidContact) return json({ error: 'Las notificaciones Push aún no están configuradas en Supabase.' }, 503);
    return json({ publicKey: vapidPublicKey });
  }
  if (action !== 'send-assignment') return json({ error: 'Acción inválida.' }, 400);
  if (!vapidPublicKey || !vapidPrivateKey || !vapidContact) return json({ error: 'Las notificaciones Push aún no están configuradas en Supabase.' }, 503);

  const empresaId = String(body?.empresaId || '');
  const pedidoId = String(body?.pedidoId || '');
  if (!/^[0-9a-f-]{36}$/i.test(empresaId) || !/^[0-9a-f-]{36}$/i.test(pedidoId)) return json({ error: 'Empresa o pedido inválido.' }, 400);

  const supabase = createClient(Deno.env.get('SUPABASE_URL') || '', Deno.env.get('SUPABASE_ANON_KEY') || '', {
    global: { headers: { Authorization: req.headers.get('Authorization') || '' } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: puedeAdministrar, error: errorPermiso } = await supabase.rpc('delivery_usuario_puede_administrar', { p_empresa_id: empresaId });
  if (errorPermiso || puedeAdministrar !== true) return json({ error: 'No tenés permiso para asignar pedidos de esta empresa.' }, 403);

  const { data: pedido, error: errorPedido } = await supabase.from('pedidos')
    .select('id, empresa_id, numero_pedido, cliente_nombre, delivery_repartidor_id, delivery_tipo')
    .eq('id', pedidoId).eq('empresa_id', empresaId).eq('delivery_tipo', 'delivery').maybeSingle();
  if (errorPedido || !pedido?.delivery_repartidor_id) return json({ error: 'El pedido no tiene un repartidor asignado.' }, 404);

  const { data: repartidor } = await supabase.from('delivery_repartidores').select('usuario_auth_id')
    .eq('empresa_id', empresaId).eq('usuario_auth_id', pedido.delivery_repartidor_id).eq('activo', true).maybeSingle();
  if (!repartidor) return json({ error: 'El repartidor asignado no está habilitado.' }, 409);
  const { data: suscripciones, error: errorSuscripciones } = await supabase.from('delivery_push_suscripciones')
    .select('endpoint,p256dh,auth').eq('empresa_id', empresaId).eq('usuario_auth_id', pedido.delivery_repartidor_id);
  if (errorSuscripciones) return json({ error: 'No se pudieron consultar los dispositivos registrados.' }, 500);
  if (!suscripciones?.length) return json({ sent: 0, registered: false });

  webpush.setVapidDetails(vapidContact, vapidPublicKey, vapidPrivateKey);
  const payload = JSON.stringify({
    title: 'Pedido pendiente de entregar',
    body: `${pedido.numero_pedido || 'Nuevo pedido'} · ${pedido.cliente_nombre || 'Cliente'}`,
    tag: `delivery-${pedido.id}`,
    url: '/repartidor/entregas',
  });
  const results = await Promise.allSettled(suscripciones.map((subscription) => webpush.sendNotification({
    endpoint: subscription.endpoint,
    keys: { p256dh: subscription.p256dh, auth: subscription.auth },
  }, payload)));
  const sent = results.filter((result) => result.status === 'fulfilled').length;
  return json({ sent, registered: true });
});
