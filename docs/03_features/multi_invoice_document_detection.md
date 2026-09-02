---
tags: [mep, features]
related: "[[CONTEXT]]"
---

# Finding: Multi-Invoice and Composite PDF Detection

Status: IMPLEMENTED (v1) — see section 28
Priority: HIGH
Category: Invoice Ingestion / Document Classification
Severity: HIGH
Detected: 2026-08-14
Implemented: 2026-08-31 (ADR-035)

Sections 1–27 are the original finding and remain the specification. Section 28
describes what was actually built, section 29 answers the open questions from
section 26 against the real architecture, and section 30 is the per-file code
note.

---

## 1. Executive Summary

We have identified a document structure that the current invoice extraction pipeline is not designed to handle safely.

The attached example is a single PDF containing:

1. A first page containing a listing/index of multiple invoices.
2. Multiple subsequent pages, each containing a separate invoice.

The current invoice extractor assumes that the incoming document represents a single invoice.

This creates a structural risk:

If the complete PDF is sent directly to the invoice extractor, the extractor may interpret the document as one invoice instead of identifying that it contains multiple invoice documents.

This can result in:

- incorrect invoice number
- incorrect invoice total
- incorrect supplier/customer association
- mixed line items
- incorrect dates
- duplicated information
- missing invoices
- incorrect accounting records
- incorrect downstream matching
- corrupted extraction confidence
- inability to reconcile the extracted total with the original document

This must be addressed before the system relies on the invoice extractor for production ingestion of arbitrary PDF documents.

---

# 2. Observed Document Pattern

The supplied PDF contains 18 pages.

The first page is a document-level listing rather than an invoice.

It contains a table of pending invoices including fields such as:

- Invoice/reference number
- Registration date
- Due date
- Registered amount
- Accumulated amount
- Envelope/reference information

The first page therefore acts as an index or cover sheet.

The following pages contain individual invoice documents.

For example, the first invoice page contains:

- Supplier: SASAFruit S.L.
- Invoice number: 0010024015569
- Date: 01-07-24
- Customer: Green Planet Nomada Beach S.L.
- Total invoice: 169.03 EUR

The next page contains another invoice:

- Invoice number: 0010024015570
- Date: 01-07-24
- Total invoice: 411.08 EUR

Therefore, the PDF is not one invoice.

It is a composite document containing multiple invoice documents.

---

# 3. The Actual Problem

The current system operates conceptually as:

INPUT PDF
    ↓
INVOICE EXTRACTOR
    ↓
ONE INVOICE

This assumption is unsafe.

The actual input space is:

INPUT DOCUMENT
    ↓
DOCUMENT CLASSIFICATION
    ↓
DOCUMENT STRUCTURE DETECTION
    ↓
    ├── SINGLE INVOICE
    ├── MULTI-PAGE SINGLE INVOICE
    ├── MULTIPLE INVOICES
    ├── COVER/INDEX + MULTIPLE INVOICES
    └── UNKNOWN / AMBIGUOUS
             ↓
      APPROPRIATE PROCESSING

The invoice extractor should not receive a document until the system has determined what type of document it is dealing with.

---

# 4. Why This Is a High-Risk Finding

This is not merely an extraction-quality issue.

It is an ingestion architecture issue.

If the system sends an unsupported document structure directly to the invoice extractor, the extractor may still return apparently valid structured data.

This is more dangerous than an explicit failure.

A hard failure tells us:

"Unable to process this document."

A false successful extraction can tell us:

"Invoice total = €X"

when the document actually contained:

Invoice A = €X
Invoice B = €Y
Invoice C = €Z

The resulting data can therefore look valid while being fundamentally wrong.

This is a silent data corruption risk.

---

# 5. Two Different Multi-Page Problems

The system must distinguish between two fundamentally different cases.

## 5.1 Multi-page single invoice

Example:

Page 1:
Invoice header + first line items

Page 2:
Continuation of line items

Page 3:
Totals / payment information

All pages belong to the same invoice.

Expected behaviour:

ONE PDF
    ↓
ONE INVOICE
    ↓
ONE extraction result

The extractor must eventually support this structure.

---

## 5.2 Multi-invoice document

Example:

Page 1:
Invoice listing/index

Page 2:
Invoice A

Page 3:
Invoice B

Page 4:
Invoice C

Expected behaviour:

