import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// Mapea los métodos de pago del POS a los códigos SIFEN de Goekua
const METODO_PAGO_SIFEN = {
  'Efectivo': 1,
  'Tarjeta': 3,       // Tarjeta de crédito
  'Transferencia': 5,  // Transferencia bancaria
  'QR/PIX': 5,
  'Pago Múltiple': 1,  // Fallback a efectivo
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { ventaId, empresaId } = await req.json();

    if (!ventaId || !empresaId) {
      return new Response(
        JSON.stringify({ error: 'Faltan parámetros requeridos: ventaId y empresaId' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Inicializar Supabase con la clave de servicio (acceso completo)
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // ──────────────────────────────────────────────────────────
    // 1. Obtener configuración de la empresa (API Key, RUC, etc.)
    // ──────────────────────────────────────────────────────────
    const { data: empresa, error: empresaError } = await supabase
      .from('empresas')
      .select('fe_api_key, fe_activa, fe_proveedor, ruc, nombre, direccion, telefono, email')
      .eq('id', empresaId)
      .single();

    if (empresaError || !empresa) {
      throw new Error('Empresa no encontrada: ' + (empresaError?.message || ''));
    }

    if (!empresa.fe_activa || !empresa.fe_api_key) {
      return new Response(
        JSON.stringify({ error: 'La facturación electrónica no está activa o falta la API Key. Configurala en Ajustes → Facturación Electrónica.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ──────────────────────────────────────────────────────────
    // 2. Obtener datos de la venta
    // ──────────────────────────────────────────────────────────
    const { data: venta, error: ventaError } = await supabase
      .from('ventas')
      .select('*')
      .eq('id', ventaId)
      .eq('empresa_id', empresaId)
      .single();

    if (ventaError || !venta) {
      throw new Error('Venta no encontrada: ' + (ventaError?.message || ''));
    }

    // Evitar duplicados
    if (venta.goekua_id) {
      return new Response(
        JSON.stringify({ error: 'Esta venta ya tiene una factura electrónica generada.', goekua_id: venta.goekua_id }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ──────────────────────────────────────────────────────────
    // 3. Obtener ítems de la venta (tabla detalle_ventas)
    // ──────────────────────────────────────────────────────────
    const { data: items, error: itemsError } = await supabase
      .from('detalle_ventas')
      .select('*')
      .eq('venta_id', ventaId);

    if (itemsError) {
      throw new Error('Error al obtener ítems: ' + itemsError.message);
    }

    if (!items || items.length === 0) {
      throw new Error('La venta no tiene productos asociados en detalle_ventas.');
    }

    // ──────────────────────────────────────────────────────────
    // 4. Buscar el cliente en la base de datos (si no es "Cliente Ocasional")
    // ──────────────────────────────────────────────────────────
    let clienteData = null;
    if (venta.cliente && venta.cliente !== 'Cliente Ocasional') {
      const { data: clientes } = await supabase
        .from('clientes')
        .select('*')
        .eq('empresa_id', empresaId)
        .or(`nombre.eq.${venta.cliente},nombre_empresa.eq.${venta.cliente}`)
        .limit(1);
      
      if (clientes && clientes.length > 0) {
        clienteData = clientes[0];
      }
    }

    // ──────────────────────────────────────────────────────────
    // 5. Determinar datos del receptor para Goekua
    // ──────────────────────────────────────────────────────────
    let isContributor = false;
    let rucCliente = '';
    let documentType = 1;  // 1: Cédula
    let documentNumber = '0';
    let businessName = 'Sin Nombre';
    let operationType = 2; // 2: B2C (consumidor final)
    let contributorType = 1; // 1: Persona Física

    if (clienteData) {
      businessName = clienteData.nombre_empresa || clienteData.nombre || businessName;
      
      if (clienteData.tipo_documento === 'RUC' && clienteData.documento_nro) {
        // Es contribuyente (tiene RUC)
        isContributor = true;
        rucCliente = clienteData.documento_nro;
        operationType = 1; // B2B
        contributorType = clienteData.nombre_empresa ? 2 : 1; // 2: Persona Jurídica si tiene nombre de empresa
        documentNumber = '';
      } else if (clienteData.documento_nro) {
        // Tiene cédula u otro documento
        documentNumber = clienteData.documento_nro;
      }
    }

    // ──────────────────────────────────────────────────────────
    // 6. Armar el payload para Goekua
    // ──────────────────────────────────────────────────────────
    const nombrePartes = (empresa.nombre || 'Admin POS').split(' ');

    const payloadGoekua = {
      user: {
        name: nombrePartes[0] || 'Admin',
        lastName: nombrePartes.slice(1).join(' ') || 'POS',
        email: empresa.email || 'admin@pos.com',
        documentType: 1,
        documentNumber: empresa.ruc ? empresa.ruc.split('-')[0] : '',
        position: 'Cajero',
        phone: empresa.telefono || '000000',
      },
      client: {
        fantasyName: businessName,
        ruc: isContributor ? rucCliente : '',
        businessName: businessName,
        address: clienteData?.direccion || 'Paraguay',
        email: clienteData?.email || '',
        email2: '',
        isContributor: isContributor,
        houseNumber: 0,
        cityIdSifen: 0,
        countryIdSifen: 'PRY',
        contributorType: contributorType,
        documentType: documentType,
        documentNumber: isContributor ? '' : documentNumber,
        phone: clienteData?.celular || '',
        cellPhone: clienteData?.celular || '',
        departmentOffice: '',
        addressReference: '',
        operationType: operationType,
      },
      establishment: {
        idSifen: '001',
        address: empresa.direccion || 'Dirección del local',
        houseNumber: 0,
        cityId: 0,
        phone: empresa.telefono || '000000',
        phone2: '',
        phone3: '',
        email: empresa.email || '',
        denomination: 'Casa Matriz',
        complementAddress1: '',
        complementAddress2: '',
      },
      transactionType: 1, // 1: Venta de mercaderías
      operationConditionType: venta.estado_pago === 'Credito' ? 2 : 1, // 1: Contado, 2: Crédito
      items: items.map((item) => ({
        code: String(item.producto_id || 'ITEM'),
        description: item.nombre_producto || 'Producto',
        measureUnit: 77, // Unidad (código SIFEN)
        amount: item.cantidad,
        unitPrice: item.precio_unitario || item.subtotal / item.cantidad,
        unitDiscountPercentage: 0,
        unitNetDiscount: 0,
        taxPercentage: 10, // 10% IVA por defecto (ajustar cuando se agregue IVA por producto)
        taxRate: 10,
        ivaType: 1, // 1: Gravado IVA
        observations: '',
      })),
      paymentMethods: [
        {
          paymentType: METODO_PAGO_SIFEN[venta.metodo_pago] || 1,
          cardType: 1,
          formOfProccessingPayment: 1,
          issuingEntity: '',
          chequeNumber: '',
          charge: venta.monto_pagado || venta.total,
          currency: 'PYG',
          currencyRate: 1,
        },
      ],
      emissionType: 1, // 1: Normal
      presenceIndicatorType: 1, // 1: Operación presencial
      expirationDate: venta.estado_pago === 'Credito'
        ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
        : undefined,
      pointOfExpedition: '001',
      documentNumber: String(ventaId).padStart(7, '0'),
      serieNumber: 'AA',
      currency: 'PYG',
      currencyRate: 1,
      cdc: '',
      observation: venta.nota_venta || 'Venta generada desde GDA POS',
    };

    // ──────────────────────────────────────────────────────────
    // 7. Enviar a la API de Goekua
    // ──────────────────────────────────────────────────────────
    const response = await fetch(
      'https://api.goekua.com.py/api/electronic-document/generate-invoice',
      {
        method: 'POST',
        headers: {
          'x-api-key': empresa.fe_api_key,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payloadGoekua),
      }
    );

    const goekuaData = await response.json();

    if (!response.ok) {
      console.error('Goekua error payload:', JSON.stringify(payloadGoekua));
      console.error('Goekua error response:', JSON.stringify(goekuaData));
      throw new Error(
        `Error de Goekua (${response.status}): ${JSON.stringify(goekuaData)}`
      );
    }

    // ──────────────────────────────────────────────────────────
    // 8. Guardar el ID de Goekua en la venta
    // ──────────────────────────────────────────────────────────
    const { error: updateError } = await supabase
      .from('ventas')
      .update({
        goekua_id: goekuaData.id,
        estado_sifen: 'IN_REVIEW',
      })
      .eq('id', ventaId)
      .eq('empresa_id', empresaId);

    if (updateError) {
      console.error('Error al actualizar venta con ID de Goekua:', updateError.message);
    }

    return new Response(
      JSON.stringify({ success: true, goekua_id: goekuaData.id }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    console.error('Error en generate-invoice:', err.message);
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
