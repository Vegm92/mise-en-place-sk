# System Manifest — Mise en Place

The AI's map of the repository. Read this first to locate any subsystem; it is a
table of contents, not the documentation itself. All file paths are relative to
the repository root. Everything here was verified against `main` (HEAD ~ #796)
on 2026-08-30; if a doc disagrees with source, the source wins — report the drift.

## Product purpose

AI supplier-invoice intelligence for restaurants. Upload/photograph a supplier
invoice (PDF/JPG/PNG) or send it by WhatsApp; Gemini extracts the supplier,
header fields and line items with per-field confidence; the user reviews and
confirms; the app derives spend analytics, price-shock alerts, low-stock
forecasts, budgets, payment reminders, a weekly AI digest and a chat assistant.
Spanish-first, bilingual (es/en). Product definition:
`docs/02_product/product_definition.md`.

## Technology stack

- SvelteKit 2 + Svelte 5 (runes) + TypeScript, `@sveltejs/adapter-node`
- Tailwind CSS 4
- Drizzle ORM + `postgres` (postgres.js), Railway Postgres (migrated off
  Supabase Postgres, #366). App-layer tenancy is primary; a Postgres RLS
  backstop was added on top (ADR-030, #222), scoped to the `mep_runtime` role
- Auth.js (`@auth/sveltekit` + `@auth/drizzle-adapter`), JWT sessions,
  Credentials + Google OAuth (migrated off Supabase Auth, #369/#372/#370)
- Gemini (`@google/genai`, default `gemini-3.1-flash-lite`) via provider seam
- pg-boss background jobs in a separate worker process
- Baileys (`@whiskeysockets/baileys`) — unofficial WhatsApp client, worker-side,
  behind the transport seam in `src/lib/server/integrations/whatsapp/` (ADR-025)
- Stripe, Resend, Meta WhatsApp Cloud API, Sentry, Upstash Redis (optional),
  Railway Buckets (S3-compatible, `t3.storageapi.dev`) — invoice storage via
  `STORAGE_DRIVER=railway`
- pdf-parse (text-PDF classification before sending to Gemini)
- Vitest (unit + integration tests); GitHub Actions CI (`.github/workflows/ci.yml`)

## Entry points

| Process | File | How it runs |
|---|---|---|
| Web app | `src/hooks.server.ts` → `src/routes/` | `pnpm dev` / `pnpm build` → `node build` |
| Worker | `src/worker.ts` | `pnpm worker` (dev) / `node build/worker.js` (prod) |
| Admin seed | `src/lib/server/auth-seed.ts` | First boot, from `AUTH_ADMIN_*` |

## Application routes (grouped)

- `(app)` — authenticated app shell: `dashboard`, `invoices`, `invoice/[id]` +
  `edit`, `batch/[id]`, `confirm/[id]` (legacy redirect stub), `extract/[id]`
  (legacy redirect stub), `suppliers[/id]`, `products[/id]`, `budgets`,
  `reminders`, `analytics/{spend,prices,extraction}`, `digest`, `chat`,
  `billing`, `settings`, `help`, plus `(app)/api/*` endpoints.
- `(admin)` — `/admin` dashboard, `events`, `errors`, `health`, `revenue`,
  `dead-letters` (gated by `AUTH_ADMIN_EMAIL`).
- Public — `login`, `signup`, `logout`, `forgot-password`, `reset-password`,
  `verify-email`, `onboarding`, `waitlist`, `privacy`, `terms`.
- Standalone API — `/api/auth/[...all]` (Auth.js), `/api/batch-status/[id]`,
  `/api/health`, `/api/stripe-webhook`, `/api/upload/[id]/[file]`,
  `/api/user/delete`, `/api/user/export`, `/api/whatsapp/webhook`,
  `robots.txt`, `sitemap.xml`.

Full map with file locations: `docs/01_architecture/routing_and_navigation.md`.

## Database

- Canonical schema: `src/lib/server/schema.ts`. 44 tables + 5 materialized
  views.
- Committed Drizzle migrations in `drizzle/` (latest `0058`) are canonical
  (ADR-003); `pnpm db:check-sync` fails CI on drift.
- Every business table carries `restaurant_id`. Statuses are `text` — no enums.
- Table inventory: `docs/01_architecture/data_schemas_and_relations.md`.

## Authentication & tenancy

- Auth.js (`@auth/sveltekit`) in `src/lib/server/auth.ts`; JWT sessions;
  `@auth/drizzle-adapter` persists users/accounts/sessions/verification tokens
  over the auth tables in `schema.ts`. Credentials (email/password via
  `auth-credentials.ts#verifyCredentials`, self-signup through `/signup`) +
  Google OAuth (`AUTH_GOOGLE_ID`/`AUTH_GOOGLE_SECRET`, Google Cloud Console).
- Admin seeding: `seedAdminUser()` in `src/lib/server/auth-seed.ts` creates the
  admin user + restaurant + `user_restaurants` link on first boot — no external
  Admin API dependency.
- Session validation: `event.locals.auth()` (Auth.js's `authHandle`) runs first
  in `hooks.server.ts`'s `sequence()`; the app handle reads the resolved session.
- Password reset / email verification: `verification-token.ts` + `email.ts`
  (Resend) back `/forgot-password`, `/reset-password`, `/verify-email`; every
  email kind renders through one `renderEmailLayout()`.
- `locals.restaurantId` resolved per request from `user_restaurants` membership +
  the `active_restaurant` cookie, re-validated server-side on switch
  (`src/hooks.server.ts`, `(app)/api/active-restaurant/+server.ts`, ADR-014).
- Tenant scoping: `forTenant().scope()` in `src/lib/server/tenant.ts`; enforced
  by `lint:tenant-scope` + `lint:unscoped-query` CI gates (ADR-001/005/022).
  App-layer scoping is primary; a Postgres RLS backstop (ADR-030) is enabled
  but not yet forced in production, exercised by the tenant-isolation tests
  and `tests/rls-runtime-role.test.ts`.
- Full detail: `docs/04_engineering/security_rules.md`.

## Background worker

- `src/worker.ts`: pg-boss, `max:3`, queues `extract-invoice`,
  `normalize-product` and `whatsapp-notify` (each with a dead-letter sibling),
  all drained to the `dead_letter_queue` audit table. The WhatsApp transport is
  hosted here too when `WHATSAPP_BOT_ENABLED=true`, and stopped on shutdown. Extraction runs up to
  `MAX_CONCURRENT_EXTRACTIONS` (default 3) in parallel, capped globally by the
  `acquireExtractionSlot()` semaphore (`worker.ts` `batchSize` follows the cap).
- Scheduled cron jobs (see `docs/05_operations/background_jobs.md`):
  weekly digest, overdue reminders, trial-expiry notices, file purge,
  MRR snapshot, dead-letter purge, analytics MV refresh, orphan-subscription
  reconciliation.
- The first three are dispatchers only: they keyset-page `restaurants` and queue
  one job per tenant onto `tenant-weekly-digest` / `tenant-overdue-reminder` /
  `tenant-trial-notice`, consumed `SCHEDULED_FANOUT_CONCURRENCY` at a time with
  per-job settlement (`src/lib/server/tenant-fanout.ts`, ADR-025).
- Enqueue seams: `src/lib/server/queue.ts`, `extract-batch.ts`,
  `tenant-fanout.ts`.
- Liveness: the worker upserts `worker_heartbeats` every 30 s and after every
  job batch (`worker-heartbeat.ts`). `/admin/health` and `/api/health` read it,
  so "queue not draining" is distinguishable from "worker busy" without log
  access (#540).

## External services

| Service | Purpose | Config in `.env.example` / `DEPLOYMENT.md` | Notes |
|---|---|---|---|
| Gemini | extraction, digest, chat, product LLM matching | `GEMINI_API_KEY`, `GEMINI_MODEL` | seam: `llm-provider.ts` |
| Stripe | subscriptions, webhooks | `STRIPE_*` | `api/stripe-webhook` |
| Resend | transactional email | `RESEND_API_KEY`, `EMAIL_FROM` | no-op w/o key |
| Meta WhatsApp | invoice ingestion channel | `WHATSAPP_*` | `api/whatsapp/webhook` |
| Sentry | error tracking + admin errors page | `SENTRY_*` | no-op w/o DSN |
| Upstash Redis | distributed rate limiting (optional) | `UPSTASH_REDIS_*` | falls back in-memory |
| Railway Buckets | object storage (optional) | `STORAGE_DRIVER=railway`, `AWS_*` | falls back local disk |
| Railway Postgres | data | `DATABASE_URL` / `_POOL_URL` | |

## AI provider seam

- `src/lib/server/llm-provider.ts` — `LLMProvider.generate()` wrapper around
  GoogleGenAI; only extraction and product normalization use it (usage is
  recorded). Chat and digest call Gemini directly and do NOT record usage.
- Usage accounting: `src/lib/server/llm-quota.ts` (`monthly_usage`,
  `llm_usage_log`, `tenant_llm_quotas`).

## Important entities (see `docs/01_architecture/data_schemas_and_relations.md`)

`restaurants` (+`parentId` multi-location), `users`, `user_restaurants`,
`suppliers`, `products`, `product_aliases`, `invoices`,
`invoice_line_items`, `upload_batches`, `batch_items`, `unit_conversions`,
`category_budgets`, `stock_levels`, `system_notifications`,
`subscriptions`, `settings`, `chat_sessions`, `chat_messages`,
`whatsapp_contacts`, `whatsapp_pairing_codes`, `dead_letter_queue`,
`worker_heartbeats`, `monthly_usage`, `llm_usage_log`, `mrr_snapshots`,
`mv_*` materialized views.

## Important services (server lib)

- `invoice-save.ts` — the single invoice write path (ADR-008)
- `batch-core.ts` — batch/batch_item state machine (ADR-002, 015)
- `extract.ts` / `extraction-worker.ts` — classification + Gemini extraction
- `einvoice-parser.ts` — Facturae/UBL parsing without AI
- `alerts.ts` (alias `alert-engine.ts`) — alert rules, fired on save
- `alert-preferences.ts` — per-tenant, per-type alert toggles (#577)
- `billing.ts` — tiers, quotas, Stripe checkout + webhooks (ADR-013)
- `billing-plans.ts` — `PROVISIONAL_PRICE`, `TIER_COPY` (client-facing)
- `products.ts` — product identity in three tiers (ADR-009)
- `trend.ts` — trend buckets for analytics/dashboard
- `chat-context.ts` — the shared snapshot (ADR-018)
- `weekly-digest.ts` — weekly digest generation
- `whatsapp-bot.ts` / `whatsapp-pairing.ts` — WhatsApp ingestion (ADR-004/019)
- `storage.ts` — storage driver seam (ADR-016)
- `dead-letter.ts` — dead letter queue audit
- `revenue-metrics.ts` / `revenue-math.ts` — admin MRR/LTV/CAC

## Tests

- `tests/*.test.ts` (Vitest). DB-backed suites require a local Postgres
  (`DATABASE_TEST_URL`); they skip on non-local hosts.
- Coverage gate: v8 ≥80% lines on 7 core modules (vite.config.ts).
- Location map: `docs/04_engineering/testing_strategy.md`.

## Deployment

- `DEPLOYMENT.md` is the runbook + env reference; `docs/04_engineering/deployment.md`
  is the AI-facing summary.
- Two processes (web + worker), one image; shared uploads volume
  (`docker-compose.yml`) or `STORAGE_DRIVER=railway`.
- Single-instance constraints: in-memory rate-limit fallback, in-process
  extraction semaphore (`MAX_CONCURRENT_EXTRACTIONS`).

## Where to look next

| Question | Go to |
|---|---|
| "What does this table/column mean?" | `docs/01_architecture/data_schemas_and_relations.md` |
| "What are the rules for feature X?" | `docs/03_features/<feature>.md` |
| "Why is this code shaped this way?" | `docs/06_decisions/` (ADRs) |
| "How does this file work line by line?" | Per-subsystem `## Code notes` sections (`docs/03_features/` + `docs/04_engineering/`) |
| "What breaks if I touch subsystem X?" | `docs/00_system/dependency_map.md` |
| "What must never be violated?" | `docs/00_system/architectural_invariants.md` |
| "Which words mean what?" | `docs/00_system/terminology.md` |
| "Current status / open audit items?" | `CONTEXT.md` |

## Major architectural risks

1. **App-layer tenancy is the only boundary** — any unscoped query is a data
   leak (lint gates catch the shape; #380 did leak via an unscoped query).
2. **Single-instance assumptions** — the in-memory rate limiter is per-process.
   The extraction semaphore stays global across worker processes only when
   Upstash Redis is configured; without it, the per-process fallback means the
   effective Gemini concurrency is (worker count × `MAX_CONCURRENT_EXTRACTIONS`).
3. **Local storage default** — web and worker must share `UPLOADS_DIR`; a
   split-process deploy without shared disk breaks extraction (use `railway`).
4. **AI cost/unbounded usage** — chat and digest bypass LLM usage recording;
   `llm_usage_log` undercounts actual spend.
5. **`lastEventAt` out-of-order Stripe webhooks** — protected by a filter, but
   the 3-day retry window depends on the dedup claim being deleted on error.
6. **Rate-limit key split is undocumented** (#440) — user vs restaurant vs IP
   keying has no stated rule.
