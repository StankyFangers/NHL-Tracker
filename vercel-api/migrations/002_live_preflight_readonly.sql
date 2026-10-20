-- READ-ONLY LIVE schema preflight. Do not use as an activation or migration script.
-- Run with a read-only database connection after independently verifying target identity.
BEGIN READ ONLY;
SELECT current_database() AS database_name, current_user AS connected_role,
       inet_server_addr() AS server_address;
SELECT table_name
FROM information_schema.tables
WHERE table_schema='public'
  AND table_name IN ('nhl_live_accounts','nhl_live_sessions','nhl_live_login_limits','nhl_live_wagers')
ORDER BY table_name;
SELECT table_name,column_name,data_type,is_nullable,column_default
FROM information_schema.columns
WHERE table_schema='public'
  AND table_name IN ('nhl_live_accounts','nhl_live_sessions','nhl_live_login_limits','nhl_live_wagers')
ORDER BY table_name,ordinal_position;
SELECT tc.table_name,tc.constraint_name,tc.constraint_type,
       string_agg(kcu.column_name,',' ORDER BY kcu.ordinal_position) AS columns
FROM information_schema.table_constraints tc
LEFT JOIN information_schema.key_column_usage kcu
  ON kcu.constraint_catalog=tc.constraint_catalog
 AND kcu.constraint_schema=tc.constraint_schema
 AND kcu.constraint_name=tc.constraint_name
 AND kcu.table_name=tc.table_name
WHERE tc.table_schema='public'
  AND tc.table_name IN ('nhl_live_accounts','nhl_live_sessions','nhl_live_login_limits','nhl_live_wagers')
GROUP BY tc.table_name,tc.constraint_name,tc.constraint_type
ORDER BY tc.table_name,tc.constraint_type,tc.constraint_name;
SELECT table_name,privilege_type,grantee
FROM information_schema.role_table_grants
WHERE table_schema='public'
  AND table_name IN ('nhl_live_accounts','nhl_live_sessions','nhl_live_login_limits','nhl_live_wagers')
ORDER BY table_name,grantee,privilege_type;
COMMIT;
