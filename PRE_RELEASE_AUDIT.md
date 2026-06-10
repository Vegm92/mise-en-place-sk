# Mise en Place — Pre-Release Audit

**Date:** 2026-06-09 · **Auditor perspective:** SaaS product audit, growth, UX, store-readiness
**Verdict up front:** The product core (upload → AI extract → review → analytics) is genuinely good and the engineering hygiene has improved fast. But this is **not a launchable business today**: there is no way to sign up, no way to pay, no way to be contacted, no legal surface, and no app-store artifact. Launch readiness: **38/100**.

---

## 1. What the product actually is

A Spanish-first restaurant invoice & supplier-spend SaaS: upload/photograph supplier invoices, Gemini extracts header + line items with per-field confidence, user reviews and confirms, and the app builds spend analytics, price-shock alerts, budgets, payment reminders, a weekly AI digest, and a data-aware chat assistant. Multi-tenant (restaurants), Supabase Postgres + Auth, SvelteKit + adapter-node, Sentry, CI on GitHub Actions.

**The README still describes a recipe app and DEPLOYMENT.md describes a BetterAuth/SQLite stack that no longer exists** (issue #61 — still valid).

---

## 2. Area scores (1–10)

| Area | Score | One-line justification |
|---|---|---|
| Product & market fit | **6** | Real, painful problem; clear value prop on the waitlist page; differentiation vs. BlueCart/Xero is plausible but unproven; compelling reason to pay exists — but nobody can pay. |
| User experience | **6** | Strong core flow, offline upload queue, good empty/error states, 13/15 pages responsive; undermined by ~20 hardcoded-language strings, a 2-step-only tutorial, modal focus/a11y gaps. |
| Monetization | **1** | Zero billing code. No plans, no trial enforcement, no paywall, no Stripe. Waitlist promises "1 month free" that nothing implements. |
| Retention | **4** | Good in-app loops (alerts, reminders, digest, budgets) but **no delivery channel** — no email, no push, no WhatsApp despite UI copy claiming "queued for WhatsApp". If the user doesn't open the app, nothing reaches them. |
| Growth | **2** | Waitlist-only acquisition with **no self-serve signup** and no email infra to convert the waitlist. No referral, no sharing, no SEO (no meta description/OG/sitemap, `lang="en"` on a Spanish product). |
| Trust & credibility | **3** | No privacy policy, no ToS, no cookie consent, no data export/delete (GDPR Art. 17/20) while storing other businesses' financial data in the EU. RLS now exists (good), but app-level IDOR gaps remain. |
| Technical readiness | **5** | CI green (0 type errors, 107 tests pass), Sentry wired, RLS migration present. But: uploads/sessions on ephemeral disk, in-memory rate limiter, `sql.raw()` interpolation, N+1 in alert engine, no scheduled jobs, 72/179 tests silently skipped without env. |
| App Store / Play readiness | **1** | There is no app to submit: no Capacitor/native shell, not even a PWA manifest. Screenshots/metadata/keywords are moot until a packaging decision is made. |

---

## 3. Top 20 issues blocking success

| # | Issue | Why it matters | Impact | Priority | Recommendation | Effort | GH issue |
|---|---|---|---|---|---|---|---|
| 1 | **No self-serve signup** — only seeded/OAuth sign-in for existing users | Zero acquisition possible; waitlist is a dead end | Blocks 100% of growth | Critical | Supabase `signUp` + email verify → onboarding | 2–4 days | **Not tracked** |
| 2 | **No billing/monetization code** | No revenue path at all; "1 month free" promise unenforceable | Blocks 100% of revenue | Critical | Stripe Checkout + customer portal, 1 paid plan + trial flag | 1–2 weeks | **Not tracked** |
| 3 | **No email infrastructure** | Waitlist can't be converted; digest/reminders/alerts can't reach users; no lifecycle emails | Activation & retention | Critical | Resend/Postmark + transactional templates (welcome, digest, overdue) | 3–5 days | **Not tracked** |
| 4 | **Uploads & sessions on ephemeral local disk** | Invoice PDFs lost on every redeploy; blocks multi-instance | Data loss = churn + trust collapse | Critical | Move files to Supabase Storage; sessions to Postgres | 3–5 days | #62 (valid) |
| 5 | **No privacy policy / ToS / GDPR endpoints** | Illegal to operate in EU target market; sales blocker for any chain | Legal/credibility | Critical | Policy + ToS pages, data export & account deletion, DPA list (Supabase, Google) | 1 week | #66 (valid) |
| 6 | **App-level IDOR gaps**: `pending/[id]` and `invoice/[id]/file` check only ID; `/api/upload/[id]/[file]` unauthenticated | Cross-tenant financial data exposure if RLS misconfigured/bypassed (service-role queries don't get RLS) | Security/trust | Critical | Add `restaurantId`/auth checks to all three routes | 0.5–1 day | **Not tracked** (RLS issues #75–91 are the DB layer only) |
| 7 | **Committed `data/db.sqlite` + session blobs in git history** | Potential credential/PII leak; secrets may need rotation | Security | Critical | `git rm --cached`, purge history, rotate keys | 0.5 day | #60 (valid) |
| 8 | **`sql.raw()` with string interpolation** (`supplier-reliability.ts`, `suppliers/+page.server.ts`) | One refactor away from SQL injection; bypasses parameterization | Security | High | Replace with Drizzle `sql` placeholders | 0.5–1 day | #64 (partially valid — some files fixed, these remain) |
| 9 | **No scheduled jobs** — digest/alerts only run on page visit or invoice save | "Weekly digest" doesn't exist for inactive users — the exact users retention features must reach | Retention | High | Vercel Cron / pg_cron / node-cron for digest, reminders, cleanup | 2–3 days | **Not tracked** |
| 10 | **Stale docs: README sells a recipe app; DEPLOYMENT.md describes dead stack** | First impression for investors/devs/reviewers is "abandoned or confused" | Credibility | High | Rewrite both against `.env.example` reality | 0.5 day | #61 (valid) |
| 11 | **In-memory rate limiter & extraction semaphore** | Silently stops limiting beyond one instance; Gemini cost exposure | Cost/abuse | High | Redis/Upstash or Postgres-backed limiter; or document single-instance constraint | 1–2 days | #68 (partially valid — Sentry done, this remains) |
| 12 | **No invoice list pagination; no image compression** | Page degrades with volume; storage + Gemini costs inflate | Perf/cost | High | Cursor pagination; server-side downscale before extract | 1–2 days | #65 (partially valid — 20MB cap now enforced) |
| 13 | **No Gemini hard timeout; uncalibrated confidence; synth bench not in CI** | A silent misread of a money figure destroys trust; bad first extraction kills activation | Activation/trust | High | Hard timeout + fallback; CI accuracy gate; block save on unreviewed low-confidence money fields | 3–5 days | #67 (valid) |
| 14 | **~20 hardcoded strings break the bilingual UX** (CoachMark, settings tour, NotificationBell, pending loader, upload prompt) | English users hit Spanish mid-flow and vice versa; looks unfinished | Activation | High | Move to i18n.ts; add locale picker to onboarding; fix `lang="en"` | 1 day | **Not tracked** (#70 covers a11y/dates only) |
| 15 | **Zero SEO/ASO surface**: no meta description, OG tags, sitemap, structured data; waitlist is the only public page | Organic acquisition ≈ 0; shared links render bare | Growth | High | Meta/OG on public pages, sitemap.xml, landing page SEO pass | 1–2 days | **Not tracked** |
| 16 | **No product analytics** — no funnel events (signup→upload→confirm→return) | Flying blind on activation/churn; can't iterate | Growth | High | Implement events table + `trackEvent` (already specced) or PostHog | 2–3 days | #29 (valid) |
| 17 | **N+1 queries in alert engine** (per-line-item lookups on every save) | 50-line invoice = 50+ queries at the hottest moment of the product | Perf | Medium | Batch-fetch previous prices/stock in one query | 1 day | **Not tracked** |
| 18 | **Missing security headers (HSTS, CSP); invoice files cached 1h** | Weakens defense-in-depth on financial documents | Security | Medium | Add HSTS/CSP; `Cache-Control: private, no-store` on files | 0.5 day | **Not tracked** |
| 19 | **A11y gaps**: color-only confidence, div-buttons, no focus trap, no `aria-live`, no `aria-current` | Excludes users; legal exposure (EAA applies in EU since 2025) | UX/legal | Medium | Fix per svelte-check warnings + #70 list | 2–3 days | #70 (valid) |
| 20 | **No store packaging decision** (no PWA manifest, no Capacitor) | "App Store / Google Play publication" is impossible, not merely risky | Distribution | Medium | Ship PWA manifest + service worker now; evaluate Capacitor for stores later | PWA: 1–2 days; Capacitor: 2–3 weeks | **Not tracked** |

Also worth fixing (lower): repo hygiene — dual lockfiles, committed `coverage/` and logs, unused chart.js/playwright (#71, valid); dead UI controls & native `confirm()` dialogs (#69, needs re-verification); trivial `/api/health` (#31, valid); admin gated by env-var email instead of `userRestaurants.role`; 72/179 tests silently skipped without Supabase env (CI must fail loudly if secrets missing); font loaded from jsdelivr CDN (perf + GDPR); waitlist form has no rate limit or double opt-in.

---

## 4. GitHub issues cross-reference

**Already tracked and still valid:** #60, #61, #62, #65 (partial), #66, #67, #68 (partial), #64 (partial), #69, #70, #71, #29, #31. Feature bets #25 (PO reconciliation) and #21 (spend concentration) are good post-launch differentiators — correctly parked.

**Stale — appear already fixed, verify and close:**
- **#75–#91 (all 17 RLS issues):** `drizzle/0002_rls_policies.sql` + commit `36397fb` enable RLS with restaurant-scoped policies on all tables. Verify the migration is applied to the live Supabase project, then close all 17. **Caveat (from the code-level audit below, F-A1):** RLS only protects the Supabase Data API path; the app itself connects via a direct Postgres connection (`src/lib/server/db.ts`) that **bypasses RLS**, so the live tenant boundary in the request path is still the hand-written `restaurantId` filter on every query.
- **#28 (Sentry):** wired in `hooks.server.ts`/`hooks.client.ts` (commit `a148b3c`). Close.
- **#63 (CI + password guard):** CI workflow exists and is green; `auth-seed.ts` refuses default password in production. The deploy-runbook half is still open (fold into #61).

**Found in this audit and since filed as issues #96–#109** (in the order below: #96 signup, #97 billing, #98 email, #99 IDOR/auth endpoints, #100 scheduled jobs, #101 i18n, #102 SEO, #103 N+1, #104 HSTS/CSP, #105 PWA/packaging, #106 CI silent-skip, #107 DB indexes, #108 WhatsApp copy, #109 waitlist hardening):
1. No self-serve signup (Critical)
2. No billing/Stripe/plans (Critical)
3. No email/notification delivery infrastructure (Critical)
4. App-level IDOR: `pending/[id]`, `invoice/[id]/file`, unauthenticated `/api/upload/[id]/[file]` (Critical)
5. No scheduled background jobs (High)
6. Hardcoded i18n strings + `lang="en"` + no locale choice at onboarding (High)
7. SEO/OG/sitemap absence on public pages (High)
8. N+1 queries in alert-engine (Medium)
9. HSTS/CSP headers + file cache-control (Medium)
10. PWA manifest / store packaging decision (Medium)
11. CI silently skipping 40% of tests when env is absent (Medium)
12. Missing composite DB indexes (restaurant_id, status/created_at) (Low)
13. "Queued for WhatsApp" copy with no WhatsApp integration — remove or build (Low)
14. Waitlist form: no rate limiting, no double opt-in (Low)

---

## 5. Fastest actions to revenue within 30 days

1. **Week 1 — open the front door:** self-serve signup + email verification; fix the two IDOR routes and unauthenticated file endpoint; move uploads to Supabase Storage. (Without these you cannot ethically take money.)
2. **Week 2 — charge:** one Stripe plan (e.g., €49/mo per restaurant, 30-day trial, card upfront optional) + a minimal pricing page; gate nothing initially except trial expiry. Effort is small because there's only one plan.
3. **Week 2–3 — convert the waitlist:** wire Resend; send the existing waitlist a launch email with the promised "1 month free" code. This list is your entire current funnel — it is currently rotting.
4. **Week 3 — ship trust surface:** privacy policy, ToS, footer links, cookie banner. EU restaurant owners will not put supplier invoices into a site with no legal pages.
5. **Week 4 — retention emails:** weekly digest + overdue-invoice reminder by email (content already generated by `weekly-digest.ts`; it just needs a scheduler and a sender).
6. **Throughout — instrument:** trackEvent on signup→first upload→first confirm→W1 return so you can see where trials die.

Realistic 30-day outcome: first paying customers from the waitlist; more importantly, a measurable funnel.

## 6. 90-day prioritized roadmap

**Days 1–30 — “Sellable”** (above) + close stale GH issues, purge git secrets (#60), rewrite README/DEPLOYMENT (#61), distributed rate limiting or documented single-instance deploy (#68).

**Days 31–60 — “Trustworthy & sticky”**
- Extraction quality gate in CI (synth bench, #67); hard Gemini timeout; block save on unreviewed low-confidence money fields
- Scheduled jobs (digest, reminders, cleanup); email + in-app parity
- i18n completion + locale at onboarding; a11y pass (#70); dead-UI cleanup (#69)
- Pagination + image compression (#65); N+1 fix; DB indexes
- Data export/delete endpoints (GDPR #66 completion); audit log/soft delete
- PWA manifest + installability (Add-to-Home-Screen is the realistic "app" for restaurant managers)

**Days 61–90 — “Growable”**
- Public landing page with SEO/OG/sitemap; Spanish-first content marketing (price-inflation reports from aggregate data is a natural magnet)
- Referral hook: "invite your gestoría/accountant" (read-only accountant seat is also an upsell)
- Expand tutorial to cover budgets/analytics/reminders; activation milestones
- Spend concentration alerts (#21) as a differentiator; start PO reconciliation discovery (#25)
- Evaluate Capacitor wrapper only if PWA installs prove demand; store assets/metadata then

## 7. Brutally honest assessment

**Likely outcome if launched today: failure — not because the product is bad, but because the business around it doesn't exist.** Nobody can register, nobody can pay, nobody on the waitlist will ever hear from you, and an EU business handling third-party financial data with no privacy policy is one complaint away from real trouble. The app-store ambition is currently fiction: there is no installable artifact of any kind.

**The good news is unusual:** the hard part — a working AI extraction flow with confidence scoring, review UX, offline upload, multi-tenant RLS, alerts/digest/budgets — is built and decently engineered, and the issue tracker shows a team that finds and fixes its own P0s (17 RLS issues filed and fixed in days). The gaps are boring, well-understood SaaS plumbing: signup, Stripe, email, legal pages, storage durability. None of it is research; all of it is 4–6 focused weeks.

**Verdict: requires major (but cheap) changes before launch.** With the 30-day plan executed, this moves from 38/100 to roughly 70/100 and becomes a credible niche SaaS for Spanish restaurants. The bigger long-term risks are (a) distribution — restaurant owners are hard to reach digitally; the gestoría/accountant channel is probably your real wedge — and (b) extraction trust — one wrong total in week one loses the customer, so the #67 quality gate matters more than any growth feature.

---

# Part 2 — Code-level audit (consolidated from TECHNICAL_AUDIT.md)

*A separate code-level audit (PR #113, 2026-06-10) was merged into this document; the standalone file has been removed. Overlapping findings (IDOR → #99, `sql.raw` → #64, N+1 → #103, in-memory rate limiter → #68, ephemeral storage → #62, stale README → #61 [fixed], hardcoded Spanish → #101) are tracked in the issues already filed. The findings below are UNIQUE to that audit and not yet tracked as issues.*

## Architecture

- **F-A1 (HIGH) — RLS is authored but not enforced in the request path.** The app uses a direct Postgres connection (`src/lib/server/db.ts`) that connects as the table owner and **bypasses RLS**; the policies in `drizzle/0002_rls_policies.sql` only protect the Supabase Data API. The real tenant boundary is the hand-written `restaurantId` filter in ~40 call sites — and three were missing (#99). **Decide:** either route tenant queries through a connection that applies RLS (`SET LOCAL` / JWT claims), or stop treating RLS as a control and centralize scoping in a single `scoped()` query helper.
- **F-A2 (HIGH) — Two half-finished extraction architectures coexist.** Inline synchronous Gemini call in `extract/[id]` page load (15–45 s inside the request) *and* an abandoned durable model (`pending_processed_invoices` + `/api/inference-status` polling + `/pending/[id]`) that the live path never writes to. Pick one — preferably the durable, off-request job model with persisted status/errors and per-tenant quota — and delete the other (~250 LOC + 2 tables).

## Data integrity

- **F-D1 (HIGH) — Invoice save is not transactional.** Supplier upsert → invoice insert → line items → alerts are separate awaits in `extract/[id]/+page.server.ts` and `pending/[id]/+page.server.ts:116-153`; a mid-sequence failure leaves orphaned partial records. Wrap in `db.transaction()`.
- **F-D2 (HIGH) — Duplicate-invoice check is check-then-insert.** Race between SELECT and INSERT; add `UNIQUE(restaurant_id, supplier_id, invoice_number)` and handle conflict.
- **F-D4 (MEDIUM) — Extraction failures only hit `console.error`**; navigating away loses them and re-entry re-bills Gemini. Persist extraction status/error.

## Security (additive to #99/#104)

- **F-S4 (HIGH) — Open redirect on login**: `redirectTo` used unvalidated in `login/+page.server.ts:5,21` (the `/auth/callback` validates; login does not).
- **F-S6 (MEDIUM) — Chat prompt injection**: user message concatenated with system instruction + data snapshot (`(app)/api/chat/+server.ts:44-85`).
- **F-S7 (MEDIUM) — Upload validation is extension-only**; no magic-byte check, files later served with asserted MIME.
- **F-S9 (LOW) — `/api/tpv/sync` is a public-path-allowlisted 501 stub** — will ship unauthenticated by default when implemented.
- **F-S10 (LOW)** — Unhandled `JSON.parse` on notification payloads (`(app)/+layout.server.ts:74-77`).

## Dead weight (deletion list)

`synth/js/` (~934 LOC dead duplicate of the Python tool), `chart.js` + `@sveltejs/adapter-auto` deps, one of the two icon packages (`lucide-svelte` vs `@lucide/svelte`), 5.6 MB unused PNGs in `static/`, committed logs/coverage (#71), one of the two same-named `Sparkline.svelte` components, completed `TODO.md`, `mise-en-place/` design exports. The upload page (`(app)/+page.svelte`, 782 LOC) duplicates ~70 % of its logic across mobile/desktop branches.

## Additional performance notes

Unit-bridge N+1 (`unit-bridge.ts:70-78`, on top of the alert-engine N+1 in #103); dashboard fan-out of 20+ parallel queries per load; verify indexes behind the analytics `sql.raw` aggregates (#107).

## CTO-style scoring from that audit

Architecture 62 · Maintainability 65 · Scalability 40 · Reliability 50 · Security 38 · Simplicity 60 · **Launch readiness 45/100** — directionally consistent with Part 1's 38/100 (Part 1 also scores business readiness: monetization, growth, legal).

**Pre-launch hardening order (code-level):** (1) IDOR fixes incl. open redirect (#99 + F-S4), (2) transactional save + unique constraint (F-D1/D2), (3) RLS-or-`scoped()` decision (F-A1), (4) single extraction flow (F-A2), (5) out-of-process rate-limit/session state (#68/#62), (6) N+1 batching (#103), (7) kill `sql.raw` (#64), (8) deletion list.
