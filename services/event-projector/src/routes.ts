import type { FastifyInstance } from 'fastify';
import { AuthVerifier, requireScopes } from '@sull/auth-sdk';
import { unauthorized } from '@sull/errors';
import { z } from 'zod';
import {
  ProjectorService,
  toProjectedTenantResponse,
  toProjectedUsageResponse,
  toProjectedUserResponse,
} from './service.js';

export async function registerRoutes(
  app: FastifyInstance,
  projector: ProjectorService,
  auth: AuthVerifier,
): Promise<void> {
  app.addHook('preHandler', async (request) => {
    if (request.url === '/healthz' || request.url === '/readyz') {
      return;
    }
    request.principal = await auth.verifyBearerToken(request.headers.authorization);
  });

  app.get('/v1/projections/tenants/:tenantId', async (request) => {
    const principal = request.principal;
    if (!principal) {
      throw unauthorized();
    }
    requireScopes(principal, ['projections:read']);
    const params = z.object({ tenantId: z.string().uuid() }).parse(request.params);
    const tenant = await projector.getProjectedTenant(principal, params.tenantId);
    return toProjectedTenantResponse(tenant);
  });

  app.get('/v1/projections/users/:userId', async (request) => {
    const principal = request.principal;
    if (!principal) {
      throw unauthorized();
    }
    requireScopes(principal, ['projections:read']);
    const params = z.object({ userId: z.string().uuid() }).parse(request.params);
    const user = await projector.getProjectedUser(principal, params.userId);
    return toProjectedUserResponse(user);
  });

  app.get('/v1/projections/tenants/:tenantId/usage', async (request) => {
    const principal = request.principal;
    if (!principal) {
      throw unauthorized();
    }
    requireScopes(principal, ['projections:read']);
    const params = z.object({ tenantId: z.string().uuid() }).parse(request.params);
    const usage = await projector.getProjectedUsage(principal, params.tenantId);
    return { items: usage.map(toProjectedUsageResponse) };
  });
}
