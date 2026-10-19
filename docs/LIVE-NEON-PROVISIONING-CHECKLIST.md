# LIVE Neon provisioning — approval-gated checklist

This is a preparation checklist only. **Do not activate LIVE production flags, apply migrations to production, or import historical wagers without explicit approval.**

## Environment isolation

- Create a dedicated LIVE Neon database or isolated project, separate from the existing TEST/DEV database and its endpoint.
- Record the expected hostname, database name and least-privilege application role in the deployment secret manager; never commit credentials.
- Confirm the LIVE hostname does not match the blocked development endpoint.
- Use verified TLS, backups and a tested restoration procedure.

## Database objects to inspect before activation

The LIVE endpoints currently reference:

- `public.nhl_live_accounts`: `id`, `username`, `email`, `password_hash`, `role`. Enforce unique case-normalized username and email; public registration creates `USER` only.
- `public.nhl_live_sessions`: `token_hash`, `account_id`, `expires_at`. Session rows must be tied to the owning account.
- `public.nhl_live_login_limits`: `login_hash`, `attempts`, `locked_until`, `updated_at`. Login attempts must be rate-limited.
- `public.nhl_live_wagers`: inspect the exact columns, account foreign key, ownership indexes, unique constraints and optimistic-concurrency behavior against `api/live-wagers.js` before writing migration SQL.

Do not assume the existing schema is correct merely because the API builds. Compare the actual LIVE schema and its grants to every endpoint query.

## Authentication-only rollout

1. Confirm a recent backup, restoration plan, least-privilege grants and exact environment pins.
2. Run isolated registration, duplicate username/email, login, logout, expiry and cross-account access tests.
3. After separate approval, activate LIVE account and signup gates; **leave LIVE wager write gate disabled**.
4. Register `StankyFangers` initially as `USER`; role promotion is separate and must not alter wager ownership.
5. Do not migrate legacy local bets until a full owner backup and conflict-free comparison have been reviewed.

## Go/no-go

A successful Windows build proves packaging, **not** database provisioning. An activation-disabled registration response is expected until production is approved. No production connection strings should be pasted into GitHub issues, docs, or chat.

## Proposed schema artifact

`vercel-api/migrations/001_live_accounts.sql` is a **draft, unapplied** schema matching the current API's account, session, login-limit and wager queries. Its ownership boundary is the composite wager primary key `(account_id, wager_id)` and the account-scoped source identity constraint. It must be reviewed against actual Neon role grants and any pre-existing tables before execution. No migration has been executed, and this draft does not grant any role permissions or activate signup.

## Offline contract regression test

Run `node --test tests/live-schema-contract.test.cjs` in the development checkout to verify that the proposed SQL still matches key backend table names, account ownership constraints, public registration defaults and separate activation gates. This static test is not a database migration, does not connect to Neon, and cannot establish production role permissions or schema deployment. It has not yet been run in this chat.

## Read-only database preflight

`vercel-api/migrations/002_live_preflight_readonly.sql` contains read-only inspection queries for the connected database identity, required LIVE tables, column definitions, constraints and table grants. It is not a schema migration and does not change rows or permissions. **Do not run it until you have independently confirmed the connection is to the intended isolated LIVE Neon database.** Review the results before applying any migration or setting any activation flags. In particular, ensure the application role has no unnecessary DDL privileges and cannot reach DEV tables. Database identity and grant results may contain infrastructure details; redact them before sharing publicly.
