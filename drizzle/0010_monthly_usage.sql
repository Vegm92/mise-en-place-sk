-- Migration 0010: atomic monthly extraction counter (issue #244)
--
-- The worker claims a slot with a single increment-with-cap UPDATE before
-- spending a Gemini extraction, so parallel uploads can't all pass a
-- COUNT-then-act check and burst past the plan quota.

CREATE TABLE IF NOT EXISTS monthly_usage (
	restaurant_id uuid    NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
	month         text    NOT NULL,  -- 'YYYY-MM'
	used          integer NOT NULL DEFAULT 0
);

CREATE UNIQUE INDEX IF NOT EXISTS monthly_usage_restaurant_month_unique
	ON monthly_usage (restaurant_id, month);

-- Written only by the server (direct owner connection); not exposed to
-- end-users via the Data API, so RLS is enabled with no user-facing policies.
ALTER TABLE monthly_usage ENABLE ROW LEVEL SECURITY;
