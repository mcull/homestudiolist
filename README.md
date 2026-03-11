# Home Studio List — Filter System

Custom filter and listing system for homestudiolist.com. Replaces the Universal Filter third-party script with a lightweight, fast alternative backed by Airtable data.

---

## How It Works

1. A Vercel serverless function fetches all active listings from Airtable and returns them as a single JSON response (cached for 15 minutes).
2. A small JavaScript file injected into the Squarespace `/listing` page fetches that JSON, matches each listing to its existing card on the page, and builds the filter UI.
3. When a visitor uses the filters, cards are shown or hidden instantly — no additional network requests.

---

## Environment Variables

The Vercel function requires four environment variables. These are set in the Vercel dashboard under **Project Settings → Environment Variables**.

| Variable | Description |
|---|---|
| `AIRTABLE_API_KEY` | Your Airtable Personal Access Token |
| `AIRTABLE_BASE_ID` | The ID of the Airtable base containing listings |
| `AIRTABLE_TABLE_ID` | The ID of the Listings table within that base |
| `ALLOWED_ORIGIN` | The site domain allowed to call the API (e.g. `https://www.homestudiolist.com`) |

### Finding your Airtable IDs

Open your Airtable base and navigate to the Listings table. Look at the URL in your browser — it will look like this:

```
https://airtable.com/appXXXXXXXXXXXXXX/tblXXXXXXXXXXXXXX/...
```

- **Base ID** — the segment starting with `app` (e.g. `appXXXXXXXXXXXXXX`)
- **Table ID** — the segment starting with `tbl` (e.g. `tblXXXXXXXXXXXXXX`)

If you rename your Airtable base or move the Listings table to a new base, update `AIRTABLE_BASE_ID` and/or `AIRTABLE_TABLE_ID` in Vercel and redeploy.

### Creating an Airtable Personal Access Token

1. Log into Airtable
2. Click your avatar (top right) → **Developer Hub**
3. Go to **Personal access tokens** → **Create token**
4. Give it a name (e.g. "Home Studio List Filter — read only")
5. Add scope: `data.records:read`
6. Under "Access", select the Home Studio List base
7. Copy the token and save it as `AIRTABLE_API_KEY` in Vercel

Tokens are only shown once — if you lose it, create a new one and update the Vercel variable.

---

## Adding or Removing a Filter Field

Filter fields are driven by the `Web Filter *` columns in Airtable. To add a new filter:

1. Make sure the new field is populated in Airtable for active listings
2. Add the field to the `FIELD_MAP` in `api/listings.js` so it's included in the API response
3. Add a corresponding entry to `window.HSL_FILTER_CONFIG.filters` in the Squarespace header injection

To remove a filter, reverse those steps — remove it from the config and optionally from the field map.

---

## Deploying Changes

This project is connected to the `mcull/homestudiolist` GitHub repository. Any push to `main` triggers an automatic redeployment on Vercel.

To deploy a change:
1. Make and test your changes locally
2. Merge to `main`
3. Vercel will redeploy automatically within ~30 seconds

---

## Project Structure

```
homestudiolist/
├── api/
│   └── listings.js      # Vercel serverless function — fetches + normalizes Airtable data
├── client/
│   ├── filter.js        # Injected into Squarespace — builds filter UI, matches DOM
│   └── filter.css       # Styles for filter UI
├── .env.example         # Template showing required environment variables
├── vercel.json          # Vercel routing configuration
└── README.md            # This file
```
