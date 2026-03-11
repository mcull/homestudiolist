(function () {
  'use strict';

  // ---------------------------------------------------------------------------
  // Configuration — override via window.HSL_FILTER_CONFIG in Squarespace header
  // ---------------------------------------------------------------------------

  const DEFAULTS = {
    apiUrl: null,
    blogListSelector: '.BlogList',   // Squarespace blog list to hide
    insertBefore: '.BlogList',       // where to insert our grid
    requirePreviewFlag: false,       // set true to only run when ?new=1 is in the URL
    pageSize: 50,
    filters: [
      // Matches existing filter bar order (minus Country)
      { key: 'state',            label: 'State',             type: 'select' },
      { key: 'city',             label: 'City',              type: 'select' },
      { key: 'boudoir_friendly', label: 'Boudoir Friendly',  type: 'toggle' },
      { key: 'min_hours',        label: 'Min. Duration',     type: 'select' },
      { key: 'price_tier',       label: 'Listing Price',     type: 'select' },
    ],
  };

  const config = Object.assign({}, DEFAULTS, window.HSL_FILTER_CONFIG || {});
  const FILTER_DEFS = config.filters;
  const PAGE_SIZE = config.pageSize;

  // ---------------------------------------------------------------------------
  // State
  // ---------------------------------------------------------------------------

  let listings = [];   // ordered array from API (featured first)
  let cardEls = [];    // parallel array of rendered <article> elements
  const activeFilters = {};
  let currentPage = 1;

  // ---------------------------------------------------------------------------
  // Card rendering
  // ---------------------------------------------------------------------------

  function escapeHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function cardTemplate(listing) {
    const url = `/listing/${listing.id}`;
    const imgSrc = listing.imageUrl ? `${listing.imageUrl}?format=750w` : '';
    const imgHtml = imgSrc
      ? `<img src="${escapeHtml(imgSrc)}" alt="${escapeHtml(listing.title)}" loading="lazy">`
      : '';

    return `
      <div class="BlogList-item-image">
        <a href="${escapeHtml(url)}" class="BlogList-item-image-link">
          ${imgHtml}
        </a>
      </div>
      <a href="${escapeHtml(url)}" class="BlogList-item-title">${escapeHtml(listing.title)}</a>
      <div class="BlogList-item-excerpt">
        <p>${escapeHtml(listing.locationDisplay || '')}</p>
        <a href="${escapeHtml(url)}" class="BlogList-item-readmore">
          <span>VIEW THIS SPACE</span>
        </a>
      </div>
    `;
  }

  function renderAllCards(parent) {
    cardEls = listings.map(listing => {
      const article = document.createElement('article');
      article.className = 'BlogList-item hentry';
      article.innerHTML = cardTemplate(listing);
      parent.appendChild(article);
      return article;
    });
  }

  // ---------------------------------------------------------------------------
  // Filtering + Pagination
  // ---------------------------------------------------------------------------

  function listingMatchesFilters(listing) {
    return FILTER_DEFS.every(def => {
      const value = activeFilters[def.key];
      if (value === null || value === undefined || value === '') return true;

      const field = listing[def.key];

      if (def.type === 'toggle') return value ? field === true : true;
      if (Array.isArray(field)) return field.includes(value);
      return String(field) === String(value);
    });
  }

  function applyFilters() {
    // Build the full filtered index list
    const filteredIndices = [];
    listings.forEach((listing, i) => {
      if (listingMatchesFilters(listing)) filteredIndices.push(i);
    });

    const total = filteredIndices.length;
    const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

    // Clamp currentPage to valid range
    if (currentPage < 1) currentPage = 1;
    if (currentPage > totalPages) currentPage = totalPages;

    const start = (currentPage - 1) * PAGE_SIZE;
    const pageSet = new Set(filteredIndices.slice(start, start + PAGE_SIZE));

    // Show only cards on the current page
    cardEls.forEach((el, i) => {
      el.style.display = pageSet.has(i) ? '' : 'none';
    });

    updateCount(total);
    renderPagination(totalPages);
  }

  // ---------------------------------------------------------------------------
  // Pagination UI
  // ---------------------------------------------------------------------------

  function renderPagination(totalPages) {
    const container = document.getElementById('hsl-pagination');
    if (!container) return;

    if (totalPages <= 1) {
      container.innerHTML = '';
      return;
    }

    // Compute which page numbers to display
    const show = new Set();
    for (let i = 1; i <= Math.min(3, totalPages); i++) show.add(i);
    for (let i = Math.max(1, totalPages - 2); i <= totalPages; i++) show.add(i);
    for (let i = Math.max(1, currentPage - 2); i <= Math.min(totalPages, currentPage + 2); i++) show.add(i);

    const sorted = Array.from(show).sort((a, b) => a - b);

    let html = '<nav class="hsl-pagination" aria-label="Listings pages">';
    let prev = null;
    for (const p of sorted) {
      if (prev !== null && p > prev + 1) {
        html += '<span class="hsl-page-ellipsis">&middot;&middot;&middot;&middot;&middot;</span>';
      }
      if (p === currentPage) {
        html += `<span class="hsl-page-btn hsl-page-active" aria-current="page"><span>${p}</span></span>`;
      } else {
        html += `<button class="hsl-page-btn" data-page="${p}" type="button">${p}</button>`;
      }
      prev = p;
    }
    html += '</nav>';

    container.innerHTML = html;

    container.querySelectorAll('button[data-page]').forEach(btn => {
      btn.addEventListener('click', () => setPage(parseInt(btn.dataset.page, 10)));
    });
  }

  function setPage(page) {
    currentPage = page;
    applyFilters();
    syncURL();

    // Scroll to top of grid
    const grid = document.getElementById('hsl-card-grid');
    if (grid) grid.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // ---------------------------------------------------------------------------
  // Filter UI
  // ---------------------------------------------------------------------------

  function getUniqueOptions(key) {
    const values = new Set();
    listings.forEach(l => {
      const v = l[key];
      if (Array.isArray(v)) v.forEach(x => x && values.add(x));
      else if (v !== null && v !== undefined && v !== '' && v !== false) values.add(v);
    });
    return Array.from(values).sort((a, b) => {
      if (!isNaN(a) && !isNaN(b)) return Number(a) - Number(b);
      return String(a).localeCompare(String(b));
    });
  }

  function buildFilterUI() {
    const filtersEl = document.querySelector('#hsl-filter-ui .hsl-filters');
    if (!filtersEl) return;

    FILTER_DEFS.forEach(def => {
      const group = document.createElement('div');
      group.className = 'hsl-filter-group';

      const label = document.createElement('label');
      label.textContent = def.label;
      label.setAttribute('for', `hsl-filter-${def.key}`);
      group.appendChild(label);

      if (def.type === 'toggle') {
        const wrap = document.createElement('div');
        wrap.className = 'hsl-toggle-wrap';
        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.id = `hsl-filter-${def.key}`;
        if (activeFilters[def.key] === true) cb.checked = true;
        cb.addEventListener('change', e => setFilter(def.key, e.target.checked || null));
        const cbLabel = document.createElement('label');
        cbLabel.setAttribute('for', `hsl-filter-${def.key}`);
        cbLabel.textContent = 'Yes only';
        wrap.appendChild(cb);
        wrap.appendChild(cbLabel);
        group.appendChild(wrap);
      } else {
        const sel = document.createElement('select');
        sel.id = `hsl-filter-${def.key}`;

        const allOpt = document.createElement('option');
        allOpt.value = '';
        allOpt.textContent = 'All';
        sel.appendChild(allOpt);

        getUniqueOptions(def.key).forEach(val => {
          const opt = document.createElement('option');
          opt.value = val;
          opt.textContent = String(val);
          if (String(activeFilters[def.key]) === String(val)) opt.selected = true;
          sel.appendChild(opt);
        });

        sel.addEventListener('change', e => setFilter(def.key, e.target.value || null));
        group.appendChild(sel);
      }

      filtersEl.appendChild(group);
    });

    updateCount(listings.length);
  }

  function updateCount(n) {
    const el = document.querySelector('#hsl-filter-ui .hsl-filter-count');
    if (!el) return;
    if (Object.keys(activeFilters).length === 0) {
      el.textContent = '';
    } else {
      el.textContent = `Showing ${n.toLocaleString()} space${n === 1 ? '' : 's'}`;
    }
  }

  // ---------------------------------------------------------------------------
  // Filter state + URL sync
  // ---------------------------------------------------------------------------

  function setFilter(key, value) {
    if (value === null || value === '' || value === undefined) {
      delete activeFilters[key];
    } else {
      activeFilters[key] = value === 'true' ? true : value;
    }
    currentPage = 1;  // reset to first page on every filter change
    applyFilters();
    syncURL();
  }

  function readURL() {
    const params = new URLSearchParams(window.location.search);
    FILTER_DEFS.forEach(def => {
      const val = params.get(def.key);
      if (val) activeFilters[def.key] = def.type === 'toggle' ? val === 'true' : val;
    });
    const p = parseInt(params.get('page'), 10);
    if (p > 0) currentPage = p;
  }

  function syncURL() {
    const params = new URLSearchParams();
    Object.entries(activeFilters).forEach(([k, v]) => {
      if (v !== null && v !== undefined) params.set(k, v);
    });
    if (currentPage > 1) params.set('page', currentPage);
    const qs = params.toString();
    window.history.replaceState({}, '', window.location.pathname + (qs ? '?' + qs : ''));
  }

  // ---------------------------------------------------------------------------
  // Init
  // ---------------------------------------------------------------------------

  function injectContainer(insertTarget) {
    if (document.getElementById('hsl-filter-ui')) return;

    const ui = document.createElement('div');
    ui.id = 'hsl-filter-ui';
    ui.innerHTML = `
      <div class="hsl-filters"></div>
      <div class="hsl-filter-footer">
        <span class="hsl-filter-count">Loading spaces...</span>
        <button class="hsl-filter-clear" type="button">Clear all filters</button>
      </div>
    `;

    ui.querySelector('.hsl-filter-clear').addEventListener('click', () => {
      Object.keys(activeFilters).forEach(k => delete activeFilters[k]);
      ui.querySelectorAll('select').forEach(s => (s.value = ''));
      ui.querySelectorAll('input[type=checkbox]').forEach(c => (c.checked = false));
      currentPage = 1;
      applyFilters();
      syncURL();
    });

    insertTarget.parentNode.insertBefore(ui, insertTarget);
  }

  function injectPaginationContainer(afterGrid) {
    if (document.getElementById('hsl-pagination')) return;
    const wrap = document.createElement('div');
    wrap.id = 'hsl-pagination';
    afterGrid.parentNode.insertBefore(wrap, afterGrid.nextSibling);
  }

  async function init() {
    // Feature flag: only activate when ?new=1 is present (safe live testing)
    if (config.requirePreviewFlag) {
      const params = new URLSearchParams(window.location.search);
      if (params.get('new') !== '1') return;
    }

    if (!config.apiUrl) {
      console.warn('[HSL Filter] No apiUrl configured. Set window.HSL_FILTER_CONFIG.apiUrl.');
      return;
    }

    // Find insertion target early so we can show loading state
    const blogList = document.querySelector(config.blogListSelector);
    const insertTarget = document.querySelector(config.insertBefore) || blogList;
    if (!insertTarget) {
      console.warn('[HSL Filter] Could not find insertion point.');
      return;
    }

    readURL();
    injectContainer(insertTarget);

    // Session cache for instant back-navigation
    const CACHE_KEY = 'hsl_listings_v2';
    let data = null;

    try {
      const cached = sessionStorage.getItem(CACHE_KEY);
      if (cached) data = JSON.parse(cached);
    } catch (_) {}

    if (!data) {
      try {
        const res = await fetch(config.apiUrl);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        data = await res.json();
        try { sessionStorage.setItem(CACHE_KEY, JSON.stringify(data)); } catch (_) {}
      } catch (err) {
        console.error('[HSL Filter] Failed to load listings:', err);
        updateCount(0);
        return;
      }
    }

    listings = data.listings || [];

    // Extract any image URLs already rendered in Squarespace's DOM before hiding it.
    // Covers the first ~50 cards (featured listings); the rest fall back to imageUrl from API.
    const domImages = {};
    if (blogList) {
      blogList.querySelectorAll('article.BlogList-item').forEach(card => {
        const link = card.querySelector('a[href*="/listing/"]');
        const img = card.querySelector('img[data-src], img[src*="squarespace-cdn"]');
        if (!link || !img) return;
        const m = link.getAttribute('href').match(/\/listing\/(\d+)/);
        const src = img.getAttribute('data-src') || img.getAttribute('src');
        if (m && src) domImages[parseInt(m[1], 10)] = src;
      });
    }

    // Merge DOM images into listings (prefer DOM image as it's already sized for display)
    listings = listings.map(l => ({
      ...l,
      imageUrl: domImages[l.id] || l.imageUrl || null,
    }));

    const withImages = listings.filter(l => l.imageUrl).length;
    console.log(`[HSL Filter] ${listings.length} listings loaded · ${withImages} with images (${Object.keys(domImages).length} from DOM, rest from API)`);

    // Create our card grid — use 'hsl-BlogList' so the Universal Filter
    // script doesn't treat it as a second .BlogList container to attach to
    const grid = document.createElement('div');
    grid.id = 'hsl-card-grid';
    grid.className = 'hsl-BlogList';
    insertTarget.parentNode.insertBefore(grid, insertTarget);

    if (blogList) blogList.style.display = 'none';

    renderAllCards(grid);
    buildFilterUI();
    injectPaginationContainer(grid);

    applyFilters();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
