# Feature Spec — WhatsApp (invoice ingestion channel)

## Purpose

Let restaurant staff send supplier invoices to a WhatsApp number and have them
flow into the normal batch pipeline, with a review link sent back.

## Actors

- WhatsApp staff numbers (authorized via pairing codes).
- Meta (webhook delivery).
- Owner (generates pairing codes in `/settings`).

## Preconditions

- `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_VERIFY_TOKEN`
  set; `WHATSAPP_APP_SECRET` in production.
- Sender's phone already paired (`whatsapp_contacts`).

## Inputs

- Webhook GET `hub.mode/verify_token/challenge`.
- Webhook POST with inbound `messages` (image/document) or account events.

## Outputs

- `upload_batches` + `batch_items` for media → same extraction pipeline
  (ADR-004 convergence).
- `whatsapp_processed_messages` dedup rows.
- Replies: `/batch/{batchId}` link; guidance for text-only; pairing outcomes.
- `whatsapp_pairing_codes` (generated/redeemed); `whatsapp_account_events`.

## Business rules

- **Verification**: GET challenge vs `WHATSAPP_VERIFY_TOKEN` (403 otherwise);
  POST HMAC-SHA256 of raw body vs `x-hub-signature-256` via `timingSafeEqual`
  (skipped with warning when secret unset, non-prod).
- **Tenant key** (ADR-019): sender `msg.from` looked up in `whatsapp_contacts`
  (`phoneNumber` unique → `restaurantId`).
- **Dedup**: `claimMessageId` inserts PK with `onConflictDoNothing`; empty
  returning = duplicate → skip. Swept by idempotency cleanup.
- **Pairing**: `generatePairingCode` — 6-char code (no 0/O/1/I), 15-min TTL,
  10/hr per restaurant, prior unredeemed codes expired, retries on code
  collision; `redeemPairingCode` — rate-limit 5/hr per phone, atomic claim
  `UPDATE ... WHERE code=? AND redeemedAt IS NULL AND expiresAt>now() RETURNING`,
  rollback of `redeemedAt` on failure; unknown senders get a 6-h cooldown reply
  unless the text normalizes to a valid code.
- **Media**: authorized senders with image/document → download (`MIME_TO_EXT`
  mapping, default jpg), save to `whatsapp/{rid}/{uuid}.{ext}`, `createBatch` +
  `enqueueBatchExtraction`. Text-only → "solo imágenes/PDF" guidance.
- **Health**: `parseAccountEvent` → severity (RED/YELLOW/ban/restriction) into
  `whatsapp_account_events` + Sentry message for non-info; `getNumberHealth` =
  worst severity in 30 days.

## State transitions

n/a for contacts; batches follow `invoice_ingestion.md`; pairing codes
`unused → redeemed` (or expired).

## Data dependencies

`whatsapp_contacts`, `whatsapp_pairing_codes`, `whatsapp_account_events`,
`whatsapp_processed_messages`, `upload_batches`, `batch_items`, storage.

## API dependencies

`api/whatsapp/webhook`; settings WhatsApp section (owner-only pairing UI).

## UI dependencies

`/settings` (pairing + display number + wa.me link + printable QR via `qr-svg.ts`).

## Background dependencies

Media handling is synchronous in the webhook; extraction runs via pg-boss as
usual. Batch-status polling works for WhatsApp batches too.

## External dependencies

Meta WhatsApp Cloud API (v25.0 default), storage driver.

## Validation

HMAC signature; phone format (`phone.ts`); media MIME mapping; pairing code
normalization; rate limits.

## Error states

- Missing credentials → warn-and-skip (no throw) for outbound.
- Unauthorized sender → cooldown reply.
- Media download failure → no batch created; logged.

## Edge cases

- Same message redelivered by Meta → dedup skip.
- Two senders, one number → phone is globally unique (pairing binds one tenant).
- Pairing code conflict → retried up to 5×.
- Unset `WHATSAPP_APP_SECRET` in prod → POST webhook refuses to verify (see
  security; deployment must set it).

## Security rules

- Webhook HMAC verification is the gate (ADR-019 tenant binding).
- Always return 200 after handling so Meta doesn't retry unhandled edges.
- Pairing is owner-initiated, rate-limited, short-TTL, single-redeem.

## Idempotency rules

- `whatsapp_processed_messages` PK dedup; pairing atomic claim; batch enqueue
  is idempotent per item.

## Observability

- `whatsapp_account_events` severity + Sentry for health drops; `/admin`
  displays number health.

## Acceptance criteria

- GET challenge verifies; POST with an invoice image creates a batch + replies
  with the review link; a duplicate message is skipped; pairing codes redeem
  once and expire.
- Tests: `tests/whatsapp-webhook.test.ts`, `tests/whatsapp-bot.test.ts`,
  `tests/whatsapp-pairing.test.ts`, `tests/whatsapp-contacts.test.ts`,
  `tests/whatsapp-bridge.test.ts`, `tests/whatsapp-health.test.ts`,
  `tests/whatsapp-api.test.ts`.
