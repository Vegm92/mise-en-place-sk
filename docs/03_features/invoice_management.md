# Feature Spec — Invoice Management (list / detail / edit / export / review state)

## Purpose

Browse, inspect, edit and export confirmed invoices; manage the review state
(revisado / por revisar / incidencia) and soft deletion.

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

- **Review states** (issue #746 — the product tracks albaranes, not payments):
  `invoices.review_state` holds `por_revisar | revisado | incidencia`. The
  canonical save path writes `revisado` for a clean save and `incidencia` when
  the save carried a low-confidence ack, a totals mismatch, unit-conversion
  warnings, a VeriFactu QR mismatch, or a possible-duplicate-purchase alert
  (`invoice-save.ts`). `invoice-status.ts` provides the only transition:
  `por_revisar|incidencia ──markReviewed──▶ revisado` (single and bulk, guarded
  `UPDATE … WHERE review_state IN (...)`). The legacy `status` column
  (`pending|accepted|rejected|paid`) and `due_date` remain as data but no
  longer drive the UI.
- **Incidence kind** (issue #879 — a read/extraction problem is not the same
  fix as a real problem with the document): `invoices.incidence_kind` is a
  second, independent axis, only meaningful alongside `review_state =
  'incidencia'` (null otherwise). `resolveReviewState()` (`invoice-save.ts`)
  classifies the low-confidence-ack / totals-mismatch / unit-conversion /
  QR-mismatch signals as `lectura` (an extraction/scan problem — the fix is to
  re-check the scan or correct a field) since they are all about *how the
  document was read*, not about what it says; the later possible-duplicate
  flip to `incidencia` sets `documento` (a real document problem — the fix is
  to contact the supplier) since a duplicate purchase is a fact about the
  document itself. `markInvoiceReviewed`/`markInvoicesReviewedBulk` clear it
  back to null when the invoice transitions to `revisado`. Every place a
  `review_state = 'incidencia'` badge renders (`/invoices`, `/reminders`, the
  invoice detail, and their mobile variants) renders the kind next to it via
  `IncidenceKindBadge.svelte`, styled with the existing warn (`lectura`) and
  neg (`documento`) badge tokens so the two read as visually distinct at a
  glance; the detail views also show the kind's one-line hint.
- **Edit** carries an optimistic-lock `version`; stale writes are rejected. The
  action delete-and-reinserts line items, so the edit form must post back every
  column the save path reads — `line_supplier_skus` included, or the SKU is
  nulled on every edit (issue #520). `tests/invoice-edit-enrichment.test.ts`
  derives the column set from the schema and fails if one stops surviving.
- **Orphan lines are counted and repairable** (ADR-027): product linking is
  stamped after the invoice transaction commits, an edit deletes and re-inserts
  the lines, and `unlinkSupplier` nulls `product_id` on purpose — so a line can
  end up with no product, and its spend then falls back to the supplier's
  category instead of its own. The detail page counts those lines
  (`unlinkedLineCount`) and offers a `relinkProducts` action that re-runs
  `linkProductsToInvoice` over just them.
- **Soft delete**: invoices are soft-deleted (`deletedAt`); history survives in
  `invoice_audit_log` (no FK — rows survive deletes). Purged by the file
  retention cron after `DELETED_FILE_RETENTION_DAYS`.
- **Export** (`invoices/export/download/+server.ts`) streams `.xlsx` via exceljs
  (styled header, banded rows, autofilter); marks exported where applicable.
  The sheet carries both `invoices.tax_base` ("Base imponible (€)") and
  `invoices.total_amount` ("Importe (€)") — the deductible expense is the
  amount excluding VAT, not the invoice total (issue #883).
- **Selected-document export**: the same route accepts `ids` (comma-separated
  positive ints, capped at 500) which replaces the status/supplier/date
  filters with `inArray(invoices.id, ids)` inside the tenant scope — a foreign
  id is silently excluded, never a leak (ADR-001). With `format=zip` the
  response is a `facturas.zip` containing `facturas.xlsx` plus each selected
  invoice's original file (`<invoice_number or id>.<ext>`, read via
  `getStorage().read()` — ADR-016); an invoice with no stored file, or whose
  file cannot be read, is skipped rather than failing the whole export
  (issue #883). The desktop and mobile invoice lists both drive this from
  their existing multi-select via a full-page navigation to
  `/invoices/export/download?ids=…&format=zip` (ADR-020 — mobile parity).
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
- `e_invoice_format` invoices keep their acceptance timestamps as data; the
  `/reminders` page now surfaces incidencias, not acceptance deadlines
  (issue #746).

## Security rules

- `invoice/[id]/*` and export endpoints must resolve the invoice within the
  tenant scope; the file route is tenant-scoped + path-traversal guarded.

## Idempotency rules

- Review-state transitions are guarded `UPDATE ... WHERE review_state IN (...)`;
  version check prevents double-apply of stale edits.

## Observability

- `invoice_audit_log` rows on significant actions.

## Acceptance criteria

- Filtering, detail, edit-with-version, mark-reviewed and export behave per
  the review-state map above and stay tenant-isolated.
- The list filter bar is collapsible (collapsed by default), badges the active
  filter count, applies instantly, debounces text input and keeps its whole
  state in the URL search params.
- Tests: `tests/db-crud.test.ts`, `tests/invoice-status-vocabulary.test.ts`
  (review vocabulary), `tests/xlsx-export.test.ts`, `tests/invoice-filters.test.ts`
  (parse / serialise / active count / default collapsed state),
  `tests/debounce.test.ts` (debounce timing),
  `tests/invoices-filters-load.test.ts` (`load()` turns search params into SQL
  predicates on both the page and the row-count query).

## Code notes

### `src/routes/(app)/invoice/[id]/+page.svelte`

**`markup`**
- Mobile and desktop variants both rendered; CSS picks (`md:hidden` / `hidden md:block`, ADR-020).
- Two-column layout: doc viewer (44%) with filename header, zoom controls and source-file preview; details card + actions, line items, activity timeline.
- The line-items card leads with the orphan-line warning and its re-link button when `unlinkedLineCount > 0`; the mobile variant carries the same pair above its line list.
- When `invoices.linked_invoice_id` is set (issue #809 — factura↔albarán linking, `runPossibleDuplicatePurchase` in `alerts.ts`), the details card renders a "linked document" row with a link to `/invoice/{linked_invoice.id}`; the load in `+page.server.ts` fetches the linked invoice's id/number/document_type in a second query rather than a join, since it's a nullable self-reference. Mobile variant surfaces the same link as its own card.
- `IncidenceKindBadge` renders under the status badge with `hint` (issue #879): the detail view is where the user decides what to *do* about an incidencia, so it carries the one-line action hint (`inv.review.kind.*.hint`) that the list rows don't — re-check the scan/field for `lectura`, contact the supplier for `documento`. Mobile variant mirrors the same placement.

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
- Selection. `bulkDownloadHref` (issue #883) derives
  `/invoices/export/download?ids=…&format=zip` from the same set the two
  existing bulk-form actions read, so "Descargar seleccionados" is a third
  bulk action next to mark-reviewed/delete — a plain `<a data-sveltekit-reload>`
  full navigation rather than a form post, since the response is a file
  download, not a redirect.

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
- The status badge is followed by `IncidenceKindBadge` (issue #879, `$lib/components/mep/IncidenceKindBadge.svelte`) so an `incidencia` row shows *which kind* at a glance — `lectura` (warn token, re-scan/correct) vs `documento` (neg token, contact the supplier) — without opening the row. Renders nothing when `incidence_kind` is null (every non-incidencia row, and legacy rows saved before the column existed).
- The filter panel is a plain button + `#inv-filter-panel` region wired with `aria-expanded` / `aria-controls`; no accordion primitive is vendored in this repo (there is no `src/lib/components/ui`, and bits-ui is not a dependency), so adding one for a single disclosure was not worth a new dependency.

### `src/routes/(app)/invoices/export/download/+server.ts`

**`const GET`**
- Styled header row; borders + banded rows for the data. Columns: id,
  supplier, invoice number, invoice date, due date, tax base, total, review
  state, created — in that order, so the autofilter range and the
  truncation-marker merge span `A:I` (issue #883 added the tax-base column).
- Rate-limited (`export:<restaurantId>`, 5/min); `supplier_id` must be a
  positive integer and `date_from`/`date_to` must be ISO `yyyy-mm-dd` — any of
  the three reject 400 rather than being silently coerced away (issue #493).
- Rows are fetched with `LIMIT EXPORT_ROW_CAP + 1` (`EXPORT_ROW_CAP`,
  `src/lib/server/env.ts`, default 10 000) to detect truncation without an
  unbounded scan; a truncated export gets one appended, merged marker row
  instead of silently dropping the rest (issue #493).
- `ids` (issue #883): when present it takes over query building entirely —
  the status/supplier/date params are not even parsed — and becomes
  `inArray(invoices.id, ids)` alongside the same `tdb.scope()` predicate every
  other branch uses, so a ids list mixing tenants just comes back short. Bad
  input (non-positive-int entries, more than 500 ids) is a 400, matching the
  existing `supplier_id`/date validation style.
- `format=zip` (issue #883): builds the same workbook, then for every row with
  a `source_file` reads it via `getStorage().read()` (ADR-016) and adds it to
  a zip built by `$lib/server/invoice-export-zip.ts`; a missing or unreadable
  file is skipped (`catch { continue }`) rather than failing the request. The
  zip's `Content-Disposition` goes through the same
  `$lib/server/content-disposition.ts` helper as the plain `.xlsx` response
  and `/invoice/[id]/file`.

### `src/routes/(app)/reminders/+page.server.ts`

**`const rows`**
- Lists invoices saved with `review_state = 'incidencia'` (issue #746), newest first.

**`const actions`**
- `markReviewed` — guarded transition to `revisado`; a stale tab whose invoice was already reviewed elsewhere gets a conflict banner, not a silent overwrite.

### `src/routes/(app)/reminders/+page.svelte`

**`markup`**
- Mobile alerts / desktop reminders variants; incidencias section linking each invoice with a mark-reviewed action; notification groups.
- Each incidencia row carries an `IncidenceKindBadge` next to the `incidencia` badge (issue #879) — reminders exists specifically to tell the user "you have incidents to act on", so the kind (re-scan vs contact the supplier) is shown here too, not just on the invoice detail.

### `src/lib/server/invoice-status.ts`

**`type ReviewState`**
- Re-exported from `$lib/status` (`por_revisar | revisado | incidencia`); the module declares no vocabulary of its own.

**`function markInvoiceReviewed`**
- por_revisar/incidencia → revisado; guarded `UPDATE … WHERE review_state IN (from)` reporting whether it fired, so a stale tab or double-submit is a no-op (issue #243 pattern carried over to the review model, issue #746).
- Also clears `incidenceKind` back to null (issue #879): a reviewed invoice has no open incident left to classify, so a re-flagged invoice starts from a clean kind rather than showing a stale `lectura`/`documento` label from its previous incidencia.

**`function markInvoicesReviewedBulk`**
- Bulk por_revisar/incidencia → revisado; returns how many rows actually transitioned.
- Clears `incidenceKind` to null for the same reason as the single-invoice transition above.

**`function invoiceReviewFilter`**
- Turns a review-state filter value from the URL into a `review_state` equality. A value outside the vocabulary compiles to `false` instead of being passed through to SQL (issue #520 pattern).

### `src/lib/server/invoice-export-zip.ts`

**`function buildInvoiceExportZip`**
- Streaming zip builder (issue #883) for the selected-invoice download: takes
  `{name, data: Buffer}[]` and returns a `Buffer`, built with `yazl` the same
  way `tests/helpers/zip.ts` builds zip fixtures for `zip-extract.test.ts` —
  a production version of that test helper's shape, so a future consumer of
  either one recognises the pattern. Pairs with `$lib/server/zip-extract.ts`
  (`yauzl`) on the read side, but this module never reads a zip, only writes
  one.

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

### `src/lib/components/mep/IncidenceKindBadge.svelte`

**`markup`**
- Issue #879: renders nothing when `kind` is null/unrecognised (`isIncidenceKind` guard), otherwise the `lectura`/`documento` badge from `$lib/status` and, with `hint`, the one-line action text underneath. One component rather than repeating the same `{#if}` in every place an `incidencia` badge renders (`/invoices`, `/reminders`, the invoice detail and their mobile variants) — mirrors `StatusBadge.svelte`'s shape (a `status`/`kind` prop) but is a separate component rather than a mode of `StatusBadge`, since the two axes (`ReviewState` vs `IncidenceKind`) are independent vocabularies with their own fallback and never share a badge.
- No `style` passthrough (issue #845 — inline styles are being removed repo-wide, and `tests/design-scale-ratchet.test.ts` ratchets off-scale inline font sizes down, never up): a `small` boolean prop switches to `text-[11px] px-1.5 py-px` Tailwind utilities for the tighter list-row placement instead, and the hint paragraph is `text-[11px] text-fg-3` rather than an inline `font-size`.

### `src/lib/components/mobile/MobileInvoiceDetail.svelte`

**`markup`**
- Sticky header, scrollable content, hero total card, doc preview, line items, 3-column action grid.
- The status badge is followed by `IncidenceKindBadge` with `hint` (issue #879) — see the desktop detail page's Code notes above.

### `src/lib/components/mobile/MobileInvoiceList.svelte`

**`const grouped`**
- Invoices grouped by date label.

**`markup`**
- Search, filter chips, grouped invoice list.
- The search box is a controlled input driven by the page's `q` filter (issue #579): it goes through the same debounced URL update as the desktop bar, so mobile search covers every invoice instead of only the 50 on the current page. The status chips stay client-side over the loaded page.
- The filter chips ride the shared `ScrollStrip` (issue #658). The row measured 516px against a 390px viewport with the scrollbar hidden, so "Por categoría" sat entirely off-screen and nothing on the screen said the row scrolled.
- Each row's status badge is followed by `IncidenceKindBadge` (issue #879) — same placement as the desktop list.
- **Selection (issue #883, ADR-020 parity)**: every row carries a checkbox
  (wrapped in its own `<label>` sibling to the row's `<a>`, not nested inside
  it, so the tap target stays a real 44px control and the anchor keeps
  navigating on a normal tap) and a select-all bar sits above the list
  whenever there is at least one row. Once something is checked, the bar also
  shows the same three bulk actions as the desktop toolbar — mark reviewed
  and delete post the existing `?/bulkReviewed` / `?/bulkDelete` actions
  through local hidden forms, and "Descargar seleccionados" is the same
  full-navigation `ids=…&format=zip` link as desktop, reusing the
  `inv.export.selected.*` i18n keys.

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

