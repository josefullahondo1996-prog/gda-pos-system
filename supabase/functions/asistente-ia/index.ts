import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

interface NegocioItem {
  id?: string;
  nombre?: string;
  nombre_empresa?: string;
  stock_actual?: number;
  precio_venta?: number;
  total?: number | string;
  fecha?: string;
  metodo_pago?: string;
  estado_pago?: string;
  estado?: string;
  saldo_inicial?: number | string;
  saldo_final?: number | string;
  fecha_apertura?: string;
  fecha_cierre?: string;
  descripcion?: string;
  monto?: number | string;
  categoria?: string;
  creado_en?: string;
  celular?: string;
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function jsonResponse(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function getDateRange() {
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const manana = new Date(hoy);
  manana.setDate(hoy.getDate() + 1);
  return { inicioDia: hoy, finDia: manana };
}

function parseMonto(texto: string): string | null {
  const regex = /(\d{1,3}(?:\.\d{3})*(?:,\d+)?|\d+(?:,\d+)?)/;
  const match = texto.match(regex);
  if (match) {
    return match[1].replace(/\./g, '').replace(',', '.');
  }
  return null;
}

function describirGasto(texto: string): string {
  const palabras = texto
    .toLowerCase()
    .replace(/registr[aá]\s+gasto|nuevo\s+gasto|gasto/gi, '')
    .replace(/de\s+\d+[\.\d]*/g, '')
    .trim();
  return palabras.substring(0, 100) || 'Gasto del sistema';
}

async function obtenerUbicacionId(
  supabaseClient: ReturnType<typeof createClient>,
  empresaId: string,
  usuarioId: string
): Promise<string | null> {
  const { data } = await supabaseClient
    .from('usuarios')
    .select('ubicacion_id')
    .eq('id', usuarioId)
    .eq('empresa_id', empresaId)
    .limit(1)
    .maybeSingle();

  return data?.ubicacion_id || null;
}

const ejecutarAccion = async (supabaseClient: any, mensaje: string, empresaId: string, usuarioNombre: string, usuarioId: string) => {
  const texto = mensaje.toLowerCase();

  if (texto.includes('abrir caja') || texto.includes('abre la caja') || texto.includes('abrir la caja')) {
    const monto = parseMonto(mensaje);
    if (!monto && monto !== 0) {
      return {
        accion: 'abrir_caja',
        respuesta: 'No encontré el monto inicial para abrir la caja. Decime algo como: “Abrir caja con 500000”.',
      };
    }

    const { data: cajaAbierta } = await supabaseClient
      .from('caja_registros')
      .select('id')
      .eq('empresa_id', empresaId)
      .eq('estado', 'Abierta')
      .limit(1)
      .maybeSingle();

    if (cajaAbierta) {
      return {
        accion: 'abrir_caja',
        respuesta: 'Ya hay una caja abierta para esta empresa. Primero cerrá la caja actual antes de abrir otra.',
      };
    }

    const ubicacionId = await obtenerUbicacionId(supabaseClient, empresaId, usuarioId);

    const { error } = await supabaseClient
      .from('caja_registros')
      .insert([
        {
          empresa_id: empresaId,
          saldo_inicial: Number(monto),
          saldo_final: Number(monto),
          estado: 'Abierta',
          fecha_apertura: new Date().toISOString(),
          usuario: usuarioNombre,
          ubicacion_id: ubicacionId,
        },
      ]);

    if (error) {
      throw new Error(`No pude abrir la caja: ${error.message}`);
    }

    return {
      accion: 'abrir_caja',
      respuesta: `Caja abierta correctamente con saldo inicial de ${Number(monto).toLocaleString('es-PY')} Gs.`,
    };
  }

  if (texto.includes('registrar gasto') || texto.includes('registrá gasto') || texto.includes('gasto') || texto.includes('nuevo gasto')) {
    const monto = parseMonto(mensaje);
    if (!monto && monto !== 0) {
      return {
        accion: 'registrar_gasto',
        respuesta: 'No encontré el monto del gasto. Decime algo como: “Registrar gasto de 150000 por luz”.',
      };
    }

    const ubicacionId = await obtenerUbicacionId(supabaseClient, empresaId, usuarioId);
    const descripcion = describirGasto(mensaje);

    const { error } = await supabaseClient
      .from('gastos')
      .insert([
        {
          empresa_id: empresaId,
          descripcion,
          monto: Number(monto),
          ubicacion_id: ubicacionId,
          categoria: 'IA',
          metodo_pago: 'Efectivo',
        },
      ]);

    if (error) {
      throw new Error(`No pude registrar el gasto: ${error.message}`);
    }

    return {
      accion: 'registrar_gasto',
      respuesta: `Gasto registrado correctamente por ${Number(monto).toLocaleString('es-PY')} Gs. Concepto: ${descripcion}.`,
    };
  }

  return null;
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // ===== VALIDACIÓN DE AUTENTICACIÓN =====
    const authHeader = req.headers.get('Authorization') ?? '';
    const token = authHeader.replace(/^Bearer\s+/i, '');
    if (!token) {
      return jsonResponse({ error: 'No autenticado.' }, 401);
    }

    // ===== VALIDACIÓN DE PAYLOAD =====
    const body = await req.json();
    const { mensaje, historial = [], empresa, usuario, empresaId, usuarioId } = body || {};

    if (!mensaje || typeof mensaje !== 'string') {
      return jsonResponse({ error: 'El mensaje es requerido y debe ser texto' }, 400);
    }

    // ===== VALIDACIÓN DE CREDENCIALES GEMINI =====
    const geminiApiKey = Deno.env.get('GEMINI_API_KEY');
    if (!geminiApiKey) {
      return jsonResponse(
        { error: 'GEMINI_API_KEY no configurada en los secretos del proyecto.' },
        500
      );
    }

    // ===== CREAR CLIENTE SUPABASE ANON =====
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
    const supabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: authHeader ? { Authorization: authHeader } : {} },
    });

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { data: solicitante, error: errorSolicitante } = await supabaseAdmin.auth.getUser(token);
    if (errorSolicitante || !solicitante?.user) {
      return jsonResponse({ error: 'Sesión inválida o expirada.' }, 401);
    }

    let empresaNombre = empresa || 'tu negocio';
    let usuarioNombre = usuario || 'Usuario';
    let empresaIdReal = empresaId || null;

    if (authHeader || empresaId || usuarioId) {
      try {
        const { data: profile } = await supabaseClient
          .from('usuarios')
          .select('id, nombre, empresa_id, empresas(id, nombre, ruc, direccion, telefono)')
          .eq('auth_user_id', solicitante.user.id)
          .limit(1)
          .maybeSingle();

        if (profile) {
          if (profile.nombre) usuarioNombre = profile.nombre;
          if (profile.empresa_id) empresaIdReal = profile.empresa_id;
          if (profile.empresas?.nombre) empresaNombre = profile.empresas.nombre;
          if (profile.empresas?.id) empresaIdReal = profile.empresas.id;
        }
      } catch (dbErr) {
        console.error('Error al obtener perfil del usuario:', dbErr);
      }
    }

    if (empresaIdReal) {
      try {
        const accionEjecutada = await ejecutarAccion(
          supabaseClient,
          mensaje,
          empresaIdReal,
          usuarioNombre,
          usuarioId || solicitante.user.id
        );

        if (accionEjecutada) {
          return jsonResponse({ respuesta: accionEjecutada.respuesta }, 200);
        }
      } catch (actionErr) {
        console.error('Error al ejecutar acción:', actionErr);
      }
    }

    let contextoNegocio = 'No hay datos del negocio cargados aún.';

    if (empresaIdReal) {
      try {
        const { inicioDia, finDia } = getDateRange();

        const [ventasHoyRes, productosBajosRes, cajaRes, gastosHoyRes, clientesRes] = await Promise.all([
          supabaseClient
            .from('ventas')
            .select('id, total, fecha, metodo_pago, estado_pago')
            .eq('empresa_id', empresaIdReal)
            .gte('fecha', inicioDia.toISOString())
            .lt('fecha', finDia.toISOString())
            .order('fecha', { ascending: false })
            .limit(10),
          supabaseClient
            .from('productos')
            .select('id, nombre, stock_actual, precio_venta')
            .eq('empresa_id', empresaIdReal)
            .lt('stock_actual', 5)
            .order('stock_actual', { ascending: true })
            .limit(10),
          supabaseClient
            .from('caja_registros')
            .select('id, estado, saldo_inicial, saldo_final, fecha_apertura, fecha_cierre')
            .eq('empresa_id', empresaIdReal)
            .order('fecha_apertura', { ascending: false })
            .limit(5),
          supabaseClient
            .from('gastos')
            .select('id, descripcion, monto, categoria, creado_en')
            .eq('empresa_id', empresaIdReal)
            .gte('creado_en', inicioDia.toISOString())
            .lt('creado_en', finDia.toISOString())
            .order('creado_en', { ascending: false })
            .limit(10),
          supabaseClient
            .from('clientes')
            .select('id, nombre, nombre_empresa, celular')
            .eq('empresa_id', empresaIdReal)
            .order('creado_en', { ascending: false })
            .limit(5),
        ]);

        const ventasHoy: NegocioItem[] = ventasHoyRes.data || [];
        const productosBajos: NegocioItem[] = productosBajosRes.data || [];
        const cajas: NegocioItem[] = cajaRes.data || [];
        const gastosHoy: NegocioItem[] = gastosHoyRes.data || [];
        const clientes: NegocioItem[] = clientesRes.data || [];

        const totalVentasHoy = ventasHoy.reduce<number>(
          (sum: number, item: NegocioItem) => sum + Number(item.total || 0),
          0
        );
        const totalGastosHoy = gastosHoy.reduce<number>(
          (sum: number, item: NegocioItem) => sum + Number(item.monto || 0),
          0
        );
        const cajaAbierta = cajas.find(
          (c: NegocioItem) => c.estado === 'abierta' || c.estado === 'ABIERTA'
        );
        const fechaApertura = cajaAbierta?.fecha_apertura
          ? new Date(cajaAbierta.fecha_apertura)
          : new Date();
        const cajeroEstado = cajaAbierta
          ? `Caja abierta desde ${fechaApertura.toLocaleString('es-PY')}. Saldo inicial ${Number(cajaAbierta.saldo_inicial || 0).toLocaleString('es-PY')} Gs.`
          : 'No hay caja abierta actualmente.';

        contextoNegocio = `
Empresa: ${empresaNombre}
Fecha: ${new Date().toLocaleDateString('es-PY', { dateStyle: 'full' })}
Ventas del día: ${ventasHoy.length} ventas, total acumulado ${Number(totalVentasHoy).toLocaleString('es-PY')} Gs.
Gastos del día: ${gastosHoy.length} registros, total ${Number(totalGastosHoy).toLocaleString('es-PY')} Gs.
Estado de caja: ${cajeroEstado}
Productos con stock bajo (menos de 5): ${
          productosBajos.length
            ? productosBajos
                .map((p: NegocioItem) => `${p.nombre} (${p.stock_actual} unidades)`)
                .join(', ')
            : 'Ninguno'
        }.
Clientes recientes: ${
          clientes.length
            ? clientes
                .map((c: NegocioItem) => c.nombre || c.nombre_empresa || 'Cliente')
                .slice(0, 3)
                .join(', ')
            : 'Sin clientes recientes'
        }.
Últimas ventas: ${
          ventasHoy.length
            ? ventasHoy
                .slice(0, 3)
                .map(
                  (v: NegocioItem) =>
                    `${new Date(v.fecha || new Date()).toLocaleString('es-PY', {
                      day: '2-digit',
                      month: '2-digit',
                      hour: '2-digit',
                      minute: '2-digit',
                    })} - ${Number(v.total || 0).toLocaleString('es-PY')} Gs`
                )
                .join(' | ')
            : 'Sin ventas hoy'
        }.
`;
      } catch (dbErr) {
        console.error('Error al consultar contexto del negocio:', dbErr);
      }
    }

    const historialTexto = Array.isArray(historial)
      ? historial
          .map((m: any) => `${m.role === 'user' ? 'Usuario' : 'Asistente'}: ${m.text || ''}`)
          .join('\n')
      : '';

    const promptCompleto = `Eres un asistente virtual especializado para el sistema POS de ${empresaNombre}. Tu tarea es apoyar a ${usuarioNombre} con consultas operativas del negocio usando únicamente este contexto y los datos del sistema.

Reglas:
- Responde en español, de forma breve, útil y profesional.
- Si puedes responder con información real del negocio, usa esos números y convierte a formato paraguayo (Gs, puntos para miles).
- Si no tienes la información exacta, dilo de forma honesta y ofrece el siguiente paso.
- Nunca inventes ventas, productos o clientes.
- No des instrucciones peligrosas ni acciones fuera del sistema.
- Enfócate en ventas, caja, inventario, clientes, proveedores, compras, gastos y reportes.
- Cuando el usuario solicite "abrir caja" o "registrar gasto", ayuda a completar la información necesaria (monto, descripción).

Contexto del negocio:
${contextoNegocio}

Historial reciente:
${historialTexto || 'Sin historial previo'}

Usuario: ${mensaje}`;

    const MODELOS_A_PROBAR = [
      'gemini-flash-latest',
      'gemini-2.5-flash',
      'gemini-2.0-flash',
    ];

    let respuestaFinal = null;
    let ultimoError = 'No se pudo consultar ningún modelo de Gemini.';
    let ultimoStatus = 500;

    for (const modelo of MODELOS_A_PROBAR) {
      try {
        const respuestaGemini = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent?key=${geminiApiKey}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{ parts: [{ text: promptCompleto }] }],
              generationConfig: {
                maxOutputTokens: 500,
                temperature: 0.5,
              },
            }),
          }
        );

        const cuerpo = await respuestaGemini.json();

        if (respuestaGemini.ok && cuerpo?.candidates?.[0]?.content?.parts?.[0]?.text) {
          respuestaFinal = cuerpo.candidates[0].content.parts[0].text;
          console.log(`Respuesta generada con modelo: ${modelo}`);
          break;
        }

        ultimoError = cuerpo?.error?.message || `Error en modelo ${modelo}`;
        ultimoStatus = respuestaGemini.status;

        if (respuestaGemini.status === 404) {
          console.warn(`Modelo ${modelo} no disponible, probando siguiente...`);
          continue;
        } else {
          break;
        }
      } catch (fetchErr) {
        console.error(`Error al intentar modelo ${modelo}:`, fetchErr);
        ultimoError = fetchErr instanceof Error ? fetchErr.message : 'Error desconocido en fetch';
        continue;
      }
    }

    if (!respuestaFinal) {
      return jsonResponse({ error: ultimoError }, ultimoStatus);
    }

    return jsonResponse({ respuesta: respuestaFinal }, 200);
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    console.error('Error en asistente-ia:', err);
    return jsonResponse({ error: err.message }, 500);
  }
});

console.log('Función asistente-ia iniciada con contexto, acciones y fallback de modelos.');
