---
tags: [mep, features]
related: "[[CONTEXT]]"
---

# Feature Spec — WhatsApp (invoice ingestion channel)

## Purpose

Let restaurant staff send supplier invoices to a WhatsApp number, have them flow
into the normal batch pipeline, and get the extracted data back in the same
chat to confirm with `OK` or reject with `NO`.

## Transports

One transport runs today: Baileys, a worker-held socket (`driver-baileys.ts`,
QR pairing, no verified business needed). It sits behind one interface
(`integrations/whatsapp/transport.ts`, ADR-025), so routing, pairing, media,
job codes and review replies never learn which transport they are on.

The Meta Cloud API inbound path (webhook, `whatsapp-inbound` queue, Graph media
download, account-event health) was dormant and has been removed; ADR-025 says
where to restore it from. Only `sendWhatsAppMessage` in `whatsapp.ts` remains,
for the weekly digest push.

`message-handler.ts` takes a `WhatsAppMessageContext` (`sendText` +
`downloadMedia`) and never learns which one it is on, which is also how the
tests drive the round trip without a network.

## Actors

- WhatsApp staff numbers (authorized via pairing codes).
- The Baileys socket in the worker.
- Owner (generates pairing codes in `/settings`).
- Admin (`/admin/whatsapp`: QR pairing, kill switch, connection status).

## Preconditions

- Baileys: `WHATSAPP_BOT_ENABLED=true` on the worker, the number paired by
  QR, and `app_flags.whatsapp_bot_enabled` not `'false'`.
- Sender's phone already paired (`whatsapp_contacts`).

## Inputs

- Inbound messages (text/image/document) from the Baileys socket.

## Outputs

- `upload_batches` + `batch_items` for media → same extraction pipeline
  (ADR-004 convergence).
- `idempotency_keys` dedup rows in the `whatsapp` scope.
- Replies: receipt acknowledgement; the extracted-data summary with a job code;
  review outcomes; guidance for unusable text; pairing outcomes.
- `whatsapp-notify` pg-boss jobs (worker → sender).
- `system_notifications` rows: `whatsapp_pending_save` / `whatsapp_needs_review`.
- `whatsapp_pairing_codes` (generated/redeemed).

