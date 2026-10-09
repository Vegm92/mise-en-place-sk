---
tags: [mep, audit, pr-review, security, headers, export-security, nosniff, content-disposition]
related: PR sec-export-nosniff-header, Commit dd7ae22
---

# Post-Merge Review Report: Commit dd7ae22 / PR sec-export-nosniff-header (Attach X-Content-Type-Options nosniff to Data Export Responses)

**Reviewed PR:** `sec-export-nosniff-header` (`sec: attach X-Content-Type-Options nosniff to export responses`)
**Merge Commit:** `dd7ae22` (`657403e`)
**Branch:** `sec-export-nosniff-header-2249276495132488441`
**Reviewer:** Master Closed PR Reviewer
**Audit Date:** 2026-10-06

---

## 01. Executive Summary

Commit `dd7ae22` (PR `sec-export-nosniff-header`) addresses a security header gap across primary data export endpoints in the application.

Following the tenant authentication and rate-limiting audit in PR #1204 (`docs/08_audits/pr_1204_export_tenant_auth_review.md`), an actionable finding was identified: while media file downloads (`/api/upload/[id]/[file]`) attached `X-Content-Type-Options: nosniff`, primary data export endpoints (`/invoices/export/download` and `/api/user/export`) served file downloads (JSON, XLSX spreadsheets, and ZIP archives) without explicit `X-Content-Type-Options: nosniff` headers.

Without `X-Content-Type-Options: nosniff`, client web browsers may perform MIME-type sniffing (CWE-693) on downloaded files or binary attachments. If a user-influenced text or spreadsheet field contains HTML, JavaScript, or executable polyglots, browser MIME sniffing could potentially misinterpret the file type and execute scripts in the application's origin context.

Commit `dd7ae22` remediated this gap by enforcing explicit `'X-Content-Type-Options': 'nosniff'` headers across user account exports and invoice download endpoints, adding runtime unit test assertions, and introducing a static source-code analysis test in `tests/content-disposition.test.ts`.

This report provides a master architectural review of Commit `dd7ae22`, evaluating implementation correctness, security posture, test coverage, and residual backlog items for future engineering sessions.

---

## 02. Technical Analysis of Code Changes

### 1. Invoices Export Download Handler (`src/routes/(app)/invoices/export/download/+server.ts`)

```typescript
// ZIP Archive Response
return new Response(new Uint8Array(zipBuffer), {
    headers: {
        'Content-Type':           'application/zip',
        'X-Content-Type-Options': 'nosniff',
        'Content-Disposition':    contentDispositionHeader('attachment', 'facturas.zip'),
    },
});

// Excel Workbook Response
return new Response(workbookBuffer, {
    headers: {
        'Content-Type':           'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'X-Content-Type-Options': 'nosniff',
        'Content-Disposition':    contentDispositionHeader('attachment', 'invoices.xlsx'),
    },
});
```

**Key Improvements:**
- Attaches `'X-Content-Type-Options': 'nosniff'` to both `application/zip` and `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet` responses.
- Guarantees that browsers handle exported invoice bundles strictly as binary files or spreadsheets without attempting content-type guessing.

### 2. User Account Export Handler (`src/routes/api/user/export/+server.ts`)

```typescript
return new Response(JSON.stringify(export_data, null, 2), {
    headers: {
        'Content-Type':           'application/json',
        'X-Content-Type-Options': 'nosniff',
        'Content-Disposition':    contentDispositionHeader('attachment', `mise-en-place-data-${user.id}.json`),
    },
});
```

**Key Improvements:**
- Attaches `'X-Content-Type-Options': 'nosniff'` to JSON account export attachment responses (`application/json`).
- Prevents browsers from sniffing exported JSON payloads as HTML or execution scripts when opened directly in browser tabs.

### 3. Test Coverage Modifications

1. **`tests/account-export.test.ts`:**
   - Added `expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff')` assertion on the `GET /api/user/export` endpoint test.
2. **`tests/invoices-export-download.test.ts`:**
   - Added `expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff')` assertion on both XLSX workbook and ZIP package export download tests.
3. **`tests/content-disposition.test.ts`:**
   - Introduced new describe block `export endpoints nosniff headers static check`:
     ```typescript
     describe('export endpoints nosniff headers static check', () => {
         it('verifies export route handlers attach X-Content-Type-Options: nosniff header', () => {
             const routes = [
                 'src/routes/api/user/export/+server.ts',
                 'src/routes/(app)/invoices/export/download/+server.ts',
             ];

             for (const route of routes) {
                 const source = readFileSync(path.join(process.cwd(), route), 'utf8');
                 expect(source).toMatch(/['"]X-Content-Type-Options['"]\s*:\s*['"]nosniff['"]/i);
             }
         });
     });
     ```

---

## 03. Vulnerability & Security Assessment

| Risk Domain | Status | Technical Details & Findings |
|---|---|---|
| **MIME Sniffing (CWE-693)** | **Mitigated (Export Endpoints)** | User export and invoice download routes explicitly attach `X-Content-Type-Options: nosniff`, instructing browsers to respect declared `Content-Type`. |
| **Response Header Consistency** | **Partial Coverage** | While `/api/user/export` and `/invoices/export/download` were updated, an audit of `src/routes/` revealed that other file download endpoints setting `Content-Disposition` (such as CSV exports and inventory templates) do not yet set `nosniff`. |
| **Static Linter Hardcoding** | **Open Backlog Item** | The static check in `tests/content-disposition.test.ts` hardcodes a list of 2 routes (`/api/user/export` and `/invoices/export/download`). A dynamic route scanner is required to catch all routes that return `Content-Disposition` or download files. |

---

## 04. Test Coverage & Quality Verification

- **Automated Unit Tests:**
  - `pnpm test` executed with 100% success rate (172 test files passed, 2593 tests passed).
  - Explicit header assertions verified in `tests/account-export.test.ts`, `tests/invoices-export-download.test.ts`, and `tests/content-disposition.test.ts`.
- **Codebase Invariants:**
  - `pnpm check` passed with 0 errors and 0 warnings.
  - `pnpm lint:tenant-scope` passed with 0 violations.
  - `node scripts/check-no-comments.mjs` verified strict compliance with the no-comments policy inside `src/`.

---

## 05. Actionable Backlog Items for Future Sessions

1. **Task 1: Attach `X-Content-Type-Options: nosniff` to Remaining File Export and Download Routes**
   - **Context:** An audit of `src/routes/` identified four additional routes that set `Content-Disposition` attachments without explicit `X-Content-Type-Options: nosniff` headers:
     - `src/routes/(app)/products/inventory-template/+server.ts`
     - `src/routes/(app)/reports/[type]/csv/+server.ts`
     - `src/routes/(app)/analytics/extraction/csv/+server.ts`
     - `src/routes/(app)/recipes/[id]/csv/+server.ts`
   - **Action:** Update response header dictionaries in these 4 routes to include `'X-Content-Type-Options': 'nosniff'`.

2. **Task 2: Implement Dynamic Route Scanner Linter in `tests/content-disposition.test.ts`**
   - **Context:** The static check currently scans a hardcoded list of two files.
   - **Action:** Enhance `tests/content-disposition.test.ts` to scan all files in `src/routes/` matching `+server.ts` that contain `Content-Disposition` or return file downloads, dynamically verifying that every file-download route includes `'X-Content-Type-Options': 'nosniff'`.
