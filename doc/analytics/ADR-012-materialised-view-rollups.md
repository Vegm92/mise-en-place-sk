# ADR-012 — Analytics Reads Pre-Aggregated Materialized Views

**Status:** Active — **refresh mechanism unresolved**, see *Open problem* ([#424](https://github.com/Vegm92/mise-en-place-sk/issues/424))
**Feature:** Analytics
**Date:** 2026-08-09
**Issue:** [#127](https://github.com/Vegm92/mise-en-place-sk/issues/127)

## Context

The analytics pages ask questions that are expensive against normalised tables:
spend per ingredient per month, price evolution per item, spend per category,
extraction quality per month. Each one is a `GROUP BY` over
`invoice_line_items ⋈ invoices ⋈ suppliers` filtered by tenant and date, and each
page issues several of them at once. The dashboard fanned out the same way.

For a restaurant a year into using the app, that is tens of thousands of line
items re-aggregated on every page view, for numbers that change a handful of
times a day.

## Decision

**Five materialized views hold the aggregations; pages read from them.**

| View | Grain | Feeds |
|---|---|---|
| `mv_supplier_monthly_spend` | restaurant × supplier × month | Dashboard supplier cards |
| `mv_item_monthly_spend` | restaurant × normalised item × month | Spend analytics: top items, sparklines |
| `mv_category_monthly_spend` | restaurant × category × month | Category breakdown |
| `mv_price_snapshots` | restaurant × item × observation | Price evolution charts |
| `mv_extraction_stats` | restaurant × month | Extraction-quality dashboard |

Two supporting decisions came with them:

**Every view carries `restaurant_id` in its grain and a unique index leading with
it.** Tenant scoping survives the aggregation — the pages' `WHERE restaurant_id =
$1` is an index seek, not a scan of every tenant's rollup.

**Unique indexes exist so that `REFRESH … CONCURRENTLY` is possible.** Postgres
requires one. Without it a refresh takes an `ACCESS EXCLUSIVE` lock and analytics
pages block for its duration.

Two targeted partial indexes on the base tables landed in the same migration for
the queries that legitimately stay live:
`idx_invoices_rid_invoice_date WHERE deleted_at IS NULL` and
`idx_ili_unit_price WHERE unit_price IS NOT NULL`.

### Not everything moved to the views

The spend page's KPI tile still aggregates `invoice_line_items` directly, in the
same `Promise.all` as the three view-backed queries. That is deliberate: the KPIs
need `COUNT(DISTINCT invoice_id)`, which does not survive pre-aggregation to a
monthly grain. Mixing live and rolled-up sources in one page is accepted — with
the consequence noted below that the two can disagree.

`mv_item_monthly_spend` groups on `LOWER(TRIM(description))` and later migrations
(`0018`, `0021`) moved it and `mv_price_snapshots` onto `mep_norm_key()`, the SQL
twin of the application's `normalizeProductKey`
([ADR-009](../invoicing/ADR-009-unit-normalisation-and-product-identity.md)).
Rollups and application logic group items the same way, or they would disagree
about what a product is.

## Open problem — nothing refreshes the views ([#424](https://github.com/Vegm92/mise-en-place-sk/issues/424))

`refresh_analytics_rollups()` exists and does the right thing (all five,
`CONCURRENTLY`, `SECURITY DEFINER`). **Nothing calls it.**

The migration's plan was a `pg_cron` schedule, written as a commented-out
`cron.schedule(…)` to be pasted into *the Supabase dashboard*. Supabase is gone
([ADR-005](../tenancy/ADR-005-rls-retired.md)) and the instruction went with it.
A repository-wide search finds no caller: not in `src/`, not in the worker's job
table ([ADR-011](../insights/ADR-011-scheduled-jobs-in-the-worker.md)), not in
`scripts/`, not in the deploy runbook.

**Current behaviour: the views hold whatever they contained when they were
created, and analytics pages show data frozen at that point.** For a fresh
Railway database that is the state at migration time — effectively empty.

This is recorded here rather than fixed silently because the fix is a design
choice, not a typo. The options:

1. **Add a pg-boss scheduled job** calling `SELECT refresh_analytics_rollups()`.
   Consistent with ADR-011, needs no extension, runs where the other cron jobs
   run. The obvious default.
2. **Enable `pg_cron` on Railway** and schedule it in the database. Closest to
   the original intent; adds an extension dependency and puts the schedule
   somewhere no code review will see it.
3. **Refresh incrementally on invoice save.** Accurate immediately, but
   `REFRESH … CONCURRENTLY` over five views on every save is far too expensive.
4. **Drop the views and query live**, keeping the partial indexes. Correct by
   construction; gives back the cost #127 was raised to remove.

Option 1 is the recommendation. Until one is implemented, treat the analytics
pages as showing stale data, and note that the KPI tiles — which query live —
will not agree with the view-backed panels beside them.

## Consequences

- **Analytics are eventually consistent by design.** Even once refreshing works,
  an invoice saved at 14:00 does not appear in the rollups until the next
  refresh. Acceptable for monthly spend analysis; it is why alerts
  ([ADR-010](../insights/ADR-010-alerts-computed-on-save.md)) compute against
  live tables instead — a price-shock warning must not wait for a refresh.
- **Adding a column to a view requires a full migration cycle**: drop, recreate,
  recreate both indexes. `0018` and `0021` are worked examples.
- **`REFRESH CONCURRENTLY` needs the unique indexes to keep existing.** Dropping
  one to "clean up" silently converts refreshes into blocking operations.
- The views deliberately exclude soft-deleted invoices (`deleted_at IS NULL`) and
  rows with no `invoice_date`, so a deleted invoice leaves the rollups at the
  next refresh rather than lingering.

## Related

- [ADR-009](../invoicing/ADR-009-unit-normalisation-and-product-identity.md) — `mep_norm_key`, the shared grouping key
- [ADR-011](../insights/ADR-011-scheduled-jobs-in-the-worker.md) — where a refresh job would go
- [ADR-003](../data/ADR-003-committed-migrations-are-canonical.md) — why views live in migrations, not `schema.ts`
