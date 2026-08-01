import type { FastifyInstance } from 'fastify';
import { loginSchema, userRegisterSchema } from '@sull/contracts';
import { validateBody } from '@sull/http';
import { z } from 'zod';
import type { IdentityService } from './service.js';

const refreshSchema = z.object({
  refreshToken: z.string().min(20),
});

export async function registerRoutes(
  app: FastifyInstance,
  identity: IdentityService,
): Promise<void> {
  app.get('/.well-known/jwks.json', async () => identity.jwks());

  app.post('/v1/auth/register', async (request, reply) => {
    const body = await validateBody(userRegisterSchema)(request);
    const user = await identity.register({
      email: body.email,
      displayName: body.displayName,
      password: body.password,
    });
    return reply.status(201).send(user);
  });

  app.post('/v1/auth/login', async (request, reply) => {
    const body = await validateBody(loginSchema)(request);
    const tokens = await identity.login({
      email: body.email,
      password: body.password,
      userAgent: request.headers['user-agent'],
      ipAddress: request.ip,
    });
    return reply.send(tokens);
  });

  app.post('/v1/auth/refresh', async (request, reply) => {
    const body = await validateBody(refreshSchema)(request);
    const tokens = await identity.refresh(body.refreshToken);
    return reply.send(tokens);
  });

  app.post('/v1/auth/logout', async (request, reply) => {
    const body = await validateBody(refreshSchema)(request);
    await identity.revokeSession(body.refreshToken);
    return reply.status(204).send();
  });
}
