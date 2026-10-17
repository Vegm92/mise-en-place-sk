# GitHub Issue: Post-Commit 50eee0a Master PR Review & Operational Hardening Report

## Overview & Scope
This report serves as the master post-commit review for **Commit `50eee0a`** (`fix(security): mask internal 500 error messages in handleError`).

The purpose of commit `50eee0a` was to harden SvelteKit's global `handleError` hook (`src/hooks.server.ts`), masking raw internal 500 server error messages from leaking to client application contexts and client-facing error pages.

Prior to commit `50eee0a`, `handleError` passed raw `(error as Error)?.message` strings directly to client error contexts regardless of HTTP status code, exposing internal database details and stack traces (CWE-209) on unhandled 500 server errors.

Commit `50eee0a` updated `handleError` to return static message `'An unexpected error occurred'` whenever `status >= 500`, while preserving user-facing 4xx error messages, server-side log recording, Sentry exception tracking, and request ID correlation.

This issue report documents technical findings, risk evaluations, acceptance criteria, and actionable tasks for the next engineering session.

---

## Technical Analysis of Changes (Commit `50eee0a`)

### 1. SvelteKit Error Hook (`src/hooks.server.ts`)
```typescript
export const handleError = Sentry.handleErrorWithSentry(
	({ error, event, status }: { error: unknown; event: RequestEvent; status: number }) => {
		const requestId = event?.locals?.requestId;
		if (status >= 500) {
			log.error('server error', { requestId, err: error });
		}
		return {
			message: status >= 500 ? 'An unexpected error occurred' : ((error as Error)?.message ?? 'An unexpected error occurred'),
			requestId,
		};
	},
);
```

### 2. Unit Test Suite (`tests/hooks-server-handle-error.test.ts`)
- Added test asserting that 500-level error messages are masked to `'An unexpected error occurred'` while preserving `requestId`.
- Added test asserting that 4xx client error messages remain preserved for client context.

---

## Goals & Acceptance Criteria for Next Session

### Goal
Audit standalone API endpoints (`src/routes/api/`) and error response helpers (`$lib/server/api-error.ts`) to ensure that internal 500 server error messages are consistently masked across all custom JSON API responses.

### Acceptance Criteria
- [ ] **API Endpoint Error Masking Audit:**
  - Audit `apiError()` helper in `$lib/server/api-error.ts` to ensure `status >= 500` automatically masks internal error messages to `'An unexpected error occurred'`.
  - Audit `catch` blocks in API endpoints under `src/routes/api/` to verify no raw exception messages are exposed in 500 JSON responses.
- [ ] **Codebase Invariants & Verification:**
  - Verify `pnpm check`, `pnpm lint:no-comments`, `pnpm lint:tenant-scope`, and `pnpm test` pass with 100% success rate.

---

## Plan of Work for Next Engineering Session

1. **Audit `$lib/server/api-error.ts` and API Endpoints**
   - Ensure `apiError` enforces automatic masking for HTTP status >= 500.
   - Refactor any direct `json({ error: err.message }, { status: 500 })` occurrences in `src/routes/api/` to use `apiError` or masked error messages.

2. **Verify Repository Linters & Tests**
   - Execute `pnpm check` and `pnpm test` to confirm full suite stability.
