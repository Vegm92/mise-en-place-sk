---
tags: [mep, product]
related: "[[CONTEXT]]"
---

# Revenue Metrics — `/admin/revenue`

The SaaS metrics behind the admin revenue dashboard. Implementation lives in
`src/lib/server/revenue-metrics.ts`; the page is
`src/routes/(admin)/revenue/`. Owner-email gated like all of `/admin`.

## Data sources

| Source | Used for |
|---|---|
| `subscriptions` (live rows) | current MRR, payers, at-risk, per-tier breakdown, leakage |
| `mrr_snapshots` (per tenant per month) | history, cohorts, churn/retention — captured by the worker cron `scheduled-mrr-snapshot` (`captureMrrSnapshot`, 15 2 * * * UTC) and by `backfillMrrSnapshots` |
| `acquisition_costs` | CAC spend input (owner adds entries per month) |
| `waitlist` / `restaurants` / `invoices` | activation funnel (waitlist → signup → activated → paying) |
| `settings` (assumptions) | editable LTV horizon, CAC window, and assumption overrides |

`mrr_snapshots` rows are unique on `(month, restaurant_id)` and re-captured
idempotently (`onConflictDoNothing`). `source` records how the row was written
(cron vs backfill).

## Formulas

- **MRR**: sum over paying subscriptions of the tier's monthly price
  (`planMonthlyPriceCents` — `PLAN_PRICE_*_EUR` env override, else
  `PROVISIONAL_PRICE` from `src/lib/billing-plans.ts`); `arr = mrr * 12`.
- **Payers**: tenants with `mrrCents > 0` in the month.
- **ARPA / ACV**: derived from MRR ÷ payers (per month); ACV uses a 12-month
  horizon.
- **Monthly churn (logo)**: `churned(start-month payers that are zero this month) / start payers`,
  averaged over available month transitions.
- **Revenue churn**: MRR-weighted analogue over the same transitions.
- **GRR (monthly) / NRR**: NRR uses a 12-month lookback baseline
  (`NRR_LOOKBACK_MONTHS`); GRR is the retention version ignoring upsell.
- **Lifetime (months)**: `1 / avgMonthlyChurn`; **LTV** = ARPA × lifetime,
  capped by the assumption horizon; **LTV:CAC** = LTV ÷ CAC; **payback** =
  CAC ÷ (ARPA − COGS share) using spend assumptions.
- **CAC**: `acquisition_costs` total over the configured window
  (`DEFAULT_CAC_WINDOW_MONTHS = 3`) ÷ new paying customers in that window.
- **Cohorts**: month-of-first-paying-snapshot retention and MRR curves from
  `payingHistory()`.
- **Leakage** (`syncLeaks`): categories — `pastDue` (at-risk), `scheduledCancel`,
  `expiredTrial`, `abandonedCheckout`, `stalePeriod`, `activeWithoutStripe`,
  `unknownPrice` — each with count, monthly-€ impact, and severity. The
  `unknownPrice` category is fed by price-ids not in `TIERS` (see
  `docs/03_features/billing.md`'s fallback behavior).

## Caveats / watch-items

- **Tenant-scope-ok notes**: these queries are platform-wide aggregates read
  only by the admin console — they intentionally do NOT use
  `forTenant().scope()` (marked inline in the module).
- **Provisional pricing**: before launch, MRR is computed from `PROVISIONAL_PRICE`
  — treat all euro figures as estimates until real `STRIPE_PRICE_ID_*` pricing
  lands.
- **Missing snapshots**: months without a cron capture are estimated from live
  rows (`estimatedMonths` vs `snapshotMonths`); `lastCapturedAt` shows freshness.
  If the worker's MRR cron stops, the history goes stale — check
  `docs/05_operations/monitoring.md`.
- **At-risk MRR**: `atRiskCents` per snapshot reflects subscriptions flagged
  `past_due`/canceling at capture time.
- **LLM-cost line items** (if modeled in spend) are assumptions, not live
  metering — chat and digest call Gemini directly and are not recorded in
  `llm_usage_log` (see `docs/03_features/chat.md`).
