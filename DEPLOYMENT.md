# Deployment Runbook

Stack: SvelteKit (`@sveltejs/adapter-node`) + Supabase (Postgres + Auth) + Gemini. Build artifact runs with `node build/index.js`.

Copy `.env.example` to `.env` and fill in every value before starting the server.

---

## Required environment variables

### Database (Supabase Postgres)

| Variable | Required | Notes |
|---|---|---|
| `DATABASE_URL` | Yes | Supabase **direct** connection string — used by drizzle-kit migrations and pg-boss: `postgresql://postgres:…@db.<project-ref>.supabase.co:5432/postgres`. SSL is enforced by the client. |
| `DATABASE_POOL_URL` | No | Supabase **Session Mode pooler** (port 5432) or PgBouncer URL for the runtime Drizzle ORM queries. Falls back to `DATABASE_URL` when unset. Recommended for multi-replica / HA deployments. |

### Supabase (auth + API)

| Variable | Required | Notes |
|---|---|---|
| `SUPABASE_URL` | Yes | `https://<project-ref>.supabase.co` |
| `SUPABASE_ANON_KEY` | Yes | "anon public" JWT (Project Settings → API) |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | service-role JWT — server-only, never expose to the client |

Google OAuth is configured in the **Supabase dashboard** (Authentication → Providers → Google), not via env vars. Set the redirect URL to `{your-origin}/auth/callback`.

### Gemini (AI extraction, digest, chat)

