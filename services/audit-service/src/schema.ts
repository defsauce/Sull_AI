export const SCHEMA_SQL = `
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS audit_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  actor_id TEXT NOT NULL,
  actor_type TEXT NOT NULL CHECK (actor_type IN ('user', 'service', 'system')),
  action TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id TEXT NOT NULL,
  outcome TEXT NOT NULL CHECK (outcome IN ('success', 'denied', 'failure')),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_records_tenant_time ON audit_records(tenant_id, recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_records_actor ON audit_records(tenant_id, actor_id, recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_records_resource ON audit_records(tenant_id, resource_type, resource_id);
CREATE INDEX IF NOT EXISTS idx_audit_records_action ON audit_records(tenant_id, action, recorded_at DESC);
`;
