import type { Pool } from 'pg';
import { assertTenantAccess, type Principal } from '@sull/auth-sdk';
import { insertOutboxEvent, withTransaction } from '@sull/db';
import { notFound } from '@sull/errors';
import { createCloudEvent, EventTypes, topicFor } from '@sull/events';

export interface AuditRecord {
  id: string;
  tenant_id: string;
  actor_id: string;
  actor_type: 'user' | 'service' | 'system';
  action: string;
  resource_type: string;
  resource_id: string;
  outcome: 'success' | 'denied' | 'failure';
  metadata: Record<string, unknown>;
  recorded_at: Date;
}

export interface AppendAuditInput {
  tenantId: string;
  actorId: string;
  actorType: 'user' | 'service' | 'system';
  action: string;
  resourceType: string;
  resourceId: string;
  outcome: 'success' | 'denied' | 'failure';
  metadata?: Record<string, unknown>;
}

export interface AuditQuery {
  tenantId: string;
  actorId?: string;
  action?: string;
  resourceType?: string;
  resourceId?: string;
  outcome?: 'success' | 'denied' | 'failure';
  from?: string;
  to?: string;
  limit: number;
}

export class AuditService {
  constructor(private readonly pool: Pool) {}

  async append(principal: Principal, input: AppendAuditInput): Promise<AuditRecord> {
    assertTenantAccess(principal, input.tenantId);

    return withTransaction(this.pool, async (client) => {
      const inserted = await client.query<AuditRecord>(
        `INSERT INTO audit_records (tenant_id, actor_id, actor_type, action, resource_type, resource_id, outcome, metadata)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)
         RETURNING id, tenant_id, actor_id, actor_type, action, resource_type, resource_id, outcome, metadata, recorded_at`,
        [
          input.tenantId,
          input.actorId,
          input.actorType,
          input.action,
          input.resourceType,
          input.resourceId,
          input.outcome,
          JSON.stringify(input.metadata ?? {}),
        ],
      );
      const record = inserted.rows[0]!;

      const event = createCloudEvent({
        type: EventTypes.AuditRecorded,
        source: 'audit-service',
        tenantId: input.tenantId,
        aggregateId: record.id,
        aggregateType: 'audit',
        sequence: Number(Date.now()),
        data: {
          auditId: record.id,
          actorId: record.actor_id,
          actorType: record.actor_type,
          action: record.action,
          resourceType: record.resource_type,
          resourceId: record.resource_id,
          outcome: record.outcome,
          metadata: record.metadata,
        },
      });
      await insertOutboxEvent(client, event, topicFor('audit'));
      return record;
    });
  }

  async query(principal: Principal, query: AuditQuery): Promise<AuditRecord[]> {
    assertTenantAccess(principal, query.tenantId);

    const conditions = ['tenant_id = $1'];
    const params: unknown[] = [query.tenantId];

    if (query.actorId) {
      params.push(query.actorId);
      conditions.push(`actor_id = $${params.length}`);
    }
    if (query.action) {
      params.push(query.action);
      conditions.push(`action = $${params.length}`);
    }
    if (query.resourceType) {
      params.push(query.resourceType);
      conditions.push(`resource_type = $${params.length}`);
    }
    if (query.resourceId) {
      params.push(query.resourceId);
      conditions.push(`resource_id = $${params.length}`);
    }
    if (query.outcome) {
      params.push(query.outcome);
      conditions.push(`outcome = $${params.length}`);
    }
    if (query.from) {
      params.push(query.from);
      conditions.push(`recorded_at >= $${params.length}::timestamptz`);
    }
    if (query.to) {
      params.push(query.to);
      conditions.push(`recorded_at < $${params.length}::timestamptz`);
    }

    params.push(query.limit);
    const sql = `
      SELECT id, tenant_id, actor_id, actor_type, action, resource_type, resource_id, outcome, metadata, recorded_at
      FROM audit_records
      WHERE ${conditions.join(' AND ')}
      ORDER BY recorded_at DESC
      LIMIT $${params.length}`;

    const result = await this.pool.query<AuditRecord>(sql, params);
    return result.rows;
  }

  async getById(principal: Principal, auditId: string): Promise<AuditRecord> {
    const result = await this.pool.query<AuditRecord>(
      `SELECT id, tenant_id, actor_id, actor_type, action, resource_type, resource_id, outcome, metadata, recorded_at
       FROM audit_records WHERE id = $1`,
      [auditId],
    );
    const record = result.rows[0];
    if (!record) {
      throw notFound('Audit record');
    }
    assertTenantAccess(principal, record.tenant_id);
    return record;
  }
}

export function toAuditResponse(record: AuditRecord) {
  return {
    id: record.id,
    tenantId: record.tenant_id,
    actorId: record.actor_id,
    actorType: record.actor_type,
    action: record.action,
    resourceType: record.resource_type,
    resourceId: record.resource_id,
    outcome: record.outcome,
    metadata: record.metadata,
    recordedAt: record.recorded_at.toISOString(),
  };
}
