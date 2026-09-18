---
tags: [mep, audit, pr-review, health-probe, security]
related: PR #1084, Issue #1067
---

# Post-Merge Review Report: PR #1084 (Health Probe Fix)

**Reviewed PR:** #1084 (`fix(health): survive an addressless liveness probe and log failed probes`)
**Addressed Issue:** #1067
**Merge Commit:** `97290e99dea845dee5e367b4a992ae43e4ee65a2`
**Reviewer:** Master Closed PR Reviewer
**Audit Date:** 2026-09-17

---

## 01. Executive Summary

PR #1084 resolves a critical liveness probe failure mode where platform infrastructure checks (such as Railway or Kubernetes internal HTTP liveness probes) failed or threw errors because no `x-forwarded-for` header was present. Prior to this fix, calling `getClientAddress()` without the configured address header caused SvelteKit to throw, leading to unhandled 500 errors or crashed liveness probes.

The PR successfully:
1. Wraps `getClientAddress()` in a `try...catch` block, falling back to IP `'unknown'` and keying rate limits to `health:unknown`.
2. Adds explicit structured logging (`log.warn`) for failed sub-probes (database, pgboss queue, worker heartbeat, active session counts, and upload directory checks).
3. Maintains the security posture introduced in Issue #491 (public endpoint returns light status `{ status: 'ok' | 'degraded' }`, while detailed diagnostic health metrics require admin authentication or a valid `X-Health-Token`).
4. Adds comprehensive unit tests in `tests/api-health.test.ts` covering addressless probes, error logging, and rate-limit fallbacks.

This report summarizes the PR changes, evaluates residual risks, and outlines concrete follow-up items for the next development session.

---

## 02. PR Overview & Context

- **Problem Statement (Issue #1067):** When deployed on platforms using reverse proxies or container health checks (e.g. Railway internal health checks), probes may target port 3000 directly without passing `x-forwarded-for` headers. When SvelteKit is configured with `ADDRESS_HEADER=x-forwarded-for`, calling `getClientAddress()` on an addressless request throws an error (`Address header was specified... but is absent`). This caused `/api/health` to return a 500 status code, triggering false-positive container restarts. Furthermore, failures in background diagnostic checks during detailed health computation were swallowed without log visibility.
- **Solution Implemented in PR #1084:**
  - Standardized client address extraction with `try...catch` and fallback to `'unknown'`.
  - Added warning logs on diagnostic failures inside `computeHealthDetail()`.
  - Added unit test cases for addressless probes in `tests/api-health.test.ts`.

---

## 03. Technical Analysis of Code Changes

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
    ...
```

**Key Findings:**
- **Graceful IP Fallback:** Catching exceptions from `getClientAddress()` ensures unauthenticated internal probes never fail with an uncaught exception.
- **Diagnostic Sub-Probe Warnings:** Failures in `isDbReachable()`, DB size queries, pgboss job queue queries, worker heartbeat reads, session counting, and upload directory checks now emit structured logs via `log.warn('health probe failed', { probe: '...', err: e })`.
- **Information Disclosure Prevention:** Unauthenticated requests receive minimal payload (`{ "status": "ok" }` or `{ "status": "degraded" }` with 503 HTTP status). Detailed system metrics (DB size, worker queue depth, semaphore status, active session count) remain restricted to admin users or requests bearing `X-Health-Token`.

---

## 04. Vulnerability & Risk Assessment

| Risk / Observation | Severity | Description | Mitigation / Recommendation |
|---|---|---|---|
| **Shared Rate-Limit Bucket (`health:unknown`)** | Low / Medium | All addressless requests share a single rate-limit bucket (`health:unknown` with `HEALTH_RATE_LIMIT_RPM=60`). A high-frequency internal platform probe or an internal attacker sending addressless HTTP requests could exhaust the bucket for legitimate internal probes. | Consider bypassing rate limiting or assigning dedicated capacity for requests carrying a valid `X-Health-Token` or internal subnet headers. |
| **Blocking DB Latency on Liveness** | Medium | The public status check runs `isDbReachable()` (`SELECT 1`). If Postgres experiences severe lock contention or connection pool exhaustion without timing out quickly, the health endpoint may hang and cause probe timeouts. | Enforce a strict timeout (e.g. 2000ms) on `isDbReachable()` to return 503 degraded promptly rather than hanging. |
| **Constant-Time Health Token Comparison** | Low (Mitigated) | `hasValidHealthToken` uses `crypto.timingSafeEqual` after comparing buffer lengths, preventing timing attacks on health token verification. | Properly implemented. |

---

## 05. Test Coverage & Quality Assessment

- **TestSuite:** `tests/api-health.test.ts`
- **Coverage Highlights:**
  - `healthy DB: response is exactly { status: "ok" }, HTTP 200`
  - `unreachable DB: response is exactly { status: "degraded" }, HTTP 503`
  - `detailed health requires admin auth or a token`
  - `keys the limit by client IP and rejects with 429 once exhausted`
  - `#1067 — still answers 200 when getClientAddress() throws`
  - `#1067 — throttles the addressless probe under a shared key instead of crashing`
  - `#1067 — records why a probe failed instead of swallowing it`

All tests pass deterministically and mock external DB dependencies cleanly.

---

## 06. Actionable Backlog Items for the Next Session

The next engineering session should address the following improvements:

1. **Task 1: Add Strict Timeout to Health Probe DB Execution**
   - **Context:** If PostgreSQL hangs or pool connections are exhausted, `SELECT 1` in `isDbReachable()` can block the HTTP response, causing the platform liveness probe to time out externally.
   - **Action:** Wrap `db.execute(sql\`SELECT 1\`)` in a fast timeout wrapper (e.g. `withTimeout(..., 2000)`). If it times out, treat DB as unreachable and return status 503 immediately.

2. **Task 2: Exempt Token-Authenticated or Loopback Health Probes from Global `health:unknown` Rate Limit**
   - **Context:** High-frequency platform probes without client IP headers share `health:unknown`, which can trigger HTTP 429 if `HEALTH_RATE_LIMIT_RPM` is set low.
   - **Action:** If `hasValidHealthToken(request)` is true or if caller is explicitly identified as an internal liveness check, skip the IP rate limit or use a dedicated bucket.

3. **Task 3: Document Liveness Probe Configuration in Operations Guide**
   - **Context:** Operations and deployment docs (`docs/05_operations/`) should specify recommended settings for Railway / Kubernetes probes on `/api/health`.
   - **Action:** Update `DEPLOYMENT.md` and `docs/05_operations/` with details on configuring probe intervals, `X-Health-Token`, and expected HTTP status codes (200 vs 503).
