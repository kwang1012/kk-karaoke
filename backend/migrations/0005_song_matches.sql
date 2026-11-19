-- Which recording a song listed by another service is. A song is matched once; every playlist, chart and
-- phone after that reads the answer. source is the service whose id it is ('spotify'), or 'text' for the
-- normalized "title / artist" (what KKBOX, Apple Music and the like list). track NULL means "looked, none".
CREATE TABLE IF NOT EXISTS song_matches (
    source TEXT NOT NULL,
    source_id TEXT NOT NULL,
    track_id TEXT,
    track TEXT,
    checked REAL NOT NULL,
    PRIMARY KEY (source, source_id)
);
