# ADR-027 — Spend Is Attributed by the Line's Product; the Supplier's Category Is a Label

**Status:** Active
**Feature:** Analytics
**Date:** 2026-08-26
**Issue:** — (design note "Categoría del gasto: del proveedor a la línea")

## Context

Every category breakdown in the app grouped by `COALESCE(suppliers.category,
'Other')`: `mv_category_monthly_spend` (migration 0005, redefined in 0039), the
budgets page, the monthly and weekly reports, the spend trend, the dashboard
donut, `runBudgetCheck`, the supplier list's spend trend, and the chat snapshot.

That answers "how much did I spend with produce suppliers", not "how much did I
spend on produce". For a specialist they are the same number. For a generalist
wholesaler they are not: every euro it billed — vegetables, cleaning products,
packaging — landed in one bucket, usually `'Other'`, because a wholesaler is
exactly the supplier nobody can tag. Budgets, the analytics page, the trend and
the dashboard all inherited that lump.

The schema already had the finer fact. A product carries a category, a line
carries a product, an invoice is a set of lines. The intuition — *the product
has a category → the delivery note is a set of products → the supplier is
characterised by its delivery notes* — was inverted in the code: the category
travelled from the supplier down to the product.

Two things had to be true before the read side could be moved, and only one was:

- **The join was cheap.** `idx_invoice_line_items_product_id` already covered
  it, and every one of these queries except the dashboard, the trend, the
  supplier list and `runBudgetCheck` already summed line items — only the
  `GROUP BY` had to change.
- **`products.category` had no source of its own.** A product was created
  carrying the category of the supplier that first delivered it
  (`invoice-save.ts` → `resolveOne`), `ON CONFLICT … DO UPDATE SET name_key =
  products.name_key` meant it was never refreshed, and the supplier edit form
  re-stamped the supplier's tag over its products. Nothing in the app ever
  judged a *product*. Changing only the read side would have been close to a
  no-op: the product would have repeated what the supplier said.

Alternatives considered and rejected:

- **Several tags per supplier.** Half an afternoon in the filter (equality
  becomes membership) and it solves nothing: two labels say *what* a supplier
  sells, never *how much* of each. In the money it actively breaks —
  `mv_category_monthly_spend` is unique on `(restaurant_id, category, month)`,
  so either the spend is duplicated into both categories (the total stops
  adding up and every budget blows) or it is split, and there is nothing to
  split it by while the label hangs off the supplier.
- **Leave the read side alone and only categorise products.** Keeps the
  generalist's lump exactly where it is; the catalogue work buys nothing.
- **Have extraction emit a category per line.** More tokens on the hot path,
  per invoice, forever — for a fact that is a property of the product, not of
  the document. Products are a bounded set per restaurant and are categorised
  once.

## Decision

**One criterion, everywhere the money is split by category:**

```sql
LEFT JOIN products ON products.id = invoice_line_items.product_id
                  AND products.restaurant_id = invoice_line_items.restaurant_id
COALESCE(products.category, suppliers.category, 'Other')
```

It lives in `src/lib/server/category-spend.ts` (`lineCategoryExpr`,
`lineProductJoin` / `lineProductJoinOn`, `lineAmountExpr`, `describedLine`) and
is imported by every consumer, so the criterion cannot drift between surfaces.
The `'Other'` inside the expression is a SQL *literal*, not a bound parameter:
Drizzle binds a sentinel afresh on each occurrence, so a parameter renders
differently in `SELECT` and `GROUP BY` and Postgres rejects the statement (the
bug `tests/trend-categories.test.ts` was written for).

**The `LEFT` and the middle `COALESCE` arm are load-bearing.** A line can have
no product: linking is stamped after the invoice transaction commits inside a
`try/catch` that swallows the error, editing an invoice deletes and re-inserts
its lines, and `unlinkSupplier` nulls `product_id` on purpose. With an inner
join that spend would disappear from the breakdown in silence. It falls back to
the supplier's tag instead.

**The supplier's category stays** — as a label: it filters and colours the
supplier list, and it is the fallback above. It is no longer what divides the
money.

