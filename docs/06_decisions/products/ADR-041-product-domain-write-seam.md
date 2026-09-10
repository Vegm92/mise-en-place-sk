# ADR-041 — Product Domain Owns `products`/`product_aliases`; Cross-Domain Writes Go Through `products.ts`

**Status:** Active
**Feature:** Products
**Date:** 2026-09-11
**Issue:** [#1046](https://github.com/Vegm92/mise-en-place-sk/issues/1046)

## Context

`categories.renameCategory` renames a category and must propagate the new
name onto every row that carries it: `suppliers`, `category_budgets`, and
`products`. Before this change it did so by reaching into the `products`
table directly (`tx.update(products).set({ category })`), inside the same
transaction as the category rename. That is a category-domain module writing
another domain's column with no seam a reviewer or a future caller can find
by name — the exact pattern issue #1040/#1046 is closing off, mirroring what
[ADR-008](../invoicing/ADR-008-single-invoice-write-path.md) already did for
invoices.

## Decision

**Product domain owns:** `products`, `product_aliases`. (`unit_conversions`,
`supplier_metrics` are product-adjacent but out of scope for this pass.)

**Permitted cross-domain write:** renaming the category stamped on a
tenant's products is exposed as `renameProductsCategory(rid, oldCategory,
newCategory, exec)` in `src/lib/server/products.ts`. It is tenant-scoped via
`forTenant(rid).scope(...)`, exactly like every other product-table mutation.

`categories.renameCategory` now calls this instead of updating `products`
directly. `suppliers` and `category_budgets` are not touched by this ADR —
those tables are owned by the supplier and category-budget areas
respectively, both out of scope for #1046.

## Consequences

- A second caller that needs to rename a product's category (a future bulk
  reclassification tool, say) has one function to call instead of one more
  place reaching into `products` directly.
- Tenant-scope behavior is unchanged: `tests/supplier-category.test.ts`
  ("renames a category and propagates to suppliers/products/category_budgets
  rows of that tenant only") still exercises the full rename end to end and
  passes unmodified. `tests/product-categorizer.test.ts` adds a seam-level
  test asserting `renameProductsCategory` alone is tenant-scoped.
- No generic repository layer was introduced — this is one named function
  for one named cross-domain write, not a facade over all product writes.

## Related

- [ADR-008](../invoicing/ADR-008-single-invoice-write-path.md) — the same pattern applied to invoices
- [ADR-042](../billing/ADR-042-billing-domain-write-seam.md) — the same pattern applied to billing/entitlements
