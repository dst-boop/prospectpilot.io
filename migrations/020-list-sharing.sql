-- Shares grant access to one list, never to the owner's workspace.
-- Firebase UIDs remain authoritative even if an email address changes hands.
CREATE TABLE prospect_list_shares (
 list_id TEXT NOT NULL REFERENCES prospect_lists(id) ON DELETE CASCADE,
 recipient_uid TEXT NOT NULL,
 recipient_email TEXT NOT NULL,
 owner_email TEXT NOT NULL,
 role TEXT NOT NULL CHECK (role IN ('editor','viewer')),
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 PRIMARY KEY(list_id,recipient_uid)
);
CREATE INDEX prospect_list_shares_recipient ON prospect_list_shares(recipient_uid,list_id);
