-- Migration 0009: optimistic-concurrency version counter on invoices (issue #242)
--
-- The invoice edit form submits the version it loaded; the UPDATE is guarded
-- by it and increments it, so a stale tab gets a 409 instead of silently
-- overwriting another tab's edit.

ALTER TABLE invoices ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1;
