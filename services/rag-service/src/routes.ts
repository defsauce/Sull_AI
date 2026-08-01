import type { FastifyInstance } from 'fastify';
import { ragIngestSchema, ragQuerySchema } from '@sull/contracts';
import { validateBody } from '@sull/http';
import { z } from 'zod';
import type { RagService } from './service.js';

const tenantHeaderSchema = z.object({
  'x-tenant-id': z.string().uuid(),
});

export async function registerRoutes(app: FastifyInstance, rag: RagService): Promise<void> {
  app.post('/v1/rag/ingest', async (request, reply) => {
    const headers = tenantHeaderSchema.parse(request.headers);
    const body = await validateBody(ragIngestSchema)(request);
    const result = await rag.ingest(headers['x-tenant-id'], {
      ...body,
      metadata: body.metadata ?? {},
    });
    return reply.status(201).send(result);
  });

  app.post('/v1/rag/query', async (request) => {
    const headers = tenantHeaderSchema.parse(request.headers);
    const body = await validateBody(ragQuerySchema)(request);
    return rag.query(headers['x-tenant-id'], {
      ...body,
      topK: body.topK ?? 8,
    });
  });
}
