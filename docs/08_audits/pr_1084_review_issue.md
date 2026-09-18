# GitHub Issue: Post-PR #1084 Master PR Review & Operational Hardening Report

## Overview & Scope
This report serves as the master post-PR review for **PR #1084** (`fix(health): survive an addressless liveness probe and log failed probes`, issue #1067).

The purpose of PR #1084 was to resolve runtime 500 errors occurring when Railway / cloud container orchestrator liveness probes (lacking an `x-forwarded-for` header) hit `/api/health`. SvelteKit's `getClientAddress()` threw an exception when `ADDRESS_HEADER` was configured, which previously crashed the endpoint before the rate-limiter or health check ran.

While PR #1084 introduced a `try...catch` around `getClientAddress()` and added warnings for failed sub-probes in `computeHealthDetail()`, an architectural review of the merged changes revealed critical edge cases and hardening opportunities for the next engineering session.

---

## Technical Analysis of PR #1084 Changes

### 1. `src/routes/api/health/+server.ts`
```typescript
export const GET: RequestHandler = async ({ request, locals, getClientAddress }) => {
	let ip = 'unknown';
	try {
		ip = getClientAddress();
	} catch (e) {
		log.debug('client address unavailable', { err: e });
	}
	if (!(await checkRateLimit(`health:${ip}`, HEALTH_RATE_LIMIT_RPM))) {
		return json({ error: 'Too many requests' }, { status: 429, headers: { 'Retry-After': '60' } });
	}
```
- **Finding:** Falling back to `ip = 'unknown'` groups all addressless incoming requests into a single rate-limiting bucket (`health:unknown`).
- **Risk:** High-frequency internal liveness probes (e.g. Railway/K8s checking every 10–15 seconds = 240–360 requests/minute) will exhaust the shared `HEALTH_RATE_LIMIT_RPM` limit (default 60 RPM). This will trigger HTTP 429 throttling on platform probes, falsely failing health checks and causing container restart loops.

### 2. Error Logging in `computeHealthDetail()`
```typescript
	try {
		// sub-probe logic
	} catch (e) {
		log.warn('health probe failed', { probe: 'db', err: e });
	}
```
- **Finding:** Logging raw error objects `{ err: e }` passes full exception details to the logger.
- **Risk:** Database connection errors, network failures, or driver exceptions can contain sensitive database connection strings, credentials, or internal topology details. Log streams or Sentry error reports may leak secrets or saturate log budgets.

### 3. Database Query Load on Unauthenticated Hits
```typescript
	if (!wantsDetail) {
		const dbReachable = await isDbReachable();
		return json(
			{ status: dbReachable ? 'ok' as const : 'degraded' as const },
			{ status: dbReachable ? 200 : 503 },
		);
	}
```
- **Finding:** Unauthenticated health checks perform a `SELECT 1` DB query (`isDbReachable()`) on every request.
- **Risk:** High-frequency external/internal polling during DB connection pool congestion can worsen DB pool starvation. A brief 1–2 second in-memory cache or debounced DB reachability check would protect Postgres pool exhaustion.

### 4. Codebase & Documentation Invariants
- **Finding:** Code comments in `src/` are enforced to be empty by `pnpm lint:no-comments`.
- **Requirement:** Architectural rationale for addressless probe fallback, rate-limit isolation, and `X-Health-Token` authorization MUST be documented in `docs/04_engineering/app_shell.md` under `## Code notes` rather than in inline code comments.

---

## Goals & Acceptance Criteria for Next Session

### Goal
Harden `/api/health` and probe mechanisms against rate-limit starvation for platform probes, sanitize error log payloads, optimize DB probe load, and document health architecture per codebase invariants.

### Acceptance Criteria
- [ ] **Dedicated Rate Limiting / Bypass for Platform Probes:**
  - Addressless internal probes or requests supplying a valid `X-Health-Token` must not be starved by public rate-limiting buckets (`health:unknown`).
  - Public unauthenticated requests without a token remain strictly rate-limited per IP.
- [ ] **Error Log Sanitization:**
  - All catch blocks in `computeHealthDetail()` sanitize error objects (e.g., logging `e instanceof Error ? e.message : String(e)`) to prevent sensitive data leakage.
- [ ] **Targeted Unit Tests (`tests/api-health.test.ts`):**
  - Verify addressless platform probes carrying `X-Health-Token` or running at high frequency do not receive 429 status codes.
  - Verify error logging outputs clean, sanitized string messages on probe failures.
- [ ] **Documentation Update (`docs/04_engineering/app_shell.md`):**
  - Document `/api/health` rate-limiting strategy, addressless fallback handling, and secret sanitization in `docs/04_engineering/app_shell.md` under `## Code notes`.

---

## Plan of Work for Next Engineering Session

1. **Refactor Rate-Limiting Logic (`src/routes/api/health/+server.ts`)**
   - Check authorization / health token or differentiate platform probes before invoking `checkRateLimit`.
   - Ensure requests with a valid `X-Health-Token` or internal liveness checks bypass public IP throttling or use a dedicated bucket.

2. **Sanitize Log Error Details (`src/routes/api/health/+server.ts`)**
   - Refactor `catch (e)` blocks across sub-probes (`db`, `queue`, `worker-heartbeat`, `sessions`, `uploads-writable`, `uploads-free-space`) to extract `err: e instanceof Error ? e.message : String(e)`.

3. **Expand Health Test Coverage (`tests/api-health.test.ts`)**
   - Add test case verifying high-frequency probe isolation does not yield HTTP 429 for addressless health probes.
   - Add test case verifying error logger receives sanitized error strings when `isDbReachable()` or `computeHealthDetail()` fails.

4. **Update Engineering Documentation (`docs/04_engineering/app_shell.md`)**
   - Append code notes covering `/api/health` rate-limiting buckets, `X-Health-Token` privilege escalation, and addressless probe resilience.
