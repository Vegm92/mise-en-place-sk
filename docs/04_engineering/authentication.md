# Authentication

How sign-in, sign-up, onboarding consent and password recovery are implemented, and the auth server utilities they share. Sessions: `security_rules.md`; invariants: `architectural_invariants.md`.

## Auth structure

Auth.js / SvelteKitAuth (`@auth/sveltekit`) with JWT sessions and the `DrizzleAdapter` over the auth tables in `src/lib/server/schema.ts` (users, accounts, sessions, verification_tokens). The sessions table is not the live store — the JWT cookie is self-contained; the tables exist to satisfy the adapter contract and the verification-token flow.

- **Providers** — Credentials (email/password via `verifyCredentials`, `auth-credentials.ts`) plus Google OAuth (`AUTH_GOOGLE_ID`/`AUTH_GOOGLE_SECRET`, configured in Google Cloud Console, not a Supabase dashboard). Email/password sign-in and sign-up go through custom routes (`login`/`signup` `+page.server.ts`) that apply app-level rate limiting and mint the session cookie themselves (`auth-session.ts#issueSessionCookie`); Google OAuth flows through Auth.js's own `/api/auth/*` callbacks. Config lives in `src/lib/server/auth.ts`.
- **Admin seeding** — `seedAdminUser()` (`auth-seed.ts`) creates the admin user, a default restaurant and the `user_restaurants` link on first boot; no external Admin API.
- **Session validation** — `hooks.server.ts` runs `sequence(Sentry.sentryHandle(), authHandle, appHandle)`; `appHandle` reads `event.locals.auth()` into `locals.user`.
- **Password reset / email verification** — `verification-token.ts` (single-use tokens) + `email.ts` (Resend) back `/forgot-password`, `/reset-password`, `/verify-email`; every email kind renders through one shared `renderEmailLayout()`.
- **Multi-tenancy** — all business tables carry `restaurant_id` (UUID FK). `hooks.server.ts` resolves the active restaurant from `user_restaurants` (honoring the `active_restaurant` cookie) into `locals.restaurantId`. No RLS: Railway Postgres has no `auth.uid()`/Data API, so tenant isolation is app-layer `restaurantId` scoping only (`tests/tenant-isolation.test.ts`, `tests/tenant-isolation-routes.test.ts`).

## Code notes

### `src/routes/api/auth/[...all]/+server.ts`
**_module level_**
- Empty stub — Auth.js routes are wired via the `handle` in `src/lib/server/auth.ts` (`sequence(authHandle, appHandle)`). Kept so `/api/auth/*` 404s cleanly instead of falling through to the SPA shell.

