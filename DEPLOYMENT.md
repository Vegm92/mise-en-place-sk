# Deployment Runbook

Stack: SvelteKit (`@sveltejs/adapter-node`) + Supabase (Postgres + Auth) + Gemini. Build artifact runs with `node build/index.js`.

Copy `.env.example` to `.env` and fill in every value before starting the server.

---

## Required environment variables

### Database (Supabase Postgres)

| Variable | Required | Notes |
|---|---|---|
| `DATABASE_URL` | Yes | Supabase **direct** connection string (not the pooler): `postgresql://postgres:…@db.<project-ref>.supabase.co:5432/postgres`. SSL is enforced by the client. The server throws at boot if missing. |

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
| `SK_SESSIONS_DIR` | `data/sk_sessions` | Upload-session metadata (JSON files, 24 h TTL) |

> **Both directories MUST be on a persistent volume.** On ephemeral hosts (Render/Fly/Railway/containers without a mount) every redeploy deletes users' invoice files and breaks in-flight uploads. Migration to Supabase Storage is tracked in issue #62.

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

1. `pnpm install --frozen-lockfile`
2. `pnpm db:migrate` — applies `drizzle/` migrations. **Verify the RLS migration (`0002_rls_policies.sql`) is applied to the production database**; tenant isolation depends on it.
3. `pnpm build` (requires the env vars above at build time)
4. `node build/index.js` with `NODE_ENV=production` (Secure cookies) and `PORT`/`HOST` as needed.
5. Point your platform's health check at `GET /api/health` (note: currently a trivial 200 — richer checks tracked in #31).

## First startup

1. Connects to Supabase Postgres (throws if `DATABASE_URL` missing/unreachable).
2. Seeds the admin user + restaurant from `AUTH_ADMIN_*` (idempotent; logs once).
3. Cleans stale upload sessions (older than 24 h).

## Production constraints (read before scaling)

- **Single instance only, for now.** The rate limiter and extraction semaphore are in-memory per process, and upload sessions are local files. Running >1 instance silently breaks rate limiting and uploads. Distributed alternatives tracked in #68 / #62.
- **Persistent volume** for `UPLOADS_DIR` and `SK_SESSIONS_DIR` (see above) + a backup policy for both the volume and the database.
- Scheduled work (weekly digest, reminders) currently runs on user visits only; cron wiring is tracked in #100.
- Security headers: HSTS/CSP not yet set at app level (#104) — terminate TLS at a proxy that adds them, or wait for the app-level fix.
- Rotate any Supabase keys/admin passwords that may have lived in the repo's git history (#60) before going live.

## CI

`.github/workflows/ci.yml` runs typecheck, tests, and build on pushes/PRs to `main`. Integration tests require the Supabase secrets to be configured in repo settings — without them, 72 of 179 tests skip silently (#106).
