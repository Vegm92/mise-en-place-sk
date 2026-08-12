# ADR-015 — Batches Replace Single-File Upload Sessions

**Status:** Active — amends [ADR-002](./ADR-002-durable-extraction-pipeline.md)
**Feature:** Ingestion
**Date:** 2026-08-09

## Context

[ADR-002](./ADR-002-durable-extraction-pipeline.md) established the durable
pipeline: pg-boss for the work, a database row as the state machine, polling for
the UI. That decision holds. Its *unit* did not.

`upload_sessions` modelled one upload as one file. That matches a phone camera
and nothing else. The actual behaviour of a restaurant doing paperwork is a stack
of ten delivery notes at the end of the week — and with one session per file that
means ten uploads, ten navigations, ten confirmations, and no notion of "where
was I in the stack".

There was also no shared shape for a channel other than the web form to plug
into, which is what made the WhatsApp path implement its own state machine
(the divergence [ADR-004](../whatsapp/ADR-004-whatsapp-converges-on-batch-pipeline.md)
closed).

## Decision

**`upload_batches` (a stack) with ordered `batch_items` (a document each)
replaces `upload_sessions`.** ADR-002's mechanics carry over unchanged: pg-boss
job per item, database row as state, `/api/batch-status` polling. Only the grain
changed — and the queue message changed with it, from `sessionId` to `itemId`.

### The item state machine

```
pending → queued → extracting → done ─┬→ confirmed
                          │           └→ discarded
                          └→ failed ──→ (retry: queued) | discarded
```

Seven states rather than ADR-002's five, adding the two terminal outcomes of
review — `confirmed` and `discarded` — so a batch knows which of its documents
are still open.

### Every transition is a guarded conditional update

`transition(itemId, from[], set)` updates **only if the row's current status is in
`from`**, and returns whether it matched:

```typescript
markExtracting: ['queued']                                    → 'extracting'
markDone:       ['extracting', 'queued']                      → 'done'
markFailed:     ['queued', 'extracting']                      → 'failed'
markConfirmed:  ['done']                                      → 'confirmed'
markQueued:     ['pending', 'failed']                         → 'queued'
```

Illegal transitions cannot happen, and a duplicate pg-boss delivery cannot move a
`confirmed` item back to `extracting`. `markDone` accepts `queued` as well as
`extracting` because a worker that crashed between claiming and marking should
still be able to land its result.

`markDiscarded` accepts every non-terminal state: a user may always throw a
document away.

`removeItem` deletes only `pending` or `failed` items — you cannot delete a
document out from under a running extraction.

### Batch-level navigation

`pickActiveItem` prefers `done` over `failed`, so the review screen always shows
the item that can be acted on rather than the first that errored.
`nextReviewableItem(batchId, afterPosition)` walks forward through open items and
wraps, which is what makes "confirm, next, confirm, next" work through a stack.
`isBatchSettled` reports when nothing is left open.

### Ownership is checked at the caller, by design

`getItem` and `getBatchItems` are keyed by id and **return `restaurantId` on every
row** rather than filtering by tenant internally. Each carries a `tenant-scope-ok`
comment stating that callers must compare. This is a deliberate exception to
[ADR-001](../tenancy/ADR-001-app-level-tenant-scoping.md)'s usual shape, taken
because the worker legitimately loads items outside any request's tenant context —
and it is the exception that most needs the annotation, since the reviewer must
be able to see that every call site does the check.

Both functions validate the UUID shape first and return empty for anything
malformed, so a probe with a non-UUID id never reaches the database.

## Consequences

- **`upload_sessions` is vestigial but not dropped.** Nothing writes to it. Two
  readers remain — `/api/health`'s queue-depth probe and the admin dashboard's
  "in flight" tile — and both now count a table that is permanently empty, so they report
  zero regardless of real queue depth. Repointing them at `batch_items` is
  tracked in [#425](https://github.com/Vegm92/mise-en-place-sk/issues/425);
  until then, do not read those two numbers as live.
- **Batches expire after 24 hours.** `cleanupStaleBatches` deletes
  `upload_batches` older than a day, cascading to items, and is fired from
  `hooks.server.ts` at boot. An abandoned half-reviewed stack does not
  accumulate; a stack left open over a weekend is gone on Monday.
- **Cleanup deletes files, then rows.** The sweep now removes the storage object
  behind every non-`confirmed` item in a stale batch before deleting the
  `upload_batches`/`batch_items` rows — a `confirmed` item's file is skipped
  because it has become the invoice's `source_file` and is owned by invoice
  file retention instead ([ADR-011](../insights/ADR-011-scheduled-jobs-in-the-worker.md)'s
  purge job). A storage delete failure is logged and counted, not thrown, so one
  bad key never blocks the rest of the sweep or the row cleanup
  ([#427](https://github.com/Vegm92/mise-en-place-sk/issues/427)).
- **The extraction job payload still accepts `sessionId`** as a fallback for
  `itemId` in `processExtractionJob`. That is migration compatibility for jobs
  enqueued under the old shape and can be removed once no such jobs can exist
  (alongside [#425](https://github.com/Vegm92/mise-en-place-sk/issues/425)).
- **A new ingestion channel now has a shape to target**: create a batch, add
  items, enqueue. That is exactly what ADR-004 had WhatsApp do.

## Related

- [ADR-002](./ADR-002-durable-extraction-pipeline.md) — the pipeline this amends
- [ADR-004](../whatsapp/ADR-004-whatsapp-converges-on-batch-pipeline.md) — the second channel on this model
- [ADR-008](../invoicing/ADR-008-single-invoice-write-path.md) — what `confirmed` triggers
