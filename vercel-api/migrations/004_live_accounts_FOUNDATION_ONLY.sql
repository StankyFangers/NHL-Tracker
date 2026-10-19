-- PHASE 2A FOUNDATION ONLY. Do not run on DEVELOPMENT or until production
-- backup, endpoint identity and least-privilege roles have been verified.
-- Run manually as production database owner. No data migration in this file.
BEGIN;
CREATE TABLE IF NOT EXISTS public.nhl_live_accounts (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 username text NOT NULL UNIQUE CHECK (username ~ '^[a-z0-9_]{3,24}$'),
 email text NOT NULL UNIQUE CHECK (email = lower(email)),
 password_hash text NOT NULL,
 role text NOT NULL DEFAULT 'USER' CHECK (role IN ('USER','DEV')),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.nhl_live_sessions (
 token_hash text PRIMARY KEY,
 account_id bigint NOT NULL REFERENCES public.nhl_live_accounts(id) ON DELETE CASCADE,
 expires_at timestamptz NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS nhl_live_sessions_account_idx ON public.nhl_live_sessions(account_id);
CREATE TABLE IF NOT EXISTS public.nhl_live_wagers (
 account_id bigint NOT NULL REFERENCES public.nhl_live_accounts(id) ON DELETE RESTRICT,
 wager_id text NOT NULL CHECK (length(wager_id) BETWEEN 1 AND 150),
 wager jsonb NOT NULL CHECK (jsonb_typeof(wager)='object'),
 source text NOT NULL DEFAULT 'manual' CHECK (source IN ('manual','kalshi','import')),
 source_external_id text,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(account_id,wager_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS nhl_live_wagers_source_identity ON public.nhl_live_wagers(account_id,source,source_external_id) WHERE source_external_id IS NOT NULL;
CREATE TABLE IF NOT EXISTS public.nhl_live_import_batches (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 account_id bigint NOT NULL REFERENCES public.nhl_live_accounts(id) ON DELETE RESTRICT,
 import_fingerprint text NOT NULL,
 state text NOT NULL DEFAULT 'preview' CHECK (state IN ('preview','committed','cancelled')),
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(account_id,import_fingerprint)
);
-- No GRANTs, account bootstrap, or LIVE writes here. These require a reviewed
-- production role/permission plan and separately tested API implementation.
COMMIT;