| Variable | Required | Notes |
|---|---|---|
| `GEMINI_API_KEY` | Yes | From [Google AI Studio](https://aistudio.google.com/app/apikey). Boot logs a warning if missing; extraction fails without it. |
| `GEMINI_MODEL` | Optional | Defaults to `gemini-2.5-flash`. Update when Google deprecates the model. |

### File storage

| Variable | Default | Notes |
|---|---|---|
| `UPLOADS_DIR` | `uploads` | Uploaded invoice files (PDF/JPG/PNG, 20 MB max each) |

> **`UPLOADS_DIR` MUST be on a persistent volume.** On ephemeral hosts (Render/Fly/Railway/containers without a mount) every redeploy deletes users' invoice files. Upload sessions are now stored in Postgres (table `upload_sessions`) and survive restarts automatically. File migration to Supabase Storage is tracked in #62.

### Billing (Stripe)

| Variable | Required | Notes |
|---|---|---|
| `STRIPE_SECRET_KEY` | Recommended | `sk_live_…` or `sk_test_…` from Stripe Dashboard → Developers → API Keys. If absent, billing is disabled (users see a "contact support" message). |
| `STRIPE_PRICE_ID` | Recommended | Monthly subscription price ID (e.g. `price_…`). Create in Stripe Dashboard → Products. |
| `STRIPE_WEBHOOK_SECRET` | Recommended | `whsec_…`. Configure the endpoint `{your-origin}/api/stripe-webhook` in Stripe Dashboard → Webhooks; send: `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`. |

### Email (Resend)

| Variable | Required | Notes |
|---|---|---|
| `RESEND_API_KEY` | Recommended | `re_…` from [Resend Dashboard](https://resend.com). If absent, emails are no-ops (logged to console). |
| `EMAIL_FROM` | Optional | Sender address. Defaults to `Mise en Place <noreply@miseenplace.app>`. Must match a verified domain in Resend. |

### Observability

| Variable | Default | Notes |
|---|---|---|
| `SENTRY_DSN` | empty | Server-side Sentry; empty = disabled (safe for local dev) |
| `VITE_SENTRY_DSN` | empty | Client-side Sentry |

### Admin seed (first boot)

| Variable | Required | Notes |
|---|---|---|
| `AUTH_ADMIN_EMAIL` | Yes | Seeded admin account; also gates `/admin` (comma-separated list supported) |
| `AUTH_ADMIN_PASSWORD` | Yes | **The server refuses to start in production while this is `changeme`.** |
| `AUTH_ADMIN_RESTAURANT_NAME` | Yes | Name of the seeded restaurant |

### Tuning

| Variable | Default | Notes |
|---|---|---|
| `CHAT_RATE_LIMIT_RPM` | `20` | Chat requests/minute per IP |
| `MAX_CONCURRENT_EXTRACTIONS` | `3` | Parallel Gemini extraction cap |

---

## Deploy steps

The app is **two processes** sharing one build and one `DATABASE_URL`:

| Process | Command | Role |
|---|---|---|
| web | `node build` | SvelteKit server; enqueues `extract-invoice` jobs |
| worker | `node build/worker.js` | pg-boss consumer; runs Gemini extraction |

**Both must run in production.** Without the worker, uploads succeed but extractions stay `queued` forever.

1. `pnpm install --frozen-lockfile`
2. `pnpm db:migrate` — applies `drizzle/` migrations. **Verify the RLS migration (`0001_rls_policies.sql`) is applied to the production database** (`SELECT policyname FROM pg_policies WHERE schemaname='public';` should list policies for every business table); tenant isolation depends on it.
3. `pnpm build` (requires the env vars above at build time) — builds the web server **and** `build/worker.js`.
4. Start both processes with `NODE_ENV=production` (Secure cookies) and `PORT`/`HOST` as needed:
   - `node build` (web) and `node build/worker.js` (worker)
   - On Railway/Render/Fly: create two services from this repo, one per command.
   - On a VPS: `docker compose up -d` uses the included `Dockerfile` + `docker-compose.yml` (one image, web + worker services).
5. Point your platform's health check at `GET /api/health` — returns `200` healthy / `503` degraded and reports DB reachability, pg-boss queue depth, uploads-dir writability, and active sessions. The worker has no HTTP port; rely on the platform's process supervision/restart policy.

## First startup

1. Connects to Supabase Postgres (throws if `DATABASE_URL` missing/unreachable).
2. Seeds the admin user + restaurant from `AUTH_ADMIN_*` (idempotent; logs once).
3. Cleans stale upload sessions (older than 24 h).

## Production constraints (read before scaling)

- **Single instance only, for now.** The rate limiter and extraction semaphore are in-memory per process, and upload sessions are local files. Running >1 instance silently breaks rate limiting and uploads. Distributed alternatives tracked in #68 / #62.
- **Persistent volume** for `UPLOADS_DIR` (see above) + a backup policy for both the volume and the database. Upload sessions are stored in Postgres and need no separate volume.
- Scheduled work (weekly digest, reminders) currently runs on user visits only; cron wiring is tracked in #100.
- Security headers: HSTS/CSP not yet set at app level (#104) — terminate TLS at a proxy that adds them, or wait for the app-level fix.
- Rotate any Supabase keys/admin passwords that may have lived in the repo's git history (#60) before going live.

## PWA / Service Worker (added in #105)

The SvelteKit build now emits a Workbox service worker at `build/client/sw.js`.

**Why this matters for traffic scale:**  
After the first page load the SW precaches 100+ immutable JS/CSS bundles and all
icon sizes into the user's browser. Repeat visits load assets entirely from the
SW cache — zero server bandwidth for static files per returning user.

**Required reverse-proxy headers** (nginx/Caddy — add to your TLS terminator):

```nginx
# Prevent browsers from caching a stale service worker.
# Without this header the browser may serve an old SW for up to an hour.
location = /sw.js {
    add_header Cache-Control "no-cache, no-store, must-revalidate" always;
    proxy_pass http://app;
}
location = /manifest.webmanifest {
    add_header Cache-Control "no-cache" always;
    proxy_pass http://app;
}
```

Caddy equivalent:
```caddyfile
@pwa path /sw.js /manifest.webmanifest
header @pwa Cache-Control "no-cache, no-store, must-revalidate"
```

Without these headers the app still works correctly — browsers check SW updates
on every navigation regardless of HTTP cache — but setting them explicitly
prevents edge-case stale-SW bugs after deploys.

## CI

`.github/workflows/ci.yml` runs typecheck, tests, and build on pushes/PRs to `main`. Integration tests require the Supabase secrets to be configured in repo settings — without them, 72 of 179 tests skip silently (#106).
