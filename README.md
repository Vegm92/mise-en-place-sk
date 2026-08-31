# Mise en Place

**AI-powered supplier-invoice intelligence for restaurants.** Photograph or upload a supplier invoice (PDF/JPG/PNG); Gemini extracts the supplier, header fields, and line items with per-field confidence; you review and confirm; the app turns it into spend analytics, price-shock alerts, budgets, payment reminders, a weekly AI digest, and a chat assistant over your own purchasing data.

Spanish-first, bilingual (es/en). Built for independent restaurants and small groups.

## Product surface

| Area | What it does |
|---|---|
| **Upload → Extract → Confirm** | Camera/file upload (offline queue via IndexedDB), AI extraction with per-field confidence, guided review of low-confidence fields, duplicate detection |
| **Invoices** | List, detail, edit, status (pending/paid), CSV export, original file viewer |
| **Suppliers** | Auto-created from invoices; spend, price trends, reliability metrics, contact data |
| **Analytics** | Spend by category/period, price evolution per ingredient, extraction-quality dashboard |
| **Budgets** | Monthly budget per category with overage warnings |
| **Reminders** | Overdue / due-soon invoices, one-click mark-paid |
| **Alerts** | Price shock, low-stock forecast, unit-conversion warnings (in-app notification bell) |
| **Weekly digest** | Gemini-generated weekly summary per restaurant (`/digest`) |
| **Chat** | Data-aware assistant (`/chat` + floating FAB) over the restaurant's own purchasing data |
| **Admin** | `/admin` — ops dashboard, system events, health checks (gated by `AUTH_ADMIN_EMAIL`) |
| **Waitlist** | Public bilingual landing page at `/waitlist` |

## Tech stack

- **SvelteKit 2 + Svelte 5 (runes)**, Tailwind CSS 4, `@sveltejs/adapter-node`
- **Railway Postgres** (data) — migrated off Supabase in #366/#367
- **Auth.js** (`@auth/sveltekit`) — email/password (Credentials + bcrypt) + Google OAuth, JWT sessions — replaced Supabase Auth in #369–#372
- **Drizzle ORM** (postgres-js, SSL required); committed migrations in `drizzle/` are the canonical schema source (ADR-003)
- **Gemini** (`@google/genai`, default `gemini-3.1-flash-lite`) for extraction, digest, and chat
- **unpdf** (read) + **pdf-lib** (write) — page-level text and PDF splitting, so a supplier packet of many invoices in one PDF is separated before extraction (ADR-035)
- **Baileys** (`@whiskeysockets/baileys`) — unofficial WhatsApp client for the invoice bot, in the worker process. MVP stopgap until the business is registered and Meta Cloud API credentials are obtainable (ADR-025)
- **Sentry** (`@sentry/sveltekit`) for client + server error tracking (no-ops when DSN empty)
- **Vitest** unit/integration tests; GitHub Actions CI (typecheck, tests, build)

## Architecture overview

```
src/
├── hooks.server.ts          # Sentry, Auth.js session handling,
│                            # active-restaurant resolution, security headers
├── lib/
│   ├── server/
│   │   ├── db.ts, schema.ts # Drizzle + Postgres (multi-tenant: restaurant_id everywhere)
│   │   ├── extract.ts       # Gemini extraction (text-PDF fast path, vision fallback, retries)
│   │   ├── alert-engine.ts  # price-shock / stock-forecast checks on invoice save
│   │   ├── weekly-digest.ts # AI weekly summary (scheduled in the worker + on dashboard visit)
│   │   ├── chat-context.ts  # data snapshot for the chat assistant
│   │   ├── sessions.ts      # upload file storage helpers (save/reject/delete)
│   │   ├── rate-limiter.ts  # Upstash Redis token bucket, in-memory fallback (single instance!)
│   │   ├── scheduler.ts     # pg-boss cron: weekly digest, overdue + trial-expiry email
│   │   └── auth-seed.ts     # admin seeding; refuses default password in production
│   ├── components/          # mep/* design system, mobile/* + desktop/* page variants
│   └── i18n.ts              # es/en string store
└── routes/
    ├── (app)/               # authenticated app (upload, invoices, suppliers, analytics, …)
    ├── (admin)/admin/       # ops pages
    ├── login, onboarding, waitlist, logout
    └── api/                 # upload files, inference status, auth callback
```

