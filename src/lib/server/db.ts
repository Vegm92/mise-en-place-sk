/**
 * DB singleton — server-side only.
 * Import this only from +server.ts or +page.server.ts files, never from components.
 *
 * DATABASE_URL defaults to mise_en_place.db in the project root.
 * Override via .env for production deployments.
 */
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { join } from 'node:path';
import { env } from '$env/dynamic/private';
import * as schema from './schema';

const rawUrl = env.DATABASE_URL ?? 'mise_en_place.db';
const url = rawUrl.startsWith('/') ? rawUrl : join(process.cwd(), rawUrl);

export const dbClient = new Database(url);

dbClient.pragma('journal_mode = WAL');

// Bootstrap all tables — core schema + SK-owned extensions.
dbClient.exec(`
  CREATE TABLE IF NOT EXISTS suppliers (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    name       TEXT NOT NULL,
    alias      TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    category   TEXT DEFAULT NULL
  );

  CREATE TABLE IF NOT EXISTS invoices (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    supplier_id      INTEGER REFERENCES suppliers(id),
    invoice_number   TEXT,
    invoice_date     TEXT,
    due_date         TEXT,
    total_amount     REAL,
    currency         TEXT,
    status           TEXT DEFAULT 'pending',
    source_file      TEXT,
    confidence       REAL,
    created_at       TEXT DEFAULT CURRENT_TIMESTAMP,
    converted_amount REAL,
    exchange_rate    REAL,
    notes            TEXT
  );

  CREATE TABLE IF NOT EXISTS invoice_line_items (
    id                        INTEGER PRIMARY KEY AUTOINCREMENT,
    invoice_id                INTEGER REFERENCES invoices(id),
    description               TEXT,
    quantity                  REAL,
    unit                      TEXT,
    unit_price                REAL,
    total_price               REAL,
    requires_unit_conversion  INTEGER NOT NULL DEFAULT 0,
    canonical_unit            TEXT
  );

  CREATE TABLE IF NOT EXISTS settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS category_budgets (
    category       TEXT PRIMARY KEY,
    monthly_budget REAL NOT NULL
  );

  CREATE TABLE IF NOT EXISTS unit_conversions (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    supplier_name     TEXT NOT NULL,
    ingredient        TEXT NOT NULL,
    purchase_unit     TEXT NOT NULL,
    canonical_unit    TEXT NOT NULL,
    conversion_factor REAL NOT NULL,
    created_at        TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(supplier_name, ingredient, purchase_unit)
  );

  CREATE TABLE IF NOT EXISTS system_notifications (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    invoice_id        INTEGER REFERENCES invoices(id),
    notification_type TEXT NOT NULL,
    message           TEXT NOT NULL,
    payload           TEXT,
    status            TEXT NOT NULL DEFAULT 'pending',
    created_at        TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS stock_levels (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    ingredient      TEXT NOT NULL UNIQUE,
    current_stock   REAL NOT NULL DEFAULT 0,
    canonical_unit  TEXT,
    daily_burn_rate REAL NOT NULL DEFAULT 0,
    updated_at      TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
`);


export const db = drizzle(dbClient, { schema });

function runMigrations() {
	dbClient.exec(`
		CREATE TABLE IF NOT EXISTS pending_processed_invoices (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			session_id TEXT,
			original_file_path TEXT,
			raw_llm_json TEXT,
			status TEXT DEFAULT 'PENDING_REVIEW',
			confidence_score REAL,
			supplier_id INTEGER REFERENCES suppliers(id),
			inferred_supplier_name TEXT,
			invoice_number TEXT,
			invoice_date TEXT,
			total_amount REAL,
			is_duplicate INTEGER DEFAULT 0,
			created_at TEXT DEFAULT CURRENT_TIMESTAMP,
			committed_at TEXT
		);

		CREATE TABLE IF NOT EXISTS pending_line_items (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			pending_invoice_id INTEGER REFERENCES pending_processed_invoices(id),
			raw_description TEXT,
			matched_ingredient_id INTEGER,
			suggested_name TEXT,
			quantity REAL,
			unit TEXT,
			unit_price REAL,
			fuzzy_score REAL,
			price_warning INTEGER DEFAULT 0
		);
	`);
}

runMigrations();
