-- utm_content attribution: two nullable text columns, no default, no backfill.
-- ADD COLUMN without a default is metadata-only in Postgres (no table rewrite);
-- the lock is ACCESS EXCLUSIVE but held for milliseconds.
-- Rollback (manual, forward-fix per docs/04_engineering/database_changes.md):
--   redeploy the previous container (it ignores the extra columns), then if the
--   columns must go:  ALTER TABLE "users" DROP COLUMN "attr_content";
--                     ALTER TABLE "waitlist" DROP COLUMN "content";
ALTER TABLE "users" ADD COLUMN "attr_content" text;--> statement-breakpoint
ALTER TABLE "waitlist" ADD COLUMN "content" text;