import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

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
    const { mensaje, historial = [], empresa, usuario } = await req.json();

    if (!mensaje || typeof mensaje !== 'string') {
      return new Response(
        JSON.stringify({ error: 'El mensaje es requerido y debe ser texto' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const geminiApiKey = Deno.env.get('GEMINI_API_KEY');
    if (!geminiApiKey) {
      return new Response(
        JSON.stringify({ error: 'API key de Google Gemini no configurada' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Intentar resolver la empresa y usuario a partir del token de autorización
    const authHeader = req.headers.get('Authorization');
    let empresaNombre = empresa || 'tu negocio';
    let usuarioNombre = usuario || 'Usuario';

    if (authHeader) {
      try {
        const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
        const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') || '';
        const supabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
          global: { headers: { Authorization: authHeader } }
        });
        
        const { data: { user } } = await supabaseClient.auth.getUser();
        if (user) {
          const { data: profile } = await supabaseClient
            .from('usuarios')
            .select('nombre, empresas(nombre)')
            .eq('auth_user_id', user.id)
            .maybeSingle();
            
          if (profile) {
            if (profile.nombre) usuarioNombre = profile.nombre;
            if (profile.empresas?.nombre) empresaNombre = profile.empresas.nombre;
          }
        }
      } catch (dbErr) {
        console.error('Error al obtener perfil del usuario desde DB en asistente-ia:', dbErr);
      }
    }

    // Construir el prompt completo con contexto
    const historialTexto = historial
      .map((m: any) => `${m.role === 'user' ? 'Usuario' : 'Asistente'}: ${m.text}`)
      .join('\n');
    
    const promptCompleto = `Eres un asistente virtual amable y útil para el sistema de punto de venta (POS) llamado PYpos.
Estás conversando con ${usuarioNombre}, quien pertenece a la empresa "${empresaNombre}".
Toda tu ayuda, respuestas y contexto deben referirse exclusivamente a la empresa "${empresaNombre}".
Bajo ninguna circunstancia debes mencionar a "GDA" o "GDA POS" a menos que la empresa del usuario se llame exactamente así.
Ayuda al usuario con preguntas sobre el sistema, productos, ventas, inventario, clientes, etc.
Responde en español, de forma concisa y profesional.

${historialTexto ? 'Historial de conversación:\n' + historialTexto + '\n\n' : ''}Usuario: ${mensaje}`;

    // Llamar a Google Gemini
    const response = await fetch(`https://generativelanguage.googleapis.com/v1/models/gemini-pro:generateContent?key=${geminiApiKey}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              {
                text: promptCompleto,
              },
            ],
          },
        ],
        generationConfig: {
          maxOutputTokens: 500,
          temperature: 0.7,
        },
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`Google Gemini error: ${error.error?.message || 'Error desconocido'}`);
    }

    const data = await response.json();
    const respuesta = data.candidates?.[0]?.content?.parts?.[0]?.text || 'No pude generar una respuesta';

    return new Response(
      JSON.stringify({ respuesta }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    const error = err instanceof Error ? err.message : 'Error desconocido';
    console.error('Error en asistente-ia:', error);
    console.error('Stack:', err);
    return new Response(
      JSON.stringify({ error: `Error: ${error}` }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

// Log para debug
console.log('Función asistente-ia iniciada');
