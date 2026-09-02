---
tags: [mep, engineering]
related: "[[CONTEXT]]"
---

# Security Rules

Security model as actually implemented, plus what agents must never bypass.
Immutable subset is in `docs/00_system/architectural_invariants.md`.

## Authentication

- Auth.js JWT sessions (`src/lib/server/auth.ts`): Credentials (bcrypt,
  cost 12) + Google OAuth; JWT sealed with `AUTH_SECRET`.
- `hooks.server.ts` resolves `locals.user` from the session; public paths are
  whitelisted; unauthenticated `/api/*` → 401 JSON, pages → redirect to login.
- Admin: `isAdminUser()` (`AUTH_ADMIN_EMAIL`, comma-split) gates `/admin/*`.
- Password reset / email verify: single-use tokens (1 h TTL, delete-on-consume),
  enumeration-resistant ("always sent").

## Authorization / tenant isolation

- `locals.restaurantId` derived per request from `user_restaurants` membership
  and the `active_restaurant` cookie — **re-validated on every switch**.
- All business queries scoped by `forTenant().scope()` (ADR-001) — the
  primary, always-active boundary. Enforced by lint gates +
  `tests/tenant-isolation*.test.ts`.
- Database-enforced backstop (ADR-030, #222): Postgres RLS policies
  (`drizzle/0055_rls_tenant_isolation.sql`) on every table in
  `src/lib/server/tenant-data-map.ts`, keyed on the `app.restaurant_id` /
  `app.admin` session GUCs `src/lib/server/tenant-context.ts` sets per
  request/job. ENABLE, not FORCE — the owner role every environment still
  connects as bypasses it entirely; it only restricts the scoped
  `mep_runtime` role from #464, and only once production's pending cutover
  (DEPLOYMENT.md) moves `DATABASE_URL` off the owner role. Held in place by
  `tests/rls-runtime-role.test.ts`.
- Role checks for owner-only actions (billing, WhatsApp pairing, locations).

## Input validation

- Public/unauthenticated form actions (`signup`, `login`, `forgot-password`,
  `reset-password`, `waitlist`) derive their typed input from a `valibot`
  schema instead of casting `FormData.get()` with `as` (issue #844): `as
  string` lies to the type checker — `FormData.get()` genuinely returns
  `string | File | null`, and a client that posts a file part under a string
  field name either throws (a string method called on a `File`) or flows the
  `File` onward untyped. `publicFormAction`'s `schema` option
  (`src/lib/server/public-form-action.ts`) parses the form and returns
  `fail(422, { error: 'invalid' })` on a schema violation before the handler
  ever runs; `parseForm()` is the same primitive for the one route that
  doesn't go through `publicFormAction` (`reset-password`, which
  deliberately carries no rate limit). `scripts/lint-invariants.mjs`'s
  `form-get-cast` gate (`pnpm lint:form-get-cast`) bans new `form.get(...) as
  `/`formData.get(...) as ` casts in `+page.server.ts` files, ratcheted by an
  allowlist of the pre-existing offenders it does not yet cover — see that
  gate's own comment for how to shrink the allowlist as more routes convert.
- Everywhere else: hand-rolled per endpoint — type casts, trim/lower, length
  caps, whitelist checks. No zod — keep validation explicit and local. This
  migration did not touch the authenticated `(app)` shell's actions.
- Open-redirect protection: `safeRedirect` rejects `//` and `/\` prefixes.
- File upload: extension whitelist + magic-byte validation + 20 MB cap
  (ADR-016); path-traversal guards on every file read.

## AI security

- Restaurant data is data, never instructions: chat/digest embed the DB
  snapshot as a fixed block with an ignore-instruction warning (ADR-018).
- No dynamic SQL for the chatbot; LLM output is JSON-parsed + validated.
- Extraction never becomes financial truth without confirmation
  (low-confidence gate + content-hash gate).

## Stripe security

- Webhook signature verified via `constructEvent`; production throws when the
  secret is unset.
- `idempotency_keys` (`stripe-webhook` scope) dedup; claim released on handler
  error so Stripe retries.
- Entitlement comes from the DB `subscriptions` row, never from client claims.

## WhatsApp security

- GET challenge vs `WHATSAPP_VERIFY_TOKEN`; POST HMAC-SHA256 vs
  `x-hub-signature-256` via `timingSafeEqual`.
- Phone number = tenant key (ADR-019); pairing is owner-initiated, 6-char
  codes, 15-min TTL, rate-limited, single-redeem.
- `idempotency_keys` (`whatsapp` scope) dedup prevents double-processing.

## Rate limiting

- `rate-limiter.ts`: Upstash sliding window when configured, in-memory token
  bucket otherwise (single-instance warning).
- Key scoping is structural, not per-site judgment (ADR-029, #440):
  `rateLimitScoped()` (`rate-limit-scope.ts`) takes `scope: 'tenant' | 'user'`
  explicitly — tenant for paid/metered capacity and shared tenant resources
  (chat's Gemini budget, the product/supplier-category/unit-conversion
  catalogs, bulk actions, uploads, exports), user for per-person safety
  limits and personal dashboards (password-change, account-delete/export,
  switch-restaurant, notifications, stock-levels, trend). A handful of
  non-authenticated or non-web-identity guards stay on `checkRateLimit()`
  directly (health's IP key, the WhatsApp phone-keyed guards, the global
  `/api/*` gateway fallback, the dual-keyed email-change) — see ADR-029 for
  the full list and reasons. `tests/rate-limit-scope-enforcement.test.ts`
  fails the build on a new direct `checkRateLimit()` call outside that list.
- In-memory buckets swept every 2 min; concurrency semaphore for extraction.

## Security headers (every response)

- `X-Frame-Options`: `SAMEORIGIN` only for `/api/upload/*` and
  `/invoice/[id]/file` (PDF `<iframe>`), `DENY` elsewhere.
- `X-Content-Type-Options: nosniff`; `Referrer-Policy: strict-origin-when-cross-origin`;
  `Permissions-Policy: camera=(), microphone=(), geolocation=()`;
  `Strict-Transport-Security` (unconditional).
- CSP (hash-mode) in `svelte.config.js`: `frame-src 'self'` for the PDF
  preview, form-action restricted.

## Secrets

- Env-only: `AUTH_SECRET`, `STRIPE_SECRET_KEY`, `WHATSAPP_ACCESS_TOKEN`,
  `GEMINI_API_KEY`, `RESEND_API_KEY`, `SENTRY_AUTH_TOKEN`, `AWS_*`.
- `.env.example` documents placeholders; live keys never committed.
- Admin seed refuses default password/`@example.*` email in production.
- Dead-letter payload redaction strips secrets/emails (`dead-letter.ts`).

## Logging / PII

- Email masking in logs; GDPR: `/api/user/delete` (owner) and
  `/api/user/export` are rate-limited and tenant-aware.
- Sentry scrubs via `sentry-scrub.ts`; user consent recorded (`user_consents`).

## Known security debt / watch-items

- `DATABASE_SSL_MODE=require` with `rejectUnauthorized:false` by default has a
  MITM window (see `DEPLOYMENT.md`; `verify-full` + `DATABASE_CA_CERT` for
  stronger guarantees).
- HSTS is set unconditionally (even over plain HTTP).
- Upload has no file-level dedup (duplicates extracted twice).

## Code notes

### `src/lib/server/password-policy.ts`

**`function passwordPolicyError`**

- Kept as a plain function, not reimplemented as a `valibot` pipe action, when the public-route form actions moved to schema-derived input (issue #844). Three reasons: (1) it is the single source of truth for `MIN_PASSWORD_LENGTH`/`MAX_PASSWORD_LENGTH` shared with a caller outside this issue's scope (settings' authenticated password-change action, per `security_plan.md`) — folding it into a route-local schema would fork that source; (2) the two call sites that use it return *different* error vocabularies for the same two outcomes — signup returns `password_too_short`/`password_too_long`, reset-password returns the policy's own `tooShort`/`tooLong` directly — which a shared schema-level rule would have to special-case per route anyway, so nothing is saved; (3) it is exercised by its own focused unit test (`tests/password-policy.test.ts`) independent of any route, which a schema-embedded rule would lose. The schema on each route still does its job — reject a `File` or a missing field before `passwordPolicyError` ever runs on untyped input.

### `src/routes/api/user/delete/+server.ts`

**`function collectTenantFileKeys`**

- Reads (never deletes) every stored-file key for these restaurants (#289): confirmed invoices (`invoices.source_file`), batch files (`batch_items.file_key`). Collected before the transaction so the keys are already in hand no matter what the transaction does.

**`const POST`**

- Destructive + irreversible — cap attempts, `rateLimitScoped({ scope: 'user', name: 'account-delete', ... })` (ADR-029). Re-authenticates before touching anything (#492): a password-holding account must pass `verifyCredentials` (the same primitive login uses) with its current password; an OAuth-only account (`passwordHash` null) keeps the typed `DELETE_MY_ACCOUNT` confirmation as a fallback.
- Delete owned restaurants (FK cascade) only where this user is the sole member — restaurants with other members survive so one owner can't wipe teammates' data.
- All DB deletion — subscriptions, restaurants, `user_restaurants`, and the `users` row itself — runs inside ONE transaction (#492: previously `users` was deleted outside the transaction, and the Stripe cancel + file delete ran BEFORE it even started, so a mid-flight failure could leave a `users` row with no tenant, or cancel a live subscription / delete files while the account stayed intact). Stripe subscription ids and storage keys are only *collected* pre-transaction; nothing external is touched until the transaction has committed.
- After commit, a retryable `account-cleanup` pg-boss job (`enqueueAccountCleanup` → `processAccountCleanupJob` in `account-cleanup.ts`) cancels the collected Stripe subscriptions and deletes the collected files, using the same dead-letter pattern as every other background job (`worker.ts`). A failure to enqueue is logged + sent to Sentry but does not fail the request — the account row is already gone by then.
- Session cookies are cleared last; by that point the `users` row is already gone (inside the transaction), so the JWT session stops resolving to a real user on the next request regardless.

### `src/lib/server/account-cleanup.ts`

**`function processAccountCleanupJob`**

- Post-commit half of account deletion (#492). Cancels every collected Stripe subscription and deletes every collected storage key, attempting all of them even once one has failed, then throws an `AggregateError` if anything failed — the signal `runWithDeadLetter` (`worker.ts`) needs to retry the job and, once retries are exhausted, record it in the dead-letter queue.

### `src/routes/api/user/export/+server.ts`

**`const GET`**

- Heavy multi-table read — cap per user, `rateLimitScoped({ scope: 'user', name: 'account-export', ... })` (ADR-029).

### `src/lib/server/consent.ts`

**`const POLICY_VERSION`**

- T&C / Privacy consent (GDPR, #201). Every sign-up path leaves a user_consents row before use: email at form submit, Google OAuth at the auth callback (signup page) or onboarding (login page). Bump when /terms or /privacy change materially; earlier acceptances stay recorded.

### `src/lib/server/rate-limiter.ts`

**`type UpstashLimiter`**

- Uses Upstash Redis when `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` are set (distributed / multi-instance safe), else an in-process token bucket (single-server only — documented constraint).

**`interface Bucket`**

- In-memory fallback bucket.

### `src/lib/server/rate-limit-scope.ts`

**`function rateLimitScoped`**

- Structural identity choice for authenticated rate limits (ADR-029, #440): `scope: 'tenant'` keys on `identity.restaurantId`, `scope: 'user'` on `identity.userId`, key shape `` `${name}:${id}` `` (unchanged from the hand-written keys it replaces, so migrating a site whose scope doesn't change is a no-op for its bucket). Throws rather than keying on `undefined` when the scope's required identity is missing. Lives outside `rate-limiter.ts` on purpose — it imports `checkRateLimit` the normal way so every existing `vi.mock('$lib/server/rate-limiter', ...)` in the test suite keeps intercepting it unchanged.

**`function checkInMemory`**

- Evict on the bucket's own window, not a fixed two minutes — a long cooldown (WhatsApp unauthorised-sender reply uses hours) would otherwise be swept away and silently reset to "allowed".

**`function checkRateLimit`**

- Public API: at most `max` events per `windowSeconds` for `key`; window defaults to a minute (every caller predating #322 is per-minute). Longer windows are cooldowns, not throughput caps — "reply to an unknown number at most once every six hours" is one event per 21600 s.
- **What the key identifies is the caller's choice, and the codebase is split (#440).** 18 authenticated call sites: some key by `locals.user.id` (`chat:`, `notifications:`, `stock-levels:`, `trend:`, `unit-conversions:`, `switch-restaurant:`, `password-change:`), some by `rid` (`upload:`, `bulk:`, `product-alias:`, `supplier-category:`, `product-create:`, `product-unlink:`, `product-delete:`).
- Not cosmetic: user-keying a money-costing budget gives five staff accounts five times the spend (`chat:`, paid Gemini, worth revisiting first); tenant-keying a per-person action lets one user's bulk run exhaust the bucket for colleagues (intended for `bulk:`, wrong for `password-change:`). The "keyed on the authenticated user, not the client IP (#223)" rationale only rules out IP (behind a reverse proxy every request shares one IP) — it doesn't choose user vs tenant. Pick deliberately.

**`const activeExtractions`**

- Extraction concurrency semaphore (in-process fallback): `activeExtractions` + `extractionWaiters` back an async bounded FIFO semaphore; `tryAcquireExtraction`/`releaseExtraction` non-blocking, `acquireExtractionInMemory` blocking when Redis is unavailable. `releaseExtraction` hands a freed slot to the oldest waiter — the count reflects live holders + queued hand-offs.

**`function acquireExtractionSlot`**

- Public, provider-agnostic slot API (#454): waits for a global Gemini slot, returns a `release()`; the worker wraps the model call in acquire → try → finally release. Redis path first (distributed), in-process otherwise. A grant is idempotent to release — a `released` flag guards the timeout/finally double-release fixed in #455.
- Redis semaphore = ZSET of live leases keyed by per-acquire token, scored by expiry; the acquire Lua script is atomic (sweep expired with ZREMRANGEBYSCORE, ZADD if ZCARD < max, else 0). Lease = GEMINI_TIMEOUT_MS + 60 s (floor 120 s), the dead-worker safety net. Caller polls with jitter up to SLOT_MAX_WAIT_MS, then proceeds slot-less rather than stalling past pg-boss expiry (fail-open; the lease still bounds the blast radius).
### `src/lib/server/safe-redirect.ts`

**`function safeRedirect`**

- Validates a same-origin relative redirect target; rejects absolute URLs, protocol-relative (//), and backslash variants.

### `src/lib/server/tenant.ts`

**`function forTenant`**

- Tenant-scoped query context, no DB dependency (ADR-001-app-level-tenant-scoping.md). Use in route handlers instead of raw `eq(table.restaurantId, rid)` inline.

### `src/lib/server/tenant-context.ts`

**`function runWithTenantContext` / `function runAsSystem` / `function activeTenantContext`**

- The database-enforcement mechanism ADR-030 (#222) adds on top of `forTenant()`: reserves one physical Postgres connection (`postgres.js`'s `sql.reserve()`) for the duration of `fn`, sets `app.restaurant_id` (`runWithTenantContext`) or `app.admin = 'true'` (`runAsSystem`) as a session GUC on it via `AsyncLocalStorage`, and unconditionally clears both GUCs before releasing the connection back to the pool in a `finally` — the fix for the "pool contamination" failure mode (a stale tenant's setting reused by an unrelated later query on the same physical connection).
- `runWithTenantContext(null | '', fn)` is a no-op — runs `fn()` against the ordinary pooled client with no context set, which is correct for non-tenant/pre-tenant paths (the tenant table RLS policies then see no matching GUC and return nothing, the intended backstop).
- `src/lib/server/db.ts`'s `db` export is a `Proxy` that resolves to `activeTenantContext()?.db` when a context is active, the plain pooled client otherwise — every existing `db.select()/.insert()/...` call site needs no change to pick this up.
- `runAsSystem()` is reserved for enumerated, audited cross-tenant/system code paths (admin routes, scheduled dispatchers, webhook ingestion, new-tenant bootstrap) — see ADR-030's table. Never use it as a general-purpose "make this query work" fix.
- Inside an existing `db.transaction()` that needs the same admin escape hatch (new-tenant creation transactions), use `SET LOCAL app.admin = 'true'` as the transaction's first statement instead — it shares the transaction's own connection and auto-reverts at commit/rollback, no separate reservation needed.

**`method scope`**

- Builds a WHERE condition that always scopes to this tenant.

### `src/lib/sentry-scrub.ts`

**`const SENSITIVE_PARAMS`**

- Sentry PII scrubbing shared by server + client inits (#254). Sentry attaches the request URL; auth flows put short-lived secrets in the query string (`/auth/callback?code=…` live OAuth code, password-reset tokens, `email`) that a callback error would ship to a third party. Redact before the event leaves the process: `code`, `token`, `access_token`, `refresh_token`, `email`.

**`function scrubUrl`**

- Redacts sensitive query params from a URL; unchanged on parse failure. Resolves relative URLs against a dummy origin.

**`function scrubSentryEvent`**

- Scrubs the request URL on a Sentry event (mutates and returns it).

### `src/hooks.server.ts`

**`method beforeSend`**

- Drop intentional SvelteKit redirects — not errors. Strip live OAuth codes / tokens / emails from attached request URLs.

**`const handle`**

- adapter-node resolves getClientAddress() from the socket peer unless ADDRESS_HEADER names the proxy header — behind nginx/Caddy every visitor shares one rate-limit bucket, so the IP-keyed login/signup/waitlist limits collapse into one global (#223).
- Auth.js session: signed JWT cookie, verified locally, no round-trip (unlike the Supabase client this replaced). Build the request-scoped user; resolve the active restaurant (cookie preference if valid, else first). Request-level admin guard for the (admin) layout load, which doesn't rerun on child navigation. Anonymous apex hit → landing page, not the login wall (#291); deep links keep the redirectTo round-trip.

**`const handle`**

- Two routes are embedded in a same-origin <iframe> by the app — batch review PDF preview (/api/upload/[id]/[file]) and saved invoice PDF preview (/invoice/[id]/file); DENY would block the app's own preview.

**`function isPublicPath`**

- Password recovery (#284): /reset-password is reached with a recovery session, but a used/expired link renders its own "request a new one" page rather than bouncing to login.
