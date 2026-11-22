// Lookout — service worker. Il ne sert qu'aux notifications : il ne met rien en cache, pour ne jamais
// resservir une ancienne version de l'interface.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  let message = {};
  try { message = event.data?.json() ?? {}; } catch { /* message illisible : on affiche une notification générique */ }
  // Chaque message reçu doit afficher une notification, sinon le système retire l'autorisation (iPhone).
  event.waitUntil(self.registration.showNotification(message.title || 'Lookout', {
    body: message.body || '', tag: message.tag, icon: new URL('lookout-180.png', self.location).href,
    badge: new URL('lookout-180.png', self.location).href, data: { url: message.url || self.registration.scope } }));
});

// Un toucher sur la notification ouvre l'article annoncé ; sans article (alerte météo, match), il ramène à
// Lookout (fenêtre déjà ouverte, sinon nouvelle).
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const scope = self.registration.scope, url = event.notification.data?.url ?? scope;
  if (!url.startsWith(scope)) return event.waitUntil(self.clients.openWindow(url));
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
    const open = windows.find((w) => w.url.startsWith(scope));
    return open ? open.focus() : self.clients.openWindow(url);
  }));
});
