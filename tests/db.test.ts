/**
 * DB bootstrap tests — verifies that running the bootstrap SQL on a fresh
 * in-memory database produces all expected tables with their key columns.
 * Never touches mise_en_place.db.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import Database from 'better-sqlite3';

const BOOTSTRAP_SQL = `
  CREATE TABLE IF NOT EXISTS suppliers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    alias TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    category TEXT DEFAULT NULL
  );
  CREATE TABLE IF NOT EXISTS invoices (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    supplier_id INTEGER REFERENCES suppliers(id),
    invoice_number TEXT,
    invoice_date TEXT,
    due_date TEXT,
    total_amount REAL,
    currency TEXT,
    status TEXT DEFAULT 'pending',
    source_file TEXT,
    confidence REAL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    converted_amount REAL,
    exchange_rate REAL,
    notes TEXT
  );
  CREATE TABLE IF NOT EXISTS invoice_line_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    invoice_id INTEGER REFERENCES invoices(id),
    description TEXT,
    quantity REAL,
    unit TEXT,
    unit_price REAL,
    total_price REAL,
    requires_unit_conversion INTEGER NOT NULL DEFAULT 0,
    canonical_unit TEXT
  );
  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS category_budgets (
    category TEXT PRIMARY KEY,
    monthly_budget REAL NOT NULL
  );
  CREATE TABLE IF NOT EXISTS unit_conversions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    supplier_name TEXT NOT NULL,
    ingredient TEXT NOT NULL,
    purchase_unit TEXT NOT NULL,
    canonical_unit TEXT NOT NULL,
    conversion_factor REAL NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(supplier_name, ingredient, purchase_unit)
  );
  CREATE TABLE IF NOT EXISTS system_notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    invoice_id INTEGER REFERENCES invoices(id),
    notification_type TEXT NOT NULL,
    message TEXT NOT NULL,
    payload TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS stock_levels (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ingredient TEXT NOT NULL UNIQUE,
    current_stock REAL NOT NULL DEFAULT 0,
    canonical_unit TEXT,
    daily_burn_rate REAL NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
`;

let db: InstanceType<typeof Database>;

beforeAll(() => {
  db = new Database(':memory:');
  db.exec(BOOTSTRAP_SQL);
});

function tables(): string[] {
  return db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
    .all()
    .map((r: unknown) => (r as { name: string }).name);
}

function columns(table: string): string[] {
  return (db.pragma(`table_info(${table})`) as Array<{ name: string }>).map((c) => c.name);
}

describe('DB bootstrap', () => {
  const EXPECTED_TABLES = [
    'category_budgets',
    'invoice_line_items',
    'invoices',
    'settings',
    'stock_levels',
    'suppliers',
    'system_notifications',
    'unit_conversions',
  ];

  it('creates all 8 expected tables', () => {
    const present = tables();
    for (const t of EXPECTED_TABLES) {
      expect(present).toContain(t);
    }
  });

  it('suppliers has required columns', () => {
    const cols = columns('suppliers');
    expect(cols).toContain('id');
    expect(cols).toContain('name');
    expect(cols).toContain('created_at');
  });

  it('invoices has required columns', () => {
    const cols = columns('invoices');
    expect(cols).toContain('id');
    expect(cols).toContain('supplier_id');
    expect(cols).toContain('invoice_number');
    expect(cols).toContain('total_amount');
    expect(cols).toContain('status');
    expect(cols).toContain('source_file');
    expect(cols).toContain('confidence');
  });

  it('invoice_line_items has unit bridge columns', () => {
    const cols = columns('invoice_line_items');
    expect(cols).toContain('requires_unit_conversion');
    expect(cols).toContain('canonical_unit');
  });

  it('idempotent — running bootstrap twice does not throw', () => {
    expect(() => db.exec(BOOTSTRAP_SQL)).not.toThrow();
  });

  it('inserting a supplier and invoice round-trips correctly', () => {
    db.exec(`INSERT INTO suppliers (name) VALUES ('Test Supplier')`);
    const supplier = db
      .prepare("SELECT * FROM suppliers WHERE name = 'Test Supplier'")
      .get() as { id: number; name: string };
    expect(supplier.name).toBe('Test Supplier');

    db.exec(
      `INSERT INTO invoices (supplier_id, total_amount, status) VALUES (${supplier.id}, 99.99, 'pending')`
    );
    const invoice = db
      .prepare(`SELECT * FROM invoices WHERE supplier_id = ${supplier.id}`)
      .get() as { total_amount: number; status: string };
    expect(invoice.total_amount).toBe(99.99);
    expect(invoice.status).toBe('pending');
  });
});
