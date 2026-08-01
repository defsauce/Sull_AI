import type { Pool } from 'pg';
import { conflict, notFound, forbidden } from '@sull/errors';
import { createCloudEvent, EventTypes, topicFor } from '@sull/events';
import { insertOutboxEvent, withTransaction } from '@sull/db';
import type { TenantCreate } from '@sull/contracts';
import type { Principal } from '@sull/auth-sdk';

export interface TenantRecord {
  id: string;
  name: string;
  slug: string;
  plan: 'free' | 'pro' | 'enterprise';
  status: 'active' | 'suspended' | 'deleted';
  created_at: Date;
  updated_at: Date;
}

const PLAN_QUOTAS = {
  free: { max_seats: 5, max_tokens_per_day: 100_000, max_storage_gb: 5 },
  pro: { max_seats: 50, max_tokens_per_day: 5_000_000, max_storage_gb: 200 },
  enterprise: { max_seats: 10_000, max_tokens_per_day: 500_000_000, max_storage_gb: 10_000 },
} as const;

export class TenantService {
  constructor(private readonly pool: Pool) {}

  async create(principal: Principal, input: TenantCreate): Promise<TenantRecord> {
    return withTransaction(this.pool, async (client) => {
      const existing = await client.query(`SELECT id FROM tenants WHERE slug = $1`, [input.slug]);
      if ((existing.rowCount ?? 0) > 0) {
        throw conflict(`Tenant slug '${input.slug}' already exists`);
      }

      const inserted = await client.query<TenantRecord>(
        `INSERT INTO tenants (name, slug, plan, created_by)
         VALUES ($1, $2, $3, $4)
         RETURNING id, name, slug, plan, status, created_at, updated_at`,
        [input.name, input.slug, input.plan, principal.sub],
      );
      const tenant = inserted.rows[0]!;
      const quotas = PLAN_QUOTAS[input.plan];
      await client.query(
        `INSERT INTO tenant_quotas (tenant_id, max_seats, max_tokens_per_day, max_storage_gb)
         VALUES ($1, $2, $3, $4)`,
        [tenant.id, quotas.max_seats, quotas.max_tokens_per_day, quotas.max_storage_gb],
      );

      const event = createCloudEvent({
        type: EventTypes.TenantCreated,
        source: 'tenant-service',
        tenantId: tenant.id,
        aggregateId: tenant.id,
        aggregateType: 'tenant',
        sequence: 1,
        data: {
          tenantId: tenant.id,
          name: tenant.name,
          slug: tenant.slug,
          plan: tenant.plan,
          createdBy: principal.sub,
        },
      });
      await insertOutboxEvent(client, event, topicFor('tenant'));
      return tenant;
    });
  }

  async getById(principal: Principal, tenantId: string): Promise<TenantRecord> {
    if (principal.tenantId !== tenantId && !principal.roles.includes('platform_admin')) {
      throw forbidden('Cross-tenant access denied');
    }
    const result = await this.pool.query<TenantRecord>(
      `SELECT id, name, slug, plan, status, created_at, updated_at
       FROM tenants WHERE id = $1 AND status <> 'deleted'`,
      [tenantId],
    );
    const tenant = result.rows[0];
    if (!tenant) {
      throw notFound('Tenant');
    }
    return tenant;
  }

  async getBySlug(slug: string): Promise<TenantRecord> {
    const result = await this.pool.query<TenantRecord>(
      `SELECT id, name, slug, plan, status, created_at, updated_at
       FROM tenants WHERE slug = $1 AND status <> 'deleted'`,
      [slug],
    );
    const tenant = result.rows[0];
    if (!tenant) {
      throw notFound('Tenant');
    }
    return tenant;
  }

  async suspend(principal: Principal, tenantId: string, reason: string): Promise<TenantRecord> {
    if (!principal.roles.includes('platform_admin')) {
      throw forbidden('Only platform admins can suspend tenants');
    }
    return withTransaction(this.pool, async (client) => {
      const result = await client.query<TenantRecord>(
        `UPDATE tenants
         SET status = 'suspended', updated_at = NOW(), version = version + 1
         WHERE id = $1 AND status = 'active'
         RETURNING id, name, slug, plan, status, created_at, updated_at`,
        [tenantId],
      );
      const tenant = result.rows[0];
      if (!tenant) {
        throw notFound('Tenant');
      }
      const event = createCloudEvent({
        type: EventTypes.TenantSuspended,
        source: 'tenant-service',
        tenantId: tenant.id,
        aggregateId: tenant.id,
        aggregateType: 'tenant',
        sequence: Number(Date.now()),
        data: { tenantId: tenant.id, reason },
      });
      await insertOutboxEvent(client, event, topicFor('tenant'));
      return tenant;
    });
  }
}

export function toTenantResponse(tenant: TenantRecord) {
  return {
    id: tenant.id,
    name: tenant.name,
    slug: tenant.slug,
    plan: tenant.plan,
    status: tenant.status,
    createdAt: tenant.created_at.toISOString(),
    updatedAt: tenant.updated_at.toISOString(),
  };
}
