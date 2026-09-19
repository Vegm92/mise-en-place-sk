# GitHub Issue: Post-PR #1120 Master PR Review & Operational Hardening Report

## Overview & Scope
This report serves as the master post-PR review for **PR #1120** (`Batch: ten agent-ready issues (#979, #1037, #1048, #1049, #1080, #1081, #1082, #1083, #1117, #782)`).

PR #1120 delivered ten core issue resolutions across the application:
1. Refactored request policy handles (`hooks.server.ts` -> `src/lib/server/request-policy.ts`, #1048).
2. Standardized web/worker storage fingerprinting and contract enforcement (#1049).
3. Introduced Valibot runtime schema parsing (`sqlRows`) for `db.execute()` output (#1082).
4. Hardened WhatsApp webhook token validation and keyed IP hashing with HMAC-SHA256, and blocked XML DOCTYPE billion-laughs attacks (#1083).
5. Unified budget and period month keys using `currentCalendarMonth` (`APP_TIMEZONE`, #1117).
6. Resolved payment-model drift and updated dashboard review states (#782).

This issue report documents the technical findings, risk evaluations, acceptance criteria, and actionable tasks for the next engineering session.

---

## Technical Analysis of PR #1120 Changes

### 1. Per-Request Policy Layer (`src/lib/server/request-policy.ts`)
- **Finding:** The request handling pipeline was modularized into `createAppHandle()`.
- **Impact:** Request lifecycle steps (`resolveRequestId`, `applyLocale`, `resolveSession`, `enforceApiRateLimit`, `applyLocalsForUser`, `enforceAdminRedirect`, `enforceUserAccess`, `enforceAuth`, `enforceFeatureFlag`, `resolveWithContext`, `applySecurityHeaders`) now execute deterministically and can be unit-tested without DB connection side effects.

### 2. Web/Worker Configuration Contract (`src/lib/server/env.ts`)
- **Finding:** Every extraction job is stamped with `storageFingerprint` (`driver:bucket-or-path`).
- **Impact:** Worker processes refuse jobs if their local storage driver/bucket configuration differs from the web side, preventing silent S3 or local file read failures.

### 3. Database Row Validation (`src/lib/server/sql-rows.ts`)
- **Finding:** Raw SQL rows are checked with Valibot schemas (`sqlRows(rows, schema)`).
- **Impact:** Protects against field rename regressions and eliminates unsafe `as unknown as` type casting across analytics and health endpoints.

### 4. Security Hardening (#1083)
- **Finding:** XML DOCTYPE parsing was disabled for e-invoices, and IP address digests were converted to HMAC-SHA256.
- **Impact:** Mitigates XML entity expansion (billion laughs DoS) and rainbow table address recovery.

---

## Goals & Acceptance Criteria for Next Session

### Goal
Perform targeted operational follow-ups, continue ratcheting `SQL_ROW_CAST_BUDGET` across remaining raw SQL execution points, and maintain codebase documentation invariants.

### Acceptance Criteria
- [ ] **SQL Row Schema Validation Ratcheting:**
  - Audit remaining raw `db.execute()` calls in `src/lib/server/` and replace unsafe casts with `sqlRows(rows, schema)`.
  - Update `scripts/lint-invariants.mjs`'s `SQL_ROW_CAST_BUDGET` accordingly.
- [ ] **Documentation Synchronization:**
  - Verify all architectural changes in `src/lib/server/request-policy.ts` and `src/lib/server/env.ts` are documented in `docs/` under `## Code notes` (satisfying `pnpm lint:no-comments`).
- [ ] **Continuous Integration Verification:**
  - Verify `pnpm check` and `pnpm test` pass without regressions.

---

## Plan of Work for Next Engineering Session

1. **Audit Remaining Raw SQL Casts**
   - Identify remaining `db.execute()` call sites outside admin/health routes.
   - Refactor queries to use `sqlRows()` with Valibot schemas.

2. **Verify Invariant Linters**
   - Run `pnpm lint:no-comments`, `pnpm lint:tenant-scope`, `pnpm lint:action-authz`, and `pnpm lint:duplication`.

3. **Execute Test Verification**
   - Run Vitest test suites (`tests/request-policy.test.ts`, `tests/config.test.ts`, `tests/api-health.test.ts`, `tests/einvoice-parser.test.ts`) to ensure 100% pass rate.
