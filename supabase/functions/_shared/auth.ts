import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

export async function getAuthenticatedUser(req: Request) {
  const authorization = req.headers.get('Authorization');
  if (!authorization?.startsWith('Bearer ')) {
    return { user: null, error: 'Falta el token de autenticación.' };
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_ANON_KEY') ?? '',
    { global: { headers: { Authorization: authorization } } },
  );

  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) {
    return { user: null, error: 'Sesión inválida o expirada.' };
  }

  return { user: data.user, error: null };
}

export function unauthorized(message: string, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify({ error: message }), {
    status: 401,
    headers: { ...headers, 'Content-Type': 'application/json' },
  });
}
