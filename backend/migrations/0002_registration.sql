CREATE TABLE IF NOT EXISTS registration_requests (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sending', 'approved', 'rejected')),
    created REAL NOT NULL,
    updated REAL NOT NULL,
    reviewed_by TEXT,
    user_id TEXT
);
CREATE INDEX IF NOT EXISTS registration_status ON registration_requests(status, created);
