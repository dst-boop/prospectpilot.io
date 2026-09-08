CREATE TABLE IF NOT EXISTS research_jobs (
 id TEXT PRIMARY KEY, lead_id TEXT NOT NULL, user_id TEXT NOT NULL, user_email TEXT NOT NULL,
 identity_signature TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'queued', next_source INTEGER NOT NULL DEFAULT 0,
 attempts INTEGER NOT NULL DEFAULT 0, reports JSONB NOT NULL DEFAULT '[]',
 lease_token TEXT, lease_until TIMESTAMPTZ, available_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS research_jobs_active ON research_jobs(lead_id,user_id) WHERE status IN ('queued','running');
CREATE INDEX IF NOT EXISTS research_jobs_ready ON research_jobs(available_at,created_at) WHERE status IN ('queued','running');
