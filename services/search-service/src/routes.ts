import type { FastifyInstance } from 'fastify';
import { validateBody } from '@sull/http';
import { indexDocumentSchema, searchQuerySchema } from './config.js';
import { SearchService } from './service.js';

export async function registerRoutes(app: FastifyInstance, search: SearchService): Promise<void> {
  app.post('/v1/search/documents', async (request, reply) => {
    const body = await validateBody(indexDocumentSchema)(request);
    const result = await search.indexDocument({
      ...body,
      metadata: body.metadata ?? {},
    });
    return reply.status(201).send(result);
  });

  app.get('/v1/search', async (request) => {
    const query = searchQuerySchema.parse(request.query);
    return search.search(query);
  });
}
