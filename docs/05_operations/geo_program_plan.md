---
tags: [mep, seo, geo, marketing, arquitectura]
---

# GEO program — being cited by ChatGPT, Perplexity and AI Overviews

**Status: Phase 0 delivered, Phases 1-7 open.** Written 2026-08-29. Each phase below is
sized to land as its own PR; the sequencing table at the bottom gives the order and the
surface each one owns, so parallel sessions can claim without collision.

## Context

Mise en Place is a pre-launch, waitlist-driven SaaS for Spanish restaurants (albarán → Gemini extraction → spend analytics and price-shock alerts). The goal is to be the source AI engines cite when a restaurateur asks ChatGPT, Perplexity, or Google AI Overviews about supplier cost control, food cost, or the 2026-2028 Spanish e-invoicing rules.

GEO is not a separate discipline bolted onto SEO — retrieval-augmented engines pull from pages that already rank and that parse cleanly. So the work is: fix what stops us being retrieved, build the answer-shaped content that has nowhere to live today, then make the entity legible.

The repo is in better shape than most: `robots.txt` and `sitemap.xml` are generated routes, the landing has canonical + OG + a JSON-LD `@graph`, and there are five keyword-targeted landing variants. Three things block everything else.

### The three blockers

1. **English is invisible to every crawler.** `src/lib/i18n.ts:7` declares `export const locale = writable<Locale>('es')` and `initLocale()` runs only inside `onMount` (`src/lib/components/landing/LandingPage.svelte:53-57`). SSR therefore always emits Spanish. GPTBot, OAI-SearchBot, PerplexityBot and ClaudeBot do not execute JavaScript, so the English half of a 4,299-key bilingual table has never been seen by a search or AI engine. Both locales also share one URL, so there is no address for English to rank at even if it were rendered.
2. **There is no content system at all.** No mdsvex, no markdown, no blog route. The five landing variants are the entire indexable content surface. RAG engines cite pages that answer a question; we have five sales pages and two legal pages. `docs/onboarding/marketing/03_canales/contenido_y_seo.md` already plans this channel and is marked *"sin empezar"*.
3. **Canonicals are derived from `url.origin` at request time** (`src/routes/waitlist/+page.server.ts:11`, `src/routes/l/[variant]/+page.server.ts:17`, plus both generated routes). Whichever host serves the request declares itself canonical. With the domain undecided, any apex/`app.` split silently produces duplicate canonicals. The repo is already inconsistent about this: `.env.example:345` says `miseenplace.app`, `tests/sitemap-robots.test.ts` asserts `mise-en-place.app`.

### Decisions taken

Settled with the owner before this plan was written; reopen them explicitly rather than drifting.

#### Scope and shape

- **Scope**: technical GEO + build the content system in-repo. Off-site authority ships as a playbook doc, not executed.
- **Language**: bilingual URL split, each locale server-rendered at its own address with hreflang.
- **Domain**: undecided — everything reads one configurable `PUBLIC_SITE_ORIGIN`, never `url.origin`.
- **Testimonials are illustrative**, not customers → no `Review` or `AggregateRating` schema anywhere, and a visible "ilustrativo" marker (unbreakable rule 1). Delivered in Phase 0.

### Constraints that override any GEO tactic

From `docs/onboarding/marketing/00_base/02_reglas_inquebrantables.md`:

| Rule | Effect on this plan |
|---|---|
| Never claim VeriFactu compliance (MDR-001) | The `verifactu-2027` variant and all normativa content need a copy audit. Allowed: *"preparado para la factura electrónica que vas a recibir"*. Forbidden: *"cumple con VERI\*FACTU"* |
| No figure without a linked source | Citations must be structural in the content system, not optional. Sourced stats live in `docs/02_product/plan_de_negocio.md` |
| No unconfirmed prices published | Two conflicting price tables exist. Schema `Offer` markup stays at the current €0 waitlist offer only |
| Everything public is bilingual | Enforced by `pnpm lint:i18n` for UI keys. Long-form content sits outside the i18n table, so it needs its own parity check |
| Pre-launch status is stated honestly | No signal implying an installed customer base |
| Never name competitors negatively | Blocks competitor-comparison pages, which are otherwise prime AI-citation bait. Category comparisons are still allowed |

