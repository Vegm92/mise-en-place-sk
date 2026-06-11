/** Drizzle schema — PostgreSQL (Supabase). Single source of truth. */
import {
	boolean, integer, pgTable, real, serial, text, timestamp, uniqueIndex, uuid
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

// ── Multi-tenant core ──────────────────────────────────────────────────────

export const restaurants = pgTable('restaurants', {
	id:        uuid('id').primaryKey().default(sql`gen_random_uuid()`),
	name:      text('name').notNull(),
	slug:      text('slug').notNull().unique(),
	createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

export const userRestaurants = pgTable('user_restaurants', {
	userId:       text('user_id').notNull(),
	restaurantId: uuid('restaurant_id').notNull().references(() => restaurants.id, { onDelete: 'cascade' }),
	role:         text('role').notNull().default('owner'), // 'owner' | 'member'
	createdAt:    timestamp('created_at', { withTimezone: true }).defaultNow(),
});

// ── Business tables (all scoped to restaurant_id) ──────────────────────────

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
	deliveryDays:  text('delivery_days'),
	paymentTerms:  text('payment_terms'),
	notes:         text('notes'),
});

export const invoices = pgTable('invoices', {
	id:            serial('id').primaryKey(),
	restaurantId:  uuid('restaurant_id').notNull().references(() => restaurants.id, { onDelete: 'cascade' }),
	supplierId:    integer('supplier_id').references(() => suppliers.id),
	invoiceNumber: text('invoice_number'),
	invoiceDate:   text('invoice_date'),
	dueDate:       text('due_date'),
	totalAmount:   real('total_amount'),
	taxBase:       real('tax_base'),
	taxBreakdown:  text('tax_breakdown'),
	status:        text('status').default('pending'),
	sourceFile:    text('source_file'),
	confidence:    real('confidence'),
	createdAt:     timestamp('created_at', { withTimezone: true }).defaultNow(),
	notes:         text('notes'),
	deletedAt:     timestamp('deleted_at', { withTimezone: true }),
}, (t) => [
	uniqueIndex('uq_invoices_rid_supplier_number')
		.on(t.restaurantId, t.supplierId, t.invoiceNumber)
		.where(sql`${t.invoiceNumber} IS NOT NULL`),
]);

export const invoiceAuditLog = pgTable('invoice_audit_log', {
	id:           serial('id').primaryKey(),
	restaurantId: uuid('restaurant_id').notNull().references(() => restaurants.id, { onDelete: 'cascade' }),
	invoiceId:    integer('invoice_id').notNull(),
	action:       text('action').notNull(), // 'soft_delete' | 'restore' | 'hard_delete'
	userId:       text('user_id').notNull(),
	reason:       text('reason'),
	snapshot:     text('snapshot'),
	createdAt:    timestamp('created_at', { withTimezone: true }).defaultNow(),
});

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
});

export const supplierMetrics = pgTable('supplier_metrics', {
	id:                  serial('id').primaryKey(),
	restaurantId:        uuid('restaurant_id').notNull().references(() => restaurants.id, { onDelete: 'cascade' }),
	supplierId:          integer('supplier_id').notNull().unique().references(() => suppliers.id, { onDelete: 'cascade' }),
	score:               integer('score').notNull().default(0),
	priceStabilityScore: integer('price_stability_score').notNull().default(0),
	frequencyScore:      integer('frequency_score').notNull().default(0),
	timelinessScore:     integer('timeliness_score').notNull().default(0),
	priceStabilityCv:    real('price_stability_cv'),
	computedAt:          timestamp('computed_at', { withTimezone: true }).defaultNow(),
});

export const settings = pgTable('settings', {
	restaurantId: uuid('restaurant_id').notNull().references(() => restaurants.id, { onDelete: 'cascade' }),
	key:          text('key').notNull(),
	value:        text('value').notNull(),
}, (t) => [
	uniqueIndex('settings_restaurant_key_unique').on(t.restaurantId, t.key),
]);

export const categoryBudgets = pgTable('category_budgets', {
	restaurantId:  uuid('restaurant_id').notNull().references(() => restaurants.id, { onDelete: 'cascade' }),
	category:      text('category').notNull(),
	monthlyBudget: real('monthly_budget').notNull(),
}, (t) => [
	uniqueIndex('category_budgets_restaurant_category_unique').on(t.restaurantId, t.category),
]);

