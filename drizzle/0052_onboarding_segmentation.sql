-- Migration 0052: onboarding segmentation (issue #328)
--
-- Onboarding captured only the restaurant name, so nothing downstream (the
-- weekly digest prompt, the welcome email) could personalise for the kind of
-- kitchen or where the signup came from. All five columns are nullable text
-- — additive, no backfill, and deliberately not a Postgres enum so the
-- venue-type/category option lists stay app-level constants a product owner
-- can amend without a migration. acquisition_source/acquisition_variant
-- mirror the users.attr_* columns from #326, scoped to the restaurant this
-- time instead of the signing-up user.

ALTER TABLE "restaurants" ADD COLUMN "venue_type" text;--> statement-breakpoint
ALTER TABLE "restaurants" ADD COLUMN "city" text;--> statement-breakpoint
ALTER TABLE "restaurants" ADD COLUMN "top_category" text;--> statement-breakpoint
ALTER TABLE "restaurants" ADD COLUMN "acquisition_source" text;--> statement-breakpoint
ALTER TABLE "restaurants" ADD COLUMN "acquisition_variant" text;