Repo conventions that shape implementation: **code comments are banned** (`pnpm lint:no-comments`; test files carry a header docblock and are exempt), and every `$t` key must resolve in both locale tables (`scripts/check-i18n-strings.mjs`).

---

## Phase 0 — Truth audit ✅ delivered (items 4 and 5 still open)

Everything downstream amplifies whatever claims are on the page. Structured data turns
prose a reader discounts into a machine-readable assertion that generative engines quote
back verbatim and attribute to us, so the copy has to be true before anything is allowed
to amplify it. Amplifying a false claim is strictly worse than having no GEO program.

Three claims were retracted, in both locales:

1. **`waitlist.faq.1.a` and `waitlist.steps.2.body`** claimed a Square/Revo POS
   integration *"desde el primer día"*. It is not built (unbreakable rule 1's open-cases
   table). Both now say the product works from delivery notes and invoices whatever the
   POS, with direct integrations named as roadmap. `steps.2.body` also promised real-time
   *margin*, which is not computable without the sales data that integration would have
   supplied, so that went too.
2. **`waitlist.faq.0.a` and `waitlist.trustBar.privacy.body`** asserted EU-encrypted
   storage and a never-train guarantee, neither confirmed against the infrastructure.
   Both now rest on export/delete, which is shipped, and defer hosting and retention
   specifics to the privacy policy.
3. **`waitlist.testimonialsDisclaimer`** (new key, es/en) marks the testimonials as
   illustrative, visibly above the quotes rather than in a footnote.

`tests/landing-claims-ratchet.test.ts` is the ratchet: it fails if the retracted claims
return, or if `Review`/`AggregateRating` markup appears while the testimonials remain
illustrative. It found the `steps.2.body` instance that a manual read had missed — worth
knowing when auditing the rest of the copy.

Two existing tests were re-anchored, not weakened. `404-waitlist-trust-bar` still requires
every trust-bar claim to be substantiated by the FAQ; it is anchored on export/delete
instead of the `servidores de la UE` phrase that no longer exists. The #407 migration diff
in `waitlist-provisional-price` gained a documented drift layer in the same shape as its
existing `POST_407` and `POST_333` layers.

### Still open — owner decisions, and they gate Phase 4

These are marketing calls, not corrections, so they were left alone rather than rewritten:

- **The admin-hours figure.** The landing claims `4–6 h` a week (`waitlist.pain.0.stat`).
  The sources annex in `docs/02_product/plan_de_negocio.md` cites **14 h/week** (Square +
  American Express, *"Recupera tu Tiempo"*, 2024) — the `4–6` in that document refers to
  *weeks of engineering work*, a different number entirely. Either source the landing
  figure or change it.
- **The `+8 %` price-hike stat** (`waitlist.pain.2.stat`) appears in no source. The annex
  has +15,7 % (INE, food CPI) and +35–38 % (OCU basket).
- **The price conflict** — 29/59/129 in the app and landing vs 49/99/199 in the business
  plan (unbreakable rule 3). Schema.org has no way to express "provisional", so engines
  quote it as fact. The standing recommendation is that no provisional price enters
  `Offer` markup at all; `faq.3.a` is excluded from FAQPage markup for the same reason.

Rule 6 says no figure ships without a linked source, and Phase 4 adds `Article` schema
with `citation`, so the first two need either a source or a rewrite before that lands.

On the `verifactu-2027` variant (`src/lib/landing-variants.ts:85-105`): audited, and it
**passes** MDR-001 — *"preparados para"*, *"llega con tu histórico ordenado"* is
reception-side framing with no compliance claim. It does violate rule 6 (the 2027 date is
asserted unsourced). Per `INC-001` the VeriFactu 2027 date is firm (RDL 15/2025) but the
B2B e-invoice date is **not** — content must never assert 2028.

---

## Phase 1 — Single origin + crawl foundation

