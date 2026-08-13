# Feature Spec — Notifications (in-app alerts, bell, badge, reminders hub)

## Purpose

Surface every alert type (price shock, stock forecast, budget, category,
unit-conversion, product suggestion, VERI\*FACTU mismatch) in one place with
consistent i18n rendering and actionable CTAs, plus the unified reminders hub.

## Actors

- Signed-in member (view, dismiss, act).
- Alert engines + invoice save (producers).

## Preconditions

- A producer wrote a `system_notifications` row.

## Inputs

- Notification type + payload (`messageKey`/`messageVars`, typed fields).

## Outputs

- Rendered rows in `/reminders`, `MobileAlerts.svelte`, header bell.
- Nav badge counts (overdue invoices + `budget_overage` level `exceeded`).
- Mark-as-`sent` on dismiss/action.

## Business rules

- **Producers** (`alerts.ts` `runPriceShock`/`runStockForecast`/`runBudgetCheck`,
  `invoice-save.ts`): `price_shock`,
  `low_stock_forecast`, `budget_overage`, `supplier_uncategorized`,
  `supplier_category_suggested`, `unit_conversion_needed`, `product_suggestion`,
  `verifactu_qr_mismatch`.
- **Storage**: `system_notifications(rid, invoiceId?, notificationType, message,
  payload, status pending|sent)`; index `(rid, status, created_at)`.
- **i18n**: `payload.messageKey/messageVars` rendered via `$tiv` in
  `NotificationItem.svelte`; icon/color/grouping from `notification-display.ts`
  (`priceShock`, `lowStock`, `budget`, `suppliers`, `other`).
- **Badge** (`+layout.server.ts:114`): overdue invoices (status `pending`/
  `accepted`, due < today) + pending `budget_overage` with `level='exceeded'` —
  deliberately NOT the raw pending count.
- **Reminders hub** (`/reminders`): overdue/due-soon invoices (status
  `pending|accepted`, `due_date <= now + 7 d`) + pending notifications; actions
  mark-paid/bulk-paid, accept/reject invoice; e-invoice acceptance deadlines use
  working days (`working-days.ts`).
- `(app)/api/notifications` GET (default `status=pending`), POST marks `sent`.

## State transitions

`pending → sent` (dismiss/action). Invoices: see `invoice_management.md`.

## Data dependencies

`system_notifications`, `invoices`, `invoice_line_items`, `suppliers`,
`stock_levels`, `category_budgets`, `settings`.

## API dependencies

`(app)/api/notifications`, `(app)/api/product-aliases` (dismiss),
`/reminders` actions.

## UI dependencies

`NotificationBell.svelte`, `NotificationItem.svelte`, `MobileAlerts.svelte`,
`reminders/+page.svelte`, nav badge in `+layout.svelte`.

## Background dependencies

None (producers run inline post-save).

## External dependencies

None.

## Validation

Type ∈ known set; payload shape per type; tenant scope.

## Error states

- Unknown `messageKey` → fallback string (i18n render should not crash).
- Notification referencing a soft-deleted invoice → safe render.

## Edge cases

- Many notifications at once — bell shows top-5; reminders page paginates.
- Same shock every save — content-hash gate upstream prevents duplicates.

## Security rules

- Notification reads/writes scoped to the tenant.

## Idempotency rules

- Producers dedupe (budget per category+level+month; category nudges per
  supplier). Marking `sent` is an update, not a delete.

## Observability

- `notificationType` breakdown in `/admin/events`.

## Acceptance criteria

- Every producer creates a `pending` row with the right payload; badge counts
  only overdue + exceeded budgets; dismiss → `sent`.
- Tests: `tests/events.test.ts`, `tests/alert-engine.test.ts`,
  `tests/working-days.test.ts`.
