-- Select the latest filing before applying location or distribution filters.
CREATE INDEX IF NOT EXISTS employer_plan_latest_filing
ON employer_plan_catalog ((payload->>'ein'), (payload->>'plan_number'), plan_year DESC,
 (payload->>'period_start') DESC, (payload->>'filed_at') DESC, id DESC);
