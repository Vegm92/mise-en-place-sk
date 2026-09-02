---
tags: [mep, architecture]
related: "[[CONTEXT]]"
---

# Architecture Overview

A SvelteKit 2 application with a split web/worker deployment, app-layer
multi-tenancy, and a durable extraction pipeline. This page describes the shape;
the ADRs in `docs/06_decisions/` explain why it is shaped this way.

## Runtime and processes

```
┌─────────────────────────────┐        ┌─────────────────────────────┐
│  WEB process (node build)   │        │  WORKER process             │
│  SvelteKit adapter-node     │        │  (node build/worker.js)     │
│  hooks.server.ts (auth,     │        │  src/worker.ts              │
│  tenancy, headers, Sentry)  │        │  pg-boss consumer           │
│                             │        │  - extract-invoice (batch=1)│
│  routes/  pages + API       │        │  - normalize-product        │
│  (app)/(admin)/ + /api/*    │        │  - dead-letter drains       │
│                             │        │  - scheduled cron jobs      │
└───────────┬─────────────────┘        └───────────┬─────────────────┘
            │                                      │
            └───────────── Railway Postgres ────────┘
                          (Drizzle ORM + pg-boss)
            ─────────────────────────────────────────
            Shared uploads volume (local) OR S3 bucket (railway)
```

Both processes run the same image (`Dockerfile`), split by command in
`docker-compose.yml`. The web process writes uploads; the worker reads them back
to extract — they **must share storage** (persistent volume or
`STORAGE_DRIVER=railway`). See `docs/04_engineering/deployment.md`.

## Request lifecycle (web)

1. `hooks.server.ts` → Auth.js session (`locals.auth()`), `locals.user`.
2. Membership resolution: `user_restaurants` for the user →
   `locals.restaurantId` from the `active_restaurant` cookie (validated) or the
   first membership (ADR-014). Bounded by `MEMBERSHIP_TIMEOUT_MS`.
3. Public-path whitelist vs auth; `/admin*` gated by `AUTH_ADMIN_EMAIL`.
4. Every page/API uses `forTenant(restaurantId).scope(...)` for queries.
5. Security headers applied on resolve (`X-Content-Type-Options: nosniff`,
   `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy`,
   HSTS, CSP). `X-Frame-Options` is `DENY` everywhere except `/api/upload/*`
   and `/invoice/[id]/file`, which get `SAMEORIGIN` so the app can frame its
   own invoice-PDF `<iframe>`; the CSP mirrors this with `frame-src 'self'`.
   Public paths are whitelisted in `isPublicPath()` (`hooks.server.ts`):
   `/login`, `/signup`, `/forgot-password`, `/reset-password`,
   `/verify-email`, `/privacy`, `/terms`, `/robots.txt`, `/sitemap.xml`,
   `/api/health`, `/auth/*`, `/waitlist`, `/api/stripe-webhook`,
   `/api/whatsapp/webhook`.

## The ingestion pipeline

1. **Upload** (`(app)/+page.server.ts` + `sessions.ts`): extension + magic-byte
   validation, 20 MB cap, billing quota + rate limit, files written to storage,
   then `createBatch` → `upload_batches` + `batch_items` (`pending`).
