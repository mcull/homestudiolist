# Implementation Plan — Home Studio List Filter (Phase 1)

## Project Structure

```
homestudiolist/
├── api/
│   └── listings.js          # Vercel serverless function
├── client/
│   ├── filter.js            # Main client module (injected into Squarespace)
│   └── filter.css           # Filter UI styles (injected into Squarespace)
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
- [ ] Airtable Table name/ID for the Listings table
- [ ] Vercel project created and linked to this repo
- [ ] Squarespace site access (to inject code)

---

## Confirmed Schema (from Airtable CSV export)

**1,505 active listings** (`Status = "Active"`).

### Filter fields (all purpose-built `Web Filter *` columns)

| Airtable Field | API key | Type | Notes |
|---|---|---|---|
| `Web Filter Location` | parsed → `state`, `subregion`, `featured`, `curator_edits` | Compound text | Comma-separated, encodes multiple dimensions — parse in API |
| `Web Filter Rooms` | `rooms` | CSV multi-select | e.g. `Bedroom, Living, Kitchen` |
| `Web Filter Price` | `price_tier` | 4-value enum | `Under $100` / `$100-200` / `$200-300` / `$300+` |
| `Web Filter Boudoir Friendly` | `boudoir_friendly` | Flag (Yes / empty) | Non-boudoir listings have empty value |
| `Web Filter Pets` | `pets` | CSV multi-select | Has trailing-comma noise — normalize in API |
| `Web Filter Parking` | `parking` | 2-value enum | `Free parking on premises` / `Street parking` |
| `Web Filter Max Team Size` | `max_team_size` | Integer | 5–40 |
| `Light rating` | `light_rating` | A/B/C | Natural light quality |
| `Availability` | `availability` | CSV multi-select | Weekday/Weekend × Daytime/Evening |

### `Web Filter Location` parsing logic
A typical raw value: `California, California (Southern), Curator Edit: Holiday 2025, Featured`

Parse rules (split on `", "`):
- First token with no parens, not "Featured", not starting with "Curator Edit:" → `state`
- Token matching `X (Y)` pattern → `subregion`
- Token == `"Featured"` → `featured: true`
- Token starting with `"Curator Edit: "` → append to `curator_edits[]`

### Display fields (for filter index)
| Airtable Field | API key | Notes |
|---|---|---|
| `ListingID` | `id` | Numeric — also the URL path segment (`/listing/4632`) |
| `Listing Title` | `title` | Display name |
| `City` / `State` | `city`, `state` | For display |
| `Listing Price` | `price` | Raw dollar value |
| `Minimum Rental Duration` | `min_hours` | Numeric (1.0, 2.0, etc.) |

### Image situation & rendering strategy
Only 31/1,505 active listings have `Site Images` populated, and those are Dropbox folder links — not usable as `<img>` src. Card images live in Squarespace, not Airtable.

**Rendering strategy: Hybrid (DOM match + filter index)**
- Squarespace continues to render listing cards (keeps images, keeps SEO, keeps existing layout)
- Our script fetches a lightweight filter index from Vercel (IDs + filter attributes only)
- Script matches each Airtable record to an existing DOM card element by `ListingID` extracted from the card's href (e.g. `/listing/4632`) — 100% reliable, no heuristics
- Filter applies CSS classes and shows/hides matched elements — zero re-render, instant response

---

## Phase 1 Steps

### Step 1 — Schema Review ✅ COMPLETE
Confirmed from Airtable CSV export. See schema above.

---

### Step 2 — Vercel API Function (`/api/listings`) (~1 hr)
**Goal:** A single endpoint that returns a filter index as clean JSON.

```
GET /api/listings
→ 200 { listings: [...], meta: { total, generated_at } }
```

**Each listing object shape:**
```json
{
  "id": 4632,
  "title": "Modern Paris",
  "city": "New York",
  "state": "New York",
  "subregion": null,
  "featured": false,
  "curator_edits": [],
  "price": "$250",
  "price_tier": "$200-300",
  "min_hours": 2.0,
  "light_rating": "A",
  "boudoir_friendly": true,
  "parking": "Street parking",
  "max_team_size": null,
  "rooms": ["Bedroom", "Living", "Kitchen"],
  "pets": ["No animals"],
  "availability": ["Weekday Daytime", "Weekend Daytime"]
}
```

**Implementation details:**
- Use Airtable REST API (`https://api.airtable.com/v0/{baseId}/{tableId}`)
- Filter server-side: `filterByFormula=AND({Status}="Active")`
- Paginate automatically (Airtable returns 100 records/page with `offset` cursor)
- Parse `Web Filter Location` per rules above
- Split CSV fields (Rooms, Pets, Availability) into arrays; trim trailing commas/spaces
- Cache response in-memory with 15-min TTL (module-level variable + timestamp check)
- Return CORS headers allowing `https://www.homestudiolist.com`

