-- Run only in approved Neon DEVELOPMENT database, never LIVE.
-- Dedicated table, no foreign keys to legacy user_profiles / bets.
CREATE TABLE IF NOT EXISTS public.nhl_dev_bet_snapshots (
 account_id bigint PRIMARY KEY REFERENCES public.nhl_dev_accounts(id) ON DELETE CASCADE,
 bets jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(bets)='array'),
 revision bigint NOT NULL DEFAULT 0,
 updated_at timestamptz NOT NULL DEFAULT now()
);
-- Authentication DB role used by the DEV-only endpoint.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.nhl_dev_bet_snapshots TO nhl_tracker_auth;
