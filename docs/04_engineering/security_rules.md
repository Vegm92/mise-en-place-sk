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
- `stripe_webhook_events` PK dedup; claim deleted on handler error so Stripe
  retries.
- Entitlement comes from the DB `subscriptions` row, never from client claims.

## WhatsApp security

- GET challenge vs `WHATSAPP_VERIFY_TOKEN`; POST HMAC-SHA256 vs
  `x-hub-signature-256` via `timingSafeEqual`.
- Phone number = tenant key (ADR-019); pairing is owner-initiated, 6-char
  codes, 15-min TTL, rate-limited, single-redeem.
- `whatsapp_processed_messages` PK dedup prevents double-processing.

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
