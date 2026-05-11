const CACHE = 'mt-v3';
const ASSETS = ['/', '/index.html', '/style.css', '/app.js', '/tabaco.csv'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)));
});

self.addEventListener('fetch', e => {
  e.respondWith(caches.match(e.request).then(r => r || fetch(e.request)));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
});

// Background price check every time the SW is woken up
self.addEventListener('message', e => {
  if (e.data && e.data.type === 'CHECK_PRICES') {
    checkPrices(e.data.favorites);
  }
});

function checkPrices(favorites) {
  if (!favorites || !favorites.length) return;
  fetch('tabaco.csv?' + Date.now())
    .then(r => r.text())
    .then(csv => {
      const lines = csv.trim().split('\n');
      if (lines.length < 2) return;
      const prices = {};
      for (let i = 1; i < lines.length; i++) {
        const parts = [];
        let cur = '', inQ = false;
        for (const ch of lines[i]) {
          if (ch === '"') { inQ = !inQ; continue; }
          if (ch === ',' && !inQ) { parts.push(cur.trim()); cur = ''; continue; }
          cur += ch;
        }
        parts.push(cur.trim());
        if (parts.length < 4) continue;
        const name = parts[0].replace(/^#NO NAME\s*/i, '').trim();
        const price = parts[3].replace(',', '.').replace(/[^\d.]/g, '');
        if (name && price) prices[name] = price;
      }

      // Send prices back to client to compare
      self.clients.matchAll().then(clients => {
        clients.forEach(client => {
          client.postMessage({ type: 'PRICES_UPDATE', prices, favorites });
        });
      });
    })
    .catch(() => {});
}

// Listen for background sync (supported in some browsers)
self.addEventListener('sync', e => {
  if (e.tag === 'price-check') {
    e.waitUntil(
      self.clients.matchAll().then(clients => {
        if (clients.length > 0) {
          clients[0].postMessage({ type: 'TRIGGER_CHECK' });
        }
      })
    );
  }
});