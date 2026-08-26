# Feature Spec — Escandallos (recipe costing)

## Purpose

Tell a cook what a plate costs, priced from what the restaurant actually paid.
A sheet is an ordered list of ingredients with waste, a portion count and a menu
price; the app derives cost per portion, food cost %, margin and a suggested
price. Ingredients may be free text, linked to a `products` row (which prices
from the latest delivery note), or another sheet used as a prep.

## Actors

- Signed-in member (creates and edits sheets, prints, exports, emails).
- No background actor: costing is computed on read, never persisted.

## Preconditions

- None. A sheet works with nothing else in the account — free-text lines carry
  their own price, so escandallos are usable before the first invoice.
- Linking a line to a product needs a `products` row; real pricing additionally
  needs a confirmed invoice line for it.

## Inputs

- `/recipes` `create` — name + kind.
- `/recipes/[id]` — `updateRecipe`, `addItem`, `updateItem`, `deleteItem`,
  `duplicate`, `delete`.
- `/recipes/[id]/sheet` — `sendSheet` (recipient address).

## Outputs

- `recipes` and `recipe_items` rows.
- A printable A4 sheet, a CSV download, and a Resend email — all rendered from
  one `RecipeSheetDoc`.
- `product_allergens_suggested` notifications when extraction proposes allergens.

## Business rules

- **Net is stored, gross is derived** (ADR-026). `gross = net / (1 − waste/100)`
  and the line is charged on the gross. Both columns are editable in the UI;
  only the net is submitted.
- **Food cost is measured against the taxable base**: `net = gross / (1 + vat)`,
  `foodCost% = costPerPortion / net × 100`, `margin% = 100 − foodCost%`.
  `suggestedNet = costPerPortion / (target/100)`.
