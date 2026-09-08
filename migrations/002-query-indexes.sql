-- Supports the weekly owner-email branch alongside the existing team/owner index.
CREATE INDEX IF NOT EXISTS idx_discovery_leads_team_owner_email
ON discovery_leads(team, lower(owner_email));
-- The existing team/campaign index cannot provide this team-wide sort directly.
CREATE INDEX IF NOT EXISTS idx_discovery_jobs_team_updated
ON discovery_jobs(team, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_call_user_week_created
ON lead_call_records(user_id, week_start, created_at DESC);
