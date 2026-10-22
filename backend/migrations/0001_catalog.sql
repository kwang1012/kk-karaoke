-- The shared catalog lives in Cloudflare D1. R2 holds immutable versioned objects.
CREATE TABLE IF NOT EXISTS songs (
    id TEXT PRIMARY KEY,
    metadata TEXT NOT NULL DEFAULT '{}',
    created REAL NOT NULL,
    updated REAL NOT NULL,
    deleted INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS assets (
    song_id TEXT NOT NULL REFERENCES songs(id),
    kind TEXT NOT NULL,
    version TEXT NOT NULL,
    object_key TEXT,
    storage TEXT NOT NULL CHECK (storage IN ('r2', 'local')),
    state TEXT NOT NULL CHECK (state IN ('pending', 'ready', 'missing', 'failed')),
    size INTEGER NOT NULL DEFAULT 0,
    checksum TEXT,
    metadata TEXT NOT NULL DEFAULT '{}',
    owner TEXT,
    error TEXT,
    updated REAL NOT NULL,
    PRIMARY KEY (song_id, kind)
);
CREATE INDEX IF NOT EXISTS assets_state_kind ON assets(state, kind, song_id);
CREATE TABLE IF NOT EXISTS jobs (
    id TEXT PRIMARY KEY,
    song_id TEXT NOT NULL REFERENCES songs(id),
    kind TEXT NOT NULL,
    args TEXT NOT NULL,
    state TEXT NOT NULL CHECK (state IN ('queued', 'running', 'retry', 'completed', 'failed', 'cancelled')),
    stage TEXT,
    progress REAL,
    result TEXT,
    error TEXT,
    attempts INTEGER NOT NULL DEFAULT 0,
    dispatched REAL,
    updated REAL NOT NULL,
    created REAL NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS jobs_one_active ON jobs(song_id, kind)
    WHERE state IN ('queued', 'running', 'retry');
CREATE INDEX IF NOT EXISTS jobs_recovery ON jobs(state, updated);
