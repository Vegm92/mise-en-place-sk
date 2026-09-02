---
tags: [mep, engineering]
related: "[[CONTEXT]]"
---

# Deployment

**Canonical runbook: `DEPLOYMENT.md` at the repo root.** It holds the full
environment variable inventory, per-variable descriptions, and step-by-step
deploy procedure (Railway, adapter-node, worker process, cron). Read it before
deploying. This page is the short pointer + invariants an agent must keep.

## Topology

- Two deployable units from one repo: the **app** (SvelteKit adapter-node) and
  the **worker** (`pnpm worker` → `src/worker.ts`, pg-boss consumers + cron).
- Postgres on Railway; `DATABASE_URL` shared by both units.
- Env must exist on BOTH units and in CI where the workflow needs it.

## Non-negotiables at deploy time

- `db:migrate` runs as part of the worker startup — do not hand-migrate prod
  outside the runbook. Schema drift fails `db:check-sync` in CI (ADR-003).
- `DATABASE_SSL_MODE=require` default with `rejectUnauthorized:false` has a
  MITM window — use `verify-full` + `DATABASE_CA_CERT` for tighter security
  (see `security_rules.md`).
- Worker needs the same secrets as the app (Gemini, Stripe, WhatsApp, Resend,
  Sentry, rate-limiter Redis).
- Scheduled jobs are registered in the worker (`registerScheduledJobs`,
  ADR-011) — a worker without them silently loses nightly refresh/digest/trial
  jobs.
- Unknown-then-fallback behaviors (e.g. unknown Stripe price id) are loud
  (Sentry) on purpose; don't suppress them in deploy config.
- HSTS header is set unconditionally; serve behind TLS at the edge.

## Environment checklist (condensed)

`DEPLOYMENT.md` holds the authoritative per-variable detail; this is the
complete inventory the app and worker actually read, grouped by area.

- **Database** — `DATABASE_URL` (drizzle-kit migrations + pg-boss) and
  `DATABASE_POOL_URL` (runtime Drizzle ORM; `getDb()` prefers it when set,
  `src/lib/server/db.ts`). `DATABASE_SSL_MODE` — `require` (default) or
  `verify-full` (+ `DATABASE_CA_CERT`), see `db-ssl.ts`.
- **Auth** — `AUTH_SECRET` (JWT signing), `AUTH_GOOGLE_ID`/`AUTH_GOOGLE_SECRET`
  (Google OAuth), `AUTH_ADMIN_EMAIL`/`AUTH_ADMIN_PASSWORD`/
  `AUTH_ADMIN_RESTAURANT_NAME` (first-boot admin seed; prod refuses to start on
  the `@example.com`/`changeme` placeholders).
- **AI** — `GEMINI_API_KEY` (required for extraction, chat and digest),
  `GEMINI_MODEL` (default `gemini-3.1-flash-lite`; bump when Google rotates models),
  `GEMINI_TIMEOUT_MS` (default 120000 — aborts the in-flight request so it
  stops holding a Gemini concurrency slot).
