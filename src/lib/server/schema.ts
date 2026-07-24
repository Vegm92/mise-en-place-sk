/** Drizzle schema — PostgreSQL (Supabase). Single source of truth. */
import {
	boolean, index, integer, jsonb, numeric, pgTable, primaryKey, real, serial, text, timestamp, uniqueIndex, uuid
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
}, (t) => [
	// Composite PK — a double-submit of onboarding (or the same form in two
	// tabs) can no longer write duplicate membership rows, which also kept the
	// "sole member" count in account deletion honest (issue #241).
	primaryKey({ columns: [t.userId, t.restaurantId] }),
]);

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
}, (t) => [
	// One supplier name per tenant, case-insensitive. The three get-or-create
	// call sites now upsert via ON CONFLICT (restaurant_id, lower(name)), so
	// concurrent saves of a new supplier converge on one row instead of racing
	// to insert clones that would split invoice-number dedup (issue #238).
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
	// ── status: 'pending' | 'accepted' | 'rejected' | 'paid' ──────────────
	// 'pending' = received, awaiting acceptance (legacy behaviour preserved).
	// 'accepted' | 'rejected': RD 238/2026 acceptance statuses.
	// 'paid': full effective payment reported.
	status:          text('status').default('pending'),
	sourceFile:      text('source_file'),
	confidence:      real('confidence'),
	contentHash:     text('content_hash'),
	createdAt:       timestamp('created_at', { withTimezone: true }).defaultNow(),
	notes:           text('notes'),
	deletedAt:       timestamp('deleted_at', { withTimezone: true }),
	// ── e-invoicing extensions (issue #110, #111, #112) ───────────────────
	/** Parsed from structured XML — 'facturae_322' | 'ubl_21'. Null for paper/photo. */
	eInvoiceFormat:  text('e_invoice_format'),
	/** Full AEAT/TicketBAI QR verification URL decoded from the invoice image. */
	qrUrl:           text('qr_url'),
	/** True when QR-decoded fields conflict with AI-extracted fields (blocking review). */
	qrMismatch:      integer('qr_mismatch').default(0), // 0=no, 1=yes
	/** ISO timestamp when the restaurant accepted this invoice (RD 238/2026). */
	acceptedAt:      timestamp('accepted_at', { withTimezone: true }),
	/** ISO timestamp when the restaurant rejected this invoice. */
	rejectedAt:      timestamp('rejected_at', { withTimezone: true }),
	/** ISO timestamp of full effective payment (paid date). */
	paidAt:          timestamp('paid_at', { withTimezone: true }),
	/** Optimistic-concurrency counter — the edit form submits it and the
	 *  UPDATE is guarded by it, so a stale tab gets a 409 instead of silently
	 *  clobbering another tab's edit (issue #242). */
	version:         integer('version').notNull().default(1),
}, (t) => [
	uniqueIndex('uq_invoices_rid_supplier_number')
		.on(t.restaurantId, t.supplierId, t.invoiceNumber)
		.where(sql`${t.invoiceNumber} IS NOT NULL`),
	index('idx_invoices_deleted_at')
		.on(t.restaurantId)
		.where(sql`${t.deletedAt} IS NULL`),
	// UNIQUE (not plain): the content hash is the dedup constraint, not just a
	// pre-check. A concurrent double-click save of a numberless invoice (NULL
	// invoice_number, so uq_invoices_rid_supplier_number does not apply) now
	// loses the race via onConflictDoNothing → empty RETURNING → duplicate
	// (issue #237). Partial on live rows so a soft-deleted invoice can be
	// re-saved.
	uniqueIndex('uq_invoices_rid_content_hash')
		.on(t.restaurantId, t.contentHash)
		.where(sql`${t.contentHash} IS NOT NULL AND ${t.deletedAt} IS NULL`),
	index('idx_invoices_rid_status').on(t.restaurantId, t.status),
	index('idx_invoices_rid_created_at').on(t.restaurantId, t.createdAt),
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
}, (t) => [
	index('idx_invoice_audit_restaurant').on(t.restaurantId),
	index('idx_invoice_audit_invoice').on(t.invoiceId),
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
	// Resolved product (issue #298). Nullable during transition: historical
	// line items stay unlinked until backfilled; consumers fall back to the
	// normalized description.
	productId:              integer('product_id').references(() => products.id, { onDelete: 'set null' }),
	// Pack structure parsed from the description/unit (issue #299). All nullable
	// — populated only when a size could be determined. normalizedUnitPrice is
	// unit_price per base unit (€/kg, €/L or €/ud), what price analytics and
	// price-shock compare across different pack sizes.
	unitsPerPack:           real('units_per_pack'),
	unitSize:               real('unit_size'),
	sizeUnit:               text('size_unit'),
	baseUnit:               text('base_unit'),
	normalizedUnitPrice:    real('normalized_unit_price'),
}, (t) => [
	index('idx_invoice_line_items_invoice_id').on(t.invoiceId),
	// restaurant_id prefix lets RLS-scoped price-history queries skip the invoice join
	index('idx_invoice_line_items_rid_description').on(t.restaurantId, t.description),
	index('idx_invoice_line_items_product_id').on(t.restaurantId, t.productId).where(sql`${t.productId} IS NOT NULL`),
]);

