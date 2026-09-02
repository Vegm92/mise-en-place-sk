# ADR-037 — Categories Are a Per-Restaurant Table, Seeded From the Global Default List

**Status:** Active
**Feature:** Analytics
**Date:** 2026-09-02
**Issue:** [#881](https://github.com/Vegm92/mise-en-place-sk/issues/881)

## Context

`VALID_CATEGORIES` in `src/lib/constants.ts` is one fixed, hardcoded taxonomy —
16 Spanish food-and-drink labels plus `'Other'` — shared by every restaurant on
the platform. It is enforced everywhere a category is written
(`resolveCategory`, `isValidCategory`) and read (budgets, the spend analytics
views, the extraction guide, colours, i18n labels): a guard test
(`tests/category-taxonomy.test.ts`) pins the list itself and its colour/label
coverage.

That taxonomy fits a restaurant kitchen. It does not fit every business on the
platform — a bar with no kitchen, a caterer whose spend is mostly logistics and
rentals, anyone whose real cost centres are "Marketing" or "Software" — and
nothing short of a code change (editing the shared array, which every tenant
sees at once) lets a restaurant add a category of its own. Issue #881 asks for
categories to be a choice each restaurant makes, not a fixed schema, while
suppliers keep mapping to exactly one category and the AI keeps suggesting
against it.

This is Part 1 of 3: the data model and the server module only. Rewiring the
sixteen existing consumers of `VALID_CATEGORIES`/`resolveCategory` to read a
restaurant's own set (part 2) and a settings screen to manage it (part 3) are
separate, follow-up PRs — this PR ships nothing user-visible.

Alternatives considered:

- **A JSON/array column on `restaurants`.** No FK from `suppliers.category` /
  `products.category` / `category_budgets.category` to validate against, no
  natural place to hang `sortOrder`/`hidden`/`isDefault`, and every read needs
  its own JSON parse instead of a plain indexed table scan. Rejected — a real
  table is the same shape every other per-tenant catalogue in this schema
  already uses (`products`, `recipes`).
- **Delete rows to remove a default category.** Breaks history: existing
  `suppliers.category` / `products.category` / `category_budgets.category`
  rows keep the old string, and a deleted category can no longer resolve to
  anything, silently dropping a restaurant's past spend out of its own
  breakdown. Rejected in favour of a `hidden` flag — a restaurant "removes" a
  category by hiding it, past data keeps its label, and `resolveCategoryFor`
  treats a hidden category exactly like one that never matched.
- **Let a restaurant rename or hide `'Other'`.** `'Other'` is the fallback
  every code path degrades into when nothing else matches (`resolveCategory`,
  and now `resolveCategoryFor`); a restaurant able to rename or hide it could
  make the fallback itself unresolvable. It stays a fixed sentinel in
  `constants.ts`, never a row in `categories`.
- **Feed the per-restaurant set into the extraction prompt.** Considered and
  rejected for this cut — see Decision below.

## Decision

**New table `categories`** (`src/lib/server/schema.ts`, migration
`drizzle/0065_*.sql`): `id`, `restaurantId` (FK → `restaurants.id` cascade),
`name`, `nameKey` (the `categoryKey(name)` form — case/accent-insensitive,
unique per restaurant), `slug` (`categorySlug(name)`), `sortOrder`, `hidden`,
`isDefault` (true for rows seeded from `VALID_CATEGORIES`), `createdAt`.
Unique on `(restaurantId, nameKey)`; indexed on `(restaurantId, hidden)`.
Registered in `tenant-data-map.ts` (cascade deletion, no export key — same
treatment as `products`, another per-tenant catalogue that account export
does not surface directly).

**`VALID_CATEGORIES` stays exactly as it is** and becomes the DEFAULT SEED:
`seedDefaultCategories(rid)` (`src/lib/server/categories.ts`) inserts one row
per entry except `UNCATEGORIZED_CATEGORY`, `isDefault: true`, ordered by the
array's own position, `ON CONFLICT (restaurantId, nameKey) DO NOTHING` — safe
to call more than once. It runs inside the same transaction as every
restaurant-creation call site (`onboarding/+page.server.ts`,
`settings/+page.server.ts`'s `addLocation`, `auth-seed.ts`), and the migration
appends a one-off backfill `INSERT … SELECT … CROSS JOIN` for every restaurant
that already existed, with the same literal list and `ON CONFLICT DO NOTHING`
guard, so both paths are idempotent and converge on the same rows.

**The module (`src/lib/server/categories.ts`)** is tenant-scoped throughout
(`forTenant(rid).scope(...)`, never a bare `eq`): `listCategories` (ordered by
`sortOrder`, then `name`; hidden excluded unless asked for), `createCategory`
(trims, ≤ 60 chars, rejects the `'Other'` key or an existing key with a typed
`{ ok: false, reason: 'duplicate' | 'invalid' | 'reserved' }` result rather
than throwing), `renameCategory`, `setCategoryHidden`, and
`resolveCategoryFor(rid, proposed, confidence)`.

`resolveCategoryFor` is the per-restaurant successor to `resolveCategory`: it
matches `proposed` against the restaurant's own **visible** categories by
`categoryKey` first (a custom category matches by name, same as a default
one), and only when that misses — including when the only match is
hidden — falls back to the global `resolveCategory(...)`. If that fallback's
canonical name is not itself in the restaurant's visible set (hidden, or a
default category this restaurant never had), it degrades to
`UNCATEGORIZED_CATEGORY` rather than resurrecting a category the restaurant
turned off. It always returns a string that is either one of the restaurant's
visible category names or the sentinel — never null, never an invented
string. Part 2 wires this in as the single door into
`suppliers.category`/`products.category`, replacing `resolveCategory` at
those call sites; `resolveCategory` itself is untouched and keeps validating
against the fixed list for callers that have not been migrated yet.

`renameCategory` runs in one transaction: because `suppliers.category`,
`products.category` and `category_budgets.category` store the category as a
plain string, not a foreign key, a rename updates every row of that tenant
carrying the old name to the new one in the same transaction as the
`categories` row itself — otherwise a rename would silently orphan every
supplier/product/budget already tagged with the old name.

**The extraction prompt keeps the global default category guide.**
`category-guide.ts`, `extract.ts` and `products.ts` are untouched by this PR.
`EXTRACTION_PROMPT_VERSION` (ADR-034) stays a single global version rather
than forking per restaurant's category set — forking it would mean every
restaurant's custom taxonomy edit changes what the model is asked for, so the
prompt-versioned corpus ADR-034 built (one comparable version, evaluated
against a durable corpus) would fragment into one version per tenant, and the
extraction prompt would need every restaurant's live category list injected
into every extraction call regardless of whether that restaurant has custom
categories at all. Gemini keeps proposing from the fixed default list;
`resolveCategoryFor` is what turns that proposal into one of the restaurant's
*current* categories after extraction (part 2). **Consequence: a restaurant's
custom category is never AI-suggested in this cut** — a line that should be
"Marketing" still comes back proposing a default category or `'Other'`, and
the user picks "Marketing" by hand in review. Teaching the model about a
restaurant's own categories is future work, not attempted here.

## Consequences

- Nothing user-visible changes in this PR: `VALID_CATEGORIES` and
  `resolveCategory` are unchanged, no route or component reads the new table,
  and every existing consumer keeps working exactly as before.
- A restaurant now *can* have a category the fixed list never had — the table
  exists, is seeded, and supports create/rename/hide/list — but nothing in the
  product reaches it yet: part 2 rewires the sixteen consumers of
  `VALID_CATEGORIES` to read a restaurant's own set, and part 3 ships the
  settings screen. Until both land, `seedDefaultCategories` runs on every new
  restaurant for no visible benefit — inert, cheap insurance for parts 2/3
  rather than a completed feature.
- `suppliers.category` / `products.category` / `category_budgets.category`
  remain plain `text` columns, not foreign keys to `categories.id` — the same
  string-not-FK shape they had before this PR, now shared with the new table
  via `nameKey`/`name` matching rather than a real reference. A rename
  propagates by string match inside one transaction; nothing stops a stray
  row from acquiring a category name outside the table by a path this PR does
  not cover (direct SQL, a future consumer that does not go through
  `resolveCategoryFor`/`renameCategory`).
- A restaurant's custom categories are invisible to the AI (see Decision
  above) until a later change teaches the prompt about them — accepted
  scope for this issue's first cut, per the issue's own acceptance criteria
  ("the AI still suggests against the restaurant's set" is part of the whole
  issue, not this PR).
