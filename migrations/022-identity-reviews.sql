-- People the Research Lab could not place with certainty: an arrival that
-- matched more than one existing record ('unresolved', the arrival is held
-- here unsaved), or a new record that shares a name and employer with an
-- existing one ('probable'). An advisor decides; nothing merges on a guess.
-- Identity keys are stored hashed, so Delete this person can find a held
-- arrival without the queue keeping a searchable copy of an email address.
CREATE TABLE IF NOT EXISTS lab_identity_reviews (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  run_id TEXT REFERENCES lab_runs(id) ON DELETE SET NULL,
  kind TEXT NOT NULL CHECK(kind IN ('unresolved','probable')),
  fingerprint TEXT NOT NULL,
  candidate JSONB NOT NULL DEFAULT '{}',
  key_hashes TEXT[] NOT NULL DEFAULT '{}',
  lead_id TEXT REFERENCES discovery_leads(id) ON DELETE CASCADE,
  match_ids TEXT[] NOT NULL,
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','merged','separate','saved','discarded')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ
);
CREATE UNIQUE INDEX IF NOT EXISTS lab_identity_reviews_once ON lab_identity_reviews(user_id,fingerprint) WHERE status='open';
CREATE INDEX IF NOT EXISTS lab_identity_reviews_open ON lab_identity_reviews(user_id,status,created_at DESC);
