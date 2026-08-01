import { randomUUID } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import type { Principal } from '@sull/auth-sdk';
import type { AgentRunCreate } from '@sull/contracts';
import { assertTenantAccess } from '@sull/auth-sdk';
import { insertOutboxEvent, queryMany, queryOne, withTransaction } from '@sull/db';
import { createCloudEvent, EventTypes, topicFor } from '@sull/events';
import { notFound } from '@sull/errors';
import { executeAgentGraph, GRAPH_STEPS } from './graph.js';

export interface AgentRunRecord {
  id: string;
  tenant_id: string;
  agent_graph_id: string;
  status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
  input: Record<string, unknown>;
  output: Record<string, unknown> | null;
  metadata: Record<string, unknown>;
  error_message: string | null;
  created_by: string;
  created_at: Date;
  started_at: Date | null;
  completed_at: Date | null;
}

export interface AgentRunStepRecord {
  id: string;
  run_id: string;
  step_name: string;
  step_order: number;
  status: 'pending' | 'running' | 'completed' | 'failed';
  input: Record<string, unknown>;
  output: Record<string, unknown> | null;
  started_at: Date | null;
  completed_at: Date | null;
}

export class AgentOrchestratorService {
  constructor(private readonly pool: Pool) {}

  async createRun(principal: Principal, input: AgentRunCreate): Promise<AgentRunRecord> {
    assertTenantAccess(principal, principal.tenantId);

    const runId = randomUUID();
    await withTransaction(this.pool, async (client) => {
      await client.query(
        `INSERT INTO agent_runs
         (id, tenant_id, agent_graph_id, status, input, metadata, created_by, started_at)
         VALUES ($1, $2, $3, 'running', $4::jsonb, $5::jsonb, $6, NOW())`,
        [
          runId,
          principal.tenantId,
          input.agentGraphId,
          JSON.stringify(input.input),
          JSON.stringify(input.metadata ?? {}),
          principal.sub,
        ],
      );

      for (const [index, stepName] of GRAPH_STEPS.entries()) {
        await client.query(
          `INSERT INTO agent_run_steps (run_id, step_name, step_order, status)
           VALUES ($1, $2, $3, 'pending')`,
          [runId, stepName, index + 1],
        );
      }

      const startedEvent = createCloudEvent({
        type: EventTypes.AgentRunStarted,
        source: 'agent-orchestrator',
        tenantId: principal.tenantId,
        aggregateId: runId,
        aggregateType: 'agent_run',
        sequence: 1,
        data: {
          runId,
          agentGraphId: input.agentGraphId,
          initiatedBy: principal.sub,
          inputRef: `agent_runs:${runId}`,
        },
      });
      await insertOutboxEvent(client, startedEvent, topicFor('agent'));
    });

    try {
      const execution = executeAgentGraph(input.input);
      await withTransaction(this.pool, async (client) => {
        for (const [index, step] of execution.steps.entries()) {
          await client.query(
            `UPDATE agent_run_steps
             SET status = $1,
                 input = $2::jsonb,
                 output = $3::jsonb,
                 started_at = NOW(),
                 completed_at = NOW()
             WHERE run_id = $4 AND step_order = $5`,
            [
              step.status,
              JSON.stringify(step.input),
              JSON.stringify(step.output),
              runId,
              index + 1,
            ],
          );
        }

        await client.query(
          `UPDATE agent_runs
           SET status = 'completed',
               output = $1::jsonb,
               completed_at = NOW()
           WHERE id = $2`,
          [JSON.stringify(execution.output), runId],
        );

        await this.emitCompleted(client, principal.tenantId, runId, input.agentGraphId, execution.output);
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Agent run failed';
      await withTransaction(this.pool, async (client) => {
        await client.query(
          `UPDATE agent_runs
           SET status = 'failed', error_message = $1, completed_at = NOW()
           WHERE id = $2`,
          [message, runId],
        );
        await this.emitFailed(client, principal.tenantId, runId, input.agentGraphId, message);
      });
    }

    const run = await this.getRun(principal, runId);
    return run;
  }

  async getRun(principal: Principal, runId: string): Promise<AgentRunRecord> {
    assertTenantAccess(principal, principal.tenantId);
    const run = await queryOne<AgentRunRecord>(
      this.pool,
      `SELECT id, tenant_id, agent_graph_id, status, input, output, metadata, error_message,
              created_by, created_at, started_at, completed_at
       FROM agent_runs
       WHERE id = $1 AND tenant_id = $2`,
      [runId, principal.tenantId],
    );
    if (!run) {
      throw notFound('Agent run');
    }
    return run;
  }

  async listSteps(principal: Principal, runId: string): Promise<AgentRunStepRecord[]> {
    await this.getRun(principal, runId);
    return queryMany<AgentRunStepRecord>(
      this.pool,
      `SELECT id, run_id, step_name, step_order, status, input, output, started_at, completed_at
       FROM agent_run_steps
       WHERE run_id = $1
       ORDER BY step_order ASC`,
      [runId],
    );
  }

  private async emitCompleted(
    client: PoolClient,
    tenantId: string,
    runId: string,
    agentGraphId: string,
    output: Record<string, unknown>,
  ): Promise<void> {
    const event = createCloudEvent({
      type: EventTypes.AgentRunCompleted,
      source: 'agent-orchestrator',
      tenantId,
      aggregateId: runId,
      aggregateType: 'agent_run',
      sequence: 2,
      data: {
        runId,
        agentGraphId,
        output,
      },
    });
    await insertOutboxEvent(client, event, topicFor('agent'));
  }

  private async emitFailed(
    client: PoolClient,
    tenantId: string,
    runId: string,
    agentGraphId: string,
    errorMessage: string,
  ): Promise<void> {
    const event = createCloudEvent({
      type: EventTypes.AgentRunFailed,
      source: 'agent-orchestrator',
      tenantId,
      aggregateId: runId,
      aggregateType: 'agent_run',
      sequence: 2,
      data: {
        runId,
        agentGraphId,
        errorMessage,
      },
    });
    await insertOutboxEvent(client, event, topicFor('agent'));
  }
}

export function toAgentRunResponse(run: AgentRunRecord) {
  return {
    id: run.id,
    status: run.status,
    agentGraphId: run.agent_graph_id,
    output: run.output,
    errorMessage: run.error_message,
    createdAt: run.created_at.toISOString(),
    completedAt: run.completed_at?.toISOString() ?? null,
  };
}

export function toAgentStepResponse(step: AgentRunStepRecord) {
  return {
    id: step.id,
    stepName: step.step_name,
    stepOrder: step.step_order,
    status: step.status,
    input: step.input,
    output: step.output,
    startedAt: step.started_at?.toISOString() ?? null,
    completedAt: step.completed_at?.toISOString() ?? null,
  };
}
