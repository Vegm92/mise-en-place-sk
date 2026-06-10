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
- **Supabase**: Postgres (data) + Auth (email/password + Google OAuth, cookie sessions via `@supabase/ssr`)
- **Drizzle ORM** (postgres-js, SSL required); migrations in `drizzle/`, including row-level-security policies (`0002_rls_policies.sql`)
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
│   │   ├── weekly-digest.ts # AI weekly summary (generated on dashboard visit)
│   │   ├── chat-context.ts  # data snapshot for the chat assistant
│   │   ├── sessions.ts      # upload sessions (DB-backed, Postgres upload_sessions table)
│   │   ├── rate-limiter.ts  # in-memory token bucket + extraction semaphore (single instance!)
│   │   └── auth-seed.ts     # admin seeding; refuses default password in production
│   ├── components/          # mep/* design system, mobile/* + desktop/* page variants, ui/* shadcn
│   └── i18n.ts              # es/en string store
└── routes/
    ├── (app)/               # authenticated app (upload, invoices, suppliers, analytics, …)
    ├── (admin)/admin/       # ops pages
    ├── login, onboarding, waitlist, logout
    └── api/                 # upload files, inference status, auth callback
```

Multi-tenancy: every business table carries `restaurant_id`; access is enforced in application queries **and** by Postgres RLS policies as defense-in-depth. Uploaded files live on local disk (`UPLOADS_DIR`) — see [DEPLOYMENT.md](DEPLOYMENT.md) for the persistence requirements and single-instance constraints.

## Getting started

1. Create a Supabase project; get the Postgres connection string and API keys.
2. `cp .env.example .env` and fill every value (see [DEPLOYMENT.md](DEPLOYMENT.md) for the reference).
3. `pnpm install`
4. `pnpm db:migrate` (applies `drizzle/` migrations, including RLS policies)
5. `pnpm dev` — first boot seeds the admin user from `AUTH_ADMIN_EMAIL` / `AUTH_ADMIN_PASSWORD`.
6. Optional: `pnpm db:seed-demo` for demo data.

### Useful scripts

| Command | Purpose |
|---|---|
| `pnpm check` / `pnpm test` | typecheck / unit & integration tests (integration suites skip without Supabase env) |
| `pnpm db:generate` / `db:migrate` / `db:studio` | Drizzle workflow |
| `pnpm synth:e2e` | synthetic invoice benchmark for extraction quality (`synth/`) |

## Regulatory context (Spain)

Spanish invoicing law is changing in our favor — and shapes the roadmap:

- **VERI*FACTU** (RD 1007/2023, postponed by RDL 15/2025): certified invoice-*issuance* software becomes mandatory **1 Jan 2027** (companies) / **1 Jul 2027** (rest). Mise en Place does not issue invoices, so it is not itself an SIF — but supplier invoices will carry VERI*FACTU QR codes that we can parse and verify, dramatically improving extraction reliability.
- **B2B e-invoicing** (Ley Crea y Crece, RD 238/2026): businesses must receive structured e-invoices (Facturae/UBL/CII) and report payment statuses (expected ~Oct 2027 for >€8M turnover, ~Oct 2028 for all SMEs).

See `EINVOICING_READINESS.md` for the technical readiness plan and the tracking issues.

## Project documents

- [`PRE_RELEASE_AUDIT.md`](PRE_RELEASE_AUDIT.md) — pre-release audit: scores, top-20 blockers, 90-day roadmap (tracked in issues #60–#109)
- [`PLAN_DE_NEGOCIO.md`](PLAN_DE_NEGOCIO.md) — investor business plan (Spanish)
- [`DEPLOYMENT.md`](DEPLOYMENT.md) — environment variables and deployment runbook
