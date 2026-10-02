-- Which ProspectPilot plan each advisor is on. Plans themselves (name and
-- monthly allowance) are deployment settings in PROSPECT_PLANS, not rows, so
-- adding or repricing a plan needs no migration. An override sets one
-- advisor's allowance without inventing a plan. No prospect data lives here.
CREATE TABLE IF NOT EXISTS prospect_memberships (
 user_id TEXT PRIMARY KEY,
 plan TEXT NOT NULL,
 monthly_allowance_micros BIGINT CHECK(monthly_allowance_micros IS NULL OR monthly_allowance_micros>=0),
 updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Month-to-date spend per advisor is read on every paid reservation.
CREATE INDEX IF NOT EXISTS prospect_charges_user_date ON prospect_charges(user_id,reserved_at);
