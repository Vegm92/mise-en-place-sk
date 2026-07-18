-- Migration 0017: per-month category budgets
--
-- category_budgets held one ongoing row per (restaurant, category); the
-- Budgets page always edited "the" budget, so there was no way to view or
-- preserve past months' figures. Adding `month` makes each monthly budget
-- its own row so past months stay frozen while the current month is still
-- editable.

ALTER TABLE category_budgets ADD COLUMN IF NOT EXISTS month text;

-- Backfill: existing rows represent "the current ongoing budget" — stamp
-- them with the current month so nothing is lost and the current-month view
-- keeps working immediately after deploy. Months before this migration ran
-- have no historical budget data to backfill from.
UPDATE category_budgets SET month = TO_CHAR(NOW(), 'YYYY-MM') WHERE month IS NULL;

ALTER TABLE category_budgets ALTER COLUMN month SET NOT NULL;

DROP INDEX IF EXISTS category_budgets_restaurant_category_unique;
CREATE UNIQUE INDEX IF NOT EXISTS category_budgets_restaurant_category_month_unique
	ON category_budgets (restaurant_id, category, month);
