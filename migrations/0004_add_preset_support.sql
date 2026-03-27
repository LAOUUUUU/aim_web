ALTER TABLE sessions ADD COLUMN preset TEXT;

UPDATE sessions
SET preset = CASE
  WHEN mode = 'click' THEN 'classic-click'
  ELSE 'smooth-track'
END
WHERE preset IS NULL;

CREATE INDEX IF NOT EXISTS idx_sessions_mode_difficulty_preset_created_at
ON sessions(mode, difficulty, preset, created_at DESC);
