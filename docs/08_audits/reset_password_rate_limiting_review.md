---
tags: [mep, audit, pr-review, security, rate-limiting, password-reset, auth]
related: Commit d5d55a5, Branch fix/reset-password-rate-limiting
---

# Post-Merge Review Report: Commit d5d55a5 (Enforce Dual-Bucket Rate Limiting on Password Reset Endpoint)

**Reviewed Commit:** `d5d55a5752d08d521441b1aef5e170735b27fe2e`
**Branch:** `fix/reset-password-rate-limiting-7117238679152808316`
**Reviewer:** Master Closed PR Reviewer
**Audit Date:** 2026-09-29

---

## 01. Executive Summary

Commit `d5d55a5` resolves a security defense-in-depth gap in the password recovery flow by wrapping the default form action on `/reset-password` with `publicFormAction`.

Prior to this change, while `/forgot-password` applied IP and email rate limiting, `/reset-password` parsed form payloads directly via `parseForm` without evaluating rate limits. An attacker possessing or attempting to brute-force verification tokens could submit unlimited automated password reset requests against `/reset-password`, causing database update load and password hash computation overhead (`bcrypt.hash(password, 12)`).

Commit `d5d55a5` refactored `src/routes/reset-password/+page.server.ts` to utilize `publicFormAction` with a dual-bucket rate limit policy (`reset:ip:{ip}` max 5, `reset:email:{email}` max 5). It also updated `tests/password-recovery.test.ts` to verify IP and email rate limiting short-circuiting prior to token consumption or database mutation.

This report evaluates the technical implementation, security posture, test coverage, and residual recommendations.

---

## 02. Technical Analysis of Code Changes

### 1. Password Reset Action (`src/routes/reset-password/+page.server.ts`)

```typescript
export const actions: Actions = {
	default: publicFormAction(
		{
			rateLimitEvent: 'password_reset_rate_limited',
			limits: ({ form, ip }) => {
				const email = rawFormField(form, 'email', { lowercase: true });
				const rules = [{ key: `reset:ip:${ip}`, max: 5, scope: 'ip' }];
				if (email) rules.push({ key: `reset:email:${email}`, max: 5, scope: 'email' });
				return rules;
			},
			schema: ResetPasswordForm,
		},
		async ({ data, event, ipHash }) => {
			const email    = data.email ?? '';
			const token    = data.token ?? '';
			const password = data.password ?? '';
			const confirm  = data.confirm ?? '';

			if (!email || !token) return fail(400, { error: 'expired' });
			const policyError = passwordPolicyError(password);
			if (policyError) return fail(422, { error: policyError });
			if (password !== confirm) return fail(422, { error: 'mismatch' });

			const valid = await consumeVerificationToken(`reset-password:${email}`, token);
			if (!valid) return fail(400, { error: 'expired' });

			const passwordHash = await bcrypt.hash(password, 12);
			const [user] = await db.update(users)
				.set({ passwordHash, tokenVersion: sql`${users.tokenVersion} + 1` })
				.where(eq(users.email, email))
				.returning();
			if (!user) return fail(400, { error: 'failed' });

			logAuthEvent('password_reset_completed', { ipHash });

			event.cookies.delete('authjs.session-token', { path: '/' });
			event.cookies.delete('__Secure-authjs.session-token', { path: '/' });

			redirect(303, '/login?reset=1');
		},
	),
};
```

**Key Architectural & Security Design Strengths:**
- **Centralized Public Form Action Pipeline:** Replaced custom `parseForm` call with `publicFormAction` standard wrapper, ensuring IP extraction, rate limiting, Valibot schema parsing, and security event audit logging are handled uniformly.
- **Dual-Bucket Isolation:** Applies two distinct rate-limit rules:
  1. `reset:ip:${ip}` (max 5 requests per IP window).
  2. `reset:email:${email}` (max 5 requests per email window).
- **Short-Circuit Protection:** Evaluates rate limits *before* calling `consumeVerificationToken` or computing CPU-heavy `bcrypt.hash(password, 12)`.
- **Security Audit Telemetry:** Emits `password_reset_rate_limited` event with hashed IP when limits are exceeded.

### 2. Operational & Security Policy Comparison

| Security Aspect | Before Commit `d5d55a5` | After Commit `d5d55a5` | Security Impact |
|---|---|---|---|
| Rate Limiting Wrapper | Manual `parseForm` without rate limiting | Standard `publicFormAction` wrapper | Enforces IP and Email rate limits |
| IP Rate Limit Bucket | None | `reset:ip:${ip}` (max 5) | Thwart automated brute-force attempts from single IP |
| Email Rate Limit Bucket | None | `reset:email:${email}` (max 5) | Prevents distributed attacks targeting specific account |
| File Payload Handling Test | Retried as 400 'expired' | Handled clean 422 'invalid' via Valibot schema | Robust input validation against malformed form posts |

---

## 03. Vulnerability & Risk Assessment

| Risk / Directive | Severity | Status | Technical Context |
|---|---|---|---|
| **Brute-Force & Token Enumeration (CWE-307)** | High | **Mitigated** | Prevents rapid-fire requests attempting to guess password reset verification tokens or strain password hashing CPU resources. |
| **Credential & Account Abuse** | Medium | **Mitigated** | Dual rate limit buckets isolate abusive clients per IP and per target email address. |
| **Session Invalidation Invariant** | Low | **Pass** | Increments `tokenVersion: sql\`${users.tokenVersion} + 1\`` and deletes session cookies upon successful password reset, invalidating existing sessions. |

---

## 04. Test Coverage & Code Quality Verification

- **Automated Unit Tests (`tests/password-recovery.test.ts`):**
  - Added test case verifying IP-level rate limiting short-circuits token verification and logs `password_reset_rate_limited`.
  - Added test case verifying email-level rate limiting triggers once IP bucket has capacity.
  - Verified clean handling of malformed file inputs (`invalid` error 422).
- **Codebase Invariants:**
  - `pnpm lint:no-comments` is strictly respected inside `src/`.
  - Public unauthenticated form action compliance matches codebase conventions (`$lib/server/public-form-action`).

---

## 05. Actionable Backlog Items for Future Sessions

1. **Task 1: Static Linter for Unauthenticated Form Actions**
   - **Context:** Unauthenticated POST form actions handling sensitive operations (such as login, signup, recovery, reset) must consistently use `publicFormAction`.
   - **Action:** Extend static linters in `scripts/lint-invariants.mjs` to verify all unauthenticated server actions in public routes use `publicFormAction`.

2. **Task 2: Audit Public Form Action Rate Limit Buckets**
   - **Context:** Distinct public endpoints use distinct key prefixes (`recover:ip:`, `reset:ip:`, `signup:ip:`).
   - **Action:** Audit all public form action routes to ensure key names avoid collision and limits match security requirements.
