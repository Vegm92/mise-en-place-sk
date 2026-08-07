# Production Sign-off Runbook (issue #200)

The release gate in #200 is blocked only on checks that require **real
third-party credentials in a staging environment**. Everything verifiable
without them is already covered by automated tests (see below). This runbook
is the mechanical checklist to clear the remaining three items and flip the
verdict to **READY FOR PRODUCTION**.

Env-var details live in [`DEPLOYMENT.md`](./DEPLOYMENT.md); this file lists
only the commands and the pass/fail criteria for each staging check.

## Already green (no action needed)

Run locally or in CI — no external credentials:

```bash
pnpm check            # 0 errors / 0 warnings
pnpm build            # web + worker compile
pnpm lint:no-sql-raw
pnpm lint:tenant-scope
DATABASE_URL=<any live pg> pnpm test   # DB-backed suites run automatically against a local/CI Postgres
```

Covered by committed regression tests: tenant isolation via `forTenant()`
(`tests/tenant-isolation.test.ts`), Stripe webhook signature→plan-update
(`tests/stripe-webhook.test.ts`), upload magic-byte + 20 MB validation
(`tests/upload-validation.test.ts`), password recovery
(`tests/password-recovery.test.ts`), profile management
(`tests/settings-profile.test.ts`), scheduled jobs + file purge
(`tests/scheduler.test.ts`), multi-location switching
(`tests/multi-location.test.ts`), and `/api/health` 200/503 logic
(verified manually against a live DB).

The gap-analysis blockers are closed in code and verified against a local
Postgres stack: password recovery (#284), the shared uploads
volume (#285), per-tier Stripe price IDs (#286), trial-expiry enforcement
(#287), pg-boss cron for digest/reminders/trial notices (#288), storage
deletion on account delete plus the retention purge (#289), and multi-location
switching (#290). What remains below still needs real third-party credentials.

---

## Staging checks (require real credentials)

Set the full `.env` from `.env.example` against the **staging** project first.
Apply migrations and confirm the schema landed clean:

```bash
pnpm db:migrate
# Railway Postgres carries no RLS: #373 dropped the pre-migration RLS policies,
# so both of these must come back empty (this is the post-migration state, not a
# failure). Tenant isolation is enforced in the app by forTenant() — see ADR-001.
psql "$DATABASE_URL" -c "SELECT tablename, policyname FROM pg_policies WHERE schemaname='public' ORDER BY 1,2;"
psql "$DATABASE_URL" -c "SELECT relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relrowsecurity ORDER BY 1;"
```
**Pass:** both queries return zero rows, and `SELECT count(*) FROM
information_schema.tables WHERE table_schema='public'` matches the replay
count recorded in #366.

### 1. Stripe checkout → webhook → plan update

```bash
export STRIPE_SECRET_KEY=sk_test_...
export STRIPE_PRICE_ID_STARTER=price_...   # + _PRO / _BUSINESS
export STRIPE_WEBHOOK_SECRET=whsec_...      # from `stripe listen` or the dashboard endpoint
pnpm dev            # and, in another shell:
stripe listen --forward-to localhost:5173/api/stripe-webhook
```
Then complete a **test-mode** checkout from `/billing` (card `4242 4242 4242 4242`,
any future expiry/CVC), or `stripe trigger checkout.session.completed`.

**Pass:**
- the webhook endpoint returns `200 {"received":true}`;
- `SELECT plan_tier, status FROM subscriptions WHERE restaurant_id=…` shows the
  purchased tier + `active`;
- `settings` has `plan_name` / `plan_quota` for that tier;
- a subscription-confirmation email is sent (Resend) or logged (`[email] no-op …`).

### 2. `STORAGE_DRIVER=railway` upload against a real bucket

```bash
export STORAGE_DRIVER=railway
export STORAGE_BUCKET=invoice-uploads      # create this bucket with `railway bucket create` first
export AWS_ENDPOINT_URL=... AWS_ACCESS_KEY_ID=... AWS_SECRET_ACCESS_KEY=...
export AWS_S3_BUCKET_NAME=invoice-uploads AWS_DEFAULT_REGION=... AWS_S3_URL_STYLE=...
pnpm dev
```
Upload a real PDF invoice through the UI.

**Pass:**
- the object appears in the `invoice-uploads` bucket;
- the batch page can fetch/preview the file back (`RailwayBucketDriver.read`);
- a >20 MB file and a content-spoofed file (e.g. `.pdf` with JPEG bytes) are both
  rejected client-visibly (validation is already unit-tested; this confirms it
  holds on the real driver path).

### 3. Gemini extraction + full happy path + health

```bash
export GEMINI_API_KEY=...
pnpm dev            # web
pnpm worker         # pg-boss consumer — REQUIRED, or extractions stay queued
```
Register → onboarding → upload invoice → extraction → review → confirm.

**Pass:**
- extraction completes and the confirmed invoice appears in `/invoices`;
- `curl -s -o /dev/null -w '%{http_code}' /api/health` → `200`, and the JSON
  shows `worker.reachable:true` (pg-boss schema provisioned + worker running);
- optional accuracy gate: `pnpm synth:bench:ci` (totals ≥ 80%).

---

## Verdict

When checks 1–3 pass in staging, update #200 to **READY FOR PRODUCTION** and
close it. If any check fails, capture the output on the issue — a failure here
is a real defect, not an environment gap.
