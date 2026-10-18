-- Apply ONLY to Neon DEVELOPMENT as neondb_owner. No existing wager tables touched.
-- One-time privileged function: only the restricted auth role may execute it.
CREATE OR REPLACE FUNCTION public.nhl_bootstrap_first_dev(p_email text,p_password_hash text)
RETURNS TABLE(id bigint,username text,role text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
 PERFORM pg_advisory_xact_lock(719176, 3);
 IF EXISTS(SELECT 1 FROM public.nhl_dev_accounts WHERE role='DEV' OR username='stankyfangers') THEN
   RAISE EXCEPTION 'DEV administrator already established' USING ERRCODE='P0001';
 END IF;
 IF p_email IS NULL OR p_email <> lower(p_email) OR length(p_email)>254 OR p_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    OR p_password_hash !~ '^scrypt:[0-9a-f]{32}:[0-9a-f]{128}$' THEN
   RAISE EXCEPTION 'Invalid bootstrap inputs' USING ERRCODE='P0001';
 END IF;
 RETURN QUERY INSERT INTO public.nhl_dev_accounts(username,email,password_hash,role)
 VALUES('stankyfangers',p_email,p_password_hash,'DEV')
 RETURNING nhl_dev_accounts.id,nhl_dev_accounts.username,nhl_dev_accounts.role;
END $$;
REVOKE ALL ON FUNCTION public.nhl_bootstrap_first_dev(text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.nhl_bootstrap_first_dev(text,text) TO nhl_tracker_auth;
-- Database-backed distributed per-login throttling. No role-update permission granted.
CREATE TABLE IF NOT EXISTS public.nhl_dev_login_attempts (
 login_hash text PRIMARY KEY, attempts integer NOT NULL DEFAULT 0,
 window_started timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON public.nhl_dev_login_attempts FROM PUBLIC;
CREATE OR REPLACE FUNCTION public.nhl_auth_limit_login(p_hash text)
RETURNS TABLE(attempts integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
 IF p_hash !~ '^[0-9a-f]{64}$' THEN RAISE EXCEPTION 'Invalid login key' USING ERRCODE='P0001'; END IF;
 RETURN QUERY INSERT INTO public.nhl_dev_login_attempts(login_hash,attempts,window_started)
 VALUES(p_hash,1,now())
 ON CONFLICT(login_hash) DO UPDATE SET
 attempts=CASE WHEN nhl_dev_login_attempts.window_started < now()-interval '15 minutes' THEN 1 ELSE nhl_dev_login_attempts.attempts+1 END,
 window_started=CASE WHEN nhl_dev_login_attempts.window_started < now()-interval '15 minutes' THEN now() ELSE nhl_dev_login_attempts.window_started END
 RETURNING nhl_dev_login_attempts.attempts;
END $$;
REVOKE ALL ON FUNCTION public.nhl_auth_limit_login(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.nhl_auth_limit_login(text) TO nhl_tracker_auth;
