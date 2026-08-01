import { randomUUID } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import type { Redis } from 'ioredis';
import type { Principal } from '@sull/auth-sdk';
import type { ModelInvoke } from '@sull/contracts';
import { assertTenantAccess } from '@sull/auth-sdk';
import { insertOutboxEvent, withTransaction } from '@sull/db';
import { createCloudEvent, EventTypes, topicFor } from '@sull/events';
import type { ModelGatewayEnv } from './config.js';
import { ProviderRegistry } from './providers/index.js';
import { TenantRateLimiter } from './rate-limiter.js';

export interface InvocationResult {
  id: string;
  content: string;
  provider: string;
  model: string;
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    costUsd: number;
  };
}

export class ModelGatewayService {
  private readonly registry: ProviderRegistry;

  constructor(
    private readonly pool: Pool,
    private readonly redis: Redis,
    private readonly env: ModelGatewayEnv,
    private readonly rateLimiter: TenantRateLimiter,
  ) {
    this.registry = new ProviderRegistry(env);
  }

  async invoke(principal: Principal, input: ModelInvoke): Promise<InvocationResult> {
    assertTenantAccess(principal, principal.tenantId);

    const provider = this.registry.resolve(input, this.env.ECHO_PROVIDER_ENABLED);
    const projectedTokens = input.maxTokens + estimatePromptTokens(input);
    const projectedSpend = (projectedTokens / 1000) * this.env.TOKEN_COST_USD_PER_1K;

    await this.rateLimiter.assertWithinCaps(principal.tenantId, projectedTokens, projectedSpend);

    const completion = await provider.invoke(input);
    const costUsd = (completion.totalTokens / 1000) * this.env.TOKEN_COST_USD_PER_1K;
    await this.rateLimiter.recordUsage(principal.tenantId, completion.totalTokens, costUsd);

    const invocationId = randomUUID();
    await withTransaction(this.pool, async (client) => {
      await this.persistInvocation(client, {
        id: invocationId,
        tenantId: principal.tenantId,
        provider: completion.provider,
        model: completion.model,
        promptTokens: completion.promptTokens,
        completionTokens: completion.completionTokens,
        totalTokens: completion.totalTokens,
        costUsd,
      });
      await this.emitEvents(client, {
        invocationId,
        tenantId: principal.tenantId,
        principalSub: principal.sub,
        provider: completion.provider,
        model: completion.model,
        totalTokens: completion.totalTokens,
        costUsd,
      });
    });

    return {
      id: invocationId,
      content: completion.content,
      provider: completion.provider,
      model: completion.model,
      usage: {
        promptTokens: completion.promptTokens,
        completionTokens: completion.completionTokens,
        totalTokens: completion.totalTokens,
        costUsd,
      },
    };
  }

  private async persistInvocation(
    client: PoolClient,
    input: {
      id: string;
      tenantId: string;
      provider: string;
      model: string;
      promptTokens: number;
      completionTokens: number;
      totalTokens: number;
      costUsd: number;
    },
  ): Promise<void> {
    await client.query(
      `INSERT INTO model_invocations
       (id, tenant_id, provider, model, prompt_tokens, completion_tokens, total_tokens, cost_usd, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'completed')`,
      [
        input.id,
        input.tenantId,
        input.provider,
        input.model,
        input.promptTokens,
        input.completionTokens,
        input.totalTokens,
        input.costUsd,
      ],
    );
  }

  private async emitEvents(
    client: PoolClient,
    input: {
      invocationId: string;
      tenantId: string;
      principalSub: string;
      provider: string;
      model: string;
      totalTokens: number;
      costUsd: number;
    },
  ): Promise<void> {
    const completed = createCloudEvent({
      type: EventTypes.ModelInvocationCompleted,
      source: 'model-gateway',
      tenantId: input.tenantId,
      aggregateId: input.invocationId,
      aggregateType: 'model_invocation',
      sequence: 1,
      data: {
        invocationId: input.invocationId,
        provider: input.provider,
        model: input.model,
        totalTokens: input.totalTokens,
        costUsd: input.costUsd,
        initiatedBy: input.principalSub,
      },
    });
    await insertOutboxEvent(client, completed, topicFor('model'));

    const usage = createCloudEvent({
      type: EventTypes.UsageRecorded,
      source: 'model-gateway',
      tenantId: input.tenantId,
      aggregateId: input.invocationId,
      aggregateType: 'usage',
      sequence: 2,
      data: {
        usageId: randomUUID(),
        meter: 'tokens',
        quantity: input.totalTokens,
        unitCostUsd: input.costUsd / Math.max(input.totalTokens, 1),
        modelProvider: input.provider,
        modelName: input.model,
      },
    });
    await insertOutboxEvent(client, usage, topicFor('billing'));
  }
}

function estimatePromptTokens(input: ModelInvoke): number {
  const text = input.messages.map((message) => message.content).join('\n');
  return Math.max(1, Math.ceil(text.length / 4));
}
