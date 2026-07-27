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
| `WHATSAPP_API_VERSION` | No (default `v25.0`) | Graph API version for every Cloud API call. Meta expires each version ~2 years after release and calls to an expired one **fail outright** — check this at every upgrade. |

Setup checklist in [WhatsApp bot setup](#whatsapp-bot-setup) below. Leave `WHATSAPP_ACCESS_TOKEN` and `WHATSAPP_PHONE_NUMBER_ID` unset to disable the bot (the Settings card hides itself too).

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

Only needed if you enable the WhatsApp invoice bot (issue #187). All four secret
`WHATSAPP_*` variables must be set for the webhook to authenticate Meta.

We run **one shared business number** that every restaurant sends invoices to;
`whatsapp_contacts` maps each sender to its tenant. That means no Embedded Signup
and no Tech Provider onboarding — the setup below is the whole thing.

### 1. Business portfolio, app, and verification

1. Create a **Meta Business portfolio** at [business.facebook.com](https://business.facebook.com)
   under the legal entity name (it must match your incorporation documents).
2. [developers.facebook.com/apps](https://developers.facebook.com/apps) → **Create App**
   → type **Business** → link it to that portfolio → add the **WhatsApp** product.
3. Start **business verification** (Business Settings → Security Centre) *now* — it
   gates production messaging limits and takes days, not minutes.

### 2. Business phone number

The test number Meta hands you is fine for wiring the webhook, but it only messages
**5 pre-registered recipients** and can never message real users. For production:

1. WhatsApp → API Setup → **Add phone number**. The number **must not already be
   registered to any WhatsApp or WhatsApp Business app** — delete that account first,
   or registration fails.
2. Set the **display name** (Meta reviews it), timezone, category and description.
3. Verify by SMS/voice, then set the **6-digit two-step-verification PIN** —
   registration requires it, and you need it again for any re-registration.
4. Copy the **Phone Number ID** (not the phone number) → `WHATSAPP_PHONE_NUMBER_ID`.

### 3. Permanent access token

The token shown on the API Setup page **expires in 24 h** — never deploy it.

1. Business Settings → **System users** → Add (role: Admin).
2. **Assign assets** — both of these, or the token authenticates but 403s on send:
   - your **app** → *Manage app*, full control
   - your **WhatsApp Business Account** → *Manage WhatsApp business accounts*, full control
3. **Generate token** → select the app → scope **`whatsapp_business_messaging`** →
   expiry **Never** → copy once → `WHATSAPP_ACCESS_TOKEN`. It is not retrievable later.

### 4. Webhook

1. App Dashboard → Settings → **Basic** → **App Secret** → `WHATSAPP_APP_SECRET`.
2. Any random string → `WHATSAPP_VERIFY_TOKEN`.
3. **Deploy with all four variables set first** — Meta calls the URL synchronously
   while saving and fails the whole subscription if it doesn't answer.
4. WhatsApp → Configuration → Webhook → Edit:
   - Callback URL: `https://your-domain.com/api/whatsapp/webhook`
   - Verify token: the value of `WHATSAPP_VERIFY_TOKEN`
   - Public HTTPS with a valid CA certificate; self-signed is rejected.
5. **Subscribe to the `messages` field.** This is a separate step from saving the
   URL and is the most commonly missed one — without it Meta verifies the endpoint
   and then delivers nothing.

For local development, tunnel with `ngrok http 5173` and point the callback there.

### 5. Authorise staff numbers

**Settings → "Facturas por WhatsApp"** (owner-only). Numbers are normalised to
E.164-without-`+` on save, so `+34 612 345 678`, `0034612345678` and `612 345 678`
all store as `34612345678` — the exact shape Meta puts in the webhook's `from`
field. Unauthorised senders get a "no autorizado" reply and are dropped.

A phone number maps to exactly **one** restaurant (`whatsapp_contacts_phone_unique`
is global, because the bot resolves the tenant *from* the number); authorising one
that another location already holds fails with a clear error rather than rebinding it.

### Graph API version

`WHATSAPP_API_VERSION` (default `v25.0`) sets the version for every Cloud API call.
Meta expires each version roughly two years after release and **calls to an expired
version fail outright** — this took the bot down once already when the code pinned
`v19.0`. Check [Meta's version table](https://developers.facebook.com/docs/graph-api/changelog/versions/)
at each upgrade and bump the variable; no code change is needed.

### Messaging policy and cost

The bot only ever *replies*, so every message it sends falls inside the **24-hour
customer service window** the staff member opened by sending a photo — free-form
text, no pre-approved templates required. Two consequences:

- **From 1 Oct 2026** service messages inside that window become billable at utility
  rates. The bot sends 2–3 messages per invoice; trim to two before then.
- Messaging a chef **proactively** more than 24 h after their last message would
  require an approved **utility template**. None exist in this repo today.

### Verify

```bash
# Webhook challenge — prints "test"
curl "https://your-domain.com/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=$WHATSAPP_VERIFY_TOKEN&hub.challenge=test"

# Outbound send
curl -X POST "https://graph.facebook.com/$WHATSAPP_API_VERSION/$WHATSAPP_PHONE_NUMBER_ID/messages" \
  -H "Authorization: Bearer $WHATSAPP_ACCESS_TOKEN" -H "Content-Type: application/json" \
  -d '{"messaging_product":"whatsapp","to":"34612345678","type":"text","text":{"body":"ping"}}'
```

Then send an invoice photo from an authorised number: a summary comes back in ~10 s;
replying `SÍ` saves the invoice (it appears in `/invoices` noted "📱 Recibida por
WhatsApp"), `NO` discards it.

## CI

`.github/workflows/ci.yml` runs typecheck, tests, build, and the `lint:no-sql-raw`
/ `lint:tenant-scope` guards on pushes/PRs to `main`. Integration suites need the
Supabase secrets configured in repo settings — without them they skip (the run
prints exactly which suites were skipped; set `REQUIRE_DB_TESTS=1` to turn those
skips into failures).
