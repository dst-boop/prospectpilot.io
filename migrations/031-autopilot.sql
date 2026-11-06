-- Autopilot: the enrichment ladder, run by the queue instead of by a tab.
--
-- Lead Qualifier had this, and its own comment admits the weakness: "the loop
-- runs in the page -- as every enrichment loop here does". A closed tab paused
-- the run. ProspectPilot already has the worker and the five-minute scheduler,
-- so the run belongs there and the browser is not part of it.
--
-- `steps` is the ladder the operator approved, in the order it will be walked:
-- cheapest first, which is the whole saving. Each step is enqueued only once
-- the one before it has finished, so a contact the free domain check rules out
-- never reaches the paid verification. `cursor` is how far it has got.
--
-- `approved_micros` is the worst case the operator approved once, and it bounds
-- the whole run: before each step is enqueued, what the run has already
-- reserved is added to that step's quote, and the run pauses rather than
-- exceed it. The per-job ceiling and the shared daily cap still apply.
CREATE TABLE IF NOT EXISTS prospect_autopilot_runs (
 id TEXT PRIMARY KEY,
 user_id TEXT NOT NULL,
 list_id TEXT REFERENCES prospect_lists(id) ON DELETE CASCADE,
 steps JSONB NOT NULL,
 cursor INTEGER NOT NULL DEFAULT 0 CHECK(cursor>=0),
 approved_micros BIGINT NOT NULL CHECK(approved_micros>=0),
 status TEXT NOT NULL DEFAULT 'running' CHECK(status IN ('running','paused','done','stopped')),
 note TEXT NOT NULL DEFAULT '',
 job_ids JSONB NOT NULL DEFAULT '[]',
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- One live run per list, so two runs cannot race the same contacts and spend
-- the budget twice. A list-less run (the whole workspace) takes the empty key.
CREATE UNIQUE INDEX IF NOT EXISTS prospect_autopilot_one_live
 ON prospect_autopilot_runs(user_id,COALESCE(list_id,'')) WHERE status IN ('running','paused');
CREATE INDEX IF NOT EXISTS prospect_autopilot_live ON prospect_autopilot_runs(status,updated_at);