- **Storage** — `STORAGE_DRIVER` (`local` default / `railway`), `UPLOADS_DIR`
  (default `uploads`), and only when `STORAGE_DRIVER=railway`:
  `AWS_ENDPOINT_URL`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`,
  `AWS_S3_BUCKET_NAME`, `AWS_DEFAULT_REGION`, `AWS_S3_URL_STYLE`.
  **Set all six on every service that touches uploaded files** — web and worker
  are separate containers with separate disks; a worker left on its `local`
  default fails every extraction with `ENOENT` (seen in prod 2026-08-04).
- **Chat / extraction tuning** — `CHAT_RATE_LIMIT_RPM` (default 20),
  `MAX_CONCURRENT_EXTRACTIONS` (default 3), `UPSTASH_REDIS_REST_URL` /
  `UPSTASH_REDIS_REST_TOKEN` (multi-replica rate limiting + distributed
  extraction semaphore; the in-memory fallback is per-process).
- **Email** — `RESEND_API_KEY` (unset → `sendEmail()` logs instead of sending),
  `EMAIL_FROM`, plus the legal footer lines `COMPANY_LEGAL_NAME` /
  `COMPANY_ADDRESS` / `COMPANY_NIF` (each omitted, not fabricated, when unset).
- **Billing** — `STRIPE_SECRET_KEY` (unset disables billing; live/restricted
  keys go only in the platform env store), `STRIPE_PRICE_ID_STARTER` / `_PRO` /
  `_BUSINESS` (unset tier → "plan not available", issue #286;
  `STRIPE_PRICE_ID` is a legacy fallback for Starter only),
  `STRIPE_WEBHOOK_SECRET` (required in prod — the handler throws rather than
  skipping signature verification; dev uses
  `stripe listen --forward-to localhost:5173/api/stripe-webhook`),
  `PLAN_PRICE_STARTER_EUR` / `PLAN_PRICE_PRO_EUR` / `PLAN_PRICE_BUSINESS_EUR`
  (MRR pricing for `/admin/revenue`; falls back to `PROVISIONAL_PRICE`).
- **WhatsApp (prod)** — `WHATSAPP_ACCESS_TOKEN` + `WHATSAPP_PHONE_NUMBER_ID` +
  `WHATSAPP_VERIFY_TOKEN` + `WHATSAPP_APP_SECRET` (the webhook fails closed
  without them), plus `WHATSAPP_API_VERSION` and `WHATSAPP_DISPLAY_NUMBER`.
- **Observability / proxy** — `SENTRY_AUTH_TOKEN` (+ `SENTRY_ORG`,
  `SENTRY_PROJECT`, `SENTRY_DSN`, `VITE_SENTRY_DSN`, `SENTRY_RELEASE`),
  `ADDRESS_HEADER`/`XFF_DEPTH` behind a proxy, `APP_BASE_URL` (WhatsApp batch
  links).

## CI gate

`.github/workflows/ci.yml` runs lint → check → db:check-sync → migrate → tests
→ build (see `docs/04_engineering/testing_strategy.md`). A deploy that hasn't
passed this must not ship.

## Rollback

- App: redeploy previous container/commit.
- Migrations: forward-fix preferred; data migrations must be additive +
  idempotent (see `database_changes.md`).
- Webhooks: Stripe/Meta redeliver on failure — keep the dedup tables intact.

## Local development

```bash
pnpm dev             # dev server (default port 5173)
pnpm worker          # extraction worker (pg-boss consumer) — must run alongside pnpm dev, or queued extractions never process
pnpm test            # vitest run
pnpm check           # svelte-check
pnpm db:generate     # generate a migration from schema.ts changes — commit it (ADR-003, canonical path)
pnpm db:push         # push schema.ts → the DB directly — local dev convenience only, never staging/prod
pnpm db:check-sync   # CI check: fails if schema.ts changed without a committed migration
pnpm db:studio       # open Drizzle Studio browser UI
```

## Code notes

### `svelte.config.js`

**`form-action` CSP directive**

- `/login?/signInWithGoogle` (the `signInWithGoogle` action, bound to Auth.js's `signIn` in `src/routes/login/+page.server.ts`) is a plain HTML form POST; the action 303-redirects straight to Google's OAuth consent screen. Browsers validate `form-action` against that first redirect hop (not just the form's own same-origin target), so `https://accounts.google.com` must be allowlisted alongside `'self'` or the redirect gets blocked client-side.

## HTTP API endpoints

### `src/lib/server/env.ts`

**`const UPLOADS_DIR`**

- Server config reads `process.env` directly — no `$env/dynamic/private` anywhere in `src/`. With adapter-node the two are equivalent at runtime, and going straight to `process.env` is what lets every one of these modules be imported by the worker, which runs outside the Kit runtime (`vite.worker.config.ts` aliases only `$lib`). The standalone `env-dynamic-shim.ts` that used to bridge this is gone. Defaults to `'uploads'`.

**`const EXTRACTION_STALL_WARN_MS`**

- Stall thresholds and the heartbeat interval are env-tunable because the right values depend on the deployment's Gemini latency and replica count, not on the code (#540). Defaults are documented in `DEPLOYMENT.md` → Tuning.

**`const STRIPE_PRICE_ID_STARTER`**

- Stripe price IDs per tier — set in your Stripe dashboard and env.

**`const WHATSAPP_ACCESS_TOKEN`**

- WhatsApp Cloud API bearer token.

**`const WHATSAPP_APP_SECRET`**

- App secret from Meta App Dashboard — used to verify `X-Hub-Signature-256` on inbound webhook POSTs. Without it, the webhook cannot authenticate Meta.

**`const WHATSAPP_API_VERSION`**

- Graph API version used for every Cloud API call (default `'v25.0'`). Meta expires each version roughly two years after release and calls to an expired one fail outright, so this is env-tunable: bumping it must not require a code change. See DEPLOYMENT.md.

**`const WHATSAPP_DISPLAY_NUMBER`**

- The bot's own number, in dialable form — this is what staff must message, and nothing else in the config carries it (`WHATSAPP_PHONE_NUMBER_ID` is an opaque Meta id). Without it the app cannot tell anyone where to send invoices (issue #319). Any input format works; it is normalised on read.
