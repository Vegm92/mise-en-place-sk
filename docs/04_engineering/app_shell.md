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
**`const switchingLocation`**
- Switching writes the active_restaurant cookie server-side, then a full reload so every layout query re-runs against the new tenant (issue #290).
**`function switchLocation`**
- fall through — the select resets on the next render.
**`markup`**
- Mobile overlay; sidebar (brand, location switcher — only when there is somewhere to switch to, #290 — upload CTA, primary nav, quota widget — hidden until the first invoice is saved, #231 — quotaLimit null → unlimited, nothing to fill up, #295 — util links, legal footer, user chip).
- Main area: TopBar (universal header, mobile + desktop), mobile hamburger (kept for fallback pages not yet mobilised), title, chat (desktop only — sidebar nav handles mobile), language toggle, notification bell, theme toggle, upload CTA (mobile only).
- Page content — a `<main>` landmark contains a post-hydration client render/effect error (e.g. the /batch/[id] polling loop, the chat page) to this region so the shell survives; +error.svelte still covers load errors.
- Tutorial coach marks: completion overlay and the app-wide tour nudge (small dismissible corner card, persists across dashboard visits) — both carry svelte-ignore a11y_no_static_element_interactions.

### `src/routes/(app)/+page.server.ts`

**`function remainingMonthlyQuota`**
- Returns the number of invoices the tenant can still add this calendar month, or null when no plan quota is configured (treated as unlimited). Best-effort: never blocks the upload path on a DB error. Shared quota convention (issue #295) — null means unlimited.
**`property error`**
- An i18n key (issue #294) — the panel translates it. `errorVars` carries the interpolation values that survive a redirect.
**`property upload`**
- A lapsed trial (or a cancelled/past-due subscription) may keep reading its data, but must not start new paid work (issue #287). First thing in the action: an expired tenant gets sent to /billing without uploading a 20 MB file first, and never reaches the rate limiter or quota gate.
- Use typeof check instead of instanceof — SvelteKit's internal File class may differ from globalThis.File across Node.js versions, causing instanceof to silently drop files.
- Each upload consumes a paid Gemini extraction — cap batch submissions per tenant regardless of plan quota: `checkRateLimit('upload:${rid}', 10)`.
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
**`markup`**
- Forms: display name, email, password, restaurant name.
- Where to send invoices (issue #319). Authorising a number is useless if the staff member never learns what to message. QR injected via `{@html}` (eslint-disable-next-line svelte/no-at-html-tags).
- Self-service enrolment (issue #320). The number is captured from the message, so it cannot be mistyped the way the form below can.
**`style`**
- WhatsApp bot number + QR (issue #319).
- Pairing code (issue #320) — read off a screen and typed into a phone, so set large, monospaced and widely tracked.
- The QR is meant to be printed and taped up in the kitchen, so sized in absolute units — 45 mm on paper scans reliably from arm's length.
- Explicit white backing: a dark-theme card behind a transparent QR inverts the modules and scanners reject it.

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

**`const spotTop`**
- Small delay so the page renders first (measure after 80 ms).
**`const tipLeft`**
- Place tooltip below spotlight; flip above if too close to bottom.
**`const tipTop`**
- approximate card height.
**`markup`**
- Full-screen backdrop (click outside = skip); spotlight ring (box-shadow punches the dark overlay); tooltip card; step counter; content; CTA. svelte-ignore a11y_no_static_element_interactions.

### `src/lib/components/mep/ConfirmDialog.svelte`

**`markup`**
- svelte-ignore a11y_no_static_element_interactions and a11y_no_noninteractive_element_interactions.

### `src/lib/components/mep/ErrorBoundary.svelte`

**`markup`**
- Reusable client error boundary (issue #255). SvelteKit's handleError only covers load/navigation; a runtime error thrown during client render or in an effect after hydration (a chart choking on bad data, the batch polling loop) would otherwise tear down the component tree and leave a dead/white UI. This contains the failure to one panel, offers a retry, and still reports to Sentry.

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

### `src/lib/components/mobile/MobileTabBar.svelte`

**`markup`**
- Raised upload button.

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
- fire-and-forget — UI already updated.

## Shared library

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

### `src/lib/utils.ts`

**`type WithElementRef`**
- Re-exported for shadcn-svelte components (bits-ui internal types).

## App shell, hooks, workers

### `src/app.d.ts`

**_module level_**
- App-level ambient interfaces: `Error`, `PageData`, `PageState`, `Platform`.

### `src/hooks.client.ts`

**`property beforeSend`**
- Strip live OAuth codes / tokens / emails from attached request URLs (#254).
