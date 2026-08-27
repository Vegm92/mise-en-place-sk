# ADR-019 — The Phone Number Is the Tenant Key, Bound by a Short-Lived Pairing Code

**Status:** Active
**Feature:** WhatsApp
**Date:** 2026-08-09

## Context

[ADR-004](./ADR-004-whatsapp-converges-on-batch-pipeline.md) made WhatsApp an
ingestion channel into the batch pipeline. It left open the question that channel
cannot avoid: **an inbound WhatsApp message arrives with no session, no cookie
and no user — only a phone number. Which restaurant does it belong to?**

Getting this wrong in either direction is bad. Too loose, and someone who guesses
a number files invoices into another restaurant's books. Too strict, and the
kitchen porter who actually photographs the delivery notes cannot use the feature
because they do not have an app login.

## Decision

**`whatsapp_contacts.phone_number` is globally unique and maps a number to
exactly one restaurant.** Tenant resolution for an inbound message is a lookup on
that number, and it is the first thing `handleWhatsAppMessage` does after
de-duplication.

That query is annotated `tenant-scope-ok` with an explicit rationale: it *is* the
tenant resolution step, so there is no tenant context to scope it by. This is the
narrowest legitimate exception to
[ADR-001](../tenancy/ADR-001-app-level-tenant-scoping.md) in the codebase, and it
is why the uniqueness constraint on the phone number is load-bearing rather than
a convenience.

An unknown number gets no data, ever. Its only affordance is to send a pairing
code.

### Pairing: a 6-character code, 15 minutes, one use

Generated in the app by a logged-in user; typed into WhatsApp by whoever will be
sending photos.

- **Alphabet excludes look-alikes.** `23456789ABCDEFGHJKMNPQRTUVWXYZ` — no `0`/`O`,
  `1`/`I`/`L`, `S`/`5`. The code gets read off a screen and typed on a phone
  keypad, often by someone in a hurry in a loading bay.
- **`randomInt` from `node:crypto`**, not `Math.random`. 30 symbols over 6
  positions is ~7.3 × 10⁸ codes; a guessable code is an account takeover.
- **15-minute TTL.** Long enough to walk the code to someone, short enough that a
  screenshot left in a chat is worthless.
- **Generating a new code revokes outstanding ones** (expiry set to epoch), so
  there is never more than one live code per restaurant.
- **Redemption is a conditional UPDATE**, claiming the row only if it is
  unredeemed and unexpired, returning the restaurant. Two people racing the same
  code: one wins, the other gets `invalid`.

### Redemption rolls back if the contact cannot be added

If `addContact` fails after the code has been claimed — most often because the
number already belongs to another restaurant — the redemption is **undone**
(`redeemedAt`/`redeemedBy` reset to null) and the caller gets `taken`. The code
was not really used, so it should not be burned. Compensating for a failed second
step rather than leaving the user with a dead code and no explanation.

### Rate limits on both halves

`whatsapp-pair:<phone>` — 5 redemption attempts per hour, keyed by the sender's
number, so brute-forcing the code space is not on the table.
`whatsapp-pair-gen:<restaurantId>` — 10 generations per hour, so the code
endpoint cannot be used to churn rows.

### Every inbound message is authenticated and de-duplicated

**Signature.** The webhook verifies Meta's `x-hub-signature-256` HMAC with
`timingSafeEqual` after a length check. In production a missing
`WHATSAPP_APP_SECRET` **rejects** the request; outside production it warns and
allows, for local testing. Same shape as the Stripe webhook
([ADR-013](../billing/ADR-013-tiers-trial-and-quota.md)) — there is no
configuration where production accepts an unverified webhook.

**Replay.** `claimMessageId` claims Meta's message id with
`ON CONFLICT DO NOTHING` — in `whatsapp_processed_messages` when this ADR was
written, in the shared `idempotency_keys` ledger under the `whatsapp` scope
since #389. Meta redelivers on
any non-2xx, and without this a redelivered photo would create a second batch.
A *failed* claim (database error) returns `true` and processes anyway: losing an
invoice to a bookkeeping table's outage is worse than risking a duplicate the
downstream dedup guards in
[ADR-008](../invoicing/ADR-008-single-invoice-write-path.md) will catch.

