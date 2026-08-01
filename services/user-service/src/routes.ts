import type { FastifyInstance } from 'fastify';
import { AuthVerifier, requireScopes } from '@sull/auth-sdk';
import { unauthorized } from '@sull/errors';
import { validateBody } from '@sull/http';
import { z } from 'zod';
import { UserService, toMembershipResponse, toUserResponse } from './service.js';

const createUserSchema = z.object({
  email: z.string().email().max(320),
  displayName: z.string().min(1).max(120),
  avatarUrl: z.string().url().optional(),
});

const updateUserSchema = z.object({
  displayName: z.string().min(1).max(120).optional(),
  avatarUrl: z.string().url().nullable().optional(),
});

const grantMembershipSchema = z.object({
  tenantId: z.string().uuid(),
  role: z.enum(['owner', 'admin', 'member', 'viewer']),
});

export async function registerRoutes(
  app: FastifyInstance,
  users: UserService,
  auth: AuthVerifier,
): Promise<void> {
  app.addHook('preHandler', async (request) => {
    if (request.url === '/healthz' || request.url === '/readyz') {
      return;
    }
    request.principal = await auth.verifyBearerToken(request.headers.authorization);
  });

  app.post('/v1/users', async (request, reply) => {
    const principal = request.principal;
    if (!principal) {
      throw unauthorized();
    }
    requireScopes(principal, ['users:write']);
    const body = await validateBody(createUserSchema)(request);
    const user = await users.createProfile(principal, body);
    return reply.status(201).send(toUserResponse(user));
  });

  app.get('/v1/users/:userId', async (request) => {
    const principal = request.principal;
    if (!principal) {
      throw unauthorized();
    }
    requireScopes(principal, ['users:read']);
    const params = z.object({ userId: z.string().uuid() }).parse(request.params);
    const user = await users.getProfile(principal, params.userId);
    return toUserResponse(user);
  });

  app.patch('/v1/users/:userId', async (request) => {
    const principal = request.principal;
    if (!principal) {
      throw unauthorized();
    }
    requireScopes(principal, ['users:write']);
    const params = z.object({ userId: z.string().uuid() }).parse(request.params);
    const body = await validateBody(updateUserSchema)(request);
    const user = await users.updateProfile(principal, params.userId, body);
    return toUserResponse(user);
  });

  app.post('/v1/users/:userId/memberships', async (request, reply) => {
    const principal = request.principal;
    if (!principal) {
      throw unauthorized();
    }
    requireScopes(principal, ['users:write']);
    const params = z.object({ userId: z.string().uuid() }).parse(request.params);
    const body = await validateBody(grantMembershipSchema)(request);
    const membership = await users.grantMembership(principal, params.userId, body);
    return reply.status(201).send(toMembershipResponse(membership));
  });

  app.get('/v1/users/:userId/memberships', async (request) => {
    const principal = request.principal;
    if (!principal) {
      throw unauthorized();
    }
    requireScopes(principal, ['users:read']);
    const params = z.object({ userId: z.string().uuid() }).parse(request.params);
    const memberships = await users.listMemberships(principal, params.userId);
    return { items: memberships.map(toMembershipResponse) };
  });
}