Small, and it unblocks every later phase that emits a URL.

**New** `src/lib/seo/origin.ts` — `siteOrigin(url: URL): string`, reading `PUBLIC_SITE_ORIGIN` from `$env/static/public` and falling back to `url.origin` when unset (so local dev and preview deploys keep working).

**Modify** to use it instead of `url.origin`: `src/routes/robots.txt/+server.ts`, `src/routes/sitemap.xml/+server.ts`, `src/routes/waitlist/+page.server.ts:11`, `src/routes/l/[variant]/+page.server.ts:17`. Add `PUBLIC_SITE_ORIGIN` to `.env.example` and to the Railway service variables.

**`robots.txt` — the AI-crawler stance.** Block nobody: `GPTBot`, `OAI-SearchBot`, `ChatGPT-User`, `PerplexityBot`, `Perplexity-User`, `ClaudeBot`, `Claude-User`, `Claude-SearchBot`, `Bingbot`, `CCBot`, `Google-Extended`, `Applebot-Extended`. For a pre-launch company with no proprietary corpus, training inclusion is how the brand becomes a known entity, and the `-User` agents are live fetches for someone who already asked about us.

`Google-Extended` and `Applebot-Extended` deserve their own line because they are commonly misread: both are **training/grounding opt-outs only**. Neither controls AI Overviews (that is Googlebot) or Siri surfacing (that is `Applebot`). Blocking them forfeits Gemini grounding and Apple Intelligence presence and buys nothing for search. Related, so nobody chases it later: you cannot opt out of AI Overviews while staying in Google Search — the only levers are `nosnippet` / `max-snippet`, which also cut ordinary snippets.

**Do this with a single `User-agent: *` group — do NOT add per-agent groups.** This is the trap in the whole phase: robots.txt selects **exactly one** group per crawler, the most specific match, and then ignores `User-agent: *` entirely for that agent. Writing

```
User-agent: GPTBot
Allow: /
```

would make GPTBot stop honouring all twenty `Disallow` lines and crawl `/dashboard`, `/api/` and `/s/`. Express the stance in `#` comments in the generated body instead, and record it as an MDR. Refactor `+server.ts` so the disallow list is a `const DISALLOW: string[]`, making it structurally impossible to add a group later without repeating the disallows.

Add the missing app-surface paths while in there: `/pending`, `/logout`, `/verify-email`, `/plantilla-lista`, `/help`, `/products`, `/batch`.

**`railway.json`** — `sleepApplication: true` means a crawler can hit a cold container. AI crawlers have short timeouts and unforgiving retry behaviour; a sleeping origin costs crawl coverage. Set it to `false` for the web service (the worker is unaffected). Cheapest insurance in this plan.

Compounding it: `applyPrivateCacheHeaders()` at `src/hooks.server.ts:221` stamps `private, no-store` on every routed response, landing pages included, so nothing absorbs the cold start. Do **not** "fix" that by declaring the landings publicly cacheable — `captureAttribution()` sets a `Set-Cookie` on those exact responses, and `applyPrivateCacheHeaders` only adds `Vary: Cookie` when the response is not publicly cacheable, so a shared cache could serve one visitor's attribution cookie to everyone. CDN caching here requires moving attribution to a separate beacon first. Fix the cold start, not the cache headers.

**Verification setup**: Search Console via **DNS TXT domain property** — it survives host changes and covers every subdomain, which matters most while the domain is undecided. (Correction: hash-CSP was never a constraint here; CSP governs script and style execution, not `<meta>` tags or static files. What it does block is GTM/GA, which pushes measurement server-side anyway — see Phase 6.) Backup: a static `static/google<token>.html`. Bing Webmaster imports from GSC.

*Verify*: extend `tests/sitemap-robots.test.ts` (it already asserts `Allow: /l/` and the Disallow set) with the AI-agent blocks and the origin override; `curl` `/robots.txt` and `/sitemap.xml` against a build with `PUBLIC_SITE_ORIGIN` set and confirm no `url.origin` leakage.

---

## Phase 2 — Bilingual URL architecture (the unlock)