ONE PDF
    ↓
DOCUMENT CLASSIFICATION
    ↓
MULTIPLE INVOICE DOCUMENTS
    ↓
Invoice A
Invoice B
Invoice C
    ↓
Separate extraction results

The system must not treat these invoices as one document.

---

# 6. New Required Concept: Document Structure Detection

Before invoice extraction, introduce a document-structure detection stage.

Conceptually:

INGESTION

    ↓

DOCUMENT INSPECTION

    ↓

DOCUMENT STRUCTURE CLASSIFICATION

    ↓

ROUTING

    ├── SINGLE_INVOICE
    │       ↓
    │   INVOICE EXTRACTION
    │
    ├── MULTI_PAGE_INVOICE
    │       ↓
    │   MULTI-PAGE INVOICE EXTRACTION
    │
    ├── MULTIPLE_INVOICES
    │       ↓
    │   DOCUMENT SPLITTING
    │       ↓
    │   INVOICE EXTRACTION
    │
    ├── INDEX_PLUS_MULTIPLE_INVOICES
    │       ↓
    │   REMOVE / IGNORE INDEX
    │       ↓
    │   DOCUMENT SPLITTING
    │       ↓
    │   INVOICE EXTRACTION
    │
    └── UNKNOWN
            ↓
        REVIEW / SAFE FAILURE

---

# 7. Proposed Solution

The preferred solution is to introduce a lightweight pre-processing / classification layer before the invoice extractor.

This layer should answer:

> "What does this PDF actually contain?"

It should not attempt to perform full invoice extraction.

Its responsibility is document structure detection.

---

# 8. Document Structure Classifier

The classifier should inspect the document at page level.

Relevant signals may include:

- Page count
- Text density
- Presence of invoice keywords
- Presence of invoice number
- Presence of invoice totals
- Supplier information
- Customer information
- Repeated invoice headers
- Repeated supplier headers
- Repeated customer headers
- Repeated barcode patterns
- Date patterns
- Currency totals
- Table structures
- Page-level visual similarity
- Continuation indicators
- "Invoice" / "Factura" terminology
- Index/list/table-of-invoices patterns
- Sequential invoice identifiers

The classifier should produce a document structure classification rather than attempting to extract the complete invoice.

---

# 9. Important Principle: Classification Before Extraction

Do not ask the invoice extractor to determine whether the input contains multiple invoices if it is not designed for that task.

Separate responsibilities.

Document classifier:

"What is this document?"

Invoice extractor:

"What are the fields of this invoice?"

Document splitter:

"Which pages belong to which invoice?"

This separation reduces complexity and makes the system easier to evolve.

---

# 10. Cover / Index Detection

The supplied example demonstrates an additional pattern:

The first page may contain a list of invoices but may not itself be an invoice.

The system should therefore be capable of identifying pages that function as:

- Cover pages
- Indexes
- Invoice summaries
- Delivery summaries
- Account statements
- Batch summaries
- Envelope listings
- Document manifests

These pages should not automatically be passed to the invoice extractor as invoice pages.

---

# 11. Invoice Boundary Detection

For documents containing multiple invoices, the system must determine invoice boundaries.

Potential signals include:

- New invoice number
- New invoice date
- New supplier
- New customer
- Repeated invoice header
- Repeated barcode
- New total
- Visual template repetition
- Strong page-level similarity
- Page continuation markers

The system should assign pages to logical invoice documents.

Example:

PDF pages:

1 = INDEX
2 = INVOICE A
3 = INVOICE B
4 = INVOICE C
5 = INVOICE D

Should become:

Document segment 1:
Pages 2

Document segment 2:
Pages 3

Document segment 3:
Pages 4

Document segment 4:
Pages 5

Each segment then enters invoice extraction independently.

---

# 12. Multi-Page Invoice Detection

The system must also avoid the opposite mistake.

A repeated invoice-like page does not automatically mean a new invoice.

For example:

Page 1:
Invoice 123
Line items 1–20

Page 2:
Invoice 123
Line items 21–40

These pages must remain together.

Therefore, boundary detection must consider invoice identity.

A repeated invoice number is a strong signal that pages belong to the same invoice.

---

# 13. Proposed Internal Representation

The ingestion system should conceptually represent:

Document

    ├── document_type
    ├── total_pages
    ├── classification_confidence
    └── segments

