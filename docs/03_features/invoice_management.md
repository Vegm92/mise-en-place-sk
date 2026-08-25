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
- **List filters** (issue #579): the `/invoices` filter bar is collapsible and
  starts collapsed, with the number of active filters badged on the toggle.
  There is no Apply button — every change re-fetches immediately by rewriting
  the URL, and text input is debounced 300 ms. The URL search params are the
  only filter state: `q`, `status`, `supplier_id`, `date_from`, `date_to`,
  `uploaded_from`, `uploaded_to`, `sort` (plus `period` / `page`). `q` matches
  invoice number or supplier name, case-insensitively.

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
- The list filter bar is collapsible (collapsed by default), badges the active
  filter count, applies instantly, debounces text input and keeps its whole
  state in the URL search params.
- Tests: `tests/db-crud.test.ts`, `tests/invoice-status.test.ts` (status
  transitions), `tests/xlsx-export.test.ts`, `tests/invoice-filters.test.ts`
  (parse / serialise / active count / default collapsed state),
  `tests/debounce.test.ts` (debounce timing),
  `tests/invoices-filters-load.test.ts` (`load()` turns search params into SQL
  predicates on both the page and the row-count query).

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
- Filter state comes from `parseInvoiceFilters(url.searchParams)` (issue #579) — the same parser the page component uses to rebuild the URL, so client and server can never disagree about what a query string means. `activeFilterCount` is returned alongside so the collapsed toggle can badge it without re-deriving it.
- The `q` text filter is `invoice_number ILIKE … OR suppliers.name ILIKE …`; `escapeLikePattern` neutralises `%`, `_` and `\` so a literal "100%" searches for that string instead of matching everything.
- Because `q` reaches into `suppliers`, the row-count query carries the same `leftJoin` as the page query — otherwise the shared `conditions` array would reference a table that count query never joined.
- `supplier_id` is only pushed as a predicate when it parses as a number; a junk value is dropped rather than sent to Postgres as `NaN`.

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

**`const filterDraft`**
- Client-side copy of the server's filter set (issue #579). The controls write to it and it is what gets serialised back into the URL, so a keystroke is reflected instantly instead of waiting for the round trip.
- `lastRequested` holds the query string this component last asked for. The resync effect only overwrites `filterDraft` when the incoming `data.filters` differ from it — that is, when the navigation came from somewhere else (back/forward, a link). Resyncing on our own navigations would clobber characters typed while the fetch was in flight.
- `filtersOpen` starts at `defaultFiltersOpen(activeCount)`: collapsed on a bare `/invoices`, expanded when the URL already carries filters so they are visible and clearable.

**`function applyFilters`**
- Instant apply: no Apply button, every change navigates. `keepFocus` keeps the caret in the search box across the re-fetch, `noScroll` keeps the list from jumping, and the debounced search path passes `replaceState` so typing one query does not push a history entry per pause.
- Filters are never combined with `page`, so changing a filter resets pagination to page 1.

**`function handleBulkPaid`**
- Bulk actions.

**`markup`**
- Saved toast shared by both layouts (issue #235).
- KPI strip; collapsible filter panel; hidden bulk forms; bulk action bar; rows with checkbox, supplier+invoice no, due date, amount, status badge and expand chevron; expanded drawer with actions/line items/notes; pagination; confirm dialogs.
- The filter panel is a plain button + `#inv-filter-panel` region wired with `aria-expanded` / `aria-controls`; no accordion primitive is vendored in this repo (there is no `src/lib/components/ui`, and bits-ui is not a dependency), so adding one for a single disclosure was not worth a new dependency.

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

**`function invoiceStatusFilter`**
- Turns a status filter value from the URL into a predicate. `overdue` is not a stored status, so it compiles to `status='pending' AND due_date < CURRENT_DATE` rather than an equality that could never match (issue #520 — the list's overdue filter silently returned nothing). A value outside the vocabulary compiles to `false` instead of being passed through to SQL.

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
- The search box is a controlled input driven by the page's `q` filter (issue #579): it goes through the same debounced URL update as the desktop bar, so mobile search covers every invoice instead of only the 50 on the current page. The status chips stay client-side over the loaded page.
- The filter chips ride the shared `ScrollStrip` (issue #658). The row measured 516px against a 390px viewport with the scrollbar hidden, so "Por categoría" sat entirely off-screen and nothing on the screen said the row scrolled.

### `src/lib/invoice-filters.ts`

**`const EMPTY_INVOICE_FILTERS`**
- One definition of the `/invoices` filter set (issue #579), shared by the server `load`, the desktop filter bar and the mobile list. The keys are the URL parameter names (`supplier_id`, `date_from`, …) so the filter object and the query string are the same shape.

**`function parseInvoiceFilters`**
- The only place a query string becomes filters. Text is trimmed (a whitespace-only `q` is no filter at all), dates go through `toIsoDate` so a malformed one is dropped rather than handed to a `date` column, and an unknown `sort` falls back to `uploaded_desc` instead of reaching the sort map.

**`function countActiveInvoiceFilters`**
- The number badged on the collapsed toggle. `sort` counts only when it is not the default, and blank/whitespace values never count — otherwise a bare `/invoices` would advertise filters it is not applying.

**`function invoiceFilterParams` / `invoiceFiltersHref`**
- The inverse of `parseInvoiceFilters`: empty values and default `sort`/`period`/`page` are omitted, so an unfiltered list is `/invoices` and not a query string of empties. Round-tripping through both is what lets the client rebuild the URL without the server and the client disagreeing.

**`function defaultFiltersOpen`**
- Collapsed when nothing is filtered, expanded when the URL arrives with filters already applied.

**`function escapeLikePattern`**
- Escapes `\`, `%` and `_` before the `q` value is wrapped in `%…%`, so LIKE wildcards typed by the user are matched literally.

### `src/lib/debounce.ts`

**`function debounce`**
- Trailing-edge debounce behind the 300 ms search delay. `cancel()` is used when a non-text filter changes (that navigation should not be followed by a stale search fetch) and `flush()` exists for an explicit "apply now".

### `src/lib/dates.ts`

**`function toIsoDate`**
- Moved out of `src/lib/server/dates.ts` (which re-exports it) so the shared filter parser can validate dates on both sides of the wire — `$lib/server/*` cannot be imported from client code.

