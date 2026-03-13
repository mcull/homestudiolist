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

  function getImagesApiUrl() {
    if (config.imagesApiUrl) return config.imagesApiUrl;
    if (!config.apiUrl) return null;
    return config.apiUrl.replace(/\/listings(\?.*)?$/, '/images');
  }

  // ---------------------------------------------------------------------------
  // State
  // ---------------------------------------------------------------------------

  const CACHE_KEY = 'hsl_listings_v4';

  let listings = [];   // ordered array from API (featured first)
  let cardEls = [];    // parallel array of rendered <article> elements
  const activeFilters = {};
  let currentPage = 1;
  const fetchingImages = new Set(); // IDs currently in-flight
  const DYNAMIC_FILTER_KEYS = new Set(['city', 'min_hours', 'price_tier']);
  let _updatingOptions = false; // guard against infinite loop in updateFilterOptions↔applyFilters

  function closeAllDropdowns(except) {
    document.querySelectorAll('#hsl-filter-ui .hsl-dropdown.hsl-dropdown--open').forEach(dd => {
      if (dd === except) return;
      dd.classList.remove('hsl-dropdown--open');
      const trigger = dd.querySelector('.hsl-dropdown-label');
      if (trigger) trigger.setAttribute('aria-expanded', 'false');
    });
  }

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
    const titleDisplay = listing.price
      ? `${listing.title}: $${listing.price}/hr`
      : listing.title;

    return `
      <div class="BlogList-item-image">
        <a href="${escapeHtml(url)}" class="BlogList-item-image-link">
          ${imgHtml}
        </a>
      </div>
      <a href="${escapeHtml(url)}" class="BlogList-item-title">${escapeHtml(titleDisplay)}</a>
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
      article.dataset.listingId = listing.id;
      article.innerHTML = cardTemplate(listing);
      parent.appendChild(article);
      return article;
    });
  }

  // ---------------------------------------------------------------------------
  // On-demand image fetching
  // ---------------------------------------------------------------------------

  async function fetchAndPaintImages(visibleListings) {
    const imagesApiUrl = getImagesApiUrl();
    if (!imagesApiUrl) return;

    const needed = visibleListings.filter(l => !l.imageUrl && !fetchingImages.has(l.id));
    if (!needed.length) return;

    const ids = needed.map(l => l.id);
    ids.forEach(id => fetchingImages.add(id));

    try {
      const res = await fetch(`${imagesApiUrl}?ids=${ids.join(',')}`);
      if (!res.ok) return;
      const { images } = await res.json();

      // Merge into listings array
      listings.forEach((l, i) => {
        if (images[l.id]) listings[i] = { ...listings[i], imageUrl: images[l.id] };
      });

      // Paint images into already-rendered cards
      ids.forEach(id => {
        const url = images[id];
        if (!url) return;
        const card = document.querySelector(`[data-listing-id="${id}"]`);
        if (!card) return;
        const imgLink = card.querySelector('.BlogList-item-image-link');
        if (imgLink && !imgLink.querySelector('img')) {
          const img = document.createElement('img');
          img.src = `${url}?format=750w`;
          img.alt = card.querySelector('.BlogList-item-title')?.textContent || '';
          img.loading = 'lazy';
          imgLink.appendChild(img);
        }
      });

      // Persist updated image URLs back into sessionStorage
      try {
        const raw = sessionStorage.getItem(CACHE_KEY);
        if (raw) {
          const d = JSON.parse(raw);
          d.listings = listings;
          sessionStorage.setItem(CACHE_KEY, JSON.stringify(d));
        }
      } catch (_) {}

    } catch (err) {
      console.warn('[HSL Filter] Image fetch failed:', err.message);
    } finally {
      ids.forEach(id => fetchingImages.delete(id));
    }
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

    // Rebuild dynamic filter dropdowns (city, min_hours, price_tier)
    if (!_updatingOptions) {
      _updatingOptions = true;
      updateFilterOptions();
      _updatingOptions = false;
    }

    // Fetch images for the visible listings that don't have one yet
    const visibleListings = filteredIndices.slice(start, start + PAGE_SIZE).map(i => listings[i]);
    fetchAndPaintImages(visibleListings);
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

  /**
   * Returns available options for `key` based on all OTHER active filters,
   * as [{value, count}]. Only includes values that actually exist in the
   * filtered result set (i.e. would not produce 0 results).
   */
  function getAvailableOptions(key) {
    const matching = listings.filter(listing =>
      FILTER_DEFS.every(def => {
        if (def.key === key) return true; // exclude this filter's own constraint
        const value = activeFilters[def.key];
        if (value === null || value === undefined || value === '') return true;
        const field = listing[def.key];
        if (def.type === 'toggle') return value ? field === true : true;
        if (Array.isArray(field)) return field.includes(value);
        return String(field) === String(value);
      })
    );

    const counts = new Map();
    matching.forEach(l => {
      const v = l[key];
      if (Array.isArray(v)) {
        v.forEach(x => { if (x) counts.set(x, (counts.get(x) || 0) + 1); });
      } else if (v !== null && v !== undefined && v !== '' && v !== false) {
        counts.set(v, (counts.get(v) || 0) + 1);
      }
    });

    return Array.from(counts.entries())
      .sort(([a], [b]) => {
        if (!isNaN(a) && !isNaN(b)) return Number(a) - Number(b);
        return String(a).localeCompare(String(b));
      })
      .map(([value, count]) => ({ value, count }));
  }

  /**
   * Rebuilds dropdown options for city, min_hours, and price_tier based on
   * the current result set. Disables city when no state is chosen.
   * Auto-clears any selection that is no longer available, then re-applies filters.
   */
  function updateFilterOptions() {
    let needsReapply = false;

    FILTER_DEFS.forEach(def => {
      if (!DYNAMIC_FILTER_KEYS.has(def.key)) return;

      const dd = document.querySelector(`#hsl-filter-ui .hsl-dropdown[data-key="${def.key}"]`);
      if (!dd) return;

      // City is disabled until a state is chosen
      if (def.key === 'city') {
        dd.classList.toggle('hsl-dropdown--disabled', !activeFilters.state);
        if (!activeFilters.state) dd.classList.remove('hsl-dropdown--open');
      }

      const currentVal = (activeFilters[def.key] != null) ? String(activeFilters[def.key]) : '';
      const options = getAvailableOptions(def.key);

      // Rebuild option list
      const opts = dd.querySelector('.hsl-dropdown-opts');
      if (!opts) return;
      opts.innerHTML = '';

      const allLi = document.createElement('li');
      allLi.dataset.val = '';
      allLi.setAttribute('aria-selected', String(!currentVal));
      allLi.textContent = 'All';
      opts.appendChild(allLi);

      let stillAvailable = false;
      options.forEach(({ value, count }) => {
        const li = document.createElement('li');
        li.dataset.val = value;
        li.textContent = `${value} (${count})`;
        const isSelected = currentVal && String(value) === currentVal;
        li.setAttribute('aria-selected', String(!!isSelected));
        if (isSelected) stillAvailable = true;
        opts.appendChild(li);
      });

      // Update trigger display value (inline label pattern)
      const valueEl = dd.querySelector('.hsl-dropdown-value');
      if (valueEl) {
        const dv = currentVal && stillAvailable ? currentVal : '';
        valueEl.textContent = dv ? `${def.label}: ${dv}` : def.label;
      }

      // Auto-clear if selected value is no longer in the result set
      if (currentVal && !stillAvailable) {
        delete activeFilters[def.key];
        needsReapply = true;
      }
    });

    // Handle toggle-type filters: grey out "Yes only" if no qualifying listings exist
    FILTER_DEFS.filter(def => def.type === 'toggle').forEach(def => {
      const dd = document.querySelector(`#hsl-filter-ui .hsl-dropdown[data-key="${def.key}"]`);
      if (!dd) return;

      // Count listings that pass all OTHER active filters and have this field true
      const matching = listings.filter(listing =>
        FILTER_DEFS.every(d => {
          if (d.key === def.key) return true;
          const value = activeFilters[d.key];
          if (value === null || value === undefined || value === '') return true;
          const field = listing[d.key];
          if (d.type === 'toggle') return value ? field === true : true;
          if (Array.isArray(field)) return field.includes(value);
          return String(field) === String(value);
        })
      );
      const anyTrue = matching.some(l => l[def.key] === true);

      const yesLi = dd.querySelector('.hsl-dropdown-opts li[data-val="true"]');
      if (yesLi) yesLi.classList.toggle('hsl-dropdown-opt--disabled', !anyTrue);

      // Auto-clear if "Yes only" is selected but no listings qualify
      if (activeFilters[def.key] && !anyTrue) {
        delete activeFilters[def.key];
        const valueEl = dd.querySelector('.hsl-dropdown-value');
        if (valueEl) valueEl.textContent = def.label;
        const allLi = dd.querySelector('.hsl-dropdown-opts li[data-val=""]');
        if (allLi) allLi.setAttribute('aria-selected', 'true');
        if (yesLi) yesLi.setAttribute('aria-selected', 'false');
        needsReapply = true;
      }
    });

    // Re-apply once if any filter was auto-cleared; _updatingOptions prevents recursion
    if (needsReapply) {
      applyFilters();
    }
  }

  // Returns the display string for a filter value given its def
  function filterDisplayVal(def, rawVal) {
    if (!rawVal) return '';
    if (def.type === 'toggle') return rawVal === 'true' || rawVal === true ? 'Yes only' : '';
    return String(rawVal);
  }

  function buildFilterUI() {
    const filtersEl = document.querySelector('#hsl-filter-ui .hsl-filters');
    if (!filtersEl) return;

    FILTER_DEFS.forEach(def => {
      const group = document.createElement('div');
      group.className = 'hsl-filter-group';

      // All filters use the same custom dropdown — toggle becomes a 2-option dropdown
      const activeRawVal = activeFilters[def.key] != null ? String(activeFilters[def.key]) : '';
      const dv = filterDisplayVal(def, activeRawVal);

      const dd = document.createElement('div');
      dd.className = 'hsl-dropdown';
      dd.dataset.key = def.key;
      if (def.key === 'city' && !activeFilters.state) dd.classList.add('hsl-dropdown--disabled');

      const trigger = document.createElement('div');
      trigger.className = 'hsl-dropdown-label';
      trigger.setAttribute('tabindex', '0');
      trigger.setAttribute('role', 'combobox');
      trigger.setAttribute('aria-expanded', 'false');

      const valueSpan = document.createElement('span');
      valueSpan.className = 'hsl-dropdown-value';
      // Inline label: "STATE" when empty, "STATE: ARIZONA" when selected
      valueSpan.textContent = dv ? `${def.label}: ${dv}` : def.label;
      trigger.appendChild(valueSpan);

      const opts = document.createElement('ul');
      opts.className = 'hsl-dropdown-opts';
      opts.setAttribute('role', 'listbox');

      const allLi = document.createElement('li');
      allLi.dataset.val = '';
      allLi.setAttribute('aria-selected', String(!activeRawVal));
      allLi.textContent = 'All';
      opts.appendChild(allLi);

      if (def.type === 'toggle') {
        // Fixed two-option toggle dropdown
        const yesLi = document.createElement('li');
        yesLi.dataset.val = 'true';
        yesLi.setAttribute('aria-selected', String(activeRawVal === 'true'));
        yesLi.textContent = 'Yes only';
        opts.appendChild(yesLi);
      } else {
        const initOptions = DYNAMIC_FILTER_KEYS.has(def.key)
          ? getAvailableOptions(def.key)
          : getUniqueOptions(def.key).map(v => ({ value: v, count: null }));

        initOptions.forEach(({ value, count }) => {
          const li = document.createElement('li');
          li.dataset.val = value;
          li.setAttribute('aria-selected', String(activeRawVal === String(value)));
          li.textContent = count !== null ? `${value} (${count})` : String(value);
          opts.appendChild(li);
        });
      }

      dd.appendChild(trigger);
      dd.appendChild(opts);

      trigger.addEventListener('click', () => {
        if (dd.classList.contains('hsl-dropdown--disabled')) return;
        const wasOpen = dd.classList.contains('hsl-dropdown--open');
        closeAllDropdowns();
        if (!wasOpen) {
          dd.classList.add('hsl-dropdown--open');
          trigger.setAttribute('aria-expanded', 'true');
        }
      });

      trigger.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); trigger.click(); }
        if (e.key === 'Escape') {
          dd.classList.remove('hsl-dropdown--open');
          trigger.setAttribute('aria-expanded', 'false');
        }
      });

      opts.addEventListener('click', e => {
        const li = e.target.closest('li');
        if (!li || li.classList.contains('hsl-dropdown-opt--disabled')) return;
        const val = li.dataset.val || null;
        const dv = filterDisplayVal(def, val);
        valueSpan.textContent = dv ? `${def.label}: ${dv}` : def.label;
        opts.querySelectorAll('li').forEach(l => l.setAttribute('aria-selected', String(l === li)));
        dd.classList.remove('hsl-dropdown--open');
        trigger.setAttribute('aria-expanded', 'false');
        setFilter(def.key, val);
      });

      group.appendChild(dd);
      filtersEl.appendChild(group);
    });

    updateCount(listings.length);
  }

  function updateCount(n) {
    const el = document.querySelector('#hsl-filter-ui .hsl-filter-count');
    if (!el) return;
    if (Object.keys(activeFilters).length === 0) {
      el.style.display = 'none';
    } else {
      el.style.display = '';
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
    // Cascading: changing state clears city selection
    if (key === 'state') {
      delete activeFilters.city;
      const cityDd = document.querySelector('#hsl-filter-ui .hsl-dropdown[data-key="city"]');
      if (cityDd) {
        const valEl = cityDd.querySelector('.hsl-dropdown-value');
        const cityDef = FILTER_DEFS.find(d => d.key === 'city');
        if (valEl && cityDef) valEl.textContent = cityDef.label;
      }
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
        <span class="hsl-filter-count" style="display:none"></span>
        <button class="hsl-filter-clear" type="button">Clear all filters</button>
      </div>
    `;

    ui.querySelector('.hsl-filter-clear').addEventListener('click', () => {
      Object.keys(activeFilters).forEach(k => delete activeFilters[k]);
      ui.querySelectorAll('.hsl-dropdown').forEach(dd => {
        const def = FILTER_DEFS.find(d => d.key === dd.dataset.key);
        const valEl = dd.querySelector('.hsl-dropdown-value');
        if (valEl && def) valEl.textContent = def.label;
        dd.classList.remove('hsl-dropdown--open');
      });
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

    // Close custom dropdowns when clicking outside
    document.addEventListener('click', e => {
      if (!e.target.closest('.hsl-dropdown')) closeAllDropdowns();
    });

    applyFilters();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
