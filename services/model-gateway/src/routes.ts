import type { FastifyInstance } from 'fastify';
import { AuthVerifier, requireScopes } from '@sull/auth-sdk';
import { modelInvokeSchema } from '@sull/contracts';
import { unauthorized } from '@sull/errors';
import { validateBody } from '@sull/http';
import { z } from 'zod';
import type { ModelGatewayService } from './service.js';
import type { TenantRateLimiter } from './rate-limiter.js';

const capsSchema = z.object({
  maxTokensPerDay: z.number().int().positive(),
  maxSpendUsdPerDay: z.number().positive(),
});

export async function registerRoutes(
  app: FastifyInstance,
  gateway: ModelGatewayService,
  rateLimiter: TenantRateLimiter,
  auth: AuthVerifier,
): Promise<void> {
  app.addHook('preHandler', async (request) => {
    if (request.url === '/healthz' || request.url === '/readyz') {
      return;
    }
    request.principal = await auth.verifyBearerToken(request.headers.authorization);
  });

  app.post('/v1/models/invoke', async (request) => {
    const principal = request.principal;
    if (!principal) {
      throw unauthorized();
    }
    requireScopes(principal, ['models:invoke']);
    const body = await validateBody(modelInvokeSchema)(request);
    return gateway.invoke(principal, {
      ...body,
      temperature: body.temperature ?? 0.2,
      maxTokens: body.maxTokens ?? 2048,
    });
  });

  app.get('/v1/models/usage', async (request) => {
    const principal = request.principal;
    if (!principal) {
      throw unauthorized();
    }
    requireScopes(principal, ['models:read']);
    const usage = await rateLimiter.getUsage(principal.tenantId);
    const caps = await rateLimiter.getCaps(principal.tenantId);
    return { usage, caps };
  });

  app.put('/v1/models/caps', async (request) => {
    const principal = request.principal;
    if (!principal) {
      throw unauthorized();
    }
    requireScopes(principal, ['models:admin']);
    const body = await validateBody(capsSchema)(request);
    await rateLimiter.setCaps(principal.tenantId, body);
    return { caps: body };
  });
}
