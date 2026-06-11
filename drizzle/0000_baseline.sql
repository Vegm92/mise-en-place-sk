-- ╔═══════════════════════════════════════════════════════════════════════════╗
-- ║  Consolidated baseline schema for Mise en Place                            ║
-- ║                                                                            ║
-- ║  This single file replaces the previous 0001–0010 incremental migrations, ║
-- ║  which had drifted from src/lib/server/schema.ts (the source of truth      ║
-- ║  used by `pnpm db:push`). It represents the complete current schema:       ║
-- ║  every table, constraint, and index defined in schema.ts.                  ║
-- ║                                                                            ║
-- ║  RLS policies live in 0001_rls_policies.sql (applied after this file).     ║
-- ╚═══════════════════════════════════════════════════════════════════════════╝

-- ── Multi-tenant core ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS restaurants (
	id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	name       text NOT NULL,
	slug       text NOT NULL UNIQUE,
	created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS user_restaurants (
	user_id       text NOT NULL,
	restaurant_id uuid NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
	role          text NOT NULL DEFAULT 'owner', -- 'owner' | 'member'
	created_at    timestamptz DEFAULT now()
);

-- ── Business tables (all scoped to restaurant_id) ──────────────────────────

CREATE TABLE IF NOT EXISTS suppliers (
	id            serial PRIMARY KEY,
	restaurant_id uuid NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
	name          text NOT NULL,
	alias         text,
	created_at    timestamptz DEFAULT now(),
	category      text,
	contact_email text,
	contact_phone text,
	cif           text,
	delivery_days text,
	payment_terms text,
	notes         text
);

CREATE TABLE IF NOT EXISTS invoices (
	id             serial PRIMARY KEY,
	restaurant_id  uuid NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
	supplier_id    integer REFERENCES suppliers(id),
	invoice_number text,
	invoice_date   text,
	due_date       text,
	total_amount   real,
	tax_base       real,
	tax_breakdown  text,
	status         text DEFAULT 'pending',
	source_file    text,
	confidence     real,
	content_hash   text,
	created_at     timestamptz DEFAULT now(),
	notes          text,
	deleted_at     timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_invoices_rid_supplier_number
	ON invoices (restaurant_id, supplier_id, invoice_number)
	WHERE invoice_number IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_invoices_deleted_at
	ON invoices (restaurant_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS invoices_content_hash_idx
	ON invoices (restaurant_id, content_hash) WHERE content_hash IS NOT NULL;

CREATE TABLE IF NOT EXISTS invoice_audit_log (
	id            serial PRIMARY KEY,
	restaurant_id uuid NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
	invoice_id    integer NOT NULL,
	action        text NOT NULL, -- 'soft_delete' | 'restore' | 'hard_delete'
	user_id       text NOT NULL,
	reason        text,
	snapshot      text,
	created_at    timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_invoice_audit_restaurant ON invoice_audit_log (restaurant_id);
CREATE INDEX IF NOT EXISTS idx_invoice_audit_invoice    ON invoice_audit_log (invoice_id);

CREATE TABLE IF NOT EXISTS invoice_line_items (
	id                       serial PRIMARY KEY,
	restaurant_id            uuid NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
	invoice_id               integer REFERENCES invoices(id) ON DELETE CASCADE,
	description              text,
	quantity                 real,
	unit                     text,
	unit_price               real,
	total_price              real,
	tax_rate                 real,
	requires_unit_conversion integer DEFAULT 0,
	canonical_unit           text
);

CREATE TABLE IF NOT EXISTS supplier_metrics (
	id                    serial PRIMARY KEY,
	restaurant_id         uuid NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
	supplier_id           integer NOT NULL UNIQUE REFERENCES suppliers(id) ON DELETE CASCADE,
	score                 integer NOT NULL DEFAULT 0,
	price_stability_score integer NOT NULL DEFAULT 0,
	frequency_score       integer NOT NULL DEFAULT 0,
	timeliness_score      integer NOT NULL DEFAULT 0,
	price_stability_cv    real,
	computed_at           timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS settings (
	restaurant_id uuid NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
	key           text NOT NULL,
	value         text NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS settings_restaurant_key_unique ON settings (restaurant_id, key);

CREATE TABLE IF NOT EXISTS category_budgets (
	restaurant_id  uuid NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
	category       text NOT NULL,
	monthly_budget real NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS category_budgets_restaurant_category_unique
	ON category_budgets (restaurant_id, category);

CREATE TABLE IF NOT EXISTS unit_conversions (
	id                serial PRIMARY KEY,
	restaurant_id     uuid NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
	supplier_name     text NOT NULL,
	ingredient        text NOT NULL,
	purchase_unit     text NOT NULL,
	canonical_unit    text NOT NULL,
	conversion_factor real NOT NULL,
	created_at        timestamptz DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS unit_conversions_supplier_ingredient_unit_unique
	ON unit_conversions (restaurant_id, supplier_name, ingredient, purchase_unit);

CREATE TABLE IF NOT EXISTS system_notifications (
	id                serial PRIMARY KEY,
	restaurant_id     uuid NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
	invoice_id        integer REFERENCES invoices(id),
	notification_type text NOT NULL,
	message           text NOT NULL,
	payload           text,
	status            text DEFAULT 'pending',
	created_at        timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS stock_levels (
	id              serial PRIMARY KEY,
	restaurant_id   uuid NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
	ingredient      text NOT NULL,
	current_stock   real DEFAULT 0,
	canonical_unit  text,
	daily_burn_rate real DEFAULT 0,
	updated_at      timestamptz DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS stock_levels_restaurant_ingredient_unique
	ON stock_levels (restaurant_id, ingredient);

CREATE TABLE IF NOT EXISTS extraction_corrections (
	id              serial PRIMARY KEY,
	restaurant_id   uuid NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
	invoice_id      integer REFERENCES invoices(id),
	supplier_id     integer REFERENCES suppliers(id),
	field_name      text NOT NULL,
	original_value  text,
	corrected_value text,
	line_item_index integer,
	corrected_at    timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS chat_sessions (
	id            serial PRIMARY KEY,
	restaurant_id uuid NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
	title         text NOT NULL DEFAULT 'Nueva conversación',
	created_at    timestamptz DEFAULT now(),
	updated_at    timestamptz DEFAULT now()
);

-- chat_messages carries restaurant_id directly (denormalized) so every read,
-- write, and RLS check is scoped without an extra join through chat_sessions.
CREATE TABLE IF NOT EXISTS chat_messages (
	id            serial PRIMARY KEY,
	restaurant_id uuid NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
	session_id    integer REFERENCES chat_sessions(id) ON DELETE CASCADE,
	role          text NOT NULL,
	text          text NOT NULL,
	actions       text,
	created_at    timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_chat_messages_restaurant ON chat_messages (restaurant_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_session    ON chat_messages (session_id);

-- ── LLM cost tracking ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS llm_usage_log (
	id                 serial PRIMARY KEY,
	restaurant_id      uuid NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
	model              text NOT NULL,
	input_tokens       integer NOT NULL DEFAULT 0,
	output_tokens      integer NOT NULL DEFAULT 0,
	estimated_cost_usd numeric(12,8) NOT NULL DEFAULT '0',
	caller_context     text,
	created_at         timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS llm_usage_log_restaurant_month ON llm_usage_log (restaurant_id, created_at);

CREATE TABLE IF NOT EXISTS tenant_llm_quotas (
	restaurant_id          uuid PRIMARY KEY REFERENCES restaurants(id) ON DELETE CASCADE,
	monthly_extractions    integer,
	monthly_cost_limit_usd numeric(10,4),
	updated_at             timestamptz DEFAULT now()
);

-- ── Standalone / infra tables ──────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS waitlist (
	id         serial PRIMARY KEY,
	email      text NOT NULL UNIQUE,
	created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS upload_sessions (
	id         text PRIMARY KEY,
	data       text NOT NULL,
	created_at timestamptz DEFAULT now(),
	updated_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS upload_sessions_updated_at_idx ON upload_sessions (updated_at);

CREATE TABLE IF NOT EXISTS subscriptions (
	id                     serial PRIMARY KEY,
	restaurant_id          uuid NOT NULL UNIQUE REFERENCES restaurants(id) ON DELETE CASCADE,
	stripe_customer_id     text UNIQUE,
	stripe_subscription_id text UNIQUE,
	stripe_price_id        text,
	plan_tier              text NOT NULL DEFAULT 'trial', -- 'trial' | 'starter' | 'pro' | 'business'
	status                 text NOT NULL DEFAULT 'trialing',
	trial_ends_at          timestamptz,
	current_period_end     timestamptz,
	cancel_at_period_end   boolean NOT NULL DEFAULT false,
	created_at             timestamptz DEFAULT now(),
	updated_at             timestamptz DEFAULT now()
);
