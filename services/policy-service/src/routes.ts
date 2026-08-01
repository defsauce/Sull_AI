import type { FastifyInstance } from 'fastify';
import { AuthVerifier, requireScopes } from '@sull/auth-sdk';
import { unauthorized } from '@sull/errors';
import { validateBody } from '@sull/http';
import { z } from 'zod';
import { PolicyService, toBundleResponse, toRuleResponse } from './service.js';

const policyRuleSchema = z.object({
  effect: z.enum(['allow', 'deny']),
  actionPattern: z.string().min(1).max(256),
  resourcePattern: z.string().min(1).max(256),
  condition: z.record(z.unknown()).optional(),
  priority: z.number().int().min(0).max(10_000).optional(),
});

const publishBundleSchema = z.object({
  tenantId: z.string().uuid(),
  name: z.string().min(1).max(128),
  version: z.number().int().positive(),
  rules: z.array(policyRuleSchema).min(1).max(500),
});

const evaluateSchema = z.object({
  tenantId: z.string().uuid(),
  action: z.string().min(1).max(256),
  resource: z.string().min(1).max(512),
  context: z.record(z.unknown()).optional(),
});

export async function registerRoutes(
  app: FastifyInstance,
  policies: PolicyService,
  auth: AuthVerifier,
): Promise<void> {
  app.addHook('preHandler', async (request) => {
    if (request.url === '/healthz' || request.url === '/readyz') {
      return;
    }
    request.principal = await auth.verifyBearerToken(request.headers.authorization);
  });

  app.post('/v1/policies/bundles', async (request, reply) => {
    const principal = request.principal;
    if (!principal) {
      throw unauthorized();
    }
    requireScopes(principal, ['policies:write']);
    const body = await validateBody(publishBundleSchema)(request);
    const bundle = await policies.publishBundle(principal, body);
    return reply.status(201).send(toBundleResponse(bundle));
  });

  app.get('/v1/policies/bundles/:bundleId', async (request) => {
    const principal = request.principal;
    if (!principal) {
      throw unauthorized();
    }
    requireScopes(principal, ['policies:read']);
    const params = z.object({ bundleId: z.string().uuid() }).parse(request.params);
    const result = await policies.getBundle(principal, params.bundleId);
    return {
      bundle: toBundleResponse(result.bundle),
      rules: result.rules.map(toRuleResponse),
    };
  });

  app.get('/v1/policies/bundles', async (request) => {
    const principal = request.principal;
    if (!principal) {
      throw unauthorized();
    }
    requireScopes(principal, ['policies:read']);
    const query = z.object({ tenantId: z.string().uuid() }).parse(request.query);
    const bundles = await policies.listBundles(principal, query.tenantId);
    return { items: bundles.map(toBundleResponse) };
  });

  app.post('/v1/policies/evaluate', async (request) => {
    const principal = request.principal;
    if (!principal) {
      throw unauthorized();
    }
    requireScopes(principal, ['policies:read']);
    const body = await validateBody(evaluateSchema)(request);
    const result = await policies.evaluate(principal, body);
    return result;
  });
}