### `src/routes/forgot-password/+page.server.ts`
**`const load`**
- "Forgot password" request page (issue #284): mints its own verification token and emails a link straight to `/reset-password?email=…&token=…` — no session-exchange hop.

**`property default`** / **`const actions`**
- Response is identical whether or not the address has an account — a different message would make the form an account-enumeration oracle; enforced in this function's control flow, never delegated to a provider whose error shape could leak it. Rate limited per IP and per email via `publicFormAction` (issue #391).

### `src/routes/login/+page.server.ts`
**`property signIn`**
- Failures return `fail()` so the form keeps the typed email.
- Brute-force caps via `publicFormAction` (issue #391): per-IP `login:ip:<ip>` (max 10, scope `ip`) and per-account buckets, both always consumed so failing IP-side never masks whether the account is also over its cap.

### `src/routes/login/+page.svelte`
**`const error`**
- Form failures carry the error inline (keeps typed email); the query param remains for OAuth-callback redirects, which have no form state.

**`const resetDone`**
- Set after a completed password reset (issue #284); re-sign-in with the new password is also the proof it took effect.

**`markup`**
- Sections: logo, card, divider, Google OAuth form (`?/signInWithGoogle`).

### `src/routes/onboarding/+page.server.ts`
**`const load`**
- Google sign-ups have no recorded T&C acceptance yet — ask here on first authenticated landing.

**`property default`**
- Idempotent creation (issue #241): a double-submit / two tabs must not create two restaurants + two trials + two welcome emails. The slug carries a random suffix so no unique constraint fires; an advisory lock + membership re-check serializes per user, so a replay finds the first submit's restaurant and becomes a no-op redirect. The #250 idempotency key is a second guard for the same submit.
- Starts the 30-day trial and persists `plan_name`/`plan_quota` via `applyTierSettings(newRestaurantId, 'trial')` so the trial counter and quota gate have data from day one.
- Side effects (incl. the welcome email, fire-and-forget) run only for the submit that actually created the restaurant.

### `src/routes/onboarding/+page.svelte`
**`const idempotencyKey`**
- `crypto.randomUUID()`, one per page load (issue #250), so a double-submit can't create two restaurants.

**`markup`**
- Sections: language toggle, logo, card.

### `src/routes/reset-password/+page.server.ts`
**`const MIN_PASSWORD_LENGTH`**
- New password from a recovery link (issue #284). The emailed `email`+`token` pair is the proof of ownership — consumed once via `consumeVerificationToken`, not a live session. On success the current cookie is cleared and `users.token_version` is bumped in the same update (issue #478), so every other outstanding session dies too — this is the "someone else has my password" flow, so recovery must not leave any prior session standing.

**`property default`**
- `failed` covers the update matching no row — the token already proved the email exists, so it's a race (account vanished between request and submit), not a policy rejection.

### `src/routes/signup/+page.server.ts`
**`property signUp`**
- Caps account creation per IP via `publicFormAction` (issue #391), key `signup:ip:<ip>`, max 5.
- Explicit recorded consent to Terms + Privacy (GDPR). The insert should never fail (email uniqueness already checked) but is logged via `logAuthEvent('signup_failed', …)` so a real failure stands out in the auth-event stream.
- Consent acceptance (timestamp + policy version) persisted best-effort — a logging failure must not block signup. Welcome email sent once, after onboarding completes (covers email and Google sign-ups).

**`property resend`**
- Re-sends the verification link from the "check your email" screen; `resent` distinguishes a real send from a rate-limited one (key `signup:resend:<ip>`, max 3).

### `src/routes/signup/+page.svelte`
**`const termsAccepted`**
- Shared consent state; the Google OAuth form mirrors the checkbox via a hidden input. The button stays enabled (issue #234) — disabled reads as broken and the hover-title explanation never shows on touch devices; consent is validated on click and re-checked server-side.

**`markup`**
- Sections: logo, card, success state, divider, Google OAuth form (`onsubmit={guardGoogleConsent}`).

### `src/lib/server/auth-events.ts`
**`type AuthEventKind`**
- Auth telemetry (issue #256): failure paths have no restaurantId so can't use `trackEvent`; emits a structured console line plus a Sentry event so a brute-force wave or broken auth config is visible.
- Rules: counts, never credentials — password never passed here, emails never logged in plaintext; a short salted-ish hash (`hashIp` / truncated identifier) is the most ever recorded.
- Password recovery (issue #284) is the same signal class as a login-failure wave.

**`function hashIp`**
- Short, non-reversible fingerprint of an IP for correlating attempts without storing it.

**`function logAuthEvent`**
- Tagged Sentry event so alert rules catch a spike; breadcrumb for context on any error later in the same request.

### `src/lib/server/auth-seed.ts`
**`function seedAdminUser`**
- Seeds the initial admin + default restaurant on first startup (requires `AUTH_ADMIN_EMAIL`, `AUTH_ADMIN_PASSWORD`, `AUTH_ADMIN_RESTAURANT_NAME`); no-ops if the user exists (checked directly against `users`).
- `AUTH_ADMIN_EMAIL` also gates `/admin` and receives password-reset mail, so a placeholder address means an admin nobody can recover (issue #295); in production an `@example.com/.org/.net` address is rejected.
- User created directly (bcrypt + insert, the same path as signup, `emailVerified` pre-set), then the default restaurant, the user→restaurant link, and a `subscriptions` row (dated trial via `trialDaysFor`) — mirroring `onboarding/+page.server.ts`'s insert, so this bootstrap path does not leave the restaurant in the no-subscription-row gap `getAccessState` now denies by default (issue #486).

### `src/lib/server/auth-session.ts`
**`function issueSessionCookie`**
- Mints an Auth.js-compatible session cookie via `@auth/core/jwt`'s `encode()` — the same primitive Auth.js's callback flow uses (`@auth/core/lib/actions/callback`, `salt = cookies.sessionToken.name`). Used by login/signup, which carry custom rate-limiting that would be lost through Auth.js's `signIn()`.

### `src/lib/server/auth.ts`
**`property jwt`**
- Session revocation (issue #478): re-reads `users.token_version` by primary key on every request and compares it against the token's `tokenVersion` claim via `checkTokenVersion`. Returning `null` is Auth.js's built-in "invalidate this token" signal — the session cookie gets cleared. A token with no claim yet (minted by `issueSessionCookie`, which doesn't stamp one) is accepted and healed to the current version rather than rejected.

### `src/lib/server/token-version.ts`
**`function checkTokenVersion`**
- The revocation comparison itself (issue #478), pulled out of the `jwt` callback so it's unit-testable without going through Auth.js. `users.token_version` is bumped on password reset and password change, and the row disappears outright on account deletion — either way, a token minted before the change fails this check on its next request.

### `src/lib/server/verification-token.ts`
**`const TOKEN_TTL_MS`**
- One hour.

**`function createVerificationToken`**
- `identifier` is namespaced per use (`verify-email:<email>`, `reset-password:<email>`) so the two flows can never collide on a shared token row.

**`function consumeVerificationToken`**
- Verifies and deletes a token in one step, making it single-use.

### `src/lib/components/mep/AuthShell.svelte`
**_module level_**
- Centred logo + card chrome shared by the standalone auth pages (/forgot-password, /reset-password — issue #284). Extracted from the login page so a recovery screen can't drift from the sign-in look.
