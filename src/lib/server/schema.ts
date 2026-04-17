/**
 * Drizzle schema — single source of truth for the SQLite database.
 * New tables and columns are bootstrapped in db.ts on startup.
 * Columns marked with legacy comments exist in the live DB but are unused
 * by the application since the currency removal refactor.
 */
import { integer, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

export const suppliers = sqliteTable('suppliers', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	name: text('name').notNull(),
	alias: text('alias'),
	createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`),
	category: text('category').default(sql`NULL`),
});

export const invoices = sqliteTable('invoices', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	supplierId: integer('supplier_id').references(() => suppliers.id),
	invoiceNumber: text('invoice_number'),
	invoiceDate: text('invoice_date'),
	dueDate: text('due_date'),
	totalAmount: real('total_amount'),
	currency: text('currency'),           // legacy — kept for DB compatibility
	status: text('status').default("'pending'"),
	sourceFile: text('source_file'),
	confidence: real('confidence'),
	createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`),
	convertedAmount: real('converted_amount'), // legacy — kept for DB compatibility
	exchangeRate: real('exchange_rate'),        // legacy — kept for DB compatibility
	notes: text('notes'),
});

export const invoiceLineItems = sqliteTable('invoice_line_items', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	invoiceId: integer('invoice_id').references(() => invoices.id),
	description: text('description'),
	quantity: real('quantity'),
	unit: text('unit'),
	unitPrice: real('unit_price'),
	totalPrice: real('total_price'),
	requiresUnitConversion: integer('requires_unit_conversion').default(0),
	canonicalUnit: text('canonical_unit'),
});

export const settings = sqliteTable('settings', {
	key: text('key').primaryKey(),
	value: text('value').notNull(),
});

export const categoryBudgets = sqliteTable('category_budgets', {
	category: text('category').primaryKey(),
	monthlyBudget: real('monthly_budget').notNull(),
});

export const unitConversions = sqliteTable('unit_conversions', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	supplierName: text('supplier_name').notNull(),
	ingredient: text('ingredient').notNull(),
	purchaseUnit: text('purchase_unit').notNull(),
	canonicalUnit: text('canonical_unit').notNull(),
	conversionFactor: real('conversion_factor').notNull(),
	createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`),
});

export const systemNotifications = sqliteTable('system_notifications', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	invoiceId: integer('invoice_id').references(() => invoices.id),
	notificationType: text('notification_type').notNull(),
	message: text('message').notNull(),
	payload: text('payload'),
	status: text('status').default('pending'),
	createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`),
});

export const stockLevels = sqliteTable('stock_levels', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	ingredient: text('ingredient').notNull().unique(),
	currentStock: real('current_stock').default(0),
	canonicalUnit: text('canonical_unit'),
	dailyBurnRate: real('daily_burn_rate').default(0),
	updatedAt: text('updated_at').default(sql`CURRENT_TIMESTAMP`),
});