**`products.category` gets its own source.** A `categorize-product` pg-boss job
(`processCategorizeJob`, queue `CATEGORIZE_QUEUE`) takes the canonical name and
returns one value from `VALID_CATEGORIES`, through the same `resolveCategory`
floor (`MIN_CATEGORY_CONFIDENCE = 0.6`) the extraction's supplier category uses
— hence the rename from `resolveSupplierCategory`: the function only validates
against the taxonomy and was never supplier-specific. A verdict the floor
rejects leaves the product **NULL**, not `'Other'`: NULL means "not judged yet"
and is what `/products` surfaces as pending work, while `'Other'` is a real
verdict. The job only ever fills a NULL, so a human's choice is never
overwritten.

**The product no longer inherits the supplier's category.** `invoice-save.ts`
passes `category: null`, and the supplier edit form no longer stamps its tag
over its products.

**The supplier's own label is proposed back from its lines.** When extraction
has no category to offer, `runCategorySuggestion` falls back to the category
carrying ≥ 50% of that supplier's line spend (`dominantSupplierLineCategory`)
and raises the existing `supplier_category_suggested` notification. Suggested,
never imposed — which is where "the supplier is characterised by its delivery
notes" finally becomes true.

`mv_category_monthly_spend` keeps its column list, grain and index names, so the
unique index `REFRESH … CONCURRENTLY` needs and `refresh_analytics_rollups()`
are untouched. Migration 0044 swaps it in by build-then-rename (the shape
migration 0034 used), leaving the previous view as
`mv_category_monthly_spend_old` for an instant rollback.

## Consequences

- A generalist's delivery note now splits across the categories of what it
  actually delivered. Budgets, the analytics page, the reports, the trend, the
  dashboard donut and the chat snapshot all move together.
- **`runBudgetCheck` now raises one alert per budgeted category the invoice
  touched**, not one for the supplier's category. An invoice with produce and
  cleaning products on it can trip two budgets. The month/category/level dedup
  is unchanged.
- **The dashboard donut, the trend, the supplier-list trend and the budget
  check moved from `invoices.total_amount` to line sums.** An invoice total is
  atomic and cannot be divided, so there was no other way — but it means an
  invoice saved without line items (an albarán with only a total) no longer
  appears in these breakdowns. Line-level queries also filter on a non-empty
  description and invoice-level ones do not. Those two things plus lines with
  no price are now the *only* reasons category spend can fail to reconcile with
  `Σ invoices.total_amount`; `tests/category-attribution.test.ts` asserts the
  reconciliation and pins the nameless-line case.
- The budgets page also gained `deleted_at IS NULL` and the non-empty
  description filter, which it was missing while every other surface had them —
  a soft-deleted invoice used to count against a budget.
- **The catalogue has to be categorised for any of this to pay off.** Run
  `pnpm db:category-report` first (queries A/B/C from the design note): B ≈ 0
  with a high C confirms the products still only echo their suppliers. Then
  `pnpm db:backfill-product-categories` queues the job per product
  (`--include-other` also resets products stamped `'Other'` by the old
  inheritance). The work happens in the worker process and costs LLM quota,
  one call per product, once.
- Products are unique per `(restaurant_id, name_key)` and shared across
  suppliers, so categorising the catalogue fixes generalists by rebound: once
  "Tomate pera" is produce, it is produce whoever delivers it.
- Orphan lines are now visible and repairable — the invoice page counts lines
  with no `product_id` and offers a re-link action over the existing
  `linkProductsToInvoice` engine — and the supplier list's
  "uncategorised products" filter finally sees them (it used an inner join on
  `product_id`, so a line with no product was invisible to it).
- Not handled: nothing re-categorises a product whose category is already set
  but wrong, and nothing re-runs the job when a product is renamed. The product
  page is the manual escape hatch.

## Related

- [ADR-012](./ADR-012-materialised-view-rollups.md) — the views this redefines one of
- [ADR-010](../insights/ADR-010-alerts-computed-on-save.md) — where `runBudgetCheck` runs
- [ADR-003](../data/ADR-003-committed-migrations-are-canonical.md) — why migration 0044 is hand-written and committed
- [ADR-007](../extraction/ADR-007-llm-provider-seam.md) — the seam the categorisation job calls through
