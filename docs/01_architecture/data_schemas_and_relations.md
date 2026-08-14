# Data Schemas and Relations

Source of truth: `src/lib/server/schema/{core,extensions,auth}.ts` (re-exported
by `schema.ts`) + committed migrations in `drizzle/` (ADR-003). ~42 tables + 5
materialized views, latest migration `0030`. Statuses are `text` with app-level
defaults — **there are no Postgres enums**. All business tables carry
`restaurant_id uuid NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE`.

For per-feature rules see `docs/03_features/`; for change procedure see
`docs/04_engineering/database_changes.md`.

## Tenancy and identity

| Table | Purpose | Notable columns | Notes |
|---|---|---|---|
| `restaurants` | Tenant root | `name`, `slug` (unique), `parentId` self-FK | Multi-location via `parentId` (migration 0023) |
| `users` | Person account | `email` unique, `password_hash`, `emailVerified` | Credentials + OAuth |
| `user_restaurants` | User↔restaurant membership | composite PK `(userId, restaurantId)`, `role` default `'owner'` | Basis of authorization; PK migration 0015 |
| `accounts` / `sessions` / `verification_tokens` | Auth.js adapter tables | `providerAccountId`, `sessionToken`, `expires` | JWT sessions → `sessions` mostly unused |
| `user_consents` | Consent records | `(userId, policyVersion)` unique, `method`, `acceptedAt` | GDPR |

## Ingestion

