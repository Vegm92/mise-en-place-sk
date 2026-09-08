-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║  invoice_audit_log.user_id, user_consents.user_id: text → uuid             ║
-- ║                                                                            ║
-- ║  Both columns were text while users.id is uuid (issue #993). Every write   ║
-- ║  path for both columns passes users.id directly — invoice-save.ts,         ║
-- ║  invoice/[id]/+page.server.ts, invoices/+page.server.ts, consent.ts        ║
-- ║  (called from auth.ts, signup, onboarding) — never a non-uuid sentinel, so ║
-- ║  the cast below is expected to be total. If any row holds a non-uuid, the  ║
-- ║  USING cast raises 22P02 and the whole migration rolls back — no partial   ║
-- ║  conversion, no data loss (same strict policy as 0038).                    ║
-- ║                                                                            ║
-- ║  Rollback: ALTER TABLE invoice_audit_log/user_consents                     ║
-- ║              ALTER COLUMN user_id SET DATA TYPE text USING user_id::text;  ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝
ALTER TABLE "invoice_audit_log" ALTER COLUMN "user_id" SET DATA TYPE uuid USING "user_id"::uuid;--> statement-breakpoint
ALTER TABLE "user_consents" ALTER COLUMN "user_id" SET DATA TYPE uuid USING "user_id"::uuid;--> statement-breakpoint
ALTER TABLE "invoice_audit_log" ADD COLUMN "source_file" text;--> statement-breakpoint

-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║  invoice_audit_log.invoice_id: add the missing FK (issue #993)             ║
-- ║                                                                            ║
-- ║  ON DELETE NO ACTION, not cascade: this is an audit table, so a hard      ║
-- ║  DELETE FROM invoices must fail loudly against it rather than silently    ║
-- ║  erasing the record that the invoice ever existed — the exact question    ║
-- ║  an auditor asks. The app never hard-deletes an invoice today (delete     ║
-- ║  only sets deleted_at), so this constraint is not expected to ever fire;  ║
-- ║  it exists to reject a future hard delete instead of quietly discarding   ║
-- ║  history. GDPR/account erasure still reaches these rows via the           ║
-- ║  restaurant_id FK's ON DELETE CASCADE (unchanged), so this does not       ║
-- ║  block that path (tenant-data-map.ts's cascade-via-restaurants).          ║
-- ║                                                                            ║
-- ║  The delete below is a defensive guard so the ADD CONSTRAINT below        ║
-- ║  cannot fail on a pre-existing orphan from before this migration.         ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝
DELETE FROM "invoice_audit_log" a WHERE NOT EXISTS (SELECT 1 FROM "invoices" i WHERE i."id" = a."invoice_id");--> statement-breakpoint
ALTER TABLE "invoice_audit_log" ADD CONSTRAINT "invoice_audit_log_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE no action ON UPDATE no action;
