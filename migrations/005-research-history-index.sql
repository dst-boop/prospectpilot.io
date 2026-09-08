CREATE INDEX IF NOT EXISTS research_jobs_user_lead_latest ON research_jobs(user_id,lead_id,created_at DESC,id DESC);
