ALTER TABLE players ADD COLUMN discord_user_id TEXT;
ALTER TABLE players ADD COLUMN discord_username TEXT;
ALTER TABLE players ADD COLUMN discord_global_name TEXT;
ALTER TABLE players ADD COLUMN discord_avatar_hash TEXT;

CREATE INDEX IF NOT EXISTS idx_players_discord_user_id ON players(discord_user_id);