- `tests/category-taxonomy.test.ts` now documents the DEFAULT taxonomy
  specifically (the seed list, its colours, its i18n labels) rather than "the"
  taxonomy; DB-backed coverage of the per-restaurant table itself lives in
  `tests/supplier-category.test.ts`.

**Part 2 (this cut, issue #881).** Every consumer `git grep
VALID_CATEGORIES|resolveCategory|isValidCategory -- src` found is rewired
onto a restaurant's own `categories` rows: `invoice-save.ts`, `products.ts`'s
categorize job and `supplier.ts` write through `resolveCategoryFor`;
`alerts.ts`'s category-suggestion effect, the supplier-category API route,
and every list/dropdown/filter (suppliers, products, budgets, the inventory
xlsx export's sheet order, `supplier-list.ts`) read `listCategories(rid)` via
two new small helpers in `categories.ts` — `visibleCategoryNames(rid)` (a
`Set` of the restaurant's own non-hidden names, for checks that must exclude
`'Other'`) and `selectableCategoryNames(rid)` (that list plus `'Other'`
appended, for anything a dropdown offers or a form action validates against).
`VALID_CATEGORIES` remains referenced only in `constants.ts` itself,
`categories.ts` (the seed), `category-guide.ts`/`extract.ts` (the extraction
prompt, unchanged per the Decision above), `onboarding/+page.svelte` and
`+page.server.ts` (no restaurant — hence no `categories` rows — exists yet at
that point), `colors.ts` (`CATEGORY_COLORS`, the fixed default→token map a
custom category's colour falls back from) and `inventory-template.ts`'s
default `categoryOrder` parameter (the shape the pure, DB-free unit tests
exercise; the real route passes the restaurant's own order). `colors.ts` now
gives a category with no `--mep-cat-*` token a deterministic `--mep-series-*`
colour instead (a hash of `categorySlug(category)`), so two custom categories
usually render differently and the same custom name always renders the same
colour. `resolveCategory` itself is untouched, and `tests/helpers/test-db.ts`'s
`createTestRestaurant` now seeds the default categories in the same call —
mirroring every production restaurant-creation path — so the existing
DB-backed suite continues to exercise real restaurants rather than ones with
an empty category set.

## Related

- [ADR-027](./ADR-027-spend-category-comes-from-the-line.md) — `resolveCategory`'s existing contract (product/supplier categorisation) that `resolveCategoryFor` extends per restaurant, and `MIN_CATEGORY_CONFIDENCE`'s origin
- [ADR-034](../extraction/ADR-034-extraction-corpus-is-durable-and-prompt-versioned.md) — why `EXTRACTION_PROMPT_VERSION` is one global, comparable version, and why this PR does not fork it per restaurant
- [ADR-003](../data/ADR-003-committed-migrations-are-canonical.md) — why the backfill is hand-appended to the committed migration rather than a separate script
