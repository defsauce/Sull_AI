import type { FastifyInstance } from 'fastify';
import { AuthVerifier, requireScopes } from '@sull/auth-sdk';
import { paginationQuerySchema } from '@sull/contracts';
import { unauthorized } from '@sull/errors';
import { validateBody } from '@sull/http';
import { z } from 'zod';
import { NotificationService, toNotificationResponse } from './service.js';

const queueNotificationSchema = z
  .object({
    tenantId: z.string().uuid(),
    channel: z.enum(['email', 'webhook']),
    destination: z.string().min(3).max(2048),
    subject: z.string().min(1).max(512).optional(),
    body: z.string().min(1).max(65_536),
    payload: z.record(z.unknown()).optional(),
    scheduledAt: z.string().datetime().optional(),
  })
  .superRefine((value, ctx) => {
    if (value.channel === 'email' && !value.destination.includes('@')) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Email channel requires a valid email destination',
        path: ['destination'],
      });
    }
    if (value.channel === 'webhook') {
      try {
        const url = new URL(value.destination);
        if (url.protocol !== 'https:' && url.protocol !== 'http:') {
          throw new Error('invalid protocol');
        }
      } catch {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Webhook channel requires an HTTP(S) URL destination',
          path: ['destination'],
        });
      }
    }
  });

const listNotificationsSchema = paginationQuerySchema.extend({
  tenantId: z.string().uuid(),
  status: z.enum(['queued', 'processing', 'sent', 'failed', 'cancelled']).optional(),
});

export async function registerRoutes(
  app: FastifyInstance,
  notifications: NotificationService,
  auth: AuthVerifier,
): Promise<void> {
  app.addHook('preHandler', async (request) => {
    if (request.url === '/healthz' || request.url === '/readyz') {
      return;
    }
    request.principal = await auth.verifyBearerToken(request.headers.authorization);
  });

  app.post('/v1/notifications', async (request, reply) => {
    const principal = request.principal;
    if (!principal) {
      throw unauthorized();
    }
    requireScopes(principal, ['notifications:write']);
    const body = await validateBody(queueNotificationSchema)(request);
    const notification = await notifications.queue(principal, body);
    return reply.status(201).send(toNotificationResponse(notification));
  });

  app.get('/v1/notifications/:notificationId', async (request) => {
    const principal = request.principal;
    if (!principal) {
      throw unauthorized();
    }
    requireScopes(principal, ['notifications:read']);
    const params = z.object({ notificationId: z.string().uuid() }).parse(request.params);
    const notification = await notifications.getById(principal, params.notificationId);
    return toNotificationResponse(notification);
  });

  app.get('/v1/notifications', async (request) => {
    const principal = request.principal;
    if (!principal) {
      throw unauthorized();
    }
    requireScopes(principal, ['notifications:read']);
    const query = listNotificationsSchema.parse(request.query);
    const items = await notifications.list(principal, query.tenantId, query.status, query.limit);
    return { items: items.map(toNotificationResponse) };
  });
}
