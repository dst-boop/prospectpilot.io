-- Cost per lead needs two durable facts per advisor: when each lead arrived and
-- what was spent. Spend is already a ledger (prospect_charges, lab_costs). Leads
-- were only countable from the live directory, which shrinks when someone is
-- deleted, so last month's cost per lead would change after the fact.
--
-- lead_acquisitions is append-only: one row per person added to an advisor's
-- contact directory, written by a trigger so no insert path can skip it. It
-- holds no personal data. Its link to the contact is set to NULL when the
-- contact is deleted ("Delete this person"); the row, the date and the source
-- stay, so history stays exact.
CREATE TABLE IF NOT EXISTS lead_acquisitions (
 id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
 user_id TEXT NOT NULL,
 channel TEXT NOT NULL CHECK(channel IN ('contacts','research_lab')),
 source TEXT NOT NULL CHECK(source IN ('csv_import','zoominfo_import','daily_leads','provider_search','research_lab')),
 contact_id TEXT REFERENCES prospect_contacts(id) ON DELETE SET NULL,
 import_id TEXT,
 job_id TEXT,
 actor_user_id TEXT,
 acquired_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS lead_acquisitions_contact ON lead_acquisitions(contact_id) WHERE contact_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS lead_acquisitions_user_date ON lead_acquisitions(user_id,acquired_at);

CREATE OR REPLACE FUNCTION record_contact_acquisition() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE first JSONB := NEW.payload->'source_history'->0;
BEGIN
 INSERT INTO lead_acquisitions(user_id,channel,source,contact_id,import_id,job_id,actor_user_id,acquired_at)
 VALUES(NEW.user_id,'contacts',
  CASE WHEN NEW.payload->>'source_kind'='provider' THEN 'provider_search'
       WHEN jsonb_typeof(NEW.payload->'deliveries')='object' THEN 'daily_leads'
       WHEN NEW.payload->>'source_kind'='zoominfo_csv' THEN 'zoominfo_import'
       ELSE 'csv_import' END,
  NEW.id,first->>'import_id',first->>'job_id',COALESCE(first->>'actor_uid',NEW.user_id),NEW.created_at)
 ON CONFLICT DO NOTHING;
 RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS prospect_contacts_acquired ON prospect_contacts;
CREATE TRIGGER prospect_contacts_acquired AFTER INSERT ON prospect_contacts FOR EACH ROW EXECUTE FUNCTION record_contact_acquisition();

-- Contacts already in directories count from the day they were added. People
-- deleted before this migration are not recoverable and are not counted.
INSERT INTO lead_acquisitions(user_id,channel,source,contact_id,import_id,job_id,actor_user_id,acquired_at)
SELECT user_id,'contacts',
 CASE WHEN payload->>'source_kind'='provider' THEN 'provider_search'
      WHEN jsonb_typeof(payload->'deliveries')='object' THEN 'daily_leads'
      WHEN payload->>'source_kind'='zoominfo_csv' THEN 'zoominfo_import'
      ELSE 'csv_import' END,
 id,payload->'source_history'->0->>'import_id',payload->'source_history'->0->>'job_id',COALESCE(payload->'source_history'->0->>'actor_uid',user_id),created_at
FROM prospect_contacts ON CONFLICT DO NOTHING;

-- Usage of an advisor's own provider subscription (ZoomInfo is bring-your-own),
-- as reported by the import that delivered it: the daily-leads CSV states the
-- enrichment credits each row cost. Self-reported, so kept apart from
-- prospect_charges, which the server reserves itself. usage_key stops the
-- same delivery, imported into a second list, from counting twice: it is built
-- from the lead's random ledger id and the delivery day (or, for a row tied to
-- no lead, the import and row), never from anything about the person.
CREATE TABLE IF NOT EXISTS prospect_external_usage (
 id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
 user_id TEXT NOT NULL,
 provider TEXT NOT NULL CHECK(provider IN ('zoominfo')),
 usage_key TEXT NOT NULL,
 units INTEGER NOT NULL CHECK(units>0),
 usage_date DATE,
 import_id TEXT,
 lead_id TEXT REFERENCES lead_acquisitions(id),
 recorded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 UNIQUE(user_id,provider,usage_key)
);
CREATE INDEX IF NOT EXISTS prospect_external_usage_user_date ON prospect_external_usage(user_id,recorded_at);

-- Credits already recorded on daily-leads deliveries. Reports date usage by
-- usage_date (the delivery day). A delivery day that is not a real calendar
-- day (it was only warned about on import) is kept as no date; the CASE keeps
-- the casts behind the format check.
WITH credits AS (
 SELECT c.user_id,a.id AS lead_id,d.key AS list_id,(d.value->'signal'->>'credits')::int AS units,
  CASE WHEN d.value->'signal'->>'delivered_on' ~ '^[0-9]{4}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$'
   THEN CASE WHEN to_char((substr(d.value->'signal'->>'delivered_on',1,7)||'-01')::date+(substr(d.value->'signal'->>'delivered_on',9,2)::int-1),'YYYY-MM-DD')=d.value->'signal'->>'delivered_on'
    THEN (d.value->'signal'->>'delivered_on')::date END END AS day
 FROM prospect_contacts c
 CROSS JOIN LATERAL jsonb_each(CASE WHEN jsonb_typeof(c.payload->'deliveries')='object' THEN c.payload->'deliveries' ELSE '{}'::jsonb END) d
 JOIN lead_acquisitions a ON a.contact_id=c.id
 WHERE d.value->'signal'->>'credits' ~ '^[1-9][0-9]?$'
)
INSERT INTO prospect_external_usage(user_id,provider,usage_key,units,usage_date,lead_id)
SELECT user_id,'zoominfo',CASE WHEN day IS NOT NULL THEN 'lead:'||lead_id||':'||day ELSE 'lead:'||lead_id||':list:'||list_id END,units,day,lead_id
FROM credits ON CONFLICT DO NOTHING;
