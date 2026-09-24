# GitHub Issue: Post-PR #1158 Master PR Review & Operational Hardening Report

## Overview & Scope
This report serves as the master post-PR review for **PR #1158** (`Security Audit: Enforce strict positive integer validation on route parameters`).

The purpose of PR #1158 was to eliminate unhandled PostgreSQL integer-cast errors (HTTP 500 status codes) when non-integer, negative, zero, or malformed parameters were passed to entity routes such as `/invoice/[id]`, `/products/[id]`, `/suppliers/[id]`, `/recipes/[id]`, and `/reminders`.

PR #1158 introduced `$lib/server/route-params.ts` with helper `requirePositiveIntId(raw: string, label: string)` and applied it across all target route loaders, form actions, and file GET handlers, rejecting invalid inputs with clean HTTP 400 Bad Request errors before database queries or form data processing execute.

This issue report documents technical findings, risk evaluations, acceptance criteria, and actionable tasks for the next engineering session.

---

## Technical Analysis of PR #1158 Changes

### 1. Reusable Parameter Guard (`$lib/server/route-params.ts`)
- **Finding:** `requirePositiveIntId(raw, label)` parses `Number(raw)`, validates `Number.isInteger(id)` and `id > 0`.
- **Impact:** Throws SvelteKit `error(400, "Invalid ${label} id")` immediately upon detecting non-integer, non-positive, `NaN`, or string-injected route parameters.

### 2. Route Guarding Coverage
- **Guarded Endpoints:**
  - `/products/[id]` (`load`, `update`, `unlinkSupplier`, `delete`)
  - `/suppliers/[id]` (`load`, `update`, `addConversion`, `deleteConversion`, `delete`)
  - `/recipes/[id]` (`load`, `update`, `delete`, actions)
  - `/recipes/[id]/cocina` (`load`)
  - `/recipes/[id]/sheet` (`load`)
  - `/recipes/[id]/csv` (`GET`)
  - `/invoice/[id]` (`load`, `relinkProducts`, `delete`)
  - `/invoice/[id]/edit` (`load`, `save`)
  - `/invoice/[id]/file` (`GET`)
  - `/reminders` (`action`)
- **Impact:** SQL query execution and database driver calls are completely bypassed on malformed inputs, protecting application logs and database connection pools.

### 3. Regression Testing (`tests/542-malformed-route-params.test.ts`)
- **Finding:** 95 test cases mock DB calls and test malformed ID strings (`11111111...`, `not-a-uuid`, `1' OR '1'='1`, `0`, `-1`) as well as valid IDs across all target routes.
- **Impact:** Guarantees zero regression and confirms `/batch/[id]` routes gracefully handle non-UUID inputs via redirect guards.

---

## Goals & Acceptance Criteria for Next Session

### Goal
Implement automated static analysis to enforce route parameter validation across all parameterized server routes and verify integer fields extracted in form actions.

### Acceptance Criteria
- [ ] **Automated Route Parameter Invariant Linter (`tests/route-params-enforcement.test.ts`):**
  - Add static analysis test checking that any server route handler file under `src/routes/**/[id]/` explicitly uses `requirePositiveIntId` or UUID regex validation.
- [ ] **Form Action Integer Field Audit:**
  - Audit form actions in `src/routes/` receiving entity IDs from `FormData` (e.g. `invoiceId`, `supplierId`, `productId`) to verify `requirePositiveIntId` or positive integer coercion is enforced.
- [ ] **Codebase Invariant & Verification Suite:**
  - Verify that `pnpm check`, `pnpm lint:no-comments`, and `pnpm test` pass with 100% success.

---

## Plan of Work for Next Engineering Session

1. **Implement Route Parameter Invariant Linter**
   - Create static test scanning `src/routes/` server files to verify parameter validation guards on `[id]` parameters.

2. **Audit Action Form Data Parsing**
   - Inspect form actions extracting numeric IDs from `FormData` and apply `requirePositiveIntId` where appropriate.

3. **Verify Documentation & Linters**
   - Ensure architectural notes in `docs/` remain synchronized and run `pnpm lint:no-comments` and `pnpm check`.
