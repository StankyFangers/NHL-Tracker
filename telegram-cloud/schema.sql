CREATE TABLE IF NOT EXISTS line_status (game_date TEXT NOT NULL,team TEXT NOT NULL,status TEXT NOT NULL CHECK(status IN ('PROJECTED','CONFIRMED','UNKNOWN')),last_checked_at INTEGER NOT NULL,source TEXT NOT NULL,PRIMARY KEY(game_date,team));
CREATE TABLE IF NOT EXISTS delivery (event_key TEXT NOT NULL,chat_id TEXT NOT NULL,kind TEXT NOT NULL,message TEXT NOT NULL,created_at INTEGER NOT NULL,delivered_at INTEGER,PRIMARY KEY(event_key,chat_id));
CREATE INDEX IF NOT EXISTS delivery_pending ON delivery(delivered_at,created_at);

-- Linked Telegram chats belong to authenticated NHL Tracker accounts.
CREATE TABLE IF NOT EXISTS telegram_accounts (
 account_key TEXT PRIMARY KEY,
 chat_id TEXT UNIQUE,
 enabled INTEGER NOT NULL DEFAULT 0,
 scope TEXT NOT NULL DEFAULT 'ALL' CHECK(scope IN ('ALL','WAGERED')),
 lineup_changes INTEGER NOT NULL DEFAULT 0,
 progress_mode TEXT NOT NULL DEFAULT 'OFF' CHECK(progress_mode IN ('OFF','FOOTER','SEPARATE')),
 created_at INTEGER NOT NULL,
 updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS telegram_link_codes (
 code TEXT PRIMARY KEY,
 account_key TEXT NOT NULL,
 expires_at INTEGER NOT NULL,
 created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS telegram_link_account ON telegram_link_codes(account_key);
CREATE TABLE IF NOT EXISTS telegram_pending_teams (
 account_key TEXT NOT NULL,
 game_date TEXT NOT NULL,
 team TEXT NOT NULL,
 updated_at INTEGER NOT NULL,
 PRIMARY KEY(account_key, game_date, team)
);
CREATE INDEX IF NOT EXISTS telegram_pending_by_day ON telegram_pending_teams(game_date,team,account_key);

CREATE TABLE IF NOT EXISTS confirmed_lineups (
 game_date TEXT NOT NULL,
 team TEXT NOT NULL,
 snapshot TEXT NOT NULL,
 checked_at INTEGER NOT NULL,
 PRIMARY KEY(game_date,team)
);
