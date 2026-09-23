# GitHub Issue: Post-PR #1158 Master PR Review & Operational Hardening Report

## Overview & Scope
This report serves as the master post-PR review for **PR #1158** (`Security Audit: Enforce strict positive integer validation on route parameters`).

The purpose of PR #1158 was to eliminate unhandled database casting errors (`HTTP 500 Internal Server Error`) caused by malformed or non-integer route parameters across entity detail views and form actions (`/invoice/[id]`, `/products/[id]`, `/suppliers/[id]`, `/recipes/[id]`, `/reminders`).

Prior to PR #1158, route handlers executed `Number(params.id)` without prior validation, causing non-numeric strings, SQL injection probes, or non-positive values to trigger unhandled Postgres driver integer-cast errors. PR #1158 established `$lib/server/route-params.ts` (`requirePositiveIntId`) to fail-fast with clean `HTTP 400 Bad Request` responses before querying the database.

This issue report documents the technical findings, risk evaluations, acceptance criteria, and actionable tasks for the next engineering session.

---

## Technical Analysis of PR #1158 Changes

### 1. Guarded Routes & Operations
- **`/invoice/[id]`**: Load, `relinkProducts`, `delete` form actions.
- **`/invoice/[id]/edit`**: Load, `save` form action.
- **`/invoice/[id]/file`**: `GET` file stream endpoint.
- **`/products/[id]`**: Load, `update`, `unlinkSupplier`, `delete` form actions.
- **`/suppliers/[id]`**: Load, `update`, `addConversion`, `deleteConversion`, `delete` form actions.
- **`/recipes/[id]`**: Load and recipe management form actions.
- **`/recipes/[id]/cocina`**, **`/recipes/[id]/sheet`**, **`/recipes/[id]/csv`**: Loaders and CSV export.
- **`/reminders`**: `sendReminder` form action (`invoiceId` body parameter).

### 2. Validation Mechanism (`requirePositiveIntId`)
- **Finding:** Enforces `Number.isInteger(id) && id > 0`.
- **Impact:** Throws `error(400, "Invalid <label> id")` before executing database queries or ORM functions, protecting Sentry logs from noise and blocking malformed parameter payloads.

---

## Goals & Acceptance Criteria for Next Session

### Goal
Implement automated static analysis to enforce route parameter validation across new `[id]` routes, audit form action body parsing for unvalidated integer IDs, and maintain codebase documentation invariants.

### Acceptance Criteria
- [ ] **Automated Dynamic Route Parameter Linter / Test:**
  - Add a static analysis test (e.g. `tests/route-params-enforcement.test.ts`) that inspects all `src/routes/**/[id]/+page.server.ts` files and verifies `requirePositiveIntId` is invoked on `params.id`.
- [ ] **Form Action Integer Parsing Audit:**
  - Audit form actions in `src/routes/(app)` that parse entity IDs from `formData.get('...')` to ensure they use `requirePositiveIntId` or strict schema parsing instead of raw coercion.
- [ ] **Codebase Invariant & Verification Suite:**
  - Verify that `pnpm check`, `pnpm lint:no-comments`, and `pnpm test` pass with 100% success.

---

## Plan of Work for Next Engineering Session

1. **Implement Route Parameter Linter Test**
   - Create static test verifying that any server route file containing `[id]` in its path imports and executes `requirePositiveIntId`.

2. **Audit Form Action Body Parameters**
   - Inspect form actions handling `supplierId`, `categoryId`, or `recipeId` in POST requests to enforce standard integer validation helpers.

3. **Verify Linters & Architectural Records**
   - Ensure `docs/` architectural records reflect route parameter guidelines and run `pnpm lint:no-comments`.
