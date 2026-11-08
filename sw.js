// ZenOffice Claude Edition – Service Worker
const CACHE = 'zenoffice-claude-v6';
const SHARE = 'zo-share';   // Ablage für aus anderen Apps Geteiltes (bleibt beim Aufräumen alter Caches erhalten)

self.addEventListener('install', e => {
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(clients.claim());
  // Alte Caches löschen
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE && k !== SHARE).map(k => caches.delete(k)))
    )
  );
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // „Teilen an ZenOffice“ (z. B. WhatsApp-Sprachnachricht): Android schickt die Datei per POST hierher.
  // Datei bzw. Text kurz ablegen und die App öffnen, die es dann übernimmt (takeShared in index.html).
  if (url.pathname === '/share-target' && e.request.method === 'POST') {
    e.respondWith((async () => {
      try {
        const fd = await e.request.formData(), c = await caches.open(SHARE);
        const f = fd.get('file');
        const text = ['title', 'text', 'url'].map(k => fd.get(k)).filter(Boolean).join('\n').trim();
        if (f && f.size) await c.put('/shared-file', new Response(f, { headers: { 'Content-Type': f.type || 'audio/ogg', 'X-Name': encodeURIComponent(f.name || 'Sprachnachricht.opus') } }));
        else if (text) await c.put('/shared-text', new Response(text, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } }));
      } catch (err) { console.warn('Teilen fehlgeschlagen:', err); }
      return Response.redirect('/?share=1', 303);
    })());
    return;
  }
  
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
    }).catch(() => caches.match(e.request).then(c => c || (e.request.mode === 'navigate' ? caches.match(url.pathname.startsWith('/diktat') ? '/diktat/' : '/') : undefined))
      .then(c => c || new Response('Offline', {status: 503})))
  );
});
