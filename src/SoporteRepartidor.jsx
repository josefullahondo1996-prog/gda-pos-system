import { ArrowLeft, Bell, CircleHelp, MapPin, PackageCheck, Truck } from 'lucide-react';

const pasos = [
  {
    icono: Truck,
    titulo: 'Ver tus pedidos asignados',
    texto: 'Abrí Mis pedidos. Si todavía no aparece el pedido, actualizá la pantalla y pedí al encargado que confirme la asignación a tu usuario.',
  },
  {
    icono: MapPin,
    titulo: 'Llegar al cliente',
    texto: 'En cada entrega podés abrir la ubicación o la dirección del cliente para continuar el recorrido en el mapa del celular.',
  },
  {
    icono: PackageCheck,
    titulo: 'Confirmar la entrega',
    texto: 'Al entregar, registrá el importe recibido. El sistema calcula el vuelto y guarda el resultado de la entrega.',
  },
  {
    icono: Bell,
    titulo: 'Recibir avisos',
    texto: 'Permití las notificaciones del navegador y agregá PyPos a la pantalla de inicio. Si el teléfono no muestra avisos, revisá también los permisos de notificación del navegador.',
  },
];

export default function SoporteRepartidor({ onVolver }) {
  return (
    <main className="min-h-full bg-slate-50 px-4 py-6 md:px-8 md:py-8">
      <div className="mx-auto max-w-3xl">
        <header className="rounded-2xl bg-slate-950 p-6 text-white shadow-lg md:p-8">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-orange-300">Ayuda para repartidores</p>
          <h1 className="mt-2 text-2xl font-black md:text-3xl">Soporte</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300">Respuestas rápidas para consultar y completar tus entregas desde el celular.</p>
        </header>

        <section aria-label="Ayuda con las entregas" className="mt-5 space-y-3">
          {pasos.map(({ icono: Icono, titulo, texto }) => (
            <article key={titulo} className="flex gap-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm md:p-5">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-orange-50 text-orange-600">
                <Icono size={22} />
              </span>
              <div>
                <h2 className="font-bold text-slate-900">{titulo}</h2>
                <p className="mt-1 text-sm leading-6 text-slate-600">{texto}</p>
              </div>
            </article>
          ))}
        </section>

        <div className="mt-6 rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm leading-6 text-blue-950">
          <div className="flex gap-3">
            <CircleHelp className="mt-0.5 shrink-0" size={20} />
            <p>Si necesitás ayuda con una asignación o un pedido, contactá al encargado del negocio e indicá el número del pedido.</p>
          </div>
        </div>

        <button type="button" onClick={onVolver} className="mt-5 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-orange-500 px-5 py-3 font-bold text-white shadow-sm hover:bg-orange-600 md:w-auto">
          <ArrowLeft size={18} /> Volver a mis pedidos
        </button>
      </div>
    </main>
  );
}
