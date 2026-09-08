CREATE TABLE IF NOT EXISTS lead_call_records (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  lead_id TEXT NOT NULL,
  week_start TEXT NOT NULL,
  outcome TEXT NOT NULL,
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_call_user_week ON lead_call_records(user_id, week_start);
CREATE TABLE IF NOT EXISTS lead_call_blocks (
  phone TEXT PRIMARY KEY,
  lead_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  reason TEXT NOT NULL,
  created_at TEXT NOT NULL
);
