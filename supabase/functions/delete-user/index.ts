import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getAuthenticatedUser, unauthorized } from '../_shared/auth.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS, PUT, DELETE',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { user, error: authError } = await getAuthenticatedUser(req);
    if (!user) return unauthorized(authError || 'No autorizado.', corsHeaders);

    const { usuario_id, empresa_id } = await req.json();

    if (!usuario_id || !empresa_id) {
      return new Response(JSON.stringify({ error: 'Falta usuario_id o empresa_id.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { data: solicitante } = await supabaseAdmin
      .from('usuarios')
      .select('empresa_id, roles(nombre)')
      .eq('auth_user_id', user.id)
      .eq('empresa_id', empresa_id)
      .maybeSingle();
    const rol = String(solicitante?.roles?.nombre || '').toLowerCase();
    if (!solicitante || !rol.includes('admin')) {
      return unauthorized('No tenés permisos para eliminar usuarios.', corsHeaders);
    }

    // Leer la ficha dentro de la empresa autorizada y usar su auth_user_id real.
    // No confiar en un auth_user_id enviado por el cliente: podría apuntar a otra cuenta.
    const { data: fichaObjetivo, error: errorLectura } = await supabaseAdmin
      .from('usuarios')
      .select('id, auth_user_id')
      .eq('id', usuario_id)
      .eq('empresa_id', empresa_id)
      .maybeSingle();
    if (errorLectura) throw errorLectura;
    if (!fichaObjetivo) {
      return new Response(JSON.stringify({ error: 'No se encontró ese usuario en tu empresa (o ya estaba borrado).' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Si la ficha tenía acceso al sistema, borrar solo la cuenta enlazada en la base.
    if (fichaObjetivo.auth_user_id) {
      const { error: errorAuth } = await supabaseAdmin.auth.admin.deleteUser(fichaObjetivo.auth_user_id);
      if (errorAuth && errorAuth.status !== 404) throw errorAuth;
    }

    // Borrar la ficha dentro de la misma empresa, aunque la clave de servicio salte RLS.
    const { error: errorFicha, data: filaBorrada } = await supabaseAdmin
      .from('usuarios')
      .delete()
      .eq('id', fichaObjetivo.id)
      .eq('empresa_id', empresa_id)
      .select();
    if (errorFicha) throw errorFicha;
    if (!filaBorrada || filaBorrada.length === 0) {
      return new Response(JSON.stringify({ error: 'No se encontró ese usuario en tu empresa (o ya estaba borrado).' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    return new Response(JSON.stringify({ error: err.message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
