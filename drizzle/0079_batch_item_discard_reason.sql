-- Migration 0079: tell the two meanings of `batch_items.status = 'discarded'`
-- apart (issue #1010).
--
-- Two callers wrote that status and meant opposite things: a human rejecting
-- what was extracted (`src/routes/(app)/batch/[id]/+page.server.ts`) and the
-- pipeline retiring a composite PDF's source row after splitting it into
-- children (`src/lib/server/extraction-worker.ts`). Nothing on the row said
-- which, so rejection rate — the most direct quality signal an extraction
-- product has — was unmeasurable, and every composite split inflated it.
--
-- A discriminator rather than a new status, so the `status <> 'discarded'`
-- filters that compute what is still open keep working unchanged.

ALTER TABLE "batch_items" ADD COLUMN "discarded_reason" text;

--> statement-breakpoint

-- Backfill the composite case only. A source row's children are keyed
-- `<stem>_p<n>[-<m>].pdf` in the same batch (`segmentKey` in
-- src/lib/server/document-segmentation.ts, ADR-035), and only PDFs are ever
-- segmented (`isSegmentableDocument`), so their presence identifies the parent
-- with no guessing. Matching by stem prefix + a regex on the remaining suffix
-- avoids interpolating a user-supplied filename into a pattern.
--
-- Everything else predating this column stays NULL — genuinely unknown. It is
-- not safe to read the absence of children as a rejection: a discarded row can
-- also be one whose children were themselves deleted.
UPDATE "batch_items" AS s
SET "discarded_reason" = 'composite_source'
WHERE s."status" = 'discarded'
  AND s."discarded_reason" IS NULL
  AND lower(s."file_key") LIKE '%.pdf'
  AND EXISTS (
    SELECT 1
    FROM "batch_items" AS c
    WHERE c."batch_id" = s."batch_id"
      AND c."id" <> s."id"
      AND starts_with(c."file_key", left(s."file_key", length(s."file_key") - 4) || '_p')
      AND lower(substr(c."file_key", length(s."file_key") - 3)) ~ '^_p[0-9]+(-[0-9]+)?\.pdf$'
  );
