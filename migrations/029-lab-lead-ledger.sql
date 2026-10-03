-- Research Lab discovery runs find new people too, and lab_costs records what
-- they spent. Record each person a discovery run is first to find in the same
-- append-only lead ledger, dated by the run, so lab cost per lead survives
-- later deletions (lab_run_leads rows go with a deleted lead). People brought
-- into the lab by an import run are not counted: they arrived as leads
-- elsewhere. No personal data: the link to the lead is set to NULL when the
-- lead is deleted.
ALTER TABLE lead_acquisitions ADD COLUMN IF NOT EXISTS lab_lead_id TEXT REFERENCES discovery_leads(id) ON DELETE SET NULL;
ALTER TABLE lead_acquisitions ADD COLUMN IF NOT EXISTS run_id TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS lead_acquisitions_lab_lead ON lead_acquisitions(lab_lead_id) WHERE lab_lead_id IS NOT NULL;

CREATE OR REPLACE FUNCTION record_lab_acquisition() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE run RECORD;
BEGIN
 IF NOT NEW.is_new OR (TG_OP='UPDATE' AND OLD.is_new) THEN RETURN NULL; END IF;
 SELECT user_id,kind,created_at INTO run FROM lab_runs WHERE id=NEW.run_id;
 IF run.kind IS DISTINCT FROM 'discovery' THEN RETURN NULL; END IF;
 INSERT INTO lead_acquisitions(user_id,channel,source,lab_lead_id,run_id,actor_user_id,acquired_at)
 VALUES(run.user_id,'research_lab','research_lab',NEW.lead_id,NEW.run_id,run.user_id,run.created_at)
 ON CONFLICT DO NOTHING;
 RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS lab_run_leads_acquired ON lab_run_leads;
CREATE TRIGGER lab_run_leads_acquired AFTER INSERT OR UPDATE OF is_new ON lab_run_leads FOR EACH ROW EXECUTE FUNCTION record_lab_acquisition();

INSERT INTO lead_acquisitions(user_id,channel,source,lab_lead_id,run_id,actor_user_id,acquired_at)
SELECT DISTINCT ON (l.lead_id) r.user_id,'research_lab','research_lab',l.lead_id,r.id,r.user_id,r.created_at
FROM lab_run_leads l JOIN lab_runs r ON r.id=l.run_id
WHERE l.is_new AND r.kind='discovery'
ORDER BY l.lead_id,r.created_at
ON CONFLICT DO NOTHING;
