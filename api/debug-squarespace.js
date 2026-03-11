/**
 * GET /api/debug-squarespace
 *
 * Temporary debug endpoint — fetches one page from the Squarespace JSON API
 * and returns the raw response so we can inspect its shape and pagination.
 * Remove this file once images are working correctly.
 */

export default async function handler(req, res) {
  const siteUrl = (process.env.SQUARESPACE_SITE_URL || 'https://www.homestudiolist.com').replace(/\/$/, '');
  const url = `${siteUrl}/listing?format=json`;

  try {
    const sqRes = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
    });

    const text = await sqRes.text();
    let parsed = null;
    try { parsed = JSON.parse(text); } catch (_) {}

    return res.status(200).json({
      fetchUrl: url,
      status: sqRes.status,
      contentType: sqRes.headers.get('content-type'),
      isJson: parsed !== null,
      itemCount: parsed?.items?.length ?? null,
      firstItemKeys: parsed?.items?.[0] ? Object.keys(parsed.items[0]) : null,
      firstItemUrlId: parsed?.items?.[0]?.urlId ?? null,
      firstItemAssetUrl: parsed?.items?.[0]?.assetUrl ?? null,
      pagination: parsed?.pagination ?? null,
      rawPreview: parsed === null ? text.slice(0, 500) : null,
    });
  } catch (err) {
    return res.status(200).json({ error: err.message, fetchUrl: url });
  }
}
