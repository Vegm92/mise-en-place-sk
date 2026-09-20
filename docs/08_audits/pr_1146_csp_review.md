---
tags: [mep, audit, pr-review, csp, security]
related: PR #1146
---

# Post-Merge Review Report: PR #1146 (CSP Single-Source Fix)

**Reviewed PR:** #1146 (`fix(security): stop overriding SvelteKit's hash CSP with 'unsafe-inline' in hooks`)
**Merge Commit:** `7b8d093a5a26ddf1075a02d2e1d47cdc62a24f95`
**Branch:** `Vegm92/fix/csp-single-source`
**Reviewer:** Master Closed PR Reviewer
**Audit Date:** 2026-09-20

---

## 01. Executive Summary

PR #1146 resolves a critical security header conflict in the application's Content Security Policy (CSP) implementation.

Prior to PR #1146, SvelteKit's built-in CSP engine was configured in `svelte.config.js` in `hash` mode to dynamically generate script hashes for inline scripts generated during Server-Side Rendering (SSR). However, `hooks.server.ts` (and subsequently `src/lib/server/request-policy.ts`'s `applySecurityHeaders`) previously injected manual HTTP security headers that either duplicated or overrode the CSP header with `'unsafe-inline'`, neutralizing SvelteKit's strict script hashing mechanism.

PR #1146 cleanly decoupled CSP generation from custom response header hooks:
1. **Single Source of Truth:** `svelte.config.js` is established as the sole configuration authority for CSP directives (`mode: 'hash'`).
2. **Elimination of `'unsafe-inline'` for Scripts:** Script execution is strictly governed by `'self'`, inline SvelteKit hashes, and whitelisted external script sources (`https://challenges.cloudflare.com` for Cloudflare Turnstile).
3. **Preservation of Non-CSP Security Headers:** Custom header helpers in `request-policy.ts` continue enforcing framing restrictions (`X-Frame-Options`), MIME protection (`X-Content-Type-Options: nosniff`), referrer policies, permissions policies, HSTS, and request tracing headers (`X-Request-Id`).

This review evaluates the architectural impact of PR #1146, examines residual security risks, and establishes actionable tasks for subsequent sessions.

---

## 02. PR Overview & Context

- **Problem Statement:** In SvelteKit applications, configuring `kit.csp.mode = 'hash'` in `svelte.config.js` instructs SvelteKit to intercept HTML responses and attach sha256 script hashes to the `Content-Security-Policy` HTTP header. If custom middleware or `handle` hooks manually set `Content-Security-Policy: script-src 'self' 'unsafe-inline'`, browsers either merge the directives permissively or ignore hashes when `'unsafe-inline'` is present without nonce/hash support, opening the application to Cross-Site Scripting (XSS) risks.
- **Solution Implemented in PR #1146:**
  - Removed manual `Content-Security-Policy` header injection from `applySecurityHeaders()` in `src/lib/server/request-policy.ts`.
  - Maintained centralized directive definitions in `svelte.config.js`.
  - Verified that all SSR-rendered inline scripts and Turnstile integration function without requiring `'unsafe-inline'` in `script-src`.

---

## 03. Technical Analysis of Code Changes

### 1. Centralized CSP Configuration (`svelte.config.js`)

```javascript
csp: {
    mode: 'hash',
    directives: {
        'default-src': ['self'],
        'script-src':  ['self', 'https://challenges.cloudflare.com'],
        'style-src':   ['self', 'unsafe-inline'],
        'font-src':    ['self'],
        'img-src':     ['self', 'data:', 'blob:'],
        'connect-src': ['self', 'https://*.sentry.io'],
        'worker-src':  ['self', 'blob:'],
        'frame-src':   ['self', 'https://challenges.cloudflare.com'],
        'object-src':  ['none'],
        'base-uri':    ['self'],
        'form-action': ['self', 'https://accounts.google.com', 'https://checkout.stripe.com', 'https://billing.stripe.com'],
    },
}
```

