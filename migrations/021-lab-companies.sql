-- Companies a campaign found, kept as records of their own so a run can show
-- what it searched before any person was found. Business listings only: no
-- personal data is stored here.
CREATE TABLE IF NOT EXISTS lab_companies (
  run_id TEXT NOT NULL REFERENCES lab_runs(id) ON DELETE CASCADE,
  company_key TEXT NOT NULL,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  website TEXT NOT NULL DEFAULT '',
  location TEXT NOT NULL DEFAULT '',
  distance_miles DOUBLE PRECISION,
  industries JSONB NOT NULL DEFAULT '[]',
  source TEXT NOT NULL,
  source_url TEXT NOT NULL DEFAULT '',
  queued BOOLEAN NOT NULL DEFAULT false,
  skip_reason TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY(run_id, company_key)
);
