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

## Activation funnel — `/admin/activation`

Onboarding target: **first upload to first insight in under 10 minutes**.
Implementation: `activationFunnel()` / `activationReport()` in
`src/lib/server/activation-metrics.ts`. Every step is derived read-only from
rows the product already writes. There is no events table and no migration, so
the numbers cover the existing beta history as well.

**Who counts.** One row per top-level restaurant (`parent_id IS NULL`). A
secondary location is not a signup, and its activity is not rolled up into
its parent. A restaurant is excluded as internal when any member's email is in
`AUTH_ADMIN_EMAIL` or sits on a reserved test domain (`example.com/org/net`,
`*.test`, `*.example`, `*.invalid`, `localhost`). The page shows how many
were excluded. A real tester on a real address counts as a customer unless that
address is also an admin.

| Step | Timestamp | Source |
|---|---|---|
| Signup | `signup_at` | `restaurants.created_at` |
| First upload | `first_upload_at` | earliest of `batch_items.created_at` and `usage_events.created_at` where `kind = 'claim'` |
| First extraction | `first_extracted_at` | earliest of `batch_items.extracted_at` where `extracted_data` is set, and `extraction_results.created_at` where `run_kind = 'live'` |
| First insight | `first_insight_at` | earliest `system_notifications.created_at` of type `price_shock`, `possible_duplicate_purchase`, `line_item_mismatch` or `budget_overage` |
| Active in week 4 | — | an upload (batch item or claim) or a reviewed invoice (`review_state <> 'por_revisar'`) in `[signup + 21 d, signup + 28 d)`, i.e. days 22–28 |

- **Why two upload sources.** `cleanupStaleBatches` deletes every upload batch
  older than 24 h, and its `batch_items` with it. The `claim` row
  `claimMonthlyExtraction` writes when the worker picks an item up is never
  swept, so it carries upload history past day 1. It lands seconds after the
  upload (queue delay), so older first-upload times can be late by that much.
- **Why these four alert types count as an insight.** Each one tells the owner
  something about money that they did not type in: a supplier price moved ≥ the
  threshold, a possible double charge, an albarán/factura line that does not
  reconcile, or a category over budget. Housekeeping prompts
  (`supplier_uncategorized`, `unit_conversion_needed`, `product_suggestion`,
  WhatsApp review reminders, phone/tax-id mismatches) do not count. The
  timestamp is when the alert was raised. Nothing records when it was seen.
- **The funnel is strict.** Each step counts restaurants that reached it *and
  every step before it*. The conversion is shown against the previous step. The
  week-4 step's base is the restaurants that reached an insight **and** whose
  day-28 window has closed.
- **Time to first insight.** `first_insight_at − first_upload_at`, in minutes.
  Median and P75 cover the restaurants that reached an insight. *Within
  10 min* is `insight ≤ 10 min after first upload` over **every** restaurant
  whose first upload is at least 10 minutes old, so restaurants that never
  get an insight count against the target instead of dropping out. The
  distribution buckets (≤ 10 min, ≤ 1 h, ≤ 1 day, ≤ 7 days, > 7 days, none
  yet) are shares of every restaurant that uploaded.
- **Activation rate.** Restaurants whose first insight came ≤ 7 days after
  signup, over restaurants at least 7 days old. Younger ones are left out of
  the rate rather than counted as failures.
- **Week-4 retention.** Active on days 22–28, over restaurants at least
  28 days old, overall and per weekly signup cohort. Cohorts use the Monday of
  the signup week in `APP_TIMEZONE` (default `Europe/Madrid`). Only the 12
  most recent cohorts are shown.
- **Not the same as the #786 panels** on the same page. *Time-to-value* is
  signup → first **reviewed** albarán (median / P90). *Week-1 reviewers in
  week 4* takes week-1 reviewers as its cohort and only counts reviews as
  activity. Both are kept as they were and now use the same tenant exclusion.
  The revenue funnel's `activated` (ever saved an invoice) is different again.

Watch-items:

- The 14-day trial (30 for founders) ends before day 22. `claimExtractionAllowance`
  refuses an expired trial's upload *before* it writes a claim, and the swept
  batch item leaves nothing behind. So for a non-founder, week-4 activity is
  close to a paid-and-active signal.
- Price alerts need same-supplier history (`runPriceShock` compares against
  up to 3 prior prices), so a restaurant's very first invoice can never raise a
  `price_shock`. Reaching the 10-minute target means the owner uploads at least
  two albaranes from the same supplier in the first session.
- `price_shock` can be switched off per tenant (`alert_pref_price_shock`). An
  opted-out tenant never raises that type, and the funnel cannot see detection
  without delivery.

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
