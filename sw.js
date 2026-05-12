const scope = self.registration.scope;
const CACHE = 'mt-v7';

self.addEventListener('install', e => {
  // Cache static assets using relative URLs so they resolve under the subpath
  const assets = [
    scope,
    scope + 'index.html',
    scope + 'style.css',
    scope + 'app.js',
    scope + 'manifest.json',
    scope + 'favicon.svg'
  ];
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(assets)));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  const deleteOld = caches.keys().then(keys =>
    Promise.all(keys.filter(k => k !== CACHE && k !== 'price-alerts').map(k => caches.delete(k)))
  );
  e.waitUntil(Promise.all([deleteOld, self.clients.claim()]));
  setTimeout(checkPriceChanges, 3000);
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  // Only handle requests within this SW's scope
  if (!url.href.startsWith(scope)) {
    e.respondWith(fetch(e.request));
    return;
  }
  // Data files: network-first (always get latest)
  if (url.pathname.endsWith('/tabaco.csv') || url.pathname.endsWith('/price-changes.json')) {
    e.respondWith(networkFirst(e.request));
    return;
  }
  // Static assets: cache-first for speed & offline
  e.respondWith(caches.match(e.request).then(r => r || fetch(e.request)));
});

async function networkFirst(req) {
  const cache = await caches.open(CACHE);
  try {
    const fresh = await fetch(req);
    if (fresh.ok) cache.put(req, fresh.clone());
    return fresh;
  } catch {
    return cache.match(req);
  }
}

// --- PUSH ---
self.addEventListener('push', e => {
  let data = { title: 'MiTabaco', body: '' };
  if (e.data) {
    try { data = e.data.json(); } catch { data.body = e.data.text(); }
  }
  e.waitUntil(
    self.registration.showNotification(data.title || 'MiTabaco', {
      body: data.body || '',
      icon: scope + 'favicon.ico',
      badge: scope + 'favicon.ico',
      vibrate: [200, 100, 200],
      data: { url: data.url || scope }
    })
  );
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = e.notification.data?.url || scope;
  e.waitUntil(
    clients.matchAll({ type: 'window' }).then(clients => {
      for (const c of clients) {
        if (c.url === url) return c.focus();
      }
      return clients.openWindow(url);
    })
  );
});

// --- PRICE CHECK ---
async function checkPriceChanges() {
  try {
    const res = await fetch(scope + 'data/price-changes.json?' + Date.now());
    if (!res.ok) return;
    const changes = await res.json();
    if (!changes || !changes.length) return;

    const cache = await caches.open('price-alerts');
    const cachedRes = await cache.match('price-alerts-seen');
    const seen = cachedRes ? await cachedRes.json() : [];

    const newChanges = changes.filter(c => !seen.includes(c.nombre + c.old + c.new));
    if (!newChanges.length) return;

    const title = newChanges.length === 1
      ? `💸 ${newChanges[0].nombre}`
      : `💸 ${newChanges.length} productos cambiaron de precio`;
    const body = newChanges.length === 1
      ? `${newChanges[0].old}€ → ${newChanges[0].new}€`
      : `Revisa tus favoritos`;

    self.registration.showNotification(title, {
      body,
      icon: scope + 'favicon.ico',
      badge: scope + 'favicon.ico',
      vibrate: [200, 100, 200],
      data: { url: scope }
    });

    const updated = [...seen, ...newChanges.map(c => c.nombre + c.old + c.new)];
    const blob = new Blob([JSON.stringify(updated)], { type: 'application/json' });
    await cache.put('price-alerts-seen', new Response(blob));
  } catch (e) {
    // Silently fail
  }
}

self.addEventListener('message', e => {
  if (e.data && e.data.type === 'CHECK_NOW') {
    checkPriceChanges();
  }
});
