document.addEventListener('DOMContentLoaded', () => {
  let products = [];
  let favorites = JSON.parse(localStorage.getItem('favorites') || '[]');
  let ratings = JSON.parse(localStorage.getItem('ratings') || '{}');
  let images = JSON.parse(localStorage.getItem('images') || '{}');

  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);

  const productList = $('#product-list');
  const favoritesList = $('#favorites-list');
  const filterType = $('#filter-type');
  const filterZone = $('#filter-zone');
  const filterPrice = $('#filter-price');
  const priceVal = $('#price-val');
  const lastUpdated = $('#last-updated');
  const toastContainer = $('#toast-container');
  const favSection = $('#favorites');

  const showToast = (msg) => {
    const t = document.createElement('div');
    t.className = 'toast';
    t.textContent = msg;
    toastContainer.appendChild(t);
    setTimeout(() => t.classList.add('fade-out'), 2500);
    setTimeout(() => t.remove(), 3000);
  };

  const parseCSV = (csv) => {
    const lines = csv.trim().split('\n');
    const headers = lines[0].split(',');
    return lines.slice(1).map(line => {
      const values = line.split(',');
      return headers.reduce((acc, h, i) => { acc[h.trim()] = values[i]?.trim(); return acc; }, {});
    });
  };

  const renderStars = (name, currentRating = 0) => {
    let html = '<div class="rating">';
    for (let i = 1; i <= 5; i++) {
      html += `<span class="star ${i <= currentRating ? 'filled' : ''}" data-val="${i}">★</span>`;
    }
    return html + '</div>';
  };

  const renderCard = (p, isFav = false) => {
    const rate = ratings[p.nombre] || 0;
    const img = images[p.nombre] ? `<img src="${images[p.nombre]}" class="card-image" alt="${p.nombre}">` : `<div class="card-image">Sin imagen</div>`;
    return `
      <div class="card" data-name="${p.nombre}">
        <div class="card-header">
          <span class="card-name">${p.nombre}</span>
          <span class="card-price">${p.precio}€</span>
        </div>
        <div class="card-type">${p.tipo} | Zona: ${p.zona}</div>
        ${img}
        ${renderStars(p.nombre, rate)}
        <div class="card-actions">
          <input type="file" accept="image/*" data-name="${p.nombre}" class="img-upload">
          <button class="fav-btn" data-name="${p.nombre}">${isFav ? 'Quitar fav' : 'Fav'}</button>
        </div>
      </div>
    `;
  };

  const filterAndRender = () => {
    const type = filterType.value;
    const zone = filterZone.value;
    const maxPrice = parseFloat(filterPrice.value);
    priceVal.textContent = `${maxPrice.toFixed(1)}€`;

    const filtered = products.filter(p => {
      return (type === 'all' || p.tipo === type) &&
             (zone === 'all' || p.zona === zone) &&
             parseFloat(p.precio) <= maxPrice;
    });

    productList.innerHTML = filtered.map(p => renderCard(p, favorites.includes(p.nombre))).join('');
    updateFavorites();
    bindCardEvents();
  };

  const updateFavorites = () => {
    const favProducts = products.filter(p => favorites.includes(p.nombre));
    if (favProducts.length) {
      favSection.classList.remove('hidden');
      favoritesList.innerHTML = favProducts.map(p => renderCard(p, true)).join('');
    } else {
      favSection.classList.add('hidden');
    }
    bindCardEvents();
  };

  const bindCardEvents = () => {
    $$('.star').forEach(star => {
      star.addEventListener('click', (e) => {
        const name = e.target.closest('.card').dataset.name;
        const val = parseInt(e.target.dataset.val);
        ratings[name] = val;
        localStorage.setItem('ratings', JSON.stringify(ratings));
        showToast(`Valorado ${val}★`);
        filterAndRender();
      });
    });

    $$('.fav-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const name = e.target.dataset.name;
        const idx = favorites.indexOf(name);
        if (idx === -1) {
          favorites.push(name);
          showToast('Añadido a favoritos');
          if ('Notification' in window && Notification.permission === 'default') {
            Notification.requestPermission();
          }
          if ('Notification' in window && Notification.permission === 'granted') {
            new Notification('¡Nuevo favorito!', { body: `${name} añadido a favoritos. Te avisaremos si cambia el precio.` });
          }
        } else {
          favorites.splice(idx, 1);
          showToast('Eliminado de favoritos');
        }
        localStorage.setItem('favorites', JSON.stringify(favorites));
        filterAndRender();
      });
    });

    $$('.img-upload').forEach(inp => {
      inp.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
          const reader = new FileReader();
          reader.onload = (ev) => {
            const name = inp.dataset.name;
            images[name] = ev.target.result;
            localStorage.setItem('images', JSON.stringify(images));
            showToast('Imagen guardada');
            filterAndRender();
          };
          reader.readAsDataURL(file);
        }
      });
    });
  };

  filterType.addEventListener('change', filterAndRender);
  filterZone.addEventListener('change', filterAndRender);
  filterPrice.addEventListener('input', filterAndRender);

  fetch('tabaco.csv')
    .then(res => res.text())
    .then(csv => {
      products = parseCSV(csv);
      lastUpdated.textContent = new Date().toLocaleDateString();
      filterAndRender();
    })
    .catch(() => {
      lastUpdated.textContent = 'Error al cargar datos';
      productList.innerHTML = '<p>No se pudieron cargar los productos. Verifica el CSV.</p>';
    });

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js');
  }
});