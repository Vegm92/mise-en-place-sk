## 2026-10-11 - Allocation-Free Dashboard "Turno" Worklist Construction & Risk Calculations

### 🔍 Bottleneck Analysis
In `src/lib/dashboard-turno.ts`, `buildWorklist` and `buildCategoryRisk` construct the interactive decision engine worklist and budget overrun risk breakdown displayed on the dashboard. Because these functions are called inside `$derived` Svelte signals on both mobile and desktop dashboard views, they run frequently whenever dashboard data or reactive state updates.

 profiling revealed that `buildWorklist` and `buildCategoryRisk` were performing unnecessary array allocations and functional chain transformations:
1. `buildCategoryRisk` used `Object.entries(input.budgets).filter(...).map(...).sort(...)`, creating intermediate key-value arrays and object allocations for every budget category.
2. `priceItems` executed `input.priceShocks.filter(...).map(...).sort(...).slice(...).map(...)`, allocating intermediate wrapper objects (`{ s, eur }`) and intermediate arrays.
3. `buildWorklist` allocated multiple intermediate arrays across `priceItems`, `budgetItems`, `reviewItems`, `missingItems`, and `supplierItems`, concatenated them with array spread `[...]`, cloned them again in `sortWorklist` (`[...items].sort(...)`), and finally sliced the result (`.slice(0, MAX_WORK_ITEMS)`).

### ⚡ Optimization
1. **Single-pass Object Iteration in `buildCategoryRisk`**: Iterated over `input.budgets` using `for (const category in budgets)` and pushed directly into a single `CategoryRisk[]` array before sorting in-place.
2. **Allocation-free Price Shock Filtering**: Filtered positive price shocks in a single `for` loop directly into `top`, sorted `top` in-place, and mapped at most `MAX_PRICE_ITEMS` items directly into the output array.
3. **In-place Worklist Assembly & Truncation**: Refactored sub-item creators to push directly into a single `items: WorkItem[]` array via helper functions (`pushPriceItems`, `pushBudgetItems`, etc.).
4. **In-place Sorting & Truncation**: Sorted the `items` array in-place (`sortWorklistInPlace`) and truncated excess items via `items.length = MAX_WORK_ITEMS` rather than spread cloning and `.slice()`.

### 📊 Performance Impact
Benchmarked using 10,000 iterations over realistic dashboard inputs containing 50 price shocks, 20 missing supplier items, 5 budget categories, and uncategorized items:
- **`buildWorklist` execution time**: Decreased from ~80ms to ~53ms for 10,000 ops (~34% execution time reduction).
- **Zero Regressions**: 100% test suite and type check pass across all 2,613 tests.
