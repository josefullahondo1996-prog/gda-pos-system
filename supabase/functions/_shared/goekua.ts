import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

export type GoekuaCredential = { apiKey: string; baseUrl: string; ambiente: 'staging' | 'production' };

export async function getGoekuaCredential(
  supabase: ReturnType<typeof createClient>, empresaId: string,
): Promise<GoekuaCredential | null> {
  const { data, error } = await supabase.from('goekua_credenciales')
    .select('ambiente, api_key_cifrada, api_key_iv, base_url, activa')
    .eq('empresa_id', empresaId).maybeSingle();
  if (error || !data?.activa) return null;

  const encodedKey = Deno.env.get('GOEKUA_ENCRYPTION_KEY') || '';
  const rawKey = Uint8Array.from(atob(encodedKey), (char) => char.charCodeAt(0));
  if (rawKey.length !== 32) throw new Error('Falta configurar GOEKUA_ENCRYPTION_KEY (32 bytes en Base64).');
  const cryptoKey = await crypto.subtle.importKey('raw', rawKey, 'AES-GCM', false, ['decrypt']);
  const encrypted = Uint8Array.from(atob(data.api_key_cifrada), (char) => char.charCodeAt(0));
  const iv = Uint8Array.from(atob(data.api_key_iv), (char) => char.charCodeAt(0));
  const clear = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, cryptoKey, encrypted);
  return { apiKey: new TextDecoder().decode(clear), baseUrl: data.base_url.replace(/\/$/, ''), ambiente: data.ambiente };
}
