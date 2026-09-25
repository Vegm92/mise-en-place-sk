# GitHub Issue: Post-PR #1164 Master PR Review & Operational Hardening Report

## Overview & Scope
This report serves as the master post-PR review for **PR #1164** (`fix(security): validate batch ID UUID in batch status endpoint`).

The purpose of PR #1164 was to enforce strict UUID parameter validation on `/api/batch-status/[id]`, preventing non-UUID string inputs (`invalid-batch-id`, malformed input, SQL injection strings) from reaching database queries or triggering unnecessary database lookups.

PR #1164 applied `UUID_RE.test(params.id)` from `$lib/server/batch.ts` in `/api/batch-status/[id]/+server.ts` and added automated test coverage in `tests/batch-stall.test.ts`.

This issue report documents the technical findings, acceptance criteria, and actionable tasks for the next engineering session.

---

## Technical Analysis of PR #1164 Changes

### 1. Route Parameter UUID Validation (`src/routes/api/batch-status/[id]/+server.ts`)
- **Behavior:** Validates `params.id` using `UUID_RE` exported from `$lib/server/batch.ts` immediately after authentication check.
- **Error Response:** Returns HTTP `400 Bad Request` with `{ error: 'Invalid batch ID' }` if `params.id` is not a valid UUID format.
- **Impact:** Rejects malformed requests before evaluating rate-limiting counters or querying the database via `getBatchItems(params.id)`.

### 2. Unit Test Verification (`tests/batch-stall.test.ts`)
- Added unit test asserting that `/api/batch-status/[id]` returns HTTP 400 when called with a non-UUID parameter string (`invalid-batch-id`).

---

## Goals & Acceptance Criteria for Next Session

### Goal
Extend UUID parameter validation to remaining batch endpoints (`/batch/[id]` page server and `/api/upload/[id]/[file]` endpoint) and expand test coverage.

### Acceptance Criteria
- [ ] **UUID Validation in `/batch/[id]/+page.server.ts`:**
  - Audit `params.id` in `load` and form actions (`extract`, `retry`, `save`, `discardItem`, `discardBatch`, `add`, `remove`).
  - Validate `UUID_RE.test(params.id)` in `requireOwnedBatch` or `load` / actions, throwing `error(400, 'Invalid batch ID')` or redirecting safely on malformed batch IDs.
- [ ] **UUID Validation in `/api/upload/[id]/[file]/+server.ts`:**
  - Audit `params.id` (batch item UUID) and validate `UUID_RE.test(params.id)`, throwing `error(400, 'Invalid batch item ID')` on malformed item IDs.
- [ ] **Automated Parameter Validation Tests:**
  - Extend test coverage in `tests/batch-stall.test.ts` or `tests/542-malformed-route-params.test.ts` to test non-UUID inputs against `/batch/[id]` and `/api/upload/[id]/[file]`.
- [ ] **Codebase Invariants & Verification:**
  - Run `pnpm check`, `pnpm lint:no-comments`, and `pnpm test` to ensure 100% test pass rate and lint compliance.

---

## Plan of Work for Next Engineering Session

1. **Harden Remaining Batch Route Parameter Handlers**
   - Update `src/routes/(app)/batch/[id]/+page.server.ts` to validate UUID parameter format before querying database.
   - Update `src/routes/api/upload/[id]/[file]/+server.ts` to validate batch item ID UUID format before calling `getItem`.

2. **Add Route Parameter Test Cases**
   - Add test cases in `tests/batch-stall.test.ts` / `tests/542-malformed-route-params.test.ts` for malformed UUID inputs across batch routes.

3. **Verify Suite & Linters**
   - Execute `pnpm check`, `pnpm lint:no-comments`, and `pnpm test` to verify all checks pass.
