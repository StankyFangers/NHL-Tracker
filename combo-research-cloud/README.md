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

## Endpoints
- GET `/health` — health check
- GET `/research/status` — row counts and latest grading job
- GET `/research/combos?start=YYYY-MM-DD&end=YYYY-MM-DD&after=ID&limit=1000` — paginated public research rows
- POST `/research/combos` — bearer-token protected, idempotent snapshot import (existing rows are not replaced)
- POST `/research/grade` — bearer-token protected manual final grading

The scheduled Worker checks recorded game IDs and grades combos against NHL boxscores after the game is final. Ambiguous player matches stay UNVERIFIED.

## Deployment setup
Create a **new** Cloudflare D1 database, replace `database_id = "local"` with its actual database ID in `wrangler.toml`, apply `schema.sql` remotely, and set the `RESEARCH_INGEST_TOKEN` secret. Do **not** reuse the Telegram notification D1 database. Confirm migrations, access controls, and export backups before connecting production clients.

### Not yet automated
The cloud service currently **accepts snapshots and grades them**, but it does **not yet fetch Daily Faceoff forward lines / PP units and create those snapshots independently**. This is an intentional safeguard: constructing pregame combinations requires validated Daily Faceoff parsing and source scheduling. The desktop import only accepts the normalized research schema. The original standalone logger export may need a dedicated converter; it is not safe to assume arbitrary export formats match.

The 300u profile is deliberately excluded because its staking rules have not been calculated. Historical strategy results require archived pregame odds for **all** qualifying combos; hit/miss data alone cannot yield a valid backtest.
