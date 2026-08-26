CREATE TABLE "whatsapp_session" (
	"id" text PRIMARY KEY NOT NULL,
	"data" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "batch_items" ADD COLUMN "source" text DEFAULT 'web' NOT NULL;--> statement-breakpoint
ALTER TABLE "batch_items" ADD COLUMN "source_ref" text;--> statement-breakpoint
ALTER TABLE "batch_items" ADD COLUMN "job_code" text;--> statement-breakpoint
ALTER TABLE "batch_items" ADD COLUMN "review_status" text;--> statement-breakpoint
CREATE UNIQUE INDEX "batch_items_job_code_unique" ON "batch_items" USING btree ("job_code") WHERE "batch_items"."review_status" is null or "batch_items"."review_status" = 'pending';--> statement-breakpoint
CREATE INDEX "batch_items_source_ref_idx" ON "batch_items" USING btree ("source_ref");