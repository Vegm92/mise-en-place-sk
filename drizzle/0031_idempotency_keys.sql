-- Migration 0031: one idempotency ledger for every caller (issue #389)
--
-- Replaces three bespoke claim tables built as separate incident fixes:
-- processed_requests (#250), whatsapp_processed_messages (#245) and
-- stripe_webhook_events (#240). All three had the same shape and the same
-- claim protocol (INSERT … ON CONFLICT DO NOTHING RETURNING; empty result =
-- already handled), so the fourth webhook integration would have meant a
-- fourth table. `scope` separates the callers inside one table; `key` is text
-- because the scopes disagree on key shape (UUID, Meta message id, Stripe
-- event id).
--
-- restaurant_id is carried over from processed_requests: claims made inside a
-- tenant mutation die with the tenant. It stays nullable — webhook scopes
-- claim before any tenant is resolved.
--
-- idx_idempotency_keys_claimed backs the retention sweep (runIdempotencySweep,
-- registered in the worker's JOBS table), which now covers every scope. Two of
-- the three old tables were never swept at all.

CREATE TABLE "idempotency_keys" (
	"scope" text NOT NULL,
	"key" text NOT NULL,
	"restaurant_id" uuid,
	"claimed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "idempotency_keys_scope_key_pk" PRIMARY KEY("scope","key")
);
--> statement-breakpoint
ALTER TABLE "idempotency_keys" ADD CONSTRAINT "idempotency_keys_restaurant_id_restaurants_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_idempotency_keys_claimed" ON "idempotency_keys" USING btree ("claimed_at");

-- Written only by the server (direct owner connection); no RLS needed on
-- Railway Postgres (no Data API — see drizzle/0001_rls_policies.sql).
