import type { FastifyInstance } from 'fastify';
import { validateBody } from '@sull/http';
import { z } from 'zod';
import {
  workflowDefinitionCreateSchema,
  workflowInstanceCreateSchema,
} from './config.js';
import {
  WorkflowEngineService,
  toDefinitionResponse,
  toInstanceResponse,
  toStepResponse,
} from './service.js';

export async function registerRoutes(
  app: FastifyInstance,
  workflows: WorkflowEngineService,
): Promise<void> {
  app.post('/v1/workflow-definitions', async (request, reply) => {
    const body = await validateBody(workflowDefinitionCreateSchema)(request);
    const definition = await workflows.createDefinition(body);
    return reply.status(201).send(toDefinitionResponse(definition));
  });

  app.get('/v1/workflow-definitions/:definitionId', async (request) => {
    const params = z
      .object({ definitionId: z.string().uuid() })
      .parse(request.params);
    const query = z.object({ tenantId: z.string().uuid() }).parse(request.query);
    const definition = await workflows.getDefinition(params.definitionId, query.tenantId);
    return toDefinitionResponse(definition);
  });

  app.post('/v1/workflow-instances', async (request, reply) => {
    const body = await validateBody(workflowInstanceCreateSchema)(request);
    const instance = await workflows.startInstance({
      ...body,
      input: body.input ?? {},
    });
    return reply.status(201).send(toInstanceResponse(instance));
  });

  app.get('/v1/workflow-instances/:instanceId', async (request) => {
    const params = z.object({ instanceId: z.string().uuid() }).parse(request.params);
    const query = z.object({ tenantId: z.string().uuid() }).parse(request.query);
    const instance = await workflows.getInstance(params.instanceId, query.tenantId);
    return toInstanceResponse(instance);
  });

  app.get('/v1/workflow-instances/:instanceId/steps', async (request) => {
    const params = z.object({ instanceId: z.string().uuid() }).parse(request.params);
    const query = z.object({ tenantId: z.string().uuid() }).parse(request.query);
    const steps = await workflows.listSteps(params.instanceId, query.tenantId);
    return { steps: steps.map(toStepResponse) };
  });

  app.get('/v1/workflow-instances/:instanceId/compensations', async (request) => {
    const params = z.object({ instanceId: z.string().uuid() }).parse(request.params);
    const query = z.object({ tenantId: z.string().uuid() }).parse(request.query);
    const compensations = await workflows.listCompensations(params.instanceId, query.tenantId);
    return {
      compensations: compensations.map((item) => ({
        id: item.id,
        stepId: item.step_id,
        compensationAction: item.compensation_action,
        status: item.status,
        details: item.details,
        createdAt: item.created_at.toISOString(),
      })),
    };
  });
}
