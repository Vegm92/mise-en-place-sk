import {
	index, integer, pgTable, primaryKey, real, serial, text, timestamp, uniqueIndex, uuid,
	type AnyPgColumn
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

export const restaurants = pgTable('restaurants', {
	id:        uuid('id').primaryKey().default(sql`gen_random_uuid()`),
	name:      text('name').notNull(),
	slug:      text('slug').notNull().unique(),
	parentId:  uuid('parent_id').references((): AnyPgColumn => restaurants.id, { onDelete: 'cascade' }),
	createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
}, (t) => [
	index('restaurants_parent_idx').on(t.parentId),
]);

export const userRestaurants = pgTable('user_restaurants', {
	userId:       text('user_id').notNull(),
	restaurantId: uuid('restaurant_id').notNull().references(() => restaurants.id, { onDelete: 'cascade' }),
	role:         text('role').notNull().default('owner'),
	createdAt:    timestamp('created_at', { withTimezone: true }).defaultNow(),
}, (t) => [
	primaryKey({ columns: [t.userId, t.restaurantId] }),
]);

export const suppliers = pgTable('suppliers', {
	id:            serial('id').primaryKey(),
	restaurantId:  uuid('restaurant_id').notNull().references(() => restaurants.id, { onDelete: 'cascade' }),
	name:          text('name').notNull(),
	alias:         text('alias'),
	createdAt:     timestamp('created_at', { withTimezone: true }).defaultNow(),
	category:      text('category'),
	contactEmail:  text('contact_email'),
	contactPhone:  text('contact_phone'),
	cif:           text('cif'),
	address:       text('address'),
	deliveryDays:  text('delivery_days'),
	paymentTerms:  text('payment_terms'),
	notes:         text('notes'),
}, (t) => [
	uniqueIndex('uq_suppliers_rid_name').on(t.restaurantId, sql`lower(${t.name})`),
]);

export const invoices = pgTable('invoices', {
	id:              serial('id').primaryKey(),
	restaurantId:    uuid('restaurant_id').notNull().references(() => restaurants.id, { onDelete: 'cascade' }),
	supplierId:      integer('supplier_id').references(() => suppliers.id),
	invoiceNumber:   text('invoice_number'),
	invoiceDate:     text('invoice_date'),
	dueDate:         text('due_date'),
	totalAmount:     real('total_amount'),
	taxBase:         real('tax_base'),
	taxBreakdown:    text('tax_breakdown'),
	status:          text('status').default('pending'),
	sourceFile:      text('source_file'),
	confidence:      real('confidence'),
	contentHash:     text('content_hash'),
	createdAt:       timestamp('created_at', { withTimezone: true }).defaultNow(),
	notes:           text('notes'),
	deletedAt:       timestamp('deleted_at', { withTimezone: true }),
	eInvoiceFormat:  text('e_invoice_format'),
	qrUrl:           text('qr_url'),
	qrMismatch:      integer('qr_mismatch').default(0),
	acceptedAt:      timestamp('accepted_at', { withTimezone: true }),
	rejectedAt:      timestamp('rejected_at', { withTimezone: true }),
	paidAt:          timestamp('paid_at', { withTimezone: true }),
	version:         integer('version').notNull().default(1),
}, (t) => [
	uniqueIndex('uq_invoices_rid_supplier_number')
		.on(t.restaurantId, t.supplierId, t.invoiceNumber)
		.where(sql`${t.invoiceNumber} IS NOT NULL`),
	index('idx_invoices_deleted_at')
		.on(t.restaurantId)
		.where(sql`${t.deletedAt} IS NULL`),
	uniqueIndex('uq_invoices_rid_content_hash')
		.on(t.restaurantId, t.contentHash)
		.where(sql`${t.contentHash} IS NOT NULL AND ${t.deletedAt} IS NULL`),
	index('idx_invoices_rid_status').on(t.restaurantId, t.status),
	index('idx_invoices_rid_created_at').on(t.restaurantId, t.createdAt),
]);

export const invoiceLineItems = pgTable('invoice_line_items', {
	id:                     serial('id').primaryKey(),
	restaurantId:           uuid('restaurant_id').notNull().references(() => restaurants.id, { onDelete: 'cascade' }),
	invoiceId:              integer('invoice_id').references(() => invoices.id, { onDelete: 'cascade' }),
	description:            text('description'),
	quantity:               real('quantity'),
	unit:                   text('unit'),
	unitPrice:              real('unit_price'),
	totalPrice:             real('total_price'),
	taxRate:                real('tax_rate'),
	requiresUnitConversion: integer('requires_unit_conversion').default(0),
	canonicalUnit:          text('canonical_unit'),
	productId:              integer('product_id').references(() => products.id, { onDelete: 'set null' }),
	unitsPerPack:           real('units_per_pack'),
	unitSize:               real('unit_size'),
	sizeUnit:               text('size_unit'),
	baseUnit:               text('base_unit'),
	normalizedUnitPrice:    real('normalized_unit_price'),
}, (t) => [
	index('idx_invoice_line_items_invoice_id').on(t.invoiceId),
	index('idx_invoice_line_items_rid_description').on(t.restaurantId, t.description),
	index('idx_invoice_line_items_product_id').on(t.restaurantId, t.productId).where(sql`${t.productId} IS NOT NULL`),
]);

export const products = pgTable('products', {
	id:            serial('id').primaryKey(),
	restaurantId:  uuid('restaurant_id').notNull().references(() => restaurants.id, { onDelete: 'cascade' }),
	canonicalName: text('canonical_name').notNull(),
	nameKey:       text('name_key').notNull(),
	category:      text('category'),
	canonicalUnit: text('canonical_unit'),
	unitsPerPack:  real('units_per_pack'),
	baseUnit:      text('base_unit'),
	createdAt:     timestamp('created_at', { withTimezone: true }).defaultNow(),
}, (t) => [
	uniqueIndex('products_restaurant_name_key_unique').on(t.restaurantId, t.nameKey),
]);

export const categoryBudgets = pgTable('category_budgets', {
	restaurantId:  uuid('restaurant_id').notNull().references(() => restaurants.id, { onDelete: 'cascade' }),
	category:      text('category').notNull(),
	month:         text('month').notNull(),
	monthlyBudget: real('monthly_budget').notNull(),
}, (t) => [
	uniqueIndex('category_budgets_restaurant_category_month_unique').on(t.restaurantId, t.category, t.month),
]);

export const systemNotifications = pgTable('system_notifications', {
	id:               serial('id').primaryKey(),
	restaurantId:     uuid('restaurant_id').notNull().references(() => restaurants.id, { onDelete: 'cascade' }),
	invoiceId:        integer('invoice_id').references(() => invoices.id),
	notificationType: text('notification_type').notNull(),
	message:          text('message').notNull(),
	payload:          text('payload'),
	status:           text('status').default('pending'),
	createdAt:        timestamp('created_at', { withTimezone: true }).defaultNow(),
}, (t) => [
	index('idx_system_notifications_rid_status_created').on(t.restaurantId, t.status, t.createdAt),
]);
