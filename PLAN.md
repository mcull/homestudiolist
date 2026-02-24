# Implementation Plan — Home Studio List Filter (Phase 1)

## Project Structure

```
homestudiolist-filter/
├── api/
│   └── listings.js          # Vercel serverless function
├── client/
│   ├── filter.js            # Main client module (injected into Squarespace)
│   └── filter.css           # Filter UI + card styles (injected into Squarespace)
├── scripts/
│   └── validate-schema.js   # One-time dev utility: validates Airtable shape
├── .env.example             # Template for required env vars
├── vercel.json              # Vercel routing config
├── PLAN.md
├── SOW-phase1.md
└── README.md
```

---

## Prerequisites (Client provides)

- [ ] Airtable API key (Personal Access Token, read-only scope is sufficient)
- [ ] Airtable Base ID
- [ ] Airtable Table name/ID containing listings
- [ ] Vercel project created and linked to this repo (or we create together)
- [ ] Squarespace site access (to inject code)

---

## Phase 1 Steps

### Step 1 — Schema Review (~30 min)
**Goal:** Understand the Airtable data shape before writing anything.

- List all field names and types in the listings table
- Identify: which fields should drive filters (multi-select, single-select, linked records)
- Identify: which fields display on the card (title, image, location, price tier, etc.)
- Identify: the "slug" or URL field that links to the full listing page
- Identify: a "featured" or sort-priority field if one exists
- Agree on the normalized JSON shape for `/api/listings`

**Output:** Annotated field map → defines the API response schema and filter config.

---

### Step 2 — Vercel API Function (`/api/listings`) (~1 hr)
**Goal:** A single endpoint that returns all listings as clean JSON.

```
GET /api/listings
→ 200 { listings: [...], meta: { total, generated_at } }
```

**Implementation details:**
- Use Airtable REST API (`https://api.airtable.com/v0/{baseId}/{tableId}`)
- Paginate automatically (Airtable returns 100 records/page with `offset` cursor)
- Normalize field names to camelCase slugs (e.g. `"Price Tier"` → `price_tier`)
- Cache response in-memory with 15-min TTL (simple module-level variable + timestamp check); upgrade to Vercel KV if needed
- Return CORS headers so the Squarespace domain can fetch it
- Airtable API key stored in Vercel environment variable (`AIRTABLE_API_KEY`)

**Environment variables:**
```
AIRTABLE_API_KEY=
AIRTABLE_BASE_ID=
AIRTABLE_TABLE_ID=
ALLOWED_ORIGIN=https://www.homestudiolist.com
```

**Testing:** Hit the function URL directly in the browser; confirm JSON shape matches schema from Step 1.

---

### Step 3 — Client Filter Module (`client/filter.js`) (~2–3 hr)
**Goal:** Injected script that fetches data, builds filter UI, renders cards, handles interaction.

**Sub-tasks:**

#### 3a. Data fetch
```js
// On DOMContentLoaded:
const data = await fetch('https://[vercel-project].vercel.app/api/listings').then(r => r.json())
```
- Show loading state in the container while fetching
- Cache response in sessionStorage so browser back-navigation is instant

#### 3b. Filter UI construction
- Read config from a `window.filterConfig` object (set in Squarespace header injection) — defines which fields are filterable and their display labels
- For each filterable field: collect all unique values across listings, sort alphabetically, render as `<select>` or checkbox group
- "Featured first" sort toggle (if a featured field exists)

```js
// Example config injected in Squarespace header:
window.filterConfig = {
  filterFields: ['category', 'city', 'price_tier', 'tags'],
  sortField: 'featured',
  cardUrlField: 'slug',
};
```

#### 3c. Card rendering
- For each listing: render an HTML card into `#hsl-listings-root`
- Card template defined in JS (or optionally read from a `<template>` element in the Squarespace page)
- Fields displayed on card determined by data shape from Step 1

#### 3d. Filtering logic
```js
function applyFilters(listings, activeFilters) {
  return listings.filter(listing =>
    Object.entries(activeFilters).every(([field, value]) =>
      !value || [listing[field]].flat().includes(value)
    )
  );
}
```
- Re-render cards on every filter interaction
- Update URL query params to reflect active filters (`?city=Oakland&category=recording`)

#### 3e. URL state restore
- On load, read query params and pre-select matching filter values before first render

---

### Step 4 — Squarespace Integration (~1 hr)
**Goal:** Get the script and styles live on homestudiolist.com/listing.

**Steps:**
1. Host `filter.js` and `filter.css` via Vercel (add static file routes to `vercel.json`)
2. In Squarespace → Pages → /listing → Page Header Injection:
   ```html
   <link rel="stylesheet" href="https://[project].vercel.app/client/filter.css">
   <script>
   window.filterConfig = { /* agreed config from Step 3b */ };
   </script>
   ```
3. In Squarespace → Pages → /listing → Page Footer Injection:
   ```html
   <div id="hsl-listings-root"></div>
   <script src="https://[project].vercel.app/client/filter.js" defer></script>
   ```
4. Hide or remove the existing Universal Filter script injection
5. Verify on staging before removing old script

---

### Step 5 — QA & Polish (~1 hr)
**Checklist:**
- [ ] All filter fields populated correctly
- [ ] Filtering narrows results accurately (spot-check 5–10 listings)
- [ ] URL updates on filter change; filter state restores on page reload
- [ ] Mobile layout looks reasonable
- [ ] No console errors
- [ ] Load time under 3 seconds (measure with DevTools Network tab)
- [ ] Old Universal Filter script fully removed

---

### Step 6 — Handoff
- Commit all code to `main` branch
- Write `README.md` with: setup instructions, env vars, how to add a new filter field
- Send invoice

---

## Decisions Deferred to Schema Review (Step 1)

These can't be finalized until we see the Airtable data:
- Exact card template (fields + layout)
- Whether "tags" is a multi-select field (affects filter logic slightly)
- Whether there's a single image field or multiple
- Whether listings link to Squarespace URLs or external URLs
- Whether a "featured" sort exists

---

## If Scope Grows (Future SOW territory)

- Full-text search → Algolia integration
- Automatic Airtable → index sync on record update (Airtable webhook → Vercel revalidation)
- Analytics on filter usage
- "Save search" / email alerts
- Map view
