# Feature Spec — Price Alerts

## Purpose

Detect supplier price increases/decreases as soon as an invoice is saved and
notify the restaurant (in-app), before the change is "discovered" months later.

## Actors

- Signed-in member (views/dismisses alerts).
- Invoice save post-commit (fires the engine).

## Preconditions

- A new invoice commits with line items that reference an existing product
  (via `productByKey`).
- Same-supplier price history exists (or the alert is simply not raised).

## Inputs

- `invoiceId`, `supplierName`, line items, `restaurantId`, `productByKey`.
- `settings.price_alert_threshold` (default 0.15).

## Outputs

- `system_notifications` row of type `price_shock` with payload
  (`messageKey`/`messageVars`), basis `per_base_unit` or `per_unit`.

## Business rules

- **Threshold**: deviation ≥ `PRICE_SHOCK_THRESHOLD` (default 15%, settable).
- **History** (`alerts.ts`, `runPriceShock`): up to `PRICE_HISTORY_WINDOW` = 3 prior prices
  from the same supplier, keyed by `mep_norm_key(description)`, ordered by
  invoice date desc, merged by median (`collapseHistory`).
- **Basis**: prefer normalized €/base-unit comparison only when both sides have
  a normalized price AND matching `baseUnit`; otherwise per-unit.
- **Direction**: both increases and decreases fire (|deviation| ≥ threshold).
- Persisted at save time (`alerts.ts` insert, ~line 411), never derived at read
  time (ADR-010).
- **Opt-out** (#577): `saveAlerts` drops `price_shock` rows for tenants whose
  `alert_pref_price_shock` setting is `false`; detection still runs, only
  delivery is suppressed. See `docs/03_features/notifications.md`.

## State transitions

`system_notifications: pending → sent` (dismiss = mark sent via
`(app)/api/notifications`); `pending → resolved` (#831) when the invoice is
edited and the corrected unit price no longer deviates by the threshold —
`reevaluateInvoiceAlerts` (`alerts.ts`) re-runs `runPriceShock` against the
post-edit line items and resolves any pending `price_shock` for that invoice
whose ingredient no longer appears in the fresh result. Deleting the invoice
resolves its `price_shock` rows outright (`orphanInvoiceAlerts`) — there is no
invoice left to re-compare.

## Data dependencies

`invoices`, `invoice_line_items`, `suppliers`, `products`,
`system_notifications`, `settings`.

## API dependencies

`(app)/api/notifications` (list/mark-sent), `(app)/api/product-aliases`
(dismiss flows), `reminders` page.

## UI dependencies

`NotificationBell.svelte`, `MobileAlerts.svelte`, `NotificationItem.svelte`,
`/reminders`.

## Background dependencies

None (computed inline post-save).

## External dependencies

None.

## Validation

Same-supplier scope; unit-consistency guard before per-base-unit comparison.

## Error states

- No prior prices → no alert (silent).
- Mixed unit bases → falls back to per-unit comparison.

## Edge cases

- Large pack-vs-loose comparison (use normalized price path when units match).
- Same product from two suppliers — history is per-supplier, so no cross-supplier
  false shock.
- Threshold changed mid-month — new saves use the new value; existing alerts
  persist (re-evaluation compares against the *current* threshold, so an
  invoice edited after a threshold change is checked against the new value,
  not the one in force when the alert was first raised).

## Security rules

- Alert rows are tenant-scoped; history reads use raw SQL with explicit
  `restaurant_id` filters (never unscoped).

## Idempotency rules

- One alert per shock event; repeated identical invoices are blocked upstream by
  the content-hash gate, so the engine does not double-fire.

## Observability

- `price_shock` rows are countable in `/admin/events`; groupable in
  `notification-display.ts`.

## Acceptance criteria

- A ≥15% increase vs the same-supplier median raises exactly one `price_shock`.
- Per-base-unit basis used when normalized prices match units.
- Dismissing marks the row `sent` (badge stops counting it).
- Correcting the line's unit price on `/invoice/[id]/edit` so it no longer
  deviates by the threshold marks the alert `resolved` without a manual
  dismissal; a correction that still deviates leaves it `pending`.
- Tests: `tests/alert-engine.test.ts`, `tests/alert-engine-normalized.test.ts`,
  `tests/alert-engine-packs.test.ts`, `tests/alert-engine-price-history.test.ts`,
  `tests/alert-reevaluation.test.ts`.
