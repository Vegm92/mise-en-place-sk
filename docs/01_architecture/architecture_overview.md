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
5. Security headers applied on resolve (CSP, X-Frame-Options with same-origin
   carve-out for the PDF `<iframe>`, HSTS, nosniff, referrer, permissions).

## The ingestion pipeline

1. **Upload** (`(app)/+page.server.ts` + `sessions.ts`): extension + magic-byte
   validation, 20 MB cap, billing quota + rate limit, files written to storage,
   then `createBatch` → `upload_batches` + `batch_items` (`pending`).
2. **Extraction** (`extract-batch.ts` → pg-boss → `extraction-worker.ts`):
   claim quota, `queued→extracting`, pull file, classify
   (`text_pdf`/`scanned_pdf`/`image`/`xml`), extract (Gemini or XML parser),
   enrich line items (units/packs/products), `markDone`/`markFailed` + dead-letter.
3. **Review/confirm** (`batch/[id]`): one item at a time; save calls
   `saveReviewedInvoice` (low-confidence gate, content-hash dedup, transaction,
   post-commit alert engines). `done→confirmed`.
4. **Insights** fire after commit: price shock, stock forecast, budget, category
   nudges, VERI*FACTU mismatch, product suggestions.

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
`/analytics/*`, dashboard trend, supplier/product detail. `trend.ts` builds
buckets in the server's local timezone (never `toISOString`). See
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
| How code works (line-by-line) | `docs/CODE_NOTES.md` |