2. **Extraction** (`extract-batch.ts` → pg-boss → `extraction-worker.ts`):
   claim quota, `queued→extracting`, pull file, classify
   (`text_pdf`/`scanned_pdf`/`image`/`xml`), extract (Gemini or XML parser),
   enrich line items (units/packs/products), `markDone`/`markFailed` + dead-letter.
   Gemini runs through `extract.ts`'s `GenerateFn` seam (a `(content) =>
   Promise<string>` abstraction, so tests inject a mock instead of an SDK
   object) and returns an `ExtractedInvoice`: document-level `confidence`,
   per-header `field_confidences{}`, per-line-item `confidence` and `tax_rate`,
   plus invoice-level `tax_base` and `tax_breakdown` — one `{rate, base,
   tax_amount}` entry per tax rate printed on the document, so any country's
   tax system is represented.
3. **Review/confirm** (`batch/[id]`): one item at a time; save calls
   `saveReviewedInvoice` (low-confidence gate, content-hash dedup, transaction,
   post-commit alert engines). `done→confirmed`.
4. **Insights** fire after commit: price shock, stock forecast, budget, category
   nudges, VERI*FACTU mismatch, product suggestions. The alert engines live in
   `alerts.ts` (re-exported through the `alert-engine.ts` barrel):
   `runPriceShock` fires on a unit-price deviation beyond the
   `price_alert_threshold` setting (default >15%), `runStockForecast` when
   projected stock drops under 3 days, and `runBudgetCheck` when current-month
   category spend crosses its `category_budgets` threshold (warning ≥ 80%
   default, exceeded at 100%) — budget alerts are deduped to one entry per
   category + level per month.

State machine (guarded transitions, no lost writes): see
`docs/03_features/invoice_ingestion.md` and `batch-core.ts`.

## Multi-tenancy model

- Business tables carry `restaurant_id` → `forTenant().scope()`.
- **No RLS** (ADR-005): the app connects as table owner; scoping is enforced in
  application queries + CI lint gates + tenant-isolation tests.
- Deliberate exceptions to `restaurant_id`: `user_restaurants` (user-side join)
  and `subscriptions` (billing). Both are still tenant-linked via `restaurantId`.
- Multi-location: `restaurants.parentId` self-link; quota/plan resolution walks
  parent (`billingRestaurantId`).

## Data flow for analytics

Raw invoices → materialized views (`mv_*`) refreshed on a nightly pg-boss cron →
`/analytics/*`, dashboard trend, supplier/product detail. `trend.ts`'s
`getTrendDataByRange(rid, range, granularity)` builds the dashboard spend-trend
buckets: range (`7d`/`30d`/`90d`/`1y`/`all`) and granularity
(`daily`/`weekly`/`monthly`) are independent axes, capped at 400 buckets for
pathological combos like daily+all. Bucket keys use a local-timezone `isoDate()`
— never `toISOString()`, which rolls the calendar date back a day on any UTC+
server and silently breaks weekly bucketing. `dashboard/+page.server.ts` calls
it at SSR and seeds `TrendChart`'s `initialData` so the chart never flashes
"Loading…"; `/api/trend` refetches when the range or granularity changes. See
`docs/03_features/analytics.md`.

## Frontend conventions

- **Both viewports rendered** (ADR-020): `mobile/*` and `desktop/*` components
  for split pages; CSS (`md:` = 768px) shows one.
- **i18n** (ADR-021): one string table `src/lib/i18n.ts`, es-first; components
  consume `t`, `ti`, `tiv`, `tp`; CI bans hardcoded strings.
- **State**: Svelte 5 runes (`$state`, `$derived`, `$effect`); no framework
  stores except the i18n `locale` writable and the tutorial step store.
- **PWA**: `src/lib/pwa.ts` + `static/manifest.webmanifest`; precache assets,
  runtime NetworkFirst for `/api/`, CacheFirst for immutable assets. Read cache
  only — no offline write queue at the PWA layer (the upload queue is DB-backed
  in the web flow; WhatsApp is offline-irrelevant).

## Where each architecture concern is documented

| Concern | Document |
|---|---|
| Schema and relations | `docs/01_architecture/data_schemas_and_relations.md` |
| Routes and navigation | `docs/01_architecture/routing_and_navigation.md` |
| Integrations and state | `docs/01_architecture/integrations_and_state.md` |
| Product surface | `docs/02_product/*` |
| Feature contracts | `docs/03_features/*` |
| Invariants | `docs/00_system/architectural_invariants.md` |
| Decisions (why) | `docs/06_decisions/README.md` |
| How code works (line-by-line) | Per-subsystem `## Code notes` sections (`docs/03_features/` + `docs/04_engineering/`) |

## Database layer

- `src/lib/server/schema.ts` is the single source of truth for the schema,
  re-exporting `schema/{core,extensions,auth}.ts`. `pnpm db:generate` +
  committed `drizzle/*.sql` migrations are canonical (ADR-003); CI, staging and
  prod apply them via `pnpm db:migrate`. `pnpm db:push` is a local-only
  fast-iteration shortcut, never run against staging/prod. `pnpm db:check-sync`
  fails CI when `schema.ts` changes without a matching committed migration.
- `drizzle.config.ts` — drizzle-kit config (postgresql dialect, schema path,
  SSL required, loads `.env` via dotenv).
- `src/lib/server/db.ts` — postgres.js connection singleton (pooler URL via
  `DATABASE_POOL_URL`, SSL via `db-ssl.ts`); no startup migrations — the deploy
  runs `pnpm db:migrate`.

## Shared server modules

### Rate limiter (`src/lib/server/rate-limiter.ts`)

Sliding-window rate limiter backed by Upstash Redis when
`UPSTASH_REDIS_REST_URL`/`_TOKEN` are set (multi-instance safe); in-memory
token-bucket fallback otherwise (single-instance warning logged). Stale
in-memory buckets are swept every 2 minutes via `setInterval`. Which key scope
(user vs restaurant vs IP) applies is decided per call-site — see open item
#440. Also owns the cross-process extraction semaphore (Redis Lua slot lease
when Upstash is available, in-process queue otherwise).

### Chatbot context (`src/lib/server/chat-context.ts`)

Builds the fixed markdown DB snapshot the chatbot answers from (ADR-018 — no
dynamic SQL). Truncates at ~20k tokens (chars/4 estimate) with a console
warning.

### Billing and tier gating (`src/lib/server/billing.ts`)

`TIERS: Record<PlanTier, TierConfig>` is the single source of truth for
per-tier `monthlyInvoiceQuota`, `maxLocations` and boolean features
(`weeklyDigest`, `stockTracking`, `supplierScores`, `multiLocation`,
`prioritySupport`, `aiAssistant`). `getTierFeatures(restaurantId)` gates
`/api/chat`, `/digest`, `/analytics/prices`, `/api/stock-levels` and
multi-location creation in `/settings`. `TIERS` deliberately has no
consumer-facing price field — pricing is not finalized pre-launch, so `/billing`
and the public `/waitlist` each hardcode their own provisional prices (open
item #439).

## Code notes

### `src/routes/(app)/api/active-restaurant/+server.ts`

**`const POST`**

- Switch the active location (issue #290). hooks.server.ts has always read an `active_restaurant` cookie to resolve the tenant for the request — nothing ever wrote it, so a user with two memberships was pinned to the first one forever. This writes it, but only after confirming the caller is actually a member of the target restaurant: the cookie is the tenant selector for every subsequent query, so an unverified value here would be a tenant-isolation hole. (The hook re-checks membership on every request as well.)
- Scoped to the *target* tenant — the one query in the app that legitimately looks outside `locals.restaurantId`, and membership is exactly what it is checking.
