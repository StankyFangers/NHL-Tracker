CREATE TABLE IF NOT EXISTS line_status (game_date TEXT NOT NULL,team TEXT NOT NULL,status TEXT NOT NULL CHECK(status IN ('PROJECTED','CONFIRMED','UNKNOWN')),last_checked_at INTEGER NOT NULL,source TEXT NOT NULL,PRIMARY KEY(game_date,team));
CREATE TABLE IF NOT EXISTS delivery (event_key TEXT NOT NULL,chat_id TEXT NOT NULL,kind TEXT NOT NULL,message TEXT NOT NULL,created_at INTEGER NOT NULL,delivered_at INTEGER,PRIMARY KEY(event_key,chat_id));
CREATE INDEX IF NOT EXISTS delivery_pending ON delivery(delivered_at,created_at);