Each segment should contain:

    ├── segment_type
    ├── page_range
    ├── classification_confidence
    └── extraction_status

A segment classified as an invoice should then produce an Invoice Extraction Job.

This creates a clean separation between:

DOCUMENT

and

INVOICE

---

# 14. Recommended States

Document-level state:

- RECEIVED
- INSPECTING
- CLASSIFIED
- SPLITTING
- READY_FOR_EXTRACTION
- PARTIALLY_PROCESSED
- PROCESSED
- NEEDS_REVIEW
- FAILED

Segment-level state:

- DETECTED
- READY
- EXTRACTING
- EXTRACTED
- VALIDATION_FAILED
- NEEDS_REVIEW
- FAILED

These states should be persisted where necessary so processing can resume safely.

---

# 15. Confidence and Human Review

Classification should not be treated as binary if the detection is uncertain.

For example:

Classification:

MULTIPLE_INVOICES

Confidence:

0.97

This can proceed automatically.

But:

Classification:

MULTIPLE_INVOICES

Confidence:

0.54

should be routed to a review workflow rather than blindly processed.

The exact confidence thresholds should be established empirically after testing real-world documents.

Do not hardcode arbitrary thresholds without evidence.

---

# 16. Safety Rule

The system must prefer:

SAFE FAILURE

over:

SILENT CORRUPTION.

If the system cannot confidently determine document structure, it should not pass the document into an extractor that assumes a single invoice.

Instead:

DOCUMENT
    ↓
UNKNOWN / AMBIGUOUS
    ↓
NEEDS REVIEW

This is preferable to generating an apparently valid but incorrect invoice record.

---

# 17. Detection Does Not Need To Be Perfect

The first implementation does not need to solve every possible PDF structure.

It needs to prevent known dangerous structures from entering unsupported extraction paths.

A pragmatic first version should detect at least:

1. Single-page single invoice
2. Multi-page single invoice
3. Multiple invoices in one PDF
4. Index/cover + multiple invoices
5. Unknown/ambiguous documents

---

# 18. Initial Workaround

Until full multi-invoice extraction is implemented, the safest workaround is:

IF document contains multiple invoices:

    DO NOT SEND TO CURRENT INVOICE EXTRACTOR

Instead:

    Mark document as:
    MULTIPLE_INVOICES_UNSUPPORTED

    Preserve original document.

    Provide a review / splitting workflow.

The user should be informed that the document contains multiple invoices and requires separation before extraction.

This is preferable to attempting to extract the entire PDF as one invoice.

---

# 19. Future Architecture

The desired architecture is:

DOCUMENT INGESTION
        ↓
DOCUMENT CLASSIFIER
        ↓
DOCUMENT SEGMENTER
        ↓
INVOICE EXTRACTION
        ↓
NORMALIZATION
        ↓
VALIDATION
        ↓
MATCHING
        ↓
ACCOUNTING / DOWNSTREAM SYSTEMS

Each component should have one clear responsibility.

---

# 20. Acceptance Criteria

The issue can be considered resolved when:

### Case A — Single invoice

A normal single-page invoice enters the extractor successfully.

### Case B — Multi-page invoice

A single invoice spanning multiple pages remains one logical invoice.

### Case C — Multiple invoices

A PDF containing multiple invoices is identified before extraction.

Each invoice is isolated into its own logical document.

### Case D — Index + invoices

A PDF containing an invoice listing followed by individual invoices is identified.

The index is not extracted as an invoice.

The actual invoices are isolated and processed independently.

### Case E — Ambiguous document

If the system cannot confidently determine the structure, it does not silently process the document as a single invoice.

It enters a review state.

### Case F — Failure recovery

If extraction fails for invoice B, invoice A and invoice C are not lost.

The original document and individual segments remain available.

---

# 21. Required Tests

The test suite should eventually include fixtures for:

- Single-page invoice
- Two-page invoice
- Three-page invoice
- Two invoices in one PDF
- Multiple invoices in one PDF
- Index + multiple invoices
- Multiple invoices from same supplier
- Multiple invoices from different suppliers
- Same invoice number across continuation pages
- Similar invoice templates with different invoice numbers
- Scanned documents
- OCR documents
- Documents with missing invoice numbers
- Documents with poor OCR quality
- Blank pages
- Cover pages
- Account statements
- Delivery notes
- Unknown document structures

