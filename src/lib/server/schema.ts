/** Drizzle schema — single source of truth for the SQLite database. */
import { integer, real, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
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
	status: text('status').default('pending'),
	sourceFile: text('source_file'),
	confidence: real('confidence'),
	createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`),
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
}, (t) => [
	uniqueIndex('unit_conversions_supplier_ingredient_unit_unique').on(t.supplierName, t.ingredient, t.purchaseUnit),
]);

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

// Tables created by runMigrations() in db.ts
export const pendingProcessedInvoices = sqliteTable('pending_processed_invoices', {
	id:                    integer('id').primaryKey({ autoIncrement: true }),
	sessionId:             text('session_id'),
	originalFilePath:      text('original_file_path'),
	rawLlmJson:            text('raw_llm_json'),
	status:                text('status').default('PENDING_REVIEW'),
	confidenceScore:       real('confidence_score'),
	supplierId:            integer('supplier_id').references(() => suppliers.id),
	inferredSupplierName:  text('inferred_supplier_name'),
	invoiceNumber:         text('invoice_number'),
	invoiceDate:           text('invoice_date'),
	totalAmount:           real('total_amount'),
	isDuplicate:           integer('is_duplicate').default(0),
	createdAt:             text('created_at').default(sql`CURRENT_TIMESTAMP`),
	committedAt:           text('committed_at'),
});

export const pendingLineItems = sqliteTable('pending_line_items', {
	id:                  integer('id').primaryKey({ autoIncrement: true }),
	pendingInvoiceId:    integer('pending_invoice_id').references(() => pendingProcessedInvoices.id),
	rawDescription:      text('raw_description'),
	matchedIngredientId: integer('matched_ingredient_id'),
	suggestedName:       text('suggested_name'),
	quantity:            real('quantity'),
	unit:                text('unit'),
	unitPrice:           real('unit_price'),
	fuzzyScore:          real('fuzzy_score'),
	priceWarning:        integer('price_warning').default(0),
});

// BetterAuth tables — dates stored as Unix timestamps (integer) so that
// BetterAuth's Date objects map cleanly through Drizzle's SQLite driver.
export const user = sqliteTable('user', {
	id:            text('id').primaryKey(),
	name:          text('name').notNull(),
	email:         text('email').notNull().unique(),
	emailVerified: integer('emailVerified', { mode: 'boolean' }).notNull().default(false),
	image:         text('image'),
	createdAt:     integer('createdAt', { mode: 'timestamp' }).notNull(),
	updatedAt:     integer('updatedAt', { mode: 'timestamp' }).notNull(),
});

export const session = sqliteTable('session', {
	id:        text('id').primaryKey(),
	expiresAt: integer('expiresAt', { mode: 'timestamp' }).notNull(),
	token:     text('token').notNull().unique(),
	createdAt: integer('createdAt', { mode: 'timestamp' }).notNull(),
	updatedAt: integer('updatedAt', { mode: 'timestamp' }).notNull(),
	ipAddress: text('ipAddress'),
	userAgent: text('userAgent'),
	userId:    text('userId').notNull().references(() => user.id),
});

export const verification = sqliteTable('verification', {
	id:         text('id').primaryKey(),
	identifier: text('identifier').notNull(),
	value:      text('value').notNull(),
	expiresAt:  integer('expiresAt', { mode: 'timestamp' }).notNull(),
	createdAt:  integer('createdAt', { mode: 'timestamp' }),
	updatedAt:  integer('updatedAt', { mode: 'timestamp' }),
});

export const account = sqliteTable('account', {
	id:                    text('id').primaryKey(),
	accountId:             text('accountId').notNull(),
	providerId:            text('providerId').notNull(),
	userId:                text('userId').notNull().references(() => user.id),
	accessToken:           text('accessToken'),
	refreshToken:          text('refreshToken'),
	idToken:               text('idToken'),
	accessTokenExpiresAt:  integer('accessTokenExpiresAt', { mode: 'timestamp' }),
	refreshTokenExpiresAt: integer('refreshTokenExpiresAt', { mode: 'timestamp' }),
	scope:                 text('scope'),
	password:              text('password'),
	createdAt:             integer('createdAt', { mode: 'timestamp' }).notNull(),
	updatedAt:             integer('updatedAt', { mode: 'timestamp' }).notNull(),
});
