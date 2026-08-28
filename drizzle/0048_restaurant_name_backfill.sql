-- Migration 0048: collapse restaurant name to a single source of truth (#515)
--
-- restaurants.name and a settings row keyed 'restaurant_name' both held the
-- name; the layout read preferred the settings value when present (with a
-- fallback to restaurants.name), so that is what users actually saw. Copy
-- that seen value into restaurants.name wherever it differs, then drop the
-- settings rows — the column becomes the only source going forward.

UPDATE "restaurants" AS "r"
SET "name" = "s"."value"
FROM "settings" AS "s"
WHERE "s"."restaurant_id" = "r"."id"
  AND "s"."key" = 'restaurant_name'
  AND "s"."value" IS DISTINCT FROM "r"."name";--> statement-breakpoint
DELETE FROM "settings" WHERE "key" = 'restaurant_name';
