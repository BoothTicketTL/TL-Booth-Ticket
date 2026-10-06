# Thai League 2026/27 Booth & Ticket Registration — Vercel Google Sheets Fix

This version keeps the existing app and fixes the live Google Sheets fixture sync.

## Official fixture sources
- League 1 + League 2: spreadsheet `1qHdscqV7j2GB8UoF9c59UvV1Tw_eQqBV6nfJMn64Pfw`
  - League 1: `T1-(THA)`
  - League 2: `T2-(THA)`
- League 3: spreadsheet `1ixW80nSPE5rZCsdUwZlapeJ4NhOzyS03rj_W1_4vu7c`
  - `NORTH`, `NORTHEAST`, `EAST`, `CENTRAL`, `WEST`, `SOUTH`

## What was fixed
- Added real Vercel serverless endpoints under `api/sheets/`.
- Exact tab-name fetching now uses Google Visualization directly; it no longer depends on brittle Google HTML/GID scraping.
- Added known official tab mappings for the two fixture spreadsheets.
- Kept CSV/GID fallbacks for compatibility.
- Made fixture header detection more tolerant of merged Google Sheets headers.
- Updated the default League 3 URL to the current link supplied by the owner.

## Deploy
1. Replace the existing Vercel project source with this package (preferably via the same GitHub repository).
2. Keep the existing Vercel Environment Variables and Firebase settings unchanged.
3. Deploy.
4. Open the site and use Google Sheets > Sync fixtures.

Do not delete the existing Vercel project before the new deployment is verified.
