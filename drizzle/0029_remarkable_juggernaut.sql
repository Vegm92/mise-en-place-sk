CREATE TABLE "dead_letter_queue" (
	"id" serial PRIMARY KEY NOT NULL,
	"queue" text NOT NULL,
	"restaurant_id" uuid,
	"source_id" text,
	"job_id" text,
	"error_class" text NOT NULL,
	"error_message" text NOT NULL,
	"stack" text,
	"payload" jsonb,
	"attempt" integer DEFAULT 1 NOT NULL,
	"occurrences" integer DEFAULT 1 NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reviewed_at" timestamp with time zone,
	"reviewed_by" text
);
--> statement-breakpoint
ALTER TABLE "dead_letter_queue" ADD CONSTRAINT "dead_letter_queue_restaurant_id_restaurants_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "dead_letter_queue_status_idx" ON "dead_letter_queue" USING btree ("status","last_seen_at");--> statement-breakpoint
CREATE INDEX "dead_letter_queue_queue_idx" ON "dead_letter_queue" USING btree ("queue","last_seen_at");--> statement-breakpoint
CREATE INDEX "dead_letter_queue_restaurant_idx" ON "dead_letter_queue" USING btree ("restaurant_id");--> statement-breakpoint
CREATE INDEX "dead_letter_queue_dedupe_idx" ON "dead_letter_queue" USING btree ("queue","source_id","error_class","status");