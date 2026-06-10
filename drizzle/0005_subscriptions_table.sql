-- Subscriptions table for Stripe billing integration
CREATE TABLE IF NOT EXISTS subscriptions (
  id                    serial PRIMARY KEY,
  restaurant_id         uuid NOT NULL UNIQUE REFERENCES restaurants(id) ON DELETE CASCADE,
  stripe_customer_id    text UNIQUE,
  stripe_subscription_id text UNIQUE,
  stripe_price_id       text,
  status                text NOT NULL DEFAULT 'trialing',
  trial_ends_at         timestamptz,
  current_period_end    timestamptz,
  cancel_at_period_end  boolean NOT NULL DEFAULT false,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

-- Seed trial subscriptions for all existing restaurants that don't have one yet
-- (30-day trial from account creation)
INSERT INTO subscriptions (restaurant_id, status, trial_ends_at)
SELECT r.id, 'trialing', r.created_at + interval '30 days'
FROM restaurants r
WHERE NOT EXISTS (
  SELECT 1 FROM subscriptions s WHERE s.restaurant_id = r.id
);
