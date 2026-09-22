# GitHub Issue: Post-PR #1153 Master PR Review & Operational Hardening Report

## Overview & Scope
This report serves as the master post-PR review for **PR #1153** (`Enforce tenant rate limiting on CSV export endpoints`).

The purpose of PR #1153 was to enforce tenant-scoped rate limiting across all CSV and XLSX document export endpoints in the application (`/recipes/[id]/csv`, `/reports/[type]/csv`, `/analytics/extraction/csv`, `/invoices/export/download`, `/products/inventory-template`).

Prior to PR #1153, unthrottled calls to CPU- and database-intensive export handlers exposed the application to resource exhaustion and denial-of-service risks. PR #1153 protected these routes using `rateLimitScoped({ scope: 'tenant', name: '...' }, { restaurantId: rid })`.

This issue report documents the technical findings, risk evaluations, acceptance criteria, and actionable tasks for the next engineering session.

---

## Technical Analysis of PR #1153 Changes

### 1. Guarded Export Routes
- **`/recipes/[id]/csv`**: Throttled with `name: 'recipe-csv-export'`, `max: 10`.
- **`/reports/[type]/csv`**: Throttled with `name: 'report-export-csv'`, `max: 10`.
- **`/analytics/extraction/csv`**: Throttled with `name: 'export'`, `max: 5`.
- **`/invoices/export/download`**: Throttled with `name: 'export'`, `max: 5`.
- **`/products/inventory-template`**: Throttled with `name: 'inventory-template'`, `max: 10`.

### 2. Rate Limiting Mechanism (`rateLimitScoped`)
- **Finding:** Requests evaluate tenant-scoped sliding window counters prior to running heavy database queries or document formatting.
- **Impact:** Throws a clean HTTP `429 Too Many Requests` error when tenant limits are exceeded, preventing server memory saturation.

---

## Goals & Acceptance Criteria for Next Session

### Goal
Extend automated static analysis and unit tests to enforce rate-limiting on all export endpoints, differentiate rate-limit bucket names where appropriate, and maintain codebase documentation invariants.

### Acceptance Criteria
- [ ] **Granular Bucket Naming Evaluation:**
  - Evaluate separating the shared `'export'` bucket name between `/analytics/extraction/csv` (`analytics-corrections-export`) and `/invoices/export/download` (`invoices-download-export`) for independent tenant quotas.
- [ ] **Automated Export Endpoint Rate Limit Linter / Test:**
  - Extend `tests/rate-limit-scope-enforcement.test.ts` or add a dedicated test verifying that any server route handler with `csv` or export functionality incorporates `rateLimitScoped`.
- [ ] **Codebase Invariant & Verification Suite:**
  - Verify that `pnpm check`, `pnpm lint:no-comments`, and `pnpm test` pass with 100% success.

---

## Plan of Work for Next Engineering Session

1. **Audit Export Bucket Names**
   - Verify if tenant quota limits for invoices export and analytics extraction export require distinct bucket keys.

2. **Add Export Rate Limit Enforcer Test**
   - Extend test suite to check that all endpoints returning `text/csv` or `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet` execute `rateLimitScoped`.

3. **Verify Documentation & Linters**
   - Ensure all architectural notes are updated in `docs/` and run `pnpm lint:no-comments`.
