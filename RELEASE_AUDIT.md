# Release audit — Mise en Place SK

Audited: `main` @ `d9fe2c40` (2026-09-19). `origin/main` is one trivial PR ahead (`b8844f2a`, retires two redirect stubs, −111 lines). Local env: Windows 11, Node 22.23.2, local Postgres 18 (Spanish locale, superuser role). Mode: read-only. No prod secrets were read; Railway was queried only for service names, deployment status and logs.

## Verdict: NO-GO today

Production has not taken a successful deploy since 2026-09-11 and runs code from 2026-09-05; the latest deploy (2026-09-18) failed without even building; and the worker silently drops every scheduled email because `RESEND_API_KEY` is not set on it. The codebase itself is in good shape — the blockers are all in the deploy/config layer.

---

## 1. Baseline (what I ran, local vs CI)

| Step (CI order, `.github/workflows/ci.yml`) | Local result | Evidence |
|---|---|---|
| `pnpm install --frozen-lockfile` | OK, 20 s. Lockfile up to date; 120 packages refreshed locally (node_modules was stale, not the lockfile) | baseline1.log step 1 |
| `pnpm audit --prod --audit-level high` / full `pnpm audit` | 0 known vulnerabilities (both) | baseline1.log |
| 10 invariant lints (`no-sql-raw`, `tenant-scope`, `unscoped-query`, `action-authz`, `form-get-cast`, `json-body-schema`, `sql-row-cast`, `inline-styles`, `svelte-logic`, `migration-ordering --base origin/main`) | all exit 0 | baseline1.log |
| `lint:i18n`, `lint:no-comments`, `knip`, `check-duplication --base origin/main` | all exit 0; knip: 0 orphans | baseline1.log |
| `pnpm check` (svelte-check) | 3852 files, **0 errors, 0 warnings** | baseline1.log step `check` |
| `pnpm db:check-sync` | `drizzle/` in sync with `schema.ts`; 87 migrations, journal tail `0086_famous_blindfold` = local DB ledger (87 applied) | baseline1.log; `dbstate.mjs` |
| `pnpm test` — project `isolated` | **83 files / 1244 tests passed** | baseline2.log:1062 |
| `pnpm test` — project `shared` | 222 files passed, **7 failed (23 tests)**, 1 skipped; 3163 tests passed, 9 skipped | baseline2.log:3055 |
| `pnpm build` (web + worker) | OK, 36 s; `build/worker.js` 580 kB | baseline2.log:3681 |

Tests were run with `GEMINI_API_KEY`, `RESEND_API_KEY`, `STRIPE_*`, `SENTRY_AUTH_TOKEN`, `AWS_*`, `UPSTASH_*` blanked (no paid calls; CI also has none of these except `GEMINI_API_KEY`) and `REQUIRE_DB_TESTS=1` like CI.

**All 23 local failures are environment, not code** (verified against the failing assertions; CI on `main` is green — `gh run list`: `success` for `b8844f2a`, `d9fe2c40`, `0112d1b9`, `b3d49979` on 2026-09-19):
- 6 × Spanish Postgres error text: `tests/995-996-fk-indexes.test.ts:81` expects `/foreign key|violates/i`, got `«…» viola la llave foránea`; `tests/rls-runtime-role.test.ts` ×5 expects `/row-level security/i`, got `viola la política de seguridad de registros`. Note these prove the RLS policies **do** reject cross-tenant writes when the role is non-owner.
- 17 × local pool exhaustion: `PostgresError 53300 "ya tenemos demasiados clientes"` (`settings-alert-preferences`, `settings-categories`, `restaurant-name-single-source`) and the 5000 ms timeouts that follow (`extraction-workflow`, field-visibility).
- 1 skipped file: `tests/create-runtime-role.test.ts` (9 tests) — needs `psql` on PATH (`tests/create-runtime-role.test.ts:35`); CI runners have it.

