# ADR-029 — Rate-Limit Identity Is Tenant or User, Chosen by What the Limit Protects

**Status:** Active
**Feature:** Repo-wide conventions
**Date:** 2026-08-28
**Issue:** [#440](https://github.com/Vegm92/mise-en-place-sk/issues/440)

## Context

`checkRateLimit(key, max, windowSeconds?)` (`src/lib/server/rate-limiter.ts`)
takes a bare string key. By #440, ~24 authenticated call sites had grown their
own key prefix by hand, each independently choosing whether the identity in
the key was the requesting user (`` `chat:${locals.user!.id}` ``) or the
restaurant (`` `product-alias:${rid}` ``), with no rule written down anywhere
and no structural nudge either way.

That inconsistency is not cosmetic. A limit's identity decides who shares its
budget:

- **User-keyed on a resource the tenant pays for once** under-limits it. Chat
  (`/api/chat`) is gated on Gemini — a metered, paid capacity the restaurant
  buys as one account — but was keyed on `locals.user!.id`. A restaurant with
  five staff logged in got five independent per-minute budgets against one
  Gemini allocation, defeating the reason the limit exists.
- **Tenant-keyed on a genuinely personal action** over-limits it the other
  way: colleagues would contend over one shared bucket for something that has
  nothing to do with the tenant's shared resources, and one user's innocent
  burst would 429 everyone else at the restaurant.

Two things were considered and rejected:

- **Leave it to per-site judgment, just written down as guidance.** Guidance
  a reader has to remember to apply at each of ~20+ sites is exactly the kind
  of decision that drifts the moment a new endpoint is added under deadline
  pressure — the same argument ADR-022 already made for mechanically-checkable
  invariants, and rate-limit identity is exactly that kind of invariant.
- **One rate limiter, tenant-only.** Simpler, but wrong for the limits whose
  entire purpose is pacing one person's own behaviour (password-change,
  account-delete) — those must not let one staff member's mistake lock out a
  colleague trying to change their own password.

## Decision

**The identity a rate limit keys on is chosen by what the limit protects, not
by what's convenient to reach in `locals`:**

- **`tenant`** — the limit guards capacity the restaurant holds as one
  account: paid/metered external calls (Gemini — `chat`), or a rate of
  mutation against a single shared tenant resource that every staff member
  writes into together (the product catalog, supplier categories, unit
  conversion rules, invoice bulk actions, uploads, exports, the WhatsApp
  pairing-code generator). Multiple staff members using the feature
  concurrently are expected to draw from the *same* budget — that is the
  point of tenant-keying.
- **`user`** — the limit paces one person's own use of something that isn't a
  shared tenant budget: their own account (password-change, account-delete,
  account-export), their own UI/session state (switching active restaurant),
  or a personal read/interaction stream (the notification bell, the
  stock-levels and trend dashboards) where the limit's job is to stop one
  misbehaving client, not to divide a resource the tenant collectively pays
  for. Colleagues doing the same personal action concurrently must not
  contend with each other.
- **`ip`** — unauthenticated flows. Already covered structurally by
  `publicFormAction` (#510/#391) for public forms, and directly for the
  handful of endpoints with no session at all (`GET /api/health`). Out of
  this ADR's scope; it governs *authenticated* call sites.

This is made structural, not just documented, by
**`rateLimitScoped(options, identity)`** in `src/lib/server/rate-limit-scope.ts`:

```ts
rateLimitScoped(
  { scope: 'tenant' | 'user', name: string, max: number, windowSeconds?: number },
  { userId?: string | null, restaurantId?: string | null },
): Promise<boolean>
```

It resolves the key as `` `${name}:${id}` `` where `id` is `identity.restaurantId`
for `'tenant'` or `identity.userId` for `'user'` — the same key shape every
site already used, so migrating a site whose scope doesn't change (e.g.
`export:${rid}`) is a no-op for its stored bucket. If the identity the chosen
scope needs is missing, it throws rather than silently keying on `"undefined"`
and rate-limiting every unauthenticated caller together. It lives in its own
module (not added to `rate-limiter.ts` itself) specifically so every existing
`vi.mock('$lib/server/rate-limiter', ...)` across the test suite keeps working
unchanged — `rateLimitScoped` imports `checkRateLimit` the normal way, and
Vitest's module mock applies to that import too.

### The #440 audit

