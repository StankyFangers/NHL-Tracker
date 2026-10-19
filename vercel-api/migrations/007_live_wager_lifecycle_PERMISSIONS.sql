-- Run only in Neon PRODUCTION as neondb_owner AFTER reviewing and testing API.
-- Grants only wager row updates/deletes to the existing restricted permission role.
-- The API must enforce account_id and updated_at optimistic concurrency.
BEGIN;
GRANT UPDATE (wager, updated_at), DELETE ON public.nhl_live_wagers TO nhl_tracker_live_restricted;
COMMIT;
SELECT has_table_privilege('nhl_tracker_live_login','public.nhl_live_wagers','DELETE') AS wager_delete_expected_true,
       has_column_privilege('nhl_tracker_live_login','public.nhl_live_wagers','wager','UPDATE') AS wager_payload_update_expected_true,
       has_table_privilege('nhl_tracker_live_login','public.nhl_live_accounts','UPDATE') AS account_update_expected_false;