This is the largest change and it gates phases 3 and 4.

**URL shape.** Keep Spanish at the bare path so existing URLs and any accrued authority survive untouched; add English under a prefix:

- `/waitlist` → es, `/en/waitlist` → en
- `/l/[variant]` → es, `/en/l/[variant]` → en
- `x-default` → the Spanish URL

Implement with a `(public)` route group and an optional param: `src/routes/(public)/[[lang=locale]]/...`, plus a matcher `src/params/locale.ts` accepting `en` and `es`. `/es/*` then 301s to the bare path in `hooks.server.ts` so exactly one canonical Spanish URL exists.

**The core risk — do not set the module store on the server.** `locale` in `src/lib/i18n.ts:7` is a module-level `writable`. Under `adapter-node`, modules are shared across all concurrent requests, so calling `locale.set()` server-side lets request A (English) change what request B (Spanish) renders. Svelte's SSR render is synchronous, which makes it *usually* work — which is exactly what makes this class of bug ship and then appear as unreproducible wrong-language pages under load. Do not rely on it.

Instead, **add a context-based translator for the public surface only**:

- **New** `src/lib/i18n-context.ts` — `setLocaleContext(locale)` / `getT()` / `getTi()` over the existing `translations` table from `src/lib/i18n-messages.ts`. The 4,299-key table and the lint that guards it are untouched; only the accessor changes.
- `src/routes/(public)/+layout.server.ts` derives locale from the URL and returns it; `(public)/+layout.svelte` calls `setLocaleContext`.
- `LandingPage.svelte` switches its imports (lines 16, 37-47) and its two `$locale` reads (lines 218, 231) to the context accessor. It already wraps the base translator in a `derived` for variant overrides via `overrideFor()` (`src/lib/landing-copy.ts`), so the shape of the change is small and local.
- The authenticated app keeps the existing store: it is single-session, `noindex`, and out of scope. Record in the ADR *why* it survives there, so a future change doesn't "finish the migration" and reintroduce the leak from the other side.

**Make the language toggle a link, not a button.** `LandingPage.svelte:269` is `<button onclick={toggleLocale}>`, which means there is currently **no path any crawler can follow from the Spanish page to the English one** — the alternate stays undiscoverable even once it exists at its own URL. Change it to `<a href={alternateUrl}>`, still writing `mep-locale` to localStorage on click so the authed app remembers the preference. One-line change, and it is the difference between the English tree being crawled and not.

**Bare `/` stays as-is** (`src/hooks.server.ts:123-125`, 303 → `/waitlist`). Do **not** add `Accept-Language` negotiation: Google advises against locale-redirecting crawlers because it caches one variant, makes crawling nondeterministic, and can leave the English tree permanently undiscovered. The visible link toggle plus hreflang is both correct and better for GEO.

**Also required, easy to miss:**

- `isPublicPath()` (`src/hooks.server.ts:228-247`) must recognise the `/en/...` prefix. Without this every English marketing URL 303s to `/login`.
- `src/app.html` hardcodes `lang="es"`. Replace with a placeholder substituted in `handle` via `transformPageChunk` from `event.locals.locale`. `src/routes/+layout.svelte:15-17` sets `document.documentElement.lang` client-side — make sure it does not fight the server value on public pages.
- Sitemap emits both locales with `xhtml:link` alternates, and drops the fake `lastmod`: `new Date()` on every request (`src/routes/sitemap.xml/+server.ts:20`) claims every page changed today, which is a trust signal spent for nothing. Use real per-route dates from the content registry, and a build timestamp for the static routes.

*Verify*: `curl -A "GPTBot" https://host/en/waitlist | grep '<html lang'` must return `en`, and the raw HTML must contain English body copy — this single check proves the core bug is fixed. Add `tests/hreflang.test.ts` (reciprocal alternates + one x-default) and a test that `isPublicPath('/en/waitlist')` is true.

---

## Phase 3 — Extractability: the answer hub

