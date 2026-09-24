-- Outreach cadence needs to know which channel each logged touch used.
-- Migration 013 records the outcome but not the channel, so a 45-day touch
-- count could not tell an email from a dial and no sequence step could be
-- resumed. Existing rows keep NULL: an unknown channel still counts against
-- the cap, it just cannot be attributed to email, phone or LinkedIn.
ALTER TABLE advisor_activities ADD COLUMN IF NOT EXISTS channel TEXT;
ALTER TABLE advisor_activities ADD COLUMN IF NOT EXISTS step TEXT;

-- The cap and the rest period are both read as "this lead, this window",
-- and the scoreboard reads "this user, this window".
CREATE INDEX IF NOT EXISTS advisor_activity_lead_window ON advisor_activities(lead_id, created_at);

-- A rest period is a decision, not a derived value: it starts when the cap is
-- reached or a sequence ends, and it has to survive the touches ageing out of
-- the 45-day window. Storing it keeps the reason the lead is resting, so the
-- worklist can say why rather than just going quiet.
CREATE TABLE IF NOT EXISTS advisor_rest_periods (
  lead_id TEXT NOT NULL REFERENCES discovery_leads(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  reason TEXT NOT NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resume_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY(lead_id, user_id)
);
CREATE INDEX IF NOT EXISTS advisor_rest_resume ON advisor_rest_periods(user_id, resume_at);

-- A drafted voicemail has to say the advisor's name, firm and callback number,
-- and discovery_users carries only a full name. Kept separate from that table
-- so identity stays where authentication put it and presentation lives here.
CREATE TABLE IF NOT EXISTS advisor_profiles (
  user_id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL DEFAULT '',
  firm TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  metro TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
