# NHL Tracker 1.7.6 — release scope (locked 2026-10-19)

## Primary release objective

Two strictly separated cloud-backed account experiences:

1. **TEST** (`npm run dev`): **already working and cloud-synced**, per user verification. Existing `StankyFangersTEST` account restores previously placed TEST wagers. Preserve this behavior; regression-check it, but do not rebuild or migrate it.
2. **LIVE** (installed app): users can self-register, sign in, save their own wagers to the cloud, and restore them on another device or after reinstall. Each user sees only their own wagers. Developer privileges are a role, not a shared wager account.

## Owner account identities (locked)

- **TEST username:** `StankyFangersTEST` — used with `npm run dev`, stored in the development cloud.
- **LIVE username:** `StankyFangers` — used with the installed application, stored in the production cloud.
- These are **different account identities**, not merely two modes of the same account. Credentials, tokens, roles, and wager histories remain isolated. LIVE developer/admin privileges do not confer TEST account identity.
- Display casing is preserved in the UI where appropriate; server-side normalized login lookup may use lowercase.

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
- `vercel-api/api/live-account.js`: LIVE registration accepts any valid username with a correct invitation code once the explicit LIVE signup gate is enabled; accounts are created with USER role. This source change is not deployed.
- `vercel-api/api/live-wagers.js`: cloud write endpoints exist but require separate server approval gate.
- LIVE cloud account and wager flows have not been end-to-end tested.

## Deferred beyond 1.7.6

Confidence optimizer enhancements, trio-versus-pairs improvements, and unrelated feature polish. Existing features must remain functional, but should not block cloud account scope unless they cause regressions.

## Safe implementation order

1. Preserve the already-working TEST sync; run a focused regression check without changing its data.
2. LIVE account UI/session integration with **read-only** cloud wager inspection, no local wager replacement.
3. Replace the existing special-case LIVE username registration allowlist with a normal USER signup flow (subject to intentional registration controls), then test account isolation. Register `StankyFangers` exactly like any other user; **do not assign DEV during registration**. After verified USER signup, promote only this account to DEV through a separate authorized Neon administration step; preserve its account ID and wager ownership.
4. Cloud write and conflict-safe synchronization behind explicit approvals; backups and migration previews first.
5. End-to-end multi-account testing, Windows installer smoke test, release approval.

**No production activation, database migration, user registration, or LIVE write enablement is authorized by this plan alone.**

## User-confirmed progress (2026-10-19)

- `StankyFangersTEST` exists and successfully loads previously saved cloud TEST wagers. This is not an outstanding build feature.
- LIVE `StankyFangers` must be created through the exact same normal USER signup flow available to friends.
- Promote that LIVE account to DEV **after signup** through a separately approved Neon database administration operation; never hard-code the account's role during registration.

## Implementation finding — 2026-10-19

- The renderer's top-level LIVE login currently refuses non-`stankyfangers` users even after valid authentication. This **must be replaced with account-scoped cloud workspaces** before friends can use LIVE.
- The LIVE `TrackerApp` still mounts legacy localStorage wagers for the accepted account. **Do not remove the username restriction alone**: doing so could expose local wager history across accounts. Build an isolated cloud wager state path and verify ownership before opening the app to other users.
- LIVE `live-wagers:request` Electron transport currently permits GET only. POST/PATCH/DELETE require conflict-safe client integration and separately authorized server activation.
