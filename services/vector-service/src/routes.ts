import type { FastifyInstance } from 'fastify';
import { validateBody } from '@sull/http';
import { z } from 'zod';
import type { VectorStore } from './store.js';

const createCollectionSchema = z.object({
  tenantId: z.string().uuid(),
  name: z.string().min(1).max(128),
  dimensions: z.number().int().min(64).max(4096).optional(),
});

const upsertSchema = z.object({
  tenantId: z.string().uuid(),
  points: z
    .array(
      z.object({
        externalId: z.string().min(1).max(256),
        text: z.string().min(1).max(32_768).optional(),
        embedding: z.array(z.number()).optional(),
        payload: z.record(z.unknown()).optional(),
      }),
    )
    .min(1)
    .max(500),
});

const searchSchema = z.object({
  tenantId: z.string().uuid(),
  text: z.string().min(1).max(8_000).optional(),
  embedding: z.array(z.number()).optional(),
  topK: z.number().int().min(1).max(100).default(10),
});

export async function registerRoutes(app: FastifyInstance, store: VectorStore): Promise<void> {
  app.post('/v1/collections', async (request, reply) => {
    const body = await validateBody(createCollectionSchema)(request);
    const collection = await store.createCollection(
      body.tenantId,
      body.name,
      body.dimensions ?? 384,
    );
    return reply.status(201).send({
      id: collection.id,
      tenantId: collection.tenant_id,
      name: collection.name,
      dimensions: collection.dimensions,
      createdAt: collection.created_at.toISOString(),
    });
  });

  app.post('/v1/collections/:collectionId/upsert', async (request) => {
    const params = z.object({ collectionId: z.string().uuid() }).parse(request.params);
    const body = await validateBody(upsertSchema)(request);
    const result = await store.upsertPoints(
      params.collectionId,
      body.tenantId,
      body.points.map((point) => ({
        externalId: point.externalId,
        ...(point.text !== undefined ? { text: point.text } : {}),
        ...(point.embedding !== undefined ? { embedding: point.embedding } : {}),
        ...(point.payload !== undefined ? { payload: point.payload } : {}),
      })),
    );
    return result;
  });

  app.post('/v1/collections/:collectionId/search', async (request) => {
    const params = z.object({ collectionId: z.string().uuid() }).parse(request.params);
    const body = await validateBody(searchSchema)(request);
    const hits = await store.search(params.collectionId, body.tenantId, {
      ...(body.text !== undefined ? { text: body.text } : {}),
      ...(body.embedding !== undefined ? { embedding: body.embedding } : {}),
      topK: body.topK ?? 10,
    });
    return { hits };
  });
}
