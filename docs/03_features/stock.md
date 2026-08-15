# Feature Spec — Stock (levels, burn, forecast, conversions)

## Purpose

Track current stock per ingredient, estimate daily burn, and warn when an
incoming invoice quantity will not cover 3 days — plus a per-supplier unit
conversion catalog to make quantities comparable.

## Actors

- Signed-in member (edit stock levels; set conversion factors).
- Invoice save (forecast check + conversion application).

## Preconditions

- `stockTracking` entitlement (Pro/Business) for the stock API.
- `stock_levels` rows exist (user-managed) or are created implicitly.

## Inputs

- `(app)/api/stock-levels` GET/PUT: ingredient, current stock, unit, burn rate.
- Line-item quantities at save.

## Outputs

- `stock_levels` rows.
- `low_stock_forecast` notifications when projected stock < 3 days.
- `unit_conversion_needed` notifications when a unit is unknown.
- `unit_conversions` rows via `(app)/api/unit-conversions`.

## Business rules

- **Forecast** (`alerts.ts:171`): `projectedStock = currentStock + addedQty`
  (uses `convertedQuantity ?? quantity`); fires `low_stock_forecast` when
  `projectedStock / dailyBurnRate < LOW_STOCK_DAYS` (3).
- **Conversions** (`unit_conversions`): `(rid, supplier_name, ingredient,
  purchase_unit)` unique; supplier-scoped override wins over name-matched
  factors; applied at line-insert time (`invoice-save.ts`).
- **Gating**: `(app)/api/stock-levels` returns 403 when `!features.stockTracking`.
- Burn rate is user-supplied; there is no automatic burn inference from TPV data
  (that integration is waitlist-copy only, not implemented).

## State transitions

n/a (rows + notifications `pending → sent`).

## Data dependencies

`stock_levels`, `unit_conversions`, `invoice_line_items`, `system_notifications`,
`subscriptions` (gate).

## API dependencies

`(app)/api/stock-levels`, `(app)/api/unit-conversions`.

## UI dependencies

`/settings` and line-item review CTAs; `NotificationItem.svelte` ("set
conversion" action); `/reminders`.

## Background dependencies

None.

## External dependencies

None.

## Validation

Numeric stock/burn; unit strings through `canonicalizeUnit`; tenant scope.

## Error states

- No stock row → forecast skipped for that ingredient.
- Unknown unit on a line → flagged `requires_unit_conversion`, saved anyway,
  `unit_conversion_needed` raised.

## Edge cases

- Negative burn or stock (user error) — forecast math still runs; guard if
  absurd.
- Ingredient spelled differently per invoice — conversions are keyed by
  supplier+ingredient name; normalization reduces drift.

## Security rules

- Stock and conversion writes scoped to the tenant; feature-gated API.

## Idempotency rules

- Stock upsert by `(rid, ingredient)`; conversions by unique key.

## Observability

- Forecast alerts countable in `/admin/events`.

## Acceptance criteria

- Setting stock/burn for an ingredient and saving an invoice whose line pushes
  the ratio < 3 days raises `low_stock_forecast`.
- Setting a conversion factor changes the converted quantity used downstream.
- Tests: `tests/alert-engine.test.ts` (forecast), `tests/unit-bridge.test.ts`.

## Code notes

### `src/routes/(app)/api/stock-levels/+server.ts`

**`const GET`**

- Lists all stock level entries for this restaurant. Rate limit keyed on the authenticated user, not the client IP (issue #223) — `stock-levels:${locals.user!.id}`, 60/min — since behind a reverse proxy every request shares one IP and therefore one bucket.

**`const POST`**

- Upserts the daily burn rate for an ingredient (TPV sync stub).

### `src/routes/(app)/api/unit-conversions/+server.ts`

**`const POST`**

- Saves a new UoM rule and clears pending flags; rate limit `unit-conversions:${locals.user!.id}`, 30/min (issue #223).
- Clears pending flags joined by `supplier_id` when known, else by name; comparison is normalized (issue #296) so casing/accent/spacing drift between the pending line and the saved rule doesn't miss.
