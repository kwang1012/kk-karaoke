CREATE TABLE IF NOT EXISTS singers (
    user_id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    avatar TEXT NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS score_bests (
    scope TEXT NOT NULL,
    user_id TEXT NOT NULL,
    song_id TEXT NOT NULL,
    total INTEGER NOT NULL,
    pitch INTEGER NOT NULL,
    precision INTEGER NOT NULL,
    timing INTEGER NOT NULL,
    technique INTEGER,
    streak_s REAL NOT NULL DEFAULT 0,
    scored_s REAL NOT NULL DEFAULT 0,
    song TEXT NOT NULL,
    artists TEXT NOT NULL DEFAULT '[]',
    cover TEXT NOT NULL DEFAULT '',
    at INTEGER NOT NULL,
    PRIMARY KEY (scope, user_id, song_id)
);
CREATE INDEX IF NOT EXISTS score_bests_song ON score_bests(scope, song_id, total DESC);
CREATE TABLE IF NOT EXISTS user_history (
    user_id TEXT NOT NULL,
    song_id TEXT NOT NULL,
    track TEXT NOT NULL,
    ordered REAL NOT NULL,
    PRIMARY KEY (user_id, song_id)
);
CREATE INDEX IF NOT EXISTS user_history_recent ON user_history(user_id, ordered DESC);
