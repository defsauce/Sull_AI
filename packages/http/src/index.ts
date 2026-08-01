import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import Fastify, {
  type FastifyInstance,
  type FastifyReply,
  type FastifyRequest,
  type FastifyError,
} from 'fastify';
import { isSullError, internal, type ProblemDetails } from '@sull/errors';
import type { Logger } from '@sull/logger';
import { AuthVerifier, type Principal } from '@sull/auth-sdk';
import { z } from 'zod';

declare module 'fastify' {
  interface FastifyRequest {
    principal?: Principal;
    requestId: string;
  }
}

export interface CreateServerOptions {
  readonly serviceName: string;
  readonly logger: Logger;
  readonly auth?: AuthVerifier;
  readonly corsOrigins?: string[];
  readonly rateLimitMax?: number;
  readonly rateLimitWindowMs?: number;
}

export async function createServiceServer(options: CreateServerOptions): Promise<FastifyInstance> {
  const app = Fastify({
    logger: false,
    genReqId: (req) => {
      const header = req.headers['x-request-id'];
      if (typeof header === 'string' && header.length > 0) {
        return header;
      }
      return crypto.randomUUID();
    },
    requestIdHeader: 'x-request-id',
    trustProxy: true,
    bodyLimit: 1_048_576,
  });

  await app.register(helmet, {
    global: true,
    contentSecurityPolicy: false,
  });

  await app.register(cors, {
    origin: options.corsOrigins ?? false,
    credentials: true,
  });

  await app.register(rateLimit, {
    max: options.rateLimitMax ?? 300,
    timeWindow: options.rateLimitWindowMs ?? 60_000,
  });

  app.decorateRequest('requestId', '');
  app.decorateRequest('principal', undefined);

  app.addHook('onRequest', async (request) => {
    request.requestId = request.id;
  });

  app.setErrorHandler((error: FastifyError | Error, request, reply) => {
    const sull = isSullError(error)
      ? error
      : internal(error.message || 'Unhandled error', error);

    const problem: ProblemDetails = sull.toProblemDetails(request.id, request.url);
    options.logger.error(
      {
        err: error,
        code: sull.code,
        status: sull.status,
        requestId: request.id,
        path: request.url,
      },
      'Request failed',
    );

    void reply
      .status(sull.status)
      .header('content-type', 'application/problem+json')
      .send(problem);
  });

  app.get('/healthz', async () => ({ status: 'ok', service: options.serviceName }));
  app.get('/readyz', async () => ({ status: 'ready', service: options.serviceName }));

  if (options.auth) {
    const verifier = options.auth;
    app.decorate('authenticate', async (request: FastifyRequest, _reply: FastifyReply) => {
      request.principal = await verifier.verifyBearerToken(request.headers.authorization);
    });
  }

  return app;
}

export function validateBody<T>(schema: z.ZodType<T>) {
  return async (request: FastifyRequest): Promise<T> => {
    const parsed = schema.safeParse(request.body);
    if (!parsed.success) {
      const { validation } = await import('@sull/errors');
      throw validation(
        'Request body validation failed',
        parsed.error.issues.map((issue) => ({
          field: issue.path.join('.') || 'body',
          message: issue.message,
        })),
      );
    }
    return parsed.data;
  };
}

export type { FastifyInstance, FastifyRequest, FastifyReply };
