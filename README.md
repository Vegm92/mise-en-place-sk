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

- **SvelteKit 2 + Svelte 5 (runes)**, Tailwind CSS 4, shadcn-svelte/bits-ui, `@sveltejs/adapter-node`
- **Railway Postgres** (data) — migrated off Supabase in #366/#367
- **Supabase Auth** (email/password + Google OAuth, cookie sessions via `@supabase/ssr`) — being replaced by Auth.js in #369–#372
- **Drizzle ORM** (postgres-js, SSL required); committed migrations in `drizzle/` are the canonical schema source (ADR-003)
- **Gemini** (`@google/genai`, default `gemini-2.5-flash`) for extraction, digest, and chat
- **Sentry** (`@sentry/sveltekit`) for client + server error tracking (no-ops when DSN empty)
- **Vitest** unit/integration tests; GitHub Actions CI (typecheck, tests, build)

## Architecture overview

```
src/
├── hooks.server.ts          # Sentry, Supabase client per request, JWT validation,
│                            # active-restaurant resolution, security headers
├── lib/
│   ├── server/
│   │   ├── db.ts, schema.ts # Drizzle + Postgres (multi-tenant: restaurant_id everywhere)
│   │   ├── extract.ts       # Gemini extraction (text-PDF fast path, vision fallback, retries)
│   │   ├── alert-engine.ts  # price-shock / stock-forecast checks on invoice save
│   │   ├── weekly-digest.ts # AI weekly summary (scheduled in the worker + on dashboard visit)
│   │   ├── chat-context.ts  # data snapshot for the chat assistant
│   │   ├── sessions.ts      # upload sessions (DB-backed, Postgres upload_sessions table)
│   │   ├── rate-limiter.ts  # Upstash Redis token bucket, in-memory fallback (single instance!)
│   │   ├── scheduler.ts     # pg-boss cron: weekly digest, overdue + trial-expiry email
│   │   └── auth-seed.ts     # admin seeding; refuses default password in production
│   ├── components/          # mep/* design system, mobile/* + desktop/* page variants, ui/* shadcn
│   └── i18n.ts              # es/en string store
└── routes/
    ├── (app)/               # authenticated app (upload, invoices, suppliers, analytics, …)
    ├── (admin)/admin/       # ops pages
    ├── login, onboarding, waitlist, logout
    └── api/                 # upload files, inference status, auth callback
```

Multi-tenancy: every business table carries `restaurant_id`; access is enforced in application queries via `forTenant().scope()`, guarded by the `lint:tenant-scope` CI check. This is the **only** tenant boundary — the app connects as the table owner, and the Supabase-era RLS policies were dropped in the Railway migration (see ADR-001 and ADR-005, and #222 for the database-enforced path). Uploaded files live on local disk (`UPLOADS_DIR`) or in object storage (`STORAGE_DRIVER=railway`) — see [DEPLOYMENT.md](DEPLOYMENT.md) for the persistence requirements and single-instance constraints.

## Getting started

1. Provision a Railway Postgres instance for `DATABASE_URL`, and a Supabase project for the auth keys (see [DEPLOYMENT.md](DEPLOYMENT.md)). A local Postgres works for development.
2. `cp .env.example .env` and fill every value (see [DEPLOYMENT.md](DEPLOYMENT.md) for the reference).
3. `pnpm install`
4. `pnpm db:migrate` (applies `drizzle/` migrations — the canonical schema, per ADR-003)
5. `pnpm dev:all` — runs the web server **and** the extraction worker (both are required; `pnpm dev` alone leaves invoice extractions stuck in `queued`). First boot seeds the admin user from `AUTH_ADMIN_EMAIL` / `AUTH_ADMIN_PASSWORD`.
6. Optional: `pnpm db:seed-demo` for demo data.

### Useful scripts

| Command | Purpose |
|---|---|
| `pnpm check` / `pnpm test` | typecheck / unit & integration tests (DB-backed suites need a **local** Postgres — see below) |
| `pnpm db:generate` / `db:migrate` / `db:studio` | Drizzle workflow |
| `pnpm synth:e2e` | synthetic invoice benchmark for extraction quality (`synth/`) |

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
- [`PRODUCTION_SIGNOFF.md`](PRODUCTION_SIGNOFF.md) — the staging checks that gate a production release
- [`GAP_ANALYSIS.md`](GAP_ANALYSIS.md) — pre-launch gap analysis; each item is tracked as a GitHub issue