**CI ↔ local gaps found**
- CI's `secret-scan` job (gitleaks in Docker, full history) was not reproduced (no Docker here). Substitute: `git log -p --all -G'<live-key patterns>'` over the whole history found only a docs sentence and a test placeholder (`whsec_…` in a test since replaced in PR #1131). See §6.
- The `eval-gate` job (real Gemini calls against `tests/golden/`) only runs on PRs touching extraction files; not run here.
- `.github/workflows/audit.yml` (daily `pnpm audit`) has **never run**: `gh run list --workflow audit.yml` → 0 runs.
- CI passes the real `GEMINI_API_KEY` secret to `pnpm test` (`ci.yml` "Unit tests" step) although every test mocks Gemini (`tests/llm-provider.test.ts:81`, `tests/chat-endpoint.test.ts:34`). Unneeded secret exposure to the test job.
- Local `.env` contains ` ALLOW_REMOTE_DB_TESTS=1` (leading space; dotenv still parses it). Harmless while `DATABASE_URL` is `127.0.0.1`, a footgun the day it is pointed at Railway.

---

## 2. BLOCKERS

### B1. Production is two weeks behind `main`, and deploys are failing
- **Evidence (Railway project `4ec65884…`, env `production`)**: web service `ccde17e9…` deployments: `f232c7b7` **FAILED** 2026-09-18 21:01Z, commit `6d4f371a` (merge of PR #1093) — Railway reports *"Deployment does not have an associated build"*, no deploy logs, diagnosis `null`; last SUCCESS `f031f8cb` 2026-09-11 on commit `f5e36409`; before that `95497337` FAILED 2026-09-05. Worker service `75eb8471…`: last SUCCESS `9ea6f50f` **2026-09-05** on commit `fbd050d0`.
- `f5e36409` and `fbd050d0` are both 2026-09-05 merges (#965, #967) and **are not ancestors of current `main`** (`git merge-base --is-ancestor` fails — history was rewritten after them). Since 2026-09-05: 295 commits, 51 merged PRs since 09-11. Migrations never applied in prod: web `0076`–`0086` (11), worker `0077`–`0086` (10). Queue contracts changed since the worker's commit: `src/lib/server/contracts/{extraction,products,whatsapp,account-cleanup}-contract.ts`, `queue.ts`, `schema.ts`.
- **Blast radius**: web and worker already run different code; the launch deploy would apply 11 migrations and two weeks of change in one shot, with a pipeline that currently fails.
- **Effort**: M. **Fix**: find why `f232c7b7` never built (Railway → deployment → Details; check the GitHub source connection/branch on both services), get one green deploy of `main` to **both** services now, then deploy continuously until launch.

### B2. The worker never sends email — `RESEND_API_KEY` is not set on the worker service
- **Evidence**: worker deploy logs, three consecutive days: `2026-09-17/18/19 06:30Z [email] no-op (RESEND_API_KEY not set): 1 albarán con incidencias — Nomada Beach Club → i***@gmail.com`, right after `[scheduler] overdue-reminders dispatched { scanned: 8, considered: 8, dispatched: 8 }`. Web service has 45 variables, worker 22. Code: `src/lib/server/email.ts:194` makes the send a no-op instead of failing; `src/lib/server/config.ts:14` `ROLE_CONTRACT_VARS` does not list `RESEND_API_KEY`, so the worker boots happily without it.
- **Blast radius**: weekly digest (`DIGEST_CRON` Mon 06:00), overdue reminders (daily 06:30), trial-expiry notices (daily 07:00) — `src/lib/server/tenant-notification-jobs.ts:22-24` — are dispatched for every tenant and delivered to nobody. Password-reset/verification mail comes from the web service and is unaffected.
- **Effort**: S. **Fix**: set `RESEND_API_KEY`, `EMAIL_FROM`, `COMPANY_*` on the worker; add `RESEND_API_KEY` to the worker role in `ROLE_CONTRACT_VARS` so boot fails loudly.

---

## 3. HIGH (will hurt in week one)

### H1. The hooks CSP header overrides SvelteKit's strict CSP and re-enables inline scripts (in `main`, not yet in prod)
- **Evidence**: `src/lib/server/request-policy.ts:269` sets `Content-Security-Policy: … script-src 'self' 'unsafe-inline' …` on every response *after* `resolve()` (`request-policy.ts:338-340`), replacing the hash-mode header from `svelte.config.js:13-48` (`script-src 'self' https://challenges.cloudflare.com`, `form-action`, `frame-src`, `worker-src blob:`). SvelteKit only inlines the CSP as a `<meta>` for prerendered pages, so on SSR pages the weaker header is the only one enforced. Landed in `b3d6ddc4` (2026-09-13, "enforce strict Content-Security-Policy in hooks"), i.e. after the `form-action` fix `11d17b7b` (2026-08-18) and after prod's current commit. The only test, `tests/hooks-server-handle-error.test.ts:84-93`, asserts just `default-src 'self'`.
- **Blast radius**: XSS mitigation drops to `'unsafe-inline'`; Turnstile script/iframe and Sentry Replay's blob worker are blocked if enabled; ships with the launch deploy.
- **Effort**: S. **Fix**: delete the CSP line in `applySecurityHeaders` (keep `svelte.config.js` as the single source) and pin a test that the response header contains a `sha256-` hash and no `'unsafe-inline'` in `script-src`.

### H2. Database-level tenant isolation is inert until `DATABASE_URL` is cut over to `mep_runtime` — status in prod UNVERIFIED
- **Evidence**: all 34 `restaurant_id` tables + `restaurants` have RLS enabled with one `tenant_isolation` policy each, none `FORCE`d (local DB `pg_class`/`pg_policies` query; `drizzle/0055`, `0057`, `0063`, `0078`). Table owners bypass non-forced RLS. `docs/06_decisions/tenancy/ADR-030-rls-runtime-role.md` (2026-08-28): *"production has **not yet cut `DATABASE_URL` over** to it; today it still connects as the owner in every environment."* `/admin/health` prints `RLS inert — runtime-role cutover pending (#464)` in that state (`src/lib/server/db-role.ts:47-49`). I did not read Railway variables, so today's state is unverified.
- **Blast radius**: app-level `forTenant().scope()` is the only boundary (it audits clean, §4), with no backstop.
- **Effort**: M. **Fix**: run `scripts/create-runtime-role.sql`, set `DATABASE_URL` (both services) + `DATABASE_MIGRATION_URL` (web) per `DEPLOYMENT.md` §"Runtime vs. migration database roles", confirm `/admin/health` shows `RLS active`, then revisit `FORCE`.

### H3. `/api/email-ingest/webhook` is behind the login wall — Resend can never reach it
- **Evidence**: `src/lib/server/request-policy.ts:283-294` `isPublicPath()` lists the Stripe and WhatsApp webhooks but not `/api/email-ingest/webhook`; `enforceAuth()` (`:129-141`) returns `401` for any unauthenticated `/api/*` path. The handler (`src/routes/api/email-ingest/webhook/+server.ts:78`) is correct on its own; `tests/email-ingest-webhook.test.ts:27` imports `POST` directly and never goes through the hooks. Also not in `API_RATE_LIMIT_EXEMPT`/`SYSTEM_CONTEXT_PATHS` (`:26-27`). `EMAIL_INGEST_ENABLED`, `EMAIL_INGEST_DOMAIN`, `RESEND_WEBHOOK_SECRET` are read (`src/lib/server/env.ts:65-67`) but absent from `.env.example` and `DEPLOYMENT.md`.
- **Blast radius**: none while `EMAIL_INGEST_ENABLED` is unset (`src/lib/server/email-ingest.ts:186`); the moment it is enabled the upload page advertises a per-tenant ingest address (`src/routes/(app)/+page.server.ts:53`) that never works.
- **Effort**: S. **Fix**: add the path to `isPublicPath()` and `API_RATE_LIMIT_EXEMPT`; add a hooks-level test; document the three env vars.

### H4. Sentry ships without source maps or a release in the Railway build, while raw `.map` files ship to the public
- **Evidence**: `Dockerfile:14-17` declares `ARG` only for `VITE_SENTRY_DSN`/`VITE_SENTRY_RELEASE`; `SENTRY_AUTH_TOKEN`/`SENTRY_ORG`/`SENTRY_PROJECT`/`SENTRY_RELEASE` never reach the build stage, so `vite.config.ts:30-35` runs with no token → my build printed `[sentry-vite-plugin] Warning: No auth token provided. Will not upload source maps … Will not create release`. The build emitted 166 client `.map` + 319 server `.map` files under `build/`, served publicly by adapter-node.
- **Blast radius**: first-week production errors arrive as minified traces with no release; app source is readable by anyone who fetches a `.map`.
- **Effort**: S. **Fix**: add the four `ARG`/`ENV` lines to the build stage (Railway passes service variables as build args), set `SENTRY_RELEASE`=`${{RAILWAY_GIT_COMMIT_SHA}}`, and set `sourcemaps.filesToDeleteAfterUpload` (or `build.sourcemap: false` for the client) so maps do not ship.

---

## 4. MEDIUM / LOW

- **M — Chat and weekly digest bypass the per-tenant cost ceiling and have no Gemini timeout.** `src/routes/(app)/api/chat/+server.ts:142` records usage but never calls `checkExtractionQuota` (`src/lib/server/llm-quota.ts:197-231`, the only place `monthlyCostLimitUsd` is enforced); no `AbortSignal`/`withTimeout` in chat, `chat-context.ts` or `weekly-digest.ts` (grep empty), unlike extraction (`extract.ts:516`). Fix: gate both on `checkExtractionQuota` and pass a `GEMINI_TIMEOUT_MS` abort signal. S.
- **M — Gemini model has a published shutdown date.** `GEMINI_MODEL` default `gemini-3.1-flash-lite` (`env.ts:40`) is listed *Stable* on ai.google.dev/gemini-api/docs/models, but ai.google.dev/gemini-api/docs/deprecations lists it: deprecated 2026-05-07, **shutdown 2027-05-07**, successor `gemini-3.5-flash-lite`. ~7 months of runway; `src/lib/server/llm-provider.ts:19-24` has no pricing row for the successor (falls back to $0.075/$0.30 → under-counts the cost ceiling) and the golden baseline is model-specific. Fix: add the pricing row now, schedule the model swap + `eval:accept-baseline` before Q1 2027. M.
- **M — Sentry Replay records 100 % of sessions.** `src/hooks.client.ts:14-16` `replaysSessionSampleRate: 1.0`. Quota burn and unnecessary capture surface in an app full of supplier/financial data (text is masked by default, but still). Fix: 0.05 session / 1.0 on-error. S.
- **M — No backup/restore runbook.** `DEPLOYMENT.md:356` says only "a backup policy for both the volume and the database"; no `pg_dump`/restore/PITR procedure anywhere in `docs/05_operations`. Railway Postgres backup status UNVERIFIED. Fix: enable Railway backups (or a nightly dump to the bucket) and do one timed restore drill. M.
- **M — Deployment docs miss required vars.** `APP_BASE_URL` is required in prod (`src/lib/server/config.ts:3-10`) but appears **0 times** in `DEPLOYMENT.md`; also absent there: `TURNSTILE_*`, `API_GLOBAL_RATE_LIMIT`, `COMPANY_*`, `STRIPE_FOUNDER_COUPON_ID`, `EMAIL_INGEST_*`. `.env.example` lacks 15 app vars read in code (`APP_TIMEZONE`, `DB_POOL_*`, `EXPORT_ROW_CAP`, `LIST_ROW_CAP`, `MEMBERSHIP_TIMEOUT_MS`, `LOAD_BLOCK_TIMEOUT_MS`, `SCHEDULED_FANOUT_CONCURRENCY`, `STRIPE_FOUNDER_PROMO_CODE`, `WORKER_LIVENESS_CHECK_MS`, `MIGRATION_WAIT_*`, `EMAIL_INGEST_*`, `RESEND_WEBHOOK_SECRET`). S.
- **M — Web/worker version skew is structural, not just B1.** Worker last deployed 09-05 while web deployed 09-11 from the same repo — suggests the worker service is not auto-deploying on `main`. Verify the source trigger on `75eb8471…`. S.
- **L — Railway dashboard vs config-as-code.** API reports builder `RAILPACK` and `Sleep when inactive: true` for the web service; build logs of `f031f8cb` show `load build definition from Dockerfile`, so `railway.json` is applied for the builder. Sleep is UNVERIFIED (an external probe hits `/` every minute, so it never sleeps in practice).
- **L — 146 `CREATE INDEX`, 0 `CONCURRENTLY`** across `drizzle/*.sql`; `preDeployCommand: pnpm db:migrate` (`railway.json`) holds locks while the old deployment still serves. Fine at launch data volume; no destructive statements in `0079`–`0086`.
- **L — Error page has no request id.** `src/routes/+error.svelte` never renders `X-Request-Id` (`request-policy.ts:270`), so support cannot correlate a user report with Sentry.
- **L — `log.ts` has no key-based redaction** (`src/lib/server/log.ts:47` serialises whatever fields callers pass); `email.ts` masks addresses, Sentry scrubs (`src/lib/sentry-scrub.ts:1-2`), nothing scrubs structured logs.
- **L — `Number(params.id)` without validation** in `recipes/[id]/*` (7 sites, e.g. `src/routes/(app)/recipes/[id]/+page.server.ts:52`) vs `requirePositiveIntId` elsewhere (`src/lib/server/route-params.ts:3`). Beta-flagged route.
- **L — Scheduled `audit.yml` never ran** (0 runs); the daily advisory catch it was added for (#1118) is not happening.
- **L — CI gives the unit-test job the real `GEMINI_API_KEY`** it does not need (§1).

---

## 5. Clean areas (evidence, then move on)

**Tenant isolation — clean.**
- Gates: `lint:tenant-scope`, `lint:unscoped-query`, `lint:action-authz` all 0 violations (`scripts/lint-invariants.mjs:50-55`, `:87-176`, `:186-352`). The gates only cover `.from(…)` reads and action bodies, so I added two scanners (scratchpad `mutscan.mjs`, `rawsqlscan.mjs`): **41 builder `update/delete` + 21 raw-SQL `UPDATE/DELETE` on the 32 tenant tables → 0 unscoped.** Three flagged and cleared by reading: `idempotency.ts:54,60` (age-based sweep of a system table), `invoice-save.ts:1036` (`supplierId` comes from `getOrCreateSupplierId(rid, …)` at `:1028`), `products.ts:1120/1165/1188` (`WHERE id = …` on an alias resolved by `WHERE restaurant_id = ${restaurantId}` at `:1106/:1157`).
- `restaurantId` is never taken from client input outside admin (grep: only `(admin)/admin/health/+page.server.ts:60`). Relational API used once, keyed by an owned batch item (`llm-quota.ts:200`).
- Every `[id]` route outside `(app)` compares ownership before returning: `api/batch-status/[id]/+server.ts:14`, `api/upload/[id]/[file]/+server.ts:24` (+ filename pinned to the item, `:28`); `/s/[token]` is keyed by a 24-byte random token (`digest-share.ts:11,15`) and IP-rate-limited. `active_restaurant` cookie is validated against membership (`request-policy.ts:92-94`; switch endpoint `api/active-restaurant/+server.ts:29-32`). 53 `tenant-scope-ok`/`tenant-check-ok` escapes, all admin rollups, retention jobs, or ownership-checked callers (list in `grep -rn tenant-scope-ok src`).
- DB: every `restaurant_id` table has a `restaurant_id`-led index; all 35 FKs to `restaurants` are `ON DELETE CASCADE` (local DB query). Onboarding creates tenants under `SET LOCAL app.admin` (`src/routes/onboarding/+page.server.ts:63`), so it survives the H2 cutover.
- Cross-tenant tests exist and are specific: `tests/tenant-isolation-routes.test.ts:179-199` (foreign batch refused, no data leak, every action discovered from the module), `tests/tenant-isolation.test.ts:55`, `tests/1074-billing-confirm-tenant.test.ts:99-122`, `tests/rls-runtime-role.test.ts` (policies reject cross-tenant writes under a non-owner role — the Spanish failures above are the proof), 34 test files touch another-tenant scenarios.

**Auth — clean; migration to Auth.js is complete.**
- `src/` has **zero** Supabase references; only history comments remain (`drizzle/0001_rls_policies.sql:5`, `drizzle/0038…:4`, `README.md:28-29`). Single stack: `SvelteKitAuth` JWT sessions 30 d (`src/lib/server/auth.ts:26`), Credentials+bcrypt and Google, `tokenVersion` revocation (`:50-57`). Cookie `httpOnly; sameSite=lax; secure` on HTTPS (`auth-session.ts:29-35`). CSRF: SvelteKit `checkOrigin` default (no `csrf` key in `svelte.config.js`) + Auth.js's own. Handle chain `sentryHandle → authHandle → createAppHandle → entitlementHandle` (`hooks.server.ts:63`); admin gated twice (hooks `:202-206` and `(admin)/+layout.server.ts:6`) — harmless. Every route in `ROUTE_POLICY` (`entitlements.ts:24-130`). Public/unauthenticated surface is the explicit list at `request-policy.ts:283-294` + `access-gate.ts:5-21`.
- Rate limits: login 10/IP + 5/email, signup 5/IP + Turnstile, recover 5/IP + 3/email, waitlist 5/IP + Turnstile, chat `CHAT_RATE_LIMIT_RPM` per tenant, upload 10/tenant, `/api/*` backstop 300/min, export 5, account delete 3 (§rate-limit grep, 56 call sites). Reset tokens are 32 random bytes, SHA-256 at rest, 1 h TTL, single use (`verification-token.ts:6-19`). Auth-critical limits fail closed when Redis is configured but unreachable (`.env.example` Upstash section, `rate-limiter-fail-closed.test.ts`).

**Invoice pipeline — clean.** Upload: extension allowlist `.pdf .jpg .jpeg .png .xml .zip`, 20 MB/file, 100 MB/request, ZIP ≤ 50 entries, magic-byte check, 1 KB minimum (`src/lib/upload-formats.ts:1-21`, `file-validation.ts:29-36`), `BODY_SIZE_LIMIT=128M` (`Dockerfile:37`). Quota: plan monthly quota + per-tenant USD cost ceiling checked before every extraction (`extraction-workflow.ts:93-126`, `llm-quota.ts:197-231`). Gemini: JSON schema response (`extract.ts:280-292`), abort on `GEMINI_TIMEOUT_MS` (`extract.ts:516`), transient retry with backoff (`extract.ts:469-477`), pg-boss `retryLimit 2 / backoff / expire 600 s / singletonKey=itemId` (`contracts/extraction-contract.ts:11-19`), retry only for rate-limit/unavailable/timeout/slot errors (`extraction-workflow.ts:60-65,137`), malformed JSON → `extract.err.malformedResult`/`notInvoice` (`:88-89`), dead-letter table + admin replay, web↔worker storage-fingerprint mismatch detection (`:322-332`). Double-submit: UUID idempotency keys claimed in the save transaction (`invoice-save.ts:1015`, `idempotency.ts:41`), optimistic-lock tests. Review: confidence bands 0.85/0.6 (`batch/[id]/+page.server.ts:53-55`), confirm blocked on low confidence with 422 (`:318`).

**Data — clean** apart from H2/backup: schema = migrations; no destructive statements after `0078`.

**Config & secrets — clean.** No live-key patterns in the full git history (`git log -p --all -G…`: only `.env.example` prose and a since-removed test placeholder); gitleaks job green on every `main` run; built client bundle contains no `sk_`, `whsec_`, `AIza`, `re_`, `AKIA` patterns; only `PUBLIC_TURNSTILE_SITE_KEY` and `VITE_SENTRY_*` are client-visible, by design (`Turnstile.svelte:4`, `hooks.client.ts:5-13`). `.dockerignore` excludes `.env*`, `uploads`, `.git`; `.gitignore` excludes `.env`, `/uploads/`, `CONTEXT.md`, `REFERENCES.md`, `.claude/`. Boot asserts `AUTH_SECRET, DATABASE_URL, STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, GEMINI_API_KEY, APP_BASE_URL` in production (`config.ts:3-10`) and refuses a spoofable `ADDRESS_HEADER` (`:55-63`).

**Ops — mostly clean.** Sentry initialised server (`hooks.server.ts:28-39`, PII scrub, `Redirect` filtered), client (`hooks.client.ts:9-19`), worker (`worker.ts:45-51`), release from env. `/api/health`: public `{status}` 200/503 on `SELECT 1`, detail for admin or `X-Health-Token` (`api/health/+server.ts:116-159`); Railway `healthcheckPath` set (`railway.json`). Error pages exist (`src/routes/+error.svelte`, `(app)/+error.svelte`). Webhooks verified: Stripe `constructEvent` + per-event idempotency + refuses in prod without secret (`billing.ts:743-776`), WhatsApp HMAC required when the token is set (`config.ts:43`), Resend HMAC/Svix (`email-ingest/webhook/+server.ts:15-42`). Scheduled jobs are real and running in prod: 13 crons + 3 per-tenant fan-outs (`scheduler.ts:37-62`), worker logs 09-17..09-19 show `mrr-snapshot`, `file-purge`, `analytics-refresh`, `dead-letter-purge`, `idempotency-sweep`, `orphan-subscriptions`, `overdue-reminders`, `trial-notices` all finishing. 0 HTTP 5xx on the web service in 7 days (Railway http logs, `status 500..599`).

**Product completeness — clean.** Analytics (`analytics/{spend,prices,extraction}` — 158/89/174 lines), price alerts (`alerts.ts` 1135, `price-deviations.ts` 289), budgets (`budgets/+page.server.ts` 120, behind the `budgets` beta flag, default off), payment reminders (`reminders/+page.server.ts` 82 + daily cron), weekly digest (`weekly-digest.ts` 129 + Monday cron + `/reports`), chat (`api/chat` 162, `chat-context.ts` 194, bounded actions). No `coming soon`/`stub`/`not implemented` strings; **0 `TODO/FIXME/HACK`** in `src`; 3 `console.log`, all server-side and intentional (`auth-seed.ts:66`, `email.ts:194`, `log.ts:47`); no demo data beyond i18n placeholders. **i18n: `en.ts` 2674 keys = `es.ts` 2674 keys, 0 missing either way.**

**Launch hygiene — clean.** Dependencies: 0 advisories. Legal pages: `/privacy` (392 w), `/terms` (302), `/cookies` (824), `/refunds` (845), `/legal` (816), parity test exists. GDPR: export (`api/user/export`, membership-scoped), delete with password re-auth, transactional cascade over the tenant data map + Stripe cancel + file deletion job (`api/user/delete/+server.ts:56-121`, `account-cleanup.ts`); soft-deleted invoice files purged after 30 days (`maintenance-jobs.ts:24-62`). Cookie consent gate exists (`cookie-consent`, `consent.test.ts`).

---

## 6. UNVERIFIED (and what unblocks each)

| Item | Why unverified | Unblock |
|---|---|---|
| Prod `DATABASE_URL` uses `mep_runtime` (H2); `ADDRESS_HEADER`/`XFF_DEPTH`, `SENTRY_DSN`, `STORAGE_DRIVER=railway` + `AWS_*` on **both** services, `UPSTASH_*`, `TURNSTILE_*` | I did not read Railway variable values | `/admin/health` role line; `railway variables --service worker --kv \| cut -d= -f1` (names only) |
| Root cause of failed deploy `f232c7b7` | Railway returns no build, no logs, no diagnosis | Railway dashboard → deployment → Details/Config; check the worker's source trigger too |
| Railway Postgres backups / retention | Not exposed via the tools I used | Railway → Postgres → Backups |
| Web `sleepApplication` actually `false` | Dashboard says `true`; config-as-code should override | Deployment → Config tab |
| gitleaks over full history | No Docker locally | `docker run … gitleaks detect --log-opts=HEAD` (same as CI) |
| Golden-set eval gate on the current prompt | Real Gemini calls; not run | `pnpm eval:gate` with a real key |
| Effective CSP / `form-action` in a real browser | Only code read; no browser run | Deploy H1 fix, then click Google login / Stripe checkout in Chrome |
| Worker boot warnings (`[env]`, `[hooks]`) in prod | Outside Railway log retention (worker booted 09-05) | Redeploy worker (B1) and read the first 50 deploy log lines |

---

## 7. Four-week burn-down (by risk, not ease)

**Week 1 — make prod deployable and honest**
1. B1: fix the deploy pipeline; ship `main` to web **and** worker; verify migrations `0076`–`0086` applied (`/admin/health` migration ledger) and that both services report the same commit. Keep auto-deploy on.
2. B2: worker `RESEND_API_KEY`/`EMAIL_FROM`/`COMPANY_*`; add `RESEND_API_KEY` to the worker contract in `config.ts`; watch one 06:30 UTC reminder run actually send.
3. H1: remove the CSP line in `request-policy.ts`, pin a hash-based CSP test, click-test Google/Stripe/Turnstile flows in a browser.
4. H3: make the email-ingest webhook public + rate-exempt; document `EMAIL_INGEST_*`/`RESEND_WEBHOOK_SECRET`.

**Week 2 — close the isolation and observability gaps**
5. H2: create `mep_runtime`, cut `DATABASE_URL` over on both services with `DATABASE_MIGRATION_URL` on web, confirm `RLS active`, keep the documented rollback (`DEPLOYMENT.md` step "reverses step 2") one command away.
6. H4: Sentry build args + release tag + stop shipping `.map` files; confirm a test error shows unminified frames.
7. Backups: enable Railway backups, run one restore drill into a scratch database, write the runbook.
8. Fill `DEPLOYMENT.md` / `.env.example` gaps (`APP_BASE_URL`, `TURNSTILE_*`, `EMAIL_INGEST_*`, `API_GLOBAL_RATE_LIMIT`, pool/timeout vars).

**Week 3 — cost and quality guards**
9. Chat/digest: cost-ceiling gate + Gemini abort timeout.
10. Gemini: add `gemini-3.5-flash-lite` pricing row; schedule the model swap + `eval:accept-baseline` for early 2027; keep `GEMINI_MODEL` env-driven.
11. Replay sampling to 0.05; error page shows the request id; log redaction for `email`/`token` keys; `audit.yml` first manual run.

**Week 4 — freeze and prove**
12. Full CI parity locally on the release commit, `pnpm qa:sweep` against a Railway preview, one end-to-end run: upload → extraction → review → confirm → digest email received, on the deployed build, as a non-admin tenant.
13. Re-run this audit's UNVERIFIED table; go/no-go on B1/B2/H1/H2 all closed.
