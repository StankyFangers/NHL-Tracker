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
