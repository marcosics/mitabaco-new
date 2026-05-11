const CACHE = 'mt-v4';
const ASSETS = ['/', '/index.html', '/style.css', '/app.js', '/tabaco.csv', '/data/price-changes.json'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  e.respondWith(caches.match(e.request).then(r => r || fetch(e.request)));
});

// --- PUSH NOTIFICATIONS ---
self.addEventListener('push', e => {
  let data = { title: 'MiTabaco', body: '' };
  if (e.data) {
    try { data = e.data.json(); } catch { data.body = e.data.text(); }
  }
  e.waitUntil(
    self.registration.showNotification(data.title || 'MiTabaco', {
      body: data.body || '',
      icon: data.icon || '/favicon.ico',
      badge: data.badge || '/favicon.ico',
      vibrate: data.vibrate || [200, 100, 200],
      data: { url: data.url || '/' }
    })
  );
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = e.notification.data?.url || '/';
  e.waitUntil(
    clients.matchAll({ type: 'window' }).then(clients => {
      for (const c of clients) {
        if (c.url === url) return c.focus();
      }
      return clients.openWindow(url);
    })
  );
});

// --- PRICE CHECK FROM BACKGROUND ---
async function checkPriceChanges() {
  try {
    const res = await fetch('/data/price-changes.json?' + Date.now());
    if (!res.ok) return;
    const changes = await res.json();
    if (!changes || !changes.length) return;

    // Check which changes we've already notified about
    const cache = await caches.open('price-alerts');
    const cachedRes = await cache.match('/price-alerts-seen.json');
    const seen = cachedRes ? await cachedRes.json() : [];

    const newChanges = changes.filter(c => !seen.includes(c.nombre + c.old + c.new));
    if (!newChanges.length) return;

    // Show notification
    const title = newChanges.length === 1
      ? `💸 ${newChanges[0].nombre}`
      : `💸 ${newChanges.length} productos cambiaron de precio`;
    const body = newChanges.length === 1
      ? `${newChanges[0].old}€ → ${newChanges[0].new}€`
      : `Revisa tus favoritos`;

    self.registration.showNotification(title, {
      body,
      icon: '/favicon.ico',
      badge: '/favicon.ico',
      vibrate: [200, 100, 200],
      data: { url: '/' }
    });

    // Mark as seen
    const updated = [...seen, ...newChanges.map(c => c.nombre + c.old + c.new)];
    const blob = new Blob([JSON.stringify(updated)], { type: 'application/json' });
    const response = new Response(blob);
    await cache.put('/price-alerts-seen.json', response);
  } catch (e) {
    // Silently fail
  }
}

// Check when SW is activated
self.addEventListener('activate', e => {
  e.waitUntil(Promise.all([
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE && k !== 'price-alerts').map(k => caches.delete(k)))
    ),
    self.clients.claim()
  ]));
  // Check prices shortly after activation
  setTimeout(checkPriceChanges, 3000);
});

// Check on each fetch to the page
self.addEventListener('message', e => {
  if (e.data && e.data.type === 'CHECK_NOW') {
    checkPriceChanges();
  }
});
