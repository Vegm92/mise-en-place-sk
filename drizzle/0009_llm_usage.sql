-- LLM usage log — records every extraction call with token counts and estimated cost.
CREATE TABLE IF NOT EXISTS llm_usage_log (
  id                serial PRIMARY KEY,
  restaurant_id     uuid NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  model             text NOT NULL,
  input_tokens      integer NOT NULL DEFAULT 0,
  output_tokens     integer NOT NULL DEFAULT 0,
  estimated_cost_usd numeric(12, 8) NOT NULL DEFAULT 0,
  caller_context    text,
  created_at        timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS llm_usage_log_restaurant_month
  ON llm_usage_log (restaurant_id, created_at);

-- Per-tenant quota config — absence of a row means unlimited.
CREATE TABLE IF NOT EXISTS tenant_llm_quotas (
  restaurant_id          uuid PRIMARY KEY REFERENCES restaurants(id) ON DELETE CASCADE,
  monthly_extractions    integer,       -- max extraction calls per calendar month
  monthly_cost_limit_usd numeric(10,4), -- max estimated USD spend per calendar month
  updated_at             timestamptz DEFAULT now()
);
