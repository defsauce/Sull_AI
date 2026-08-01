import type { FastifyInstance } from 'fastify';
import { validateBody } from '@sull/http';
import { recordUsageSchema, usageAggregateQuerySchema } from './config.js';
import { AnalyticsService, summarizeAggregates } from './service.js';

export async function registerRoutes(
  app: FastifyInstance,
  analytics: AnalyticsService,
): Promise<void> {
  app.post('/v1/metrics/usage', async (request, reply) => {
    const body = await validateBody(recordUsageSchema)(request);
    const result = await analytics.recordUsage({
      ...body,
      unitCostUsd: body.unitCostUsd ?? 0,
    });
    return reply.status(201).send(result);
  });

  app.get('/v1/metrics/usage/aggregate', async (request) => {
    const query = usageAggregateQuerySchema.parse(request.query);
    const result = await analytics.queryAggregates(query);
    return {
      ...result,
      summary: summarizeAggregates(result.aggregates),
    };
  });
}
