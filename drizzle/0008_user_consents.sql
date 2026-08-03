-- Migration 0008: T&C / Privacy Policy consent audit trail (issue #201)
--
-- Records explicit acceptance of the Terms and Privacy Policy per user and
-- policy version, covering both email/password and Google OAuth sign-ups.

CREATE TABLE IF NOT EXISTS user_consents (
	id             serial PRIMARY KEY,
	user_id        text NOT NULL,
	policy_version text NOT NULL,
	method         text NOT NULL,
	accepted_at    timestamptz DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS user_consents_user_version_unique
	ON user_consents (user_id, policy_version);

-- Written only by the server (direct owner connection); no RLS needed on
-- Railway Postgres (no Data API — see drizzle/0001_rls_policies.sql).
