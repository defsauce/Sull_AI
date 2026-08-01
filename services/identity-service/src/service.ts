import argon2 from 'argon2';
import { createHash, randomBytes } from 'node:crypto';
import {
  exportJWK,
  importPKCS8,
  importSPKI,
  SignJWT,
  type JWK,
  type KeyLike,
} from 'jose';
import type { Pool, PoolClient } from 'pg';
import { conflict, unauthorized, validation } from '@sull/errors';
import {
  createCloudEvent,
  EventTypes,
  topicFor,
  type CloudEvent,
} from '@sull/events';
import { insertOutboxEvent } from '@sull/db';
import type { IdentityEnv } from './config.js';

export interface UserRow {
  id: string;
  email: string;
  display_name: string;
  password_hash: string;
  mfa_enabled: boolean;
  status: string;
}

export class IdentityService {
  private privateKey!: KeyLike;
  private publicKey!: KeyLike;
  private publicJwk!: JWK;

  constructor(
    private readonly pool: Pool,
    private readonly env: IdentityEnv,
  ) {}

  async initKeys(): Promise<void> {
    this.privateKey = await importPKCS8(this.env.IDENTITY_JWT_PRIVATE_KEY_PEM, 'RS256');
    this.publicKey = await importSPKI(this.env.IDENTITY_JWT_PUBLIC_KEY_PEM, 'RS256');
    this.publicJwk = await exportJWK(this.publicKey);
    this.publicJwk.alg = 'RS256';
    this.publicJwk.use = 'sig';
    this.publicJwk.kid = 'sull-identity-1';
  }

  jwks(): { keys: JWK[] } {
    return { keys: [this.publicJwk] };
  }

