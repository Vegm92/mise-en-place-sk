-- Migration 0025: account-level WhatsApp webhook events (issue #321)
--
-- We operate one WhatsApp Business number for every tenant (restaurants are
-- resolved from the sender's number via whatsapp_contacts), which is the right
-- model for this market but concentrates a shared reputation risk: Meta tracks a
-- quality rating per business phone number, driven largely by user blocks and
-- reports, so blocks caused by one restaurant's staff degrade the rating for all
-- of them. A sufficiently degraded number can be restricted, and ingest then
-- stops for every tenant at once.
--
-- The webhook previously extracted only `value.messages[]`, so a downgrade would
-- have been discovered from support tickets rather than delivered. Nothing here
-- is tenant-scoped, because the WABA is not — this is platform state.

CREATE TABLE "whatsapp_account_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"field" text NOT NULL,
	"event" text,
	"phone_number" text,
	"quality_rating" text,
	"messaging_limit" text,
	"severity" text DEFAULT 'info' NOT NULL,
	"payload" jsonb,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "idx_whatsapp_account_events_received" ON "whatsapp_account_events" USING btree ("received_at");--> statement-breakpoint
CREATE INDEX "idx_whatsapp_account_events_severity" ON "whatsapp_account_events" USING btree ("severity","received_at");
--> statement-breakpoint
-- Written only by the webhook handler (direct owner connection); no RLS needed
-- on Railway Postgres (no Data API — see drizzle/0001_rls_policies.sql).
