-- Migration 0024: WhatsApp self-service enrolment codes (issue #320)
--
-- Authorising a sender used to require the owner to type the staff member's
-- phone number into Settings. A typo produced the worst failure mode available:
-- the chef messages the bot, gets "no autorizado", and nobody can see why — the
-- authorised row looks fine, it just doesn't match the sender.
--
-- A pairing code inverts the trust direction. The owner generates a code, the
-- chef messages it from the phone they will actually use, and the number is
-- captured from the webhook's `from` field — so it cannot be mistyped, and it
-- is proven to be controlled by whoever holds the code.
--
-- The code is stored in plaintext, unlike a credential: the owner has to read it
-- back off the Settings page to relay it, and reloading must not lose it. Its
-- defences are single use, a short TTL, and per-sender rate limiting on
-- redemption.
--
-- The unique index on `code` is global, because redemption resolves the tenant
-- *from* the code, the same way the bot resolves it from the sender's number.

CREATE TABLE "whatsapp_pairing_codes" (
	"id" serial PRIMARY KEY NOT NULL,
	"restaurant_id" uuid NOT NULL,
	"code" text NOT NULL,
	"display_name" text,
	"created_by" text,
	"expires_at" timestamp with time zone NOT NULL,
	"redeemed_at" timestamp with time zone,
	"redeemed_by" text,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "whatsapp_pairing_codes" ADD CONSTRAINT "whatsapp_pairing_codes_restaurant_id_restaurants_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "public"."restaurants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "whatsapp_pairing_codes_code_unique" ON "whatsapp_pairing_codes" USING btree ("code");--> statement-breakpoint
CREATE INDEX "idx_whatsapp_pairing_restaurant" ON "whatsapp_pairing_codes" USING btree ("restaurant_id");--> statement-breakpoint
CREATE INDEX "idx_whatsapp_pairing_expires" ON "whatsapp_pairing_codes" USING btree ("expires_at");
--> statement-breakpoint
-- Written only by the server (direct owner connection); not exposed via the
-- Data API, so RLS is enabled with no user-facing policies.
ALTER TABLE "whatsapp_pairing_codes" ENABLE ROW LEVEL SECURITY;
