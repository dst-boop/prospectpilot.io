CREATE TABLE wealthfeed_connections (
 user_id TEXT PRIMARY KEY,
 encrypted_key TEXT NOT NULL,
 connection_id TEXT NOT NULL,
 connected_at TEXT NOT NULL,
 next_request_at INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE wealthfeed_jobs (
 id TEXT PRIMARY KEY,
 user_id TEXT NOT NULL,
 connection_id TEXT NOT NULL,
 provider_job_id TEXT,
 status TEXT NOT NULL,
 payload TEXT NOT NULL,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE(user_id, id)
);
CREATE INDEX idx_wealthfeed_jobs_user_created ON wealthfeed_jobs(user_id,created_at);
