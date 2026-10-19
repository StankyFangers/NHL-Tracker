-- Run ONLY in Neon PRODUCTION as neondb_owner after reviewing.
-- Narrows privileges for the already-created nhl_tracker_live_restricted role.
-- Does not touch rows, account roles, or wager contents.
BEGIN;
REVOKE ALL PRIVILEGES ON TABLE
  public.nhl_live_accounts,
  public.nhl_live_sessions,
  public.nhl_live_wagers,
  public.nhl_live_import_batches,
  public.nhl_live_login_limits
FROM nhl_tracker_live_restricted;
GRANT SELECT, INSERT ON public.nhl_live_accounts TO nhl_tracker_live_restricted;
GRANT SELECT, INSERT, DELETE ON public.nhl_live_sessions TO nhl_tracker_live_restricted;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.nhl_live_login_limits TO nhl_tracker_live_restricted;
GRANT SELECT, INSERT ON public.nhl_live_wagers TO nhl_tracker_live_restricted;
-- No import API yet: do not grant writes to import_batches.
GRANT SELECT ON public.nhl_live_import_batches TO nhl_tracker_live_restricted;
COMMIT;
-- Confirm role has no table-wide UPDATE on accounts:
SELECT has_table_privilege('nhl_tracker_live_login','public.nhl_live_accounts','UPDATE') AS account_update_must_be_false,
       has_table_privilege('nhl_tracker_live_login','public.nhl_live_wagers','INSERT') AS wager_insert_must_be_true;
