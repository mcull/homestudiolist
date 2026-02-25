(function () {
  'use strict';

  // ---------------------------------------------------------------------------
  // Configuration — override via window.HSL_FILTER_CONFIG in Squarespace header
  // ---------------------------------------------------------------------------

  const DEFAULTS = {
    apiUrl: null,
    cardSelector: 'article.BlogList-item',
    insertBefore: '.BlogList',
    filters: [
      { key: 'state',            label: 'Location',          type: 'select' },
      { key: 'price_tier',       label: 'Price',             type: 'select' },
      { key: 'rooms',            label: 'Rooms',             type: 'select' },
      { key: 'availability',     label: 'Availability',      type: 'select' },
      { key: 'light_rating',     label: 'Natural Light',     type: 'select' },
      { key: 'parking',          label: 'Parking',           type: 'select' },
      { key: 'pets',             label: 'Pets on Property',  type: 'select' },
      { key: 'boudoir_friendly', label: 'Boudoir Friendly',  type: 'toggle' },
    ],
  };

  const config = Object.assign({}, DEFAULTS, window.HSL_FILTER_CONFIG || {});
  const FILTER_DEFS = config.filters;

  // ---------------------------------------------------------------------------
  // State
  // ---------------------------------------------------------------------------

  let listings = [];
  let cardMap = {};        // listingId (int) → article element
  const activeFilters = {};

  // ---------------------------------------------------------------------------
  // DOM matching
  // ---------------------------------------------------------------------------

  function buildCardMap() {
    const map = {};
    document.querySelectorAll(config.cardSelector).forEach(card => {
      const link = card.querySelector('a[href*="/listing/"]');
      if (!link) return;
      const m = link.getAttribute('href').match(/\/listing\/(\d+)/);
      if (m) map[parseInt(m[1], 10)] = card;
    });
    return map;
  }

  // ---------------------------------------------------------------------------
  // Filtering
  // ---------------------------------------------------------------------------

  function listingMatchesFilters(listing) {
    return Object.entries(activeFilters).every(([key, value]) => {
      if (value === null || value === undefined || value === '') return true;

      const field = listing[key];

      // Boolean toggle (boudoir_friendly)
      if (typeof value === 'boolean') return value ? field === true : true;

      // Array fields (rooms, pets, availability) — listing must contain the value
      if (Array.isArray(field)) return field.includes(value);

      // Scalar fields
      return String(field) === String(value);
    });
  }

  function applyFilters() {
    let visible = 0;

    Object.entries(cardMap).forEach(([idStr, card]) => {
      const listing = listings.find(l => l.id === parseInt(idStr, 10));
      const show = !listing || listingMatchesFilters(listing);
      card.style.display = show ? '' : 'none';
      if (show) visible++;
    });

    updateCount(visible);
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

    updateCount(Object.keys(cardMap).length);
  }

  function updateCount(n) {
    const el = document.querySelector('#hsl-filter-ui .hsl-filter-count');
    if (el) el.textContent = `Showing ${n.toLocaleString()} space${n === 1 ? '' : 's'}`;
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
    applyFilters();
    syncURL();
  }

  function readURL() {
    const params = new URLSearchParams(window.location.search);
    FILTER_DEFS.forEach(def => {
      const val = params.get(def.key);
      if (val) activeFilters[def.key] = def.type === 'toggle' ? val === 'true' : val;
    });
  }

  function syncURL() {
    const params = new URLSearchParams();
    Object.entries(activeFilters).forEach(([k, v]) => {
      if (v !== null && v !== undefined) params.set(k, v);
    });
    const qs = params.toString();
    window.history.replaceState({}, '', window.location.pathname + (qs ? '?' + qs : ''));
  }

  // ---------------------------------------------------------------------------
  // Filter container injection
  // ---------------------------------------------------------------------------

  function injectContainer() {
    if (document.getElementById('hsl-filter-ui')) return;

    // Find insertion point: before .BlogList, or before the first card's parent
    let target = document.querySelector(config.insertBefore);
    if (!target) {
      const firstCard = document.querySelector(config.cardSelector);
      target = firstCard ? firstCard.parentElement : null;
    }
    if (!target) {
      console.warn('[HSL Filter] Could not find insertion point. Set config.insertBefore.');
      return;
    }

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
      applyFilters();
      syncURL();
    });

    target.parentNode.insertBefore(ui, target);
  }

  // ---------------------------------------------------------------------------
  // Init
  // ---------------------------------------------------------------------------

  async function init() {
    if (!config.apiUrl) {
      console.warn('[HSL Filter] No apiUrl configured. Set window.HSL_FILTER_CONFIG.apiUrl.');
      return;
    }

    readURL();
    injectContainer();

    // Session cache for instant back-navigation
    const CACHE_KEY = 'hsl_listings_v1';
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
    cardMap = buildCardMap();

    const matched = Object.keys(cardMap).length;
    const unmatched = listings.length - matched;
    console.log(`[HSL Filter] ${listings.length} listings from API · ${matched} matched in DOM · ${unmatched} unmatched`);

    buildFilterUI();

    if (Object.keys(activeFilters).length > 0) {
      applyFilters();
    } else {
      updateCount(matched);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
