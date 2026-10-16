---
tags: [mep, issue, security, nosniff, export-headers, error-masking]
related: PR #1228, Commit 1b33cff4 / 25e6c0ff, docs/08_audits/pr_1228_export_nosniff_review.md
---

# Issue Report: Actionable Follow-up Engineering Tasks for PR #1228 (Export nosniff Headers & Error Masking)

**Issue Context:** Follow-up tasks derived from the Master Closed PR Review of PR #1228 (`security: mask server errors and set nosniff on export endpoints` / Commit `1b33cff4` / `25e6c0ff`).

---

## 1. Summary & Objectives

PR #1228 successfully implemented `X-Content-Type-Options: nosniff` headers on CSV report and recipe export endpoints and reinforced error masking for status >= 500 server errors in `src/hooks.server.ts`.

To ensure long-term maintainability, prevent security regressions, and eliminate header boilerplate across file-serving routes, the following follow-up tasks should be addressed in subsequent engineering sessions.

---

## 2. Actionable Tasks

### Task 1: Comprehensive Dynamic Static Analysis Test for Export `nosniff` Headers

- **Problem:** Currently, `tests/export-nosniff-header.test.ts` only checks two specific routes (`/recipes/[id]/csv` and `/reports/[type]/csv`) against a hardcoded list. If new file export or serving endpoints are added in the future, they could miss the `X-Content-Type-Options: nosniff` header.
- **Scope:** `tests/export-nosniff-header.test.ts`.
- **Requirements:**
  1. Dynamically scan all `+server.ts` routes under `src/routes/`.
  2. Identify endpoints serving file attachments or downloadable data (matching headers like `Content-Disposition: attachment`, `text/csv`, `application/zip`, `spreadsheetml`, `application/json`, etc.).
  3. Assert that every identified export route includes `'X-Content-Type-Options': 'nosniff'` in its response headers.

---

### Task 2: Centralize Export Response Construction Helper

- **Problem:** Export routes manually instantiate `Response` objects and construct header maps containing `Content-Type`, `Content-Disposition`, and `X-Content-Type-Options`.
- **Scope:** `$lib/server/exports.ts` or `$lib/server/file-validation.ts`.
- **Requirements:**
  1. Create a helper function `createExportResponse(body: BodyInit, options: { filename: string; contentType: string })`.
  2. Automatically populate `Content-Type`, `Content-Disposition` (using `contentDispositionHeader`), and `'X-Content-Type-Options': 'nosniff'`.
  3. Refactor export routes (e.g. `/reports/[type]/csv`, `/recipes/[id]/csv`, `/analytics/extraction/csv`, `/invoices/export/download`, `/api/user/export`) to use this helper.

---

## 3. Verification & Acceptance Criteria

1. Running `pnpm test tests/export-nosniff-header.test.ts` passes and dynamically covers all file export endpoints.
2. `pnpm check` and `pnpm lint:no-comments` pass cleanly.
