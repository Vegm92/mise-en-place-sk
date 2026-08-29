-- Migration 0054: one active share per (restaurant, week) (issue #329 follow-up)
--
-- getOrCreateCurrentWeekShare()'s "select the unrevoked row, else insert" was
-- a plain check-then-act: two concurrent share requests for the same tenant
-- and week could both see no existing row and both insert, leaving two live
-- tokens for one week. A plain UNIQUE(restaurant_id, week) would reject that
-- second insert, but would also reject a legitimate re-share after a revoke
-- (the old, revoked row still occupies the pair). A PARTIAL unique index —
-- scoped to `revoked_at IS NULL` — expresses exactly the invariant that
-- matters: at most one *unrevoked* row per tenant/week, while historical
-- revoked rows stay unconstrained. digest-share.ts now inserts with
-- onConflictDoNothing() targeting this index and re-selects the winner's
-- token on conflict, so the race resolves to one token instead of two.
-- Additive, no backfill (no duplicate unrevoked rows exist in production —
-- this feature has not shipped yet).

CREATE UNIQUE INDEX "digest_shares_restaurant_week_active_unique" ON "digest_shares" USING btree ("restaurant_id","week") WHERE "digest_shares"."revoked_at" is null;