self.addEventListener('push', (event) => {
  let payload = {};
  try { payload = event.data ? event.data.json() : {}; } catch { payload = { body: event.data?.text() || '' }; }
  event.waitUntil(self.registration.showNotification(payload.title || 'Nuevo pedido de delivery', {
    body: payload.body || 'Te asignaron un pedido para entregar.',
    icon: '/apple-touch-icon.png',
    badge: '/favicon.png',
    tag: payload.tag || 'delivery-pedido-asignado',
    renotify: true,
    data: { url: payload.url || '/repartidor/entregas' },
  }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || '/repartidor/entregas', self.location.origin).href;
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
    const existing = clients.find((client) => new URL(client.url).origin === self.location.origin);
    return existing ? existing.navigate(target).then(() => existing.focus()) : self.clients.openWindow(target);
  }));
});
