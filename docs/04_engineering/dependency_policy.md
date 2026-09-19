---
tags: [mep, engineering]
related: "[[CONTEXT]]"
---

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
- `valibot` (issue #844) — Standard Schema v1 validator for the public/
  unauthenticated form actions (`signup`, `login`, `forgot-password`,
  `reset-password`, `waitlist`) reached through `publicFormAction`'s `schema`
  option or its `parseForm` helper (`src/lib/server/public-form-action.ts`).
  Chosen over `zod` for its tree-shakeable functional API (~1.5 KB for the
  pipes these routes use) and native Standard Schema compliance, which is
  also what `@sveltejs/kit`'s `form()`/`command()` remote functions accept
  (issue #856). `zod` remains **not** in use. Everything *inside* the
  authenticated `(app)` shell is still hand-rolled validation (see
  `docs/04_engineering/security_rules.md`) — this migration did not touch it.
- `pdf-lib` (ADR-035) — writes PDFs, which `unpdf`/pdf.js cannot: composite
  supplier packets are split into one file per invoice before extraction.
  Read-only PDF work stays on `unpdf`.
- `xlsx`, `pdfjs-dist`, `sharp`, `qr-svg`, `mini-svg-data-uri`,
  `cookie`, `nanoid`, `uuid`, `lucide-svelte`, tailwindcss

**Dev**
- `drizzle-kit`, `typescript`, `vitest`, `@vitest/coverage-v8`,
  `svelte-check`, `prettier`, `eslint`/`eslint-plugin-svelte`, `tsx`,
  `chokidar` (dev scripts), `@types/*`
- `madge` (`pnpm madge`) — file-level TS/JS import graph. `knip`
  (`pnpm knip`, issue #1044) — route/Svelte-aware graph alongside it; its
  SvelteKit plugin parses `.svelte` and classifies routes/hooks as entry
  points, closing the gap Madge has there.

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

## Vulnerability audit gate (issue #1076)

CI (`.github/workflows/ci.yml`, right after `pnpm install`) runs

```
pnpm audit --prod --audit-level high
```

and fails the job on any **high or critical** advisory in the **production**
dependency tree: `dependencies`, their transitive dependencies, and the peers
pnpm auto-installs for them (`sharp` under `@whiskeysockets/baileys` is the
case that prompted this). A second step prints the full-tree `pnpm audit`
for visibility but never fails, so `devDependencies` and build-time
advisories (vitest, the babel/browserslist chain under `vite-plugin-pwa`,
…) stay visible without blocking merges. The scope is deliberate: a
full-tree gate at this threshold fails on tooling advisories the app never
ships and gets muted within a week.

**Where the blocking step runs (issue #1118, decided: option 2).** The gate
reads the live advisory database, not the PR's diff, so running it
identically on every trigger meant a newly published advisory turned every
open PR red at once, on a change none of them made, until someone landed
the fix:

- **Pull request**: the blocking step only runs when the PR's diff touches
  `package.json` or `pnpm-lock.yaml` (`git diff --name-only` against the PR
  base — the same pattern the `eval-gate` job uses to scope itself to
  extraction-pipeline changes). A PR that doesn't touch dependencies cannot
  go red from an advisory published after it opened.
- **Push to `main`**: the blocking step always runs.
- **Daily `schedule`**: a separate workflow, `.github/workflows/audit.yml`
  (also runnable on demand via `workflow_dispatch`), runs only the blocking
  audit once a day — kept out of `ci.yml` so a cron trigger never touches
  jobs that have nothing to do with it. An advisory against something
  already on `main` still fails within 24h and names itself in the Actions
  tab, instead of surfacing on the next unrelated PR to touch anything.

The audit step's failure output points back at this section. The other half
of option 2 — Dependabot *security* updates, so the override PR opens
itself instead of waiting for whoever notices the red schedule run first —
is a GitHub repository setting (Settings → Code security), not something
this repo's files can turn on; see Automated updates below.

When the gate goes red:

1. Prefer bumping the direct dependency that pulls the vulnerable version,
   if a patch/minor release already carries the fix.
2. Otherwise add an entry to `pnpm.overrides` in `package.json`, keyed with
   the vulnerable range so already-fixed ranges are left alone
   (`"sharp@<0.35.4": "^0.35.4"`), then `pnpm install` and confirm with
   `pnpm why <pkg>` and `pnpm install --frozen-lockfile`. The existing
   entries in that block are all of this shape; keep them — once the
   upstream range moves past the fix they become no-ops.
   Auto-installed peers need one extra step: the override rewrites the peer
   range in the lockfile, but pnpm keeps the previously locked resolution.
   Re-resolve it through pnpm, never by hand:
   `pnpm remove <parent> && pnpm add -E <parent>@<pinned version>`.
3. If no fixed version exists, the last resort is
   `pnpm.auditConfig.ignoreCves` / `ignoreGhsas` in `package.json` with the
   advisory id, a one-line reachability argument and a date to revisit —
   the same trade-off note this policy already requires for a new
   high-severity dependency.

Run the same command locally before opening a PR that touches
`package.json` or `pnpm-lock.yaml`.

## Automated updates

Dependabot, configured in `.github/dependabot.yml` (issue #1076). Chosen
over Renovate because it needs no app install or org-level permission
grant — the config file is the whole setup — and over "none" because
`pnpm audit` only catches advisories already published against the pinned
versions; routine bumps are what keep the tree on ranges upstream still
patches. Kept quiet on purpose:

- monthly cadence, `npm` and `github-actions` ecosystems only;
- one grouped PR per ecosystem for minor + patch bumps, majors excluded
  (Svelte/SvelteKit/Stripe majors are a deliberate decision, see
  Upgrading above);
- a small open-PR limit, so a month's worth of updates is one review, not
  twenty.

Dependabot *security* updates are a repository setting (Settings →
Code security), not something this file turns on; when enabled they follow
the grouping in the same config. The audit gate above does not depend on
either: it fails CI on a runtime advisory whether or not a bot opened a PR.
Issue #1118's decision calls for turning this setting on, as the other half
of moving the blocking audit off unrelated PRs — it is still an owner
action outstanding in the GitHub UI, not done by this doc.

## Verification

- CI installs with `--frozen-lockfile`.
- CI fails on a high-severity advisory in the production dependency tree
  (`pnpm audit --prod --audit-level high`, see above); the full-tree
  `pnpm audit` is printed for visibility. Don't introduce a new
  high-severity dep without documenting the trade-off.
