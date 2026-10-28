// ZenOffice Claude Edition – Service Worker
const CACHE = 'zenoffice-claude-v4';

self.addEventListener('install', e => {
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(clients.claim());
  // Alte Caches löschen
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  
  // API-Aufrufe immer live – nie cachen
  if (url.pathname.startsWith('/api/')) {
    e.respondWith(fetch(e.request));
    return;
  }
  
  // Externe APIs (Anthropic, Google, fal.ai) nie cachen
  if (url.hostname !== self.location.hostname) {
    e.respondWith(fetch(e.request).catch(() => new Response('Offline', {status: 503})));
    return;
  }
  
  // App-Seite: immer zuerst frisch aus dem Netz, damit nach jeder Veröffentlichung sofort die neue
  // Version erscheint (früher „erst Speicher“: man sah nach Updates zunächst die alte Fassung).
  // Der Speicher springt nur ein, wenn kein Netz da ist.
  e.respondWith(
    fetch(e.request).then(response => {
      if (response.ok && e.request.method === 'GET') {
        const clone = response.clone();
        caches.open(CACHE).then(cache => cache.put(e.request, clone));
      }
      return response;
    }).catch(() => caches.match(e.request).then(c => c || (e.request.mode === 'navigate' ? caches.match('/') : undefined))
      .then(c => c || new Response('Offline', {status: 503})))
  );
});
