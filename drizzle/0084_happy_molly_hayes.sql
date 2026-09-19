ALTER TABLE "waitlist" ADD COLUMN "referral_code" text;--> statement-breakpoint
ALTER TABLE "waitlist" ADD CONSTRAINT "waitlist_referral_code_unique" UNIQUE("referral_code");