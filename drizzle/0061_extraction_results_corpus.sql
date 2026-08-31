CREATE TABLE "extraction_results" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"restaurant_id" uuid NOT NULL,
	"batch_item_id" uuid,
	"file_key" text NOT NULL,
	"display_name" text,
	"source" text DEFAULT 'web' NOT NULL,
	"run_kind" text DEFAULT 'live' NOT NULL,
	"prompt_version" text NOT NULL,
	"model" text,
	"extracted_data" jsonb NOT NULL,
	"field_confidences" jsonb,
	"confidence" real,
	"conversion_notes" jsonb,
	"total_mismatch" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "extraction_results" ADD CONSTRAINT "extraction_results_restaurant_id_restaurants_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "extraction_results" ADD CONSTRAINT "extraction_results_batch_item_id_batch_items_id_fk" FOREIGN KEY ("batch_item_id") REFERENCES "public"."batch_items"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "extraction_results_restaurant_created_idx" ON "extraction_results" USING btree ("restaurant_id","created_at");--> statement-breakpoint
CREATE INDEX "extraction_results_file_key_idx" ON "extraction_results" USING btree ("restaurant_id","file_key");--> statement-breakpoint
CREATE INDEX "extraction_results_prompt_version_idx" ON "extraction_results" USING btree ("prompt_version","created_at");--> statement-breakpoint
CREATE INDEX "extraction_results_batch_item_idx" ON "extraction_results" USING btree ("batch_item_id");