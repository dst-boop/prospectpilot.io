CREATE TABLE IF NOT EXISTS linkedin_connections (
  user_id TEXT PRIMARY KEY,
  token_ciphertext TEXT NOT NULL,
  member_name TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  connected_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS linkedin_oauth_states (
  state_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL UNIQUE,
  session_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL
);
