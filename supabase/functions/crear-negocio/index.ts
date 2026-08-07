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
    const { nombreNegocio, nombreAdmin, email, password } = await req.json();

    if (!nombreNegocio || !email || !password) {
      return new Response(JSON.stringify({ error: 'Faltan datos: nombre del negocio, email y contraseña son obligatorios.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { data: empresa, error: errorEmpresa } = await supabaseAdmin
      .from('empresas')
      .insert([{ nombre: nombreNegocio }])
      .select()
      .single();
    if (errorEmpresa) throw errorEmpresa;

    const { data: rol, error: errorRol } = await supabaseAdmin
      .from('roles')
      .insert([{ nombre: 'Admin', permisos: {}, empresa_id: empresa.id }])
      .select()
      .single();
    if (errorRol) throw errorRol;

    const { data: authData, error: errorAuth } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (errorAuth) throw errorAuth;

    const { error: errorUsuario } = await supabaseAdmin.from('usuarios').insert([{
      auth_user_id: authData.user.id,
      nombre: nombreAdmin || nombreNegocio,
      nombre_usuario: email.split('@')[0] || null,
      email,
      activo: true,
      permitir_acceso: true,
      empresa_id: empresa.id,
      rol_id: rol.id,
    }]);
    if (errorUsuario) throw errorUsuario;

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
