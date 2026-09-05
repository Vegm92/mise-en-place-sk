# ADR-039 — What the app shows an owner is ranked by euros at stake; everything that cannot be priced or acted on is demoted

**Status:** Active
**Feature:** insights (dashboard, reminders, suppliers, products, recipes, budgets, digest)
**Date:** 2026-09-05
**Issue:** production-readiness goal, section 4

## Context

An inventory of every figure surfaced to a restaurant owner (dashboard,
reminders, digest, suppliers, products, analytics, recipes, budgets) found the
following.

- The dashboard loader computed ~30 fields and the turno UI rendered 12. The
  unrendered payload (`dashboard_alerts`, `alert_counts`, `category_spend[]`
  with `pct`, `recent_invoices`, top-6 `suppliers`, `supplier_count`,
  `avg_invoice`, `avg_per_supplier`, `total_pct_*`, `budget_threshold`,
  `price_shock_alerts`, a 30-day weekly `trend`) cost nine queries per load
  and told the owner nothing.
- The only euro figure attached to a price rise was
  `monthSpend × dev / (1 + dev)` — the month's spend on that description
  times the *latest* deviation, whichever notification happened to be pending.
  Nothing said what the same quantity would have cost from another supplier,
  although `product_aliases` already links the same product across suppliers.
- Missing deliveries were detected for every supplier but only the first
  became a work card; the suppliers list did not show cadence at all.
- Recipes had a cost per portion and a food-cost %, but no history — the only
  "trend" was recipes created per month.
- The budgets page forecast the month as `pct × 31 / day-of-month`
  (hard-coded 31 days, `new Date().getDate()` even for a past month) while the
  dashboard used a correct run-rate helper — two forecasts that disagreed.
- Reminders listed pending notifications raw, in two groups that restate the
  dashboard, with no euro total.
- Percent-only figures were everywhere (MoM %, delta %, change %); "€ at
  stake" existed only as the dashboard headline.

Alternatives rejected:

- **Keep the notification-driven price shocks.** They are the *alert* record
  (ADR-010) and carry no quantity; deriving euros from them means using a
  month's spend as a proxy. Re-deriving from the invoice lines in the selected
  period gives the actual overpaid amount per line.
- **A recipe cost snapshot table + nightly job.** Correct in the limit, but a
  migration and a fan-out job for a figure that can be recomputed from the
  invoice lines as of any date; six extra price queries per recipes page load
  is cheap at this scale and works retroactively on day one.
- **Removing analytics/extraction and the products "new per month" chart.**
  Both are low-value for an owner, but they are behind nav entries and plan
  tiers; taking pages away is a product call, recorded here as candidates.

## Decision

Every owner-facing signal must answer "how many euros, and what do I do about
it". Concretely:

1. **Price deviation in euros with a supplier alternative**
   (`src/lib/server/price-deviations.ts`). For each invoice line in the
   selected period: reference = median of the ≤3 previous prices from the same
   supplier on the same basis (normalised €/base-unit when available, else
   unit price on the same unit); deviation = (paid − reference) / reference;
   overpaid € = line total × dev / (1 + dev) — what that quantity would have
   cost at the reference price. Groups whose latest deviation clears the
   tenant's `price_alert_threshold` are reported with the € overpaid over the
   period and the **cheapest other supplier** selling the same product on the
   same basis in the last 180 days, with the € the period's purchases would
   have saved. The dashboard price work cards use this figure and link to the
   product; `/products/[id]` shows the per-supplier price table; `/reminders`
   shows the € overpaid next to each price-shock notification.
2. **Missing-delivery cadence for every supplier**
   (`supplier-cadence.ts` → `inferSupplierCadence`). Median gap, frequency
   label, next expected date and a `late` flag per supplier; the dashboard
   shows up to three late suppliers, the suppliers list shows the cadence
   under the last-order date on both variants, and `/reminders` gets a
   "missing deliveries" section that links to the supplier.
3. **Food cost per recipe over time** (`recipes.ts` → `recipeCostTrend`).
   The recipe graph is re-priced as of each of the last six month-ends
   (`resolveProductPrices(rid, ids, asOf)`) plus today; the recipes page
   chart is the average food cost % at month end (replacing "recipes
   created"), and each recipe shows its cost-per-portion delta vs. the
   earliest priced month-end.
4. **One budget pace.** The budgets page uses the dashboard's `planToDate` /
   `forecastFromRunRate` with the real days-in-month and elapsed days of the
   selected calendar month (ADR-038), and shows plan-to-date next to the
   forecast; the ×31 arithmetic is gone.
5. **Demoted.** The dashboard loader returns only what the turno UI renders;
   the "recipes created per month" chart is replaced by the food-cost trend.
   Candidates not removed here: `analytics/extraction` (product telemetry,
   belongs under `/admin/learning`), the products "new per month" chart, the
   weekly digest's restatement of dashboard figures in prose.

## Consequences

- Price work cards now change with the browsed month and disappear when the
  period's lines carry no rise, instead of lingering for seven days as a
  notification would. The notification record is unchanged (alerts still
  fire on save, ADR-010); the two can disagree on a given day by design.
- The alternative is only offered on a comparable basis; a product bought by
  the kilo from one supplier and by the box from another (no normalised
  price) gets no alternative rather than a wrong one.
- Recipes page cost grows by six price queries + six graph computations;
  acceptable at tens of recipes, to be revisited with a snapshot table if a
  tenant reaches hundreds.
- Held by `tests/price-deviations.test.ts`, `tests/supplier-cadence.test.ts`,
  `tests/recipe-cost-trend.test.ts`, `tests/dashboard-turno.test.ts`.

## Related

- [ADR-010](./ADR-010-alerts-computed-on-save.md) — alerts stay the record;
  this decision reads the lines, not the alerts, for the euro figure.
- [ADR-038](../experience/ADR-038-one-period-rule-per-page-type.md) — the
  calendar month the dashboard and budgets pace against.
