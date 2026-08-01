import type { Pool, PoolClient } from 'pg';
import { assertTenantAccess, type Principal } from '@sull/auth-sdk';
import { withTransaction } from '@sull/db';
import { notFound } from '@sull/errors';
import {
  EventTypes,
  parseCloudEvent,
  tenantCreatedDataSchema,
  usageRecordedDataSchema,
  userRegisteredDataSchema,
  type CloudEvent,
} from '@sull/events';
import { z } from 'zod';

export interface ProjectedTenant {
  id: string;
  name: string;
  slug: string;
  plan: string;
  status: string;
  last_event_id: string;
  last_event_at: Date;
  updated_at: Date;
}

export interface ProjectedUser {
  id: string;
  tenant_id: string;
  email: string;
  display_name: string;
  last_event_id: string;
  last_event_at: Date;
  updated_at: Date;
}

export interface ProjectedUsageTotal {
  tenant_id: string;
  meter: string;
  total_quantity: string;
  last_event_id: string;
  updated_at: Date;
}

const tenantSuspendedDataSchema = z.object({
  tenantId: z.string().uuid(),
  reason: z.string(),
});

const userUpdatedDataSchema = z.object({
  userId: z.string().uuid(),
  displayName: z.string(),
  avatarUrl: z.string().nullable().optional(),
});

const membershipGrantedDataSchema = z.object({
  membershipId: z.string().uuid(),
  userId: z.string().uuid(),
  tenantId: z.string().uuid(),
  role: z.string(),
  grantedBy: z.string(),
});

export class ProjectorService {
  constructor(
    private readonly pool: Pool,
    private readonly consumerGroup: string,
  ) {}

  async handleEvent(event: CloudEvent, topic: string, partition: number, offset: string): Promise<void> {
    await withTransaction(this.pool, async (client) => {
      switch (event.type) {
        case EventTypes.TenantCreated: {
          const data = parseCloudEvent(event, tenantCreatedDataSchema).data;
          await client.query(
            `INSERT INTO projected_tenants (id, name, slug, plan, status, last_event_id, last_event_at)
             VALUES ($1, $2, $3, $4, 'active', $5, $6::timestamptz)
             ON CONFLICT (id) DO UPDATE
             SET name = EXCLUDED.name,
                 slug = EXCLUDED.slug,
                 plan = EXCLUDED.plan,
                 status = 'active',
                 last_event_id = EXCLUDED.last_event_id,
                 last_event_at = EXCLUDED.last_event_at,
                 updated_at = NOW()`,
            [data.tenantId, data.name, data.slug, data.plan, event.id, event.time],
          );
          break;
        }
        case EventTypes.TenantSuspended: {
          const data = parseCloudEvent(event, tenantSuspendedDataSchema).data;
          await client.query(
            `UPDATE projected_tenants
             SET status = 'suspended', last_event_id = $2, last_event_at = $3::timestamptz, updated_at = NOW()
             WHERE id = $1`,
            [data.tenantId, event.id, event.time],
          );
          break;
        }
        case EventTypes.UserRegistered: {
          const data = parseCloudEvent(event, userRegisteredDataSchema).data;
          await client.query(
            `INSERT INTO projected_users (id, tenant_id, email, display_name, last_event_id, last_event_at)
             VALUES ($1, $2, $3, $4, $5, $6::timestamptz)
             ON CONFLICT (id) DO UPDATE
             SET email = EXCLUDED.email,
                 display_name = EXCLUDED.display_name,
                 tenant_id = EXCLUDED.tenant_id,
                 last_event_id = EXCLUDED.last_event_id,
                 last_event_at = EXCLUDED.last_event_at,
                 updated_at = NOW()`,
            [data.userId, event.tenantid, data.email, data.displayName, event.id, event.time],
          );
          break;
        }
        case EventTypes.UserUpdated: {
          const data = parseCloudEvent(event, userUpdatedDataSchema).data;
          await client.query(
            `UPDATE projected_users
             SET display_name = $2, last_event_id = $3, last_event_at = $4::timestamptz, updated_at = NOW()
             WHERE id = $1`,
            [data.userId, data.displayName, event.id, event.time],
          );
          break;
        }
        case EventTypes.MembershipGranted: {
          const data = parseCloudEvent(event, membershipGrantedDataSchema).data;
          await client.query(
            `UPDATE projected_users
             SET tenant_id = $2, last_event_id = $3, last_event_at = $4::timestamptz, updated_at = NOW()
             WHERE id = $1`,
            [data.userId, data.tenantId, event.id, event.time],
          );
          break;
        }
        case EventTypes.UsageRecorded: {
          const data = parseCloudEvent(event, usageRecordedDataSchema).data;
          await client.query(
            `INSERT INTO projected_usage_totals (tenant_id, meter, total_quantity, last_event_id)
             VALUES ($1, $2, $3, $4)
             ON CONFLICT (tenant_id, meter) DO UPDATE
             SET total_quantity = projected_usage_totals.total_quantity + EXCLUDED.total_quantity,
                 last_event_id = EXCLUDED.last_event_id,
                 updated_at = NOW()`,
            [event.tenantid, data.meter, data.quantity, event.id],
          );
          break;
        }
        default:
          break;
      }

      await this.saveCheckpoint(client, topic, partition, offset);
    });
  }