// ── Product catalog (issue #298) ────────────────────────────────────────────
// A per-tenant canonical product, plus the many raw invoice descriptions that
// map to it. Together they turn "the string a supplier printed" into a stable
// entity so cross-supplier price comparison and analytics have something to
// group on. name_key / raw_key store normalizeProductKey(...) of the display
// text; see src/lib/server/normalize.ts and mep_norm_key in Postgres.

export const products = pgTable('products', {
	id:            serial('id').primaryKey(),
	restaurantId:  uuid('restaurant_id').notNull().references(() => restaurants.id, { onDelete: 'cascade' }),
	canonicalName: text('canonical_name').notNull(),
	nameKey:       text('name_key').notNull(),
	category:      text('category'),
	canonicalUnit: text('canonical_unit'),
	// Pack-to-base-unit conversion (e.g. "1 saco = 10 kg"), set via the Products
	// CRUD page. Resolves the 'unit_conversion_needed' alert for this product
	// (src/lib/server/invoice-save.ts) once both are filled in.
	unitsPerPack:  real('units_per_pack'),
	baseUnit:      text('base_unit'),
	createdAt:     timestamp('created_at', { withTimezone: true }).defaultNow(),
}, (t) => [
	// One product per normalized name within a tenant — concurrent saves of the
	// same new product converge via ON CONFLICT instead of racing to insert.
	uniqueIndex('products_restaurant_name_key_unique').on(t.restaurantId, t.nameKey),
]);

