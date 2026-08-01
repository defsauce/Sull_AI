import { randomUUID } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import { conflict, notFound, validation } from '@sull/errors';
import { queryMany, queryOne, withTransaction } from '@sull/db';
import type {
  WorkflowDefinitionCreate,
  WorkflowInstanceCreate,
  WorkflowStepDefinition,
} from './config.js';

export type StepStatus = 'pending' | 'running' | 'completed' | 'failed';
export type InstanceStatus = 'pending' | 'running' | 'completed' | 'failed' | 'compensating';

export interface WorkflowDefinitionRecord {
  id: string;
  tenant_id: string;
  name: string;
  steps: WorkflowStepDefinition[];
  created_at: Date;
}

export interface WorkflowInstanceRecord {
  id: string;
  tenant_id: string;
  definition_id: string;
  status: InstanceStatus;
  input: Record<string, unknown>;
  output: Record<string, unknown> | null;
  error_message: string | null;
  created_at: Date;
  started_at: Date | null;
  completed_at: Date | null;
}

export interface WorkflowStepRecord {
  id: string;
  instance_id: string;
  step_id: string;
  step_name: string;
  step_order: number;
  status: StepStatus;
  action: string;
  compensation: string | null;
  input: Record<string, unknown>;
  output: Record<string, unknown> | null;
  started_at: Date | null;
  completed_at: Date | null;
}

export class WorkflowEngineService {
  constructor(private readonly pool: Pool) {}

  async createDefinition(input: WorkflowDefinitionCreate): Promise<WorkflowDefinitionRecord> {
    const existing = await queryOne<{ id: string }>(
      this.pool,
      `SELECT id FROM workflow_definitions WHERE tenant_id = $1 AND name = $2`,
      [input.tenantId, input.name],
    );
    if (existing) {
      throw conflict(`Workflow definition '${input.name}' already exists`);
    }

    const inserted = await queryOne<WorkflowDefinitionRecord>(
      this.pool,
      `INSERT INTO workflow_definitions (tenant_id, name, steps)
       VALUES ($1, $2, $3::jsonb)
       RETURNING id, tenant_id, name, steps, created_at`,
      [input.tenantId, input.name, JSON.stringify(input.steps)],
    );
    if (!inserted) {
      throw validation('Failed to create workflow definition');
    }
    return inserted;
  }

  async getDefinition(definitionId: string, tenantId: string): Promise<WorkflowDefinitionRecord> {
    const definition = await queryOne<WorkflowDefinitionRecord>(
      this.pool,
      `SELECT id, tenant_id, name, steps, created_at
       FROM workflow_definitions
       WHERE id = $1 AND tenant_id = $2`,
      [definitionId, tenantId],
    );
    if (!definition) {
      throw notFound('Workflow definition');
    }
    return definition;
  }

  async startInstance(input: WorkflowInstanceCreate): Promise<WorkflowInstanceRecord> {
    const definition = await this.getDefinition(input.definitionId, input.tenantId);
    const instanceId = randomUUID();

    await withTransaction(this.pool, async (client) => {
      await client.query(
        `INSERT INTO workflow_instances
         (id, tenant_id, definition_id, status, input, started_at)
         VALUES ($1, $2, $3, 'running', $4::jsonb, NOW())`,
        [instanceId, input.tenantId, definition.id, JSON.stringify(input.input)],
      );

      for (const [index, step] of definition.steps.entries()) {
        await client.query(
          `INSERT INTO workflow_instance_steps
           (instance_id, step_id, step_name, step_order, status, action, compensation, input)
           VALUES ($1, $2, $3, $4, 'pending', $5, $6, $7::jsonb)`,
          [
            instanceId,
            step.id,
            step.name,
            index + 1,
            step.action,
            step.compensation ?? null,
            JSON.stringify(input.input),
          ],
        );
      }

      await this.runSteps(client, instanceId, definition.steps, input.input);
    });

    const instance = await this.getInstance(instanceId, input.tenantId);
    return instance;
  }

  async getInstance(instanceId: string, tenantId: string): Promise<WorkflowInstanceRecord> {
    const instance = await queryOne<WorkflowInstanceRecord>(
      this.pool,
      `SELECT id, tenant_id, definition_id, status, input, output, error_message,
              created_at, started_at, completed_at
       FROM workflow_instances
       WHERE id = $1 AND tenant_id = $2`,
      [instanceId, tenantId],
    );
    if (!instance) {
      throw notFound('Workflow instance');
    }
    return instance;
  }

  async listSteps(instanceId: string, tenantId: string): Promise<WorkflowStepRecord[]> {
    await this.getInstance(instanceId, tenantId);
    return queryMany<WorkflowStepRecord>(
      this.pool,
      `SELECT id, instance_id, step_id, step_name, step_order, status, action, compensation,
              input, output, started_at, completed_at
       FROM workflow_instance_steps
       WHERE instance_id = $1
       ORDER BY step_order ASC`,
      [instanceId],
    );
  }

