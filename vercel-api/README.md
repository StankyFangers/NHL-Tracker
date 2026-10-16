# NHL Tracker — Neon DEVELOPMENT read-only API

This is a **separate Vercel project** in the existing NHL-Tracker GitHub repository. It does not change or deploy the Electron app. The API is not yet connected to the Electron UI.

## Deployment (do not deploy until credentials are ready)

1. Commit and push the `vercel-api/` folder to your NHL-Tracker GitHub repository.
2. In Vercel, import the repository. Set **Root Directory** to `vercel-api` (not the repository root). Use **Other** framework preset; do not set a custom build command.
3. Configure server-side environment variables in Vercel:
   - `DATABASE_URL`: Neon **development** connection string only. Prefer a dedicated read-only database user; do **not** use production credentials.
   - `NHL_READ_TOKEN`: random secret at least 32 characters, stored only in Vercel and in a secure client-side credential store during later testing. Never commit it.
4. Deployment has a hard hostname lock for the previously verified DEVELOPMENT Neon endpoint `ep-twilight-term-b4fxjrkm` in AWS us-east-2. A production Neon URL will be rejected. It also requests read-only PostgreSQL transactions.
5. `GET /api/health` returns non-sensitive health information. `GET /api/summary` and `GET /api/bets?limit=25&offset=0` require header `Authorization: Bearer <NHL_READ_TOKEN>`.

**Security note:** This token is a temporary single-user administrative testing credential, **not** multi-user authentication. Do not distribute it or embed it in a shipped Electron executable. Before enabling access for friends or multi-computer accounts, implement proper per-user authentication and authorization. The API intentionally only reads the `stankyfangers` historical records, and it has no write endpoints.

The database role should have SELECT-only grants on the required tables. A PostgreSQL `default_transaction_read_only` setting is an additional safeguard, not a replacement for a read-only role.

## Expected reconciliation

506 bets, 1082 legs, 506 settlement events; $2015.50 staked, $2027.48 returned, +$11.98 net.
