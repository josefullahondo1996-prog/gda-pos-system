import { useEffect, useMemo, useState } from 'react';
import { supabase } from './supabaseClient';
import { useEmpresaInfo } from './utils/useEmpresa';
import { useNotificacion } from './NotificacionContext';

const EVENTOS = [
  { id: 'send_ledger', nombre: 'Enviar libro mayor', tipo: 'General' },
  { id: 'new_sale', nombre: 'Nueva venta', tipo: 'Cliente' },
  { id: 'payment_received', nombre: 'Pago recibido', tipo: 'Cliente' },
  { id: 'payment_reminder', nombre: 'Recordatorio de pago', tipo: 'Cliente' },
  { id: 'new_booking', nombre: 'Nueva reserva', tipo: 'Cliente' },
  { id: 'new_quotation', nombre: 'Nueva cotización', tipo: 'Cliente' },
  { id: 'new_order', nombre: 'Nueva orden', tipo: 'Proveedor' },
  { id: 'payment_paid', nombre: 'Pago realizado', tipo: 'Proveedor' },
  { id: 'items_received', nombre: 'Artículos recibidos', tipo: 'Proveedor' },
  { id: 'items_pending', nombre: 'Artículos pendientes', tipo: 'Proveedor' },
  { id: 'purchase_order', nombre: 'Orden de compra', tipo: 'Proveedor' },
];
const CANALES = ['email', 'sms', 'whatsapp'];
const ETIQUETAS = [
  '{business_name}', '{contact_name}', '{invoice_number}', '{invoice_url}', '{total_amount}',
  '{paid_amount}', '{due_amount}', '{cumulative_due_amount}', '{due_date}', '{order_ref_number}',
  '{received_amount}', '{location_name}', '{location_phone}',
];

const valoresIniciales = (evento, canal) => {
  const venta = evento === 'new_sale';
  const compra = ['new_order', 'payment_paid', 'items_received', 'items_pending', 'purchase_order'].includes(evento);
  const asunto = venta ? 'Comprobante de compra {invoice_number} · {business_name}'
    : compra ? 'Actualización de pedido {order_ref_number} · {business_name}'
      : `${EVENTOS.find((item) => item.id === evento)?.nombre || 'Notificación'} · {business_name}`;
  const contenido = venta
    ? 'Hola {contact_name}, gracias por comprar en {business_name}. Comprobante {invoice_number}: {total_amount}. Pagado: {paid_amount}. Saldo: {due_amount}. {invoice_url}'
    : compra
      ? 'Hola {contact_name}, {business_name} informa: {order_ref_number}. Total: {total_amount}. Saldo: {due_amount}. Gracias.'
      : 'Hola {contact_name}, {business_name} informa: saldo {due_amount}. Vencimiento: {due_date}.';
  return {
    evento,
    canal,
    asunto: canal === 'email' ? asunto : '',
    cc: '',
    bcc: '',
    contenido: canal === 'whatsapp' ? `*${contenido}*` : contenido,
    activo: true,
  };
};

const llave = (plantilla) => `${plantilla.evento}:${plantilla.canal}`;
const inicializar = () => EVENTOS.flatMap((evento) => CANALES.map((canal) => valoresIniciales(evento.id, canal)));

const CAMPOS_PRUEBA = [
  ['contact_name', 'Nombre del contacto', 'Cliente de ejemplo'],
  ['invoice_number', 'N.º de factura', 'V-0001'],
  ['invoice_url', 'Enlace de factura', 'https://ejemplo.com/comprobante/V-0001'],
  ['total_amount', 'Importe total', 'Gs 150.000'],
  ['paid_amount', 'Importe pagado', 'Gs 100.000'],
  ['due_amount', 'Saldo pendiente', 'Gs 50.000'],
  ['cumulative_due_amount', 'Saldo acumulado', 'Gs 50.000'],
  ['due_date', 'Fecha de vencimiento', '30/09/2026'],
  ['order_ref_number', 'Referencia de orden', 'OC-0001'],
  ['received_amount', 'Importe recibido', 'Gs 100.000'],
  ['location_name', 'Sucursal', 'Casa Central'],
  ['location_phone', 'Teléfono de sucursal', '+595 21 000 000'],
];

const rellenarEtiquetas = (texto, valores) => String(texto || '')
  .replace(/\{([a-z_]+)\}/gi, (etiqueta, clave) => valores[clave] ?? etiqueta);

