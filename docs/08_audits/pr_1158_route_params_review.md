---
tags: [mep, audit, pr-review, security, route-params, validation]
related: PR #1158
---

# Post-Merge Review Report: PR #1158 (Enforce Strict Positive Integer Validation on Route Parameters)

**Reviewed PR:** #1158 (`Security Audit: Enforce strict positive integer validation on route parameters`)
**Merge Commit:** `3396ba1f143c1789f245a59426ad26fc9a380bda`
**Branch:** `Vegm92/jules-8907894152749380764-b03ddc82`
**Reviewer:** Master Closed PR Reviewer
**Audit Date:** 2026-09-22

---

## 01. Executive Summary

PR #1158 addresses a critical input-validation security vector across application route handlers where parameterized route identifiers (`params.id`) were converted using native `Number(params.id)` without prior positive integer validation or clean HTTP exception bounds.

Prior to this fix, non-numeric strings, floats, zero, negative integers, or SQL injection payloads passed as `params.id` evaluated to `NaN` or invalid numbers. When handed directly to database queries, these triggered unhandled Postgres driver type-cast exceptions, resulting in HTTP 500 internal server error responses and leaking unhandled execution traces.

PR #1158 standardized route parameter validation by using `requirePositiveIntId(raw, label)` from `$lib/server/route-params.ts` across product and recipe route families:
1. **`/products/[id]` (`saveFacts` action):** Replaced ad-hoc `Number.isInteger` check returning `fail(422)` with standard `requirePositiveIntId(params.id, 'product')` returning HTTP 400.
2. **`/recipes/[id]` (Load & Actions):** Standardized `load`, `updateRecipe`, `addItem`, `updateItem`, `deleteItem`, `duplicate`, and `delete` handlers to call `requirePositiveIntId(params.id, 'recipe')`. Removed redundant manual integer checks in internal query helper `requireRecipe`.
3. **`/recipes/[id]/cocina` (Load):** Standardized load handler with `requirePositiveIntId(params.id, 'recipe')`.
4. **`/recipes/[id]/csv` (GET endpoint):** Standardized CSV export handler with `requirePositiveIntId(params.id, 'recipe')`.
5. **`/recipes/[id]/sheet` (Load):** Standardized sheet load helper with `requirePositiveIntId(params.id, 'recipe')`.

This review evaluates the technical implementation, security posture, and residual backlog items following the merge of PR #1158.

---

## 02. Technical Analysis of Code Changes

### 1. Route Parameter Validation Utility (`src/lib/server/route-params.ts`)

```typescript
export function requirePositiveIntId(raw: string, label: string): number {
	const id = Number(raw);
	if (!Number.isInteger(id) || id <= 0) error(400, `Invalid ${label} id`);
	return id;
}
```

**Key Mechanics:**
- **Strict Parsing:** Validates that `Number(raw)` is both a valid integer (`Number.isInteger(id)`) and strictly positive (`id > 0`).
- **Fail-Fast Error Handling:** Rejects non-positive integers, floating-point numbers, `NaN`, non-numeric strings, and SQL injection payloads immediately with a clean HTTP `400 Bad Request` (`Invalid <label> id`) before any database query is constructed or executed.

### 2. Affected Route Endpoints

| Route Endpoint | Handler Type | Old Validation Method | New Validation Method | Exception Standardized |
|---|---|---|---|---|
| `/routes/(app)/products/[id]/+page.server.ts` | `saveFacts` Action | `Number(params.id)` + `fail(422)` | `requirePositiveIntId(params.id, 'product')` | `HTTP 400` |
| `/routes/(app)/recipes/[id]/+page.server.ts` | `load` & 6 Actions | `Number(params.id)` + manual `404` in helper | `requirePositiveIntId(params.id, 'recipe')` | `HTTP 400` |
| `/routes/(app)/recipes/[id]/cocina/+page.server.ts` | `load` | `Number(params.id)` + `error(404)` | `requirePositiveIntId(params.id, 'recipe')` | `HTTP 400` |
| `/routes/(app)/recipes/[id]/csv/+server.ts` | `GET` Endpoint | `Number(params.id)` + `error(404)` | `requirePositiveIntId(params.id, 'recipe')` | `HTTP 400` |
| `/routes/(app)/recipes/[id]/sheet/+page.server.ts` | `load` | `Number(params.id)` + `error(404)` | `requirePositiveIntId(params.id, 'recipe')` | `HTTP 400` |

---

## 03. Vulnerability & Risk Assessment

| Risk / Observation | Severity | Status | Technical Details |
|---|---|---|---|
| **Unhandled Postgres Cast Exception (HTTP 500)** | Medium | **Mitigated** | Passing malformed parameters (e.g. `NaN` or non-integer strings) to Drizzle/Postgres queries previously caused driver-level cast rejections escaping as generic 500 errors. `requirePositiveIntId` converts these to predictable HTTP 400 responses. |
| **Route Test Suite Gap** | Low | **Open Backlog** | `tests/542-malformed-route-params.test.ts` validates `requirePositiveIntId` across invoice, product, and supplier routes, but was not updated in PR #1158 to cover the newly converted recipe routes (`/recipes/[id]`, `/recipes/[id]/cocina`, `/recipes/[id]/csv`, `/recipes/[id]/sheet`). |
| **Form Payload Field ID Parsing** | Low | **Open Backlog** | Certain form actions (e.g., in `/invoices` and `/recipes/[id]`) convert form field IDs (such as `formData.get('productId')`) using raw `Number(...)`. Standardizing form field ID validation prevents edge-case 500s on manipulated POST payloads. |

---

## 04. Test Coverage & Quality Assessment

- **Current Coverage:** `tests/542-malformed-route-params.test.ts` verifies route parameter handling against malformed inputs (`NaN`, UUIDs, SQL payloads, zero, negative numbers).
- **Codebase Invariants:**
  - `pnpm lint:tenant-scope` passes cleanly.
  - `pnpm lint:no-comments` is preserved across modified files.

---

## 05. Actionable Backlog Items for Future Sessions

1. **Task 1: Expand `tests/542-malformed-route-params.test.ts` to Cover Recipe Routes**
   - Add test cases in `ROUTES` array for `/recipes/[id]` load & actions (`updateRecipe`, `addItem`, `updateItem`, `deleteItem`, `duplicate`, `delete`), `/recipes/[id]/cocina`, `/recipes/[id]/csv`, `/recipes/[id]/sheet`, and `/products/[id]` (`saveFacts` action).

2. **Task 2: Audit and Standardize Form Action Field ID Validation**
   - Review form action handlers that convert string IDs from `FormData` payloads (e.g., `data.get('productId')` or `data.get('conversion_id')`) and enforce `requirePositiveIntId` or equivalent form field validation.
