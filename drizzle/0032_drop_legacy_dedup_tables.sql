-- Migration 0032: cut over to idempotency_keys, drop the three old tables (#389)
--
-- Copy first, drop second, in one transaction: a live claim made seconds
-- before the deploy must still suppress its replay afterwards, so the rows
-- move rather than being discarded. ON CONFLICT DO NOTHING makes the copy
-- re-runnable and absorbs any row the new code has already written under the
-- same scope while the migration ran.
--
-- Scope names match the SCOPE constants in src/lib/server/idempotency.ts.

INSERT INTO "idempotency_keys" ("scope", "key", "restaurant_id", "claimed_at")
	SELECT 'form-submit', "key"::text, "restaurant_id", "created_at" FROM "processed_requests"
	ON CONFLICT DO NOTHING;--> statement-breakpoint
INSERT INTO "idempotency_keys" ("scope", "key", "claimed_at")
	SELECT 'whatsapp', "message_id", "received_at" FROM "whatsapp_processed_messages"
	ON CONFLICT DO NOTHING;--> statement-breakpoint
INSERT INTO "idempotency_keys" ("scope", "key", "claimed_at")
	SELECT 'stripe-webhook', "event_id", "processed_at" FROM "stripe_webhook_events"
	ON CONFLICT DO NOTHING;--> statement-breakpoint
DROP TABLE "processed_requests" CASCADE;--> statement-breakpoint
DROP TABLE "stripe_webhook_events" CASCADE;--> statement-breakpoint
DROP TABLE "whatsapp_processed_messages" CASCADE;
