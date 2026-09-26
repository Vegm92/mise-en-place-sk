# GitHub Issue: Post-PR #1172 / Commit fb67b12 Master PR Review & Operational Hardening Report

## Overview & Scope
This report serves as the master post-PR review for **PR #1172** / **Commit `fb67b12`** (`fix(security): validate batch item UUID format and set nosniff header on file download`).

The purpose of commit `fb67b12` was to harden the batch item file upload media endpoint (`/api/upload/[id]/[file]`) by pre-validating that `params.id` matches a valid UUID format before executing rate limits or database lookup queries, and attaching the `X-Content-Type-Options: nosniff` header on file download responses.

Prior to commit `fb67b12`, non-UUID route parameters triggered unnecessary database lookup queries or unhandled database driver type-cast exceptions, and served file downloads lacked explicit MIME-sniffing protection.

This issue report documents technical findings, risk evaluations, acceptance criteria, and actionable tasks for the next engineering session.

---

## Technical Analysis of Changes (Commit `fb67b12`)

### 1. Guarded Upload Route (`src/routes/api/upload/[id]/[file]/+server.ts`)
- **UUID Pre-Validation:** Evaluates `if (!UUID_RE.test(params.id)) throw error(400, 'Invalid item ID')` before calling `getItem(params.id)` or evaluating tenant rate limits.
- **MIME Sniffing Prevention:** Attaches `'X-Content-Type-Options': 'nosniff'` header to all file download `Response` objects.

### 2. Automated Test Coverage (`tests/upload-path-traversal.test.ts`)
- Updated mock `getItem` expectation to use valid UUID format (`123e4567-e89b-12d3-a456-426614174000`).
- Added test verifying non-UUID `params.id` returns HTTP `400` (`Invalid item ID`).
- Added test verifying `X-Content-Type-Options: nosniff` header presence on served files.

---

## Goals & Acceptance Criteria for Next Session

### Goal
Audit form action payload field parsing for UUID parameters, extend static header analysis tests across all media download endpoints, and verify codebase invariants.

### Acceptance Criteria
- [ ] **Audit Form Payload Field UUID Parsing:**
  - Review form action handlers that accept UUID inputs from form payloads (`FormData.get('batchId')` or `FormData.get('itemId')`) across `/batch/[id]` and `/invoices` to ensure malformed UUID strings are safely rejected with clean 400 errors.
- [ ] **Automated Download Header Verification:**
  - Extend test suite (`tests/content-disposition.test.ts` or `tests/request-policy.test.ts`) to verify that all server endpoints serving raw file downloads attach `X-Content-Type-Options: nosniff`.
- [ ] **Codebase Invariants & Verification:**
  - Ensure `pnpm check`, `pnpm lint:no-comments`, `pnpm lint:tenant-scope`, and `pnpm test` pass with 100% success rate.

---

## Plan of Work for Next Engineering Session

1. **Audit Form Actions for UUID Validation**
   - Review form action handlers taking `batchId` or `itemId` payload parameters and enforce `UUID_RE.test(...)` or helper validation.

2. **Extend File Download Header Tests**
   - Verify that all endpoints setting `Content-Disposition` also attach `X-Content-Type-Options: nosniff`.

3. **Verify Codebase Linters & Test Suite**
   - Execute `pnpm check`, `pnpm lint:no-comments`, and `pnpm test` to ensure full compliance.
