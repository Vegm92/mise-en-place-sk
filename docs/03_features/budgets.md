---
tags: [mep, features]
related: "[[CONTEXT]]"
---

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

### Data model note — per-restaurant categories (issue #881, ADR-037)

`VALID_CATEGORIES` above is being replaced by a per-restaurant `categories`
table (`src/lib/server/schema.ts`, `src/lib/server/categories.ts`) so a
restaurant can add its own spend labels instead of being locked to the fixed
food-and-drink list — see [ADR-037](../06_decisions/analytics/ADR-037-categories-are-per-restaurant.md).
Landing in three PRs:

- **Part 1 (this PR, shipped)**: the `categories` table + the
  `seedDefaultCategories` / `listCategories` / `createCategory` /
  `renameCategory` / `setCategoryHidden` / `resolveCategoryFor` module, seeded
  from `VALID_CATEGORIES` for every restaurant (existing and new). Nothing on
  this page reads it yet — the "custom category" support described in this
  spec's Code notes below (a stray `category_budgets.category` value outside
  `VALID_CATEGORIES`) predates this table and is unrelated to it.
- **Part 2 (pending)**: this route, and the other consumers of
  `VALID_CATEGORIES`/`resolveCategory` (suppliers, products, extraction
  review, analytics), read the restaurant's own category set instead of the
  fixed list.
- **Part 3 (pending)**: a settings screen to create/rename/hide categories.

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

## Beta status

Frozen for the MVP private beta (2026-08-29 executive audit, PR #794): the
`/budgets` route (and its dashboard nav entry, tour step) is hidden unless the
`budgets` row in `app_flags` (`beta_feature_budgets`, default disabled) is set
to `'true'` — see `docs/03_features/feature_flags.md`. Gated in
`hooks.server.ts` (`enforceFeatureFlag`, redirects to `/dashboard`) and in
`(app)/+layout.server.ts`/`+layout.svelte` (nav item + tour page hidden). The
dashboard pace-vs-budget widget already degrades gracefully to its empty
state when no `category_budgets` rows exist, so no change was needed there.
Toggle from `/admin/feature-flags`.

## Code notes

### `src/lib/server/categories.ts`

- Not yet wired into this route or any other consumer (part 2, issue #881). Tenant-scoped throughout (`forTenant(rid).scope(...)`), matching every other per-tenant module.
- `seedDefaultCategories` inserts one row per `VALID_CATEGORIES` entry except `UNCATEGORIZED_CATEGORY`, `ON CONFLICT (restaurantId, nameKey) DO NOTHING` — safe to call more than once, and called from every restaurant-creation path (`onboarding`, `settings` add-location, `auth-seed`) plus a one-off migration backfill for restaurants that already existed.
- `createCategory`/`renameCategory` return a typed `{ ok: false, reason: 'duplicate' | 'invalid' | 'reserved' }` instead of throwing, so a route can turn a rejection straight into a form error without a try/catch. `reserved` is the `'Other'` sentinel's key — it can never become a row, so it can never be renamed or hidden either.
- `renameCategory` runs in one transaction: `suppliers.category`/`products.category`/`category_budgets.category` store the category as a plain string, so a rename that only touched the `categories` row would silently orphan every row already tagged with the old name.
- `resolveCategoryFor` is the per-restaurant successor to `resolveCategory` (ADR-027): it matches the AI/global proposal against the restaurant's *visible* categories first (custom or default, by `categoryKey`), then falls back to the global taxonomy match, and degrades to `UNCATEGORIZED_CATEGORY` when even that fallback is not currently visible to the restaurant (hidden, or a default it never had). Always one of the restaurant's visible names, or the sentinel — never null.

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