Multi-tenancy: every business table carries `restaurant_id`; access is enforced in application queries via `forTenant().scope()`, guarded by the `lint:tenant-scope` CI check. This is the **only** tenant boundary — the app connects as the table owner, and RLS policies were dropped in the Railway migration (see ADR-001 and ADR-005, and #222 for the database-enforced path). Uploaded files live on local disk (`UPLOADS_DIR`) or in object storage (`STORAGE_DRIVER=railway`) — see [DEPLOYMENT.md](DEPLOYMENT.md) for the persistence requirements and single-instance constraints.

## Architecture decisions

Why the app is shaped this way is recorded as ADRs in **[`docs/06_decisions/`](docs/06_decisions/README.md)** — one file per decision, grouped per feature area (tenancy, ingestion, extraction, invoicing, insights, analytics, billing, identity, WhatsApp, data, experience, conventions). Start with the [index](docs/06_decisions/README.md).

## Getting started

1. Provision a Railway Postgres instance for `DATABASE_URL` (see [DEPLOYMENT.md](DEPLOYMENT.md)). A local Postgres works for development.
2. `cp .env.example .env` and fill every value (see [DEPLOYMENT.md](DEPLOYMENT.md) for the reference).
3. `pnpm install`
4. `pnpm db:migrate` (applies `drizzle/` migrations — the canonical schema, per ADR-003)
5. `pnpm dev:all` — runs the web server **and** the extraction worker (both are required; `pnpm dev` alone leaves invoice extractions stuck in `queued`). First boot seeds the admin user from `AUTH_ADMIN_EMAIL` / `AUTH_ADMIN_PASSWORD`.

### Useful scripts

| Command | Purpose |
|---|---|
| `pnpm check` / `pnpm test` | typecheck / unit & integration tests (DB-backed suites need a **local** Postgres — see below) |
| `pnpm db:generate` / `db:migrate` / `db:studio` | Drizzle workflow |
| `pnpm qa:sweep` | drive the running app in headless Chromium and write `qa-report.md` — route health, security headers, a11y, i18n key leakage, responsive, malformed route params. Needs `pnpm dev` up and, first time only, `npx playwright install chromium`. See [docs/04_engineering/browser_qa_sweep.md](docs/04_engineering/browser_qa_sweep.md) |

### Running the DB-backed tests

Those suites create and delete real restaurants, suppliers, invoices and
notifications, so they only run against a **local** Postgres
(`localhost` / `127.0.0.1` / `::1` / `host.docker.internal`). If your `DATABASE_URL`
points at a hosted database — Railway, or anything else non-local, which is the
shape in `.env.example` — they skip with a loud notice instead of writing to it.

- Preferred: set `DATABASE_TEST_URL` to a local database, keeping app and test
  connection strings separate by construction.
- Alternatively point `DATABASE_URL` itself at local Postgres (see
  `.claude/skills/verify/SKILL.md` for a ready-made local stack).
- `ALLOW_REMOTE_DB_TESTS=1` forces them to run against a non-local database.
  Destructive — throwaway databases only.

## Regulatory context (Spain)

Spanish invoicing law is changing in our favor — and shapes the roadmap:

- **VERI*FACTU** (RD 1007/2023, postponed by RDL 15/2025): certified invoice-*issuance* software becomes mandatory **1 Jan 2027** (companies) / **1 Jul 2027** (rest). Mise en Place does not issue invoices, so it is not itself an SIF — but supplier invoices will carry VERI*FACTU QR codes that we can parse and verify, dramatically improving extraction reliability.
- **B2B e-invoicing** (Ley Crea y Crece, RD 238/2026): businesses must receive structured e-invoices (Facturae/UBL/CII) and report payment statuses (expected ~Oct 2027 for >€8M turnover, ~Oct 2028 for all SMEs).

Structured e-invoices (Facturae 3.2.x and UBL 2.1) are already parsed directly —
no AI pass — by `src/lib/server/einvoice-parser.ts`, including UN/ECE Rec 20 and
Facturae unit-of-measure codes; VERI*FACTU QR payloads are parsed by
`src/lib/server/qr.ts`.

## Project documents

- [`DEPLOYMENT.md`](DEPLOYMENT.md) — environment variables and deployment runbook
- [`docs/05_operations/beta_readiness_review_2026-08-27.md`](docs/05_operations/beta_readiness_review_2026-08-27.md) — hands-on QA pass gating private beta; a staging smoke pass with live keys (#785) is still outstanding before a full production release
- [`docs/05_operations/ceo_audit_2026-08-29.md`](docs/05_operations/ceo_audit_2026-08-29.md) — cross-functional pre-launch gap analysis, prioritized P0–P2, each item tracked as a GitHub issue
- [`docs/02_product/revenue_metrics.md`](docs/02_product/revenue_metrics.md) — the SaaS metrics behind `/admin/revenue` (MRR, CAC, LTV, NRR, cohorts, revenue leakage): formulas, data sources and caveats
