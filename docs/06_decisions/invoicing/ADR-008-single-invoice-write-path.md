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
the insert. `claimRequest` inserts into `idempotency_keys` (`form-submit`
scope since #389) with
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
fixing real invoices, not by a benchmark.

## Editing an invoice is a second writer, sharing one enrichment path

`saveReviewedInvoice` creates invoices. It does not own the *only* write to
`invoice_line_items`: the edit action at `invoice/[id]/edit/+page.server.ts`
delete-and-reinserts every line, because a user may add, remove or reorder rows.

Until #481 that second writer reinserted five columns and dropped the other nine
— `product_id`, `tax_rate`, and the whole pack/unit block — and never recomputed
`content_hash`, so correcting a typo silently severed an invoice from the product
catalogue and from guard 2.

Both writers now go through the same four exported helpers:

| Helper | Responsibility |
|---|---|
| `parseLineInputs(formData)` | parallel form arrays → one line record each, `parsePack` applied |
| `enrichLineItems(rid, supplier, lines)` | `resolveUnit` + `normalizedUnitPrice` → the full 14-column insert payload |
| `computeFormContentHash(header, formData)` | the canonical hash, identical on both paths |
| `linkProductsToInvoice(...)` | re-resolves `product_id` after the rows land |

Sharing `computeFormContentHash` is what keeps guard 2 honest across the two
writers: an edited invoice and a freshly-reviewed one with the same values must
produce the same hash, or re-importing the document would slip past.

The edit path deliberately does **not** re-run the alert rules. Alerts are
computed on save (ADR-010); re-firing a price-shock alert on every typo fix would
make the notification feed unusable. It does write an `invoice_audit_log` row with
the pre-edit invoice and line items, so the discarded enrichment is recoverable.

## Consequences

- **New ingestion channels must call `saveReviewedInvoice`.** Reimplementing the
  insert — even "just for one channel" — reintroduces exactly the divergence
  ADR-004 was raised to close, and the unit bridge and alert engine would be
  skipped again.
- Form-submit claims are swept after 48 h. Since #389 they live in
  `idempotency_keys` under the `form-submit` scope and are swept by the worker's
  scheduled `sweepIdempotencyKeys`, not at web-process boot. Replay protection
  therefore has a 48 h horizon, which comfortably exceeds any real browser
  retry.
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
