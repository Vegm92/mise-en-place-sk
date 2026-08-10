import {
	boolean, index, integer, jsonb, numeric, pgTable, real, serial, text, timestamp, uniqueIndex, uuid,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { invoices, products, restaurants, suppliers } from './core';

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
]);

export const processedRequests = pgTable('processed_requests', {
	key:          uuid('key').primaryKey(),
	restaurantId: uuid('restaurant_id').references(() => restaurants.id, { onDelete: 'cascade' }),
	createdAt:    timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
	index('idx_processed_requests_created').on(t.createdAt),
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

export const whatsappProcessedMessages = pgTable('whatsapp_processed_messages', {
	messageId:  text('message_id').primaryKey(),
	receivedAt: timestamp('received_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
	index('idx_whatsapp_processed_received').on(t.receivedAt),
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
	createdAt:            timestamp('created_at', { withTimezone: true }).defaultNow(),
	updatedAt:            timestamp('updated_at', { withTimezone: true }).defaultNow(),
	lastEventAt:          timestamp('last_event_at', { withTimezone: true }),
});

export const stripeWebhookEvents = pgTable('stripe_webhook_events', {
	eventId:     text('event_id').primaryKey(),
	processedAt: timestamp('processed_at', { withTimezone: true }).notNull().defaultNow(),
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
