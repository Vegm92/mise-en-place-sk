-- Migration 0015: user_restaurants gets a composite primary key (issue #241)
--
-- The table had no PK or unique index, so a double-submit of onboarding (or the
-- same form open in two tabs) could write duplicate membership rows. That also
-- confused the "sole member" count in account deletion. Dedupe, then add the PK.

-- Keep the earliest membership row per (user_id, restaurant_id).
DELETE FROM user_restaurants ur
USING (
	SELECT ctid,
	       row_number() OVER (
	           PARTITION BY user_id, restaurant_id
	           ORDER BY created_at NULLS FIRST, ctid
	       ) AS rn
	FROM user_restaurants
) d
WHERE ur.ctid = d.ctid AND d.rn > 1;

ALTER TABLE user_restaurants ADD PRIMARY KEY (user_id, restaurant_id);
