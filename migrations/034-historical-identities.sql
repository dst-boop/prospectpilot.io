-- Additive storage only. Older applications do not enforce these review holds;
-- schema acceptance alone is NOT sufficient for safe rollback compatibility.
CREATE TABLE IF NOT EXISTS prospect_identity_evidence (
 user_id TEXT NOT NULL,
 token_owner_id TEXT NOT NULL,
 record_kind TEXT NOT NULL CHECK(record_kind IN ('contact','lead')),
 record_id TEXT NOT NULL,
 key_hash TEXT NOT NULL,
 key_version TEXT NOT NULL,
 PRIMARY KEY(user_id,record_kind,record_id,token_owner_id,key_hash)
);
CREATE TABLE IF NOT EXISTS prospect_historical_identifiers (
 user_id TEXT NOT NULL,
 token_owner_id TEXT NOT NULL,
 key_hash TEXT NOT NULL,
 key_version TEXT NOT NULL,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 PRIMARY KEY(user_id,token_owner_id,key_hash)
);
CREATE TABLE IF NOT EXISTS prospect_historical_reviews (
 id TEXT PRIMARY KEY,
 user_id TEXT NOT NULL,
 destination TEXT NOT NULL CHECK(destination IN ('contact','lead')),
 fingerprint TEXT NOT NULL,
 candidate JSONB NOT NULL,
 payload JSONB NOT NULL,
 key_hashes TEXT[] NOT NULL,
 matched_key_hashes TEXT[] NOT NULL DEFAULT '{}',
 status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','resolved','discarded')),
 resolution JSONB NOT NULL DEFAULT '{}',
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 resolved_at TIMESTAMPTZ
);
CREATE UNIQUE INDEX IF NOT EXISTS prospect_historical_reviews_open ON prospect_historical_reviews(user_id,fingerprint) WHERE status='open';
CREATE INDEX IF NOT EXISTS prospect_historical_reviews_owner ON prospect_historical_reviews(user_id,status,created_at DESC);

CREATE INDEX IF NOT EXISTS prospect_historical_reviews_keys ON prospect_historical_reviews USING gin(key_hashes);

CREATE INDEX IF NOT EXISTS prospect_historical_identifiers_versions ON prospect_historical_identifiers(user_id,key_version);

CREATE INDEX IF NOT EXISTS prospect_historical_reviews_matched_keys ON prospect_historical_reviews USING gin(matched_key_hashes);
