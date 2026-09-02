---
tags: [mep, architecture]
related: "[[CONTEXT]]"
---

# Data Schemas and Relations

Source of truth: `src/lib/server/schema.ts` + committed migrations in
`drizzle/` (ADR-003). 45 tables + 5 materialized views, latest migration
`0061`. Statuses are `text` with app-level
defaults — **there are no Postgres enums**. All business tables carry
`restaurant_id uuid NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE`.

For per-feature rules see `docs/03_features/`; for change procedure see
`docs/04_engineering/database_changes.md`.

## Tenancy and identity

| Table | Purpose | Notable columns | Notes |
|---|---|---|---|
| `restaurants` | Tenant root | `name`, `slug` (unique), `parentId` self-FK | Multi-location via `parentId` (migration 0023) |
| `users` | Person account | `email` unique, `password_hash`, `emailVerified` | Credentials + OAuth |
| `user_restaurants` | User↔restaurant membership | composite PK `(userId, restaurantId)`, `userId` uuid, `role` default `'owner'` | Basis of authorization; PK migration 0015. `userId` was `text` (Supabase `auth.uid()` era) until migration 0038 converted it to `uuid` — joins to `users.id` needed an explicit cast before that, and one that was missing broke `/admin/access` |
| `accounts` / `sessions` / `verification_tokens` | Auth.js adapter tables | `providerAccountId`, `sessionToken`, `expires` | JWT sessions → `sessions` mostly unused |
| `user_consents` | Consent records | `(userId, policyVersion)` unique, `method`, `acceptedAt` | GDPR |

## Ingestion

