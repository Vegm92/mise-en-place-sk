ALTER TABLE "subscriptions" ADD COLUMN "past_due_since" timestamp with time zone;
--> statement-breakpoint
UPDATE "subscriptions" SET "past_due_since" = COALESCE("updated_at", now()) WHERE "status" = 'past_due';
