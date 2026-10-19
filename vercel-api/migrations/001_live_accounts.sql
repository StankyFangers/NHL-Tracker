-- NHL Tracker LIVE schema. Apply ONLY to an independently verified LIVE database
-- after separate approval. Never run against TEST/DEV.
BEGIN;
CREATE TABLE IF NOT EXISTS public.nhl_live_accounts (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 username text NOT NULL UNIQUE,
 email text NOT NULL UNIQUE,
 password_hash text NOT NULL,
 role text NOT NULL DEFAULT 'USER' CHECK (role IN ('USER','DEV')),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.nhl_live_sessions (
 token_hash text PRIMARY KEY,
 account_id bigint NOT NULL REFERENCES public.nhl_live_accounts(id) ON DELETE CASCADE,
 expires_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS nhl_live_sessions_account_idx ON public.nhl_live_sessions(account_id);
CREATE TABLE IF NOT EXISTS public.nhl_live_login_limits (
 login_hash text PRIMARY KEY,
 attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
 locked_until timestamptz,
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.nhl_live_wagers (
 account_id bigint NOT NULL REFERENCES public.nhl_live_accounts(id) ON DELETE CASCADE,
 wager_id text NOT NULL,
 wager jsonb NOT NULL,
 source text NOT NULL DEFAULT 'manual' CHECK (source IN ('manual','kalshi','import')),
 source_external_id text,
 updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(account_id,wager_id),
 CONSTRAINT nhl_live_wager_source_identity UNIQUE(account_id,source,source_external_id)
);
CREATE INDEX IF NOT EXISTS nhl_live_wagers_owner_idx ON public.nhl_live_wagers(account_id,wager_id);
COMMIT;
