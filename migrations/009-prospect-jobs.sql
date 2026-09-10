CREATE TABLE IF NOT EXISTS prospect_jobs (
 id TEXT PRIMARY KEY,
 user_id TEXT NOT NULL,
 action TEXT NOT NULL CHECK(action IN ('search','enrich','verify')),
 idempotency_key TEXT NOT NULL,
 input_hash TEXT NOT NULL,
 max_cost_micros BIGINT NOT NULL CHECK(max_cost_micros>=0),
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 UNIQUE(user_id,idempotency_key)
);
CREATE TABLE IF NOT EXISTS prospect_tasks (
 id TEXT PRIMARY KEY,
 job_id TEXT NOT NULL REFERENCES prospect_jobs(id) ON DELETE CASCADE,
 user_id TEXT NOT NULL,
 action TEXT NOT NULL,
 provider TEXT NOT NULL,
 contact_id TEXT REFERENCES prospect_contacts(id) ON DELETE SET NULL,
 payload JSONB NOT NULL,
 status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','running','waiting','completed','failed','skipped','needs_attention')),
 attempts INTEGER NOT NULL DEFAULT 0,
 lease_token TEXT,
 lease_until TIMESTAMPTZ,
 next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 result JSONB NOT NULL DEFAULT '{}',
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 completed_at TIMESTAMPTZ
);
CREATE UNIQUE INDEX IF NOT EXISTS prospect_task_active_contact ON prospect_tasks(user_id,contact_id,action)
 WHERE contact_id IS NOT NULL AND status IN ('pending','running','waiting');
CREATE INDEX IF NOT EXISTS prospect_task_queue ON prospect_tasks(status,next_attempt_at,created_at);
CREATE INDEX IF NOT EXISTS prospect_tasks_job ON prospect_tasks(job_id);
CREATE TABLE IF NOT EXISTS prospect_charges (
 task_id TEXT PRIMARY KEY REFERENCES prospect_tasks(id) ON DELETE RESTRICT,
 user_id TEXT NOT NULL,
 provider TEXT NOT NULL,
 reserved_micros BIGINT NOT NULL CHECK(reserved_micros>=0),
 reserved_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS prospect_charges_date ON prospect_charges(reserved_at);
CREATE TABLE IF NOT EXISTS prospect_provider_pacing (
 provider TEXT PRIMARY KEY,
 next_call_at TIMESTAMPTZ NOT NULL
);
