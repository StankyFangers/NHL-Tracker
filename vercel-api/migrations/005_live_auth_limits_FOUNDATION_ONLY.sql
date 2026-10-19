-- DO NOT APPLY until independently reviewed production provisioning.
BEGIN;
CREATE TABLE IF NOT EXISTS public.nhl_live_login_limits (
 login_hash text PRIMARY KEY,
 attempts integer NOT NULL DEFAULT 0,
 locked_until timestamptz,
 updated_at timestamptz NOT NULL DEFAULT now()
);
-- Required least-privilege grants for a dedicated LIVE auth role (substitute
-- reviewed production role, never the DEV nhl_tracker_auth role):
-- SELECT,INSERT on nhl_live_accounts; SELECT,INSERT,DELETE on nhl_live_sessions;
-- SELECT,INSERT,UPDATE,DELETE on nhl_live_login_limits;
-- USAGE,SELECT on account identity sequence. No UPDATE on role column.
COMMIT;
