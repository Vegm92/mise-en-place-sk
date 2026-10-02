# GitHub Issue: Post-Commit d5d55a5 Master PR Review & Operational Hardening Report

## Overview & Scope
This report serves as the master post-commit review for **Commit `d5d55a5`** (`sec: enforce rate limiting on password reset endpoint` / branch `fix/reset-password-rate-limiting-7117238679152808316`).

The purpose of commit `d5d55a5` was to wrap the default form action on `/reset-password` (`src/routes/reset-password/+page.server.ts`) with `publicFormAction` to enforce IP and email rate limiting during password recovery reset requests.

Prior to commit `d5d55a5`, `/reset-password` relied on manual `parseForm` without evaluating rate limits, exposing the endpoint to potential brute-force automated token guessing and password hash calculation resource exhaustion (`bcrypt.hash`).

Commit `d5d55a5` standardized `/reset-password` using `publicFormAction`, configuring dual rate limit buckets (`reset:ip:{ip}` and `reset:email:{email}` max 5 requests per window) and logging `password_reset_rate_limited` auth events.

This issue report documents technical findings, risk evaluations, acceptance criteria, and actionable tasks for the next engineering session.

---

## Technical Analysis of Changes (Commit `d5d55a5`)

### 1. Guarded Reset Password Action (`src/routes/reset-password/+page.server.ts`)
- **Public Form Action Pipeline:** Refactored action to use `publicFormAction({ rateLimitEvent: 'password_reset_rate_limited', limits: ..., schema: ResetPasswordForm }, handler)`.
- **Dual Rate Limiting Buckets:** Evaluates `reset:ip:${ip}` (max 5) and optional `reset:email:${email}` (max 5) prior to parsing or token consumption.
- **Session Revocation:** Increments user `tokenVersion` and clears `authjs.session-token` & `__Secure-authjs.session-token` cookies upon successful reset.

### 2. Automated Test Coverage (`tests/password-recovery.test.ts`)
- Added tests for IP-based rate limiting short-circuiting.
- Added tests for email-based rate limiting when IP bucket has capacity.
- Verified clean 422 `invalid` response on malformed file inputs.

---

## Goals & Acceptance Criteria for Next Session

### Goal
Implement static invariant linting for unauthenticated public form actions and audit public rate limit bucket key isolation across public routes.

### Acceptance Criteria
- [ ] **Static Invariant Linter for Public Form Actions:**
  - Add invariant linter rule in `scripts/lint-invariants.mjs` (or static analysis test in `tests/rate-limit-scope-enforcement.test.ts`) ensuring all POST actions in unauthenticated public routes (`/login`, `/signup`, `/forgot-password`, `/reset-password`) are wrapped with `publicFormAction`.
- [ ] **Public Rate Limit Bucket Audit:**
  - Audit all `publicFormAction` usage across public endpoints to verify distinct rate limit bucket key prefixes (`signup:ip:`, `login:ip:`, `recover:ip:`, `reset:ip:`) and consistent scope enforcement.
- [ ] **Codebase Invariants & Verification:**
  - Ensure `pnpm check`, `pnpm lint:no-comments`, `pnpm lint:tenant-scope`, and `pnpm test` pass with 100% success rate.

---

## Plan of Work for Next Engineering Session

1. **Add Static Invariant Linter Rule for `publicFormAction`**
   - Extend `scripts/lint-invariants.mjs` or `tests/rate-limit-scope-enforcement.test.ts` to detect unwrapped public form actions.

2. **Audit Public Endpoint Bucket Key Isolation**
   - Review rate limit key naming conventions across public routes.

3. **Verify Codebase Linters & Test Suite**
   - Execute `pnpm check`, `pnpm lint:no-comments`, and `pnpm test` to confirm codebase health.
