CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  mode TEXT NOT NULL CHECK (mode IN ('click', 'track')),
  player_name TEXT NOT NULL,
  created_at TEXT NOT NULL,
  session_number INTEGER,
  hits INTEGER,
  misses INTEGER,
  avg INTEGER,
  best INTEGER,
  acc INTEGER,
  on_time REAL,
  off_time REAL,
  pct INTEGER,
  score INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sessions_mode_score ON sessions(mode, score DESC);
CREATE INDEX IF NOT EXISTS idx_sessions_mode_avg ON sessions(mode, avg ASC);
CREATE INDEX IF NOT EXISTS idx_sessions_created_at ON sessions(created_at DESC);
