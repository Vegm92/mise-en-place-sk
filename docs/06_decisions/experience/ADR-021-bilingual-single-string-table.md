# ADR-021 — One In-Repo String Table, Spanish First, Enforced in CI

**Status:** Active
**Feature:** Experience (i18n)
**Date:** 2026-08-09
**Issues:** [#294](https://github.com/Vegm92/mise-en-place-sk/issues/294), [#337](https://github.com/Vegm92/mise-en-place-sk/issues/337), [#338](https://github.com/Vegm92/mise-en-place-sk/issues/338)

## Context

The product is Spanish-first for independent restaurants in Spain, with English
as a second locale. Two locales, one team, ~1300 keys.

The usual answer is an i18n library with per-locale JSON files, ICU message
formatting, and a translation-management workflow. Every part of that is real
overhead: a build step, a runtime dependency, files that drift out of sync, and
a plural/gender engine for a product whose strings are overwhelmingly simple.

The problem worth solving is not formatting sophistication. It is **leakage** —
the hardcoded Spanish string that ships in a component because writing
`"Guardar"` is easier than adding a key. Once the first one ships, English is
quietly broken and nobody notices until a user does.

## Decision

**One TypeScript file, `src/lib/i18n.ts`, holds both locales in one object**, with
Svelte stores as the accessor and a CI gate that makes leakage a build failure.

```typescript
export const locale = writable<Locale>('es');
export const t   = derived(locale, …);   // key → string
export const ti  = derived(…);           // key + interpolation vars
export const tcat = derived(t, …);       // category canonical → display
export const tiv = derived(…);           // invoice/notification variants
export const tp  = derived(…);           // pluralisation
```

Spanish is the **default and the fallback**, not English — for a Spanish-first
product, an untranslated string should degrade to the language most users read.

Both locales sit side by side in the same object literal, so adding a key without
its English twin is visible in the diff rather than in a second file nobody
opened. TypeScript types the key set, so a typo is a compile error.

The choice persists to `localStorage` (`mep-locale`) via a store subscription,
guarded for SSR.

### `lint:i18n` makes the invisible failure loud

`scripts/check-i18n-strings.mjs` runs in CI on every `.svelte` file under `src/`,
in three passes:

1. **Template** — parses the Svelte AST and flags text nodes and user-visible
   attributes (`placeholder`, `title`, `aria-label`, `alt`). Working from the AST
   rather than regex is what keeps inline styles and expressions from being
   mistaken for prose.
2. **Script** — flags string literals assigned to label-ish properties, plus any
   literal carrying Spanish orthography (`ñ`, accented vowels, `¿`, `¡`), which is
   prose by definition.
3. **Keys** — flags a literal key passed to `$t`/`$ti`/`$tiv`/`$tp` that no locale
   table defines (issue #661). The first two passes catch prose that never reached
   the table; this one catches prose that was *supposed* to be in the table and
   is not, which fails silently as an uppercased raw key on the screen. The key
   set is read back off the locale tables in `i18n.ts` (`scripts/i18n-keys.mjs`),
   so it cannot drift from the catalog, and a key assembled at runtime is skipped
   rather than guessed at — an unresolvable key is not evidence of a missing one.

Language-neutral tokens are allowlisted: the brand name, currency codes, unit
abbreviations, date-format strings. Two pages are skipped wholesale —
`/privacy`, `/terms` — because legal copy carries its own locale-keyed content
and does not belong in the app string table (issue #408). `/waitlist` used to
be a third exemption; issue #407 moved its copy into the shared table under a
`waitlist.*` namespace, reusing `billing.*` keys wherever the pricing copy is
byte-identical, so it is checked like any other route. Its scroll-reactive
mock illustrations (`src/lib/components/waitlist/*Mock.svelte`) stay skipped —
fixture-like demo data (product names, line items), not real UI copy.

This gate is the decision. Without it, the "one file, no library" approach decays
into hardcoded Spanish within a quarter.

### Server-generated content stores keys, not sentences

Alerts persist `messageKey` + `messageVars` in their payload rather than rendered
text ([ADR-010](../insights/ADR-010-alerts-computed-on-save.md)), and extraction
failures persist an error key rather than a provider message
([ADR-006](../extraction/ADR-006-file-classification-routes-extraction.md)).

Rendering is deferred to display time in the reader's locale. A notification
written in June reads correctly in English in August if the user switched
language — and, incidentally, no user-facing sentence is ever assembled where
provider text or document content could be interpolated into it.

## Consequences

- **The whole string table ships in the client bundle**, both locales, ~2650 lines.
  No lazy loading, no per-locale chunks. Every string is available synchronously
  with no loading state, at the cost of bundle size — the right trade at two
  locales and the wrong one at ten.
- **A third locale is a real decision, not an increment.** Adding one means a
  third value on ~1300 keys in the same object, and at that size the file itself
  becomes the argument for splitting to per-locale resources.
- **Translation is a code change.** No TMS, no external translator workflow. Fine
  for a bilingual team; the constraint to revisit if translation is ever
  outsourced.
- **`lint:i18n` can produce false positives** on legitimately language-neutral
  literals. The fix is the allowlist in the script, not an inline suppression —
  which keeps every exception in one reviewable place.
- **The missing-key pass is deliberately partial.** It only sees keys written as
  literals; the ~40 call sites that build a key from a variable or a template
  literal stay uncovered by the linter and are covered by tests that derive the
  key list from the source that emits it.
- **The locale store is client-side only.** SSR always renders Spanish; the client
  corrects on hydration if the user chose English. A visible flash for English
  users on first paint, accepted because Spanish is the majority locale.
- Icons and colours for notification types live in `notification-display.ts`,
  keyed by type rather than by message text, so presentation stays locale-neutral.

## Related

- [ADR-010](../insights/ADR-010-alerts-computed-on-save.md) — why alerts store keys
- [ADR-022](../conventions/ADR-022-invariants-enforced-in-ci.md) — the other CI invariant gates
