# ADR-035 — A PDF's structure is decided before its fields are extracted

**Status:** Active
**Feature:** ingestion
**Date:** 2026-08-31
**Issue:** [`docs/03_features/multi_invoice_document_detection.md`](../../03_features/multi_invoice_document_detection.md)

## Context

The extraction pipeline was built on an assumption nobody had written down: one
uploaded file is one invoice. `extractInvoice()` sends the whole file to Gemini
and gets a single `ExtractedInvoice` back (ADR-006), and the batch model treats
one file as one reviewable item (ADR-015).

A real supplier packet broke that assumption. A restaurant scanned what its
supplier had sent in one envelope: an 18-page PDF whose first page is a
*listado de facturas pendientes de cobro* and whose remaining 17 pages are 17
separate facturas, one per page, from the same supplier to the same customer.
The scanner produced image-only pages, so there is no text layer to read.

Sent to the extractor whole, that document does not fail. It returns one
invoice, with one number, one date and one total, and the other sixteen
invoices silently disappear into its line items. A hard failure would have been
recoverable; an apparently valid extraction is silent financial data
corruption, and it reaches spend analytics, price alerts and budgets as if it
were true.

Alternatives considered:

- **Teach the extraction prompt about composite documents.** Rejected: the
  extractor's response schema is a single invoice, so a better prompt has
  nowhere to put the other sixteen. It also entangles two questions — *what is
  this document* and *what are this invoice's fields* — that fail differently
  and evolve at different rates.
- **Split every multi-page PDF into one item per page.** Rejected: it corrupts
  the opposite case just as silently. A three-page factura would become three
  invoices, two of them headerless fragments.
- **Refuse multi-page PDFs and ask the user to split them.** Rejected as the
  end state (it moves the work onto the person who has the least tooling for
  it), but kept as the fallback when the structure genuinely cannot be
  determined.
- **Extract every page separately and merge results afterwards.** Rejected: it
  pays for N extractions to discover that a three-page invoice was one invoice,
  and reconciling partial extractions is harder than classifying pages.

## Decision

Ingestion gains a structure-detection stage that runs in the worker, before
extraction, for every PDF batch item:

```
batch item (.pdf)
	↓
detectDocumentStructure()          src/lib/server/document-structure.ts
	├── single      → extract the file as it is (today's path)
	├── composite   → split into one batch item per document, discard the source item
	└── unclear     → fail the item with extract.err.structureUnclear (human review)
```

- **Page signals, not invoice fields.** The detector labels each page
  `document` (starts a new factura/albarán), `continuation` (continues the
  previous one) or `cover` (index, listing, account statement, separator), plus
  the document number printed on it. It never extracts line items or totals.
- **Two detection routes, cheapest first.** A PDF whose every page carries at
  least `MIN_PAGE_TEXT_CHARS` (80) of text is segmented deterministically from
  that text — no LLM call. A scanned PDF goes to the LLM through the existing
  provider seam (ADR-007) with its own prompt and response schema, and its
  usage is recorded under the `document-structure` caller context.
- **Segments become batch items.** `segmentDocument()` writes each segment as
  its own PDF through the storage seam (ADR-016), adds one batch item per
  segment to the same batch, queues them, and marks the source item
  `discarded`. The source file is kept. Each segment is then reviewed and
  confirmed exactly like a separately uploaded file, so the invoice write path
  (ADR-008) is untouched.
- **Segment keys are derived, not random:** `ns/packet_ab12cd.pdf` →
  `ns/packet_ab12cd_p2.pdf`. A redelivered job recognises the children it
  already created instead of duplicating them.
- **A fanned-out document costs no extraction.** The monthly slot claimed for
  the source item is released when it is split or sent to review; each child
  claims its own.
- **Bounds.** Structure detection is attempted for at most
  `MAX_STRUCTURE_PAGES` (40) pages and `MAX_STRUCTURE_BYTES` (15 MB, below the
  provider's inline-request ceiling). Beyond either bound the answer is
  `unclear`, not a guess.
- **Thresholds are provisional.** `MIN_VISION_CONFIDENCE` (0.7) is a starting
  point, not an empirical result: below it a composite classification is
  downgraded to `unclear`. It should be re-derived from the extraction corpus
  once real composite documents have accumulated.

## Consequences

- The dangerous structure is gone: a packet no longer reaches a single-invoice
  extractor as one document. What the user gets instead is one reviewable
  invoice per document, which is what they would have got by splitting the PDF
  by hand.
- A cover/index page is dropped rather than extracted. If the cover detector is
  wrong about a page, that page is not extracted at all — a visible gap in the
  batch, not a corrupted invoice.
- Scanned composite documents cost one extra LLM call per document, before any
  extraction. Text-layer PDFs cost nothing extra.
- Splitting multiplies quota consumption in a way the upload-time quota check
  (`remainingMonthlyQuota`, which counts files) cannot see. A packet whose
  segments exceed the tenant's remaining allowance produces items that fail
  individually with `extract.err.quotaExceeded`. Making the pre-check
  page-aware is deliberately left out of this ADR.
- `unclear` is a dead end for the user: the message asks them to split the file
  themselves. A manual boundary-editing UI (spec §11, §15) is the intended
  follow-up; until it exists, review means re-upload.
- Segments inherit `source`/`sourceRef` from the item they came from, so a
  WhatsApp packet replies once per invoice instead of once per file.
- Structure decisions are visible in worker logs (`[segmentation] …`) and an
  `extraction.structure_unclear` Sentry warning. The per-document metrics the
  spec asks for (§23) are not implemented.
- Held in place by `tests/pdf-pages.test.ts`,
  `tests/document-structure.test.ts`, `tests/document-segmentation.test.ts`
  and the composite-document block of `tests/extraction-worker.test.ts`.
- Adds `pdf-lib` as a runtime dependency: `unpdf`/pdf.js can read a PDF but
  cannot write one, and splitting requires writing.

## Related

- [ADR-006](../extraction/ADR-006-file-classification-routes-extraction.md) — file class routes extraction; this decision runs before it
- [ADR-007](../extraction/ADR-007-llm-provider-seam.md) — the seam the vision classifier calls through
- [ADR-015](./ADR-015-batches-replace-single-file-sessions.md) — the batch item is the unit a segment becomes
- [ADR-016](./ADR-016-storage-driver-and-upload-validation.md) — segments are written through the same storage seam
- [ADR-002](./ADR-002-durable-extraction-pipeline.md) — the worker state machine the new stage runs inside
