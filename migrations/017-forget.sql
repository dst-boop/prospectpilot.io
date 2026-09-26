-- "Delete this person" leaves one thing behind: a tombstone of HASHED identity
-- keys, per user, so an import or a research run cannot bring the person back.
-- The hash is salted with the user id, so the table cannot be joined across
-- users or read back into an email address, phone number or name.
CREATE TABLE IF NOT EXISTS prospect_forgotten (
  user_id TEXT NOT NULL,
  key_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY(user_id, key_hash)
);
