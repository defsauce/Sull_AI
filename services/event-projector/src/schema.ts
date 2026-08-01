export const SCHEMA_SQL = `
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS projection_checkpoints (
  consumer_group TEXT NOT NULL,
  topic TEXT NOT NULL,
  partition INT NOT NULL,
  offset BIGINT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (consumer_group, topic, partition)
);

CREATE TABLE IF NOT EXISTS projected_tenants (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  plan TEXT NOT NULL,
  status TEXT NOT NULL,
  last_event_id TEXT NOT NULL,
  last_event_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS projected_users (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL,
  email TEXT NOT NULL,
  display_name TEXT NOT NULL,
  last_event_id TEXT NOT NULL,
  last_event_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS projected_usage_totals (
  tenant_id UUID NOT NULL,
  meter TEXT NOT NULL,
  total_quantity NUMERIC(20, 6) NOT NULL DEFAULT 0,
  last_event_id TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (tenant_id, meter)
);

CREATE INDEX IF NOT EXISTS idx_projected_users_tenant ON projected_users(tenant_id);
`;