## Business rules

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
- **Binding requires pairing** (ADR-019 update, issue #498): `whatsapp_contacts`
  is written in exactly one place, `redeemPairingCode`. Settings' manual "type a
  phone number" form (`addWhatsappContact`) no longer calls `addContact`
  directly — it calls `generatePairingCode` with the typed number as a target
  (`whatsapp_pairing_codes.phone_number`), so it only pre-authorises; the
  binding exists only once that phone redeems the code. A targeted invite
  redeemed from a different number is released and answered exactly like an
  unknown/expired code (`'invalid'`) — no disclosure either way. An untargeted
  code (`phone_number IS NULL`, the pre-existing "generate a code" flow) keeps
  first-phone-wins. `addWhatsappContact` never checks availability up front,
  so inviting an available number and inviting one already bound elsewhere are
  indistinguishable from Settings.
- **Media**: authorized senders with image/document → size check against the
  declared length, download (`MIME_TO_EXT` mapping, default jpg), validate
  against `file-validation.ts` (20 MB cap, extension allow-list, magic bytes —
  the same rules the web upload path uses), save to
  `whatsapp/{rid}/{uuid}.{ext}`, `createBatch` with
  `{ source: 'whatsapp', sourceRef, jobCode }` + `enqueueBatchExtraction`.
- **Throttle**: media from an authorized sender passes `checkRateLimit` keyed
  `whatsapp:{from}`, `WHATSAPP_SENDER_HOURLY_LIMIT` (30) per hour, before the
  download. Review replies are not throttled — they cost nothing.
- **Claim release** (issue #483): the message-id claim is released on any
  failure up to the commit point (batch created and extraction enqueued), and
  never after it. Past the commit point the invoice IS ingested and releasing
  would let a redelivery create a second batch. A validation rejection is a
  handled outcome, not a failure — the claim stays held.
- **Round trip**: extraction end enqueues `whatsapp-notify`; the handler sends
  the summary (supplier, number, date, base, IVA, total, job code) and sets
  `review_status='pending'`. A failed extraction points at `/batch/{id}` and
  sets `to_review`.
- **Review replies**: `OK`/`vale`/`sí`/`correcto` → `reviewed`;
  `NO`/`mal`/`incorrecto` → `to_review`. At most three words, decision first,
  so ordinary chat is not mistaken for an answer. The job is found by the code
  in the reply, or by being the sender's only pending job; several pending and
  no code gets the list of codes back rather than a guess. The transition is a
  guarded UPDATE, so a repeated `OK` changes nothing and raises no second
  reminder. An `OK` never writes an invoice (ADR-008) — it raises a reminder.
- **Kill switch**: `WHATSAPP_BOT_ENABLED` gates the Baileys transport at boot;
  `app_flags.whatsapp_bot_enabled` can stop it without a redeploy and is
  re-read before every inbound message.

## State transitions

n/a for contacts; batches follow `invoice_ingestion.md`; pairing codes
`unused → redeemed` (or expired).

## Data dependencies

`whatsapp_contacts`, `whatsapp_pairing_codes` (`phone_number` optionally
targets an invite to one number, migration `0045`),
`whatsapp_session` (Baileys credentials), `idempotency_keys` (`whatsapp` scope),
`upload_batches`, `batch_items` (`source`, `source_ref`, `job_code`,
`review_status`), `system_notifications` (also carries
`whatsapp_contact_released` audit rows via `trackEvent`), `app_flags`, storage.

## API dependencies

Settings WhatsApp section (owner-only pairing UI);
`/admin/whatsapp` `releaseContact` action (support force-release by phone).

## UI dependencies

`/settings` (pairing + display number + wa.me link + printable QR via
`qr-svg.ts`); `/admin/whatsapp` (bot connection, QR, kill switch, and a
force-release-by-phone form for support, issue #498).

## Background dependencies

Media handling is synchronous in the socket handler; extraction runs via pg-boss as
usual. Batch-status polling works for WhatsApp batches too. The hand-back is a
`whatsapp-notify` job (dead-letter sibling, 3 retries, 60 s apart), registered
in `src/worker.ts` only when a transport is running.

## External dependencies

`@whiskeysockets/baileys` (ADR-025), storage driver; the Graph API (v25.0
default) only for the digest push.

## Validation

Phone format (`phone.ts`); media MIME mapping; pairing code
normalization; rate limits.

## Error states

- Missing credentials → warn-and-skip (no throw) for outbound.
- Unauthorized sender → cooldown reply.
- Media download failure → no batch created; claim released so a resend works.
- Oversized / spoofed / unsupported file → refusal reply, claim retained.
- Baileys logged out → status flag `logged_out`, no auto-reconnect, QR needed.
- Baileys cannot reach WhatsApp → the connection hangs with no error of its own,
  so a 60 s watchdog logs it, sets status `unreachable` and retries. `/admin/whatsapp`
  shows it in red; check outbound `wss` to web.whatsapp.com first.

## Edge cases

- Same message delivered twice → dedup skip.
- Two senders, one number → phone is globally unique (pairing binds one tenant).
- Pairing code conflict → retried up to 5×.

## Security rules

- The sender's paired number is the gate (ADR-019 tenant binding).
- Pairing is owner-initiated, rate-limited, short-TTL, single-redeem.
- Binding requires proof of control: only `redeemPairingCode` writes
  `whatsapp_contacts`; the manual Settings form pre-authorises, it never binds
  (issue #498).
- "Taken" is never disclosed: Settings' invite path doesn't check availability
  up front, and the bot's redemption-time reply for a genuinely bound number is
  generic (no "otro local" / "another location").
- Release is owner self-service (`removeWhatsappContact`) or admin
  force-release by phone (`releaseContactByPhone`, `/admin/whatsapp`,
  `isAdminUser`-gated); both write a `whatsapp_contact_released` audit row.

## Idempotency rules

- `idempotency_keys` (`whatsapp` scope) dedup; pairing atomic claim; batch enqueue
  is idempotent per item.

## Observability

- `/admin/whatsapp` shows the Baileys connection status; `/admin/health` shows
  the transport check and authorised senders per tenant.

## Acceptance criteria

- An invoice image creates a batch and is acknowledged;
  the summary comes back with a job code; `OK <code>` marks it reviewed and
  raises a reminder; a duplicate message is skipped; a failure before the commit
  point releases the claim so a resend works; pairing codes redeem once and
  expire.
- Tests: `tests/whatsapp-bot.test.ts`,
  `tests/whatsapp-pairing.test.ts`, `tests/whatsapp-contacts.test.ts`,
  `tests/whatsapp-bridge.test.ts`, `tests/whatsapp-api.test.ts`, `tests/whatsapp-jobs.test.ts`,
  `tests/whatsapp-notify.test.ts`, `tests/whatsapp-review-reply.test.ts`.

## Code notes

`src/` carries no explanatory comments (`pnpm lint:no-comments`), so the
rationale for the integration modules lives here.

### `src/lib/server/integrations/whatsapp/`

**`transport.ts`** — types only, no imports. It exists so the handler can be
exercised without a network and so the Meta driver can replace the Baileys one
in a single file once the business is registered (ADR-025).

**`message-handler.ts`** — the claim/release wrapper and the routing. The
`committed` flag is passed down rather than returned because the commit point is
inside the media handler, several frames below the try/catch that owns the
release (issue #483).

**`media-handler.ts`** — the job code is generated here rather than in
`createBatch` so `createBatch` stays origin-agnostic for the web path. The code
lands on the first item only; a WhatsApp batch never has a second one.

**`jobs.ts`** — codes are unique among OPEN jobs, not globally: the unique index
in migration 0042 is partial on `review_status IS NULL OR = 'pending'`. Without
that, 4 characters over a 30-character alphabet would start colliding at a few
thousand invoices. `parseReview` caps at three words on purpose — a looser
parser turns "pues no lo sé" into a rejection.

`findJobByCode`, `pendingJobsFor` and `setReviewStatus` take the resolved
`restaurantId` and scope on it through `forTenant().scope()`. They used to key
on `source_ref` (the sender's number) and the item id alone, carried by a
`tenant-scope-ok` comment arguing that a sender can only reach the jobs they
themselves sent. That is true of the *sender* and says nothing about the
*tenant*: release is a real path (`removeContact`, `releaseContactByPhone`),
so the same number can be paired to another restaurant afterwards and the old
rows still matched — a cross-tenant read from `pendingJobsFor` and a
cross-tenant write from `setReviewStatus` (issue #1070). `raiseReviewNotification`
likewise files against the tenant passed in rather than the tenant stored on
the row. `generateJobCode` keeps its exemption: the index it probes is global,
so the collision check has to be, and it returns only a boolean.

**`notify.ts`** — reached only through pg-boss, so it holds no reference to a
transport and takes the context as an argument. It re-checks `status` because
pg-boss can deliver before `markDone` commits.

**`auth-state.ts`** — Baileys' auth state is pluggable, which is the whole
reason it was chosen over `whatsapp-web.js`: web and worker are separate Railway
services and do not share a disk, so a file-backed session would need a volume
the worker cannot have. `BufferJSON` is Baileys' own codec for the binary key
material; the round trip through `JSON.parse(JSON.stringify(...))` is what
applies it over the `jsonb` column.

**`driver-baileys.ts`** — the only file importing the client. Every internal
promise carries a `.catch()` because `src/worker.ts` exits the process on any
unhandled rejection, and a socket library that let one escape would take
extraction down with it. The connect watchdog exists because Baileys reports a
socket it cannot establish as `connecting` and then stays silent forever: the
`unreachable` state is the driver's own, not the library's, and it is sticky
across retries so the panel does not flicker back to `connecting` every minute. The JID is normalised with `normalizePhoneNumber`
before the handler sees it, because contacts are stored as digits (ADR-019).

### `src/lib/server/qr-svg.ts`

**`const ERROR_CORRECTION`**

- QR code rendering (#319). Distinct from `qr.ts`, which *parses* the VERI*FACTU / TicketBAI QR codes on invoices; this renders a string a phone scans. Inline `<svg>` rather than data-URI, so it stays crisp when printed (the delivery for the bot number is paper on the kitchen wall) and needs no `img-src` CSP allowance.
- 'M' (~15% recovery) suits a printed code: tolerance for a scuffed print without inflating the module count, which decides the paper size.

**`function renderQrSvg`**

- Scalable inline SVG QR (viewBox, no fixed size — caller sizes via CSS). Returns null when the string is too long — callers treat the QR as an enhancement and drop it rather than failing the page. Type 0 = smallest symbol version that fits.

### `src/lib/server/whatsapp-contacts.ts`

**`interface WhatsAppContact`**

- Authorised numbers (#187 follow-up) — the allow-list the bot checks before processing; unknown senders get "no autorizado" and are dropped. Until this module existed the table could only be populated with hand-written SQL. Numbers stored as Meta delivers: E.164 without '+'; user input must be normalised or the lookup silently never matches.

**`function addContact`**

- `whatsapp_contacts_phone_unique` is global, not per-tenant: one phone maps to one restaurant because the bot resolves the tenant *from* the number. A number claimed by another tenant fails as 'taken' rather than silently rebinding; same-tenant conflict is an idempotent success. Since #498 this is called from exactly one place, `redeemPairingCode` — nothing else may write `whatsapp_contacts`.

**`function removeContact`**

- De-authorise; tenant-scoped so one restaurant cannot remove another's. Since #498 also writes a `whatsapp_contact_released` `trackEvent` row (phone, contact id, releasing user) so a release has an audit trail, and returns the deleted phone number for that purpose — the number itself is immediately free for another tenant's pairing invite.

**`function releaseContactByPhone`** (#498)

- Support's force-release: deletes by phone number alone, so it works without knowing which restaurant holds the number — the whole point of a support path. Deliberately cross-tenant (`tenant-scope-ok`), gated by `isAdminUser` in the calling `/admin/whatsapp` route rather than by tenant scoping here. Same audit event as `removeContact`, tagged `method: 'support'`.

**`function contactsPerTenant`**

- Authorised senders per tenant, shown on `/admin/health`, to find and de-authorise a block-heavy restaurant quickly (Settings needs to know which tenant first). Read-only: removing a number stays an explicit act in the owner's Settings.

**`digestOptedInContacts` / `isDigestOptedIn` / `setDigestOptIn`** (#331)

- `whatsapp_contacts.digest_opted_in` (migration 0084, defaults `false`) is separate from being an authorised sender: pairing authorises invoice ingestion, not a proactive push, so an enrolled contact receives no digest until this flag is explicitly set. `isDigestOptedIn` exists so the sender can be re-checked immediately before each send rather than trusted from a list fetched earlier in the same job run.

### `src/lib/server/whatsapp-digest-push.ts` (#331)

- `pushWeeklyDigestOverWhatsApp`, called from `sendWeeklyDigest` (`tenant-notification-jobs.ts`) after the email claim succeeds — it rides the same per-tenant fanout and claim-guard rather than a second schedule. It re-fetches the tenant's opted-in contacts, builds one condensed message (`wa.digest.push`, a deep link to `/s/<share-token>` rather than a second digest rendering), and sends it per contact inside its own try/catch so one contact's failure — or the whole push failing — never blocks another contact, the tenant's email, or another tenant's job. The template is utility-category content (informational, opt-out instruction included, no promotional language) per the billable-messaging decision (`DEPLOYMENT.md`, "Messaging policy and cost") — sending it outside the 24-hour service window still requires an approved Meta utility template, which does not exist in this repo yet; `sendWhatsAppMessage` remains the free-text seam until one is registered.

**`handleDigestOptKeyword`** (`integrations/whatsapp/message-handler.ts`, #331)

- Opt-in/opt-out keywords, Spanish and English, checked before the OK/NO review parser so they can never collide with it (`suscribir`/`subscribe` vs. `baja`/`cancelar`/`stop`/`unsubscribe`). This is the only path that sets `digest_opted_in` — deliberately not the pairing flow, so sending an invoice is never read as consent.
- The two directions are matched asymmetrically on purpose (#331 round 2). Opt-in requires the whole message to equal one keyword exactly — `activar` was dropped from the set because it is not unambiguous (a chef could mean their account, their pairing, anything), and a false opt-in is exactly the unsolicited-push case the shared-number constraint exists to prevent. Opt-out instead matches if any *whole word* of the message is one of the opt-out keywords (`stripAccents` + split on non-alphanumerics, so "BAJA por favor", "quiero darme de baja" and "please stop" all suppress sends, while "nonstop" does not) — someone asking to stop must stop, so opt-out is deliberately generous where opt-in is deliberately strict.

### `src/lib/server/whatsapp-pairing.ts`

**`const CODE_ALPHABET`**

- Self-service enrolment by pairing code (#320). The manual path stays for the owner's own number, but a typo is the worst failure mode: the chef gets "este número no está autorizado" while Settings looks fine. A code inverts trust: the owner generates it, the chef messages it from the phone they'll use, the number comes from the webhook `from` — can't be mistyped, proven controlled.
- Redemption runs before the bot's authorisation gate, so this is the one unauthenticated write into `whatsapp_contacts`: single-use, short-lived, redeemed by a guarded UPDATE (never read-then-write), rate-limited per sender, failures indistinguishable. 0/O, 1/I/L, 5/S omitted — costs entropy, saves support.

**`const CODE_TTL_MS`**

- ~15 min — long enough to walk a code across a kitchen, short enough that a screenshot isn't a standing invitation.

**`const REDEEM_ATTEMPTS`**

- 5 per sender; 30^6 ≈ 7.3e8, far below brute-forcing a code inside its TTL.

**`const REDEEM_GLOBAL_LIMIT`**

- 100/hr platform-wide, alongside the per-sender bucket (#1083) — the per-sender throttle alone doesn't stop a guess spread across many spoofed sender numbers; 20x the per-sender ceiling bounds total redemption attempts while staying well above realistic concurrent legitimate redemptions.

**`const GENERATE_LIMIT`**

- 10/hr per owner — abuse guard, not UX.

**`function normalizeCode`**

- Case- and separator-insensitive compare. Anything with a character outside the alphabet isn't treated as a code attempt — keeps ordinary chat out of the rate limiter.

**`function generatePairingCode`**

- Mint, replacing any outstanding code: Settings shows "the" code, so a silent supersession would be worse than visible reissue, and one guessable code per tenant is kept. Global unique index → a collision with another tenant's live code is retried (effectively never runs at 7.3e8 values).
- `targetPhone` (#498) is what the manual Settings "add a number" form now produces instead of a direct `addContact` call: the invite carries the typed number, and `normalizePhoneNumber` validation runs before the rate limit is spent, same as a malformed code costs nothing. No availability check runs here — checking now would just move the disclosure the fix removes from `redeemPairingCode` to here instead.

**`function activePairingCode`**

- The restaurant's live, unredeemed code, if any — what Settings displays.

**`function revokePairingCodes`**

- Discard the live code without minting a replacement.

**`type RedeemResult`**

- `ok: true` bound (restaurantId = the tenant the number now belongs to); `'invalid'` — unknown/expired/used, deliberately one outcome; `'taken'` — number already authorised elsewhere; `'rateLimited'` — answer with nothing at all.

**`function redeemPairingCode`**

- Guarded UPDATE (`redeemed_at IS NULL AND expires_at > now()`, RETURNING) — two deliveries or two racers on one code can't both win; only the winner writes the contact row. Unknown/expired/redeemed look identical outside — an attacker must not learn a code exists. If the phone is another restaurant's (global unique), release the code rather than burn the owner's.
- A targeted invite (#498, `phoneNumber` on the claimed row) is checked against the redeeming sender before `addContact` runs: a mismatch releases the claim and answers `'invalid'` — the same outcome as an unknown code, so a wrong number can't be used to probe whether an invite exists or what number it names.

### `src/lib/server/whatsapp.ts`

**`function maskPhone`**

- Mask for logs — keep only the last 4 digits (#254).

### `src/lib/phone.ts`

**`const DEFAULT_COUNTRY_CODE`**

- Phone normalisation for the bot allow-list. Shared (not `$lib/server/`) because the settings UI formats for display while the server normalises for storage — same rules or a displayed-valid number fails to match on the way in. Storage = Meta's `from` format: E.164 without '+'. Bare national numbers get '34' — Spain-first; a 9-digit Spanish number is unambiguous.

**`const MIN_DIGITS`**

- 8 — E.164 allows 15; below ~8 nothing is a real mobile.

**`function normalizePhoneNumber`**

- Digits only, no '+', country code included; accepts "+34 612 345 678", "0034-612345678", "612 345 678". Strip a leading "00" (written-out prefix) before length checks; add the default country code before the min-length check so a 9-digit Spanish mobile isn't rejected.

**`function waMeLink`**

- Click-to-chat (#319). wa.me wants digits only and rejects '+', exactly the stored shape — a link opening the wrong chat would mean the allow-list is wrong too.

**`function formatPhoneNumber`**

- Display "+34 612 345 678"; storage stays digits-only.
