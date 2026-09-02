---
tags: [mep, features]
related: "[[CONTEXT]]"
---

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

## Beta status

Frozen for the MVP private beta (2026-08-29 executive audit, PR #794): the
`/api/stock-levels` endpoint is disabled site-wide unless the `stock` row in
`app_flags` (`beta_feature_stock`, default disabled) is set to `'true'` — see
`docs/03_features/feature_flags.md`. Gated in `hooks.server.ts`
(`enforceFeatureFlag`), ahead of the existing `stockTracking` plan-tier check
in `entitlementHandle`, so both must allow the request. Toggle from
`/admin/feature-flags`.

## Code notes

### `src/routes/(app)/api/stock-levels/+server.ts`

**`const GET`**

- Lists all stock level entries for this restaurant. Rate limit is user-scoped, not IP or restaurant (issue #223, ADR-029) — `rateLimitScoped({ scope: 'user', name: 'stock-levels', max: 60 }, { userId })` — user rather than IP since behind a reverse proxy every request shares one IP and therefore one bucket; user rather than restaurant because this paces one person's own dashboard polling, not a shared tenant budget.

**`const POST`**

- Upserts the daily burn rate for an ingredient (TPV sync stub).

### `src/routes/(app)/api/unit-conversions/+server.ts`

**`const POST`**

- Saves a new UoM rule and clears pending flags; rate limit is tenant-scoped — `rateLimitScoped({ scope: 'tenant', name: 'unit-conversions', max: 30 }, { restaurantId: rid })` (issue #223; re-keyed from user to tenant by ADR-029/#440 — it writes into the shared per-tenant conversion catalog and retroactively updates the tenant's `invoice_line_items`, the same shape as `product-aliases`/`supplier-category`, which were already tenant-keyed).
- Clears pending flags joined by `supplier_id` when known, else by name; comparison is normalized (issue #296) so casing/accent/spacing drift between the pending line and the saved rule doesn't miss.
- Since #582 the route is a thin validating shell over `defineUnitConversion` (`src/lib/server/products.ts`); the upsert, the line-item flag clearing and the resolution of pending `unit_conversion_needed` alerts all live in that one helper so the Products suggestions tab and the supplier "conversiones" tab cannot drift apart. The response echoes `resolvedPrompts` — how many pending alerts the rule closed.
