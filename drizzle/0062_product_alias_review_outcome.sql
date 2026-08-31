-- Migration 0062: track fuzzy product-match lineage separately from current
-- disposition (#827) — `source`/`confirmed_at` get overwritten to 'user' the
-- moment a human reviews a fuzzy suggestion, which destroyed the fact that it
-- ever was a fuzzy auto-merge. `original_source` is set once at row creation
-- and never touched again; `review_outcome` is set the first time a human
-- acts on a fuzzy suggestion (confirmed as-is, or rejected in favor of a
-- different/new product) and left alone after that.

ALTER TABLE "product_aliases" ADD COLUMN "original_source" text;--> statement-breakpoint
ALTER TABLE "product_aliases" ADD COLUMN "review_outcome" text;--> statement-breakpoint

-- Backfill: rows still sitting at their original 'exact'/'fuzzy' source have
-- not been touched by a human yet, so their current source *is* their
-- original source. Rows already at source='user' predate this migration and
-- their original source is unrecoverable — original_source stays NULL for
-- those, meaning "lineage unknown".
UPDATE "product_aliases" SET "original_source" = "source" WHERE "source" IN ('exact', 'fuzzy');--> statement-breakpoint

ALTER TABLE "product_aliases" ADD CONSTRAINT "product_aliases_review_outcome_valid" CHECK ("product_aliases"."review_outcome" IS NULL OR "product_aliases"."review_outcome" IN ('confirmed','rejected'));
