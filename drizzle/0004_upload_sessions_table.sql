-- Replace filesystem-based upload sessions with a DB-backed table
-- so session data survives server restarts and enables multi-instance deployments.
CREATE TABLE IF NOT EXISTS upload_sessions (
  id         text PRIMARY KEY,
  data       text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Prune sessions older than 24 hours (matches existing TTL logic)
CREATE INDEX IF NOT EXISTS upload_sessions_updated_at_idx ON upload_sessions (updated_at);
