# GitHub Issue: Post-PR sec-export-nosniff-header / Commit dd7ae22 Master PR Review & Security Hardening Report

## Overview & Scope
This report serves as the master post-PR review and GitHub Issue specification for **PR `sec-export-nosniff-header`** / **Commit `dd7ae22`** (`sec: attach X-Content-Type-Options nosniff to export responses`).

The purpose of Commit `dd7ae22` was to eliminate MIME-type sniffing risks (CWE-693) on primary data export responses by attaching `'X-Content-Type-Options': 'nosniff'` to HTTP headers in `/invoices/export/download` (ZIP package and XLSX workbook downloads) and `/api/user/export` (JSON account export attachment downloads).

Prior to Commit `dd7ae22`, while media file downloads (`/api/upload/[id]/[file]`) attached `nosniff`, data exports returned file attachments without explicit `X-Content-Type-Options` protection, exposing client web browsers to potential MIME-type sniffing.

This issue report documents technical findings, acceptance criteria, and actionable tasks for the next engineering session.

---

## Technical Analysis of Changes (Commit `dd7ae22`)

### 1. Export Route Handlers
- **`/invoices/export/download/+server.ts`:** Attaches `'X-Content-Type-Options': 'nosniff'` to `application/zip` and `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet` responses.
- **`/api/user/export/+server.ts`:** Attaches `'X-Content-Type-Options': 'nosniff'` to `application/json` data attachment responses.

### 2. Automated Test Coverage
- **`tests/account-export.test.ts`:** Asserts `X-Content-Type-Options: nosniff` header on GET `/api/user/export` responses.
- **`tests/invoices-export-download.test.ts`:** Asserts `X-Content-Type-Options: nosniff` header on XLSX and ZIP download responses.
- **`tests/content-disposition.test.ts`:** Introduced static file read assertions verifying `X-Content-Type-Options: nosniff` header in route source code.

---

## Goals & Acceptance Criteria for Next Session

### Goal
Attach `X-Content-Type-Options: nosniff` headers to all remaining file export and download routes, replace hardcoded route checks with a dynamic route scanner in `tests/content-disposition.test.ts`, and maintain codebase invariants.

### Acceptance Criteria
- [ ] **Security Header Hardening on Remaining Export Routes:**
  - Update the following endpoints to attach `'X-Content-Type-Options': 'nosniff'` to response headers:
    - `src/routes/(app)/products/inventory-template/+server.ts`
    - `src/routes/(app)/reports/[type]/csv/+server.ts`
    - `src/routes/(app)/analytics/extraction/csv/+server.ts`
    - `src/routes/(app)/recipes/[id]/csv/+server.ts`
- [ ] **Dynamic Export Route Scanner in Linter Suite:**
  - Upgrade `tests/content-disposition.test.ts` to dynamically scan `src/routes/` for all `+server.ts` files that set `Content-Disposition` headers and assert that every one of them explicitly sets `'X-Content-Type-Options': 'nosniff'`.
- [ ] **Codebase Invariant & Verification Suite:**
  - Verify that `pnpm check`, `pnpm lint:no-comments`, `pnpm lint:tenant-scope`, and `pnpm test` pass with 100% success rate.

---

## Plan of Work for Next Engineering Session

1. **Add `nosniff` Headers to Remaining File Export Routes**
   - Update `products/inventory-template`, `reports/[type]/csv`, `analytics/extraction/csv`, and `recipes/[id]/csv` route handlers to attach `'X-Content-Type-Options': 'nosniff'` headers.

2. **Upgrade `tests/content-disposition.test.ts` to Dynamic Route Scanner**
   - Scan `src/routes/` dynamically for files setting `Content-Disposition` and assert `nosniff` presence across all matched routes.

3. **Verify Codebase Linters & Test Suite**
   - Execute `pnpm check`, `pnpm lint:no-comments`, `pnpm lint:tenant-scope`, and `pnpm test` to confirm full repository health.
