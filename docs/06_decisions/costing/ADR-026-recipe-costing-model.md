# ADR-026 — Recipe costing resolves the tenant's whole graph in TypeScript, from net quantities, against the taxable base

**Status:** Active
**Feature:** costing
**Date:** 2026-08-26
**Issue:** —

## Context

Escandallos (recipe costing sheets) are the differentiator against Haddock and
have been on the roadmap since `docs/02_product/plan_de_negocio.md:64` — "escandallos
ligados a precio real de compra". Nothing about them existed in the code. Building
them forced five decisions that are expensive to reverse once a restaurant has
typed in a hundred sheets, because each is a data migration rather than a code
change.

**Which quantity is stored.** A sheet shows Bruto / Merma / Neto, and the two
weights differ by `1/(1−merma)` — 33 % at a 25 % merma. Storing both invites
drift the moment one is edited without the other; storing gross means the
quantity that reaches the plate is derived, which is the number a cook actually
reasons about and the one a recipe is written in.

**How deep the graph is resolved.** A prep is itself a sheet, so costing a dish
means walking a graph of unknown depth that a bad edit can make cyclic. A
`WITH RECURSIVE` CTE keeps it in one query but puts the arithmetic — merma,
unit conversion, yield apportionment — in SQL, where it cannot be unit-tested
against plain object literals and cannot be reused by the browser.

**What food cost is measured against.** Spanish menus are priced with VAT
included. Dividing cost by that price yields a flatteringly low number that
plenty of operators nevertheless quote.

**How a sub-recipe reference is constrained.** App-layer scoping is the only
tenancy boundary (ADR-005), so a plain `child_recipe_id → recipes(id)` would let
a crafted form POST link another restaurant's sheet and the database would
accept it.

**How precise a quantity and a unit price have to be.** The neighbouring
`invoice_line_items.quantity` is `real`; `unit_price` is `numeric(12,2)` and goes
through `src/lib/money.ts`.

## Decision

**Net is the stored quantity.** `recipe_items.net_quantity` is the single source
of truth; gross is derived as `net / (1 − waste_pct/100)` and the line is charged
on the gross, because that is what is bought. The editor shows both columns and
both are editable — typing a gross back-computes the net client-side and submits
the net — so there is one column in the database and no pair that can
desynchronise.

**The graph is loaded whole and resolved in TypeScript.** `loadRecipeGraph(rid)`
issues exactly two tenant-scoped queries (all `recipes`, all `recipe_items`) and
`computeRecipeCosts(graph, prices, facts)` is a pure function over the result:
no DB, no `async`, testable with object literals, and importable by the browser
so the editor recomputes food cost as the user types with the same code the
server runs. A tenant holds tens to low hundreds of sheets, so loading all of
them is cheaper than a recursive CTE.

Cycles are handled twice on purpose. On read, an iterative DFS with tricolour
marking flags the offending *edge*, contributes 0 cents and warns — it never
throws and never spins, so a graph corrupted by any other path still renders a
readable sheet. On write, `wouldCycle()` BFS-walks the prospective child's
descendants and the action rejects with 422. The write guard races under
concurrent POSTs; the read guard does not. `MAX_RECIPE_DEPTH = 8` is the second
belt.

**Food cost and margin are measured against the taxable base.**
`selling_price` is stored with VAT, as menus are priced; `net = gross / (1 + vat)`
and `foodCostPct = costPerPortion / net × 100`. The KPI carries an `InfoTooltip`
saying so, because the number reads high to anyone used to dividing by the menu
price.

**Both recipe references are composite foreign keys** against
`(recipes.id, recipes.restaurant_id)`, backed by `uq_recipes_id_rid`. A
cross-tenant link is structurally impossible rather than merely validated.

**Quantities and unit rates are `numeric`, not `real` and not money.**
`net_quantity numeric(14,4)` because float4's ~7 significant digits drift on
0.0035 kg of saffron in a long sheet. `unit_cost numeric(12,4)` because a unit
price is a *rate*, not an amount: 0.0035 €/g is real and `toCents()` would
flatten it to zero. The engine carries rates in fixed-point ten-thousandths
(`RATE_SCALE`); every *total* stays `numeric(12,2)` and goes through
`src/lib/money.ts`. Percentages (`vat_pct`, `waste_pct`, `target_food_cost_pct`)
are stored as percentages, never fractions — `percentToFraction` in
`src/lib/tax.ts` accepts both, which is exactly why the convention has to be
pinned in one place.

## Consequences

The editor and the server cannot disagree about a number, because the pure
module is the only implementation. Cost tests need no database. A corrupt graph
degrades to a warning instead of a hung request.

What this costs:

- **The whole graph is loaded to cost one sheet.** Fine at hundreds of sheets,
  not at tens of thousands. The seam to change is `loadRecipeGraph`; nothing
  downstream assumes it came from two queries.
- **`numeric(14,4)` deviates from the neighbouring `real`.** Anyone comparing
  `recipe_items` to `invoice_line_items` will notice; the reason is above.
- **The stored net is not what a purchase invoice shows.** Reconciling a sheet
  against an albarán means comparing the *derived* gross.
- **Cross-family unit conversion returns null, deliberately.** A line in
  millilitres against a price per kilo is flagged `unit-mismatch` and falls back
  to the manual price rather than assuming 1 L = 1 kg. Nutrition does assume
  1 g/ml, stated in a footnote on the sheet, because refusing there would drop
  every oil and stock from the rollup.
- **No cost snapshotting.** A sheet printed in March re-costs at today's prices
  when reopened, and there is no record of what it cost then. This is the most
  likely "where did my numbers go?" complaint. The fix is a
  `recipe_cost_snapshots` row written on print or send; it is not built.

Held in place by: `tests/recipe-cost.test.ts` (merma both directions, the
taxable-base ratios, rate precision, sub-recipe apportionment, cycles,
nutrition coverage), `tests/recipe-graph-db.test.ts` (tenant isolation of the
graph, the composite FK rejecting a cross-tenant child, `ON DELETE RESTRICT`),
and the standing gates `db:check-sync`, `lint:tenant-scope` and
`lint:unscoped-query`.

## Related

- [ADR-005](../tenancy/ADR-005-rls-retired.md) — app-layer scoping is the only tenancy boundary, which is why the composite FKs are worth buying
- [ADR-009](../invoicing/ADR-009-unit-normalisation-and-product-identity.md) — `normalized_unit_price` per base unit is the price a product-linked line reads
- [ADR-003](../data/ADR-003-committed-migrations-are-canonical.md) — schema changes ship as committed migrations
