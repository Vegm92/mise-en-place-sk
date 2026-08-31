# ADR-010 — Alerts Are Computed at Save Time, Not Read Time

**Status:** Active
**Feature:** Insights (alerts, budgets)
**Date:** 2026-08-09

## Context

The app owes a restaurant six kinds of warning: a supplier's price jumped, an
ingredient will run out, a category budget is nearly spent, a supplier has no
category, a product looks like one already in the catalogue, and a unit could not
be converted.

There are two places to compute these. **At read time**, when the dashboard
loads: always current, no storage, but re-runs six analytical queries on every
page view and — critically — cannot tell the difference between an alert the user
has seen and one they have not. **At write time**, when an invoice is saved: one
computation per invoice, a durable record, natural read/unread state, and an
alert that names the event that caused it.

The second matters because these are *notifications*, not *statistics*. "Tomatoes
are up 23%" is a fact about a specific delivery, and it should arrive once,
attached to that invoice.

## Decision

**All six rules run once, immediately after the invoice transaction commits**, in
`saveReviewedInvoice`'s post-commit block, and their output is persisted to
`system_notifications` by `saveAlerts` in a single transaction.

| Rule | Triggered by | Compares against |
|---|---|---|
| `price_shock` | Every line with a unit price | Last 3 prices for that product from **the same supplier** |
| `low_stock_forecast` | Lines matching a tracked `stock_levels` row | Projected stock ÷ daily burn rate < 3 days |
| `budget_overage` | Supplier's category | Month-to-date category spend vs `category_budgets` |
| `categorization_nudge` | Uncategorised supplier | — |
| `category_suggestion` | Model-proposed supplier category | Existing category |
| `unit_conversion_needed` | Lines whose unit did not canonicalise | — (raised inside the transaction) |

Each alert carries a `messageKey` plus `messageVars` in its JSON payload rather
than a rendered sentence. The stored `message` field is a debug string
(`price_shock: Tomate +23%`); what the user reads is rendered from the key at
display time in their locale. An alert written in June renders in English if the
user switches language in August — see
[ADR-021](../experience/ADR-021-bilingual-single-string-table.md).

### Price shock compares like with like, or refuses to compare

The rule prefers **normalised** prices (€/kg, €/L, €/ud from
[ADR-009](../invoicing/ADR-009-unit-normalisation-and-product-identity.md)) and
falls back to raw unit price. It only uses the normalised basis when *both* sides
have one **and their base units agree** — so a supplier who switched from selling
by the box to selling by the kilo does not generate a fake 2000% spike. The
resulting alert records which basis it used (`basis: 'per_base_unit' | 'per_unit'`),
so the number is auditable after the fact.

History is scoped to the **same supplier** by design. A price shock is a
statement about a supplier changing their price, not about this supplier being
dearer than another. Cross-supplier comparison is an analytics question, not an
alert.

Product identity for the lookup prefers the resolved `product_id` and falls back
to `mep_norm_key(description)` — so history survives a description change once the
product catalogue has linked them, and still works before it has.

The threshold is per-tenant (`settings.price_alert_threshold`, default **0.15**),
because a 15% swing is routine for fish and alarming for dry goods.

### Budget alerts de-duplicate per month per level

`runBudgetCheck` scans this month's existing `budget_overage` notifications and
suppresses a repeat at the same `(category, level)`. Without it, every invoice
after crossing 80% would re-warn. The two levels escalate independently: crossing
80% warns once, crossing 100% warns once more.

## Consequences

- **An alert only exists if an invoice caused it.** Nothing here is a background
  sweep. Setting a budget that is already exceeded raises nothing until the next
  invoice in that category arrives. This is a real gap and an accepted one — the
  rules are written as functions of a saved invoice.
- **An alert whose condition is a function of editable data is re-checked, not
  just raised, when that data changes** (#831). `price_shock`, `budget_overage`,
  `possible_duplicate_purchase`/`related_document_found`, and
  `verifactu_qr_mismatch` are all pure functions of fields the user can later
  correct on the invoice edit screen (a mis-OCR'd price, a wrong total, a wrong
  date). Editing the invoice re-runs the same rule that raised each of its
  pending alerts and marks any whose condition no longer holds as `resolved` —
  a status distinct from `sent` (the user's own dismissal), so the two outcomes
  stay distinguishable. Deleting an invoice orphans (`resolved`) the alerts that
  refer to it directly, since there is nothing left to re-compare; `budget_overage`
  is instead re-evaluated against the category's remaining spend, since it is a
  category-wide condition rather than one specific to the deleted invoice.
  `categorization_nudge`/`category_suggestion` close the same way when the
  supplier's category is corrected directly on its profile, not only when
  accepted from the suggestion widget. This is still best-effort and inline
  with the edit/delete request, not a background sweep — a budget set
  already-exceeded still raises nothing until the next invoice, as above; only
  a *previously-raised* alert gets the re-check. See
  `src/lib/server/alerts.ts` (`reevaluateInvoiceAlerts`, `orphanInvoiceAlerts`,
  `resolveSupplierCategoryAlerts`) and `docs/03_features/notifications.md`.
- **Alert computation is best-effort.** It runs in
  [ADR-008](../invoicing/ADR-008-single-invoice-write-path.md)'s non-fatal
  post-commit block: a failure logs and the invoice still saves, with no alerts
  and no retry. Correct priority, but it means alert coverage is not guaranteed.
  A transient database error costs that invoice its alerts permanently.
- **Rules run sequentially, not in parallel.** Five `await`s in a row, each
  issuing its own queries. It is after the response-critical work and off the
  user's blocking path, so latency has not justified parallelising.
- **Retroactive rule changes do not apply retroactively.** Lowering the
  price-shock threshold affects future invoices only; historical alerts are
  frozen at the threshold that was in force. Re-running rules over history would
  need a backfill job that does not exist.
- `alert-engine.ts` and `notifications.ts` are pure re-export barrels over
  `alerts.ts`. The rules, the scheduled jobs
  ([ADR-011](./ADR-011-scheduled-jobs-in-the-worker.md)), and the tenant-sweep
  helpers all live in that one 650-line module. The barrels preserve the import
  paths that the rest of the app uses.

## Related

- [ADR-008](../invoicing/ADR-008-single-invoice-write-path.md) — where these run
- [ADR-009](../invoicing/ADR-009-unit-normalisation-and-product-identity.md) — the normalised prices they compare
- [ADR-011](./ADR-011-scheduled-jobs-in-the-worker.md) — the time-driven counterpart
