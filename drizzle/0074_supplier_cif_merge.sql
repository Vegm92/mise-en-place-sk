-- Migration 0074: merge pre-#905 duplicate suppliers, then enforce one row per
-- (restaurant_id, normalized_cif) — issue #949.
--
-- #905 made new documents resolve to one supplier per tax id but changed
-- nothing about rows that already existed. A tenant invoiced as "Can Víctor",
-- "Víctor Granda" and "Clínica dental Víctor Granda" before it landed still has
-- three supplier rows, each holding the same tax id, each with its own share of
-- the invoices, metrics and price history. Those duplicates are also what blocks
-- the unique index at the end of this file.
--
-- Order matters and is not negotiable: supplier_id is referenced from six
-- tables with three delete behaviours, and the two `set null` columns
-- (product_aliases, unit_conversions) silently lose their supplier scoping if
-- the loser row goes away before they are repointed. Every child is moved
-- first; suppliers are deleted last.

-- ── mep_supplier_norm_name — SQL half of normalizeSupplierName ───────────────
-- Must stay in lockstep with src/lib/server/normalize.ts (parity test:
-- tests/supplier-merge-migration.test.ts). Same shape as mep_norm_key from
-- migration 0018, which it builds on: fold accents and whitespace, then strip a
-- trailing Spanish legal form and the punctuation around it.

CREATE OR REPLACE FUNCTION mep_supplier_norm_name(txt text)
RETURNS text
LANGUAGE sql
IMMUTABLE
RETURNS NULL ON NULL INPUT
AS $$
    SELECT btrim(regexp_replace(regexp_replace(regexp_replace(
        mep_norm_key(txt),
        '(?:^|[,.]\s*|\s)(s\.?\s*l\.?\s*u\.?|s\.?\s*l\.?\s*n\.?\s*e\.?|s\.?\s*a\.?\s*u\.?|s\.?\s*c\.?\s*p\.?|s\.?\s*coop\.?|coop\.?|s\.?\s*l\.?|s\.?\s*a\.?|s\.?\s*c\.?|c\.?\s*b\.?)\s*$',
        '', 'i'),
        '[.,]', ' ', 'g'),
        '\s+', ' ', 'g'))
$$;--> statement-breakpoint

-- ── mep_valid_spanish_tax_id — SQL half of isValidSpanishTaxId ───────────────
-- Must stay in lockstep with src/lib/tax-id.ts, normalizeTaxId included, so the
-- two agree on any string and not just on what normalized_cif happens to hold.
-- The `cif` column has never had a format constraint and normalized_cif was
-- backfilled straight from it, so without this bar a scanning artefact would be
-- enough to merge two unrelated businesses — the same reason taxIdDecidesIdentity
-- gates live matching.

CREATE OR REPLACE FUNCTION mep_valid_spanish_tax_id(id text)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
RETURNS NULL ON NULL INPUT
AS $$
DECLARE
    dni_letters constant text := 'TRWAGMYFPDXBNJZSQVHLCKE';
    cif_letters constant text := 'JABCDEFGHI';
    body text;
    digit int;
    total int := 0;
    pos int;
    expected int;
    kind text;
    control text;
BEGIN
    id := upper(regexp_replace(id, '[^0-9A-Za-z]', '', 'g'));
    IF id ~ '^ES[0-9A-Z]{9}$' THEN
        id := substr(id, 3);
    END IF;
    IF id = '' THEN
        RETURN false;
    END IF;

    IF id ~ '^[0-9]{8}[A-Z]$' THEN
        RETURN substr(id, 9, 1) = substr(dni_letters, (substr(id, 1, 8)::bigint % 23)::int + 1, 1);
    END IF;

    IF id ~ '^[XYZ][0-9]{7}[A-Z]$' THEN
        body := translate(substr(id, 1, 1), 'XYZ', '012') || substr(id, 2, 7);
        RETURN substr(id, 9, 1) = substr(dni_letters, (body::bigint % 23)::int + 1, 1);
    END IF;

    IF id !~ '^[ABCDEFGHJKLMNPQRSUVW][0-9]{7}[0-9A-J]$' THEN
        RETURN false;
    END IF;

    body := substr(id, 2, 7);
    FOR pos IN 1..7 LOOP
        digit := substr(body, pos, 1)::int;
        IF pos % 2 = 1 THEN
            digit := digit * 2;
            total := total + (digit / 10) + (digit % 10);
        ELSE
            total := total + digit;
        END IF;
    END LOOP;

    expected := (10 - (total % 10)) % 10;
    kind := substr(id, 1, 1);
    control := substr(id, 9, 1);

    IF position(kind in 'KPQRSNW') > 0 THEN
        RETURN control = substr(cif_letters, expected + 1, 1);
    END IF;
    IF position(kind in 'ABEH') > 0 THEN
        RETURN control = expected::text;
    END IF;
    RETURN control = expected::text OR control = substr(cif_letters, expected + 1, 1);
END;
$$;--> statement-breakpoint

-- ── 1. Drop tax ids that cannot decide identity ──────────────────────────────
-- The raw `cif` is left alone — it is what a human reads on the supplier sheet.
-- Only the derived matching key goes, which both removes these rows from the
-- merge below and stops an illegible id from occupying the unique index.

UPDATE suppliers SET normalized_cif = NULL
WHERE normalized_cif IS NOT NULL
  AND NOT mep_valid_spanish_tax_id(normalized_cif);--> statement-breakpoint