---

# 22. Observability

The ingestion system should record:

- Original document identifier
- Number of pages
- Detected document type
- Classification confidence
- Detected segments
- Page ranges
- Extraction route
- Extraction result
- Errors
- Manual overrides

This is important because document classification will evolve over time.

Without this information we will not be able to understand why a document was incorrectly routed.

---

# 23. Metrics

Track at minimum:

- Percentage of documents classified as single invoice
- Percentage classified as multi-page invoice
- Percentage classified as multi-invoice
- Percentage classified as index + multi-invoice
- Percentage classified as unknown
- Classification error rate
- Manual review rate
- Extraction success rate by document type
- False single-invoice classification rate

The most important metric is:

FALSE_SINGLE_INVOICE_RATE

This measures how often a composite document is incorrectly sent through the single-invoice extractor.

---

# 24. Architectural Decision

Decision:

The invoice extractor must not be responsible for determining the overall structure of an arbitrary incoming PDF.

Document structure detection must occur before invoice extraction.

The ingestion pipeline must explicitly distinguish:

- Document
- Document segment
- Invoice

This creates a boundary between document understanding and invoice field extraction.

---

# 25. Priority

Priority: HIGH

Reason:

The current extractor can potentially return apparently valid invoice data from an unsupported composite document.

This creates a risk of silent financial data corruption rather than an obvious processing failure.

The issue should therefore be resolved before broadening ingestion to uncontrolled real-world invoice PDFs.

---

# 26. Open Questions

Before implementation, determine:

1. Can the current ingestion layer inspect page-level text/images before invoking extraction?
2. Can the existing OCR layer provide page-level text?
3. Is there already a document classification component?
4. Is there already a document splitting abstraction?
5. Where should document segments be persisted?
6. Can the current extraction pipeline accept page ranges?
7. Can the extractor process multiple pages when they belong to the same invoice?
8. How are failed extraction jobs currently handled?
9. How are uploaded PDFs currently stored?
10. Should document classification be deterministic, AI-based, or hybrid?
11. What confidence threshold should trigger automatic routing?
12. Should users be able to manually override detected invoice boundaries?
13. Should the original PDF always be preserved?
14. What is the desired behaviour for non-invoice documents?

These questions must be answered from the existing architecture before implementation.

---

# 27. Implementation Principle

Do not attempt to solve this by adding more instructions to the existing invoice extractor.

The problem is upstream.

The system currently needs a new conceptual boundary:

BEFORE:

PDF
↓
Invoice Extractor

AFTER:

PDF
↓
Document Understanding
↓
Document Structure
↓
Document Segmentation
↓
Invoice Extractor

This should be treated as an ingestion architecture improvement rather than an invoice extraction feature.

---

# 28. Implementation (v1, 2026-08-31)

Decision record: [ADR-035](../06_decisions/ingestion/ADR-035-document-structure-before-extraction.md).

The structure stage runs **in the worker**, between claiming the extraction
allowance and calling the extractor, for every batch item whose file is a PDF:

```
batch item (.pdf)
        ↓
detectDocumentStructure()          document-structure.ts
        ↓
   ┌────┴──────────────────────────────────────────────┐
   │ single    → extractWithProvider() as before        │
   │ composite → segmentDocument() fans the batch out   │
   │ unclear   → markFailed('extract.err.structureUnclear')
   └────────────────────────────────────────────────────┘
```

## 28.1 What each classification means

| Kind | When | What happens |
|---|---|---|
| `single` | one page, or one segment covering every page (a multi-page single invoice) | the original file goes to the extractor untouched — unchanged behaviour |
| `composite` | more than one segment, or a cover page to drop | one new batch item per segment, each queued for extraction; the source item becomes `discarded` and its file is kept |
| `unclear` | no text layer and no classifier, a page map that does not cover every page, low classifier confidence, no segment at all, or a document past the size/page bounds | the item fails with `extract.err.structureUnclear`; the user is asked to split the file |

## 28.2 Detection routes

- **Text route (free).** Every page has ≥ `MIN_PAGE_TEXT_CHARS` (80) of text:
  page roles come from the text alone — a cover keyword plus ≥3 date-like rows
  marks a cover; a repeated document number, a `página N de M` marker or a page
  with no document header marks a continuation; a new document number starts a
  new segment.
