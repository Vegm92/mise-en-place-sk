# ADR-034 — Every extraction is kept in a durable, prompt-versioned corpus, outside the batch tables

**Status:** Active
**Feature:** extraction
**Date:** 2026-08-31
**Issue:** [#813](https://github.com/Vegm92/mise-en-place-sk/issues/813)

## Context

The raw Gemini output — the full `ExtractedInvoice` JSON with its per-field
confidences — only ever lived in `batch_items.extracted_data`. `batch_items`
is scratch space: `cleanupStaleBatches` deletes every `upload_batches` row
older than 24 h, and `batch_items.batch_id` cascades, so the extraction of any
document was destroyed a day after upload — **including confirmed ones**. The
file-deletion half of the same sweep already filtered on
`status <> 'confirmed'`, so a confirmed item kept its PDF forever and lost the
extraction that went with it: the document outlived its own reading.

What survives long term is `invoices`, and it stores flattened scalars
(`totalAmount`, `taxBase`, one `confidence` float). There was no way to ask
"what did the model actually return for this document", no evaluation set, and
no record of which prompt produced a given result — the system instruction is
built inline in `extract.ts` with no version attached, so an improvement and a
regression look identical after the fact.

The beta tester's ask is a growing corpus of *every* document read plus its
extraction, to iterate the prompt against. Alternatives considered:

- **Stop deleting confirmed `batch_items`** (the issue's first suggestion).
  Cheapest, and it fixes the confirmed case only. Rejected as the primary
  mechanism: it keeps a WhatsApp item's `job_code` alive forever under the
  partial unique index on open jobs (`review_status` null/`pending`), which is
  exactly what the 24 h sweep recycles today, and it still loses the extraction
  of every document that was never confirmed — the corpus the request is about.
- **Widen `invoices` with the raw JSON.** Puts model output on the canonical
  business row, which ADR-008 keeps for confirmed, human-owned data, and still
  covers only documents that became invoices.
- **Write the corpus to object storage as files.** No transactional link to the
  tenant, no cascade on account deletion, and RGPD erasure becomes a bucket
  sweep. Rejected on data-protection grounds.

## Decision

A dedicated table, `extraction_results`, is the durable record of every
extraction run. It is written by the worker the moment `markDone` succeeds,
carries `restaurant_id` (cascade from `restaurants`) and `batch_item_id` with
**`ON DELETE SET NULL`**, so the batch sweep detaches it instead of destroying
it, and holds the raw `extracted_data` jsonb, `field_confidences`,
`confidence`, `conversion_notes`, `total_mismatch`, `file_key` (the document
itself, which confirmed items already keep), `model`, and `prompt_version`.

`prompt_version` is `EXTRACTION_PROMPT_VERSION` from `extract.ts`: a manual
revision tag plus the first 12 hex of a SHA-256 of the prompt text
(`v1-<hash>`). It cannot drift, because editing the prompt — including the
category guide interpolated into it — changes the hash. XML e-invoices, which
never reach the model, record `einvoice-parser`.

`cleanupStaleBatches` archives before it deletes: `archiveBatchExtractions`
copies any `batch_items` row that has `extracted_data` and no corpus row yet,
tagged `prompt_version = 'unrecorded'` (attributing an old result to today's
prompt would poison the corpus). The sweep therefore cannot destroy an
extraction, including the ones already in flight when this shipped.

Comparison across prompt revisions is `pnpm corpus:replay`
(`src/extraction-replay.ts`): it re-extracts stored documents with the current
prompt, records the result as a `run_kind = 'replay'` row, and prints a
per-field agreement report against the baseline (`diffExtractions` /
`summarizeComparisons`). `--stats` shows the corpus by prompt version,
`--dry-run` lists what would be replayed without calling the model, and
`--export` writes JSONL with supplier contact details redacted
(`anonymizeExtraction`).

Retention: `EXTRACTION_CORPUS_RETENTION_DAYS = 730`, enforced by
`pruneExtractionCorpus` on the same sweep. The corpus is tenant-scoped, listed
in `tenant-data-map.ts` as cascade-deleted with the restaurant and exported
under `extraction_results`, so it is covered by both account deletion and data
export.

## Consequences

- A confirmed document's extraction, and every other document's, now survives
  indefinitely (within the retention window). The 24 h sweep keeps its current
  behaviour for the scratch tables — batches and items still go — so nothing
  else about the batch lifecycle changed.
- The corpus grows without bound between prunes: one jsonb row per extraction,
  the same payload already written to `batch_items` today. At beta volume this
  is small; at scale the prune window is the knob, and a `run_kind = 'replay'`
  row is added per replayed document per prompt revision.
- Two years of supplier data, prices and supplier contact details now sit in a
  long-lived table. That is a real data-protection surface: it is why retention
  is enforced in code rather than documented, why the table is in the tenant
  data map (deletion + export), and why the export path redacts contact
  details. The RoPA entry for it is [#792](https://github.com/Vegm92/mise-en-place-sk/issues/792).
- The corpus records what the model returned *before* human review. Joining it
  to the human truth means going through `invoices.source_file = file_key` and
  `extraction_corrections` (#812) — deliberately not denormalized here, so the
  corpus stays an append-only log of model runs.
- `corpus:replay` spends real Gemini quota outside the per-tenant accounting
  (`recordLlmUsage` is not called — a replay is not the tenant's extraction).
  It is an operator tool: `--limit` defaults to 10, and `--dry-run` exists so
  the selection can be checked before spending.
- Held in place by `tests/813-extraction-corpus.test.ts` (survives the sweep,
  archives unrecorded extractions, prunes past retention, cascades with the
  restaurant, prompt-version format, diff/summary semantics) and by the
  existing `tenant-data-map` / `account-export` suites.

## Related

- [ADR-002](../ingestion/ADR-002-durable-extraction-pipeline.md) — the state machine whose scratch tables the corpus deliberately outlives
- [ADR-008](../invoicing/ADR-008-single-invoice-write-path.md) — why raw model output does not go on `invoices`
- [ADR-003](../data/ADR-003-committed-migrations-are-canonical.md) — migration `0061_extraction_results_corpus`
