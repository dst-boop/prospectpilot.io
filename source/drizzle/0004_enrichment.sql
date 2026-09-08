CREATE TABLE IF NOT EXISTS enrichment_batches (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  provider TEXT NOT NULL CHECK(provider IN ('zoominfo','wealthfeed')),
  status TEXT NOT NULL CHECK(status IN ('awaiting_upload','preview','complete')),
  payload TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS enrichment_batches_user ON enrichment_batches(user_id);
CREATE TABLE IF NOT EXISTS enrichment_commit_guards (id TEXT PRIMARY KEY,ok INTEGER NOT NULL CHECK(ok=1));
