# NHL Tracker 1.7.6 — release scope (locked 2026-10-19)

## Primary release objective

Two strictly separated cloud-backed account experiences:

1. **TEST** (`npm run dev`): developer/test account; test wagers synchronize to the development cloud, survive restart/login, and never enter LIVE history.
2. **LIVE** (installed app): users can self-register, sign in, save their own wagers to the cloud, and restore them on another device or after reinstall. Each user sees only their own wagers. Developer privileges are a role, not a shared wager account.

## Must-pass release acceptance criteria

- TEST: register/login, save a wager, restart/relogin, recover the same wager; concurrent update/conflict and offline failure cannot silently erase wagers.
- LIVE: self-registration for ordinary invited/approved friends (not only the initial `stankyfangers` allowlist), login/logout/session expiry, save/edit/delete and restore cloud wagers per account.
- TEST and LIVE have distinct credentials, data stores, and tokens; production desktop cannot access DEV wager endpoints; dev desktop cannot access LIVE endpoints.
- Existing LIVE local wagers: backup first, explicit import preview, stable IDs, duplicate detection, conflict review, idempotent migration; no automatic overwrite, silent replacement, or unapproved migration.
- Account switching: never display prior user's local or cloud wagers in another account; no cross-account storage leakage.
- Preserve unit-size-at-placement, wager odds/payouts, historical dates, grading and void audit across cloud round trips.
- No false 'saved' indicator until the server confirms persistence. Clearly handle disconnected/offline state.
- Security gates reviewed and intentionally enabled only after migration and account-isolation tests. Do not place server secrets in Electron.

## Current verified implementation boundaries

- `src/main/index.ts`: TEST dev-account and dev-bets transport; LIVE account transport; LIVE wager **GET only**, mutation methods deliberately blocked.
- `src/preload/index.ts`: exposes TEST and LIVE IPC methods.
- `src/renderer/src/App.tsx`: TEST account and bet sync UI; LIVE still says 'LOCAL WAGERS · CLOUD LOGIN NOT YET ENABLED'.
- `vercel-api/api/live-account.js`: LIVE registration gated to one username (`stankyfangers`) and invitation secret; **friends cannot register yet**.
- `vercel-api/api/live-wagers.js`: cloud write endpoints exist but require separate server approval gate.
- LIVE cloud account and wager flows have not been end-to-end tested.

## Deferred beyond 1.7.6

Confidence optimizer enhancements, trio-versus-pairs improvements, and unrelated feature polish. Existing features must remain functional, but should not block cloud account scope unless they cause regressions.

## Safe implementation order

1. TEST sync regression tests and cloud restoration verification.
2. LIVE account UI/session integration with **read-only** cloud wager inspection, no local wager replacement.
3. Secure friend registration design and account isolation tests.
4. Cloud write and conflict-safe synchronization behind explicit approvals; backups and migration previews first.
5. End-to-end multi-account testing, Windows installer smoke test, release approval.

**No production activation, database migration, user registration, or LIVE write enablement is authorized by this plan alone.**