**Typed frontmatter + markdown bodies, parsed in-repo — not mdsvex, not a DB.** Content gets versioned with the code and reviewed in PRs — which is what unbreakable rule 6 actually needs, since a reviewer sees a figure and its citation in the same diff. It also has no DB dependency, which means `export const prerender = true`. Prerendered static HTML is the single most valuable thing here: no cold start, no timeout, nothing for a crawler to fail at. (Contrast the landing pages, which cannot prerender: both loads call `countWaitlistEmails()` and set an attribution cookie.)

**Why not mdsvex:** it is lightly maintained, its Svelte 5 story is rocky, and this repo has a lot of CI surface for a Svelte-compiler-level plugin to break. More decisively, free-form markdown makes rule 6 a convention you hope people follow; typed frontmatter makes it a **build-time failure**. Parse frontmatter into a typed `ContentPiece` and render the body with `marked` (server-only, tree-shaken out of the client bundle because the pages prerender) — one new dependency. *Zero-dep fallback:* make pieces TypeScript modules exporting a typed `ContentPiece`, and `svelte-check` validates the contract for free. Prose in template literals is unpleasant but it ships in a day and is genuinely viable at this team size.

Because content pages prerender they cannot set the attribution cookie. Put `?ref=guia-<slug>` on the CTA back to `/waitlist` — `parseAttribution` already reads `ref` (`src/lib/attribution.ts:20`). No new machinery.

**Files**

- **New** `src/content/es/*.md`, `src/content/en/*.md`.
- **New** `src/lib/content/index.ts` — an `import.meta.glob` registry over `src/content/**`. Mirror `src/lib/landing-variants.ts`: it exposes `landingVariantSlugs()`, which `sitemap.xml/+server.ts:12` consumes so a new variant never needs a second hand-maintained list. `contentSlugs()` must be consumed the same way.
- **New** routes `src/routes/(public)/[[lang=locale]]/guias/+page.svelte` (hub) and `guias/[slug]/+page.svelte`, both `prerender = true`. One `/guias/` segment for both locales — the article slug carries far more SEO weight than the directory, and two segments doubles the routing complexity for almost nothing.
- **New** components in `src/lib/components/content/`: `AnswerBlock.svelte`, `SourceList.svelte`, `SummaryTable.svelte`, `FaqAccordion.svelte`.

**Frontmatter schema**: `title`, `question`, `answer` (the 40-60 word direct answer), `locale`, `translationKey` (pairs es/en), `author`, `publishedAt`, `updatedAt`, `angle` (`normativa` | `coste` | `oficio`), `sources[]` (`{label, url, accessedAt}`), `related[]`, `faq[]`.

**The answer-first pattern** — this is the actual GEO substance, not the plumbing:

- H1 is the question exactly as a person asks it.
- Immediately below, a 40-60 word direct answer in `<AnswerBlock>`: self-contained prose, no pronouns pointing back at the title, no "as mentioned above". This is the unit an LLM lifts and attributes.
- Then H2s that are themselves questions — the fan-out sub-queries — each with its own 40-60 word answer directly underneath before any elaboration.
- A summary table of the key facts. Tables extract exceptionally well and are disproportionately quoted.
- `SourceList` renders `frontmatter.sources` at the end, with `accessedAt` dates.

**Bilingual policy for articles.** Rule 5 requires bilingual delivery, but `03_canales/contenido_y_seo.md` explicitly carves out content as the one surface where Spanish-first is allowed *if decided deliberately*. Recommendation: ship the architecture fully bilingual, allow individual articles to launch Spanish-only, and record that as **MDR-002** so it is a decision rather than a drift. hreflang must omit the alternate when a pair does not exist — a link to a non-existent translation is worse than none.

**New** `src/lib/content/validate.ts`, invoked from `tests/content-integrity.test.ts` so CI enforces it: `answer` word count is 40-60; every `keyFacts[].source` resolves in `sources[]`; every `sources[].url` is absolute https; `translationOf` is reciprocal; plus a forbidden-string check for `cumple con VERI`, `Square`, `Revo`, `te pone al día con la normativa` — MDR-001 and rule 1 as a lint. Be honest about the limit: "every figure has a linked source" is not statically decidable. The validator enforces that a source exists and resolves; the human checklist does the rest.

