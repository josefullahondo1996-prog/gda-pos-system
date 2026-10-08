import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getAuthenticatedUser, unauthorized } from '../_shared/auth.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
});
const text = (value: unknown, max = 300) => String(value ?? '').trim().slice(0, max);
const finite = (value: unknown) => Number.isFinite(Number(value));

function ivaProducto(producto: Record<string, unknown>) {
  const valor = `${text(producto.tipo_impuesto, 30)} ${text(producto.iva, 30)}`.toLowerCase();
  if (valor.includes('exent') || valor === '0' || valor === '0%') return { taxPercentage: 0, taxRate: 0, ivaType: 3 };
  if (valor.includes('5')) return { taxPercentage: 5, taxRate: 5, ivaType: 2 };
  // Conserva el criterio de facturación actual del POS, que usa IVA 10% si el
  // producto no tiene una tasa configurada. La pantalla advertirá este fallback.
  return { taxPercentage: 10, taxRate: 10, ivaType: 1 };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Método no permitido.' }, 405);

  const { user, error: authError } = await getAuthenticatedUser(req);
  if (!user) return unauthorized(authError || 'No autorizado.', corsHeaders);

  let body: Record<string, any>;
  try { body = await req.json(); } catch { return json({ error: 'El cuerpo debe ser JSON válido.' }, 400); }
  const empresaId = text(body.empresaId, 64);
  const origenTipo = text(body.origenTipo, 20);
  const origenId = text(body.origenId, 64);
  const solicitudId = text(body.solicitudId, 64);
  const point = text(body.pointOfExpedition, 3);
  const documentNumber = text(body.documentNumber, 7);
  if (!empresaId || !origenId || !solicitudId || !['venta', 'transferencia'].includes(origenTipo)) {
    return json({ error: 'Faltan la empresa, el origen o el identificador de solicitud.' }, 400);
  }
  if (!/^\d{3}$/.test(point) || !/^\d{1,7}$/.test(documentNumber) || Number(documentNumber) < 1) {
    return json({ error: 'El punto de expedición debe tener 3 dígitos y el número de documento de 1 a 7 dígitos positivos.' }, 400);
  }
  if (!/^[0-9a-f-]{36}$/i.test(solicitudId)) return json({ error: 'Identificador de solicitud inválido.' }, 400);

  const { transfer, originAndDestination, shipper, client, establishment, fiscalDescription, observation } = body;
  const required = [
    transfer?.futureDateOfTransfer, transfer?.estimatedTransferStartDate, transfer?.estimatedTransferFinishDate,
    transfer?.transferMotiveType, transfer?.responsibleOfEmissionType, transfer?.responsibleOfFreightType,
    transfer?.modalityTransportType, transfer?.transportType, transfer?.vehicleIdentificationType,
    originAndDestination?.originCityIdSifen, originAndDestination?.originAddress,
    originAndDestination?.destinationCityIdSifen, originAndDestination?.destinationAddress,
    shipper?.businessName, shipper?.driverFullName, client?.businessName, client?.address,
    client?.cityIdSifen, client?.countryIdSifen, establishment?.address, establishment?.cityId,
    establishment?.houseNumber, fiscalDescription,
  ];
  if (required.some((value) => value === undefined || value === null || String(value).trim() === '')) {
    return json({ error: 'Completá los datos fiscales, de origen/destino, transporte y fechas requeridos por SIFEN.' }, 400);
  }
  const codigoSifen = [transfer.transferMotiveType, transfer.responsibleOfEmissionType, transfer.responsibleOfFreightType,
    transfer.modalityTransportType, transfer.transportType, transfer.vehicleIdentificationType,
    originAndDestination.originCityIdSifen, originAndDestination.destinationCityIdSifen,
    client.cityIdSifen, establishment.cityId, establishment.houseNumber];
  if (!codigoSifen.every((value) => finite(value) && Number.isInteger(Number(value)))
    || codigoSifen.slice(0, 6).some((value) => Number(value) <= 0)
    || codigoSifen.slice(6, 10).some((value) => Number(value) <= 0)) {
    return json({ error: 'Los códigos SIFEN, el motivo, el transporte y el número de casa deben ser numéricos.' }, 400);
  }
  if (client.isContributor && !text(client.ruc, 30)) return json({ error: 'El receptor contribuyente necesita su RUC.' }, 400);
  if (!client.isContributor && !text(client.documentNumber, 40)) return json({ error: 'El receptor necesita su número de documento.' }, 400);
  if (shipper.isContributor && !text(shipper.ruc, 30)) return json({ error: 'El transportista contribuyente necesita su RUC.' }, 400);
  if (!shipper.isContributor && !text(shipper.documentNumber, 40)) return json({ error: 'El transportista necesita su número de documento.' }, 400);
  if (!text(shipper.driverDocumentNumber, 40)) return json({ error: 'Ingresá el documento del conductor.' }, 400);
  for (const value of [transfer.futureDateOfTransfer, transfer.estimatedTransferStartDate, transfer.estimatedTransferFinishDate]) {
    if (!Number.isFinite(new Date(String(value)).getTime())) return json({ error: 'Ingresá fechas válidas de traslado.' }, 400);
  }
  if (new Date(transfer.estimatedTransferFinishDate) < new Date(transfer.estimatedTransferStartDate)) {
    return json({ error: 'La fecha estimada de fin no puede ser anterior al inicio.' }, 400);
  }
  if (transfer.shouldAssociateDocument && !text(transfer.referencedCdc, 80)) {
    return json({ error: 'Ingresá el CDC del documento relacionado o desmarcá su asociación.' }, 400);
  }

  const supabase = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');
  const { data: miembro, error: miembroError } = await supabase.from('usuarios')
    .select('id, rol_id, nombre, apellido, email, activo, permitir_acceso')
    .eq('auth_user_id', user.id).eq('empresa_id', empresaId).eq('activo', true).eq('permitir_acceso', true).maybeSingle();
  if (miembroError || !miembro) return unauthorized('No tenés acceso activo a esta empresa.', corsHeaders);

  const { data: rol } = await supabase.from('roles').select('nombre, permisos').eq('id', miembro.rol_id).maybeSingle();
  const permisos = rol?.permisos || {};
  const esAdmin = String(rol?.nombre || '').toLowerCase().includes('admin');
  const permisoModulo = origenTipo === 'venta'
    ? permisos?.ventas_pos?.['Acceder al Punto de Venta'] === true
    : permisos?.productos?.['Transferir stock'] === true;
  if (!esAdmin && !permisoModulo) return json({ error: 'Tu rol no tiene permiso para emitir remisiones desde este origen.' }, 403);

  const { data: empresa, error: errorEmpresa } = await supabase.from('empresas')
    .select('id, nombre, ruc, direccion, telefono, fe_api_key, fe_activa, fe_proveedor, configuracion')
    .eq('id', empresaId).maybeSingle();
  if (errorEmpresa || !empresa) return json({ error: 'No se encontró la empresa.' }, 404);
  if (empresa.fe_proveedor !== 'goekua' || !empresa.fe_activa || !empresa.fe_api_key) {
    return json({ error: 'Activá Goekua y configurá su API Key en Facturación Electrónica antes de emitir.' }, 400);
  }

  // Una reintento de la misma solicitud nunca vuelve a enviar el documento a
  // SIFEN. Esto evita duplicados si el navegador perdió la respuesta anterior.
  const { data: solicitudExistente } = await supabase.from('remisiones_electronicas')
    .select('id, estado, goekua_id, cdc, error_respuesta')
    .eq('empresa_id', empresaId).eq('solicitud_id', solicitudId).maybeSingle();
  if (solicitudExistente) return json({ ...solicitudExistente, repetida: true });

  let origenNombre = '';
  let destinoNombre = '';
  let fechaReferencia = new Date().toISOString();
  let sourceItems: Array<Record<string, any>> = [];
  if (origenTipo === 'venta') {
    const id = Number(origenId);
    if (!Number.isSafeInteger(id) || id <= 0) return json({ error: 'La venta de origen no es válida.' }, 400);
    const [{ data: venta, error: ventaError }, { data: detalle, error: detalleError }] = await Promise.all([
      supabase.from('ventas').select('id, empresa_id, cliente, cliente_nombre, fecha').eq('id', id).eq('empresa_id', empresaId).maybeSingle(),
      supabase.from('detalle_ventas').select('producto_id, nombre_producto, cantidad, precio_unitario').eq('venta_id', id).eq('empresa_id', empresaId),
    ]);
    if (ventaError || !venta) return json({ error: 'No se encontró la venta de origen en esta empresa.' }, 404);
    if (detalleError || !detalle?.length) return json({ error: 'La venta no tiene productos detallados para la remisión.' }, 400);
    origenNombre = `Venta #${id}`;
    destinoNombre = text(venta.cliente_nombre || venta.cliente, 180) || 'Cliente Ocasional';
    fechaReferencia = venta.fecha || fechaReferencia;
    sourceItems = detalle;
  } else {
    const { data: transferencia, error: transferenciaError } = await supabase.from('transferencias_stock')
      .select('id, empresa_id, origen_ubicacion_id, destino_ubicacion_id, items, created_at')
      .eq('id', origenId).eq('empresa_id', empresaId).maybeSingle();
    if (transferenciaError || !transferencia) return json({ error: 'No se encontró la transferencia de origen en esta empresa.' }, 404);
    const items = Array.isArray(transferencia.items) ? transferencia.items : [];
    const ids = items.map((item: Record<string, any>) => Number(item.producto_id)).filter((id: number) => Number.isSafeInteger(id) && id > 0);
    if (!ids.length) return json({ error: 'La transferencia no tiene productos válidos.' }, 400);
    const { data: productos, error: productosError } = await supabase.from('productos')
      .select('id, nombre, codigo, sku, precio_venta, iva, tipo_impuesto, unidad').eq('empresa_id', empresaId).in('id', ids);
    if (productosError) return json({ error: `No se pudieron leer los productos de la transferencia: ${productosError.message}` }, 400);
    const porId = new Map((productos || []).map((producto) => [Number(producto.id), producto]));
    sourceItems = items.map((item: Record<string, any>) => {
      const producto = porId.get(Number(item.producto_id));
      return producto ? {
        producto_id: producto.id, nombre_producto: item.nombre || producto.nombre,
        cantidad: item.cantidad, precio_unitario: producto.precio_venta,
        codigo: producto.codigo || producto.sku || producto.id,
        iva: producto.iva, tipo_impuesto: producto.tipo_impuesto, unidad: producto.unidad,
      } : null;
    }).filter(Boolean) as Array<Record<string, any>>;
    if (sourceItems.length !== items.length) return json({ error: 'No se pudieron asociar todos los productos de la transferencia.' }, 400);
    const [{ data: origen }, { data: destino }] = await Promise.all([
      supabase.from('ubicaciones_comerciales').select('nombre').eq('id', transferencia.origen_ubicacion_id).eq('empresa_id', empresaId).maybeSingle(),
      supabase.from('ubicaciones_comerciales').select('nombre').eq('id', transferencia.destino_ubicacion_id).eq('empresa_id', empresaId).maybeSingle(),
    ]);
    origenNombre = origen?.nombre || 'Sucursal de origen';
    destinoNombre = destino?.nombre || 'Sucursal de destino';
    fechaReferencia = transferencia.created_at || fechaReferencia;
  }

  const productoIds = [...new Set(sourceItems.map((item) => Number(item.producto_id)).filter((id) => Number.isSafeInteger(id) && id > 0))];
  if (!productoIds.length) return json({ error: 'El origen no tiene productos vinculados válidos.' }, 400);
  const { data: datosProductos, error: errorProductos } = await supabase.from('productos')
    .select('id, nombre, codigo, sku, precio_venta, iva, tipo_impuesto, unidad').eq('empresa_id', empresaId).in('id', productoIds);
  if (errorProductos) return json({ error: `No se pudieron leer los datos fiscales de los productos: ${errorProductos.message}` }, 400);
  const productosPorId = new Map((datosProductos || []).map((producto) => [Number(producto.id), producto]));
  if (productoIds.some((id) => !productosPorId.has(id))) return json({ error: 'Algún producto del origen ya no existe en esta empresa.' }, 400);
  sourceItems = sourceItems.map((item) => ({ ...productosPorId.get(Number(item.producto_id)), ...item }));

  const apiItems = [];
  for (const item of sourceItems) {
    const amount = Number(item.cantidad);
    const unitPrice = Number(item.precio_unitario);
    if (!Number.isFinite(amount) || amount <= 0 || !Number.isFinite(unitPrice) || unitPrice < 0) return json({ error: 'Producto con cantidad o precio inválido en el origen.' }, 400);
    const iva = ivaProducto(item);
    apiItems.push({
      code: text(item.codigo || item.sku || item.producto_id, 60),
      description: text(item.nombre_producto, 180),
      measureUnit: 77,
      amount,
      unitPrice,
      unitDiscountPercentage: 0,
      unitNetDiscount: 0,
      ...iva,
      observations: '',
    });
  }

  const payload = {
    user: {
      name: text(miembro.nombre, 80) || 'Usuario', lastName: text(miembro.apellido, 80),
      email: text(miembro.email || user.email, 160), documentType: 1, documentNumber: '',
      position: 'Operador', phone: text(empresa.telefono, 40) || '000000',
    },
    client: {
      fantasyName: text(client.fantasyName || client.businessName, 150),
      ruc: text(client.ruc, 30), businessName: text(client.businessName, 150),
      address: text(client.address, 180), email: text(client.email, 160), email2: '',
      isContributor: Boolean(client.isContributor), houseNumber: Number(client.houseNumber || 0),
      cityIdSifen: Number(client.cityIdSifen), countryIdSifen: text(client.countryIdSifen, 3),
      contributorType: Number(client.contributorType || 1), documentType: Number(client.documentType || 1),
      documentNumber: text(client.documentNumber, 40), phone: text(client.phone, 40), cellPhone: text(client.cellPhone, 40),
      departmentOffice: text(client.departmentOffice, 80), addressReference: text(client.addressReference, 120),
      operationType: Number(client.operationType || (client.isContributor ? 1 : 2)),
    },
    establishment: {
      idSifen: '001', address: text(establishment.address, 180),
      houseNumber: Number(establishment.houseNumber), cityId: Number(establishment.cityId),
      phone: text(empresa.telefono, 40), phone2: '', phone3: '', email: text(user.email || miembro.email, 160),
      denomination: text(empresa.nombre, 100) || 'Casa Matriz', complementAddress1: '', complementAddress2: '',
    },
    transfer: {
      transferMotiveType: Number(transfer.transferMotiveType),
      transferMotiveTypeOtherDescription: text(transfer.transferMotiveTypeOtherDescription, 160),
      responsibleOfEmissionType: Number(transfer.responsibleOfEmissionType),
      responsibleOfFreightType: Number(transfer.responsibleOfFreightType),
      shouldAssociateDocument: Boolean(transfer.shouldAssociateDocument),
      futureDateOfTransfer: text(transfer.futureDateOfTransfer, 40),
      referencedCdc: text(transfer.referencedCdc, 80),
      modalityTransportType: Number(transfer.modalityTransportType),
      estimatedTransferStartDate: text(transfer.estimatedTransferStartDate, 40),
      estimatedTransferFinishDate: text(transfer.estimatedTransferFinishDate, 40),
      transportType: Number(transfer.transportType), vehicleIdentificationType: Number(transfer.vehicleIdentificationType),
      vehicleType: text(transfer.vehicleType, 80), vehicleBrand: text(transfer.vehicleBrand, 80),
      vehicleIdentificationNumber: text(transfer.vehicleIdentificationNumber, 80), vehicleLicensePlate: text(transfer.vehicleLicensePlate, 20),
    },
    originAndDestination: {
      originCityIdSifen: Number(originAndDestination.originCityIdSifen),
      originAddress: text(originAndDestination.originAddress, 180),
      originHouseNumber: text(originAndDestination.originHouseNumber, 10),
      originAddressReference: text(originAndDestination.originAddressReference, 120),
      destinationCityIdSifen: Number(originAndDestination.destinationCityIdSifen),
      destinationAddress: text(originAndDestination.destinationAddress, 180),
      destinationHouseNumber: text(originAndDestination.destinationHouseNumber, 10),
      destinationAddressReference: text(originAndDestination.destinationAddressReference, 120),
    },
    shipper: {
      isContributor: Boolean(shipper.isContributor), businessName: text(shipper.businessName, 150),
      ruc: text(shipper.ruc, 30), documentType: Number(shipper.documentType || 1),
      documentNumber: text(shipper.documentNumber, 40), driverDocumentNumber: text(shipper.driverDocumentNumber, 40),
      driverFullName: text(shipper.driverFullName, 120),
    },
    items: apiItems,
    interestDescriptionOfTreasury: text(fiscalDescription, 300),
    pointOfExpedition: point,
    documentNumber: documentNumber.padStart(7, '0'),
    serieNumber: text(body.serieNumber, 2),
    cdc: '', observation: text(observation, 300),
  };

  const insert = {
    empresa_id: empresaId, solicitud_id: solicitudId, origen_tipo: origenTipo,
    venta_id: origenTipo === 'venta' ? Number(origenId) : null,
    transferencia_id: origenTipo === 'transferencia' ? origenId : null,
    punto_expedicion: point, numero_documento: documentNumber.padStart(7, '0'),
    estado: 'EN_PROCESO', origen_nombre: origenNombre, destino_nombre: destinoNombre,
    motivo: String(payload.transfer.transferMotiveType), fecha_traslado: payload.transfer.futureDateOfTransfer,
    payload, creado_por: user.id,
  };
  const { data: registro, error: errorInsert } = await supabase.from('remisiones_electronicas').insert(insert).select('id').single();
  if (errorInsert) return json({ error: errorInsert.code === '23505' ? 'El número de documento ya se usó o esta solicitud ya fue procesada; revisá el historial antes de reintentar.' : `No se pudo reservar el documento: ${errorInsert.message}` }, 409);

  try {
    const response = await fetch('https://api.goekua.com.py/api/electronic-document/generate-remission-note', {
      method: 'POST', headers: { 'x-api-key': empresa.fe_api_key, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload), signal: AbortSignal.timeout(45000),
    });
    const responseText = await response.text();
    let result: Record<string, any> = {};
    try { result = responseText ? JSON.parse(responseText) : {}; } catch { /* nunca reenviar el documento por una respuesta ilegible */ }
    const state = response.ok && result.id ? 'EMITIDA' : response.ok ? 'INCIERTA' : 'RECHAZADA';
    const safeResponse = {
      status: response.status,
      id: text(result.id, 120) || null,
      cdc: text(result.cdc, 100) || null,
      message: text(result.message || result.error, 500) || null,
    };
    const errorMessage = state === 'RECHAZADA' ? safeResponse.message || `Goekua respondió HTTP ${response.status}.`
      : state === 'INCIERTA' ? 'Goekua aceptó la solicitud pero no confirmó un identificador. Verificá el historial de documentos antes de emitir otra vez.' : null;
    const { error: errorUpdate } = await supabase.from('remisiones_electronicas').update({
      estado: state, goekua_id: safeResponse.id, cdc: safeResponse.cdc,
      respuesta: safeResponse, error_respuesta: errorMessage, actualizado_en: new Date().toISOString(),
    }).eq('id', registro.id);
    if (errorUpdate) return json({ id: registro.id, estado: 'INCIERTA', error: 'Goekua respondió; no se pudo guardar el resultado. Verificá el historial antes de reintentar.' }, 200);
    return json({ id: registro.id, estado: state, goekua_id: safeResponse.id, cdc: safeResponse.cdc, error: errorMessage }, response.ok ? 200 : 422);
  } catch (error) {
    const { error: errorUpdate } = await supabase.from('remisiones_electronicas').update({
      estado: 'INCIERTA', error_respuesta: 'La conexión no confirmó el resultado. Consultá el historial de Goekua antes de volver a emitir.',
      actualizado_en: new Date().toISOString(),
    }).eq('id', registro.id);
    console.error('generate-remission:', error instanceof Error ? error.message : 'Error de conexión');
    return json({ id: registro.id, estado: 'INCIERTA', error: errorUpdate ? 'Resultado sin confirmar y no se pudo guardar el estado. Revisá Goekua antes de continuar.' : 'No se confirmó el resultado. Revisá el historial de Goekua antes de emitir otra vez.' }, 200);
  }
});
