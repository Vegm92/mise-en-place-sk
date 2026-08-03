# Pre-Launch Gap Analysis

Date: 2026-07-24 · Scope: full repository review (routes, server modules, schema/migrations, deployment artifacts, CI) against feature completeness, edge cases/data integrity, security/auth, and production readiness.

> **Status (2026-07-25).** This is the point-in-time analysis; the findings are
> tracked as GitHub issues and most are now closed in code. Resolved here:
> 🔴 1 password recovery (#284), 2 proxy client IP (#223), 3 shared uploads
> volume (#285), 4 per-tier Stripe price IDs (#286), 5 trial enforcement
> (#287); 🟡 6 scheduled jobs (#288), 7 storage deletion + retention purge
> (#289), 8 multi-location (#290), 9 apex landing (#291), 10 docs drift (#292),
> 11 profile management (#293), 12 upload i18n (#294); and the 🟢 polish bundle
> (#295) except the noted single-instance and health-check items, which are
> deployment choices rather than code. Still open by design: DB-level RLS
> enforcement for the app role (#222) and edge/volumetric protection (#224),
> both of which need infrastructure decisions, and the staging sign-off (#200).

**Overall assessment:** the codebase is unusually mature for a pre-launch product — tenant isolation is enforced at query level *and* by Postgres RLS with a CI lint (`lint:tenant-scope`), Stripe webhooks have signature verification + event dedup + out-of-order protection, uploads have magic-byte validation, quota claims are race-safe (`INSERT … ON CONFLICT … WHERE used < limit`), CSP/HSTS/security headers are set, error pages exist at both layout levels, and there are ~400 tests. The gaps below are the residual items that would actually hurt on launch day, ordered by severity.

---

## 🔴 Critical Blockers

### 1. No password recovery flow — users who forget their password are permanently locked out
- **Where:** `src/routes/login/+page.svelte` / `+page.server.ts`, `src/routes/(app)/settings/`
- **Current:** Email/password auth via Supabase exists (`signInWithPassword`, `signUp`), but there is **no** "forgot password" link, no reset-password route, and no call to `supabase.auth.resetPasswordForEmail` or `auth.updateUser` anywhere in `src/`. Settings has no change-password/change-email either.
- **Should be:** a `/forgot-password` page → `resetPasswordForEmail(email, { redirectTo: /auth/callback?next=/reset-password })` → a recovery-session page with a new-password form; plus change-password in `/settings`. Until then the only recovery path is an admin manually resetting credentials in the Supabase dashboard.

### 2. IP-keyed rate limits collapse to a single shared bucket behind the reverse proxy
- **Where:** `src/routes/login/+page.server.ts:25` (`login:ip:` 10/min), `signup/+page.server.ts:22` (5/min), `waitlist/+page.server.ts`, `(app)/api/chat`, `api/trend`, `api/stock-levels`, `api/notifications` — all keyed on `getClientAddress()`.
- **Current:** With `@sveltejs/adapter-node`, `getClientAddress()` returns the **socket peer address** unless `ADDRESS_HEADER=x-forwarded-for` (and `XFF_DEPTH`) are set. `DEPLOYMENT.md` explicitly tells operators to terminate TLS at nginx/Caddy, but neither `ADDRESS_HEADER` nor `XFF_DEPTH` appears in `DEPLOYMENT.md`, `.env.example`, `Dockerfile`, or `docker-compose.yml`. In that topology every request arrives "from" the proxy IP: the **6th signup and 11th login attempt per minute across your entire user base returns 429**. Launch-day signup traffic will trip this within minutes, and conversely per-attacker lockout protection is void.
- **Should be:** document + set `ADDRESS_HEADER=x-forwarded-for` / `XFF_DEPTH=1` for proxied deployments (docker-compose `environment:`, DEPLOYMENT.md table); optionally warn at boot when `NODE_ENV=production` and `ADDRESS_HEADER` is unset.

### 3. `docker-compose.yml` breaks local-storage uploads: no shared volume between web and worker, no persistence
- **Where:** `docker-compose.yml` (no `volumes:` at all), `Dockerfile`, `src/lib/server/storage.ts` (`STORAGE_DRIVER=local` default, `UPLOADS_DIR=uploads` relative path)
- **Current:** web and worker are **separate containers with separate filesystems**. With the default `STORAGE_DRIVER=local`, the web container saves the upload to its own FS; the extraction worker then tries to read the same key from *its* FS → **every extraction fails "file not found"** in the documented VPS topology. Independently, with no volume mount, all invoice files are destroyed on `docker compose up --build` / container recreation — directly contradicting DEPLOYMENT.md's own "UPLOADS_DIR MUST be on a persistent volume" warning. The same trap applies to the "two services on Railway/Render/Fly" advice.
- **Should be:** a shared named volume mounted at `/app/uploads` in **both** services (and `UPLOADS_DIR=/app/uploads`), or make `STORAGE_DRIVER=supabase` the required/default setting for any split-process deployment and say so loudly in DEPLOYMENT.md.

### 4. Paid-tier checkout is broken if you configure Stripe per the docs (`STRIPE_PRICE_ID_*` undocumented)
- **Where:** `src/lib/server/billing.ts:63–75,181`, `src/lib/server/env.ts:14–16` vs `.env.example:52–58` and `DEPLOYMENT.md` (Billing table)
- **Current:** the code requires per-tier `STRIPE_PRICE_ID_STARTER / _PRO / _BUSINESS` (only Starter falls back to the legacy `STRIPE_PRICE_ID`), but both `.env.example` and `DEPLOYMENT.md` document **only** `STRIPE_PRICE_ID`. An operator following the runbook gets: Pro/Business checkout throws `STRIPE_PRICE_ID_PRO not configured` (a 500 from the billing form action) — 2 of 3 paid tiers dead. Worse, `tierFromPriceId()` (billing.ts:81) can't match an unconfigured price ID and **falls back to `'starter'`**, so a webhook for a real Pro/Business subscription would record the wrong tier and apply a 100-invoice quota to a €199/mo customer.
- **Should be:** add the three variables to `.env.example` + DEPLOYMENT.md; log an error (not silently fall back) when a webhook carries an unknown price ID.

### 5. Trial expiry is never enforced — the 30-day trial is actually "free forever"
- **Where:** `src/lib/server/billing.ts:118` (`isAccessAllowed`), only consumer is `src/routes/(app)/billing/+page.server.ts:28` (display banner)
- **Current:** nothing gates uploads, extraction, or app access on `status === 'trialing' && trialEndsAt < now()`. After day 30 a trial tenant keeps full access at the trial quota (20 invoices/month) indefinitely. The `trial_expiry` email template exists (`email.ts:132`) but has **zero callers** — nobody is ever told their trial ended, and nothing nudges them to pay.
- **Should be:** an explicit product decision, then enforcement: either block the upload action (redirect to `/billing`) and grey out AI features when `!isAccessAllowed(...)`, or consciously accept a freemium tier and update the pricing copy. Either way, wire the trial-expiry email (see #6).

---

## 🟡 Important Gaps

### 6. No scheduled execution: digests, payment reminders, trial/quota emails only fire on page visits — or never
- **Where:** `src/lib/server/weekly-digest.ts` (generated on dashboard visit), `src/lib/server/email.ts` (`trial_expiry`, `overdue_invoice`, `weekly_digest` templates), DEPLOYMENT.md ("cron wiring is tracked in #100")
- **Current:** the weekly digest is only generated when a user opens the dashboard; overdue-invoice and trial-expiry emails are templates with no send path. Reminder emails matter precisely for users who *stopped* opening the app — those users get nothing.
- **Should be:** pg-boss is already in the stack and supports cron scheduling (`boss.schedule`) — wire a scheduled job in `src/worker.ts` for digest generation + reminder/trial emails before launch, or remove the promise from product copy.

### 7. Deleting an invoice or an entire account leaves the uploaded files in storage forever
- **Where:** `src/routes/api/user/delete/+server.ts` (DB cascade only), `src/routes/(app)/invoices/+page.server.ts:136` (soft delete, file untouched). Only the batch-discard path deletes files (`batch/[id]/+page.server.ts:213`).
- **Current:** account deletion is marketed as GDPR deletion (it even cancels Stripe immediately, #246) but the invoice PDFs/photos — the most sensitive artifacts — persist in `UPLOADS_DIR`/the bucket with no owner row pointing at them. Also unbounded storage growth.
- **Should be:** on account delete, enumerate the tenant's `file_key`s and delete from storage before dropping rows; add a purge job for files of soft-deleted invoices past a retention window.

### 8. Business tier sells "up to 5 locations" but there is no way to switch or add restaurants
- **Where:** `src/hooks.server.ts:67` reads the `active_restaurant` cookie — **nothing anywhere writes it**; no UI to create a second restaurant or switch between memberships (`user_restaurants` supports it; onboarding creates exactly one).
- **Current:** a multi-location user is pinned to their first membership forever; the `multiLocation` feature flag (billing.ts:76) gates nothing.
- **Should be:** a restaurant switcher (set the cookie + reload) and an "add location" flow gated on the Business tier — or drop the multi-location claim from the tier copy at launch.

### 9. Unauthenticated visit to the apex `/` bounces to the login wall, not the landing page
- **Where:** `src/hooks.server.ts:124` (`isPublicPath` — `/` is not public), `src/routes/(app)/+page.server.ts` (root = upload page)
- **Current:** marketing lives at `/waitlist`; anyone hitting `https://yourdomain.com/` logged-out gets `303 → /login?redirectTo=%2F`. Launch traffic, ads, and shared links to the bare domain land on a login form with no signup/marketing context.
- **Should be:** redirect anonymous `/` to `/waitlist` (or promote the landing to `/`), keeping authenticated `/` as the upload page.

### 10. Deployment/docs drift that will cause real launch mistakes
- **Where / current:**
  - `DEPLOYMENT.md:113` claims "HSTS/CSP not yet set at app level (#104)" — both **are** set now (`hooks.server.ts:115–119`, `svelte.config.js` CSP block). An operator may bolt on a second, conflicting CSP at the proxy.
  - `README.md:87–89` links `PRE_RELEASE_AUDIT.md`, `PLAN_DE_NEGOCIO.md`; §80 references `EINVOICING_READINESS.md` — none of these files exist in the repo.
  - `README.md:27` says RLS lives in `0002_rls_policies.sql`; the actual file is `drizzle/0001_rls_policies.sql`.
  - `DEPLOYMENT.md` env tables omit: `STRIPE_PRICE_ID_*` (see #4), all four `WHATSAPP_*` vars, `UPSTASH_REDIS_REST_*`, `STORAGE_DRIVER`/`STORAGE_BUCKET`.
  - `PRODUCTION_SIGNOFF.md` references `STRIPE_PRICE_ID_STARTER` etc. — the one doc that's right; align the others with it.
- **Should be:** one doc pass before launch; the runbooks are otherwise good enough that people will actually follow them.

### 11. No profile management at all
- **Where:** `src/routes/(app)/settings/+page.server.ts` (thresholds, tutorial reset, export, delete — nothing else)
- **Current:** a user cannot change their display name, email, or password (see #1), nor rename their restaurant after onboarding. Data export (`/api/user/export`) and account deletion are implemented and solid.
- **Should be:** minimal profile section: name/email/password change (Supabase `auth.updateUser`) + restaurant rename.

### 12. Upload happy path mixes hardcoded English and Spanish outside the i18n system
- **Where:** `src/routes/(app)/+page.server.ts` — English-only: "No valid files received…" (:71), "File(s) exceed the 20 MB limit…" (:78), "File save failed…" (:112); Spanish-only: the quota-exceeded messages (:96–98). Also `billing.ts:317` `'tu restaurante'`.
- **Current:** the app is rigorously bilingual everywhere else (`src/lib/i18n.ts` with ~1000 keys per locale); these user-facing strings bypass it.
- **Should be:** return i18n keys (the failed-extraction path already does exactly this: `'extract.err.quotaExceeded'`) and translate in the page.

---

## 🟢 Technical Debt & Polish

1. **Repo hygiene:** `coverage/` (full HTML report + `coverage-final.json`), `dev-server.log`, `dev-server-test.log`, `screenshots/`, and the ~30-file `mise-en-place/` design-mockup folder are committed and not git-ignored. Logs in git can leak local paths/ports; coverage bloats every clone. Add to `.gitignore` and `git rm -r --cached`.
2. **Two lockfiles:** both `pnpm-lock.yaml` and `package-lock.json` are committed (plus `synth/package-lock.json`). CI uses pnpm; delete the npm lockfile to prevent silent dependency drift.
3. **Worker DB TLS:** `src/worker.ts:54` uses `ssl: { rejectUnauthorized: false }` (explicitly skips certificate verification) while the web process uses `ssl: 'require'`. Consistent, verified TLS (Supabase CA) would close a MITM window on the worker's direct connection.
4. **Unknown Stripe price → silent 'starter':** `tierFromPriceId` (billing.ts:81–87) downgrades any unrecognized price ID to starter with no log. A price rotation in the Stripe dashboard would silently misquota paying customers. Log at error level + Sentry.
5. **Inconsistent quota fallbacks:** layout shows `quotaLimit … ?? 150` when no `plan_quota` row exists (`(app)/+layout.server.ts:103`) while the upload gate treats a missing row as *unlimited* (`(app)/+page.server.ts:27`) and `applyTierSettings` writes `99999` for unlimited (billing.ts:96). Harmless today (onboarding always writes a row) but three different "no quota" semantics is a bug factory.
6. **Single-instance constraints** (in-memory rate-limit fallback, in-process extraction semaphore, local upload sessions) are well documented; just ensure the launch platform genuinely runs 1× web + 1× worker, and set the Upstash vars if that ever changes.
7. **Health check doesn't cover the queue consumer end-to-end:** `/api/health` reports `worker.reachable` via pg-boss schema/queue depth, which is good; consider alerting on queue-depth age (oldest queued job > N min) to catch a wedged-but-alive worker.
8. **`.env.example` admin defaults:** ships `AUTH_ADMIN_PASSWORD=changeme` — production boot refuses it (good, `auth-seed.ts`), but consider also refusing `AUTH_ADMIN_EMAIL=admin@example.com` to avoid a seeded admin with an unroutable email.
9. **Legacy route stubs** `/confirm/[id]` and `/extract/[id]` correctly 303 to `/batch/[id]` or home — no dead ends found there; the only remaining TODOs in `src/` are two CSS-cleanup notes in `app.css`.

---

## What was checked and found solid (no action needed)

- **Tenant isolation:** `forTenant().scope()` used everywhere (enforced by `lint:tenant-scope`), with dedicated enforcement tests (`tenant-isolation.test.ts`). Postgres RLS policies existed only to gate the (now-retired) Supabase Data API path and were dropped as part of the Railway Postgres migration — see `drizzle/0001_rls_policies.sql`.
- **Auth guard:** `hooks.server.ts` validates the JWT per request (`getUser()`, not just the cookie), 401s API routes, redirects pages, double-guards `/admin` at hook + layout level.
- **Webhooks:** Stripe — signature verification failing closed in production, event-ID dedup table with claim-release on failure, `lastEventAt` out-of-order protection. WhatsApp — HMAC `X-Hub-Signature-256` with timing-safe compare, fails closed in production.
- **Race conditions:** advisory lock + idempotency key on Stripe customer creation; race-safe monthly quota claim; partial unique index on `(restaurant_id, content_hash) WHERE deleted_at IS NULL` for duplicate saves; `processed_requests` idempotency table; migration `0013` even repairs pre-existing collisions before adding the constraint.
- **Upload validation:** 20 MB cap + magic-byte content sniffing, unit-tested; per-tenant upload rate cap; plan-quota gate *before* Gemini spend, with slot release on failed extraction.
- **Error handling:** root and `(app)` `+error.svelte`, `ErrorBoundary` component, `handleLoad` guard wrapper, Sentry on web + worker with PII scrubbing (`sentry-scrub.ts`) and email masking in logs; worker converts crashes to non-zero exits for supervisor restart.
- **Headers:** CSP (hash mode, `frame-src 'self'` for the PDF preview), HSTS, X-Frame-Options with a deliberate same-origin carve-out for the two iframe routes, nosniff, referrer and permissions policies.
- **SQLite concerns from the brief:** N/A — the data layer is Supabase Postgres via Drizzle; migration safety is handled with plain-SQL migrations including data-repair steps.
