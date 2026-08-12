# ADR-008 — One Invoice Write Path, Guarded Four Ways

**Status:** Active
**Feature:** Invoicing
**Date:** 2026-08-09

## Context

Duplicate invoices are the failure mode this app cannot afford. A restaurant that
sees the same delivery counted twice loses trust in every number downstream — the
month's spend, the supplier's price history, the budget warning, the price-shock
alert. And duplicates arrive from four genuinely different directions:

- The same physical document photographed twice, or uploaded once by phone and
  once by desktop.
- A double-submitted form (impatient tap, flaky connection, browser retry).
- The same supplier invoice number arriving on a re-sent document with a
  different scan.
- Two channels ingesting the same document — this is what
  [ADR-004](../whatsapp/ADR-004-whatsapp-converges-on-batch-pipeline.md) closed
  by removing the second write path entirely.

No single guard catches all four. Content hashing misses a re-typed correction of
the same invoice; invoice-number matching misses albaranes with no number;
idempotency keys catch only same-request replays.

## Decision

**`saveReviewedInvoice()` is the only code path that creates an invoice**, and it
runs four independent guards in a fixed order. Each returns a distinct
`SaveOutcome` so the UI can say something specific rather than "already exists".

| # | Guard | Scope | When | Outcome |
|---|---|---|---|---|
| 1 | Low-confidence block | This submission | Pre-transaction | `lowConfidenceBlocked` |
| 2 | Content hash | Tenant, all suppliers | Pre-transaction | `contentDuplicate` (+ the existing invoice id) |
| 3 | Idempotency key | This request | **Inside** transaction | `replay` |
| 4 | Invoice number | Tenant + supplier | **Inside** transaction | `numberDuplicate` |

### Why the ordering is what it is

Guards 1 and 2 are read-only and run **before** the transaction opens, so the
common rejection cases never take row locks.

Guards 3 and 4 run **inside** the transaction because both must be atomic with
the insert. `claimRequest` inserts into `processed_requests` with
`ON CONFLICT DO NOTHING`; losing that insert means another request already claimed
the key, so this one is a replay and returns without writing. Doing the same check
before the transaction would leave a window for a genuine double-submit to pass
both.

Guard 4 releases the idempotency claim (`releaseRequest`) before returning, so a
user who hits a number-duplicate can correct the number and resubmit with the same
key. A claim is only permanent if it produced an invoice.

There is also a **fifth, implicit** guard: the `invoices` insert carries
`onConflictDoNothing()`. If a unique constraint fires despite guards 2–4, an empty
`RETURNING` is treated as `numberDuplicate` rather than crashing. The database is
the last word.

### The content hash is over reviewed data, not extracted data

`computeInvoiceContentHash` canonicalises supplier name (lowercased, trimmed),
invoice number, both dates, total, and every line's description/qty/unit/prices —
then SHA-256s the JSON. It hashes what the **user confirmed**, not what the model
extracted, so two different-quality scans of one invoice that the user corrects
identically produce one hash and are caught. Hashing the extraction output would
make every re-photograph a distinct invoice.

Empty line descriptions are filtered out before hashing, and the parallel arrays
are re-indexed against the filtered set — so an invoice with a blank row in the
middle hashes the same as the same invoice without it.

### Low confidence blocks, but is overridable

Any header field under **0.85** confidence, or a document-level confidence under
0.85, returns `lowConfidenceBlocked` unless the form carries
`low_confidence_ack=true`. This is a speed bump on the review screen, not a
prohibition — the user is the authority on their own invoice. What it prevents is
a *silent* save of fields the model was unsure about.

## Post-commit side effects are non-fatal by construction

Everything after the transaction commits — product linking, all five alert rules,
correction logging, analytics events, the onboarding flag, the quota warning — is
wrapped in a single `try/catch` that logs and continues. The invoice is already
durable at that point.

This is the right trade in one direction only: a failed alert must never lose a
saved invoice. The cost is that alerts are best-effort — a transient failure in
`runPriceShock` silently produces no price alert for that invoice, with no retry.
Accepted deliberately; see
[ADR-010](../insights/ADR-010-alerts-computed-on-save.md) for what that implies
for alert coverage.

`linkProductsToInvoice` carries its own inner `try/catch` for the same reason,
one level finer: product-catalogue linking failing should not cost the invoice
its alerts.

## Every correction is recorded

`logExtractionCorrections` diffs the submitted form against
`item.extractedData` field by field — five header fields plus five fields per
line — and writes each difference to `extraction_corrections` with the original
and corrected values. Comparison is normalisation-aware (`normalizeStr` for text,
`normalizeNum` for numbers), so `1.50` vs `1.5` and `ACME S.L.` vs `acme s.l.`
are not logged as corrections.

This table is the ground truth behind the extraction-quality dashboard. It is the
only unbiased signal the app has about model accuracy: it is generated by users
fixing real invoices, not by a benchmark. It also pairs with the synthetic
benchmark in `synth/`, which measures the same thing against generated documents.

## Consequences

- **New ingestion channels must call `saveReviewedInvoice`.** Reimplementing the
  insert — even "just for one channel" — reintroduces exactly the divergence
  ADR-004 was raised to close, and the unit bridge and alert engine would be
  skipped again.
- `processed_requests` is swept after 48 h (`cleanupProcessedRequests`, fired
  from `hooks.server.ts` at boot). Replay protection therefore has a 48 h
  horizon, which comfortably exceeds any real browser retry.
- `contentDuplicate` returns the existing invoice's id so the UI can link to it.
  `numberDuplicate` cannot, because the match happens on `(supplier, number)`
  inside the transaction where returning the row would mean an extra query for a
  rare case.
- Deleted invoices are excluded from the content-hash lookup
  (`isNull(invoices.deletedAt)`), so re-uploading a deleted invoice succeeds.
  Soft-deletion means "the user removed it", not "this document is banned".
- The four outcomes are a discriminated union (`SaveOutcome`), so a new guard
  means a new variant and TypeScript flags every call site that must handle it.

## Related

- [ADR-009](./ADR-009-unit-normalisation-and-product-identity.md) — what happens to each line
- [ADR-010](../insights/ADR-010-alerts-computed-on-save.md) — the alert rules this path fires
- [ADR-004](../whatsapp/ADR-004-whatsapp-converges-on-batch-pipeline.md) — removing the second write path
