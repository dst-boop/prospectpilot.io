-- Claude web research runs on the same budgeted provider queue.
ALTER TABLE prospect_jobs DROP CONSTRAINT IF EXISTS prospect_jobs_action_check;
ALTER TABLE prospect_jobs ADD CONSTRAINT prospect_jobs_action_check
 CHECK(action IN ('search','enrich','verify','check_domain','check_phone','web_research'));
