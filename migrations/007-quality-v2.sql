-- Retain source observations; require requalification against the five-gate rule.
ALTER TABLE lab_observations DROP CONSTRAINT IF EXISTS lab_observations_field_check;
ALTER TABLE lab_observations ADD CONSTRAINT lab_observations_field_check
  CHECK(field IN ('age','residence','retirement','contact','net_worth'));
ALTER TABLE lab_qualification ADD COLUMN IF NOT EXISTS rule_version TEXT NOT NULL DEFAULT 'retirement-evidence-1';
UPDATE lab_qualification SET status='unassessed',score=0,first_verified_at=NULL
  WHERE rule_version <> 'retirement-evidence-2';
