# Dependency Policy

Which third-party libraries exist, what must not change, and how to add new
ones. Verify against `package.json` before assuming (dependencies evolve).

## Current dependencies (as audited)

**Runtime**
- `@sveltejs/adapter-node`, `@sveltejs/kit`, `svelte` (runes)
- `@auth/sveltekit`, `@auth/core`, `authjs` helpers, `bcryptjs`
- `drizzle-orm`, `postgres` (postgres.js driver)
- `@google/genai` (Gemini) — **never** revert to deprecated
  `@google/generative-ai`
- `pg-boss` (worker queues), `ioredis` (Upstash) optional, `@upstash/redis`
- `stripe`, `resend`, `whatsapp` (Meta Cloud API client), `@sentry/sveltekit`
- `aws-sdk` S3/S3Control (Railway Buckets driver, ADR-016)
- `zod` is **not** in use — validation is hand-rolled (see
  `docs/04_engineering/security_rules.md`)
- `xlsx`, `pdfjs-dist`, `sharp`, `qr-svg`, `mini-svg-data-uri`,
  `cookie`, `nanoid`, `uuid`, `lucide-svelte`, tailwindcss

**Dev**
- `drizzle-kit`, `typescript`, `vitest`, `@vitest/coverage-v8`,
  `svelte-check`, `prettier`, `eslint`/`eslint-plugin-svelte`, `tsx`,
  `chokidar` (dev scripts), `@types/*`

## Hard constraints (from ADRs + conventions)

- Gemini via `@google/genai` only (deprecated package is banned).
- Chat/digest must NOT gain a database/SQL library for live querying
  (ADR-018 — fixed snapshot only).
- No new ORM/persistence layer; Drizzle is the only data access.
- Auth via Auth.js seam; do not bolt on a second auth stack.
- No Postgres-enum or migration tooling outside `drizzle-kit`.
- Storage stays behind the driver seam (`storageDriver`, ADR-016).
- WhatsApp stays behind the transport seam
  (`src/lib/server/integrations/whatsapp/transport.ts`, ADR-025):
  `driver-baileys.ts` is the only file allowed to import the client.

## Adding a dependency

1. Ask: does the repo already solve this? (search `src/lib/server/` first —
   e.g. rate limiting, dedup, validation are all hand-rolled).
2. Prefer small, maintained, tree-shakeable packages; pin with `pnpm add -E`.
3. If it touches crypto, webhooks, payments, auth or file handling, review
   `docs/04_engineering/security_rules.md` and consider an ADR.
4. Update `README.md` stack list + `docs/00_system/system_manifest.md` + this
   file. Keep `pnpm-lock.yaml` committed.
5. Keep `.env.example` in sync if it needs config.

## Upgrading

- Upgrade in small, reviewable PRs; run `pnpm check`, `pnpm test` and `pnpm build`.
- Watch for SvelteKit/Svelte majors (runes version lock) and Stripe API bumps
  (webhook event shapes).
- Lockfile is `pnpm-lock.yaml`; never hand-edit it.

## Verification

- CI installs with `--frozen-lockfile`.
- `pnpm audit` for known vulnerabilities; don't introduce a new high-severity
  dep without documenting the trade-off.
