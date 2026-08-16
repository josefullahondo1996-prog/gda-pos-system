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

    // ===== CREAR CLIENTE SUPABASE =====
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      supabaseAnonKey,
      {
        global: { headers: authHeader ? { Authorization: authHeader } : {} },
      }
    );

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

        const [ventasHoyRes, ultimasVentasRes, productosBajosRes, cajaRes, gastosHoyRes, clientesRes, allProductosRes] = await Promise.all([
          // Ventas de hoy con detalle exacto de productos vendidos
          supabaseAdmin
            .from('ventas')
            .select(`
              id,
              total,
              fecha,
              cliente,
              metodo_pago,
              estado_pago,
              articulos,
              descuento,
              nota_venta,
              detalle_ventas (
                id,
                nombre_producto,
                cantidad,
                precio_unitario,
                subtotal
              )
            `)
            .eq('empresa_id', empresaIdReal)
            .gte('fecha', inicioDia.toISOString())
            .lt('fecha', finDia.toISOString())
            .order('fecha', { ascending: false })
            .limit(25),

          // Últimas 20 ventas generales para consultas históricas o recientes
          supabaseAdmin
            .from('ventas')
            .select(`
              id,
              total,
              fecha,
              cliente,
              metodo_pago,
              estado_pago,
              articulos,
              detalle_ventas (
                nombre_producto,
                cantidad,
                precio_unitario,
                subtotal
              )
            `)
            .eq('empresa_id', empresaIdReal)
            .order('fecha', { ascending: false })
            .limit(20),

          // Productos bajos en stock
          supabaseAdmin
            .from('productos')
            .select('id, nombre, stock_actual, precio_venta')
            .eq('empresa_id', empresaIdReal)
            .lt('stock_actual', 5)
            .order('stock_actual', { ascending: true })
            .limit(15),

          // Caja registros
          supabaseAdmin
            .from('caja_registros')
            .select('id, estado, saldo_inicial, saldo_final, fecha_apertura, fecha_cierre')
            .eq('empresa_id', empresaIdReal)
            .order('fecha_apertura', { ascending: false })
            .limit(5),

          // Gastos de hoy
          supabaseAdmin
            .from('gastos')
            .select('id, descripcion, monto, categoria, creado_en')
            .eq('empresa_id', empresaIdReal)
            .gte('creado_en', inicioDia.toISOString())
            .lt('creado_en', finDia.toISOString())
            .order('creado_en', { ascending: false })
            .limit(10),

          // Clientes
          supabaseAdmin
            .from('clientes')
            .select('id, nombre, nombre_empresa, celular')
            .eq('empresa_id', empresaIdReal)
            .order('creado_en', { ascending: false })
            .limit(10),

          // Todos los productos
          supabaseAdmin
            .from('productos')
            .select('id, nombre, stock_actual, precio_venta, categoria')
            .eq('empresa_id', empresaIdReal)
            .order('stock_actual', { ascending: true })
            .limit(150),
        ]);

        const ventasHoy = ventasHoyRes.data || [];
        const ultimasVentas = ultimasVentasRes.data || [];
        const productosBajos = productosBajosRes.data || [];
        const cajas = cajaRes.data || [];
        const gastosHoy = gastosHoyRes.data || [];
        const clientes = clientesRes.data || [];
        const todosProductos = allProductosRes.data || [];

        // Análisis de totales del día
        const totalVentasHoy = ventasHoy.reduce<number>(
          (sum: number, item: any) => sum + Number(item.total || 0),
          0
        );
        const totalGastosHoy = gastosHoy.reduce<number>(
          (sum: number, item: any) => sum + Number(item.monto || 0),
          0
        );
        const gananciaHoy = totalVentasHoy - totalGastosHoy;
        const ticketPromedio = ventasHoy.length > 0 ? totalVentasHoy / ventasHoy.length : 0;
        
        // Agrupar productos vendidos hoy para calcular el ranking de más vendidos
        const conteoProductosHoy: Record<string, { cantidad: number; totalGs: number }> = {};
        ventasHoy.forEach((v: any) => {
          if (Array.isArray(v.detalle_ventas)) {
            v.detalle_ventas.forEach((det: any) => {
              const prodNombre = det.nombre_producto || 'Producto sin nombre';
              const cant = Number(det.cantidad || 0);
              const subt = Number(det.subtotal || (cant * Number(det.precio_unitario || 0)));
              if (!conteoProductosHoy[prodNombre]) {
                conteoProductosHoy[prodNombre] = { cantidad: 0, totalGs: 0 };
              }
              conteoProductosHoy[prodNombre].cantidad += cant;
              conteoProductosHoy[prodNombre].totalGs += subt;
            });
          }
        });

        const rankingProductosHoy = Object.entries(conteoProductosHoy)
          .map(([nombre, datos]) => ({ nombre, ...datos }))
          .sort((a, b) => b.cantidad - a.cantidad);

        // Formatear desglose detallado de cada venta de hoy con sus ítems exactos
        const detalleVentasHoyTexto = ventasHoy.length > 0
          ? ventasHoy.map((v: any, index: number) => {
              const hora = new Date(v.fecha || new Date()).toLocaleTimeString('es-PY', { hour: '2-digit', minute: '2-digit' });
              const clienteStr = v.cliente ? ` | Cliente: ${v.cliente}` : '';
              const pagoStr = v.metodo_pago ? ` (${v.metodo_pago})` : '';
              
              let itemsTexto = '     (Sin detalle de ítems registrado)';
              if (Array.isArray(v.detalle_ventas) && v.detalle_ventas.length > 0) {
                itemsTexto = v.detalle_ventas.map((det: any) => 
                  `     • ${det.cantidad}x ${det.nombre_producto || 'Producto'} @ ${Number(det.precio_unitario || 0).toLocaleString('es-PY')} Gs (Subtotal: ${Number(det.subtotal || 0).toLocaleString('es-PY')} Gs)`
                ).join('\n');
              }
              return `  Venta #${index + 1} [${hora}] Total: ${Number(v.total || 0).toLocaleString('es-PY')} Gs${clienteStr}${pagoStr}\n${itemsTexto}`;
            }).join('\n\n')
          : '  Sin ventas registradas hoy.';

        // Formatear ranking de los productos más vendidos hoy
        const rankingProductosTexto = rankingProductosHoy.length > 0
          ? rankingProductosHoy.slice(0, 10).map((p, i) => 
              `  ${i + 1}. ${p.nombre}: ${p.cantidad} un. vendidas (${Number(p.totalGs).toLocaleString('es-PY')} Gs total)`
            ).join('\n')
          : '  Sin productos vendidos hoy.';

        // Formatear últimas ventas generales (para consultas recientes o días anteriores)
        const ultimasVentasGeneralesTexto = ultimasVentas.length > 0
          ? ultimasVentas.slice(0, 5).map((v: any) => {
              const fechaStr = new Date(v.fecha || new Date()).toLocaleString('es-PY', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
              const prodsStr = Array.isArray(v.detalle_ventas) && v.detalle_ventas.length > 0
                ? v.detalle_ventas.map((d: any) => `${d.cantidad}x ${d.nombre_producto}`).join(', ')
                : 'Ítems no especificados';
              return `  - [${fechaStr}] ${Number(v.total || 0).toLocaleString('es-PY')} Gs | Productos: ${prodsStr}`;
            }).join('\n')
          : '  Sin historial reciente.';

        // Alertas automáticas
        const alertas: string[] = [];
        if (productosBajos.length > 0) {
          alertas.push(`⚠️ ${productosBajos.length} productos con stock crítico (< 5 unidades)`);
        }
        if (gananciaHoy < 0) {
          alertas.push(`⚠️ Día con pérdida: -${Math.abs(gananciaHoy).toLocaleString('es-PY')} Gs`);
        }
        if (ventasHoy.length === 0) {
          alertas.push(`⚠️ Sin ventas registradas hoy`);
        }
        
        const cajaAbierta = cajas.find(
          (c: NegocioItem) => c.estado === 'abierta' || c.estado === 'ABIERTA'
        );
        const fechaApertura = cajaAbierta?.fecha_apertura
          ? new Date(cajaAbierta.fecha_apertura)
          : new Date();
        const cajeroEstado = cajaAbierta
          ? `Caja abierta desde ${fechaApertura.toLocaleString('es-PY')}. Saldo inicial ${Number(cajaAbierta.saldo_inicial || 0).toLocaleString('es-PY')} Gs.`
          : 'No hay caja abierta actualmente.';

        const stockTotalProductos = todosProductos.length;
        const productosAgotados = todosProductos.filter((p: NegocioItem) => Number(p.stock_actual || 0) === 0).length;

        contextoNegocio = `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📊 CONTEXTO DEL NEGOCIO - ${empresaNombre}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📅 FECHA ACTUAL: ${new Date().toLocaleDateString('es-PY', { dateStyle: 'full', timeStyle: 'short' })}
👤 USUARIO ACTUAL: ${usuarioNombre}

━━ RESUMEN GENERAL DE HOY ━━
💰 Ventas totales: ${ventasHoy.length} transacciones | Múltiple total: ${Number(totalVentasHoy).toLocaleString('es-PY')} Gs
💸 Gastos totales: ${gastosHoy.length} registros | Total: ${Number(totalGastosHoy).toLocaleString('es-PY')} Gs
📈 Ganancia neta: ${gananciaHoy >= 0 ? '+' : ''}${Number(gananciaHoy).toLocaleString('es-PY')} Gs
🧾 Ticket promedio: ${Number(ticketPromedio).toLocaleString('es-PY')} Gs

━━ RANKING DE PRODUCTOS MÁS VENDIDOS HOY ━━
${rankingProductosTexto}

━━ DETALLE DE CADA VENTA REGISTRADA HOY (CON PRODUCTOS EXACTOS) ━━
${detalleVentasHoyTexto}

━━ HISTORIAL DE ÚLTIMAS VENTAS RECIENTES ━━
${ultimasVentasGeneralesTexto}

━━ ESTADO DE CAJA ━━
${cajeroEstado}

━━ INVENTARIO ━━
📦 Total de productos en catálogo: ${stockTotalProductos}
🔴 Productos agotados: ${productosAgotados}
🟡 Productos con stock bajo (< 5 un.): ${productosBajos.length}
${productosBajos.length > 0 ? `   Lista de stock bajo: ${productosBajos.slice(0, 5).map((p: NegocioItem) => `${p.nombre} (${p.stock_actual} un.)`).join(' | ')}` : ''}

━━ CLIENTES RECIENTES ━━
👥 ${clientes.length > 0 ? clientes.map((c: NegocioItem) => c.nombre || c.nombre_empresa || 'Cliente').slice(0, 5).join(', ') : 'Sin registros'}

━━ ALERTAS DEL SISTEMA ━━
${alertas.length > 0 ? alertas.join('\n') : '✅ Sin alertas críticas'}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
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

    const promptCompleto = `Eres un asistente virtual avanzado especializado para el sistema POS de ${empresaNombre}. Tu tarea es responder a ${usuarioNombre} sobre las ventas del negocio, especificando exactamente los productos que se vendieron, cantidades, precios, clientes y montos totales usando este contexto de datos actualizados.

Reglas obligatorias:
- Responde en español, de forma clara, directa, amable y profesional.
- Cuando pregunten sobre ventas o productos vendidos, especifica detalladamente los NOMBRES EXACTOS DE LOS PRODUCTOS, las cantidades, el precio unitario y el cliente/método de pago si están disponibles.
- Usa los números reales provistos y dale formato en Guaraníes paraguayos (Gs, usando puntos para los miles, ej: 150.000 Gs).
- Si te preguntan por el producto más vendido, revisa el "RANKING DE PRODUCTOS MÁS VENDIDOS HOY".
- Si no hay ventas registradas o la información no está en el contexto, dilo de forma transparente sin inventar.
- No des instrucciones ni acciones peligrosas fuera del sistema.
- Cuando el usuario solicite "abrir caja" o "registrar gasto", ayuda a completar la información necesaria (monto, descripción).

Contexto completo del negocio:
${contextoNegocio}

Historial reciente de la conversación:
${historialTexto || 'Sin historial previo'}

Consulta del Usuario: ${mensaje}`;

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
                maxOutputTokens: 650,
                temperature: 0.4,
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

console.log('Función asistente-ia actualizada con detalle exacto de ventas y productos.');
