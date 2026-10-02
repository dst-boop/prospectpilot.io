-- Top-up packs: one-time Stripe payments that add paid-lookup allowance to the
-- month they are bought in. One row per paid Checkout session, written only by
-- the signed webhook, so a retried delivery cannot credit a pack twice.
-- Advisor account data, never prospect data.
CREATE TABLE IF NOT EXISTS billing_topups (
 session_id TEXT PRIMARY KEY,
 user_id TEXT NOT NULL,
 pack TEXT NOT NULL,
 allowance_micros BIGINT NOT NULL CHECK(allowance_micros>=0),
 purchased_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS billing_topups_user_month ON billing_topups(user_id,purchased_at);
