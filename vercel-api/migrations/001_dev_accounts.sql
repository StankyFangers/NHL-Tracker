-- Apply ONLY to approved Neon DEV database. Use an administrator in Neon SQL Editor.
CREATE TABLE IF NOT EXISTS public.nhl_dev_accounts (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 username text NOT NULL UNIQUE,
 email text NOT NULL UNIQUE,
 password_hash text NOT NULL,
 role text NOT NULL DEFAULT 'USER' CHECK (role IN ('USER','DEV')),
 created_at timestamptz NOT NULL DEFAULT now(),
 CHECK (username ~ '^[a-z0-9_]{3,24}$'),
 CHECK (email = lower(email))
);
CREATE TABLE IF NOT EXISTS public.nhl_dev_sessions (
 token_hash text PRIMARY KEY,
 account_id bigint NOT NULL REFERENCES public.nhl_dev_accounts(id) ON DELETE CASCADE,
 expires_at timestamptz NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS nhl_dev_sessions_account_idx ON public.nhl_dev_sessions(account_id);
-- Create a dedicated, least-privilege authentication DB role separately.
-- GRANT USAGE ON SCHEMA public TO nhl_tracker_auth;
-- GRANT SELECT, INSERT ON public.nhl_dev_accounts TO nhl_tracker_auth;
-- GRANT SELECT, INSERT, DELETE ON public.nhl_dev_sessions TO nhl_tracker_auth;
-- GRANT USAGE, SELECT ON SEQUENCE public.nhl_dev_accounts_id_seq TO nhl_tracker_auth;
-- DEV role is NEVER assigned by the registration endpoint.
-- AFTER signing up with username stankyfangers, a trusted DEV database administrator must run:
-- UPDATE public.nhl_dev_accounts SET role='DEV' WHERE username='stankyfangers';
