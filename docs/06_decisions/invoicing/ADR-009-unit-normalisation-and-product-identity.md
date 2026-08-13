# ADR-009 — Product Identity Is Resolved in Three Escalating Tiers

**Status:** Active
**Feature:** Invoicing
**Date:** 2026-08-09

## Context

Every analytics feature in the app depends on one question: *is this line item
the same product as that line item?* Price evolution, price-shock alerts, stock
forecasting, and spend-by-ingredient are all meaningless if `MERL. CONG. S/H
3KG` and `Merluza congelada sin hueso` are two different products.

Spanish supplier invoices make this genuinely hard:

- **Descriptions are compressed.** Trade abbreviations (`TERN`, `CONG`, `S/H`),
  supplier SKU prefixes (`REF. 4471`, `COD-88213`), and inconsistent casing and
  accents.
- **Units are not units.** A line reads `2 caja` at `€18.40`. Two boxes of what?
  Comparing `€18.40/caja` across suppliers whose boxes hold different amounts
  produces confident nonsense.
- **The same product changes description between invoices** from the same
  supplier, let alone across suppliers.

A pure string match under-matches badly. A pure LLM match is slow, costs a token
call per line, and is non-deterministic on the hot path.

## Decision

### Two independent normalisations, applied to every line

**Unit canonicalisation** (`normalize.ts`) maps ~45 unit synonym groups to a
canonical token — `kgs`/`kilo`/`kilogramo`/`kgm` → `kg`, and the UN/ECE codes
that appear in e-invoices (`C62`, `H87`, `KGM`, `LTR`) alongside the Spanish
words. Anything not in the table returns `null`, which means *unknown*, not
*wrong*.

**Pack parsing** (`parsePack`) reads the pack geometry out of free text with
three ordered patterns:

1. `MULTIPACK` — `6x1L`, `12 × 500 g` → 6 units of 1 L
2. `SINGLE` — a bare `3kg`, `750ml`
3. `COUNT` — `caja de 12`, `pack 24` → 12 units of 1 `ud`

The result converts to a base quantity in `kg`, `L`, or `ud`, which yields
`normalizedUnitPrice = unitPrice / baseQuantity` — **the comparable number**. A
€18.40 box of 6×1L becomes €3.07/L, which can be compared with any other supplier
of that ingredient. Every line stores both its raw price and this normalised one.

`docena` is in the size table at factor 12, so a dozen is 12 `ud` rather than one
opaque unit.

### Product identity: exact → fuzzy → LLM, escalating only when needed

`resolveOne` tries three tiers, and stops at the first that answers:

| Tier | Mechanism | Cost | Result status |
|---|---|---|---|
| 1. **Alias** | `product_aliases` lookup on `normalizeProductKey(description)` | One indexed read | `exact` |
| 2. **Fuzzy** | `pg_trgm` similarity against `products.name_key`, over the raw key **and** an abbreviation-expanded key, above `FUZZY_THRESHOLD` | One query, in-transaction | `fuzzy` — writes an alias and raises a *suggestion* alert |
| 3. **New + async LLM** | Creates the product, enqueues `normalize-product` | Deferred, off the hot path | `created` |

The escalation is the decision. Tier 1 handles every repeat purchase — which is
almost all traffic once a restaurant has been running a few weeks — at the cost
of a single indexed lookup. Tier 3, the expensive one, runs at most once per
genuinely new description, and never inside the save transaction.

`expandAbbreviations` is what makes tier 2 work: it strips SKU prefixes
(`SKU_PREFIX`, `BARE_CODE`) and expands the trade abbreviation table before
similarity is computed, so `TERN. S/H` and `ternera sin hueso` land close enough
for trigram matching. Both the raw and expanded keys are scored and the better
one wins (`GREATEST(similarity(…), similarity(…))`), so expansion can only help.

### A fuzzy match is applied *and* surfaced

Tier 2 writes the alias immediately **and** raises a suggestion notification
naming the candidate. The alternative — hold the match until a human confirms —
would leave the invoice's analytics wrong in the meantime, which is the worse
error. Acting and telling beats waiting silently. `confirmProductAlias` /
`rejectProductAlias` / `mergeIntoProduct` let the user correct it afterwards.

### The LLM tier is a job, not a call

`processNormalizeJob` runs on the `normalize-product` pg-boss queue at
**priority −10** — behind every extraction. It asks Gemini, in Spanish, whether
the new description matches an existing product, and `parseNormalizeResponse`
validates the returned `match_id` **against the candidate id set that was sent**.
A hallucinated id is discarded rather than trusted. If `GEMINI_API_KEY` is unset,
the job returns silently: the product simply stays unmerged.

## Consequences

- **`pg_trgm` is a hard dependency.** Tier 2 is a `similarity()` call; without the
  extension, product resolution degrades to exact-alias-or-new and the catalogue
  fragments. It is created by migration and asserted in the ADR-005 replay check.
- **`mep_norm_key()` exists in SQL as well as TypeScript.** `normalizeProductKey`
  has a Postgres twin so that materialized views and the price-shock query can
  group by the same key the application computes. The two must stay in step —
  changing the TypeScript normaliser without the SQL function silently splits
  history at the boundary between them.
- **Unknown units are flagged, not guessed.** A line whose unit canonicalises to
  `null` gets `requiresUnitConversion = 1` and raises a
  `unit_conversion_needed` notification. The app says "I don't know how big a
  `garrafa` is for this supplier" rather than inventing a factor. Per-supplier
  answers live in `unit_conversions`, resolved by `loadConversionMap` with
  supplier-specific rules taking precedence over name-matched ones.
- **`normalizedUnitPrice` is null whenever pack geometry is unreadable**, and
  price comparison falls back to the raw unit price. Alerts that use it
  (see [ADR-010](../insights/ADR-010-alerts-computed-on-save.md)) must handle
  null rather than treat it as zero.
- Rounding is to 4 decimal places throughout (`Math.round(x * 10000) / 10000`)
  for converted quantities, converted prices, and normalised prices. Enough
  precision for per-gram pricing; short of float noise in stored values.
- Resolution is **per distinct description key**, not per line — `resolveLineProducts`
  de-duplicates first, so an invoice listing the same product on five lines
  resolves once.

## Related

- [ADR-008](./ADR-008-single-invoice-write-path.md) — where this runs in the save path
- [ADR-012](../analytics/ADR-012-materialised-view-rollups.md) — the views that group on `mep_norm_key`
