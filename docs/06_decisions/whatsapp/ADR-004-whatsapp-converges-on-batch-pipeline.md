# ADR-004 — WhatsApp Ingestion Converges on the Batch Upload Pipeline

**Status:** Active  
**Feature:** WhatsApp  
**Date:** 2026-08-02  
**Issue:** [#348](https://github.com/Vegm92/mise-en-place-sk/issues/348)

## Context

WhatsApp invoice intake runs its own parallel state machine — `whatsapp_bot_sessions`
(`status: awaiting_confirmation → confirmed | discarded`, 1h TTL) driven by
`whatsapp-bot.ts` — instead of feeding the `upload_batches`/`batch_items` pipeline the
web upload flow uses (ADR-002). Confirmation today happens **inline over WhatsApp**: the
bot extracts the invoice synchronously in-request, replies with a summary, and waits for
a SÍ/NO text reply. On SÍ, `saveWhatsAppInvoice` runs its own transaction: supplier
upsert, content-hash dedup, invoice-number dedup, and a raw `INSERT INTO
invoice_line_items` — hardcoding `requiresUnitConversion: 0, canonicalUnit: null` on
every line.

This means two independent invoice-creation pipelines exist, and they've already
diverged: the unit bridge (`products.ts`: `resolveUnit`, `parsePack`,
`normalizedUnitPrice`) and the alert engine (`alerts.ts`: price-shock, stock-forecast,
budget-check, categorization) only run inside `invoice-save.ts`'s `saveReviewedInvoice`,
which only the `/batch/[id]` review page calls. Every invoice submitted via WhatsApp
silently skips both. `docs/APP_AUDIT.md` (local-only, gitignored) documented this same
divergence pattern for the previous `pending_invoices` design before ADR-002 replaced
it — this is a recurring gap, not a one-off, and the fix this time should close the
pipeline fork rather than move it.

## Decision

**WhatsApp becomes an ingestion channel that hands off to the existing web review
screen for confirmation.** A WhatsApp inbound message with an invoice attachment creates
an `upload_batches` row + one `batch_items` row via `batch-core.ts` (reused, not
reimplemented), flows through the same extraction worker (`extraction-worker.ts`,
`annotateLineItems` unit bridge included), and the bot's reply becomes a link to
`/batch/[id]` instead of an inline extracted-data summary. Confirming, discarding, and
retrying all happen on the existing web page — `saveReviewedInvoice` (unit bridge +
alert engine included) is the only invoice-creation code path going forward. The
SÍ/NO inline handshake is retired for the new path.

**Cutover: dual-run bake period, gated by a feature flag.** No existing mechanism for
this exists in the codebase (checked: no flags table, no config abstraction — just
`env.ts` constants). A new boolean env var (e.g. `WHATSAPP_USE_BATCH_PIPELINE`,
following the existing `env.ts` pattern) selects old vs. new path per inbound message,
default **off** in prod until verified. In-flight `whatsapp_bot_sessions` rows already in
`awaiting_confirmation` are left alone — they keep resolving on the legacy
`handleTextReply` handler until confirmed, discarded, or their existing 1h TTL expires.
No forced migration or abandonment of in-flight sessions. Once the new path is verified
in prod, a follow-up issue removes the flag and the legacy `whatsapp_bot_sessions`
code path (`handleMediaUpload`'s synchronous extraction, `handleTextReply`,
`saveWhatsAppInvoice`).

## Consequences

- `whatsapp-bot.ts`'s webhook entrypoint (`src/routes/api/whatsapp/webhook/+server.ts` →
  `handleWhatsAppMessage`) gains a flag-gated branch: new path creates a batch/item and
  replies with a `/batch/[id]` link; old path is untouched by this decision and keeps
  running exactly as today for the bake period.
- Dedup logic (`dedup.ts`'s `computeInvoiceContentHash`) stays duplicated at two call
  sites (`whatsapp-bot.ts` legacy path, `invoice-save.ts`) only until the legacy path is
  removed post-bake; the new path uses `invoice-save.ts`'s copy exclusively, closing the
  divergence for good going forward.
- The inline SÍ/NO confirmation UX is a deliberate regression for WhatsApp users on the
  new path (an extra tap/link vs. a same-chat reply) traded for pipeline convergence;
  not revisited in this ADR.
- Existing tests (`whatsapp-bot.test.ts`, `whatsapp-webhook.test.ts`,
  `whatsapp-api.test.ts`) must keep passing unmodified for the legacy path; new tests
  cover the bridge path added under the flag. See issue #349.
- Follow-up issue (opened after prod verification) removes the flag and deletes the
  legacy `whatsapp_bot_sessions` state machine, `handleMediaUpload`'s inline extraction,
  `handleTextReply`, and `saveWhatsAppInvoice`.

## Update — cutover complete (issue #350)

`WHATSAPP_USE_BATCH_PIPELINE` and the legacy `awaiting_confirmation` state machine
(`handleTextReply`, `saveWhatsAppInvoice`, `getPendingSession`, the inline synchronous
extraction in `handleMediaUpload`) are deleted. The batch-bridge path is now the only
path. `whatsapp_bot_sessions` is dropped (migration `0026_drop_whatsapp_bot_sessions.sql`).
The other four WhatsApp tables (`whatsapp_contacts`, `whatsapp_pairing_codes`,
`whatsapp_processed_messages`, `whatsapp_account_events`) serve purposes independent of
the session/confirmation machine — contact directory, onboarding, webhook-redelivery
dedup, and Meta account health — and were kept as-is. Of those, the dedup table
was later folded into the shared `idempotency_keys` ledger (#389); the dedup
behaviour it provided is unchanged.

