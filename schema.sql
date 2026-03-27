CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  mode TEXT NOT NULL CHECK (mode IN ('click', 'track')),
  difficulty TEXT NOT NULL DEFAULT 'medium' CHECK (difficulty IN ('easy', 'medium', 'hard')),
  preset TEXT NOT NULL,
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
  score INTEGER NOT NULL,
  ip_hash TEXT
);

CREATE TABLE IF NOT EXISTS players (
  id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  normalized_name TEXT NOT NULL UNIQUE,
  claim_token TEXT NOT NULL UNIQUE,
  discord_user_id TEXT UNIQUE,
  discord_username TEXT,
  discord_global_name TEXT,
  discord_avatar_hash TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sessions_mode_score ON sessions(mode, score DESC);
CREATE INDEX IF NOT EXISTS idx_sessions_mode_avg ON sessions(mode, avg ASC);
CREATE INDEX IF NOT EXISTS idx_sessions_created_at ON sessions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sessions_mode_difficulty ON sessions(mode, difficulty);
CREATE INDEX IF NOT EXISTS idx_sessions_mode_difficulty_preset_created_at ON sessions(mode, difficulty, preset, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sessions_ip_hash_created_at ON sessions(ip_hash, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_players_normalized_name ON players(normalized_name);
CREATE INDEX IF NOT EXISTS idx_players_discord_user_id ON players(discord_user_id);
