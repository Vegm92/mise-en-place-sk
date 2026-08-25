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
- All business queries scoped by `forTenant().scope()`; RLS is retired
  (ADR-005). Enforced by lint gates + `tests/tenant-isolation*.test.ts`.
- Role checks for owner-only actions (billing, WhatsApp pairing, locations).

## Input validation

- Hand-rolled per endpoint: type casts, trim/lower, length caps, whitelist
  checks. No zod — keep validation explicit and local.
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
- Key scoping matters (user vs restaurant vs IP) — see open item #440.
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
- Rate-limit key scope has no documented rule (#440).
- Upload has no file-level dedup (duplicates extracted twice).

## Code notes

### `src/routes/api/user/delete/+server.ts`

**`function deleteTenantFiles`**

- Remove every stored file for these restaurants (#289): confirmed invoices (`invoices.source_file`), batch files (`batch_items.file_key`), WhatsApp captures (`whatsapp_bot_sessions.file_key`). Failures logged, never thrown — account deletion must still complete.

**`const POST`**

- Destructive + irreversible — cap attempts, key `account-delete:${user.id}`; require explicit confirmation in the body. Delete owned restaurants (FK cascade) only where this user is the sole member — restaurants with other members survive so one owner can't wipe teammates' data.
- Cancel live Stripe subscriptions BEFORE deleting the rows linking the Stripe customer to the tenant — otherwise the card keeps charging and support can't trace it (#246). Immediate cancellation (GDPR, not cancel-at-period-end).
- GDPR must reach the files, not just rows (#289): once the restaurant row goes, the cascade drops every pointer to the uploaded PDFs and nothing could find them again. Delete files first, best-effort — a storage hiccup must not block deletion. All row deletes commit atomically (clean retry state). Delete `users` + clear session cookies last — keeps the endpoint retryable; this is what ends the session.

### `src/routes/api/user/export/+server.ts`

**`const GET`**

- Heavy multi-table read — cap per user, key `account-export:${user.id}`.

### `src/lib/server/consent.ts`

**`const POLICY_VERSION`**

- T&C / Privacy consent (GDPR, #201). Every sign-up path leaves a user_consents row before use: email at form submit, Google OAuth at the auth callback (signup page) or onboarding (login page). Bump when /terms or /privacy change materially; earlier acceptances stay recorded.

### `src/lib/server/rate-limiter.ts`

**`type UpstashLimiter`**

- Uses Upstash Redis when `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` are set (distributed / multi-instance safe), else an in-process token bucket (single-server only — documented constraint).

**`interface Bucket`**

- In-memory fallback bucket.

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
