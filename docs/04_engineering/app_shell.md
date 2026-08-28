# App Shell

The authenticated app shell (`(app)` route group), the public waitlist page, and the
shared UI/library/worker-support code they are built on. Condensed per-file notes.

## Code notes

### `src/routes/(app)/+layout.server.ts`

**`const load`**
- Every restaurant this user belongs to, for the location switcher (issue #290). One row for almost everyone; the switcher only renders when there is something to switch to.
- For existing users who never got a tutorial row, skip the tour silently.
**`property quotaLimit`**
- null = unlimited; shared convention in billing.resolveMonthlyQuota (#295).
**`property restaurantName`**
- The settings override exists for tenants that set a display name; the restaurants row is the source of truth after a rename (issue #293).

### `src/routes/(app)/+layout.svelte`

**`const curPath`**
- Seed tutorial store from server data on each navigation.
**`const showReviewCoachMark`**
- The tour is a single coach mark on the batch review page (issue #230). The upload-zone mark that used to come first explained an empty state whose own headline already said the same thing, on top of four other first-session overlays. '1' is the stored step for "tour not seen yet" — accepted here too so users mid-tour (and anyone who used "repeat the tour") still get it.
**`const showComplete`**
- Completion card: first invoice landed on dashboard.
**`const TOUR_PAGES`**
- App-wide walkthrough (steps 3-11): one coach mark per main page, in nav order.
**`const showTourNudge`**
- Dashboard nudge offering the app-wide walkthrough — persists until accepted/dismissed.
**`const revealAll`**
- Progressive disclosure (issue #231): before the first saved invoice, every section below Invoices is an empty state — eight of them, plus a quota meter for a quota nobody has touched. They reveal after the first save, when they start having something to show.
**`const navSections`**
- Nav is three labelled sections rather than a flat list (#706). The subscription-gated pages sit together under Inteligencia with one PRO chip on the group heading, instead of a pill on each of the three rows they used to be scattered across.
- Each heading is a disclosure button; collapse all three and the rail is the upload CTA, three headings and the footer. The collapsed set persists under `mep-nav-sections-collapsed`, keyed by stable section ids and not by the translated label, so a language switch does not reset it. A collapsed section rolls its pending counts up onto the heading and tints that heading with the accent when the current route is inside it — hiding a section must not hide either the count or where you are.
- Colour follows ADR-026: `--mep-acc` is left on the active row and the you-are-here heading tint, both of which the ADR lists under "active nav". The PRO chip, the collapsed rail's lock dots and its sparkles divider are neutral, because they mark entitlement state and blue would read as a button. The count badge stays on `--mep-warn` (4.55:1 light / 5.04:1 dark); the `--mep-caution` rung would fail AA on light at 3.89:1.

**`const switchingLocation`**
- Switching writes the active_restaurant cookie server-side, then a full reload so every layout query re-runs against the new tenant (issue #290).
**`function switchLocation`**
- fall through — the select resets on the next render.
**`markup`**
- The location switcher labels itself Restaurante / Restaurant, on the same row as the select. At 232px of rail an uppercase RESTAURANTE left 93px for the control and truncated the tenant's own name, so the label is sentence case; the dropdown is right-aligned with a 186px minimum instead of matching its trigger's width.
- Mobile overlay; sidebar (brand, location switcher — only when there is somewhere to switch to, #290 — upload CTA, primary nav, quota widget — hidden until the first invoice is saved, #231 — quotaLimit null → unlimited, nothing to fill up, #295 — util links — Ajustes and Ayuda (#569) — legal footer, user chip). The util links carry the language and theme toggles below `md` only (#660): the off-canvas drawer is the mobile overflow menu, so the header row keeps just the hamburger, the title, the bell and the upload CTA.
- Main area: TopBar (universal header, mobile + desktop), mobile hamburger (kept for fallback pages not yet mobilised), title, chat (desktop only — sidebar nav handles mobile), language toggle (desktop only, #660), notification bell, theme toggle (desktop only, #660), upload CTA (mobile only).
**`const pageTitle`**
- `$page.data.title` is an i18n key, not copy — a route that returns none falls back to the app name, which is what #660 fixed across `/billing`, `/products/[id]`, `/plantilla-lista`, `/suppliers/[id]` and the two confirmation pages. `titleParams` is the escape hatch for a title that names a record (`/invoice/[id]` → `inv.detail.pageTitle` = `Albarán {number}`); it resolves through `ti` so the string stays translated.
- The header is `.shell-header` / `.shell-title` in `app.css` rather than inline styles, because the title needs a media query: 16px below `md`, 20px from `md` up. At 390px the title box is 240px, which fits the longest title in either locale (#660).
- Page content — a `<main>` landmark contains a post-hydration client render/effect error (e.g. the /batch/[id] polling loop, the chat page) to this region so the shell survives; +error.svelte still covers load errors.
- Tutorial coach marks: completion overlay and the app-wide tour nudge (small dismissible corner card, persists across dashboard visits) — both carry svelte-ignore a11y_no_static_element_interactions.
- All of it renders *inside* the `.mep` container (issue #569). It sat outside as a sibling, which costs nothing visible until you look for the accent: `--mep-acc` is scoped to `.mep[data-accent=…]`, so the primary buttons and the spotlight ring resolved to nothing in both themes.
**`const tourPages`**
- The tour is `TOUR_PAGES` minus what this plan cannot reach, resolved once (issue #569). Numbering the dots off the full list told a trial account "step 6 of 9" and then finished at 7; the filtered list is also what `advanceTour` steps through, so there is one definition of "the next step".
**`function advanceTour`**
- Awaits the step write before `goto`. See `src/lib/stores/tutorial.ts`.
**`const showTourStep`**
- No accessibility check here any more — `tourPages` has already dropped the gated pages. The `$effect` below still recovers a *stored* step that has since become inaccessible (a plan downgrade mid-tour), which is the one case the filter cannot express.
**`const upgradeFeatures`**
- The upgrade dialog lists what a PRO plan buys as three rows instead of one sentence, so `sidebar.upgradeToProDesc` is now just the lead and each feature is its own key (`sidebar.upgradeFeat*`) with its own nav icon. Icons are the same ones the sidebar uses for those routes, so the row and the nav item a blocked click came from look like the same thing.
- The dialog takes ConfirmDialog's anatomy — icon + title on one row, copy left, actions right at 36px — rather than the centred, 50/50-button shape it had. Every value is a token: `--mep-overlay` for the surface (not `--mep-bg`, which is the page behind it), `--mep-scrim`, `--mep-shadow-pop`, `--mep-r-card`, `--mep-row-h` for the rows. It renders inside the `.mep` container for the same reason the tour chrome does — `--mep-acc` and `--mep-row-h` are scoped there, not to `:root`.

### `src/routes/(app)/+page.server.ts`

**`function remainingMonthlyQuota`**
- Returns the number of invoices the tenant can still add this calendar month, or null when no plan quota is configured (treated as unlimited). Best-effort: never blocks the upload path on a DB error. Shared quota convention (issue #295) — null means unlimited.
**`property error`**
- An i18n key (issue #294) — the panel translates it. `errorVars` carries the interpolation values that survive a redirect.
**`property upload`**
- A lapsed trial (or a cancelled/past-due subscription) may keep reading its data, but must not start new paid work (issue #287). First thing in the action: an expired tenant gets sent to /billing without uploading a 20 MB file first, and never reaches the rate limiter or quota gate.
- Use typeof check instead of instanceof — SvelteKit's internal File class may differ from globalThis.File across Node.js versions, causing instanceof to silently drop files.
- Each upload consumes a paid Gemini extraction — cap batch submissions per tenant regardless of plan quota: `rateLimitScoped({ scope: 'tenant', name: 'upload', max: 10 }, { restaurantId: rid })` (ADR-029).
- Plan quota gate — block before consuming any Gemini extraction and redirect (not fail) to /billing to upgrade, so the message + upgrade CTA render reliably for both the XHR and no-JS submit paths via the page's error banner. Skipped when no quota is configured.
- Random storage namespace — generated before the batch exists so files can be saved first; it does not need to match the batch id.
- Every file rejected by validation — report the first reason with the offending filename (issue #294); reasons are i18n keys.
- One batch, one item per invoice — no chained sessions.
- Start extraction right away — the upload CTA promises "extract data", so landing on the batch page must not require a second click.

### `src/routes/(app)/dashboard/+page.server.ts`

**`const load`**
- SSR'd so the trend chart renders with the rest of the dashboard instead of flashing a client-side "Loading…" state on every visit.
- Sparkline — daily spend for selected month.
**`function relativeTime`**
- Alerts.
**`const actions`**
- Guarded transitions (issue #243) — markPaid now also records paidAt (the reminders action always did) and markUnpaid clears the stale timestamps.

### `src/routes/(app)/dashboard/+page.svelte`

**`const currentMonthStr`**
- Period picker — derived values shared between mobile and desktop.
**`markup`**
- Mobile dashboard and desktop dashboard (the latter wrapped in ErrorBoundary).

### `src/routes/(app)/settings/+page.server.ts`

**`const WHATSAPP_ENABLED`**
- The WhatsApp card is pointless when the bot isn't wired up — authorising a number would do nothing, because no webhook is delivering messages.
**`const WHATSAPP_BOT_NUMBER`**
- The bot's own number, resolved once at boot (issue #319). Authorising a staff number is only half of onboarding — the staff member also has to know *what number to message*, and nothing in the app ever said. The QR is the one that matters in practice: it gets printed and stuck in the kitchen, so nobody types a phone number into a shared handset. Null when `WHATSAPP_DISPLAY_NUMBER` is unset or unparseable; the card then renders its authorisation half exactly as before rather than a broken link.
**`property qrSvg`**
- The QR encodes the same wa.me link, so scanning and tapping land in the same chat. Rendered once at boot — it never varies per tenant.
**`const load`**
- Locations this user belongs to (issue #290).
- Live enrolment code, if the owner has one outstanding (issue #320).
**`property profile`**
- Profile section (issue #293).
**`property hasPassword`**
- Google-only signups never get a `passwordHash` row — the Credentials provider is the only thing that writes one — so this hides the change-password form for them.
**`property locations`**
- Multi-location (issue #290).
**`property whatsappEnabled`**
- WhatsApp invoice bot — authorised sender numbers.
**`property whatsappBotNumber`**
- …and where to send those invoices (issue #319).
**`property whatsappPairingCode`**
- Self-service enrolment (issue #320).
**`property alertPreferences`**
- Per-type alert toggles (issue #577), loaded alongside the two thresholds so the Alertas pane renders in one round trip.
**`property alertGroups`**
- The grouping the pane iterates. Shipped from the server rather than duplicated in the component, so the registry in `alert-preferences.ts` stays the only list of alert types.
**`property saveAlertPreferences`**
- Writes every toggle in one go (issue #577). An unchecked checkbox is simply absent from the form body, so the action iterates the registry and treats "missing" as off — reading only the present keys would make a type impossible to disable.
**`property saveName`**
- Profile (issue #293). Display name — stored on the `users` table (Auth.js's own adapter table), read by the layout.
**`property saveEmail`**
- Email change. The app mints its own verification token and emails a confirmation link to the *new* address (`/settings/confirm-email`); the address only changes once that link is followed, so this reports "check your inbox", never "done".
**`property changePassword`**
- Password change while signed in. The current password is re-verified first — an unattended session must not be enough to take over the account. Same brute-force budget as the login form, keyed on the account (`password-change:${userId}`, 5).
- Bumps `users.token_version` (issue #478) so every other outstanding session is forced to re-authenticate, then immediately re-issues this device's own cookie via `issueSessionCookie` — otherwise the request that just changed the password would invalidate itself too.
**`property addLocation`**
- Add a location (issue #290). Business tier only, capped at the tier's maxLocations. The new restaurant is a child of the paying one, so it inherits the plan instead of starting its own trial, and the caller becomes its owner. Data stays fully separate — only billing is shared.
- Slug carries a random suffix for the same reason onboarding's does: two restaurants may legitimately share a name.
- Plan name/quota for the new location mirror the paying subscription.
- Switch to it — adding a location and then having to find the switcher would be a strange place to stop.
**`property renameRestaurant`**
- Rename the restaurant. Owner-only; the slug stays fixed. Keep the settings override in step so the header does not keep showing the old name for tenants that have one.
**`property addWhatsappContact`**
- WhatsApp bot: authorised numbers. Authorise a phone number to send invoices for this restaurant. Owner-only: an authorised number can inject invoices into the tenant and spend its extraction quota, so this is the same trust level as renaming the venue.
**`property removeWhatsappContact`**
- De-authorise a number. Owner-only, tenant-scoped.
**`property generateWhatsappPairingCode`**
- Mint a pairing code (issue #320). Same owner-only gate as typing a number in by hand — the code is a bearer token for exactly that privilege.
**`property revokeWhatsappPairingCode`**
- Cancel the outstanding code — e.g. it was read out to the wrong person.
**`function requireOwner`**
- True when this user owns the restaurant.

### `src/routes/(app)/settings/+page.svelte`

**`const feedback`**
- Profile forms (issue #293) each report into their own card; `section` identifies which one the last submit came from.
**`const formatTime`**
- Pairing codes expire in minutes (issue #320), so the owner needs the wall clock, not a date — they are relaying this to someone standing next to them.
**`const botNumberCopied`**
- Copy the bot number (issue #319). Staff often read it off one phone and type it into another; copying removes the step that goes wrong.
**`function copyBotNumber`**
- Clipboard blocked (insecure context, denied permission) — the number is on screen and selectable, so there is nothing to recover from.
**`const searchIndex` / `const results`**
- The rail search. Six sections hide ~25 individual settings, so the rail alone answers "which section is X in?" only if you already know. The index is a list of i18n keys paired with their section; matching runs on the resolved label, so it searches in whatever locale is on screen. Picking a result clears the query and switches both branches at once — the desktop rail and the mobile panel share one `query`.
**`const pendingOf` / `function discard` / `const savableForm`**
- One save bar per section replaced the six scattered Save buttons. `pendingOf` counts fields that differ from the loaded `data`, which is what makes "2 unsaved changes" and Discard possible without tracking edits.
- The bar's Save is a `<button form="…">` rather than a wrapping `<form>`: the Cuenta section already contains the email and password forms, and HTML forbids nesting. Each section's settings form is an empty `<form id>` at the top of the file and the fields point at it, so the bar can submit a form it does not contain.
- Flow actions keep their own buttons — changing an email sends a confirmation link, changing a password revokes sessions, deleting is irreversible. Those are not settings that get saved, and folding them into a bulk Save would make them accidental.
**`markup`**
- Row shape: label plus its explanation on the left, control on the right. The explanation used to hang under the control, which left the control column ragged and the label column empty.
- Alertas pane: the two thresholds and one switch per alert type (issue #577), grouped and labelled from `data.alertGroups`, all in one form posting to `saveAlertPreferences`. The action persists the thresholds only when their fields are present, so the older toggles-only callers still work.
- Password and the delete-account block are disclosures. Three password fields and a permanent red warning were both always on screen for something done once a year.
- Where to send invoices (issue #319). Authorising a number is useless if the staff member never learns what to message. QR injected via `{@html}` (eslint-disable-next-line svelte/no-at-html-tags).
- Self-service enrolment (issue #320). The number is captured from the message, so it cannot be mistyped the way the form below can.
- Ayuda pane: the tour-reset form, a card link to `/help` (issue #569) and the FAQ questions as links into it. The pane is where users already come looking for guidance, so it points at the documentation rather than duplicating it.
- Below `md` the sections are a list that pushes one panel at a time with a way back, not an accordion (issue #650 asked only that the desktop rail stay off small screens). Section bodies are still written once in `sectionBody` and rendered by both branches; the `idp` prefix keeps the two copies' element and form ids apart.
- The `settings-main` tour anchor sits on the section container, not inside the Ayuda pane where it started. The last step of the tour lands on `/settings` with whatever section was last open — usually Cuenta — so an anchor inside one pane meant the tour ended by rendering nothing and never dismissing itself.
**`style`**
- `.alert-toggle*` (issue #577): a visually-hidden checkbox drives a CSS track/thumb, so the switch keeps native keyboard focus, form submission and label semantics without a component.
- `.set-savebar` is `position: sticky`, not fixed or absolute: the app shell scrolls in `<main>`, so a page-local absolute bar pins to the bottom of the content rather than the window.
- `.set-mob` sets `display` only below `md`. A scoped rule outranks Tailwind's `md:hidden`, so declaring `display: flex` unconditionally left the mobile branch rendering underneath the desktop one.
- WhatsApp bot number + QR (issue #319).
- Pairing code (issue #320) — read off a screen and typed into a phone, so set large, monospaced and widely tracked.
- The QR is meant to be printed and taped up in the kitchen, so sized in absolute units — 45 mm on paper scans reliably from arm's length.
- Explicit white backing: a dark-theme card behind a transparent QR inverts the modules and scanners reject it.

### `src/routes/(app)/help/+page.svelte`

**`const searchIndex` / `const areas`**
- The four areas are a rail like the one on `/settings`, so the two screens a user bounces between read as a pair. Search covers all nineteen entries — steps, tips and questions — and matches on body text as well as titles, because people search for the word in the answer.
- The rail is client-side: without JavaScript only the opening area renders. The trade is deliberate — nine tips and six questions in one scroll was the thing being fixed — but it is why the FAQ stays `<details>` below.
**`markup`**
- The help centre (issue #569): getting-started guide, per-section tips, FAQ and a launcher for the guided tour. Static documentation — no server load beyond the page title, which is why the route has a `+page.ts` and no `+page.server.ts`.
- Steps, tips and questions are rendered from the lists in `src/lib/help-content.ts` rather than written into the markup, so the copy stays entirely in the locale tables and adding an entry is a one-line change in two places (the list and both locales).
- The tour launcher goes through `setTutorialStep('3')` (`src/lib/stores/tutorial.ts` → `POST /api/tutorial`) and then navigates to `/dashboard`, the same entry point as the dashboard nudge in `(app)/+layout.svelte`. Step `3` is the first of `TOUR_PAGES`; steps `1`/`2` only render their coach mark on `/batch/[id]`, so starting there would look like nothing happened.
- `HELP_TIPS` is also the tour's script: every `TOUR_PAGES` entry names one by `tip`, and the coach marks render `help.tip.*` directly. The walkthrough and the documentation are the same words, so neither can go stale on its own; `tests/guided-tour.test.ts` holds the two lists to the same order.
- FAQ entries are native `<details>`/`<summary>`: they open without JavaScript and keep the disclosure semantics a hand-rolled accordion would have to re-add.

**`style`**
- Scoped, and single-markup rather than the `mobile/*`/`desktop/*` split (ADR-020): one set of markup, with the rail becoming a row of pills and every grid collapsing to one column below `md`.
- `.help-prose` caps line length at 72ch. Prose is the whole page here; full-width paragraphs on a 1280px screen are unreadable.
- The steps grid is 2×2 at `md` with `nth-child` dividers rather than four cards: the four steps are one sequence, and gaps between cards read as four unrelated things.

### `src/lib/help-content.ts`

**`function helpContentKeys`**
- The page resolves its keys at runtime (`` $t(`help.faq.${item}.q`) ``), which `lint:i18n` cannot follow. This derives the same key list from the same source so `tests/help-page.test.ts` fails on missing copy instead of the UI rendering a raw key — the convention documented in `coding_conventions.md`.

### `src/routes/waitlist/+page.server.ts`

**`property join`**
- Honeypot (bots fill hidden fields, humans leave them empty) and a 5-submissions-per-minute-per-IP cap, both via `publicFormAction` (`src/lib/server/public-form-action.ts`, issue #391). Rate-limit key `waitlist:${ip}`.

### `src/routes/waitlist/+page.svelte`

**`const extractLines`**
- Mock data.
**`const CH`**
- Compute chart bar positions in script so SVG can use plain numbers.
**`markup`**
- Open Graph, Twitter / X Card, structured data (JSON-LD).
- Sections: nav, masthead, hero (left rail, center headline + form, right rotated extract preview), integrations strip, Pain — Chapter I, How — Chapter II, product mock (replaces PNG screenshots: capture faux invoice + WhatsApp bubble, extract structured invoice table, dashboard stacked bar + alert with SVG pre-computed positions), Testimonials — Chapter III, final CTA inverted, footer.
**`PAID_TIERS` / pricing cards**
- Copy went through `$t`/`$ti` against `src/lib/i18n.ts`'s `waitlist.*` namespace (issue #407) instead of a page-local `copy` object; the language toggle now drives the shared `locale` writable (persisted via `initLocale()`, same `mep-locale` `localStorage` key the rest of the app uses) instead of local component state. Pricing-tier names/taglines/bullets are read straight from `billing.plan.*` / `TIER_COPY` (`$lib/billing-plans.ts`) — the same source `BillingPlanCard.svelte` renders from — rather than duplicating that copy; only the numbers (`PROVISIONAL_PRICE`) and quotas are supplied locally. `tests/waitlist-provisional-price.test.ts` diffs every rendered string, per locale, against the pre-migration inline object (pinned by commit SHA) to guarantee the move was byte-identical.

## Server core (DB, extraction, billing, jobs)

### `src/lib/server/waitlist-db.ts`

**`function insertWaitlistEmail`**
- Insert an email into the waitlist. Returns true if inserted, false if already registered.

### `src/lib/components/desktop/DesktopDashboard.svelte`

**`const CAT_DONUT_CIRC`**
- Category donut — fills the empty space below the KPI row on the no-alerts sidebar card (issue: blank space under "Variación mensual").
**`markup`**
- Period picker row; first invoice banner; KPI strip; spend chart + alerts panel. Finer boundary: a chart crash (bad trend data) shows a chart-sized fallback instead of blanking the dashboard (issue #255).
- Fallback secondary KPIs when no alerts.
- "Por revisar" pending invoices; suppliers + recent invoices; budget + projection + category spend + price changes; invoice aging; missing invoices.

### `src/lib/components/mep/CoachMark.svelte`

**`function measure`**
- Walks every element carrying the anchor and takes the first with a non-zero box. Split pages render the same `data-coach` twice — once in the `md:` markup, once in the mobile markup (ADR-020) — and the hidden one measures 0×0, so taking `querySelector`'s first hit put the spotlight in the top-left corner as a dot. A zero box also means "not laid out yet", which is what the poll is waiting for either way.
**`function pollUntilReady`**
- The anchor belongs to the page, which mounts on its own schedule; 20 × 100 ms covers the gap without pinning a frame loop to a component that is usually ready on the first try.
**`markup`**
- Full-screen backdrop (click outside = skip); spotlight ring (box-shadow punches the scrim out around the anchor); tooltip card; step dots; content; CTA. svelte-ignore a11y_no_static_element_interactions.
- Every colour is a token (issue #569): `--mep-scrim` for the punch-out, `--mep-overlay` + `--mep-shadow-pop` for the card, `--mep-acc` for the ring and the active dot. This only resolves because the shell renders the tour chrome inside its `.mep` container — `--mep-acc` is declared on `.mep[data-accent=…]`, not on `:root`, so the same markup as a sibling of the shell silently loses its accent in both themes.

### `src/lib/components/mep/ConfirmDialog.svelte`

**`markup`**
- svelte-ignore a11y_no_static_element_interactions and a11y_no_noninteractive_element_interactions.

### `src/lib/components/mep/ErrorBoundary.svelte`

**`markup`**
- Reusable client error boundary (issue #255). SvelteKit's handleError only covers load/navigation; a runtime error thrown during client render or in an effect after hydration (a chart choking on bad data, the batch polling loop) would otherwise tear down the component tree and leave a dead/white UI. This contains the failure to one panel, offers a retry, and still reports to Sentry.

### `src/lib/components/mep/ScrollStrip.svelte`

**`markup`**
- The one horizontal chip strip in the app (issue #658). Four screens had rolled their own `overflow-x: auto` row with the scrollbar hidden, so a strip that ran past the viewport looked exactly like one that fitted: at 390px the `/suppliers` category filter measured 2718px with 17 of its 19 chips off-screen, `/invoices` hid "Por categoría" entirely, and the supplier-detail tabs cut "Conversiones" mid-word.
- `.scroll-strip` in `app.css` owns the look: hidden scrollbar, a lead-in inset so the first chip never sits flush against the frame, and a mask that fades whichever edge still has content behind it. The fade is keyed off `data-more-start` / `data-more-end`, so a strip whose content fits shows no fade at all — the affordance appears only when it is telling the truth.
- Layout stays with the caller through `--mep-strip-pad` / `--mep-strip-lead-in` / `--mep-strip-gap` custom properties rather than an inline `padding`, because an inline shorthand would beat the class's own `padding-left` and take the lead-in with it.
- `measure()` re-runs on scroll, on resize, and on a `MutationObserver` for the children: the chip list is data-driven (categories, tab counts), so the strip can start fitting and stop fitting without the element ever changing size.
- Callers: `MobileSuppliersList`, `MobileInvoiceList`, `MobileAnalyticsPrices`, `suppliers/[id]`. `scripts/scroll-strip-audit.mjs` measures every strip at 390px and `tests/scroll-strip-affordance.test.ts` holds the line, including a static guard against a new bare `overflow-x: auto` row.

### `src/lib/components/mep/FieldInput.svelte`

**`type Props`**
- `empty`: show empty-field warning (needsReview result).
- `warnMsg`: external warning message (e.g. discrepancy).
- `num`: apply num class for monospaced numeric style.

### `src/lib/components/mep/FlowSteps.svelte`

**`const STEPS`**
- Upload → Extract → Review progress indicator (issue #232). Extracted from UploadPanel so the cue survives the navigation to /batch/[id] — where steps 2 and 3 actually happen, and where it was previously missing at exactly the moment it helps most. `active` is the zero-based index of the current step; earlier steps read as done, later ones as pending.

### `src/lib/components/mobile/MobileDashboard.svelte`

**`const currentMonthStr`**
- Period picker (self-contained — reads URL, generates prev/next links).
**`markup`**
- Mobile-only wrapper, full height, scroll with bottom clearance; greeting + period picker; hero spend card; alert tile (only when there are high/med alerts); 2-col KPI row; top suppliers; recent invoices.

### `src/lib/components/PriceTrendSparkline.svelte`

**`const color`**
- Rising price trend = green per spec (issue #26).
**`const risingStreak`**
- Consistent upward trend: every month higher than previous.

### `src/lib/components/TrendChart.svelte`

**`const buckets`**
- SSR'd by the dashboard load (the chart flashed "Loading…" on every visit because it fetched client-side in onMount instead of using data already computed server-side). Only re-fetches when a range/granularity toggle is used — the initial render is fully server-rendered.
**`function fetchData`**
- Don't leave stale buckets on screen mismatched against the newly selected range/granularity.
**`const SVG_W`**
- SVG layout (pixel-based, viewBox width=500 for easy math).
**`const PAD_R`**
- wider left padding for Y-axis labels.
**`const maxTotal`**
- fraction of slot used as gap.
**`markup`**
- Chart area; gridlines + Y-axis labels; bars; X-axis labels; legend.

### `src/lib/stores/tutorial.ts`

**`function setTutorialStep`**
- Awaitable, and it records the step it is writing in `pending`. The UI is already updated optimistically; callers that navigate afterwards await it so the next page's layout load cannot read the step the user just left.
**`function seedTutorialStep`**
- The layout re-seeds the store from server data on every load. Without the `pending` guard that load could answer with the previous step mid-write and roll the store backwards, stranding the tour on a page whose step no longer matched — no coach mark, no way forward, at a different step each time (issue #569).

## Shared library

### `src/lib/colors.ts`

**_module level_**
- Chart and category colours, resolved in the browser. They used to be 17 fixed hexes in `constants.ts`, stamped onto rows by the page loads and shipped in the payload — light-only by construction, because the server has no idea which theme the browser is in (the choice lives in `localStorage` and is applied to `documentElement` by `static/theme-init.js`). The same values therefore rendered on both grounds, and eleven of the seventeen fell under 3:1 against the dark surface.
- Every category now maps to a `--mep-cat-*` custom property with a light and a dark value in `app.css`, and the load functions send only `category`: the colour is picked by the cascade at paint time and re-picks itself when the theme toggles, with no re-render and nothing to keep in sync.
- Keep this module free of hex codes — `app.css` owns the values.

**`const CATEGORY_COLORS`**
- Canonical category → the custom property holding its colour.

**`function categoryColor`**
- The colour for a category, safe for `background`, `color`, `border-color` and SVG `fill`/`stroke` alike. Unknown or missing categories fall back to the "Other" hue rather than to a literal, so the result is always theme-aware.

**`function categoryTint`**
- A translucent wash of the category colour, for the soft backgrounds that pair with `categoryColor()` as text — supplier avatars, product badges.
- Replaces the old `background:{color}24` trick, which built an 8-digit hex by string concatenation. That only ever worked because the value was guaranteed to be a 6-digit hex; against a custom property it produces `var(--mep-cat-bebidas)24`, which is not a colour at all.

**`const SERIES_COLORS`**
- The categorical series ramp, for charts whose slices are ranked rather than named — top products, invoice status splits. Fixed order, never cycled: past the fifth entry use `SERIES_OTHER` rather than wrapping around, so two slices never share a hue.
- Four components each kept their own copy of this array; it lives here now so a change to the ramp reaches all of them.

**`function seriesColor`**
- The nth series colour, falling back to the neutral "other" hue (`SERIES_OTHER`).

### `src/lib/formatters.ts`

**`function fmtEur`**
- Full precision EUR: 1234.56 → "1.234,56 €".
**`function fmtEurCompact`**
- Rounded EUR: 1234.56 → "1.235 €".
**`const BUDGET_WARN_PCT`**
- Matches the budget_warning_threshold default in the settings table (80 %).
**`function semColor`**
- Traffic-light color for a budget percentage (0-100+).
**`function fmtDate`**
- Full date with year: "19 may 2024".
**`function fmtDateShort`**
- Short date without year: "19 may".
**`function initials`**
- "AB" initials from a name.
**`function toMonthStr`**
- "2024-05" from a Date.
**`function shiftMonth`**
- Shift a "YYYY-MM" string by delta months.
**`function parseMonthParam`**
- Validate a "?month=YYYY-MM" query param, clamped to not-future.

### `src/lib/index.ts`

**_module level_**
- Place files you want to import through the `$lib` alias in this folder.

### `src/lib/pwa.ts`

**`function registerPWA`**
- Registers the Workbox-generated service worker produced by vite-plugin-pwa. Called from +layout.svelte onMount so it runs only in the browser.
- We avoid `injectRegister:'auto'` because SvelteKit's mode:'hash' CSP computes hashes at SSR time and won't cover a script injected post-build by Vite. Registering here from a compiled module is CSP-safe — no inline script needed.
- vite-plugin-pwa only emits sw.js during production builds (dev returns early).
- When a new SW version is waiting, send SKIP_WAITING so it activates immediately — generateSW includes a SKIP_WAITING listener when `registerType:'autoUpdate'`.
- Non-fatal — app works normally without a SW.

### `src/lib/theme.ts`

**_module level_**
- The one place the active theme is written. Three layouts each had their own `toggleTheme()` doing the same two steps; there is now a third step — keeping the PWA `theme-color` in sync so the browser and OS chrome around the page match the theme — and a fourth copy of that is exactly how the first two drifted apart.
- `static/theme-init.js` does the same work inline before first paint and cannot import this module, so the two must agree. That is why the chrome colours are named here rather than repeated at each call site.

**`const CHROME`**
- Browser/OS chrome colour per theme. Must match `--mep-bg` in `src/app.css` for each theme.

**`function currentTheme`**
- Read the theme currently applied to the document.

**`function applyTheme`**
- Apply a theme: stamp the attribute every `--mep-*` override keys off, tint the browser chrome to match, and remember the choice.
- The `localStorage.setItem` sits in a swallowing `try/catch`: in private mode, or with storage disabled, the write throws. The theme still applies for this page; it just will not survive a reload.

**`function toggleTheme`**
- Flip to the other theme and apply it. Returns the theme now in effect.

## App shell, hooks, workers

### `src/app.d.ts`

**_module level_**
- App-level ambient interfaces: `Error`, `PageData`, `PageState`, `Platform`.

### `src/hooks.client.ts`

**`property beforeSend`**
- Strip live OAuth codes / tokens / emails from attached request URLs (#254).
