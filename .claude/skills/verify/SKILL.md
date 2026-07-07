---
name: verify
description: Run and drive this app locally without real Supabase/Gemini/Stripe credentials — local Postgres + fake GoTrue recipe for end-to-end verification of auth, onboarding, and invoice-save flows.
---

# Verifying Mise en Place locally (no external credentials)

## Database

PostgreSQL 16 local install works; Supabase is only needed for auth.

```bash
service postgresql start
su postgres -c "createdb mep"
# allow TCP logins (or set a password): switch pg_hba host lines to trust
# vanilla PG lacks Supabase's auth schema; the RLS migration needs a stub:
psql -h 127.0.0.1 -U postgres -d mep -c \
  "CREATE SCHEMA IF NOT EXISTS auth; CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS 'SELECT NULL::uuid';"
```

`.env` for local runs (db.ts hardcodes `ssl: 'require'`; Debian PG's snakeoil
certs satisfy it):

```
DATABASE_URL=postgresql://postgres@127.0.0.1:5432/mep
SUPABASE_URL=http://127.0.0.1:54321
SUPABASE_ANON_KEY=dummy-anon-key
SUPABASE_SERVICE_ROLE_KEY=dummy-service-key
GEMINI_API_KEY=dummy
```

Then `pnpm db:migrate` and `pnpm dev` (add `pnpm worker` only if you need
extraction; it requires a real Gemini key).

**Note:** with a populated `.env`, `pnpm test` un-skips the Supabase
integration suites and they fail against dummy keys. Run tests with the
`.env` moved aside to reproduce CI.

## Fake Supabase Auth (GoTrue)

The app talks to `SUPABASE_URL` for auth only, so a ~100-line fake on
:54321 unlocks signup/login/OAuth E2E. Endpoints needed:

- `POST /auth/v1/signup` → return a full session object (autoconfirm)
- `POST /auth/v1/token?grant_type=password|pkce|refresh_token`
- `GET /auth/v1/user` (Bearer token → user)
- `GET /auth/v1/authorize` → mint user + code, 302 back to `redirect_to`
  (append `?code=`) — completes the real PKCE dance because the
  code-verifier cookie set by `signInWithOAuth` rides along
- `GET /auth/v1/admin/users/:id` (owner-email lookups, e.g. quota emails)

User/session objects: `{ id, aud: 'authenticated', role, email,
email_confirmed_at, app_metadata, user_metadata, identities, created_at }`
and `{ access_token (JWT-shaped), refresh_token, expires_in, expires_at,
token_type: 'bearer', user }`.

## Driving flows

- Playwright + `/opt/pw-browsers/chromium-*/chrome-linux/chrome`.
- **Gotcha:** headless Chromium aborts plain form-POSTs whose action 303s
  cross-origin (`net::ERR_ABORTED`) — e.g. the Google OAuth buttons. Drive
  those actions like `use:enhance` does: in-page
  `fetch(path, { method: 'POST', headers: { 'x-sveltekit-action': 'true' }, body })`
  → returns `{ type: 'redirect', location }` → `page.goto(location)`.
- Invoice save without Gemini: seed `upload_batches` + `batch_items`
  (status `done`, `extracted_data` jsonb with high confidence) via SQL,
  then POST the `/batch/[id]?/save` action with header/line form fields
  and `low_confidence_ack=true`.
- Emails are observable without Resend: `[email] no-op ...` lines in the
  dev-server log carry subject + recipient.
