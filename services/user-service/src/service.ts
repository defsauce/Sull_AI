import type { Pool } from 'pg';
import { assertTenantAccess, type Principal } from '@sull/auth-sdk';
import { insertOutboxEvent, withTransaction } from '@sull/db';
import { conflict, forbidden, notFound } from '@sull/errors';
import { createCloudEvent, EventTypes, topicFor } from '@sull/events';

export interface UserProfileRecord {
  id: string;
  email: string;
  display_name: string;
  avatar_url: string | null;
  status: 'active' | 'suspended' | 'deleted';
  created_at: Date;
  updated_at: Date;
}

export interface MembershipRecord {
  id: string;
  user_id: string;
  tenant_id: string;
  role: 'owner' | 'admin' | 'member' | 'viewer';
  status: 'active' | 'revoked';
  granted_by: string;
  created_at: Date;
}

export interface CreateUserInput {
  email: string;
  displayName: string;
  avatarUrl?: string;
}

export interface UpdateUserInput {
  displayName?: string;
  avatarUrl?: string | null;
}

export interface GrantMembershipInput {
  tenantId: string;
  role: 'owner' | 'admin' | 'member' | 'viewer';
}

export class UserService {
  constructor(private readonly pool: Pool) {}

  async createProfile(principal: Principal, input: CreateUserInput): Promise<UserProfileRecord> {
    return withTransaction(this.pool, async (client) => {
      const existing = await client.query(`SELECT id FROM user_profiles WHERE email = $1`, [
        input.email,
      ]);
      if ((existing.rowCount ?? 0) > 0) {
        throw conflict(`User with email '${input.email}' already exists`);
      }

      const inserted = await client.query<UserProfileRecord>(
        `INSERT INTO user_profiles (email, display_name, avatar_url)
         VALUES ($1, $2, $3)
         RETURNING id, email, display_name, avatar_url, status, created_at, updated_at`,
        [input.email, input.displayName, input.avatarUrl ?? null],
      );
      const user = inserted.rows[0]!;

      const event = createCloudEvent({
        type: EventTypes.UserRegistered,
        source: 'user-service',
        tenantId: principal.tenantId,
        aggregateId: user.id,
        aggregateType: 'user',
        sequence: 1,
        data: {
          userId: user.id,
          email: user.email,
          displayName: user.display_name,
        },
      });
      await insertOutboxEvent(client, event, topicFor('user'));
      return user;
    });
  }

  async getProfile(principal: Principal, userId: string): Promise<UserProfileRecord> {
    const result = await this.pool.query<UserProfileRecord>(
      `SELECT id, email, display_name, avatar_url, status, created_at, updated_at
       FROM user_profiles WHERE id = $1 AND status <> 'deleted'`,
      [userId],
    );
    const user = result.rows[0];
    if (!user) {
      throw notFound('User');
    }

    if (principal.sub !== userId && !principal.roles.includes('platform_admin')) {
      const membership = await this.pool.query(
        `SELECT 1 FROM tenant_memberships
         WHERE user_id = $1 AND tenant_id = $2 AND status = 'active'`,
        [userId, principal.tenantId],
      );
      if ((membership.rowCount ?? 0) === 0) {
        throw forbidden('Cross-tenant user access denied');
      }
    }

    return user;
  }

  async updateProfile(
    principal: Principal,
    userId: string,
    input: UpdateUserInput,
  ): Promise<UserProfileRecord> {
    if (principal.sub !== userId && !principal.roles.includes('platform_admin')) {
      throw forbidden('Only the user or platform admins can update profiles');
    }

    const updates: string[] = [];
    const params: unknown[] = [userId];
    if (input.displayName !== undefined) {
      params.push(input.displayName);
      updates.push(`display_name = $${params.length}`);
    }
    if (input.avatarUrl !== undefined) {
      params.push(input.avatarUrl);
      updates.push(`avatar_url = $${params.length}`);
    }
    if (updates.length === 0) {
      return this.getProfile(principal, userId);
    }

    return withTransaction(this.pool, async (client) => {
      const result = await client.query<UserProfileRecord>(
        `UPDATE user_profiles
         SET ${updates.join(', ')}, updated_at = NOW(), version = version + 1
         WHERE id = $1 AND status = 'active'
         RETURNING id, email, display_name, avatar_url, status, created_at, updated_at`,
        params,
      );
      const user = result.rows[0];
      if (!user) {
        throw notFound('User');
      }

      const event = createCloudEvent({
        type: EventTypes.UserUpdated,
        source: 'user-service',
        tenantId: principal.tenantId,
        aggregateId: user.id,
        aggregateType: 'user',
        sequence: Number(Date.now()),
        data: {
          userId: user.id,
          displayName: user.display_name,
          avatarUrl: user.avatar_url,
        },
      });
      await insertOutboxEvent(client, event, topicFor('user'));
      return user;
    });
  }

  async grantMembership(
    principal: Principal,
    userId: string,
    input: GrantMembershipInput,
  ): Promise<MembershipRecord> {
    assertTenantAccess(principal, input.tenantId);
    if (!principal.roles.includes('platform_admin') && !principal.roles.includes('tenant_admin')) {
      throw forbidden('Only tenant or platform admins can grant memberships');
    }

    return withTransaction(this.pool, async (client) => {
      const userCheck = await client.query(
        `SELECT id FROM user_profiles WHERE id = $1 AND status = 'active'`,
        [userId],
      );
      if ((userCheck.rowCount ?? 0) === 0) {
        throw notFound('User');
      }

      const inserted = await client.query<MembershipRecord>(
        `INSERT INTO tenant_memberships (user_id, tenant_id, role, granted_by)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (user_id, tenant_id) DO UPDATE
         SET role = EXCLUDED.role,
             status = 'active',
             granted_by = EXCLUDED.granted_by
         RETURNING id, user_id, tenant_id, role, status, granted_by, created_at`,
        [userId, input.tenantId, input.role, principal.sub],
      );
      const membership = inserted.rows[0]!;

      const event = createCloudEvent({
        type: EventTypes.MembershipGranted,
        source: 'user-service',
        tenantId: input.tenantId,
        aggregateId: membership.id,
        aggregateType: 'membership',
        sequence: Number(Date.now()),
        data: {
          membershipId: membership.id,
          userId: membership.user_id,
          tenantId: membership.tenant_id,
          role: membership.role,
          grantedBy: membership.granted_by,
        },
      });
      await insertOutboxEvent(client, event, topicFor('user'));
      return membership;
    });
  }

  async listMemberships(principal: Principal, userId: string): Promise<MembershipRecord[]> {
    if (principal.sub !== userId && !principal.roles.includes('platform_admin')) {
      throw forbidden('Cannot list memberships for another user');
    }

    const result = await this.pool.query<MembershipRecord>(
      `SELECT id, user_id, tenant_id, role, status, granted_by, created_at
       FROM tenant_memberships
       WHERE user_id = $1 AND status = 'active'
       ORDER BY created_at DESC`,
      [userId],
    );
    return result.rows;
  }
}

export function toUserResponse(user: UserProfileRecord) {
  return {
    id: user.id,
    email: user.email,
    displayName: user.display_name,
    avatarUrl: user.avatar_url,
    status: user.status,
    createdAt: user.created_at.toISOString(),
    updatedAt: user.updated_at.toISOString(),
  };
}

export function toMembershipResponse(membership: MembershipRecord) {
  return {
    id: membership.id,
    userId: membership.user_id,
    tenantId: membership.tenant_id,
    role: membership.role,
    status: membership.status,
    grantedBy: membership.granted_by,
    createdAt: membership.created_at.toISOString(),
  };
}
