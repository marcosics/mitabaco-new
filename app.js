(() => {
  const $ = s => document.querySelector(s);
  const $$ = s => [...document.querySelectorAll(s)];

  let prods = [];
  const fav = JSON.parse(localStorage.mt_fav || '[]');
  const rates = JSON.parse(localStorage.mt_rates || '{}');
  const imgs = JSON.parse(localStorage.mt_imgs || '{}');
  const opin = JSON.parse(localStorage.mt_opin || '{}');
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

  // Map external link fallback
  $('#map-open-ext').onclick = () => window.open('https://serviciostelematicosext.hacienda.gob.es/CMT/Visor/visor.aspx', '_blank');

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
    const img = imgs[p.nombre] || '';
    const r = rates[p.nombre] || 0;
    const opinion = opin[p.nombre] || '';

    let s = `<button id="dback" style="background:var(--surface);border:1px solid var(--border);color:var(--fg);width:2.5rem;height:2.5rem;font-size:1.2rem;cursor:pointer;margin-bottom:1rem">←</button>`;
    s += `<div class="detail-name">${p.nombre}</div>`;
    s += `<div class="detail-price">${p.precio}€</div>`;
    s += `<div class="detail-meta">${p.tipo.replace('tabaco-','')} · ${p.zona}</div>`;
    s += img ? `<div class="detail-img"><img src="${img}"></div>` : `<div class="detail-img">Sin imagen</div>`;
    s += `<div class="detail-section"><label>Descripción</label><p style="color:var(--muted);font-size:0.85rem;line-height:1.6">${descAI(p)}</p></div>`;
    s += `<div class="detail-section"><label>Valoración</label><div class="stars">`;
    s += `<div class="detail-section"><label>Opinión</label><textarea id="dopin" rows="3" style="width:100%;background:var(--surface);border:1px solid var(--border);color:var(--fg);padding:0.5rem;resize:none;font-size:0.9rem">${opinion}</textarea>`;
    s += `<button id="dsaveopin" style="background:var(--fg);color:var(--bg);border:none;padding:0.4rem 0.8rem;margin-top:0.4rem;font-weight:600;cursor:pointer">Guardar opinión</button></div>`;
    s += `<div class="detail-section"><label>Imagen</label><input type="file" id="dup" accept="image/*"></div>`;
    s += `<div class="detail-section"><label>Favorito</label><button id="dfav" style="background:var(--surface);border:1px solid var(--border);color:var(--fg);padding:0.5rem;width:100%;cursor:pointer;font-weight:600">${fav.includes(p.nombre) ? '♥ Quitar favorito' : '♡ Añadir a favoritos'}</button></div>`;

    detail.innerHTML = s;

    $('#dback').onclick = () => showPage('home');

    $$('#detail .stars span').forEach(el => el.onclick = () => {
      rates[p.nombre] = +el.dataset.v;
      localStorage.mt_rates = JSON.stringify(rates);
      show(`${el.dataset.v}★`);
      renderDetail();
    });

    $('#dsaveopin').onclick = () => {
      opin[p.nombre] = $('#dopin').value;
      localStorage.mt_opin = JSON.stringify(opin);
      show('Opinión guardada');
    };

    $('#dup').onchange = e => {
      const file = e.target.files[0];
      if (!file) return;
      const rdr = new FileReader();
      rdr.onload = ev => { imgs[p.nombre] = ev.target.result; localStorage.mt_imgs = JSON.stringify(imgs); show('Imagen guardada'); renderDetail(); };
      rdr.readAsDataURL(file);
    };

    $('#dfav').onclick = () => {
      const idx = fav.indexOf(p.nombre);
      if (idx > -1) { fav.splice(idx, 1); show('Quitado de favoritos'); }
      else { fav.push(p.nombre); show('Añadido'); if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission(); }
      localStorage.mt_fav = JSON.stringify(fav);
      renderDetail();
    };
  }

  // --- FILTERS ---
  $('#search').oninput = renderHome;
  $('#filter').onchange = renderHome;

  // --- LOAD ---
  fetch('tabaco.csv').then(r => r.text()).then(csv => {
    prods = parseCSV(csv);
    $('#last-updated').textContent = new Date().toLocaleDateString();
    renderHome();
  }).catch(() => {
    $('#last-updated').textContent = 'error';
    $('#list').innerHTML = '<div class="empty">Error al cargar datos</div>';
  });

  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js');
})();