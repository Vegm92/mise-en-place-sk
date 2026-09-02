import {
	boolean, check, date, foreignKey, index, integer, jsonb, numeric, pgTable, primaryKey, real, serial, text, timestamp, uniqueIndex, uuid,
	type AnyPgColumn
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

export const restaurants = pgTable('restaurants', {
	id:                 uuid('id').primaryKey().default(sql`gen_random_uuid()`),
	name:               text('name').notNull(),
	slug:               text('slug').notNull().unique(),
	parentId:           uuid('parent_id').references((): AnyPgColumn => restaurants.id, { onDelete: 'cascade' }),
	createdAt:          timestamp('created_at', { withTimezone: true }).defaultNow(),
	venueType:          text('venue_type'),
	city:               text('city'),
	topCategory:        text('top_category'),
	acquisitionSource:  text('acquisition_source'),
	acquisitionVariant: text('acquisition_variant'),
	legalName:          text('legal_name'),
	cifNif:             text('cif_nif'),
	fiscalAddress:      text('fiscal_address'),
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
	normalizedCif:      text('normalized_cif'),
}, (t) => [
	uniqueIndex('uq_suppliers_rid_name').on(t.restaurantId, sql`lower(${t.name})`),
	index('suppliers_rid_normalized_cif_idx').on(t.restaurantId, t.normalizedCif).where(sql`${t.normalizedCif} IS NOT NULL`),
]);

export const supplierAliases = pgTable('supplier_aliases', {
	id:             serial('id').primaryKey(),
	restaurantId:   uuid('restaurant_id').notNull().references(() => restaurants.id, { onDelete: 'cascade' }),
	supplierId:     integer('supplier_id').notNull().references(() => suppliers.id, { onDelete: 'cascade' }),
	name:           text('name').notNull(),
	normalizedName: text('normalized_name').notNull(),
	createdAt:      timestamp('created_at', { withTimezone: true }).defaultNow(),
}, (t) => [
	uniqueIndex('uq_supplier_aliases_rid_normalized_name').on(t.restaurantId, t.normalizedName),
	index('supplier_aliases_supplier_idx').on(t.restaurantId, t.supplierId),
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
	grossAmount:     numeric('gross_amount', { precision: 12, scale: 2 }),
	discountAmount:  numeric('discount_amount', { precision: 12, scale: 2 }),
	retentionRate:   real('retention_rate'),
	retentionAmount: numeric('retention_amount', { precision: 12, scale: 2 }),
	status:          text('status').default('pending'),
	reviewState:     text('review_state').notNull().default('revisado'),
	incidenceKind:   text('incidence_kind'),
	sourceFile:      text('source_file'),
	confidence:      real('confidence'),
	contentHash:     text('content_hash'),
	createdAt:       timestamp('created_at', { withTimezone: true }).defaultNow(),
	notes:           text('notes'),
	deletedAt:       timestamp('deleted_at', { withTimezone: true }),
	eInvoiceFormat:  text('e_invoice_format'),
	qrUrl:           text('qr_url'),
	qrMismatch:      boolean('qr_mismatch').default(false),
	acceptedAt:      timestamp('accepted_at', { withTimezone: true }),
	rejectedAt:      timestamp('rejected_at', { withTimezone: true }),
	paidAt:          timestamp('paid_at', { withTimezone: true }),
	version:         integer('version').notNull().default(1),
	linkedInvoiceId: integer('linked_invoice_id').references((): AnyPgColumn => invoices.id, { onDelete: 'set null' }),
}, (t) => [
	uniqueIndex('uq_invoices_rid_supplier_number')
		.on(t.restaurantId, t.supplierId, t.invoiceNumber)
		.where(sql`${t.invoiceNumber} IS NOT NULL`),
	index('idx_invoices_linked_invoice_id')
		.on(t.linkedInvoiceId)
		.where(sql`${t.linkedInvoiceId} IS NOT NULL`),
	index('idx_invoices_deleted_at')
		.on(t.restaurantId)
		.where(sql`${t.deletedAt} IS NULL`),
	uniqueIndex('uq_invoices_rid_content_hash')
		.on(t.restaurantId, t.contentHash)
		.where(sql`${t.contentHash} IS NOT NULL AND ${t.deletedAt} IS NULL`),
	index('idx_invoices_rid_status').on(t.restaurantId, t.status),
	index('idx_invoices_rid_review_state').on(t.restaurantId, t.reviewState),
	index('idx_invoices_rid_incidence_kind').on(t.restaurantId, t.incidenceKind).where(sql`${t.incidenceKind} IS NOT NULL`),
	index('idx_invoices_rid_created_at').on(t.restaurantId, t.createdAt),
	check('invoices_incidence_kind_valid', sql`${t.incidenceKind} IS NULL OR ${t.incidenceKind} IN ('lectura','documento')`),
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
	requiresUnitConversion: boolean('requires_unit_conversion').default(false),
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
	allergens:       jsonb('allergens').$type<string[]>().notNull().default(sql`'[]'::jsonb`),
	allergensSource: text('allergens_source'),
	kcal100:         numeric('kcal_100', { precision: 8, scale: 2 }),
	protein100:      numeric('protein_100', { precision: 8, scale: 2 }),
	carbs100:        numeric('carbs_100', { precision: 8, scale: 2 }),
	fat100:          numeric('fat_100', { precision: 8, scale: 2 }),
	nutritionSource: text('nutrition_source'),
}, (t) => [
	uniqueIndex('products_restaurant_name_key_unique').on(t.restaurantId, t.nameKey),
	check('products_allergens_source_valid', sql`${t.allergensSource} IS NULL OR ${t.allergensSource} IN ('manual','extracted')`),
	check('products_nutrition_source_valid', sql`${t.nutritionSource} IS NULL OR ${t.nutritionSource} IN ('manual','extracted')`),
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
	payload:          jsonb('payload').$type<Record<string, unknown>>(),
	status:           text('status').default('pending'),
	createdAt:        timestamp('created_at', { withTimezone: true }).defaultNow(),
}, (t) => [
	index('idx_system_notifications_rid_status_created').on(t.restaurantId, t.status, t.createdAt),
	index('idx_system_notifications_budget_overage_exceeded')
		.on(t.restaurantId)
		.where(sql`${t.status} = 'pending' AND ${t.notificationType} = 'budget_overage' AND (${t.payload}->>'level') = 'exceeded'`),
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
	attrSource:      text('attr_source'),
	attrCampaign:    text('attr_campaign'),
	attrVariant:     text('attr_variant'),
	attrSegment:     text('attr_segment'),
	attrReferrer:    text('attr_referrer'),
	attrLandingPath: text('attr_landing_path'),
	attrReferredBy:  text('attr_referred_by'),
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
	originalSource: text('original_source'),
	reviewOutcome:  text('review_outcome'),
	confirmedAt:  timestamp('confirmed_at', { withTimezone: true }),
	createdAt:    timestamp('created_at', { withTimezone: true }).defaultNow(),
}, (t) => [
	uniqueIndex('product_aliases_restaurant_raw_key_unique').on(t.restaurantId, t.rawKey),
	index('product_aliases_product_idx').on(t.restaurantId, t.productId),
	index('product_aliases_pending_idx').on(t.restaurantId).where(sql`${t.confirmedAt} IS NULL`),
	check('product_aliases_review_outcome_valid', sql`${t.reviewOutcome} IS NULL OR ${t.reviewOutcome} IN ('confirmed','rejected')`),
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
	fieldConfidence: real('field_confidence'),
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

export const usageEvents = pgTable('usage_events', {
	id:           serial('id').primaryKey(),
	restaurantId: uuid('restaurant_id').notNull().references(() => restaurants.id, { onDelete: 'cascade' }),
	month:        text('month').notNull(),
	batchItemId:  uuid('batch_item_id'),
	kind:         text('kind').notNull(),
	delta:        integer('delta').notNull(),
	reason:       text('reason'),
	createdAt:    timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
	index('usage_events_item_idx').on(t.batchItemId).where(sql`${t.batchItemId} is not null`),
	index('usage_events_restaurant_month_idx').on(t.restaurantId, t.month),
	check('usage_events_month_format', sql`${t.month} ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'`),
	check('usage_events_kind_valid', sql`${t.kind} in ('claim', 'release')`),
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
	id:          serial('id').primaryKey(),
	email:       text('email').notNull().unique(),
	source:      text('source'),
	campaign:    text('campaign'),
	variant:     text('variant'),
	segment:     text('segment'),
	referrer:    text('referrer'),
	landingPath: text('landing_path'),
	referredBy:  text('referred_by'),
	createdAt:   timestamp('created_at', { withTimezone: true }).defaultNow(),
});

export const funnelEvents = pgTable('funnel_events', {
	id:        serial('id').primaryKey(),
	event:     text('event').notNull(),
	payload:   jsonb('payload').$type<Record<string, unknown>>(),
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
	index('idx_funnel_events_event_created').on(t.event, t.createdAt),
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
	extractErrorVars: jsonb('extract_error_vars').$type<Record<string, string | number>>(),
	queuedAt:        timestamp('queued_at', { withTimezone: true }),
	source:          text('source').notNull().default('web'),
	sourceRef:       text('source_ref'),
	jobCode:         text('job_code'),
	reviewStatus:    text('review_status'),
	createdAt:       timestamp('created_at', { withTimezone: true }).defaultNow(),
	updatedAt:       timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, (t) => [
	index('batch_items_batch_id_idx').on(t.batchId),
	index('batch_items_updated_at_idx').on(t.updatedAt),
	index('batch_items_queued_at_idx').on(t.queuedAt),
	uniqueIndex('batch_items_job_code_unique').on(t.jobCode)
		.where(sql`${t.reviewStatus} is null or ${t.reviewStatus} = 'pending'`),
	index('batch_items_source_ref_idx').on(t.sourceRef),
]);

export const extractionResults = pgTable('extraction_results', {
	id:               uuid('id').primaryKey().default(sql`gen_random_uuid()`),
	restaurantId:     uuid('restaurant_id').notNull().references(() => restaurants.id, { onDelete: 'cascade' }),
	batchItemId:      uuid('batch_item_id').references(() => batchItems.id, { onDelete: 'set null' }),
	fileKey:          text('file_key').notNull(),
	displayName:      text('display_name'),
	source:           text('source').notNull().default('web'),
	runKind:          text('run_kind').notNull().default('live'),
	promptVersion:    text('prompt_version').notNull(),
	model:            text('model'),
	extractedData:    jsonb('extracted_data').$type<Record<string, unknown>>().notNull(),
	fieldConfidences: jsonb('field_confidences').$type<Record<string, number>>(),
	confidence:       real('confidence'),
	conversionNotes:  jsonb('conversion_notes').$type<string[]>(),
	totalMismatch:    boolean('total_mismatch').notNull().default(false),
	createdAt:        timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
	index('extraction_results_restaurant_created_idx').on(t.restaurantId, t.createdAt),
	index('extraction_results_file_key_idx').on(t.restaurantId, t.fileKey),
	index('extraction_results_prompt_version_idx').on(t.promptVersion, t.createdAt),
	index('extraction_results_batch_item_idx').on(t.batchItemId),
]);

export const whatsappSession = pgTable('whatsapp_session', {
	id:        text('id').primaryKey(),
	data:      jsonb('data').notNull(),
	updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

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
	phoneNumber:  text('phone_number'),
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

export const workerHeartbeats = pgTable('worker_heartbeats', {
	id:                 text('id').primaryKey(),
	startedAt:          timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
	lastSeenAt:         timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
	lastJobCompletedAt: timestamp('last_job_completed_at', { withTimezone: true }),
	jobsCompleted:      integer('jobs_completed').notNull().default(0),
});

export const digestShares = pgTable('digest_shares', {
	id:           serial('id').primaryKey(),
	token:        text('token').notNull(),
	restaurantId: uuid('restaurant_id').notNull().references(() => restaurants.id, { onDelete: 'cascade' }),
	week:         text('week').notNull(),
	createdAt:    timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
	revokedAt:    timestamp('revoked_at', { withTimezone: true }),
}, (t) => [
	uniqueIndex('digest_shares_token_unique').on(t.token),
	index('digest_shares_restaurant_week_idx').on(t.restaurantId, t.week),
	uniqueIndex('digest_shares_restaurant_week_active_unique')
		.on(t.restaurantId, t.week)
		.where(sql`${t.revokedAt} is null`),
	check('digest_shares_week_format', sql`${t.week} ~ '^[0-9]{4}-W(0[1-9]|[1-4][0-9]|5[0-3])$'`),
]);

export const recipes = pgTable('recipes', {
	id:                serial('id').primaryKey(),
	restaurantId:      uuid('restaurant_id').notNull().references(() => restaurants.id, { onDelete: 'cascade' }),
	name:              text('name').notNull(),
	nameKey:           text('name_key').notNull(),
	kind:              text('kind').notNull().default('plato'),
	status:            text('status').notNull().default('draft'),
	section:           text('section'),
	portions:          numeric('portions', { precision: 10, scale: 3 }).notNull().default('1'),
	yieldQty:          numeric('yield_qty', { precision: 14, scale: 4 }),
	yieldUnit:         text('yield_unit'),
	sellingPrice:      numeric('selling_price', { precision: 12, scale: 2 }),
	vatPct:            numeric('vat_pct', { precision: 5, scale: 2 }),
	targetFoodCostPct: numeric('target_food_cost_pct', { precision: 5, scale: 2 }),
	preparation:       text('preparation'),
	notes:             text('notes'),
	createdAt:         timestamp('created_at', { withTimezone: true }).defaultNow(),
	updatedAt:         timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, (t) => [
	uniqueIndex('uq_recipes_rid_name_key').on(t.restaurantId, t.nameKey),
	uniqueIndex('uq_recipes_id_rid').on(t.id, t.restaurantId),
	index('idx_recipes_rid_status').on(t.restaurantId, t.status),
	check('recipes_kind_valid',      sql`${t.kind} IN ('plato','elaboracion')`),
	check('recipes_status_valid',    sql`${t.status} IN ('draft','active','archived')`),
	check('recipes_portions_pos',    sql`${t.portions} > 0`),
	check('recipes_yield_pos',       sql`${t.yieldQty} IS NULL OR ${t.yieldQty} > 0`),
	check('recipes_vat_range',       sql`${t.vatPct} IS NULL OR (${t.vatPct} >= 0 AND ${t.vatPct} <= 100)`),
	check('recipes_target_fc_range', sql`${t.targetFoodCostPct} IS NULL OR (${t.targetFoodCostPct} > 0 AND ${t.targetFoodCostPct} <= 100)`),
]);

export const categories = pgTable('categories', {
	id:            serial('id').primaryKey(),
	restaurantId:  uuid('restaurant_id').notNull().references(() => restaurants.id, { onDelete: 'cascade' }),
	name:          text('name').notNull(),
	nameKey:       text('name_key').notNull(),
	slug:          text('slug').notNull(),
	sortOrder:     integer('sort_order').notNull().default(0),
	hidden:        boolean('hidden').notNull().default(false),
	isDefault:     boolean('is_default').notNull().default(false),
	createdAt:     timestamp('created_at', { withTimezone: true }).defaultNow(),
}, (t) => [
	uniqueIndex('uq_categories_rid_name_key').on(t.restaurantId, t.nameKey),
	index('idx_categories_rid_hidden').on(t.restaurantId, t.hidden),
]);

export const recipeItems = pgTable('recipe_items', {
	id:            serial('id').primaryKey(),
	restaurantId:  uuid('restaurant_id').notNull().references(() => restaurants.id, { onDelete: 'cascade' }),
	recipeId:      integer('recipe_id').notNull(),
	kind:          text('kind').notNull().default('free'),
	name:          text('name').notNull(),
	productId:     integer('product_id').references(() => products.id, { onDelete: 'set null' }),
	childRecipeId: integer('child_recipe_id'),
	netQuantity:   numeric('net_quantity', { precision: 14, scale: 4 }).notNull(),
	unit:          text('unit'),
	unitCost:      numeric('unit_cost', { precision: 12, scale: 4 }),
	wastePct:      numeric('waste_pct', { precision: 5, scale: 2 }).notNull().default('0'),
	allergens:     jsonb('allergens').$type<string[]>().notNull().default(sql`'[]'::jsonb`),
	kcal100:       numeric('kcal_100', { precision: 8, scale: 2 }),
	protein100:    numeric('protein_100', { precision: 8, scale: 2 }),
	carbs100:      numeric('carbs_100', { precision: 8, scale: 2 }),
	fat100:        numeric('fat_100', { precision: 8, scale: 2 }),
	note:          text('note'),
	sortOrder:     integer('sort_order').notNull().default(0),
}, (t) => [
	foreignKey({
		name: 'recipe_items_recipe_fk',
		columns: [t.recipeId, t.restaurantId],
		foreignColumns: [recipes.id, recipes.restaurantId],
	}).onDelete('cascade'),
	foreignKey({
		name: 'recipe_items_child_fk',
		columns: [t.childRecipeId, t.restaurantId],
		foreignColumns: [recipes.id, recipes.restaurantId],
	}).onDelete('restrict'),
	index('idx_recipe_items_rid_recipe').on(t.restaurantId, t.recipeId, t.sortOrder),
	index('idx_recipe_items_rid_child').on(t.restaurantId, t.childRecipeId).where(sql`${t.childRecipeId} IS NOT NULL`),
	index('idx_recipe_items_rid_product').on(t.restaurantId, t.productId).where(sql`${t.productId} IS NOT NULL`),
	check('recipe_items_kind_valid', sql`${t.kind} IN ('free','product','recipe')`),
	check('recipe_items_kind_refs', sql`(${t.kind} = 'free' AND ${t.productId} IS NULL AND ${t.childRecipeId} IS NULL) OR (${t.kind} = 'product' AND ${t.childRecipeId} IS NULL) OR (${t.kind} = 'recipe' AND ${t.productId} IS NULL AND ${t.childRecipeId} IS NOT NULL)`),
	check('recipe_items_no_self_ref', sql`${t.childRecipeId} IS NULL OR ${t.childRecipeId} <> ${t.recipeId}`),
	check('recipe_items_qty_pos',     sql`${t.netQuantity} > 0`),
	check('recipe_items_waste_range', sql`${t.wastePct} >= 0 AND ${t.wastePct} < 100`),
	check('recipe_items_unit_cost_pos', sql`${t.unitCost} IS NULL OR ${t.unitCost} > 0`),
]);
