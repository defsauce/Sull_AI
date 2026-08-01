import type { FastifyInstance } from 'fastify';
import { AuthVerifier, requireScopes } from '@sull/auth-sdk';
import { paginationQuerySchema } from '@sull/contracts';
import { unauthorized } from '@sull/errors';
import { validateBody } from '@sull/http';
import { z } from 'zod';
import { FileService, toFileResponse } from './service.js';

const createUploadUrlSchema = z.object({
  tenantId: z.string().uuid(),
  filename: z.string().min(1).max(255),
  contentType: z.string().min(1).max(255),
  sizeBytes: z.number().int().positive().max(5_368_709_120),
});

const completeUploadSchema = z.object({
  checksumSha256: z.string().regex(/^[a-f0-9]{64}$/i).optional(),
});

export async function registerRoutes(
  app: FastifyInstance,
  files: FileService,
  auth: AuthVerifier,
): Promise<void> {
  app.addHook('preHandler', async (request) => {
    if (request.url === '/healthz' || request.url === '/readyz') {
      return;
    }
    request.principal = await auth.verifyBearerToken(request.headers.authorization);
  });

  app.post('/v1/files/upload-url', async (request, reply) => {
    const principal = request.principal;
    if (!principal) {
      throw unauthorized();
    }
    requireScopes(principal, ['files:write']);
    const body = await validateBody(createUploadUrlSchema)(request);
    const result = await files.createUploadUrl(principal, body);
    return reply.status(201).send({
      file: toFileResponse(result.file),
      uploadUrl: result.uploadUrl,
      expiresInSec: result.expiresInSec,
    });
  });

  app.post('/v1/files/:fileId/complete', async (request) => {
    const principal = request.principal;
    if (!principal) {
      throw unauthorized();
    }
    requireScopes(principal, ['files:write']);
    const params = z.object({ fileId: z.string().uuid() }).parse(request.params);
    const body = await validateBody(completeUploadSchema)(request);
    const file = await files.completeUpload(principal, params.fileId, body);
    return toFileResponse(file);
  });

  app.get('/v1/files/:fileId', async (request) => {
    const principal = request.principal;
    if (!principal) {
      throw unauthorized();
    }
    requireScopes(principal, ['files:read']);
    const params = z.object({ fileId: z.string().uuid() }).parse(request.params);
    const file = await files.getById(principal, params.fileId);
    return toFileResponse(file);
  });

  app.get('/v1/files/:fileId/download-url', async (request) => {
    const principal = request.principal;
    if (!principal) {
      throw unauthorized();
    }
    requireScopes(principal, ['files:read']);
    const params = z.object({ fileId: z.string().uuid() }).parse(request.params);
    const result = await files.createDownloadUrl(principal, params.fileId);
    return result;
  });

  app.get('/v1/files', async (request) => {
    const principal = request.principal;
    if (!principal) {
      throw unauthorized();
    }
    requireScopes(principal, ['files:read']);
    const query = paginationQuerySchema
      .extend({ tenantId: z.string().uuid() })
      .parse(request.query);
    const items = await files.list(principal, query.tenantId, query.limit);
    return { items: items.map(toFileResponse) };
  });
}
