-- Stripe billing. A membership row now also records the advisor's Stripe
-- customer and subscription and the subscription's status, written only by
-- the signed webhook. Account data about the advisor, never about prospects.
ALTER TABLE prospect_memberships ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT;
ALTER TABLE prospect_memberships ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT;
ALTER TABLE prospect_memberships ADD COLUMN IF NOT EXISTS status TEXT;
ALTER TABLE prospect_memberships ADD COLUMN IF NOT EXISTS current_period_end TIMESTAMPTZ;
-- When the recorded subscription was created: an event about an older
-- subscription (one the advisor replaced) never overwrites a newer one.
ALTER TABLE prospect_memberships ADD COLUMN IF NOT EXISTS subscription_created TIMESTAMPTZ;
-- Set when the advisor has scheduled a cancellation; the plan stays active until then.
ALTER TABLE prospect_memberships ADD COLUMN IF NOT EXISTS cancels_at TIMESTAMPTZ;
CREATE UNIQUE INDEX IF NOT EXISTS prospect_memberships_customer ON prospect_memberships(stripe_customer_id) WHERE stripe_customer_id IS NOT NULL;
-- Each Stripe event is applied once; a retried delivery is acknowledged and skipped.
CREATE TABLE IF NOT EXISTS billing_events (
 id TEXT PRIMARY KEY,
 type TEXT NOT NULL,
 received_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- At most one open Checkout per advisor: a second click or tab reuses it
-- instead of starting a second subscription.
CREATE TABLE IF NOT EXISTS billing_checkouts (
 user_id TEXT PRIMARY KEY,
 session_id TEXT NOT NULL,
 plan TEXT NOT NULL,
 url TEXT NOT NULL,
 expires_at TIMESTAMPTZ NOT NULL,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