- **Vision route (one LLM call).** Scanned pages have no text, so the whole PDF
  goes through the provider seam with `STRUCTURE_PROMPT` and a page-map response
  schema: one `{page, role, document_ref, confidence}` per page, no invoice
  fields. Usage is metered as `document-structure`.
- **Bounds.** `MAX_STRUCTURE_PAGES` = 40 pages, `MAX_STRUCTURE_BYTES` = 15 MB.
  Past either bound the classifier is never called and the answer is `unclear`.
- **Threshold.** `MIN_VISION_CONFIDENCE` = 0.7 is provisional (§15 asks for
  evidence): the lowest per-page confidence below it downgrades a composite
  answer to `unclear`. Re-derive it from the extraction corpus once real
  composite documents have accumulated.

## 28.3 Fan-out

`segmentDocument()` (`document-segmentation.ts`) writes each segment with
`splitPdfRanges()`, saves it through the storage seam, adds one batch item per
segment via `addItems()` — inheriting the source item's `source`/`sourceRef` so
a WhatsApp packet still replies per invoice — queues each one, and marks the
source item `discarded`.

Segment keys are derived from the source key
(`ns/packet_ab12cd.pdf` → `ns/packet_ab12cd_p2.pdf`, display name
`packet (p2).pdf`), so a redelivered job skips the children it already created
instead of duplicating them. The monthly extraction slot claimed for the source
item is released when the document is split or sent to review — a document the
worker never extracted must not cost the tenant an extraction.

## 28.4 Acceptance criteria (section 20)

| Case | Status |
|---|---|
| A — single invoice | covered: `single` route, unchanged behaviour |
| B — multi-page invoice | covered: repeated document number / continuation markers keep the pages in one segment |
| C — multiple invoices | covered: one batch item per segment |
| D — index + invoices | covered: cover pages are excluded from every segment |
| E — ambiguous document | covered: `extract.err.structureUnclear`, never a silent single-invoice extraction |
| F — failure recovery | covered: segments fail independently; the source PDF is preserved |

## 28.5 Not yet implemented

- The per-document metrics of §23 (only worker logs plus an
  `extraction.structure_unclear` Sentry warning exist).
- Manual override of detected boundaries (§15, §26 Q12): `unclear` currently
  means "split it yourself and re-upload".
- Document/segment state persistence beyond the existing batch item statuses
  (§13, §14): a segment *is* a batch item, and no new table was added.
- The upload-time quota pre-check still counts files, not the documents a file
  will fan out into.
- No explicit UI notice that a document was separated: on the batch page the
  source file's row is replaced by one row per document (`packet (p2).pdf`,
  `packet (p3).pdf`, …), which is the only signal the user gets.

---

# 29. The open questions (section 26), answered

1. **Can ingestion inspect page-level text/images before extraction?** Yes —
   `pdfPageTexts()` (unpdf, `mergePages: false`) returns text per page.
2. **Can the OCR layer provide page-level text?** There is no separate OCR
   layer; scanned pages are read by Gemini. Hence the vision page-map route.
3. **Is there a document classification component?** There was not; there is
   now (`document-structure.ts`). `classifyFile()` in `extract.ts` classifies
   *file kinds*, not document structure.
4. **Is there a splitting abstraction?** There was not; `pdf-pages.ts` is it.
   `zip-extract.ts` was the closest precedent (one upload → many items).
5. **Where are segments persisted?** As ordinary `batch_items` rows in the same
   batch. No new table.
6. **Can extraction accept page ranges?** No — it takes a file path, so each
   segment is materialised as its own PDF file.
7. **Can the extractor process several pages of one invoice?** Yes, that is
   already the `single` route: the whole file goes to Gemini.
8. **How are failed extractions handled?** `markFailed` + error class, with the
   dead-letter queue for non-degradation classes (ADR-002).
9. **How are uploaded PDFs stored?** Through the storage seam (ADR-016),
   local disk or Railway bucket, keyed `namespace/filename`.
10. **Deterministic, AI-based or hybrid?** Hybrid: deterministic when there is
    a text layer, AI only for scans.
11. **Confidence threshold for automatic routing?** `MIN_VISION_CONFIDENCE`
    = 0.7, provisional (see §28.2).
