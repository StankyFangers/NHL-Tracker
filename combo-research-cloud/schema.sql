-- Cloudflare D1: shared research history only. No personal wagers or sportsbook balances.
CREATE TABLE IF NOT EXISTS research_combos (
 id TEXT PRIMARY KEY,
 game_date TEXT NOT NULL,
 game_id TEXT NOT NULL,
 team TEXT NOT NULL,
 opponent TEXT,
 matchup TEXT,
 players_json TEXT NOT NULL,
 player_ids_json TEXT,
 forward_line INTEGER,
 pp_unit INTEGER,
 odds INTEGER,
 result TEXT NOT NULL DEFAULT 'UNVERIFIED' CHECK(result IN ('HIT','MISS','UNVERIFIED')),
 venue TEXT,
 goalie_gaa REAL,
 goalie_differential REAL,
 snapshot_at TEXT,
 source TEXT NOT NULL DEFAULT 'import',
 lineup_status TEXT NOT NULL DEFAULT 'UNKNOWN',
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_research_date ON research_combos(game_date);
CREATE INDEX IF NOT EXISTS idx_research_game ON research_combos(game_id);
CREATE INDEX IF NOT EXISTS idx_research_pp_fl ON research_combos(pp_unit,forward_line,game_date);
CREATE TABLE IF NOT EXISTS research_checks (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 checked_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 kind TEXT NOT NULL,
 games_checked INTEGER NOT NULL DEFAULT 0,
 combos_graded INTEGER NOT NULL DEFAULT 0,
 error TEXT
);

CREATE TABLE IF NOT EXISTS research_schedule_cache (
 game_date TEXT PRIMARY KEY,
 payload TEXT NOT NULL,
 updated_ms INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS research_capture_state (
 game_id TEXT NOT NULL,
 game_date TEXT NOT NULL,
 team TEXT NOT NULL,
 checked_ms INTEGER NOT NULL,
 captured_at TEXT,
 capture_status TEXT NOT NULL DEFAULT 'PENDING',
 lineup_status TEXT DEFAULT 'UNKNOWN',
 combo_count INTEGER NOT NULL DEFAULT 0,
 error TEXT,
 PRIMARY KEY(game_id,team)
);
CREATE INDEX IF NOT EXISTS idx_capture_date ON research_capture_state(game_date);
