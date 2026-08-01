import type { FastifyInstance } from 'fastify';
import { AuthVerifier, requireScopes } from '@sull/auth-sdk';
import { agentRunCreateSchema } from '@sull/contracts';
import { unauthorized } from '@sull/errors';
import { validateBody } from '@sull/http';
import { z } from 'zod';
import {
  AgentOrchestratorService,
  toAgentRunResponse,
  toAgentStepResponse,
} from './service.js';

export async function registerRoutes(
  app: FastifyInstance,
  orchestrator: AgentOrchestratorService,
  auth: AuthVerifier,
): Promise<void> {
  app.addHook('preHandler', async (request) => {
    if (request.url === '/healthz' || request.url === '/readyz') {
      return;
    }
    request.principal = await auth.verifyBearerToken(request.headers.authorization);
  });

  app.post('/v1/agent-runs', async (request, reply) => {
    const principal = request.principal;
    if (!principal) {
      throw unauthorized();
    }
    requireScopes(principal, ['agents:run']);
    const body = await validateBody(agentRunCreateSchema)(request);
    const run = await orchestrator.createRun(principal, body);
    return reply.status(201).send(toAgentRunResponse(run));
  });

  app.get('/v1/agent-runs/:runId', async (request) => {
    const principal = request.principal;
    if (!principal) {
      throw unauthorized();
    }
    requireScopes(principal, ['agents:read']);
    const params = z.object({ runId: z.string().uuid() }).parse(request.params);
    const run = await orchestrator.getRun(principal, params.runId);
    return toAgentRunResponse(run);
  });

  app.get('/v1/agent-runs/:runId/steps', async (request) => {
    const principal = request.principal;
    if (!principal) {
      throw unauthorized();
    }
    requireScopes(principal, ['agents:read']);
    const params = z.object({ runId: z.string().uuid() }).parse(request.params);
    const steps = await orchestrator.listSteps(principal, params.runId);
    return { steps: steps.map(toAgentStepResponse) };
  });
}
