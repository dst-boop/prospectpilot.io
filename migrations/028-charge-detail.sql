-- Each paid reservation records what was bought, not just how much was
-- reserved, so cost per lead can be broken down and checked later:
--  action, units and unit_price_micros: what the quote was made of
--    (reserved_micros = units * unit_price_micros);
--  delivered_units: for a search, the records the provider actually returned
--    (People Data Labs bills search per returned record; the reservation is
--    the maximum requested);
--  lead_id: the lead the money was spent on, from lead_acquisitions. Unlike
--    the task's contact_id it survives "Delete this person", so spend per lead
--    stays exact after a deletion without keeping the person.
-- Filled by triggers from the task the charge belongs to, so every place that
-- reserves a cost is covered. Allowances still count reserved_micros.
ALTER TABLE prospect_charges ADD COLUMN IF NOT EXISTS action TEXT;
ALTER TABLE prospect_charges ADD COLUMN IF NOT EXISTS units INTEGER CHECK(units IS NULL OR units>=0);
ALTER TABLE prospect_charges ADD COLUMN IF NOT EXISTS unit_price_micros BIGINT CHECK(unit_price_micros IS NULL OR unit_price_micros>=0);
ALTER TABLE prospect_charges ADD COLUMN IF NOT EXISTS delivered_units INTEGER CHECK(delivered_units IS NULL OR delivered_units>=0);
ALTER TABLE prospect_charges ADD COLUMN IF NOT EXISTS lead_id TEXT REFERENCES lead_acquisitions(id);

CREATE OR REPLACE FUNCTION describe_prospect_charge() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE task RECORD;
BEGIN
 SELECT action,payload,contact_id INTO task FROM prospect_tasks WHERE id=NEW.task_id;
 NEW.action := COALESCE(NEW.action,task.action);
 IF NEW.units IS NULL THEN
  NEW.units := CASE WHEN task.action='search' AND task.payload->'filters'->>'size' ~ '^[0-9]{1,6}$' THEN (task.payload->'filters'->>'size')::int ELSE 1 END;
 END IF;
 IF NEW.unit_price_micros IS NULL AND NEW.units>0 AND NEW.reserved_micros % NEW.units=0 THEN
  NEW.unit_price_micros := NEW.reserved_micros/NEW.units;
 END IF;
 IF NEW.lead_id IS NULL AND task.contact_id IS NOT NULL THEN
  NEW.lead_id := (SELECT id FROM lead_acquisitions WHERE contact_id=task.contact_id);
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS prospect_charges_describe ON prospect_charges;
CREATE TRIGGER prospect_charges_describe BEFORE INSERT ON prospect_charges FOR EACH ROW EXECUTE FUNCTION describe_prospect_charge();

-- A search's result states how many records came back. Recorded once; a later
-- blanking of the task (Delete this person) does not undo it.
CREATE OR REPLACE FUNCTION settle_search_charge() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.action='search' AND jsonb_typeof(NEW.result->'retrieved')='number' THEN
  UPDATE prospect_charges SET delivered_units=LEAST(GREATEST((NEW.result->>'retrieved')::numeric,0),COALESCE(units,2147483647))::int
  WHERE task_id=NEW.id AND delivered_units IS NULL;
 END IF;
 RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS prospect_tasks_settle_search ON prospect_tasks;
CREATE TRIGGER prospect_tasks_settle_search AFTER UPDATE OF result ON prospect_tasks FOR EACH ROW EXECUTE FUNCTION settle_search_charge();

-- Earlier charges: describe them from their tasks where the task still says.
UPDATE prospect_charges c SET action=t.action,
 units=CASE WHEN t.action='search' AND t.payload->'filters'->>'size' ~ '^[0-9]{1,6}$' THEN (t.payload->'filters'->>'size')::int ELSE 1 END,
 lead_id=(SELECT a.id FROM lead_acquisitions a WHERE a.contact_id=t.contact_id),
 delivered_units=CASE WHEN t.action='search' AND jsonb_typeof(t.result->'retrieved')='number' THEN GREATEST((t.result->>'retrieved')::numeric,0)::int END
FROM prospect_tasks t WHERE t.id=c.task_id AND c.action IS NULL;
UPDATE prospect_charges SET unit_price_micros=reserved_micros/units WHERE unit_price_micros IS NULL AND units>0 AND reserved_micros % units=0;
UPDATE prospect_charges SET delivered_units=LEAST(delivered_units,units) WHERE delivered_units>units;
CREATE INDEX IF NOT EXISTS prospect_charges_lead ON prospect_charges(lead_id) WHERE lead_id IS NOT NULL;