export const productAliases = pgTable('product_aliases', {
	id:           serial('id').primaryKey(),
	restaurantId: uuid('restaurant_id').notNull().references(() => restaurants.id, { onDelete: 'cascade' }),
	productId:    integer('product_id').notNull().references(() => products.id, { onDelete: 'cascade' }),
	supplierId:   integer('supplier_id').references(() => suppliers.id, { onDelete: 'set null' }),
	rawKey:       text('raw_key').notNull(),
	rawText:      text('raw_text'),
	// How this alias was created: 'exact' (auto, normalized-key match/new product),
	// 'fuzzy' (auto-linked via pg_trgm — needs confirmation), 'user' (confirmed),
	// 'llm' (Phase 4). confirmed_at IS NULL ⇒ a pending suggestion.
	source:       text('source').notNull().default('exact'),
	confirmedAt:  timestamp('confirmed_at', { withTimezone: true }),
	createdAt:    timestamp('created_at', { withTimezone: true }).defaultNow(),
}, (t) => [
	// A raw invoice description resolves to exactly one product per tenant.
	uniqueIndex('product_aliases_restaurant_raw_key_unique').on(t.restaurantId, t.rawKey),
	index('product_aliases_product_idx').on(t.restaurantId, t.productId),
	// Pending suggestions the review UI lists.
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

export const categoryBudgets = pgTable('category_budgets', {
	restaurantId:  uuid('restaurant_id').notNull().references(() => restaurants.id, { onDelete: 'cascade' }),
	category:      text('category').notNull(),
	month:         text('month').notNull(),
	monthlyBudget: real('monthly_budget').notNull(),
}, (t) => [
	uniqueIndex('category_budgets_restaurant_category_month_unique').on(t.restaurantId, t.category, t.month),
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

// ── LLM cost tracking ──────────────────────────────────────────────────────────

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

// Atomic monthly extraction counter (issue #244). One row per tenant per
// month; the worker claims a slot with a single increment-with-cap UPDATE
// before spending a Gemini call, so N parallel uploads can't all read
// "remaining = 1" and burst past the plan limit. The page-level invoice
// count stays advisory UX only.
export const monthlyUsage = pgTable('monthly_usage', {
	restaurantId: uuid('restaurant_id').notNull().references(() => restaurants.id, { onDelete: 'cascade' }),
	month:        text('month').notNull(), // 'YYYY-MM'
	used:         integer('used').notNull().default(0),
}, (t) => [
	uniqueIndex('monthly_usage_restaurant_month_unique').on(t.restaurantId, t.month),
]);

// Idempotency-key claim table (issue #250). Money-adjacent form actions
// render a hidden per-submit UUID and claim it here; a replay (double-click,
// offline-queue replay, proxy retry) finds the key already present and becomes
// a transparent no-op instead of a second write. Pruned after 48h.
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

// ── Batch invoice uploads ──────────────────────────────────────────────────
// Replaces the upload_sessions JSON-blob chain. One batch per upload, one
// item per invoice. Status/error/extracted_data are separate columns so the
// web and worker processes update only the fields they own — lost updates
// from whole-blob read-modify-write are structurally impossible.

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
	// pending | queued | extracting | done | failed | confirmed | discarded
	// Web owns: creation, pending→queued, done→confirmed/discarded.
	// Worker owns: queued→extracting→done|failed and extracted_data.
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

// ── WhatsApp bot ───────────────────────────────────────────────────────────

export const whatsappContacts = pgTable('whatsapp_contacts', {
	id:           serial('id').primaryKey(),
	restaurantId: uuid('restaurant_id').notNull().references(() => restaurants.id, { onDelete: 'cascade' }),
	// E.164 without leading '+', e.g. "34612345678"
	phoneNumber:  text('phone_number').notNull(),
	displayName:  text('display_name'),
	createdAt:    timestamp('created_at', { withTimezone: true }).defaultNow(),
}, (t) => [
	uniqueIndex('whatsapp_contacts_phone_unique').on(t.phoneNumber),
	index('idx_whatsapp_contacts_restaurant').on(t.restaurantId),
]);

// Message-id dedup for WhatsApp webhooks (issue #245). Meta redelivers on
// infra hiccups; a claim here (INSERT … ON CONFLICT DO NOTHING RETURNING)
// makes a redelivered message a no-op instead of a second saved invoice.
export const whatsappProcessedMessages = pgTable('whatsapp_processed_messages', {
	messageId:  text('message_id').primaryKey(),
	receivedAt: timestamp('received_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
	index('idx_whatsapp_processed_received').on(t.receivedAt),
]);

export const whatsappBotSessions = pgTable('whatsapp_bot_sessions', {
	id:            uuid('id').primaryKey().default(sql`gen_random_uuid()`),
	restaurantId:  uuid('restaurant_id').notNull().references(() => restaurants.id, { onDelete: 'cascade' }),
	fromNumber:    text('from_number').notNull(),
	extractedData: jsonb('extracted_data'),
	fileKey:       text('file_key'),
	// awaiting_confirmation | confirmed | discarded
	status:        text('status').notNull().default('awaiting_confirmation'),
	createdAt:     timestamp('created_at', { withTimezone: true }).defaultNow(),
	expiresAt:     timestamp('expires_at', { withTimezone: true }),
}, (t) => [
	index('idx_whatsapp_sessions_from_status').on(t.fromNumber, t.status),
	index('idx_whatsapp_sessions_expires').on(t.expiresAt),
]);

// ── GDPR consent audit trail (issue #201) ──────────────────────────────────
// One row per user per policy version. Written server-side only; keyed by the
// Supabase Auth user id (not restaurant-scoped — consent precedes onboarding).

export const userConsents = pgTable('user_consents', {
	id:            serial('id').primaryKey(),
	userId:        text('user_id').notNull(),
	policyVersion: text('policy_version').notNull(),
	method:        text('method').notNull(), // 'signup_form' | 'oauth_signup' | 'onboarding'
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
	planTier:             text('plan_tier').notNull().default('trial'), // 'trial' | 'starter' | 'pro' | 'business'
	status:               text('status').notNull().default('trialing'),
	trialEndsAt:          timestamp('trial_ends_at', { withTimezone: true }),
	currentPeriodEnd:     timestamp('current_period_end', { withTimezone: true }),
	cancelAtPeriodEnd:    boolean('cancel_at_period_end').notNull().default(false),
	createdAt:            timestamp('created_at', { withTimezone: true }).defaultNow(),
	updatedAt:            timestamp('updated_at', { withTimezone: true }).defaultNow(),
	// Stripe `event.created` of the last lifecycle event applied to this row.
	// The updated/deleted webhook branch skips events older than this so a
	// delayed `updated(past_due)` can't clobber a newer `updated(active)`
	// (out-of-order protection, issue #240).
	lastEventAt:          timestamp('last_event_at', { withTimezone: true }),
});

// Stripe webhook event-id dedup (issue #240). Stripe retries deliveries for up
// to 3 days; the handler claims each event id here (INSERT … ON CONFLICT DO
// NOTHING RETURNING) and returns early on an empty result so retried events
// don't re-send emails or re-fire telemetry. Written server-side only.
export const stripeWebhookEvents = pgTable('stripe_webhook_events', {
	eventId:     text('event_id').primaryKey(),
	processedAt: timestamp('processed_at', { withTimezone: true }).notNull().defaultNow(),
});
