# ADR-033 — The Rendered Locale Is Request State on the Public Surface

**Status:** Active
**Feature:** Experience (i18n)
**Date:** 2026-08-29
**Programme:** [GEO phase 2a](../../05_operations/geo_program_plan.md)

## Context

[ADR-021](ADR-021-bilingual-single-string-table.md) put both locales in one
in-repo table and reached them through a module-level store:

```typescript
export const locale = writable<Locale>('es');
```

`initLocale()` corrected that store from `localStorage` inside `onMount`. The
consequence was written down at the time and accepted: *"the locale store is
client-side only. SSR always renders Spanish; the client corrects on hydration
if the user chose English."* The cost was framed as a flash of Spanish for
English users.

That framing was incomplete. GPTBot, OAI-SearchBot, PerplexityBot, ClaudeBot
and Googlebot's HTML pass do not execute the hydration step. For them the
English half of a 4,299-key table did not exist — not "loaded late", not
"ranked lower": absent from every byte they ever saw, including `<html
lang="es">`, which `src/app.html` hardcoded. Half the product's copy was
invisible to exactly the retrieval systems the GEO programme exists to reach.

Two ways to fix it were considered and rejected:

- **Set the module store on the server.** One line: `locale.set(resolved)` in
  a load function. Under `adapter-node` a module is shared across every
  concurrent request, so request A (English) mutates what request B (Spanish)
  renders. Svelte's SSR render being synchronous makes it *usually* work,
  which is precisely what makes this class of bug ship and then resurface as
  unreproducible wrong-language pages under load.
- **Migrate the whole app to a context translator.** ~82 modules import from
  `$lib/i18n.ts`. The authenticated app is single-session and `noindex`; it
  gains nothing from the change and pays for it in diff size and risk.

## Decision

**The locale the server renders is derived per request; the module store keeps
the user's preference.** They are two different things and are now two
different mechanisms.

- `src/lib/locale-url.ts` — `parseLocale`, `otherLocale`, `requestedLocale`,
  `localeHref`. Pure, no Svelte, no server imports.
- `src/lib/server/locale.ts` — `resolveLocale(url, cookie)` returns
  `{ locale, explicit }` with precedence **query parameter → `mep-locale`
  cookie → `es`**, and `rememberLocale(cookies, locale)` persists an explicit
  choice. No `Accept-Language` negotiation: Google advises against
  locale-redirecting crawlers because it caches one variant and makes crawling
  nondeterministic.
- `src/hooks.server.ts` puts the result on `event.locals.locale` and
  substitutes it into the `%mep.lang%` placeholder in `src/app.html` via
  `transformPageChunk`, so `<html lang>` is correct for every route, app
  surface included.
- `src/routes/+layout.server.ts` calls `resolveLocale` again from `url` and
  `cookies` rather than reading `locals`. This is load-bearing: SvelteKit
  re-runs a server load only when something it *read* changed, and `locals` is
  not a tracked dependency. Reading `locals.locale` there produces a load that
  is cached forever on the client, so a client-side navigation to a different
  locale renders the old language — verified in a browser before this shape
  was settled on.
- `src/lib/i18n-context.ts` — `setLocaleContext(store)`, `getLocale()`,
  `getT()`, `getTi()` over the same `translations` table. The root
  `+layout.svelte` provides the context with `toStore(() => data.locale)`, a
  store created per component instance, so nothing is shared between requests.
  `getLocale()` throws when no parent set the context rather than defaulting
  to Spanish — a missing provider is a bug, not a locale.
- `LandingPage.svelte` takes `baseT` / `baseTi` / `locale` from the context.
  Its `derived(...)` wrappers for variant overrides, and every `$t(...)` call
  in the template, are untouched.

**The authenticated app keeps the module store.** It is single-session and
`noindex`; the leak the context solves cannot be observed there. This is
deliberate, and it is recorded here so that a later change does not "finish
the migration" and reintroduce the shared-module hazard from the other side.
If the app surface ever needs SSR-correct copy, the answer is to extend the
context provider down into `(app)`, never to call `locale.set()` on the server.

**The language toggle is a link.** `LandingPage.svelte` rendered
`<button onclick={toggleLocale}>`, which meant no crawler could reach the
English rendering from the Spanish one — an alternate that exists but cannot
be followed is an alternate that does not get indexed. It is now
`<a href={alternateHref} hreflang rel="alternate">`, and its click handler
still writes the preference so the authenticated app remembers it.

`initLocale()` now mirrors that preference into the `mep-locale` **cookie** as
well as `localStorage`. `localStorage` is invisible to the server; the cookie
is what lets the next request render the right language before any JavaScript
runs. An explicit server locale wins over a stale `localStorage` value.

### The URL is provisional

This phase addresses the locale in one place: `?lang=en`. That is a bridge,
not the destination. GEO phase 2b moves the public routes to
`[[lang=locale]]` so English gets `/en/waitlist` — its own address, canonical
and hreflang. Until then the canonical stays on the bare Spanish path, so
`?lang=en` is explicitly *not* a separate indexable page. `localeHref()` is
the single function 2b rewrites.

## Consequences

- **English is server-rendered.** `curl -A GPTBot .../waitlist?lang=en`
  returns `<html lang="en">` and English body copy with no JavaScript. That
  single check is the acceptance test for the whole phase.
- **The public surface and the app surface now read the locale differently.**
  Two mechanisms for one concept is a real cost. The boundary is
  `src/lib/i18n-context.ts` (public, request-scoped) versus `$lib/i18n.ts`'s
  `locale` (client-only preference), and it holds only as long as someone
  reads this ADR before unifying them.
- **A component under the public surface that forgets the provider throws**
  rather than silently rendering Spanish. Intentional, and the reason
  `getLocale()` has no fallback.
- **`Vary: Cookie` already applied.** `applyPrivateCacheHeaders` sets
  `private, no-store` plus `Vary: Cookie` for every routed response, so a
  cookie-varied render cannot be cached across users. A future public cache
  layer must keep that header.
- **One preference, two stores, converging.** Existing users carry the choice
  in `localStorage` only; their first request after this ships still renders
  Spanish, and the cookie is written on mount so every request after it is
  correct. A returning English user sees one Spanish render, once — the same
  flash ADR-021 accepted, now self-healing instead of permanent.
- **`?lang=` is a URL shape we intend to delete.** Leaving it in place after
  phase 2b would give the English rendering two addresses and no canonical of
  its own. It is called out here so 2b removes it rather than adding to it.
- **`src/app.html` carries a non-SvelteKit placeholder.** `%mep.lang%` is only
  substituted for responses that pass through `appHandle`'s resolve; every
  bypass path (`/_app/*`, `/favicon.ico`, `/sw.js`, the manifest) serves
  assets, not HTML. `tests/ssr-locale.test.ts` pins the placeholder and its
  substitution together so neither can be removed alone.

## Related

- [ADR-021](ADR-021-bilingual-single-string-table.md) — the string table this
  amends. Its "SSR always renders Spanish" consequence no longer holds on the
  public surface.
- [ADR-020](ADR-020-both-viewports-rendered-css-chooses.md) — the other
  render-everything-server-side decision
- [GEO programme plan](../../05_operations/geo_program_plan.md) — phase 2a, and
  what 2b still owes
