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

- `db:migrate` runs in exactly one place: the **web** service's Railway
  `preDeployCommand` (`railway.json`). The worker's `preDeployCommand`
  (`node build/wait-for-migrations.js`, `railway.worker.json`) only waits until
  the ledger matches the shipped journal (`src/lib/server/migration-state.ts`).
  Do not hand-migrate prod outside the runbook. Schema drift fails
  `db:check-sync` in CI (ADR-003).
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

- **Database** — `DATABASE_URL` (runtime: Drizzle ORM + pg-boss, the scoped
  `mep_runtime` role in production), `DATABASE_MIGRATION_URL` (owner role,
  drizzle-kit only, web service only) and `DATABASE_POOL_URL` (runtime
  Drizzle ORM; `getDb()` prefers it when set, `src/lib/server/db.ts`).
  `DATABASE_SSL_MODE` — `require` (default) or `verify-full`
  (+ `DATABASE_CA_CERT`), see `db-ssl.ts`.
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

## Web/worker configuration contract (#1049)

Two independent checks, both boot-time or job-time — never a separate CI
script — because a config drift here loses an already-uploaded file, not just
a request:

- **Per-role presence.** `src/lib/server/config.ts` → `assertRoleConfig(role,
  env)` throws in production when `DATABASE_URL`, `GEMINI_API_KEY`, or (when
  `STORAGE_DRIVER=railway`) the `AWS_ENDPOINT_URL` / `AWS_ACCESS_KEY_ID` /
  `AWS_SECRET_ACCESS_KEY` / `AWS_S3_BUCKET_NAME` quad is missing for that role
  — variable *names* only, never values. The web role runs it inside the
  existing `assertProductionEnv()` (called from `hooks.server.ts`); the worker
  calls it once at the top of `worker.ts`. Both read the same
  `ENV_REQUIREMENTS` table `env-report.ts` already reports on
  `/admin/health`, so there is one list of required-per-role variables, not
  two.
- **Cross-role value match, per job.** Presence alone does not catch two
  services that are each individually valid but disagree — local storage on
  both with a different `UPLOADS_DIR`, or `railway` on both with a different
  bucket. `enqueueExtraction` (`queue.ts`) stamps every `extract-invoice` job
  with a non-secret `storageFingerprint` (`env.ts`:
  `local:<UPLOADS_DIR>` or `railway:<AWS_S3_BUCKET_NAME>` — never a key or
  secret). `runExtractionWorkflow` (`extraction-workflow.ts`) compares it
  against its own fingerprint right after claiming the item and before any
  Gemini/quota cost, and fails the item with `extract.err.storageMismatch`
  naming the mismatched field (`driver` / `bucket` / `path`) when they
  disagree. The field is optional on the job payload so anything already
  queued before this shipped keeps running unchecked.
- **Local compose**: both services share `UPLOADS_DIR=/app/uploads` and the
  named volume (`docker-compose.yml`) — the fingerprint matches by
  construction. **Railway split services**: both must set
  `STORAGE_DRIVER=railway` and the same `AWS_S3_BUCKET_NAME`
  (`railway.json` / `railway.worker.json` run the same image as separate
  services with independent env, no shared disk).

## Go-live

`docs/05_operations/go_live_checklist.md` is the single list: three gates
(runtime-role cutover, migration chain, worker heartbeat), the live Railway
service config versus `railway.json` / `railway.worker.json`, the per-service
env matrix, and the smoke pass. `/admin/health` renders the gates as checks.

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

### `src/lib/server/env-file.ts`

- The worker (`src/worker.ts`), the three `src/backfill-*.ts` scripts and `src/extraction-replay.ts` import this module first, in place of `dotenv/config` (issue #851). It calls Node 22's built-in `process.loadEnvFile()` and swallows only `ENOENT`, so a missing `.env` (the production containers, where Railway injects variables directly) is a no-op exactly as dotenv was, while a malformed file still throws. It has to be a module import, not a statement in the entrypoint: ESM evaluates imports before the entry body, and `env.ts` / `db.ts` read `process.env` at import time.
- Node's `--env-file` flag was not an option for these scripts: they run under `vite-node`, and `--env-file` is one of the flags Node refuses inside `NODE_OPTIONS`. `svelte.config.js`, `drizzle.config.ts` and the `scripts/*.mjs` utilities keep `dotenv`, since they are loaded by tooling whose flags we do not control.

## HTTP API endpoints

### `src/lib/server/env.ts`

**`const UPLOADS_DIR`**

- Server config reads `process.env` directly — no `$env/dynamic/private` anywhere in `src/`. With adapter-node the two are equivalent at runtime, and going straight to `process.env` is what lets every one of these modules be imported by the worker, which runs outside the Kit runtime (`vite.worker.config.ts` aliases only `$lib`). The standalone `env-dynamic-shim.ts` that used to bridge this is gone. Defaults to `'uploads'`.

**`function storageFingerprint` / `function storageFingerprintMismatch`**

- The cross-role half of the web/worker configuration contract (#1049, see this doc's Web/worker configuration contract section above). Takes explicit params defaulting to the module's own `STORAGE_DRIVER`/`UPLOADS_DIR`/`AWS_S3_BUCKET_NAME` so both sides — the web process stamping a job and the worker checking it — call the same function without either one reaching into the other's env. Deliberately excludes the AWS credentials: only the driver and the bucket/path name (never secret) travel in the fingerprint or the mismatch classification.

**`const EXTRACTION_STALL_WARN_MS`**

- Stall thresholds and the heartbeat interval are env-tunable because the right values depend on the deployment's Gemini latency and replica count, not on the code (#540). Defaults are documented in `DEPLOYMENT.md` → Tuning.

**`const STRIPE_PRICE_ID_STARTER`**

- Stripe price IDs per tier — set in your Stripe dashboard and env. This module is the only reader of `STRIPE_PRICE_ID_STARTER` / `_PRO` / `_BUSINESS` and the legacy `STRIPE_PRICE_ID`, and it trims them at export (issue #1075): `billing.ts` builds `TIERS` from these exports instead of re-reading `process.env`, so checkout, the webhook and the admin Stripe probe all see one value. A trailing newline pasted into the deploy console used to be trimmed by `billing.ts` and not here, which made checkout work while the probe reported the integration broken.

**`const WHATSAPP_ACCESS_TOKEN`**

- WhatsApp Cloud API bearer token.

**`const WHATSAPP_APP_SECRET`**

- App secret from Meta App Dashboard — used to verify `X-Hub-Signature-256` on inbound webhook POSTs. Without it, the webhook cannot authenticate Meta.

**`const WHATSAPP_API_VERSION`**

- Graph API version used for every Cloud API call (default `'v25.0'`). Meta expires each version roughly two years after release and calls to an expired one fail outright, so this is env-tunable: bumping it must not require a code change. See DEPLOYMENT.md.

**`const WHATSAPP_DISPLAY_NUMBER`**

- The bot's own number, in dialable form — this is what staff must message, and nothing else in the config carries it (`WHATSAPP_PHONE_NUMBER_ID` is an opaque Meta id). Without it the app cannot tell anyone where to send invoices (issue #319). Any input format works; it is normalised on read.