  private async saveCheckpoint(
    client: PoolClient,
    topic: string,
    partition: number,
    offset: string,
  ): Promise<void> {
    await client.query(
      `INSERT INTO projection_checkpoints (consumer_group, topic, partition, offset)
       VALUES ($1, $2, $3, $4::bigint)
       ON CONFLICT (consumer_group, topic, partition) DO UPDATE
       SET offset = EXCLUDED.offset, updated_at = NOW()`,
      [this.consumerGroup, topic, partition, offset],
    );
  }

  async getProjectedTenant(principal: Principal, tenantId: string): Promise<ProjectedTenant> {
    assertTenantAccess(principal, tenantId);
    const result = await this.pool.query<ProjectedTenant>(
      `SELECT id, name, slug, plan, status, last_event_id, last_event_at, updated_at
       FROM projected_tenants WHERE id = $1`,
      [tenantId],
    );
    const tenant = result.rows[0];
    if (!tenant) {
      throw notFound('Projected tenant');
    }
    return tenant;
  }

  async getProjectedUser(principal: Principal, userId: string): Promise<ProjectedUser> {
    const result = await this.pool.query<ProjectedUser>(
      `SELECT id, tenant_id, email, display_name, last_event_id, last_event_at, updated_at
       FROM projected_users WHERE id = $1`,
      [userId],
    );
    const user = result.rows[0];
    if (!user) {
      throw notFound('Projected user');
    }
    assertTenantAccess(principal, user.tenant_id);
    return user;
  }

  async getProjectedUsage(principal: Principal, tenantId: string): Promise<ProjectedUsageTotal[]> {
    assertTenantAccess(principal, tenantId);
    const result = await this.pool.query<ProjectedUsageTotal>(
      `SELECT tenant_id, meter, total_quantity, last_event_id, updated_at
       FROM projected_usage_totals WHERE tenant_id = $1 ORDER BY meter ASC`,
      [tenantId],
    );
    return result.rows;
  }
}

export function toProjectedTenantResponse(tenant: ProjectedTenant) {
  return {
    id: tenant.id,
    name: tenant.name,
    slug: tenant.slug,
    plan: tenant.plan,
    status: tenant.status,
    lastEventId: tenant.last_event_id,
    lastEventAt: tenant.last_event_at.toISOString(),
    updatedAt: tenant.updated_at.toISOString(),
  };
}

export function toProjectedUserResponse(user: ProjectedUser) {
  return {
    id: user.id,
    tenantId: user.tenant_id,
    email: user.email,
    displayName: user.display_name,
    lastEventId: user.last_event_id,
    lastEventAt: user.last_event_at.toISOString(),
    updatedAt: user.updated_at.toISOString(),
  };
}

export function toProjectedUsageResponse(usage: ProjectedUsageTotal) {
  return {
    tenantId: usage.tenant_id,
    meter: usage.meter,
    totalQuantity: Number(usage.total_quantity),
    lastEventId: usage.last_event_id,
    updatedAt: usage.updated_at.toISOString(),
  };
}

export function shouldProjectEvent(eventType: string): boolean {
  return (
    eventType === EventTypes.TenantCreated ||
    eventType === EventTypes.TenantSuspended ||
    eventType === EventTypes.UserRegistered ||
    eventType === EventTypes.UserUpdated ||
    eventType === EventTypes.MembershipGranted ||
    eventType === EventTypes.UsageRecorded
  );
}
