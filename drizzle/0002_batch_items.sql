-- Batch invoice uploads — replaces the upload_sessions JSON-blob chain.
-- One batch per upload, one item per invoice. Status/error/extracted_data are
-- separate columns so web and worker update only the fields they own.

CREATE TABLE IF NOT EXISTS "upload_batches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"restaurant_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "upload_batches_restaurant_id_restaurants_id_fk"
		FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE cascade
);

CREATE TABLE IF NOT EXISTS "batch_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"batch_id" uuid NOT NULL,
	"restaurant_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"file_key" text NOT NULL,
	"display_name" text NOT NULL,
	-- pending | queued | extracting | done | failed | confirmed | discarded
	"status" text DEFAULT 'pending' NOT NULL,
	"extracted_data" jsonb,
	"conversion_notes" jsonb,
	"extract_error" text,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "batch_items_batch_id_upload_batches_id_fk"
		FOREIGN KEY ("batch_id") REFERENCES "public"."upload_batches"("id") ON DELETE cascade,
	CONSTRAINT "batch_items_restaurant_id_restaurants_id_fk"
		FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE cascade
);

CREATE INDEX IF NOT EXISTS "batch_items_batch_id_idx" ON "batch_items" ("batch_id");
CREATE INDEX IF NOT EXISTS "batch_items_updated_at_idx" ON "batch_items" ("updated_at");
