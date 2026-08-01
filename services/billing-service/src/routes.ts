import type { FastifyInstance } from 'fastify';
import { AuthVerifier, requireScopes } from '@sull/auth-sdk';
import { paginationQuerySchema } from '@sull/contracts';
import { unauthorized } from '@sull/errors';
import { validateBody } from '@sull/http';
import { z } from 'zod';
import {
  BillingService,
  toInvoiceResponse,
  toSubscriptionResponse,
  toUsageResponse,
} from './service.js';

const createSubscriptionSchema = z.object({
  tenantId: z.string().uuid(),
  plan: z.enum(['free', 'pro', 'enterprise']),
});

const recordUsageSchema = z.object({
  tenantId: z.string().uuid(),
  meter: z.enum(['tokens', 'requests', 'storage_gb', 'seats']),
  quantity: z.number().positive(),
  unitCostUsd: z.number().nonnegative().default(0),
  modelProvider: z.string().min(1).optional(),
  modelName: z.string().min(1).optional(),
  idempotencyKey: z.string().min(8).max(128),
});

const issueInvoiceSchema = z.object({
  tenantId: z.string().uuid(),
  periodStart: z.string().datetime(),
  periodEnd: z.string().datetime(),
});

export async function registerRoutes(
  app: FastifyInstance,
  billing: BillingService,
  auth: AuthVerifier,
): Promise<void> {
  app.addHook('preHandler', async (request) => {
    if (request.url === '/healthz' || request.url === '/readyz') {
      return;
    }
    request.principal = await auth.verifyBearerToken(request.headers.authorization);
  });

  app.post('/v1/billing/subscriptions', async (request, reply) => {
    const principal = request.principal;
    if (!principal) {
      throw unauthorized();
    }
    requireScopes(principal, ['billing:write']);
    const body = await validateBody(createSubscriptionSchema)(request);
    const subscription = await billing.createSubscription(principal, body);
    return reply.status(201).send(toSubscriptionResponse(subscription));
  });

  app.get('/v1/billing/subscriptions/:subscriptionId', async (request) => {
    const principal = request.principal;
    if (!principal) {
      throw unauthorized();
    }
    requireScopes(principal, ['billing:read']);
    const params = z.object({ subscriptionId: z.string().uuid() }).parse(request.params);
    const subscription = await billing.getSubscriptionById(principal, params.subscriptionId);
    return toSubscriptionResponse(subscription);
  });

  app.get('/v1/billing/tenants/:tenantId/subscription', async (request) => {
    const principal = request.principal;
    if (!principal) {
      throw unauthorized();
    }
    requireScopes(principal, ['billing:read']);
    const params = z.object({ tenantId: z.string().uuid() }).parse(request.params);
    const subscription = await billing.getSubscriptionByTenant(principal, params.tenantId);
    return toSubscriptionResponse(subscription);
  });

  app.post('/v1/billing/usage', async (request, reply) => {
    const principal = request.principal;
    if (!principal) {
      throw unauthorized();
    }
    requireScopes(principal, ['billing:write']);
    const body = await validateBody(recordUsageSchema)(request);
    const usage = await billing.recordUsage(principal, {
      tenantId: body.tenantId,
      meter: body.meter,
      quantity: body.quantity,
      unitCostUsd: body.unitCostUsd ?? 0,
      idempotencyKey: body.idempotencyKey,
      modelProvider: body.modelProvider,
      modelName: body.modelName,
    });
    return reply.status(201).send(toUsageResponse(usage));
  });

  app.get('/v1/billing/tenants/:tenantId/usage', async (request) => {
    const principal = request.principal;
    if (!principal) {
      throw unauthorized();
    }
    requireScopes(principal, ['billing:read']);
    const params = z.object({ tenantId: z.string().uuid() }).parse(request.params);
    const query = paginationQuerySchema.parse(request.query);
    const usage = await billing.listUsage(principal, params.tenantId, query.limit);
    return { items: usage.map(toUsageResponse) };
  });

  app.post('/v1/billing/invoices', async (request, reply) => {
    const principal = request.principal;
    if (!principal) {
      throw unauthorized();
    }
    requireScopes(principal, ['billing:write']);
    const body = await validateBody(issueInvoiceSchema)(request);
    const invoice = await billing.issueInvoice(principal, body);
    return reply.status(201).send(toInvoiceResponse(invoice));
  });

  app.get('/v1/billing/invoices/:invoiceId', async (request) => {
    const principal = request.principal;
    if (!principal) {
      throw unauthorized();
    }
    requireScopes(principal, ['billing:read']);
    const params = z.object({ invoiceId: z.string().uuid() }).parse(request.params);
    const invoice = await billing.getInvoice(principal, params.invoiceId);
    return toInvoiceResponse(invoice);
  });
}
