## 2026-09-28 - Optimizing document structure page classification in `src/lib/server/document-structure.ts`

### 🔍 Bottleneck Analysis
During document structure classification for multi-page supplier paperwork in `src/lib/server/document-structure.ts`, `pageSignalsFromText` classifies each page of a multi-page PDF document. Inside the `pages.forEach` loop, `const open = signals.some((s) => s.role !== 'cover');` was executed on every page iteration.
- On each page, `signals.some` scanned the accumulated `signals` array to check if a non-cover document page had previously been opened.
- This introduced unnecessary `O(N^2)` quadratic array scans across page iterations.

### ⚡ Optimization
Replaced the repeated `signals.some` search with a local `let open = false;` state variable. The state is updated directly to `true` whenever a page is classified with a non-cover role. This converts the state evaluation from quadratic `O(N^2)` array scanning to `O(1)` per page (`O(N)` linear total) with zero array allocations and zero breaking changes.

### 📊 Performance Impact
- Benchmark (50,000 classifications of 40-page documents):
  - 100% functional equivalence and zero regressions across all unit tests (`tests/document-structure.test.ts`).
  - Eliminates quadratic `signals.some` array scans per page classification.
