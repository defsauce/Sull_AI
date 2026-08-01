import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose';
import { z } from 'zod';
import { unauthorized, forbidden } from '@sull/errors';

export const principalSchema = z.object({
  sub: z.string().min(1),
  tenantId: z.string().uuid(),
  email: z.string().email().optional(),
  roles: z.array(z.string()).default([]),
  scopes: z.array(z.string()).default([]),
  typ: z.enum(['user', 'service', 'api_key']).default('user'),
});

export type Principal = z.infer<typeof principalSchema>;

export interface AuthVerifierOptions {
  readonly issuer: string;
  readonly audience: string | string[];
  readonly jwksUrl: string;
  readonly clockToleranceSec?: number;
}

export class AuthVerifier {
  private readonly jwks: ReturnType<typeof createRemoteJWKSet>;
  private readonly issuer: string;
  private readonly audience: string | string[];
  private readonly clockToleranceSec: number;

  constructor(options: AuthVerifierOptions) {
    this.jwks = createRemoteJWKSet(new URL(options.jwksUrl));
    this.issuer = options.issuer;
    this.audience = options.audience;
    this.clockToleranceSec = options.clockToleranceSec ?? 5;
  }

  async verifyBearerToken(authorizationHeader: string | undefined): Promise<Principal> {
    if (!authorizationHeader?.startsWith('Bearer ')) {
      throw unauthorized('Missing bearer token');
    }
    const token = authorizationHeader.slice('Bearer '.length).trim();
    if (token.length === 0) {
      throw unauthorized('Empty bearer token');
    }

    let payload: JWTPayload;
    try {
      const verified = await jwtVerify(token, this.jwks, {
        issuer: this.issuer,
        audience: this.audience,
        clockTolerance: this.clockToleranceSec,
      });
      payload = verified.payload;
    } catch {
      throw unauthorized('Invalid or expired token');
    }

    const parsed = principalSchema.safeParse({
      sub: payload.sub,
      tenantId: payload.tenant_id ?? payload.tid,
      email: payload.email,
      roles: payload.roles ?? [],
      scopes: payload.scope
        ? String(payload.scope)
            .split(' ')
            .filter((s) => s.length > 0)
        : (payload.scopes ?? []),
      typ: payload.typ ?? 'user',
    });

    if (!parsed.success) {
      throw unauthorized('Token missing required claims');
    }

    return parsed.data;
  }
}

export function requireScopes(principal: Principal, required: readonly string[]): void {
  const missing = required.filter((scope) => !principal.scopes.includes(scope));
  if (missing.length > 0) {
    throw forbidden(`Missing required scopes: ${missing.join(', ')}`);
  }
}

export function requireRoles(principal: Principal, required: readonly string[]): void {
  const missing = required.filter((role) => !principal.roles.includes(role));
  if (missing.length > 0) {
    throw forbidden(`Missing required roles: ${missing.join(', ')}`);
  }
}

export function assertTenantAccess(principal: Principal, tenantId: string): void {
  if (principal.tenantId !== tenantId) {
    throw forbidden('Cross-tenant access denied');
  }
}
