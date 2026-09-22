# GitHub Issue: Post-PR #1158 Master PR Review & Operational Hardening Report

## Overview & Scope
This report serves as the master post-PR review for **PR #1158** (`Security Audit: Enforce strict positive integer validation on route parameters`).

The purpose of PR #1158 was to enforce strict positive integer validation on route parameters (`params.id`) across product and recipe route families, preventing malformed inputs (`NaN`, floats, negative numbers, SQL injection payloads) from reaching database queries and triggering unhandled Postgres integer cast exceptions (HTTP 500).

PR #1158 applied `requirePositiveIntId(params.id, label)` from `$lib/server/route-params.ts` across:
- `/products/[id]` (`saveFacts` action)
- `/recipes/[id]` (`load` and actions `updateRecipe`, `addItem`, `updateItem`, `deleteItem`, `duplicate`, `delete`)
- `/recipes/[id]/cocina` (`load`)
- `/recipes/[id]/csv` (`GET` endpoint)
- `/recipes/[id]/sheet` (`load`)

This issue report documents the technical findings, acceptance criteria, and actionable tasks for the next engineering session.

---

## Technical Analysis of PR #1158 Changes

### 1. `requirePositiveIntId` Helper (`src/lib/server/route-params.ts`)
- **Behavior:** Parses raw string ID as number and throws a clean HTTP `400 Bad Request` with message `Invalid <label> id` if `!Number.isInteger(id) || id <= 0`.
- **Impact:** Converts unexpected 500 database error responses into standard HTTP 400 client error responses before any database queries execute.

### 2. Guarded Route Endpoints
- **`/products/[id]`:** Updated `saveFacts` action to use `requirePositiveIntId`.
- **`/recipes/[id]`:** Updated `load` and all 6 form actions to use `requirePositiveIntId`. Removed redundant `if (!Number.isInteger(id))` in internal `requireRecipe()` helper.
- **`/recipes/[id]/cocina`:** Updated `load` to use `requirePositiveIntId`.
- **`/recipes/[id]/csv`:** Updated `GET` endpoint to use `requirePositiveIntId`.
- **`/recipes/[id]/sheet`:** Updated `recipeId` helper to use `requirePositiveIntId`.

---

## Goals & Acceptance Criteria for Next Session

### Goal
Expand test coverage in `tests/542-malformed-route-params.test.ts` to include all recipe routes updated in PR #1158, audit form action payload field parsing, and verify codebase invariants.

### Acceptance Criteria
- [ ] **Test Expansion in `tests/542-malformed-route-params.test.ts`:**
  - Extend `ROUTES` array in `tests/542-malformed-route-params.test.ts` to test malformed IDs (`NaN`, UUIDs, SQL payloads, zero, negative numbers) against:
    - `/recipes/[id]` `load` function
    - `/recipes/[id]` actions: `updateRecipe`, `addItem`, `updateItem`, `deleteItem`, `duplicate`, `delete`
    - `/recipes/[id]/cocina` `load` function
    - `/recipes/[id]/csv` `GET` endpoint
    - `/recipes/[id]/sheet` `load` function
    - `/products/[id]` `saveFacts` action
  - Assert that all handlers throw HTTP 400 (`Invalid recipe id` or `Invalid product id`) without contacting the database.
- [ ] **Audit Form Payload Field ID Parsing:**
  - Audit form actions accepting integer IDs in form payloads (e.g. `data.get('productId')` or `data.get('conversion_id')`) to ensure invalid strings are handled safely.
- [ ] **Codebase Invariants & Verification:**
  - Run `pnpm check`, `pnpm lint:no-comments`, and `pnpm test` to ensure 100% test pass rate and lint compliance.

---

## Plan of Work for Next Engineering Session

1. **Extend Malformed Route Parameter Tests**
   - Update `tests/542-malformed-route-params.test.ts` to include recipe route cases in `ROUTES`.

2. **Run and Verify Test Suite**
   - Execute `npx vitest run tests/542-malformed-route-params.test.ts` and ensure all tests pass.

3. **Verify Codebase Linters**
   - Run `pnpm check` and `pnpm lint:no-comments`.
