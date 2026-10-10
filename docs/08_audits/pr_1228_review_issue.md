# GitHub Issue: Post-PR #1228 / Commit 1b33cff4 Master PR Review & Export Header Hardening Report

## Overview & Scope
This report serves as the master post-PR review and GitHub Issue specification for **PR #1228** / **Commit `1b33cff4`** (`security: mask server errors and set nosniff on export endpoints`).

The purpose of commit `1b33cff4` was to eliminate MIME-type sniffing vulnerabilities (CWE-693) on CSV export responses by attaching `'X-Content-Type-Options': 'nosniff'` HTTP headers to `/recipes/[id]/csv` and `/reports/[type]/csv` download endpoints.

Prior to commit `1b33cff4`, while media downloads (`/api/upload/[id]/[file]`) and binary exports (`/invoices/export/download`) attached `nosniff`, CSV report and recipe exports returned file attachments without explicit `X-Content-Type-Options` headers, exposing web browsers to potential MIME-type sniffing attacks.

This issue report documents technical findings, acceptance criteria, and actionable tasks for the next engineering session.

---

## Technical Analysis of Changes (Commit `1b33cff4`)

### 1. Export Route Handlers
- **`/recipes/[id]/csv/+server.ts`:** Explicitly sets `X-Content-Type-Options: nosniff` header on the response `Headers` instance.
- **`/reports/[type]/csv/+server.ts`:** Attaches `'X-Content-Type-Options': 'nosniff'` to response headers dictionary.

### 2. Automated Test Coverage
- **`tests/export-nosniff-header.test.ts`:** Created static source code assertions verifying that CSV export route files contain `X-Content-Type-Options` and `nosniff`.

---

## Goals & Acceptance Criteria for Next Session

### Goal
Upgrade `tests/export-nosniff-header.test.ts` to dynamically discover all file export and download route handlers in `src/routes/` (matching paths or content signatures like `Content-Disposition`, `text/csv`, `spreadsheetml`) and verify that 100% of export endpoints attach `X-Content-Type-Options: nosniff`.

### Acceptance Criteria
- [ ] **Dynamic Export Route Discovery in Header Linter:**
  - Refactor `tests/export-nosniff-header.test.ts` to replace the static file array with dynamic route directory scanning (similar to `discoverExportRoutes()` in `tests/rate-limit-scope-enforcement.test.ts`).
  - Scan `src/routes/` for server route handlers (`+server.ts`) that return file downloads, set `Content-Disposition`, or return binary/CSV/spreadsheet content types.
- [ ] **Comprehensive Response Header Assertion:**
  - Assert that every dynamically discovered export endpoint source file includes `'X-Content-Type-Options': 'nosniff'`.
- [ ] **Codebase Invariant & Verification Suite:**
  - Verify that `pnpm check`, `pnpm lint:no-comments`, `pnpm lint:tenant-scope`, and `pnpm test` pass with 100% success rate.

---

## Plan of Work for Next Engineering Session

1. **Implement Dynamic Route Scanner in `tests/export-nosniff-header.test.ts`**
   - Traverse `src/routes/` to discover all export and file download endpoints.
   - Assert `X-Content-Type-Options: nosniff` header presence across all matched handlers.

2. **Verify Codebase Linters & Test Suite**
   - Execute `pnpm check`, `pnpm lint:no-comments`, `pnpm lint:tenant-scope`, and `pnpm test` to confirm full repository health.
