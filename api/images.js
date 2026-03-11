/**
 * GET /api/images?ids=1,2,3,...
 *
 * Returns Squarespace image URLs for up to 50 listing IDs, fetched in parallel.
 * Cached in-memory for 1 hour and at the edge for 1 hour (stale-while-revalidate=24h).
 */

const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour
const imageCache = {}; // cacheKey → { data, expiresAt }

const ALLOWED_ORIGINS = [
  process.env.ALLOWED_ORIGIN,
  'https://homestudiolist.com',
  'https://www.homestudiolist.com',
].filter(Boolean);

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const raw = req.query.ids || '';
  const ids = raw.split(',')
    .map(s => parseInt(s.trim(), 10))
    .filter(id => id > 0)
    .slice(0, 50);

  if (!ids.length) {
    return res.status(400).json({ error: 'Provide ?ids= as comma-separated listing IDs' });
  }

  const cacheKey = [...ids].sort((a, b) => a - b).join(',');
  const now = Date.now();

  if (imageCache[cacheKey] && now < imageCache[cacheKey].expiresAt) {
    res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');
    return res.status(200).json(imageCache[cacheKey].data);
  }

  const siteUrl = (process.env.SQUARESPACE_SITE_URL || 'https://www.homestudiolist.com').replace(/\/$/, '');

  const results = await Promise.all(
    ids.map(async id => {
      try {
        const sqRes = await fetch(`${siteUrl}/listing/${id}?format=json`, {
          headers: { 'User-Agent': 'Mozilla/5.0' },
        });
        if (!sqRes.ok) return [id, null];
        const data = await sqRes.json();
        // Individual post pages may return the item directly or wrapped in {item:{}}
        const item = data.item || data;
        return [id, item.assetUrl || null];
      } catch {
        return [id, null];
      }
    })
  );

  const images = Object.fromEntries(results.filter(([, url]) => url !== null));
  const data = { images };

  imageCache[cacheKey] = { data, expiresAt: now + CACHE_TTL_MS };

  res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');
  return res.status(200).json(data);
}