### Unknown senders get one reply per 6 hours

`UNAUTHORIZED_REPLY_COOLDOWN_S` throttles the "send me a pairing code" response.
Without it, a wrong number or a spam bot turns the app into a message amplifier
at Meta's per-message price.

## Consequences

- **One number, one restaurant.** A manager working across two locations in a
  `business` group cannot send to both from one phone. Deliberate: making the
  number ambiguous would mean asking "which restaurant?" on every photo, which
  defeats the point of the channel.
- **Anyone holding the number can file invoices.** The trust boundary is device
  possession, which is the same trust model as the WhatsApp account itself. This
  is the intended trade — the porter photographing deliveries needs no login.
- **Revocation is per-contact**, by removing the row. There is no per-message
  audit of who sent what beyond the phone number recorded on the batch.
- **The WhatsApp tables have distinct lifetimes**: `whatsapp_contacts` is the
  durable binding, `whatsapp_pairing_codes` is short-lived, and
  message-dedup claims are ephemeral. #389 moved them into the shared
  `idempotency_keys` ledger under the `whatsapp` scope, which the worker's
  `sweepIdempotencyKeys` expires after 48 h — closing the unbounded growth
  noted in [#428](https://github.com/Vegm92/mise-en-place-sk/issues/428).
- `whatsapp_bot_sessions` is gone (migration `0026`), per ADR-004's completed
  cutover. Nothing here reintroduces a channel-specific state machine.

## Update — binding requires pairing (issue #498)

The global unique index stayed exactly right for routing; what was wrong was
*who could write a row*. Settings' manual "type a phone number" form called
`addContact` directly, so any owner — of any restaurant — could type in a
number they did not control. Best case that misrouted staff; worst case it
was a standing way to squat a competitor's number, since there was no proof
of control and no visible unbind path.

**Manual entry no longer binds. It invites.** `addWhatsappContact` now calls
`generatePairingCode` with the typed number as a target
(`whatsapp_pairing_codes.phone_number`, migration `0045`), the same function
the existing "generate a code" flow already used untargeted. `whatsapp_contacts`
— the table `resolveRestaurantId` actually routes on — is now written in
exactly one place: `redeemPairingCode`. A targeted invite additionally checks
the redeeming sender's number against the invite before calling `addContact`;
a mismatch is released and answered identically to an unknown/expired code
(reason `'invalid'`), so a wrong number teaches an attacker nothing. An
untargeted code (`phone_number IS NULL`) keeps its original behaviour: the
first phone to send it wins it.

**"Taken" no longer discloses.** The old settings error
(`set.whatsapp.err.taken`, "ya está autorizado en otro local") is gone —
`addWhatsappContact` never checks whether the invited number is already
bound, so inviting an available number and inviting a squatted one look
identical from Settings; the real availability check still happens, but only
at redemption, from the phone that would have to prove control anyway. The
bot's redemption-time reply for that case (`message-handler.ts`) is reworded
to a neutral "no se ha podido vincular este número" that no longer names
"otro local".

**Release is a real path, audited.** `removeContact` (owner, via Settings)
and the new `releaseContactByPhone` (support, via `/admin/whatsapp` — the
only place that may look a number up without tenant scope, gated by
`isAdminUser`) both delete the `whatsapp_contacts` row and write a
`trackEvent('whatsapp_contact_released', ...)` row (`system_notifications`),
so a release has an audit trail and the number is immediately free for
another tenant's pairing invite to claim.

## Related

- [ADR-004](./ADR-004-whatsapp-converges-on-batch-pipeline.md) — the ingestion convergence
- [ADR-001](../tenancy/ADR-001-app-level-tenant-scoping.md) — the boundary this resolves into
- [ADR-015](../ingestion/ADR-015-batches-replace-single-file-sessions.md) — what a paired message creates
