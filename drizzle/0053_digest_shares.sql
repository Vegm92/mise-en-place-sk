-- Migration 0053: digest share tokens (issue #329)
--
-- Weekly digests and price-shock alerts had no share affordance — the only
-- surface where tenant-derived data leaves the tenant boundary. This table
-- backs a public, tokenised, anonymised view (/s/[token]): a cryptographically
-- random token (crypto.randomBytes, not sequential/nanoid-default) maps to a
-- restaurantId + ISO week. The public view is computed fresh from that pair at
-- request time — no supplier names, absolute euro figures, invoice numbers, or
-- restaurant name are ever stored on or served from this row; only the token
-- resolves to a tenant, and only percentage deltas are rendered. revokedAt
-- (nullable) lets the sharer kill a live link; a revoked or unknown token 404s.
-- Additive, no backfill.

CREATE TABLE "digest_shares" (
	"id" serial PRIMARY KEY NOT NULL,
	"token" text NOT NULL,
	"restaurant_id" uuid NOT NULL,
	"week" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "digest_shares_week_format" CHECK ("digest_shares"."week" ~ '^[0-9]{4}-W(0[1-9]|[1-4][0-9]|5[0-3])$')
);
--> statement-breakpoint
ALTER TABLE "digest_shares" ADD CONSTRAINT "digest_shares_restaurant_id_restaurants_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "digest_shares_token_unique" ON "digest_shares" USING btree ("token");--> statement-breakpoint
CREATE INDEX "digest_shares_restaurant_week_idx" ON "digest_shares" USING btree ("restaurant_id","week");