**Environment variables:**
```
AIRTABLE_API_KEY=
AIRTABLE_BASE_ID=
AIRTABLE_TABLE_ID=
ALLOWED_ORIGIN=https://www.homestudiolist.com
```

**Testing:** Hit the function URL in the browser; confirm JSON shape and record count (~1,505).

---

### Step 3 — Client Filter Module (`client/filter.js`) (~2 hr)
**Goal:** Injected script that fetches filter index, matches DOM, builds filter UI, handles interaction.

#### 3a. Data fetch + DOM match
```js
// On DOMContentLoaded:
const { listings } = await fetch(VERCEL_API_URL).then(r => r.json())

// Index DOM cards by listing ID (extracted from href)
const cardMap = {}
document.querySelectorAll('a[href*="/listing/"]').forEach(el => {
  const id = parseInt(el.href.match(/\/listing\/(\d+)/)?.[1])
  if (id) cardMap[id] = el.closest('.card-selector') // adjust selector to match Squarespace markup
})

// Attach filter data to each card as dataset attributes
listings.forEach(listing => {
  const card = cardMap[listing.id]
  if (card) card.dataset.filterData = JSON.stringify(listing)
})
```
- Show loading indicator until fetch + match complete
- Cache response in sessionStorage (instant back-navigation)

#### 3b. Filter UI construction
Filter config defined in `window.HSL_FILTER_CONFIG` (set in Squarespace header injection):
```js
window.HSL_FILTER_CONFIG = {
  apiUrl: 'https://[project].vercel.app/api/listings',
  filters: [
    { key: 'state', label: 'Location', type: 'select' },
    { key: 'price_tier', label: 'Price', type: 'select' },
    { key: 'rooms', label: 'Rooms', type: 'multiselect' },
    { key: 'availability', label: 'Availability', type: 'multiselect' },
    { key: 'light_rating', label: 'Natural Light', type: 'select' },
    { key: 'boudoir_friendly', label: 'Boudoir Friendly', type: 'toggle' },
    { key: 'parking', label: 'Parking', type: 'select' },
    { key: 'pets', label: 'Pets on Property', type: 'multiselect' },
    { key: 'max_team_size', label: 'Team Size (min)', type: 'number' },
  ]
}
```
- Build filter UI from config; populate option values from actual dataset (no hardcoding)
- Insert filter UI above the existing Squarespace listing grid

#### 3c. Filtering logic
```js
function applyFilters(listings, activeFilters, cardMap) {
  const passing = new Set(
    listings
      .filter(listing => matchesAllFilters(listing, activeFilters))
      .map(l => l.id)
  )
  Object.entries(cardMap).forEach(([id, el]) => {
    el.style.display = passing.has(parseInt(id)) ? '' : 'none'
  })
  // Update result count display
}
```
- Re-run on every filter interaction (instant — no network call)
- `featured` listings sort to top when no other sort is active

#### 3d. URL state
- On filter change: update `?state=California&price_tier=%24100-200` in URL (no page reload)
- On load: read query params → pre-select filters → apply before first paint

---

### Step 4 — Squarespace Integration (~1 hr)
**Goal:** Get filter live on homestudiolist.com/listing.

1. Deploy Vercel function; confirm `/api/listings` returns correct data
2. Identify correct CSS selector for listing cards in Squarespace markup (inspect live page)
3. In Squarespace → /listing page → Header Code Injection:
   ```html
   <link rel="stylesheet" href="https://[project].vercel.app/client/filter.css">
   <script>
   window.HSL_FILTER_CONFIG = { /* config from 3b */ };
   </script>
   ```
4. Footer Code Injection:
   ```html
   <script src="https://[project].vercel.app/client/filter.js" defer></script>
   ```
5. Disable/remove existing Universal Filter script injection
6. Verify on a test device before removing old script

---

### Step 5 — QA & Polish (~1 hr)

- [ ] ~1,505 cards matched (check console for unmatched IDs)
- [ ] All filter dropdowns populated with correct options
- [ ] Filtering shows/hides cards accurately (spot-check 10 listings)
- [ ] Featured listings sort to top with no active filters
- [ ] URL updates on filter change; state restores on reload
- [ ] Mobile layout reasonable
- [ ] No console errors
- [ ] Load time under 3 seconds (Network tab — single API call)
- [ ] Old Universal Filter script fully removed

---

### Step 6 — Handoff
- Commit all code to `main`
- Write `README.md`: setup, env vars, how to add/remove a filter field, how to deploy
- Send invoice

---

## If Scope Grows (Future SOW territory)

- Curator Edit collections as a filter dimension
- Sub-region filter (California Northern/Southern)
- Full-text search → Algolia integration
- Airtable webhook → Vercel cache invalidation (near-realtime updates)
- Analytics on filter usage
- Map view
