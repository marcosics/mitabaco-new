(() => {
  const $ = s => document.querySelector(s);
  const $$ = s => [...document.querySelectorAll(s)];

  let prods = [];
  const fav = JSON.parse(localStorage.mt_fav || '[]');
  const rates = JSON.parse(localStorage.mt_rates || '{}');
  const imgs = JSON.parse(localStorage.mt_imgs || '{}');

  const list = $('#list');
  const favs = $('#favs');
  const detail = $('#detail');
  const toast = $('#toast');

  let current = null;

  function show(m) { toast.textContent = m; toast.classList.remove('hidden'); setTimeout(() => toast.classList.add('hidden'), 1800); }

  function parse(csv) {
    const lines = csv.trim().split('\n');
    if (lines.length < 2) return [];
    const sep = lines[0].includes(';') ? ';' : ',';
    const r = [];
    for (let i = 1; i < lines.length; i++) {
      const c = lines[i].split(sep);
      const name = (c[0] || '').trim();
      let price = (c[1] || '0').trim().replace(',','.').replace(/[^\d.]/g,'');
      const type = (c[2] || '').trim().toLowerCase();
      let t = 'otros';
      if (/cigarr/.test(name)) t = 'cigarrillos';
      else if (/liar|picadura|shag/.test(name)) t = 'tabaco-liar';
      else if (/puro|cigarro/.test(name)) t = 'puros';
      else if (/pipa/.test(name)) t = 'tabaco-pipa';
      if (type === 'cigarrillos' || type === 'tabaco-liar' || type === 'puros' || type === 'tabaco-pipa') t = type;
      if (name && price) r.push({ nombre: name, precio: price, tipo: t, zona: c[3] ? c[3].trim() : 'nacional' });
    }
    return r;
  }

  function render() {
    const q = $('#search').value.toLowerCase().trim();
    const f = $('#filter').value;
    let p = prods;
    if (f !== 'all') p = p.filter(x => x.tipo === f);
    if (q) p = p.filter(x => x.nombre.toLowerCase().includes(q));
    list.innerHTML = p.length ? p.map(card).join('') : '<div class="empty">Sin resultados</div>';
    bind();
    renderFavs();
  }

  function card(x) {
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

  function bind() {
    $$('.card').forEach(el => el.addEventListener('click', () => {
      current = prods.find(x => x.nombre === el.dataset.n);
      if (current) openDetail();
    }));
  }

  function renderFavs() {
    const caps = prods.filter(x => fav.includes(x.nombre)).map(x =>
      `<span class="fav-chip" data-n="${x.nombre}">${x.nombre} <span class="x">✕</span></span>`
    ).join('');
    favs.innerHTML = caps;
    favs.classList.toggle('hidden', !caps);
    favs.querySelectorAll('.fav-chip').forEach(el => {
      el.addEventListener('click', e => {
        if (e.target.classList.contains('x')) {
          const idx = fav.indexOf(el.dataset.n);
          if (idx > -1) { fav.splice(idx, 1); localStorage.mt_fav = JSON.stringify(fav); render(); show('Eliminado'); }
          return;
        }
        current = prods.find(x => x.nombre === el.dataset.n);
        if (current) openDetail();
      });
    });
  }

  function openDetail() {
    detail.classList.remove('hidden');
    const p = current;
    const img = imgs[p.nombre] || '';
    const r = rates[p.nombre] || 0;

    let s = `<button id="back">←</button>`;
    s += `<div class="detail-name">${p.nombre}</div>`;
    s += `<div class="detail-price">${p.precio}€</div>`;
    s += `<div class="detail-meta">${p.tipo} · ${p.zona}</div>`;
    s += img ? `<div class="detail-img"><img src="${img}"></div>` : `<div class="detail-img">Sin imagen</div>`;
    s += `<div class="detail-section"><label>Valorar</label><div class="stars">`;
    for (let i = 1; i <= 5; i++) s += `<span class="${i <= r ? 'on' : ''}" data-v="${i}">★</span>`;
    s += `</div></div>`;
    s += `<div class="detail-section"><label>Imagen</label><input type="file" id="up" accept="image/*"></div>`;
    s += `<div class="detail-section"><label>Favorito</label><button id="dfav" style="background:var(--surface);border:1px solid var(--border);color:var(--fg);padding:0.5rem;width:100%;cursor:pointer;font-weight:600">${fav.includes(p.nombre) ? '♥ Quitar favorito' : '♡ Añadir a favoritos'}</button></div>`;

    detail.innerHTML = s;

    $('#back').onclick = () => { detail.classList.add('hidden'); render(); };

    $$('#detail .stars span').forEach(el => el.onclick = () => {
      rates[p.nombre] = +el.dataset.v;
      localStorage.mt_rates = JSON.stringify(rates);
      show(`${el.dataset.v}★`);
      openDetail();
    });

    $('#up').onchange = e => {
      const file = e.target.files[0];
      if (!file) return;
      const rdr = new FileReader();
      rdr.onload = ev => { imgs[p.nombre] = ev.target.result; localStorage.mt_imgs = JSON.stringify(imgs); show('Imagen guardada'); openDetail(); };
      rdr.readAsDataURL(file);
    };

    $('#dfav').onclick = () => {
      const idx = fav.indexOf(p.nombre);
      if (idx > -1) { fav.splice(idx, 1); show('Quitado de favoritos'); }
      else { fav.push(p.nombre); show('Añadido a favoritos'); if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission(); }
      localStorage.mt_fav = JSON.stringify(fav);
      openDetail();
    };
  }

  $('#search').oninput = render;
  $('#filter').onchange = render;

  fetch('tabaco.csv').then(r => r.text()).then(csv => {
    prods = parse(csv);
    $('#last-updated').textContent = new Date().toLocaleDateString();
    render();
  }).catch(() => { $('#last-updated').textContent = 'error'; list.innerHTML = '<div class="empty">Error al cargar datos</div>'; });

  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js');
})();