CREATE TABLE IF NOT EXISTS discovery_users (
  user_id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  full_name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'advisor',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS discovery_leads (
  id TEXT PRIMARY KEY,
  team TEXT NOT NULL,
  owner_user_id TEXT NOT NULL,
  owner_email TEXT NOT NULL,
  payload TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_discovery_leads_team_updated
ON discovery_leads(team, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_discovery_leads_team_owner
ON discovery_leads(team, owner_user_id);

CREATE TABLE IF NOT EXISTS discovery_campaigns (
  id TEXT PRIMARY KEY,
  team TEXT NOT NULL,
  created_by_user_id TEXT NOT NULL,
  payload TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_discovery_campaigns_team_updated
ON discovery_campaigns(team, updated_at DESC);

CREATE TABLE IF NOT EXISTS discovery_jobs (
  id TEXT PRIMARY KEY,
  team TEXT NOT NULL,
  campaign_id TEXT NOT NULL,
  requested_by_user_id TEXT NOT NULL,
  payload TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_discovery_jobs_team_campaign_updated
ON discovery_jobs(team, campaign_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS discovery_audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  team TEXT NOT NULL,
  actor_user_id TEXT NOT NULL,
  actor_email TEXT NOT NULL,
  action TEXT NOT NULL,
  record_type TEXT NOT NULL,
  record_id TEXT NOT NULL,
  detail TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_discovery_audit_team_created
ON discovery_audit(team, created_at DESC);

PRAGMA optimize;
