import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

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
    const { auth_user_id, usuario_id, empresa_id } = await req.json();

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

    // 1) Borramos la ficha de la tabla "usuarios", limitado siempre a su propia
    // empresa: aunque esto corre con la clave de servicio (que salta RLS),
    // este WHERE explícito evita que una empresa pueda borrar la ficha de otra.
    const { error: errorFicha, data: filaBorrada } = await supabaseAdmin
      .from('usuarios')
      .delete()
      .eq('id', usuario_id)
      .eq('empresa_id', empresa_id)
      .select();
    if (errorFicha) throw errorFicha;
    if (!filaBorrada || filaBorrada.length === 0) {
      return new Response(JSON.stringify({ error: 'No se encontró ese usuario en tu empresa (o ya estaba borrado).' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 2) Si además tenía acceso al sistema (login), borramos también su cuenta de Auth
    if (auth_user_id) {
      const { error: errorAuth } = await supabaseAdmin.auth.admin.deleteUser(auth_user_id);
      // Si la cuenta de Auth ya no existía, no lo tratamos como un error fatal:
      // la ficha ya se borró, que es lo que más le importa al usuario.
      if (errorAuth && errorAuth.status !== 404) throw errorAuth;
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
