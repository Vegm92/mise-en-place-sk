---
tags: [mep, audit, pr-review, batch-pr, security, architecture]
related: PR #1120, Issues #979, #1037, #1048, #1049, #1080, #1081, #1082, #1083, #1117, #782
---

# Post-Merge Review Report: PR #1120 (Batch Ten Issues)

**Reviewed PR:** #1120 (`Batch: ten agent-ready issues (#979, #1037, #1048, #1049, #1080, #1081, #1082, #1083, #1117, #782)`)
**Merge Commit:** `01ff699126960ea2e1e408cf12cbd1f729a96eff`
**Reviewer:** Master Closed PR Reviewer
**Audit Date:** 2026-09-19

---

## 01. Executive Summary

PR #1120 is a major batch pull request that addressed ten core architectural, security, and operational issues across the codebase.

The key accomplishments in PR #1120 include:
1. **Per-Request Policy Modularization (#1048):** Decoupled request policy execution (auth, rate limiting, feature gates, security headers) from `hooks.server.ts` into `src/lib/server/request-policy.ts` via `createAppHandle()`.
2. **Web/Worker Deploy Contract (#1049):** Implemented explicit `storageFingerprint` validation to verify storage driver and bucket consistency between web and background worker processes before processing extraction jobs.
3. **Safe SQL Row Parsing (#1082):** Replaced dangerous `as unknown as` type assertions on `db.execute()` output with runtime Valibot schema validation (`sqlRows`).
4. **WhatsApp & Inbound Security Hardening (#1083):** Keyed IP hashing with HMAC-SHA256, added length-guarded `timingSafeEqual` checks on `hub.verify_token`, and blocked XML DOCTYPE declarations in e-invoice parsing to prevent billion-laughs entity expansion attacks.
5. **Timezone Calendar Month Alignment (#1117):** Unified budget key lookups with `currentCalendarMonth` using `APP_TIMEZONE` rather than mixing UTC `monthKey` with local calendar dates.
6. **Payment Review States & KPI Pivot (#782):** Updated revenue and review state models, aligning mock KPI tile reads and status vocabulary across dashboard views.

This review evaluates the quality of changes, residual operational risks, and outlines concrete recommendations for future sessions.

---

## 02. Technical Analysis of Key Components

### 1. Request Policy Factory (`src/lib/server/request-policy.ts`, #1048)
- **Architecture:** Extracted inline `hooks.server.ts` handles into a deterministic sequence (`REQUEST_POLICY_STEPS`).
- **Benefit:** Allows unit-testing request handling logic in isolation without booting Sentry or a live database.
- **Observation:** `isBypassPath` correctly short-circuits static assets and public health endpoints prior to request context setup.

### 2. Storage Fingerprinting & Web/Worker Contract (`src/lib/server/env.ts`, #1049)
- **Architecture:** Stamps extraction jobs with `storageFingerprint` (`driver:bucket-or-path`).
- **Safety:** Worker checks fingerprint before claiming extraction allowances. Mismatched storage configs emit `markFailed(itemId, 'extract.err.storageMismatch', { field })` without exposing raw secrets.

### 3. Valibot Schema Parsing for SQL Rows (`src/lib/server/sql-rows.ts`, #1082)
- **Architecture:** `sqlRows(rows, schema)` parses database output through `v.parse(v.array(schema), rows)`.
- **Invariants:** Enforces type safety at database boundaries and reduces `SQL_ROW_CAST_BUDGET` across admin and health paths.

### 4. Security Controls (#1083)
- **HMAC Hashing:** Replaced unsalted SHA-256 IP digests with HMAC-SHA256 keyed by `AUTH_SECRET`, preventing rainbow table brute-forcing of IPv4 addresses.
- **Entity Expansion Protection:** Rejects e-invoices with `<!DOCTYPE` before XML parsing to neutralize billion-laughs denial-of-service vulnerabilities.
- **Timing Safe Equal:** Guarded buffer length comparisons before calling `crypto.timingSafeEqual` during webhook token verification.

### 5. Timezone Alignment (#1117)
- **Month Keys:** `src/lib/server/period-range.ts` provides `currentCalendarMonth` configured to `APP_TIMEZONE`. Ensures budget edits near midnight do not drift across UTC month boundaries.

---

## 03. Vulnerability & Risk Assessment

| Risk / Finding | Severity | Context | Recommendation |
|---|---|---|---|
| **HMAC Key Rotation Effect on Audit Logs** | Low | Rotating `AUTH_SECRET` invalidates legacy IP HMAC digests in audit logs. | Document `AUTH_SECRET` rotation impact in security operations docs. |
| **Worker Fingerprint Fallback for Legacy Jobs** | Low | Unfingerprinted jobs queued before #1049 bypass storage validation. | Monitor transition period until legacy queue items complete. |
| **Lint Ratchet Overhead** | Low | Invariant scripts track budgets (e.g. `SQL_ROW_CAST_BUDGET`). | Incrementally refactor remaining raw `db.execute` calls. |

---

## 04. Conclusion

PR #1120 significantly improves codebase maintainability, security posture, and runtime correctness. All new features are well-supported by Vitest test suites.
