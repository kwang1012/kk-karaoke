CREATE TABLE IF NOT EXISTS lyrics_reports (
    track_id TEXT PRIMARY KEY,
    count INTEGER NOT NULL DEFAULT 1,
    first_reported REAL NOT NULL,
    last_reported REAL NOT NULL
);
CREATE INDEX IF NOT EXISTS lyrics_reports_last ON lyrics_reports(last_reported);
