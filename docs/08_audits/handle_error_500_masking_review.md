---
tags: [mep, audit, pr-review, security, error-handling, sveltekit, masking, sentry, cwe-209]
related: Commit 50eee0a
---

# Post-Merge Review Report: Commit 50eee0a (Mask Internal 500 Server Error Messages in SvelteKit handleError)

**Reviewed Commit:** `50eee0adb69dd78e392246f9537e695c7c3d13fc`
**Branch:** `security-audit-error-masking-nosniff-5296347646177717307-3567859498410145195`
**Reviewer:** Master Closed PR Reviewer
**Audit Date:** 2026-10-09

---

## 01. Executive Summary

Commit `50eee0a` hardens server error handling in SvelteKit's `handleError` hook (`src/hooks.server.ts`), preventing internal server exception messages (status >= 500) from leaking to client application contexts and client-facing error UI pages.

Prior to commit `50eee0a`, `handleError` returned `(error as Error)?.message ?? 'An unexpected error occurred'` regardless of HTTP status code. When an unhandled database exception (e.g., Drizzle query syntax error, foreign key constraint failure, or connection timeout) or internal code error occurred during server rendering or form action execution, the raw `Error.message` string was passed directly to SvelteKit's client `$page.error` state. This exposed sensitive database schema details, file paths, and internal stack traces to end users (CWE-209: Information Exposure Through an Error Message).

Commit `50eee0a` updated `handleError` to conditionally mask 500-level error messages:
1. **Internal Server Error Masking (Status >= 500):** Evaluates `status >= 500` and replaces client-facing error messages with `'An unexpected error occurred'`, while preserving internal server-side logging (`log.error('server error', { requestId, err: error })`) and Sentry error capturing.
2. **User-Facing Error Preservation (Status < 500):** Preserves custom, safe client error messages (such as 400 Bad Request or 403 Forbidden validation feedback) in client error contexts.
3. **Correlation Tracking:** Retains `requestId` in client error objects to allow users/support engineers to correlate client error reports with server logs.

This report provides a master architectural review of commit `50eee0a`, evaluating technical correctness, security posture, test suite coverage, and operational recommendations.

---

## 02. Technical Analysis of Code Changes

### 1. Server Error Handler Hook (`src/hooks.server.ts`)

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

**Key Mechanics & Design Decisions:**
- **Status Code-Driven Guard:** Checks SvelteKit's passed `status` integer. Any status code >= 500 triggers message masking.
- **Client Message Masking:** Returns static string `'An unexpected error occurred'` for status >= 500, guaranteeing that database errors (e.g. `connect ECONNREFUSED`, `select ... column does not exist`) are masked from HTTP responses and DOM rendering.
- **Client Error Message Preservation:** For 4xx errors (e.g., status 400, 403, 404), `((error as Error)?.message ?? 'An unexpected error occurred')` preserves intentional client validation messages.
- **Log Correlation:** Full error objects with stack traces continue to be logged server-side (`log.error('server error', { requestId, err: error })`) and sent to Sentry via `Sentry.handleErrorWithSentry(...)`.
- **Request ID Attachment:** Attaches `requestId` (`event?.locals?.requestId`) to the client error object, allowing user error pages to display a tracking reference without revealing internal details.

---

## 03. Security & Risk Assessment

| Risk Domain / CWE | Evaluation | Risk Status & Impact |
|---|---|---|
| **Information Exposure via Error Messages (CWE-209 / CWE-200)** | **Mitigated** | Prevents internal database stack traces, SQL queries, or internal path names from leaking to untrusted clients during 500 exceptions. |
| **User Experience & 4xx Preservations** | **Pass** | User-facing validation messages on status < 500 (e.g. invalid form inputs, permission denials) remain untouched. |
| **Sentry Exception Capture & Observability** | **Pass** | `Sentry.handleErrorWithSentry` captures full exception details in Sentry, and structured logs retain full error objects and request IDs for developer debugging. |
| **API Endpoint JSON Error Leakage** | **Low Residual Risk** | While `handleError` protects SvelteKit page loads and form action unhandled errors, standalone API endpoints (`+server.ts` routes) that catch errors manually must also ensure internal exception strings are masked before returning `json({ error: ... }, { status: 500 })`. |

---

## 04. Test Coverage & Quality Verification

- **Automated Tests (`tests/hooks-server-handle-error.test.ts`):**
  - Added test case verifying 500 error messages are masked to `'An unexpected error occurred'` while preserving `requestId`.
  - Added test case verifying custom 4xx error messages are preserved for client error context.
  - Verified 404 `SvelteKitError` and 4xx `HttpError` filtering without noisy console logging.
- **Codebase Invariants:**
  - `pnpm check` passes cleanly with 0 TypeScript errors.
  - `pnpm lint:no-comments` is strictly maintained across `src/`.
  - `pnpm lint:tenant-scope` passes cleanly.

---

## 05. Actionable Backlog Items for Future Sessions

1. **Task 1: Audit Custom `+server.ts` API Error Responders for 500 Error Message Leaks**
   - **Context:** Endpoint handlers that catch exceptions using `try / catch` blocks might construct custom JSON error responses (e.g. `json({ error: err.message }, { status: 500 })`), bypassing `handleError`.
   - **Action:** Audit API routes under `src/routes/api/` and helper functions like `apiError()` to ensure internal 500 error messages are masked centrally.

2. **Task 2: Standardize `apiError` Helper in `$lib/server/api-error.ts`**
   - **Context:** Standardizing `apiError(status, message)` to automatically mask messages when `status >= 500` ensures consistent behavior across all standalone API endpoints.
   - **Action:** Update `apiError` to mask messages for status >= 500 unless explicitly marked as user-safe.
