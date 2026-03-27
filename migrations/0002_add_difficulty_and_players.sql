ALTER TABLE sessions ADD COLUMN difficulty TEXT NOT NULL DEFAULT 'medium';

CREATE TABLE IF NOT EXISTS players (
  id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  normalized_name TEXT NOT NULL UNIQUE,
  claim_token TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sessions_mode_difficulty ON sessions(mode, difficulty);
CREATE INDEX IF NOT EXISTS idx_players_normalized_name ON players(normalized_name);
