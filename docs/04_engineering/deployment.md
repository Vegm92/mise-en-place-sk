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

See `DEPLOYMENT.md` for the authoritative list. High-severity: `DATABASE_URL`,
`AUTH_SECRET`, `GEMINI_API_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`
(prod required), `WHATSAPP_ACCESS_TOKEN` + `WHATSAPP_PHONE_NUMBER_ID` +
`WHATSAPP_VERIFY_TOKEN` + `WHATSAPP_APP_SECRET` (prod), `RESEND_API_KEY`,
`SENTRY_AUTH_TOKEN`, `PUBLIC_APP_URL`, `AUTH_ADMIN_EMAIL`. Optional:
`UPSTASH_REDIS_REST_*`, `AWS_*` (buckets), `PLAN_PRICE_*_EUR`,
`LLM_MODEL`, `EXTRACTION_*` overrides.

## CI gate

`.github/workflows/ci.yml` runs lint → check → db:check-sync → migrate → tests
→ build (see `docs/04_engineering/testing_strategy.md`). A deploy that hasn't
passed this must not ship.

## Rollback

- App: redeploy previous container/commit.
- Migrations: forward-fix preferred; data migrations must be additive +
  idempotent (see `database_changes.md`).
- Webhooks: Stripe/Meta redeliver on failure — keep the dedup tables intact.
