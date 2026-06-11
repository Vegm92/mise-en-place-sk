-- Add plan_tier to subscriptions table to track which pricing tier a tenant is on.
-- Existing rows default to 'starter' (active paid plan) rather than 'trial' since
-- any existing subscription was on the legacy single price.
ALTER TABLE subscriptions
  ADD COLUMN IF NOT EXISTS plan_tier text NOT NULL DEFAULT 'starter';
