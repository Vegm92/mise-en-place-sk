# Feature Spec — Dashboard

## Purpose

The desktop `/dashboard` is a decision screen, not a report: it ranks
everything the restaurant could act on today by **euros at stake** and puts the
action next to the number. The month's figures are context in a one-line
ribbon and a three-block rail; the middle of the screen is a worklist. Design
direction "Turno — primero la decisión, después el dato" (Claude Design
project *mise en place*, artboard `Mise en Place - Dashboard v2.html`,
section B).

Mobile keeps its own summary layout (ADR-020: both viewports render, CSS
chooses).

## Actors

- Signed-in member (view; every action is a link to the page that resolves it).

## Preconditions

- A restaurant in `locals.restaurantId`. Everything else degrades: no budgets,
  no invoices and no alerts each have an explicit empty state.

## Inputs

- `?month=YYYY-MM` (defaults to the current month, `parseMonthParam`).

## Outputs

- Status ribbon: month pace (bullet vs. plan-to-date), forecast close,
  invoices awaiting confirmation, cash leaving the account in 14 days, and the
  total euros at stake today.
- Worklist: up to `MAX_WORK_ITEMS` (6) items, each with its kind, urgency,
  title, reason, euros at stake and the action that resolves it.
- Rail: cumulative pace chart (actual / plan / run-rate forecast / month cap),
  the three categories closest to overrunning, and the next payments due.

## Business rules

- **Euros at stake ranks the list.** Items carrying money sort first by amount;
  items that carry none (a silent supplier, an uncategorised supplier) sort
  last. `sortWorklist(items, 'urgency')` re-sorts by `urgencyRank` on demand
  without changing the set.
- **Work item kinds and their sources**:
  - `price` — pending `price_shock` notifications (last 7 days). Impact is
    **spend-based**, not quantity-based: `monthSpend × dev / (1 + dev)`, the
    extra euros paid at the new price. The alert's basis may be per-unit or
    per-base-unit, so multiplying a quantity would compare unlike units; spend
    is unit-agnostic. Price *drops* raise no item. Top 3.
  - `budget` — a category whose run-rate forecast exceeds its monthly budget;
    euros at stake is the overrun. Top 2. Never raised for a closed month.
  - `due` — unpaid invoices (`pending` or `accepted`) with a due date. Overdue
    ones collapse into a single item carrying the total; the largest invoice
    due within 14 days gets its own.
  - `review` — invoices still in `pending`, i.e. extracted but not confirmed.
  - `missing` — `detectMissingInvoices` supplier-cadence gaps.
  - `supplier` — pending `supplier_uncategorized` notifications.
- **The worklist is always about today**, never about the browsed month; only
  the ribbon figures, the pace chart and the category rail follow `?month=`.
  Browsing a past month labels the list accordingly.
- **Colour encodes severity, never the kind of work** (ADR-026). Every
  `WorkItem` carries a `severity`: `high` for overdue payables, price rises and
  a budget already blown; `med` for a category only forecast to overrun and for
  a supplier that has gone quiet; `low` for invoices awaiting confirmation, a
  payment not yet pressing and an uncategorised supplier. `WorkCard` maps that
  to the warm ramp (`--mep-neg` / `--mep-warn` / `--mep-caution`); the icon
  glyph, not its colour, says which kind it is. Amounts stay on `--mep-fg` and
  the only blue on the screen is the action.
- **No number stands alone.** The pace figure carries a bullet against
  plan-to-date and the month cap; the forecast carries its distance from the
  cap; every category bar carries a plan tick and a forecast close.
- **Plan-to-date is linear** (`budget × elapsedDays / daysInMonth`). The
  design's seasonal weekday curve has no backing data in this schema; a
  straight line is the honest prorate.
- **Forecast is a run rate**: `spend / elapsedFraction`, month and category
  alike. A closed month forecasts to itself.
- Numbers from SQL aggregates are wrapped in `Number(...)` (postgres.js returns
  strings for numeric types).

## State transitions

The `markPaid` / `markUnpaid` actions still live on this route
(`invoice-status.ts`); the screen itself is read-only.

## Data dependencies

`invoices`, `invoice_line_items`, `suppliers`, `category_budgets`, `settings`
(`budget_warning_threshold`), `system_notifications` (`price_shock`,
`budget_overage`, `supplier_uncategorized`), plus `getTrendDataByRange` and
`detectMissingInvoices`.

