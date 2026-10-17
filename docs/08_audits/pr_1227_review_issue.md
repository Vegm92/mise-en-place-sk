---
tags: [mep, issue, performance, bolt, dates, memoization, cache]
related: PR #1227, Commit 363846a5 / a4e0f10a, docs/08_audits/pr_1227_tomonthkey_memoize_review.md
---

# Issue Report: Actionable Follow-up Engineering Tasks for PR #1227 (Server Dates `toMonthKey` Memoization)

**Issue Context:** Follow-up tasks derived from the Master Closed PR Review of PR #1227 (`⚡ Bolt: memoize toMonthKey in server dates` / Commit `363846a5` / `a4e0f10a`).

---

## 1. Summary & Objectives

PR #1227 successfully optimized `toMonthKey` in `src/lib/server/dates.ts` by caching month string regex and number validation results using a bounded `Map` cache (`MONTH_KEY_CACHE_MAX = 2000`). This resulted in a **4.47x performance improvement** on repeated month parsing.

To expand performance benefits and standardize bounded caching across the codebase, the following follow-up tasks should be addressed in future engineering sessions.

---

## 2. Actionable Tasks

### Task 1: Audit & Memoize Client Date Utilities (`src/lib/dates.ts`)

- **Problem:** `monthKey(date)` and date manipulation functions in `src/lib/dates.ts` are called repeatedly during grid rendering and date filtering on the client, performing repeated `ISOString` slicing and date object instantiations.
- **Scope:** `src/lib/dates.ts`.
- **Requirements:**
  1. Profile `monthKey` and `isoDateOffset` during heavy UI rendering.
  2. Implement bounded caching where benchmarks show measurable execution speedups.

---

### Task 2: Standardize Shared Bounded LRU Cache Builder Utility

- **Problem:** Multiple performance optimizations (e.g. `toMonthKey` in `src/lib/server/dates.ts`, currency formatters in `$lib/formatters`) implement custom bounded `Map` clearance logic (`if (cache.size >= MAX) cache.clear()`).
- **Scope:** `$lib/cache.ts` or `$lib/utils.ts`.
- **Requirements:**
  1. Create a lightweight `createBoundedCache<K, V>(maxSize: number)` helper.
  2. Refactor existing bounded caches across `$lib/` to use this standard utility.

---

## 3. Verification & Acceptance Criteria

1. Unit tests in `tests/invoice-dates.test.ts` pass cleanly.
2. `pnpm check` and `pnpm lint:no-comments` pass without errors.
