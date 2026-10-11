# GitHub Issue: Post-PR #1228 / Commit 1b33cff4 Master PR Review & Operational Hardening Report

## Overview & Scope
This report serves as the master post-PR review for **PR #1228** / **Commit `1b33cff4`** (`security: mask server errors and set nosniff on export endpoints`).

The purpose of commit `1b33cff4` was to eliminate MIME-type sniffing risks (CWE-693) on recipe and report CSV export endpoints (`/recipes/[id]/csv` and `/reports/[type]/csv`) by attaching `'X-Content-Type-Options': 'nosniff'` to HTTP response headers.

Prior to PR #1228, while invoice export packages (ZIP/XLSX) and account data exports attached `nosniff` headers, CSV export endpoints served file attachments without explicit `X-Content-Type-Options: nosniff` protection, exposing client web browsers to potential MIME-type sniffing.

This issue report documents technical findings, risk evaluations, acceptance criteria, and actionable tasks for the next engineering session.

---

## Technical Analysis of Changes (Commit `1b33cff4`)

### 1. CSV Export Response Headers
- **Recipe CSV Endpoint (`src/routes/(app)/recipes/[id]/csv/+server.ts`):** Attached `headers.set('X-Content-Type-Options', 'nosniff')` to HTTP response headers.
- **Reports CSV Endpoint (`src/routes/(app)/reports/[type]/csv/+server.ts`):** Attached `'X-Content-Type-Options': 'nosniff'` to response headers dictionary.

### 2. Static Unit Test Coverage
- **Export Nosniff Linter (`tests/export-nosniff-header.test.ts`):** Added static file read assertions verifying `X-Content-Type-Options: nosniff` header presence in CSV route source code.

---

## Goals & Acceptance Criteria for Next Session

### Goal
Refactor `tests/export-nosniff-header.test.ts` to dynamically scan `src/routes/` for all export and file download endpoints returning `Content-Disposition` headers, ensuring automated security regression protection without relying on hardcoded file lists.

### Acceptance Criteria
- [ ] **Dynamic Export Route Discovery:**
  - Implement dynamic route scanner (e.g. `discoverExportRoutes()`) in `tests/export-nosniff-header.test.ts` that crawls `src/routes/` for server endpoints serving file exports or setting `Content-Disposition`.
- [ ] **Table-Driven Header Verification:**
  - Assert that 100% of discovered export routes contain `'X-Content-Type-Options': 'nosniff'`.
- [ ] **Codebase Invariants & Verification:**
  - Ensure `pnpm check`, `pnpm lint:no-comments`, `pnpm lint:tenant-scope`, and `pnpm test` pass with 100% success rate.

---

## Plan of Work for Next Engineering Session

1. **Implement Dynamic Route Scanner in `tests/export-nosniff-header.test.ts`**
   - Create route walker helper to identify all SvelteKit `+server.ts` endpoints setting `Content-Disposition` or matching `/csv`, `/export`, or download signatures.
   - Refactor `it.each` table-driven test runner to assert `X-Content-Type-Options: nosniff` header across all discovered route files.

2. **Verify Codebase Linters & Test Suite**
   - Run `pnpm check`, `pnpm lint:no-comments`, `pnpm lint:tenant-scope`, and `pnpm test` to confirm repository compliance.
