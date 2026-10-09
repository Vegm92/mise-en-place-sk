# GitHub Issue: Post-PR #1207 & #1206 Master PR Review & Operational Hardening Report

## Overview & Scope
This report serves as the master post-PR review for **PR #1207** / **Commit `72c7f75`** (`⚡ Bolt: optimize date row detection in document structure classification`) and **PR #1206** / **Commit `6301e9f`** (`test: dynamically discover export routes in rate limit test`).

The purpose of PR #1207 was to eliminate global `.match()` array allocations and unnecessary full-text scanning when checking for date row threshold conditions in `src/lib/server/document-structure.ts`.

The purpose of PR #1206 was to replace a static array of export routes in `tests/rate-limit-scope-enforcement.test.ts` with dynamic route discovery (`discoverExportRoutes()`), ensuring all current and future export handlers automatically enforce `rateLimitScoped()` and distinct bucket names.

This issue report documents technical findings, acceptance criteria, and actionable tasks for the next engineering session.

---

## Technical Analysis of PR #1207 & PR #1206 Changes

### 1. Document Structure Optimization (`src/lib/server/document-structure.ts`)
- **Early-Exit Execution:** Replaced `(text.match(DATE_ROW_RE)?.length ?? 0) >= MIN_COVER_ROWS` with `hasMinDateRows(text, MIN_COVER_ROWS)`.
- **Zero-Allocation Matching:** Uses stateful `re.exec(text)` loop that terminates immediately upon reaching 3 matches.
- **Benchmark Performance:** Reduced page evaluation latency from 3,122 ms to 42.5 ms (~73.4x faster) across 100k page text evaluations.

### 2. Dynamic Export Route Discovery (`tests/rate-limit-scope-enforcement.test.ts`)
- **Automated Route Scanning:** Implemented `discoverExportRoutes()` to recursively inspect `src/routes/` for server endpoints (`+server.ts`).
- **Content & Path Heuristics:** Matches `/csv`, `/export`, `inventory-template` routes as well as handlers utilizing `ExcelJS`, `toCsv`, or spreadsheet MIME types.
- **Rate Limit Bucket Safeguard:** Asserts that every discovered export handler uses `rateLimitScoped()` with unique bucket names.

---

## Goals & Acceptance Criteria for Next Session

### Goal
Perform micro-optimization in `hasMinDateRows` by sharing a module-scoped RegExp instance with `re.lastIndex = 0` or fast short-circuit check, and expand unit test coverage for document structure date row boundaries.

### Acceptance Criteria
- [ ] **Module-Scoped RegExp Instance Reuse in `hasMinDateRows`:**
  - Update `hasMinDateRows` in `src/lib/server/document-structure.ts` to reuse a module-scoped RegExp instance (`DATE_ROW_RE`) with `DATE_ROW_RE.lastIndex = 0` prior to execution, avoiding per-function-call regex object compilation.
- [ ] **Fast Non-Digit Short-Circuit Guard:**
  - Add early return in `hasMinDateRows` when text length is below minimum possible cover page date threshold (e.g., `text.length < 10`) or lacks digits, skipping regex execution entirely.
- [ ] **Expanded Unit Test Coverage for Date Row Boundaries:**
  - Add explicit unit tests in `tests/pdf-text-layer.test.ts` or a new test file testing `hasMinDateRows` and `pageSignalsFromText` cover page detection across 0, 1, 2, 3+ date rows, malformed date formats, and edge cases.
- [ ] **Codebase Invariants & Verification Suite:**
  - Verify `pnpm check`, `pnpm lint:no-comments`, `pnpm lint:tenant-scope`, and `pnpm test` pass with 100% success rate.

---

## Plan of Work for Next Engineering Session

1. **Optimize `hasMinDateRows` Implementation**
   - Refactor `hasMinDateRows` in `src/lib/server/document-structure.ts` to reuse module-scoped regex `DATE_ROW_RE` with `DATE_ROW_RE.lastIndex = 0`.
   - Add short-circuit check for empty/short strings (`text.length < 10`).

2. **Add Unit Tests for Date Row Matching**
   - Extend `tests/pdf-text-layer.test.ts` or add `tests/document-structure-date-rows.test.ts` asserting exact date row boundary detection.

3. **Verify Codebase Linters & Test Suite**
   - Execute `pnpm check`, `pnpm lint:no-comments`, `pnpm lint:tenant-scope`, and `pnpm test` to confirm full repository health.
