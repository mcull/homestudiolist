## Follow-up: Missing image on one listing

One listing ("Coastal Chic") shows no image. Null results are already retried
on every filter/page change so it's not a cache issue.

### Diagnosis steps
1. Inspect the blank card in DevTools → find `data-listing-id="XXXX"` on the `<article>`
2. Hit `https://homestudiolist.vercel.app/api/images?ids=XXXX` — is the ID in the `images` object?
3. If not, hit `https://www.homestudiolist.com/listing/XXXX?format=json` directly
   and check whether `assetUrl` is present

### Possible root causes
- Listing genuinely has no cover image set in Squarespace
- Image is set as a thumbnail rather than a cover — in that case, add fallbacks
  in `api/images.js`: `item.assetUrl || item.mainImage?.assetUrl || null`