- **Price resolution for a product-linked line**, in order: a pinned
  `unit_cost` on the line → the most recent `invoice_line_items.normalized_unit_price`
  (converted into the line's unit, carrying the invoice date and supplier) →
  `mv_price_snapshots.latest_normalized_price` matched on `mep_norm_key` →
  `latest_price` with the raw purchase unit → `missing-price`, contributing 0.
- **Sub-recipes** cost pro rata of the child's `yield_qty`/`yield_unit`; with no
  declared yield the portion count is used and the line warns `child-no-yield`.
- **Cycles** are rejected on write (`wouldCycle`, 422) and survived on read
  (tricolour DFS marks the edge, warns, contributes 0). Depth is capped at 8.
- **Cross-family unit conversion returns null** — a line in ml against a €/kg
  price warns `unit-mismatch` and falls back to the manual price. Nutrition
  treats volume as 1 g/ml, footnoted on the sheet.
- **Allergens and nutrition** are declared on `products` and inherited by a
  linked line that declares none of its own; anything typed on the line wins.
- **Quota**: `TierConfig.maxRecipes` (3 on trial/starter, unlimited on pro and
  business) counts non-archived sheets and is enforced in `create` with a 402.
  The routes themselves are `'open'` — `ROUTE_POLICY` cannot express a count.
- **Delete** is refused with 409 while another sheet references the recipe.

## State transitions

`recipes.status`: `draft` → `active` → `archived`, set directly by the user;
archived sheets stop counting against the quota.

## Data dependencies

`recipes`, `recipe_items`, `products`, `invoice_line_items`, `invoices`,
`suppliers`, `mv_price_snapshots`, `restaurants`, `subscriptions` (quota).

## API dependencies

None — everything is page loads and form actions.

## UI dependencies

`recipes/+page.svelte` (on `ListPageTemplate`, single responsive component like
Products), `recipes/[id]/+page.svelte`, `RecipeLineRow.svelte`,
`recipes/[id]/sheet/+page.svelte`, `products/[id]/+page.svelte` (the allergen
and nutrition block), and the Planificación nav group.

## Background dependencies

None. The extraction cascade rides on the existing invoice save path.

## External dependencies

Resend, for `sendSheet` only. Without `RESEND_API_KEY` the send is a logged
no-op and the action still succeeds.

## Validation

Hand-rolled in `readItemFields`: positive quantity, waste in [0, 100),
unit from `RECIPE_UNITS`, 4-decimal unit cost, macros optional and non-negative,
allergens filtered against the frozen fourteen. Link targets are re-checked
tenant-scoped on every write; a recipe id that is not an integer is a 404.

## Error states

- `rec.err.cycle` (422) — the edge would close a loop.
- `rec.err.inUse` (409) — another sheet uses this one as a prep.
- `rec.err.quota` (402) — the plan's sheet limit is reached.
- `rec.err.duplicate` (409) — the normalized name is taken.
- `rec.sheet.emailBad` (422) / `rec.sheet.emailFailed` (502).
- Per line: `missing-price`, `unit-mismatch`, `cycle`, `missing-child`,
  `child-no-yield`, `nutrition-skipped`.

## Edge cases

- A product deleted after being linked nulls `product_id`; the line keeps its
  snapshotted name and its last manual cost, so a printed sheet never corrupts.
- A line counted in `ud` contributes no nutrition — grams are unknowable — and
  the coverage line says so instead of implying a complete total.
- A sheet whose every line lacks a price still renders, with the count surfaced
  as a KPI on the list.

## Security rules

Every read and write is `forTenant().scope()`d. Both recipe references are
composite foreign keys against `(recipes.id, recipes.restaurant_id)`, so a
crafted POST cannot link another tenant's sheet even if the app check were
missed. The email body is built server-side from the loaded document, never
from client-supplied HTML.

## Idempotency rules

None needed: sheets are user-authored, not machine-ingested, and creation is
guarded by the unique `(restaurant_id, name_key)`.

## Observability

`recipe_sheet_exported` and `recipe_sheet_emailed` in `/admin/events`.

## Acceptance criteria

- 800 g net of an ingredient at 15 % waste and 12,00 €/kg costs 11,29 €.
- A prep yielding 2 kg for 10,00 € contributes exactly 1,00 € at 200 g.
- A menu price of 18,50 € at 10 % VAT shows 16,82 € ex-VAT, and food cost is
  measured against that.
- Adding a dish inside its own prep is rejected; hand-inserting the cycle by SQL
  still renders the sheet.
- The CSV opens in Excel es-ES with correct accents, `;` columns and comma
  decimals.
- Tests: `tests/recipe-cost.test.ts`, `tests/recipe-graph-db.test.ts`,
  `tests/recipe-allergen-cascade.test.ts`.

## Known limitation

Costing is always computed at today's prices. A sheet printed in March re-costs
when reopened and there is no record of what it cost then. Fixing it means a
`recipe_cost_snapshots` row written on print or send; see ADR-026.

## Code notes

### `src/lib/recipes.ts`

Pure, browser-safe, no server imports — that is what lets the editor recompute
food cost as the user types with the same code the server runs.

**`EU_ALLERGENS` / `toAllergenList`** — the frozen fourteen; `toAllergenList`
filters unknown codes, de-duplicates and returns them in canonical order, so
neither a form POST nor the LLM can widen the set.

**`convertQty`** — three closed families (mass, volume, count). Crossing families
returns `null` on purpose; the caller warns rather than assuming a density.

**`toRate` / `fromRate` / `RATE_SCALE`** — fixed-point ten-thousandths for €/unit.
A unit price is a rate, not money: `toCents('0.0035')` is 0, `toRate('0.0035')` is 35.

**`recipeTotals`** — the ratios. VAT comes out of the stored price before food
cost and margin are taken, per ADR-026.

### `src/lib/server/recipes.ts`

**`loadRecipeGraph`** — two tenant-scoped queries, whole graph. Anything outside
the tenant is simply absent from the map and degrades to `missing-child`.

**`resolveProductPrices`** — one batched query per fallback tier. The ids expand
through `sql.join` as ordinary parameters: `= ANY(${ids})` cannot be bound by
postgres.js and throws on a JS number array.

**`computeRecipeCosts`** — pure. Memoized DFS with tricolour marking; reaching a
grey node marks that edge as a cycle rather than throwing.

**`wouldCycle`** — BFS over the prospective child's descendants, used by the
write path. Racy under concurrent POSTs, which is why the read guard exists too.

### `src/lib/server/recipes-sheet.ts`

**`buildRecipeSheet`** — the one document the printable page, the CSV and the
email all render, so the three cannot drift. Sub-recipes come back as a flat
appendix; nested tables break badly across printed pages.

### `src/routes/(app)/recipes/[id]/+page.server.ts`

**`requireRecipe`** — rejects a non-integer id as a 404 before it reaches
Postgres, where it would arrive as NaN and 500.

**`readItemFields`** — all line validation in one place, returning either the
fields or an i18n error key.

### `src/lib/components/mep/RecipeLineRow.svelte`

One `<form>` per row with the visible inputs bound by `form=`, so there is no
client-held draft to lose. Local state is seeded from props through `untrack`:
these are editable copies, not mirrors.

### `src/lib/server/products.ts`

**`applyExtractedAllergens`** — one conditional UPDATE guarded on
`allergens_source IS DISTINCT FROM 'manual'` and an empty array, so a concurrent
save cannot race past it and a human declaration is never overwritten.
