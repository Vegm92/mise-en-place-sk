# Feature Spec — Invoice Management (list / detail / edit / export / status)

## Purpose

Browse, inspect, edit and export confirmed invoices; manage payment status and
soft deletion.

## Actors

- Signed-in member of the active restaurant.

## Preconditions

- At least one confirmed invoice; `locals.restaurantId` set.

## Inputs

- Filters: status, period, supplier, search.
- Edit fields; status-change actions; export request.

## Outputs

- `/invoices` list (filtered), `/invoice/[id]` detail + file preview,
  `/invoice/[id]/edit` form, `.xlsx` export download.

## Business rules

- **Statuses** (`invoice-status.ts`, guarded transitions):
  `pending ──accept──▶ accepted`, `pending ──reject──▶ rejected`,
  `pending|accepted ──markPaid──▶ paid`, `paid ──markUnpaid──▶ pending`.
  Bulk mark-paid supported. `overdue` is display-derivable (not a stored
  transition here).
- **Edit** carries an optimistic-lock `version`; stale writes are rejected.
- **Soft delete**: invoices are soft-deleted (`deletedAt`); history survives in
  `invoice_audit_log` (no FK — rows survive deletes). Purged by the file
  retention cron after `DELETED_FILE_RETENTION_DAYS`.
- **Export** (`invoices/export/download/+server.ts`) streams `.xlsx` via exceljs
  (styled header, banded rows, autofilter); marks exported where applicable.
- **File preview**: `/invoice/[id]/file` serves via `getStorage()`, tenant-
  scoped; X-Frame-Options `SAMEORIGIN` carve-out applies.

## State transitions

See status map above. Version increments on each edit.

## Data dependencies

`invoices`, `invoice_line_items`, `suppliers`, `products`, `invoice_audit_log`,
storage (source file).

## API dependencies

`invoice/[id]/file/+server.ts`, `invoices/export/download/+server.ts`;
edit/status are form actions in `+page.server.ts`.

## UI dependencies

`MobileInvoiceList.svelte`, `DesktopInvoiceDetail.svelte`,
`invoice/[id]/+page.svelte`, `invoice/[id]/edit/+page.svelte`.

## Background dependencies

None direct; deletion-purge cron removes old files.

## External dependencies

Storage driver for file serving.

## Validation

Tenant scope on every read; version check on edit; status-transition guards.

## Error states

- Stale version on edit (conflict).
- File missing from storage → degraded preview.
- Export failure (empty list handled).

## Edge cases

- Deleting an invoice referenced by alerts/notifications — FK `SET NULL`
  patterns keep rows readable.
- `e_invoice_format` invoices show acceptance working-days deadlines in
  `/reminders` (not here).

## Security rules

- `invoice/[id]/*` and export endpoints must resolve the invoice within the
  tenant scope; the file route is tenant-scoped + path-traversal guarded.

## Idempotency rules

- Status transitions are guarded `UPDATE ... WHERE status IN (...)`; version
  check prevents double-apply of stale edits.

## Observability

- `invoice_audit_log` rows on significant actions.

## Acceptance criteria

- Filtering, detail, edit-with-version, mark-paid/unpaid and export behave per
  the status map above and stay tenant-isolated.
- Tests: `tests/db-crud.test.ts`, `tests/invoice-status.test.ts` (status
  transitions), `tests/xlsx-export.test.ts`.
