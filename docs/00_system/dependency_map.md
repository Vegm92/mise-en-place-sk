# Dependency Map — Subsystem Graph and Blast Radius

What feeds what, and who breaks when you touch a subsystem. Use this before
modifying anything that sits upstream of other consumers. Arrows mean "depends
on / is consumed by". File paths are the primary implementation.

## Core pipeline: upload → extract → confirm → save → insights

```
Web upload (routes/(app)/+page.server.ts)           WhatsApp upload (whatsapp-bot.ts)
        │                                                     │
        └──────────────▶ storage.ts (local|railway) ◀──────────┘
                              │
                              ▼
                  batch-core.ts  (upload_batches + batch_items)
                              │
                              ▼
                 queue.ts → pg-boss "extract-invoice"   ◀── enqueueBatchExtraction (extract-batch.ts)
                              │
                              ▼
     extraction-worker.ts  (worker process, batchSize = MAX_CONCURRENT_EXTRACTIONS, default 3)
                              │
              ┌───────────────┴───────────────┐
              ▼                               ▼
   extract.ts (classify → Gemini)     einvoice-parser.ts (XML, no AI)
   llm-provider.ts / llm-quota.ts     qr.ts (VERI*FACTU)
              │
              ▼
       batch_items: done →  review page  (routes/(app)/batch/[id])
                              │
                              ▼
                   invoice-save.ts  (ADR-008 — THE write path)
                              │
   ┌──────────────┬───────────┼──────────────┬──────────────┬───────────────┐
   ▼              ▼           ▼              ▼              ▼               ▼
dedup.ts      products.ts  suppliers.ts   normalize.ts   alerts.ts      settings
(contentHash) (3 tiers)    (upsert/cat)   (units/packs)  (6 rules)     (onboarding)
   │              │           │              │              │
   ▼              ▼           ▼              ▼              ▼
invoices      product_aliases supplier_metrics unit_conversions system_notifications
inventory...  (alias tables)              (canonical units)       │
                                              │                   ▼
                                              ▼             notifications → bell/badge/reminders
                                     mv_price_snapshots ◀── (nightly MV refresh job)
```

## Subsystem consumers

### Invoice write path (`invoice-save.ts`)
Affected by: extraction output shape, unit normalization, product/supplier
resolution, alert engine, VERI*FACTU QR, onboarding settings, idempotency.
Feeds: `invoices`, `invoice_line_items`, `suppliers`, `products`,
`product_aliases`, `system_notifications`, `extraction_corrections`,
`settings`, `idempotency_keys`. **Do not add a second invoice-creation path (ADR-008).**

### Alert engine (`alerts.ts`)
Fired *after* the invoice transaction commits. Reads: `invoices`,
`invoice_line_items`, `suppliers`, `stock_levels`, `category_budgets`,
`settings` (thresholds). Writes: `system_notifications`. Consumers of the
notifications: `/reminders`, header `NotificationBell`, `MobileAlerts`,
nav badge (`+layout.server.ts`). Change blast radius: alert rules, thresholds,
notification display + i18n keys.

### Products (`products.ts`)
Three-tier identity (alias → fuzzy → create). Depends on: `normalize.ts`
(keys/units/packs), `pg_trgm` extension, LLM job (`normalize-product` queue →
`processNormalizeJob`). Feeds: `product_aliases`, `product_suggestion`
notifications, `invoice_line_items.product_id`, `mv_item_monthly_spend`.
Consumers: invoice save, product pages, analytics prices.

### Suppliers (`supplier.ts`)
Upsert by lowercased name; category from extraction with `MIN_CATEGORY_CONFIDENCE`
gate. Feeds: `invoices`, `supplier_metrics` (reliability), `mv_supplier_monthly_spend`,
`unit_conversions` (supplier-scoped). Consumers: price-shock history, budgets,
analytics, reminders.

### Billing (`billing.ts`)
Stripe client ↔ webhook → `subscriptions` + `settings` mirror →
`getTierFeatures()`/`getAccessState()`. Gated consumers: `/api/chat`,
`/digest`, `/api/stock-levels`, `/analytics/prices`, `/settings` (locations),
main upload action, extraction worker. MRR: `revenue-metrics.ts` → `mrr_snapshots`
→ `/admin/revenue`. **Stripe webhook dedup via `idempotency_keys` (`stripe-webhook` scope); do not bypass.**

### Chat + Digest (`chat-context.ts`)
One shared snapshot (ADR-018). Chat: `(app)/api/chat` → `chat_sessions`,
`chat_messages`, Gemini direct (no usage recording). Digest:
`weekly-digest.ts` + cron `0 6 * * 1` → `settings.weekly_digest_*`. Both read
the same invoice/supplier/budget/stock data as analytics.

### WhatsApp (`whatsapp-bot.ts`, `whatsapp-pairing.ts`, `whatsapp.ts`)
Webhook → HMAC verify → `idempotency_keys` (`whatsapp` scope) dedup → phone lookup
(`whatsapp_contacts`, ADR-019) → batch pipeline (ADR-004). Pairing codes →
`whatsapp_pairing_codes`. Feeds the same extraction pipeline as web uploads.

### Analytics (`trend.ts`, materialized views)
`mv_supplier_monthly_spend`, `mv_item_monthly_spend`,
`mv_category_monthly_spend`, `mv_price_snapshots`, `mv_extraction_stats`
refreshed nightly (`10 3 * * *`). Consumers: `/analytics/*`, dashboard,
`/api/trend`, supplier/product detail pages. Touching `products`/`suppliers`/
`invoices` shapes affects these views — keep the refresh function in sync.

## Cross-cutting concerns every change inherits

| Concern | Guard | Who enforces |
|---|---|---|
| Tenant isolation | `forTenant().scope()` on every query | `lint:tenant-scope`, `lint:unscoped-query`, `tests/tenant-isolation*.test.ts` |
| No raw SQL string building | `sql.raw()` banned | `lint:no-sql-raw` |
| Idempotency | contentHash, `idempotency_keys` (one ledger, scoped per caller) | code + tests |
| Localization | all user-facing strings via `src/lib/i18n.ts` | `lint:i18n` |
| Rendered locale is request state | public pages read `src/lib/i18n-context.ts`; `locale.set()` never runs on the server (ADR-033) | `tests/ssr-locale.test.ts` |
| No inline comments | comments → per-subsystem `## Code notes` sections | `lint:no-comments` |
| Migration sync | `schema.ts` ↔ `drizzle/` | `pnpm db:check-sync` (CI) |
| Type safety | strict TS + `svelte-check` | `pnpm check` (CI) |

## Rules of thumb

- **Upstream change** (schema, normalize, extraction output, storage) → audit
  every consumer listed here; run `tests/` + `pnpm db:check-sync`.
- **Downstream change** (UI, notifications copy) → check the feature spec
  (`docs/03_features/`) for the contract you are rendering.
- **Adding a service/queue** → must be considered by the worker process; see
  `docs/05_operations/background_jobs.md` and ADR-011.
- **New decision** that reshapes this graph → write an ADR (`docs/06_decisions/`, next 023).
