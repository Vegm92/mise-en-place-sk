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
| `DATABASE_SSL_MODE` | No | `require` (default — encrypted, certificate **not** verified) or `verify-full` (certificate chain verified). Applies to both the web pool and the worker's pg-boss connection. Production logs a warning while it is `require`. |
| `DATABASE_CA_CERT` | No | CA certificate used when `DATABASE_SSL_MODE=verify-full` — either the PEM itself or a path to a `.crt` file. Omit to use the system trust store. Supabase publishes its CA in Project Settings → Database → SSL Configuration. |

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
| `STORAGE_DRIVER` | `local` | `local` writes to `UPLOADS_DIR` on disk; `supabase` writes to Supabase Storage. |
| `STORAGE_BUCKET` | `invoice-uploads` | Bucket name when `STORAGE_DRIVER=supabase`. Create it in Supabase → Storage first. |
| `UPLOADS_DIR` | `uploads` | Uploaded invoice files (PDF/JPG/PNG, 20 MB max each) when `STORAGE_DRIVER=local`. |

> **Web and worker must see the same files.** The web process writes the upload;
> the worker reads it back to extract it. With `STORAGE_DRIVER=local` both
> processes need the *same* directory on a *persistent* volume — the included
> `docker-compose.yml` mounts a named volume at `/app/uploads` in both services
> and sets `UPLOADS_DIR=/app/uploads` (issue #285). On platforms where the two
> processes are separate services with separate disks (Railway/Render/Fly), use
> `STORAGE_DRIVER=supabase` — with `local` there, every extraction fails
> "file not found" and every redeploy deletes users' invoice files.

> Upload sessions are stored in Postgres (table `upload_sessions`) and survive
> restarts automatically; they need no volume.

### Reverse proxy / client IP

| Variable | Default | Notes |
|---|---|---|
| `ADDRESS_HEADER` | unset | Header carrying the real client IP (`x-forwarded-for`) when a proxy terminates TLS. **Required behind nginx/Caddy/a load balancer** — without it `getClientAddress()` returns the proxy's IP and every visitor shares one rate-limit bucket, so the 6th signup and 11th login *per minute across all users* is rejected (issue #223). Boot logs a warning if unset in production. |
| `XFF_DEPTH` | `1` | Number of trusted proxies in front of the app; adapter-node reads the IP that many hops from the right of `x-forwarded-for`. Set it wrong and the value is client-spoofable. |

Leave both unset when the Node process is directly internet-facing.

### Billing (Stripe)

| Variable | Required | Notes |
|---|---|---|
| `STRIPE_SECRET_KEY` | Recommended | `sk_live_…` or `sk_test_…` from Stripe Dashboard → Developers → API Keys. If absent, billing is disabled (users see a "contact support" message). |
| `STRIPE_PRICE_ID_STARTER` | Recommended | Monthly price ID for the Starter tier (€49). Create in Stripe Dashboard → Products. |
| `STRIPE_PRICE_ID_PRO` | Recommended | Monthly price ID for the Pro tier (€99). Without it, Pro checkout returns "this plan is not available" (issue #286). |
| `STRIPE_PRICE_ID_BUSINESS` | Recommended | Monthly price ID for the Business tier (€199). |
| `STRIPE_PRICE_ID` | Legacy | Fallback for `STRIPE_PRICE_ID_STARTER` only. Prefer the per-tier variables. |
| `STRIPE_WEBHOOK_SECRET` | Recommended | `whsec_…`. Configure the endpoint `{your-origin}/api/stripe-webhook` in Stripe Dashboard → Webhooks; send: `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`. |

> **Keep the price IDs in sync with Stripe.** A subscription whose price ID
> matches none of the three is recorded as `starter` (the safest quota) *and*
> logged at error level to the console and Sentry. If you rotate a price in the
> Stripe dashboard, update the env var in the same deploy.

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
| `AUTH_ADMIN_EMAIL` | Yes | Seeded admin account; also gates `/admin` (comma-separated list supported). **The server refuses to start in production with an `@example.com` placeholder.** |
| `AUTH_ADMIN_PASSWORD` | Yes | **The server refuses to start in production while this is `changeme`.** |
| `AUTH_ADMIN_RESTAURANT_NAME` | Yes | Name of the seeded restaurant |

### WhatsApp Cloud API (optional — invoice ingest by WhatsApp)

| Variable | Required | Notes |
|---|---|---|
| `WHATSAPP_ACCESS_TOKEN` | For WhatsApp | Permanent system-user token with `whatsapp_business_messaging` (Meta App → WhatsApp → API Setup). |
| `WHATSAPP_PHONE_NUMBER_ID` | For WhatsApp | Phone Number ID from the same API Setup page. |
| `WHATSAPP_VERIFY_TOKEN` | For WhatsApp | Any secret string; Meta echoes it when verifying the webhook subscription. |
| `WHATSAPP_APP_SECRET` | For WhatsApp | App secret (App Dashboard → Settings → Basic). Verifies `X-Hub-Signature-256` on inbound POSTs — **the webhook fails closed without it in production.** |

Setup checklist in [WhatsApp bot setup](#whatsapp-bot-setup) below. Leave all four unset to disable the bot.

### Rate limiting (Upstash Redis)

| Variable | Required | Notes |
|---|---|---|
| `UPSTASH_REDIS_REST_URL` | For >1 replica | Upstash REST URL. Without it the limiter falls back to an in-memory token bucket that is **per process** — effective limits become `limit × replica_count` (`rate-limiter.ts` logs a warning at boot). |
| `UPSTASH_REDIS_REST_TOKEN` | For >1 replica | Upstash REST token. |

### Tuning

| Variable | Default | Notes |
|---|---|---|
| `CHAT_RATE_LIMIT_RPM` | `20` | Chat requests/minute per user |
| `MAX_CONCURRENT_EXTRACTIONS` | `3` | Parallel Gemini extraction cap, **per worker process** (in-process semaphore) |

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
   - On Railway/Render/Fly: create two services from this repo, one per command. They do **not** share a disk — set `STORAGE_DRIVER=supabase` (see [File storage](#file-storage)).
   - On a VPS: `docker compose up -d` uses the included `Dockerfile` + `docker-compose.yml` (one image, web + worker services, shared `uploads` volume at `/app/uploads`).
5. Point your platform's health check at `GET /api/health` — returns `200` healthy / `503` degraded and reports DB reachability, pg-boss queue depth, uploads-dir writability, and active sessions. The worker has no HTTP port; rely on the platform's process supervision/restart policy.

## First startup

1. Connects to Supabase Postgres (throws if `DATABASE_URL` missing/unreachable).
2. Seeds the admin user + restaurant from `AUTH_ADMIN_*` (idempotent; logs once).
3. Cleans stale upload sessions (older than 24 h).

## Production constraints (read before scaling)

- **One web + one worker, unless Upstash is configured.** The rate limiter falls back to an in-memory bucket per process and the extraction semaphore is in-process, so extra replicas multiply both limits. Set `UPSTASH_REDIS_REST_*` before scaling the web tier out. Upload sessions live in Postgres and are replica-safe.
- **Persistent, shared storage** for uploads (see [File storage](#file-storage)) + a backup policy for both the volume and the database.
- **Behind a proxy, set `ADDRESS_HEADER`** (see [Reverse proxy / client IP](#reverse-proxy--client-ip)) or all IP-keyed limits collapse into one bucket.
- Scheduled work (weekly digest generation + email, overdue-invoice reminders, trial-expiry notices) runs as pg-boss cron jobs inside the **worker** process (`src/lib/server/scheduler.ts`). If the worker is not running, none of it fires.
- Security headers are set by the app: HSTS, X-Frame-Options, nosniff, Referrer-Policy and Permissions-Policy in `src/hooks.server.ts`; CSP (hash mode) in `svelte.config.js`. **Do not add a second CSP at the proxy** — two policies intersect and will break the app. The proxy only needs the PWA cache headers below.
- Rotate any Supabase keys/admin passwords that may have lived in the repo's git history (#60) before going live.
- Volumetric/L7 flood protection is **not** part of the app — put Cloudflare or your host's WAF in front of it (#224).

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

## WhatsApp bot setup

Only needed if you enable the WhatsApp invoice bot (issue #187). All four
`WHATSAPP_*` variables must be set for the webhook to authenticate Meta.

1. **Meta Developer Console** ([developers.facebook.com/apps](https://developers.facebook.com/apps) → your app → WhatsApp → API Setup)
   - Copy the **Phone Number ID** → `WHATSAPP_PHONE_NUMBER_ID`.
   - Generate a **permanent system-user token** with `whatsapp_business_messaging` → `WHATSAPP_ACCESS_TOKEN`.
   - Copy the **App Secret** (Settings → Basic) → `WHATSAPP_APP_SECRET`.
   - Pick any secret string → `WHATSAPP_VERIFY_TOKEN`.
2. **Webhook** (WhatsApp → Configuration → Webhook)
   - Callback URL: `https://your-domain.com/api/whatsapp/webhook`
   - Verify token: the value of `WHATSAPP_VERIFY_TOKEN`
   - Subscribe to the **messages** field.
3. **Authorise staff numbers.** Only numbers present in `whatsapp_contacts` are
   answered; everyone else gets an "unauthorised" reply. Phone numbers are E.164
   **without** the leading `+`:

   ```sql
   INSERT INTO whatsapp_contacts (restaurant_id, phone_number, display_name)
   VALUES ('<restaurant-uuid>', '34612345678', 'Chef García');
   ```

**Verify:** `GET /api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=<token>&hub.challenge=test`
returns `test`; sending an invoice photo from an authorised number replies with
an extracted summary in ~10 s; replying `SÍ` saves the invoice (it appears in
`/invoices` noted "📱 Recibida por WhatsApp"), `NO` discards it.

## CI

`.github/workflows/ci.yml` runs typecheck, tests, build, and the `lint:no-sql-raw`
/ `lint:tenant-scope` guards on pushes/PRs to `main`. Integration suites need the
Supabase secrets configured in repo settings — without them they skip (the run
prints exactly which suites were skipped; set `REQUIRE_DB_TESTS=1` to turn those
skips into failures).
