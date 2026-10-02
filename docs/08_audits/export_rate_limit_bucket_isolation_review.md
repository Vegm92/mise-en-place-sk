---
tags: [mep, audit, pr-review, security, rate-limiting, bucket-isolation, export-endpoints]
related: Commit 9116e1a
---

# Post-Merge Review Report: Commit 9116e1a (Isolate Tenant Rate Limit Buckets for Export Endpoints)

**Reviewed Commit:** `9116e1a3908bd031fc8a86acb63882d6002c0622` (`fix(rate-limit): isolate tenant rate limit buckets for export endpoints`)
**Branch:** `fix/export-rate-limit-bucket-isolation-17945100498654748275`
**Reviewer:** Master Closed PR Reviewer
**Audit Date:** 2026-09-28

---

## 01. Executive Summary

Commit `9116e1a` resolves a rate-limiting isolation issue across data export endpoints in the application.

Prior to commit `9116e1a`, both the analytics extraction CSV endpoint (`/analytics/extraction/csv`) and the invoices batch export endpoint (`/invoices/export/download`) shared a generic rate limit bucket name (`'export'`). Consequently, heavy usage or burst exports in one feature (e.g., exporting extraction corrections CSV) consumed the tenant's rate limit quota for invoice package downloads, leading to cross-feature request throttling and suboptimal tenant experience.

Commit `9116e1a` remediated this by assigning distinct, feature-specific rate limit bucket names:
1. **Analytics Extraction CSV Export (`/analytics/extraction/csv`):** Updated bucket name to `'analytics-extraction-csv'`.
2. **Invoices Download/Export (`/invoices/export/download`):** Updated bucket name to `'invoices-export-download'`.
3. **Static Enforcement Test Suite (`tests/rate-limit-scope-enforcement.test.ts`):** Extended static analysis test suite to enforce that all export endpoints call `rateLimitScoped` with unique bucket names across the entire application.

This review evaluates the technical implementation, security and rate-limiting posture, test coverage, and residual backlog items following the merge of commit `9116e1a`.

---

## 02. Technical Analysis of Code Changes

### 1. Route Handler Updates

#### `/analytics/extraction/csv/+server.ts`
```typescript
if (
    !(await rateLimitScoped(
        { scope: 'tenant', name: 'analytics-extraction-csv', max: 5 },
        { restaurantId: rid },
    ))
) {
    throw error(429, 'Too many requests — please wait a moment before trying again');
}
```

#### `/invoices/export/download/+server.ts`
```typescript
if (
    !(await rateLimitScoped(
        { scope: 'tenant', name: 'invoices-export-download', max: 5 },
        { restaurantId: rid },
    ))
) {
    throw error(429, 'Too many requests — please wait a moment before trying again');
}
```

### 2. Static Analysis Test Enforcement (`tests/rate-limit-scope-enforcement.test.ts`)

```typescript
it('export endpoints call rateLimitScoped with unique bucket names for isolated tenant quotas', () => {
    const exportEndpoints = [
        'src/routes/(app)/analytics/extraction/csv/+server.ts',
        'src/routes/(app)/invoices/export/download/+server.ts',
        'src/routes/(app)/reports/[type]/csv/+server.ts',
        'src/routes/(app)/recipes/[id]/csv/+server.ts',
        'src/routes/(app)/products/inventory-template/+server.ts',
        'src/routes/api/user/export/+server.ts',
    ];

    const bucketNames: string[] = [];

    for (const relFile of exportEndpoints) {
        const src = fs.readFileSync(path.join(process.cwd(), relFile), 'utf8');
        expect(src, `${relFile} must use rateLimitScoped`).toMatch(/rateLimitScoped/);
        const nameMatch = src.match(/name:\s*'([^']+)'/);
        expect(nameMatch, `${relFile} must define a name in rateLimitScoped`).not.toBeNull();
        if (nameMatch && nameMatch[1]) {
            bucketNames.push(nameMatch[1]);
        }
    }

    const uniqueBuckets = new Set(bucketNames);
    expect(uniqueBuckets.size).toBe(exportEndpoints.length);
});
```

### 3. Application Export Bucket Matrix

| Export Endpoint | Scope | Bucket Name | Window / Cap | Purpose |
|---|---|---|---|---|
| `/analytics/extraction/csv` | Tenant | `analytics-extraction-csv` | 5 / Window | Extraction corrections CSV export |
| `/invoices/export/download` | Tenant | `invoices-export-download` | 5 / Window | Invoice Excel/ZIP package export |
| `/reports/[type]/csv` | Tenant | `report-export-csv` | 10 / Window | Reports analytics CSV export |
| `/recipes/[id]/csv` | Tenant | `recipe-csv-export` | 10 / Window | Recipe cost sheet CSV export |
| `/products/inventory-template` | Tenant | `inventory-template` | 10 / Window | Inventory template Excel export |
| `/api/user/export` | User | `user-export` | 2 / Window | GDPR user account data export |

---

## 03. Vulnerability & Risk Assessment

| Risk / Observation | Severity | Status | Technical Details |
|---|---|---|---|
| **Cross-Feature Quota Starvation** | Medium | **Mitigated** | Shared bucket key `'export'` previously allowed heavy usage on extraction CSV exports to lock out invoice ZIP exports for the same tenant. Isolated bucket names prevent cross-feature quota exhaustion. |
| **Silent Bucket Name Collisions** | Low | **Mitigated** | Static analysis test in `tests/rate-limit-scope-enforcement.test.ts` scans all export endpoints and verifies `uniqueBuckets.size === exportEndpoints.length`, guarding against future bucket name duplication regressions. |
| **New Export Route Discovery Gap** | Low | **Open Backlog** | The `exportEndpoints` list in `tests/rate-limit-scope-enforcement.test.ts` is explicitly enumerated. Dynamically detecting export routes (e.g. matching `/csv/` or `export` in path) will prevent unlisted new export endpoints from slipping through. |

---

## 04. Test Coverage & Quality Verification

- **Automated Test Coverage (`tests/rate-limit-scope-enforcement.test.ts`):**
  - Verified 100% pass rate on `tests/rate-limit-scope-enforcement.test.ts`.
  - Confirmed strict bucket uniqueness check across all 6 data export endpoints.
- **Codebase Invariants:**
  - `pnpm check` passes with 0 errors and 0 warnings.
  - `pnpm lint:no-comments` is preserved across modified source files.

---

## 05. Actionable Backlog Items for Future Sessions

1. **Task 1: Dynamic Export Route Scanner in Rate Limit Invariant Linter**
   - **Context:** The export endpoints list in `tests/rate-limit-scope-enforcement.test.ts` uses a hardcoded string array.
   - **Action:** Enhance `tests/rate-limit-scope-enforcement.test.ts` to scan `src/routes` dynamically for any route containing `csv`, `export`, or returning `application/vnd.openxmlformats-officedocument` to ensure automatic bucket name uniqueness checks.

2. **Task 2: Audit Rate-Limiting Error Responses Across Form Actions**
   - **Context:** Server endpoints throw `error(429, ...)` when rate-limited.
   - **Action:** Audit client-side toast notifications and error handling on export UI buttons to ensure HTTP 429 status codes present localized, user-friendly retry banners.
