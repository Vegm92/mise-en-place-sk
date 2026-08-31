# ADR-036 — One metered unit: the document we extracted

**Status:** Active
**Feature:** billing
**Date:** 2026-08-31

## Context

A restaurant uploaded the 18-page supplier packet of
[ADR-035](../ingestion/ADR-035-document-structure-before-extraction.md) — a
cover listing plus 17 facturas — was told partway through that its quota was
exceeded, cancelled the batch, and then saw a counter that had not moved at
all. Neither half of that was a bug in isolation. Both were the same bug: the
app had three different answers to "how much has this tenant used this month?"
and the one it enforced was not the one it displayed.

| Counter | Read by | Counted |
|---|---|---|
| `COUNT(invoices)` this month | upload pre-check, sidebar counter, 80% warning email | invoices **saved** |
| `monthly_usage.used` | `claimMonthlyExtraction` — the only hard gate | extractions **claimed** |
| `COUNT(llm_usage_log)` | internal cost cap (`tenant_llm_quotas`) | LLM calls |

The packet walked straight through the gap. The upload pre-check compared
`files.length` (one file) against invoices-remaining and let it in — it has no
way to know a PDF holds seventeen documents. The worker claimed one slot, the
structure stage found a composite, released that slot and queued 17 children,
and each child then claimed on its own account. The limit landed partway down
that queue, so the first few extracted and the rest failed with
`extract.err.quotaExceeded`: a wall discovered *after* the upload was already
committed, with a half-processed packet behind it.

Then the cancel. `discardItem`, `discardBatch` and `remove` never called
`releaseMonthlyExtraction`, so `monthly_usage.used` kept every slot the
successful extractions had taken. But the number on screen counted `invoices`,
and a discarded item never becomes one. Nothing was refunded; the two counters
had simply drifted, as they had been drifting since the day the counter was
added — one-directionally, upward, every unconfirmed extraction and every
discard widening the gap, with no way to audit it and no way to explain it to a
customer who asked.

The same seventeen documents were also treated in two incompatible ways: as 17
separate PDFs the door check rejected them outright; inside one file it
half-processed them.

## Decision

**One unit, one ledger, one defined moment of consumption: a document sent to
the extractor.**

That is what costs money at Gemini and what "100 documentos procesados al mes"
sells. Not an invoice saved — that would let a tenant extract five hundred
documents and confirm five, and it moves the meter at the wrong moment.

### Every quota surface reads the same row

`getMonthlyUsage()` is the only way to ask the question. The sidebar counter,
the billing card, the upload pre-check, the 80% warning email and the worker's
own gate all call it. Nothing counts `invoices` for quota purposes anywhere.

The claim now also counts for **unlimited** tenants; it just never refuses
them. Returning early on `limit === null` left business-tier restaurants with
no `monthly_usage` row at all, which was invisible only because the display
read a different table — the moment it read this one they would have shown a
permanent zero.

### `usage_events` is the trail the counter is a sum of

For any tenant and month, `SUM(usage_events.delta) = monthly_usage.used`. The
counter stays as the concurrency-safe gate — a conditional `UPDATE` is what
makes "is there room?" atomic — and the ledger records why it holds the value
it holds. "Why does it say 47?" is now answerable, and a support credit is a
row rather than an unexplained decrement.

Idempotency is a **per-item balance**, not a unique key. An item's balance is 0
(owes nothing) or 1 (holds a slot); a claim requires 0, a release requires 1,
and a transaction-scoped `pg_advisory_xact_lock` on the item id serialises the
pair. A unique `(batch_item_id, kind)` index was the first design and is wrong:
an item that failed, was refunded and is then retried — which both the batch
retry action and the admin dead-letter requeue do — has to be able to claim a
second time, and the index would have handed it a free extraction instead.

The counter's guard is evaluated on a seeded row rather than folded into an
upsert's `setWhere`, because `setWhere` is skipped for the month's first event:
there is no row to conflict with, and a 17-document packet would land straight
past the limit.

### Quota for a composite is settled at the structure stage, all or nothing

The structure stage is the one moment the packet's true size is known and
nothing has been spent on it. If the whole packet does not fit, **none of it is
extracted**: the source item fails with `extract.err.quotaCompositeExceeded`,
carrying the counts so the message can say *"este archivo contiene 17
documentos y solo te quedan 8 este mes"* — and pointing at the upgrade.

Claiming per child is what produced the original half-processed batch, so
partial processing is not offered. The container item's own slot is handed back
*before* the packet is priced; otherwise a packet of N would need N+1 free and
a tenant with exactly N left would be refused.

The reservation is one bulk row, since the children do not exist yet;
`attributeReservation` re-keys it onto them once they do, with a balancing
negative row so `SUM(delta)` matches the counter at every intermediate point.
Each child then finds a balance of 1 and does not pay twice, and cancelling one
child refunds exactly one slot.

### Consumption is the extraction call, not the save

Cancel refunds an item that never reached the model (`pending`, `queued`,
`failed`); it never refunds one that did (`done`, `confirmed`). `extracting` is
in flight and belongs to the worker. This is the line the plan copy now states
rather than implies — "documentos procesados", not "albaranes".

"Documentos" and not "albaranes" or "facturas" for a second reason: the
structure stage does not know which it is until after it has looked, and a
single upload routinely holds both.

### The structure-detection call stays off the customer's counter

It hits Gemini and is recorded in `llm_usage_log` as `document-structure`, but
it is the system deciding what a file is, not a document the customer asked to
have processed. That is now a written decision rather than a side effect of
where the release happened to sit.

## Consequences

- **The displayed number will be larger than the invoice count**, and should
  be: it includes extractions the user discarded. That is the honest number,
  and the plan copy now says which one it is.
- **Historic drift is forgiven, once.** Migration 0063 resets the current
  month's `used` to that month's invoice count. Tenants were never shown the
  drifted value, so shipping it would make counters jump and could push someone
  over their limit for consumption they were never told about. Metering is
  exact from the next extraction onward. Unlimited tenants, who have no row to
  reset, open at zero.
- **A tenant can still be refused after uploading.** The door check counts
  files and cannot see inside them; only the structure stage can. The
  difference is that the refusal is now whole-packet, up front, and priced —
  not discovered halfway down a queue.
- **Two writes per metered event** (ledger row plus counter), in one
  transaction, plus an advisory lock on the per-item paths. The extraction call
  they guard takes seconds, so the cost is not measurable where it lands.
- **`usage_events.batch_item_id` is not a foreign key.** The ledger has to
  outlive the item it describes — the batch `remove` action hard-deletes rows —
  and a composite reservation exists before its children do.
- **The 80% warning fires on the right meter.** Counting saved invoices meant
  it missed every extraction a tenant discarded, so it warned late or never.

## Related

- [ADR-013](ADR-013-tiers-trial-and-quota.md) — where entitlement is decided
- [ADR-035](../ingestion/ADR-035-document-structure-before-extraction.md) — the structure stage this reservation hooks into
- [ADR-007](../extraction/ADR-007-llm-provider-seam.md) — the provider seam the claim protects