| Call site | Old key | What it protects | Scope |
|---|---|---|---|
| `POST /api/chat` | `chat:${userId}` | Gemini — paid, metered, one allocation per restaurant | **`tenant` (fixed — was `user`)** |
| `POST /api/unit-conversions` | `unit-conversions:${userId}` | Shared unit-conversion catalog + retroactively updates tenant's `invoice_line_items` | **`tenant` (fixed — was `user`)** |
| `POST /api/product-aliases` | `product-alias:${rid}` | Shared product-alias suggestion queue | `tenant` (unchanged) |
| `POST /api/supplier-category` | `supplier-category:${rid}` | Shared supplier-category suggestion queue | `tenant` (unchanged) |
| `POST /(app)` upload action | `upload:${rid}` | Shared extraction pipeline capacity | `tenant` (unchanged) |
| `POST /products` create | `product-create:${rid}` | Shared product catalog | `tenant` (unchanged) |
| `POST /products/[id]` unlinkSupplier | `product-unlink:${rid}` | Shared product catalog | `tenant` (unchanged) |
| `POST /products/[id]` delete | `product-delete:${rid}` | Shared product catalog | `tenant` (unchanged) |
| `POST /invoice/[id]` relinkProducts | `invoice-relink:${rid}` | Shared invoice/product data | `tenant` (unchanged) |
| `POST /invoices`, `/reminders` bulkPaid/bulkDelete | `bulk:${rid}` | Shared invoice set, bulk mutation | `tenant` (unchanged) |
| `GET /invoices/export/download` | `export:${rid}` | Shared invoice export (already correctly tenant per #440's own description) | `tenant` (unchanged) |
| `generatePairingCode` (WhatsApp settings) | `whatsapp-pair-gen:${rid}` | One active pairing code per tenant | `tenant` (unchanged) |
| `GET/POST /api/notifications` | `notifications:${userId}` | Per-staff alert-bell polling/dismissal, not a metered resource | `user` (unchanged) |
| `GET/POST /api/stock-levels` | `stock-levels:${userId}` | Per-staff dashboard polling/entry | `user` (unchanged) |
| `GET /api/trend` | `trend:${userId}` | Per-staff analytics dashboard polling | `user` (unchanged) |
| `POST /api/active-restaurant` | `switch-restaurant:${userId}` | Personal session state, no tenant resource involved | `user` (unchanged) |
| `changePassword` (settings) | `password-change:${userId}` | Per-person account safety (the issue's own example) | `user` (unchanged) |
| `POST /api/user/delete` | `account-delete:${userId}` | Per-person account safety | `user` (unchanged) |
| `GET /api/user/export` | `account-export:${userId}` | Per-person account data export | `user` (unchanged) |

Sites left on `checkRateLimit()` directly, deliberately outside this rule:

| Call site | Key | Why it's not tenant/user |
|---|---|---|
| `publicFormAction` internals (#510) | rule-supplied | Unauthenticated public forms; ip/email-scoped by design |
| `signup` resend action | `signup:resend:${ip}` | Unauthenticated, inside a `publicFormAction` handler |
| `GET /api/health` | `health:${ip}` (#491) | No session; IP is the only identity available |
| `hooks.server.ts` global `/api/*` gate | `api-global:${user ? 'u:'+id : 'ip:'+ip}` | A blanket gateway guard that intentionally falls back between identities — not one tenant/user business action |
| WhatsApp `message-handler.ts` (unauth reply cooldown, sender hourly limit) | `whatsapp-unauth:${phone}`, `whatsapp:${phone}` | Phone number is a channel identity; no Auth.js session exists |
| `redeemPairingCode` (WhatsApp) | `whatsapp-pair:${phone}` (#498) | Abuse guard on an unlinked phone attempting to claim a code — not yet tenant or user identity |
| `settings` `saveEmail` action | `email-change:user:${userId}` **and** `email-change:address:${email}` (#496) | Deliberately dual-keyed: caps both how often one account can request a change and how often one target address can be targeted. A single `scope` can't express "both," so it stays direct. |

`tests/rate-limit-scope-enforcement.test.ts` is the mechanical gate: it scans
`src/` for `checkRateLimit(` and fails the build if a call site outside the
table above isn't in its documented allowlist.

## Consequences

- **User-visible behaviour change: chat's budget is now shared per
  restaurant, not per staff member.** A five-seat tenant that used to get
  `CHAT_RATE_LIMIT_RPM` messages/minute *per user* now gets that many total.
  This is the change #440 asked for, not a side effect — the whole point was
  that paid Gemini capacity shouldn't multiply with headcount. Numeric limits
  were left exactly as they were; only the identity changed.
- **`unit-conversions` picked up the same fix**, for consistency with its two
  structural siblings (`product-aliases`, `supplier-category`) — all three
  resolve shared tenant suggestion/catalog state through the same
  `dismissSuggestion`-shaped pattern, and only `unit-conversions` was keyed
  differently before this issue.
- **The scan is regex/string-match, not sound analysis** (same caveat
  ADR-022 makes for its own gates) — a call site that constructs the string
  `'checkRateLimit'` some other way would not be caught. It raises the floor
  for the common case: a new `checkRateLimit(` call site fails CI until it's
  routed through `rateLimitScoped()` or added to the allowlist with a reason.
- **The dual-keyed email-change site is an intentional, permanent exception**,
  not a TODO — a third scope wouldn't generalise to anything else in this
  codebase, so it isn't added to `RateLimitScope` for one call site.
- **`rateLimitScoped()` still returns a plain boolean**, matching
  `checkRateLimit()` — call sites keep their own `fail(429, ...)` /
  `throw error(429, ...)` / `redirect(303, ...)` handling, which differs by
  route. The helper's job is only the identity/key decision.

## Related

- [ADR-022](./ADR-022-invariants-enforced-in-ci.md) — the same reasoning
  (a convention only survives as a mechanical check) applied here as a test
  rather than a `scripts/` + `ci.yml` gate; promoting it is a reasonable
  future step if a non-test-suite enforcement point is ever needed
- Issue #391 — the public rate-limit wrapper (`publicFormAction`)
- Issue #224 — Upstash Redis rate-limiter configuration
- Issue #496 — the dual-keyed email-change limits
- Issue #491 — `health:ip`
- Issue #498 — WhatsApp pairing rate limits
