# ADR-043 — Security Controls Fail Closed in Production, Open Only in Dev

**Status:** Active
**Feature:** Repo-wide conventions
**Date:** 2026-09-18
**Issues:** [#1072](https://github.com/Vegm92/mise-en-place-sk/issues/1072), [#998](https://github.com/Vegm92/mise-en-place-sk/issues/998), [#486](https://github.com/Vegm92/mise-en-place-sk/issues/486), [#500](https://github.com/Vegm92/mise-en-place-sk/issues/500)

## Context

Five separate controls in this repository have shipped the same defect: when the
dependency they lean on became unavailable, they stopped enforcing and let the
request through.

- [#998](https://github.com/Vegm92/mise-en-place-sk/issues/998) — the extraction
  semaphore granted a slot after a five-minute wait instead of returning the job.
- [#486](https://github.com/Vegm92/mise-en-place-sk/issues/486) — `getAccessState`
  granted access when no subscription row existed.
- [#500](https://github.com/Vegm92/mise-en-place-sk/issues/500) — IP-keyed limits
  were bypassable when the port was published directly.
- [#1072](https://github.com/Vegm92/mise-en-place-sk/issues/1072) — Turnstile
  returned `true` on any siteverify error, and the rate limiter silently degraded
  to a per-process in-memory bucket when Upstash errored.

Each was fixed on its own. The class was never decided, so the sixth instance was
a matter of time. An attacker does not need to cause the degraded state — the
internet produces it for free, and a control that only works while a third party
is healthy is not a control.

Alternatives considered:

- **Fail open everywhere, alert on it.** Rejected: the alert arrives after the
  signups do, and nobody is paged at 3am for a Cloudflare blip.
- **Fail closed everywhere, dev included.** Rejected: it makes a local checkout
  with no Upstash and no Turnstile secret unusable, which is how the fail-open
  defaults got written in the first place.
- **A shared `withFailClosed()` wrapper.** Rejected: three controls with three
  different return shapes (`boolean`, `boolean`, `throw`) do not share an
  abstraction worth the indirection. The rule is a convention plus tests, not a
  helper.

## Decision

A security control that cannot reach its dependency **denies** the request when
`NODE_ENV === 'production'`, and may fall back to a permissive local path only
outside production.

Concretely, as of #1072:

- `verifyTurnstileToken()` retries siteverify once (250ms apart) and then returns
  `false` in production, `true` otherwise. An unset `TURNSTILE_SECRET_KEY` is
  still a no-op — that is "not configured", not "failing".
- `checkRateLimit()` returns `false` — a 429 at every call site — when Upstash is
  *configured* and the call errors in production. The in-memory token bucket
  remains only for the genuinely-unconfigured case, which is dev.
- `assertAddressHeaderTrust()` throws at boot when `ADDRESS_HEADER` is set in
  production with no managed-proxy platform detected. `TRUSTED_PROXY=1` is the
  explicit acknowledgement for an operator-run nginx/Caddy that rewrites the
  header; there is no implicit escape.

"Configured but failing" and "not configured" are different states and must be
distinguished by every future control: the first denies, the second may be a
no-op in dev.

## Consequences

- An Upstash or Cloudflare outage now degrades availability instead of security:
  production signup and login return 429/422 rather than running unprotected.
  That is the trade this ADR deliberately picks, and it is the cost to weigh
  before adding a new dependency to a request path.
- A production deploy that sets `ADDRESS_HEADER` without a recognised platform no
  longer starts. Operators behind their own proxy must set `TRUSTED_PROXY=1`.
  This is a breaking change for any such deploy, and intentionally loud.
- The extraction semaphore is **not** covered: it is a cost/concurrency control,
  not a security boundary, and still falls back to the in-process path on a Redis
  error. `getAccessState` (#486) and the IP-trust fix (#500) keep their own
  existing fixes; this ADR records the rule they were each an instance of.
- Held in place by `tests/turnstile.test.ts`, `tests/rate-limiter.test.ts` and
  `tests/config.test.ts`, each of which stubs the dependency to fail and asserts
  denial with `NODE_ENV=production` and permissiveness without it. There is no
  lint gate — this is a convention with tests, not a CI-enforced invariant in the
  sense of [ADR-022](./ADR-022-invariants-enforced-in-ci.md).

## Related

- [ADR-022](./ADR-022-invariants-enforced-in-ci.md) — invariants that *are* CI gates
- [ADR-029](./ADR-029-rate-limit-identity-is-tenant-or-user-by-what-the-limit-protects.md) — what each rate limit is keyed on
