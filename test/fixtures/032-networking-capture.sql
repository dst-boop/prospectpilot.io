-- Private, explicitly recorded interactions. No automatic relationships or consent.
CREATE TABLE IF NOT EXISTS prospect_networking_captures (
 id TEXT PRIMARY KEY,
 user_id TEXT NOT NULL,
 contact_id TEXT NOT NULL REFERENCES prospect_contacts(id) ON DELETE CASCADE,
 request_key TEXT NOT NULL,
 fingerprint TEXT NOT NULL,
 payload JSONB NOT NULL,
 result JSONB NOT NULL,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 UNIQUE(user_id,request_key)
);
CREATE INDEX IF NOT EXISTS prospect_networking_owner ON prospect_networking_captures(user_id,created_at DESC,id);
