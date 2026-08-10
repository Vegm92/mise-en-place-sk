# ADR-016 — A Two-Driver Storage Seam, and Uploads Validated by Magic Bytes

**Status:** Active
**Feature:** Ingestion
**Date:** 2026-08-09

## Context

Uploaded invoices are the app's only user-supplied binary content, and they are
the one asset that cannot be recomputed: an invoice's source file is the evidence
behind every number derived from it.

Two constraints pull in opposite directions. **Local disk** is what a developer
wants — no credentials, no network, works offline. **Object storage** is what
production needs — a container filesystem is ephemeral, and more than one web
replica cannot share a local directory.

Separately, file uploads are a classic attack surface. An extension check alone
lets a caller name anything `.pdf`.

## Decision

### One three-method interface, two drivers, chosen at boot

```typescript
save(key, buf) → void
read(key)      → Buffer
delete(key)    → void
```

`STORAGE_DRIVER === 'railway'` selects the S3 driver (Railway's bucket, via
`@aws-sdk/client-s3`); anything else selects local disk. The driver is
constructed **once at module load** and returned by `getStorage()` — a
misconfigured S3 setup fails at startup with a message naming the missing
variables, rather than on the first upload of the day.

Only three methods, because only three things happen to an invoice file: it is
stored, it is read for extraction and display, and it is purged after retention
([ADR-011](../insights/ADR-011-scheduled-jobs-in-the-worker.md)). No listing, no
signed URLs, no metadata — files are always reached by a key already held in the
database.

Keys are `<namespace>/<filename>` and identical across drivers, so a stored
`batch_items.file_key` means the same thing whichever driver wrote it.

### Path traversal is blocked in the driver, not at the caller

`LocalDriver.read` resolves the key and rejects anything that does not land inside
the uploads base directory. `delete` applies the same test and silently skips a
miss, so retention purges cannot be turned into arbitrary deletions by a
malformed key.

Putting the check in the driver rather than at each call site means it holds for
every caller, including future ones. `RailwayBucketDriver` needs no equivalent —
S3 keys are opaque and `..` has no meaning to the bucket.

### Uploads are validated three times

`saveUploadedFiles` accepts a file only if all three pass:

1. **Extension allowlist** — `.pdf`, `.jpg`, `.jpeg`, `.png`. An allowlist, so a
   new format is an explicit decision.
2. **Size** — 20 MB. A phone photo of an invoice is 2–5 MB.
3. **Magic bytes** — the first bytes must match the format the extension claims:
   `%PDF-` for PDF, `FF D8 FF` for JPEG, the 8-byte PNG signature. A `.pdf` that
   is not a PDF is rejected as `contentMismatch`.

The third is the one that matters. It runs **before** the buffer reaches the
storage driver, so a rejected file is never written anywhere.

Rejections are collected per file with a reason code and returned alongside the
successes rather than throwing. Uploading nine valid delivery notes and one
screenshot saves the nine and reports the one — the correct behaviour for a
batch ([ADR-015](./ADR-015-batches-replace-single-file-sessions.md)).

Stored filenames get a 6-hex-character random suffix (`factura_a3f9c1.pdf`), so
two files named `factura.pdf` cannot collide while the name stays recognisable in
logs and support conversations.

## Consequences

- **`STORAGE_DRIVER=local` in production means data loss on redeploy**, and it is
  the default. `DEPLOYMENT.md` carries the persistence requirement; this is the
  single most consequential environment variable in the app.
- **The local driver is synchronous** (`readFileSync`/`writeFileSync`) behind an
  async interface. Fine for development; it would block the event loop under
  production load, which is another reason production runs the S3 driver.
- **The extraction worker needs the file on a local path.** It pulls the object
  down to a temp file when `STORAGE_DRIVER` is not local, because
  `classifyFile`/`unpdf` work from a path
  ([ADR-006](../extraction/ADR-006-file-classification-routes-extraction.md)).
  A streaming extraction path would remove that round trip.
- **`.xml` is not in the upload allowlist**, so the e-invoice parsing path is not
  reachable through the web upload form. Enabling it means adding the extension
  *and* a magic-byte check for XML.
- **Adding a third driver** (S3 proper, GCS, Azure) means one class and one line
  in the selector. Nothing above the seam knows which driver is live.
- Files are never re-validated after storage. Magic-byte checking is an
  ingest-time gate; anything already in the bucket is trusted.

## Related

- [ADR-015](./ADR-015-batches-replace-single-file-sessions.md) — what holds the file keys
- [ADR-017](./ADR-017-offline-first-upload-queue.md) — how files reach this code
- [ADR-011](../insights/ADR-011-scheduled-jobs-in-the-worker.md) — the retention purge that deletes them
