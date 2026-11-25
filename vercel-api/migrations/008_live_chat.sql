BEGIN;
CREATE TABLE IF NOT EXISTS public.nhl_live_chat (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 username text NOT NULL,
 body text NOT NULL CHECK(length(body) BETWEEN 1 AND 2000),
 nonce text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(username,nonce)
);
GRANT SELECT, INSERT, DELETE ON public.nhl_live_chat TO nhl_tracker_live_restricted;
GRANT USAGE ON SEQUENCE public.nhl_live_chat_id_seq TO nhl_tracker_live_restricted;
COMMIT;
