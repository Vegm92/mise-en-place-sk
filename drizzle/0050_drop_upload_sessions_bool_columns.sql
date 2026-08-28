-- Migration 0050: drop upload_sessions, int-as-boolean cleanup (issue #514)
--
-- upload_sessions was retired by ADR-015 (upload_batches/batch_items replace
-- it) and #425 repointed its last two readers (/api/health, admin overview)
-- at batch_items. Nothing writes or reads it any more. IF EXISTS because a
-- database bootstrapped with `pnpm db:push` (ADR-003's local iteration path)
-- may never have had it; no CASCADE — nothing references this table.
--
-- invoices.qr_mismatch and invoice_line_items.requires_unit_conversion were
-- integer 0/1 flags standing in for boolean; every writer and reader already
-- treated them as such (`? 1 : 0` / `!!x` at the call sites). The DEFAULT
-- must be dropped before the type change and re-added after — Postgres
-- cannot auto-cast an integer default across a type change — and USING
-- col::int::boolean maps the existing 0/1 values across exactly, per
-- migration 0047's precedent for a lossless type change.
DROP TABLE IF EXISTS "upload_sessions";--> statement-breakpoint
ALTER TABLE "invoices" ALTER COLUMN "qr_mismatch" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "invoices" ALTER COLUMN "qr_mismatch" SET DATA TYPE boolean USING "qr_mismatch"::int::boolean;--> statement-breakpoint
ALTER TABLE "invoices" ALTER COLUMN "qr_mismatch" SET DEFAULT false;--> statement-breakpoint
ALTER TABLE "invoice_line_items" ALTER COLUMN "requires_unit_conversion" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "invoice_line_items" ALTER COLUMN "requires_unit_conversion" SET DATA TYPE boolean USING "requires_unit_conversion"::int::boolean;--> statement-breakpoint
ALTER TABLE "invoice_line_items" ALTER COLUMN "requires_unit_conversion" SET DEFAULT false;
