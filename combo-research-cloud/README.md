# Combo Research Cloud — DEV preview

Separate Cloudflare Worker / D1 database for **shared research data only**. No private account wagers are sent here.

## Desktop preview
Pull `feature/combo-research-cloud-preview`, run `npm install` and `npm run dev`. In **Deep Bet Analytics → Combo Research**, use the **Collection Status** tab to load a normalized JSON file or connect this Worker. The screen launches even with no cloud service; no fabricated seed data is used.

## Run the development API locally
```sh
cd combo-research-cloud
npm install
npx wrangler d1 execute DB --local --file=./schema.sql
npm run dev
```
Set the research cloud URL in the app's Collection Status screen to the URL printed by Wrangler (typically `http://127.0.0.1:8787`).

For writes, set `RESEARCH_INGEST_TOKEN` with a Wrangler secret / local `.dev.vars` file. **Do not place it in the renderer or commit it.** Then import data via an authorized POST to `/research/combos` in batches of at most 500. Example request payload: `{"combos":[{"date":"2026-11-24","gameId":"2026020333","team":"PIT","players":["Player A","Player B"],"ppUnit":1,"forwardLine":1,"odds":150,"result":"UNVERIFIED","snapshotAt":"2026-11-24T23:00:00Z"}]}`. A successful import does not certify that the snapshot was truly pregame. Import only trustworthy historical exports.

## Import your existing November research history

You can import the **original Combo Logger 0.1.0 JSON** directly through the desktop's Collection Status tab. The dashboard extracts its existing `rows[].combo` / `rows[].result` / `rows[].context` objects; no manual normalization is required. For priced strategy simulations, load the **Settled Wagers XLSX** as a separate local-only price overlay after importing the logger export.

To migrate the same shared research history into the Worker database once D1 is configured, set `RESEARCH_INGEST_TOKEN` in your shell and run:

```sh
node scripts/import-logger.mjs "/path/to/combo-logger-export-2026-11-23.json" http://127.0.0.1:8787
```

Only the research data is sent to the Worker; the private settled XLSX is never uploaded. The script sends 250 rows per request with idempotent keys.

## Endpoints
- GET `/health` — health check
- GET `/research/status` — row counts and latest grading job
- GET `/research/combos?start=YYYY-MM-DD&end=YYYY-MM-DD&after=ID&limit=1000` — paginated public research rows
- POST `/research/combos` — bearer-token protected, idempotent snapshot import (existing rows are not replaced)
- POST `/research/grade` — bearer-token protected manual final grading
- POST `/research/collect` — bearer-token protected manual pregame collector tick
- GET `/research/status` — includes recent pregame capture status and source failures

The scheduled Worker checks the NHL schedule, refreshes Daily Faceoff forward-line and PP overlaps on the Telegram monitor’s pregame cadence from 10 AM Eastern (hourly within nine hours, every 30 minutes within seven hours, every 15 minutes within four hours, every five minutes within one hour, every minute within 15 minutes), then grades recorded combos against NHL boxscores after final. Ambiguous player matches stay UNVERIFIED. Source errors and lineup status are retained in the capture-status table.

## Deployment setup
Create a **new** Cloudflare D1 database, replace `database_id = "local"` with its actual database ID in `wrangler.toml`, apply `schema.sql` remotely, and set the `RESEARCH_INGEST_TOKEN` secret. Do **not** reuse the Telegram notification D1 database. Confirm migrations, access controls, and export backups before connecting production clients.

### Not yet automated
The collector now generates pregame pairs/trios from the intersection of each forward line and each PP unit, following the existing Telegram parser approach. Its live scraping must be compared against the standalone logger on real slates before retiring the logger, because source HTML, time windows, and confirmation status can change. The collector does **not yet collect sportsbook odds**: hit-rate research works from lineups and final boxscores, but strategy P/L requires priced records. The desktop supports a **private, local-only XLSX odds overlay** from the settled export. Do not imply unpriced shared combos have valid financial returns. Native Combo Logger 0.1.0 exports are supported in the desktop import.

The full 300u–600u strategy set is included. Historical financial comparisons require archived pregame odds for the eligible combos; hit/miss data alone cannot yield a valid backtest.
