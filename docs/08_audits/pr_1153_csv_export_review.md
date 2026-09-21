---
tags: [mep, audit, pr-review, security, rate-limiting, exports]
related: PR #1153
---

# Post-Merge Review Report: PR #1153 (CSV/XLSX Export Tenant Rate Limiting)

**Reviewed PR:** #1153 (`Enforce tenant rate limiting on CSV export endpoints`)
**Merge Commit:** `b7352bed8b5d97c5cf4fee679a73c2e8a36d4205`
**Branch:** `Vegm92/security-rate-limit-csv-export-17567886342171325577`
**Reviewer:** Master Closed PR Reviewer
**Audit Date:** 2026-09-20

---

## 01. Executive Summary

PR #1153 enforces tenant-scoped rate limiting across all data export endpoints (CSV and XLSX downloads) within the application.

Data export routes generate intensive CPU, memory, and database work (building Excel workbooks with `ExcelJS`, generating CSV strings with `toCsv()`, or compressing multiple invoice source files into ZIP archives). Prior to PR #1153, unthrottled or inconsistent rate limiting on export endpoints allowed malicious or automated actors within a tenant to flood export routes, triggering memory spikes and database connection exhaustion.

PR #1153 systematically integrated `rateLimitScoped({ scope: 'tenant', name: '...' }, { restaurantId: rid })` across all export handlers:
1. **Recipe CSV Export (`/recipes/[id]/csv`):** Throttled with `name: 'recipe-csv-export'`, `max: 10`.
2. **Report CSV Export (`/reports/[type]/csv`):** Throttled with `name: 'report-export-csv'`, `max: 10`.
3. **Analytics Extraction CSV Export (`/analytics/extraction/csv`):** Throttled with `name: 'export'`, `max: 5`.
4. **Invoices Download/Export (`/invoices/export/download`):** Throttled with `name: 'export'`, `max: 5`.
5. **Inventory Template Export (`/products/inventory-template`):** Throttled with `name: 'inventory-template'`, `max: 10`.

This review evaluates the architectural design, safety guarantees, and residual operational risks introduced by PR #1153.

---

## 02. Technical Analysis of Code Changes

### 1. Tenant Rate Limiter Utility (`src/lib/server/rate-limit-scope.ts`)

```typescript
if (!(await rateLimitScoped({ scope: 'tenant', name: 'export', max: 5 }, { restaurantId: rid }))) {
    throw error(429, 'Too many requests — please wait a moment before trying again');
}
```

**Key Findings:**
- **Explicit Scope Declaration:** All export endpoints explicitly declare `scope: 'tenant'` alongside `restaurantId: rid`. This aligns with the architectural memory invariant enforced by `tests/rate-limit-scope-enforcement.test.ts`.
- **Fail-Closed Behavior:** `rateLimitScoped` delegates to Redis/In-Memory sliding window rate limiting. If limits are exceeded, a HTTP `429 Too Many Requests` error response is thrown immediately before executing heavy database queries or document generation logic.
- **Resource Protection:** Heavy operations like ZIP archive generation (`buildInvoiceExportZip`) and bulk database selects in `/invoices/export/download` are guarded prior to query execution.

### 2. Export Endpoint Enforcement Details

| Route Endpoint | Rate Limit Bucket Name | Max Requests | Window / Scope | Heaviest Guarded Operation |
|---|---|---|---|---|
| `/routes/(app)/recipes/[id]/csv` | `recipe-csv-export` | 10 | Tenant | `buildRecipeSheet` DB queries + CSV generation |
| `/routes/(app)/reports/[type]/csv` | `report-export-csv` | 10 | Tenant | `buildReport` analytics query aggregation |
| `/routes/(app)/analytics/extraction/csv` | `export` | 5 | Tenant | `extraction_corrections` SQL join (5,000 row cap) |
| `/routes/(app)/invoices/export/download` | `export` | 5 | Tenant | `ExcelJS` workbook build & optional `ZIP` packing |
| `/routes/(app)/products/inventory-template` | `inventory-template` | 10 | Tenant | `ExcelJS` inventory template workbook build |

---

## 03. Vulnerability & Risk Assessment

| Risk / Observation | Severity | Context | Mitigation / Recommendation |
|---|---|---|---|
| **Bucket Name Overlap (`export`)** | Low | `/analytics/extraction/csv` and `/invoices/export/download` share the rate limit bucket name `'export'`. | Requests to both endpoints share the 5 requests/window budget per tenant. This is desirable for overall export load protection, but bucket names could be distinct (e.g. `analytics-export` vs `invoices-export`) if independent limits are preferred. |
| **Formula Injection Defense in Exports** | Low | CSV/XLSX exports sanitize cell strings starting with `=+-\t\r` using `sanitizeFormulaString()`. | Retain `sanitizeFormulaString()` across all current and future spreadsheet generation routines. |
| **CSV/XLSX Streaming** | Low | ExcelJS and CSV exports generate complete buffers in memory before returning `Response`. | For large exports, memory usage is capped by `EXPORT_ROW_CAP` (5,000 rows). Tenant rate limiting guarantees single tenants cannot exhaust server memory through concurrent export calls. |

---

## 04. Test Coverage & Quality Assessment

- **Rate Limit Scope Enforcement:** `tests/rate-limit-scope-enforcement.test.ts` statically analyzes all server endpoints in `src/routes/` to ensure calls to `rateLimitScoped()` explicitly specify scope ('tenant' or 'user').
- **Linting & Code Standards:**
  - `pnpm lint:no-comments` enforced across `src/`.
  - `pnpm lint:tenant-scope` verifies tenant isolation on database queries.

---

## 05. Actionable Backlog Items for Future Sessions

1. **Task 1: Evaluate Unique Bucket Naming across Export Endpoints**
   - **Context:** Currently `/analytics/extraction/csv` and `/invoices/export/download` share the `'export'` bucket name.
   - **Action:** Assess if independent bucket names (`analytics-corrections-export` and `invoices-download-export`) are needed for granular tenant quotas.

2. **Task 2: Continuous Integration Test Expansion for Export Headers**
   - **Context:** Ensure future export handlers automatically include content-disposition and tenant rate limiting.
   - **Action:** Add invariant lint rule checking for `rateLimitScoped` presence in any server handler outputting `text/csv` or spreadsheet mime types.
