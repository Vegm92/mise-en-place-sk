---
name: verify
description: Run and drive this app locally without real Gemini/Stripe/Google OAuth credentials — local Postgres + Auth.js credentials login recipe for end-to-end verification of auth, onboarding, and invoice-save flows.
---

# Verifying Mise en Place locally (no external credentials)

## Database

PostgreSQL 16 local install; the app's DB is Railway Postgres in production,
plain Postgres locally — no external service is needed to run it.

```bash
service postgresql start
su postgres -c "createdb mep"
# allow TCP logins (or set a password): switch pg_hba host lines to trust
```

`.env` for local runs (db.ts hardcodes `ssl: 'require'`; Debian PG's snakeoil
certs satisfy it):

```
DATABASE_URL=postgresql://postgres@127.0.0.1:5432/mep
AUTH_SECRET=dev-secret-not-for-production
GEMINI_API_KEY=dummy
```

Then `pnpm db:migrate` and `pnpm dev` (add `pnpm worker` only if you need
extraction; it requires a real Gemini key).

## Auth (Auth.js credentials login)

Auth is Auth.js (`SvelteKitAuth`) with a Credentials provider backed by
`bcryptjs` password hashes in the `users` table — no external auth service to
fake. `AUTH_SECRET` (any string locally) is the only requirement for
signup/login E2E. Seed a user directly:

```sql
-- password hash for 'Test1234!' — swap in your own via bcrypt if needed
INSERT INTO users (email, password_hash, email_verified)
VALUES ('test@example.com', '$2a$12$...', NOW());
```

Google OAuth (`AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET`) needs real Google
credentials to exercise end-to-end; without them the Google button 404s at
Auth.js's `/auth/signin/google` route, which is fine to leave unverified for
local runs — the credentials flow covers signup/login/onboarding.

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
