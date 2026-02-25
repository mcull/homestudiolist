/**
 * GET /api/listings
 *
 * Returns a filter index of all active Home Studio List listings.
 * Fetches from Airtable, normalizes field names, and caches in-memory for 15 minutes.
 */

const AIRTABLE_API_URL = 'https://api.airtable.com/v0';
const CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes

// In-memory cache (persists across warm invocations of the same function instance)
let cache = { data: null, expiresAt: 0 };

// ---------------------------------------------------------------------------
// Field normalization
// ---------------------------------------------------------------------------

/**
 * Parses the compound "Web Filter Location" field into structured parts.
 *
 * Example input: "California, California (Southern), Curator Edit: Holiday 2025, Featured"
 * Example output: {
 *   state: "California",
 *   subregion: "California (Southern)",
 *   featured: true,
 *   curator_edits: ["Holiday 2025"]
 * }
 */
function parseLocation(raw) {
  if (!raw) return { state: null, subregion: null, featured: false, curator_edits: [] };

  const tokens = raw.split(',').map(t => t.trim()).filter(Boolean);
  let state = null;
  let subregion = null;
  let featured = false;
  const curator_edits = [];

  for (const token of tokens) {
    if (token === 'Featured') {
      featured = true;
    } else if (token.startsWith('Curator Edit: ')) {
      curator_edits.push(token.replace('Curator Edit: ', '').trim());
    } else if (/\(.+\)/.test(token)) {
      // Matches patterns like "California (Southern)"
      subregion = token;
    } else if (!state) {
      state = token;
    }
  }

  return { state, subregion, featured, curator_edits };
}

/**
 * Splits a comma-separated multi-value string into a clean array.
 * Handles trailing commas and extra whitespace.
 */
function splitCSV(raw) {
  if (!raw) return [];
  return raw.split(',').map(s => s.trim()).filter(Boolean);
}

/**
 * Normalizes a single Airtable record into a clean listing object.
 */
function normalizeRecord(record) {
  const f = record.fields;

  const { state, subregion, featured, curator_edits } = parseLocation(f['Web Filter Location']);

  return {
    id: parseInt(f['ListingID'], 10) || null,
    title: f['Listing Title'] || f['Listing'] || null,
    city: f['City'] || null,
    state: f['State'] || state,
    subregion,
    featured,
    curator_edits,
    price: f['Listing Price'] || null,
    price_tier: f['Web Filter Price'] || null,
    min_hours: parseFloat(f['Minimum Rental Duration']) || null,
    light_rating: f['Light rating'] || null,
    boudoir_friendly: f['Web Filter Boudoir Friendly'] === 'Yes',
    parking: f['Web Filter Parking'] || null,
    max_team_size: f['Web Filter Max Team Size'] ? parseInt(f['Web Filter Max Team Size'], 10) : null,
    rooms: splitCSV(f['Web Filter Rooms']),
    pets: splitCSV(f['Web Filter Pets']),
    availability: splitCSV(f['Availability']),
  };
}

// ---------------------------------------------------------------------------
// Airtable fetcher (handles pagination)
// ---------------------------------------------------------------------------

async function fetchAllListings() {
  const baseId = process.env.AIRTABLE_BASE_ID;
  const tableId = process.env.AIRTABLE_TABLE_ID;
  const apiKey = process.env.AIRTABLE_API_KEY;

  if (!baseId || !tableId || !apiKey) {
    throw new Error('Missing required environment variables: AIRTABLE_BASE_ID, AIRTABLE_TABLE_ID, AIRTABLE_API_KEY');
  }

  const fields = [
    'ListingID', 'Listing', 'Listing Title', 'Status',
    'City', 'State',
    'Listing Price', 'Minimum Rental Duration',
    'Light rating', 'Availability',
    'Web Filter Location', 'Web Filter Rooms', 'Web Filter Price',
    'Web Filter Boudoir Friendly', 'Web Filter Pets',
    'Web Filter Parking', 'Web Filter Max Team Size',
  ];

  const fieldParams = fields.map(f => `fields[]=${encodeURIComponent(f)}`).join('&');
  const formula = encodeURIComponent('AND({Status}="Active",{ListingID}!="")');

  const records = [];
  let offset = null;

  do {
    const offsetParam = offset ? `&offset=${offset}` : '';
    const url = `${AIRTABLE_API_URL}/${baseId}/${tableId}?filterByFormula=${formula}&${fieldParams}${offsetParam}`;

    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Airtable API error ${res.status}: ${text}`);
    }

    const json = await res.json();
    records.push(...json.records);
    offset = json.offset || null;
  } while (offset);

  return records;
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

export default async function handler(req, res) {
  const allowedOrigin = process.env.ALLOWED_ORIGIN || '*';

  res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const now = Date.now();

    if (!cache.data || now > cache.expiresAt) {
      const records = await fetchAllListings();
      const listings = records
        .map(normalizeRecord)
        .filter(l => l.id !== null);

      cache = {
        data: { listings, meta: { total: listings.length, generated_at: new Date().toISOString() } },
        expiresAt: now + CACHE_TTL_MS,
      };
    }

    res.setHeader('Cache-Control', 'public, s-maxage=900, stale-while-revalidate=60');
    return res.status(200).json(cache.data);
  } catch (err) {
    console.error('Error fetching listings:', err);
    return res.status(500).json({ error: err.message });
  }
}
