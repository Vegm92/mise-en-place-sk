-- CI-only: stub the Supabase auth schema so the RLS migration (0001) can apply
-- against a plain PostgreSQL container. The test connection runs as the postgres
-- superuser, which bypasses RLS, so the stub return value ('') is never used.
CREATE SCHEMA IF NOT EXISTS auth;
CREATE OR REPLACE FUNCTION auth.uid()
    RETURNS text LANGUAGE sql AS $$SELECT ''::text$$;
