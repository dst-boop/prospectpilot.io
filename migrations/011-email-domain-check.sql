ALTER TABLE prospect_jobs DROP CONSTRAINT IF EXISTS prospect_jobs_action_check;
ALTER TABLE prospect_jobs ADD CONSTRAINT prospect_jobs_action_check
 CHECK(action IN ('search','enrich','verify','check_domain'));