**Key Findings:**
- **Script Directives:** `script-src` is strictly limited to `'self'` and `https://challenges.cloudflare.com`. Inline script tags emitted by SvelteKit are automatically hashed by SvelteKit during SSR.
- **Form Actions:** `form-action` explicitly permits Google OAuth (`https://accounts.google.com`) and Stripe Checkout/Portal endpoints (`https://checkout.stripe.com`, `https://billing.stripe.com`), avoiding silent browser blocking during 303 redirects.
- **Worker & Connect Sources:** `worker-src` includes `'blob:'` to allow Sentry Replay worker compression without CSP violation warnings.
- **Style Directives:** `style-src` retains `'unsafe-inline'` due to dynamic Svelte element style attributes and Tailwind v4 utility styles.

### 2. Request Security Header Layer (`src/lib/server/request-policy.ts`)

```typescript
export function applySecurityHeaders(path: string, response: Response, event: RequestEvent): Response {
	const isFramedByApp = path.startsWith('/api/upload/') || /^\/invoice\/[^/]+\/file$/.test(path);
	response.headers.set('X-Frame-Options', isFramedByApp ? 'SAMEORIGIN' : 'DENY');
	response.headers.set('X-Content-Type-Options', 'nosniff');
	response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
	response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
	response.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
	response.headers.set('Cross-Origin-Opener-Policy', 'same-origin');
	response.headers.set('X-Request-Id', event.locals.requestId);

	if (event.route.id !== null) applyPrivateCacheHeaders(response.headers);

	return response;
}
```

**Key Findings:**
- **No Header Clashing:** `applySecurityHeaders` refrains from touching `Content-Security-Policy`, allowing SvelteKit's native adapter and response pipeline to compute and attach CSP headers cleanly.
- **Frame Isolation:** PDF viewer frame embedding is limited to same-origin for invoice files and uploads, while denying framing on all other routes.

---

## 04. Vulnerability & Risk Assessment

| Risk / Observation | Severity | Context | Mitigation / Recommendation |
|---|---|---|---|
| **Style Directive `'unsafe-inline'`** | Low | `style-src` uses `'unsafe-inline'` to support dynamic element styling. While script execution is protected, inline style injection remains theoretically possible. | Explore SvelteKit style hashing or pre-compiled CSS utilities in future refactoring. |
| **CSP Violation Reporting** | Low / Medium | No `report-uri` or `report-to` directive is configured in `svelte.config.js`. Violations in production browsers will not be logged to Sentry. | Add CSP violation report endpoint integration to capture unexpected client-side script blocks. |
| **Third-Party Domain Scope** | Low | OAuth and billing domains in `form-action` and `script-src` must be reviewed when adding new external integrations. | Enforce periodic domain auditing in `security_plan.md`. |

---

## 05. Test Coverage & Quality Assessment

- **TestSuite Execution:** All 171 test files (2,576 tests) pass without errors.
- **Documentation & Invariants:**
  - `pnpm lint:no-comments` verified clean.
  - Architectural documentation in `docs/04_engineering/security_plan.md` and `docs/04_engineering/security_rules.md` is fully synchronized with single-source CSP handling.

---

## 06. Actionable Backlog Items for the Next Session

1. **Task 1: Add Sentry CSP Violation Endpoint Integration**
   - **Context:** Currently, CSP violations are blocked silently by client browsers without telemetry.
   - **Action:** Configure Sentry CSP report endpoint in `svelte.config.js` (`report-uri`) to track blocked scripts or third-party domain attempts in production.

2. **Task 2: Add Explicit Header Parity Unit Tests**
   - **Context:** Automated tests should explicitly assert that responses produced during SSR contain SvelteKit's hash-based CSP header without `'unsafe-inline'` in `script-src`.
   - **Action:** Extend `tests/request-policy.test.ts` or add `tests/csp-headers.test.ts` to assert header directives.
