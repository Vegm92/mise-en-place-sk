## 2026-10-15 - Memoize `normalizeTaxId` and `isValidSpanishTaxId` in `src/lib/tax-id.ts`

### 🔍 Bottleneck Analysis
During a performance sweep of formatters and pure helpers (`src/lib/tax-id.ts`), we identified that `normalizeTaxId` executed string upper-casing, non-alphanumeric replacement (`/[^0-9A-Z]/g`), and country prefix regex testing (`/^ES[0-9A-Z]{9}$/`) on every invocation without memoization.

Furthermore, `isValidSpanishTaxId(value)` called `normalizeTaxId(value)` before querying `validTaxIdCache`. As a result, even when `isValidSpanishTaxId` was called repeatedly for identical inputs, `normalizeTaxId` executed its full string and regex pipeline every time. `validTaxIdCache` also lacked bounded capacity checks (`MAX_CACHE_ENTRIES`).

Because Spanish tax IDs (CIF, NIF, NIE, DNI) are repeatedly validated and normalized across document extraction pipelines, supplier deduplication, party resolution, and settings validation, these unmemoized calculations caused repeated string allocations and CPU overhead.

### ⚡ Optimization
Added bounded Map caches (`normalizeCache` and `validTaxIdCache`, max 2000 entries) in `src/lib/tax-id.ts`:
- `normalizeCache` memoizes `normalizeTaxId(raw)` results.
- `validTaxIdCache` memoizes `isValidSpanishTaxId(value)` results, checking cache directly on the input `value`.
- Enforced `MAX_CACHE_ENTRIES` (2000) clearing logic on both caches to prevent unbounded memory growth while preserving O(1) lookups.

### 📊 Performance Impact
- Benchmark (1,700,000 iterations across valid, invalid, formatted, and unformatted Spanish tax IDs):
  - Execution time: **988.02ms ➔ 114.75ms** (**8.61x speedup**, 88.4% CPU time reduction).
- Zero breaking changes, 100% test compatibility (`pnpm test` and `pnpm check` passed).