export default function PlantillasNotificacion() {
  const { id: empresaId, nombre: nombreEmpresa } = useEmpresaInfo();
  const { notificar } = useNotificacion();
  const [plantillas, setPlantillas] = useState(inicializar);
  const [evento, setEvento] = useState(EVENTOS[1].id);
  const [canal, setCanal] = useState('whatsapp');
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [errorEsquema, setErrorEsquema] = useState(false);
  const [mostrarVistaPrevia, setMostrarVistaPrevia] = useState(false);
  const [destino, setDestino] = useState('');
  const [valoresPrueba, setValoresPrueba] = useState(() => Object.fromEntries(CAMPOS_PRUEBA.map(([clave, , ejemplo]) => [clave, ejemplo])));

  useEffect(() => {
    let activo = true;
    const cargar = async () => {
      if (!empresaId) return;
      setCargando(true);
      const { data, error } = await supabase
        .from('plantillas_notificacion')
        .select('evento, canal, asunto, cc, bcc, contenido, activo')
        .eq('empresa_id', empresaId);
      if (!activo) return;
      if (error) {
        setErrorEsquema(true);
      } else {
        setErrorEsquema(false);
        setPlantillas((actuales) => {
          const base = actuales.length ? actuales : inicializar();
          return base.map((plantilla) => {
            const guardada = data?.find((fila) => fila.evento === plantilla.evento && fila.canal === plantilla.canal);
            return guardada ? { ...plantilla, ...guardada } : plantilla;
          });
        });
      }
      setCargando(false);
    };
    cargar();
    return () => { activo = false; };
  }, [empresaId]);

  const plantillaActiva = useMemo(() => plantillas.find((item) => item.evento === evento && item.canal === canal)
    || valoresIniciales(evento, canal), [plantillas, evento, canal]);
  const eventoActivo = EVENTOS.find((item) => item.id === evento);
  const valoresMensaje = { business_name: nombreEmpresa || 'Mi negocio', ...valoresPrueba };
  const asuntoMensaje = rellenarEtiquetas(plantillaActiva.asunto, valoresMensaje);
  const cuerpoMensaje = rellenarEtiquetas(plantillaActiva.contenido, valoresMensaje);

  const abrirEnvio = () => {
    if (plantillaActiva.activo === false) return notificar.error('Activá esta plantilla antes de enviar mensajes.');
    if (!cuerpoMensaje.trim()) return notificar.error('La plantilla no tiene contenido para enviar.');

    let url;
    if (canal === 'email') {
      const correo = destino.trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo)) return notificar.error('Ingresá un correo válido para el destinatario.');
      const parametros = new URLSearchParams({ subject: asuntoMensaje, body: cuerpoMensaje });
      const validarCopias = (texto) => String(texto || '').split(/[;,\s]+/).filter(Boolean);
      const cc = validarCopias(plantillaActiva.cc);
      const bcc = validarCopias(plantillaActiva.bcc);
      if ([...cc, ...bcc].some((correoCopia) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correoCopia))) {
        return notificar.error('Revisá los correos de CC y CCO de la plantilla.');
      }
      if (cc.length) parametros.set('cc', cc.join(','));
      if (bcc.length) parametros.set('bcc', bcc.join(','));
      url = `mailto:${encodeURIComponent(correo)}?${parametros.toString()}`;
    } else {
      const digitos = destino.replace(/\D/g, '');
      if (digitos.length < 8) return notificar.error('Ingresá un número de teléfono válido con código de país.');
      const numero = digitos.startsWith('595') ? digitos : digitos.startsWith('0') ? `595${digitos.slice(1)}` : `595${digitos}`;
      url = canal === 'whatsapp'
        ? `https://wa.me/${numero}?text=${encodeURIComponent(cuerpoMensaje)}`
        : `sms:${numero}?body=${encodeURIComponent(cuerpoMensaje)}`;
    }

    const ventana = window.open(url, '_blank');
    if (ventana) {
      ventana.opener = null;
    } else {
      window.location.href = url;
    }
    notificar.exito(`Mensaje preparado en ${canal === 'email' ? 'tu correo' : canal === 'whatsapp' ? 'WhatsApp' : 'la aplicación de SMS'}. Revisá el destinatario y confirmá el envío allí.`);
  };

  const cambiarCampo = (campo, valor) => {
    setPlantillas((actuales) => actuales.map((item) => item.evento === evento && item.canal === canal
      ? { ...item, [campo]: valor }
      : item));
  };

  const guardar = async () => {
    if (!empresaId) return notificar.error('No se encontró la empresa activa.');
    setGuardando(true);
    try {
      const fila = {
        empresa_id: empresaId,
        evento,
        canal,
        asunto: canal === 'email' ? plantillaActiva.asunto : null,
        cc: canal === 'email' ? plantillaActiva.cc || null : null,
        bcc: canal === 'email' ? plantillaActiva.bcc || null : null,
        contenido: plantillaActiva.contenido || '',
        activo: plantillaActiva.activo !== false,
        updated_at: new Date().toISOString(),
      };
      const { error } = await supabase.from('plantillas_notificacion').upsert(fila, { onConflict: 'empresa_id,evento,canal' });
      if (error) throw error;
      notificar.exito('Plantilla guardada en Supabase.');
    } catch (error) {
      notificar.error(`No se pudo guardar la plantilla: ${error.message}`);
    } finally {
      setGuardando(false);
    }
  };

  if (cargando) return <div className="p-8 text-center text-slate-500">Cargando plantillas…</div>;

  return (
    <div className="h-full overflow-auto bg-slate-50 p-4 md:p-7">
      <div className="mx-auto max-w-6xl space-y-5">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-orange-600">Comunicaciones</p>
            <h1 className="mt-1 text-2xl font-black text-slate-900">Plantillas de notificación</h1>
            <p className="mt-1 max-w-3xl text-sm text-slate-500">Editá mensajes por evento y canal. Las plantillas se guardan por empresa y podés previsualizar las etiquetas antes de usarlas.</p>
          </div>
          <button onClick={() => setMostrarVistaPrevia(true)} className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-100">Vista previa</button>
        </header>

        {errorEsquema && <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">La tabla de plantillas todavía no está disponible. Aplicá <code>database/migration_plantillas_notificacion.sql</code> en Supabase y volvé a cargar esta pantalla.</div>}
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">Ya podés preparar mensajes desde esta pantalla: se abrirá WhatsApp, SMS o tu correo con el texto y el destinatario cargados para que confirmes el envío. El envío automático en segundo plano requiere integrar un proveedor.</div>

        <div className="grid gap-5 lg:grid-cols-[290px_minmax(0,1fr)]">
          <aside className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
            <p className="px-2 pb-2 text-xs font-black uppercase tracking-wide text-slate-500">Eventos</p>
            {['General', 'Cliente', 'Proveedor'].map((tipo) => (
              <section key={tipo} className="mb-3">
                <h2 className="px-2 py-2 text-[11px] font-bold uppercase text-slate-400">{tipo === 'General' ? 'Notificaciones' : `Notificaciones ${tipo.toLowerCase()}s`}</h2>
                {EVENTOS.filter((item) => item.tipo === tipo).map((item) => (
                  <button key={item.id} onClick={() => setEvento(item.id)} className={`mb-1 w-full rounded-lg px-3 py-2 text-left text-sm font-semibold ${evento === item.id ? 'bg-slate-900 text-white' : 'text-slate-700 hover:bg-slate-100'}`}>
                    {item.nombre}
                  </button>
                ))}
              </section>
            ))}
          </aside>

          <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 p-5">
              <div><h2 className="text-lg font-black text-slate-900">{eventoActivo?.nombre}</h2><p className="text-xs text-slate-500">Configuración del mensaje y canal de salida</p></div>
              <div className="flex rounded-lg bg-slate-100 p-1">
                {CANALES.map((opcion) => <button key={opcion} onClick={() => setCanal(opcion)} className={`rounded-md px-3 py-2 text-xs font-bold capitalize ${canal === opcion ? 'bg-white text-orange-700 shadow-sm' : 'text-slate-500'}`}>{opcion === 'whatsapp' ? 'WhatsApp' : opcion.toUpperCase()}</button>)}
              </div>
            </div>

            <div className="space-y-4 p-5">
              <label className="flex items-center gap-2 text-sm font-semibold text-slate-700"><input type="checkbox" checked={plantillaActiva.activo !== false} onChange={(eventChange) => cambiarCampo('activo', eventChange.target.checked)} className="h-4 w-4 accent-orange-500" /> Plantilla activa</label>
              {canal === 'email' && <>
                <label className="block text-xs font-bold text-slate-600">Asunto del email<input value={plantillaActiva.asunto || ''} onChange={(eventChange) => cambiarCampo('asunto', eventChange.target.value)} className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm font-normal outline-none focus:border-orange-400" placeholder="Asunto del email" /></label>
                <div className="grid gap-4 sm:grid-cols-2"><label className="block text-xs font-bold text-slate-600">CC<input value={plantillaActiva.cc || ''} onChange={(eventChange) => cambiarCampo('cc', eventChange.target.value)} className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm font-normal outline-none focus:border-orange-400" placeholder="correo@ejemplo.com" /></label><label className="block text-xs font-bold text-slate-600">BCC<input value={plantillaActiva.bcc || ''} onChange={(eventChange) => cambiarCampo('bcc', eventChange.target.value)} className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm font-normal outline-none focus:border-orange-400" placeholder="correo@ejemplo.com" /></label></div>
              </>}
              <label className="block text-xs font-bold text-slate-600">{canal === 'email' ? 'Cuerpo del correo' : canal === 'sms' ? 'Cuerpo del SMS' : 'Texto de WhatsApp'}<textarea value={plantillaActiva.contenido || ''} onChange={(eventChange) => cambiarCampo('contenido', eventChange.target.value)} rows={8} className="mt-1 block w-full resize-y rounded-lg border border-slate-300 px-3 py-3 text-sm font-normal leading-relaxed outline-none focus:border-orange-400" placeholder="Escribí el mensaje y agregá etiquetas como {contact_name}" /></label>
              <div><p className="mb-2 text-xs font-bold text-slate-500">Etiquetas disponibles</p><div className="flex flex-wrap gap-1.5">{ETIQUETAS.map((etiqueta) => <code key={etiqueta} className="rounded bg-slate-100 px-2 py-1 text-[11px] text-slate-700">{etiqueta}</code>)}</div></div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <h3 className="text-sm font-black text-slate-800">Preparar y enviar un mensaje</h3>
                <p className="mt-1 text-xs text-slate-500">Completá el destinatario y los datos de ejemplo. El texto final se abrirá en la aplicación del canal elegido.</p>
                <label className="mt-3 block text-xs font-bold text-slate-600">{canal === 'email' ? 'Correo del destinatario' : 'Teléfono del destinatario'}<input value={destino} onChange={(eventChange) => setDestino(eventChange.target.value)} type={canal === 'email' ? 'email' : 'tel'} className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm font-normal outline-none focus:border-orange-400" placeholder={canal === 'email' ? 'cliente@ejemplo.com' : '595981234567'} /></label>
                <details className="mt-3">
                  <summary className="cursor-pointer text-xs font-bold text-slate-600">Editar datos que completan las etiquetas</summary>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">{CAMPOS_PRUEBA.map(([clave, etiqueta, ejemplo]) => <label key={clave} className="block text-xs font-semibold text-slate-600">{etiqueta}<input value={valoresPrueba[clave] ?? ''} onChange={(eventChange) => setValoresPrueba((actuales) => ({ ...actuales, [clave]: eventChange.target.value }))} className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-normal outline-none focus:border-orange-400" placeholder={ejemplo} /></label>)}</div>
                </details>
                <div className="mt-3 whitespace-pre-wrap rounded-lg border border-slate-200 bg-white p-3 text-sm leading-relaxed text-slate-700">{cuerpoMensaje || 'Escribí el contenido de la plantilla para ver el mensaje.'}</div>
                <button onClick={abrirEnvio} disabled={plantillaActiva.activo === false || !cuerpoMensaje.trim()} className="mt-3 w-full rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-black text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50">Abrir {canal === 'email' ? 'correo' : canal === 'whatsapp' ? 'WhatsApp' : 'SMS'} con el mensaje</button>
              </div>
              <div className="flex flex-wrap justify-end gap-2 border-t border-slate-100 pt-4"><button onClick={() => setMostrarVistaPrevia(true)} className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-bold text-slate-700 hover:bg-slate-50">Probar vista previa</button><button disabled={guardando || errorEsquema} onClick={guardar} className="rounded-lg bg-orange-500 px-5 py-2.5 text-sm font-black text-white hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-50">{guardando ? 'Guardando…' : 'Guardar plantilla'}</button></div>
            </div>
          </section>
        </div>
      </div>

      {mostrarVistaPrevia && <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-slate-950/50 p-4" onClick={() => setMostrarVistaPrevia(false)}><section role="dialog" aria-modal="true" aria-label="Vista previa" className="w-full max-w-xl rounded-2xl bg-white p-5 shadow-2xl" onClick={(eventClick) => eventClick.stopPropagation()}><div className="mb-4 flex items-center justify-between"><div><p className="text-xs font-bold uppercase text-orange-600">Vista previa · {canal}</p><h2 className="text-lg font-black text-slate-900">{eventoActivo?.nombre}</h2></div><button onClick={() => setMostrarVistaPrevia(false)} className="rounded-lg px-3 py-1 text-xl text-slate-500 hover:bg-slate-100" aria-label="Cerrar">×</button></div>{canal === 'email' && <div className="mb-3 rounded-lg bg-slate-50 p-3 text-sm"><strong>Asunto:</strong> {asuntoMensaje}</div>}<div className="min-h-32 whitespace-pre-wrap rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm leading-relaxed text-slate-800">{cuerpoMensaje}</div><p className="mt-3 text-xs text-slate-400">El nombre de la empresa se completa automáticamente; los demás campos usan los datos de prueba editables.</p></section></div>}
    </div>
  );
}