## API dependencies

None at render time; every action is a link to `/analytics/prices`,
`/budgets`, `/reminders`, `/invoice/[id]`, `/invoices`, `/suppliers` or
`/extract`.

## UI dependencies

`DesktopDashboard.svelte`; `turno/StatusChip`, `turno/RailBlock`,
`turno/WorkCard`; `mep/Bullet`, `mep/PaceChart`, `mep/PeriodPicker`.
Derivations are pure and live in `src/lib/dashboard-turno.ts`.

## Background dependencies

Price-shock and uncategorised-supplier notifications are written by the alert
engine on invoice save; the dashboard only reads `status = 'pending'` ones.

## External dependencies

None.

## Validation

`parseMonthParam` clamps `?month`; unknown supplier-cadence frequencies fall
back to `turno.missing.why.periodic`.

## Error states

The load is wrapped in `handleLoad('dashboard', …)`.

## Edge cases

- **No budgets**: the pace chart drops its plan line and cap, the ribbon's pace
  note falls back to month-over-month, and the category rail invites the user
  to set budgets.
- **No spend and no budget for the month**: the pace chart is replaced by a
  short note rather than an axis of zeroes.
- **Nothing to act on**: the worklist is replaced by a "nothing to decide
  today" card pointing at `/extract`.
- **A shocked product not bought in the browsed month** scores zero euros and
  sorts to the bottom rather than disappearing.
- **A closed month** raises no budget items and draws no forecast.

## Security rules

Every query is scoped by `forTenant(rid).scope()` or an explicit
`restaurant_id = ${rid}` predicate in a `db.execute` template. No `sql.raw`.

## Idempotency rules

n/a (read-only).

## Observability

`handleLoad('dashboard', …)`.

## Acceptance criteria

- The whole screen fits 1440×900 without scrolling at six work items.
- Every work item shows an amount or is explicitly money-less, and every one
  links to the page that resolves it.
- The ribbon's cash-out figure counts only *upcoming* payments; overdue money
  is surfaced once, as the overdue work item.
- Light and dark both render from `--mep-*` tokens only, and no two work items
  of the same severity carry different hues.
- Strings are bilingual (`turno.*` in `src/lib/i18n.ts`).

## Code notes

### `src/lib/dashboard-turno.ts`

**`function priceShockImpact`**
- Spend-based rather than quantity-based on purpose: `deviationPct` may be
  measured per unit or per normalised base unit (see `alerts.ts`), so a
  quantity multiplication would mix units. `spend × dev/(1+dev)` is the extra
  paid at the new price whatever the basis, and needs only a `SUM(total_price)`.

**`function elapsedFraction`**
- A closed month is fully elapsed, so the same forecast and plan helpers work
  for past months without a branch at every call site.

**`const buildWorklist` severity**
- A budget item is `high` only once the category has actually overspent; a
  forecast overrun alone is `med`. The distinction is what stops a whole screen
  of forecasts from reading as an emergency in the first week of a month.

**`function buildWorklist`**
- Money-carrying items always outrank money-less ones, so a €0 item can never
  push a €600 one off the six-item list.

**`function buildPaceCurve`**
- The forecast segment starts at `lastActualDay` so the actual line and the
  forecast line meet instead of leaving a gap at today.

### `src/routes/(app)/dashboard/+page.server.ts`

**`const load`**
- `cashOutRows` uses `status IN ('pending','accepted')` — the payables
  semantics of `/reminders` — while the older `overdue`/`due_week` counters
  keep their `status='pending'` filter; they are different questions and were
  not merged in this change.
- Price-shock spend is a second round-trip after `Promise.all`, keyed on
  `invoice_line_items.description`, because the descriptions are only known
  once the notifications are read.

### `src/lib/components/desktop/turno/WorkCard.svelte`

**`function localiseDates`**
- Interpolation vars named `date` carry an ISO string from the server; the
  locale lives in the client store, so formatting happens here rather than in
  the pure derivation module.

### `src/lib/components/mep/PaceChart.svelte`

**`markup`**
- All labels arrive as props: the component stays free of hardcoded strings so
  `lint:i18n` holds.
