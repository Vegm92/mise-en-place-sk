-- Migration 0016: Stripe webhook event dedup + out-of-order protection (#240)
--
-- handleWebhookEvent verified the signature but processed every delivery.
-- Stripe retries webhooks for up to 3 days and does not guarantee ordering, so
-- (a) a retried checkout.session.completed re-sent the confirmation email and
-- re-fired plan_upgraded, and (b) a delayed updated(past_due) arriving after
-- updated(active) reverted a customer who had just paid.

-- (a) Event-id dedup. The handler claims each event id (INSERT … ON CONFLICT DO
--     NOTHING RETURNING); an empty result means already-processed → return 200.
CREATE TABLE IF NOT EXISTS stripe_webhook_events (
	event_id     text PRIMARY KEY,
	processed_at timestamptz NOT NULL DEFAULT now()
);

-- Written only by the server (direct owner connection); no RLS needed on
-- Railway Postgres (no Data API — see drizzle/0001_rls_policies.sql).

-- (b) Ordering guard. Stores the Stripe event.created of the last lifecycle
--     event applied to the subscription; the updated/deleted branch skips any
--     event not newer than this.
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS last_event_at timestamptz;
