# ADR-014 — JWT Sessions, and the Active Restaurant Resolved Per Request

**Status:** Active
**Feature:** Identity
**Date:** 2026-08-09
**Issues:** [#369](https://github.com/Vegm92/mise-en-place-sk/issues/369)–[#372](https://github.com/Vegm92/mise-en-place-sk/issues/372)

## Context

Leaving Supabase ([ADR-005](../tenancy/ADR-005-rls-retired.md)) meant leaving
GoTrue, which had provided email/password auth, OAuth, verification emails and
password reset. Auth.js (`@auth/sveltekit`) was the replacement.

Two questions had to be answered beyond "install Auth.js":

**Database sessions or JWT?** Database sessions are revocable server-side but
cost a lookup on every request — and this app already spends one query per
request resolving tenancy.

**Where does `restaurantId` come from?** Every tenant-scoped query needs it
(ADR-001), a user can belong to several restaurants, and it must be impossible
for a request to operate on a restaurant the user is not a member of.

## Decision

### JWT sessions, 30 days

`session: { strategy: 'jwt', maxAge: 30 days }` with a Drizzle adapter for user,
account and verification-token persistence. The token carries `sub`, name, email
and picture; the `session` callback copies `token.sub` onto `session.user.id`.

The trade accepted: **a session cannot be revoked before it expires.** Deleting a
user does not invalidate their outstanding token. This is tolerable because
authorisation is not carried in the token — every request re-reads membership
(below), so a user removed from a restaurant loses access to its data on their
next request even while their session remains valid.

### Two providers, one user record

- **Credentials** — bcrypt against `users.password_hash`, via `verifyCredentials`
- **Google OAuth**

`verifyCredentials` returns `null` — never a distinguishing error — for unknown
email, absent hash, unverified email, and wrong password alike. Login cannot be
used to enumerate accounts or to discover which addresses signed up with Google.
It also requires `emailVerified`: verification is an authentication gate, not a
post-signup nudge.

### Session cookies are minted directly for rate-limited flows

`issueSessionCookie` calls `@auth/core/jwt`'s `encode()` with the cookie name as
the salt — the same primitive Auth.js uses internally — and sets the cookie
itself. Login and signup need IP-keyed rate limiting that Auth.js's form-action
`signIn()` flow would bypass, so those routes own the handshake and mint the
session at the end of it.

This deliberately depends on an Auth.js internal convention (salt = cookie name).
It is documented at the function and is the thing to check first on an Auth.js
major upgrade.

### The active restaurant is resolved on every request, against membership

In `hooks.server.ts`, for every authenticated non-asset request:

1. Read all `user_restaurants` rows for the user.
2. Read the `active_restaurant` cookie.
3. `locals.restaurantId` = the cookie value **only if it appears in the
   membership list**, otherwise the first membership, otherwise `null`.

The cookie is a *preference*, never an authorisation. Forging it selects nothing
the user is not already a member of. This is what lets ADR-001's app-level
scoping be trusted: `forTenant(locals.restaurantId)` is safe because
`locals.restaurantId` was validated against the pivot table on this request.

The cost is one membership query per request. Given that it is the sole guard on
the sole tenant boundary, that is the right place to spend a query.

### Route protection is centralised, and denies by default

The same hook enforces, in order: `/admin*` requires `isAdminUser`; unauthenticated
`/` redirects to `/waitlist`; any non-public path requires a user — answering
**401 JSON** for `/api/*` and **303 to `/login?redirectTo=…`** for pages.

Public paths are an explicit allowlist (`isPublicPath`). A new route is protected
unless someone opts it out, which is the correct default for a mistake.

Five security headers are set on every response (`X-Frame-Options`,
`X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, HSTS).
`X-Frame-Options` is `SAMEORIGIN` for exactly two path shapes — `/api/upload/*`
and `/invoice/:id/file` — because the app frames those itself in the file viewer;
everything else is `DENY`.

### Admin seeding refuses to start with placeholder credentials

`seedAdminUser` throws in production if `AUTH_ADMIN_PASSWORD` is still `changeme`
or `AUTH_ADMIN_EMAIL` is an `@example.*` address. A deploy that would have created
a known-credential admin account fails to boot instead. Loudly wrong beats
quietly exploitable.

## Consequences

- **`AUTH_SECRET` is load-bearing and unrotatable without mass logout.** Rotating
  it invalidates every outstanding JWT.
- **Membership changes take effect immediately; identity changes do not.** Removing
  a user from a restaurant is enforced on their next request; deleting the user
  leaves their token valid until expiry.
- **One membership query per request** is on the critical path for every page and
  API call. It is the first thing to look at if per-request latency regresses —
  and the last thing to remove without replacing the guarantee it provides.
- **`ADDRESS_HEADER` must be set behind a proxy.** `hooks.server.ts` warns at boot
  when it is not: without it, `getClientAddress()` returns the proxy's address and
  every IP-keyed rate limit on login, signup and waitlist collapses into one
  shared bucket.
- Admin access is `AUTH_ADMIN_EMAIL`-based (`isAdminUser`), not a role column.
  Adequate for a single operator; a real admin-role model is the change to make
  when there is more than one.

## Related

- [ADR-001](../tenancy/ADR-001-app-level-tenant-scoping.md) — what `locals.restaurantId` feeds
- [ADR-005](../tenancy/ADR-005-rls-retired.md) — why this replaced Supabase Auth
