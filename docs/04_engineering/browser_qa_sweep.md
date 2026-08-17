---
tags: [mep, engineering]
related: "[[CONTEXT]]"
---

# Browser QA Sweep

A scripted end-to-end pass over the running app in a real browser. It answers
"does every page still load, and did we regress on a11y / i18n / responsive /
headers" in one command, instead of an agent driving the browser click by click.

Complements — does not replace — `pnpm test` (logic) and `pnpm check` (types).
This layer only catches things that need a rendered page.

## Running it

```bash
pnpm dev                      # terminal 1 — note the port it picks
pnpm worker                   # terminal 2 — only needed for extraction flows
QA_BASE_URL=http://localhost:5173 pnpm qa:sweep
```

Writes `qa-report.md` (gitignored) to the repo root and prints nothing else on
success. Read the report, not the console.

| Env var | Default | Purpose |
|---|---|---|
| `QA_BASE_URL` | `http://localhost:5173` | Vite picks 5174+ when 5173 is taken — check the dev log |
| `QA_EMAIL` / `QA_PASSWORD` | `AUTH_ADMIN_EMAIL` / `AUTH_ADMIN_PASSWORD` from `.env` | Account used for the authenticated pass |
| `QA_OUT` | `qa-report.md` | Report path |

First run on a new machine needs `npx playwright install chromium`.

## What it checks

| Section | Catches |
|---|---|
| Unauthenticated gating | A protected route that stops redirecting to `/login` |
| Public + authenticated routes | Non-2xx, console errors, uncaught page errors, failed sub-requests, empty `<title>`, heading structure |
| Security headers | CSP / HSTS / `X-Frame-Options` / `X-Content-Type-Options` / Referrer-Policy / Permissions-Policy |
| Session cookies | `httpOnly` / `sameSite` / `secure` flags |
| Accessibility | Inputs with no accessible name, icon buttons with no label, `<table>` without `th[scope]`, modals using `role="presentation"` instead of `role="dialog"` |
| Blocking overlays | Full-viewport `role="presentation"` layers that swallow clicks |
| i18n leakage | Dotted identifiers rendered as text (a missing `$t()` key falls back to the raw key) |
| Responsive | Horizontal overflow and sub-32px tap targets at 390 / 768 / 1280 px |
| Malformed route params | `/invoice/<garbage>` returning 500 instead of 400/404 |

## Reading the report

Findings are per-route. `clean` means nothing tripped. Two shapes matter most:

- **`raw key candidates: export.status`** — a `$t()` key missing from `src/lib/i18n.ts`.
  The fallback is `?? key` (`i18n.ts`), so the literal key renders, and CSS
  `text-transform: uppercase` on `.label` turns it into `EXPORT.STATUS` on screen.
  `pnpm lint:i18n` does **not** catch this: it looks for hardcoded literals in
  source, not for `$t()` calls whose key has no entry.
- **`blocking overlay: z=110`** — a click-catcher backdrop is up. `CoachMark.svelte`
  renders a transparent full-screen layer whose `onclick` dismisses the tutorial,
  so while a coach mark is showing the user's first click anywhere is swallowed.

## Known false-positive shapes

Tuned out already, but worth knowing if you extend the detector:

- Spanish legal suffixes (`S.L.U`, `EE.UU`) look like dotted i18n keys. Filtered by
  requiring at least one segment longer than two characters.
- Header assertions must bust the HTTP cache — a cached 200 replays without the
  security headers and reads as MISSING. The script appends `?cb=<timestamp>`.

## Limits

- Single tenant, single account. It does not test cross-tenant isolation — that
  lives in the Vitest tenant-isolation suite.
- It does not exercise upload → extract → confirm (needs the worker plus a live
  `GEMINI_API_KEY`). Fixtures for that path are in `synth/output/`; drive them
  through the file chooser, not by setting files on the hidden `<input>` — the
  uploader listens to the chooser, so a programmatic `setInputFiles` on the
  hidden input is silently ignored.
- Trial-tier features (`/chat`, `/analytics/prices`, `/digest`) are paywalled, so
  the sweep sees the gate, not the feature.

## Code notes

### `scripts/qa-browser-sweep.mjs`

Launches headless Chromium once and reuses a single page. `visit()` attaches
`console` / `pageerror` / `response` listeners per navigation and detaches them
after, so errors are attributed to the route that produced them rather than
accumulating across the run. `auditPage()` is serialised into the page context by
`page.evaluate`, so it may not close over anything from module scope.

Route lists are plain arrays at the top of the file — add a route there and it is
picked up by every check. `flagsFor()` is the single place that decides what
counts as a finding; adding a check means adding a field in `auditPage()` and a
line in `flagsFor()`.
