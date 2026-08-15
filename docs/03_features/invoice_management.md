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

## Code notes

### `src/routes/(app)/invoice/[id]/+page.svelte`

**`markup`**
- Mobile and desktop variants both rendered; CSS picks (`md:hidden` / `hidden md:block`, ADR-020).
- Two-column layout: doc viewer (44%) with filename header, zoom controls and source-file preview; details card + actions, line items, activity timeline.

### `src/routes/(app)/invoice/[id]/edit/+page.server.ts`

**`property save`**
- Optimistic concurrency (issue #242): form carries the `version` it loaded; the UPDATE only fires if it still matches.
- Idempotency key (issue #250) claimed inside the transaction; a replayed submit skips the edit and redirects to `/invoices` like success. `releaseRequest` frees the key so a corrected resubmit isn't treated as a replay.
- Header update + line-item delete/reinsert commit atomically — no orphaned line items on crash.
- Supplier resolved via atomic get-or-create (issue #238) inside the transaction.

**`const updated`**
- Missing/invalid version tolerated (form cached from before the field existed) — no guard rather than a hard 409.

**`property save`**
- Replay (#250) and success share the same `/invoices` redirect.

### `src/routes/(app)/invoice/[id]/edit/+page.svelte`

**`const idempotencyKey`**
- One key per loaded invoice (issue #250); a validation-error retry reuses it (the failed save released the key), a fresh load mints one.

**`const computedLineTotal`**
- Older invoices can have a null stored total (extraction gap); fall back to summing line totals so the field isn't blank.

**`markup`**
- Invoice-details card and line-items card.

### `src/routes/(app)/invoices/+page.server.ts`

**`const load`**
- `?saved=<id>` set by the batch save action after the last invoice of a batch lands (issue #235) — replaces the /save-confirmation interstitial.
- Alerts raised while saving that invoice ride along on the toast.
- Line items loaded only for the current page.

**`property markPaid`**
- Guarded transitions (issue #243): a stale tab gets a conflict banner instead of silently overwriting a change made elsewhere.

### `src/routes/(app)/invoices/+page.svelte`

**`const toastDismissed`**
- Save confirmation (issue #235): saving the last invoice of a batch lands here with a toast instead of an interstitial page; alerts raised during the save ride along. A toast with alerts stays until dismissed; a plain "saved" fades on its own.

**`const checkedIds`**
- Selection.

**`const openIds`**
- Row expansion.

**`const noteText`**
- Notes.

**`const confirmPaidOpen`**
- Confirm dialogs.

**`function handleBulkPaid`**
- Bulk actions.

**`markup`**
- Saved toast shared by both layouts (issue #235).
- KPI strip; filter bar (`form method="get" action="/invoices"`); hidden bulk forms; bulk action bar; rows with checkbox, supplier+invoice no, due date, amount, status badge and expand chevron; expanded drawer with actions/line items/notes; pagination; confirm dialogs.

### `src/routes/(app)/invoices/export/download/+server.ts`

**`const GET`**
- Styled header row; borders + banded rows for the data.

### `src/routes/(app)/reminders/+page.server.ts`

**`const rows`**
- Shows pending AND accepted invoices not yet paid (`status IN ('pending', 'accepted')`).

**`const enriched`**
- 4-working-day acceptance countdown, only for e-invoices still `pending`.

**`const actions`**
- Guarded transitions (issue #243): a stale tab whose invoice was already accepted/rejected/paid elsewhere gets a conflict banner, not a silent overwrite.

**`property acceptInvoice`**
- Accept an e-invoice — starts the paid-status obligation clock (RD 238/2026).

**`property rejectInvoice`**
- Reject an e-invoice — records the rejection date (RD 238/2026).

### `src/routes/(app)/reminders/+page.svelte`

**`markup`**
- Mobile alerts / desktop reminders variants; summary chips; overdue and due-soon sections.

### `src/lib/server/invoice-status.ts`

**`type InvoiceStatus`**
- Guarded transitions (issue #243): every status mutation is an `UPDATE … WHERE status IN (from)` reporting whether it fired, so a stale tab or double-submit is a no-op instead of a lost update or a contradiction between `status` and the RD 238/2026 timestamps (`accepted_at` / `rejected_at` / `paid_at`).
- Allowed: `pending → accepted | rejected | paid`; `accepted → paid`; `paid → pending` (markUnpaid resets the timestamps).

**`function markInvoicePaid`**
- pending/accepted → paid, recording the payment date.

**`function markInvoiceUnpaid`**
- paid → pending, clearing the now-stale payment/acceptance timestamps.

**`function acceptInvoice`**
- pending → accepted (RD 238/2026 acceptance).

**`function rejectInvoice`**
- pending → rejected (RD 238/2026 rejection).

**`function markInvoicesPaidBulk`**
- Bulk pending/accepted → paid; returns how many rows actually transitioned.

### `src/lib/server/working-days.ts`

**`const FIXED_HOLIDAYS`**
- Spanish working-day calculator for the 4-day invoice acceptance clock mandated by RD 238/2026 (Ley Crea y Crece B2B e-invoicing). "Días hábiles" = calendar days minus Saturdays, Sundays and Spanish national holidays; regional/local holidays NOT included.
- Fixed national holidays keyed (month, day): Año Nuevo, Reyes Magos, Fiesta del Trabajo, Asunción, Fiesta Nacional, Todos los Santos, Constitución, Inmaculada, Navidad.

**`const GOOD_FRIDAY`**
- Viernes Santo dates 2024–2030 (Easter − 2 days) — the only moveable national holiday.

**`function isSpanishWorkingDay`**
- 0=Sun, 6=Sat are not working days.

**`function countSpanishWorkingDaysUntil`**
- Spanish working days strictly between `from` (exclusive) and `to` (inclusive) — matches the legal meaning (a 4-day clock started Monday counts Tue–Fri).

**`function addSpanishWorkingDays`**
- Acceptance deadline is `addSpanishWorkingDays(invoiceReceivedAt, 4)`.

**`function workingDaysUntilDeadline`**
- Spanish working days left until the 4-day deadline; negative once passed (negative overrun count).

## UI components

### `src/lib/components/mobile/MobileInvoiceDetail.svelte`

**`markup`**
- Sticky header, scrollable content, hero total card, doc preview, line items, 3-column action grid.

### `src/lib/components/mobile/MobileInvoiceList.svelte`

**`const grouped`**
- Invoices grouped by date label.

**`markup`**
- Search, filter chips, grouped invoice list.