`.md` files are invisible to both `check-i18n-strings.mjs` (it globs `.svelte` only, line 71) and `check-no-comments.mjs`. That is the behaviour we want — content prose legitimately bypasses the i18n table — but make it deliberate with a note in the linter header, matching the precedent where `privacy/+page.svelte` and `terms/+page.svelte` are explicitly skipped (`check-i18n-strings.mjs:32-42`). The chrome around the content still goes through i18n.

*Verify*: `pnpm build` produces static HTML per article; `tests/content-registry.test.ts` asserts every article appears in the sitemap; view-source on a built page shows the answer block in the raw HTML.

---

## Phase 4 — Structured data and entity authority

**New** `src/lib/seo/schema.ts` with builders — `websiteSchema`, `softwareApplicationSchema`, `organizationSchema`, `faqPageSchema`, `articleSchema`, `breadcrumbSchema` — and one `renderJsonLd(graph)` that preserves the existing `.replace(/</g, '\\u003c')` escaping convention from `LandingPage.svelte:244`.

Keep emitting JSON-LD exactly as the landing does now — `{@html}` of a `<script type="application/ld+json">` inside `<svelte:head>`. CSP is hash-mode (`svelte.config.js:13`) with `script-src: ['self', ...]` and no `unsafe-inline`, so the tag is only allowed because SvelteKit hashes scripts it finds in the rendered output. A JSON-LD block injected any other way (a raw string in `app.html`, a client-side `appendChild`) will be silently blocked by CSP in production while working fine in dev.

**New** `src/lib/components/seo/SeoHead.svelte` and `JsonLd.svelte`. Today the entire head block lives inside `LandingPage.svelte:208-245` and is therefore unavailable to anything else — which is why `/privacy` and `/terms` have only a `<title>` (`privacy/+page.svelte:183-185`, `terms/+page.svelte:141-143`) and `/signup` and `/login` have no canonical. Extracting it fixes all four and gives the content pages a head for free.

Priority order within the phase:

1. **`FAQPage` from the existing `waitlist.faq.*` keys** (rendered at `LandingPage.svelte:145-158`) — **and only after Phase 0**. It is tempting to treat this as the cheapest win in the plan, and on effort alone it is. But shipped against the pre-Phase-0 copy it would have published the false Square/Revo integration claim in the one format specifically designed to be quoted back verbatim. Structured data is an amplifier; point it at verified claims only. Exclude `faq.3.a` from the markup regardless — it interpolates provisional prices via `$ti`, and a price in FAQ markup is a price you get quoted on.
2. **`Organization` with `sameAs`** — the entity-reconciliation signal AI engines use to decide that "Mise en Place" is a real, single, identifiable thing. List **only profiles that exist and are active**; an abandoned or empty `sameAs` is a negative signal, so omit the field rather than list a dead LinkedIn.
3. **`Article` with `author` → `Person`** on content pages. Victor's chef background is the E-E-A-T lever and the one thing consultancy-written competitors cannot copy — `contenido_y_seo.md` already identifies it as the moat. Make it machine-readable, not just prose.
4. `BreadcrumbList` — **defer until the hub exists** (Phase 3). On a two-level site it is near-worthless; once `/guias` → `/guias/[slug]` exists it costs ten lines.

**Explicitly excluded**: `Review` / `AggregateRating` / `ratingValue` (testimonials are illustrative — fabricated review markup is a rule-1 violation and, in the EU, a potential unfair-commercial-practices problem); `HowTo` (Google removed HowTo rich results entirely); `speakable` (near-zero adoption outside a dead Assistant pilot); and `@id` graph gymnastics linking every node to every other, which is marginal at this size and adds a class of validation errors.

*Verify*: Rich Results Test and Schema.org validator against a deployed URL; a `tests/seo-head.test.ts` asserting canonical, hreflang and JSON-LD presence per public route; grep that no `AggregateRating` string exists in `src/`.

---

## Phase 5 — OG images (small, and lower priority than it feels)

