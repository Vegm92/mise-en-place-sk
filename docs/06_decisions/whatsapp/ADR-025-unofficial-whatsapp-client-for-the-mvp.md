# ADR-025 — The WhatsApp bot runs on an unofficial client until the business is registered

**Status:** Active
**Feature:** whatsapp
**Date:** 2026-08-24
**Issue:** [#483](https://github.com/Vegm92/mise-en-place-sk/issues/483)

## Context

The WhatsApp integration was built against the Meta Cloud API and is complete on
that side: webhook, HMAC verification, pairing codes, contacts, health checks.
None of it can be switched on. Meta issues Cloud API credentials to a *verified
business*, and there is no registered business yet. The integration is finished
code that cannot be provisioned, and the round trip
`docs/03_features/whatsapp2.md` describes — worker sends the extracted data
back, sender answers `OK` or `NO` — cannot be built or demonstrated on a
transport that does not exist.

The alternatives:

- **Wait for business registration.** Correct, and blocks the feature for as
  long as the paperwork takes. Rejected because the round trip is the point of
  the feature and there is no way to try it with restaurants meanwhile.
- **`whatsapp-web.js`.** The better-known unofficial client. It drives a real
  Chromium through Puppeteer: roughly 400 MB RSS against Baileys' ~50 MB, no
  Chromium on the `node:22-alpine` base image, and its session lives on disk.
  `DEPLOYMENT.md` is explicit that web and worker are separate Railway services
  that do not share a disk, so it would need a Railway volume on the worker.
  Rejected on all three counts.
- **A third-party BSP** (Twilio, 360dialog, MessageBird). Real numbers, real
  support, and no ban risk — but they resell the Cloud API and therefore need
  the same verified business, plus a per-message fee. Rejected: it does not
  clear the blocker, it only moves who bills for it.
- **Baileys** (`@whiskeysockets/baileys`). Speaks the WhatsApp Web protocol
  directly over a WebSocket. No browser, and its auth state is pluggable, so
  the session can live in Postgres and no volume is needed.

## Decision

The MVP ships on Baileys, pinned exactly at `7.0.0-rc14`, behind the transport
seam in `src/lib/server/integrations/whatsapp/`.

`transport.ts` defines the interface (`start`, `stop`, `sendText`, `onMessage`,
`downloadMedia`) and nothing else. `driver-baileys.ts` is the only file in the
repo that imports the library; `message-handler.ts` and `media-handler.ts` take
a context object and never learn which transport they are on. The existing Meta
webhook route feeds the same handler through `whatsapp-bot.ts`, which is now
just the Meta-side adapter. Swapping to the Cloud API once the business exists
is one file, not a rewrite.

The session lives in the `whatsapp_session` table (migration 0042) via
`auth-state.ts`, which implements Baileys' `AuthenticationState` against
Postgres. It stores auth material, so it is treated as credential storage: no
row is ever logged, and `clearWhatsAppSession()` exists to revoke it.

The version pin needs stating plainly: `7.0.0-rc14` is a release candidate. The
last stable line (6.7.x) resolves `libsignal` from a GitHub tarball, which this
project's registry proxy refuses and which is a worse supply-chain position than
a published package. The RC pulls `libsignal` from npm. Pinned with `pnpm add -E`
and reviewed at every upgrade.

## Consequences

**The ban risk is real and is not mitigated away.** WhatsApp can and does ban
numbers using unofficial clients, without notice or appeal. What the design does
is bound the damage:

- The bot runs on a *dedicated number*, never anyone's personal number. This is
  an operational rule, not something the code can enforce — a banned personal
  number costs someone their own messaging.
- Per-sender rate limiting (`WHATSAPP_SENDER_HOURLY_LIMIT`, 30/hour) keeps
  traffic to a shape a human could plausibly produce.
- A DB-backed kill switch (`app_flags.whatsapp_bot_enabled`, toggled from
  `/admin/whatsapp`) stops the bot without a redeploy, checked at worker boot
  and again before every inbound message. The env var `WHATSAPP_BOT_ENABLED`
  gates it at a level the flag cannot re-open.

**Operationally:**

- The worker service must have Railway's `sleepApplication` disabled. A
  persistent socket does not survive the app being put to sleep.
- Pairing is by QR. The worker has no HTTP port, so the code is printed as
  ASCII in the worker log and mirrored into `app_flags.whatsapp_qr`, rendered
  at `/admin/whatsapp` with the `renderQrSvg` helper the printable wall QR
  already uses. A QR expires in about 60 seconds; the driver keeps issuing new
  ones while unpaired.
- A logged-out session does not reconnect on its own. Status lands in
  `app_flags.whatsapp_status` and the panel shows it.
- **The driver times its own connection.** Baileys emits
  `connection: 'connecting'` and then nothing at all when the socket cannot be
  established — no QR, no error, no close event — so a blocked egress, a DNS
  failure and a WhatsApp outage are indistinguishable and all of them are
  silent. A 60-second watchdog turns that into a logged error naming the likely
  causes and a sticky `unreachable` status, then retries. Found by running the
  worker against a network that blocks the WhatsApp WebSocket; without it the
  worker looks healthy while the bot is permanently deaf.
- The driver attaches `.catch()` to every internal promise. `src/worker.ts`
  exits the process on any unhandled rejection, and a socket library that let
  one escape would take extraction down with it.

**What is not handled:** message ordering across a reconnect, group chats
(dropped), and history sync (disabled — the bot only sees messages that arrive
while it is connected). Media is downloaded through Baileys' own decryption, so
a protocol change upstream breaks ingestion until the pin moves.

**Held in place by:** `tests/whatsapp-jobs.test.ts`,
`tests/whatsapp-notify.test.ts`, `tests/whatsapp-review-reply.test.ts` and
`tests/whatsapp-bridge.test.ts` all drive the round trip through a fake
transport, so the seam stays honest and none of them import Baileys.
`tests/whatsapp-driver-watchdog.test.ts` is the exception that proves it: the
driver is the adapter to the SDK, so there is no seam left underneath it and
the library itself is mocked there.

## Related

- [ADR-004](./ADR-004-whatsapp-converges-on-batch-pipeline.md) — WhatsApp media
  goes through the shared batch pipeline; this ADR does not change that.
- [ADR-019](./ADR-019-phone-number-is-the-tenant-key.md) — the sender's number
  resolves the tenant, which is why the driver normalises the Baileys JID with
  `normalizePhoneNumber` before the handler sees it.
- [ADR-008](../invoicing/ADR-008-single-invoice-write-path.md) — why `OK` over
  WhatsApp flags a review and raises a reminder instead of writing an invoice.
