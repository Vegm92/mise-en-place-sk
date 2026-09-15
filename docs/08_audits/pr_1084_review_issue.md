# GitHub Issue: Post-PR #1084 Health Probe & Operational Hardening

## Goal
Harden `/api/health` and background probe mechanisms post-PR #1084 to prevent rate-limit starvation on addressless platform liveness probes, eliminate duplicate DB queries on unauthenticated health requests, and enforce strict error sanitization on health logs.

## Where
- `src/routes/api/health/+server.ts`
- `tests/api-health.test.ts`
- `src/lib/server/rate-limiter.ts`
- `docs/04_engineering/app_shell.md`

## Context & PR #1084 Analysis
PR #1084 fixed issue #1067 where Railway / platform liveness probes lacking `x-forwarded-for` headers triggered an uncaught exception from SvelteKit's `getClientAddress()`, resulting in HTTP 500 errors and false-positive outage alerts.

While PR #1084 successfully wrapped `getClientAddress()` in a `try...catch` block and added error logging for failed sub-probes, master review identified the following follow-up areas requiring engineering attention:

1. **Shared Rate-Limit Bucket Starvation (`health:unknown`):**
   - Addressless requests fallback to IP `unknown`, assigning all addressless probes (e.g., internal load balancers, container liveness checks) to `health:unknown`.
   - High-frequency internal health checks can exhaust the shared `health:unknown` quota (60 RPM), resulting in HTTP 429 status codes returned to legitimate platform probes.
2. **Unauthenticated Probe Query Efficiency:**
   - On the basic (unauthenticated) path, `isDbReachable()` issues `SELECT 1` on every probe hit.
   - For high-frequency liveness probes, adding short-lived in-memory caching or optimizing DB reachability checks reduces connection pool pressure during pool spikes.
3. **Log Sanitization & Sentry Noise:**
   - Probe failures log raw error objects (`{ probe: 'db', err: e }`). Under network blips, unhandled error structures could leak sensitive connection string info or flood Sentry / log aggregators.
4. **Documentation & Invariants:**
   - Per repository invariants (`docs/04_engineering/app_shell.md`), code comments are restricted inside `src/`. Architectural notes explaining addressless handling and health token scoping must be documented in `docs/`.

## Acceptance Criteria
- [ ] Platform/internal probes that are addressless (`ip === 'unknown'`) or originate from trusted internal networks bypass or use a dedicated rate-limit bucket that cannot be starved by external clients.
- [ ] Unauthenticated `/api/health` hits do not result in HTTP 429 errors during standard platform health polling intervals.
- [ ] Error logging in `computeHealthDetail()` sanitizes error messages (e.g., logging `e.message` or error code only) to prevent leaking internal database URIs or credentials.
- [ ] Vitest test suite (`tests/api-health.test.ts`) verifies:
  - High volume of addressless health checks does not cause HTTP 429 throttling for platform probes.
  - Sub-probe error logging produces sanitized messages.
- [ ] Documentation updated in `docs/04_engineering/` detailing `/api/health` rate-limiting strategy and probe mechanics.

## Tasks / Plan
1. **Rate Limiter Refactoring:**
   - Update `src/routes/api/health/+server.ts` to handle addressless requests (`ip === 'unknown'`) safely without sharing a restrictive global IP rate-limit key with public traffic, or bypass rate-limiting for valid `X-Health-Token` requests.
2. **Log Sanitization:**
   - Wrap `err` logging in `computeHealthDetail` to format errors consistently (`err: e instanceof Error ? e.message : String(e)`).
3. **Tests:**
   - Add unit tests in `tests/api-health.test.ts` for rate-limit isolation and error string sanitization.
4. **Docs:**
   - Document health endpoint behavior in `docs/04_engineering/app_shell.md` under `## Code notes`.
