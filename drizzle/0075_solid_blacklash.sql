CREATE TABLE "prompt_change_proposals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"target_area" text NOT NULL,
	"correction_examples" jsonb NOT NULL,
	"proposed_diff" text NOT NULL,
	"rationale" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL
);
--> statement-breakpoint
ALTER TABLE "extraction_results" ADD COLUMN "pipeline_version" text;--> statement-breakpoint
CREATE INDEX "prompt_change_proposals_status_idx" ON "prompt_change_proposals" USING btree ("status","created_at");