`src/routes/s/[token]/og.png/+server.ts` is named `.png` but returns `Content-Type: image/svg+xml`. X, Facebook and LinkedIn do not render SVG OG images, so that route does not currently do its job — copying the pattern would propagate the bug.

Ship **static 1200×630 PNGs** in `static/og/` — one per locale, one per variant per locale, and one generic per content angle rather than per piece — wired through `SeoHead.svelte`. Generate them once with a Playwright one-shot script; Playwright is already a devDependency and `scripts/generate-pwa-icons.mjs` is the existing precedent. Do not build a dynamic generator yet: it needs a rasterizer (`@resvg/resvg-js`) and, more to the point, **OG images have no effect on AI citation** — they affect social CTR only. Worth doing because the Twitter card currently declares `summary_large_image` with no image, which renders as a broken card; not worth engineering.

---

## Phase 6 — Measurement

This closes blocking question 3 in `docs/onboarding/marketing/00_base/00_mapa.md` ("¿qué analítica hay instalada?"). The answer: nothing third-party, and hash-mode CSP (`svelte.config.js:12-46`) would fight anything script-based anyway. First-party primitives already exist and should be extended rather than replaced.

- **`src/lib/attribution.ts`** — extend `parseAttribution(url, referer)` with an `aiSource` classification: referrer hosts `chatgpt.com`, `chat.openai.com`, `perplexity.ai`, `claude.ai`, `copilot.microsoft.com`, `gemini.google.com`, plus the `utm_source=chatgpt.com` parameter ChatGPT appends to outbound links. `captureAttribution()` (`src/lib/server/attribution-cookie.ts`) already runs on both landing loads, so signups inherit it with no further wiring. `tests/attribution.test.ts` and `tests/waitlist-attribution.test.ts` extend naturally.
- **Crawler observability** — new `src/lib/server/crawler-log.ts` with a UA→bot table covering the Phase-1 agents plus `Googlebot`, `Meta-ExternalAgent`, `Amazonbot`, `Bytespider`, called from `appHandle` on page routes only. Record via **`trackAnonymousEvent()`** (`src/lib/server/events.ts:26`), which writes to `funnel_events` — not `trackEvent()`, which requires a `restaurantId` and writes to `system_notifications`. Add an in-memory dedup `Set` keyed on `(bot, path, day)`; `numReplicas: 1` makes a per-process Set sufficient, and without it a crawler burst writes thousands of rows a minute. `/admin/events` reads only `system_notifications`, so this needs a **new** `src/routes/(admin)/admin/crawlers/` page, following the `handleLoad` + `db.execute(sql...)` pattern in `admin/events/+page.server.ts`.
- **Be honest about the ceiling**: AI Overviews referrals are *indistinguishable* from ordinary Google referrals — no parameter, no distinct referrer, and GSC does not break out AI Overview impressions. ChatGPT appends `utm_source=chatgpt.com` inconsistently, so its presence proves ChatGPT but its absence proves nothing. Claude sends `claude.ai` only on explicit citation clicks. AI-referral counts are a lower bound, never a share — which is why crawler coverage is the more honest metric. Compensate with a fixed list of ~20 target questions checked manually in each engine monthly, logged under `docs/onboarding/marketing/05_medicion/`.
- **KPIs for a pre-launch product**: waitlist signups segmented by `aiSource` (the metrics doc is right that signups are the only metric that matters yet), AI-crawler coverage per URL, citation share across the 20 tracked prompts, and the es/en language split that `05_medicion/metricas.md:46` currently lists as unanswerable — Phase 2 makes it answerable.

---

## Phase 7 — Content and authority playbook

Rewrite `docs/onboarding/marketing/03_canales/contenido_y_seo.md` **in place** (⚪ → 🟡) rather than adding a competing doc. Keep its three angles (normativa / coste / oficio) and its production rules, and add: the query fan-out method, the answer-first template from Phase 3, the 20-prompt tracking list, and the off-site authority playbook — industry listicle targets, G2/Capterra presence, and the gestoría partnerships already hypothesised in `03_canales/gestorias.md`.

