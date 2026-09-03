import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getAuthenticatedUser, unauthorized } from '../_shared/auth.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { user, error: authError } = await getAuthenticatedUser(req);
    if (!user) return unauthorized(authError || 'No autorizado.', corsHeaders);

    const { cdc, empresaId } = await req.json();

    if (!cdc || !empresaId) {
      return new Response(
        JSON.stringify({ error: 'Faltan parámetros: cdc y empresaId' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { data: miembro } = await supabase
      .from('usuarios')
      .select('id')
      .eq('auth_user_id', user.id)
      .eq('empresa_id', empresaId)
      .maybeSingle();
    if (!miembro) return unauthorized('No tenés acceso a esta empresa.', corsHeaders);

    // Obtener API Key de la empresa
    const { data: empresa, error: empresaError } = await supabase
      .from('empresas')
      .select('fe_api_key, fe_activa')
      .eq('id', empresaId)
      .single();

    if (empresaError || !empresa) {
      throw new Error('Empresa no encontrada.');
    }

    if (!empresa.fe_activa || !empresa.fe_api_key) {
      return new Response(
        JSON.stringify({ error: 'Facturación electrónica no está activa.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Consultar el documento en Goekua
    const response = await fetch(
      `https://api.goekua.com.py/api/electronic-document/${cdc}`,
      {
        method: 'GET',
        headers: { 'x-api-key': empresa.fe_api_key },
      }
    );

    const goekuaData = await response.json();

    if (!response.ok) {
      throw new Error(`Error de Goekua (${response.status}): ${JSON.stringify(goekuaData)}`);
    }

    // Actualizar la venta en Supabase con el estado actual
    if (goekuaData.status) {
      const updateData = {
        estado_sifen: goekuaData.status,
      };

      // Guardar el CDC y la URL del KuDE si están disponibles
      if (goekuaData.cdc) updateData.cdc = goekuaData.cdc;
      if (goekuaData.kudeUrl) updateData.kude_url = goekuaData.kudeUrl;

      await supabase
        .from('ventas')
        .update(updateData)
        .eq('goekua_id', cdc)
        .eq('empresa_id', empresaId);
    }

    return new Response(
      JSON.stringify({
        status: goekuaData.status,
        cdc: goekuaData.cdc || cdc,
        kudeUrl: goekuaData.kudeUrl || null,
        sifenAuthorization: goekuaData.sifenAuthorization || null,
        responseSifenMessage: goekuaData.responseSifenMessage || null,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
