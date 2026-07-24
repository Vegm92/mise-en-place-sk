-- Migration 0019: product catalog + aliases (issue #298, Phase 2)
--
-- Turns the raw invoice description string into a stable per-tenant product
-- entity. products holds the canonical product; product_aliases maps every raw
-- description (normalized via mep_norm_key, from migration 0018) to one product.
-- invoice_line_items.product_id links a saved line to its resolved product.
--
-- Fuzzy matching (auto-linking near-duplicate descriptions to an existing
-- product, pending user confirmation) uses pg_trgm similarity.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ── products ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS products (
    id             serial PRIMARY KEY,
    restaurant_id  uuid NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
    canonical_name text NOT NULL,
    name_key       text NOT NULL,
    category       text,
    canonical_unit text,
    created_at     timestamptz DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS products_restaurant_name_key_unique
    ON products (restaurant_id, name_key);

-- Trigram index accelerates similarity() / % lookups during fuzzy resolution.
CREATE INDEX IF NOT EXISTS products_name_key_trgm
    ON products USING gin (name_key gin_trgm_ops);

-- ── product_aliases ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS product_aliases (
    id            serial PRIMARY KEY,
    restaurant_id uuid NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
    product_id    integer NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    supplier_id   integer REFERENCES suppliers(id) ON DELETE SET NULL,
    raw_key       text NOT NULL,
    raw_text      text,
    source        text NOT NULL DEFAULT 'exact',
    confirmed_at  timestamptz,
    created_at    timestamptz DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS product_aliases_restaurant_raw_key_unique
    ON product_aliases (restaurant_id, raw_key);
CREATE INDEX IF NOT EXISTS product_aliases_product_idx
    ON product_aliases (restaurant_id, product_id);
CREATE INDEX IF NOT EXISTS product_aliases_pending_idx
    ON product_aliases (restaurant_id) WHERE confirmed_at IS NULL;

-- ── invoice_line_items.product_id ────────────────────────────────────────────
ALTER TABLE invoice_line_items
    ADD COLUMN IF NOT EXISTS product_id integer REFERENCES products(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_invoice_line_items_product_id
    ON invoice_line_items (restaurant_id, product_id) WHERE product_id IS NOT NULL;

-- ── Row Level Security ───────────────────────────────────────────────────────
-- Same defense-in-depth as migration 0001: the app uses an owner connection
-- that bypasses RLS, but the Supabase Data API path (anon/authenticated) must
-- be scoped to the caller's restaurants.
DO $$
DECLARE
    tbl text;
    tables text[] := ARRAY['products', 'product_aliases'];
BEGIN
    FOREACH tbl IN ARRAY tables LOOP
        EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY;', tbl);
        EXECUTE format('DROP POLICY IF EXISTS %I ON %I;', 'restaurant_members_access_' || tbl, tbl);
        EXECUTE format($f$
            CREATE POLICY %I ON %I
                FOR ALL
                USING (restaurant_id IN (
                    SELECT restaurant_id FROM user_restaurants WHERE user_id = auth.uid()::text))
                WITH CHECK (restaurant_id IN (
                    SELECT restaurant_id FROM user_restaurants WHERE user_id = auth.uid()::text));
        $f$, 'restaurant_members_access_' || tbl, tbl);
    END LOOP;
END $$;
