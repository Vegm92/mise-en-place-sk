# Feature Spec — Digest (weekly AI summary)

## Purpose

Send each restaurant a short AI weekly summary of its purchasing — what changed,
budget status, price shocks, recommendations — as a page and (for eligible
tenants) an email.

## Actors

- Signed-in member with `weeklyDigest` entitlement (Pro/Business).
- The worker's scheduled digest job.

## Preconditions

- `GEMINI_API_KEY`; tenant has data; feature enabled.

## Inputs

- Current ISO week key (`YYYY-Www`).
- The shared context snapshot (`buildChatContext`).

## Outputs

- `settings.weekly_digest_week/_text/_dismissed` rows.
- `/digest` page; scheduled email via Resend.

## Business rules

- **Generation** (`weekly-digest.ts`): `getOrGenerateWeeklyDigest(rid, week)`;
  atomic claim via `claimDigestWeek` (upsert `setWhere value <> week` +
  returning) — exactly one concurrent caller generates; losers reuse stored text.
- **Prompt**: same snapshot as chat (ADR-018), ≤ 150 words, six sections ending
  with "Recommended:".
- **Failure**: generation error restores the old week for retry.
- **Scheduling**: cron `0 6 * * 1` (Mon 06:00 UTC); filtered to
  `TIERS[tier].features.weeklyDigest`; email deduped by
  `claimOnce('weekly_digest_email_week')`.
