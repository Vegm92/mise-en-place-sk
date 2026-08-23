import {
	boolean, check, date, index, integer, jsonb, numeric, pgTable, primaryKey, real, serial, text, timestamp, uniqueIndex, uuid,
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
	userId:       uuid('user_id').notNull(),
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
	deliveryDays:       text('delivery_days'),
	paymentTerms:       text('payment_terms'),
	notes:              text('notes'),
	outstandingBalance: numeric('outstanding_balance', { precision: 12, scale: 2 }),
}, (t) => [
	uniqueIndex('uq_suppliers_rid_name').on(t.restaurantId, sql`lower(${t.name})`),
]);

export const invoices = pgTable('invoices', {
	id:              serial('id').primaryKey(),
	restaurantId:    uuid('restaurant_id').notNull().references(() => restaurants.id, { onDelete: 'cascade' }),
	supplierId:      integer('supplier_id').references(() => suppliers.id),
	invoiceNumber:   text('invoice_number'),
	documentType:    text('document_type'),
	invoiceDate:     date('invoice_date'),
	dueDate:         date('due_date'),
	totalAmount:     numeric('total_amount', { precision: 12, scale: 2 }),
	taxBase:         numeric('tax_base', { precision: 12, scale: 2 }),
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
	unitPrice:              numeric('unit_price', { precision: 12, scale: 2 }),
	totalPrice:             numeric('total_price', { precision: 12, scale: 2 }),
	taxRate:                real('tax_rate'),
	requiresUnitConversion: integer('requires_unit_conversion').default(0),
	canonicalUnit:          text('canonical_unit'),
	productId:              integer('product_id').references(() => products.id, { onDelete: 'set null' }),
	unitsPerPack:           real('units_per_pack'),
	unitSize:               real('unit_size'),
	sizeUnit:               text('size_unit'),
	baseUnit:               text('base_unit'),
	normalizedUnitPrice:    numeric('normalized_unit_price', { precision: 12, scale: 2 }),
	supplierSku:            text('supplier_sku'),
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
	monthlyBudget: numeric('monthly_budget', { precision: 12, scale: 2 }).notNull(),
}, (t) => [
	uniqueIndex('category_budgets_restaurant_category_month_unique').on(t.restaurantId, t.category, t.month),
	check('category_budgets_month_format', sql`${t.month} ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'`),
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

export const users = pgTable('users', {
	id:            uuid('id').primaryKey().default(sql`gen_random_uuid()`),
	name:          text('name'),
	email:         text('email').notNull().unique(),
	emailVerified: timestamp('email_verified', { withTimezone: true }),
	image:         text('image'),
	passwordHash:  text('password_hash'),
	accessStatus:  text('access_status').notNull().default('pending'),
	founder:       boolean('founder').notNull().default(false),
	tokenVersion:  integer('token_version').notNull().default(0),
	createdAt:     timestamp('created_at', { withTimezone: true }).defaultNow(),
});

export const accounts = pgTable('accounts', {
	userId:            uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
	type:              text('type').notNull(),
	provider:          text('provider').notNull(),
	providerAccountId: text('provider_account_id').notNull(),
	refresh_token:     text('refresh_token'),
	access_token:      text('access_token'),
	expires_at:        integer('expires_at'),
	token_type:        text('token_type'),
	scope:             text('scope'),
	id_token:          text('id_token'),
	session_state:     text('session_state'),
}, (t) => [
	primaryKey({ columns: [t.provider, t.providerAccountId] }),
]);

export const sessions = pgTable('sessions', {
	sessionToken: text('session_token').primaryKey(),
	userId:       uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
	expires:      timestamp('expires', { withTimezone: true }).notNull(),
});

export const verificationTokens = pgTable('verification_tokens', {
	identifier: text('identifier').notNull(),
	token:      text('token').notNull(),
	expires:    timestamp('expires', { withTimezone: true }).notNull(),
}, (t) => [
	primaryKey({ columns: [t.identifier, t.token] }),
]);

export const invoiceAuditLog = pgTable('invoice_audit_log', {
	id:           serial('id').primaryKey(),
	restaurantId: uuid('restaurant_id').notNull().references(() => restaurants.id, { onDelete: 'cascade' }),
	invoiceId:    integer('invoice_id').notNull(),
	action:       text('action').notNull(),
	userId:       text('user_id').notNull(),
	reason:       text('reason'),
	snapshot:     text('snapshot'),
	createdAt:    timestamp('created_at', { withTimezone: true }).defaultNow(),
}, (t) => [
	index('idx_invoice_audit_restaurant').on(t.restaurantId),
	index('idx_invoice_audit_invoice').on(t.invoiceId),
]);

export const productAliases = pgTable('product_aliases', {
	id:           serial('id').primaryKey(),
	restaurantId: uuid('restaurant_id').notNull().references(() => restaurants.id, { onDelete: 'cascade' }),
	productId:    integer('product_id').notNull().references(() => products.id, { onDelete: 'cascade' }),
	supplierId:   integer('supplier_id').references(() => suppliers.id, { onDelete: 'set null' }),
	rawKey:       text('raw_key').notNull(),
	rawText:      text('raw_text'),
	supplierSku:  text('supplier_sku'),
	source:       text('source').notNull().default('exact'),
	confirmedAt:  timestamp('confirmed_at', { withTimezone: true }),
	createdAt:    timestamp('created_at', { withTimezone: true }).defaultNow(),
}, (t) => [
	uniqueIndex('product_aliases_restaurant_raw_key_unique').on(t.restaurantId, t.rawKey),
	index('product_aliases_product_idx').on(t.restaurantId, t.productId),
	index('product_aliases_pending_idx').on(t.restaurantId).where(sql`${t.confirmedAt} IS NULL`),
]);

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

export const unitConversions = pgTable('unit_conversions', {
	id:               serial('id').primaryKey(),
	restaurantId:     uuid('restaurant_id').notNull().references(() => restaurants.id, { onDelete: 'cascade' }),
	supplierId:       integer('supplier_id').references(() => suppliers.id, { onDelete: 'set null' }),
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
	index('unit_conversions_supplier_id_idx')
		.on(t.restaurantId, t.supplierId, t.ingredient, t.purchaseUnit)
		.where(sql`${t.supplierId} IS NOT NULL`),
]);

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
	id:           serial('id').primaryKey(),
	restaurantId: uuid('restaurant_id').notNull().references(() => restaurants.id, { onDelete: 'cascade' }),
	sessionId:    integer('session_id').references(() => chatSessions.id, { onDelete: 'cascade' }),
	role:         text('role').notNull(),
	text:         text('text').notNull(),
	actions:      text('actions'),
	createdAt:    timestamp('created_at', { withTimezone: true }).defaultNow(),
}, (t) => [
	index('idx_chat_messages_restaurant').on(t.restaurantId),
	index('idx_chat_messages_session').on(t.sessionId),
]);

