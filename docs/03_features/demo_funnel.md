# Demo funnel (`/demo`)

Book-a-demo funnel for inbound and outbound traffic: **traffic → landing → video → questions → demo**.

| Stage | Where | Status |
|---|---|---|
| 1. Traffic | UTM / `variant` / `ref` params, stored in the `mep_attr` cookie (needs analytics consent) | Existing (`src/lib/server/attribution-cookie.ts`) |
| 2. Landing | `/waitlist`, `/l/[variant]` | Existing. Its CTAs do not link to `/demo` yet |
| 3. Video | `/demo` | Rendered only when `DEMO_VIDEO_URL` is set; otherwise the funnel starts at stage 4 |
| 4. Questions | `/demo?step=questions` | Contact details plus role, locations, monthly supplier spend, current tool |
| 5. Demo | `/demo` after submit | Prefilled link to the scheduling tool, or a "we will write to you" confirmation |

## Qualification

`src/lib/demo-funnel.ts` holds the rules, in one place:

- Monthly supplier spend under 10,000 € → no demo slot; the lead is sent to `/signup`.
- Everything else → demo. The lead is flagged ICP priority at 20,000 €/month or more, or with 2 to 10 locations.

## What a submission does

1. Inserts the email into `waitlist` with its attribution (no new table).
2. Emails the answers to `DEMO_NOTIFY_EMAIL`, or the first `AUTH_ADMIN_EMAIL` address.

The answers are **not** stored in the database: they exist only in that email. `sendEmail` logs and reports a
failed send to Sentry but does not retry, so a failed send loses the answers and keeps only the waitlist row.

## Configuration

| Variable | Effect when unset |
|---|---|
| `DEMO_VIDEO_URL` | Same-origin path only (for example `/video/demo.mp4` served from `static/`); the CSP has no `media-src` for other hosts. Unset: no video stage |
| `DEMO_VIDEO_POSTER_URL` | Same-origin path. Unset: the browser shows the first frame |
| `DEMO_BOOKING_URL` | `https` link to the scheduling page; `name` and `email` are appended as query parameters. Unset: the lead sees "request received" and is contacted by email |
| `DEMO_NOTIFY_EMAIL` | Unset: falls back to the first `AUTH_ADMIN_EMAIL` address |