| Table | Purpose | Notable columns | Notes |
|---|---|---|---|
| `upload_batches` | One upload group | — | Created per upload action |
| `batch_items` | One file in a batch | `status` `pending\|extracting\|done\|failed\|confirmed`, `fileKey`, `extracted_data` jsonb, `conversion_notes`, `extractError`, `position` | Guarded state machine in `batch-core.ts` |
| `idempotency_keys` | Idempotency ledger, all callers | PK = (`scope`, `key`), `restaurantId` | Claim-once in `idempotency.ts`; scopes `form-submit` / `whatsapp` / `stripe-webhook` (#389) |

## Invoicing

| Table | Purpose | Notable columns | Notes |
|---|---|---|---|
| `invoices` | Canonical persisted invoice | `supplierId`, `invoiceNumber`, `invoiceDate`/`dueDate` (text), `totalAmount` real, `taxBase`, `taxBreakdown` text, `status` `pending\|confirmed\|exported\|overdue\|paid`, `sourceFile`, `confidence`, `contentHash`, `deletedAt` (soft delete), `eInvoiceFormat`, `qrUrl`/`qrMismatch`, `acceptedAt`/`rejectedAt`/`paidAt`, `version` int (optimistic lock) | Partial unique `(rid, supplier_id, invoice_number)` WHERE number NOT NULL; partial unique `(rid, content_hash)` WHERE active |
| `invoice_line_items` | Invoice lines | `invoiceId`, `description`, `quantity`, `unit`, `unitPrice`, `totalPrice`, `taxRate`, `productId` (SET NULL), `requiresUnitConversion`, `canonicalUnit`, `unitsPerPack`, `unitSize`, `sizeUnit`, `baseUnit`, `normalizedUnitPrice` | Indexes on invoiceId, `(rid, description)`, partial `(rid, product_id)` |
| `invoice_audit_log` | Immutable history | `invoiceId`, `action`, `userId`, `reason`, `snapshot` jsonb | No FK — rows survive invoice deletion |
| `extraction_corrections` | User edits vs extraction | `invoiceId`, `fieldName`, `originalValue`, `correctedValue`, `lineItemIndex` | Feeds `/analytics/extraction` |

## Suppliers and products

| Table | Purpose | Notable columns | Notes |
|---|---|---|---|
| `suppliers` | Vendor | `name`, `alias`, `category`, `contactEmail`/`contactPhone`, `cif`, `address`, `deliveryDays`, `paymentTerms`, `notes` | Unique `(rid, lower(name))`; category ∈ 14 canonical |
| `supplier_metrics` | Reliability scores | 1:1 `supplierId`, `score`, `priceStability`, `frequency`, `timeliness`, `priceStabilityCv` | Computed + cached |
| `products` | Normalized product identity | `canonicalName`, `nameKey`, `category`, `canonicalUnit`, `unitsPerPack`, `baseUnit` | Unique `(rid, name_key)` + GIN trgm index |
| `product_aliases` | Raw invoice string → product | `productId`, `supplierId` (SET NULL), `rawKey`, `rawText`, `source` `exact\|fuzzy\|llm`, `confirmedAt` | Unique `(rid, raw_key)`; partial index WHERE confirmedAt NULL |
| `unit_conversions` | Purchase→canonical factor | `supplierName`, `ingredient`, `purchaseUnit`, `canonicalUnit`, `conversionFactor` | Unique `(rid, supplier_name, ingredient, purchase_unit)` |

## Insights

| Table | Purpose | Notable columns | Notes |
|---|---|---|---|
| `system_notifications` | Alert rows | `invoiceId`, `notificationType`, `message`, `payload` jsonb (`messageKey`/`messageVars`), `status` `pending\|sent` | Index `(rid, status, created_at)` |
| `stock_levels` | Current stock + burn | `ingredient`, `currentStock`, `canonicalUnit`, `dailyBurnRate` | Unique `(rid, ingredient)` |
| `category_budgets` | Monthly category budget | `category`, `month` (`YYYY-MM`), `monthlyBudget` | Unique `(rid, category, month)` |
| `settings` | Tenant key/value store | `(rid, key)` unique | Onboarding, digest week, thresholds, quota overrides, `plan_name`/`plan_quota` mirror |

## Analytics (materialized views — raw SQL in migrations, not schema.ts)

| View | Purpose |
|---|---|
| `mv_supplier_monthly_spend` | Spend per supplier per month |
| `mv_item_monthly_spend` | Spend per line item per month |
| `mv_category_monthly_spend` | Spend per category per month |
| `mv_price_snapshots` | Latest unit + normalized €/base-unit price per supplier-item with previous price (LEAD) |
| `mv_extraction_stats` | Extraction quality aggregates |

Refreshed by `refresh_analytics_rollups()` nightly (`10 3 * * *`); never read
directly at write time. Source of the trend/analytics pages.

## Billing

| Table | Purpose | Notable columns | Notes |
|---|---|---|---|
| `subscriptions` | Entitlement state | `restaurantId` unique, `stripeCustomerId`/`stripeSubscriptionId`/`stripePriceId` unique, `planTier` `trial\|starter\|pro\|business`, `status` `trialing\|active\|…`, `trialEndsAt`, `currentPeriodEnd`, `cancelAtPeriodEnd`, `lastEventAt` | Stripe owns money, Postgres owns entitlement (ADR-013) |
| — Stripe webhook dedup | `idempotency_keys`, `stripe-webhook` scope | key = Stripe `event.id` | Claim-before-process |
| `mrr_snapshots` | Monthly revenue snapshot | `(month, restaurantId)` unique, `planTier`, `status`, `mrrCents`, `atRiskCents`, `source` `live\|estimated` | Fed by cron + admin backfill |

## Chat

| Table | Purpose | Notable columns |
|---|---|---|
| `chat_sessions` | Chat conversations | `restaurantId`, `title`, `updatedAt` |
| `chat_messages` | Messages | `sessionId` (cascade), `role`, `text`, `actions` text (JSON), `createdAt` |

## WhatsApp

| Table | Purpose | Notable columns | Notes |
|---|---|---|---|
| `whatsapp_contacts` | Phone → tenant binding | `phoneNumber` unique, `restaurantId`, `displayName` | Phone is the tenant key (ADR-019) |
| `whatsapp_pairing_codes` | One-time pairing | `code` unique, `restaurantId`, `expiresAt`, `redeemedAt`, `redeemedBy` | 6-char, 15-min TTL |
| `whatsapp_account_events` | Meta account health | `field`, `event`, `severity` jsonb | Webhook events, not messages |
| — WhatsApp message dedup | `idempotency_keys`, `whatsapp` scope | key = Meta message id | `whatsapp_bot_sessions` dropped (0026) |

## Cost / misc

| Table | Purpose | Notable columns |
|---|---|---|
| `llm_usage_log` | LLM cost ledger | `restaurantId`, `model`, `inputTokens`/`outputTokens`, `estimatedCostUsd` numeric(12,8), `callerContext` |
| `tenant_llm_quotas` | Per-tenant LLM caps | PK `restaurantId`, `monthlyExtractions`, `monthlyCostLimitUsd` |
| `monthly_usage` | Extraction quota consumption | `(rid, month)` unique, `used` |
| `dead_letter_queue` | Exhausted job audit | `queue`, `sourceId`, `jobId`, `errorClass`, `errorMessage`, `stack`, `payload` jsonb, `attempt`, `occurrences`, `status` `pending\|reviewed\|replayed\|discarded` | Dedupe index `(queue, source_id, error_class, status)` |
| `waitlist` | Landing email capture | `email` unique |

## Functions and extensions

- `pg_trgm` — fuzzy product matching.
- `mep_norm_key(text)` — lower/trim canonical key used by product identity and
  price history (migration 0018).

## Cross-cutting rules

- `restaurant_id` on every business table; `user_restaurants` and `subscriptions`
  are the deliberate exceptions.
- No enums; no triggers; no RLS (migration 0001 was dropped on Railway, ADR-005).
- Unique constraints do double duty as the last line of idempotency defense.
- Migration workflow and verification: `docs/04_engineering/database_changes.md`.
