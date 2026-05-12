(() => {
  const $ = s => document.querySelector(s);
  const $$ = s => [...document.querySelectorAll(s)];

  let prods = [];
  const fav = JSON.parse(localStorage.mt_fav || '[]');
  const rates = JSON.parse(localStorage.mt_rates || '{}');
  let current = null;

  function show(m) {
    const t = $('#toast');
    t.textContent = m; t.classList.remove('hidden');
    setTimeout(() => t.classList.add('hidden'), 1800);
  }

  function parseCSV(text) {
    const lines = text.trim().split('\n');
    if (lines.length < 2) return [];
    const r = [];
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
      const name = (parts[0] || '').replace(/^#NO NAME\s*/i, '').trim();
      const tipo = parts[1] || 'otros';
      const zone = parts[2] || 'nacional';
      const price = parts[3].replace(',', '.').replace(/[^\d.]/g, '');
      if (name && price) r.push({ nombre: name, tipo, zona: zone, precio: price });
    }
    return r;
  }

  function cardHTML(x) {
    return `<div class="card" data-n="${x.nombre}">
      <div class="card-row">
        <div>
          <div class="card-name">${x.nombre}</div>
          <div class="card-type">${x.tipo.replace('tabaco-','')}</div>
        </div>
        <div class="card-price">${x.precio}€</div>
      </div>
    </div>`;
  }

  // --- PAGES ---
  const pageHome = $('#page-home');
  const pageFavs = $('#page-favs');
  const pageMap = $('#page-map');
  const detail = $('#detail');
  const navHome = $('#nav-home');
  const navFavs = $('#nav-favs');
  const navMap = $('#nav-map');
  const title = $('#title');

  function showPage(name) {
    pageHome.classList.add('hidden');
    pageFavs.classList.add('hidden');
    pageMap.classList.add('hidden');
    detail.classList.add('hidden');
    navHome.classList.remove('active');
    navFavs.classList.remove('active');
    navMap.classList.remove('active');

    if (name === 'map') {
      pageMap.classList.remove('hidden');
      navMap.classList.add('active');
      title.textContent = 'Mapa de estancos';
      document.body.style.paddingBottom = '0';
    } else {
      document.body.style.paddingBottom = '65px';
    }

    if (name === 'home') {
      pageHome.classList.remove('hidden');
      navHome.classList.add('active');
      title.textContent = 'MiTabaco';
      renderHome();
    } else if (name === 'favs') {
      pageFavs.classList.remove('hidden');
      navFavs.classList.add('active');
      title.textContent = 'Favoritos';
      renderFavs();
    } else if (name === 'detail') {
      detail.classList.remove('hidden');
      title.textContent = current ? current.nombre : '';
      renderDetail();
    }
  }

  navHome.onclick = () => showPage('home');
  navFavs.onclick = () => showPage('favs');
  navMap.onclick = () => showPage('map');

  // --- MAP (estancos) ---
  let userPos = null;

  function dist(lat1, lon1, lat2, lon2) {
    const R = 6371e3;
    const a = Math.sin((lat2-lat1)*Math.PI/180/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin((lon2-lon1)*Math.PI/180/2)**2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  }

  $('#map-locate').onclick = () => {
    const btn = $('#map-locate');
    if (!navigator.geolocation) { show('Geolocalización no disponible'); return; }
    btn.textContent = '⏳ Localizando...';
    btn.disabled = true;
    navigator.geolocation.getCurrentPosition(pos => {
      userPos = { lat: pos.coords.latitude, lon: pos.coords.longitude };
      btn.textContent = '📍 Buscar estancos cercanos';
      btn.disabled = false;
      loadEstancos(userPos.lat, userPos.lon);
    }, () => {
      btn.textContent = '📍 Buscar estancos cercanos';
      btn.disabled = false;
      show('No se pudo obtener ubicación. Activa el GPS.');
    }, { enableHighAccuracy: true, timeout: 10000 });
  };

  function loadEstancos(lat, lon) {
    const el = $('#map-list');
    el.innerHTML = '<div class="empty">Buscando estancos...</div>';

    const query = `[out:json][timeout:12];
      nwr["shop"="tobacco"](around:15000,${lat},${lon});
      out body;`;

    fetch(`https://overpass-api.de/api/interpreter?data=${encodeURIComponent(query)}`)
      .then(r => r.json())
      .then(data => {
        const items = (data.elements || []).filter(e => e.tags).map(e => ({
          name: e.tags.name || 'Estanco',
          addr: [e.tags['addr:street'] || '', e.tags['addr:housenumber'] || ''].filter(Boolean).join(' ') || e.tags['addr:city'] || '',
          city: e.tags['addr:city'] || '',
          lat: e.lat,
          lon: e.lon
        })).filter(e => e.lat && e.lon);

        items.sort((a, b) => dist(lat, lon, a.lat, a.lon) - dist(lat, lon, b.lat, b.lon));
        const top = items.slice(0, 30);

        if (!top.length) { el.innerHTML = '<div class="empty">No se encontraron estancos cercanos</div>'; return; }

        el.innerHTML = top.map(e => {
          const d = dist(lat, lon, e.lat, e.lon);
          const km = d < 1000 ? `${Math.round(d)}m` : `${(d/1000).toFixed(1)}km`;
          const addr = e.addr ? `${e.addr}${e.city ? ', ' + e.city : ''}` : '';
          const url = `https://www.google.com/maps/dir/?api=1&destination=${e.lat},${e.lon}&travelmode=driving`;
          return `<div class="map-item" onclick="window.open('${url}','_blank')">
            <div class="map-name">${e.name}</div>
            <div class="map-addr">${addr || 'Dirección no disponible'}</div>
            <div class="map-dist">${km}</div>
          </div>`;
        }).join('');
      })
      .catch(() => {
        el.innerHTML = '<div class="empty">Error al buscar estancos</div>';
      });
  }

  // --- HOME ---
  function renderHome() {
    const q = $('#search').value.toLowerCase().trim();
    const f = $('#filter').value;
    let p = prods;
    if (f !== 'all') p = p.filter(x => x.tipo === f);
    if (q) p = p.filter(x => x.nombre.toLowerCase().includes(q));
    $('#list').innerHTML = p.length ? p.map(cardHTML).join('') : '<div class="empty">Sin resultados</div>';
    favChips();
    bindCards();
  }

  function favChips() {
    const caps = prods.filter(x => fav.includes(x.nombre)).map(x =>
      `<span class="fav-chip" data-n="${x.nombre}">${x.nombre} <span class="x">✕</span></span>`
    ).join('');
    const el = $('#favs');
    el.innerHTML = caps;
    el.classList.toggle('hidden', !caps);
    el.querySelectorAll('.fav-chip').forEach(el => {
      el.addEventListener('click', e => {
        if (e.target.classList.contains('x')) {
          const idx = fav.indexOf(el.dataset.n);
          if (idx > -1) { fav.splice(idx, 1); localStorage.mt_fav = JSON.stringify(fav); renderHome(); show('Eliminado'); }
          return;
        }
        current = prods.find(x => x.nombre === el.dataset.n);
        if (current) showPage('detail');
      });
    });
  }

  function bindCards() {
    $$('.card').forEach(el => el.addEventListener('click', () => {
      current = prods.find(x => x.nombre === el.dataset.n);
      if (current) showPage('detail');
    }));
  }

  // --- FAVORITES ---
  function renderFavs() {
    const fp = prods.filter(x => fav.includes(x.nombre));
    $('#fav-empty').classList.toggle('hidden', !!fp.length);
    $('#fav-list').innerHTML = fp.length ? fp.map(cardHTML).join('') : '';
    $('#fav-list').querySelectorAll('.card').forEach(el => el.addEventListener('click', () => {
      current = prods.find(x => x.nombre === el.dataset.n);
      if (current) showPage('detail');
    }));
  }

  function descAI(p) {
    const t = p.tipo;
    const w = (p.nombre.match(/\((\d+)\s*g\)/i) || [])[1];
    let d = '';
    if (t === 'cigarrillos') {
      d = `${p.nombre} son cigarrillos de calidad. Precio oficial de ${p.precio}€ en ${p.zona}. Tabaco elaborado con selección de hojas para un sabor equilibrado y experiencia de fumo tradicional.`;
    } else if (t === 'tabaco-liar') {
      const gram = w ? `${w}g` : 'formato clásico';
      d = `${p.nombre} es tabaco de liar en presentación de ${gram}. Precio de ${p.precio}€ en ${p.zona}. Picadura fina para liar cigarrillos con el sabor auténtico del tabaco.`;
    } else if (t === 'puros') {
      d = `${p.nombre} es un cigarro puro premium. Precio de ${p.precio}€ en ${p.zona}. Elaborado con capa, capote y tripa seleccionados para un aroma intenso y fumada lenta.`;
    } else if (t === 'tabaco-pipa') {
      const gram = w ? `${w}g` : '';
      d = `${p.nombre} es tabaco de pipa${gram ? ' en bote de ' + gram : ''}. Precio de ${p.precio}€ en ${p.zona}. Mezcla aromática pensada para disfrutar en pipa con largas caladas.`;
    } else {
      d = `${p.nombre}. Precio oficial de ${p.precio}€ en ${p.zona}. Producto de tabaco regulado por el Comisionado para el Mercado de Tabacos.`;
    }
    return d;
  }

  // --- DETAIL ---
  function renderDetail() {
    if (!current) { showPage('home'); return; }
    const p = current;
    const r = rates[p.nombre] || 0;

    let starsHtml = '';
    for (let i = 1; i <= 5; i++) {
      starsHtml += `<span data-v="${i}" class="${i <= r ? 'on' : ''}">★</span>`;
    }

    let s = `<button id="dback" class="glass-btn" style="margin-bottom:1rem">←</button>`;
    s += `<div class="detail-header">`;
    s += `  <div class="detail-name">${p.nombre}</div>`;
    s += `  <button id="dfav" class="heart-btn">${fav.includes(p.nombre) ? '♥' : '♡'}</button>`;
    s += `</div>`;
    s += `<div class="detail-price">${p.precio}€</div>`;
    s += `<div class="detail-meta">${p.tipo.replace('tabaco-','')} · ${p.zona}</div>`;
    s += `<div class="detail-glass"><div class="detail-section"><label>Descripción</label><p>${descAI(p)}</p></div></div>`;
    s += `<div class="detail-glass"><div class="detail-section"><label>Valoración</label><div class="stars">${starsHtml}</div></div></div>`;

    detail.innerHTML = s;

    $('#dback').onclick = () => showPage('home');

    $$('#detail .stars span').forEach(el => el.onclick = () => {
      rates[p.nombre] = +el.dataset.v;
      localStorage.mt_rates = JSON.stringify(rates);
      show(`${el.dataset.v}★`);
      renderDetail();
    });

    $('#dfav').onclick = () => {
      const idx = fav.indexOf(p.nombre);
      if (idx > -1) { fav.splice(idx, 1); show('Quitado de favoritos'); }
      else {
        fav.push(p.nombre); show('Añadido');
        window.pushSub();
      }
      localStorage.mt_fav = JSON.stringify(fav);
      renderDetail();
    };
  }

  // --- PRICE ALERT ---
  function checkPriceChanges() {
    const saved = JSON.parse(localStorage.mt_prices || '{}');
    const shown = JSON.parse(localStorage.mt_shown_alerts || '[]');
    const changed = [];
    let notifiedIds = [];

    // Always build current snapshot for favorites (needed for next change)
    const update = {};
    fav.forEach(name => {
      const p = prods.find(x => x.nombre === name);
      if (!p) return;
      update[name] = p.precio;
      const id = name + saved[name] + p.precio;
      if (saved[name] && saved[name] !== p.precio && !shown.includes(id)) {
        changed.push({ nombre: name, oldP: saved[name], newP: p.precio });
        notifiedIds.push(id);
      }
    });
    localStorage.mt_prices = JSON.stringify(update);

    function fire() {
      if (!changed.length) return;
      const first = changed[0];
      show(`💰 ${first.nombre}: ${first.oldP}€ → ${first.newP}€`);
      if ('Notification' in window && Notification.permission === 'granted') {
        new Notification('💸 Cambio de precio', {
          body: changed.length === 1
            ? `${first.nombre}: ${first.oldP}€ → ${first.newP}€`
            : `${changed.length} favoritos cambiaron de precio`
        });
      }
      localStorage.mt_shown_alerts = JSON.stringify([...shown, ...notifiedIds]);
      if (navigator.serviceWorker.controller) {
        navigator.serviceWorker.controller.postMessage({ type: 'CHECK_NOW' });
      }
    }

    // Also check price-changes.json (catches first change when baseline was never stored)
    fetch('data/price-changes.json?t=' + Date.now()).then(r => r.ok ? r.json() : []).then(changes => {
      changes.forEach(c => {
        if (!fav.includes(c.nombre)) return;
        if (shown.includes(c.nombre + c.old + c.new)) return;
        if (changed.some(x => x.nombre === c.nombre)) return;
        if (update[c.nombre] === c.new) {
          changed.push({ nombre: c.nombre, oldP: c.old, newP: c.new });
          notifiedIds.push(c.nombre + c.old + c.new);
        }
      });
      fire();
    }).catch(fire);
  }

  // --- FILTERS ---
  $('#search').oninput = renderHome;
  $('#filter').onchange = renderHome;

  // --- LOAD ---
  fetch('tabaco.csv?t=' + Date.now()).then(r => r.text()).then(csv => {
    prods = parseCSV(csv);
    $('#last-updated').textContent = new Date().toLocaleDateString();
    renderHome();
    checkPriceChanges();
  }).catch(() => {
    $('#last-updated').textContent = 'error';
    $('#list').innerHTML = '<div class="empty">Error al cargar datos</div>';
  });

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js');
    // Listen for price checks from SW
    navigator.serviceWorker.addEventListener('message', e => {
      if (e.data && e.data.type === 'PRICES_UPDATE') {
        const { prices, favorites } = e.data;
        const saved = JSON.parse(localStorage.mt_prices || '{}');
        favorites.forEach(name => {
          const newP = prices[name];
          const oldP = saved[name];
          if (oldP && newP && oldP !== newP) {
            show(`💰 ${name}: ${oldP}€ → ${newP}€`);
            if ('Notification' in window && Notification.permission === 'granted') {
              new Notification('💸 Cambio de precio', {
                body: `${name}: ${oldP}€ → ${newP}€`,
                icon: '/favicon.ico'
              });
            }
          }
        });
        const update = {};
        favorites.forEach(n => { if (prices[n]) update[n] = prices[n]; });
        localStorage.mt_prices = JSON.stringify(update);
      }
    });
  }

  // Subscribe to Push API (defined at IIFE scope so renderDetail can call it)
  window.pushSub = async () => {
    if (!('PushManager' in window) || !('serviceWorker' in navigator)) return;
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') return;

    let reg;
    try { reg = await navigator.serviceWorker.ready; } catch { return; }
    const vapidKey = 'BCQpt8_4gPBwSoOfZIHIaBgLy5tUP-vnn7-2T2hyK3hBeK9wRhzZ5U_Sbh_69RDABadKRsjEfB9KnI-80z2YBtk';

    try {
      // Get existing subscription or create a new one
      let sub = await reg.pushManager.getSubscription();
      if (!sub) {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(vapidKey)
        });
      }
      localStorage.mt_sub = JSON.stringify(sub);

      const pat = localStorage.getItem('mt_pat');
      if (pat) {
        await uploadSubscription(sub, pat);
      }
    } catch (e) {
      console.log('Push subscription failed:', e);
      // Common issue: Google Play Services out of date on Android
      if (e.name === 'AbortError') {
        show('Push no disponible: actualiza Google Play Services en Ajustes');
      } else {
        show('Error al activar notificaciones push');
      }
    }
  };

  // Request notification permission proactively
  if ('Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission();
  }

  // --- PUSH SUBSCRIPTION UPLOAD ---
  async function uploadSubscription(sub, pat) {
    const owner = 'marcosics';
    const repo = 'mitabaco-new';
    const path = 'data/subscriptions.json';
    const url = `https://api.github.com/repos/${owner}/${repo}/contents/${path}`;

    try {
      // Get existing file SHA if it exists
      let sha = null;
      try {
        const existing = await fetch(url, { headers: { Authorization: `Bearer ${pat}` } });
        if (existing.ok) {
          const data = await existing.json();
          sha = data.sha;
        }
      } catch {}

      // Read current subscriptions
      let subs = [];
      if (sha) {
        const getRes = await fetch(url, { headers: { Authorization: `Bearer ${pat}` } });
        if (getRes.ok) {
          const data = await getRes.json();
          try {
            const decoded = atob(data.content.replace(/\n/g, ''));
            subs = JSON.parse(decoded);
          } catch {}
        }
      }

      // Add/replace this subscription (dedup by endpoint)
      const existingIdx = subs.findIndex(s => s.endpoint === sub.endpoint);
      if (existingIdx >= 0) {
        subs[existingIdx] = sub;
      } else {
        subs.push(sub);
      }

      // Encode and commit
      const content = btoa(unescape(encodeURIComponent(JSON.stringify(subs, null, 2))));
      const body = { message: 'Update push subscription', content };
      if (sha) body.sha = sha;

      const putRes = await fetch(url, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${pat}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });

      if (putRes.ok) {
        show('Notificaciones push activadas ✅');
      } else {
        console.log('Upload failed', await putRes.text());
      }
    } catch (e) {
      console.log('Upload error:', e);
    }
  }

  // Helper: base64 to Uint8Array for VAPID key
  function urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding).replace(/\-/g, '+').replace(/_/g, '/');
    const rawData = atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; ++i) outputArray[i] = rawData.charCodeAt(i);
    return outputArray;
  }
})();