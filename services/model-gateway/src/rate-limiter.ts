import type { Redis } from 'ioredis';
import { quotaExceeded } from '@sull/errors';

export interface TenantCaps {
  maxTokensPerDay: number;
  maxSpendUsdPerDay: number;
}

export interface TenantUsageSnapshot {
  tokensUsed: number;
  spendUsd: number;
}

export class TenantRateLimiter {
  constructor(
    private readonly redis: Redis,
    private readonly defaultCaps: TenantCaps,
  ) {}

  private dayKey(tenantId: string): string {
    const day = new Date().toISOString().slice(0, 10);
    return `model-gateway:usage:${tenantId}:${day}`;
  }

  private capsKey(tenantId: string): string {
    return `model-gateway:caps:${tenantId}`;
  }

  async setCaps(tenantId: string, caps: TenantCaps): Promise<void> {
    await this.redis.hset(this.capsKey(tenantId), {
      maxTokensPerDay: String(caps.maxTokensPerDay),
      maxSpendUsdPerDay: String(caps.maxSpendUsdPerDay),
    });
  }

  async getCaps(tenantId: string): Promise<TenantCaps> {
    const stored = await this.redis.hgetall(this.capsKey(tenantId));
    if (!stored.maxTokensPerDay || !stored.maxSpendUsdPerDay) {
      return this.defaultCaps;
    }
    return {
      maxTokensPerDay: Number(stored.maxTokensPerDay),
      maxSpendUsdPerDay: Number(stored.maxSpendUsdPerDay),
    };
  }

  async getUsage(tenantId: string): Promise<TenantUsageSnapshot> {
    const stored = await this.redis.hgetall(this.dayKey(tenantId));
    return {
      tokensUsed: Number(stored.tokens ?? 0),
      spendUsd: Number(stored.spendUsd ?? 0),
    };
  }

  async assertWithinCaps(tenantId: string, projectedTokens: number, projectedSpendUsd: number): Promise<void> {
    const caps = await this.getCaps(tenantId);
    const usage = await this.getUsage(tenantId);

    if (usage.tokensUsed + projectedTokens > caps.maxTokensPerDay) {
      throw quotaExceeded(`Daily token cap exceeded for tenant ${tenantId}`);
    }
    if (usage.spendUsd + projectedSpendUsd > caps.maxSpendUsdPerDay) {
      throw quotaExceeded(`Daily spend cap exceeded for tenant ${tenantId}`);
    }
  }

  async recordUsage(tenantId: string, tokens: number, spendUsd: number): Promise<TenantUsageSnapshot> {
    const key = this.dayKey(tenantId);
    const pipeline = this.redis.multi();
    pipeline.hincrby(key, 'tokens', tokens);
    pipeline.hincrbyfloat(key, 'spendUsd', spendUsd);
    pipeline.expire(key, 86_400 * 2);
    const results = await pipeline.exec();
    const tokensUsed = Number(results?.[0]?.[1] ?? tokens);
    const spendUsed = Number(results?.[1]?.[1] ?? spendUsd);
    return { tokensUsed, spendUsd: spendUsed };
  }
}
