# Feature Spec — Budgets

## Purpose

Let a restaurant set a monthly budget per category and warn when spend crosses
the threshold or the ceiling.

## Actors

- Signed-in member (set/update/clear budgets).
- Invoice save post-commit (overage check).

## Preconditions

- Tenant exists; category taxonomy from `constants.ts`.

## Inputs

- `(app)/budgets` form: category, amount (blank = delete row), month (current
  month only).
- The categories of a saved invoice's line items (`COALESCE(products.category, suppliers.category, 'Other')`, ADR-027).

## Outputs

- `category_budgets` rows (unique `(rid, category, month)`).
- `budget_overage` notifications (`level='warning'|'exceeded'`).

## Business rules

- **Storage**: `category_budgets(restaurant_id, category, month, monthly_budget)`;
  month format `YYYY-MM` (`toMonthStr`).
- **Spend aggregation** (`budgets/+page.server.ts`): `SUM(COALESCE(total_price,
  unit_price*quantity, 0))` over line items joined to invoices+suppliers, LEFT
  JOINed to products, grouped by `COALESCE(products.category,
  suppliers.category, 'Other')` for the selected month (ADR-027; the criterion
  itself lives in `category-spend.ts`). Excludes soft-deleted invoices and
  lines with no description. Note: this is live aggregation, not the
  materialized views.
- **Overage** (`runBudgetCheck`): one check per budgeted category the saved
  invoice's lines actually touched — an invoice carrying produce and cleaning
  products can trip two budgets. Spend ≥ `budget_warning_threshold` (80%) →
  `warning`; ≥ 100% → `exceeded`; else none. Threshold settable. An invoice
  with no described lines falls back to its supplier's category.
- **Dedup** (`alerts.ts:381`): one alert per `category` + `level` per month
  (scans existing month notifications).
- Only the current month is editable (older months `fail(403)`).

## State transitions

`budget_overage` notifications `pending → sent`.

## Data dependencies

`category_budgets`, `invoices`, `invoice_line_items`, `suppliers`,
`system_notifications`, `settings`.

## API dependencies

`/budgets` load + save actions; `(app)/api/notifications` (dismiss).

## UI dependencies

`budgets/+page.svelte`, `MobileAlerts.svelte`, `NotificationItem.svelte`,
nav badge (counts `exceeded`).

## Background dependencies

None.

## External dependencies

None.

## Validation

Category ∈ `VALID_CATEGORIES`; amount numeric ≥ 0; month = current.

## Error states

- Saving a past month → 403.
- Line with no product **and** an uncategorised supplier → spend goes to `'Other'` (nudge raised separately). A line with no product alone falls back to the supplier's tag, never disappears.

## Edge cases

- Mid-month budget change — overage compares against the *current* limit.
- Invoice posted after month end — aggregated by `invoice_date`, not save date.

## Security rules

- Budget reads/writes scoped to the tenant.

## Idempotency rules

- Upsert keyed `(rid, category, month)`; overage dedup per category+level+month.

## Observability

- `budget_overage` countable in `/admin/events`; badge reflects `exceeded`.

## Acceptance criteria

- Setting a budget and saving an invoice that crosses 80%/100% raises
  `warning`/`exceeded` once per month per category.
- Clearing the budget amount deletes the row.
- Tests: `tests/budgets.test.ts`, `tests/alert-engine.test.ts` (budget rule).

## Code notes

### `src/routes/(app)/budgets/+page.server.ts`

**`const load`**

- Includes any custom categories already stored in the DB for this restaurant.

**`property save`**

- Only the current month is editable — a past-month submission (e.g. a stale tab left open across a month boundary) is rejected here, never trusted from the client, which only hides the Save button.
- Categories list is passed from the form so new custom ones are included.

### `src/routes/(app)/budgets/+page.svelte`

**`markup`**

- Desktop layout (`hidden md:flex`): overall progress card, budget table, add-category row.
- Mobile layout (`flex md:hidden`): scrollable content, hero summary card, segmented bar, section header, category cards, sticky save button.
- Per category card: top row (swatch + name + projection badge), progress bar with an 80% target marker, amounts row (spent · % · remaining), budget input.
- Add-category row/card only render when `!isPastMonth`.
