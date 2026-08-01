import type { FastifyInstance } from 'fastify';
import { AuthVerifier, requireScopes } from '@sull/auth-sdk';
import { paginationQuerySchema } from '@sull/contracts';
import { unauthorized } from '@sull/errors';
import { validateBody } from '@sull/http';
import { z } from 'zod';
import { AuditService, toAuditResponse } from './service.js';

const appendAuditSchema = z.object({
  tenantId: z.string().uuid(),
  actorId: z.string().min(1).max(256),
  actorType: z.enum(['user', 'service', 'system']),
  action: z.string().min(1).max(256),
  resourceType: z.string().min(1).max(128),
  resourceId: z.string().min(1).max(256),
  outcome: z.enum(['success', 'denied', 'failure']),
  metadata: z.record(z.unknown()).optional(),
});

const queryAuditSchema = paginationQuerySchema.extend({
  tenantId: z.string().uuid(),
  actorId: z.string().min(1).optional(),
  action: z.string().min(1).optional(),
  resourceType: z.string().min(1).optional(),
  resourceId: z.string().min(1).optional(),
  outcome: z.enum(['success', 'denied', 'failure']).optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
});

export async function registerRoutes(
  app: FastifyInstance,
  audit: AuditService,
  auth: AuthVerifier,
): Promise<void> {
  app.addHook('preHandler', async (request) => {
    if (request.url === '/healthz' || request.url === '/readyz') {
      return;
    }
    request.principal = await auth.verifyBearerToken(request.headers.authorization);
  });

  app.post('/v1/audit/records', async (request, reply) => {
    const principal = request.principal;
    if (!principal) {
      throw unauthorized();
    }
    requireScopes(principal, ['audit:write']);
    const body = await validateBody(appendAuditSchema)(request);
    const record = await audit.append(principal, body);
    return reply.status(201).send(toAuditResponse(record));
  });

  app.get('/v1/audit/records', async (request) => {
    const principal = request.principal;
    if (!principal) {
      throw unauthorized();
    }
    requireScopes(principal, ['audit:read']);
    const query = queryAuditSchema.parse(request.query);
    const records = await audit.query(principal, query);
    return { items: records.map(toAuditResponse) };
  });

  app.get('/v1/audit/records/:auditId', async (request) => {
    const principal = request.principal;
    if (!principal) {
      throw unauthorized();
    }
    requireScopes(principal, ['audit:read']);
    const params = z.object({ auditId: z.string().uuid() }).parse(request.params);
    const record = await audit.getById(principal, params.auditId);
    return toAuditResponse(record);
  });
}
