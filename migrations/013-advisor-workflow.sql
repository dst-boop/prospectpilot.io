CREATE TABLE IF NOT EXISTS advisor_activities (
  id TEXT PRIMARY KEY,
  lead_id TEXT NOT NULL REFERENCES discovery_leads(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  outcome TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  next_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, lead_id, idempotency_key)
);
CREATE INDEX IF NOT EXISTS advisor_activity_lead_date ON advisor_activities(lead_id, created_at DESC);
CREATE INDEX IF NOT EXISTS advisor_activity_user_date ON advisor_activities(user_id, created_at DESC);
CREATE TABLE IF NOT EXISTS advisor_contact_links (
  contact_id TEXT NOT NULL REFERENCES prospect_contacts(id) ON DELETE CASCADE,
  lead_id TEXT NOT NULL REFERENCES discovery_leads(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  PRIMARY KEY(contact_id, user_id)
);
CREATE INDEX IF NOT EXISTS advisor_contact_links_lead ON advisor_contact_links(lead_id);
