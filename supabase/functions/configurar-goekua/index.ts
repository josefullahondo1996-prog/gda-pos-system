import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getAuthenticatedUser, unauthorized } from '../_shared/auth.ts';

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Método no permitido.' }, 405);
  const { user, error } = await getAuthenticatedUser(req);
  if (!user) return unauthorized(error || 'No autorizado.', cors);
  const body = await req.json().catch(() => null);
  const empresaId = String(body?.empresaId || '');
  if (!/^[0-9a-f-]{36}$/i.test(empresaId)) return json({ error: 'Empresa inválida.' }, 400);
  const supabase = createClient(Deno.env.get('SUPABASE_URL') || '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '');
  const { data: miembro } = await supabase.from('usuarios').select('id,rol_id,activo,permitir_acceso')
    .eq('auth_user_id', user.id).eq('empresa_id', empresaId).maybeSingle();
  if (!miembro?.activo || !miembro?.permitir_acceso) return unauthorized('No tenés acceso activo a esta empresa.', cors);
  const { data: rol } = await supabase.from('roles').select('nombre').eq('id', miembro.rol_id).maybeSingle();
  if (!String(rol?.nombre || '').toLowerCase().includes('admin')) return json({ error: 'Solo un administrador puede configurar Goekua.' }, 403);

  if (body.action === 'status') {
    const { data } = await supabase.from('goekua_credenciales').select('ambiente,base_url,activa,actualizada_en').eq('empresa_id', empresaId).maybeSingle();
    return json({ configurada: !!data, ambiente: data?.ambiente || null, baseUrl: data?.base_url || null, activa: data?.activa || false, actualizadaEn: data?.actualizada_en || null });
  }
  const ambiente = body.ambiente === 'staging' ? 'staging' : null;
  const apiKey = String(body.apiKey || '').trim();
  const baseUrlText = String(body.baseUrl || '').trim().replace(/\/$/, '');
  if (!ambiente) return json({ error: 'Por ahora solo se permite preparar el ambiente staging.' }, 400);
  if (apiKey.length < 12 || apiKey.length > 500) return json({ error: 'Ingresá la API key de staging válida de Goekua.' }, 400);
  let url: URL;
  try { url = new URL(baseUrlText); } catch { return json({ error: 'La URL de staging no es válida.' }, 400); }
  if (url.protocol !== 'https:' || !/(^|\.)goekua\.com\.py$/i.test(url.hostname) || !/staging/i.test(url.hostname) || !['', '/'].includes(url.pathname) || url.search || url.hash) {
    return json({ error: 'La base debe ser el host HTTPS de staging confirmado por Goekua (sin rutas).' }, 400);
  }
  const encoded = Deno.env.get('GOEKUA_ENCRYPTION_KEY') || '';
  const raw = Uint8Array.from(atob(encoded), (char) => char.charCodeAt(0));
  if (raw.length !== 32) return json({ error: 'Falta preparar el secreto GOEKUA_ENCRYPTION_KEY en Supabase.' }, 503);
  const cryptoKey = await crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt']);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, cryptoKey, new TextEncoder().encode(apiKey));
  const b64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
  const { error: saveError } = await supabase.from('goekua_credenciales').upsert({
    empresa_id: empresaId, ambiente, api_key_cifrada: b64(new Uint8Array(encrypted)), api_key_iv: b64(iv), base_url: url.origin,
    activa: true, actualizada_en: new Date().toISOString(),
  });
  if (saveError) return json({ error: 'No se pudo guardar la configuración segura.' }, 500);
  return json({ configurada: true, ambiente, activa: false, mensaje: 'Clave de staging cifrada. La emisión sigue bloqueada hasta completar los datos fiscales y la validación de Goekua.' });
});
