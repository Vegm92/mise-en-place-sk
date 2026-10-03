---
tags: [mep, audit, pr-review, security, authentication, tenant-isolation, rate-limiting, export-security]
related: PR #1204, Commit 0c28160
---

# Post-Merge Review Report: PR #1204 / Commit 0c28160 (Explicit Tenant Authentication & Rate Limiting in Export Endpoints)

**Reviewed PR:** #1204 (`security: enforce explicit tenant authentication check in export endpoints`)
**Merge Commit:** `0c28160e1809c06957f2b8ae9ded4af33b338179`
**Branch:** `Vegm92/sentinel-security-audit-fix-9573360130091509103`
**Reviewer:** Master Closed PR Reviewer
**Audit Date:** 2026-10-03

---

## 01. Executive Summary

Commit `0c28160` (PR #1204) hardens authentication, tenant authorization, and rate limiting across user account data and invoice export endpoints (`/api/user/export` and `/invoices/export/download`).

Data export routes generate significant memory, CPU, and database load by aggregating tenant-scoped data, compiling Excel spreadsheets (`ExcelJS`), or bundling invoice source documents into ZIP archives. Prior to PR #1204, export endpoints required comprehensive verification of tenant context (`locals.restaurantId`) and user session state (`locals.user`) prior to evaluating rate limit budgets or executing queries. Furthermore, rate limiting bucket names and formula injection defenses required continuous verification against CWE-1236 and OWASP top risk standards.

PR #1204 enforced strict pre-query authentication and authorization guards across export handlers:
1. **User Account Export (`/api/user/export`):** Enforces explicit `locals.user` check, user-scoped rate limiting (`account-export`, max 5 requests), and filters exported tables strictly using `userMemberships(user.id)`.
2. **Invoice Download & Export (`/invoices/export/download`):** Enforces explicit tenant check (`locals.restaurantId`), tenant-scoped rate limiting (`invoices-download-export`, max 5 requests), parameter input bounds validation (`ids` max 500 positive integers, `supplier_id`, `date_from`, `date_to`), and formula injection sanitization via `sanitizeFormulaString()`.

This report provides a master architectural review of PR #1204, evaluating implementation correctness, security posture, test coverage, and residual backlog items for future engineering sessions.

---

## 02. Technical Analysis of Code Changes

### 1. Account Export Endpoint (`src/routes/api/user/export/+server.ts`)

```typescript
export const GET: RequestHandler = async ({ locals }) => {
	const user = locals.user;
	if (!user) return apiError(401, 'Unauthorized');

	if (!(await rateLimitScoped({ scope: 'user', name: 'account-export', max: 5 }, { userId: user.id }))) {
		return apiError(429, 'Too many requests — please wait a moment before trying again');
	}

	const memberships = await userMemberships(user.id);
	const restaurantIds = memberships.map(m => m.restaurantId);
	const entries = exportableEntries();

	const tableRows = restaurantIds.length > 0
		? await Promise.all(entries.map((entry) => {
			const scope = inArray(entry.scopeColumn, restaurantIds);
			const where = entry.exportFilter ? and(scope, entry.exportFilter()) : scope;
			return db.select().from(entry.table).where(where);
		}))
		: entries.map(() => []);

	const tables = Object.fromEntries(entries.map((entry, i) => [entry.exportKey as string, tableRows[i]]));

	const export_data = {
		exported_at: new Date().toISOString(),
		user: {
			id:    user.id,
			email: user.email,
		},
		memberships,
		...tables,
	};

	return new Response(JSON.stringify(export_data, null, 2), {
		headers: {
			'Content-Type':        'application/json',
			'Content-Disposition': contentDispositionHeader('attachment', `mise-en-place-data-${user.id}.json`),
		},
	});
};
```

**Key Architectural & Security Features:**
- **Explicit Authentication Guard:** Validates `if (!user) return apiError(401, 'Unauthorized')` before performing any database operations or rate limit bucket evaluation.
- **User-Scoped Sliding Window Rate Limiter:** Invokes `rateLimitScoped({ scope: 'user', name: 'account-export', max: 5 }, { userId: user.id })` to prevent user account export endpoint flooding.
- **Tenant Scope Enforcement:** Resolves tenant memberships via `userMemberships(user.id)` and restricts database queries using `inArray(entry.scopeColumn, restaurantIds)`. Empty memberships short-circuit database queries cleanly.

### 2. Invoices Export Download Endpoint (`src/routes/(app)/invoices/export/download/+server.ts`)

```typescript
export const GET: RequestHandler = async ({ url, locals }) => {
	const rid = locals.restaurantId;
	if (!rid) throw error(401, 'Unauthorized');

	if (!(await rateLimitScoped({ scope: 'tenant', name: 'invoices-download-export', max: 5 }, { restaurantId: rid }))) {
		throw error(429, 'Too many requests — please wait a moment before trying again');
	}

	const tdb          = forTenant(rid);
	const idsParam     = url.searchParams.get('ids') ?? '';
	const format       = url.searchParams.get('format') ?? '';

	let ids: number[] | null = null;
	if (idsParam) {
		const parts = idsParam.split(',').map((p) => p.trim()).filter(Boolean);
		if (parts.length === 0 || parts.length > MAX_EXPORT_IDS || !parts.every((p) => POSITIVE_INT.test(p))) {
			throw error(400, 'Invalid ids');
		}
		ids = parts.map((p) => parseInt(p, 10));
	}

	const conditions: SQL[] = [tdb.scope(invoices.restaurantId), isNull(invoices.deletedAt)];
...
```

**Key Architectural & Security Features:**
- **Tenant Context Verification:** Immediately asserts `if (!rid) throw error(401, 'Unauthorized')`.
- **Tenant Rate Limit Isolation:** Applies distinct rate limit bucket `invoices-download-export` (5 requests per tenant window).
- **Strict Parameter Input Bounds:** Enforces regex validation (`POSITIVE_INT`) and bounds checking (`MAX_EXPORT_IDS = 500`) on `ids` parameters to prevent denial-of-service via huge ID arrays.
- **Formula Injection Mitigation (CWE-1236):** Passes all exported text fields through `sanitizeFormulaString(...)` before adding rows to `ExcelJS` workbooks.

---

## 03. Vulnerability & Security Assessment

| Risk Domain | Evaluation | Findings & Verification |
|---|---|---|
| **Authentication & Authorization** | **Pass** | Both export endpoints explicitly verify session state (`locals.user` / `locals.restaurantId`) before evaluating rate limits or executing queries. |
| **Tenant Isolation** | **Pass** | Multi-tenant DB operations enforce `tdb.scope(invoices.restaurantId)` and `inArray(entry.scopeColumn, restaurantIds)` boundaries. Verified against `pnpm lint:tenant-scope`. |
| **CSV/Excel Formula Injection (CWE-1236)** | **Pass** | All dynamic string properties (supplier name, invoice number, status label) are sanitized using `sanitizeFormulaString()`. |
| **Response Headers** | **Pass** | File downloads specify safe `Content-Disposition` attachments using `contentDispositionHeader()`. |

---

## 04. Test Coverage & Quality Verification

- **Automated Tests (`tests/account-export.test.ts` & `tests/invoices-export-download.test.ts`):**
  - Verify unauthenticated requests trigger 401 Unauthorized errors.
  - Verify rate limit threshold enforcement (HTTP 429).
  - Verify formula injection sanitization on spreadsheet cell outputs.
  - Verify dataset row capping via `EXPORT_ROW_CAP`.
- **Codebase Invariants:**
  - `pnpm lint:tenant-scope` passes with 0 violations.
  - `pnpm lint:no-comments` strictly maintained across `src/`.

---

## 05. Actionable Backlog Items for Future Sessions

1. **Task 1: Security Header Hardening on Export Endpoints**
   - **Context:** While `/api/upload/[id]/[file]` attaches `X-Content-Type-Options: nosniff`, export endpoints (`/invoices/export/download` and `/api/user/export`) return JSON, XLSX, and ZIP attachments without explicit `nosniff` headers.
   - **Action:** Add `X-Content-Type-Options: nosniff` header to responses in `/invoices/export/download` and `/api/user/export`.

2. **Task 2: Automated Invariant Enforcement Test for File Download Headers**
   - **Context:** Ensure all file export and download routes consistently include `X-Content-Type-Options: nosniff` and proper rate limiting.
   - **Action:** Extend `tests/content-disposition.test.ts` or static route linters to verify `nosniff` header presence on export endpoints.
