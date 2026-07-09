# Production Sign-off Runbook (issue #200)

The release gate in #200 is blocked only on checks that require **real
third-party credentials in a staging environment**. Everything verifiable
without them is already covered by automated tests (see below). This runbook
is the mechanical checklist to clear the remaining four items and flip the
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
DATABASE_URL=<any live pg> pnpm test   # 399 passed / 17 skipped (the 17 need hosted Supabase)
```

Covered by committed regression tests: DB-level RLS enforcement
(`tests/rls-enforcement.test.ts`), Stripe webhook signature→plan-update
(`tests/stripe-webhook.test.ts`), upload magic-byte + 20 MB validation
(`tests/upload-validation.test.ts`), and `/api/health` 200/503 logic
(verified manually against a live DB).

---

## Staging checks (require real credentials)

Set the full `.env` from `.env.example` against the **staging** project first.
Apply migrations and confirm RLS is deployed:

```bash
pnpm db:migrate
# Confirm the RLS policies from drizzle/0001_rls_policies.sql exist on the live DB:
psql "$DATABASE_URL" -c "SELECT tablename, policyname FROM pg_policies WHERE schemaname='public' ORDER BY 1,2;"
```
**Pass:** every business table (suppliers, invoices, invoice_line_items, …)
lists at least one policy; `restaurants` and `user_restaurants` have theirs.

### 1. Hosted-Supabase test suites (unblocks the 17 skips)

```bash
export DATABASE_URL=<staging direct connection>          # db.<ref>.supabase.co
export SUPABASE_URL=https://<ref>.supabase.co
export SUPABASE_ANON_KEY=eyJ...
export SUPABASE_SERVICE_ROLE_KEY=eyJ...
export REQUIRE_DB_TESTS=1        # turns "skip" into a hard failure if creds are wrong
pnpm test
```
**Pass:** `supabase-auth` (10) and `supabase-connection` (7) now run and pass;
skip count drops to 0. `REQUIRE_DB_TESTS=1` guarantees they didn't silently skip.

### 2. Stripe checkout → webhook → plan update

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

### 3. `STORAGE_DRIVER=supabase` upload against a real bucket

```bash
export STORAGE_DRIVER=supabase
export STORAGE_BUCKET=invoice-uploads      # create this bucket in Supabase Storage first
export SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=...
pnpm dev
```
Upload a real PDF invoice through the UI.

**Pass:**
- the object appears in the `invoice-uploads` bucket;
- the batch page can fetch/preview the file back (`SupabaseStorageDriver.read`);
- a >20 MB file and a content-spoofed file (e.g. `.pdf` with JPEG bytes) are both
  rejected client-visibly (validation is already unit-tested; this confirms it
  holds on the real driver path).

### 4. Gemini extraction + full happy path + health

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

When checks 1–4 pass in staging, update #200 to **READY FOR PRODUCTION** and
close it. If any check fails, capture the output on the issue — a failure here
is a real defect, not an environment gap.
