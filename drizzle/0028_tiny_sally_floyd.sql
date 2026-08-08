CREATE TABLE "acquisition_costs" (
	"id" serial PRIMARY KEY NOT NULL,
	"month" text NOT NULL,
	"category" text NOT NULL,
	"amount_cents" integer NOT NULL,
	"note" text,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "mrr_snapshots" (
	"id" serial PRIMARY KEY NOT NULL,
	"month" text NOT NULL,
	"restaurant_id" uuid NOT NULL,
	"plan_tier" text NOT NULL,
	"status" text NOT NULL,
	"mrr_cents" integer DEFAULT 0 NOT NULL,
	"at_risk_cents" integer DEFAULT 0 NOT NULL,
	"source" text DEFAULT 'live' NOT NULL,
	"captured_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "revenue_assumptions" (
	"key" text PRIMARY KEY NOT NULL,
	"value" text NOT NULL,
	"updated_by" text,
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "mrr_snapshots" ADD CONSTRAINT "mrr_snapshots_restaurant_id_restaurants_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "acquisition_costs_month_idx" ON "acquisition_costs" USING btree ("month");--> statement-breakpoint
CREATE UNIQUE INDEX "mrr_snapshots_month_restaurant_unique" ON "mrr_snapshots" USING btree ("month","restaurant_id");--> statement-breakpoint
CREATE INDEX "mrr_snapshots_month_idx" ON "mrr_snapshots" USING btree ("month");--> statement-breakpoint
CREATE INDEX "mrr_snapshots_paying_idx" ON "mrr_snapshots" USING btree ("restaurant_id","month") WHERE "mrr_snapshots"."mrr_cents" > 0;