- **Opt-out** (#577): the scheduled email is skipped for tenants whose
  `alert_pref_weekly_digest` setting is `false` (Ajustes → Alertas → Reportes),
  checked before generation. The on-visit `/reports` page is unaffected — the
  toggle governs the email, not the feature.
- **On-visit**: `/digest` load generates if missing and the feature is enabled
  (gated: no feature → redirect `/billing?upgrade=digest`); `dismissDigest`
  action sets `_dismissed`.
- Digest calls Gemini **directly** — usage not recorded (same gap as chat; fix
  contract in `docs/04_engineering/llm_usage_metering.md`).
- **Public share** (issue #329): `/reports/[type]` (weekly, current-week only)
  `share`/`revokeShare` actions get-or-create / revoke a `digest_shares` row
  (crypto-random token, `restaurantId` + ISO `week`, `revokedAt` nullable).
  `/s/[token]` (outside `(app)`, no auth) resolves the token and renders an
  **anonymised** view computed fresh at request time — percentage deltas only
  (overall spend vs. last week, top category movers) — never supplier names,
  absolute euro figures, invoice numbers, or the restaurant name; a CTA links
  the matching `/l/<variant>` landing page via `landingVariantForVenueType`,
  falling back to `/waitlist`. `/s/[token]/og.png` serves a server-composed
  SVG share card (not a Playwright/Puppeteer render — those are dev-only
  dependencies per #465 and not available in the production runtime) with the
  same anonymised content. `AlertRow`'s "share this price shock" affordance
  (`POST /api/alert-share`) reuses the same mechanism (current week's token),
  so a shared price-shock alert surfaces only the category-level movers
  already on the public view — never the ingredient, supplier, or price.

## State transitions

`settings.weekly_digest_week` advances; `_dismissed` set on dismiss.

## Data dependencies

`settings`, invoices/suppliers/budgets/stock (via snapshot), `subscriptions`.

## API dependencies

`/digest` load + dismiss action; `/reports/[type]` `share`/`revokeShare`
actions; `/s/[token]` load (public); `/s/[token]/og.png` (public);
`POST /api/alert-share` (tenant-scoped).

## UI dependencies

`digest/+page.svelte`; email template via `email.ts`; `reports/[type]/+page.svelte`
share panel; `s/[token]/+page.svelte` (public share view); `AlertRow.svelte`
share button.

## Background dependencies

Digest cron in `registerScheduledJobs` (ADR-011).

## External dependencies

Gemini; Resend (email).

## Validation

Week claim atomicity; feature gate; tenant scope.

## Error states

- Generation failure → old week retained, next run retries.
- Email send failure → claim released? (verify in `alerts.ts` digest runner) so
  the mail is retried.

## Edge cases

- Two requests race for the same week — one wins, both render the same text.
- Tenant with no data — snapshot is minimal; digest still generated.

## Security rules

- Snapshot is tenant data as data (ADR-018); settings scoped to tenant.
- **Public share (#329)**: `/s/[token]` is the first surface where
  tenant-derived data crosses the tenant boundary. The token is
  `crypto.randomBytes(24)` (192 bits, base64url) — not sequential/nanoid
  default. `resolveShareToken` is deliberately unscoped (the token *is* the
  boundary; `// tenant-scope-ok` documents why), but every query after
  resolution is tenant-scoped as normal. The public payload is built by a
  dedicated function (`buildPublicDigestPayload`) that only ever returns
  percentage deltas and category labels — it has no absolute-amount,
  supplier, or invoice-identifier field to leak, by construction, not by
  filtering. `robots.txt` disallows `/s/`; the page carries `noindex,
  nofollow`. Rate-limited per IP (`DIGEST_SHARE_VIEW_RATE_LIMIT_RPM`,
  `checkRateLimit` directly — unauthenticated, so outside `rateLimitScoped`'s
  tenant/user scopes per ADR-029).

## Idempotency rules

- `claimDigestWeek`/`claimOnce` make the per-week generation and email
  single-shot.

## Observability

- `trackEvent('digest_viewed')`; digest failures visible in system health.

## Acceptance criteria

- First `/digest` visit in a week generates + persists the week text; subsequent
  visits reuse it.
- Eligible tenants receive one email per week (deduped).
- Tests: `tests/scheduler.test.ts` (job registration); digest-specific tests
  absent — verify manually or add coverage.

## Code notes

### `src/routes/(app)/digest/+page.server.ts`

**`const load`**

- A digest is a paid Gemini call, so generation gates on live access like uploads/chat (issue #287).

### `src/lib/server/weekly-digest.ts`

**`function claimDigestWeek`**

- Atomically claims the week before paying (issue #249): the upsert fires only when the stored week differs, so exactly one of N concurrent loads generates.

**`function getOrGenerateWeeklyDigest`**

- If another request is already generating this week, serve the stored text instead of paying twice; on failure, release the claim so a later load retries.

### `src/lib/server/digest-share.ts`

**`function generateShareToken`**

- `crypto.randomBytes(24).toString('base64url')` — 192 bits, unguessable; deliberately not `nanoid()`'s default alphabet/length.

**`function resolveShareToken`**

- The one deliberately cross-tenant query in this file: the token is the boundary the caller has no `restaurantId` to scope by yet (same shape as `whatsapp-pairing.ts`'s `redeemPairingCode`). Returns `null` for both an unknown and a revoked token — the caller cannot tell them apart, which is the point (issue #329's "enumeration returns 404").

**`function buildPublicDigestPayload`**

- Computed fresh from `restaurantId` + `week` at request time — nothing is read back from a stored digest or the free-text AI summary (which does contain supplier names and euro figures). Returns only `pctDelta` results and category labels; there is no code path that could add a supplier/amount/invoice field without also adding it to this file, which is short and reviewable by design.

**`function getOrCreateActiveShare` / `getOrCreateCurrentWeekShare`**

- Race-safe against two concurrent callers landing on the same `(restaurantId, week)` — the reports `share` action and `AlertRow`'s "share this price shock" (`POST /api/alert-share`, via `getOrCreateCurrentWeekShare`) both go through this one function. "select, then insert if missing" is a plain check-then-act: both callers can see no existing row and both insert, leaving two live tokens for one week. `digest_shares_restaurant_week_active_unique` (migration 0054) is a **partial** `UNIQUE(restaurant_id, week) WHERE revoked_at IS NULL` index — it rejects the losing insert while leaving revoked/historical rows unconstrained, so a legitimate re-share after a revoke still works. The insert targets that exact index with `onConflictDoNothing({ target: [restaurantId, week], where: revoked_at IS NULL })`; on conflict, one re-select fetches the winner's token — no retry loop, since the partial index guarantees at most one unrevoked row exists once the conflict resolves.
- A price-shock share is just the current week's digest share token, so it carries exactly the same anonymised, category-level content — never the specific ingredient/supplier/price that triggered the alert.

### `src/routes/s/[token]/og.png/+server.ts`

- Server-composed SVG (`image/svg+xml`), not a headless-browser render: Playwright is a devDependency only (issue #465 removed it from production), and an og:image that 500s in prod on a missing browser binary is worse than a static one. Tradeoff, stated plainly: some social-preview crawlers (Facebook/Twitter/LinkedIn/Slack) do not reliably render SVG `og:image` — if that becomes a real problem, the fix is a real rasterizer dependency (`sharp`/`resvg`), not reaching for Playwright.