  async listCompensations(instanceId: string, tenantId: string) {
    await this.getInstance(instanceId, tenantId);
    return queryMany<{
      id: string;
      step_id: string;
      compensation_action: string;
      status: string;
      details: Record<string, unknown>;
      created_at: Date;
    }>(
      this.pool,
      `SELECT id, step_id, compensation_action, status, details, created_at
       FROM workflow_compensations
       WHERE instance_id = $1
       ORDER BY created_at ASC`,
      [instanceId],
    );
  }

  private async runSteps(
    client: PoolClient,
    instanceId: string,
    steps: WorkflowStepDefinition[],
    input: Record<string, unknown>,
  ): Promise<void> {
    const context: Record<string, unknown> = { ...input };
    const completedSteps: WorkflowStepDefinition[] = [];

    try {
      for (const [index, step] of steps.entries()) {
        await client.query(
          `UPDATE workflow_instance_steps
           SET status = 'running', started_at = NOW()
           WHERE instance_id = $1 AND step_order = $2`,
          [instanceId, index + 1],
        );

        const output = executeStepAction(step.action, context);
        context[step.id] = output;

        await client.query(
          `UPDATE workflow_instance_steps
           SET status = 'completed',
               output = $1::jsonb,
               completed_at = NOW()
           WHERE instance_id = $2 AND step_order = $3`,
          [JSON.stringify(output), instanceId, index + 1],
        );
        completedSteps.push(step);
      }

      await client.query(
        `UPDATE workflow_instances
         SET status = 'completed', output = $1::jsonb, completed_at = NOW()
         WHERE id = $2`,
        [JSON.stringify(context), instanceId],
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Workflow step failed';
      await client.query(
        `UPDATE workflow_instances
         SET status = 'compensating', error_message = $1
         WHERE id = $2`,
        [message, instanceId],
      );
      await this.runCompensations(client, instanceId, completedSteps.reverse(), message);
      await client.query(
        `UPDATE workflow_instances
         SET status = 'failed', completed_at = NOW()
         WHERE id = $1`,
        [instanceId],
      );
    }
  }

  private async runCompensations(
    client: PoolClient,
    instanceId: string,
    completedSteps: WorkflowStepDefinition[],
    failureMessage: string,
  ): Promise<void> {
    for (const step of completedSteps) {
      if (!step.compensation) {
        continue;
      }
      const details = {
        reason: failureMessage,
        compensation: step.compensation,
        stepId: step.id,
      };
      await client.query(
        `INSERT INTO workflow_compensations
         (instance_id, step_id, compensation_action, status, details)
         VALUES ($1, $2, $3, 'executed', $4::jsonb)`,
        [instanceId, step.id, step.compensation, JSON.stringify(details)],
      );
    }
  }
}

export function executeStepAction(action: string, context: Record<string, unknown>): Record<string, unknown> {
  if (action === 'fail') {
    throw new Error('Step configured to fail');
  }

  switch (action) {
    case 'validate-input':
      return { valid: Object.keys(context).length > 0, fields: Object.keys(context) };
    case 'reserve-resources':
      return { reserved: true, resourceId: randomUUID(), quota: 100 };
    case 'execute-task':
      return {
        result: 'completed',
        summary: `Processed ${JSON.stringify(context).slice(0, 120)}`,
      };
    case 'notify':
      return { notified: true, channel: 'workflow', at: new Date().toISOString() };
    case 'release-resources':
      return { released: true };
    case 'rollback-reservation':
      return { rolledBack: true };
    default:
      return { action, handled: true, contextKeys: Object.keys(context) };
  }
}

export function toDefinitionResponse(definition: WorkflowDefinitionRecord) {
  return {
    id: definition.id,
    tenantId: definition.tenant_id,
    name: definition.name,
    steps: definition.steps,
    createdAt: definition.created_at.toISOString(),
  };
}

export function toInstanceResponse(instance: WorkflowInstanceRecord) {
  return {
    id: instance.id,
    tenantId: instance.tenant_id,
    definitionId: instance.definition_id,
    status: instance.status,
    input: instance.input,
    output: instance.output,
    errorMessage: instance.error_message,
    createdAt: instance.created_at.toISOString(),
    completedAt: instance.completed_at?.toISOString() ?? null,
  };
}

export function toStepResponse(step: WorkflowStepRecord) {
  return {
    id: step.id,
    stepId: step.step_id,
    stepName: step.step_name,
    stepOrder: step.step_order,
    status: step.status,
    action: step.action,
    compensation: step.compensation,
    output: step.output,
    startedAt: step.started_at?.toISOString() ?? null,
    completedAt: step.completed_at?.toISOString() ?? null,
  };
}
