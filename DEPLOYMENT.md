# Deployment Checklist

Copy `.env.example` to `.env` and fill in every value before starting the server.

---

## Required environment variables

### BetterAuth (authentication)

| Variable | Required | Notes |
|---|---|---|
| `BETTER_AUTH_SECRET` | Yes | Min 32 chars. Generate with: `openssl rand -hex 32` |
| `BETTER_AUTH_URL` | Yes | Full base URL, no trailing slash. E.g. `https://yourdomain.com` |
| `AUTH_ADMIN_EMAIL` | Yes | Email of the seeded admin account (created on first startup) |
| `AUTH_ADMIN_PASSWORD` | Yes | Password for the seeded admin account. Change after first login. |
| `AUTH_ALLOWED_EMAILS` | Optional | Comma-separated allowlist for Google OAuth. Leave blank to allow any Google account. |

### Google OAuth (social login)

1. Go to [Google Cloud Console](https://console.cloud.google.com/apis/credentials)
2. Create an OAuth 2.0 Client ID (Web application)
3. Add authorised redirect URI: `{BETTER_AUTH_URL}/api/auth/callback/google`
   - Local dev: `http://localhost:5173/api/auth/callback/google`
   - Production: `https://yourdomain.com/api/auth/callback/google`

| Variable | Required | Notes |
|---|---|---|
| `GOOGLE_CLIENT_ID` | Optional | Required for Google OAuth login |
| `GOOGLE_CLIENT_SECRET` | Optional | Required for Google OAuth login |

If omitted, the "Continue with Google" button fails silently — email/password login still works.

### Gemini API (invoice AI processing)

1. Go to [Google AI Studio](https://aistudio.google.com/app/apikey) → Create API key

| Variable | Required | Notes |
|---|---|---|
| `GEMINI_API_KEY` | Yes | Required for invoice upload and AI line-item extraction |
| `GEMINI_MODEL` | Optional | Defaults to `gemini-2.5-flash`. Update here when Google deprecates the model. |

### Storage paths

| Variable | Default | Notes |
|---|---|---|
| `DATABASE_URL` | `mise_en_place.db` | SQLite file path (relative to project root) |
| `UPLOADS_DIR` | `uploads` | Directory for uploaded invoice files |
| `SK_SESSIONS_DIR` | `data/sk_sessions` | Server-side session storage |

### Tuning

| Variable | Default | Notes |
|---|---|---|
| `CHAT_RATE_LIMIT_RPM` | `20` | Max chat requests per minute per user |
| `MAX_CONCURRENT_EXTRACTIONS` | `3` | Max parallel invoice AI extractions |

---

## First startup

On first `npm run dev` (or `node build/index.js` in production), the server will:

1. Create the SQLite database and all tables
2. Seed the admin user from `AUTH_ADMIN_EMAIL` / `AUTH_ADMIN_PASSWORD`
3. Log `[auth] Admin user seeded: <email>` once (idempotent — won't re-seed on restart)

---

## Production notes

- `BETTER_AUTH_URL` must exactly match the deployed origin (protocol + host + port). A mismatch causes cookie domain failures.
- Set `NODE_ENV=production` so session cookies use the `Secure` flag.
- The SQLite DB file is excluded from git. Provision persistent storage (volume mount, etc.) — the DB does not survive ephemeral deployments.