-- ── 2. Pick a winner per duplicate group ─────────────────────────────────────
-- Lowest id, which is the row findByTaxId already returns (`ORDER BY id`), so
-- the merge keeps every supplier that new documents were already landing on.
--
-- A real table, not a TEMP ... ON COMMIT DROP one: the migration runner does not
-- hold every statement of this file in one transaction when several migrations
-- are pending (a fresh database — CI, or a new environment), and a temp table
-- keyed to that transaction is gone by step 3. Dropped explicitly at the end,
-- and dropped first here so a re-run after a failed attempt starts clean.

DROP TABLE IF EXISTS mep_supplier_merge_map;--> statement-breakpoint

CREATE UNLOGGED TABLE mep_supplier_merge_map AS
SELECT s.id AS loser_id, g.winner_id, s.restaurant_id, s.name AS loser_name
FROM suppliers s
JOIN (
    SELECT restaurant_id, normalized_cif, MIN(id) AS winner_id
    FROM suppliers
    WHERE normalized_cif IS NOT NULL
    GROUP BY restaurant_id, normalized_cif
    HAVING COUNT(*) > 1
) g ON g.restaurant_id = s.restaurant_id AND g.normalized_cif = s.normalized_cif
WHERE s.id <> g.winner_id;--> statement-breakpoint

-- ── 3. Keep every printed name resolvable ────────────────────────────────────
-- The loser's own name has no alias row (getOrCreateSupplierId only records one
-- when a tax-id match lands on a different name), so without this the next
-- document printed with that name would create the duplicate all over again.

INSERT INTO supplier_aliases (restaurant_id, supplier_id, name, normalized_name)
SELECT m.restaurant_id, m.winner_id, m.loser_name, mep_supplier_norm_name(m.loser_name)
FROM mep_supplier_merge_map m
WHERE mep_supplier_norm_name(m.loser_name) <> ''
ON CONFLICT (restaurant_id, normalized_name) DO NOTHING;--> statement-breakpoint

UPDATE supplier_aliases a SET supplier_id = m.winner_id
FROM mep_supplier_merge_map m
WHERE a.supplier_id = m.loser_id;--> statement-breakpoint

-- ── 4. Move the invoices ─────────────────────────────────────────────────────
-- uq_invoices_rid_supplier_number means two losers holding the same invoice
-- number cannot both land on the winner. The row_number() picks one of them and
-- the NOT EXISTS defers to a number the winner already has; anything left over
-- stays where it is rather than being deleted, and step 7 keeps it out of the
-- unique index. Losing a merge is recoverable by hand — losing an invoice is not.

WITH candidates AS (
    SELECT i.id, m.winner_id, i.restaurant_id, i.invoice_number,
           row_number() OVER (
               PARTITION BY i.restaurant_id, m.winner_id, i.invoice_number
               ORDER BY i.id
           ) AS rn
    FROM invoices i
    JOIN mep_supplier_merge_map m ON m.loser_id = i.supplier_id
)
UPDATE invoices i SET supplier_id = c.winner_id
FROM candidates c
WHERE i.id = c.id
  AND (
      c.invoice_number IS NULL
      OR (c.rn = 1 AND NOT EXISTS (
          SELECT 1 FROM invoices w
          WHERE w.restaurant_id = c.restaurant_id
            AND w.supplier_id = c.winner_id
            AND w.invoice_number = c.invoice_number
      ))
  );--> statement-breakpoint

-- ── 5. Move the rest ─────────────────────────────────────────────────────────
-- None of these three has supplier_id in a unique key, so a plain repoint is
-- safe. The two `set null` columns must be repointed here, before step 6.

UPDATE product_aliases p SET supplier_id = m.winner_id
FROM mep_supplier_merge_map m WHERE p.supplier_id = m.loser_id;--> statement-breakpoint

UPDATE unit_conversions u SET supplier_id = m.winner_id
FROM mep_supplier_merge_map m WHERE u.supplier_id = m.loser_id;--> statement-breakpoint

UPDATE extraction_corrections e SET supplier_id = m.winner_id
FROM mep_supplier_merge_map m WHERE e.supplier_id = m.loser_id;--> statement-breakpoint

-- supplier_metrics is one derived row per supplier and cannot be repointed onto
-- a row that already has one. Both sides are dropped instead: the suppliers list
-- recomputes any supplier whose cached score is missing, and every score it
-- computes reads the invoices that step 4 just moved.

DELETE FROM supplier_metrics sm
USING mep_supplier_merge_map m
WHERE sm.supplier_id IN (m.loser_id, m.winner_id);--> statement-breakpoint

-- ── 6. Retire the emptied losers ─────────────────────────────────────────────
-- Only rows that kept nothing. invoices and extraction_corrections are the two
-- `no action` references, so a leftover in either would abort the migration.

DELETE FROM suppliers s
USING mep_supplier_merge_map m
WHERE s.id = m.loser_id
  AND NOT EXISTS (SELECT 1 FROM invoices i WHERE i.supplier_id = s.id)
  AND NOT EXISTS (SELECT 1 FROM extraction_corrections e WHERE e.supplier_id = s.id);--> statement-breakpoint

-- ── 7. Survivors give up the tax id ──────────────────────────────────────────
-- A loser still standing here held an invoice step 4 could not move. It keeps
-- its raw `cif` for a human to read, but the winner owns the matching key.

UPDATE suppliers s SET normalized_cif = NULL
FROM mep_supplier_merge_map m
WHERE s.id = m.loser_id;--> statement-breakpoint

DROP TABLE mep_supplier_merge_map;--> statement-breakpoint

DROP INDEX IF EXISTS "suppliers_rid_normalized_cif_idx";--> statement-breakpoint
CREATE UNIQUE INDEX "suppliers_rid_normalized_cif_idx" ON "suppliers" USING btree ("restaurant_id","normalized_cif") WHERE "suppliers"."normalized_cif" IS NOT NULL;
