document.addEventListener('DOMContentLoaded', () => {
  let products = [];
  let favorites = JSON.parse(localStorage.getItem('mt_fav') || '[]');
  let ratings = JSON.parse(localStorage.getItem('mt_ratings') || '{}');
  let images = JSON.parse(localStorage.getItem('mt_images') || '{}');
  let currentView = 'home';
  let currentDetail = null;

  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);

  const views = {
    home: $('#view-home'),
    favorites: $('#view-favorites'),
    search: $('#view-search'),
    detail: $('#view-detail')
  };

  const navBtns = $$('nav button');
  const title = $('#page-title');
  const searchBar = $('#search-bar');
  const searchInput = $('#search-input');
  const lastUpdated = $('#last-updated');

  // TOAST
  function showToast(msg) {
    const t = document.createElement('div');
    t.className = 'toast';
    t.textContent = msg;
    $('#toast-container').appendChild(t);
    setTimeout(() => t.classList.add('fade-out'), 2000);
    setTimeout(() => t.remove(), 2500);
  }

  // NAVIGATION
  function switchView(name) {
    currentView = name;
    Object.values(views).forEach(v => v.classList.add('hidden'));
    navBtns.forEach(b => b.classList.remove('active'));

    if (name === 'detail') {
      views.detail.classList.remove('hidden');
      title.textContent = currentDetail ? currentDetail.nombre : 'Detalle';
    } else {
      views[name].classList.remove('hidden');
      const btn = $(`nav button[data-view="${name}"]`);
      if (btn) btn.classList.add('active');
    }

    searchBar.classList.toggle('hidden', name !== 'search');

    if (name === 'home') { title.textContent = 'MiTabaco'; renderHome(); }
    if (name === 'favorites') { title.textContent = 'Favoritos'; renderFavorites(); }
    if (name === 'search') { title.textContent = 'Buscar'; searchInput.focus(); }
    if (name === 'detail') renderDetail();
  }

  navBtns.forEach(btn => {
    btn.addEventListener('click', () => switchView(btn.dataset.view));
  });

  // CSV PARSER
  function parseCSV(csv) {
    const lines = csv.trim().split('\n');
    if (lines.length < 2) return [];
    const sep = lines[0].includes(';') ? ';' : ',';
    return lines.slice(1).map(line => {
      const cols = line.split(sep);
      const name = cols[0]?.trim() || '';
      const price = cols[1]?.trim().replace(',', '.') || '0';
      const cleanPrice = price.replace(/[^\d.]/g, '');
      return { nombre: name, precio: cleanPrice, zona: 'nacional', tipo: detectType(name) };
    }).filter(p => p.nombre && p.precio);
  }

  function detectType(name) {
    const n = name.toLowerCase();
    if (/cigarr/.test(n)) return 'cigarrillos';
    if (/puro|cigarro/.test(n)) return 'puros';
    if (/liar|picadura|shag|ambarella|bali/.test(n)) return 'tabaco-liar';
    if (/pipa/.test(n)) return 'tabaco-pipa';
    return 'otros';
  }

  // RENDER HOME
  function renderHome() {
    const type = $('#filter-type').value;
    const zone = $('#filter-zone').value;
    const maxP = parseFloat($('#filter-price').value);
    $('#price-val').textContent = `${maxP}€`;

    const filtered = products.filter(p => {
      return (type === 'all' || p.tipo === type) &&
             (zone === 'all' || p.zona === zone) &&
             parseFloat(p.precio) <= maxP;
    });

    const list = $('#product-list');
    if (!filtered.length) {
      list.innerHTML = '<p class="empty-state">Sin resultados</p>';
      return;
    }
    list.innerHTML = filtered.map(p => cardHTML(p)).join('');
    bindCardClicks();
  }

  function cardHTML(p) {
    const isFav = favorites.includes(p.nombre);
    return `
      <div class="card" data-name="${p.nombre}">
        <div class="card-header">
          <span class="card-name">${p.nombre}</span>
          <span class="card-price">${p.precio}€</span>
        </div>
        <div class="card-meta">${p.tipo} · ${p.zona}</div>
        <button class="card-fav-btn ${isFav ? 'fav' : ''}" data-name="${p.nombre}">
          ${isFav ? '♥ Favorito' : '♡ Añadir'}
        </button>
      </div>
    `;
  }

  function bindCardClicks() {
    $$('.card').forEach(card => {
      card.addEventListener('click', (e) => {
        if (e.target.closest('.card-fav-btn')) return;
        const name = card.dataset.name;
        currentDetail = products.find(p => p.nombre === name);
        if (currentDetail) switchView('detail');
      });
    });

    $$('.card-fav-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleFav(btn.dataset.name);
      });
    });
  }

  // FAVORITES
  function renderFavorites() {
    const favProducts = products.filter(p => favorites.includes(p.nombre));
    $('#fav-empty').classList.toggle('hidden', !!favProducts.length);
    const list = $('#favorites-list');
    list.innerHTML = favProducts.map(p => cardHTML(p)).join('');
    bindCardClicks();
  }

  function toggleFav(name) {
    const idx = favorites.indexOf(name);
    if (idx === -1) {
      favorites.push(name);
      showToast('Añadido a favoritos');
      if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission();
      if ('Notification' in window && Notification.permission === 'granted') {
        new Notification('MiTabaco', { body: `${name} añadido a favoritos` });
      }
    } else {
      favorites.splice(idx, 1);
      showToast('Eliminado de favoritos');
    }
    localStorage.setItem('mt_fav', JSON.stringify(favorites));
    renderCurrentView();
  }

  function renderCurrentView() {
    if (currentView === 'home') renderHome();
    if (currentView === 'favorites') renderFavorites();
  }

  // SEARCH
  searchInput.addEventListener('input', () => {
    const q = searchInput.value.toLowerCase().trim();
    const results = q ? products.filter(p => p.nombre.toLowerCase().includes(q)) : [];
    const list = $('#search-list');
    if (!q) {
      list.innerHTML = '<p class="empty-state">Escribe para buscar...</p>';
      return;
    }
    if (!results.length) {
      list.innerHTML = '<p class="empty-state">Sin resultados</p>';
      return;
    }
    list.innerHTML = results.map(p => cardHTML(p)).join('');
    bindCardClicks();
  });

  // DETAIL
  $('#back-btn').addEventListener('click', () => switchView('home'));

  function renderDetail() {
    if (!currentDetail) return;
    const p = currentDetail;
    const isFav = favorites.includes(p.nombre);
    const rating = ratings[p.nombre] || 0;
    const imgSrc = images[p.nombre] || '';

    let imgHTML;
    if (imgSrc) {
      imgHTML = `<div class="detail-image"><img src="${imgSrc}" alt="${p.nombre}"></div>`;
    } else {
      imgHTML = `<div class="detail-image">Sin imagen</div>`;
    }

    let starsHTML = '<div class="stars">';
    for (let i = 1; i <= 5; i++) {
      starsHTML += `<span class="${i <= rating ? 'filled' : ''}" data-star="${i}">★</span>`;
    }
    starsHTML += '</div>';

    $('#detail-content').innerHTML = `
      <div class="detail-name">${p.nombre}</div>
      <div class="detail-price">${p.precio}€</div>
      <div class="detail-meta">${p.tipo} · ${p.zona}</div>
      ${imgHTML}
      <div class="rating-section">
        <label>Valoración</label>
        ${starsHTML}
      </div>
      <div class="upload-section">
        <label>Subir imagen</label>
        <input type="file" id="detail-upload" accept="image/*">
      </div>
    `;

    // Bind stars
    $$('#detail-content .stars span').forEach(star => {
      star.addEventListener('click', () => {
        const val = parseInt(star.dataset.star);
        ratings[p.nombre] = val;
        localStorage.setItem('mt_ratings', JSON.stringify(ratings));
        showToast(`Valorado ${val}★`);
        renderDetail();
      });
    });

    // Bind upload
    const upload = $('#detail-upload');
    upload.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        images[p.nombre] = ev.target.result;
        localStorage.setItem('mt_images', JSON.stringify(images));
        showToast('Imagen guardada');
        renderDetail();
      };
      reader.readAsDataURL(file);
    });
  }

  // FILTERS
  $('#filter-type').addEventListener('change', renderHome);
  $('#filter-zone').addEventListener('change', renderHome);
  $('#filter-price').addEventListener('input', renderHome);

  // LOAD DATA
  fetch('tabaco.csv')
    .then(r => r.text())
    .then(csv => {
      products = parseCSV(csv);
      lastUpdated.textContent = new Date().toLocaleDateString();
      renderHome();
    })
    .catch(() => {
      lastUpdated.textContent = 'Error al cargar';
      $('#product-list').innerHTML = '<p class="empty-state">No se pudo cargar el CSV</p>';
    });

  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js');
});