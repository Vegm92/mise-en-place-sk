-- Migration 0051: capture waitlist/signup attribution (issue #326)
--
-- The waitlist and users tables stored no UTM/campaign/referrer data, so
-- there was no way to tell which message converted a visitor. All new
-- columns are nullable text — additive, no backfill. funnel_events lets
-- src/lib/server/events.ts#trackAnonymousEvent record pre-signup funnel
-- events (e.g. waitlist_joined) with no restaurantId, without widening
-- system_notifications, whose restaurantId NOT NULL is load-bearing for
-- tenant scoping.

CREATE TABLE "funnel_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"event" text NOT NULL,
	"payload" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "attr_source" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "attr_campaign" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "attr_variant" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "attr_segment" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "attr_referrer" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "attr_landing_path" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "attr_referred_by" text;--> statement-breakpoint
ALTER TABLE "waitlist" ADD COLUMN "source" text;--> statement-breakpoint
ALTER TABLE "waitlist" ADD COLUMN "campaign" text;--> statement-breakpoint
ALTER TABLE "waitlist" ADD COLUMN "variant" text;--> statement-breakpoint
ALTER TABLE "waitlist" ADD COLUMN "segment" text;--> statement-breakpoint
ALTER TABLE "waitlist" ADD COLUMN "referrer" text;--> statement-breakpoint
ALTER TABLE "waitlist" ADD COLUMN "landing_path" text;--> statement-breakpoint
ALTER TABLE "waitlist" ADD COLUMN "referred_by" text;--> statement-breakpoint
CREATE INDEX "idx_funnel_events_event_created" ON "funnel_events" USING btree ("event","created_at");