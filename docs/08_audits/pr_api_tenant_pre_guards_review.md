---
tags: [mep, audit, pr-review, security, tenant-context, rate-limiting, api-guards]
related: Commit 154b769
---

# Post-Merge Review Report: Commit 154b769 (Enforce Tenant Context Pre-Guards on API Endpoints)

**Reviewed Commit:** `154b7693b4641bad35ed06bd93740b478fd564ce` (`sec(api): enforce tenant context pre-guards on API endpoints`)
**Branch:** `fix/nosniff-header-export-endpoints-16965884633917303888`
**Reviewer:** Master Closed PR Reviewer
**Audit Date:** 2026-10-13

---

## 01. Executive Summary

Commit `154b769` hardens multi-tenant security and rate-limiting isolation across several SvelteKit API handlers (`/api/stock-levels`, `/api/trend`, `/api/unit-conversions`) and page server helpers (`requireOwnedBatch` in `/batch/[id]/+page.server.ts`).

Prior to commit `154b769`, multiple endpoints evaluated user or tenant rate limits prior to checking if an active tenant context (`locals.restaurantId`) existed, or used non-null assertions (`locals.restaurantId!`). Requests from authenticated users missing an active tenant context (`locals.restaurantId === null`) resulted in rate limit bucket consumption or potential runtime non-null assertion crashes before being validated. Additionally, `/batch/[id]/+page.server.ts` queried database items via `getBatchItems(batchId)` without validating whether `batchId` was a valid UUID.

Commit `154b769` introduced fail-fast tenant pre-guards returning HTTP `409 Conflict` (`apiError(409, 'No active restaurant')`) before rate limit checks or database execution across `/api/stock-levels` (GET & POST), `/api/trend` (GET), and `/api/unit-conversions` (POST). Furthermore, it added `UUID_RE.test(batchId)` validation in `requireOwnedBatch` before performing database SELECT queries.

This report provides a master architectural review of commit `154b769`, evaluating implementation correctness, tenant isolation security posture, test coverage, and actionable backlog items for future engineering sessions.

---

## 02. Technical Analysis of Code Changes

### 1. Stock Levels API Endpoint (`src/routes/(app)/api/stock-levels/+server.ts`)
- **Pre-Guard Addition:** Inserts explicit tenant validation before rate limit evaluation:
  ```typescript
  const rid = locals.restaurantId;
  if (!rid) return apiError(409, 'No active restaurant');
  ```
- Applies to both `GET` and `POST` request handlers.
- Eliminates non-null assertion `locals.restaurantId!`.

### 2. Trend API Endpoint (`src/routes/(app)/api/trend/+server.ts`)
- **Pre-Guard Addition:** Inserts explicit tenant validation before rate limit evaluation in `GET` handler:
  ```typescript
  const rid = locals.restaurantId;
  if (!rid) return apiError(409, 'No active restaurant');
  ```
- Prevents tenantless users from invoking `rateLimitScoped({ scope: 'user', name: 'trend' })`.

### 3. Unit Conversions API Endpoint (`src/routes/(app)/api/unit-conversions/+server.ts`)
- **Pre-Guard Addition:** Moves tenant check ahead of `rateLimitScoped({ scope: 'tenant', name: 'unit-conversions' })` in `POST` handler:
  ```typescript
  const rid = locals.restaurantId;
  if (!rid) return apiError(409, 'No active restaurant');
  ```
- Ensures tenant-scoped rate limiting receives a guaranteed non-null `restaurantId`.

### 4. Batch Page Server Helper (`src/routes/(app)/batch/[id]/+page.server.ts`)
- **UUID Validation Guard:** Imports `UUID_RE` from `$lib/server/batch` and validates `batchId` in `requireOwnedBatch`:
  ```typescript
  if (!UUID_RE.test(batchId)) {
      redirect(303, '/?error=upload.err.sessionNotFound');
  }
  ```
- Prevents malformed or non-UUID route parameters from executing `getBatchItems(batchId)` database SELECT queries.

### 5. Automated Unit Tests (`tests/api-tenant-validation.test.ts` & `tests/tenant-isolation-routes.test.ts`)
- **Dedicated Test File (`tests/api-tenant-validation.test.ts`):** Verifies that `/api/unit-conversions` (POST), `/api/stock-levels` (GET & POST), and `/api/trend` (GET) return HTTP `409` with JSON error `'No active restaurant'` when `locals.restaurantId` is null.
- **Mock Parity (`tests/tenant-isolation-routes.test.ts`):** Added `UUID_RE` regex mock to `$lib/server/batch`.

---

## 03. Risk Assessment & Architectural Impact

| Aspect | Before Commit `154b769` | After Commit `154b769` | Security & Performance Impact |
|---|---|---|---|
| **Rate Limit Execution Order** | Evaluated before tenant presence check | Evaluated AFTER `if (!rid)` check | Prevents rate limit quota degradation for tenantless users |
| **Tenant Context Safety** | Used non-null assertion `locals.restaurantId!` | Explicit fail-fast `apiError(409, 'No active restaurant')` | Eliminates runtime exceptions on missing tenant context |
| **Batch UUID Validation** | Executed DB query `getBatchItems(batchId)` directly | Rejects non-UUID strings via `UUID_RE.test(batchId)` | Eliminates database load from malformed batch URLs |

---

## 04. Test Coverage & Quality Verification

- **New Suite (`tests/api-tenant-validation.test.ts`):** 4 unit tests covering missing `restaurantId` across stock-levels, trend, and unit-conversions endpoints.
- **Codebase Invariants:**
  - `pnpm lint:no-comments` strictly maintained (0 inline comments added in `src/`).
  - `pnpm lint:tenant-scope` passes cleanly.
  - `pnpm check` succeeds with 0 type errors.

---

## 05. Actionable Backlog Items for Future Sessions

1. **Task 1: Comprehensive Pre-Guard Audit Across Remaining API Endpoints**
   - **Context:** Other API endpoints under `src/routes/(app)/api/` and `src/routes/api/` should be audited to ensure tenant context validation always precedes rate limiting and database calls.
   - **Action:** Audit endpoints such as `/api/user/export` and `/api/chat` to verify guard placement order.

2. **Task 2: Invariant Linter Extension for Guard Placement Order**
   - **Context:** Currently `pnpm lint:tenant-scope` checks for tenant isolation, but does not enforce that `locals.restaurantId` check precedes `rateLimitScoped`.
   - **Action:** Consider adding a static analysis check in `scripts/lint-invariants.mjs` verifying that `locals.restaurantId` presence is asserted before `rateLimitScoped` calls in API route handlers.
