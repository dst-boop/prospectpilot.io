CREATE TABLE IF NOT EXISTS prospect_contacts (
 id TEXT PRIMARY KEY,
 user_id TEXT NOT NULL,
 payload JSONB NOT NULL,
 identity_keys JSONB NOT NULL DEFAULT '[]',
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS prospect_contacts_owner ON prospect_contacts(user_id,created_at DESC,id);
CREATE INDEX IF NOT EXISTS prospect_contacts_keys ON prospect_contacts USING gin(identity_keys);
CREATE TABLE IF NOT EXISTS prospect_lists (
 id TEXT PRIMARY KEY,
 user_id TEXT NOT NULL,
 name TEXT NOT NULL,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 UNIQUE(user_id,name)
);
CREATE TABLE IF NOT EXISTS prospect_list_members (
 list_id TEXT NOT NULL REFERENCES prospect_lists(id) ON DELETE CASCADE,
 contact_id TEXT NOT NULL REFERENCES prospect_contacts(id) ON DELETE CASCADE,
 added_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 PRIMARY KEY(list_id,contact_id)
);
CREATE TABLE IF NOT EXISTS prospect_imports (
 id TEXT PRIMARY KEY,
 user_id TEXT NOT NULL,
 fingerprint TEXT NOT NULL,
 source TEXT NOT NULL,
 result JSONB NOT NULL,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 UNIQUE(user_id,fingerprint)
);
CREATE TABLE IF NOT EXISTS prospect_saved_searches (
 id TEXT PRIMARY KEY,
 user_id TEXT NOT NULL,
 name TEXT NOT NULL,
 filters JSONB NOT NULL,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 UNIQUE(user_id,name)
);
