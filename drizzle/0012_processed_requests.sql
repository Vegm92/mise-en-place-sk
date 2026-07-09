-- Migration 0012: idempotency-key claim table (issue #250)
--
-- Money-adjacent form actions render a hidden per-submit UUID and claim it
-- here (INSERT … ON CONFLICT DO NOTHING RETURNING). A replay finds the key
-- already present and becomes a transparent no-op instead of a second write.
-- Pruned after 48h by the existing stale-batch cleanup cadence.

CREATE TABLE IF NOT EXISTS processed_requests (
	key           uuid PRIMARY KEY,
	restaurant_id uuid REFERENCES restaurants(id) ON DELETE CASCADE,
	created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_processed_requests_created
	ON processed_requests (created_at);

-- Written only by the server (direct owner connection); not exposed via the
-- Data API, so RLS is enabled with no user-facing policies.
ALTER TABLE processed_requests ENABLE ROW LEVEL SECURITY;
