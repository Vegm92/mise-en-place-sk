# ADR-043 — Security Controls Fail Closed in Production and Fail Open Only in Development

**Status:** Active
**Feature:** Repo-wide conventions
**Date:** 2026-09-18
**Issue:** [#1072](https://github.com/Vegm92/mise-en-place-sk/issues/1072)

## Context

A security control has a dependency — a network service, a database row, a
shared counter — and that dependency will sometimes be missing. What the
control does in that moment has been decided six times in this codebase, each
time in isolation, and the first draft has been "allow" every time:

| Instance | Control | What the missing dependency did before the fix |
|---|---|---|
| [#486](https://github.com/Vegm92/mise-en-place-sk/issues/486) | `getAccessState` (billing entitlement) | A restaurant with no `subscriptions` row was **granted** unlimited access; trial expiry could never fire on it. |
| [#500](https://github.com/Vegm92/mise-en-place-sk/issues/500) | IP-keyed rate limits behind a proxy | `ADDRESS_HEADER` set with nothing rewriting it made every `ip:` limit spoofable; the fix was a boot **warning**. |
| [#998](https://github.com/Vegm92/mise-en-place-sk/issues/998) | Extraction concurrency semaphore | A waiter that timed out was **handed a slot anyway**, so under exactly the load the cap exists for, the cap stopped capping. |
| #1072 (A) | Turnstile bot check on signup and waitlist | A non-2xx siteverify response or a network error returned `true`: bot protection switched itself **off** whenever Cloudflare was unreachable or rate-limiting this server. |
| #1072 (B) | Rate limiter with Upstash configured | Any Upstash error fell through to a per-process bucket, so the ceiling became `max × replicas` and an attacker who could make the Upstash call fail restored near-unlimited login attempts. |
| #1072 (C) | Trusted-proxy configuration | The #500 warning was routinely lost in boot logs; in the warned state every IP-keyed limit was still spoofable. |

The pattern is not carelessness. Each fail-open was a reasonable local call —
"don't block real users because Cloudflare hiccupped", "don't crash on a
missing row" — made without a project-wide rule to weigh it against. Without
that rule the next control will make the same call, and the reviewer will
have nothing to point at.

The alternatives considered:

- **Fail closed everywhere, in every environment.** Rejected: local
  development would then need Upstash, a Turnstile secret and a proxy in
  front of `vite dev` before a login form works. The cost of the failure mode
  is borne in production; the cost of the mitigation should not be borne in
  development.
- **Fail open, but alert loudly.** Rejected: that is what #500 did, and the
  warning was the vulnerability. An alert is a control only if someone acts
  on it before the attacker does, and an outage of the dependency is exactly
  the moment nobody is looking at the boot log.
- **Fail closed only for the controls named in this issue.** Rejected: that
  is what the previous five fixes did, one issue at a time. The decision is
  worth an ADR precisely because it has to be applied to controls that do not
  exist yet.
- **Fail closed for every rate limit, not just the auth-critical ones.**
  Rejected: an Upstash blip would then turn into an outage of every
  authenticated endpoint (`trend`, `notifications`, `sidebar`, the `/api/*`
  gateway). Those limits are throughput caps, not security controls; the
  per-process bucket still bounds them. The line is drawn at limits whose
  job is to stop a credential attack or abuse of an unauthenticated entry
  point.

## Decision

**In production (`NODE_ENV=production`, read through `isProduction()` in
`src/lib/server/config.ts`), a security control whose dependency is
unavailable denies. In development it keeps its permissive behaviour, so
local work needs neither the external services nor a proxy.** A dependency
that is genuinely not configured is a valid development state and is not a
failure; a dependency that is configured and cannot be reached is a failure.

Applied to this issue's three controls:

- **Turnstile** (`src/lib/server/turnstile.ts`). `verifyTurnstileToken`
  returns `'verified' | 'rejected' | 'unavailable'` instead of a boolean, so
  a caller can no longer confuse "Cloudflare said no" with "Cloudflare could
  not be asked". It retries once, 300 ms later, on a thrown fetch, a non-2xx
  status or an unparseable body; a `success: false` body is an answer and is
  not retried. `publicFormAction` maps `unavailable` to
  `fail(503, { error: 'service_unavailable' })` in production and proceeds
  in development. No secret configured stays `verified` — the feature is
  off and the widget never rendered.
- **Rate limiter** (`src/lib/server/rate-limiter.ts`). `checkRateLimit`
  takes `{ authCritical?: boolean }`. When Upstash is configured (both env
  vars set) and the call fails — or the client never initialised — an
  auth-critical limit in production throws
  `RateLimitBackendUnavailableError`; every other limit, and every limit in
  development, degrades to the in-process bucket as before. Unconfigured
  Upstash is unchanged everywhere. The auth-critical set: `login:ip`,
  `login:email`, `signup:ip`, `recover:ip`, `recover:email`, `waitlist`
  (every rule through `publicFormAction`), `login|signup:resend`,
  `email-change:user`, `email-change:address`, `whatsapp-pair`. Callers
  answer **503, not 429**: the user did nothing wrong, and an operator who
  sees a 429 spike reads an attack where there is an outage.
- **Trusted proxy** (`src/lib/server/config.ts`). `ADDRESS_HEADER` set in
  production with no known managed-proxy platform (`RAILWAY_PROJECT_ID`,
  `RAILWAY_SERVICE_ID`, `RENDER`, `FLY_APP_NAME`) and no `TRUSTED_PROXY=1`
  throws from `assertProductionEnv()` — the boot-validation seam that
  already refuses to start on a missing required variable — instead of
  logging. `TRUSTED_PROXY=1` is the operator's attestation for a self-run
  nginx/Caddy that rewrites the header on every request. The *unset* case
  stays a warning: collapsed buckets degrade rate limiting without opening
  it.

For a new control, the questions are: what is the dependency, what does the
control return when it is missing, and is that answer different in
production? If the production answer is "allow", the review should ask why.

## Consequences

- **An Upstash outage now costs logins.** With `UPSTASH_REDIS_REST_*` set
  and Upstash down, login, signup, password recovery, verification resend,
  the waitlist, email change and WhatsApp pairing answer 503 until it is
  back. Everything already signed in keeps working. Before, the same outage
  silently multiplied the login ceiling by the replica count. This is the
  trade the ADR makes on purpose; the mitigation is Upstash's own uptime,
  not a fallback.
- **A Cloudflare Turnstile outage now costs signups and waitlist joins**
  (one retry, then 503), for as long as `TURNSTILE_SECRET_KEY` is set.
  Unsetting both Turnstile keys turns the feature off and restores the
  honeypot-plus-rate-limit path.
- **A misconfigured proxy is a failed deploy, not a warning.** A production
  service with `ADDRESS_HEADER` set on an unrecognised host will not start
  until the operator either unsets it or sets `TRUSTED_PROXY=1`. The stock
  `docker-compose.yml` sets neither and is unaffected; Railway is detected.
- **Development is unchanged.** No Upstash, no Turnstile secret, no proxy:
  `vite dev` behaves as it did. The in-memory limiter is a documented
  single-instance state, not a degraded one.
- **Retro-fitting.** #486, #500 and #998 already fail closed on their own
  terms and are listed here for the record only; nothing in this ADR
  reopens them. The #500 boot warning is what became #1072 (C).
- **Held in place by** `tests/turnstile.test.ts` (the tri-state outcome and
  the retry), `tests/public-form-action.test.ts` (siteverify stubbed to
  error: 503 in production, handler runs in development; backend error →
  503), `tests/rate-limiter-fail-closed.test.ts` (Upstash configured and
  throwing: auth-critical denies in production, degrades elsewhere; the four
  call sites carry the flag) and `tests/config.test.ts` (boot refuses the
  spoofable proxy state and accepts each attestation).

## Related

- [ADR-022](./ADR-022-invariants-enforced-in-ci.md) — the same argument for
  turning a convention into something a reviewer can point at; this ADR is
  the rule, its test files are the gate.
- [ADR-029](./ADR-029-rate-limit-identity-is-tenant-or-user-by-what-the-limit-protects.md)
  — which limits are tenant- or user-scoped; this ADR adds an orthogonal
  axis, which limits are auth-critical.
- [ADR-013](../billing/ADR-013-tiers-trial-and-quota.md) — the entitlement
  gate that #486 made fail closed.
- `docs/04_engineering/security_rules.md` — the per-module Code notes for
  `turnstile.ts`, `rate-limiter.ts`, `config.ts` and `public-form-action.ts`.