| Table | Purpose | Notable columns | Notes |
|---|---|---|---|
| `upload_batches` | One upload group | — | Created per upload action |
| `batch_items` | One file in a batch | `status` `pending\|queued\|extracting\|done\|failed\|confirmed\|discarded`, `fileKey`, `extracted_data` jsonb, `conversion_notes`, `extractError`, `position`, `queued_at` | Guarded state machine in `batch.ts`; `queued_at` is the stall clock (#540) |
| `idempotency_keys` | Idempotency ledger, all callers | PK = (`scope`, `key`), `restaurantId` | Claim-once in `idempotency.ts`; scopes `form-submit` / `whatsapp` / `stripe-webhook` (#389) |

## Invoicing

| Table | Purpose | Notable columns | Notes |
|---|---|---|---|
| `invoices` | Canonical persisted invoice | `supplierId`, `invoiceNumber`, `invoiceDate`/`dueDate` `date` (#516 — were text, compared lexicographically), `totalAmount` numeric(12,2), `taxBase`, `taxBreakdown` text, `status` `pending\|accepted\|rejected\|paid` (`overdue` is derived at read time from `status='pending'` + `due_date`, never stored — `src/lib/status.ts`), `sourceFile`, `confidence`, `contentHash`, `deletedAt` (soft delete), `eInvoiceFormat`, `qrUrl`/`qrMismatch`, `acceptedAt`/`rejectedAt`/`paidAt`, `version` int (optimistic lock) | Partial unique `(rid, supplier_id, invoice_number)` WHERE number NOT NULL; partial unique `(rid, content_hash)` WHERE active |
| `invoice_line_items` | Invoice lines | `invoiceId`, `description`, `quantity`, `unit`, `unitPrice`, `totalPrice`, `taxRate`, `productId` (SET NULL), `requiresUnitConversion`, `canonicalUnit`, `unitsPerPack`, `unitSize`, `sizeUnit`, `baseUnit`, `normalizedUnitPrice` | Indexes on invoiceId, `(rid, description)`, partial `(rid, product_id)` |
| `invoice_audit_log` | Immutable history | `invoiceId`, `action`, `userId`, `reason`, `snapshot` jsonb | No FK — rows survive invoice deletion |
| `extraction_corrections` | User edits vs extraction | `invoiceId`, `fieldName`, `originalValue`, `correctedValue`, `lineItemIndex`, `fieldConfidence` | Feeds `/analytics/extraction` (+ its CSV export); `fieldConfidence` is the model's own confidence in that field at extraction time, so a correction on a confident field reads as a silent failure. `fieldName='line_item.product'` records a manual product reassignment, not a value edit |
| `extraction_results` | Durable corpus: one row per extraction run | `batchItemId` (SET NULL), `fileKey`, `promptVersion`, `model`, `runKind` `live\|replay`, `extracted_data` jsonb, `field_confidences` jsonb, `confidence`, `conversion_notes`, `total_mismatch` | Survives the 24 h batch sweep (#813, ADR-034); pruned at 730 days; join to the invoice via `invoices.source_file = file_key` |

## Suppliers and products

| Table | Purpose | Notable columns | Notes |
|---|---|---|---|
| `suppliers` | Vendor | `name`, `alias`, `category`, `contactEmail`/`contactPhone`, `cif`, `normalizedCif`, `address`, `deliveryDays`, `paymentTerms`, `notes` | Unique `(rid, lower(name))`; partial index `(rid, normalized_cif)` WHERE NOT NULL; category ∈ 14 canonical |
| `supplier_aliases` | Extra trade name a supplier's tax id carries | `supplierId` (CASCADE), `name`, `normalizedName` | Unique `(rid, normalized_name)`; index `(rid, supplier_id)` |
| `supplier_metrics` | Reliability scores | 1:1 `supplierId`, `score`, `priceStability`, `frequency`, `timeliness`, `priceStabilityCv` | Computed + cached |
| `products` | Normalized product identity | `canonicalName`, `nameKey`, `category`, `canonicalUnit`, `unitsPerPack`, `baseUnit`, `allergens` jsonb, `allergensSource` `manual\|extracted`, `kcal100`/`protein100`/`carbs100`/`fat100`, `nutritionSource` `manual\|extracted` | Unique `(rid, name_key)` + GIN trgm index; allergens/nutrition declared once per product and inherited by escandallo lines (migration 0056) |
| `product_aliases` | Raw invoice string → product | `productId`, `supplierId` (SET NULL), `rawKey`, `rawText`, `source` `exact\|fuzzy\|llm`, `confirmedAt` | Unique `(rid, raw_key)`; partial index WHERE confirmedAt NULL |
| `unit_conversions` | Purchase→canonical factor | `supplierName`, `ingredient`, `purchaseUnit`, `canonicalUnit`, `conversionFactor` | Unique `(rid, supplier_name, ingredient, purchase_unit)` |

## Recipes / costing (escandallos)

| Table | Purpose | Notable columns | Notes |
|---|---|---|---|
| `recipes` | A costed sheet (dish or prep) | `name`, `nameKey`, `kind` `plato\|elaboracion`, `status` `draft\|active\|archived`, `section`, `portions`, `yieldQty`/`yieldUnit`, `sellingPrice`, `vatPct`, `targetFoodCostPct`, `preparation`, `notes` | Unique `(rid, name_key)`; unique `(id, rid)` (`uq_recipes_id_rid`) backs the composite FKs below (ADR-031) |
| `recipe_items` | One ingredient line | `recipeId`, `kind` `free\|product\|recipe`, `productId` (SET NULL), `childRecipeId`, `netQuantity`, `unit`, `unitCost`, `wastePct`, `allergens` jsonb, `kcal100`/`protein100`/`carbs100`/`fat100`, `note`, `sortOrder` | Composite FKs `(recipeId, rid)`/`(childRecipeId, rid)` → `recipes(id, rid)` (cascade / restrict) so a cross-tenant link is structurally impossible; `recipe_items_child_fk` is `ON DELETE RESTRICT` (a prep in use cannot be deleted) |

RLS (ADR-030): both tables carry the same `tenant_isolation` ENABLE-RLS policy as
every other tenant table (migration 0057), keyed on `app.restaurant_id`/`app.admin`.

## Insights

| Table | Purpose | Notable columns | Notes |
|---|---|---|---|
| `system_notifications` | Alert rows | `invoiceId`, `notificationType`, `message`, `payload` jsonb (`messageKey`/`messageVars`), `status` `pending\|sent` | Index `(rid, status, created_at)` |
| `stock_levels` | Current stock + burn | `ingredient`, `currentStock`, `canonicalUnit`, `dailyBurnRate` | Unique `(rid, ingredient)` |
| `category_budgets` | Monthly category budget | `category`, `month` (`YYYY-MM`), `monthlyBudget` | Unique `(rid, category, month)`; CHECK `month ~ '^[0-9]{4}-(0[1-9]\|1[0-2])$'` (#516) |
| `settings` | Tenant key/value store | `(rid, key)` unique | Onboarding, digest week, thresholds, quota overrides, `plan_name`/`plan_quota` mirror |

## Analytics (materialized views — raw SQL in migrations, not schema.ts)

| View | Purpose |
|---|---|
| `mv_supplier_monthly_spend` | Spend per supplier per month |
| `mv_item_monthly_spend` | Spend per line item per month |
| `mv_category_monthly_spend` | Spend per category per month — category from the line's product, `COALESCE(products.category, suppliers.category, 'Other')` (ADR-027) |
| `mv_price_snapshots` | Latest unit + normalized €/base-unit price per supplier-item with previous price (LEAD) |
| `mv_extraction_stats` | Extraction quality aggregates |

Refreshed by `refresh_analytics_rollups()` nightly (`10 3 * * *`); never read
directly at write time. Source of the trend/analytics pages.

## Billing

| Table | Purpose | Notable columns | Notes |
|---|---|---|---|
| `subscriptions` | Entitlement state | `restaurantId` unique, `stripeCustomerId`/`stripeSubscriptionId`/`stripePriceId` unique, `planTier` `trial\|starter\|pro\|business`, `status` `trialing\|active\|…`, `trialEndsAt`, `currentPeriodEnd`, `cancelAtPeriodEnd`, `lastEventAt` | Stripe owns money, Postgres owns entitlement (ADR-013) |
| — Stripe webhook dedup | `idempotency_keys`, `stripe-webhook` scope | key = Stripe `event.id` | Claim-before-process |
| `mrr_snapshots` | Monthly revenue snapshot | `(month, restaurantId)` unique, `planTier`, `status`, `mrrCents`, `atRiskCents`, `source` `live\|estimated` | Fed by cron + admin backfill; CHECK on `month` format (#516) |
| `acquisition_costs` | Admin-entered CAC input | `month`, `category`, `amountCents`, `note`, `createdBy` | Feeds `/admin/revenue` CAC calc; not tenant-scoped (platform-level) |
| `revenue_assumptions` | Admin-entered revenue model knobs | `(key, value)` | Backs `revenue-math.ts`; not tenant-scoped |

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
| `monthly_usage` | Extraction quota consumption | `(rid, month)` unique, `used`; CHECK on `month` format (#516) |
| `dead_letter_queue` | Exhausted job audit | `queue`, `sourceId`, `jobId`, `errorClass`, `errorMessage`, `stack`, `payload` jsonb, `attempt`, `occurrences`, `status` `pending\|reviewed\|replayed\|discarded` | Dedupe index `(queue, source_id, error_class, status)` |
| `worker_heartbeats` | Worker liveness (#540) | PK `id` (one row, `worker`), `startedAt`, `lastSeenAt`, `lastJobCompletedAt`, `jobsCompleted` | Written by `src/worker.ts` every 30 s and after each job batch; read by `/admin/health` and `/api/health`. Not tenant-scoped — it is a process-level signal |
| `waitlist` | Landing email capture | `email` unique |
| `app_flags` | Global key/value flag store | PK `key`, `value` text | Backs `access_open` and the four `beta_feature_*` keys (`docs/03_features/feature_flags.md`); not tenant-scoped by design |
| `digest_shares` | Public share link for a weekly digest | `token` unique, `restaurantId`, `week`, `revokedAt` | Unique active `(restaurantId, week)` while `revokedAt IS NULL`; RLS-enabled (migration 0055) |

## Functions and extensions

- `pg_trgm` — fuzzy product matching.
- `mep_norm_key(text)` — lower/trim canonical key used by product identity and
  price history (migration 0018).

## Cross-cutting rules

- `restaurant_id` on every business table; `user_restaurants` and `subscriptions`
  are the deliberate exceptions.
- No enums; no triggers. Migration 0001's RLS was dropped on Railway (ADR-005);
  a new RLS backstop (ADR-030, migrations 0055/0057) is ENABLE-only, scoped to
  the `mep_runtime` role, and additive to — never a replacement for —
  app-layer `forTenant().scope()`.
- Unique constraints do double duty as the last line of idempotency defense.
- Migration workflow and verification: `docs/04_engineering/database_changes.md`.

## Code notes

### `src/lib/server/db-ssl.ts`

**`interface PgSslConfig`**

- Postgres TLS configuration shared by the web pool (`db.ts`, postgres-js) and the worker's pg-boss connection (`worker.ts`, node-postgres) — issue #295. Both drivers hand this object straight to `tls.connect`, so one helper serves both and the two processes can no longer drift apart (the worker used to hard-code `rejectUnauthorized: false`).
- Modes via `DATABASE_SSL_MODE`: require (default) — encrypted, certificate not verified; verify-full — certificate chain verified. Supply Railway's CA with `DATABASE_CA_CERT` (a PEM string or a path to a .crt file), since its certificate is self-issued; without it the system trust store is used.
- Reads `process.env` directly so the worker can import it without Vite. A local/ephemeral Postgres (CI container, `docker compose`) is never configured with TLS, so requesting SSL against it just resets the connection; `drizzle.config.ts` and the test-db helper already special-case this by host, and this does the same so the app's own db/worker clients agree with migrations and tests.

**`function readCa`**

- Resolves `DATABASE_CA_CERT`, which may hold the PEM itself or a path to it.

### `src/lib/server/db.ts`

**`type DB`**

- DB singleton — server-side only. Import only from +server.ts or +page.server.ts, never from components.
- Set `DATABASE_POOL_URL` to a pooled, PgBouncer-compatible connection URL for the runtime app; `DATABASE_URL` remains the direct connection used by migrations and pg-boss. If the pool URL is not set, `DATABASE_URL` is used for both. `prepare: false` is required for PgBouncer transaction-mode compatibility.

**`function getDb`**

- Lazily creates the Drizzle client on first use. Deliberately NOT at import time: SvelteKit's build/prerender-analyse step imports server modules without runtime env, and a throw here would break the build. The connection (and the missing-config error) is deferred to the first query.

**`const db`**

- Proxy so existing `db.select(...)` call sites keep working while the underlying client is created lazily on first property access. Methods are bound to the real Drizzle instance so internal `this` references resolve against it, not the proxy.
- `getDb` is also exported directly for `src/lib/server/auth.ts`'s `DrizzleAdapter(getDb(), ...)`. `@auth/drizzle-adapter` runtime-detects the Postgres dialect via `is(db, PgDatabase)`, an instanceof-style prototype check — the proxy's target is `{}`, so `is()` fails against it. Only surfaces at production-build SSR analysis (not `pnpm check`/`pnpm test`), the first point the adapter is constructed with a real env-configured secret.

**_module level_**

- Tenant-scoped query helper — see docs/tenancy/ADR-001-app-level-tenant-scoping.md.

### `src/lib/server/schema.ts`

**`const usageEvents`**

- Append-only audit trail behind `monthly_usage.used` ([ADR-036](../06_decisions/billing/ADR-036-one-metered-unit.md)): for any tenant and month, `SUM(delta)` equals the counter. An item's balance — `SUM(delta)` over its own rows — is 0 (owes nothing) or 1 (holds a slot), and that is what makes claim and release idempotent: a redelivered job finds 1 and claims nothing, a double cancel finds 0 and refunds nothing. A balance rather than a unique `(batch_item_id, kind)` index, because a failed item that is retried has to be able to claim a second time.
- `batch_item_id` is nullable and deliberately not a foreign key: the ledger outlives the item it describes (the batch `remove` action hard-deletes rows), a composite reservation exists before its children do, and migration 0063's opening-balance row belongs to no item at all.

**`const batchItems.extractErrorVars`**

- Interpolation values for `extractError`, when the message needs to name numbers the translation key alone cannot carry — `extract.err.quotaCompositeExceeded` has to say "contiene 17 documentos y te quedan 8". Encoding counts into the key string would put data in an i18n identifier.

**`const restaurants`**

- Drizzle schema — PostgreSQL (Railway). Single source of truth.

**`property parentId`**

- Additional locations of a multi-location account (issue #290). Null for a standalone restaurant. Data stays fully separate per location; this only says which restaurant's subscription pays, so a Business customer's second site inherits the plan instead of starting a new trial.

**`const userRestaurants`**

- Role `'owner' | 'member'`. Composite PK `(userId, restaurantId)` — a double-submit of onboarding (or the same form in two tabs) can no longer write duplicate membership rows, which also kept the "sole member" count in account deletion honest (issue #241).

**`const suppliers`**

- Unique `(restaurant_id, lower(name))`. The three get-or-create call sites upsert via ON CONFLICT so concurrent saves of a new supplier converge on one row instead of racing to insert clones that would split invoice-number dedup (issue #238).

**`property status`**

- `'pending' | 'accepted' | 'rejected' | 'paid'`. 'pending' = received, awaiting acceptance (legacy behaviour preserved). 'accepted'/'rejected': RD 238/2026 acceptance statuses. 'paid': full effective payment reported.

**`property eInvoiceFormat`**

- Parsed from structured XML — `'facturae_322' | 'ubl_21'`. Null for paper/photo (issues #110/#111/#112).

**`property qrUrl`**

- Full AEAT/TicketBAI QR verification URL decoded from the invoice image.

**`property qrMismatch`**

- True when QR-decoded fields conflict with AI-extracted fields (blocking review).

**`property acceptedAt`**

- ISO timestamp when the restaurant accepted this invoice (RD 238/2026).

**`property rejectedAt`**

- ISO timestamp when the restaurant rejected this invoice.

**`property paidAt`**

- ISO timestamp of full effective payment (paid date).

**`property version`**

- Optimistic-concurrency counter — the edit form submits it and the UPDATE is guarded by it, so a stale tab gets a 409 instead of silently clobbering another tab's edit (issue #242).

**`const invoices`**

- Partial UNIQUE `(rid, content_hash)` on live rows — the content hash is the dedup constraint, not just a pre-check. A concurrent double-click save of a numberless invoice (NULL invoice_number, so the supplier-number unique does not apply) loses the race via onConflictDoNothing → empty RETURNING → duplicate (issue #237). Partial on live rows so a soft-deleted invoice can be re-saved.

**`const invoiceAuditLog`**

- Actions `'soft_delete' | 'restore' | 'hard_delete'`.

**`property productId`**

- Resolved product (issue #298). Nullable during transition: historical line items stay unlinked until backfilled; consumers fall back to the normalized description.

**`property unitsPerPack`**

- Pack structure parsed from the description/unit (issue #299). All nullable — populated only when a size could be determined. `normalizedUnitPrice` is unit_price per base unit (€/kg, €/L or €/ud), what price analytics and price-shock compare across different pack sizes.

**`const invoiceLineItems`**

- `(rid, description)` index: the restaurant_id prefix lets RLS-scoped price-history queries skip the invoice join.

**`const products`**

- Per-tenant canonical product, plus the many raw invoice descriptions that map to it (product_aliases) — issue #298. Together they turn "the string a supplier printed" into a stable entity for cross-supplier price comparison. `name_key`/`raw_key` store `normalizeProductKey(...)` of the display text; see src/lib/server/normalize.ts and `mep_norm_key` in Postgres.

**`property unitsPerPack`**

- Pack-to-base-unit conversion (e.g. "1 saco = 10 kg"), set via the Products CRUD page. Resolves the `unit_conversion_needed` alert for this product (src/lib/server/invoice-save.ts) once both are filled in.

**`const products`**

- Unique `(rid, name_key)` — concurrent saves of the same new product converge via ON CONFLICT instead of racing to insert.

**`property source`**

- How an alias was created: `'exact'` (auto, normalized-key match/new product), `'fuzzy'` (auto-linked via pg_trgm — needs confirmation), `'user'` (confirmed), `'llm'` (Phase 4). `confirmed_at IS NULL` ⇒ a pending suggestion.

**`const productAliases`**

- Unique `(rid, raw_key)` — a raw invoice description resolves to exactly one product per tenant. Partial index on pending suggestions for the review UI.

**`const llmUsageLog`**

- LLM cost tracking.

**`const monthlyUsage`**

- Atomic monthly extraction counter (issue #244). One row per tenant per month; the worker claims a slot with a single increment-with-cap UPDATE before spending a Gemini call, so N parallel uploads can't all read "remaining = 1" and burst past the plan limit. The page-level invoice count stays advisory UX only.

**`const idempotencyKeys`**

- The single claim-once ledger (issue #389), replacing `processed_requests` (#250), `whatsapp_processed_messages` (#245) and `stripe_webhook_events` (#240). Every caller claims a (scope, key) before acting; a replay finds the row present and becomes a transparent no-op. `key` is text, not uuid, because the scopes disagree on key shape — form submits use a client UUID, Meta and Stripe use their own ids. restaurantId is nullable: webhook claims happen before a tenant is known, while tenant-scoped claims still cascade away with the restaurant.

**`const uploadBatches`**

- Replaces the upload_sessions JSON-blob chain. One batch per upload, one item per invoice. Status/error/extracted_data are separate columns so the web and worker processes update only the fields they own — lost updates from whole-blob read-modify-write are structurally impossible.

**`property status`**

- `pending | queued | extracting | done | failed | confirmed | discarded`. Web owns creation, pending→queued, done→confirmed/discarded. Worker owns queued→extracting→done|failed and extracted_data.

**`const whatsappContacts`**

- WhatsApp bot bindings. `phoneNumber` is E.164 without leading '+', e.g. "34612345678".

**`const whatsappAccountEvents`**

- Account-level WhatsApp webhook events (issue #321). One WhatsApp Business number per tenant, so Meta's per-number quality rating is shared: blocks caused by one restaurant's staff degrade the rating for all, and a sufficiently degraded number can be restricted — stopping ingest for every tenant simultaneously. Nothing is tenant-scoped, because the WABA is not; this is platform state. Recording gives a history to read when someone asks "when did this start?".

**`property field`**

- Meta's webhook field, e.g. `'account_update'`, `'phone_number_quality_update'`.

**`property event`**

- The event name inside it, e.g. `'FLAGGED'`, `'ACCOUNT_RESTRICTION'`.

**`property qualityRating`**

- `GREEN | YELLOW | RED`, when the payload carries one.

**`property messagingLimit`**

- Messaging tier, e.g. `'TIER_1K'`.

**`property severity`**

- `info | warning | critical` — how loudly this should be read.

**`const whatsappPairingCodes`**

- Self-service enrolment codes (issue #320). The owner generates one in Settings and the staff member messages it to the bot from the phone they will actually use, binding that number — captured from the webhook's `from` field, so it can never be mistyped. The code is stored in plaintext on purpose (the owner must read it back off the Settings page to relay it, and reloading must not lose it); it is defended by being single-use, short-lived and rate-limited on redemption.

**`property displayName`**

- Optional label carried onto the contact row when the code is redeemed.

**`property redeemedBy`**

- The number that redeemed it — kept for audit, not used for lookup.

**`const whatsappPairingCodes`**

- Global unique on `code`, because redemption resolves the tenant *from* the code, exactly as the bot resolves it from the sender's number.

**`const userConsents`**

- GDPR consent audit trail (issue #201): one row per user per policy version. Written server-side only; keyed by the Auth.js user id (not restaurant-scoped — consent precedes onboarding).

**`const subscriptions`**

- Plan tier `'trial' | 'starter' | 'pro' | 'business'`; status default `'trialing'`.

**`property lastEventAt`**

- Stripe `event.created` of the last lifecycle event applied to this row. The updated/deleted webhook branch skips events older than this so a delayed `updated(past_due)` can't clobber a newer `updated(active)` (out-of-order protection, issue #240).
