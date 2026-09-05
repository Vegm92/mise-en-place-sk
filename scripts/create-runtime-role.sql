-- Runtime Postgres role for the web app + pg-boss worker (issue #464).
--
-- Splits the single owner/superuser DATABASE_URL into two credentials:
--   DATABASE_MIGRATION_URL — unchanged, the existing owner/superuser role,
--                             used only by drizzle-kit ("pnpm db:migrate").
--   DATABASE_URL            — this new role: SELECT/INSERT/UPDATE/DELETE on
--                             app tables, no DDL, not superuser/owner.
--
-- Run this ONCE per database, connected as the EXISTING owner/superuser role
-- (the same role DATABASE_MIGRATION_URL will keep using):
--
--   RUNTIME_ROLE_PASSWORD='...' psql "$DATABASE_URL" -f scripts/create-runtime-role.sql
--
-- (Railway: run it against DATABASE_PUBLIC_URL from your machine or CI — the
-- internal *.railway.internal host is not reachable from outside the project.)
--
-- Idempotent: safe to re-run after every `pnpm db:generate` — it re-applies
-- grants to any tables/sequences/functions added since the last run. It does
-- NOT reset an already-set password on re-run (see step 1). The `drizzle`
-- schema (drizzle-kit's own migration ledger) stays owned by the migration
-- role; the runtime role only gets SELECT on it, so /admin/health and the
-- worker's pre-deploy gate can compare the ledger with the shipped journal.
--
-- Password source: the RUNTIME_ROLE_PASSWORD environment variable, or pass
-- -v runtime_password=... on the psql command line to override it.
-- Role name defaults to mep_runtime; pass -v runtime_role=... to use a
-- different name (e.g. an isolated name for a test run).

\if :{?runtime_role}
\else
	\set runtime_role 'mep_runtime'
\endif

\if :{?runtime_password}
\else
	\set runtime_password `printf '%s' "${RUNTIME_ROLE_PASSWORD:?Set RUNTIME_ROLE_PASSWORD in the environment, or pass -v runtime_password=... on the psql command line}"`
\endif

-- psql does NOT interpolate :'var' inside dollar-quoted (DO $$ ... $$) bodies
-- (by design — plpgsql source is full of literal colons). Every DO block below
-- reads the role name back out of this session-local GUC instead, via
-- current_setting(), so no client-side substitution has to cross that boundary.
SELECT set_config('mep.runtime_role', :'runtime_role', false);

-- ── 1. Role ─────────────────────────────────────────────────────────────────
-- LOGIN only — explicitly no SUPERUSER, no CREATEDB, no CREATEROLE, no
-- REPLICATION, no BYPASSRLS. Password is set only at creation: re-running this
-- script never clobbers a password that was rotated afterwards. Rotate with
-- `ALTER ROLE mep_runtime PASSWORD '...'` separately. Plain top-level SELECT
-- (not dollar-quoted), so :'runtime_role'/:'runtime_password' substitute
-- normally; \gexec runs the generated CREATE ROLE only when the WHERE finds
-- no existing row, and runs nothing (0 rows) when the role already exists.
SELECT format(
	'CREATE ROLE %I LOGIN PASSWORD %L NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS',
	:'runtime_role', :'runtime_password'
)
WHERE NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = :'runtime_role')
\gexec

-- ── 2. Connect + schema boundary ────────────────────────────────────────────
-- USAGE lets it see objects in `public`; CREATE stays revoked from PUBLIC (the
-- Postgres 15+ default already does this — restated here so the boundary
-- holds even on an older cluster or one where a prior migration re-granted
-- it) so the role can never create a table of its own in `public`.
SELECT format('GRANT CONNECT ON DATABASE %I TO %I', current_database(), :'runtime_role') \gexec
GRANT USAGE ON SCHEMA public TO :"runtime_role";
REVOKE CREATE ON SCHEMA public FROM PUBLIC;

-- ── 3. DML on app tables (public schema only) ───────────────────────────────
-- No ALTER/DROP/TRUNCATE-via-DDL, no CREATE — a SQL-injection bug or a missed
-- forTenant() can read/write rows, not drop tables, alter columns, or read
-- other tenants' data through schema changes.
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO :"runtime_role";
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO :"runtime_role";
-- EXECUTE covers refresh_analytics_rollups() (SECURITY DEFINER — runs with the
-- owner's privileges regardless of caller, see drizzle/0005_analytics_rollups.sql)
-- and any future public-schema function; the app never needs to be the owner
-- to call it, only to have EXECUTE.
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO :"runtime_role";

-- Future migrations run as the connecting (owner) role — this makes every
-- table/sequence/function *that role* creates from now on automatically carry
-- the same grants, so this script does not need to be re-run after ordinary
-- schema changes (only after adding a NEW database, or if grants are ever
-- reset).
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO :"runtime_role";
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO :"runtime_role";
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO :"runtime_role";

-- ── 3b. drizzle-kit's migration ledger: read-only ───────────────────────────
-- `drizzle.__drizzle_migrations` is written only by `pnpm db:migrate` (the
-- migration role). The app reads it to answer "is the schema this build
-- expects fully applied?" — /admin/health's "Migrations" check and
-- build/wait-for-migrations.js, the worker service's Railway preDeployCommand
-- (see src/lib/server/migration-state.ts). CREATE SCHEMA IF NOT EXISTS keeps
-- this idempotent on a database drizzle-kit has not touched yet; drizzle-kit's
-- own `CREATE SCHEMA IF NOT EXISTS "drizzle"` then becomes a no-op, and the
-- default-privileges line covers the ledger table it creates afterwards.
CREATE SCHEMA IF NOT EXISTS drizzle;
GRANT USAGE ON SCHEMA drizzle TO :"runtime_role";
GRANT SELECT ON ALL TABLES IN SCHEMA drizzle TO :"runtime_role";
ALTER DEFAULT PRIVILEGES IN SCHEMA drizzle GRANT SELECT ON TABLES TO :"runtime_role";

-- ── 4. pg-boss schema: full ownership, isolated from `public` ──────────────
-- pg-boss runs its OWN migrations against the `pgboss` schema at every
-- boot — CREATE SCHEMA/TYPE/TABLE/INDEX/FUNCTION on first install, and again
-- on every version bump of the `pg-boss` package (see
-- node_modules/pg-boss/dist/contractor.js: Contractor.start() calls create()
-- when uninstalled or migrate() when the installed schema version is behind
-- the package's). Both web (src/lib/server/queue.ts) and worker
-- (src/worker.ts) processes call PgBoss#start() against DATABASE_URL, so the
-- runtime role must be able to run that DDL — but ONLY inside its own schema.
--
-- Giving mep_runtime ownership of `pgboss` (schema + every object in it)
-- satisfies both halves of the acceptance criteria: pg-boss keeps managing
-- its own schema with zero manual steps on a `pg-boss` version bump, while
-- `public` (every app table) stays owned by the migration role, so a DDL
-- statement against an app table is refused (verified below).
--
-- CREATE SCHEMA IF NOT EXISTS covers a brand-new database (pgboss schema does
-- not exist yet — mep_runtime will own it outright, and PgBoss#start()'s own
-- `CREATE SCHEMA IF NOT EXISTS pgboss` becomes a no-op). The ALTER SCHEMA plus
-- the ownership-reassignment loop below covers a database where `pgboss` was
-- already bootstrapped by the (super)user role prior to this migration.
CREATE SCHEMA IF NOT EXISTS pgboss;
ALTER SCHEMA pgboss OWNER TO :"runtime_role";

DO $$
DECLARE
	target_role text := current_setting('mep.runtime_role');
	target_oid oid := (SELECT oid FROM pg_catalog.pg_roles WHERE rolname = current_setting('mep.runtime_role'));
	r RECORD;
BEGIN
	-- Tables (incl. partitioned tables and their partitions), sequences, views.
	FOR r IN
		SELECT c.relname,
		       CASE c.relkind
		         WHEN 'r' THEN 'TABLE'
		         WHEN 'p' THEN 'TABLE'
		         WHEN 'S' THEN 'SEQUENCE'
		         WHEN 'v' THEN 'VIEW'
		         WHEN 'm' THEN 'MATERIALIZED VIEW'
		       END AS kind
		FROM pg_catalog.pg_class c
		JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
		WHERE n.nspname = 'pgboss'
		  AND c.relkind IN ('r', 'p', 'S', 'v', 'm')
		  AND c.relowner <> target_oid
	LOOP
		EXECUTE format('ALTER %s pgboss.%I OWNER TO %I', r.kind, r.relname, target_role);
	END LOOP;

	-- Functions pg-boss defines in its own schema (e.g. job_table_run_async()).
	FOR r IN
		SELECT p.oid::regprocedure::text AS sig
		FROM pg_catalog.pg_proc p
		JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
		WHERE n.nspname = 'pgboss'
		  AND p.proowner <> target_oid
	LOOP
		EXECUTE format('ALTER FUNCTION %s OWNER TO %I', r.sig, target_role);
	END LOOP;

	-- Enum types (e.g. pgboss.job_state).
	FOR r IN
		SELECT t.typname
		FROM pg_catalog.pg_type t
		JOIN pg_catalog.pg_namespace n ON n.oid = t.typnamespace
		WHERE n.nspname = 'pgboss'
		  AND t.typtype = 'e'
		  AND t.typowner <> target_oid
	LOOP
		EXECUTE format('ALTER TYPE pgboss.%I OWNER TO %I', r.typname, target_role);
	END LOOP;
END
$$;

-- ── 5. Verify ────────────────────────────────────────────────────────────────
-- Expect: the runtime role NOT in the superuser/createdb/createrole/bypassrls
-- columns below, and owning `pgboss` but not `public`.
\echo 'Role attributes:'
SELECT rolname, rolsuper, rolcreatedb, rolcreaterole, rolbypassrls FROM pg_roles WHERE rolname = :'runtime_role';
\echo 'Schema ownership (public must stay owned by the migration role; pgboss must now be owned by the runtime role):'
SELECT nspname, pg_get_userbyid(nspowner) AS owner FROM pg_namespace WHERE nspname IN ('public', 'pgboss');
