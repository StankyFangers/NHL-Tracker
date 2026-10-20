# LIVE Neon connection and activation checklist

## Canonical infrastructure — reuse, do not duplicate

The existing Neon `NHL-Tracker` project and its `production` / `development` branches are canonical. Production already has `neondb` and these tables: `nhl_live_accounts`, `nhl_live_import_batches`, `nhl_live_login_limits`, `nhl_live_sessions`, and `nhl_live_wagers`. Do not create another database, duplicate these tables, or apply a new schema migration.

The existing production schema includes additional `created_at` columns and an import-batch table. Inspect the real schema; do not use a generated migration as a source of truth.

## Roles

- `nhl_tracker_live_api` was inspected and has excessive privileges, including CREATEDB, CREATEROLE, BYPASSRLS, and wager INSERT/UPDATE/DELETE. Do not use it for the application.
- `nhl_tracker_live_restricted` was inspected and has no elevated role flags, public schema USAGE but no CREATE, and no wager INSERT/UPDATE/DELETE grants. This is the intended authentication-only application role, subject to final inherited-grant and connection testing.

## Runtime configuration

The LIVE connection guard has been simplified to use the existing `NHL_LIVE_DATABASE_URL` plus fixed, source-controlled pins for the confirmed production host, database (`neondb`), and role (`nhl_tracker_live_restricted`). Do not add the redundant `NHL_LIVE_APPROVED_HOST`, `NHL_LIVE_APPROVED_DATABASE`, `NHL_LIVE_APPROVED_ROLE`, or `NHL_LIVE_PROVISIONING_VERIFIED` environment variables.

Keep the activation controls separate and disabled until explicitly approved:
- `NHL_LIVE_CLOUD_ENABLED=YES_PRODUCTION_APPROVED` enables LIVE account API access.
- `NHL_LIVE_SIGNUP_ENABLED=YES_LIVE_SIGNUP_APPROVED` enables public registration.
- `NHL_LIVE_WAGER_WRITES_ENABLED` must remain unset for authentication-only testing.

The production connection string must contain a working password for `nhl_tracker_live_restricted`, and must use verified TLS. Never paste credentials into chat, issues, documentation, or Git.

## Safe next steps

1. Set a password for the existing restricted role through Neon role management or an approved secure database credential workflow. Do not create a replacement role.
2. Update the existing Vercel `NHL_LIVE_DATABASE_URL` in Production with that role's complete connection string.
3. Redeploy only after the code and environment values are aligned; verify a connection without enabling account activation.
4. Confirm a recent backup/restore plan and effective grants/inherited privileges.
5. Only after explicit approval, enable account API and signup gates for an authentication-only test. Keep wager writes disabled.
6. Test registration, duplicate username/email, login, logout, session expiry, and account isolation. Register `StankyFangers` as `USER`; DEV promotion is a separate reviewed operation.
7. Do not migrate local historical wagers until a full backup, import preview, duplicate checks, and ownership verification are complete.

## Read-only schema preflight

`vercel-api/migrations/002_live_preflight_readonly.sql` contains read-only queries for the connected database identity, existing columns, constraints, and table grants. It does not change data or permissions. Only run it after confirming the SQL editor is connected to the intended production branch. Do not share connection strings or passwords.

## Test

Run `node --test tests/live-schema-contract.test.cjs` in the development checkout. This is an offline source-contract test; it does not connect to Neon or prove the deployed Vercel environment is configured correctly.

## Current status

- Existing production schema and role grants inspected.
- Connection code pins the existing production endpoint/database/restricted role without redundant approval variables.
- Authentication, signup, and wager writes remain separately gated.
- No production migration, account registration, or wager migration has been performed by these source changes.