12. **Manual override of boundaries?** Not in v1.
13. **Is the original always preserved?** Yes — the source item is `discarded`,
    not deleted, and its file stays until the normal 24h batch cleanup.
14. **Non-invoice documents?** Cover/index/statement pages are dropped; a file
    that is *only* such pages ends as `unclear` → review.

---

# 30. Code notes

### `src/lib/server/pdf-pages.ts`

**`function pdfPageTexts`**

- Per-page text, deliberately not merged: `extract.ts`'s `classifyPdf()` merges pages to decide text-vs-scan, and that merge is exactly what hides document boundaries. Both callers need different things from the same source.

**`function splitPdfRanges`**

- `pdf-lib` writes, `unpdf`/pdf.js only reads — hence the extra dependency. The source document is loaded once and copied from for every range. `ignoreEncryption` keeps a permissions-flagged (but readable) supplier PDF from failing the whole split.

**`function rangeSuffix`**

- The suffix is part of the storage key, so it must be stable: the same range always produces the same key, which is what makes a redelivered fan-out idempotent.

### `src/lib/server/document-structure.ts`

**`const NUMBER_RE`**

- Anchored on the *label* (factura / albarán / fra. / invoice), not on any digit run: an invoice page is full of numbers, and a bare digit match would make every page look like a new document.

**`const COVER_RE` / `MIN_COVER_ROWS`**

- A cover keyword alone is not enough — a real invoice can print "estado de cuenta". A listing also carries rows of dates, so ≥3 date-like matches are required before a page is dropped as a cover.

**`function pageSignalsFromText`**

- Returns `null` when any page falls under `MIN_PAGE_TEXT_CHARS`, which routes a scanned or mixed document to the classifier instead of segmenting on a half-readable text layer.

**`function structureFromSignals`**

- `single` means one segment covering *every* page, so a document with a cover page is composite even when it holds a single invoice — the cover must not reach the extractor.

**`const STRUCTURE_PROMPT`**

- Deliberately asks for page roles and nothing else. Asking the same call for invoice fields would recreate the coupling this stage exists to break, and a page map is small enough to stay cheap on a 40-page scan.

### `src/lib/server/document-segmentation.ts`

**`interface SegmentationDeps` — `reserve` / `attribute`**

- `reserve` buys quota for the whole packet before any of it is split, all or nothing; `attribute` re-keys that reservation onto the children once they have ids. Both are optional so callers that do not meter (tests, replays) can omit them. See [ADR-036](../06_decisions/billing/ADR-036-one-metered-unit.md).

**`function segmentDocument` — the reservation point**

- Quota is settled between detection and splitting: the one moment the packet's true size is known and nothing has been spent on it. A partial reservation is deliberately not offered — extracting the first few pages of a 17-invoice packet and then walling is the failure this replaces. Already-created siblings were paid for on the delivery that created them, so only `fresh` is bought.
- A packet that does not fit returns `action: 'quota'` carrying `found` and `remaining`, and nothing is written, queued or discarded: the source item stays so the user can see why.

**`function segmentKey`**

- Derived from the source key rather than randomised: worker jobs are redelivered, and a random key would fan the same packet out twice.

**`function segmentDocument`**

- Order matters on a crash: files are written, then items are added, then the source is discarded. A crash before the discard leaves the already-created children visible to the retry through `existingKeys`.

### `src/lib/server/extraction-worker.ts`

**`function inspectDocumentStructure` — `reserve`**

- Hands back the source item's own slot before pricing the packet. It is the container, not one of the documents; leaving it held would make a packet of N need N+1 free and refuse a tenant with exactly N left. Release is idempotent, so the later release on this path is a no-op.

**`type ExtractionRoute`, `function asRoute`**

- What the worker does next, without the structure detail it has no use for. Only the `quota` route carries data (`found`, `remaining`), which becomes `extractErrorVars` on the failed item.

**`function processExtractionJob` — the non-extract routes**

- The source item is a container the worker never sent to the extractor, so its slot goes back whichever way the route went. `quota` fails it with `extract.err.quotaCompositeExceeded` and the two counts; `review` fails it with `extract.err.structureUnclear`.

**`function routeCompositeDocument`**

- A structure-detection failure is not a reason to lose an invoice: a transient provider error (429/503/timeout) is rethrown into the normal retry policy, anything else falls back to extracting the document as one, which is the pre-ADR-035 behaviour.
