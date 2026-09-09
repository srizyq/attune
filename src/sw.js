import { precacheAndRoute } from 'workbox-precaching';
import { registerRoute } from 'workbox-routing';
import { StaleWhileRevalidate, CacheFirst } from 'workbox-strategies';
import { ExpirationPlugin } from 'workbox-expiration';
import { CacheableResponsePlugin } from 'workbox-cacheable-response';
import { clientsClaim } from 'workbox-core';

precacheAndRoute(self.__WB_MANIFEST);

// `registerType: 'autoUpdate'` (vite.config.js) is only half the story — it
// makes vite-plugin-pwa's client-side helper reload the page once a new
// worker activates, but it never sends anything that would make a new
// worker activate in the first place. A message-gated self.skipWaiting()
// (the previous approach here) needs something to actually send that
// message, and nothing did — main.jsx never called the registerSW() helper
// at all, so every deploy just installed a new worker that sat "waiting"
// forever behind the old one, meaning nobody already on the site ever saw
// a new deploy without manually clearing site data. Skipping waiting
// unconditionally, the moment a new worker installs, is what makes
// "autoUpdate" actually automatic; clientsClaim() then lets it take over
// the already-open tab immediately instead of only the next navigation.
self.skipWaiting();
clientsClaim();

registerRoute(
  ({ url }) => url.origin === 'https://fonts.googleapis.com',
  new StaleWhileRevalidate({ cacheName: 'google-fonts-stylesheets' })
);

registerRoute(
  ({ url }) => url.origin === 'https://fonts.gstatic.com',
  new CacheFirst({
    cacheName: 'google-fonts-webfonts',
    plugins: [
      new CacheableResponsePlugin({ statuses: [0, 200] }),
      new ExpirationPlugin({ maxEntries: 30, maxAgeSeconds: 60 * 60 * 24 * 365 }),
    ],
  })
);

registerRoute(
  ({ url }) => url.origin === 'https://cdn.jsdelivr.net',
  new StaleWhileRevalidate({ cacheName: 'tabler-icons' })
);

// ─── Push notifications (reminders) ────────────────────────────────────────
self.addEventListener('push', (event) => {
  let data = { title: 'Attune', body: "Don't forget to log today's food." };
  try { if (event.data) data = { ...data, ...event.data.json() }; } catch { /* use defaults */ }

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      data: { url: data.url || '/dashboard' },
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/dashboard';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.navigate(url);
          return client.focus();
        }
      }
      return self.clients.openWindow(url);
    })
  );
});