  async register(input: {
    email: string;
    displayName: string;
    password: string;
  }): Promise<{ userId: string; email: string; displayName: string }> {
    if (input.password.length < 12) {
      throw validation('Password must be at least 12 characters', [
        { field: 'password', message: 'too short' },
      ]);
    }

    const passwordHash = await argon2.hash(input.password, {
      type: argon2.argon2id,
      memoryCost: this.env.IDENTITY_ARGON2_MEMORY_COST,
      timeCost: 3,
      parallelism: 1,
    });

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const existing = await client.query(`SELECT id FROM users WHERE email = $1`, [
        input.email.toLowerCase(),
      ]);
      if ((existing.rowCount ?? 0) > 0) {
        throw conflict('User already exists');
      }

      const inserted = await client.query<{ id: string }>(
        `INSERT INTO users (email, display_name, password_hash)
         VALUES ($1, $2, $3)
         RETURNING id`,
        [input.email.toLowerCase(), input.displayName, passwordHash],
      );
      const userId = inserted.rows[0]!.id;

      const event = createCloudEvent({
        type: EventTypes.UserRegistered,
        source: 'identity-service',
        tenantId: this.env.IDENTITY_PLATFORM_TENANT_ID,
        aggregateId: userId,
        aggregateType: 'user',
        sequence: 1,
        data: {
          userId,
          email: input.email.toLowerCase(),
          displayName: input.displayName,
        },
      });
      await insertOutboxEvent(client, event, topicFor('identity'));
      await client.query('COMMIT');

      return {
        userId,
        email: input.email.toLowerCase(),
        displayName: input.displayName,
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async login(input: {
    email: string;
    password: string;
    userAgent?: string;
    ipAddress?: string;
  }): Promise<{
    accessToken: string;
    refreshToken: string;
    tokenType: 'Bearer';
    expiresIn: number;
  }> {
    const userResult = await this.pool.query<UserRow>(
      `SELECT id, email, display_name, password_hash, mfa_enabled, status
       FROM users WHERE email = $1`,
      [input.email.toLowerCase()],
    );
    const user = userResult.rows[0];
    if (!user) {
      throw unauthorized('Invalid credentials');
    }
    if (user.status !== 'active') {
      throw unauthorized('Account is not active');
    }

    const valid = await argon2.verify(user.password_hash, input.password);
    if (!valid) {
      throw unauthorized('Invalid credentials');
    }

    return this.issueSession(user, {
      tenantId: this.env.IDENTITY_PLATFORM_TENANT_ID,
      roles: ['member'],
      scopes: [
        'tenants:read',
        'tenants:write',
        'agents:run',
        'agents:read',
        'models:invoke',
        'models:read',
        'rag:query',
        'rag:write',
      ],
      userAgent: input.userAgent,
      ipAddress: input.ipAddress,
    });
  }

  async refresh(refreshToken: string): Promise<{
    accessToken: string;
    refreshToken: string;
    tokenType: 'Bearer';
    expiresIn: number;
  }> {
    const hash = hashToken(refreshToken);
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const session = await client.query<{
        id: string;
        user_id: string;
        tenant_id: string;
        expires_at: Date;
      }>(
        `SELECT id, user_id, tenant_id, expires_at
         FROM sessions
         WHERE refresh_token_hash = $1 AND revoked_at IS NULL
         FOR UPDATE`,
        [hash],
      );
      const row = session.rows[0];
      if (!row || row.expires_at.getTime() < Date.now()) {
        throw unauthorized('Invalid refresh token');
      }

      await client.query(`UPDATE sessions SET revoked_at = NOW() WHERE id = $1`, [row.id]);

      const userResult = await client.query<UserRow>(
        `SELECT id, email, display_name, password_hash, mfa_enabled, status FROM users WHERE id = $1`,
        [row.user_id],
      );
      const user = userResult.rows[0];
      if (!user || user.status !== 'active') {
        throw unauthorized('User unavailable');
      }

      const tokens = await this.issueSessionWithClient(client, user, {
        tenantId: row.tenant_id,
        roles: ['member'],
        scopes: [
          'tenants:read',
          'tenants:write',
          'agents:run',
          'agents:read',
          'models:invoke',
          'models:read',
          'rag:query',
          'rag:write',
        ],
      });
      await client.query('COMMIT');
      return tokens;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async revokeSession(refreshToken: string): Promise<void> {
    const hash = hashToken(refreshToken);
    await this.pool.query(
      `UPDATE sessions SET revoked_at = NOW() WHERE refresh_token_hash = $1 AND revoked_at IS NULL`,
      [hash],
    );
  }

  private async issueSession(
    user: UserRow,
    opts: {
      tenantId: string;
      roles: string[];
      scopes: string[];
      userAgent?: string;
      ipAddress?: string;
    },
  ) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const tokens = await this.issueSessionWithClient(client, user, opts);
      await client.query('COMMIT');
      return tokens;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  private async issueSessionWithClient(
    client: PoolClient,
    user: UserRow,
    opts: {
      tenantId: string;
      roles: string[];
      scopes: string[];
      userAgent?: string;
      ipAddress?: string;
    },
  ) {
    const refreshToken = randomBytes(48).toString('base64url');
    const refreshHash = hashToken(refreshToken);
    const expiresAt = new Date(Date.now() + this.env.IDENTITY_REFRESH_TOKEN_TTL_SEC * 1000);

    const sessionInsert = await client.query<{ id: string }>(
      `INSERT INTO sessions (user_id, tenant_id, refresh_token_hash, user_agent, ip_address, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id`,
      [user.id, opts.tenantId, refreshHash, opts.userAgent ?? null, opts.ipAddress ?? null, expiresAt],
    );

    const accessToken = await new SignJWT({
      tenant_id: opts.tenantId,
      email: user.email,
      roles: opts.roles,
      scopes: opts.scopes,
      typ: 'user',
      sid: sessionInsert.rows[0]!.id,
    })
      .setProtectedHeader({ alg: 'RS256', kid: 'sull-identity-1', typ: 'JWT' })
      .setSubject(user.id)
      .setIssuer(this.env.JWT_ISSUER)
      .setAudience(this.env.JWT_AUDIENCE)
      .setIssuedAt()
      .setExpirationTime(`${this.env.IDENTITY_ACCESS_TOKEN_TTL_SEC}s`)
      .sign(this.privateKey);

    const event: CloudEvent = createCloudEvent({
      type: EventTypes.SessionCreated,
      source: 'identity-service',
      tenantId: opts.tenantId,
      aggregateId: sessionInsert.rows[0]!.id,
      aggregateType: 'session',
      sequence: 1,
      data: {
        sessionId: sessionInsert.rows[0]!.id,
        userId: user.id,
        tenantId: opts.tenantId,
      },
    });
    await insertOutboxEvent(client, event, topicFor('identity'));

    return {
      accessToken,
      refreshToken,
      tokenType: 'Bearer' as const,
      expiresIn: this.env.IDENTITY_ACCESS_TOKEN_TTL_SEC,
    };
  }
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
