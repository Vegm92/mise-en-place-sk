-- Migration 0080: record the latency and depth numbers every scaling decision
-- needs (issue #1003).
--
-- Three additions, one per unmeasured thing in the audit's gap table:
--
--  * `metric_samples` — a coarse pre-aggregated series. Producers bucket in
--    memory and flush one row per (name, label) per window, so route latency
--    costs a few hundred rows a day rather than one per request. Platform-wide
--    by design: it holds route ids and queue names, never tenant rows, so it
--    carries no restaurant_id and no RLS policy.
--  * `batch_items.extracted_at` — makes end-to-end extraction latency a
--    subtraction on the row. The old query joined extraction_results, which
--    only records successful live runs, so it reported the latency of the happy
--    path as if it were the latency of the pipeline.
--  * `llm_usage_log.duration_ms` — tokens and cost cannot tell a slow model
--    from a slow queue.

CREATE TABLE "metric_samples" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"label" text,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"count" integer DEFAULT 1 NOT NULL,
	"sum" double precision DEFAULT 0 NOT NULL,
	"min" double precision,
	"max" double precision
);
--> statement-breakpoint
ALTER TABLE "batch_items" ADD COLUMN "extracted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "llm_usage_log" ADD COLUMN "duration_ms" integer;--> statement-breakpoint
CREATE INDEX "metric_samples_name_at_idx" ON "metric_samples" USING btree ("name","at");--> statement-breakpoint
CREATE INDEX "batch_items_extracted_at_idx" ON "batch_items" USING btree ("extracted_at");
--> statement-breakpoint

-- Backfill extracted_at for settled items, so the latency series does not start
-- from zero. extraction_results.created_at is when the extraction landed and is
-- what the previous query used, which keeps the historical numbers comparable;
-- rows with no corpus entry (failures, and successes predating the corpus) stay
-- NULL rather than being guessed at from updated_at, which also moves on confirm.
UPDATE "batch_items" AS bi
SET "extracted_at" = er."created_at"
FROM "extraction_results" AS er
WHERE er."batch_item_id" = bi."id"
  AND er."run_kind" = 'live'
  AND bi."extracted_at" IS NULL
  AND bi."queued_at" IS NOT NULL
  AND bi."status" IN ('done', 'confirmed');
