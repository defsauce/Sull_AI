export const SCHEMA_SQL = `
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS daily_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  usage_date DATE NOT NULL,
  meter TEXT NOT NULL CHECK (meter IN ('tokens', 'requests', 'storage_gb', 'seats')),
  quantity NUMERIC(18, 6) NOT NULL,
  cost_usd NUMERIC(18, 6) NOT NULL DEFAULT 0,
  model_provider TEXT,
  model_name TEXT,
  event_count INT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, usage_date, meter, model_provider, model_name)
);

CREATE INDEX IF NOT EXISTS idx_daily_usage_tenant_date
  ON daily_usage (tenant_id, usage_date DESC);
`;
