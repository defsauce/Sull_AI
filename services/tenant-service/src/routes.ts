import type { FastifyInstance } from 'fastify';
import { AuthVerifier, requireScopes } from '@sull/auth-sdk';
import { tenantCreateSchema } from '@sull/contracts';
import { unauthorized } from '@sull/errors';
import { validateBody } from '@sull/http';
import { z } from 'zod';
import { TenantService, toTenantResponse } from './service.js';

const suspendSchema = z.object({
  reason: z.string().min(3).max(500),
});

export async function registerRoutes(
  app: FastifyInstance,
  tenants: TenantService,
  auth: AuthVerifier,
): Promise<void> {
  app.addHook('preHandler', async (request) => {
    if (request.url === '/healthz' || request.url === '/readyz') {
      return;
    }
    request.principal = await auth.verifyBearerToken(request.headers.authorization);
  });

  app.post('/v1/tenants', async (request, reply) => {
    const principal = request.principal;
    if (!principal) {
      throw unauthorized();
    }
    requireScopes(principal, ['tenants:write']);
    const body = await validateBody(tenantCreateSchema)(request);
    const tenant = await tenants.create(principal, {
      name: body.name,
      slug: body.slug,
      plan: body.plan ?? 'free',
    });
    return reply.status(201).send(toTenantResponse(tenant));
  });

  app.get('/v1/tenants/:tenantId', async (request) => {
    const principal = request.principal;
    if (!principal) {
      throw unauthorized();
    }
    requireScopes(principal, ['tenants:read']);
    const params = z.object({ tenantId: z.string().uuid() }).parse(request.params);
    const tenant = await tenants.getById(principal, params.tenantId);
    return toTenantResponse(tenant);
  });

  app.get('/v1/tenants/by-slug/:slug', async (request) => {
    const principal = request.principal;
    if (!principal) {
      throw unauthorized();
    }
    requireScopes(principal, ['tenants:read']);
    const params = z.object({ slug: z.string().min(2) }).parse(request.params);
    const tenant = await tenants.getBySlug(params.slug);
    return toTenantResponse(tenant);
  });

  app.post('/v1/tenants/:tenantId/suspend', async (request) => {
    const principal = request.principal;
    if (!principal) {
      throw unauthorized();
    }
    const params = z.object({ tenantId: z.string().uuid() }).parse(request.params);
    const body = await validateBody(suspendSchema)(request);
    const tenant = await tenants.suspend(principal, params.tenantId, body.reason);
    return toTenantResponse(tenant);
  });
}
