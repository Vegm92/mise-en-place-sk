CREATE TABLE "worker_heartbeats" (
	"id" text PRIMARY KEY NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_job_completed_at" timestamp with time zone,
	"jobs_completed" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "batch_items" ADD COLUMN "queued_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "batch_items_queued_at_idx" ON "batch_items" USING btree ("queued_at");--> statement-breakpoint
UPDATE "batch_items" SET "queued_at" = "updated_at" WHERE "status" IN ('queued', 'extracting') AND "queued_at" IS NULL;
