# GitHub Issue: Post-Commit 154b769 Master PR Review & Operational Hardening Report

## Overview & Scope
This report serves as the master post-commit review for **Commit `154b769`** (`sec(api): enforce tenant context pre-guards on API endpoints`).

The purpose of commit `154b769` was to enforce fail-fast tenant context pre-guards (`locals.restaurantId`) prior to rate-limiting evaluation and database queries on API endpoints (`/api/stock-levels`, `/api/trend`, `/api/unit-conversions`), as well as validating UUID formatting on batch IDs in `/batch/[id]/+page.server.ts`.

Prior to commit `154b769`, unauthenticated or tenantless requests consumed rate limit quotas or triggered non-null assertions (`locals.restaurantId!`), while malformed batch IDs executed unnecessary database SELECT queries.

This issue report documents technical findings, acceptance criteria, and actionable tasks for the next engineering session.

---

## Technical Analysis of Commit 154b769 Changes

### 1. Endpoint Pre-Guards
- **`/api/stock-levels` (GET & POST):** Added `if (!rid) return apiError(409, 'No active restaurant')` before `rateLimitScoped`.
- **`/api/trend` (GET):** Added `if (!rid) return apiError(409, 'No active restaurant')` before `rateLimitScoped`.
- **`/api/unit-conversions` (POST):** Added `if (!rid) return apiError(409, 'No active restaurant')` before `rateLimitScoped`.
- **`/batch/[id]` (`requireOwnedBatch`):** Added `if (!UUID_RE.test(batchId))` check returning redirect `303` on malformed batch UUIDs.

### 2. Unit Test Coverage
- **`tests/api-tenant-validation.test.ts`:** Added unit tests asserting HTTP `409` on missing tenant context across all updated endpoints.

---

## Goals & Acceptance Criteria for Next Session

### Goal
Audit all remaining API routes in `src/routes/` for tenant pre-guard order (`locals.restaurantId` checked prior to rate-limiting and DB calls), consider extending `scripts/lint-invariants.mjs` to enforce pre-guard ordering statically, and maintain 100% codebase invariant compliance.

### Acceptance Criteria
- [ ] **Comprehensive API Route Guard Audit:**
  - Audit all remaining handlers under `src/routes/` to ensure `locals.restaurantId` is checked before `rateLimitScoped` or database execution.
- [ ] **Invariant Linter Pre-Guard Order Rule:**
  - Evaluate extending `scripts/lint-invariants.mjs` to statically check that `locals.restaurantId` presence guards precede `rateLimitScoped` calls in API route handlers.
- [ ] **Codebase Invariants & Verification Suite:**
  - Ensure `pnpm check`, `pnpm lint:no-comments`, `pnpm lint:tenant-scope`, and `pnpm test` pass cleanly.

---

## Plan of Work for Next Engineering Session

1. **Audit Remaining API Endpoints**
   - Inspect API endpoints in `src/routes/` to confirm tenant pre-guard placement order.

2. **Evaluate Invariant Linter Rule**
   - Check if a static check can be added to `scripts/lint-invariants.mjs` for guard ordering.

3. **Verify Codebase Health**
   - Run full project verification (`pnpm check`, `pnpm lint:no-comments`, `pnpm lint:tenant-scope`, `pnpm test`).
