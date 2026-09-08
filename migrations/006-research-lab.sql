CREATE TABLE IF NOT EXISTS employer_plan_catalog (
  id TEXT PRIMARY KEY,
  sponsor_key TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT '',
  plan_year INTEGER NOT NULL,
  payload JSONB NOT NULL,
  imported_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS employer_plan_name ON employer_plan_catalog(sponsor_key, plan_year DESC);
CREATE INDEX IF NOT EXISTS employer_plan_state ON employer_plan_catalog(state, plan_year DESC);

CREATE TABLE IF NOT EXISTS lab_settings (
  user_id TEXT PRIMARY KEY,
  user_email TEXT NOT NULL,
  daily_enabled BOOLEAN NOT NULL DEFAULT false,
  daily_hour INTEGER NOT NULL DEFAULT 13 CHECK(daily_hour BETWEEN 0 AND 23),
  daily_budget_micros BIGINT NOT NULL DEFAULT 0 CHECK(daily_budget_micros >= 0),
  configuration JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS lab_runs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  user_email TEXT NOT NULL,
  kind TEXT NOT NULL CHECK(kind IN ('discovery','inventory','import')),
  idempotency_key TEXT NOT NULL,
  configuration JSONB NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'queued',
  message TEXT NOT NULL DEFAULT '',
  budget_micros BIGINT NOT NULL DEFAULT 0 CHECK(budget_micros >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  UNIQUE(user_id, idempotency_key)
);
CREATE INDEX IF NOT EXISTS lab_runs_user_date ON lab_runs(user_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS lab_one_active_discovery ON lab_runs(user_id) WHERE kind='discovery' AND status IN ('queued','running');
CREATE TABLE IF NOT EXISTS lab_tasks (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES lab_runs(id) ON DELETE CASCADE,
  task_key TEXT NOT NULL,
  source TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'pending',
  lease_token TEXT,
  lease_until TIMESTAMPTZ,
  attempts INTEGER NOT NULL DEFAULT 0,
  reserved_micros BIGINT NOT NULL DEFAULT 0 CHECK(reserved_micros >= 0),
  result JSONB,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  UNIQUE(run_id, task_key)
);
CREATE INDEX IF NOT EXISTS lab_tasks_queue ON lab_tasks(status, lease_until);
CREATE TABLE IF NOT EXISTS lab_run_leads (
  run_id TEXT NOT NULL REFERENCES lab_runs(id) ON DELETE CASCADE,
  lead_id TEXT NOT NULL REFERENCES discovery_leads(id) ON DELETE CASCADE,
  is_new BOOLEAN NOT NULL DEFAULT false,
  source TEXT NOT NULL,
  PRIMARY KEY(run_id, lead_id)
);
CREATE TABLE IF NOT EXISTS lab_observations (
  lead_id TEXT NOT NULL REFERENCES discovery_leads(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  field TEXT NOT NULL CHECK(field IN ('age','residence','retirement','contact')),
  payload JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY(lead_id,user_id,field)
);
CREATE TABLE IF NOT EXISTS lab_qualification (
  lead_id TEXT NOT NULL REFERENCES discovery_leads(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  status TEXT NOT NULL,
  score INTEGER NOT NULL,
  identity_signature TEXT NOT NULL,
  first_verified_at TIMESTAMPTZ,
  evaluated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY(lead_id,user_id)
);
CREATE INDEX IF NOT EXISTS lab_quality_user_verified ON lab_qualification(user_id,first_verified_at);
CREATE TABLE IF NOT EXISTS lab_costs (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES lab_runs(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  category TEXT NOT NULL CHECK(category IN ('provider','labor','infrastructure','subscription')),
  amount_micros BIGINT NOT NULL CHECK(amount_micros >= 0),
  basis TEXT NOT NULL CHECK(basis IN ('self_reported','configured_estimate','actual')),
  note TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS lab_costs_user_date ON lab_costs(user_id,created_at);
