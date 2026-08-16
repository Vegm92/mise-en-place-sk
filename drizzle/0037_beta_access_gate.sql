CREATE TABLE "app_flags" (
	"key" text PRIMARY KEY NOT NULL,
	"value" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "founder" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "access_status" text DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "founder" boolean DEFAULT false NOT NULL;--> statement-breakpoint
UPDATE "users" SET "access_status" = 'approved';--> statement-breakpoint
INSERT INTO "app_flags" ("key", "value") VALUES ('access_open', 'false') ON CONFLICT ("key") DO NOTHING;