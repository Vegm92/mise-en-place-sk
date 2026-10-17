---
tags: [mep, audit, pr-review, security, headers, export-security, nosniff, content-disposition]
related: PR #1228, Commit 1b33cff4, Commit 25e6c0ff
---

# Post-Merge Review Report: Commit 1b33cff4 / PR #1228 (Attach X-Content-Type-Options nosniff to CSV Report and Recipe Exports)

**Reviewed PR:** #1228 (`security: mask server errors and set nosniff on export endpoints`)
**Merge Commit:** `1b33cff449d686a08dc494ee42c8095e115d356a`
**Branch:** `Vegm92/security/handle-error-nosniff-hardening-246537850084729795`
**Reviewer:** Master Closed PR Reviewer
**Audit Date:** 2026-10-10

---

## 01. Executive Summary

Commit `1b33cff4` (PR #1228) addresses a security response header gap across CSV report and recipe export endpoints (`/reports/[type]/csv` and `/recipes/[id]/csv`).

Following the security header audit conducted in PR `sec-export-nosniff-header` (Commit `dd7ae22`), which attached `'X-Content-Type-Options': 'nosniff'` headers to invoice download packages (ZIP/XLSX) and account data export endpoints (`/api/user/export`), a residual vulnerability was identified across CSV download handlers. CSV exports returned `Content-Disposition: attachment` responses without explicit `X-Content-Type-Options: nosniff` headers.

Without `X-Content-Type-Options: nosniff`, web browsers may perform MIME-type sniffing (CWE-693) on downloaded files or binary attachments. If a CSV export contains user-influenced text or formula payloads, browser MIME sniffing could potentially misinterpret the content type and execute scripts or render HTML in the application's origin context.

PR #1228 remediated this vulnerability by attaching `'X-Content-Type-Options': 'nosniff'` response headers to `/recipes/[id]/csv` and `/reports/[type]/csv` endpoints and adding static test assertions in `tests/export-nosniff-header.test.ts`.

This report provides a master post-merge architectural review of PR #1228, evaluating implementation correctness, security posture, test coverage, and residual backlog items for future engineering sessions.

---

## 02. Technical Analysis of Code Changes

### 1. Recipe CSV Export Handler (`src/routes/(app)/recipes/[id]/csv/+server.ts`)

```typescript
export const GET: RequestHandler = async ({ params, locals }) => {
	// ... document generation logic ...
	const headers = new Headers();
	headers.set('Content-Type', 'text/csv; charset=utf-8');
	headers.set('Content-Disposition', contentDispositionHeader('attachment', doc.csv.filename));
	headers.set('X-Content-Type-Options', 'nosniff');
	return new Response(body, { headers });
};
```

**Key Improvements:**
- Explicitly sets `X-Content-Type-Options: nosniff` header on the response `Headers` instance before returning `Response`.
- Prevents browsers from guessing content type on generated recipe CSV exports.

### 2. Reports CSV Export Handler (`src/routes/(app)/reports/[type]/csv/+server.ts`)

```typescript
return new Response(reportCsv(doc), {
	headers: {
		'Content-Type':           'text/csv; charset=utf-8',
		'Content-Disposition':    contentDispositionHeader('attachment', doc.csv.filename),
		'X-Content-Type-Options': 'nosniff',
	},
});
```

**Key Improvements:**
- Attaches `'X-Content-Type-Options': 'nosniff'` to response headers dictionary for all report CSV exports (purchases, cost breakdown, sales).
- Enforces strict `text/csv` handling by client user agents.

### 3. Static Test Coverage (`tests/export-nosniff-header.test.ts`)

```typescript
describe('Export and download endpoints attach X-Content-Type-Options: nosniff', () => {
	const exportRoutes = [
		'src/routes/(app)/reports/[type]/csv/+server.ts',
		'src/routes/(app)/recipes/[id]/csv/+server.ts',
	];

	for (const relFile of exportRoutes) {
		it(`${relFile} includes X-Content-Type-Options: nosniff header`, () => {
			const src = fs.readFileSync(path.join(process.cwd(), relFile), 'utf8');
			expect(src).toMatch(/X-Content-Type-Options/i);
			expect(src).toMatch(/nosniff/i);
		});
	}
});
```

**Key Technical Findings:**
- Verifies source code of CSV export routes for `X-Content-Type-Options` and `nosniff`.
- Ensures static regression protection for both endpoints.

---

## 03. Vulnerability & Risk Assessment

| Risk Domain | Status | Technical Details & Findings |
|---|---|---|
| **MIME Sniffing (CWE-693)** | **Mitigated** | Recipe and report CSV export handlers explicitly set `X-Content-Type-Options: nosniff`, enforcing strict content-type compliance. |
| **Formula Injection (CWE-1236)** | **Protected** | CSV exports continue utilizing `sanitizeFormulaString()` from `$lib/reports` to prefix sensitive string cells with `'`. |
| **Static Linter Hardcoding** | **Open Backlog Item** | The test suite in `tests/export-nosniff-header.test.ts` uses a static hardcoded array of 2 routes instead of dynamically discovering all export endpoints in `src/routes/`. |

---

## 04. Test Coverage & Quality Verification

- **Codebase Invariants:**
  - `pnpm lint:no-comments` strictly maintained (0 inline comments added in `src/`).
  - `pnpm lint:tenant-scope` passes cleanly.
  - SvelteKit type checks (`pnpm check`) pass with 0 errors.

---

## 05. Actionable Backlog Items for Future Sessions

1. **Task 1: Dynamic Export Route Scanner in `tests/export-nosniff-header.test.ts`**
   - **Context:** The current test `tests/export-nosniff-header.test.ts` relies on a hardcoded list of 2 CSV files.
   - **Action:** Refactor `tests/export-nosniff-header.test.ts` using dynamic route walking (similar to `discoverExportRoutes()` in `tests/rate-limit-scope-enforcement.test.ts`) to automatically scan all server route handlers in `src/routes/` returning file downloads or `Content-Disposition` headers and assert `X-Content-Type-Options: nosniff`.