export const llmUsageLog = pgTable('llm_usage_log', {
	id:               serial('id').primaryKey(),
	restaurantId:     uuid('restaurant_id').notNull().references(() => restaurants.id, { onDelete: 'cascade' }),
	model:            text('model').notNull(),
	inputTokens:      integer('input_tokens').notNull().default(0),
	outputTokens:     integer('output_tokens').notNull().default(0),
	estimatedCostUsd: numeric('estimated_cost_usd', { precision: 12, scale: 8 }).notNull().default('0'),
	callerContext:    text('caller_context'),
	createdAt:        timestamp('created_at', { withTimezone: true }).defaultNow(),
}, (t) => [
	index('llm_usage_log_restaurant_month').on(t.restaurantId, t.createdAt),
]);

export const tenantLlmQuotas = pgTable('tenant_llm_quotas', {
	restaurantId:        uuid('restaurant_id').notNull().primaryKey().references(() => restaurants.id, { onDelete: 'cascade' }),
	monthlyExtractions:  integer('monthly_extractions'),
	monthlyCostLimitUsd: numeric('monthly_cost_limit_usd', { precision: 10, scale: 4 }),
	updatedAt:           timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

export const monthlyUsage = pgTable('monthly_usage', {
	restaurantId: uuid('restaurant_id').notNull().references(() => restaurants.id, { onDelete: 'cascade' }),
	month:        text('month').notNull(),
	used:         integer('used').notNull().default(0),
}, (t) => [
	uniqueIndex('monthly_usage_restaurant_month_unique').on(t.restaurantId, t.month),
	check('monthly_usage_month_format', sql`${t.month} ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'`),
]);

export const idempotencyKeys = pgTable('idempotency_keys', {
	scope:        text('scope').notNull(),
	key:          text('key').notNull(),
	restaurantId: uuid('restaurant_id').references(() => restaurants.id, { onDelete: 'cascade' }),
	claimedAt:    timestamp('claimed_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
	primaryKey({ columns: [t.scope, t.key] }),
	index('idx_idempotency_keys_claimed').on(t.claimedAt),
]);

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
}, (t) => [
	index('upload_sessions_updated_at_idx').on(t.updatedAt),
]);

export const uploadBatches = pgTable('upload_batches', {
	id:           uuid('id').primaryKey().default(sql`gen_random_uuid()`),
	restaurantId: uuid('restaurant_id').notNull().references(() => restaurants.id, { onDelete: 'cascade' }),
	createdAt:    timestamp('created_at', { withTimezone: true }).defaultNow(),
});

export const batchItems = pgTable('batch_items', {
	id:              uuid('id').primaryKey().default(sql`gen_random_uuid()`),
	batchId:         uuid('batch_id').notNull().references(() => uploadBatches.id, { onDelete: 'cascade' }),
	restaurantId:    uuid('restaurant_id').notNull().references(() => restaurants.id, { onDelete: 'cascade' }),
	position:        integer('position').notNull(),
	fileKey:         text('file_key').notNull(),
	displayName:     text('display_name').notNull(),
	status:          text('status').notNull().default('pending'),
	extractedData:   jsonb('extracted_data'),
	conversionNotes: jsonb('conversion_notes'),
	extractError:    text('extract_error'),
	createdAt:       timestamp('created_at', { withTimezone: true }).defaultNow(),
	updatedAt:       timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, (t) => [
	index('batch_items_batch_id_idx').on(t.batchId),
	index('batch_items_updated_at_idx').on(t.updatedAt),
]);

export const whatsappContacts = pgTable('whatsapp_contacts', {
	id:           serial('id').primaryKey(),
	restaurantId: uuid('restaurant_id').notNull().references(() => restaurants.id, { onDelete: 'cascade' }),
	phoneNumber:  text('phone_number').notNull(),
	displayName:  text('display_name'),
	createdAt:    timestamp('created_at', { withTimezone: true }).defaultNow(),
}, (t) => [
	uniqueIndex('whatsapp_contacts_phone_unique').on(t.phoneNumber),
	index('idx_whatsapp_contacts_restaurant').on(t.restaurantId),
]);

export const whatsappAccountEvents = pgTable('whatsapp_account_events', {
	id:            serial('id').primaryKey(),
	field:         text('field').notNull(),
	event:         text('event'),
	phoneNumber:   text('phone_number'),
	qualityRating: text('quality_rating'),
	messagingLimit: text('messaging_limit'),
	severity:      text('severity').notNull().default('info'),
	payload:       jsonb('payload'),
	receivedAt:    timestamp('received_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
	index('idx_whatsapp_account_events_received').on(t.receivedAt),
	index('idx_whatsapp_account_events_severity').on(t.severity, t.receivedAt),
]);

export const whatsappPairingCodes = pgTable('whatsapp_pairing_codes', {
	id:           serial('id').primaryKey(),
	restaurantId: uuid('restaurant_id').notNull().references(() => restaurants.id, { onDelete: 'cascade' }),
	code:         text('code').notNull(),
	displayName:  text('display_name'),
	createdBy:    text('created_by'),
	expiresAt:    timestamp('expires_at', { withTimezone: true }).notNull(),
	redeemedAt:   timestamp('redeemed_at', { withTimezone: true }),
	redeemedBy:   text('redeemed_by'),
	createdAt:    timestamp('created_at', { withTimezone: true }).defaultNow(),
}, (t) => [
	uniqueIndex('whatsapp_pairing_codes_code_unique').on(t.code),
	index('idx_whatsapp_pairing_restaurant').on(t.restaurantId),
	index('idx_whatsapp_pairing_expires').on(t.expiresAt),
]);

export const userConsents = pgTable('user_consents', {
	id:            serial('id').primaryKey(),
	userId:        text('user_id').notNull(),
	policyVersion: text('policy_version').notNull(),
	method:        text('method').notNull(),
	acceptedAt:    timestamp('accepted_at', { withTimezone: true }).defaultNow(),
}, (t) => [
	uniqueIndex('user_consents_user_version_unique').on(t.userId, t.policyVersion),
]);

export const subscriptions = pgTable('subscriptions', {
	id:                   serial('id').primaryKey(),
	restaurantId:         uuid('restaurant_id').notNull().unique().references(() => restaurants.id, { onDelete: 'cascade' }),
	stripeCustomerId:     text('stripe_customer_id').unique(),
	stripeSubscriptionId: text('stripe_subscription_id').unique(),
	stripePriceId:        text('stripe_price_id'),
	planTier:             text('plan_tier').notNull().default('trial'),
	status:               text('status').notNull().default('trialing'),
	trialEndsAt:          timestamp('trial_ends_at', { withTimezone: true }),
	currentPeriodEnd:     timestamp('current_period_end', { withTimezone: true }),
	cancelAtPeriodEnd:    boolean('cancel_at_period_end').notNull().default(false),
	founder:              boolean('founder').notNull().default(false),
	createdAt:            timestamp('created_at', { withTimezone: true }).defaultNow(),
	updatedAt:            timestamp('updated_at', { withTimezone: true }).defaultNow(),
	lastEventAt:          timestamp('last_event_at', { withTimezone: true }),
});

export const appFlags = pgTable('app_flags', {
	key:       text('key').primaryKey(),
	value:     text('value').notNull(),
	updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

export const mrrSnapshots = pgTable('mrr_snapshots', {
	id:           serial('id').primaryKey(),
	month:        text('month').notNull(),
	restaurantId: uuid('restaurant_id').notNull().references(() => restaurants.id, { onDelete: 'cascade' }),
	planTier:     text('plan_tier').notNull(),
	status:       text('status').notNull(),
	mrrCents:     integer('mrr_cents').notNull().default(0),
	atRiskCents:  integer('at_risk_cents').notNull().default(0),
	source:       text('source').notNull().default('live'),
	capturedAt:   timestamp('captured_at', { withTimezone: true }).defaultNow(),
}, (t) => [
	uniqueIndex('mrr_snapshots_month_restaurant_unique').on(t.month, t.restaurantId),
	index('mrr_snapshots_month_idx').on(t.month),
	index('mrr_snapshots_paying_idx').on(t.restaurantId, t.month).where(sql`${t.mrrCents} > 0`),
	check('mrr_snapshots_month_format', sql`${t.month} ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'`),
]);

export const acquisitionCosts = pgTable('acquisition_costs', {
	id:          serial('id').primaryKey(),
	month:       text('month').notNull(),
	category:    text('category').notNull(),
	amountCents: integer('amount_cents').notNull(),
	note:        text('note'),
	createdBy:   text('created_by'),
	createdAt:   timestamp('created_at', { withTimezone: true }).defaultNow(),
}, (t) => [
	index('acquisition_costs_month_idx').on(t.month),
	check('acquisition_costs_month_format', sql`${t.month} ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'`),
]);

export const revenueAssumptions = pgTable('revenue_assumptions', {
	key:       text('key').primaryKey(),
	value:     text('value').notNull(),
	updatedBy: text('updated_by'),
	updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

export const deadLetterQueue = pgTable('dead_letter_queue', {
	id:           serial('id').primaryKey(),
	queue:        text('queue').notNull(),
	restaurantId: uuid('restaurant_id').references(() => restaurants.id, { onDelete: 'cascade' }),
	sourceId:     text('source_id'),
	jobId:        text('job_id'),
	errorClass:   text('error_class').notNull(),
	errorMessage: text('error_message').notNull(),
	stack:        text('stack'),
	payload:      jsonb('payload'),
	attempt:      integer('attempt').notNull().default(1),
	occurrences:  integer('occurrences').notNull().default(1),
	status:       text('status').notNull().default('pending'),
	firstSeenAt:  timestamp('first_seen_at', { withTimezone: true }).notNull().defaultNow(),
	lastSeenAt:   timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
	reviewedAt:   timestamp('reviewed_at', { withTimezone: true }),
	reviewedBy:   text('reviewed_by'),
}, (t) => [
	index('dead_letter_queue_status_idx').on(t.status, t.lastSeenAt),
	index('dead_letter_queue_queue_idx').on(t.queue, t.lastSeenAt),
	index('dead_letter_queue_restaurant_idx').on(t.restaurantId),
	index('dead_letter_queue_dedupe_idx').on(t.queue, t.sourceId, t.errorClass, t.status),
]);
