# ADR-006 — File Class Decides the Extraction Route

**Status:** Active
**Feature:** Extraction
**Date:** 2026-08-09

## Context

An invoice arrives as one of four things: a digitally-generated PDF with a real
text layer, a scanned PDF that is a photograph in a PDF wrapper, a phone photo
(JPG/PNG), or a structured e-invoice XML. Treating all four as "send the bytes
to a vision model" is the simplest implementation and the one the app started
with, but it is the wrong trade on three axes at once:

- **Cost.** Vision input on `gemini-2.5-flash` bills the whole rasterised page.
  A text-layer PDF costs a fraction of that when sent as text.
- **Accuracy.** OCR-by-vision reintroduces reading errors on documents where the
  characters are already exact. Spanish supplier invoices are dense with the
  fields that suffer most from that — CIF/NIF strings, `nº factura` references,
  IVA rates.
- **Correctness.** Facturae 3.2.x and UBL 2.1 XML carry the fields *as data*.
  Asking an LLM to read them is strictly worse than parsing them: it can only
  introduce error into values that are already unambiguous.

## Decision

**Classify the file first (`classifyFile`), then route.** Classification is
cheap, local, and happens before any model call:

| Class | Detection | Route |
|---|---|---|
| `xml` | `.xml` extension | `parseEinvoice()` — **no LLM call at all** |
| `text_pdf` | `unpdf` text extraction yields ≥ 50 chars | Prompt + extracted text (text tokens only) |
| `scanned_pdf` | PDF whose text layer is < 50 chars, or whose parse throws/times out | Prompt + base64 PDF as `inlineData` |
| `image` | `.jpg` / `.jpeg` / `.png` | Prompt + base64 image as `inlineData` |

The 50-character threshold is the whole heuristic. It is deliberately crude: a
scanned PDF frequently carries a few characters of junk from a stamp or a header
watermark, and a real text-layer invoice always carries far more than 50. There
is no partial-credit path — a document is text or it is pixels.

`classifyPdf` fails **closed toward vision**: a parse error or a 15 s timeout
(`PDF_PARSE_TIMEOUT_MS`) returns `scanned_pdf` rather than propagating. A broken
text layer must never fail the extraction; it must only cost more.

**Both extraction entry points share this routing.** `extractInvoice()` (raw
`GenerateFn`) and `extractWithProvider()` (provider seam, see
[ADR-007](./ADR-007-llm-provider-seam.md)) classify identically and differ only
in how they call the model and whether they report token usage.

## Failure handling

Three layers, innermost first:

1. **`withRetry`** — up to 3 retries with exponential backoff (1s, 2s, 4s), but
   only on HTTP **429** and **503**. Every other status is permanent for this
   document and retrying it just burns quota.
2. **`GEMINI_TIMEOUT_MS` (60 s)** — an outer `Promise.race` around the whole
   call chain, tagged `code: 'GEMINI_TIMEOUT'`. This bounds the retry ladder too:
   a document that keeps getting 503s is abandoned at 60 s, not after the full
   backoff sequence.
3. **`classifyExtractionError`** (in `extraction-worker.ts`) maps the thrown
   error to a stable i18n key — `extract.err.rateLimited`, `.unavailable`,
   `.timeout`, `.notInvoice`, `.generic` — written to `batch_items.extract_error`.

The error *key*, not the error *message*, is persisted. The message may contain
provider text, prompt fragments, or document content; the key is safe to render
bilingually and safe to log.

`extract.err.notInvoice` is inferred from unparseable JSON. This is a deliberate
conflation: when the model returns prose instead of JSON, it is overwhelmingly
because the uploaded file was not an invoice, and "this doesn't look like an
invoice" is the message the user can act on.

## Consequences

- A text-layer PDF never sends image tokens. This is the single largest lever on
  per-invoice extraction cost, and it applies to the majority of supplier PDFs.
- XML e-invoices cost **zero** LLM tokens and are recorded as such — the usage
  row carries `model: 'xml-parser'` with zero in/out tokens, so cost dashboards
  stay honest rather than silently attributing free extractions to Gemini.
- An unrecognised XML dialect throws rather than falling back to the LLM. This is
  intentional: silently vision-reading an XML file would produce plausible
  garbage. Adding a dialect means extending `einvoice-parser.ts`.
- `.xml` is accepted by `extractInvoice` but **not** by `saveUploadedFiles`,
  whose `ALLOWED_EXTENSIONS` is `.pdf/.jpg/.jpeg/.png`. The XML path is
  therefore reachable only for files that entered storage by another route. If
  XML upload is to be offered in the UI, that allowlist and its magic-byte table
  are the place to change — not this ADR.
- The extraction prompt is a single Spanish-market-tuned constant
  (`EXTRACTION_PROMPT`), shared by every route so that a text PDF and a photo of
  the same invoice produce the same field set. Its category vocabulary is
  injected from `VALID_CATEGORIES` rather than restated, so the prompt cannot
  drift from the constants the save path validates against.

## Related

- [ADR-007](./ADR-007-llm-provider-seam.md) — provider seam and usage accounting
- [ADR-002](../ingestion/ADR-002-durable-extraction-pipeline.md) — where extraction runs