export const unitConversions = pgTable('unit_conversions', {
	id:               serial('id').primaryKey(),
	restaurantId:     uuid('restaurant_id').notNull().references(() => restaurants.id, { onDelete: 'cascade' }),
	supplierName:     text('supplier_name').notNull(),
	ingredient:       text('ingredient').notNull(),
	purchaseUnit:     text('purchase_unit').notNull(),
	canonicalUnit:    text('canonical_unit').notNull(),
	conversionFactor: real('conversion_factor').notNull(),
	createdAt:        timestamp('created_at', { withTimezone: true }).defaultNow(),
}, (t) => [
	uniqueIndex('unit_conversions_supplier_ingredient_unit_unique').on(
		t.restaurantId, t.supplierName, t.ingredient, t.purchaseUnit
	),
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
});

export const stockLevels = pgTable('stock_levels', {
	id:           serial('id').primaryKey(),
	restaurantId: uuid('restaurant_id').notNull().references(() => restaurants.id, { onDelete: 'cascade' }),
	ingredient:   text('ingredient').notNull(),
	currentStock: real('current_stock').default(0),
	canonicalUnit: text('canonical_unit'),
	dailyBurnRate: real('daily_burn_rate').default(0),
	updatedAt:     timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, (t) => [
	uniqueIndex('stock_levels_restaurant_ingredient_unique').on(t.restaurantId, t.ingredient),
]);

export const extractionCorrections = pgTable('extraction_corrections', {
	id:             serial('id').primaryKey(),
	restaurantId:   uuid('restaurant_id').notNull().references(() => restaurants.id, { onDelete: 'cascade' }),
	invoiceId:      integer('invoice_id').references(() => invoices.id),
	supplierId:     integer('supplier_id').references(() => suppliers.id),
	fieldName:      text('field_name').notNull(),
	originalValue:  text('original_value'),
	correctedValue: text('corrected_value'),
	lineItemIndex:  integer('line_item_index'),
	correctedAt:    timestamp('corrected_at', { withTimezone: true }).defaultNow(),
});


export const chatSessions = pgTable('chat_sessions', {
	id:           serial('id').primaryKey(),
	restaurantId: uuid('restaurant_id').notNull().references(() => restaurants.id, { onDelete: 'cascade' }),
	title:        text('title').notNull().default('Nueva conversación'),
	createdAt:    timestamp('created_at', { withTimezone: true }).defaultNow(),
	updatedAt:    timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

export const chatMessages = pgTable('chat_messages', {
	id:        serial('id').primaryKey(),
	sessionId: integer('session_id').references(() => chatSessions.id, { onDelete: 'cascade' }),
	role:      text('role').notNull(),
	text:      text('text').notNull(),
	actions:   text('actions'),
	createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

export const waitlist = pgTable('waitlist', {
	id:        serial('id').primaryKey(),
	email:     text('email').notNull().unique(),
	createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

export const uploadSessions = pgTable('upload_sessions', {
	id:        text('id').primaryKey(),
	data:      text('data').notNull(),
	createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
	updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

export const subscriptions = pgTable('subscriptions', {
	id:                   serial('id').primaryKey(),
	restaurantId:         uuid('restaurant_id').notNull().unique().references(() => restaurants.id, { onDelete: 'cascade' }),
	stripeCustomerId:     text('stripe_customer_id').unique(),
	stripeSubscriptionId: text('stripe_subscription_id').unique(),
	stripePriceId:        text('stripe_price_id'),
	status:               text('status').notNull().default('trialing'),
	trialEndsAt:          timestamp('trial_ends_at', { withTimezone: true }),
	currentPeriodEnd:     timestamp('current_period_end', { withTimezone: true }),
	cancelAtPeriodEnd:    boolean('cancel_at_period_end').notNull().default(false),
	createdAt:            timestamp('created_at', { withTimezone: true }).defaultNow(),
	updatedAt:            timestamp('updated_at', { withTimezone: true }).defaultNow(),
});
