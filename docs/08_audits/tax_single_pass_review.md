---
tags: [mep, audit, pr-review, performance, tax-calculation, optimization, single-pass]
related: Commit 4e540ec
---

# Post-Merge Review Report: Commit 4e540ec (Single-Pass Allocation-Free Taxable Base & Tax Band Calculations)

**Reviewed Commit:** `4e540ece933a04a1bafe75876d5882db7a532ec5`
**Branch:** `origin/bolt/taxable-base-single-pass-15358532074251211384`
**Reviewer:** Master Closed PR Reviewer
**Audit Date:** 2026-09-30

---

## 01. Executive Summary

Commit `4e540ec` optimizes tax calculation utilities in `src/lib/tax.ts` (`taxableBaseCents` and `bandsFromLines`).

Prior to this optimization, tax calculation functions executed frequently during invoice line parsing, total reconciliation, and report generation, incurring significant memory allocation overhead and CPU time:
1. **`taxableBaseCents` Allocations:** Constructed a `new Map<string, number>()` on every call, populated values via string key lookups (`'rec'` vs `'iva'`), instantiated map iterator objects (`perType.values()`), and spread iterator results into `Math.max(0, ...)`.
2. **`bandsFromLines` Tuple Allocations:** Executed `[...perRate.entries()]`, creating entry tuple arrays (`[rate, baseCents]`) for every distinct tax rate and sorting array tuples before mapping over them.

Commit `4e540ec` resolved these performance bottlenecks by:
- Replacing `Map` allocations in `taxableBaseCents` with primitive accumulators (`ivaCents`, `recCents`) in a single indexed `for` loop, resolving the maximum taxable base via direct numeric comparison.
- Refactoring `bandsFromLines` to retrieve unique rate keys directly via `Array.from(perRate.keys()).sort((a, b) => b - a)`, pre-allocating the output array `res`, and mapping items directly without allocating entry tuples.

Vitest performance benchmarking over 1,000,000 iterations of `taxableBaseCents` and 100,000 iterations of `bandsFromLines` demonstrated:
- **`taxableBaseCents`:** Execution time reduced from **68.2 ms** to **7.8 ms** (**8.7x speedup** / **88.5% reduction in CPU time**).
- **`bandsFromLines`:** Execution time reduced from **122.5 ms** to **82.3 ms** (**1.5x speedup** / **32.8% reduction in CPU time**).
- **Garbage Collection:** Intermediate `Map`, iterator, and entry tuple allocations were completely eliminated in `taxableBaseCents`.

---

## 02. Technical Analysis of Code Changes

### 1. Tax Calculation Engine (`src/lib/tax.ts`)

#### `taxableBaseCents` Refactoring
```typescript
export function taxableBaseCents(bands: TaxBand[]): number {
	let ivaCents = 0;
	let recCents = 0;
	for (let i = 0; i < bands.length; i++) {
		const band = bands[i]!;
		const cents = toCents(band.base) ?? 0;
		if (band.type === 'rec') recCents += cents;
		else ivaCents += cents;
	}
	const maxCents = ivaCents > recCents ? ivaCents : recCents;
	return maxCents > 0 ? maxCents : 0;
}
```

#### `bandsFromLines` Refactoring
```typescript
export function bandsFromLines(lines: TaxedLine[], type?: TaxType): TaxBand[] {
	const perRate = new Map<number, number>();
	for (let i = 0; i < lines.length; i++) {
		const line = lines[i]!;
		const rate = percentToFraction(line.rate);
		if (rate === null) continue;
		perRate.set(rate, (perRate.get(rate) ?? 0) + (toCents(line.totalPrice) ?? 0));
	}
	const rates = Array.from(perRate.keys()).sort((a, b) => b - a);
	const res: TaxBand[] = new Array(rates.length);
	for (let i = 0; i < rates.length; i++) {
		const rate = rates[i]!;
		const baseCents = perRate.get(rate)!;
		const band: TaxBand = {
			rate,
			base: baseCents / 100,
			tax_amount: Math.round(baseCents * rate) / 100,
		};
		if (type) band.type = type;
		res[i] = band;
	}
	return res;
}
```

### 2. Performance & Allocation Comparison

| Metric / Function | Before Commit `4e540ec` | After Commit `4e540ec` | Impact / Speedup |
|---|---|---|---|
| **`taxableBaseCents` Data Structure** | `new Map<string, number>()` per call | Primitive accumulators (`ivaCents`, `recCents`) | 0 heap object allocations |
| **`taxableBaseCents` Iteration** | `for...of` & `Math.max(0, ...perType.values())` | Single indexed `for` loop + ternary `ivaCents > recCents` | **8.7x speedup** (68.2ms → 7.8ms) |
| **`bandsFromLines` Mapping** | `[...perRate.entries()].sort().map(...)` | `Array.from(keys()).sort()` + pre-allocated `new Array(len)` | **1.5x speedup** (122.5ms → 82.3ms) |

---

## 03. Correctness, Safety & Data Integrity Assessment

| Aspect | Evaluation | Findings & Verification |
|---|---|---|
| **Numeric Honesty & Cent Conversion** | **Pass** | All monetary bases and amounts remain processed via integer cent representations using `toCents()`. Floating-point rounding drift is prevented. |
| **Empty / Non-Positive Tax Bases** | **Pass** | `maxCents > 0 ? maxCents : 0` guarantees negative or empty tax band totals default safely to `0`. |
| **Code Comment Invariants** | **Pass** | Verified against `pnpm lint:no-comments`. Zero inline comments were introduced inside `src/`. |

---

## 04. Test Coverage & Quality Verification

- **Unit Test Coverage (`tests/tax-bands.test.ts`):**
  - All test suites in `tests/tax-bands.test.ts` pass cleanly.
  - Tests verify multi-rate IVA and REC calculations, empty input handling, fractional tax rate conversions, line item aggregation, and total mismatch detection.
- **Performance Documentation (`.jules/bolt/2026-09-30-tax-single-pass-taxable-base.md`):**
  - Performance bottleneck, optimization strategy, and benchmark metrics documented in compliance with repository standards.

---

## 05. Actionable Backlog Items for Future Sessions

1. **Task 1: Tax Rate Fraction Cache Bounding Analysis**
   - **Context:** In `src/lib/tax.ts`, `percentToFraction` and `fractionToPercent` utilize LRU-style cache maps (`percentToFractionCache`, `fractionToPercentCache`) bounded by `MAX_CACHE_SIZE = 2000`.
   - **Action:** Monitor cache hit/miss metrics during large bulk invoice parsing batches to confirm whether cache size limits prevent key eviction churn under high concurrency.

2. **Task 2: Audit Line Totals Iteration in `detectTotalMismatch`**
   - **Context:** `detectTotalMismatch` iterates over `lineTotals: Iterable<MoneyInput>` using `sumCents(lineTotals)`.
   - **Action:** Ensure callers passing array arguments to `detectTotalMismatch` do not create unnecessary intermediate array copies before reconciliation checks.
