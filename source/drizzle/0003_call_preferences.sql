CREATE TABLE IF NOT EXISTS lead_call_preferences (
  user_id TEXT PRIMARY KEY,
  location TEXT NOT NULL DEFAULT 'Long Island',
  age_focus TEXT NOT NULL DEFAULT 'all',
  timely_focus TEXT NOT NULL DEFAULT 'all',
  ideal_prospect TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL
);
