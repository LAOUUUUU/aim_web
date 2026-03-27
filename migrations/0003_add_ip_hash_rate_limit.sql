ALTER TABLE sessions ADD COLUMN ip_hash TEXT;

CREATE INDEX IF NOT EXISTS idx_sessions_ip_hash_created_at ON sessions(ip_hash, created_at DESC);