Update the inventory row in `00_base/00_mapa.md`. Add `06_decisiones/MDR-002-*.md` for the Spanish-first content decision. Record the content-authoring workflow under `docs/04_engineering/`.

---

## What NOT to build

Stated explicitly so it does not get picked up later as an obvious-looking win:

- **`llms.txt`** — there is no evidence any major engine consumes it. It is a 20-line generated route if you want it for completeness, but it is not a ranking lever and should not be sequenced as one.
- **Dynamic OG image generation** — zero AI-citation impact.
- **Third-party analytics** — fights hash CSP, and the first-party path already answers the pre-launch questions.
- **Programmatic landing-variant expansion** — thin pages, and rule 1 makes machine-generated product claims genuinely dangerous here.
- **Competitor comparison pages** — high AI-citation value, but blocked by rule 7. Category comparisons ("hoja de cálculo vs software de control de coste") get most of the benefit while staying inside the rules.
- **`HowTo` and `speakable` schema** — HowTo rich results were removed by Google; `speakable` never got adoption.
- **Prerendering the landing pages** — the waitlist counter and the attribution cookie make it unsafe. Fix the cold start instead.
- **`Accept-Language` redirect negotiation** — Google advises against it; it breaks crawl determinism.
- **Per-agent robots.txt groups** — see Phase 1: they silently discard the entire disallow list.

---

## Sequencing

The repo caps hand-written PRs at 800 added lines and serialises by surface, and `src/lib/i18n.ts` is a one-session-at-a-time surface. So:

| PR | Phase | Surface | Blocks |
|---|---|---|---|
| 1 | 0 — truth audit | `i18n-messages.ts` | everything |
| 2 | 1 — origin, robots, sitemap, railway | `seo/`, robots, sitemap | 3, 4 |
| 3 | 2a — SSR locale fix + toggle-as-link | **`i18n.ts` (exclusive)** | 4 |
| 4 | 2b-2e — route move, matcher, hreflang | `routes/` (exclusive) | 5, 6 |
| 5 | 4 + 5 — seo module, schema, OG | `seo/`, landing | — |
| 6 | 3 — content system | `content/`, `routes/` | — |
| 7 | 6 — measurement | attribution, hooks, admin | — |
| 8 | 7 — docs | `docs/` | — |

PR 7 runs in parallel with 4-6 (different surfaces). Everything else is serial.

**Ranked by actual leverage:**

1. **Phase 0.** Not optional and not paperwork. Everything else amplifies whatever is on the page.
2. **The SSR locale fix.** Half the content does not exist for any non-JS crawler today. Nothing else matters as much.
3. **The language toggle becoming a link.** One line; converts an undiscoverable tree into a crawlable one.
4. **Linked sources on every figure.** Strongest single E-E-A-T signal available, and it is copy work.
5. **Allowing all AI crawlers with a *single-group* robots.txt.** The program is a no-op if `OAI-SearchBot` is blocked — and the per-agent-group trap makes it easy to block the app surface accidentally while trying to allow.
6. **`sleepApplication: false`.** A crawler that times out does not come back soon.
7. **Prerendered content pages with answer-first structure.** The actual citation surface; the landing page is a conversion asset, not a citation asset.
8. **Server-side crawler logging.** The only provable metric in the program.

If only one thing ships, make it Phase 0 followed by the SSR locale fix.

## Verification

Per phase above, plus end-to-end before calling it done:

1. `pnpm check && pnpm test && pnpm lint:i18n && pnpm lint:no-comments`
2. `pnpm build && node build`, then fetch `/robots.txt`, `/sitemap.xml`, `/waitlist`, `/en/waitlist`, `/guias`, and one article.
3. `curl -A "GPTBot" .../en/waitlist` — English in the raw HTML, `<html lang="en">`, correct canonical and reciprocal hreflang. This is the acceptance test for the whole plan.
4. Schema validators against the deployed landing and one article.
5. Post-deploy: Search Console URL inspection on both locale trees; confirm AI-crawler hits appear in `/admin/events`.
